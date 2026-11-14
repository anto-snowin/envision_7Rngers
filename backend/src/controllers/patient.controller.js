/**
 * Patient CRUD plus the per-patient dashboard payload.
 *
 * Every query is scoped to `req.user._id` so one caretaker can never reach
 * another's patients.
 */
const { Patient, Geofence, Location, Alert } = require('../models');
const { ok, created, paginationMeta } = require('../utils/response');
const { SOCKET_EVENTS } = require('../utils/constants');
const { generateTrackingCode } = require('../utils/tokens');
const emitter = require('../sockets/emitter');
const asyncHandler = require('../utils/asyncHandler');

const env = require('../config/env');
const geofenceService = require('../services/geofence.service');
const analyticsService = require('../services/analytics.service');

/**
 * Decorate a lean patient record with a freshly computed `isOnline`.
 *
 * The stored flag is only as fresh as the last presence sweep, so onlineness is
 * recomputed from `lastSeenAt` on read. That keeps the list accurate between
 * sweeps without extra writes.
 */
function withLiveState(patient) {
  const lastSeen = patient.liveStatus?.lastSeenAt;
  const isOnline =
    Boolean(lastSeen) && Date.now() - new Date(lastSeen).getTime() <= env.OFFLINE_THRESHOLD_MS;

  return {
    ...patient,
    liveStatus: { ...(patient.liveStatus || {}), isOnline },
  };
}

/**
 * GET /api/patients
 * Paginated, searchable, filterable list for the dashboard.
 */
const listPatients = asyncHandler(async (req, res) => {
  const { page, limit, search, status, zone, sort } = req.query;

  const query = { caretaker: req.user._id };

  if (search) {
    // Escape regex metacharacters so a search for "(" cannot throw.
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(safe, 'i');
    query.$or = [{ name: pattern }, { trackingCode: pattern }, { 'homeLocation.address': pattern }];
  }

  if (zone && zone !== 'all') query['liveStatus.zoneState'] = zone;

  // Online/offline is a time comparison, not a stored boolean, so it is
  // expressed directly against `lastSeenAt`.
  if (status === 'online') {
    query['liveStatus.lastSeenAt'] = { $gte: new Date(Date.now() - env.OFFLINE_THRESHOLD_MS) };
  } else if (status === 'offline') {
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { 'liveStatus.lastSeenAt': null },
          { 'liveStatus.lastSeenAt': { $lt: new Date(Date.now() - env.OFFLINE_THRESHOLD_MS) } },
        ],
      },
    ];
  }

  const sortSpec = sort
    ? { [sort.replace(/^-/, '')]: sort.startsWith('-') ? -1 : 1 }
    : { createdAt: -1 };

  const [patients, total] = await Promise.all([
    Patient.find(query)
      .sort(sortSpec)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Patient.countDocuments(query),
  ]);

  return ok(res, patients.map(withLiveState), paginationMeta({ page, limit, total }));
});

/**
 * GET /api/patients/live
 * Lightweight payload for the live map: every patient plus their zones.
 */
const listLivePatients = asyncHandler(async (req, res) => {
  const [patients, geofences, stats] = await Promise.all([
    Patient.find({ caretaker: req.user._id, isActive: true })
      .select('name liveStatus homeLocation trackingCode emergencyContact')
      .lean(),
    Geofence.find({ caretaker: req.user._id, isActive: true }).lean(),
    analyticsService.getDashboardStats(req.user._id),
  ]);

  return ok(res, {
    patients: patients.map(withLiveState),
    geofences,
    stats,
  });
});

/**
 * GET /api/patients/:id
 * Full profile: patient, safe zone, latest fix and recent alerts.
 */
const getPatient = asyncHandler(async (req, res) => {
  const patientId = req.patient._id;

  const [geofence, latestLocation, recentAlerts, todaySummary] = await Promise.all([
    Geofence.findOne({ patient: patientId, isActive: true }).lean(),
    Location.findOne({ patient: patientId }).sort({ recordedAt: -1 }).lean(),
    Alert.find({ patient: patientId }).sort({ createdAt: -1 }).limit(10).lean(),
    analyticsService.getHistorySummary({
      patientId,
      from: analyticsService.startOfToday(),
      to: new Date(),
    }),
  ]);

  return ok(res, {
    patient: withLiveState(req.patient.toJSON()),
    geofence,
    latestLocation,
    recentAlerts,
    todaySummary,
  });
});

/**
 * POST /api/patients
 *
 * When a home location and `safeZoneRadius` are both supplied, the matching
 * geofence is created in the same call.
 */
