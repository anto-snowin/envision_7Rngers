'use client';

type Tone = 'neutral' | 'acid' | 'safe' | 'caution' | 'alarm';

const TONE: Record<Tone, string> = {
  neutral: 'text-ink-100',
  acid: 'text-acid-500',
  safe: 'text-safe-400',
  caution: 'text-caution-400',
  alarm: 'text-alarm-300',
};

/**
 * One headline number.
 *
 * The value is the largest thing in the tile because the caretaker is scanning
 * for a number that has changed, not reading labels.
 */
export function StatTile({
  label,
  value,
  detail,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: string | number;
  detail?: string | null;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  return (
    <div className="panel panel-lit p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">
          {label}
        </p>
        {icon ? <span className="text-ink-600">{icon}</span> : null}
      </div>
      <p className={`tnum mt-3 text-4xl leading-none font-black ${TONE[tone]}`}>{value}</p>
      {detail ? <p className="mt-2 text-xs text-ink-500">{detail}</p> : null}
    </div>
  );
}
