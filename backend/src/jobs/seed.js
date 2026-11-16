/**
 * Demo data seeder.
 *
 * Run with `npm run seed`. Creates one caretaker, three patients with working
 * device logins, their safe and danger zones, a few days of plausible location
 * history, and the alerts that history would have produced.
 *
 * The generated track is not random noise: each patient stays near home most of
 * the time and takes a walk that leaves the safe zone, because a demo where
 * nothing ever crosses a boundary shows none of the behaviour that matters.
 *
 * Destructive for the demo caretaker's data only — it never touches other
 * accounts.
 */
const mongoose = require('mongoose');
const {
  Caretaker,
  Patient,
  Location,
  Alert,
  SafeZone,
  DangerZone,
  TrackingSession,
} = require('../models');
const { haversineDistance } = require('../utils/geo');
const { ALERT_TYPES, ALERT_SEVERITY, ALERT_TITLES, ZONE_STATE } = require('../utils/constants');
const env = require('../config/env');
const logger = require('../utils/logger');

const DEMO_EMAIL = 'caretaker@demo.com';
const DEMO_PASSWORD = 'Demo1234';
const DEMO_DEVICE_PASSWORD = 'Device1234';

/** Days of history to generate. */
const HISTORY_DAYS = 3;

const PATIENTS = [
  {
    name: 'Harold Whitfield',
    age: 78,
    gender: 'male',
    patientCode: 'PT-HRLD-2K7M',
    medicalNotes:
      'Moderate Alzheimer’s. Walks to the corner shop most mornings and can lose track of the way home.',
    emergencyContact: { name: 'Susan Whitfield', relationship: 'Daughter', phone: '+44 7700 900111' },
    home: { latitude: 28.6139, longitude: 77.209 },
    safeRadius: 250,
    danger: [
      {
        name: 'Railway level crossing',
        category: 'railway',
        description: 'Unmanned crossing on the lane behind the park.',
        offset: { lat: 0.0042, lng: 0.0031 },
        radius: 90,
      },
      {
        name: 'Canal towpath',
        category: 'water',
        description: 'No railings along the north bank.',
        offset: { lat: -0.0036, lng: 0.0048 },
        radius: 120,
      },
    ],
  },
  {
    name: 'Margaret Osei',
    age: 83,
    gender: 'female',
    patientCode: 'PT-MRGT-4N9P',
    medicalNotes: 'Advanced dementia. Should not leave the garden unaccompanied.',
    emergencyContact: { name: 'Daniel Osei', relationship: 'Son', phone: '+44 7700 900222' },
    home: { latitude: 28.6218, longitude: 77.2156 },
    safeRadius: 150,
    danger: [
      {
        name: 'Ring road junction',
        category: 'highway',
        description: 'Six lanes, no pedestrian crossing for 400 m.',
        offset: { lat: 0.0028, lng: -0.0039 },
        radius: 140,
      },
    ],
  },
  {
    name: 'Arun Mehta',
    age: 71,
    gender: 'male',
    patientCode: 'PT-ARUN-6Q3T',
    medicalNotes: 'Early-stage dementia. Independent, enjoys long walks in the mornings.',
    emergencyContact: { name: 'Priya Mehta', relationship: 'Wife', phone: '+44 7700 900333' },
    home: { latitude: 28.6045, longitude: 77.2005 },
    safeRadius: 400,
    danger: [
      {
        name: 'Construction site',
        category: 'construction',
        description: 'Open excavation, unfenced on the east side.',
        offset: { lat: -0.0051, lng: -0.0022 },
        radius: 110,
      },
      {
        name: 'Industrial yard',
        category: 'industrial',
        description: 'Heavy vehicle access road.',
        offset: { lat: 0.0063, lng: 0.0012 },
        radius: 160,
      },
    ],
  },
];

/** Metres per degree, good enough for generating a local track. */
const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Offset a point by a distance in metres. */
function offsetPoint(origin, northM, eastM) {
  return {
    latitude: origin.latitude + northM / M_PER_DEG_LAT,
    longitude: origin.longitude + eastM / mPerDegLng(origin.latitude),
  };
}

/**
 * Generate one day of fixes at the configured cadence.
 *
 * The shape is: at home overnight, a walk out past the safe-zone edge in the
 * late morning, then back. Positions jitter by a few metres so the trail looks
 * like GPS rather than a ruler.
 */