const createPatient = asyncHandler(async (req, res) => {
  const { safeZoneRadius, ...patientData } = req.body;

  const patient = await Patient.create({
    ...patientData,
    caretaker: req.user._id,
  });

  let geofence = null;
  const home = patient.homeLocation;
  if (safeZoneRadius && Number.isFinite(home?.latitude) && Number.isFinite(home?.longitude)) {
    geofence = await Geofence.create({
      patient: patient._id,
      caretaker: req.user._id,
      name: `${patient.name}'s safe zone`,
      latitude: home.latitude,
      longitude: home.longitude,
      radius: safeZoneRadius,
      address: home.address || '',
    });
  }

  emitter.emitToCaretaker(req.user._id, SOCKET_EVENTS.PATIENT_CHANGED, {
    action: 'created',
    patientId: String(patient._id),
  });

  return created(res, { patient: patient.toJSON(), geofence });
});

/**
 * PUT /api/patients/:id
 */
const updatePatient = asyncHandler(async (req, res) => {
  const { safeZoneRadius, ...updates } = req.body;
  const patient = req.patient;

  // Assign field-by-field so a partial `homeLocation` or `emergencyContact`
  // merges rather than wiping out the fields it omits.
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (key === 'homeLocation' || key === 'emergencyContact') {
      patient[key] = { ...patient[key].toObject(), ...value };
    } else {
      patient[key] = value;
    }
  }

  await patient.save();

  // Keep the safe zone centred on the home location when it moves.
  let geofence = await Geofence.findOne({ patient: patient._id, isActive: true });
  const home = patient.homeLocation;
  if (Number.isFinite(home?.latitude) && Number.isFinite(home?.longitude)) {
    if (geofence && updates.homeLocation) {
      geofence.latitude = home.latitude;
      geofence.longitude = home.longitude;
      if (safeZoneRadius) geofence.radius = safeZoneRadius;
      await geofence.save();
    } else if (!geofence && safeZoneRadius) {
      geofence = await Geofence.create({
        patient: patient._id,
        caretaker: req.user._id,
        name: `${patient.name}'s safe zone`,
        latitude: home.latitude,
        longitude: home.longitude,
        radius: safeZoneRadius,
        address: home.address || '',
      });
    }
  }

  emitter.emitToCaretaker(req.user._id, SOCKET_EVENTS.PATIENT_CHANGED, {
    action: 'updated',
    patientId: String(patient._id),
  });

  return ok(res, { patient: patient.toJSON(), geofence });
});

/**
 * DELETE /api/patients/:id
 *
 * Removes the patient and everything that belongs to them. Location history is
 * medical-adjacent personal data, so a delete is a real delete rather than a
 * flag — a caretaker removing a patient expects the trail to go with them.
 */
const deletePatient = asyncHandler(async (req, res) => {
  const patientId = req.patient._id;

  const [locations, alerts] = await Promise.all([
    Location.deleteMany({ patient: patientId }),
    Alert.deleteMany({ patient: patientId }),
    Geofence.deleteMany({ patient: patientId }),
  ]);

  await Patient.deleteOne({ _id: patientId });

  emitter.emitToCaretaker(req.user._id, SOCKET_EVENTS.PATIENT_CHANGED, {
    action: 'deleted',
    patientId: String(patientId),
  });

  return ok(res, {
    message: 'Patient and all associated records deleted',
    deleted: {
      locations: locations.deletedCount || 0,
      alerts: alerts.deletedCount || 0,
    },
  });
});

/**
 * POST /api/patients/:id/regenerate-code
 *
 * Issues a fresh tracking code, which immediately invalidates the old tracking
 * link. Used if a link is shared with the wrong person.
 */
const regenerateTrackingCode = asyncHandler(async (req, res) => {
  req.patient.trackingCode = generateTrackingCode();
  await req.patient.save();

  return ok(res, {
    trackingCode: req.patient.trackingCode,
    message: 'Previous tracking link is no longer valid',
  });
});

/**
 * GET /api/patients/:id/zones
 * The safe zone and danger zones that apply to this patient.
 */
const getPatientZones = asyncHandler(async (req, res) => {
  const [geofence, dangerZones] = await Promise.all([
    geofenceService.getActiveGeofence(req.patient._id),
    geofenceService.getApplicableDangerZones(req.user._id, req.patient._id),
  ]);

  return ok(res, { geofence, dangerZones });
});

module.exports = {
  listPatients,
  listLivePatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
  regenerateTrackingCode,
  getPatientZones,
  withLiveState,
};
