'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SosIcon } from '@/components/ui/Icons';
import { Spinner } from '@/components/ui/Button';

const HOLD_MS = 1500;

/**
 * Press-and-hold SOS.
 *
 * A plain tap would fire constantly — this button is large, central, and lives
 * on a phone carried in a pocket by someone who may press things absently. A
 * 1.5 second hold is deliberate enough to mean it while still being well within
 * reach in a panic.
 *
 * Keyboard users get an immediate fire on Enter or Space instead: holding a key
 * is not a gesture assistive technology performs reliably, and the accidental
 * press that the hold protects against is a touch problem, not a keyboard one.
 */
export function SosButton({ onTrigger }: { onTrigger: () => Promise<boolean> }) {
  const [progress, setProgress] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);

  const frame = useRef<number | null>(null);
  const start = useRef(0);
  const fired = useRef(false);

  const cancelHold = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
  }, []);

  useEffect(() => cancelHold, [cancelHold]);

  const fire = useCallback(async () => {
    if (isSending) return;
    setIsSending(true);
    cancelHold();

    const ok = await onTrigger();
    setIsSending(false);
    if (ok) setSentAt(Date.now());
  }, [isSending, onTrigger, cancelHold]);

  const tick = useCallback(() => {
    const elapsed = Date.now() - start.current;
    const ratio = Math.min(1, elapsed / HOLD_MS);
    setProgress(ratio);

    if (ratio >= 1) {
      if (!fired.current) {
        fired.current = true;
        void fire();
      }
      return;
    }
    frame.current = requestAnimationFrame(tick);
  }, [fire]);

  const beginHold = useCallback(() => {
    if (isSending) return;
    fired.current = false;
    start.current = Date.now();
    frame.current = requestAnimationFrame(tick);
  }, [isSending, tick]);

  const held = progress > 0 && progress < 1;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        aria-label="Send an SOS alert to your carer. Press and hold."
        className={`relative grid h-40 w-40 place-items-center overflow-hidden rounded-full
          border-4 border-alarm-500/40 bg-alarm-500 text-ink-950
          transition-transform select-none touch-none
          active:scale-95 disabled:opacity-70
          ${!held && !isSending ? 'animate-sos' : ''}`}
        disabled={isSending}
        onPointerDown={beginHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void fire();
          }
        }}
      >
        {/* Fill rises from the bottom as the hold progresses. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 bg-ink-950/25 transition-none"
          style={{ height: `${progress * 100}%` }}
        />
        <span className="relative flex flex-col items-center gap-1.5">
          {isSending ? (
            <Spinner className="h-9 w-9" />
          ) : (
            <SosIcon className="h-10 w-10" strokeWidth={2.2} />
          )}
          <span className="font-display text-2xl font-black tracking-tight">SOS</span>
        </span>
      </button>

      <p className="text-center text-sm text-ink-400" aria-live="polite">
        {isSending
          ? 'Sending…'
          : held
            ? 'Keep holding…'
            : sentAt
              ? 'Your carer has been alerted.'
              : 'Press and hold for help'}
      </p>
    </div>
  );
}
