/**
 * Request schemas for patient management.
 */
const { z } = require('zod');
const { password } = require('./common.validator');

/** Blank optional strings are normalised to undefined, not stored as "". */
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

const optionalEmail = z
  .union([z.literal(''), z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'))])
  .optional()
  .transform((value) => (value === '' ? null : value));

const patientFields = {
  email: optionalEmail,
  phone: optionalText(32),
  age: z.coerce.number().int().min(0).max(130).nullable().optional(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']).optional(),
  emergencyContactName: optionalText(80),
  emergencyContactPhone: optionalText(32),
  emergencyContactRelationship: optionalText(40),
  medicalNotes: optionalText(4000),
  isActive: z.boolean().optional(),
};

const createPatientSchema = z.object({
  name: z.string().trim().min(2, "Enter the patient's name").max(80),
  /**
   * Optional: when the caretaker does not choose one, the server generates a
   * readable temporary password and returns it once.
   */
  password: password.optional(),
  ...patientFields,
});

const updatePatientSchema = z.object({
  name: z.string().trim().min(2, "Enter the patient's name").max(80).optional(),
  ...patientFields,
});

const resetPasswordSchema = z.object({
  password: password.optional(),
});

const listPatientsSchema = z.object({
  search: z.string().trim().max(120).optional(),
});

module.exports = {
  createPatientSchema,
  updatePatientSchema,
  resetPasswordSchema,
  listPatientsSchema,
};
