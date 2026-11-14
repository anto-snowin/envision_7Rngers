/**
 * Analytics and dashboard roll-ups.
 *
 * Distance can only be computed by walking consecutive fixes in order, which no
 * single MongoDB aggregation expresses cleanly, so the pattern throughout is:
 * let the database do the filtering and grouping it is good at, then fold the
 * ordered points in JavaScript with the jitter-aware `pathDistance` helper.
 */
const { Patient, Location, Alert } = require('../models');
const { pathDistance, haversineDistance } = require('../utils/geo');
const { ALERT_TYPES, SEVERITY } = require('../utils/constants');
const env = require('../config/env');

/** Start of today in the server's timezone. */
function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Start of the day `daysAgo` days back. */
function startOfDaysAgo(daysAgo) {
  const date = startOfToday();
  date.setDate(date.getDate() - daysAgo);
  return date;
}

/** `YYYY-MM-DD` key for grouping by local day. */
function dayKey(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Headline counters for the dashboard's stat row.
 */
async function getDashboardStats(caretakerId) {
  const onlineCutoff = new Date(Date.now() - env.OFFLINE_THRESHOLD_MS);

  const [patients, alertsToday, unreadAlerts, criticalToday] = await Promise.all([
    Patient.find({ caretaker: caretakerId, isActive: true }).select('name liveStatus').lean(),
    Alert.countDocuments({ caretaker: caretakerId, createdAt: { $gte: startOfToday() } }),
    Alert.countDocuments({ caretaker: caretakerId, isRead: false }),
    Alert.countDocuments({
      caretaker: caretakerId,
      severity: SEVERITY.CRITICAL,
      createdAt: { $gte: startOfToday() },
    }),
  ]);

  // "Online" is derived from the last fix timestamp rather than trusting the
  // cached boolean, so the number is correct even if a sweep has not run yet.
  const online = patients.filter((p) => {
    const lastSeen = p.liveStatus?.lastSeenAt;
    return Boolean(lastSeen) && new Date(lastSeen) >= onlineCutoff;
  });

  const batteries = patients
    .map((p) => p.liveStatus?.batteryLevel)
    .filter((level) => Number.isFinite(level));

  const lowBattery = patients.filter(
    (p) =>
      Number.isFinite(p.liveStatus?.batteryLevel) &&
      p.liveStatus.batteryLevel <= env.LOW_BATTERY_THRESHOLD
  );

  const outsideSafeZone = patients.filter((p) => p.liveStatus?.zoneState === 'outside_safe');
  const inDangerZone = patients.filter((p) => p.liveStatus?.zoneState === 'in_danger');

  const lastUpdatedAt = patients.reduce((latest, p) => {
    const seen = p.liveStatus?.lastSeenAt;
    if (!seen) return latest;
    const time = new Date(seen).getTime();
    return time > latest ? time : latest;
  }, 0);

  return {
    totalPatients: patients.length,
    patientsOnline: online.length,
    patientsOffline: patients.length - online.length,
    alertsToday,
    criticalAlertsToday: criticalToday,
    unreadAlerts,
    outsideSafeZone: outsideSafeZone.length,
    inDangerZone: inDangerZone.length,
    battery: {
      averageLevel: batteries.length
        ? Math.round(batteries.reduce((sum, n) => sum + n, 0) / batteries.length)
        : null,
      lowCount: lowBattery.length,
      reportingCount: batteries.length,
      lowBatteryPatients: lowBattery.map((p) => ({
        _id: String(p._id),
        name: p.name,
        batteryLevel: p.liveStatus.batteryLevel,
      })),
    },
    lastUpdatedAt: lastUpdatedAt ? new Date(lastUpdatedAt) : null,
  };
}

/**
 * Distance travelled per day, for one patient or every patient of a caretaker.
 *
 * @param {object} params
 * @param {string} params.caretakerId
 * @param {string} [params.patientId]
 * @param {number} [params.days] how many days back to report
 */
async function getMovementSeries({ caretakerId, patientId = null, days = 7 }) {
  const from = startOfDaysAgo(days - 1);

  const query = { caretaker: caretakerId, recordedAt: { $gte: from } };
  if (patientId) query.patient = patientId;

  const points = await Location.find(query)
    .sort({ recordedAt: 1 })
    .select('patient latitude longitude isInsideSafeZone recordedAt')
    .lean();

  // Group by day, then by patient — distance must never be accumulated across
  // two different people's tracks.
  const byDay = new Map();
  for (const point of points) {
    const key = dayKey(point.recordedAt);
    if (!byDay.has(key)) byDay.set(key, new Map());
    const perPatient = byDay.get(key);
    const pid = String(point.patient);
    if (!perPatient.has(pid)) perPatient.set(pid, []);
    perPatient.get(pid).push(point);
  }

  // Emit a row for every day in the window, including days with no data.
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = startOfDaysAgo(i);
    const key = dayKey(date);
    const perPatient = byDay.get(key);

    let distance = 0;
    let fixCount = 0;
    if (perPatient) {
      for (const track of perPatient.values()) {
        distance += pathDistance(track);
        fixCount += track.length;
      }
    }

    series.push({
      date: key,
      label: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
      distanceMetres: Math.round(distance),
      distanceKm: Number((distance / 1000).toFixed(2)),
      fixCount,
    });
  }

  return series;
}

