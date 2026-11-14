/**
 * JWT issuing and verification for caretaker accounts.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('./ApiError');

const ISSUER = 'dementia-care-api';

/**
 * Sign an access token for a caretaker.
 * @param {{id?:string, _id?:string, email:string, role?:string}} user
 */
function signToken(user, expiresIn = env.JWT_EXPIRES_IN) {
  return jwt.sign(
    { sub: String(user.id || user._id), email: user.email, role: user.role || 'caretaker' },
    env.JWT_SECRET,
    { expiresIn, issuer: ISSUER }
  );
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

/** Seconds until a decoded token expires (used to size client-side timers). */
function secondsUntilExpiry(decoded) {
  if (!decoded || !decoded.exp) return 0;
  return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
}

module.exports = { signToken, verifyToken, extractBearerToken, secondsUntilExpiry };
