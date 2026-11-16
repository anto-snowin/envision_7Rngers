/**
 * Authentication for both roles.
 *
 * Caretakers sign in with an email address; patients sign in on their phone
 * with the patient code, email or phone number the caretaker gave them. Both
 * receive a JWT carrying their role, and both are rate limited by the auth
 * limiter mounted on these routes.
 */
const { Caretaker, Patient } = require('../models');
const { signToken } = require('../utils/jwt');
const { ROLES } = require('../utils/constants');
const { safeEqual } = require('../utils/tokens');
const sessionService = require('../services/session.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Deliberately identical message for "no such account" and "wrong password".
 * Distinguishing them turns the login form into an account-enumeration oracle.
 */
const BAD_CREDENTIALS = 'Those sign-in details are not correct';

/* ------------------------------------------------------------- caretakers --- */

/**
 * POST /api/auth/caretaker/register
 */
const registerCaretaker = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  const existing = await Caretaker.findOne({ email }).select('_id').lean();
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const caretaker = await Caretaker.create({ name, email, password, phone: phone || '' });

  const session = await sessionService.openAuthSession({
    role: ROLES.CARETAKER,
    caretakerId: caretaker._id,
    req,
  });

  const token = signToken(
    { id: caretaker._id, role: ROLES.CARETAKER, email: caretaker.email },
    { sessionId: session.sessionId }
  );

  logger.info(`Caretaker registered: ${caretaker.email}`);

  return created(res, { token, role: ROLES.CARETAKER, caretaker: caretaker.toPublic() });
});

/**
 * POST /api/auth/caretaker/login
 */
const loginCaretaker = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const caretaker = await Caretaker.findOne({ email }).select('+password');
  if (!caretaker) throw ApiError.unauthorized(BAD_CREDENTIALS);
  if (!caretaker.isActive) throw ApiError.forbidden('This account has been deactivated');

  const matches = await caretaker.comparePassword(password);
  if (!matches) throw ApiError.unauthorized(BAD_CREDENTIALS);

  caretaker.lastLoginAt = new Date();
  await caretaker.save();

  const session = await sessionService.openAuthSession({
    role: ROLES.CARETAKER,
    caretakerId: caretaker._id,
    req,
  });

  const token = signToken(
    { id: caretaker._id, role: ROLES.CARETAKER, email: caretaker.email },
    { sessionId: session.sessionId }
  );

  return ok(res, { token, role: ROLES.CARETAKER, caretaker: caretaker.toPublic() });
});

/* ---------------------------------------------------------------- patients --- */

/**
 * Find a patient by any of their three accepted identifiers.
 *
 * The patient code is compared again in constant time after the lookup so the
 * query itself cannot be used as a timing oracle for valid codes.
 */
async function findPatientByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;

  const asCode = value.toUpperCase();
  const byCode = await Patient.findOne({ patientCode: asCode }).select('+password');
  if (byCode && safeEqual(byCode.patientCode, asCode)) return byCode;

  const lowered = value.toLowerCase();
  const byEmail = await Patient.findOne({ email: lowered }).select('+password');
  if (byEmail) return byEmail;

  return Patient.findOne({ phone: value }).select('+password');
}

/**
 * POST /api/auth/patient/login
 *
 * On success the device also gets a tracking session, so the history page can
 * later distinguish "tracking was off" from "tracking was on but silent".
 */
