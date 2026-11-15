'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied';

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
}

export interface GeoError {
  code: number;
  message: string;
  /** Permission was refused — retrying will not help until the user relents. */
  isDenied: boolean;
}

const HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  // A cold high-accuracy acquisition can legitimately take this long indoors or
  // under cloud. Failing earlier would report "GPS unavailable" far too eagerly.
  timeout: 45_000,
  // Never reuse a cached fix: a stale position is worse than no position when
  // the whole point is to know where someone is right now.
  maximumAge: 0,
};

function toFix(position: GeolocationPosition): GeoFix {
  const { coords, timestamp } = position;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
    altitude: Number.isFinite(coords.altitude ?? NaN) ? (coords.altitude as number) : null,
    speed: Number.isFinite(coords.speed ?? NaN) ? (coords.speed as number) : null,
    heading: Number.isFinite(coords.heading ?? NaN) ? (coords.heading as number) : null,
    recordedAt: new Date(timestamp || Date.now()).toISOString(),
  };
}

function toError(error: GeolocationPositionError): GeoError {
  const isDenied = error.code === error.PERMISSION_DENIED;
  const message = isDenied
    ? 'Location permission was refused. Allow location access for this site in your browser settings.'
    : error.code === error.POSITION_UNAVAILABLE
      ? 'Your phone could not get a GPS fix. Try moving near a window or outdoors.'
      : 'Getting a GPS fix took too long. Retrying shortly.';

  return { code: error.code, message, isDenied };
}

/**
 * Geolocation access for the patient device.
 *
 * Deliberately a polled one-shot (`getCurrentPosition`) rather than a
 * continuous `watchPosition`. Uploads happen every three minutes, and the
 * server is the only thing that evaluates geofences, so a persistent watch
 * would hold the GPS chipset awake for ~180 seconds of every 180 to produce
 * readings nobody looks at. On the phone of someone who may not notice a flat
 * battery, that trade is not worth making.
 */
export function useGeolocation() {
  const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [error, setError] = useState<GeoError | null>(null);
  const [isAcquiring, setIsAcquiring] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /* Track the permission itself where the browser exposes it, so the UI can
     explain a refusal without first having to fail a request. */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;

    let status: globalThis.PermissionStatus | null = null;
    const onChange = () => {
      if (status && mounted.current) setPermission(status.state as PermissionState);
    };

    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((result) => {
        status = result;
        if (mounted.current) setPermission(result.state as PermissionState);
        result.addEventListener('change', onChange);
      })
      .catch(() => {
        /* Permissions API unsupported for geolocation; stay 'unknown'. */
      });

    return () => {
      status?.removeEventListener('change', onChange);
    };
  }, []);

  /** Acquire one fresh fix. Resolves null on failure rather than throwing. */
  const capture = useCallback(async (): Promise<GeoFix | null> => {
    if (!isSupported) {
      setError({
        code: -1,
        message: 'This browser cannot share location. Try Chrome or Safari on the phone.',
        isDenied: false,
      });
      return null;
    }

    setIsAcquiring(true);

    return new Promise<GeoFix | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = toFix(position);
          if (mounted.current) {
            setFix(next);
            setError(null);
            setPermission('granted');
            setIsAcquiring(false);
          }
          resolve(next);
        },
        (positionError) => {
          const next = toError(positionError);
          if (mounted.current) {
            setError(next);
            setIsAcquiring(false);
            if (next.isDenied) setPermission('denied');
          }
          resolve(null);
        },
        HIGH_ACCURACY_OPTIONS
      );
    });
  }, [isSupported]);

  return { isSupported, permission, fix, error, isAcquiring, capture };
}
