'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, readToken, writeToken } from '@/lib/api';
import { auth } from '@/lib/endpoints';
import type { Caretaker, PatientSelf, Role } from '@/lib/types';

interface Session {
  token: string;
  role: Role;
  caretaker: Caretaker | null;
  patient: PatientSelf | null;
}

interface AuthApi {
  session: Session | null;
  /** True until the stored token has been checked against the server. */
  isRestoring: boolean;
  caretakerLogin: (email: string, password: string) => Promise<void>;
  caretakerRegister: (body: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<void>;
  patientLogin: (identifier: string, password: string) => Promise<void>;
  logout: (options?: { redirectTo?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  /**
   * Rehydrate from the stored token on first mount.
   *
   * The token alone is not enough — it may have been revoked server-side when
   * the caretaker signed out elsewhere — so it is always verified against
   * `/auth/me` before the app treats the viewer as signed in.
   */
  useEffect(() => {
    const token = readToken();
    if (!token) {
      setIsRestoring(false);
      return;
    }

    let cancelled = false;

    auth
      .me()
      .then((data) => {
        if (cancelled) return;
        setSession({
          token,
          role: data.role,
          caretaker: data.caretaker ?? null,
          patient: data.patient ?? null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        writeToken(null);
        setSession(null);
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const caretakerLogin = useCallback(
    async (email: string, password: string) => {
      const data = await auth.caretakerLogin(email, password);
      writeToken(data.token, 'caretaker');
      setSession({ token: data.token, role: 'caretaker', caretaker: data.caretaker, patient: null });
      router.replace('/caretaker/dashboard');
    },
    [router]
  );

  const caretakerRegister = useCallback(
    async (body: { name: string; email: string; password: string; phone?: string }) => {
      const data = await auth.caretakerRegister(body);
      writeToken(data.token, 'caretaker');
      setSession({ token: data.token, role: 'caretaker', caretaker: data.caretaker, patient: null });
      router.replace('/caretaker/dashboard');
    },
    [router]
  );

  const patientLogin = useCallback(
    async (identifier: string, password: string) => {
      const data = await auth.patientLogin(identifier, password);
      writeToken(data.token, 'patient');
      setSession({ token: data.token, role: 'patient', caretaker: null, patient: data.patient });
      router.replace('/patient/dashboard');
    },
    [router]
  );

  const logout = useCallback(
    async (options?: { redirectTo?: string }) => {
      const role = session?.role;
      try {
        await auth.logout();
      } catch (error) {
        // An expired token makes logout fail with 401, which is harmless: the
        // session is gone either way, so clear locally and move on.
        if (!(error instanceof ApiError)) throw error;
      }
      writeToken(null);
      setSession(null);
      router.replace(
        options?.redirectTo ?? (role === 'patient' ? '/patient/login' : '/caretaker/login')
      );
    },
    [router, session?.role]
  );

  const value = useMemo<AuthApi>(
    () => ({ session, isRestoring, caretakerLogin, caretakerRegister, patientLogin, logout }),
    [session, isRestoring, caretakerLogin, caretakerRegister, patientLogin, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/**
 * Route guard. Redirects to the role's login page when the session is missing
 * or belongs to the other role, and reports whether the children may render.
 */
export function useRequireRole(role: Role) {
  const { session, isRestoring } = useAuth();
  const router = useRouter();

  const isAllowed = session?.role === role;

  useEffect(() => {
    if (isRestoring || isAllowed) return;

    if (!session) {
      router.replace(role === 'patient' ? '/patient/login' : '/caretaker/login');
      return;
    }

    // Signed in as the other role — send them to where they belong rather than
    // to a login form they do not need.
    router.replace(session.role === 'patient' ? '/patient/dashboard' : '/caretaker/dashboard');
  }, [isRestoring, isAllowed, session, role, router]);

  return { isAllowed, isRestoring, session };
}
