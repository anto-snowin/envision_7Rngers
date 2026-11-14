/**
 * Route guards.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/shared/Spinner';

/**
 * Require a signed-in caretaker.
 *
 * While the stored token is being validated we render a loading state rather
 * than redirecting: bouncing a signed-in caregiver to the login screen on every
 * refresh, only to bounce them back, is both jarring and loses their place.
 *
 * The attempted path is stashed in location state so the login page can return
 * the user to where they were headed.
 */
export default function ProtectedRoute() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingState message="Restoring your session…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/**
 * The inverse: keep an already-signed-in user off the login and register pages.
 */
export function PublicOnlyRoute() {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingState message="Loading…" />
      </div>
    );
  }

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
