/**
 * A circular "safe zone" around a patient's home.
 *
 * The prototype supports one active geofence per patient (the home zone), but
 * the schema allows several so a patient could later have, say, a day-centre
 * zone as well. Only documents with `isActive: true` take part in evaluation.
 */
const mongoose = require('mongoose');

const geofenceSchema = new mongoose.Schema(
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

    name: { type: String, default: 'Home safe zone', trim: true, maxlength: 80 },

    latitude: {
      type: Number,
      required: [true, 'Safe zone latitude is required'],
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: [true, 'Safe zone longitude is required'],
      min: -180,
      max: 180,
    },

    /** Zone radius in metres. */
    radius: {
      type: Number,
      required: [true, 'Safe zone radius is required'],
      min: [20, 'Radius must be at least 20 m to tolerate GPS drift'],
      max: [20000, 'Radius must be at most 20 km'],
      default: 200,
    },

    address: { type: String, default: '' },
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

geofenceSchema.index({ patient: 1, isActive: 1 });

module.exports = mongoose.model('Geofence', geofenceSchema);
