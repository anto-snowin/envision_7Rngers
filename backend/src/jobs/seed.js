/**
 * Database seeder — creates a demo caretaker, three patients with safe zones,
 * a set of realistic danger zones, and a few days of plausible location history
 * so the dashboard and analytics charts have something to show.
 *
 *   npm run seed            # seed, keeping existing data
 *   npm run seed -- --reset # wipe the collections first
 *
 * Intended for development and demos only.
 */

const { connectDatabase, disconnectDatabase } = require('../config/db');
const { User, Patient, Location, Alert, Geofence, DangerZone, Session } = require('../models');
const { ALERT_TYPES, ZONE_STATE } = require('../utils/constants');
const { haversineDistance } = require('../utils/geo');
const logger = require('../utils/logger');

const DEMO_EMAIL = 'caretaker@demo.com';
const DEMO_PASSWORD = 'Demo1234';

// Central London area, so the OpenStreetMap tiles show real streets.
const CITY = { latitude: 51.5074, longitude: -0.1278 };

/** Offset a coordinate by metres. Good enough at city scale. */
function offset(origin, northM, eastM) {
  const latPerM = 1 / 111320;
  const lngPerM = 1 / (111320 * Math.cos((origin.latitude * Math.PI) / 180));
  return {
    latitude: Number((origin.latitude + northM * latPerM).toFixed(6)),
    longitude: Number((origin.longitude + eastM * lngPerM).toFixed(6)),
  };
}

const PATIENTS = [
  {
    name: 'Harold Smith',
    age: 78,
    gender: 'male',
    conditionStage: 'moderate',
    medicalNotes:
      "Moderate Alzheimer's. History of afternoon wandering towards the old railway line. " +
      'Medication: donepezil 10 mg daily. Responds well to being called by his first name.',
    emergencyContact: {
      name: 'Jane Smith',
      relationship: 'Daughter',
      phone: '+44 7700 900111',
      altPhone: '+44 20 7946 0111',
    },
    home: offset(CITY, 0, 0),
    address: '12 Rosewood Avenue, London',
    safeRadius: 250,
  },
  {
    name: 'Margaret Doyle',
    age: 84,
    gender: 'female',
    conditionStage: 'advanced',
    medicalNotes:
      'Advanced vascular dementia. Limited mobility, uses a walking frame. ' +
      'Cannot reliably find her way home from beyond the end of the street.',
    emergencyContact: {
      name: 'Patrick Doyle',
      relationship: 'Son',
      phone: '+44 7700 900222',
    },
    home: offset(CITY, 900, 700),
    address: '4 Linden Court, London',
    safeRadius: 150,
  },
  {
    name: 'Arthur Bello',
    age: 71,
    gender: 'male',
    conditionStage: 'early',
    medicalNotes:
      'Early-stage dementia, still walks to the local shops independently. ' +
      'Tracking is precautionary; family wants alerts only for longer absences.',
    emergencyContact: {
      name: 'Amina Bello',
      relationship: 'Wife',
      phone: '+44 7700 900333',
    },
    home: offset(CITY, -700, 1100),
    address: '88 Harper Road, London',
    safeRadius: 400,
  },
];

const DANGER_ZONES = [
  {
    name: 'Disused railway line',
    category: 'railway',
    description: 'Unfenced track bed running east to west. No crossing points for 400 m.',
    position: offset(CITY, 1400, -200),
    radius: 220,
    severity: 'critical',
  },
  {
    name: 'Canal towpath',
    category: 'river',
    description: 'Deep water with no railings along the northern bank.',
    position: offset(CITY, 600, -900),
    radius: 180,
    severity: 'critical',
  },
  {
    name: 'Eastgate construction site',
    category: 'construction',
    description: 'Active build with open excavations. Hoarding has a gap on the south side.',
    position: offset(CITY, -400, -1200),
    radius: 160,
    severity: 'high',
  },
  {
    name: 'A501 dual carriageway',
    category: 'highway',
    description: 'Fast four-lane road. Nearest pedestrian crossing is 300 m east.',
    position: offset(CITY, -1100, 300),
    radius: 250,
    severity: 'critical',
  },
  {
    name: 'Brookfield industrial estate',
    category: 'industrial',
    description: 'HGV loading yards with poor pedestrian visibility.',
    position: offset(CITY, 1200, 1500),
    radius: 300,
    severity: 'high',
  },
  {
    name: 'Ashgrove woods',
    category: 'forest',
    description: 'Dense woodland with no mobile signal in the interior.',
    position: offset(CITY, 1800, 900),
    radius: 450,
    severity: 'high',
  },
];

/**
 * Build a believable day of movement: mostly at home, with one or two walks.
 * Returns fixes in chronological order.
 */
