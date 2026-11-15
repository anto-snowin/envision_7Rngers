/** Shapes returned by the API. Mirrors the Mongoose models in `backend/`. */

export type Role = 'patient' | 'caretaker';
export type ZoneKind = 'safe' | 'danger';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Caretaker {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  createdAt?: string;
}

export interface LiveStatus {
  isOnline: boolean;
  lastSeenAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
  /** Whether the last fix fell inside the patient's safe zone. */
  insideSafeZone: boolean | null;
  /** Name of the danger zone the patient is currently inside, if any. */
  dangerZone: string | null;
  recordedAt: string | null;
}

export interface Patient {
  id: string;
  name: string;
  patientCode: string;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: 'male' | 'female' | 'other' | 'unspecified' | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  medicalNotes?: string | null;
  liveStatus: LiveStatus;
  createdAt?: string;
  updatedAt?: string;
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
  insideSafeZone: boolean | null;
  dangerZone: string | null;
  recordedAt: string;
  createdAt?: string;
}

export interface Zone {
  id: string;
  patientId: string;
  kind: ZoneKind;
  name: string;
  category?: string | null;
  description?: string | null;
  latitude: number;
  longitude: number;
  radius: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Alert {
  id: string;
  patientId: string;
  patientName?: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  zoneName: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
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
  lastFixAt: string | null;
  fixCount: number;
  userAgent?: string | null;
}

export interface HistorySummary {
  points: number;
  distanceMeters: number;
  minutesOutsideSafeZone: number;
  firstFixAt: string | null;
  lastFixAt: string | null;
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
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