function buildDayTrack({ spec, safeZone, dayOffset }) {
  const fixes = [];
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  dayStart.setDate(dayStart.getDate() - dayOffset);

  const stepMs = env.LOCATION_INTERVAL_MS;
  // One fix every three minutes, from 07:00 to 20:00.
  const start = new Date(dayStart.getTime() + 7 * 3600 * 1000);
  const end = new Date(dayStart.getTime() + 20 * 3600 * 1000);

  // The walk happens between these hours, reaching this far from home.
  const walkStartHour = 10;
  const walkEndHour = 11.5;
  const walkPeakM = spec.safeRadius * 1.9;

  let battery = 86 - dayOffset * 3;

  for (let t = start.getTime(); t <= end.getTime(); t += stepMs) {
    const at = new Date(t);
    const hour = at.getHours() + at.getMinutes() / 60;

    let distance = 0;
    if (hour >= walkStartHour && hour <= walkEndHour) {
      // Triangular profile: out and back.
      const progress = (hour - walkStartHour) / (walkEndHour - walkStartHour);
      const ramp = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      distance = ramp * walkPeakM;
    }

    const bearing = 0.9 + dayOffset * 0.4;
    const jitter = () => (Math.random() - 0.5) * 12;

    const point = offsetPoint(
      spec.home,
      distance * Math.cos(bearing) + jitter(),
      distance * Math.sin(bearing) + jitter()
    );

    const fromCentre = haversineDistance(point, safeZone);
    const inside = fromCentre <= safeZone.radius;

    battery = Math.max(12, battery - 0.06);

    fixes.push({
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: 8 + Math.random() * 14,
      speed: distance > 0 ? 0.8 + Math.random() * 0.6 : 0,
      heading: null,
      altitude: null,
      batteryLevel: Math.round(battery),
      isCharging: hour >= 19,
      zoneState: inside ? ZONE_STATE.INSIDE_SAFE : ZONE_STATE.OUTSIDE_SAFE,
      isInsideSafeZone: inside,
      distanceFromSafeZone: Math.round(fromCentre),
      isQueued: false,
      recordedAt: at,
      receivedAt: at,
    });
  }

  return fixes;
}

/**
 * Derive the alerts the generated track would have produced.
 *
 * Built by walking the fixes and watching for transitions, exactly as the live
 * engine does, so the seeded alert feed is consistent with the seeded history
 * rather than being invented separately.
 */
function deriveAlerts({ patient, caretakerId, safeZone, fixes }) {
  const alerts = [];
  let wasOutside = false;
  let lowBatteryRaised = false;

  for (const fix of fixes) {
    const isOutside = fix.isInsideSafeZone === false;

    if (isOutside && !wasOutside) {
      const beyond = Math.max(0, fix.distanceFromSafeZone - safeZone.radius);
      alerts.push({
        patient: patient._id,
        caretaker: caretakerId,
        type: ALERT_TYPES.SAFE_ZONE_EXIT,
        severity: ALERT_SEVERITY[ALERT_TYPES.SAFE_ZONE_EXIT],
        title: ALERT_TITLES[ALERT_TYPES.SAFE_ZONE_EXIT],
        message: `${patient.name} is ${Math.round(beyond)} m beyond the "${safeZone.name}" safe zone.`,
        zoneName: safeZone.name,
        location: { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy },
        metadata: { zoneName: safeZone.name, distanceBeyondEdge: Math.round(beyond) },
        safeZone: safeZone._id,
        isRead: true,
        isResolved: true,
        readAt: fix.recordedAt,
        resolvedAt: fix.recordedAt,
        createdAt: fix.recordedAt,
        updatedAt: fix.recordedAt,
      });
    } else if (!isOutside && wasOutside) {
      alerts.push({
        patient: patient._id,
        caretaker: caretakerId,
        type: ALERT_TYPES.SAFE_ZONE_RETURN,
        severity: ALERT_SEVERITY[ALERT_TYPES.SAFE_ZONE_RETURN],
        title: ALERT_TITLES[ALERT_TYPES.SAFE_ZONE_RETURN],
        message: `${patient.name} is back inside the "${safeZone.name}" safe zone.`,
        zoneName: safeZone.name,
        location: { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy },
        safeZone: safeZone._id,
        isRead: true,
        isResolved: true,
        createdAt: fix.recordedAt,
        updatedAt: fix.recordedAt,
      });
    }

    if (!lowBatteryRaised && fix.batteryLevel <= env.LOW_BATTERY_THRESHOLD && !fix.isCharging) {
      lowBatteryRaised = true;
      alerts.push({
        patient: patient._id,
        caretaker: caretakerId,
        type: ALERT_TYPES.LOW_BATTERY,
        severity: ALERT_SEVERITY[ALERT_TYPES.LOW_BATTERY],
        title: ALERT_TITLES[ALERT_TYPES.LOW_BATTERY],
        message: `${patient.name}'s device battery is at ${fix.batteryLevel}%.`,
        location: { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy },
        metadata: { batteryLevel: fix.batteryLevel },
        createdAt: fix.recordedAt,
        updatedAt: fix.recordedAt,
      });
    }

    wasOutside = isOutside;
  }

  return alerts;
}

