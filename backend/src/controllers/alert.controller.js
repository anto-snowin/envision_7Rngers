/**
 * Alert feed, filtering and acknowledgement.
 */
const { Alert, Patient } = require('../models');
const { ok, created, paginationMeta } = require('../utils/response');
const { SEVERITY } = require('../utils/constants');
const alertService = require('../services/alert.service');
const analyticsService = require('../services/analytics.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/alerts
 * The paginated, filterable alert feed.
 */
const listAlerts = asyncHandler(async (req, res) => {
  const { page, limit, type, severity, patient, status, from, to, sort } = req.query;

  const query = { caretaker: req.user._id };

  if (type !== 'all') query.type = type;
  if (severity !== 'all') query.severity = severity;
  if (patient) query.patient = patient;

  if (status === 'unread') query.isRead = false;
  else if (status === 'read') query.isRead = true;
  else if (status === 'resolved') query.isResolved = true;
  else if (status === 'unresolved') query.isResolved = false;

  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  const sortSpec = sort
    ? { [sort.replace(/^-/, '')]: sort.startsWith('-') ? -1 : 1 }
    : { createdAt: -1 };

  const [alerts, total, unreadCount] = await Promise.all([
    Alert.find(query)
      .sort(sortSpec)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('patient', 'name trackingCode liveStatus.batteryLevel')
      .populate('dangerZone', 'name category')
      .lean(),
    Alert.countDocuments(query),
    Alert.countDocuments({ caretaker: req.user._id, isRead: false }),
  ]);

  return ok(res, alerts, { ...paginationMeta({ page, limit, total }), unreadCount });
});

/**
 * GET /api/alerts/summary
 * Counts for the badge and the alerts page header tiles.
 */
const getAlertSummary = asyncHandler(async (req, res) => {
  const today = analyticsService.startOfToday();

  const [total, unread, unresolved, todayCount, critical, byType] = await Promise.all([
    Alert.countDocuments({ caretaker: req.user._id }),
    Alert.countDocuments({ caretaker: req.user._id, isRead: false }),
    Alert.countDocuments({ caretaker: req.user._id, isResolved: false }),
    Alert.countDocuments({ caretaker: req.user._id, createdAt: { $gte: today } }),
    Alert.countDocuments({
      caretaker: req.user._id,
      severity: SEVERITY.CRITICAL,
      isResolved: false,
    }),
    Alert.aggregate([
      { $match: { caretaker: req.user._id } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return ok(res, {
    total,
    unread,
    unresolved,
    today: todayCount,
    criticalUnresolved: critical,
    byType: byType.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {}),
  });
});

/**
 * GET /api/alerts/:id
 */
const getAlert = asyncHandler(async (req, res) => {
  const alert = await Alert.findOne({ _id: req.params.id, caretaker: req.user._id })
    .populate('patient', 'name age trackingCode emergencyContact homeLocation liveStatus')
    .populate('dangerZone')
    .populate('geofence')
    .lean();

  if (!alert) throw ApiError.notFound('Alert not found');
  return ok(res, { alert });
});

/**
 * POST /api/alerts
 * Manual alert logged by the caretaker.
 */
const createAlert = asyncHandler(async (req, res) => {
  const { patient: patientId, type, message, severity, latitude, longitude, metadata } = req.body;

  // Confirm ownership before writing an alert against this patient.
  const patient = await Patient.findOne({ _id: patientId, caretaker: req.user._id });
  if (!patient) throw ApiError.notFound('Patient not found');

  const alert = await alertService.createAlert({
    patient,
    type,
    message,
    severity,
    location:
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude, accuracy: null }
        : null,
    metadata: { ...metadata, source: 'manual', createdBy: String(req.user._id) },
    bypassCooldown: true, // a caretaker asked for this one explicitly
  });

  return created(res, { alert });
});

/**
 * PATCH /api/alerts/:id/read
 */
const markRead = asyncHandler(async (req, res) => {
  const alert = await alertService.markRead(req.params.id, req.user._id);
  if (!alert) throw ApiError.notFound('Alert not found');
  return ok(res, { alert: alert.toJSON() });
});

/**
 * PATCH /api/alerts/read-all
 */
const markAllRead = asyncHandler(async (req, res) => {
  const count = await alertService.markAllRead(req.user._id);
  return ok(res, { updated: count });
});

/**
 * PATCH /api/alerts/:id/resolve
 */
const resolveAlert = asyncHandler(async (req, res) => {
  const alert = await alertService.resolveAlert(
    req.params.id,
    req.user._id,
    req.body.resolutionNote
  );
  if (!alert) throw ApiError.notFound('Alert not found');
  return ok(res, { alert: alert.toJSON() });
});

/**
 * DELETE /api/alerts/:id
 */
const deleteAlert = asyncHandler(async (req, res) => {
  const result = await Alert.deleteOne({ _id: req.params.id, caretaker: req.user._id });
  if (!result.deletedCount) throw ApiError.notFound('Alert not found');
  return ok(res, { message: 'Alert deleted' });
});

module.exports = {
  listAlerts,
  getAlertSummary,
  getAlert,
  createAlert,
  markRead,
  markAllRead,
  resolveAlert,
  deleteAlert,
};
