/**
 * Loading indicators.
 */

/** Inline spinner. Decorative: the surrounding control carries the label. */
export default function Spinner({ className = 'h-5 w-5', label = null }) {
  return (
    <>
      <svg
        className={`animate-spin ${className}`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
        <path
          d="M22 12a10 10 0 00-10-10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}

/**
 * Full-area loading state, for a page or panel that has nothing to show yet.
 * `role="status"` so the message is announced once it appears.
 */
export function LoadingState({ message = 'Loading…', className = '' }) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-3 py-16 text-surface-500 dark:text-surface-400 ${className}`}
    >
      <Spinner className="h-8 w-8 text-brand-600 dark:text-brand-400" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

/**
 * Translucent overlay shown over content that is being refreshed, so the
 * existing data stays readable instead of collapsing to a spinner.
 */
export function LoadingOverlay({ isVisible, message = 'Updating…' }) {
  if (!isVisible) return null;

  return (
    <div
      role="status"
      className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-surface-0/70 backdrop-blur-sm dark:bg-surface-900/70"
    >
      <div className="flex items-center gap-2.5 rounded-xl bg-surface-0 px-4 py-2.5 shadow-lg dark:bg-surface-800">
        <Spinner className="h-4 w-4 text-brand-600 dark:text-brand-400" />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}
