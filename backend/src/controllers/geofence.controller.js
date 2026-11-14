/**
 * Safe-zone (geofence) management.
 *
 * The prototype keeps one active safe zone per patient: creating a new one
 * deactivates the previous zone rather than leaving two overlapping zones that
 * would both evaluate.
 */
const { Geofence, Patient } = require('../models');
const { ok, created } = require('../utils/response');
const { SOCKET_EVENTS } = require('../utils/constants');
const emitter = require('../sockets/emitter');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/** Load a geofence and assert the signed-in caretaker owns it. */
async function findOwnedGeofence(id, caretakerId) {
  const geofence = await Geofence.findOne({ _id: id, caretaker: caretakerId });
  if (!geofence) throw ApiError.notFound('Safe zone not found');
  return geofence;
}

/**
 * GET /api/geofence
 * All safe zones for the caretaker, optionally narrowed to one patient.
 */
const listGeofences = asyncHandler(async (req, res) => {
  const query = { caretaker: req.user._id };
  if (req.query.patient) query.patient = req.query.patient;
  if (req.query.isActive !== undefined) query.isActive = req.query.isActive;

  const geofences = await Geofence.find(query)
    .populate('patient', 'name trackingCode')
    .sort({ createdAt: -1 })
    .lean();

  return ok(res, geofences);
});

/**
 * GET /api/geofence/:id
 */
const getGeofence = asyncHandler(async (req, res) => {
  const geofence = await findOwnedGeofence(req.params.id, req.user._id);
  return ok(res, { geofence: geofence.toJSON() });
});

/**
 * POST /api/geofence
 */
const createGeofence = asyncHandler(async (req, res) => {
  const { patient: patientId, ...zoneData } = req.body;

  const patient = await Patient.findOne({ _id: patientId, caretaker: req.user._id });
  if (!patient) throw ApiError.notFound('Patient not found');

  // One active zone per patient: retire any existing one.
  await Geofence.updateMany(
    { patient: patientId, isActive: true },
    { isActive: false }
  );

  const geofence = await Geofence.create({
    ...zoneData,
    patient: patientId,
    caretaker: req.user._id,
  });

  // Keep the patient's home coordinates aligned with their safe zone centre
  // when the patient has no home set yet.
  if (!Number.isFinite(patient.homeLocation?.latitude)) {
    patient.homeLocation.latitude = geofence.latitude;
    patient.homeLocation.longitude = geofence.longitude;
    if (zoneData.address) patient.homeLocation.address = zoneData.address;
    await patient.save();
  }

  emitter.emitToCaretaker(req.user._id, SOCKET_EVENTS.GEOFENCE_CHANGED, {
    action: 'created',
    patientId: String(patientId),
    geofence: geofence.toJSON(),
  });

  return created(res, { geofence: geofence.toJSON() });
});

/**
 * PUT /api/geofence/:id
 */
const updateGeofence = asyncHandler(async (req, res) => {
  const geofence = await findOwnedGeofence(req.params.id, req.user._id);

  Object.entries(req.body).forEach(([key, value]) => {
    if (value !== undefined) geofence[key] = value;
  });

  await geofence.save();

  emitter.emitToCaretaker(req.user._id, SOCKET_EVENTS.GEOFENCE_CHANGED, {
    action: 'updated',
    patientId: String(geofence.patient),
    geofence: geofence.toJSON(),
  });

  return ok(res, { geofence: geofence.toJSON() });
});

/**
 * DELETE /api/geofence/:id
 *
 * Removing the safe zone stops safe-zone alerting for that patient entirely,
 * so the response says so explicitly for the UI to surface as a warning.
 */
const deleteGeofence = asyncHandler(async (req, res) => {
  const geofence = await findOwnedGeofence(req.params.id, req.user._id);
  const patientId = String(geofence.patient);

  await Geofence.deleteOne({ _id: geofence._id });

  // The cached zone state now refers to a zone that no longer exists.
  await Patient.updateOne(
    { _id: patientId },
    { 'liveStatus.zoneState': 'unknown', 'liveStatus.distanceFromHome': null }
  );

  emitter.emitToCaretaker(req.user._id, SOCKET_EVENTS.GEOFENCE_CHANGED, {
    action: 'deleted',
    patientId,
    geofenceId: String(geofence._id),
  });

  return ok(res, {
    message: 'Safe zone deleted. Safe-zone alerts are now disabled for this patient.',
  });
});

module.exports = {
  listGeofences,
  getGeofence,
  createGeofence,
  updateGeofence,
  deleteGeofence,
};
