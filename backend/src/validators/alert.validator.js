/**
 * Request schemas for the alert endpoints.
 */
const { z } = require('zod');
const { objectId, pagination, isoDate, booleanFlag } = require('./common.validator');
const { ALERT_TYPES, SEVERITY } = require('../utils/constants');

const listAlertsSchema = pagination.extend({
  patientId: objectId.optional(),
  type: z.enum(Object.values(ALERT_TYPES)).optional(),
  severity: z.enum(Object.values(SEVERITY)).optional(),
  unreadOnly: booleanFlag.optional(),
  unresolvedOnly: booleanFlag.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

const resolveAlertSchema = z.object({
  resolutionNote: z.string().trim().max(500).optional(),
});

const markAllReadSchema = z.object({
  patientId: objectId.nullable().optional(),
});

module.exports = { listAlertsSchema, resolveAlertSchema, markAllReadSchema, pagination };
