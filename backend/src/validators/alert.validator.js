/**
 * Alert listing and mutation schemas.
 */
const { z } = require('zod');
const { objectId, pagination, isoDate } = require('./common.validator');
const { ALERT_TYPES, SEVERITY } = require('../utils/constants');

/** GET /api/alerts — filterable, paginated feed. */
const listAlertsSchema = pagination.extend({
  type: z
    .enum(['all', ...Object.values(ALERT_TYPES)])
    .optional()
    .default('all'),
  severity: z
    .enum(['all', ...Object.values(SEVERITY)])
    .optional()
    .default('all'),
  patient: objectId.optional(),
  status: z.enum(['all', 'unread', 'read', 'resolved', 'unresolved']).optional().default('all'),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/**
 * POST /api/alerts — manual alert creation by a caretaker.
 *
 * The engine raises alerts on its own; this endpoint exists so a caretaker can
 * log something they observed themselves (for example a neighbour phoning to
 * say the patient was seen near the canal).
 */
const createAlertSchema = z.object({
  patient: objectId,
  type: z.enum(Object.values(ALERT_TYPES)),
  message: z.string().trim().max(500).optional().default(''),
  severity: z.enum(Object.values(SEVERITY)).optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

const resolveAlertSchema = z.object({
  resolutionNote: z.string().trim().max(500).optional().default(''),
});

module.exports = { listAlertsSchema, createAlertSchema, resolveAlertSchema };
