/**
 * 404 page.
 */
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function NotFound() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
      <p className="text-6xl font-black text-surface-200 dark:text-surface-800">404</p>
      <h1 className="mt-2 text-xl font-bold text-surface-900 dark:text-surface-50">
        Page not found
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-surface-500 dark:text-surface-400">
        The page you were looking for does not exist or may have moved.
      </p>

      <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn btn-primary mt-6">
        {isAuthenticated ? 'Back to dashboard' : 'Go to sign in'}
      </Link>
    </div>
  );
}
