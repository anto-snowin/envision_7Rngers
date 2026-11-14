/**
 * Geofence and danger-zone evaluation engine.
 *
 * Called for every incoming GPS fix. Its job is to answer three questions —
 * is the patient inside their safe zone, which danger zones are they inside,
 * and how far from home are they — and then to raise alerts only on *state
 * transitions* rather than on every fix.
 *
 * Two details matter for real-world behaviour:
 *
 * 1. Hysteresis. A patient standing on the safe-zone boundary would otherwise
 *    flip between inside and outside as GPS noise moves them a few metres,
 *    producing a stream of contradictory alerts. Leaving the zone therefore
 *    requires crossing the radius *plus* a buffer sized from the reported GPS
 *    accuracy, while returning only requires crossing back inside the radius.
 *
 * 2. Transition detection. The previous zone state is cached on the patient
 *    document, so "left the safe zone" fires once on the crossing, not every
 *    five seconds for as long as the patient stays out.
 */
const { Geofence, DangerZone } = require('../models');
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

/** The active safe zone for a patient, or null. */
async function getActiveGeofence(patientId) {
  return Geofence.findOne({ patient: patientId, isActive: true }).lean();
}

/**
 * Every active danger zone that applies to this patient.
 * A zone with an empty `patients` array applies to all of the caretaker's
 * patients; otherwise it is scoped to the listed ones.
 */
async function getApplicableDangerZones(caretakerId, patientId) {
  return DangerZone.find({
    caretaker: caretakerId,
    isActive: true,
    $or: [{ patients: { $size: 0 } }, { patients: patientId }],
  }).lean();
}

/**
 * Evaluate a single fix against the patient's zones and raise any alerts the
 * transition warrants.
 *
 * @param {object} params
 * @param {object} params.patient  Patient document (mutated in memory only)
 * @param {{latitude:number, longitude:number, accuracy?:number}} params.point
 * @param {Date}   [params.recordedAt]
 * @param {boolean} [params.silent] skip alerting (used when replaying a queued backlog)
 * @returns {Promise<{
 *   zoneState: string,
 *   isInsideSafeZone: boolean|null,
 *   distanceFromHome: number|null,
 *   distanceFromSafeEdge: number|null,
 *   dangerZoneIds: string[],
 *   enteredDangerZones: object[],
 *   geofence: object|null,
 *   alerts: object[]
 * }>}
 */
async function evaluateFix({ patient, point, recordedAt = new Date(), silent = false }) {
  const result = {
    zoneState: ZONE_STATE.UNKNOWN,
    isInsideSafeZone: null,
    distanceFromHome: null,
    distanceFromSafeEdge: null,
    dangerZoneIds: [],
    enteredDangerZones: [],
    geofence: null,
    alerts: [],
  };

  if (!isValidCoordinate(point)) return result;

  const patientId = String(patient._id);
  const previous = patient.liveStatus || {};

  const [geofence, dangerZones] = await Promise.all([
    getActiveGeofence(patientId),
    getApplicableDangerZones(patient.caretaker, patientId),
  ]);

  result.geofence = geofence || null;

  // ---------------------------------------------------------------- safe zone
  if (geofence) {
    const distance = haversineDistance(point, geofence);
    const buffer = exitBufferFor(point.accuracy);

    result.distanceFromHome = Math.round(distance);
    result.distanceFromSafeEdge = Math.round(distance - geofence.radius);

    const wasOutside = previous.zoneState === ZONE_STATE.OUTSIDE_SAFE;

    // Hysteresis: leaving needs radius + buffer, returning just needs radius.
    const isOutside = wasOutside ? distance > geofence.radius : distance > geofence.radius + buffer;

    result.isInsideSafeZone = !isOutside;
    result.zoneState = isOutside ? ZONE_STATE.OUTSIDE_SAFE : ZONE_STATE.INSIDE_SAFE;

    // Alert only on a genuine crossing.
    if (!silent && isOutside && !wasOutside) {
      const alert = await alertService.createAlert({
        patient,
        type: ALERT_TYPES.SAFE_ZONE_EXIT,
        message:
          `${patient.name} is ${formatMetres(distance - geofence.radius)} beyond the ` +
          `"${geofence.name}" safe zone.`,
        location: {
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy,
        },
        metadata: {
          zoneName: geofence.name,
          radius: geofence.radius,
          distanceFromCentre: Math.round(distance),
          distanceBeyondEdge: Math.round(distance - geofence.radius),
          detectedAt: recordedAt,
        },
        geofence: geofence._id,
      });
      if (alert) result.alerts.push(alert);
    } else if (!silent && !isOutside && wasOutside) {
      const alert = await alertService.createAlert({
        patient,
        type: ALERT_TYPES.SAFE_ZONE_RETURN,
        message: `${patient.name} is back inside the "${geofence.name}" safe zone.`,
        location: {
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy,
        },
        metadata: { zoneName: geofence.name, detectedAt: recordedAt },
        geofence: geofence._id,
      });
      if (alert) result.alerts.push(alert);
    }
  } else if (isValidCoordinate(patient.homeLocation)) {
    // No geofence configured, but we can still report distance from home.
    result.distanceFromHome = Math.round(haversineDistance(point, patient.homeLocation));
  }

  // -------------------------------------------------------------- danger zones
  const insideZones = dangerZones.filter((zone) => isInsideCircle(point, zone));
  result.dangerZoneIds = insideZones.map((zone) => String(zone._id));

  const previouslyInside = (previous.activeDangerZones || []).map(String);
  const newlyEntered = insideZones.filter((zone) => !previouslyInside.includes(String(zone._id)));
  result.enteredDangerZones = newlyEntered;

  // Being in a danger zone outranks everything else for display purposes.
  if (insideZones.length > 0) {
    result.zoneState = ZONE_STATE.IN_DANGER;
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
        location: {
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy,
        },
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
  }

  // --------------------------------------------------------------- low battery
  if (!silent && Number.isFinite(point.batteryLevel)) {
    const level = point.batteryLevel;
    const wasAbove =
      !Number.isFinite(previous.batteryLevel) || previous.batteryLevel > env.LOW_BATTERY_THRESHOLD;

    // Charging devices are recovering, so they are not a concern.
    if (level <= env.LOW_BATTERY_THRESHOLD && wasAbove && !point.isCharging) {
      const alert = await alertService.createAlert({
        patient,
        type: ALERT_TYPES.LOW_BATTERY,
        message: `${patient.name}'s device battery is at ${Math.round(level)}%. Tracking may stop soon.`,
        location: {
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy,
        },
        metadata: { batteryLevel: level, threshold: env.LOW_BATTERY_THRESHOLD },
      });
      if (alert) result.alerts.push(alert);
    }
  }

  return result;
}

/** Render a metre value the way a caretaker would read it. */
function formatMetres(metres) {
  const value = Math.abs(Math.round(metres));
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${value} m`;
}

module.exports = {
  evaluateFix,
  getActiveGeofence,
  getApplicableDangerZones,
  exitBufferFor,
  formatMetres,
};
