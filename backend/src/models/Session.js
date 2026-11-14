/**
 * Session records.
 *
 * Two kinds live here:
 *  - `caretaker` sessions, written on login so the caretaker can see and revoke
 *    active sign-ins, and so a logout can invalidate a token before it expires.
 *  - `patient` tracking sessions, one per browser tab that starts tracking.
 *    These give the history page a notion of "tracking run" and record why
 *    tracking stopped.
 *
 * Documents expire automatically via a TTL index on `expiresAt`.
 */
const mongoose = require('mongoose');
const { randomId } = require('../utils/tokens');

const sessionSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ['caretaker', 'patient'],
      required: true,
      index: true,
    },

    /** Set for caretaker sessions. */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    /** Set for patient tracking sessions. */
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
      index: true,
    },

    /** Opaque session handle returned to the client. */
    sessionId: {
      type: String,
      unique: true,
      index: true,
      default: () => randomId(),
    },

    /**
     * Revoked caretaker sessions are rejected by the auth middleware even while
     * the JWT itself is still inside its validity window.
     */
    isRevoked: { type: Boolean, default: false },

    userAgent: { type: String, default: '' },
    ipAddress: { type: String, default: '' },

    /** Patient-session bookkeeping. */
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    endReason: {
      type: String,
      enum: ['logout', 'expired', 'revoked', 'tab_closed', 'stopped', null],
      default: null,
    },
    fixCount: { type: Number, default: 0 },
    lastActivityAt: { type: Date, default: Date.now },

    /** TTL anchor — MongoDB removes the document once this passes. */
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Let MongoDB reap expired sessions on its own.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