/**
 * Minutes spent outside the safe zone per day.
 *
 * Each fix "covers" the interval until the next fix. Gaps longer than
 * `maxGapMs` are not counted, because a 3-hour silence is missing data rather
 * than three hours of confirmed wandering.
 */
async function getTimeOutsideSeries({ caretakerId, patientId = null, days = 7 }) {
  const from = startOfDaysAgo(days - 1);
  const maxGapMs = 60 * 1000;

  const query = {
    caretaker: caretakerId,
    recordedAt: { $gte: from },
    isInsideSafeZone: { $ne: null },
  };
  if (patientId) query.patient = patientId;

  const points = await Location.find(query)
    .sort({ recordedAt: 1 })
    .select('patient isInsideSafeZone recordedAt')
    .lean();

  // Walk each patient's track separately and accumulate outside-time per day.
  const perPatient = new Map();
  for (const point of points) {
    const pid = String(point.patient);
    if (!perPatient.has(pid)) perPatient.set(pid, []);
    perPatient.get(pid).push(point);
  }

  const minutesByDay = new Map();
  for (const track of perPatient.values()) {
    for (let i = 0; i < track.length - 1; i += 1) {
      const current = track[i];
      if (current.isInsideSafeZone !== false) continue;

      const gap = new Date(track[i + 1].recordedAt) - new Date(current.recordedAt);
      if (gap <= 0 || gap > maxGapMs) continue;

      const key = dayKey(current.recordedAt);
      minutesByDay.set(key, (minutesByDay.get(key) || 0) + gap / 60000);
    }
  }

  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = startOfDaysAgo(i);
    const key = dayKey(date);
    series.push({
      date: key,
      label: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
      minutesOutside: Math.round(minutesByDay.get(key) || 0),
    });
  }

  return series;
}

/** Alert counts per day, split by type, plus a by-type total. */
async function getAlertSeries({ caretakerId, patientId = null, days = 7 }) {
  const from = startOfDaysAgo(days - 1);

  const match = { caretaker: caretakerId, createdAt: { $gte: from } };
  if (patientId) match.patient = patientId;

  const rows = await Alert.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          type: '$type',
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const byDay = new Map();
  const byType = {};

  for (const row of rows) {
    const { day, type } = row._id;
    if (!byDay.has(day)) byDay.set(day, {});
    byDay.get(day)[type] = row.count;
    byType[type] = (byType[type] || 0) + row.count;
  }

  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = startOfDaysAgo(i);
    const key = dayKey(date);
    const counts = byDay.get(key) || {};
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

    series.push({
      date: key,
      label: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
      total,
      safeZoneExits: counts[ALERT_TYPES.SAFE_ZONE_EXIT] || 0,
      dangerZoneEntries: counts[ALERT_TYPES.DANGER_ZONE_ENTRY] || 0,
      sos: counts[ALERT_TYPES.SOS] || 0,
      offline: counts[ALERT_TYPES.PATIENT_OFFLINE] || 0,
      lowBattery: counts[ALERT_TYPES.LOW_BATTERY] || 0,
      gps: counts[ALERT_TYPES.GPS_UNAVAILABLE] || 0,
    });
  }

  return { series, byType };
}

