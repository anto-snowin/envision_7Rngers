/**
 * Geofence and danger-zone evaluation engine.
 *
 * Called for every incoming GPS fix. Its job is to answer three questions —
 * is the patient inside a safe zone, which danger zones are they inside, and
 * how far outside safety are they — and then to raise alerts only on *state
 * transitions* rather than on every fix.
 *
 * Three details matter for real-world behaviour:
 *
 * 1. Hysteresis. A patient standing on the safe-zone boundary would otherwise
 *    flip between inside and outside as GPS noise moves them a few metres,
 *    producing a stream of contradictory alerts. Leaving therefore requires
 *    crossing the radius *plus* a buffer sized from the reported GPS accuracy,
 *    while returning only requires crossing back inside the radius.
 *
 * 2. Transition detection. The previous zone state is cached on the patient
 *    document, so "left the safe zone" fires once on the crossing rather than
 *    once per fix for as long as the patient stays out.
 *
 * 3. Multiple safe zones. A patient may have a home zone and, say, a day-centre
 *    zone. They are safe if they are inside *any* of them, so the engine
 *    evaluates against the nearest one rather than treating each in isolation.
 *
 * This runs server-side and only server-side. The device's own opinion about
 * whether it is inside a zone is never trusted, because the device is the thing
 * an attacker (or a confused browser) controls.
 */
const { SafeZone, DangerZone } = require('../models');
const { haversineDistance, isInsideCircle, isValidCoordinate } = require('../utils/geo');
const { ALERT_TYPES, ZONE_STATE } = require('../utils/constants');
const alertService = require('./alert.service');
const env = require('../config/env');

/** Clamp the hysteresis buffer so it is neither trivial nor absurd. */
const MIN_EXIT_BUFFER_M = 10;
const MAX_EXIT_BUFFER_M = 60;

/**
 * Extra distance beyond the radius required before an exit is believed.
 * Derived from the fix's own accuracy: a sloppy fix needs more margin.
 */
function exitBufferFor(accuracy) {
  const acc = Number(accuracy);
  if (!Number.isFinite(acc) || acc <= 0) return MIN_EXIT_BUFFER_M;
  return Math.min(MAX_EXIT_BUFFER_M, Math.max(MIN_EXIT_BUFFER_M, acc));
}

/** Every active safe zone for a patient. */
async function getActiveSafeZones(patientId) {
  return SafeZone.find({ patient: patientId, isActive: true }).lean();
}

/** Every active danger zone for a patient. */
async function getActiveDangerZones(patientId) {
  return DangerZone.find({ patient: patientId, isActive: true }).lean();
}

/**
 * The safe zone whose edge is closest to the point.
 *
 * "Closest edge" rather than "closest centre" is the right comparison: a large
 * zone 400 m away can still contain the patient while a small zone 50 m away
 * does not.
 */
function nearestSafeZone(point, zones) {
  let best = null;

  for (const zone of zones) {
    if (!isValidCoordinate(zone)) continue;
    const distance = haversineDistance(point, zone);
    const beyondEdge = distance - Number(zone.radius || 0);
    if (!best || beyondEdge < best.beyondEdge) {
      best = { zone, distance, beyondEdge };
    }
  }

  return best;
}