function buildDayTrack({ patient, geofence, dayOffset, walks }) {
  const fixes = [];
  const day = new Date();
  day.setDate(day.getDate() - dayOffset);
  day.setHours(8, 0, 0, 0);

  // One fix per 2 minutes during waking hours keeps the seed small while still
  // producing smooth charts and a drawable trail.
  const stepMs = 2 * 60 * 1000;
  const totalSteps = (7 * 60) / 2; // 08:00 to 15:00

  let position = { ...patient.home };
  let walkIndex = 0;
  let stepsIntoWalk = -1;
  let currentWalk = null;

  for (let i = 0; i < totalSteps; i += 1) {
    const recordedAt = new Date(day.getTime() + i * stepMs);

    const startingWalk = walks[walkIndex] && walks[walkIndex].startStep === i;
    if (startingWalk) {
      currentWalk = walks[walkIndex];
      stepsIntoWalk = 0;
      walkIndex += 1;
    }

    if (currentWalk) {
      const progress = stepsIntoWalk / currentWalk.steps;
      if (progress >= 1) {
        currentWalk = null;
        stepsIntoWalk = -1;
        position = { ...patient.home };
      } else {
        // Out and back along a straight-ish line, with a little jitter.
        const legProgress = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
        const target = currentWalk.target;
        position = {
          latitude:
            patient.home.latitude +
            (target.latitude - patient.home.latitude) * legProgress +
            (Math.random() - 0.5) * 0.00015,
          longitude:
            patient.home.longitude +
            (target.longitude - patient.home.longitude) * legProgress +
            (Math.random() - 0.5) * 0.00015,
        };
        stepsIntoWalk += 1;
      }
    } else {
      // Sitting at home: small GPS jitter only.
      position = {
        latitude: patient.home.latitude + (Math.random() - 0.5) * 0.0002,
        longitude: patient.home.longitude + (Math.random() - 0.5) * 0.0002,
      };
    }

    const distance = haversineDistance(position, geofence);
    const inside = distance <= geofence.radius;

    fixes.push({
      latitude: Number(position.latitude.toFixed(6)),
      longitude: Number(position.longitude.toFixed(6)),
      accuracy: Math.round(8 + Math.random() * 20),
      speed: currentWalk ? Number((0.8 + Math.random() * 0.6).toFixed(2)) : 0,
      // Battery drains across the day and resets overnight.
      batteryLevel: Math.max(8, Math.round(95 - (i / totalSteps) * 70)),
      isCharging: false,
      zoneState: inside ? ZONE_STATE.INSIDE_SAFE : ZONE_STATE.OUTSIDE_SAFE,
      isInsideSafeZone: inside,
      distanceFromHome: Math.round(distance),
      recordedAt,
      receivedAt: recordedAt,
    });
  }

  return fixes;
}

