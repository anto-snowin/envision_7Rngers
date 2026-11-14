/**
 * Dashboard statistics and analytics endpoints.
 */
const { Patient } = require('../models');
const { ok } = require('../utils/response');
const analyticsService = require('../services/analytics.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/analytics/dashboard
 * The stat row at the top of the dashboard.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const stats = await analyticsService.getDashboardStats(req.user._id);
  return ok(res, stats);
});

/**
 * GET /api/analytics/overview?days=7&patient=<id>
 * Every chart on the analytics page in one request.
 */
const getOverview = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
  const patientId = req.query.patient || null;

  // Scope check: an analytics query naming a patient must name one of ours.
  if (patientId) {
    const owned = await Patient.countDocuments({ _id: patientId, caretaker: req.user._id });
    if (!owned) throw ApiError.notFound('Patient not found');
  }

  const overview = await analyticsService.getAnalyticsOverview({
    caretakerId: req.user._id,
    patientId,
    days,
  });

  return ok(res, overview);
});

/**
 * GET /api/analytics/movement?days=7
 */
const getMovement = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);

  const series = await analyticsService.getMovementSeries({
    caretakerId: req.user._id,
    patientId: req.query.patient || null,
    days,
  });

  return ok(res, { series });
});

/**
 * GET /api/analytics/alerts?days=7
 */
const getAlertTrends = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);

  const data = await analyticsService.getAlertSeries({
    caretakerId: req.user._id,
    patientId: req.query.patient || null,
    days,
  });

  return ok(res, data);
});

module.exports = { getDashboard, getOverview, getMovement, getAlertTrends };
