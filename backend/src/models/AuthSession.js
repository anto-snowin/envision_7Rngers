/**
 * An authenticated sign-in, for either role.
 *
 * Every issued JWT carries this document's `sessionId` as its `sid` claim. The
 * auth middleware checks the session on each request, which is what makes a
 * logout effective immediately instead of leaving a valid token in the wild
 * until it expires. It also lets a caretaker see and revoke their other
 * sign-ins.
 *
 * Documents expire automatically via a TTL index on `expiresAt`, so the
 * collection cannot grow without bound.
 */
const mongoose = require('mongoose');
const { ROLES } = require('../utils/constants');
const { randomId } = require('../utils/tokens');

const authSessionSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
      index: true,
    },

    /** Set for caretaker sessions. */
    caretaker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Caretaker',
      default: null,
      index: true,
    },
    /** Set for patient sessions. */
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
      index: true,
    },

    /** Opaque handle embedded in the token as `sid`. */
    sessionId: {
      type: String,
      unique: true,
      index: true,
      default: () => randomId(),
    },

    isRevoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },

    userAgent: { type: String, default: '' },
    ipAddress: { type: String, default: '' },

    lastActivityAt: { type: Date, default: Date.now },

    /** TTL anchor — MongoDB removes the document once this passes. */
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  {
    collection: 'authSessions',
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
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthSession', authSessionSchema);
