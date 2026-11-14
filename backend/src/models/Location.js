/**
 * A single GPS fix reported by a patient's phone.
 *
 * This is by far the highest-volume collection (one document every ~5 seconds
 * per patient), so it stays deliberately flat and is indexed for exactly the
 * two access patterns the app has: "latest fix for a patient" and
 * "all fixes for a patient within a time range".
 */
const mongoose = require('mongoose');
const { ZONE_STATE } = require('../utils/constants');

const locationSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    // Denormalised so history/analytics queries never need a patient join.
    caretaker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },

    /** Horizontal accuracy radius in metres, as reported by the browser. */
    accuracy: { type: Number, default: null },
    altitude: { type: Number, default: null },
    /** Ground speed in m/s, when the device can supply it. */
    speed: { type: Number, default: null },
    heading: { type: Number, default: null },

    batteryLevel: { type: Number, min: 0, max: 100, default: null },
    isCharging: { type: Boolean, default: null },

    /** Zone evaluation result at the moment of this fix. */
    zoneState: {
      type: String,
      enum: Object.values(ZONE_STATE),
      default: ZONE_STATE.UNKNOWN,
    },
    isInsideSafeZone: { type: Boolean, default: null },
    distanceFromHome: { type: Number, default: null },
    dangerZones: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DangerZone' }],

    /**
     * True when the fix was buffered on the device during an internet outage
     * and uploaded later. Lets the UI distinguish "live" from "backfilled".
     */
    isQueued: { type: Boolean, default: false },

    /** When the device captured the fix (authoritative for ordering). */
    recordedAt: { type: Date, required: true, default: Date.now },
    /** When the server received it. Differs from recordedAt for queued fixes. */
    receivedAt: { type: Date, default: Date.now },
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

// Primary access pattern: a patient's track over a time window, newest first.
locationSchema.index({ patient: 1, recordedAt: -1 });
// Analytics roll-ups across every patient of one caretaker.
locationSchema.index({ caretaker: 1, recordedAt: -1 });

module.exports = mongoose.model('Location', locationSchema);
