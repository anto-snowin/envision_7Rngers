/**
 * Safe-zone and danger-zone management.
 *
 * The two kinds are handled by one set of handlers parameterised by `kind`,
 * because the operations really are identical — a circle on a patient, created,
 * listed, edited, deleted. Duplicating them would mean fixing every ownership
 * bug twice.
 */
const { Patient, SafeZone, DangerZone } = require('../models');
const { zoneToPublic } = require('../models/zoneSchema');
const { SOCKET_EVENTS, ZONE_KINDS } = require('../utils/constants');
const emitter = require('../sockets/emitter');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');

/** Resolve the model for a route's `kind`. */
function modelFor(kind) {
  if (kind === ZONE_KINDS.SAFE) return SafeZone;
  if (kind === ZONE_KINDS.DANGER) return DangerZone;
  throw ApiError.badRequest('Unknown zone kind');
}

/**
 * Confirm the signed-in caretaker owns the patient a zone is being attached to.
 *
 * Without this check, a caretaker could create a zone on someone else's patient
 * by passing their id — and then receive that patient's breach alerts.
 */
async function assertOwnsPatient(caretakerId, patientId) {
  const patient = await Patient.findOne({ _id: patientId, caretaker: caretakerId }).select(
    '_id name'
  );
  if (!patient) throw ApiError.notFound('Patient not found');
  return patient;
}

/** Tell the dashboard a patient's zones changed so the map can redraw. */
function broadcastZoneChange(caretakerId, patientId, kind, action) {
  emitter.emitToCaretaker(caretakerId, SOCKET_EVENTS.ZONES_CHANGED, {
    patientId: String(patientId),
    kind,
    action,
  });
}

/**
 * GET /api/zones/:kind
 *
 * `patientId` narrows the list to one patient; without it the caretaker gets
 * every zone they own, which is what the zone-management page loads.
 */
function listZones(kind) {
  return asyncHandler(async (req, res) => {
    const Model = modelFor(kind);
    const query = { caretaker: req.caretaker._id };

    if (req.query.patientId) {
      await assertOwnsPatient(req.caretaker._id, req.query.patientId);
      query.patient = req.query.patientId;
    }

    const zones = await Model.find(query).sort({ createdAt: 1 }).lean();
    return ok(
      res,
      zones.map((zone) => zoneToPublic(zone, kind))
    );
  });
}

/** POST /api/zones/:kind */
function createZone(kind) {
  return asyncHandler(async (req, res) => {
    const Model = modelFor(kind);
    const { patientId, ...fields } = req.body;

    await assertOwnsPatient(req.caretaker._id, patientId);

    const zone = await Model.create({
      ...fields,
      patient: patientId,
      caretaker: req.caretaker._id,
    });

    broadcastZoneChange(req.caretaker._id, patientId, kind, 'created');
    return created(res, zoneToPublic(zone, kind));
  });
}

/**
 * PUT /api/zones/:kind/:id
 *
 * The update is scoped by caretaker in the query itself, so a mismatched id
 * simply finds nothing rather than relying on a separate check to reject it.
 */
function updateZone(kind) {
  return asyncHandler(async (req, res) => {
    const Model = modelFor(kind);

    const zone = await Model.findOne({ _id: req.params.id, caretaker: req.caretaker._id });
    if (!zone) throw ApiError.notFound('Zone not found');

    const editable = [
      'name',
      'description',
      'latitude',
      'longitude',
      'radius',
      'isActive',
      'category',
      'severity',
      'address',
      'isPrimary',
    ];
    for (const key of editable) {
      if (req.body[key] !== undefined && zone.schema.path(key)) {
        zone[key] = req.body[key];
      }
    }

    await zone.save();

    broadcastZoneChange(req.caretaker._id, zone.patient, kind, 'updated');
    return ok(res, zoneToPublic(zone, kind));
  });
}

/** DELETE /api/zones/:kind/:id */
function deleteZone(kind) {
  return asyncHandler(async (req, res) => {
    const Model = modelFor(kind);

    const zone = await Model.findOneAndDelete({
      _id: req.params.id,
      caretaker: req.caretaker._id,
    });
    if (!zone) throw ApiError.notFound('Zone not found');

    broadcastZoneChange(req.caretaker._id, zone.patient, kind, 'deleted');
    return ok(res, null);
  });
}

/**
 * GET /api/zones/patient/:patientId
 *
 * Both kinds together, for the live map.
 */
const zonesForPatient = asyncHandler(async (req, res) => {
  const patientId = req.targetPatient._id;

  const [safe, danger] = await Promise.all([
    SafeZone.find({ patient: patientId }).sort({ createdAt: 1 }).lean(),
    DangerZone.find({ patient: patientId }).sort({ createdAt: 1 }).lean(),
  ]);

  return ok(res, {
    safe: safe.map((zone) => zoneToPublic(zone, ZONE_KINDS.SAFE)),
    danger: danger.map((zone) => zoneToPublic(zone, ZONE_KINDS.DANGER)),
  });
});

module.exports = {
  listSafeZones: listZones(ZONE_KINDS.SAFE),
  createSafeZone: createZone(ZONE_KINDS.SAFE),
  updateSafeZone: updateZone(ZONE_KINDS.SAFE),
  deleteSafeZone: deleteZone(ZONE_KINDS.SAFE),

  listDangerZones: listZones(ZONE_KINDS.DANGER),
  createDangerZone: createZone(ZONE_KINDS.DANGER),
  updateDangerZone: updateZone(ZONE_KINDS.DANGER),
  deleteDangerZone: deleteZone(ZONE_KINDS.DANGER),

  zonesForPatient,
};
