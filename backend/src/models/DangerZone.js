/**
 * A hazardous area the patient must not enter: railway tracks, a river bank, a
 * construction site, a highway, and so on.
 *
 * Scoped to one patient, like safe zones, because the hazards that matter
 * depend on where that person lives and wanders. A caretaker monitoring two
 * patients in different neighbourhoods should not have one patient's railway
 * crossing evaluated against the other.
 *
 * The radius floor is lower than a safe zone's (10 m): a level crossing is
 * genuinely small, and here a false positive is far cheaper than a miss.
 */
const mongoose = require('mongoose');
const { buildZoneSchema } = require('./zoneSchema');
const { DANGER_ZONE_CATEGORIES, SEVERITY } = require('../utils/constants');

const dangerZoneSchema = buildZoneSchema({
  defaultName: 'Danger zone',
  defaultRadius: 100,
  minRadius: 10,
  extras: {
    category: {
      type: String,
      enum: DANGER_ZONE_CATEGORIES,
      default: 'other',
    },
    severity: {
      type: String,
      enum: [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM],
      default: SEVERITY.CRITICAL,
    },
  },
});

dangerZoneSchema.index({ patient: 1, isActive: 1 });

module.exports = mongoose.model('DangerZone', dangerZoneSchema, 'dangerZones');
