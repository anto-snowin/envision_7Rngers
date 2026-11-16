'use client';

type Tone = 'good' | 'warn' | 'bad' | 'mute';

const TONE: Record<Tone, { dot: string; value: string }> = {
  good: { dot: 'bg-safe-500', value: 'text-safe-400' },
  warn: { dot: 'bg-caution-500', value: 'text-caution-400' },
  bad: { dot: 'bg-alarm-500', value: 'text-alarm-300' },
  mute: { dot: 'bg-ink-600', value: 'text-ink-300' },
};

/**
 * One line of device status.
 *
 * The tone is carried by a dot *and* by the value's colour, never by colour
 * alone — this screen is used by people whose colour vision may be poor, and
 * the words have to carry the meaning on their own.
 */
export function StatusTile({
  label,
  value,
  tone = 'mute',
  detail,
}: {
  label: string;
  value: string;
  tone?: Tone;
  detail?: string | null;
}) {
  const styles = TONE[tone];

  return (
    <div className="panel-flat flex items-center gap-3 p-4">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-500 uppercase">
          {label}
        </p>
        <p className={`mt-0.5 truncate text-base font-bold ${styles.value}`}>{value}</p>
        {detail ? <p className="mt-0.5 truncate text-xs text-ink-500">{detail}</p> : null}
      </div>
    </div>
  );
}
