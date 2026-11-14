/**
 * JWT authentication and authorisation.
 */
const { User, Session, Patient } = require('../models');
const { verifyToken, extractBearerToken } = require('../utils/jwt');
const { safeEqual } = require('../utils/tokens');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Require a valid caretaker JWT.
 *
 * Attaches `req.user` (the User document) and `req.session` when the token
 * carries a session id. A revoked session is rejected even if the JWT has not
 * yet expired, which is what makes logout effective immediately.
 */
const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const decoded = verifyToken(token);

  const user = await User.findById(decoded.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('Account has been deactivated');

  if (decoded.sid) {
    const session = await Session.findOne({ sessionId: decoded.sid, kind: 'caretaker' });
    if (!session || session.isRevoked) {
      throw ApiError.unauthorized('Session has been signed out');
    }
    session.lastActivityAt = new Date();
    await session.save();
    req.session = session;
  }

  req.user = user;
  req.token = decoded;
  return next();
});

/**
 * Restrict a route to specific roles. Used for admin-only endpoints.
 * @param {...string} roles
 */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('This action requires elevated privileges'));
    }
    return next();
  };
}

/**
 * Resolve a patient from the patient-facing tracking code.
 *
 * This is the patient portal's only form of authentication: the code is a
 * 60-bit random string that acts as a bearer credential for that one patient.
 * It grants permission to *write* location data for that patient and nothing
 * else — it can never read another patient's data or any caretaker data.
 *
 * The code may arrive as a route param, a body field or an `x-tracking-code`
 * header so the same middleware serves GET and POST routes.
 */
const requireTrackingCode = asyncHandler(async (req, _res, next) => {
  const code =
    req.params.trackingCode || req.body.trackingCode || req.headers['x-tracking-code'] || '';

  if (!code || typeof code !== 'string') {
    throw ApiError.unauthorized('A tracking code is required');
  }

  // Look the patient up by the code, then confirm with a constant-time
  // comparison so the lookup cannot be used as a timing oracle.
  const patient = await Patient.findOne({ trackingCode: code.toUpperCase().trim() });
  if (!patient || !safeEqual(patient.trackingCode, code.toUpperCase().trim())) {
    throw ApiError.unauthorized('Invalid tracking code');
  }
  if (!patient.isActive) {
    throw ApiError.forbidden('Tracking has been disabled for this patient');
  }

  req.patient = patient;
  return next();
});

/**
 * Load a patient by `:id` (or `:patientId`) and assert the signed-in caretaker
 * owns them. Prevents one caretaker reading another's patients by guessing ids.
 */
const requirePatientOwnership = asyncHandler(async (req, _res, next) => {
  const patientId = req.params.id || req.params.patientId;
  const patient = await Patient.findById(patientId);

  if (!patient) throw ApiError.notFound('Patient not found');
  if (String(patient.caretaker) !== String(req.user._id)) {
    // Report 404 rather than 403 so ids cannot be enumerated.
    throw ApiError.notFound('Patient not found');
  }

  req.patient = patient;
  return next();
});

module.exports = { requireAuth, requireRole, requireTrackingCode, requirePatientOwnership };
