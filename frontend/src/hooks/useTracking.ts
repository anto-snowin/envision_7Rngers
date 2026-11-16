'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, ApiError, readToken } from '@/lib/api';
import { ALERT_TYPES, HEARTBEAT_MS, LOCATION_INTERVAL_MS, SOCKET_EVENTS } from '@/lib/constants';
import { location as locationApi } from '@/lib/endpoints';
import * as queue from '@/lib/queue';
import type { PendingFix } from '@/lib/types';
import { useGeolocation, type GeoFix } from './useGeolocation';
import { useDeviceStatus, useWakeLock } from './useDeviceStatus';
import { useSocket } from '@/providers/SocketProvider';

export type TrackingPhase =
  | 'starting'
  | 'acquiring'
  | 'tracking'
  | 'gps-denied'
  | 'gps-unavailable'
  | 'unsupported';

export interface TrackingState {
  phase: TrackingPhase;
  lastFix: GeoFix | null;
  /** When the server last accepted a fix. */
  lastUploadAt: string | null;
  /** Epoch ms of the next scheduled capture, for the countdown. */
  nextUploadAt: number | null;
  queuedCount: number;
  fixesSent: number;
  isUploading: boolean;
  uploadError: string | null;
  /** The server's verdict on the last accepted fix. */
  insideSafeZone: boolean | null;
  dangerZone: string | null;
  distanceFromSafeZone: number | null;
  gpsMessage: string | null;
  isOnline: boolean;
  batteryLevel: number | null;
  isCharging: boolean | null;
  batteryUnsupported: boolean;
  wakeLockHeld: boolean;
}

/**
 * The patient device's tracking loop.
 *
 * Captures a fix every three minutes, uploads it, and buffers to IndexedDB
 * whenever the upload cannot reach the server. Two decisions worth knowing:
 *
 * 1. A failed upload — not `navigator.onLine` — is what marks the device
 *    offline. `onLine` only reports whether the OS has a network interface, so
 *    a phone on hotel wifi with no route to the internet reports itself online
 *    while every request fails.
 *
 * 2. The device reports INTERNET_RESTORED when it comes back, but never
 *    INTERNET_DISCONNECTED: a device with no connection cannot tell anyone it
 *    has no connection. The server's presence sweep is what notices silence,
 *    so the two halves of that story come from the side that can actually
 *    observe them.
 */
