/**
 * Caretaker authentication schemas.
 */
const { z } = require('zod');

/**
 * Password policy: long enough to resist guessing, with a mix of character
 * classes. Kept deliberately readable so the frontend can mirror the same rules
 * and show the user exactly what is missing.
 */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email,
  password,
  phone: z.string().trim().max(32).optional().default(''),
  organisation: z.string().trim().max(120).optional().default(''),
});

const loginSchema = z.object({
  email,
  // Login does not re-apply the strength policy: an existing account may
  // predate it, and rejecting a correct password would be a lockout.
  password: z.string().min(1, 'Password is required'),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(32).optional(),
  organisation: z.string().trim().max(120).optional(),
  preferences: z
    .object({
      theme: z.enum(['light', 'dark', 'system']).optional(),
      alertSound: z.boolean().optional(),
      emailAlerts: z.boolean().optional(),
    })
    .optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password,
});

module.exports = {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  password,
  email,
};
