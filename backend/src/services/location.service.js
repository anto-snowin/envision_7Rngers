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
const sessionService = require('./session.service');
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
  const isUnparseable = Number.isNaN(parsedDate.getTime());

  /**
   * Guard against a device clock that is wrong or unparseable, and against a
   * fix dated in the future — a phone with a skewed clock would otherwise sort
   * ahead of every real fix and corrupt transition ordering for good.
   */
  const safeDate = isUnparseable || parsedDate.getTime() > Date.now() + 60_000
    ? new Date()
    : parsedDate;

  return {
    latitude: num(raw.latitude ?? raw.lat),
    longitude: num(raw.longitude ?? raw.lng ?? raw.lon),
    accuracy: num(raw.accuracy),
    altitude: num(raw.altitude),
    speed: num(raw.speed),
    heading: num(raw.heading),
    batteryLevel: num(raw.batteryLevel),
    isCharging: typeof raw.isCharging === 'boolean' ? raw.isCharging : null,
    isQueued: Boolean(raw.isQueued ?? raw.queued),
    recordedAt: safeDate,
  };
}

/**
 * Ingest a single fix for a patient.
 *
 * @param {object} patient Patient document (saved with fresh liveStatus)
 * @param {object} rawFix payload from the patient device
 * @param {{ trackingSessionId?: string }} [options]
 */
async function ingestFix(patient, rawFix, options = {}) {
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
    trackingSession: options.trackingSessionId || null,
    ...fix,
    zoneState: evaluation.zoneState,
    isInsideSafeZone: evaluation.isInsideSafeZone,
    distanceFromSafeZone: evaluation.distanceFromSafeZone,
    dangerZones: evaluation.dangerZoneIds,
    receivedAt: new Date(),
  });

  // 3. Refresh the denormalised snapshot the dashboard reads.
  //
  // Battery is "last known" rather than "last reported": the Battery Status
  // API is unavailable in Firefox and Safari, and queued fixes may predate a
  // reading, so a fix without a battery level must not erase the level already
  // held. Position fields always come from the current fix.
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
    dangerZoneName: evaluation.dangerZoneName,
    distanceFromSafeZone: evaluation.distanceFromSafeZone,
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
    insideSafeZone: evaluation.isInsideSafeZone,
    distanceFromSafeZone: evaluation.distanceFromSafeZone,
    dangerZone: evaluation.dangerZoneName,
    dangerZoneIds: evaluation.dangerZoneIds,
    isQueued: fix.isQueued,
    recordedAt: fix.recordedAt,
    locationId: String(location._id),
  };

  emitter.emitPatientEvent(patient, SOCKET_EVENTS.LOCATION_UPDATE, payload);

  return { location, evaluation, payload };
}

/**
 * Ingest a batch of fixes.
 *
 * The device always posts an array — one fix in the normal case, several when
 * draining an offline queue — so there is a single code path for both.
 *
 * Fixes are sorted oldest-first so zone transitions replay in the order they
 * actually happened. One bad fix must not reject the rest, so each is handled
 * independently and failures are reported back per item.
 *
 * @param {object} patient
 * @param {object[]} rawFixes
 * @param {{ trackingSessionId?: string }} [options]
 */
async function ingestBatch(patient, rawFixes, options = {}) {
  const sorted = [...rawFixes]
    .map((raw) => ({ raw, normalised: normaliseFix(raw) }))
    .filter((entry) => isValidCoordinate(entry.normalised))
    .sort((a, b) => a.normalised.recordedAt - b.normalised.recordedAt);

  const accepted = [];
  const rejected = [];
  let lastEvaluation = null;
  let queuedCount = 0;

  for (const entry of sorted) {
    try {
      const { location, evaluation } = await ingestFix(patient, entry.raw, options);
      accepted.push(String(location._id));
      lastEvaluation = evaluation;
      if (entry.normalised.isQueued) queuedCount += 1;
    } catch (err) {
      logger.warn(`Rejected fix for patient ${patient._id}: ${err.message}`);
      rejected.push({ recordedAt: entry.normalised.recordedAt, reason: err.message });
    }
  }

  if (accepted.length) {
    await sessionService.recordFixes(patient._id, {
      total: accepted.length,
      queued: queuedCount,
      lastFixAt: sorted[sorted.length - 1].normalised.recordedAt,
    });
  }

  const skipped = rawFixes.length - sorted.length;

  return {
    received: rawFixes.length,
    accepted: accepted.length,
    rejected: rejected.length + skipped,
    acceptedIds: accepted,
    errors: rejected,
    // The caller echoes the final zone verdict back to the device so the
    // patient screen can say "you are at home" without evaluating zones itself.
    insideSafeZone: lastEvaluation?.isInsideSafeZone ?? null,
    dangerZone: lastEvaluation?.dangerZoneName ?? null,
    distanceFromSafeZone: lastEvaluation?.distanceFromSafeZone ?? null,
    alerts: [],
  };
}

/** The most recent fix for a patient. */
async function getLatestLocation(patientId) {
  return Location.findOne({ patient: patientId }).sort({ recordedAt: -1 }).lean();
}

/**
 * Location history for a patient within a time range.
 *
 * `limit` caps the number of points returned so a long window cannot be pulled
 * into the browser in one go.
 */
async function getHistory(patientId, { from, to, limit = 2000 } = {}) {
  const query = { patient: patientId };
  if (from || to) {
    query.recordedAt = {};
    if (from) query.recordedAt.$gte = new Date(from);
    if (to) query.recordedAt.$lte = new Date(to);
  }

  return Location.find(query)
    .sort({ recordedAt: 1 })
    .limit(limit)
    .select(
      'latitude longitude accuracy speed zoneState isInsideSafeZone distanceFromSafeZone isQueued recordedAt'
    )
    .lean();
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
