/**
 * Toast stack rendered by ToastProvider.
 *
 * The container is an `aria-live` region so new alerts are announced. Critical
 * alerts use `assertive` (they interrupt), everything else is polite.
 */
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';

const VARIANTS = {
  success: {
    container:
      'bg-green-50 ring-green-200 dark:bg-green-950/90 dark:ring-green-800 text-green-900 dark:text-green-100',
    accent: 'bg-green-600',
    icon: '✓',
  },
  info: {
    container:
      'bg-surface-0 ring-surface-200 dark:bg-surface-800 dark:ring-surface-700 text-surface-900 dark:text-surface-100',
    accent: 'bg-brand-600',
    icon: 'i',
  },
  warning: {
    container:
      'bg-orange-50 ring-orange-200 dark:bg-orange-950/90 dark:ring-orange-800 text-orange-900 dark:text-orange-100',
    accent: 'bg-severity-high',
    icon: '▲',
  },
  error: {
    container:
      'bg-rose-50 ring-rose-200 dark:bg-rose-950/90 dark:ring-rose-800 text-rose-900 dark:text-rose-100',
    accent: 'bg-severity-critical',
    icon: '!',
  },
  critical: {
    container: 'bg-rose-600 ring-rose-500 text-white dark:bg-rose-700 dark:ring-rose-600 shadow-xl',
    accent: 'bg-white/70',
    icon: '!',
  },
};

export default function ToastStack({ toasts, onDismiss }) {
  if (typeof document === 'undefined') return null;

  const hasCritical = toasts.some((toast) => toast.variant === 'critical');

  return createPortal(
    <div
      // Positioned bottom-centre on phones (within thumb reach) and
      // top-right on larger screens, clear of the dashboard content.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-auto sm:items-end"
      role="region"
      aria-label="Notifications"
      aria-live={hasCritical ? 'assertive' : 'polite'}
    >
      {toasts.map((toast) => {
        const variant = VARIANTS[toast.variant] || VARIANTS.info;

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl p-3.5 shadow-lg ring-1 ${variant.container}`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                toast.variant === 'critical' ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'
              }`}
              aria-hidden="true"
            >
              {toast.icon || variant.icon}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.message ? (
                <p className="mt-0.5 text-sm break-words opacity-90">{toast.message}</p>
              ) : null}

              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action.onClick();
                    onDismiss(toast.id);
                  }}
                  className="mt-2 text-sm font-semibold underline underline-offset-2 hover:no-underline"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-mt-0.5 -mr-0.5 shrink-0 rounded-lg p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
