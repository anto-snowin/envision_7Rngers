/**
 * Location ingest and history schemas.
 */
const { z } = require('zod');
const { latitude, longitude, trackingCode, isoDate } = require('./common.validator');

/** One GPS fix as the patient portal reports it. */
const fixSchema = z.object({
  latitude,
  longitude,
  accuracy: z.coerce.number().min(0).max(100000).nullable().optional(),
  altitude: z.coerce.number().nullable().optional(),
  speed: z.coerce.number().min(0).nullable().optional(),
  heading: z.coerce.number().min(0).max(360).nullable().optional(),
  batteryLevel: z.coerce.number().min(0).max(100).nullable().optional(),
  isCharging: z.boolean().nullable().optional(),
  isQueued: z.boolean().optional().default(false),
  recordedAt: z.union([isoDate, z.coerce.number()]).optional(),
});

/** POST /api/location — a single live fix. */
const createLocationSchema = fixSchema.extend({
  trackingCode,
  sessionId: z.string().trim().max(64).optional(),
});

/**
 * POST /api/location/batch — a backlog flushed after an outage.
 * Capped at 500 fixes per request (over 40 minutes of 5-second tracking) so one
 * upload cannot monopolise the server.
 */
const batchLocationSchema = z.object({
  trackingCode,
  sessionId: z.string().trim().max(64).optional(),
  fixes: z
    .array(fixSchema)
    .min(1, 'At least one fix is required')
    .max(500, 'Send at most 500 fixes per request'),
});

/** GET /api/location/history/:patientId */
const historyQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(2000),
});

/**
 * POST /api/location/device-event — GPS or connectivity problems reported by
 * the patient's browser, which the server cannot otherwise observe.
 */
const deviceEventSchema = z.object({
  trackingCode,
  type: z.enum(['GPS_UNAVAILABLE', 'INTERNET_DISCONNECTED', 'INTERNET_RESTORED', 'TRACKING_STOPPED']),
  message: z.string().trim().max(300).optional().default(''),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

/** POST /api/location/sos */
const sosSchema = z.object({
  trackingCode,
  latitude: latitude.nullable().optional(),
  longitude: longitude.nullable().optional(),
  accuracy: z.coerce.number().min(0).nullable().optional(),
  batteryLevel: z.coerce.number().min(0).max(100).nullable().optional(),
  message: z.string().trim().max(300).optional().default(''),
});

module.exports = {
  fixSchema,
  createLocationSchema,
  batchLocationSchema,
  historyQuerySchema,
  deviceEventSchema,
  sosSchema,
};
