/**
 * Shared enumerations. Kept in one place so models, services and the frontend
 * all agree on the exact string values that travel over the wire.
 */

/** Alert categories the system can raise. */
const ALERT_TYPES = {
  SAFE_ZONE_EXIT: 'SAFE_ZONE_EXIT',
  SAFE_ZONE_RETURN: 'SAFE_ZONE_RETURN',
  DANGER_ZONE_ENTRY: 'DANGER_ZONE_ENTRY',
  GPS_UNAVAILABLE: 'GPS_UNAVAILABLE',
  INTERNET_DISCONNECTED: 'INTERNET_DISCONNECTED',
  SOS: 'SOS',
  LOW_BATTERY: 'LOW_BATTERY',
  PATIENT_OFFLINE: 'PATIENT_OFFLINE',
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
  [ALERT_TYPES.SAFE_ZONE_RETURN]: SEVERITY.INFO,
};

/** Human-readable titles used in alert feeds and toasts. */
const ALERT_TITLES = {
  [ALERT_TYPES.SAFE_ZONE_EXIT]: 'Patient left the safe zone',
  [ALERT_TYPES.SAFE_ZONE_RETURN]: 'Patient returned to the safe zone',
  [ALERT_TYPES.DANGER_ZONE_ENTRY]: 'Patient entered a danger zone',
  [ALERT_TYPES.GPS_UNAVAILABLE]: 'GPS signal unavailable',
  [ALERT_TYPES.INTERNET_DISCONNECTED]: 'Device lost internet connection',
  [ALERT_TYPES.SOS]: 'SOS button pressed',
  [ALERT_TYPES.LOW_BATTERY]: 'Device battery low',
  [ALERT_TYPES.PATIENT_OFFLINE]: 'Patient device offline',
};

/** Preset danger-zone categories offered in the dashboard. */
const DANGER_ZONE_CATEGORIES = [
  'railway',
  'forest',
  'river',
  'construction',
  'highway',
  'industrial',
  'water_body',
  'other',
];

/** Socket.IO event names. */
const SOCKET_EVENTS = {
  // client -> server
  PATIENT_JOIN: 'patient:join',
  PATIENT_HEARTBEAT: 'patient:heartbeat',
  CARETAKER_JOIN: 'caretaker:join',
  SUBSCRIBE_PATIENT: 'patient:subscribe',
  UNSUBSCRIBE_PATIENT: 'patient:unsubscribe',

  // server -> client
  LOCATION_UPDATE: 'location:update',
  ALERT_NEW: 'alert:new',
  ALERT_UPDATED: 'alert:updated',
  PRESENCE_UPDATE: 'presence:update',
  STATS_UPDATE: 'stats:update',
  PATIENT_CHANGED: 'patient:changed',
  GEOFENCE_CHANGED: 'geofence:changed',
  DANGER_ZONE_CHANGED: 'dangerZone:changed',
  ZONE_STATUS: 'zone:status',
};

/** Room naming helpers keep room strings consistent across the codebase. */
const ROOMS = {
  caretaker: (userId) => `caretaker:${userId}`,
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
  ALERT_TYPES,
  SEVERITY,
  ALERT_SEVERITY,
  ALERT_TITLES,
  DANGER_ZONE_CATEGORIES,
  SOCKET_EVENTS,
  ROOMS,
  ZONE_STATE,
};
