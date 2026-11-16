'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PatientSwitcher } from '@/components/caretaker/PatientSwitcher';
import Button from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/Feedback';
import {
  AlertIcon,
  CloseIcon,
  LogoutIcon,
  MapIcon,
  MenuIcon,
  RadarIcon,
  RouteIcon,
  ShieldIcon,
  UsersIcon,
  WifiOffIcon,
} from '@/components/ui/Icons';
import { ALERT_LABELS } from '@/lib/constants';
import type { Alert } from '@/lib/types';
import { SOCKET_EVENTS } from '@/lib/constants';
import { useAuth, useRequireRole } from '@/providers/AuthProvider';
import { PatientsProvider } from '@/providers/PatientsProvider';
import { useSocket, useSocketEvent } from '@/providers/SocketProvider';
import { useToast } from '@/providers/ToastProvider';

const NAV = [
  { href: '/caretaker/dashboard', label: 'Overview', icon: RadarIcon },
  { href: '/caretaker/map', label: 'Live map', icon: MapIcon },
  { href: '/caretaker/zones', label: 'Zones', icon: ShieldIcon },
  { href: '/caretaker/history', label: 'History', icon: RouteIcon },
  { href: '/caretaker/alerts', label: 'Alerts', icon: AlertIcon },
  { href: '/caretaker/patients', label: 'Patients', icon: UsersIcon },
];

/**
 * Shell for every signed-in caretaker page.
 *
 * Lives in a `(dash)` route group so the sign-in and registration screens,
 * which sit under the same `/caretaker` path, do not inherit the chrome.
 */
export default function CaretakerLayout({ children }: { children: React.ReactNode }) {
  const { isAllowed, isRestoring } = useRequireRole('caretaker');

  if (isRestoring || !isAllowed) return <PageLoading label="Checking your session…" />;

  return (
    <PatientsProvider>
      <Shell>{children}</Shell>
    </PatientsProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const { isConnected } = useSocket();
  const toast = useToast();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Close the mobile drawer on navigation, or it covers the page just opened.
  useEffect(() => setIsDrawerOpen(false), [pathname]);

  /**
   * Every alert surfaces as a toast, wherever the caretaker happens to be.
   * Critical ones stay until dismissed — the whole point of the product is that
   * these are not missed.
   */
  useSocketEvent<Alert>(SOCKET_EVENTS.ALERT_NEW, (alert) => {
    const title = `${alert.patientName ? `${alert.patientName}: ` : ''}${
      ALERT_LABELS[alert.type] || alert.title
    }`;

    if (alert.severity === 'critical') toast.alarm(title, alert.message);
    else if (alert.severity === 'high') toast.error(title, alert.message);
    else toast.info(title, alert.message);
  });

  return (
    <div className="min-h-dvh">
      {/* ------------------------------------------------------------ top bar */}
      <header className="sticky top-0 z-40 border-b border-ink-100/8 bg-ink-950/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/caretaker/dashboard" className="flex shrink-0 items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-acid-500 text-ink-950">
              <RadarIcon className="h-4.5 w-4.5" />
            </span>
            <span className="hidden font-display text-base font-extrabold tracking-tight text-ink-100 sm:block">
              Sentinel
            </span>
          </Link>

          {/* Desktop navigation */}
          <nav className="pillbar mx-auto hidden lg:flex">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`pill ${pathname === href ? 'pill-active' : ''}`}
                aria-current={pathname === href ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {!isConnected ? (
              <span className="badge badge-caution" title="Live updates are reconnecting">
                <WifiOffIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reconnecting</span>
              </span>
            ) : null}

            <PatientSwitcher />

            <Button
              variant="quiet"
              size="sm"
              className="hidden lg:inline-flex"
              onClick={() => void logout()}
            >
              <LogoutIcon className="h-4 w-4" />
              Sign out
            </Button>

            <button
              type="button"
              className="inline-grid h-9 w-9 place-items-center rounded-xl border border-ink-100/12 text-ink-300 lg:hidden"
              aria-label={isDrawerOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isDrawerOpen}
              onClick={() => setIsDrawerOpen((value) => !value)}
            >
              {isDrawerOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------ mobile drawer */}
      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
            aria-hidden="true"
          />
          <nav className="panel absolute inset-x-4 top-4 z-10 p-3" aria-label="Menu">
            <div className="mb-2 flex items-center justify-between px-2 py-1">
              <p className="text-sm font-semibold text-ink-300">{session?.caretaker?.name}</p>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-lg p-1 text-ink-500 hover:text-ink-100"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-colors
                  ${
                    pathname === href
                      ? 'bg-acid-500 text-ink-950'
                      : 'text-ink-300 hover:bg-ink-100/5'
                  }`}
              >
                <Icon className="h-4.5 w-4.5" />
                {label}
              </Link>
            ))}

            <div className="hairline mt-2 pt-2">
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-ink-400 hover:bg-ink-100/5"
              >
                <LogoutIcon className="h-4.5 w-4.5" />
                Sign out
              </button>
            </div>
          </nav>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </div>
  );
}
