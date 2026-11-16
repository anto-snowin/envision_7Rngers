/**
 * Alert creation and fan-out.
 *
 * Every alert in the system is born here so that de-duplication, severity
 * assignment and real-time delivery behave identically no matter which part of
 * the engine raised it.
 */
const { Alert } = require('../models');
const { ALERT_SEVERITY, ALERT_TITLES, ALERT_TYPES, SEVERITY, SOCKET_EVENTS } =
  require('../utils/constants');
const env = require('../config/env');
const logger = require('../utils/logger');
const emitter = require('../sockets/emitter');

/**
 * Has an identical alert already been raised for this patient very recently?
 *
 * Transition detection in the geofence engine is the primary defence against
 * repeats; this is the backstop for everything else — a device reporting GPS
 * trouble on every attempt, for instance. One alert per type per cooldown
 * window is enough to convey the situation.
 *
 * SOS is deliberately exempt: if the patient presses it twice, the caretaker
 * should see it twice.
 *
 * @param {string} patientId
 * @param {string} type
 * @param {string|null} dangerZoneId scopes the cooldown to one specific zone
 */
async function isInCooldown(patientId, type, dangerZoneId = null) {
  if (type === ALERT_TYPES.SOS) return false;

  const since = new Date(Date.now() - env.ALERT_COOLDOWN_MS);
  const query = { patient: patientId, type, createdAt: { $gte: since } };
  if (dangerZoneId) query.dangerZone = dangerZoneId;

  const existing = await Alert.findOne(query).select('_id').lean();
  return Boolean(existing);
}

/**
 * Create an alert and push it to the caretaker in real time.
 *
 * @param {object} input
 * @param {object} input.patient document or lean object with `_id`, `name`, `caretaker`
 * @param {string} input.type one of ALERT_TYPES
 * @param {string} [input.message]
 * @param {string} [input.zoneName]
 * @param {object} [input.location] { latitude, longitude, accuracy }
 * @param {object} [input.metadata]
 * @param {string} [input.dangerZone]
 * @param {string} [input.safeZone]
 * @param {string} [input.severity] overrides the type's default severity
 * @param {boolean} [input.bypassCooldown]
 * @returns {Promise<object|null>} the serialised alert, or null if suppressed
 */
async function createAlert({
  patient,
  type,
  message = '',
  zoneName = null,
  location = null,
  metadata = {},
  dangerZone = null,
  safeZone = null,
  severity = null,
  bypassCooldown = false,
}) {
  if (!patient || !type) return null;

  const patientId = patient._id || patient.id;

  if (!bypassCooldown && (await isInCooldown(patientId, type, dangerZone))) {
    logger.debug(`Alert ${type} for patient ${patientId} suppressed by cooldown`);
    return null;
  }

  const alert = await Alert.create({
    patient: patientId,
    caretaker: patient.caretaker,
    type,
    severity: severity || ALERT_SEVERITY[type] || SEVERITY.MEDIUM,
    title: ALERT_TITLES[type] || 'Alert',
    message,
    zoneName,
    location: location
      ? {
          latitude: location.latitude ?? null,
          longitude: location.longitude ?? null,
          accuracy: location.accuracy ?? null,
        }
      : undefined,
    metadata,
    dangerZone,
    safeZone,
  });

  // The patient's name travels with the alert so the dashboard can render the
  // row without a follow-up fetch per alert.
  const payload = Alert.toPublic(alert, patient.name);

  emitter.emitToCaretaker(patient.caretaker, SOCKET_EVENTS.ALERT_NEW, payload);
  logger.info(`Alert raised: ${type} for patient ${patient.name || patientId}`);

  return payload;
}

/** Mark one alert read. Scoped to the caretaker who owns it. */
async function markRead(alertId, caretakerId) {
  const alert = await Alert.findOneAndUpdate(
    { _id: alertId, caretaker: caretakerId },
    { isRead: true, readAt: new Date() },
    { new: true }
  ).populate('patient', 'name');

  if (alert) {
    emitter.emitToCaretaker(caretakerId, SOCKET_EVENTS.ALERT_UPDATED, Alert.toPublic(alert));
  }
  return alert;
}

/** Mark every unread alert for a caretaker as read, optionally one patient's. */
async function markAllRead(caretakerId, patientId = null) {
  const query = { caretaker: caretakerId, isRead: false };
  if (patientId) query.patient = patientId;

  const result = await Alert.updateMany(query, { isRead: true, readAt: new Date() });

  // A bulk change is cheaper to communicate as "refetch" than as N events.
  emitter.emitToCaretaker(caretakerId, SOCKET_EVENTS.ALERT_UPDATED, { refetch: true });
  return result.modifiedCount || 0;
}

/** Resolve an alert, optionally recording how it was handled. */
async function resolveAlert(alertId, caretakerId, resolutionNote = '') {
  const alert = await Alert.findOneAndUpdate(
    { _id: alertId, caretaker: caretakerId },
    {
      isResolved: true,
      resolvedAt: new Date(),
      isRead: true,
      readAt: new Date(),
      resolutionNote,
    },
    { new: true }
  ).populate('patient', 'name');

  if (alert) {
    emitter.emitToCaretaker(caretakerId, SOCKET_EVENTS.ALERT_UPDATED, Alert.toPublic(alert));
  }
  return alert;
}

module.exports = { createAlert, isInCooldown, markRead, markAllRead, resolveAlert };
