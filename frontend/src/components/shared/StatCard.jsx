/**
 * Stat tiles for the dashboard's KPI row.
 *
 * A single number needs no plot — these are deliberately bare figures rather
 * than sparkline-decorated mini-charts. The value is the headline, the label
 * says what it measures, and the hint adds context without competing.
 *
 * Figures use proportional numerals (they are standalone, not a column), but
 * anything that appears in a vertical list gets `tabular`.
 */
import { Link } from 'react-router-dom';

const TONES = {
  neutral: {
    icon: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300',
    value: 'text-surface-900 dark:text-surface-50',
  },
  brand: {
    icon: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
    value: 'text-surface-900 dark:text-surface-50',
  },
  good: {
    icon: 'bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-400',
    value: 'text-surface-900 dark:text-surface-50',
  },
  warning: {
    icon: 'bg-orange-50 text-severity-high dark:bg-orange-950/60 dark:text-severity-high-soft',
    value: 'text-surface-900 dark:text-surface-50',
  },
  critical: {
    icon: 'bg-rose-50 text-severity-critical dark:bg-rose-950/60 dark:text-severity-critical-soft',
    // A non-zero critical count is the one figure allowed to shout.
    value: 'text-severity-critical dark:text-severity-critical-soft',
  },
};

export default function StatCard({
  label,
  value,
  hint = null,
  icon = null,
  tone = 'neutral',
  to = null,
  isLoading = false,
  /** When false, a `critical` tone falls back to neutral colouring. */
  emphasise = true,
}) {
  const palette = TONES[tone] || TONES.neutral;
  const valueClass = tone === 'critical' && !emphasise ? TONES.neutral.value : palette.value;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-surface-500 dark:text-surface-400">{label}</p>
        {icon ? (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${palette.icon}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="skeleton mt-2 h-9 w-20" />
      ) : (
        <p className={`mt-1.5 text-3xl font-bold ${valueClass}`}>{value}</p>
      )}

      {hint ? (
        <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">{hint}</p>
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="card block p-5 transition-shadow hover:shadow-md focus-visible:outline-2"
      >
        {body}
      </Link>
    );
  }

  return <div className="card p-5">{body}</div>;
}

/**
 * Compact horizontal variant, for sidebars and the patient profile where a full
 * tile would be too heavy.
 */
export function MiniStat({ label, value, icon = null, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {icon ? (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-xs text-surface-500 dark:text-surface-400">{label}</p>
        <p className="truncate text-sm font-semibold tabular text-surface-900 dark:text-surface-100">
          {value}
        </p>
      </div>
    </div>
  );
}