const loginPatient = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  const patient = await findPatientByIdentifier(identifier);
  if (!patient) throw ApiError.unauthorized(BAD_CREDENTIALS);
  if (!patient.isActive) throw ApiError.forbidden('Tracking has been disabled for this account');

  const matches = await patient.comparePassword(password);
  if (!matches) throw ApiError.unauthorized(BAD_CREDENTIALS);

  patient.lastLoginAt = new Date();
  await patient.save();

  const authSession = await sessionService.openAuthSession({
    role: ROLES.PATIENT,
    patientId: patient._id,
    req,
  });

  const trackingSession = await sessionService.openTrackingSession({
    patient,
    authSession,
    req,
  });

  const token = signToken(
    { id: patient._id, role: ROLES.PATIENT, patientCode: patient.patientCode },
    { sessionId: authSession.sessionId }
  );

  const caretaker = await Caretaker.findById(patient.caretaker).select('name phone').lean();

  logger.info(`Patient device signed in: ${patient.patientCode}`);

  return ok(res, {
    token,
    role: ROLES.PATIENT,
    patient: patient.toSelf(caretaker),
    session: trackingSession.toPublic(),
  });
});

/* ------------------------------------------------------------------ shared --- */

/**
 * POST /api/auth/logout
 *
 * Revokes the session behind the presented token. For a patient this also ends
 * the tracking run, which is the event the caretaker's history needs.
 */
const logout = asyncHandler(async (req, res) => {
  const sessionId = req.token?.sid;
  if (sessionId) await sessionService.revokeAuthSession(sessionId);

  if (req.role === ROLES.PATIENT && req.patient) {
    await sessionService.closeOpenTrackingSessions(req.patient._id, 'logout');
  }

  return ok(res, null, undefined, 200);
});

/**
 * GET /api/auth/me
 *
 * Used by the client to verify a stored token on load. The response shape
 * differs by role, because the two roles genuinely know different things about
 * themselves.
 */
const me = asyncHandler(async (req, res) => {
  if (req.role === ROLES.CARETAKER) {
    return ok(res, { role: ROLES.CARETAKER, caretaker: req.caretaker.toPublic() });
  }

  const caretaker = await Caretaker.findById(req.patient.caretaker).select('name phone').lean();
  const trackingSession = await sessionService.getOpenTrackingSession(req.patient._id);

  return ok(res, {
    role: ROLES.PATIENT,
    patient: req.patient.toSelf(caretaker),
    session: trackingSession ? trackingSession.toPublic() : null,
  });
});

/** GET /api/auth/sessions — the caretaker's other active sign-ins. */
const listSessions = asyncHandler(async (req, res) => {
  const sessions = await sessionService.listCaretakerSessions(req.caretaker._id);
  const currentSessionId = req.token?.sid || null;

  return ok(
    res,
    sessions.map((session) => ({
      ...session,
      isCurrent: session.sessionId === currentSessionId,
    }))
  );
});

/** DELETE /api/auth/sessions/:sessionId — revoke one sign-in. */
const revokeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  // Scope the revoke to this caretaker's own sessions so one account cannot
  // sign another out by guessing a handle.
  const owned = await sessionService.listCaretakerSessions(req.caretaker._id);
  if (!owned.some((session) => session.sessionId === sessionId)) {
    throw ApiError.notFound('Session not found');
  }

  await sessionService.revokeAuthSession(sessionId);
  return ok(res, null);
});

/** PUT /api/auth/password — change the caretaker's own password. */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const caretaker = await Caretaker.findById(req.caretaker._id).select('+password');
  const matches = await caretaker.comparePassword(currentPassword);
  if (!matches) throw ApiError.badRequest('Your current password is not correct');

  caretaker.password = newPassword;
  await caretaker.save();

  // Every other sign-in is invalidated: a password change is how someone
  // responds to a suspected compromise, so stale tokens must stop working.
  await sessionService.revokeAllForSubject({ caretakerId: caretaker._id });

  const session = await sessionService.openAuthSession({
    role: ROLES.CARETAKER,
    caretakerId: caretaker._id,
    req,
  });
  const token = signToken(
    { id: caretaker._id, role: ROLES.CARETAKER, email: caretaker.email },
    { sessionId: session.sessionId }
  );

  return ok(res, { token, role: ROLES.CARETAKER, caretaker: caretaker.toPublic() });
});

module.exports = {
  registerCaretaker,
  loginCaretaker,
  loginPatient,
  logout,
  me,
  listSessions,
  revokeSession,
  changePassword,
};
