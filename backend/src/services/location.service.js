/**
 * Location ingest pipeline.
 *
 * Every GPS fix — live or replayed from the phone's offline queue — enters the
 * system through `ingestFix` / `ingestBatch`. The pipeline is:
 *
 *   validate -> evaluate zones -> persist fix -> refresh cached live status
 *            -> broadcast over Socket.IO
 *
 * Fixes are evaluated in chronological order, which is what makes zone
 * transition detection correct even when a backlog arrives all at once after
 * the patient's phone regains connectivity.
 */
const { Location, Patient } = require('../models');
const { isValidCoordinate } = require('../utils/geo');
const { SOCKET_EVENTS, ZONE_STATE } = require('../utils/constants');
const geofenceService = require('./geofence.service');
const emitter = require('../sockets/emitter');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Normalise a raw client payload into the fields the Location model expects.
 * Anything unparseable becomes null rather than NaN.
 */
function normaliseFix(raw) {
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const recordedAt = raw.recordedAt || raw.timestamp;
  const parsedDate = recordedAt ? new Date(recordedAt) : new Date();

  return {
    latitude: num(raw.latitude ?? raw.lat),
    longitude: num(raw.longitude ?? raw.lng ?? raw.lon),
    accuracy: num(raw.accuracy),
    altitude: num(raw.altitude),
    speed: num(raw.speed),
    heading: num(raw.heading),
    batteryLevel: num(raw.batteryLevel),
    isCharging: typeof raw.isCharging === 'boolean' ? raw.isCharging : null,
    isQueued: Boolean(raw.isQueued),
    // Guard against a device clock that is wildly wrong or unparseable.
    recordedAt: Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
  };
}

/**
 * Ingest a single fix for a patient.
 *
 * @param {object} patient Patient document (will be saved with fresh liveStatus)
 * @param {object} rawFix  payload from the patient portal
 * @returns {Promise<{location:object, evaluation:object}>}
 */
async function ingestFix(patient, rawFix) {
  const fix = normaliseFix(rawFix);

  if (!isValidCoordinate(fix)) {
    throw ApiError.badRequest('A valid latitude and longitude are required');
  }

  // 1. Work out where this fix sits relative to the patient's zones, raising
  //    alerts for any state transition it represents.
  const evaluation = await geofenceService.evaluateFix({
    patient,
    point: fix,
    recordedAt: fix.recordedAt,
  });

  // 2. Persist the fix itself.
  const location = await Location.create({
    patient: patient._id,
    caretaker: patient.caretaker,
    ...fix,
    zoneState: evaluation.zoneState,
    isInsideSafeZone: evaluation.isInsideSafeZone,
    distanceFromHome: evaluation.distanceFromHome,
    dangerZones: evaluation.dangerZoneIds,
    receivedAt: new Date(),
  });

  // 3. Refresh the denormalised snapshot the dashboard reads.
  //
  // Battery is "last known" rather than "last reported": the Battery Status
  // API is unavailable in Firefox and Safari, and queued fixes may predate a
  // reading, so a fix without a battery level must not erase the level we
  // already had. Position fields always come from the current fix.
  const previousStatus = patient.liveStatus || {};
  const batteryLevel = Number.isFinite(fix.batteryLevel)
    ? fix.batteryLevel
    : (previousStatus.batteryLevel ?? null);
  const isCharging =
    typeof fix.isCharging === 'boolean' ? fix.isCharging : (previousStatus.isCharging ?? null);

  patient.liveStatus = {
    isOnline: true,
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    speed: fix.speed,
    batteryLevel,
    isCharging,
    zoneState: evaluation.zoneState,
    activeDangerZones: evaluation.dangerZoneIds,
    distanceFromHome: evaluation.distanceFromHome,
    lastSeenAt: new Date(),
    lastFixAt: fix.recordedAt,
  };
  await patient.save();

  // 4. Tell the caretaker's dashboard (and anything watching this patient).
  const payload = {
    patientId: String(patient._id),
    patientName: patient.name,
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    speed: fix.speed,
    heading: fix.heading,
    batteryLevel,
    isCharging,
    zoneState: evaluation.zoneState,
    isInsideSafeZone: evaluation.isInsideSafeZone,
    distanceFromHome: evaluation.distanceFromHome,
    dangerZones: evaluation.dangerZoneIds,
    isQueued: fix.isQueued,
    recordedAt: fix.recordedAt,
    locationId: String(location._id),
  };

  emitter.emitPatientEvent(patient, SOCKET_EVENTS.LOCATION_UPDATE, payload);

  return { location, evaluation, payload };
}

