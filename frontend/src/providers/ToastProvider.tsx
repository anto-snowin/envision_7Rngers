'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertIcon, CheckIcon, CloseIcon } from '@/components/ui/Icons';

type ToastTone = 'success' | 'error' | 'info' | 'alarm';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastApi {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
  /** Critical, stays on screen until dismissed. Used for zone breaches. */
  alarm: (title: string, body?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 5200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = nextId.current;
      nextId.current += 1;

      // Cap the stack: a burst of socket alerts should not bury the screen.
      setToasts((current) => [...current.slice(-3), { id, tone, title, body }]);

      if (tone !== 'alarm') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
        );
      }
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, body) => push('success', title, body),
      error: (title, body) => push('error', title, body),
      info: (title, body) => push('info', title, body),
      alarm: (title, body) => push('alarm', title, body),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:bottom-0 sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_STYLES: Record<ToastTone, { ring: string; icon: string }> = {
  success: { ring: 'border-safe-500/35', icon: 'text-safe-400' },
  error: { ring: 'border-alarm-500/35', icon: 'text-alarm-400' },
  info: { ring: 'border-ink-100/12', icon: 'text-info-400' },
  alarm: { ring: 'border-alarm-500/70 shadow-[0_0_40px_-12px_rgba(255,92,56,0.6)]', icon: 'text-alarm-400' },
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tone = TONE_STYLES[toast.tone];
  const Icon = toast.tone === 'success' ? CheckIcon : AlertIcon;

  return (
    <div
      className={`panel pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 p-4 ${tone.ring}`}
      role={toast.tone === 'alarm' ? 'alert' : 'status'}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.icon}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-100">{toast.title}</p>
        {toast.body ? <p className="mt-0.5 text-xs text-ink-400">{toast.body}</p> : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-m-1 rounded-lg p-1 text-ink-500 transition-colors hover:text-ink-100"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
