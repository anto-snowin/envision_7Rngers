/**
 * Rate limiters (express-rate-limit v8).
 *
 * Three tiers, because the endpoints have very different traffic shapes:
 *  - `apiLimiter`      general protection for the dashboard API
 *  - `authLimiter`     strict, to blunt credential stuffing on login/register
 *  - `ingestLimiter`   generous, since every patient phone legitimately posts a
 *                      fix every 5 seconds and may flush a queued backlog
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
 * Location ingest limiter, keyed per tracking code rather than per IP so that
 * several patients behind one mobile carrier NAT do not starve each other.
 *
 * Budget: a 5-second cadence is 12 fixes/minute; 240/minute leaves ample room
 * for offline-queue flushes without allowing true abuse.
 */
const ingestLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 240,
  keyGenerator: (req) => {
    const code = req.body?.trackingCode || req.headers['x-tracking-code'];
    if (code) return `track:${String(code).toUpperCase()}`;
    // Fall back to the library's IPv6-safe IP key helper, which normalises an
    // IPv6 address to its /56 subnet so a single client cannot rotate
    // addresses within its prefix to reset the counter.
    return rateLimit.ipKeyGenerator(req.ip);
  },
});

module.exports = { apiLimiter, authLimiter, ingestLimiter };
