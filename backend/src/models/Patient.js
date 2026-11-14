/**
 * Patient being monitored.
 *
 * `liveStatus` is a denormalised cache of the most recent location fix. It
 * exists so the dashboard can render every patient's current state from a
 * single query instead of fanning out into the (much larger) Locations
 * collection once per patient.
 */
const mongoose = require('mongoose');
const { generateTrackingCode } = require('../utils/tokens');
const { ZONE_STATE } = require('../utils/constants');

const patientSchema = new mongoose.Schema(
  {
    // Owning caretaker. Every query in the app is scoped by this field.
    caretaker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true,
      maxlength: 80,
    },
    age: {
      type: Number,
      min: [0, 'Age cannot be negative'],
      max: [130, 'Age looks invalid'],
      default: null,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'unspecified'],
      default: 'unspecified',
    },
    photoUrl: { type: String, default: '' },

    emergencyContact: {
      name: { type: String, trim: true, default: '' },
      relationship: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      altPhone: { type: String, trim: true, default: '' },
    },

    medicalNotes: { type: String, default: '', maxlength: 4000 },
    conditionStage: {
      type: String,
      enum: ['early', 'moderate', 'advanced', 'unspecified'],
      default: 'unspecified',
    },

    // Home address / coordinates. The safe-zone geofence is normally centred here.
    homeLocation: {
      label: { type: String, default: 'Home' },
      address: { type: String, default: '' },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },

    /**
     * Unguessable code forming the patient's tracking URL. This is the only
     * credential the patient's phone presents, so it is generated with a CSPRNG.
     */
    trackingCode: {
      type: String,
      unique: true,
      index: true,
      default: () => generateTrackingCode(),
    },

    isActive: { type: Boolean, default: true },

    /** Cached snapshot of the latest fix — written on every location ingest. */
    liveStatus: {
      isOnline: { type: Boolean, default: false },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      speed: { type: Number, default: null },
      batteryLevel: { type: Number, default: null },
      isCharging: { type: Boolean, default: null },
      zoneState: {
        type: String,
        enum: Object.values(ZONE_STATE),
        default: ZONE_STATE.UNKNOWN,
      },
      // Danger zones the patient is currently inside, for transition detection.
      activeDangerZones: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DangerZone' }],
      distanceFromHome: { type: Number, default: null },
      lastSeenAt: { type: Date, default: null },
      lastFixAt: { type: Date, default: null },
    },
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

// Dashboard list view: patients of one caretaker, newest first.
patientSchema.index({ caretaker: 1, createdAt: -1 });
// Text-ish search support for the patient search box.
patientSchema.index({ caretaker: 1, name: 1 });

/** True when the device has reported in recently enough to count as online. */
patientSchema.methods.isCurrentlyOnline = function isCurrentlyOnline(thresholdMs) {
  const lastSeen = this.liveStatus && this.liveStatus.lastSeenAt;
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() <= thresholdMs;
};

module.exports = mongoose.model('Patient', patientSchema);
