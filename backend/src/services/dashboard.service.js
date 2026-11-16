/**
 * Dashboard roll-ups.
 *
 * One query set, folded in JavaScript. At the scale this runs at — a caretaker
 * with a handful of patients — a single lean `find` on the patients collection
 * plus three counts is cheaper than an aggregation pipeline, and the cached
 * `liveStatus` on each patient means no scan of the locations collection.
 */
const { Patient, Alert } = require('../models');
const { SEVERITY, ZONE_STATE } = require('../utils/constants');
const env = require('../config/env');

/** Start of today in the server's timezone. */
function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Headline counters for the dashboard.
 *
 * @param {string} caretakerId
 */
async function getSummary(caretakerId) {
  const onlineCutoff = new Date(Date.now() - env.OFFLINE_THRESHOLD_MS);
  const today = startOfToday();

  const [patients, alertsToday, unreadAlerts, unresolvedAlerts, criticalToday] = await Promise.all([
    Patient.find({ caretaker: caretakerId, isActive: true }).select('name liveStatus').lean(),
    Alert.countDocuments({ caretaker: caretakerId, createdAt: { $gte: today } }),
    Alert.countDocuments({ caretaker: caretakerId, isRead: false }),
    Alert.countDocuments({ caretaker: caretakerId, isResolved: false }),
    Alert.countDocuments({
      caretaker: caretakerId,
      severity: SEVERITY.CRITICAL,
      createdAt: { $gte: today },
    }),
  ]);

  /**
   * "Online" is derived from the last-seen timestamp rather than from the
   * cached boolean, so the number is right even if the presence sweep has not
   * run since the device went quiet.
   */
  const online = patients.filter((patient) => {
    const lastSeen = patient.liveStatus?.lastSeenAt;
    return Boolean(lastSeen) && new Date(lastSeen) >= onlineCutoff;
  });

  const batteries = patients
    .map((patient) => patient.liveStatus?.batteryLevel)
    .filter((level) => Number.isFinite(level));

  const lowBattery = patients.filter(
    (patient) =>
      Number.isFinite(patient.liveStatus?.batteryLevel) &&
      patient.liveStatus.batteryLevel <= env.LOW_BATTERY_THRESHOLD
  );

  const outsideSafeZone = patients.filter(
    (patient) => patient.liveStatus?.zoneState === ZONE_STATE.OUTSIDE_SAFE
  );
  const inDangerZone = patients.filter(
    (patient) => patient.liveStatus?.zoneState === ZONE_STATE.IN_DANGER
  );

  const lastUpdatedAt = patients.reduce((latest, patient) => {
    const seen = patient.liveStatus?.lastSeenAt;
    if (!seen) return latest;
    const time = new Date(seen).getTime();
    return time > latest ? time : latest;
  }, 0);

  return {
    totalPatients: patients.length,
    online: online.length,
    offline: patients.length - online.length,
    alertsToday,
    criticalAlertsToday: criticalToday,
    unreadAlerts,
    unresolvedAlerts,
    outsideSafeZone: outsideSafeZone.length,
    inDangerZone: inDangerZone.length,
    lowBattery: lowBattery.length,
    averageBattery: batteries.length
      ? Math.round(batteries.reduce((sum, level) => sum + level, 0) / batteries.length)
      : null,
    batteryReportingCount: batteries.length,
    lastUpdatedAt: lastUpdatedAt ? new Date(lastUpdatedAt) : null,
  };
}

module.exports = { getSummary, startOfToday };
