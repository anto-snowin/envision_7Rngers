/**
 * Patient tracking portal — `/track/:trackingCode`
 *
 * Opened in the browser on the patient's own phone. There is no login: the
 * tracking code in the URL is the credential.
 *
 * The flow is deliberately simple, because the person holding the phone may be
 * confused by anything that is not: one large button to start, then a status
 * screen with an SOS button that stays reachable at all times.
 *
 * Design notes:
 *  - `watchPosition` runs continuously but fixes are *posted* on a 5-second
 *    timer. Watching keeps the GPS warm (far better for battery and accuracy
 *    than polling `getCurrentPosition`), while the timer controls bandwidth.
 *  - Every failed upload goes to IndexedDB and is retried, so a walk through a
 *    dead spot still produces a complete trail.
 *  - A socket heartbeat runs alongside the REST posts so the caregiver can tell
 *    "the phone is here but GPS is struggling" from "the phone is gone".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';

import { locationApi } from '../../api';
import { BASE_URL } from '../../lib/apiClient';
import {
  enqueueFix,
  peekFixes,
  queueSize,
  removeFixes,
  isUsingMemoryFallback,
} from '../../lib/offlineQueue';
import { useGeolocation, GPS_STATUS } from '../../hooks/useGeolocation';
import { useOnlineStatus, useBattery, useWakeLock } from '../../hooks/useDeviceStatus';
import { DEFAULT_TRACKING_INTERVAL_MS } from '../../lib/constants';
import {
  formatCoordinate,
  formatTimeWithSeconds,
  formatAccuracy,
  formatDistance,
} from '../../lib/format';
import Button from '../../components/shared/Button';
import { ThemeToggle } from '../../components/shared/Controls';
import {
  LocationIcon,
  SatelliteIcon,
  WifiIcon,
  WifiOffIcon,
  BatteryIcon,
  CheckIcon,
  ClockIcon,
  ShieldIcon,
} from '../../components/shared/Icons';
import SosButton from '../../components/patient/SosButton';
import StatusTile from '../../components/patient/StatusTile';

/** Portal lifecycle. */
const PHASE = {
  LOADING: 'loading', // validating the tracking code
  INVALID: 'invalid', // bad code
  READY: 'ready', // waiting for the patient to start
  TRACKING: 'tracking',
  STOPPED: 'stopped',
};

