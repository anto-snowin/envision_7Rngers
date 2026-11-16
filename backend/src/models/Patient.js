/**
 * Patient being monitored — and, since the platform has two login roles, an
 * account in its own right.
 *
 * The patient signs in on their phone with `patientCode` (or their email or
 * phone number) plus a password set by the caretaker. The phone then becomes
 * the GPS device for that patient and nothing else: its token authorises
 * writing its own location and reading its own status, never any other
 * patient's data and never anything belonging to the caretaker.
 *
 * `liveStatus` is a denormalised cache of the most recent location fix. It
 * exists so the dashboard can render every patient's current state from a
 * single query instead of fanning out into the (much larger) locations
 * collection once per patient.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { generatePatientCode } = require('../utils/tokens');
const { ZONE_STATE } = require('../utils/constants');

const SALT_ROUNDS = 12;

const patientSchema = new mongoose.Schema(
  {
    // Owning caretaker. Every query in the app is scoped by this field.
    caretaker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Caretaker',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true,
      maxlength: 80,
    },

    /**
     * Login identifier, generated on creation and printed for the patient.
     * Readable by design: someone may have to type it on a phone for them.
     */
    patientCode: {
      type: String,
      unique: true,
      index: true,
      uppercase: true,
      trim: true,
      default: () => generatePatientCode(),
    },

    /**
     * Optional alternative login identifiers.
     *
     * `sparse` matters here: without it a second patient with no email would
     * collide with the first on a null value and the insert would fail.
     */
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      index: { unique: true, sparse: true },
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      index: { unique: true, sparse: true },
    },

    password: {
      type: String,
      required: [true, 'A device password is required'],
      select: false,
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

    emergencyContact: {
      name: { type: String, trim: true, default: '' },
      relationship: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
    },

    medicalNotes: { type: String, default: '', maxlength: 4000 },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },

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
      /** Name of one danger zone the patient is inside, for quick display. */
      dangerZoneName: { type: String, default: null },
      distanceFromSafeZone: { type: Number, default: null },
      lastSeenAt: { type: Date, default: null },
      lastFixAt: { type: Date, default: null },
    },
  },
  {
    collection: 'patients',
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Dashboard list view: patients of one caretaker, newest first.
patientSchema.index({ caretaker: 1, createdAt: -1 });
// Supports the patient search box.
patientSchema.index({ caretaker: 1, name: 1 });

patientSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

patientSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** True when the device has reported in recently enough to count as online. */
patientSchema.methods.isCurrentlyOnline = function isCurrentlyOnline(thresholdMs) {
  const lastSeen = this.liveStatus && this.liveStatus.lastSeenAt;
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() <= thresholdMs;
};

/** Full record, for the caretaker dashboard. */
patientSchema.methods.toPublic = function toPublic() {
  const live = this.liveStatus || {};
  return {
    id: String(this._id),
    name: this.name,
    patientCode: this.patientCode,
    email: this.email || null,
    phone: this.phone || null,
    age: this.age ?? null,
    gender: this.gender || 'unspecified',
    emergencyContactName: this.emergencyContact?.name || null,
    emergencyContactPhone: this.emergencyContact?.phone || null,
    emergencyContactRelationship: this.emergencyContact?.relationship || null,
    medicalNotes: this.medicalNotes || '',
    isActive: this.isActive,
    liveStatus: {
      isOnline: Boolean(live.isOnline),
      latitude: live.latitude ?? null,
      longitude: live.longitude ?? null,
      accuracy: live.accuracy ?? null,
      batteryLevel: live.batteryLevel ?? null,
      isCharging: live.isCharging ?? null,
      zoneState: live.zoneState || ZONE_STATE.UNKNOWN,
      insideSafeZone:
        live.zoneState === ZONE_STATE.INSIDE_SAFE
          ? true
          : live.zoneState === ZONE_STATE.OUTSIDE_SAFE || live.zoneState === ZONE_STATE.IN_DANGER
            ? false
            : null,
      dangerZone: live.dangerZoneName || null,
      distanceFromSafeZone: live.distanceFromSafeZone ?? null,
      lastSeenAt: live.lastSeenAt || null,
      recordedAt: live.lastFixAt || null,
    },
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

/**
 * Trimmed identity for the patient's own device.
 *
 * The phone deliberately learns almost nothing: its own name and code so the
 * screen can greet the right person, and the caretaker's contact details so the
 * patient has someone to call. No zones, no history, no other patients.
 */
patientSchema.methods.toSelf = function toSelf(caretaker) {
  return {
    id: String(this._id),
    name: this.name,
    patientCode: this.patientCode,
    caretakerName: caretaker?.name || null,
    caretakerPhone: caretaker?.phone || null,
  };
};

module.exports = mongoose.model('Patient', patientSchema);
