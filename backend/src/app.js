/**
 * Express application assembly.
 *
 * Exported without starting a listener so tests (and server.js) can decide how
 * to run it.
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { apiLimiter } = require('./middleware/rateLimit.middleware');
const env = require('./config/env');
const logger = require('./utils/logger');

const app = express();

/**
 * Render (and most PaaS hosts) terminate TLS at a proxy, so `req.ip` is only
 * correct once Express is told to trust the forwarding headers. Rate limiting
 * depends on this being right.
 */
app.set('trust proxy', env.TRUST_PROXY);

// Remove the framework fingerprint.
app.disable('x-powered-by');

// ------------------------------------------------------------------- security

app.use(
  helmet({
    // The API serves JSON only, so a restrictive CSP costs nothing here.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // Allows the separately-hosted frontend to read responses.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

/**
 * CORS.
 *
 * The frontend is deployed on a different origin (Vercel) from the API
 * (Render), so the allowed origins are explicit rather than a wildcard — a
 * wildcard would also forbid credentialed requests.
 */
const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser clients (curl, health checks) which send no Origin.
    if (!origin) return callback(null, true);

    if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);

    // Any Vercel preview deployment of this project is also allowed, so
    // branch previews work without re-configuring the backend.
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return callback(null, true);

    logger.warn(`Blocked CORS request from origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tracking-Code'],
  maxAge: 86400,
};

app.use(cors(corsOptions));

// -------------------------------------------------------------------- parsing

// 256 kB is ample for a 500-fix offline batch and bounds memory use per request.
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(compression());

// -------------------------------------------------------------------- logging

if (!env.isTest) {
  app.use(
    morgan(env.isProduction ? 'combined' : 'dev', {
      // Health checks fire constantly and would drown out real traffic.
      skip: (req) => req.path === '/api/health',
      stream: { write: (message) => logger.debug(message.trim()) },
    })
  );
}

// --------------------------------------------------------------------- routes

app.get('/', (_req, res) =>
  res.json({
    success: true,
    data: {
      name: 'Dementia Care Monitoring and Intelligent Geofencing System API',
      version: '1.0.0',
      documentation: '/api/health for status; see docs/API.md for endpoints',
    },
  })
);

app.use('/api', apiLimiter, apiRoutes);

// ---------------------------------------------------------------------- errors

// Express 5 uses path-to-regexp v8, where a bare '*' is no longer a valid
// path pattern. A path-less `use` is the portable way to catch everything.
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
