/**
 * Caretaker authentication: register, login, profile, logout.
 */
const { User, Session } = require('../models');
const { signToken } = require('../utils/jwt');
const { ok, created } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const logger = require('../utils/logger');

/** Days a session document survives before the TTL index reaps it. */
const SESSION_TTL_DAYS = 7;

/** Create the session record that backs a freshly issued token. */
async function openSession(user, req) {
  return Session.create({
    kind: 'caretaker',
    user: user._id,
    userAgent: req.headers['user-agent'] || '',
    ipAddress: req.ip || '',
    expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
}

/**
 * POST /api/auth/register
 * Creates a caretaker account and signs them straight in.
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, organisation } = req.body;

  const existing = await User.findOne({ email }).select('_id').lean();
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  // The pre-save hook hashes the password; it is never stored in plaintext.
  const user = await User.create({ name, email, password, phone, organisation });

  const session = await openSession(user, req);
  const token = signToken(user, { sessionId: session.sessionId });

  logger.info(`New caretaker registered: ${email}`);

  return created(res, {
    token,
    expiresIn: env.JWT_EXPIRES_IN,
    user: user.toJSON(),
  });
});

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // `password` is `select: false` on the schema, so ask for it explicitly.
  const user = await User.findOne({ email }).select('+password');

  // Identical message for "no such user" and "wrong password" so the endpoint
  // cannot be used to discover which emails have accounts.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Incorrect email or password');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const session = await openSession(user, req);
  const token = signToken(user, { sessionId: session.sessionId });

  return ok(res, {
    token,
    expiresIn: env.JWT_EXPIRES_IN,
    user: user.toJSON(),
  });
});

/**
 * GET /api/auth/me
 * Used on app boot to restore a session from a stored token.
 */
const getCurrentUser = asyncHandler(async (req, res) => ok(res, { user: req.user.toJSON() }));

/**
 * PUT /api/auth/me
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, organisation, preferences } = req.body;

  if (name !== undefined) req.user.name = name;
  if (phone !== undefined) req.user.phone = phone;
  if (organisation !== undefined) req.user.organisation = organisation;
  if (preferences) {
    req.user.preferences = { ...req.user.preferences.toObject(), ...preferences };
  }

  await req.user.save();
  return ok(res, { user: req.user.toJSON() });
});

/**
 * PUT /api/auth/password
 * Changing the password revokes every other session, since a password change
 * usually means the old one may be compromised.
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect', {
      fields: { currentPassword: 'Current password is incorrect' },
    });
  }

  user.password = newPassword; // re-hashed by the pre-save hook
  await user.save();

  const keepSessionId = req.session ? req.session.sessionId : null;
  await Session.updateMany(
    { user: user._id, kind: 'caretaker', sessionId: { $ne: keepSessionId } },
    { isRevoked: true, endReason: 'revoked', endedAt: new Date() }
  );

  return ok(res, { message: 'Password updated. Other devices have been signed out.' });
});

/**
 * POST /api/auth/logout
 * Revokes the current session so the token stops working immediately.
 */
const logout = asyncHandler(async (req, res) => {
  if (req.session) {
    req.session.isRevoked = true;
    req.session.endReason = 'logout';
    req.session.endedAt = new Date();
    await req.session.save();
  }
  return ok(res, { message: 'Signed out' });
});

/**
 * GET /api/auth/sessions
 * Lets a caretaker see where they are signed in.
 */
const listSessions = asyncHandler(async (req, res) => {
  const sessions = await Session.find({ user: req.user._id, kind: 'caretaker', isRevoked: false })
    .sort({ lastActivityAt: -1 })
    .select('sessionId userAgent ipAddress createdAt lastActivityAt expiresAt')
    .lean();

  const currentId = req.session ? req.session.sessionId : null;

  return ok(res, {
    sessions: sessions.map((session) => ({
      ...session,
      isCurrent: session.sessionId === currentId,
    })),
  });
});

/**
 * DELETE /api/auth/sessions/:sessionId
 */
const revokeSession = asyncHandler(async (req, res) => {
  const result = await Session.findOneAndUpdate(
    { sessionId: req.params.sessionId, user: req.user._id, kind: 'caretaker' },
    { isRevoked: true, endReason: 'revoked', endedAt: new Date() },
    { new: true }
  );
  if (!result) throw ApiError.notFound('Session not found');
  return ok(res, { message: 'Session revoked' });
});

module.exports = {
  register,
  login,
  getCurrentUser,
  updateProfile,
  changePassword,
  logout,
  listSessions,
  revokeSession,
};