/**
 * Ingest a batch of queued fixes uploaded after an internet outage.
 *
 * Fixes are sorted oldest-first so zone transitions replay in the order they
 * actually happened. One bad fix in the batch must not reject the rest, so each
 * is handled independently and failures are reported back per-item.
 *
 * @param {object} patient
 * @param {object[]} rawFixes
 */
async function ingestBatch(patient, rawFixes) {
  const sorted = [...rawFixes]
    .map((raw) => ({ raw, normalised: normaliseFix(raw) }))
    .filter((entry) => isValidCoordinate(entry.normalised))
    .sort((a, b) => a.normalised.recordedAt - b.normalised.recordedAt);

  const accepted = [];
  const rejected = [];

  for (const entry of sorted) {
    try {
      // Mark every fix in a batch as queued so the UI can distinguish
      // backfilled points from live ones on the map trail.
      const { location } = await ingestFix(patient, { ...entry.raw, isQueued: true });
      accepted.push(String(location._id));
    } catch (err) {
      logger.warn(`Rejected queued fix for patient ${patient._id}: ${err.message}`);
      rejected.push({ recordedAt: entry.normalised.recordedAt, reason: err.message });
    }
  }

  const skipped = rawFixes.length - sorted.length;

  return {
    received: rawFixes.length,
    accepted: accepted.length,
    rejected: rejected.length + skipped,
    acceptedIds: accepted,
    errors: rejected,
  };
}

/** The most recent fix for a patient. */
async function getLatestLocation(patientId) {
  return Location.findOne({ patient: patientId }).sort({ recordedAt: -1 }).lean();
}

/**
 * Location history for a patient within a time range.
 *
 * `limit` caps the number of points returned so a week of 5-second fixes
 * (~120k documents) cannot be pulled into the browser in one go.
 */
async function getHistory(patientId, { from, to, limit = 2000 } = {}) {
  const query = { patient: patientId };
  if (from || to) {
    query.recordedAt = {};
    if (from) query.recordedAt.$gte = new Date(from);
    if (to) query.recordedAt.$lte = new Date(to);
  }

  const points = await Location.find(query)
    .sort({ recordedAt: 1 })
    .limit(limit)
    .select(
      'latitude longitude accuracy speed zoneState isInsideSafeZone distanceFromHome isQueued recordedAt'
    )
    .lean();

  return points;
}

/** Mark a patient offline and broadcast the change. */
async function markOffline(patient, reason = 'timeout') {
  await Patient.updateOne(
    { _id: patient._id },
    {
      'liveStatus.isOnline': false,
      'liveStatus.zoneState': patient.liveStatus?.zoneState || ZONE_STATE.UNKNOWN,
    }
  );

  emitter.emitToCaretaker(patient.caretaker, SOCKET_EVENTS.PRESENCE_UPDATE, {
    patientId: String(patient._id),
    patientName: patient.name,
    isOnline: false,
    reason,
    lastSeenAt: patient.liveStatus?.lastSeenAt || null,
  });
}

module.exports = {
  normaliseFix,
  ingestFix,
  ingestBatch,
  getLatestLocation,
  getHistory,
  markOffline,
};
