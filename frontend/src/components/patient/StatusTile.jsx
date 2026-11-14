/**
 * Status tile for the patient portal.
 *
 * Larger text and a plainer vocabulary than the dashboard's `StatCard`: the
 * reader may have impaired vision and will not know what "GPS accuracy ±12 m"
 * means, so values are words like "Good" and "Searching".
 */

const TONES = {
  good: {
    wrapper: 'bg-teal-50 dark:bg-teal-950/50',
    icon: 'text-teal-700 dark:text-teal-300',
    value: 'text-teal-900 dark:text-teal-100',
    label: 'text-teal-700/80 dark:text-teal-300/80',
  },
  warning: {
    wrapper: 'bg-orange-50 dark:bg-orange-950/50',
    icon: 'text-orange-700 dark:text-orange-300',
    value: 'text-orange-900 dark:text-orange-100',
    label: 'text-orange-700/80 dark:text-orange-300/80',
  },
  danger: {
    wrapper: 'bg-rose-50 dark:bg-rose-950/50',
    icon: 'text-rose-700 dark:text-rose-300',
    value: 'text-rose-900 dark:text-rose-100',
    label: 'text-rose-700/80 dark:text-rose-300/80',
  },
  neutral: {
    wrapper: 'bg-surface-100 dark:bg-surface-800',
    icon: 'text-surface-500 dark:text-surface-400',
    value: 'text-surface-800 dark:text-surface-100',
    label: 'text-surface-500 dark:text-surface-400',
  },
};

export default function StatusTile({ label, value, tone = 'neutral', icon = null, hint = null }) {
  const palette = TONES[tone] || TONES.neutral;

  return (
    <div className={`rounded-xl p-3.5 ${palette.wrapper}`}>
      <div className={`flex items-center gap-1.5 ${palette.label}`}>
        {icon ? (
          <span className={palette.icon} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="text-xs font-medium">{label}</span>
      </div>

      <p className={`mt-1 text-base font-bold ${palette.value}`}>{value}</p>

      {hint ? <p className={`text-[11px] ${palette.label}`}>{hint}</p> : null}
    </div>
  );
}
