/**
 * Typed-ish wrappers around every API endpoint.
 *
 * Components never call axios directly: keeping the request shapes here means a
 * backend route change is a one-file edit, and every call site gets consistent
 * query-string building and response unwrapping.
 */
import apiClient from '../lib/apiClient';

/** Drop null/undefined/'' entries so they do not become `?x=undefined`. */
function cleanParams(params = {}) {
  const output = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    output[key] = value;
  }
  return output;
}

// ----------------------------------------------------------------------- auth

export const authApi = {
  register: (payload) => apiClient.post('/auth/register', payload),
  login: (credentials) => apiClient.post('/auth/login', credentials),
  me: () => apiClient.get('/auth/me'),
  updateProfile: (payload) => apiClient.put('/auth/me', payload),
  changePassword: (payload) => apiClient.put('/auth/password', payload),
  logout: () => apiClient.post('/auth/logout'),
  sessions: () => apiClient.get('/auth/sessions'),
  revokeSession: (sessionId) => apiClient.delete(`/auth/sessions/${sessionId}`),
};

// ------------------------------------------------------------------- patients

export const patientsApi = {
  list: (params) => apiClient.get('/patients', { params: cleanParams(params) }),
  live: () => apiClient.get('/patients/live'),
  get: (id) => apiClient.get(`/patients/${id}`),
  create: (payload) => apiClient.post('/patients', payload),
  update: (id, payload) => apiClient.put(`/patients/${id}`, payload),
  remove: (id) => apiClient.delete(`/patients/${id}`),
  zones: (id) => apiClient.get(`/patients/${id}/zones`),
  regenerateCode: (id) => apiClient.post(`/patients/${id}/regenerate-code`),
};

// ------------------------------------------------------------------- location

export const locationApi = {
  /** Caretaker reads */
  latest: (patientId) => apiClient.get(`/location/${patientId}`),
  trail: (patientId, limit = 50) => apiClient.get(`/location/trail/${patientId}`, { params: { limit } }),
  history: (patientId, params) =>
    apiClient.get(`/location/history/${patientId}`, { params: cleanParams(params) }),

  /**
   * Patient-portal writes.
   *
   * These authenticate with the patient's tracking code rather than a JWT, so
   * they deliberately do not rely on the Authorization header.
   */
  startSession: (trackingCode) => apiClient.post(`/location/session/${trackingCode}`),
  sendFix: (payload) => apiClient.post('/location', payload),
  sendBatch: (payload) => apiClient.post('/location/batch', payload),
  sendSos: (payload) => apiClient.post('/location/sos', payload),
  reportDeviceEvent: (payload) => apiClient.post('/location/device-event', payload),
};

// --------------------------------------------------------------------- alerts

export const alertsApi = {
  list: (params) => apiClient.get('/alerts', { params: cleanParams(params) }),
  summary: () => apiClient.get('/alerts/summary'),
  get: (id) => apiClient.get(`/alerts/${id}`),
  create: (payload) => apiClient.post('/alerts', payload),
  markRead: (id) => apiClient.patch(`/alerts/${id}/read`),
  markAllRead: () => apiClient.patch('/alerts/read-all'),
  resolve: (id, resolutionNote = '') =>
    apiClient.patch(`/alerts/${id}/resolve`, { resolutionNote }),
  remove: (id) => apiClient.delete(`/alerts/${id}`),
};

// ------------------------------------------------------------------ geofences

export const geofenceApi = {
  list: (params) => apiClient.get('/geofence', { params: cleanParams(params) }),
  get: (id) => apiClient.get(`/geofence/${id}`),
  create: (payload) => apiClient.post('/geofence', payload),
  update: (id, payload) => apiClient.put(`/geofence/${id}`, payload),
  remove: (id) => apiClient.delete(`/geofence/${id}`),
};

// ---------------------------------------------------------------- danger zones

export const dangerZoneApi = {
  list: (params) => apiClient.get('/danger-zone', { params: cleanParams(params) }),
  categories: () => apiClient.get('/danger-zone/categories'),
  get: (id) => apiClient.get(`/danger-zone/${id}`),
  create: (payload) => apiClient.post('/danger-zone', payload),
  update: (id, payload) => apiClient.put(`/danger-zone/${id}`, payload),
  remove: (id) => apiClient.delete(`/danger-zone/${id}`),
};

// ------------------------------------------------------------------ analytics

export const analyticsApi = {
  dashboard: () => apiClient.get('/analytics/dashboard'),
  overview: (params) => apiClient.get('/analytics/overview', { params: cleanParams(params) }),
  movement: (params) => apiClient.get('/analytics/movement', { params: cleanParams(params) }),
  alertTrends: (params) => apiClient.get('/analytics/alerts', { params: cleanParams(params) }),
};

// --------------------------------------------------------------------- health

export const healthApi = {
  check: () => apiClient.get('/health'),
};
