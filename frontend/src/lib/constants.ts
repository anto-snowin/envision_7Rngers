/** Shared constants. Anything the backend also needs to agree on lives here. */

/**
 * How often the patient device uploads a fix.
 *
 * Three minutes is the product requirement, and it drives several other numbers
 * below: a device is only considered offline once it has missed roughly two
 * cycles, and the geolocation watch is allowed to serve a cached fix for up to
 * one cycle.
 */
export const LOCATION_INTERVAL_MS = 3 * 60 * 1000;
export const LOCATION_INTERVAL_LABEL = '3 minutes';

/** A device that has not reported for this long is shown as offline. */
export const OFFLINE_THRESHOLD_MS = 7 * 60 * 1000;

/** Socket heartbeat, so presence survives a stretch with no GPS movement. */
export const HEARTBEAT_MS = 45 * 1000;

/** Cap on how many queued fixes are kept while offline (oldest dropped). */
export const QUEUE_LIMIT = 500;

export const STORAGE_KEYS = {
  token: 'sentinel.token',
  role: 'sentinel.role',
} as const;

export const ROLES = {
  patient: 'patient',
  caretaker: 'caretaker',
} as const;

export const ZONE_KINDS = {
  safe: 'safe',
  danger: 'danger',
} as const;

/** Danger-zone presets, matching the hazards named in the project brief. */
export const DANGER_ZONE_CATEGORIES = [
  { value: 'railway', label: 'Railway track' },
  { value: 'water', label: 'River / water body' },
  { value: 'forest', label: 'Forest area' },
  { value: 'highway', label: 'Highway / main road' },
  { value: 'construction', label: 'Construction site' },
  { value: 'industrial', label: 'Industrial area' },
  { value: 'other', label: 'Other hazard' },
] as const;

export const ALERT_TYPES = {
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
  TRACKING_STOPPED: 'TRACKING_STOPPED',
} as const;

export const ALERT_LABELS: Record<string, string> = {
  SAFE_ZONE_EXIT: 'Left safe zone',
  SAFE_ZONE_RETURN: 'Back in safe zone',
  DANGER_ZONE_ENTRY: 'Entered danger zone',
  DANGER_ZONE_EXIT: 'Left danger zone',
  SOS: 'SOS pressed',
  LOW_BATTERY: 'Low battery',
  GPS_UNAVAILABLE: 'GPS unavailable',
  INTERNET_DISCONNECTED: 'Device offline',
  INTERNET_RESTORED: 'Device back online',
  PATIENT_OFFLINE: 'No contact from device',
  TRACKING_STOPPED: 'Tracking stopped',
};

export const SOCKET_EVENTS = {
  LOCATION_UPDATE: 'location:update',
  ALERT_NEW: 'alert:new',
  ALERT_UPDATE: 'alert:update',
  PRESENCE_UPDATE: 'presence:update',
  ZONES_UPDATE: 'zones:update',
  HEARTBEAT: 'device:heartbeat',
} as const;

/** OpenStreetMap raster tiles. Attribution is required by the ODbL licence. */
export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Fallback map centre when a patient has never reported a fix (New Delhi). */
export const MAP_FALLBACK_CENTER: [number, number] = [28.6139, 77.209];
