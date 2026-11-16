/**
 * Shared schema for circular zones.
 *
 * Safe zones and danger zones are the same geometry — a centre and a radius —
 * scoped to one patient. Only the meaning of crossing the boundary differs, and
 * that lives in the geofence service rather than in the schema. They are kept
 * in separate collections (`safeZones`, `dangerZones`) because every read is
 * for one kind or the other, so splitting them keeps both queries index-only.
 */
const mongoose = require('mongoose');

/**
 * @param {{ defaultName: string, defaultRadius: number, minRadius: number, extras?: object }} options
 */
function buildZoneSchema({ defaultName, defaultRadius, minRadius, extras = {} }) {
  return new mongoose.Schema(
    {
      patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: true,
        index: true,
      },
      // Denormalised so zone reads never need a patient join to authorise.
      caretaker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Caretaker',
        required: true,
        index: true,
      },

      name: {
        type: String,
        required: [true, 'Zone name is required'],
        trim: true,
        maxlength: 80,
        default: defaultName,
      },
      description: { type: String, default: '', maxlength: 1000, trim: true },

      latitude: {
        type: Number,
        required: [true, 'Zone latitude is required'],
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        required: [true, 'Zone longitude is required'],
        min: -180,
        max: 180,
      },

      /** Zone radius in metres. */
      radius: {
        type: Number,
        required: [true, 'Zone radius is required'],
        min: [minRadius, `Radius must be at least ${minRadius} m`],
        max: [20000, 'Radius must be at most 20 km'],
        default: defaultRadius,
      },

      isActive: { type: Boolean, default: true },

      ...extras,
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
}

/** Serialise a zone document (or lean object) for the API. */
function zoneToPublic(zone, kind) {
  if (!zone) return null;
  return {
    id: String(zone._id),
    patientId: String(zone.patient),
    kind,
    name: zone.name,
    category: zone.category || null,
    description: zone.description || '',
    latitude: zone.latitude,
    longitude: zone.longitude,
    radius: zone.radius,
    severity: zone.severity || null,
    isActive: zone.isActive !== false,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
  };
}

module.exports = { buildZoneSchema, zoneToPublic };
