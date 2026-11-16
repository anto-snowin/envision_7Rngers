/**
 * Request schemas for the authentication routes.
 */
const { z } = require('zod');
const { password, objectId } = require('./common.validator');

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'))
  .pipe(z.string().max(160));

const caretakerRegisterSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email,
  password,
  phone: z.string().trim().max(32).optional(),
});

const caretakerLoginSchema = z.object({
  email,
  // No policy check on login: the stored password predates any policy change,
  // and rejecting it here would lock the account out of its own sign-in form.
  password: z.string().min(1, 'Enter your password').max(128),
});

const patientLoginSchema = z.object({
  /**
   * One field for three accepted identifiers — patient code, email or phone.
   * Asking the patient to pick which one they are typing would be one decision
   * too many on a screen designed to be used by someone with dementia.
   */
  identifier: z.string().trim().min(3, 'Enter your patient code').max(160),
  password: z.string().min(1, 'Enter your password').max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(128),
  newPassword: password,
});

const sessionIdParam = z.object({
  sessionId: z.string().trim().regex(/^[0-9a-f]{24,64}$/, 'Invalid session id'),
});

module.exports = {
  caretakerRegisterSchema,
  caretakerLoginSchema,
  patientLoginSchema,
  changePasswordSchema,
  sessionIdParam,
  objectId,
};