async function seed() {
  const reset = process.argv.includes('--reset');

  await connectDatabase();

  if (reset) {
    logger.warn('--reset passed: clearing all collections');
    await Promise.all([
      User.deleteMany({}),
      Patient.deleteMany({}),
      Location.deleteMany({}),
      Alert.deleteMany({}),
      Geofence.deleteMany({}),
      DangerZone.deleteMany({}),
      Session.deleteMany({}),
    ]);
  }

  // ----------------------------------------------------------------- caretaker
  let caretaker = await User.findOne({ email: DEMO_EMAIL });
  if (!caretaker) {
    caretaker = await User.create({
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

  // -------------------------------------------------------------- danger zones
  await DangerZone.deleteMany({ caretaker: caretaker._id });
  const dangerZones = await DangerZone.create(
    DANGER_ZONES.map((zone) => ({
      caretaker: caretaker._id,
      name: zone.name,
      category: zone.category,
      description: zone.description,
      latitude: zone.position.latitude,
      longitude: zone.position.longitude,
      radius: zone.radius,
      severity: zone.severity,
      patients: [], // applies to every patient
    }))
  );
  logger.info(`Created ${dangerZones.length} danger zones`);

  // ------------------------------------------------------------------ patients
  const existing = await Patient.find({ caretaker: caretaker._id }).select('_id');
  if (existing.length) {
    const ids = existing.map((p) => p._id);
    await Promise.all([
      Location.deleteMany({ patient: { $in: ids } }),
      Alert.deleteMany({ patient: { $in: ids } }),
      Geofence.deleteMany({ patient: { $in: ids } }),
      Patient.deleteMany({ _id: { $in: ids } }),
    ]);
    logger.info(`Replaced ${existing.length} existing demo patients`);
  }

  const summary = [];

  for (const spec of PATIENTS) {
    const patient = await Patient.create({
      caretaker: caretaker._id,
      name: spec.name,
      age: spec.age,
      gender: spec.gender,
      conditionStage: spec.conditionStage,
      medicalNotes: spec.medicalNotes,
      emergencyContact: spec.emergencyContact,
      homeLocation: {
        label: 'Home',
        address: spec.address,
        latitude: spec.home.latitude,
        longitude: spec.home.longitude,
      },
    });

    const geofence = await Geofence.create({
      patient: patient._id,
      caretaker: caretaker._id,
      name: `${spec.name.split(' ')[0]}'s safe zone`,
      latitude: spec.home.latitude,
      longitude: spec.home.longitude,
      radius: spec.safeRadius,
      address: spec.address,
    });

    // Five days of history, with a longer walk that leaves the safe zone.
    const allFixes = [];
    for (let dayOffset = 4; dayOffset >= 0; dayOffset -= 1) {
      const walks = [
        {
          startStep: 30,
          steps: 25,
          target: offset(spec.home, 180 + Math.random() * 120, 120),
        },
      ];

      // Every other day, one walk goes well beyond the safe zone.
      if (dayOffset % 2 === 0) {
        walks.push({
          startStep: 120,
          steps: 40,
          target: offset(spec.home, spec.safeRadius * 2.5, spec.safeRadius * 1.2),
        });
      }

      allFixes.push(
        ...buildDayTrack({ patient: { ...spec, home: spec.home }, geofence, dayOffset, walks })
      );
    }

    const docs = allFixes.map((fix) => ({
      ...fix,
      patient: patient._id,
      caretaker: caretaker._id,
    }));
    await Location.insertMany(docs);

    // Derive a few alerts from the generated track, so the alert feed and the
    // analytics charts agree with the location history.
    const alerts = [];
    let wasOutside = false;
    for (const fix of allFixes) {
      if (!fix.isInsideSafeZone && !wasOutside) {
        alerts.push({
          patient: patient._id,
          caretaker: caretaker._id,
          type: ALERT_TYPES.SAFE_ZONE_EXIT,
          severity: 'high',
          title: 'Patient left the safe zone',
          message: `${spec.name} is ${fix.distanceFromHome - geofence.radius} m beyond the safe zone.`,
          location: { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy },
          metadata: { zoneName: geofence.name, distanceFromCentre: fix.distanceFromHome },
          geofence: geofence._id,
          isRead: true,
          isResolved: true,
          resolvedAt: fix.recordedAt,
          resolutionNote: 'Returned home safely',
          createdAt: fix.recordedAt,
          updatedAt: fix.recordedAt,
        });
        wasOutside = true;
      } else if (fix.isInsideSafeZone && wasOutside) {
        wasOutside = false;
      }

      if (fix.batteryLevel <= 20 && fix.batteryLevel > 18) {
        alerts.push({
          patient: patient._id,
          caretaker: caretaker._id,
          type: ALERT_TYPES.LOW_BATTERY,
          severity: 'medium',
          title: 'Device battery low',
          message: `${spec.name}'s device battery is at ${fix.batteryLevel}%.`,
          location: { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy },
          metadata: { batteryLevel: fix.batteryLevel },
          isRead: true,
          createdAt: fix.recordedAt,
          updatedAt: fix.recordedAt,
        });
      }
    }

    if (alerts.length) await Alert.insertMany(alerts);

    // Leave the patient looking recently-seen so the dashboard is not empty.
    const last = allFixes[allFixes.length - 1];
    patient.liveStatus = {
      isOnline: false,
      latitude: last.latitude,
      longitude: last.longitude,
      accuracy: last.accuracy,
      speed: 0,
      batteryLevel: last.batteryLevel,
      isCharging: false,
      zoneState: last.zoneState,
      activeDangerZones: [],
      distanceFromHome: last.distanceFromHome,
      lastSeenAt: last.recordedAt,
      lastFixAt: last.recordedAt,
    };
    await patient.save();

    summary.push({
      name: patient.name,
      trackingCode: patient.trackingCode,
      fixes: allFixes.length,
      alerts: alerts.length,
    });
  }

  // ------------------------------------------------------------------- report

  console.log('\n' + '='.repeat(66));
  console.log('  Seed complete');
  console.log('='.repeat(66));
  console.log(`\n  Caretaker login:  ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
  console.log(`  Danger zones:     ${dangerZones.length}`);
  console.log('\n  Patient tracking links (open on a phone):');
  for (const row of summary) {
    console.log(`    ${row.name.padEnd(18)} /track/${row.trackingCode}`);
    console.log(`    ${''.padEnd(18)} ${row.fixes} fixes, ${row.alerts} alerts`);
  }
  console.log('\n' + '='.repeat(66) + '\n');

  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Seed failed:', err.message, err.stack);
    process.exit(1);
  });
