/**
 * Device status hooks for the patient portal: connectivity and battery.
 */
import { useEffect, useState } from 'react';

/**
 * Online / offline state.
 *
 * `navigator.onLine` is only a hint — it reports whether the device has *a*
 * network interface, not whether the API is reachable (a captive portal or a
 * dead mobile data connection both report "online"). It is still the right
 * trigger for flushing the offline queue, but the portal also treats a failed
 * upload as evidence of being offline.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );

  // When the connection last changed, so the UI can say "offline for 2 min".
  const [since, setSince] = useState(() => new Date());

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      setSince(new Date());
    };
    const goOffline = () => {
      setIsOnline(false);
      setSince(new Date());
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { isOnline, since };
}

/**
 * Battery level and charging state via the Battery Status API.
 *
 * Only Chromium-based browsers implement this; Firefox and Safari removed it
 * for fingerprinting reasons. `isSupported` is false there and the portal
 * simply omits the battery row rather than showing a misleading 0%.
 */
export function useBattery() {
  const [battery, setBattery] = useState({
    level: null, // 0-100
    isCharging: null,
    isSupported: false,
  });

  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof navigator.getBattery !== 'function') {
      return undefined;
    }

    let batteryManager = null;
    let cancelled = false;

    const read = () => {
      if (!batteryManager || cancelled) return;
      setBattery({
        level: Math.round(batteryManager.level * 100),
        isCharging: batteryManager.charging,
        isSupported: true,
      });
    };

    navigator
      .getBattery()
      .then((manager) => {
        if (cancelled) return;
        batteryManager = manager;
        read();
        manager.addEventListener('levelchange', read);
        manager.addEventListener('chargingchange', read);
      })
      .catch(() => {
        // The API exists but was refused; treat it as unsupported.
      });

    return () => {
      cancelled = true;
      if (batteryManager) {
        batteryManager.removeEventListener('levelchange', read);
        batteryManager.removeEventListener('chargingchange', read);
      }
    };
  }, []);

  return battery;
}

/**
 * Document visibility, so the portal can tell the patient that a backgrounded
 * tab may be throttled by the browser.
 */
export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );

  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return isVisible;
}

/**
 * Keep the screen awake while tracking, where the browser allows it.
 *
 * Without this the phone sleeps after a minute or two and the browser stops
 * delivering position updates — tracking would silently stop. Only Chromium
 * implements the Screen Wake Lock API; elsewhere this is a no-op and the portal
 * warns the patient to keep the screen on.
 */
export function useWakeLock(enabled) {
  const [isActive, setIsActive] = useState(false);
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    if (!enabled || !isSupported) return undefined;

    let sentinel = null;
    let cancelled = false;

    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release();
          return;
        }
        setIsActive(true);
        sentinel.addEventListener('release', () => setIsActive(false));
      } catch {
        // Denied, or the page is not visible. Not fatal.
        setIsActive(false);
      }
    };

    request();

    // The lock is dropped automatically when the tab is hidden, so re-acquire
    // it when the patient returns to the page.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !sentinel) request();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel) {
        sentinel.release().catch(() => {});
        sentinel = null;
      }
      setIsActive(false);
    };
  }, [enabled, isSupported]);

  return { isActive, isSupported };
}
