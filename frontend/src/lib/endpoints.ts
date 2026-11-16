/**
 * One function per API route.
 *
 * Keeping the URL strings in a single module means a backend route rename is a
 * one-file change, and no page ever hand-builds a path.
 */
import { del, get, post, put, request } from './api';
import type {
  Alert,
  AlertSeverity,
  Caretaker,
  HistorySummary,
  LocationFix,
  PaginatedMeta,
  Patient,
  PatientSelf,
  PendingFix,
  TrackingSession,
  Zone,
  ZoneKind,
} from './types';

/* ------------------------------------------------------------------ auth --- */

export interface CaretakerSession {
  token: string;
  role: 'caretaker';
  caretaker: Caretaker;
}

export interface PatientSession {
  token: string;
  role: 'patient';
  patient: PatientSelf;
  session: TrackingSession;
}

export interface MeResponse {
  role: 'patient' | 'caretaker';
  caretaker?: Caretaker;
  patient?: PatientSelf;
  session?: TrackingSession | null;
}

export interface CaretakerSignIn {
  id: string;
  sessionId: string;
  userAgent: string | null;
  createdAt: string;
  lastActivityAt: string;
  isCurrent: boolean;
}

export const auth = {
  caretakerLogin: (email: string, password: string) =>
    post<CaretakerSession>('/auth/caretaker/login', { email, password }),

  caretakerRegister: (body: { name: string; email: string; password: string; phone?: string }) =>
    post<CaretakerSession>('/auth/caretaker/register', body),

  /** `identifier` accepts the patient code, email, or phone number. */
  patientLogin: (identifier: string, password: string) =>
    post<PatientSession>('/auth/patient/login', { identifier, password }),

  logout: () => post<null>('/auth/logout'),

  me: () => get<MeResponse>('/auth/me'),

  sessions: () => get<CaretakerSignIn[]>('/auth/sessions'),
  revokeSession: (sessionId: string) => del<null>(`/auth/sessions/${sessionId}`),

  changePassword: (currentPassword: string, newPassword: string) =>
    put<CaretakerSession>('/auth/password', { currentPassword, newPassword }),
};

/* -------------------------------------------------------------- patients --- */

export interface PatientInput {
  name: string;
  password?: string;
  email?: string;
  phone?: string;
  age?: number | null;
  gender?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  medicalNotes?: string;
  isActive?: boolean;
}

export const patients = {
  list: (query?: { search?: string }) => get<Patient[]>('/patients', query),
  byId: (id: string) => get<Patient>(`/patients/${id}`),
  create: (body: PatientInput) => post<Patient>('/patients', body),
  update: (id: string, body: Partial<PatientInput>) => put<Patient>(`/patients/${id}`, body),
  remove: (id: string) => del<null>(`/patients/${id}`),

  /** Returns the new password once, so it can be read out to the patient. */
  resetPassword: (id: string, password?: string) =>
    put<Patient>(`/patients/${id}/password`, password ? { password } : {}),

  zones: (id: string) => get<{ safe: Zone[]; danger: Zone[] }>(`/patients/${id}/zones`),
  sessions: (id: string) => get<TrackingSession[]>(`/patients/${id}/sessions`),
};

/* -------------------------------------------------------------- location --- */

export interface LocationUpdateResult {
  accepted: number;
  rejected: number;
  connection: 'online' | 'queued';
  insideSafeZone: boolean | null;
  dangerZone: string | null;
  distanceFromSafeZone: number | null;
  alerts: Alert[];
}

export interface DeviceStatusResult {
  insideSafeZone: boolean | null;
  dangerZone: string | null;
  lastFixAt: string | null;
  fixCount: number;
}