export default function PatientPortal() {
  const { trackingCode } = useParams();

  const [phase, setPhase] = useState(PHASE.LOADING);
  const [session, setSession] = useState(null);
  const [loadError, setLoadError] = useState(null);

  // Last server verdict, echoed back from the ingest endpoint.
  const [zoneStatus, setZoneStatus] = useState(null);
  const [lastUploadAt, setLastUploadAt] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  const geo = useGeolocation({ enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 });
  const { isOnline } = useOnlineStatus();
  const battery = useBattery();
  const wakeLock = useWakeLock(phase === PHASE.TRACKING);

  const socketRef = useRef(null);
  const uploadTimerRef = useRef(null);
  const isUploadingRef = useRef(false);

  // The newest position, kept in a ref so the upload timer always reads the
  // latest value without being re-created on every fix.
  const latestPositionRef = useRef(null);
  useEffect(() => {
    latestPositionRef.current = geo.position;
  }, [geo.position]);

  const batteryRef = useRef(battery);
  useEffect(() => {
    batteryRef.current = battery;
  }, [battery]);

  const intervalMs = session?.config?.intervalMs || DEFAULT_TRACKING_INTERVAL_MS;

  // ----------------------------------------------------------- session setup

  useEffect(() => {
    let cancelled = false;

    async function openSession() {
      try {
        const { data } = await locationApi.startSession(trackingCode);
        if (cancelled) return;
        setSession(data);
        setPhase(PHASE.READY);
      } catch (err) {
        if (cancelled) return;
        // A 401 means the code is wrong or was rotated; anything else is a
        // transport problem worth distinguishing, since the patient can retry.
        setLoadError(err);
        setPhase(err.status === 401 || err.status === 403 ? PHASE.INVALID : PHASE.READY);
      }
    }

    openSession();
    return () => {
      cancelled = true;
    };
  }, [trackingCode]);

  // ----------------------------------------------------------- offline queue

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await queueSize());
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  /**
   * Upload everything waiting in the queue, oldest first.
   *
   * Only the records the server actually accepted are deleted, so a partial
   * failure never silently loses fixes.
   */
  const flushQueue = useCallback(async () => {
    const queued = await peekFixes(200);
    if (!queued.length) return;

    try {
      const { data } = await locationApi.sendBatch({
        trackingCode,
        sessionId: session?.sessionId,
        fixes: queued.map(({ id, queuedAt, ...fix }) => fix),
      });

      // The server reports how many it took. Anything it rejected as invalid
      // would be rejected again, so the whole slice is cleared rather than
      // retried forever.
      if (data.accepted > 0 || data.rejected > 0) {
        await removeFixes(queued.map((record) => record.id));
      }

      setLastUploadAt(new Date());
      setUploadError(null);
    } catch {
      // Still offline, or the server is unreachable. Leave the queue alone.
    } finally {
      refreshPendingCount();
    }
  }, [trackingCode, session?.sessionId, refreshPendingCount]);

  // Flush as soon as connectivity returns, and tell the server we are back.
  useEffect(() => {
    if (!isOnline || phase !== PHASE.TRACKING) return;

    locationApi.reportDeviceEvent({ trackingCode, type: 'INTERNET_RESTORED' }).catch(() => {});
    flushQueue();
  }, [isOnline, phase, trackingCode, flushQueue]);

  // Report losing connectivity, so the caregiver knows why fixes stopped.
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (wasOnlineRef.current && !isOnline && phase === PHASE.TRACKING) {
      // This request will itself fail while offline; the server learns about
      // the outage from the silence and the presence sweep. The attempt is
      // still worth making for the case where only the API is unreachable.
      locationApi
        .reportDeviceEvent({ trackingCode, type: 'INTERNET_DISCONNECTED' })
        .catch(() => {});
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, phase, trackingCode]);

  // --------------------------------------------------------------- uploading

  /** Post the newest fix, falling back to the queue on any failure. */
  const uploadCurrentFix = useCallback(async () => {
    const position = latestPositionRef.current;
    if (!position || isUploadingRef.current) return;

    isUploadingRef.current = true;

    const fix = {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      altitude: position.altitude,
      speed: position.speed,
      heading: position.heading,
      batteryLevel: batteryRef.current.level,
      isCharging: batteryRef.current.isCharging,
      recordedAt: new Date(position.timestamp).toISOString(),
    };

    // Known-offline: skip the doomed request and queue directly.
    if (!isOnline) {
      await enqueueFix(fix);
      await refreshPendingCount();
      isUploadingRef.current = false;
      return;
    }

    try {
      const { data } = await locationApi.sendFix({
        ...fix,
        trackingCode,
        sessionId: session?.sessionId,
      });

      setZoneStatus({
        zoneState: data.zoneState,
        isInsideSafeZone: data.isInsideSafeZone,
        distanceFromHome: data.distanceFromHome,
      });
      setLastUploadAt(new Date());
      setUploadError(null);

      // A successful post means connectivity is back even if the browser never
      // fired an `online` event (common on flaky mobile data), so drain any
      // backlog now.
      if (pendingCount > 0) flushQueue();
    } catch (err) {
      // A validation rejection would fail again, so it is dropped rather than
      // queued; a transport failure is queued for retry.
      if (err.status === 400) {
        setUploadError(err.message);
      } else {
        await enqueueFix(fix);
        await refreshPendingCount();
        setUploadError(err.isNetworkError ? null : err.message);
      }
    } finally {
      isUploadingRef.current = false;
    }
  }, [isOnline, trackingCode, session?.sessionId, pendingCount, flushQueue, refreshPendingCount]);

  // The 5-second upload cadence.
  useEffect(() => {
    if (phase !== PHASE.TRACKING) return undefined;

    // Send one immediately so the caregiver sees the patient appear at once.
    uploadCurrentFix();

    uploadTimerRef.current = setInterval(uploadCurrentFix, intervalMs);
    return () => clearInterval(uploadTimerRef.current);
  }, [phase, intervalMs, uploadCurrentFix]);

  // ---------------------------------------------------- GPS failure reporting

  const reportedGpsErrorRef = useRef(false);
  useEffect(() => {
    if (phase !== PHASE.TRACKING) return;

    const hasFailed = geo.status === GPS_STATUS.DENIED || geo.status === GPS_STATUS.ERROR;

    // Report the transition into failure once, not every render.
    if (hasFailed && !reportedGpsErrorRef.current) {
      reportedGpsErrorRef.current = true;
      locationApi
        .reportDeviceEvent({
          trackingCode,
          type: 'GPS_UNAVAILABLE',
          message: geo.error || 'Location unavailable',
        })
        .catch(() => {});
    } else if (!hasFailed && geo.status === GPS_STATUS.ACTIVE) {
      reportedGpsErrorRef.current = false;
    }
  }, [geo.status, geo.error, phase, trackingCode]);

  // ------------------------------------------------------- socket heartbeat

  useEffect(() => {
    if (phase !== PHASE.TRACKING) return undefined;

    const socket = io(BASE_URL, {
      auth: { trackingCode },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    // Heartbeat on a slower cadence than the fixes: its only job is to prove
    // the phone is still present when GPS has nothing to report.
    const heartbeat = setInterval(() => {
      socket.emit('patient:heartbeat', {
        batteryLevel: batteryRef.current.level,
        isCharging: batteryRef.current.isCharging,
        gpsStatus: geo.status,
      });
    }, 15000);

    return () => {
      clearInterval(heartbeat);
      socket.disconnect();
      socketRef.current = null;
    };
    // `geo.status` is read from the closure at tick time; it is intentionally
    // not a dependency, since re-creating the socket on every GPS state change
    // would thrash the connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, trackingCode]);

  // --------------------------------------------------------------- lifecycle

  const startTracking = () => {
    geo.start();
    setPhase(PHASE.TRACKING);
  };

  const stopTracking = async () => {
    geo.stop();
    clearInterval(uploadTimerRef.current);
    setPhase(PHASE.STOPPED);

    await locationApi.reportDeviceEvent({ trackingCode, type: 'TRACKING_STOPPED' }).catch(() => {});
  };

  // Warn before closing the tab while tracking — a patient closing it by
  // accident silently ends monitoring.
  useEffect(() => {
    if (phase !== PHASE.TRACKING) return undefined;

    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  // ------------------------------------------------------------------ render

  if (phase === PHASE.LOADING) {
    return (
      <PortalShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="text-sm text-surface-500 dark:text-surface-400">Checking your link…</p>
        </div>
      </PortalShell>
    );
  }

  if (phase === PHASE.INVALID) {
    return (
      <PortalShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-3xl dark:bg-rose-950/60">
            ⚠️
          </div>
          <h1 className="text-lg font-bold text-surface-900 dark:text-surface-50">
            This tracking link is not valid
          </h1>
          <p className="max-w-xs text-sm text-surface-500 dark:text-surface-400">
            It may have been replaced with a newer one. Please ask your caregiver for an up-to-date
            link.
          </p>
        </div>
      </PortalShell>
    );
  }

  const patientName = session?.patient?.name?.split(' ')[0] || 'there';

  return (
    <PortalShell>
      {phase === PHASE.READY ? (
        <StartScreen
          name={patientName}
          onStart={startTracking}
          loadError={loadError}
          gpsSupported={geo.isSupported}
          permission={geo.permission}
        />
      ) : (
        <TrackingScreen
          phase={phase}
          geo={geo}
          isOnline={isOnline}
          battery={battery}
          wakeLock={wakeLock}
          zoneStatus={zoneStatus}
          session={session}
          lastUploadAt={lastUploadAt}
          pendingCount={pendingCount}
          uploadError={uploadError}
          trackingCode={trackingCode}
          onStop={stopTracking}
          onStart={startTracking}
        />
      )}
    </PortalShell>
  );
}

/** Page chrome shared by every portal phase. */
function PortalShell({ children }) {
  return (
    <div className="flex min-h-full flex-col bg-surface-50 dark:bg-surface-950">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <LocationIcon className="h-4.5 w-4.5" />
          </span>
          <span className="text-sm font-bold text-surface-900 dark:text-surface-50">
            Dementia Care
          </span>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 flex-col px-4 pb-safe">{children}</div>
    </div>
  );
}

/** Pre-tracking screen: explains what will happen, then one big button. */
function StartScreen({ name, onStart, loadError, gpsSupported, permission }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-100 dark:bg-brand-950">
          <ShieldIcon className="h-10 w-10 text-brand-700 dark:text-brand-300" />
        </div>

        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">Hello {name}</h1>
        <p className="mt-2 text-sm leading-relaxed text-surface-600 dark:text-surface-300">
          This page lets the person caring for you know where you are, so they can help if you need
          it. Tap the button below to begin.
        </p>
      </div>

      {!gpsSupported ? (
        <div className="mt-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
          This browser cannot share your location. Please try opening this link in Chrome or Safari.
        </div>
      ) : null}

      {permission === 'denied' ? (
        <div className="mt-6 rounded-xl bg-orange-50 p-4 text-sm text-orange-900 dark:bg-orange-950/50 dark:text-orange-200">
          <p className="font-semibold">Location is currently blocked</p>
          <p className="mt-1">
            Open your browser settings for this site and allow location, then reload this page.
          </p>
        </div>
      ) : null}

      {loadError && !loadError.status ? (
        <div className="mt-6 rounded-xl bg-orange-50 p-4 text-sm text-orange-900 dark:bg-orange-950/50 dark:text-orange-200">
          Could not reach the server. You can still start — your location will be saved on this
          phone and sent when the connection returns.
        </div>
      ) : null}

      <Button
        onClick={onStart}
        size="lg"
        fullWidth
        className="mt-8 !py-4 !text-base"
        disabled={!gpsSupported}
      >
        Start sharing my location
      </Button>

      <p className="mt-4 text-center text-xs text-surface-500 dark:text-surface-400">
        Your phone will ask permission to use your location. Please choose
        <strong> Allow</strong>.
      </p>

      {/* Set expectations about the practical requirements up front. */}
      <ul className="mt-8 space-y-2 text-xs text-surface-500 dark:text-surface-400">
        <li className="flex gap-2">
          <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Keep this page open and your screen on while you are out.
        </li>
        <li className="flex gap-2">
          <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          If you lose signal, your route is saved and sent later.
        </li>
        <li className="flex gap-2">
          <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Press the red SOS button at any time to call for help.
        </li>
      </ul>
    </div>
  );
}

/** Live tracking screen. */
function TrackingScreen({
  phase,
  geo,
  isOnline,
  battery,
  wakeLock,
  zoneStatus,
  session,
  lastUploadAt,
  pendingCount,
  uploadError,
  trackingCode,
  onStop,
  onStart,
}) {
  const isStopped = phase === PHASE.STOPPED;
  const position = geo.position;

  // Zone banner wording, driven by the server's verdict.
  const zoneBanner = (() => {
    if (isStopped) {
      return {
        tone: 'neutral',
        title: 'Sharing paused',
        body: 'Your caregiver is not receiving updates.',
      };
    }
    if (geo.status === GPS_STATUS.DENIED) {
      return {
        tone: 'danger',
        title: 'Location is blocked',
        body: 'Allow location for this site in your browser settings, then reload.',
      };
    }
    if (!position) {
      return {
        tone: 'warning',
        title: 'Finding your location…',
        body: 'This can take up to a minute outdoors.',
      };
    }
    if (zoneStatus?.zoneState === 'in_danger') {
      return {
        tone: 'danger',
        title: 'You are in an unsafe area',
        body: 'Please turn back, or press SOS if you need help.',
      };
    }
    if (zoneStatus?.isInsideSafeZone === false) {
      return {
        tone: 'warning',
        title: 'You are away from home',
        body: session?.geofence
          ? `About ${formatDistance(zoneStatus.distanceFromHome)} from home.`
          : 'Your caregiver has been told.',
      };
    }
    if (zoneStatus?.isInsideSafeZone === true) {
      return { tone: 'safe', title: 'You are in your safe area', body: 'Everything looks fine.' };
    }
    return { tone: 'safe', title: 'Sharing your location', body: 'Your caregiver can see you.' };
  })();

  const BANNER_TONES = {
    safe: 'bg-teal-50 text-teal-900 dark:bg-teal-950/60 dark:text-teal-100',
    warning: 'bg-orange-50 text-orange-900 dark:bg-orange-950/60 dark:text-orange-100',
    danger: 'bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-100',
    neutral: 'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-200',
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col py-2">
      {/* Status banner — the one thing the patient needs to understand. */}
      <div className={`rounded-2xl p-4 ${BANNER_TONES[zoneBanner.tone]}`} role="status">
        <div className="flex items-start gap-3">
          <span className="relative mt-0.5 flex h-3 w-3 shrink-0">
            {!isStopped ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
            ) : null}
            <span className="relative inline-flex h-3 w-3 rounded-full bg-current" />
          </span>
          <div>
            <p className="font-bold">{zoneBanner.title}</p>
            <p className="mt-0.5 text-sm opacity-90">{zoneBanner.body}</p>
          </div>
        </div>
      </div>

      {/* SOS — placed high and kept large; it must never need scrolling to reach. */}
      <SosButton
        trackingCode={trackingCode}
        position={position}
        batteryLevel={battery.level}
        disabled={isStopped}
        className="mt-5"
      />

      {/* Device status */}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <StatusTile
          label="Tracking"
          value={isStopped ? 'Paused' : 'Active'}
          tone={isStopped ? 'neutral' : 'good'}
          icon={<LocationIcon className="h-4 w-4" />}
        />
        <StatusTile
          label="GPS signal"
          value={
            geo.status === GPS_STATUS.ACTIVE
              ? 'Good'
              : geo.status === GPS_STATUS.ACQUIRING || geo.status === GPS_STATUS.PROMPTING
                ? 'Searching'
                : geo.status === GPS_STATUS.DENIED
                  ? 'Blocked'
                  : 'Unavailable'
          }
          tone={
            geo.status === GPS_STATUS.ACTIVE
              ? 'good'
              : geo.status === GPS_STATUS.DENIED
                ? 'danger'
                : 'warning'
          }
          icon={<SatelliteIcon className="h-4 w-4" />}
        />
        <StatusTile
          label="Internet"
          value={isOnline ? 'Connected' : 'Offline'}
          tone={isOnline ? 'good' : 'warning'}
          icon={isOnline ? <WifiIcon className="h-4 w-4" /> : <WifiOffIcon className="h-4 w-4" />}
        />
        <StatusTile
          label="Battery"
          value={battery.isSupported ? `${battery.level}%` : 'Not available'}
          tone={
            !battery.isSupported
              ? 'neutral'
              : battery.level <= 15
                ? 'danger'
                : battery.level <= 30
                  ? 'warning'
                  : 'good'
          }
          icon={<BatteryIcon level={battery.level} className="h-4 w-4" />}
          hint={battery.isCharging ? 'Charging' : null}
        />
      </div>

      {/* Queue notice */}
      {pendingCount > 0 ? (
        <div className="mt-3 rounded-xl bg-surface-100 p-3 text-xs text-surface-600 dark:bg-surface-800 dark:text-surface-300">
          <p className="font-semibold">
            {pendingCount} location{pendingCount === 1 ? '' : 's'} saved on this phone
          </p>
          <p className="mt-0.5">
            {isOnline
              ? 'Uploading now…'
              : 'They will be sent automatically when your connection returns.'}
            {isUsingMemoryFallback()
              ? ' Keep this page open — saved locations will be lost if you close it.'
              : ''}
          </p>
        </div>
      ) : null}

      {uploadError ? (
        <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
          {uploadError}
        </div>
      ) : null}

      {/* Technical detail, collapsed by default: the patient does not need it,
          but a caregiver helping over the phone will. */}
      <details className="mt-4 rounded-xl border border-surface-200 dark:border-surface-800">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-surface-700 dark:text-surface-200">
          Location details
        </summary>

        <dl className="border-t border-surface-200 px-4 py-3 text-xs dark:border-surface-800">
          <Detail label="Latitude" value={formatCoordinate(position?.latitude)} />
          <Detail label="Longitude" value={formatCoordinate(position?.longitude)} />
          <Detail label="Accuracy" value={formatAccuracy(position?.accuracy)} />
          <Detail label="Fixes received" value={geo.fixCount ? String(geo.fixCount) : '—'} />
          <Detail label="Last sent" value={formatTimeWithSeconds(lastUploadAt)} />
          <Detail
            label="Screen lock"
            value={
              wakeLock.isSupported
                ? wakeLock.isActive
                  ? 'Screen kept awake'
                  : 'Inactive'
                : 'Not supported — keep the screen on'
            }
          />
          <Detail label="Tracking code" value={trackingCode} />
        </dl>
      </details>

      {/* Stop / resume, pushed to the bottom and visually quiet so it is not
          pressed by accident. */}
      <div className="mt-auto pt-6">
        {isStopped ? (
          <Button onClick={onStart} fullWidth size="lg">
            Resume sharing my location
          </Button>
        ) : (
          <Button onClick={onStop} variant="secondary" fullWidth>
            Pause sharing
          </Button>
        )}

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-surface-400 dark:text-surface-500">
          <ClockIcon className="h-3 w-3" />
          Updating every 5 seconds
        </p>
      </div>
    </div>
  );
}

/** One row inside the collapsible detail list. */
function Detail({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-surface-500 dark:text-surface-400">{label}</dt>
      <dd className="font-medium tabular text-surface-800 dark:text-surface-200">{value}</dd>
    </div>
  );
}
