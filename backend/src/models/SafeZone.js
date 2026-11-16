/**
 * A circular safe zone for one patient — normally centred on their home.
 *
 * Several are allowed per patient (home plus a day centre, say). A patient
 * counts as "inside their safe area" when they are inside *any* active safe
 * zone, so adding a second zone widens safety rather than creating a conflict.
 *
 * The 20 m floor on the radius is not arbitrary: consumer GPS is routinely off
 * by 10–20 m, and a tighter zone would fire exit alerts while the patient sits
 * in their own living room.
 */
const mongoose = require('mongoose');
const { buildZoneSchema } = require('./zoneSchema');

const safeZoneSchema = buildZoneSchema({
  defaultName: 'Home',
  defaultRadius: 200,
  minRadius: 20,
  extras: {
    address: { type: String, default: '', trim: true, maxlength: 240 },
    /** Marks the patient's primary home zone in the dashboard. */
    isPrimary: { type: Boolean, default: false },
  },
});

safeZoneSchema.index({ patient: 1, isActive: 1 });

module.exports = mongoose.model('SafeZone', safeZoneSchema, 'safeZones');
