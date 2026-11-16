/**
 * Patient presence tracking.
 *
 * A patient's phone posts a fix every three minutes. If nothing arrives for
 * `OFFLINE_THRESHOLD_MS` — a little over two cycles — the device has lost
 * connectivity, been closed, or run out of battery. All of those matter to the
 * caretaker, because a silent tracker is indistinguishable from a safe patient.
 *
 * A periodic sweep (rather than a per-patient timer) keeps this O(1) in timers
 * no matter how many patients exist.
 */
const { Patient } = require('../models');
const { ALERT_TYPES, SOCKET_EVENTS } = require('../utils/constants');
const alertService = require('./alert.service');
const emitter = require('../sockets/emitter');
const env = require('../config/env');
const logger = require('../utils/logger');

let sweepTimer = null;

/**
 * Find patients marked online whose last fix is older than the threshold,
 * flip them to offline and raise one alert each.
 *
 * @returns {Promise<number>} how many patients went offline
 */
async function sweepOfflinePatients() {
  const cutoff = new Date(Date.now() - env.OFFLINE_THRESHOLD_MS);

  const stale = await Patient.find({
    isActive: true,
    'liveStatus.isOnline': true,
    'liveStatus.lastSeenAt': { $ne: null, $lt: cutoff },
  });

  for (const patient of stale) {
    patient.liveStatus.isOnline = false;
    await patient.save();

    const minutesSilent = Math.round(
      (Date.now() - new Date(patient.liveStatus.lastSeenAt).getTime()) / 60000
    );

    emitter.emitToCaretaker(patient.caretaker, SOCKET_EVENTS.PRESENCE_UPDATE, {
      patientId: String(patient._id),
      patientName: patient.name,
      isOnline: false,
      reason: 'no_recent_fix',
      lastSeenAt: patient.liveStatus.lastSeenAt,
    });

    await alertService.createAlert({
      patient,
      type: ALERT_TYPES.PATIENT_OFFLINE,
      message:
        `No location update from ${patient.name} for ${minutesSilent} minutes. ` +
        'The device may be offline, the page closed, or the battery flat.',
      location: {
        latitude: patient.liveStatus.latitude,
        longitude: patient.liveStatus.longitude,
        accuracy: patient.liveStatus.accuracy,
      },
      metadata: {
        lastSeenAt: patient.liveStatus.lastSeenAt,
        minutesSinceLastFix: minutesSilent,
        thresholdMs: env.OFFLINE_THRESHOLD_MS,
      },
    });
  }

  if (stale.length) {
    logger.info(`Presence sweep marked ${stale.length} patient(s) offline`);
  }
  return stale.length;
}

/** Mark a patient online and notify the caretaker. */
async function markOnline(patient) {
  const wasOffline = !patient.liveStatus?.isOnline;

  await Patient.updateOne(
    { _id: patient._id },
    { 'liveStatus.isOnline': true, 'liveStatus.lastSeenAt': new Date() }
  );

  if (wasOffline) {
    emitter.emitToCaretaker(patient.caretaker, SOCKET_EVENTS.PRESENCE_UPDATE, {
      patientId: String(patient._id),
      patientName: patient.name,
      isOnline: true,
      reason: 'reconnected',
      lastSeenAt: new Date(),
    });
  }
}

/** Start the periodic sweep. Idempotent. */
function startPresenceSweep() {
  if (sweepTimer) return sweepTimer;

  sweepTimer = setInterval(() => {
    sweepOfflinePatients().catch((err) => logger.error('Presence sweep failed:', err.message));
  }, env.PRESENCE_SWEEP_MS);

  // Do not hold the event loop open on shutdown.
  if (sweepTimer.unref) sweepTimer.unref();

  logger.info(`Presence sweep running every ${env.PRESENCE_SWEEP_MS} ms`);
  return sweepTimer;
}

/** Stop the sweep (used on graceful shutdown and in tests). */
function stopPresenceSweep() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

module.exports = { sweepOfflinePatients, markOnline, startPresenceSweep, stopPresenceSweep };
