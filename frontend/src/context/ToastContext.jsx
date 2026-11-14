/**
 * Toast notifications.
 *
 * Used for ordinary feedback ("Patient saved") and, more importantly, for
 * incoming real-time alerts. Critical alerts are sticky — a caretaker must not
 * miss an SOS because it faded after four seconds.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import ToastStack from '../components/shared/ToastStack';

const ToastContext = createContext(null);

/** Default lifetime per variant, in ms. `0` means "stay until dismissed". */
const DEFAULT_DURATIONS = {
  success: 3500,
  info: 4000,
  warning: 6000,
  error: 7000,
  critical: 0,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));

    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  /**
   * Show a toast.
   *
   * @param {object} options
   * @param {string} options.title
   * @param {string} [options.message]
   * @param {'success'|'info'|'warning'|'error'|'critical'} [options.variant]
   * @param {number} [options.duration] ms; 0 keeps it until dismissed
   * @param {{label:string, onClick:Function}} [options.action]
   * @returns {string} the toast id
   */
  const showToast = useCallback(
    ({ title, message = '', variant = 'info', duration, action = null, icon = null }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const lifetime = duration ?? DEFAULT_DURATIONS[variant] ?? 4000;

      setToasts((current) => {
        // Cap the stack so a burst of alerts cannot fill the screen; the oldest
        // non-critical toasts are dropped first.
        const next = [...current, { id, title, message, variant, action, icon }];
        if (next.length <= 5) return next;

        const removable = next.find((toast) => toast.variant !== 'critical');
        return removable ? next.filter((toast) => toast.id !== removable.id) : next.slice(-5);
      });

      if (lifetime > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), lifetime)
        );
      }

      return id;
    },
    [dismiss]
  );

  // Convenience wrappers for the common cases.
  const toast = useMemo(
    () => ({
      success: (title, message, options) =>
        showToast({ title, message, variant: 'success', ...options }),
      info: (title, message, options) => showToast({ title, message, variant: 'info', ...options }),
      warning: (title, message, options) =>
        showToast({ title, message, variant: 'warning', ...options }),
      error: (title, message, options) =>
        showToast({ title, message, variant: 'error', ...options }),
      critical: (title, message, options) =>
        showToast({ title, message, variant: 'critical', ...options }),
    }),
    [showToast]
  );

  const value = useMemo(
    () => ({ toasts, showToast, dismiss, dismissAll: () => setToasts([]), toast }),
    [toasts, showToast, dismiss, toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/** Access the toast API. Must be used inside `ToastProvider`. */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
