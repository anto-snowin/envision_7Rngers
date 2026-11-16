/**
 * Identifier generation.
 */
const crypto = require('crypto');

// Excludes look-alike characters (0/O, 1/I) so a code can be read aloud or
// typed from a printed card without ambiguity.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a patient's login code, e.g. `PT-7KQ3-M9XB`.
 *
 * This is a username, not a secret — the patient also has a password — so the
 * eight random characters here exist to avoid collisions and to be legible to
 * someone with poor eyesight, not to resist guessing.
 */
function generatePatientCode() {
  const bytes = crypto.randomBytes(8);
  let body = '';
  for (let i = 0; i < 8; i += 1) {
    body += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `PT-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * Generate a readable temporary password for a newly created patient.
 *
 * The caretaker has to read this out to the person who will type it into the
 * phone, so it avoids ambiguous glyphs for the same reason the code does.
 */
function generateTempPassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
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

module.exports = { generatePatientCode, generateTempPassword, randomId, safeEqual };
