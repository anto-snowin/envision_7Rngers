/**
 * Route table.
 *
 * Three groups:
 *  - `/track/:trackingCode` — the patient portal. Outside every provider that
 *    needs a caretaker JWT, because the patient has no account.
 *  - `/login`, `/register` — public, and redirect away if already signed in.
 *  - everything else — behind `ProtectedRoute` inside the dashboard shell.
 *
 * The dashboard pages are lazy-loaded so a patient opening their tracking link
 * on mobile data does not download the map, the charts or any dashboard code.
 */
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import ProtectedRoute, { PublicOnlyRoute } from './ProtectedRoute';
import DashboardLayout from '../components/layout/DashboardLayout';
import { SocketProvider } from '../context/SocketContext';
import { LoadingState } from '../components/shared/Spinner';

// Eager: the patient portal is the one route that must load as fast as
// possible, and auth is the first thing a caretaker sees.
import PatientPortal from '../pages/patient/PatientPortal';
import Login from '../pages/auth/Login';
import Register from '../pages/auth/Register';

// Lazy: dashboard pages.
const Dashboard = lazy(() => import('../pages/caretaker/Dashboard'));
const LiveMap = lazy(() => import('../pages/caretaker/LiveMap'));
const Patients = lazy(() => import('../pages/caretaker/Patients'));
const PatientProfile = lazy(() => import('../pages/caretaker/PatientProfile'));
const Alerts = lazy(() => import('../pages/caretaker/Alerts'));
const History = lazy(() => import('../pages/caretaker/History'));
const SafeZones = lazy(() => import('../pages/caretaker/SafeZones'));
const DangerZones = lazy(() => import('../pages/caretaker/DangerZones'));
const Analytics = lazy(() => import('../pages/caretaker/Analytics'));
const Settings = lazy(() => import('../pages/caretaker/Settings'));
const NotFound = lazy(() => import('../pages/NotFound'));

/** Suspense fallback for a lazily-loaded page. */
function PageLoader() {
  return <LoadingState message="Loading page…" />;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* ---------------------------------------------------- patient portal */}
      <Route path="/track/:trackingCode" element={<PatientPortal />} />

      {/* ------------------------------------------------------------- auth */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      {/* -------------------------------------------------------- dashboard */}
      <Route element={<ProtectedRoute />}>
        {/*
          SocketProvider lives here rather than at the app root: it needs a
          token to connect, and mounting it outside the guard would open a
          socket for signed-out visitors and the patient portal.
        */}
        <Route
          element={
            <SocketProvider>
              <DashboardLayout />
            </SocketProvider>
          }
        >
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<PageLoader />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="/map"
            element={
              <Suspense fallback={<PageLoader />}>
                <LiveMap />
              </Suspense>
            }
          />
          <Route
            path="/patients"
            element={
              <Suspense fallback={<PageLoader />}>
                <Patients />
              </Suspense>
            }
          />
          <Route
            path="/patients/:patientId"
            element={
              <Suspense fallback={<PageLoader />}>
                <PatientProfile />
              </Suspense>
            }
          />
          <Route
            path="/alerts"
            element={
              <Suspense fallback={<PageLoader />}>
                <Alerts />
              </Suspense>
            }
          />
          <Route
            path="/history"
            element={
              <Suspense fallback={<PageLoader />}>
                <History />
              </Suspense>
            }
          />
          <Route
            path="/history/:patientId"
            element={
              <Suspense fallback={<PageLoader />}>
                <History />
              </Suspense>
            }
          />
          <Route
            path="/safe-zones"
            element={
              <Suspense fallback={<PageLoader />}>
                <SafeZones />
              </Suspense>
            }
          />
          <Route
            path="/danger-zones"
            element={
              <Suspense fallback={<PageLoader />}>
                <DangerZones />
              </Suspense>
            }
          />
          <Route
            path="/analytics"
            element={
              <Suspense fallback={<PageLoader />}>
                <Analytics />
              </Suspense>
            }
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={<PageLoader />}>
                <Settings />
              </Suspense>
            }
          />
        </Route>
      </Route>

      {/* ------------------------------------------------------------ misc */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="*"
        element={
          <Suspense fallback={<PageLoader />}>
            <NotFound />
          </Suspense>
        }
      />
    </Routes>
  );
}