/**
 * Everything the analytics page needs, in one round trip.
 */
async function getAnalyticsOverview({ caretakerId, patientId = null, days = 7 }) {
  const [movement, timeOutside, alerts, stats] = await Promise.all([
    getMovementSeries({ caretakerId, patientId, days }),
    getTimeOutsideSeries({ caretakerId, patientId, days }),
    getAlertSeries({ caretakerId, patientId, days }),
    getDashboardStats(caretakerId),
  ]);

  const totalDistance = movement.reduce((sum, row) => sum + row.distanceMetres, 0);
  const activeDays = movement.filter((row) => row.fixCount > 0).length;
  const totalMinutesOutside = timeOutside.reduce((sum, row) => sum + row.minutesOutside, 0);

  return {
    range: { days, from: startOfDaysAgo(days - 1), to: new Date() },
    movement,
    timeOutside,
    alerts: alerts.series,
    alertsByType: alerts.byType,
    stats,
    summary: {
      totalDistanceKm: Number((totalDistance / 1000).toFixed(2)),
      // Averaged over days with data, so a patient added yesterday is not
      // penalised by six empty days.
      averageDailyDistanceKm: activeDays
        ? Number((totalDistance / activeDays / 1000).toFixed(2))
        : 0,
      activeDays,
      totalMinutesOutside,
      averageDailyMinutesOutside: activeDays ? Math.round(totalMinutesOutside / activeDays) : 0,
      safeZoneViolations: alerts.byType[ALERT_TYPES.SAFE_ZONE_EXIT] || 0,
      dangerZoneEntries: alerts.byType[ALERT_TYPES.DANGER_ZONE_ENTRY] || 0,
      sosCount: alerts.byType[ALERT_TYPES.SOS] || 0,
    },
  };
}

/**
 * Summary of a single day (or arbitrary range) for the history page:
 * distance, duration, outside-time and the furthest point reached.
 */
async function getHistorySummary({ patientId, from, to }) {
  const points = await Location.find({
    patient: patientId,
    recordedAt: { $gte: new Date(from), $lte: new Date(to) },
  })
    .sort({ recordedAt: 1 })
    .select('latitude longitude isInsideSafeZone distanceFromHome recordedAt')
    .lean();

  if (!points.length) {
    return {
      fixCount: 0,
      distanceMetres: 0,
      distanceKm: 0,
      durationMinutes: 0,
      minutesOutsideSafeZone: 0,
      maxDistanceFromHome: 0,
      firstFixAt: null,
      lastFixAt: null,
    };
  }

  const distance = pathDistance(points);
  const first = points[0];
  const last = points[points.length - 1];

  // Outside-time, with the same "ignore long gaps" rule as the weekly series.
  const maxGapMs = 60 * 1000;
  let msOutside = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    if (points[i].isInsideSafeZone !== false) continue;
    const gap = new Date(points[i + 1].recordedAt) - new Date(points[i].recordedAt);
    if (gap > 0 && gap <= maxGapMs) msOutside += gap;
  }

  const maxFromHome = points.reduce((max, p) => {
    const value = Number.isFinite(p.distanceFromHome)
      ? p.distanceFromHome
      : haversineDistance(first, p);
    return Math.max(max, value);
  }, 0);

  return {
    fixCount: points.length,
    distanceMetres: Math.round(distance),
    distanceKm: Number((distance / 1000).toFixed(2)),
    durationMinutes: Math.round((new Date(last.recordedAt) - new Date(first.recordedAt)) / 60000),
    minutesOutsideSafeZone: Math.round(msOutside / 60000),
    maxDistanceFromHome: Math.round(maxFromHome),
    firstFixAt: first.recordedAt,
    lastFixAt: last.recordedAt,
  };
}

module.exports = {
  getDashboardStats,
  getMovementSeries,
  getTimeOutsideSeries,
  getAlertSeries,
  getAnalyticsOverview,
  getHistorySummary,
  startOfToday,
  startOfDaysAgo,
  dayKey,
};