export function useTracking({ enabled }: { enabled: boolean }): TrackingState & {
  captureNow: () => void;
  sendSos: () => Promise<boolean>;
  stopTracking: () => void;
} {
  const geo = useGeolocation();
  const device = useDeviceStatus();
  const { socket } = useSocket();
  const wakeLockHeld = useWakeLock(enabled);

  const [phase, setPhase] = useState<TrackingPhase>('starting');
  const [lastUploadAt, setLastUploadAt] = useState<string | null>(null);
  const [nextUploadAt, setNextUploadAt] = useState<number | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [fixesSent, setFixesSent] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [insideSafeZone, setInsideSafeZone] = useState<boolean | null>(null);
  const [dangerZone, setDangerZone] = useState<string | null>(null);
  const [distanceFromSafeZone, setDistanceFromSafeZone] = useState<number | null>(null);

  /** Guards against two capture cycles overlapping on a slow fix. */
  const cycleRunning = useRef(false);
  const wasOffline = useRef(false);
  const gpsFailureReported = useRef(false);
  const stopped = useRef(false);

  const refreshQueueCount = useCallback(async () => {
    setQueuedCount(await queue.count());
  }, []);

  /**
   * Send a fix, with every queued fix ahead of it.
   *
   * Pending fixes go first and in one request so the server replays them
   * through the geofence engine in the order they happened — out-of-order
   * delivery would produce nonsense zone transitions.
   */
  const upload = useCallback(
    async (fix: GeoFix | null) => {
      const pending = await queue.readAll();

      const payload: PendingFix[] = [
        ...queue.toPayload(pending),
        ...(fix
          ? [
              {
                latitude: fix.latitude,
                longitude: fix.longitude,
                accuracy: fix.accuracy,
                altitude: fix.altitude,
                speed: fix.speed,
                heading: fix.heading,
                batteryLevel: device.batteryLevel,
                isCharging: device.isCharging,
                recordedAt: fix.recordedAt,
              },
            ]
          : []),
      ];

      if (!payload.length) return;

      setIsUploading(true);
      try {
        const result = await locationApi.update(payload, pending.length ? 'queued' : 'online');

        await queue.remove(pending);
        await refreshQueueCount();

        setLastUploadAt(new Date().toISOString());
        setFixesSent((count) => count + result.accepted);
        setInsideSafeZone(result.insideSafeZone);
        setDangerZone(result.dangerZone);
        setDistanceFromSafeZone(result.distanceFromSafeZone);
        setUploadError(null);

        // Coming back from a gap is worth telling the caretaker about, and only
        // the device can know how long the gap was.
        if (wasOffline.current) {
          wasOffline.current = false;
          const recovered = pending.length;
          locationApi
            .deviceEvent(
              ALERT_TYPES.INTERNET_RESTORED,
              recovered
                ? `Device back online and uploaded ${recovered} stored location${recovered === 1 ? '' : 's'}.`
                : 'Device back online.'
            )
            .catch(() => {});
        }
      } catch (caught) {
        /**
         * Only a transport failure (status 0) means "queue it and try later".
         * A 4xx means the server looked at this fix and refused it, so storing
         * it would mean retrying a rejection forever.
         */
        const isTransport = caught instanceof ApiError && caught.status === 0;

        if (isTransport && fix) {
          wasOffline.current = true;
          await queue.enqueue({
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy,
            altitude: fix.altitude,
            speed: fix.speed,
            heading: fix.heading,
            batteryLevel: device.batteryLevel,
            isCharging: device.isCharging,
            recordedAt: fix.recordedAt,
          });
          await refreshQueueCount();
          setUploadError('No connection. Your location is saved and will be sent automatically.');
        } else {
          setUploadError(
            caught instanceof ApiError ? caught.message : 'Could not send your location.'
          );
        }
      } finally {
        setIsUploading(false);
      }
    },
    [device.batteryLevel, device.isCharging, refreshQueueCount]
  );

  /** One capture-and-upload cycle. */
  const runCycle = useCallback(async () => {
    if (cycleRunning.current || stopped.current) return;
    cycleRunning.current = true;

    try {
      setPhase((current) => (current === 'tracking' ? current : 'acquiring'));

      const fix = await geo.capture();

      if (fix) {
        gpsFailureReported.current = false;
        setPhase('tracking');
        await upload(fix);
      } else {
        const denied = geo.error?.isDenied;
        setPhase(!geo.isSupported ? 'unsupported' : denied ? 'gps-denied' : 'gps-unavailable');

        // Tell the caretaker once per outage, not once per failed attempt.
        if (!gpsFailureReported.current) {
          gpsFailureReported.current = true;
          locationApi
            .deviceEvent(
              ALERT_TYPES.GPS_UNAVAILABLE,
              denied
                ? 'The patient device refused location permission.'
                : 'The patient device could not get a GPS fix.'
            )
            .catch(() => {});
        }

        // Still report presence: a device with bad GPS is present, and that is
        // very different from a device that has been switched off.
        locationApi
          .ping({
            online: true,
            batteryLevel: device.batteryLevel,
            isCharging: device.isCharging,
          })
          .catch(() => {});
      }
    } finally {
      cycleRunning.current = false;
      setNextUploadAt(Date.now() + LOCATION_INTERVAL_MS);
    }
  }, [geo, upload, device.batteryLevel, device.isCharging]);

  /* ------------------------------------------------------------ the loop --- */

  /**
   * The interval must call the *latest* cycle, not the one that existed when it
   * was scheduled.
   *
   * `runCycle` changes identity whenever the battery reading does, so a plain
   * `setInterval(runCycle)` would keep calling the version captured at mount —
   * and since the Battery Status API resolves asynchronously, that version
   * closes over `batteryLevel: null`. Every stored fix would then report a null
   * battery forever. Restarting the interval on each change is not an option
   * either: it would re-fire a capture every time the level ticked.
   */
  const cycleRef = useRef(runCycle);
  useEffect(() => {
    cycleRef.current = runCycle;
  }, [runCycle]);

  useEffect(() => {
    if (!enabled) return;

    stopped.current = false;
    void refreshQueueCount();
    void cycleRef.current();

    const timer = setInterval(() => void cycleRef.current(), LOCATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, refreshQueueCount]);

  /* -------------------------------------------- flush on regained network --- */
  useEffect(() => {
    if (!enabled) return;

    const onOnline = () => {
      void upload(null);
    };

    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [enabled, upload]);

  /* ----------------------------------------------------------- heartbeat --- */
  useEffect(() => {
    if (!enabled || !socket) return;

    const beat = () =>
      socket.emit(SOCKET_EVENTS.PATIENT_HEARTBEAT, {
        batteryLevel: device.batteryLevel,
        isCharging: device.isCharging,
        gpsStatus: geo.permission,
      });

    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [enabled, socket, device.batteryLevel, device.isCharging, geo.permission]);

  /* ------------------------------------------- tell the server on teardown --- */
  useEffect(() => {
    if (!enabled) return;

    /**
     * `keepalive` is what makes this work: an ordinary fetch started during
     * unload is cancelled when the page goes away, so the caretaker would
     * never learn the device stopped reporting on purpose.
     */
    const reportStop = () => {
      if (stopped.current) return;
      stopped.current = true;

      const token = readToken();
      if (!token) return;

      void fetch(`${API_BASE}/api/location/device-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: ALERT_TYPES.TRACKING_STOPPED,
          message: 'The tracking page was closed on the device.',
        }),
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener('pagehide', reportStop);
    return () => window.removeEventListener('pagehide', reportStop);
  }, [enabled]);

  const stopTracking = useCallback(() => {
    stopped.current = true;
  }, []);

  const sendSos = useCallback(async () => {
    try {
      // Try for a fresh fix, but never let its failure block the SOS: the
      // server falls back to the last known position.
      const fix = await geo.capture();
      await locationApi.sos({
        latitude: fix?.latitude ?? null,
        longitude: fix?.longitude ?? null,
        accuracy: fix?.accuracy ?? null,
      });
      return true;
    } catch {
      return false;
    }
  }, [geo]);

  return {
    phase,
    lastFix: geo.fix,
    lastUploadAt,
    nextUploadAt,
    queuedCount,
    fixesSent,
    isUploading,
    uploadError,
    insideSafeZone,
    dangerZone,
    distanceFromSafeZone,
    gpsMessage: geo.error?.message ?? null,
    isOnline: device.isOnline,
    batteryLevel: device.batteryLevel,
    isCharging: device.isCharging,
    batteryUnsupported: device.batteryUnsupported,
    wakeLockHeld,
    captureNow: () => void runCycle(),
    sendSos,
    stopTracking,
  };
}
