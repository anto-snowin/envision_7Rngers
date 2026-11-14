/**
 * Browser Geolocation wrapper for the patient portal.
 *
 * `watchPosition` is used rather than a `setInterval` of `getCurrentPosition`
 * because it lets the OS reuse an already-warm GPS fix: repeatedly calling
 * `getCurrentPosition` makes Android and iOS cold-start the GPS each time,
 * which drains the battery far faster and gives worse accuracy. The caller
 * samples the latest watched position on its own cadence instead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Geolocation permission / activity state, surfaced to the UI. */
export const GPS_STATUS = {
  IDLE: 'idle',
  PROMPTING: 'prompting',
  ACQUIRING: 'acquiring',
  ACTIVE: 'active',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
};

/** Turn a GeolocationPositionError into something a patient could read. */
function describeError(error) {
  switch (error?.code) {
    case 1: // PERMISSION_DENIED
      return {
        status: GPS_STATUS.DENIED,
        message:
          'Location access was blocked. Please allow location for this site in your browser settings, then reload.',
      };
    case 2: // POSITION_UNAVAILABLE
      return {
        status: GPS_STATUS.ERROR,
        message:
          'Your location could not be determined. Move somewhere with a clearer view of the sky.',
      };
    case 3: // TIMEOUT
      return {
        status: GPS_STATUS.ACQUIRING,
        message: 'Still searching for a GPS signal...',
      };
    default:
      return {
        status: GPS_STATUS.ERROR,
        message: error?.message || 'An unknown location error occurred.',
      };
  }
}

/**
 * Track the device's position.
 *
 * @param {object} [options]
 * @param {boolean} [options.enableHighAccuracy] true asks for GPS rather than
 *   coarse network positioning. Essential here: a 2 km network fix would make
 *   geofencing meaningless.
 * @param {number} [options.maximumAge] how stale a cached fix may be, in ms
 * @param {number} [options.timeout] per-attempt timeout, in ms
 */
export function useGeolocation({
  enableHighAccuracy = true,
  maximumAge = 4000,
  timeout = 15000,
} = {}) {
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState(GPS_STATUS.IDLE);
  const [error, setError] = useState(null);
  const [fixCount, setFixCount] = useState(0);

  const watchIdRef = useRef(null);
  const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  /** Begin watching the device position. */
  const start = useCallback(() => {
    if (!isSupported) {
      setStatus(GPS_STATUS.UNAVAILABLE);
      setError('This browser does not support location tracking.');
      return;
    }

    // Already watching.
    if (watchIdRef.current !== null) return;

    setStatus(GPS_STATUS.PROMPTING);
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
        });
        setStatus(GPS_STATUS.ACTIVE);
        setError(null);
        setFixCount((count) => count + 1);
      },
      (err) => {
        const described = describeError(err);
        setStatus(described.status);
        setError(described.message);

        // A timeout is transient: the watch stays alive and may still succeed,
        // so the last known position is deliberately kept on screen.
      },
      { enableHighAccuracy, maximumAge, timeout }
    );
  }, [isSupported, enableHighAccuracy, maximumAge, timeout]);

  /** Stop watching and release the GPS. */
  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus(GPS_STATUS.IDLE);
  }, []);

  /**
   * Query the Permissions API, when available, so the UI can explain a blocked
   * permission before the patient taps anything. Safari lacks this, hence the
   * optional handling.
   */
  const [permission, setPermission] = useState('unknown');
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return undefined;

    let permissionStatus = null;
    const handler = () => setPermission(permissionStatus.state);

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        permissionStatus = result;
        setPermission(result.state);
        result.addEventListener('change', handler);
      })
      .catch(() => setPermission('unknown'));

    return () => {
      if (permissionStatus) permissionStatus.removeEventListener('change', handler);
    };
  }, []);

  // Release the watch if the component unmounts while tracking.
  useEffect(() => () => stop(), [stop]);

  return {
    position,
    status,
    error,
    permission,
    isSupported,
    isTracking: watchIdRef.current !== null && status === GPS_STATUS.ACTIVE,
    fixCount,
    start,
    stop,
  };
}

export default useGeolocation;
