/**
 * A hazardous area the patient must not enter: railway tracks, a river bank, a
 * construction site, a highway, and so on.
 *
 * Danger zones belong to a caretaker rather than to one patient, so a single
 * "railway crossing" zone is evaluated against every patient that caretaker
 * monitors. `patients` can optionally narrow a zone to specific patients.
 */
const mongoose = require('mongoose');
const { DANGER_ZONE_CATEGORIES, SEVERITY } = require('../utils/constants');

const dangerZoneSchema = new mongoose.Schema(
  {
    caretaker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, 'Danger zone name is required'],
      trim: true,
      maxlength: 80,
    },
    category: {
      type: String,
      enum: DANGER_ZONE_CATEGORIES,
      default: 'other',
    },
    description: { type: String, default: '', maxlength: 1000 },

    latitude: {
      type: Number,
      required: [true, 'Danger zone latitude is required'],
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: [true, 'Danger zone longitude is required'],
      min: -180,
      max: 180,
    },
    /** Zone radius in metres. */
    radius: {
      type: Number,
      required: [true, 'Danger zone radius is required'],
      min: [10, 'Radius must be at least 10 m'],
      max: [20000, 'Radius must be at most 20 km'],
      default: 100,
    },

    severity: {
      type: String,
      enum: [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM],
      default: SEVERITY.CRITICAL,
    },

    /**
     * Empty array means "applies to all of this caretaker's patients".
     * Otherwise the zone is only evaluated for the listed patients.
     */
    patients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }],

    isActive: { type: Boolean, default: true },
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

// Zone evaluation loads every active zone for a caretaker on each fix.
dangerZoneSchema.index({ caretaker: 1, isActive: 1 });

module.exports = mongoose.model('DangerZone', dangerZoneSchema);
