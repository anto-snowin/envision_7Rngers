/**
 * JWT authentication and role authorisation.
 *
 * The platform has two login roles with very different powers, so the guard is
 * explicit at every route: `requireCaretaker` for the dashboard, `requirePatient`
 * for the device. There is no middleware that accepts "any valid token" for a
 * route that reads patient data, because that is exactly how a patient token
 * would end up granting dashboard access.
 */
const { Caretaker, Patient, AuthSession } = require('../models');
const { verifyToken, extractBearerToken } = require('../utils/jwt');
const { ROLES } = require('../utils/constants');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Decode the bearer token and confirm its session has not been revoked.
 *
 * A revoked session is rejected even when the JWT itself is still inside its
 * validity window — that is what makes logout take effect immediately.
 */
async function resolveSession(req) {
  const token = extractBearerToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const decoded = verifyToken(token);

  if (decoded.sid) {
    const session = await AuthSession.findOne({ sessionId: decoded.sid });
    if (!session || session.isRevoked) {
      throw ApiError.unauthorized('Session has been signed out');
    }
    // Fire-and-forget: the timestamp is for the caretaker's session list, and
    // awaiting a write on every authenticated request is not worth the latency.
    AuthSession.updateOne({ _id: session._id }, { lastActivityAt: new Date() }).catch(() => {});
    req.authSession = session;
  }

  req.token = decoded;
  return decoded;
}

/** Require a valid caretaker token. Attaches `req.caretaker`. */
const requireCaretaker = asyncHandler(async (req, _res, next) => {
  const decoded = await resolveSession(req);

  if (decoded.role !== ROLES.CARETAKER) {
    throw ApiError.forbidden('This area is for caretaker accounts');
  }

  const caretaker = await Caretaker.findById(decoded.sub);
  if (!caretaker) throw ApiError.unauthorized('Account no longer exists');
  if (!caretaker.isActive) throw ApiError.forbidden('Account has been deactivated');

  req.caretaker = caretaker;
  return next();
});

/**
 * Require a valid patient token. Attaches `req.patient`.
 *
 * This is the only credential the patient's phone holds. It authorises writing
 * that one patient's location and reading that one patient's own status — never
 * another patient's data, and nothing belonging to the caretaker.
 */
const requirePatient = asyncHandler(async (req, _res, next) => {
  const decoded = await resolveSession(req);

  if (decoded.role !== ROLES.PATIENT) {
    throw ApiError.forbidden('This endpoint is for patient devices');
  }

  const patient = await Patient.findById(decoded.sub);
  if (!patient) throw ApiError.unauthorized('This patient account no longer exists');
  if (!patient.isActive) throw ApiError.forbidden('Tracking has been disabled for this account');

  req.patient = patient;
  return next();
});

/**
 * Accept either role, for the handful of endpoints both use (`/auth/me`,
 * `/auth/logout`). Sets whichever of `req.caretaker` / `req.patient` applies,
 * plus `req.role`, so the handler can branch explicitly.
 */
const requireAnyRole = asyncHandler(async (req, _res, next) => {
  const decoded = await resolveSession(req);
  req.role = decoded.role;

  if (decoded.role === ROLES.CARETAKER) {
    const caretaker = await Caretaker.findById(decoded.sub);
    if (!caretaker || !caretaker.isActive) throw ApiError.unauthorized('Session is no longer valid');
    req.caretaker = caretaker;
    return next();
  }

  const patient = await Patient.findById(decoded.sub);
  if (!patient || !patient.isActive) throw ApiError.unauthorized('Session is no longer valid');
  req.patient = patient;
  return next();
});

/**
 * Load the patient named by `:patientId` (or `:id`) and assert the signed-in
 * caretaker owns them. Must run after `requireCaretaker`.
 */
const requirePatientOwnership = asyncHandler(async (req, _res, next) => {
  const patientId = req.params.patientId || req.params.id;
  const patient = await Patient.findById(patientId);

  // Report 404 rather than 403 in both cases so patient ids cannot be
  // enumerated by comparing the two responses.
  if (!patient) throw ApiError.notFound('Patient not found');
  if (String(patient.caretaker) !== String(req.caretaker._id)) {
    throw ApiError.notFound('Patient not found');
  }

  req.targetPatient = patient;
  return next();
});

module.exports = {
  requireCaretaker,
  requirePatient,
  requireAnyRole,
  requirePatientOwnership,
};