async function seed() {
  await mongoose.connect(env.MONGODB_URI);
  logger.info(`Connected to ${env.MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);

  // ----------------------------------------------------------------- caretaker
  let caretaker = await Caretaker.findOne({ email: DEMO_EMAIL });
  if (!caretaker) {
    caretaker = await Caretaker.create({
      name: 'Demo Caretaker',
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD, // hashed by the model's pre-save hook
      phone: '+44 7700 900000',
      organisation: 'Meadowview Community Care',
    });
    logger.info(`Created caretaker ${DEMO_EMAIL}`);
  } else {
    logger.info(`Caretaker ${DEMO_EMAIL} already exists, reusing`);
  }

  // Clear this caretaker's previous demo data.
  const existing = await Patient.find({ caretaker: caretaker._id }).select('_id');
  if (existing.length) {
    const ids = existing.map((patient) => patient._id);
    await Promise.all([
      Location.deleteMany({ patient: { $in: ids } }),
      Alert.deleteMany({ patient: { $in: ids } }),
      SafeZone.deleteMany({ patient: { $in: ids } }),
      DangerZone.deleteMany({ patient: { $in: ids } }),
      TrackingSession.deleteMany({ patient: { $in: ids } }),
      Patient.deleteMany({ _id: { $in: ids } }),
    ]);
    logger.info(`Replaced ${existing.length} existing demo patients`);
  }

  const summary = [];

  for (const spec of PATIENTS) {
    const patient = await Patient.create({
      caretaker: caretaker._id,
      name: spec.name,
      patientCode: spec.patientCode,
      password: DEMO_DEVICE_PASSWORD,
      age: spec.age,
      gender: spec.gender,
      medicalNotes: spec.medicalNotes,
      emergencyContact: spec.emergencyContact,
    });

    const safeZone = await SafeZone.create({
      patient: patient._id,
      caretaker: caretaker._id,
      name: 'Home',
      description: 'Everyday safe area around the house.',
      latitude: spec.home.latitude,
      longitude: spec.home.longitude,
      radius: spec.safeRadius,
      isPrimary: true,
    });

    await DangerZone.create(
      spec.danger.map((zone) => ({
        patient: patient._id,
        caretaker: caretaker._id,
        name: zone.name,
        category: zone.category,
        description: zone.description,
        latitude: spec.home.latitude + zone.offset.lat,
        longitude: spec.home.longitude + zone.offset.lng,
        radius: zone.radius,
      }))
    );

    // ---------------------------------------------------------------- history
    let allFixes = [];
    for (let dayOffset = HISTORY_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
      allFixes = allFixes.concat(buildDayTrack({ spec, safeZone, dayOffset }));
    }

    const session = await TrackingSession.create({
      patient: patient._id,
      caretaker: caretaker._id,
      startedAt: allFixes[0]?.recordedAt || new Date(),
      endedAt: null,
      fixCount: allFixes.length,
      lastFixAt: allFixes[allFixes.length - 1]?.recordedAt || null,
      userAgent: 'Seeded demo device',
    });

    await Location.insertMany(
      allFixes.map((fix) => ({
        ...fix,
        patient: patient._id,
        caretaker: caretaker._id,
        trackingSession: session._id,
      }))
    );

    const alerts = deriveAlerts({
      patient,
      caretakerId: caretaker._id,
      safeZone,
      fixes: allFixes,
    });
    if (alerts.length) await Alert.insertMany(alerts);

    // -------------------------------------------------------- live status cache
    const last = allFixes[allFixes.length - 1];
    patient.liveStatus = {
      isOnline: false, // nothing is actually reporting yet
      latitude: last.latitude,
      longitude: last.longitude,
      accuracy: last.accuracy,
      speed: last.speed,
      batteryLevel: last.batteryLevel,
      isCharging: last.isCharging,
      zoneState: last.zoneState,
      activeDangerZones: [],
      dangerZoneName: null,
      distanceFromSafeZone: last.distanceFromSafeZone,
      lastSeenAt: last.recordedAt,
      lastFixAt: last.recordedAt,
    };
    await patient.save();

    summary.push({
      name: patient.name,
      code: patient.patientCode,
      fixes: allFixes.length,
      alerts: alerts.length,
    });
  }

  logger.info('Seed complete');

  console.log('\n  Caretaker dashboard login');
  console.log(`    ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log('\n  Patient device logins (password for all three)');
  console.log(`    password: ${DEMO_DEVICE_PASSWORD}`);
  for (const row of summary) {
    console.log(`    ${row.name.padEnd(20)} ${row.code}  (${row.fixes} fixes, ${row.alerts} alerts)`);
  }
  console.log('');

  await mongoose.disconnect();
}

seed().catch((err) => {
  logger.error('Seed failed:', err.message, err.stack);
  process.exitCode = 1;
  mongoose.disconnect();
});
