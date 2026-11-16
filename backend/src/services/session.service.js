/**
 * Session lifecycle for both roles.
 *
 * Two different things are recorded at sign-in and they are kept apart on
 * purpose:
 *
 *  - an `AuthSession`, which answers "is this token still allowed to act?"
 *  - a `TrackingSession` (patients only), which answers "was the phone
 *    reporting during this period?"
 *
 * Collapsing them would mean a caretaker revoking a device could no longer tell
 * whether a gap in the location history was a revoked session or a dead battery.
 */
const { AuthSession, TrackingSession } = require('../models');
const { ROLES } = require('../utils/constants');
const logger = require('../utils/logger');

/** Truncate a user agent before storing: the full string is noise. */
function shortUserAgent(req) {
  return String(req?.headers?.['user-agent'] || '').slice(0, 240);
}

/**
 * Open an auth session for a successful login.
 *
 * @param {{ role:string, caretakerId?:string, patientId?:string, req?:object }} input
 */
async function openAuthSession({ role, caretakerId = null, patientId = null, req }) {
  return AuthSession.create({
    role,
    caretaker: caretakerId,
    patient: patientId,
    userAgent: shortUserAgent(req),
    ipAddress: req?.ip || '',
  });
}

/** Revoke one session by its opaque handle. Idempotent. */
async function revokeAuthSession(sessionId) {
  if (!sessionId) return null;
  return AuthSession.findOneAndUpdate(
    { sessionId, isRevoked: false },
    { isRevoked: true, revokedAt: new Date() },
    { new: true }
  );
}

/** Revoke every session for one subject — used when a password changes. */
async function revokeAllForSubject({ caretakerId = null, patientId = null }) {
  const query = { isRevoked: false };
  if (caretakerId) query.caretaker = caretakerId;
  else if (patientId) query.patient = patientId;
  else return 0;

  const result = await AuthSession.updateMany(query, {
    isRevoked: true,
    revokedAt: new Date(),
  });
  return result.modifiedCount || 0;
}

/** Caretaker's active sign-ins, newest first. */
async function listCaretakerSessions(caretakerId) {
  const sessions = await AuthSession.find({
    caretaker: caretakerId,
    role: ROLES.CARETAKER,
    isRevoked: false,
  })
    .sort({ lastActivityAt: -1 })
    .lean();

  return sessions.map((session) => ({
    id: String(session._id),
    sessionId: session.sessionId,
    userAgent: session.userAgent || null,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
  }));
}

/**
 * Open a tracking run for a patient device.
 *
 * Any run still open from a previous sign-in is closed first: an unclosed
 * session usually means the tab was killed without a logout, and leaving two
 * open would make the history page double-count.
 */
async function openTrackingSession({ patient, authSession, req }) {
  await closeOpenTrackingSessions(patient._id, 'tab_closed');

  const session = await TrackingSession.create({
    patient: patient._id,
    caretaker: patient.caretaker,
    authSession: authSession?._id || null,
    userAgent: shortUserAgent(req),
  });

  logger.debug(`Tracking session opened for patient ${patient._id}`);
  return session;
}

/** The currently open tracking run for a patient, or null. */
async function getOpenTrackingSession(patientId) {
  return TrackingSession.findOne({ patient: patientId, endedAt: null }).sort({ startedAt: -1 });
}

/** Close every open run for a patient. */
async function closeOpenTrackingSessions(patientId, reason = 'logout') {
  const result = await TrackingSession.updateMany(
    { patient: patientId, endedAt: null },
    { endedAt: new Date(), endReason: reason }
  );
  return result.modifiedCount || 0;
}

/** Record that fixes landed against the open run. */
async function recordFixes(patientId, { total = 1, queued = 0, lastFixAt = new Date() } = {}) {
  await TrackingSession.updateOne(
    { patient: patientId, endedAt: null },
    {
      $inc: { fixCount: total, queuedFixCount: queued },
      $set: { lastFixAt },
    }
  );
}

module.exports = {
  openAuthSession,
  revokeAuthSession,
  revokeAllForSubject,
  listCaretakerSessions,
  openTrackingSession,
  getOpenTrackingSession,
  closeOpenTrackingSessions,
  recordFixes,
};
