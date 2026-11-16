/**
 * Rate limiters (express-rate-limit v8).
 *
 * Three tiers, because the endpoints have very different traffic shapes:
 *  - `apiLimiter`      general protection for the dashboard API
 *  - `authLimiter`     strict, to blunt credential stuffing on login/register
 *  - `ingestLimiter`   per-patient, sized for a 3-minute cadence plus backlog
 */
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/** Shared 429 response, matching the API's error envelope. */
function limitHandler(_req, res) {
  res.status(429).json({
    success: false,
    error: {
      message: 'Too many requests. Please slow down and try again shortly.',
      status: 429,
    },
  });
}

const baseOptions = {
  standardHeaders: 'draft-8', // RateLimit / RateLimit-Policy headers
  legacyHeaders: false,
  handler: limitHandler,
};

/** General API limiter. */
const apiLimiter = rateLimit({
  ...baseOptions,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
});

/** Login / register: few attempts per window, counted per IP. */
const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true, // only failed attempts count toward the cap
});

/**
 * Location ingest limiter, keyed per authenticated patient rather than per IP
 * so several patients behind one mobile carrier NAT do not starve each other.
 *
 * Budget: the cadence is one upload every three minutes, so 30 per minute is
 * already sixty times the steady-state rate. The headroom covers a device
 * flushing an offline backlog in several batches and a user reloading the page
 * repeatedly, while still capping a runaway client.
 */
const ingestLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => {
    // `requirePatient` has already run on these routes, so the patient id is
    // authenticated — it cannot be spoofed to borrow another patient's budget.
    if (req.patient?._id) return `patient:${req.patient._id}`;

    // Fall back to the library's IPv6-safe IP key helper, which normalises an
    // IPv6 address to its /56 subnet so a single client cannot rotate
    // addresses within its prefix to reset the counter.
    return rateLimit.ipKeyGenerator(req.ip);
  },
});

module.exports = { apiLimiter, authLimiter, ingestLimiter };
