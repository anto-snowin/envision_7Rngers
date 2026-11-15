'use client';

import { useEffect, useRef, useState } from 'react';

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

export interface DeviceStatus {
  isOnline: boolean;
  /** 0–100, or null where the browser does not expose the Battery API. */
  batteryLevel: number | null;
  isCharging: boolean | null;
  /** True when the browser simply has no Battery Status API (Safari, Firefox). */
  batteryUnsupported: boolean;
}

/**
 * Connectivity and battery for the tracking portal's status tiles.
 *
 * `navigator.onLine` only tells you whether the OS has a network interface, not
 * whether the server is reachable, so the portal treats a failed upload as the
 * real signal and uses this as the fast, cheap hint.
 *
 * The Battery Status API is Chromium-only. Rather than hide the tile on Safari
 * and Firefox, the hook reports `batteryUnsupported` so the UI can say so
 * plainly — a blank tile reads as a fault, which it is not.
 */
export function useDeviceStatus(): DeviceStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);
  const [batteryUnsupported, setBatteryUnsupported] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);

    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  const batteryRef = useRef<BatteryManagerLike | null>(null);

  useEffect(() => {
    const getBattery = (
      navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }
    ).getBattery;

    if (typeof getBattery !== 'function') {
      setBatteryUnsupported(true);
      return;
    }

    let cancelled = false;

    const read = () => {
      const battery = batteryRef.current;
      if (!battery) return;
      setBatteryLevel(Math.round(battery.level * 100));
      setIsCharging(battery.charging);
    };

    getBattery
      .call(navigator)
      .then((battery) => {
        if (cancelled) return;
        batteryRef.current = battery;
        read();
        battery.addEventListener('levelchange', read);
        battery.addEventListener('chargingchange', read);
      })
      .catch(() => {
        if (!cancelled) setBatteryUnsupported(true);
      });

    return () => {
      cancelled = true;
      const battery = batteryRef.current;
      if (battery) {
        battery.removeEventListener('levelchange', read);
        battery.removeEventListener('chargingchange', read);
      }
    };
  }, []);

  return { isOnline, batteryLevel, isCharging, batteryUnsupported };
}

/**
 * Hold a screen wake lock while active.
 *
 * The portal only reports while the page is open, so a phone that sleeps stops
 * tracking. The lock is best-effort: it is Chromium-only, it is revoked
 * whenever the tab is backgrounded, and so it is re-acquired on visibility
 * change.
 */
export function useWakeLock(active: boolean) {
  const [isHeld, setIsHeld] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      setIsHeld(false);
      return;
    }

    let cancelled = false;

    const release = () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setIsHeld(false);
      sentinel?.release().catch(() => {});
    };

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || sentinelRef.current) return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        setIsHeld(true);
        sentinel.addEventListener('release', () => {
          sentinelRef.current = null;
          setIsHeld(false);
        });
      } catch {
        setIsHeld(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [active]);

  return isHeld;
}
