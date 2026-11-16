/**
 * Request schemas for safe and danger zones.
 */
const { z } = require('zod');
const { latitude, longitude, objectId } = require('./common.validator');
const { DANGER_ZONE_CATEGORIES, SEVERITY } = require('../utils/constants');

/**
 * Radius bounds differ by kind.
 *
 * A safe zone smaller than 20 m would fire exit alerts from GPS drift while the
 * patient sits indoors. A danger zone genuinely can be 10 m across — a level
 * crossing — and there a false positive costs far less than a miss.
 */
const safeRadius = z.coerce
  .number()
  .min(20, 'A safe zone must be at least 20 m to tolerate GPS drift')
  .max(20000, 'Radius must be at most 20 km');

const dangerRadius = z.coerce
  .number()
  .min(10, 'Radius must be at least 10 m')
  .max(20000, 'Radius must be at most 20 km');

const baseFields = {
  name: z.string().trim().min(1, 'Give the zone a name').max(80),
  description: z.string().trim().max(1000).optional(),
  latitude,
  longitude,
  isActive: z.boolean().optional(),
};

const createSafeZoneSchema = z.object({
  patientId: objectId,
  ...baseFields,
  radius: safeRadius,
  address: z.string().trim().max(240).optional(),
  isPrimary: z.boolean().optional(),
});

const updateSafeZoneSchema = z.object({
  name: baseFields.name.optional(),
  description: baseFields.description,
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  radius: safeRadius.optional(),
  isActive: z.boolean().optional(),
  address: z.string().trim().max(240).optional(),
  isPrimary: z.boolean().optional(),
});

const createDangerZoneSchema = z.object({
  patientId: objectId,
  ...baseFields,
  radius: dangerRadius,
  category: z.enum(DANGER_ZONE_CATEGORIES).optional(),
  severity: z.enum([SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM]).optional(),
});

const updateDangerZoneSchema = z.object({
  name: baseFields.name.optional(),
  description: baseFields.description,
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  radius: dangerRadius.optional(),
  isActive: z.boolean().optional(),
  category: z.enum(DANGER_ZONE_CATEGORIES).optional(),
  severity: z.enum([SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM]).optional(),
});

const listZonesSchema = z.object({
  patientId: objectId.optional(),
});

module.exports = {
  createSafeZoneSchema,
  updateSafeZoneSchema,
  createDangerZoneSchema,
  updateDangerZoneSchema,
  listZonesSchema,
};
