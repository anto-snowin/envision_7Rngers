/**
 * JWT issuing and verification.
 *
 * One token shape serves both roles; the `role` claim decides what the bearer
 * may do. Nothing else in the system infers a role from the shape of a request,
 * so a patient token can never be mistaken for a caretaker token.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('./ApiError');
const { ROLES } = require('./constants');

const ISSUER = 'sentinel-api';

/**
 * Sign an access token.
 *
 * `sessionId` becomes the `sid` claim so signing out can revoke this specific
 * token server-side, before its natural expiry.
 *
 * @param {{ id:string, role:string, email?:string, patientCode?:string }} subject
 * @param {{ sessionId?:string, expiresIn?:string }} [options]
 */
function signToken(subject, options = {}) {
  const { sessionId, expiresIn = env.JWT_EXPIRES_IN } = options;

  if (!subject?.id) throw new Error('signToken requires a subject id');
  if (!Object.values(ROLES).includes(subject.role)) {
    throw new Error(`signToken requires a known role, received "${subject.role}"`);
  }

  const payload = { sub: String(subject.id), role: subject.role };
  if (subject.email) payload.email = subject.email;
  if (subject.patientCode) payload.code = subject.patientCode;
  if (sessionId) payload.sid = sessionId;

  return jwt.sign(payload, env.JWT_SECRET, { expiresIn, issuer: ISSUER });
}

/** Verify a token, converting library errors into clean 401s. */
function verifyToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Session expired, please sign in again');
    }
    throw ApiError.unauthorized('Invalid authentication token');
  }
}

/** Pull a bearer token out of the Authorization header. */
function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

module.exports = { signToken, verifyToken, extractBearerToken };
