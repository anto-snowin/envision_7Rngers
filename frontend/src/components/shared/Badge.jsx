/**
 * Status badges and indicators.
 *
 * Every badge pairs its colour with a text label, so none of the status
 * information in the dashboard depends on colour perception alone.
 */
import { severityMeta, zoneStateMeta, alertTypeMeta } from '../../lib/constants';

/** Generic pill. */
export default function Badge({ children, className = '', tone = 'neutral' }) {
  const tones = {
    neutral:
      'bg-surface-100 text-surface-700 ring-1 ring-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:ring-surface-700',
    brand:
      'bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-900',
    success:
      'bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-950/60 dark:text-green-300 dark:ring-green-900',
    danger:
      'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900',
    warning:
      'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-900',
  };

  return <span className={`badge ${tones[tone] || tones.neutral} ${className}`}>{children}</span>;
}

/** Alert severity badge. */
export function SeverityBadge({ severity, className = '' }) {
  const meta = severityMeta(severity);

  return (
    <span className={`badge ${meta.badge} ${className}`}>
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}

/** Zone state badge: in safe zone / outside / in danger. */
export function ZoneBadge({ zoneState, className = '' }) {
  const meta = zoneStateMeta(zoneState);
  return <span className={`badge ${meta.badge} ${className}`}>{meta.label}</span>;
}

/** Alert type badge with its icon. */
export function AlertTypeBadge({ type, className = '' }) {
  const meta = alertTypeMeta(type);

  return (
    <span
      className={`badge bg-surface-100 text-surface-700 ring-1 ring-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:ring-surface-700 ${className}`}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {meta.short}
    </span>
  );
}

/**
 * Online / offline indicator.
 *
 * The dot pulses while online, which reads as "live" at a glance on a
 * dashboard full of patient cards.
 */
export function StatusDot({ isOnline, showLabel = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {isOnline ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-online opacity-60" />
        ) : null}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            isOnline ? 'bg-status-online' : 'bg-status-offline'
          }`}
        />
      </span>
      {showLabel ? (
        <span
          className={`text-xs font-medium ${
            isOnline
              ? 'text-green-700 dark:text-green-400'
              : 'text-surface-500 dark:text-surface-400'
          }`}
        >
          {isOnline ? 'Online' : 'Offline'}
        </span>
      ) : (
        <span className="sr-only">{isOnline ? 'Online' : 'Offline'}</span>
      )}
    </span>
  );
}

/**
 * Battery indicator. Turns amber below 30% and red below 15%, with the figure
 * always shown as text.
 */
export function BatteryBadge({ level, isCharging = false, className = '' }) {
  if (level == null || !Number.isFinite(Number(level))) {
    return (
      <span className={`text-xs text-surface-400 dark:text-surface-500 ${className}`}>
        Battery unknown
      </span>
    );
  }

  const value = Math.round(Number(level));
  const tone =
    value <= 15
      ? 'text-severity-critical dark:text-severity-critical-soft'
      : value <= 30
        ? 'text-severity-high dark:text-severity-high-soft'
        : 'text-surface-600 dark:text-surface-300';

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone} ${className}`}>
      <span className="relative inline-flex h-3 w-6 items-center rounded-sm border border-current px-px">
        <span
          className="h-1.5 rounded-[1px] bg-current transition-all"
          style={{ width: `${Math.max(4, value)}%` }}
        />
        <span className="absolute -right-[3px] h-1.5 w-[2px] rounded-r bg-current" />
      </span>
      {value}%{isCharging ? <span aria-label="charging">⚡</span> : null}
    </span>
  );
}
