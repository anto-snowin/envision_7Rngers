/**
 * Dashboard summary endpoint.
 */
const dashboardService = require('../services/dashboard.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

/** GET /api/dashboard/summary */
const getSummary = asyncHandler(async (req, res) =>
  ok(res, await dashboardService.getSummary(req.caretaker._id))
);

module.exports = { getSummary };
