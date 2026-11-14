/**
 * Reusable Zod building blocks (Zod 4).
 */
const { z } = require('zod');

/** A 24-character hex MongoDB ObjectId. */
const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');

/** Route params carrying a single `:id`. */
const idParam = z.object({ id: objectId });

/** Route params carrying a `:patientId`. */
const patientIdParam = z.object({ patientId: objectId });

/** Patient tracking code: 12 chars from the unambiguous alphabet. */
const trackingCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8,16}$/, 'Invalid tracking code format');

/** Latitude in decimal degrees. */
const latitude = z.coerce
  .number()
  .min(-90, 'Latitude must be between -90 and 90')
  .max(90, 'Latitude must be between -90 and 90');

/** Longitude in decimal degrees. */
const longitude = z.coerce
  .number()
  .min(-180, 'Longitude must be between -180 and 180')
  .max(180, 'Longitude must be between -180 and 180');

/** Zone radius in metres. */
const radius = z.coerce
  .number()
  .min(10, 'Radius must be at least 10 metres')
  .max(20000, 'Radius must be at most 20,000 metres');

/**
 * Standard pagination + sort query.
 * `limit` is capped so a client cannot request an unbounded page.
 */
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().trim().optional(),
  search: z.string().trim().max(120).optional(),
});

/** ISO date string accepted from query parameters. */
const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Must be a valid date');

module.exports = {
  objectId,
  idParam,
  patientIdParam,
  trackingCode,
  latitude,
  longitude,
  radius,
  pagination,
  isoDate,
};
