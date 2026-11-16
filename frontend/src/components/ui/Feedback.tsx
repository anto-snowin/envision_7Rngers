'use client';

import Button, { Spinner } from './Button';
import { AlertIcon, RefreshIcon } from './Icons';

/** Full-panel loading state. */
export function PanelLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-12 text-sm text-ink-400">
      <Spinner className="h-5 w-5 text-acid-500" />
      {label}
    </div>
  );
}

/** Whole-page loading state, used while a session is being restored. */
export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="h-7 w-7 text-acid-500" />
        <p className="text-sm text-ink-400">{label}</p>
      </div>
    </div>
  );
}

/** Error state with a retry affordance. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 p-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-alarm-500/12 text-alarm-400">
        <AlertIcon className="h-5 w-5" />
      </span>
      <p className="max-w-sm text-sm text-ink-300">{message}</p>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RefreshIcon className="h-4 w-4" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Empty state.
 *
 * Takes an action rather than just explaining the emptiness: an empty list is
 * usually a prompt to create the first thing.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon ? (
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ink-100/6 text-ink-500">
          {icon}
        </span>
      ) : null}
      <h3 className="text-lg font-bold">{title}</h3>
      {body ? <p className="max-w-sm text-sm leading-relaxed text-ink-400">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Repeated skeleton rows, sized to the list they stand in for. */
export function SkeletonRows({ rows = 4, height = 'h-16' }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`skeleton ${height}`} />
      ))}
    </div>
  );
}

export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton h-28" />
      ))}
    </div>
  );
}
