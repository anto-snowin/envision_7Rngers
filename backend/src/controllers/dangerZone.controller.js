/**
 * Danger zone management: railway tracks, rivers, construction sites and other
 * hazards the patient must not walk into.
 */
const { DangerZone, Patient } = require('../models');
const { ok, created, paginationMeta } = require('../utils/response');
const { SOCKET_EVENTS, DANGER_ZONE_CATEGORIES } = require('../utils/constants');
const emitter = require('../sockets/emitter');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/** Load a zone and assert ownership. */
async function findOwnedZone(id, caretakerId) {
  const zone = await DangerZone.findOne({ _id: id, caretaker: caretakerId });
  if (!zone) throw ApiError.notFound('Danger zone not found');
  return zone;
}

/**
 * Reject patient ids that do not belong to this caretaker, so a zone cannot be
 * silently scoped to someone else's patient.
 */
async function assertPatientsOwned(patientIds, caretakerId) {
  if (!patientIds || !patientIds.length) return;

  const count = await Patient.countDocuments({
    _id: { $in: patientIds },
    caretaker: caretakerId,
  });

  if (count !== patientIds.length) {
    throw ApiError.badRequest('One or more selected patients could not be found');
  }
}

/**
 * GET /api/danger-zone
 */
const listDangerZones = asyncHandler(async (req, res) => {
  const { page, limit, search, category, patient, sort } = req.query;

  const query = { caretaker: req.user._id };

  if (category && category !== 'all') query.category = category;
  if (patient) {
    // Zones that target this patient, plus the global ones that also apply.
    query.$or = [{ patients: patient }, { patients: { $size: 0 } }];
  }
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(safe, 'i');
    query.$and = [...(query.$and || []), { $or: [{ name: pattern }, { description: pattern }] }];
  }

  const sortSpec = sort
    ? { [sort.replace(/^-/, '')]: sort.startsWith('-') ? -1 : 1 }
    : { createdAt: -1 };

  const [zones, total] = await Promise.all([
    DangerZone.find(query)
      .sort(sortSpec)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('patients', 'name')
      .lean(),
    DangerZone.countDocuments(query),
  ]);

  return ok(res, zones, paginationMeta({ page, limit, total }));
});

/**
 * GET /api/danger-zone/categories
 * Preset categories for the create form.
 */
const listCategories = asyncHandler(async (_req, res) =>
  ok(res, {
    categories: DANGER_ZONE_CATEGORIES.map((value) => ({
      value,
      label: value
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
    })),
  })
);

/**
 * GET /api/danger-zone/:id
 */
const getDangerZone = asyncHandler(async (req, res) => {
  const zone = await DangerZone.findOne({ _id: req.params.id, caretaker: req.user._id })
    .populate('patients', 'name trackingCode')
    .lean();

  if (!zone) throw ApiError.notFound('Danger zone not found');
  return ok(res, { dangerZone: zone });
});

/**
 * POST /api/danger-zone
 */
const createDangerZone = asyncHandler(async (req, res) => {
  await assertPatientsOwned(req.body.patients, req.user._id);

  const zone = await DangerZone.create({ ...req.body, caretaker: req.user._id });

  emitter.emitToCaretaker(req.user._id, SOCKET_EVENTS.DANGER_ZONE_CHANGED, {
    action: 'created',
    dangerZone: zone.toJSON(),
  });

  return created(res, { dangerZone: zone.toJSON() });
});

/**
 * PUT /api/danger-zone/:id
 */
const updateDangerZone = asyncHandler(async (req, res) => {
  const zone = await findOwnedZone(req.params.id, req.user._id);

  if (req.body.patients) {
    await assertPatientsOwned(req.body.patients, req.user._id);
  }

  Object.entries(req.body).forEach(([key, value]) => {
    if (value !== undefined) zone[key] = value;
  });

  await zone.save();

  emitter.emitToCaretaker(req.user._id, SOCKET_EVENTS.DANGER_ZONE_CHANGED, {
    action: 'updated',
    dangerZone: zone.toJSON(),
  });

  return ok(res, { dangerZone: zone.toJSON() });
});

/**
 * DELETE /api/danger-zone/:id
 *
 * Patients currently standing inside the zone have its id cached in
 * `liveStatus.activeDangerZones`; that reference is cleared so the dashboard
 * does not keep showing a hazard that no longer exists.
 */
const deleteDangerZone = asyncHandler(async (req, res) => {
  const zone = await findOwnedZone(req.params.id, req.user._id);

  await DangerZone.deleteOne({ _id: zone._id });

  await Patient.updateMany(
    { caretaker: req.user._id, 'liveStatus.activeDangerZones': zone._id },
    { $pull: { 'liveStatus.activeDangerZones': zone._id } }
  );

  emitter.emitToCaretaker(req.user._id, SOCKET_EVENTS.DANGER_ZONE_CHANGED, {
    action: 'deleted',
    dangerZoneId: String(zone._id),
  });

  return ok(res, { message: 'Danger zone deleted' });
});

module.exports = {
  listDangerZones,
  listCategories,
  getDangerZone,
  createDangerZone,
  updateDangerZone,
  deleteDangerZone,
};
