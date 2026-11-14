/**
 * Client-side mirror of the server's enumerations, plus the presentation
 * metadata (labels, colours, icons) that belongs only to the UI.
 *
 * The string values must match `backend/src/utils/constants.js` exactly.
 */

export const ALERT_TYPES = {
  SAFE_ZONE_EXIT: 'SAFE_ZONE_EXIT',
  SAFE_ZONE_RETURN: 'SAFE_ZONE_RETURN',
  DANGER_ZONE_ENTRY: 'DANGER_ZONE_ENTRY',
  GPS_UNAVAILABLE: 'GPS_UNAVAILABLE',
  INTERNET_DISCONNECTED: 'INTERNET_DISCONNECTED',
  SOS: 'SOS',
  LOW_BATTERY: 'LOW_BATTERY',
  PATIENT_OFFLINE: 'PATIENT_OFFLINE',
};

export const SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};

/**
 * Severity presentation.
 *
 * `rank` drives sorting so the worst alerts float to the top of the feed.
 * Colour is never the only signal — each severity also has a distinct label
 * and icon, so the feed stays readable without colour vision.
 */
export const SEVERITY_META = {
  [SEVERITY.CRITICAL]: {
    label: 'Critical',
    rank: 0,
    icon: '!',
    badge:
      'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900',
    dot: 'bg-severity-critical',
    border: 'border-l-severity-critical',
  },
  [SEVERITY.HIGH]: {
    label: 'High',
    rank: 1,
    icon: '▲',
    badge:
      'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-900',
    dot: 'bg-severity-high',
    border: 'border-l-severity-high',
  },
  [SEVERITY.MEDIUM]: {
    label: 'Medium',
    rank: 2,
    icon: '●',
    badge:
      'bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-950/60 dark:text-yellow-300 dark:ring-yellow-900',
    dot: 'bg-severity-medium',
    border: 'border-l-severity-medium',
  },
  [SEVERITY.LOW]: {
    label: 'Low',
    rank: 3,
    icon: '○',
    badge:
      'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-900',
    dot: 'bg-severity-low',
    border: 'border-l-severity-low',
  },
  [SEVERITY.INFO]: {
    label: 'Info',
    rank: 4,
    icon: 'i',
    badge:
      'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-900',
    dot: 'bg-severity-info',
    border: 'border-l-severity-info',
  },
};

/** Alert type presentation: short label plus the icon used in the feed. */
export const ALERT_TYPE_META = {
  [ALERT_TYPES.SOS]: { label: 'SOS pressed', icon: '🆘', short: 'SOS' },
  [ALERT_TYPES.DANGER_ZONE_ENTRY]: {
    label: 'Entered danger zone',
    icon: '⚠️',
    short: 'Danger zone',
  },
  [ALERT_TYPES.SAFE_ZONE_EXIT]: { label: 'Left safe zone', icon: '🚶', short: 'Left safe zone' },
  [ALERT_TYPES.SAFE_ZONE_RETURN]: {
    label: 'Returned to safe zone',
    icon: '🏠',
    short: 'Returned',
  },
  [ALERT_TYPES.PATIENT_OFFLINE]: { label: 'Device offline', icon: '📵', short: 'Offline' },
  [ALERT_TYPES.GPS_UNAVAILABLE]: { label: 'GPS unavailable', icon: '🛰️', short: 'No GPS' },
  [ALERT_TYPES.INTERNET_DISCONNECTED]: {
    label: 'Lost internet',
    icon: '🌐',
    short: 'No internet',
  },
  [ALERT_TYPES.LOW_BATTERY]: { label: 'Battery low', icon: '🔋', short: 'Low battery' },
};

/** Zone state presentation, used on patient cards and map markers. */
export const ZONE_STATE_META = {
  inside_safe: {
    label: 'In safe zone',
    badge:
      'bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-900',
    marker: '#0d9488',
  },
  outside_safe: {
    label: 'Outside safe zone',
    badge:
      'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-900',
    marker: '#ea580c',
  },
  in_danger: {
    label: 'In danger zone',
    badge:
      'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900',
    marker: '#e11d48',
  },
  unknown: {
    label: 'No zone data',
    badge:
      'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    marker: '#64748b',
  },
};

/** Danger zone categories, matching the server's enum. */
export const DANGER_ZONE_CATEGORIES = [
  { value: 'railway', label: 'Railway / tracks', icon: '🚆' },
  { value: 'forest', label: 'Forest / woodland', icon: '🌲' },
  { value: 'river', label: 'River / canal', icon: '🌊' },
  { value: 'water_body', label: 'Lake / pond', icon: '💧' },
  { value: 'construction', label: 'Construction site', icon: '🏗️' },
  { value: 'highway', label: 'Highway / main road', icon: '🛣️' },
  { value: 'industrial', label: 'Industrial area', icon: '🏭' },
  { value: 'other', label: 'Other hazard', icon: '⚠️' },
];

/** Socket.IO event names. */
export const SOCKET_EVENTS = {
  PATIENT_HEARTBEAT: 'patient:heartbeat',
  SUBSCRIBE_PATIENT: 'patient:subscribe',
  UNSUBSCRIBE_PATIENT: 'patient:unsubscribe',
  LOCATION_UPDATE: 'location:update',
  ALERT_NEW: 'alert:new',
  ALERT_UPDATED: 'alert:updated',
  PRESENCE_UPDATE: 'presence:update',
  STATS_UPDATE: 'stats:update',
  PATIENT_CHANGED: 'patient:changed',
  GEOFENCE_CHANGED: 'geofence:changed',
  DANGER_ZONE_CHANGED: 'dangerZone:changed',
};

/** Tracking cadence for the patient portal, in milliseconds. */
export const DEFAULT_TRACKING_INTERVAL_MS = 5000;

/** Default map view (central London) used before any fix arrives. */
export const DEFAULT_MAP_CENTER = { latitude: 51.5074, longitude: -0.1278 };
export const DEFAULT_MAP_ZOOM = 14;

/** Page-size options for paginated tables. */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/** Look up severity metadata, falling back to "medium" for unknown values. */
export function severityMeta(severity) {
  return SEVERITY_META[severity] || SEVERITY_META[SEVERITY.MEDIUM];
}

/** Look up alert-type metadata, with a generic fallback. */
export function alertTypeMeta(type) {
  return ALERT_TYPE_META[type] || { label: type || 'Alert', icon: '🔔', short: 'Alert' };
}

/** Look up zone-state metadata. */
export function zoneStateMeta(state) {
  return ZONE_STATE_META[state] || ZONE_STATE_META.unknown;
}

/** Look up a danger-zone category. */
export function categoryMeta(value) {
  return (
    DANGER_ZONE_CATEGORIES.find((entry) => entry.value === value) ||
    DANGER_ZONE_CATEGORIES[DANGER_ZONE_CATEGORIES.length - 1]
  );
}
