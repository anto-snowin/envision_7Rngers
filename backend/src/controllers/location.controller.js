/**
 * Location endpoints.
 *
 * Writes come from the patient device and are authenticated with a patient
 * token, so no handler here takes a patient id from the request body — the
 * patient *is* the credential. Reads come from the caretaker dashboard and go
 * through `requirePatientOwnership`.
 */
const { Location, Alert } = require('../models');
const { ALERT_TYPES, DEVICE_REPORTABLE_ALERTS, SOCKET_EVENTS } = require('../utils/constants');
const { pathDistance } = require('../utils/geo');
const locationService = require('../services/location.service');
const alertService = require('../services/alert.service');
const presenceService = require('../services/presence.service');
const sessionService = require('../services/session.service');
const emitter = require('../sockets/emitter');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

/* ------------------------------------------------- patient device (writes) --- */

/**
 * POST /api/location/update
 *
 * Accepts one fix or a batch drained from the device's offline queue. The
 * response tells the device the server's verdict on its position so the patient
 * screen can show "at home" without doing any geofencing itself.
 */
const updateLocation = asyncHandler(async (req, res) => {
  const { fixes, connection } = req.body;

  const session = await sessionService.getOpenTrackingSession(req.patient._id);

  const result = await locationService.ingestBatch(req.patient, fixes, {
    trackingSessionId: session?._id,
  });

  if (!result.accepted) {
    throw ApiError.badRequest(
      result.errors[0]?.reason || 'No usable location fix was supplied'
    );
  }

  return ok(res, {
    accepted: result.accepted,
    rejected: result.rejected,
    connection: connection || 'online',
    insideSafeZone: result.insideSafeZone,
    dangerZone: result.dangerZone,
    distanceFromSafeZone: result.distanceFromSafeZone,
    alerts: result.alerts,
  });
});

/**
 * POST /api/location/ping
 *
 * Keep-alive for a device that has no fix to send.
 *
 * This matters because the two failure modes look identical from the server's
 * side otherwise: a phone whose GPS cannot get a lock is still present and
 * worth distinguishing from a phone that has been switched off.
 */
const ping = asyncHandler(async (req, res) => {
  const { online, batteryLevel, isCharging } = req.body;

  await presenceService.markOnline(req.patient);

  emitter.emitToCaretaker(req.patient.caretaker, SOCKET_EVENTS.PRESENCE_UPDATE, {
    patientId: String(req.patient._id),
    patientName: req.patient.name,
    isOnline: online !== false,
    reason: 'heartbeat',
    batteryLevel: batteryLevel ?? null,
    isCharging: isCharging ?? null,
    lastSeenAt: new Date(),
  });

  return ok(res, null);
});

/**
 * POST /api/location/sos
 *
 * Deliberately tolerant: an SOS must go through even with no GPS fix at all, so
 * the handler falls back to the last known position rather than refusing. A
 * caretaker who knows "SOS pressed, last seen at the park ten minutes ago" is
 * far better off than one who gets nothing because the fix failed.
 */
const raiseSos = asyncHandler(async (req, res) => {
  const { latitude, longitude, accuracy } = req.body;

  const live = req.patient.liveStatus || {};
  const hasFix = Number.isFinite(latitude) && Number.isFinite(longitude);

  const location = hasFix
    ? { latitude, longitude, accuracy: accuracy ?? null }
    : {
        latitude: live.latitude ?? null,
        longitude: live.longitude ?? null,
        accuracy: live.accuracy ?? null,
      };

  const alert = await alertService.createAlert({
    patient: req.patient,
    type: ALERT_TYPES.SOS,
    message: hasFix
      ? `${req.patient.name} pressed the SOS button.`
      : `${req.patient.name} pressed the SOS button. No current GPS fix — showing their last known position.`,
    location,
    metadata: {
      hasLiveFix: hasFix,
      lastSeenAt: live.lastSeenAt ?? null,
    },
    bypassCooldown: true,
  });

  return ok(res, alert);
});

/**
 * POST /api/location/device-event
 *
 * The device reports conditions only it can observe — GPS refused, internet
 * dropped, tracking stopped. The allow-list is the security boundary: without
 * it a device could post a fake zone breach for its own patient.
 */
const deviceEvent = asyncHandler(async (req, res) => {
  const { type, message } = req.body;

  if (!DEVICE_REPORTABLE_ALERTS.includes(type)) {
    throw ApiError.badRequest('That event type cannot be reported by a device');
  }

  if (type === ALERT_TYPES.TRACKING_STOPPED) {
    await sessionService.closeOpenTrackingSessions(req.patient._id, 'stopped');
  }

  const alert = await alertService.createAlert({
    patient: req.patient,
    type,
    message: message || undefined,
    location: req.patient.liveStatus || null,
  });

  return ok(res, alert);
});

/** GET /api/location/me — what the device itself is allowed to read back. */
const myStatus = asyncHandler(async (req, res) => {
  const live = req.patient.liveStatus || {};
  const session = await sessionService.getOpenTrackingSession(req.patient._id);

  return ok(res, {
    insideSafeZone:
      live.zoneState === 'inside_safe' ? true : live.zoneState === 'unknown' ? null : false,
    dangerZone: live.dangerZoneName || null,
    lastFixAt: live.lastFixAt || null,
    fixCount: session?.fixCount ?? 0,
  });
});

/* -------------------------------------------------- caretaker side (reads) --- */

/** GET /api/location/latest/:patientId */
const latestLocation = asyncHandler(async (req, res) => {
  const fix = await locationService.getLatestLocation(req.targetPatient._id);
  return ok(res, Location.toPublic(fix));
});

/**
 * GET /api/location/history/:patientId
 *
 * Returns the points plus a summary, because every caller needs both and the
 * summary has to be computed from the same point set the map is drawing.
 */
const locationHistory = asyncHandler(async (req, res) => {
  const { from, to, limit } = req.query;

  const fixes = await locationService.getHistory(req.targetPatient._id, { from, to, limit });

  const outsideCount = fixes.filter((fix) => fix.isInsideSafeZone === false).length;

  /**
   * Time outside the safe zone is estimated from the number of fixes that fell
   * outside, multiplied by the upload cadence. It is an estimate and nothing
   * more: a device that was off for an hour contributes no fixes and therefore
   * no time, which is the honest answer rather than a guess.
   */
  const minutesOutsideSafeZone = Math.round(
    (outsideCount * env.LOCATION_INTERVAL_MS) / 60000
  );

  return ok(
    res,
    {
      fixes: fixes.map((fix) => Location.toPublic({ ...fix, patient: req.targetPatient._id })),
      summary: {
        points: fixes.length,
        distanceMeters: Math.round(pathDistance(fixes)),
        minutesOutsideSafeZone,
        outsideFixes: outsideCount,
        firstFixAt: fixes[0]?.recordedAt || null,
        lastFixAt: fixes[fixes.length - 1]?.recordedAt || null,
      },
    },
    { points: fixes.length, limit: limit ?? 2000 }
  );
});

/** GET /api/location/alerts/:patientId — recent alerts beside the history. */
const patientAlerts = asyncHandler(async (req, res) => {
  const alerts = await Alert.find({ patient: req.targetPatient._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return ok(
    res,
    alerts.map((alert) => Alert.toPublic(alert, req.targetPatient.name))
  );
});

module.exports = {
  updateLocation,
  ping,
  raiseSos,
  deviceEvent,
  myStatus,
  latestLocation,
  locationHistory,
  patientAlerts,
};
