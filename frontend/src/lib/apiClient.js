/**
 * Axios instance shared by every API module.
 *
 * Responsibilities:
 *  - attach the caretaker's JWT to each request
 *  - unwrap the API's `{ success, data, meta }` envelope
 *  - turn error responses into a single predictable Error shape
 *  - sign the user out automatically when the token is rejected
 */
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const TOKEN_STORAGE_KEY = 'dcms.token';

/** Read the stored token, tolerating a blocked or empty localStorage. */
export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persist (or clear) the token. */
export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Private browsing or blocked storage: the token simply will not persist
    // across reloads, which is acceptable.
  }
}

const apiClient = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

/** Callback invoked when the server rejects our credentials. */
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * A normalised error so every caller can rely on `.message`, `.status` and
 * `.fields` without inspecting the axios/response structure.
 */
export class ApiRequestError extends Error {
  constructor(message, { status = 0, fields = null, isNetworkError = false } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.fields = fields;
    this.isNetworkError = isNetworkError;
  }
}

apiClient.interceptors.response.use(
  // Unwrap the envelope but keep `meta` reachable for paginated endpoints.
  (response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      return { data: body.data, meta: body.meta ?? null, status: response.status };
    }
    return { data: body, meta: null, status: response.status };
  },

  (error) => {
    // The request never reached the server (offline, DNS, CORS, timeout).
    if (!error.response) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      return Promise.reject(
        new ApiRequestError(
          offline
            ? 'You appear to be offline. Check your connection and try again.'
            : 'Could not reach the server. It may be starting up — try again in a moment.',
          { isNetworkError: true }
        )
      );
    }

    const { status, data } = error.response;
    const apiError = data?.error || {};

    // A rejected token means the session is over: hand control to the auth
    // layer so it can clear state and redirect to the login screen.
    // The login endpoint itself is exempt, since a 401 there is simply a wrong
    // password and must surface as a form error instead of a sign-out.
    const isLoginAttempt = error.config?.url?.includes('/auth/login');
    if (status === 401 && !isLoginAttempt && onUnauthorized) {
      onUnauthorized(apiError.message);
    }

    return Promise.reject(
      new ApiRequestError(apiError.message || `Request failed with status ${status}`, {
        status,
        fields: apiError.details?.fields || null,
      })
    );
  }
);

export { BASE_URL };
export default apiClient;