/** Render a metre value the way a caretaker would read it. */
function formatMetres(metres) {
  const value = Math.abs(Math.round(metres));
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${value} m`;
}

/**
 * Evaluate a single fix against the patient's zones and raise any alerts the
 * transition warrants.
 *
 * @param {object} params
 * @param {object} params.patient Patient document (read only; the caller saves)
 * @param {{latitude:number, longitude:number, accuracy?:number, batteryLevel?:number, isCharging?:boolean}} params.point
 * @param {Date} [params.recordedAt]
 * @param {boolean} [params.silent] skip alerting entirely
 */
async function evaluateFix({ patient, point, recordedAt = new Date(), silent = false }) {
  const result = {
    zoneState: ZONE_STATE.UNKNOWN,
    isInsideSafeZone: null,
    distanceFromSafeZone: null,
    distanceBeyondEdge: null,
    nearestSafeZoneName: null,
    dangerZoneIds: [],
    dangerZoneName: null,
    alerts: [],
  };

  if (!isValidCoordinate(point)) return result;

  const patientId = String(patient._id);
  const previous = patient.liveStatus || {};

  const [safeZones, dangerZones] = await Promise.all([
    getActiveSafeZones(patientId),
    getActiveDangerZones(patientId),
  ]);

  // ---------------------------------------------------------------- safe zones
  const nearest = nearestSafeZone(point, safeZones);

  if (nearest) {
    const { zone, distance, beyondEdge } = nearest;
    const buffer = exitBufferFor(point.accuracy);

    result.distanceFromSafeZone = Math.round(distance);
    result.distanceBeyondEdge = Math.round(beyondEdge);
    result.nearestSafeZoneName = zone.name;

    const wasOutside = previous.zoneState === ZONE_STATE.OUTSIDE_SAFE;

    // Hysteresis: leaving needs radius + buffer, returning just needs radius.
    const isOutside = wasOutside ? beyondEdge > 0 : beyondEdge > buffer;

    result.isInsideSafeZone = !isOutside;
    result.zoneState = isOutside ? ZONE_STATE.OUTSIDE_SAFE : ZONE_STATE.INSIDE_SAFE;

    if (!silent && isOutside && !wasOutside) {
      const alert = await alertService.createAlert({
        patient,
        type: ALERT_TYPES.SAFE_ZONE_EXIT,
        message:
          `${patient.name} is ${formatMetres(beyondEdge)} beyond the ` +
          `"${zone.name}" safe zone.`,
        zoneName: zone.name,
        location: point,
        metadata: {
          zoneName: zone.name,
          radius: zone.radius,
          distanceFromCentre: Math.round(distance),
          distanceBeyondEdge: Math.round(beyondEdge),
          detectedAt: recordedAt,
        },
        safeZone: zone._id,
      });
      if (alert) result.alerts.push(alert);
    } else if (!silent && !isOutside && wasOutside) {
      const alert = await alertService.createAlert({
        patient,
        type: ALERT_TYPES.SAFE_ZONE_RETURN,
        message: `${patient.name} is back inside the "${zone.name}" safe zone.`,
        zoneName: zone.name,
        location: point,
        metadata: { zoneName: zone.name, detectedAt: recordedAt },
        safeZone: zone._id,
      });
      if (alert) result.alerts.push(alert);
    }
  }

  // -------------------------------------------------------------- danger zones
  const insideZones = dangerZones.filter((zone) => isInsideCircle(point, zone));
  result.dangerZoneIds = insideZones.map((zone) => String(zone._id));
  result.dangerZoneName = insideZones[0]?.name || null;

  const previouslyInside = (previous.activeDangerZones || []).map(String);
  const newlyEntered = insideZones.filter((zone) => !previouslyInside.includes(String(zone._id)));
  const stillInside = new Set(result.dangerZoneIds);
  const newlyLeft = previouslyInside.filter((id) => !stillInside.has(id));

  // Being in a danger zone outranks everything else for display purposes: it is
  // the most urgent fact about the patient's position.
  if (insideZones.length > 0) {
    result.zoneState = ZONE_STATE.IN_DANGER;
    result.isInsideSafeZone = result.isInsideSafeZone ?? false;
  }

  if (!silent) {
    for (const zone of newlyEntered) {
      const alert = await alertService.createAlert({
        patient,
        type: ALERT_TYPES.DANGER_ZONE_ENTRY,
        severity: zone.severity,
        message:
          `${patient.name} has entered the danger zone "${zone.name}"` +
          (zone.description ? ` — ${zone.description}` : '.'),
        zoneName: zone.name,
        location: point,
        metadata: {
          zoneName: zone.name,
          category: zone.category,
          radius: zone.radius,
          detectedAt: recordedAt,
        },
        dangerZone: zone._id,
      });
      if (alert) result.alerts.push(alert);
    }

    // Leaving a hazard is good news, and the caretaker who saw the entry alert
    // needs the matching all-clear or they will keep worrying about it.
    if (newlyLeft.length) {
      const left = dangerZones.filter((zone) => newlyLeft.includes(String(zone._id)));
      for (const zone of left) {
        const alert = await alertService.createAlert({
          patient,
          type: ALERT_TYPES.DANGER_ZONE_EXIT,
          message: `${patient.name} has left the danger zone "${zone.name}".`,
          zoneName: zone.name,
          location: point,
          metadata: { zoneName: zone.name, detectedAt: recordedAt },
          dangerZone: zone._id,
        });
        if (alert) result.alerts.push(alert);
      }
    }
  }

  // --------------------------------------------------------------- low battery
  if (!silent && Number.isFinite(point.batteryLevel)) {
    const level = point.batteryLevel;
    const wasAbove =
      !Number.isFinite(previous.batteryLevel) || previous.batteryLevel > env.LOW_BATTERY_THRESHOLD;

    // A charging device is recovering, so it is not a concern.
    if (level <= env.LOW_BATTERY_THRESHOLD && wasAbove && !point.isCharging) {
      const alert = await alertService.createAlert({
        patient,
        type: ALERT_TYPES.LOW_BATTERY,
        message:
          `${patient.name}'s device battery is at ${Math.round(level)}%. ` +
          'Tracking will stop when it dies.',
        location: point,
        metadata: { batteryLevel: level, threshold: env.LOW_BATTERY_THRESHOLD },
      });
      if (alert) result.alerts.push(alert);
    }
  }

  return result;
}

module.exports = {
  evaluateFix,
  getActiveSafeZones,
  getActiveDangerZones,
  nearestSafeZone,
  exitBufferFor,
  formatMetres,
};