export const location = {
  /**
   * Upload one or more fixes. The device always sends an array so that a queue
   * drained after a connectivity gap is a single round trip.
   */
  update: (fixes: PendingFix[], connection: 'online' | 'queued' = 'online') =>
    post<LocationUpdateResult>('/location/update', { fixes, connection }),

  /** Keep-alive for a device with no fix to send (GPS searching, say). */
  ping: (body: { online?: boolean; batteryLevel?: number | null; isCharging?: boolean | null }) =>
    post<null>('/location/ping', body),

  sos: (body: {
    latitude?: number | null;
    longitude?: number | null;
    accuracy?: number | null;
  }) => post<Alert | null>('/location/sos', body),

  /** A condition only the device can observe (GPS refused, internet lost…). */
  deviceEvent: (type: string, message?: string) =>
    post<Alert | null>('/location/device-event', { type, message }),

  myStatus: () => get<DeviceStatusResult>('/location/me'),

  latest: (patientId: string) => get<LocationFix | null>(`/location/latest/${patientId}`),

  history: async (
    patientId: string,
    query?: { from?: string; to?: string; limit?: number },
    signal?: AbortSignal
  ) => {
    const result = await request<{ fixes: LocationFix[]; summary: HistorySummary }>(
      `/location/history/${patientId}`,
      { query, signal }
    );
    return result.data;
  },

  alertsFor: (patientId: string) => get<Alert[]>(`/location/alerts/${patientId}`),
};

/* ----------------------------------------------------------------- zones --- */

export interface ZoneInput {
  patientId: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  description?: string;
  isActive?: boolean;
  /** Danger zones only. */
  category?: string;
  severity?: AlertSeverity;
  /** Safe zones only. */
  address?: string;
  isPrimary?: boolean;
}

/** `/zones/safe` and `/zones/danger` are symmetric, so the kind is a parameter. */
export const zones = {
  list: (kind: ZoneKind, query?: { patientId?: string }) => get<Zone[]>(`/zones/${kind}`, query),
  create: (kind: ZoneKind, body: ZoneInput) => post<Zone>(`/zones/${kind}`, body),
  update: (kind: ZoneKind, id: string, body: Partial<Omit<ZoneInput, 'patientId'>>) =>
    put<Zone>(`/zones/${kind}/${id}`, body),
  remove: (kind: ZoneKind, id: string) => del<null>(`/zones/${kind}/${id}`),

  /** Both zone sets for one patient, as the map needs them together. */
  forPatient: (patientId: string, signal?: AbortSignal) =>
    get<{ safe: Zone[]; danger: Zone[] }>(`/zones/patient/${patientId}`, undefined, signal),
};

/* ---------------------------------------------------------------- alerts --- */

export interface AlertFilters {
  patientId?: string;
  type?: string;
  severity?: string;
  unreadOnly?: boolean;
  unresolvedOnly?: boolean;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const alerts = {
  list: async (query?: AlertFilters, signal?: AbortSignal) => {
    const result = await request<Alert[]>('/alerts', { query, signal });
    return { items: result.data, meta: result.meta as PaginatedMeta | undefined };
  },

  forPatient: async (
    patientId: string,
    query?: { page?: number; limit?: number },
    signal?: AbortSignal
  ) => {
    const result = await request<Alert[]>(`/alerts/${patientId}`, { query, signal });
    return { items: result.data, meta: result.meta as PaginatedMeta | undefined };
  },

  markRead: (id: string) => put<Alert>(`/alerts/${id}/read`),
  markResolved: (id: string, resolutionNote?: string) =>
    put<Alert>(`/alerts/${id}/resolved`, resolutionNote ? { resolutionNote } : {}),
  markAllRead: (patientId?: string) =>
    put<{ updated: number }>('/alerts/read-all', patientId ? { patientId } : {}),
};

/* ------------------------------------------------------------- dashboard --- */

export interface DashboardSummary {
  totalPatients: number;
  online: number;
  offline: number;
  alertsToday: number;
  criticalAlertsToday: number;
  unreadAlerts: number;
  unresolvedAlerts: number;
  outsideSafeZone: number;
  inDangerZone: number;
  lowBattery: number;
  averageBattery: number | null;
  batteryReportingCount: number;
  lastUpdatedAt: string | null;
}

export const dashboard = {
  summary: (signal?: AbortSignal) => get<DashboardSummary>('/dashboard/summary', undefined, signal),
};
