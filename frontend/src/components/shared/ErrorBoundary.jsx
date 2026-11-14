/**
 * Error boundary.
 *
 * A render crash in one dashboard page must not blank the whole app — and on
 * the patient portal it must not take the SOS button down with it. Class
 * component because `componentDidCatch` has no hook equivalent.
 */
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // In a real deployment this is where an error reporter would be called.
    // eslint-disable-next-line no-console
    console.error('Unhandled render error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;

    if (fallback) return fallback(error, this.handleReset);

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-2xl text-severity-critical dark:bg-rose-950/60">
          !
        </div>
        <h1 className="text-lg font-semibold text-surface-900 dark:text-surface-50">
          This page ran into a problem
        </h1>
        <p className="mt-1.5 max-w-md text-sm text-surface-500 dark:text-surface-400">
          The rest of the app is still working. You can try this page again, or go back to the
          dashboard.
        </p>

        {/* The message is shown in development only: in production it could
            expose internals, and it means nothing to a caregiver. */}
        {import.meta.env.DEV ? (
          <pre className="mt-4 max-w-full overflow-auto rounded-xl bg-surface-100 p-3 text-left text-xs text-surface-700 dark:bg-surface-800 dark:text-surface-300">
            {error.message}
          </pre>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={this.handleReset} className="btn btn-primary">
            Try again
          </button>
          <a href="/dashboard" className="btn btn-secondary">
            Back to dashboard
          </a>
        </div>
      </div>
    );
  }
}
