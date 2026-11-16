/**
 * API router. Mounted at `/api` by app.js.
 */
const express = require('express');
const mongoose = require('mongoose');

const authRoutes = require('./auth.routes');
const patientRoutes = require('./patient.routes');
const locationRoutes = require('./location.routes');
const alertRoutes = require('./alert.routes');
const zoneRoutes = require('./zone.routes');
const dashboardRoutes = require('./dashboard.routes');

const router = express.Router();

/**
 * GET /api/health
 *
 * Deployment health check. Render pings this to decide whether the instance is
 * live, so it reports database connectivity rather than just "the process is
 * running".
 */
router.get('/health', (_req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = states[mongoose.connection.readyState] || 'unknown';
  const healthy = mongoose.connection.readyState === 1;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'ok' : 'degraded',
      database: dbState,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

router.use('/auth', authRoutes);
router.use('/patients', patientRoutes);
router.use('/location', locationRoutes);
router.use('/alerts', alertRoutes);
router.use('/zones', zoneRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
