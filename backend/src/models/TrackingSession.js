/**
 * One run of tracking on a patient's device.
 *
 * A session opens when the patient signs in on the phone and closes when they
 * sign out, the tab reports that tracking stopped, or the presence sweep gives
 * up on it. This gives the history page a notion of "tracking run" — useful
 * because a gap in the fixes means something different depending on whether
 * tracking was on at the time.
 *
 * Distinct from `AuthSession`, which is about token validity. One sign-in has
 * exactly one of each, but they answer different questions: "may this token act
 * on behalf of this patient?" versus "was the phone reporting between 14:00 and
 * 16:00?".
 */
const mongoose = require('mongoose');

const trackingSessionSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    caretaker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Caretaker',
      required: true,
      index: true,
    },

    /** The auth session this tracking run belongs to. */
    authSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuthSession',
      default: null,
    },

    startedAt: { type: Date, default: Date.now, index: true },
    endedAt: { type: Date, default: null },
    endReason: {
      type: String,
      enum: ['logout', 'stopped', 'tab_closed', 'timeout', 'revoked', null],
      default: null,
    },

    fixCount: { type: Number, default: 0 },
    /** Fixes that arrived from the device's offline queue rather than live. */
    queuedFixCount: { type: Number, default: 0 },
    lastFixAt: { type: Date, default: null },

    userAgent: { type: String, default: '' },
  },
  {
    collection: 'trackingSessions',
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// History view: a patient's tracking runs, most recent first.
trackingSessionSchema.index({ patient: 1, startedAt: -1 });

trackingSessionSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    patientId: String(this.patient),
    startedAt: this.startedAt,
    endedAt: this.endedAt,
    endReason: this.endReason,
    fixCount: this.fixCount,
    queuedFixCount: this.queuedFixCount,
    lastFixAt: this.lastFixAt,
    userAgent: this.userAgent || null,
  };
};

module.exports = mongoose.model('TrackingSession', trackingSessionSchema);
