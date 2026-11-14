/**
 * Location ingest (patient portal) and history retrieval (caretaker dashboard).
 *
 * The write endpoints authenticate with a patient tracking code rather than a
 * JWT, because the patient never logs in. The read endpoints require a
 * caretaker JWT and patient ownership.
 */
const { Location, Session, Geofence } = require('../models');
const { ok, created } = require('../utils/response');
const { ALERT_TYPES, SOCKET_EVENTS } = require('../utils/constants');
const locationService = require('../services/location.service');
const analyticsService = require('../services/analytics.service');
const alertService = require('../services/alert.service');
const geofenceService = require('../services/geofence.service');
const emitter = require('../sockets/emitter');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/location/session/:trackingCode
 *
 * Called when the patient portal opens. Returns just enough for the phone to
 * render its own status screen — the patient's first name, the tracking
 * cadence and their zones — and opens a tracking session.
 *
 * Deliberately does NOT return medical notes, emergency contacts or caretaker
 * details: the tracking link may be open on an unattended phone.
 */
const startTrackingSession = asyncHandler(async (req, res) => {
  const patient = req.patient;

  const session = await Session.create({
    kind: 'patient',
    patient: patient._id,
    userAgent: req.headers['user-agent'] || '',
    ipAddress: req.ip || '',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const [geofence, dangerZones] = await Promise.all([
    geofenceService.getActiveGeofence(patient._id),
    geofenceService.getApplicableDangerZones(patient.caretaker, patient._id),
  ]);

  return created(res, {
    sessionId: session.sessionId,
    patient: {
      _id: String(patient._id),
      name: patient.name,
      trackingCode: patient.trackingCode,
    },
    // The phone draws its own safe zone so the patient can see where they are.
    geofence: geofence
      ? {
          name: geofence.name,
          latitude: geofence.latitude,
          longitude: geofence.longitude,
          radius: geofence.radius,
        }
      : null,
    dangerZones: dangerZones.map((zone) => ({
      name: zone.name,
      latitude: zone.latitude,
      longitude: zone.longitude,
      radius: zone.radius,
      category: zone.category,
    })),
    config: {
      intervalMs: Number(process.env.LOCATION_INTERVAL_MS || 5000),
    },
  });
});

/**
 * POST /api/location
 * One live GPS fix from the patient's phone.
 */
const createLocation = asyncHandler(async (req, res) => {
  // trackingCode is consumed by the auth middleware; strip it from the fix.
  const { trackingCode: _code, sessionId, ...fix } = req.body;

  const { payload, evaluation } = await locationService.ingestFix(req.patient, fix);

  if (sessionId) {
    await Session.updateOne(
      { sessionId, kind: 'patient' },
      { $inc: { fixCount: 1 }, lastActivityAt: new Date() }
    );
  }

  // Echo the zone verdict so the patient's phone can show a reassuring
  // "you are in your safe zone" state without a second request.
  return created(res, {
    accepted: true,
    recordedAt: payload.recordedAt,
    zoneState: evaluation.zoneState,
    isInsideSafeZone: evaluation.isInsideSafeZone,
    distanceFromHome: evaluation.distanceFromHome,
    alertsRaised: evaluation.alerts.length,
  });
});

/**
 * POST /api/location/batch
 *
 * Flush of fixes the phone buffered in IndexedDB while offline. Returns a
 * per-item outcome so the client knows exactly which records it may delete
 * from its queue.
 */
const createLocationBatch = asyncHandler(async (req, res) => {
  const { fixes, sessionId } = req.body;

  const result = await locationService.ingestBatch(req.patient, fixes);

  if (sessionId) {
    await Session.updateOne(
      { sessionId, kind: 'patient' },
      { $inc: { fixCount: result.accepted }, lastActivityAt: new Date() }
    );
  }

  return created(res, result);
});

/**
 * POST /api/location/sos
 *
 * The patient pressed the SOS button. This bypasses the alert cooldown: a
 * second press is a second cry for help, not a duplicate.
 */
const triggerSos = asyncHandler(async (req, res) => {
  const patient = req.patient;
  const { latitude, longitude, accuracy, batteryLevel, message } = req.body;

  // Prefer the coordinates sent with the press; fall back to the last known fix.
  const hasFreshFix = Number.isFinite(latitude) && Number.isFinite(longitude);
  const location = hasFreshFix
    ? { latitude, longitude, accuracy: accuracy ?? null }
    : {
        latitude: patient.liveStatus?.latitude ?? null,
        longitude: patient.liveStatus?.longitude ?? null,
        accuracy: patient.liveStatus?.accuracy ?? null,
      };

  const alert = await alertService.createAlert({
    patient,
    type: ALERT_TYPES.SOS,
    message:
      message ||
      `${patient.name} pressed the SOS button` +
        (hasFreshFix ? '.' : ' (location is the last known position).'),
    location,
    metadata: {
      pressedAt: new Date(),
      hasFreshFix,
      batteryLevel: batteryLevel ?? patient.liveStatus?.batteryLevel ?? null,
      emergencyContact: patient.emergencyContact,
    },
    bypassCooldown: true,
  });

  // If the press carried a fix, record it as a location too so the SOS point
  // appears on the map trail.
  if (hasFreshFix) {
    await locationService
      .ingestFix(patient, { latitude, longitude, accuracy, batteryLevel })
      .catch(() => null);
  }

  return created(res, {
    acknowledged: true,
    alertId: alert ? alert._id : null,
    message: 'Your caretaker has been alerted.',
  });
});

/**
 * POST /api/location/device-event
 *
 * Problems only the phone can observe: the GPS returning an error, or the
 * browser noticing it went offline. The phone reports these so the caretaker
 * learns *why* the fixes stopped instead of just seeing silence.
 */
const reportDeviceEvent = asyncHandler(async (req, res) => {
  const patient = req.patient;
  const { type, message, metadata } = req.body;

  // INTERNET_RESTORED / TRACKING_STOPPED are informational and do not alert.
  const alertable = {
    GPS_UNAVAILABLE: ALERT_TYPES.GPS_UNAVAILABLE,
    INTERNET_DISCONNECTED: ALERT_TYPES.INTERNET_DISCONNECTED,
  };

  let alert = null;
  if (alertable[type]) {
    alert = await alertService.createAlert({
      patient,
      type: alertable[type],
      message: message || undefined,
      location: {
        latitude: patient.liveStatus?.latitude ?? null,
        longitude: patient.liveStatus?.longitude ?? null,
        accuracy: patient.liveStatus?.accuracy ?? null,
      },
      metadata: { ...metadata, reportedAt: new Date() },
    });
  }

  if (type === 'TRACKING_STOPPED') {
    emitter.emitToCaretaker(patient.caretaker, SOCKET_EVENTS.PRESENCE_UPDATE, {
      patientId: String(patient._id),
      patientName: patient.name,
      isOnline: false,
      reason: 'tracking_stopped',
      lastSeenAt: patient.liveStatus?.lastSeenAt || null,
    });
  }

  return ok(res, { recorded: true, alertRaised: Boolean(alert) });
});

/**
 * GET /api/location/:patientId
 * Latest known fix for a patient.
 */
const getLatestLocation = asyncHandler(async (req, res) => {
  const location = await locationService.getLatestLocation(req.patient._id);
  if (!location) {
    return ok(res, { location: null, message: 'No location recorded for this patient yet' });
  }
  return ok(res, { location });
});

/**
 * GET /api/location/history/:patientId
 *
 * Route history for the history page and route playback. Defaults to the last
 * 24 hours when no range is given.
 */
const getHistory = asyncHandler(async (req, res) => {
  const { from, to, limit } = req.query;

  const rangeTo = to ? new Date(to) : new Date();
  const rangeFrom = from ? new Date(from) : new Date(rangeTo.getTime() - 24 * 60 * 60 * 1000);

  if (rangeFrom > rangeTo) {
    throw ApiError.badRequest('"from" must be earlier than "to"');
  }

  const [points, summary, geofence] = await Promise.all([
    locationService.getHistory(req.patient._id, { from: rangeFrom, to: rangeTo, limit }),
    analyticsService.getHistorySummary({
      patientId: req.patient._id,
      from: rangeFrom,
      to: rangeTo,
    }),
    Geofence.findOne({ patient: req.patient._id, isActive: true }).lean(),
  ]);

  return ok(res, {
    patient: { _id: String(req.patient._id), name: req.patient.name },
    range: { from: rangeFrom, to: rangeTo },
    points,
    summary,
    geofence,
    // Tell the client when the cap truncated the result so it can suggest a
    // narrower date range instead of silently drawing a partial route.
    truncated: points.length >= limit,
  });
});

/**
 * GET /api/location/trail/:patientId
 * Short recent trail (default 50 points) drawn behind the live map marker.
 */
const getTrail = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);

  const points = await Location.find({ patient: req.patient._id })
    .sort({ recordedAt: -1 })
    .limit(limit)
    .select('latitude longitude accuracy zoneState recordedAt isQueued')
    .lean();

  // Query is newest-first for the index; the map wants oldest-first.
  return ok(res, { points: points.reverse() });
});

module.exports = {
  startTrackingSession,
  createLocation,
  createLocationBatch,
  triggerSos,
  reportDeviceEvent,
  getLatestLocation,
  getHistory,
  getTrail,
};
