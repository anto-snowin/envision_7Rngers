/**
 * Alert feed and acknowledgement.
 */
const { Alert, Patient } = require('../models');
const alertService = require('../services/alert.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, paginationMeta } = require('../utils/response');

/**
 * Build the Mongo query from the filter query string.
 * Every query is scoped to the signed-in caretaker.
 */
function buildQuery(caretakerId, filters) {
  const query = { caretaker: caretakerId };

  if (filters.patientId) query.patient = filters.patientId;
  if (filters.type) query.type = filters.type;
  if (filters.severity) query.severity = filters.severity;
  if (filters.unreadOnly) query.isRead = false;
  if (filters.unresolvedOnly) query.isResolved = false;

  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = new Date(filters.from);
    if (filters.to) query.createdAt.$lte = new Date(filters.to);
  }

  return query;
}

/**
 * GET /api/alerts
 *
 * The whole feed across every patient, paginated and filterable.
 */
const listAlerts = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;

  if (filters.patientId) {
    const owned = await Patient.countDocuments({
      _id: filters.patientId,
      caretaker: req.caretaker._id,
    });
    if (!owned) throw ApiError.notFound('Patient not found');
  }

  const query = buildQuery(req.caretaker._id, filters);

  const [alerts, total] = await Promise.all([
    Alert.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('patient', 'name')
      .lean(),
    Alert.countDocuments(query),
  ]);

  return ok(
    res,
    alerts.map((alert) => Alert.toPublic(alert)),
    paginationMeta({ page, limit, total })
  );
});

/**
 * GET /api/alerts/:patientId
 *
 * One patient's alerts. Ownership is enforced by `requirePatientOwnership`.
 */
const listPatientAlerts = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const query = { patient: req.targetPatient._id, caretaker: req.caretaker._id };

  const [alerts, total] = await Promise.all([
    Alert.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Alert.countDocuments(query),
  ]);

  return ok(
    res,
    alerts.map((alert) => Alert.toPublic(alert, req.targetPatient.name)),
    paginationMeta({ page, limit, total })
  );
});

/** PUT /api/alerts/:id/read */
const markRead = asyncHandler(async (req, res) => {
  const alert = await alertService.markRead(req.params.id, req.caretaker._id);
  if (!alert) throw ApiError.notFound('Alert not found');
  return ok(res, Alert.toPublic(alert));
});

/** PUT /api/alerts/:id/resolved */
const markResolved = asyncHandler(async (req, res) => {
  const alert = await alertService.resolveAlert(
    req.params.id,
    req.caretaker._id,
    req.body?.resolutionNote || ''
  );
  if (!alert) throw ApiError.notFound('Alert not found');
  return ok(res, Alert.toPublic(alert));
});

/** PUT /api/alerts/read-all */
const markAllRead = asyncHandler(async (req, res) => {
  const patientId = req.body?.patientId || null;

  if (patientId) {
    const owned = await Patient.countDocuments({ _id: patientId, caretaker: req.caretaker._id });
    if (!owned) throw ApiError.notFound('Patient not found');
  }

  const updated = await alertService.markAllRead(req.caretaker._id, patientId);
  return ok(res, { updated });
});

module.exports = { listAlerts, listPatientAlerts, markRead, markResolved, markAllRead };
