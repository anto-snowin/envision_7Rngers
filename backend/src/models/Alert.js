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
      ref: 'User',
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

    /** Where the patient was when the alert fired (if known). */
    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      accuracy: { type: Number, default: null },
    },

    /** Type-specific extras: breached distance, zone name, battery %, etc. */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /** The danger zone that triggered a DANGER_ZONE_ENTRY alert. */
    dangerZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DangerZone',
      default: null,
    },
    geofence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Geofence',
      default: null,
    },

    isRead: { type: Boolean, default: false, index: true },
    isResolved: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: '' },
  },
  {
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

module.exports = mongoose.model('Alert', alertSchema);
