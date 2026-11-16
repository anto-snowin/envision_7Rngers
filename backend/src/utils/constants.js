/**
 * Shared enumerations. Kept in one place so models, services and the frontend
 * all agree on the exact string values that travel over the wire.
 *
 * The mirror of this file on the client is `frontend/src/lib/constants.ts`;
 * changing an event name or alert type here means changing it there too.
 */

/** The two kinds of account that can authenticate. */
const ROLES = {
  PATIENT: 'patient',
  CARETAKER: 'caretaker',
};

/** Zone flavours. Both are circles; only the meaning of crossing differs. */
const ZONE_KINDS = {
  SAFE: 'safe',
  DANGER: 'danger',
};

/** Alert categories the system can raise. */
const ALERT_TYPES = {
  SAFE_ZONE_EXIT: 'SAFE_ZONE_EXIT',
  SAFE_ZONE_RETURN: 'SAFE_ZONE_RETURN',
  DANGER_ZONE_ENTRY: 'DANGER_ZONE_ENTRY',
  DANGER_ZONE_EXIT: 'DANGER_ZONE_EXIT',
  SOS: 'SOS',
  LOW_BATTERY: 'LOW_BATTERY',
  GPS_UNAVAILABLE: 'GPS_UNAVAILABLE',
  INTERNET_DISCONNECTED: 'INTERNET_DISCONNECTED',
  INTERNET_RESTORED: 'INTERNET_RESTORED',
  PATIENT_OFFLINE: 'PATIENT_OFFLINE',
  TRACKING_STARTED: 'TRACKING_STARTED',
  TRACKING_STOPPED: 'TRACKING_STOPPED',
};

/** Severity drives colour, sort order and notification urgency in the UI. */
const SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};

/** Default severity for each alert type. */
const ALERT_SEVERITY = {
  [ALERT_TYPES.SOS]: SEVERITY.CRITICAL,
  [ALERT_TYPES.DANGER_ZONE_ENTRY]: SEVERITY.CRITICAL,
  [ALERT_TYPES.SAFE_ZONE_EXIT]: SEVERITY.HIGH,
  [ALERT_TYPES.PATIENT_OFFLINE]: SEVERITY.HIGH,
  [ALERT_TYPES.GPS_UNAVAILABLE]: SEVERITY.MEDIUM,
  [ALERT_TYPES.INTERNET_DISCONNECTED]: SEVERITY.MEDIUM,
  [ALERT_TYPES.LOW_BATTERY]: SEVERITY.MEDIUM,
  [ALERT_TYPES.TRACKING_STOPPED]: SEVERITY.MEDIUM,
  [ALERT_TYPES.DANGER_ZONE_EXIT]: SEVERITY.INFO,
  [ALERT_TYPES.SAFE_ZONE_RETURN]: SEVERITY.INFO,
  [ALERT_TYPES.INTERNET_RESTORED]: SEVERITY.INFO,
  [ALERT_TYPES.TRACKING_STARTED]: SEVERITY.INFO,
};

/** Human-readable titles used in alert feeds and toasts. */
const ALERT_TITLES = {
  [ALERT_TYPES.SAFE_ZONE_EXIT]: 'Patient left the safe zone',
  [ALERT_TYPES.SAFE_ZONE_RETURN]: 'Patient returned to the safe zone',
  [ALERT_TYPES.DANGER_ZONE_ENTRY]: 'Patient entered a danger zone',
  [ALERT_TYPES.DANGER_ZONE_EXIT]: 'Patient left the danger zone',
  [ALERT_TYPES.SOS]: 'SOS button pressed',
  [ALERT_TYPES.LOW_BATTERY]: 'Device battery low',
  [ALERT_TYPES.GPS_UNAVAILABLE]: 'GPS signal unavailable',
  [ALERT_TYPES.INTERNET_DISCONNECTED]: 'Device lost internet connection',
  [ALERT_TYPES.INTERNET_RESTORED]: 'Device back online',
  [ALERT_TYPES.PATIENT_OFFLINE]: 'Patient device offline',
  [ALERT_TYPES.TRACKING_STARTED]: 'Tracking started',
  [ALERT_TYPES.TRACKING_STOPPED]: 'Tracking stopped on the device',
};

/**
 * Alert types a patient device is allowed to report about itself.
 *
 * Everything else is derived server-side from the fixes themselves, so the
 * device cannot invent a zone breach or an SOS from another patient.
 */
const DEVICE_REPORTABLE_ALERTS = [
  ALERT_TYPES.GPS_UNAVAILABLE,
  ALERT_TYPES.INTERNET_DISCONNECTED,
  ALERT_TYPES.INTERNET_RESTORED,
  ALERT_TYPES.TRACKING_STARTED,
  ALERT_TYPES.TRACKING_STOPPED,
];

/** Preset danger-zone categories offered in the dashboard. */
const DANGER_ZONE_CATEGORIES = [
  'railway',
  'water',
  'forest',
  'highway',
  'construction',
  'industrial',
  'other',
];

/** Socket.IO event names. */
const SOCKET_EVENTS = {
  // client -> server
  PATIENT_HEARTBEAT: 'patient:heartbeat',
  SUBSCRIBE_PATIENT: 'patient:subscribe',
  UNSUBSCRIBE_PATIENT: 'patient:unsubscribe',
  STATS_REQUEST: 'stats:request',

  // server -> client
  LOCATION_UPDATE: 'location:update',
  ALERT_NEW: 'alert:new',
  ALERT_UPDATED: 'alert:updated',
  PRESENCE_UPDATE: 'presence:update',
  STATS_UPDATE: 'stats:update',
  PATIENT_CHANGED: 'patient:changed',
  ZONES_CHANGED: 'zones:changed',
};

/** Room naming helpers keep room strings consistent across the codebase. */
const ROOMS = {
  caretaker: (caretakerId) => `caretaker:${caretakerId}`,
  patient: (patientId) => `patient:${patientId}`,
};

/** Zone state recorded on each location fix, used for transition detection. */
const ZONE_STATE = {
  INSIDE_SAFE: 'inside_safe',
  OUTSIDE_SAFE: 'outside_safe',
  IN_DANGER: 'in_danger',
  UNKNOWN: 'unknown',
};

module.exports = {
  ROLES,
  ZONE_KINDS,
  ALERT_TYPES,
  SEVERITY,
  ALERT_SEVERITY,
  ALERT_TITLES,
  DEVICE_REPORTABLE_ALERTS,
  DANGER_ZONE_CATEGORIES,
  SOCKET_EVENTS,
  ROOMS,
  ZONE_STATE,
};
