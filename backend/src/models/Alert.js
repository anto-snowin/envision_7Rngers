/**
 * An alert raised by the monitoring engine.
 *
 * Alerts are append-only facts about something that happened; the caretaker can
 * acknowledge or resolve one, but the original event is never rewritten.
 */
const mongoose = require('mongoose');
const { ALERT_TYPES, SEVERITY } = require('../utils/constants');

const alertSchema = new mongoose.Schema(
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

    type: {
      type: String,
      enum: Object.values(ALERT_TYPES),
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: Object.values(SEVERITY),
      default: SEVERITY.MEDIUM,
      index: true,
    },

    title: { type: String, required: true },
    message: { type: String, default: '' },

    /**
     * Name of the zone involved, copied in at creation time.
     *
     * Denormalised on purpose: the alert must still read correctly after the
     * caretaker renames or deletes the zone, because it is a record of what
     * happened, not a live view of configuration.
     */
    zoneName: { type: String, default: null },

    /** Where the patient was when the alert fired (if known). */
    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      accuracy: { type: Number, default: null },
    },

    /** Type-specific extras: breached distance, battery %, and so on. */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    dangerZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DangerZone',
      default: null,
    },
    safeZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SafeZone',
      default: null,
    },

    isRead: { type: Boolean, default: false, index: true },
    isResolved: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: '' },
  },
  {
    collection: 'alerts',
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Alert feed: one caretaker's alerts, newest first, optionally filtered.
alertSchema.index({ caretaker: 1, createdAt: -1 });
// Cooldown lookup: "did we already raise this exact alert recently?"
alertSchema.index({ patient: 1, type: 1, createdAt: -1 });

/**
 * Serialise an alert for the API.
 *
 * `patientName` is passed in rather than populated: the caller usually already
 * holds the patient, and the alert feed would otherwise populate the same
 * patient once per row.
 */
alertSchema.statics.toPublic = function toPublic(alert, patientName = null) {
  if (!alert) return null;
  const meta = alert.metadata || {};
  return {
    id: String(alert._id),
    patientId: String(alert.patient?._id || alert.patient),
    patientName: patientName || alert.patient?.name || null,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message || '',
    zoneName: alert.zoneName ?? meta.zoneName ?? null,
    latitude: alert.location?.latitude ?? null,
    longitude: alert.location?.longitude ?? null,
    distance: meta.distanceBeyondEdge ?? meta.distanceFromCentre ?? null,
    metadata: meta,
    isRead: Boolean(alert.isRead),
    isResolved: Boolean(alert.isResolved),
    resolvedAt: alert.resolvedAt || null,
    createdAt: alert.createdAt,
  };
};

module.exports = mongoose.model('Alert', alertSchema);
