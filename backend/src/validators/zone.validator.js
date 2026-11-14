/**
 * Geofence (safe zone) and danger zone schemas.
 */
const { z } = require('zod');
const { latitude, longitude, radius, objectId, pagination } = require('./common.validator');
const { DANGER_ZONE_CATEGORIES, SEVERITY } = require('../utils/constants');

// ------------------------------------------------------------------ geofences

const createGeofenceSchema = z.object({
  patient: objectId,
  name: z.string().trim().max(80).optional().default('Home safe zone'),
  latitude,
  longitude,
  // Safe zones have a higher floor than danger zones: anything under 20 m is
  // inside normal GPS error and would alert constantly.
  radius: z.coerce.number().min(20, 'Safe zone radius must be at least 20 metres').max(20000),
  address: z.string().trim().max(300).optional().default(''),
  isActive: z.boolean().optional().default(true),
});

const updateGeofenceSchema = z.object({
  name: z.string().trim().max(80).optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  radius: z.coerce.number().min(20).max(20000).optional(),
  address: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
});

const listGeofenceSchema = z.object({
  patient: objectId.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

// --------------------------------------------------------------- danger zones

const createDangerZoneSchema = z.object({
  name: z.string().trim().min(2, 'Danger zone name is required').max(80),
  category: z.enum(DANGER_ZONE_CATEGORIES).optional().default('other'),
  description: z.string().trim().max(1000).optional().default(''),
  latitude,
  longitude,
  radius,
  severity: z
    .enum([SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM])
    .optional()
    .default(SEVERITY.CRITICAL),
  /** Empty / omitted means the zone applies to every patient. */
  patients: z.array(objectId).optional().default([]),
  isActive: z.boolean().optional().default(true),
});

const updateDangerZoneSchema = createDangerZoneSchema.partial();

const listDangerZoneSchema = pagination.extend({
  category: z
    .enum(['all', ...DANGER_ZONE_CATEGORIES])
    .optional()
    .default('all'),
  patient: objectId.optional(),
});

module.exports = {
  createGeofenceSchema,
  updateGeofenceSchema,
  listGeofenceSchema,
  createDangerZoneSchema,
  updateDangerZoneSchema,
  listDangerZoneSchema,
};
