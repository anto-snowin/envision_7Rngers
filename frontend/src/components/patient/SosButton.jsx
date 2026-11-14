/**
 * SOS button for the patient portal.
 *
 * Deliberately large and red. Two design decisions worth stating:
 *
 *  1. **A press-and-hold, not a tap.** A tap would fire constantly from a phone
 *     in a pocket. Holding for 1.5 seconds is still well within reach of someone
 *     with limited dexterity, and the ring fills as they hold so the gesture
 *     explains itself.
 *  2. **It works without a GPS fix.** If no position is available the server
 *     falls back to the patient's last known location. Help being sent to a
 *     slightly stale position beats no alert at all.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { locationApi } from '../../api';
import { SosIcon, CheckIcon } from '../shared/Icons';

const HOLD_DURATION_MS = 1500;

export default function SosButton({
  trackingCode,
  position = null,
  batteryLevel = null,
  disabled = false,
  className = '',
}) {
  const [progress, setProgress] = useState(0); // 0-1 while holding
  const [state, setState] = useState('idle'); // idle | sending | sent | failed

  const holdStartRef = useRef(null);
  const frameRef = useRef(null);

  /** Fire the alert. */
  const sendSos = useCallback(async () => {
    setState('sending');

    try {
      await locationApi.sendSos({
        trackingCode,
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
        accuracy: position?.accuracy ?? null,
        batteryLevel,
      });
      setState('sent');
    } catch {
      // Even a failed request matters: the patient must know it did not go
      // through so they can try again or use a phone.
      setState('failed');
    }
  }, [trackingCode, position, batteryLevel]);

  /** Animate the hold ring; fire once it completes. */
  const tick = useCallback(() => {
    if (holdStartRef.current == null) return;

    const elapsed = Date.now() - holdStartRef.current;
    const ratio = Math.min(1, elapsed / HOLD_DURATION_MS);
    setProgress(ratio);

    if (ratio >= 1) {
      holdStartRef.current = null;
      setProgress(0);
      sendSos();
      return;
    }

    frameRef.current = requestAnimationFrame(tick);
  }, [sendSos]);

  const startHold = (event) => {
    // Ignore the synthetic mouse events a touch generates, and any
    // non-primary click.
    if (disabled || state === 'sending') return;
    if (event.button != null && event.button !== 0) return;

    holdStartRef.current = Date.now();
    frameRef.current = requestAnimationFrame(tick);
  };

  const cancelHold = () => {
    holdStartRef.current = null;
    setProgress(0);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  };

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // Let the confirmation fade back so a second SOS is possible.
  useEffect(() => {
    if (state !== 'sent' && state !== 'failed') return undefined;
    const timer = setTimeout(() => setState('idle'), 6000);
    return () => clearTimeout(timer);
  }, [state]);

  if (state === 'sent') {
    return (
      <div
        className={`rounded-2xl bg-green-50 p-5 text-center dark:bg-green-950/60 ${className}`}
        role="status"
      >
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white">
          <CheckIcon className="h-6 w-6" />
        </div>
        <p className="font-bold text-green-900 dark:text-green-100">Help is on the way</p>
        <p className="mt-1 text-sm text-green-800 dark:text-green-200">
          Your caregiver has been alerted and can see where you are.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={disabled || state === 'sending'}
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        onTouchCancel={cancelHold}
        // Keyboard equivalent: Enter/Space fire immediately, since a keyboard
        // user cannot press the button by accident in a pocket.
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
            event.preventDefault();
            sendSos();
          }
        }}
        aria-label="Press and hold for one and a half seconds to send an emergency alert"
        className={`relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-severity-critical py-6 text-white transition-transform active:scale-[0.98] disabled:opacity-60 ${
          progress === 0 && state === 'idle' ? 'animate-sos' : ''
        }`}
        // Stop the long-press text-selection / context menu on mobile.
        style={{ touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none' }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {/* Fill that tracks the hold. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-white/25 transition-none"
          style={{ width: `${progress * 100}%` }}
        />

        <SosIcon className="relative h-8 w-8" />
        <span className="relative text-left">
          <span className="block text-xl font-extrabold tracking-wide">
            {state === 'sending' ? 'Sending…' : 'SOS'}
          </span>
          <span className="block text-xs font-medium opacity-90">
            {state === 'sending' ? 'Alerting your caregiver' : 'Press and hold for help'}
          </span>
        </span>
      </button>

      {state === 'failed' ? (
        <p
          className="mt-2 rounded-xl bg-rose-50 p-3 text-center text-sm font-medium text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
          role="alert"
        >
          The alert could not be sent. Please try again, or telephone someone directly.
        </p>
      ) : null}
    </div>
  );
}
