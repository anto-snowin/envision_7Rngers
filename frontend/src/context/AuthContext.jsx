/**
 * Caretaker authentication state.
 *
 * Holds the JWT and the signed-in user, restores the session on boot, and
 * exposes login / register / logout. `isBootstrapping` exists so protected
 * routes can wait rather than bouncing a signed-in user to the login page on
 * the first render.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api';
import {
  getStoredToken,
  setStoredToken,
  setUnauthorizedHandler,
  ApiRequestError,
} from '../lib/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken);
  const [user, setUser] = useState(null);

  // True until we know whether the stored token is still valid.
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(getStoredToken()));

  // Set when the session ends unexpectedly, so the login page can explain why.
  const [sessionMessage, setSessionMessage] = useState(null);

  /** Clear all local auth state. */
  const clearSession = useCallback((message = null) => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    if (message) setSessionMessage(message);
  }, []);

  /**
   * Register the global 401 handler.
   *
   * The axios interceptor calls this whenever the server rejects our token —
   * expired, or revoked by signing out on another device — so the app drops
   * back to the login screen from wherever it was.
   */
  useEffect(() => {
    setUnauthorizedHandler((message) => {
      clearSession(message || 'Your session has ended. Please sign in again.');
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  /** Validate a stored token on boot by fetching the current user. */
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const stored = getStoredToken();
      if (!stored) {
        setIsBootstrapping(false);
        return;
      }

      try {
        const { data } = await authApi.me();
        if (!cancelled) {
          setUser(data.user);
          setToken(stored);
        }
      } catch (err) {
        // A 401 is already handled by the interceptor. Anything else (the API
        // being asleep on a free Render instance, for instance) must not
        // destroy a valid session, so the token is kept and the user is shown
        // the app shell with a retry.
        if (!cancelled && err instanceof ApiRequestError && !err.isNetworkError) {
          clearSession();
        }
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  /** Sign in with email and password. */
  const login = useCallback(async (credentials) => {
    const { data } = await authApi.login(credentials);
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    setSessionMessage(null);
    return data.user;
  }, []);

  /** Create an account and sign straight in. */
  const register = useCallback(async (payload) => {
    const { data } = await authApi.register(payload);
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    setSessionMessage(null);
    return data.user;
  }, []);

  /**
   * Sign out. The server call revokes the session so the token stops working
   * immediately, but local state is cleared regardless of whether it succeeds —
   * a caretaker pressing "sign out" on a shared machine must never stay signed
   * in because the network was down.
   */
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* best effort */
    } finally {
      clearSession();
    }
  }, [clearSession]);

  /** Update the cached user after a profile edit. */
  const updateUser = useCallback((updates) => {
    setUser((current) => (current ? { ...current, ...updates } : current));
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      isBootstrapping,
      sessionMessage,
      clearSessionMessage: () => setSessionMessage(null),
      login,
      register,
      logout,
      updateUser,
    }),
    [token, user, isBootstrapping, sessionMessage, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access auth state. Must be used inside `AuthProvider`. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
