/**
 * Request schemas for the location endpoints.
 */
const { z } = require('zod');
const { latitude, longitude, isoDate } = require('./common.validator');
const { DEVICE_REPORTABLE_ALERTS } = require('../utils/constants');

/** A nullable number that tolerates the nulls a browser actually sends. */
const optionalNumber = z.coerce.number().finite().nullable().optional();

const fixSchema = z.object({
  latitude,
  longitude,
  accuracy: optionalNumber,
  altitude: optionalNumber,
  speed: optionalNumber,
  heading: optionalNumber,
  batteryLevel: z.coerce.number().min(0).max(100).nullable().optional(),
  isCharging: z.boolean().nullable().optional(),
  recordedAt: z.union([isoDate, z.number()]).optional(),
  /** Set by the device when the fix came out of its offline queue. */
  queued: z.boolean().optional(),
  isQueued: z.boolean().optional(),
});

/**
 * POST /api/location/update
 *
 * The cap of 200 fixes per request bounds both the body size and the work one
 * request can trigger: each fix runs the full geofence evaluation, so an
 * unbounded batch would be an easy way to tie up the event loop.
 */
const updateLocationSchema = z.object({
  fixes: z.array(fixSchema).min(1, 'At least one location fix is required').max(200),
  connection: z.enum(['online', 'queued']).optional(),
});

const pingSchema = z.object({
  online: z.boolean().optional(),
  batteryLevel: z.coerce.number().min(0).max(100).nullable().optional(),
  isCharging: z.boolean().nullable().optional(),
});

const sosSchema = z.object({
  // All optional: an SOS must succeed even when the device has no fix at all.
  latitude: latitude.nullable().optional(),
  longitude: longitude.nullable().optional(),
  accuracy: optionalNumber,
});

const deviceEventSchema = z.object({
  type: z.enum(DEVICE_REPORTABLE_ALERTS),
  message: z.string().trim().max(400).optional(),
});

const historyQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(2000),
});

module.exports = {
  fixSchema,
  updateLocationSchema,
  pingSchema,
  sosSchema,
  deviceEventSchema,
  historyQuerySchema,
};
