/**
 * Patient management, for caretakers.
 *
 * Creating a patient also creates their device login, so these handlers are
 * where credentials are minted. The generated password is returned exactly
 * once, in the create (or reset) response, and is never retrievable again —
 * only its hash is stored.
 */
const { Patient, Location, Alert, SafeZone, DangerZone, TrackingSession } = require('../models');
const { zoneToPublic } = require('../models/zoneSchema');
const { generateTempPassword } = require('../utils/tokens');
const { SOCKET_EVENTS } = require('../utils/constants');
const sessionService = require('../services/session.service');
const emitter = require('../sockets/emitter');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const logger = require('../utils/logger');

/** Map request fields onto the patient document's nested shape. */
function applyPatientFields(patient, body) {
  const simple = ['name', 'age', 'gender', 'medicalNotes'];
  for (const key of simple) {
    if (body[key] !== undefined) patient[key] = body[key];
  }

  // Normalise empty strings to null so the sparse unique indexes on email and
  // phone do not treat two blank values as a collision.
  if (body.email !== undefined) patient.email = body.email || null;
  if (body.phone !== undefined) patient.phone = body.phone || null;

  if (body.emergencyContactName !== undefined) {
    patient.emergencyContact.name = body.emergencyContactName || '';
  }
  if (body.emergencyContactPhone !== undefined) {
    patient.emergencyContact.phone = body.emergencyContactPhone || '';
  }
  if (body.emergencyContactRelationship !== undefined) {
    patient.emergencyContact.relationship = body.emergencyContactRelationship || '';
  }
  if (body.isActive !== undefined) patient.isActive = body.isActive;
}

/**
 * GET /api/patients
 */
const listPatients = asyncHandler(async (req, res) => {
  const { search } = req.query;

  const query = { caretaker: req.caretaker._id };
  if (search) {
    // Escape the input before it becomes a regex, or a search for "a(" throws
    // and a search for ".*" scans everything.
    const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { patientCode: { $regex: safe, $options: 'i' } },
    ];
  }

  const patients = await Patient.find(query).sort({ createdAt: -1 });
  return ok(
    res,
    patients.map((patient) => patient.toPublic())
  );
});

/**
 * POST /api/patients
 *
 * The caretaker may supply a password; if they do not, one is generated and
 * returned so it can be read out to the patient.
 */
const createPatient = asyncHandler(async (req, res) => {
  const body = req.body;

  const tempPassword = body.password || generateTempPassword();

  const patient = new Patient({
    caretaker: req.caretaker._id,
    name: body.name,
    password: tempPassword,
  });
  applyPatientFields(patient, body);
  await patient.save();

  logger.info(`Patient created: ${patient.patientCode} by ${req.caretaker.email}`);

  emitter.emitToCaretaker(req.caretaker._id, SOCKET_EVENTS.PATIENT_CHANGED, {
    action: 'created',
    patientId: String(patient._id),
  });

  return created(res, {
    ...patient.toPublic(),
    // Shown once, in the "give these details to the patient" panel.
    temporaryPassword: tempPassword,
  });
});

/** GET /api/patients/:id */
const getPatient = asyncHandler(async (req, res) => ok(res, req.targetPatient.toPublic()));

/** PUT /api/patients/:id */
const updatePatient = asyncHandler(async (req, res) => {
  const patient = req.targetPatient;
  applyPatientFields(patient, req.body);
  await patient.save();

  emitter.emitToCaretaker(req.caretaker._id, SOCKET_EVENTS.PATIENT_CHANGED, {
    action: 'updated',
    patientId: String(patient._id),
  });

  return ok(res, patient.toPublic());
});

/**
 * DELETE /api/patients/:id
 *
 * A hard delete, including every fix, alert and zone belonging to the patient.
 * This is a deliberate choice for health data: a caretaker who removes a
 * patient expects the location history to be gone, not archived.
 */
const deletePatient = asyncHandler(async (req, res) => {
  const patientId = req.targetPatient._id;

  await Promise.all([
    Location.deleteMany({ patient: patientId }),
    Alert.deleteMany({ patient: patientId }),
    SafeZone.deleteMany({ patient: patientId }),
    DangerZone.deleteMany({ patient: patientId }),
    TrackingSession.deleteMany({ patient: patientId }),
    sessionService.revokeAllForSubject({ patientId }),
  ]);

  await req.targetPatient.deleteOne();

  logger.info(`Patient ${patientId} and all related records deleted`);

  emitter.emitToCaretaker(req.caretaker._id, SOCKET_EVENTS.PATIENT_CHANGED, {
    action: 'deleted',
    patientId: String(patientId),
  });

  return ok(res, null);
});

/**
 * PUT /api/patients/:id/password
 *
 * Resets the device password and signs the device out everywhere, because this
 * is the action a caretaker takes when a phone is lost.
 */
const resetPatientPassword = asyncHandler(async (req, res) => {
  const patient = req.targetPatient;
  const newPassword = req.body.password || generateTempPassword();

  patient.password = newPassword;
  await patient.save();

  await sessionService.revokeAllForSubject({ patientId: patient._id });
  await sessionService.closeOpenTrackingSessions(patient._id, 'revoked');

  return ok(res, { ...patient.toPublic(), temporaryPassword: newPassword });
});

/**
 * GET /api/patients/:id/zones
 *
 * Both zone sets in one response, because the map always needs them together
 * and two round trips would make the markers and circles appear out of step.
 */
const getPatientZones = asyncHandler(async (req, res) => {
  const patientId = req.targetPatient._id;

  const [safe, danger] = await Promise.all([
    SafeZone.find({ patient: patientId }).sort({ createdAt: 1 }).lean(),
    DangerZone.find({ patient: patientId }).sort({ createdAt: 1 }).lean(),
  ]);

  return ok(res, {
    safe: safe.map((zone) => zoneToPublic(zone, 'safe')),
    danger: danger.map((zone) => zoneToPublic(zone, 'danger')),
  });
});

/** GET /api/patients/:id/sessions — tracking runs, newest first. */
const getPatientSessions = asyncHandler(async (req, res) => {
  const sessions = await TrackingSession.find({ patient: req.targetPatient._id })
    .sort({ startedAt: -1 })
    .limit(30);

  return ok(
    res,
    sessions.map((session) => session.toPublic())
  );
});

module.exports = {
  listPatients,
  createPatient,
  getPatient,
  updatePatient,
  deletePatient,
  resetPatientPassword,
  getPatientZones,
  getPatientSessions,
};
