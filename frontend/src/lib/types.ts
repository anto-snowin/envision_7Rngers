/**
 * Shapes returned by the API.
 *
 * These mirror the `toPublic` serialisers on the Mongoose models in `backend/`,
 * not the schemas themselves — the wire format is deliberately flatter than
 * the stored documents.
 */

export type Role = 'patient' | 'caretaker';
export type ZoneKind = 'safe' | 'danger';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ZoneState = 'inside_safe' | 'outside_safe' | 'in_danger' | 'unknown';
export type Gender = 'male' | 'female' | 'other' | 'unspecified';

export interface Caretaker {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  createdAt?: string;
}

export interface LiveStatus {
  isOnline: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
  zoneState: ZoneState;
  /** Null until the first fix, or when the patient has no safe zone yet. */
  insideSafeZone: boolean | null;
  /** Name of a danger zone the patient is currently inside, if any. */
  dangerZone: string | null;
  distanceFromSafeZone: number | null;
  lastSeenAt: string | null;
  recordedAt: string | null;
}

export interface Patient {
  id: string;
  name: string;
  patientCode: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: Gender;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  medicalNotes: string;
  isActive: boolean;
  liveStatus: LiveStatus;
  createdAt?: string;
  updatedAt?: string;
  /** Returned only by create and password-reset, and only once. */
  temporaryPassword?: string;
}

/** Trimmed patient identity returned to the patient's own device after login. */
export interface PatientSelf {
  id: string;
  name: string;
  patientCode: string;
  caretakerName: string | null;
  caretakerPhone: string | null;
}

export interface LocationFix {
  id: string;
  patientId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
  connection: 'online' | 'queued';
  zoneState: ZoneState;
  insideSafeZone: boolean | null;
  distanceFromSafeZone: number | null;
  recordedAt: string;
  createdAt?: string | null;
}

export interface Zone {
  id: string;
  patientId: string;
  kind: ZoneKind;
  name: string;
  category: string | null;
  description: string;
  latitude: number;
  longitude: number;
  radius: number;
  severity: AlertSeverity | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Alert {
  id: string;
  patientId: string;
  patientName: string | null;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  zoneName: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface TrackingSession {
  id: string;
  patientId: string;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  fixCount: number;
  queuedFixCount: number;
  lastFixAt: string | null;
  userAgent: string | null;
}

export interface HistorySummary {
  points: number;
  distanceMeters: number;
  minutesOutsideSafeZone: number;
  outsideFixes: number;
  firstFixAt: string | null;
  lastFixAt: string | null;
}

/** `meta` block on paginated list endpoints. */
export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/** Every endpoint answers with this envelope. */
export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
  meta?: PaginatedMeta;
}

/** A fix captured on the device, before the server has accepted it. */
export interface PendingFix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
  recordedAt: string;
  /** Set when the fix sat in the offline queue before upload. */
  queued?: boolean;
}

/* ------------------------------------------------- real-time event payloads --- */

export interface LocationUpdateEvent {
  patientId: string;
  patientName: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
  zoneState: ZoneState;
  insideSafeZone: boolean | null;
  distanceFromSafeZone: number | null;
  dangerZone: string | null;
  dangerZoneIds: string[];
  isQueued: boolean;
  recordedAt: string;
  locationId: string;
}

export interface PresenceEvent {
  patientId: string;
  patientName: string;
  isOnline?: boolean;
  socketConnected?: boolean;
  reason: string;
  batteryLevel?: number | null;
  isCharging?: boolean | null;
  lastSeenAt: string | null;
}

export interface ZonesChangedEvent {
  patientId: string;
  kind: ZoneKind;
  action: 'created' | 'updated' | 'deleted';
}

export interface PatientChangedEvent {
  patientId: string;
  action: 'created' | 'updated' | 'deleted';
}
