/**
 * One function per API route.
 *
 * Keeping the URL strings in a single module means a backend route rename is a
 * one-file change, and pages never hand-build a path.
 */
import { del, get, post, put, request } from './api';
import type {
  Alert,
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

export const auth = {
  caretakerLogin: (email: string, password: string) =>
    post<CaretakerSession>('/auth/caretaker/login', { email, password }),

  caretakerRegister: (body: { name: string; email: string; password: string; phone?: string }) =>
    post<CaretakerSession>('/auth/caretaker/register', body),

  /** `identifier` accepts the patient code, email, or phone number. */
  patientLogin: (identifier: string, password: string) =>
    post<PatientSession>('/auth/patient/login', { identifier, password }),

  logout: () => post<null>('/auth/logout'),

  me: () => get<{ role: 'patient' | 'caretaker'; caretaker?: Caretaker; patient?: PatientSelf }>(
    '/auth/me'
  ),
};

/* -------------------------------------------------------------- patients --- */

export interface PatientInput {
  name: string;
  password?: string;
  email?: string;
  phone?: string;
  age?: number | null;
  gender?: string | null;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  medicalNotes?: string;
}

export const patients = {
  list: (query?: { search?: string }) => get<Patient[]>('/patients', query),
  byId: (id: string) => get<Patient>(`/patients/${id}`),
  create: (body: PatientInput) => post<Patient>('/patients', body),
  update: (id: string, body: Partial<PatientInput>) => put<Patient>(`/patients/${id}`, body),
  remove: (id: string) => del<null>(`/patients/${id}`),
  resetPassword: (id: string, password: string) =>
    put<Patient>(`/patients/${id}/password`, { password }),
};

/* -------------------------------------------------------------- location --- */

export interface LocationUpdateResult {
  accepted: number;
  alerts: Alert[];
  insideSafeZone: boolean | null;
  dangerZone: string | null;
}

export const location = {
  /**
   * Upload one or more fixes. The patient device always sends an array so that
   * a queue drained after a connectivity gap is a single round trip.
   */
  update: (fixes: PendingFix[], connection: 'online' | 'queued' = 'online') =>
    post<LocationUpdateResult>('/location/update', { fixes, connection }),

  latest: (patientId: string) => get<LocationFix | null>(`/location/latest/${patientId}`),

  history: async (
    patientId: string,
    query?: { from?: string; to?: string; limit?: number; page?: number }
  ) => {
    const result = await request<{ fixes: LocationFix[]; summary: HistorySummary }>(
      `/location/history/${patientId}`,
      { query }
    );
    return { ...result.data, meta: result.meta as PaginatedMeta | undefined };
  },

  /** Patient device heartbeat — keeps presence fresh between 3-minute fixes. */
  ping: (body: { online: boolean; batteryLevel?: number | null; isCharging?: boolean | null }) =>
    post<null>('/location/ping', body),

  sos: (body: { latitude?: number | null; longitude?: number | null; accuracy?: number | null }) =>
    post<Alert>('/location/sos', body),

  /** Device-side condition the patient browser detected (GPS lost, offline…). */
  deviceEvent: (type: string, message?: string) =>
    post<Alert | null>('/location/device-event', { type, message }),
};

/* ----------------------------------------------------------------- zones --- */

export interface ZoneInput {
  patientId: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  category?: string;
  description?: string;
  isActive?: boolean;
}

/** `/zones/safe` and `/zones/danger` are symmetric, so the kind is a parameter. */
export const zones = {
  list: (kind: ZoneKind, query?: { patientId?: string }) => get<Zone[]>(`/zones/${kind}`, query),
  create: (kind: ZoneKind, body: ZoneInput) => post<Zone>(`/zones/${kind}`, body),
  update: (kind: ZoneKind, id: string, body: Partial<ZoneInput>) =>
    put<Zone>(`/zones/${kind}/${id}`, body),
  remove: (kind: ZoneKind, id: string) => del<null>(`/zones/${kind}/${id}`),

  /** Both zone sets for one patient, as the map needs them together. */
  forPatient: (patientId: string) =>
    get<{ safe: Zone[]; danger: Zone[] }>(`/zones/patient/${patientId}`),
};

/* ---------------------------------------------------------------- alerts --- */

export const alerts = {
  list: async (query?: {
    patientId?: string;
    type?: string;
    severity?: string;
    unreadOnly?: boolean;
    unresolvedOnly?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const result = await request<Alert[]>('/alerts', { query });
    return { items: result.data, meta: result.meta as PaginatedMeta | undefined };
  },

  forPatient: async (patientId: string, query?: { page?: number; limit?: number }) => {
    const result = await request<Alert[]>(`/alerts/${patientId}`, { query });
    return { items: result.data, meta: result.meta as PaginatedMeta | undefined };
  },

  markRead: (id: string) => put<Alert>(`/alerts/${id}/read`),
  markResolved: (id: string) => put<Alert>(`/alerts/${id}/resolved`),
  markAllRead: (patientId?: string) => put<{ updated: number }>('/alerts/read-all', { patientId }),
};

/* --------------------------------------------------------------- summary --- */

export interface DashboardSummary {
  totalPatients: number;
  online: number;
  offline: number;
  alertsToday: number;
  unresolvedAlerts: number;
  outsideSafeZone: number;
  inDangerZone: number;
  lowBattery: number;
  lastUpdatedAt: string | null;
}

export const dashboard = {
  summary: () => get<DashboardSummary>('/dashboard/summary'),
};
