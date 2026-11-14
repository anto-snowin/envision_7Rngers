/**
 * Caretaker dashboard shell: sidebar, topbar and the content outlet.
 *
 * The sidebar is a permanent column from `lg` up and an off-canvas drawer below
 * it, so the dashboard remains usable on a tablet or phone — a caregiver may
 * well be checking alerts away from their desk.
 */
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useFetch } from '../../hooks/useApi';
import { alertsApi } from '../../api';
import { ThemeToggle, ConnectionIndicator } from '../shared/Controls';
import { IconButton } from '../shared/Button';
import ErrorBoundary from '../shared/ErrorBoundary';
import {
  DashboardIcon,
  MapIcon,
  HistoryIcon,
  BellIcon,
  UsersIcon,
  ShieldIcon,
  HazardIcon,
  ChartIcon,
  SettingsIcon,
  MenuIcon,
  CloseIcon,
  LogoutIcon,
  LocationIcon,
} from '../shared/Icons';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: DashboardIcon },
  { to: '/map', label: 'Live map', icon: MapIcon },
  { to: '/patients', label: 'Patients', icon: UsersIcon },
  { to: '/alerts', label: 'Alerts', icon: BellIcon, badge: 'alerts' },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/safe-zones', label: 'Safe zones', icon: ShieldIcon },
  { to: '/danger-zones', label: 'Danger zones', icon: HazardIcon },
  { to: '/analytics', label: 'Analytics', icon: ChartIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const { isConnected, lastAlert } = useSocket();
  const location = useLocation();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Unread count for the sidebar badge, refreshed whenever an alert arrives.
  const { data: summary, refresh: refreshSummary } = useFetch(() => alertsApi.summary(), []);

  useEffect(() => {
    if (lastAlert) refreshSummary();
  }, [lastAlert, refreshSummary]);

  // Close the drawer on navigation, otherwise it covers the page just opened.
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!isDrawerOpen) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') setIsDrawerOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDrawerOpen]);

  const unread = summary?.unread || 0;

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <LocationIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-surface-900 dark:text-surface-50">
            Dementia Care
          </p>
          <p className="truncate text-[11px] text-surface-500 dark:text-surface-400">
            Monitoring &amp; geofencing
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>

              {item.badge === 'alerts' && unread > 0 ? (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-severity-critical px-1.5 text-[11px] font-bold tabular text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>

      {/* Account */}
      <div className="border-t border-surface-200 p-3 dark:border-surface-800">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-200">
            {(user?.name || '?').charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-surface-900 dark:text-surface-100">
              {user?.name}
            </p>
            <p className="truncate text-[11px] text-surface-500 dark:text-surface-400">
              {user?.email}
            </p>
          </div>
        </div>

        <button type="button" onClick={logout} className="nav-link w-full">
          <LogoutIcon className="h-4.5 w-4.5 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Skip link, so keyboard users are not forced through the whole nav. */}
      <a
        href="#main-content"
        className="sr-only-focusable fixed top-2 left-2 z-[70] rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
      >
        Skip to main content
      </a>

      {/* Permanent sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-surface-200 bg-surface-0 lg:block dark:border-surface-800 dark:bg-surface-900">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-surface-950/50 backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute inset-y-0 left-0 w-72 bg-surface-0 shadow-xl dark:bg-surface-900"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="absolute top-4 right-3">
              <IconButton label="Close menu" onClick={() => setIsDrawerOpen(false)} size="sm">
                <CloseIcon className="h-4 w-4" />
              </IconButton>
            </div>
            {sidebar}
          </aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-surface-200 bg-surface-0/80 px-4 backdrop-blur-sm dark:border-surface-800 dark:bg-surface-900/80">
          <IconButton label="Open menu" onClick={() => setIsDrawerOpen(true)} className="lg:hidden">
            <MenuIcon className="h-5 w-5" />
          </IconButton>

          <div className="min-w-0 flex-1">
            <CurrentPageTitle />
          </div>

          <ConnectionIndicator isConnected={isConnected} className="hidden sm:inline-flex" />
          <ThemeToggle />
        </header>

        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto">
          {/* A crash in one page must not blank the shell, so the boundary sits
              inside the layout rather than around it. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

/** Page title in the topbar, derived from the route. */
function CurrentPageTitle() {
  const location = useLocation();

  const match = NAV_ITEMS.find(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  );

  const title = match?.label || 'Dashboard';

  return (
    <h1 className="truncate text-base font-semibold text-surface-900 dark:text-surface-50">
      {title}
    </h1>
  );
}
