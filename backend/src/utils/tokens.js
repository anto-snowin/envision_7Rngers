/**
 * Opaque identifier generation.
 *
 * Patients do not log in. Instead each patient gets an unguessable tracking
 * code which forms their personal tracking URL (`/track/<code>`). The code is
 * the only credential the patient's phone presents, so it must be random
 * rather than sequential.
 */
const crypto = require('crypto');

// Excludes look-alike characters (0/O, 1/I) so a code can be read aloud.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a human-readable, URL-safe tracking code.
 * 12 characters from a 32-symbol alphabet is about 60 bits of entropy.
 */
function generateTrackingCode(length = 12) {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/** Random hex string, used for session identifiers. */
function randomId(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Constant-time string comparison to avoid timing oracles on code lookup. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a == null ? '' : a));
  const bufB = Buffer.from(String(b == null ? '' : b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { generateTrackingCode, randomId, safeEqual };
