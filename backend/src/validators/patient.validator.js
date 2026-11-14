/**
 * Patient CRUD schemas.
 */
const { z } = require('zod');
const { latitude, longitude, pagination } = require('./common.validator');

const emergencyContact = z.object({
  name: z.string().trim().max(80).optional().default(''),
  relationship: z.string().trim().max(60).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
  altPhone: z.string().trim().max(32).optional().default(''),
});

const homeLocation = z.object({
  label: z.string().trim().max(60).optional().default('Home'),
  address: z.string().trim().max(300).optional().default(''),
  latitude: latitude.nullable().optional(),
  longitude: longitude.nullable().optional(),
});

const createPatientSchema = z.object({
  name: z.string().trim().min(2, 'Patient name is required').max(80),
  age: z.coerce.number().int().min(0).max(130).nullable().optional(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']).optional().default('unspecified'),
  conditionStage: z
    .enum(['early', 'moderate', 'advanced', 'unspecified'])
    .optional()
    .default('unspecified'),
  photoUrl: z.string().trim().max(500).optional().default(''),
  medicalNotes: z.string().trim().max(4000).optional().default(''),
  emergencyContact: emergencyContact.optional(),
  homeLocation: homeLocation.optional(),
  /**
   * Convenience: when a home location and this radius are both supplied, the
   * controller creates the matching safe-zone geofence in the same request so
   * the caretaker does not have to visit a second screen.
   */
  safeZoneRadius: z.coerce.number().min(20).max(20000).optional(),
});

/** Every field optional on update; `.partial()` keeps the rules identical. */
const updatePatientSchema = createPatientSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/** List query: pagination plus dashboard-specific filters. */
const listPatientsSchema = pagination.extend({
  status: z.enum(['all', 'online', 'offline']).optional().default('all'),
  zone: z
    .enum(['all', 'inside_safe', 'outside_safe', 'in_danger', 'unknown'])
    .optional()
    .default('all'),
});

module.exports = {
  createPatientSchema,
  updatePatientSchema,
  listPatientsSchema,
  emergencyContact,
  homeLocation,
};
