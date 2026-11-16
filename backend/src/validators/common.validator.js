/**
 * Reusable Zod building blocks (Zod 4).
 */
const { z } = require('zod');

/** A 24-character hex MongoDB ObjectId. */
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');

/** Route params carrying a single `:id`. */
const idParam = z.object({ id: objectId });

/** Route params carrying a `:patientId`. */
const patientIdParam = z.object({ patientId: objectId });

/** Patient login code, e.g. `PT-7KQ3-M9XB`. */
const patientCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^PT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/, 'Invalid patient code format');

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
 * Password policy.
 *
 * Length is the requirement that actually matters, so it carries the weight
 * here rather than a character-class rule that mostly teaches people to append
 * "!1". Eight is the floor; the one digit requirement is kept because it is
 * what the sign-up form promises.
 */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[0-9]/, 'Password must contain at least one number');

/**
 * Standard pagination query.
 * `limit` is capped so a client cannot request an unbounded page.
 */
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** ISO date string accepted from query parameters. */
const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Must be a valid date');

/** Query flags arrive as the strings "true"/"false". */
const booleanFlag = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

module.exports = {
  objectId,
  idParam,
  patientIdParam,
  patientCode,
  latitude,
  longitude,
  radius,
  password,
  pagination,
  isoDate,
  booleanFlag,
};
