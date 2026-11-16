'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PresenceDot } from '@/components/caretaker/PresenceDot';
import { LiveMap } from '@/components/map/LiveMap';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, PanelLoading } from '@/components/ui/Feedback';
import { AlertIcon, PlusIcon, ShieldIcon, UsersIcon } from '@/components/ui/Icons';
import { useApi, useClockTick } from '@/hooks/useApi';
import { OFFLINE_THRESHOLD_MS, SOCKET_EVENTS } from '@/lib/constants';
import { location as locationApi, zones as zonesApi } from '@/lib/endpoints';
import {
  formatAccuracy,
  formatBattery,
  formatLatLng,
  formatMeters,
  formatRelative,
} from '@/lib/format';
import type { LocationUpdateEvent, ZonesChangedEvent } from '@/lib/types';
import { usePatients } from '@/providers/PatientsProvider';
import { useSocket, useSocketEvent } from '@/providers/SocketProvider';

/** How many recent fixes to draw as the movement trail. */
const TRAIL_POINTS = 60;

export default function LiveMapPage() {
  const { selected, selectedId, patients, isLoading: patientsLoading } = usePatients();
  const { socket } = useSocket();

  useClockTick(15_000);

  const [trail, setTrail] = useState<Array<{ latitude: number; longitude: number }>>([]);

  const zones = useApi(
    useCallback(
      (signal: AbortSignal) =>
        selectedId ? zonesApi.forPatient(selectedId, signal) : Promise.resolve(null),
      [selectedId]
    ),
    { enabled: Boolean(selectedId) }
  );

  /** Seed the trail from recent history so the map is not bare on first load. */
  const recent = useApi(
    useCallback(
      (signal: AbortSignal) =>
        selectedId
          ? locationApi.history(selectedId, { limit: TRAIL_POINTS }, signal)
          : Promise.resolve(null),
      [selectedId]
    ),
    { enabled: Boolean(selectedId) }
  );

  useEffect(() => {
    if (!recent.data) return;
    setTrail(
      recent.data.fixes
        .slice(-TRAIL_POINTS)
        .map((fix) => ({ latitude: fix.latitude, longitude: fix.longitude }))
    );
  }, [recent.data]);

  /**
   * Subscribe to the selected patient's room.
   *
   * Without this the dashboard only receives events addressed to the caretaker
   * room; joining the patient room is also what the server uses to authorise
   * the subscription, so it verifies ownership rather than trusting the id.
   */
  useEffect(() => {
    if (!socket || !selectedId) return;

    socket.emit(SOCKET_EVENTS.SUBSCRIBE_PATIENT, { patientId: selectedId });
    return () => {
      socket.emit(SOCKET_EVENTS.UNSUBSCRIBE_PATIENT, { patientId: selectedId });
    };
  }, [socket, selectedId]);

  /** Extend the trail from the socket payload — no refetch per fix. */
  useSocketEvent<LocationUpdateEvent>(SOCKET_EVENTS.LOCATION_UPDATE, (event) => {
    if (event.patientId !== selectedId) return;
    setTrail((current) =>
      [...current, { latitude: event.latitude, longitude: event.longitude }].slice(-TRAIL_POINTS)
    );
  });

  useSocketEvent<ZonesChangedEvent>(SOCKET_EVENTS.ZONES_CHANGED, (event) => {
    if (event.patientId === selectedId) zones.refresh();
  });

  const live = selected?.liveStatus;

  const position = useMemo(
    () =>
      live && live.latitude !== null && live.longitude !== null
        ? {
            latitude: live.latitude,
            longitude: live.longitude,
            accuracy: live.accuracy,
            recordedAt: live.recordedAt,
          }
        : null,
    [live]
  );

  /** Grey the marker once the fix is older than the offline threshold. */
  const markerState = useMemo(() => {
    if (live?.dangerZone) return 'alarm' as const;
    if (!live?.recordedAt) return 'stale' as const;
    const age = Date.now() - new Date(live.recordedAt).getTime();
    return age > OFFLINE_THRESHOLD_MS ? ('stale' as const) : ('live' as const);
  }, [live]);

  if (patientsLoading) return <PanelLoading label="Loading patients…" />;

  if (!patients.length) {
    return (
      <div className="panel">
        <EmptyState
          icon={<UsersIcon className="h-5 w-5" />}
          title="No patients to show"
          body="Add a patient, then their phone can start reporting its position."
          action={
            <ButtonLink href="/caretaker/patients">
              <PlusIcon className="h-4 w-4" />
              Add a patient
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Live map</p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-black sm:text-4xl">
            {selected?.name}
            {live ? <PresenceDot isOnline={live.isOnline} size="md" /> : null}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {live?.dangerZone ? (
            <span className="badge badge-alarm">
              <AlertIcon className="h-3.5 w-3.5" />
              In {live.dangerZone}
            </span>
          ) : live?.insideSafeZone === false ? (
            <span className="badge badge-caution">Outside safe zone</span>
          ) : live?.insideSafeZone === true ? (
            <span className="badge badge-safe">
              <ShieldIcon className="h-3.5 w-3.5" />
              In safe zone
            </span>
          ) : (
            <span className="badge badge-mute">No position yet</span>
          )}
          <ButtonLink href="/caretaker/zones" variant="ghost" size="sm">
            Edit zones
          </ButtonLink>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-4">
        {/* ------------------------------------------------------------- map */}
        <div className="panel overflow-hidden lg:col-span-3">
          <div className="h-[26rem] sm:h-[34rem]">
            {zones.isLoading ? (
              <PanelLoading label="Loading zones…" />
            ) : (
              <LiveMap
                position={position}
                patientName={selected?.name}
                markerState={markerState}
                safeZones={zones.data?.safe ?? []}
                dangerZones={zones.data?.danger ?? []}
                trail={trail}
                fitKey={`${selectedId}-${zones.data?.safe.length ?? 0}-${zones.data?.danger.length ?? 0}`}
              />
            )}
          </div>
        </div>

        {/* ------------------------------------------------------- telemetry */}
        <aside className="space-y-3">
          <div className="panel p-5">
            <h2 className="label">Last known position</h2>
            {position ? (
              <>
                <p className="tnum mt-2 text-lg font-bold text-ink-100">
                  {formatLatLng(position.latitude, position.longitude)}
                </p>
                <dl className="mt-4 space-y-2.5 text-sm">
                  <Row label="Accuracy" value={formatAccuracy(position.accuracy)} />
                  <Row
                    label="Reported"
                    value={live?.recordedAt ? formatRelative(live.recordedAt) : '—'}
                  />
                  <Row
                    label="Battery"
                    value={formatBattery(live?.batteryLevel, live?.isCharging)}
                  />
                  <Row
                    label="From safe zone"
                    value={
                      live?.distanceFromSafeZone !== null &&
                      live?.distanceFromSafeZone !== undefined
                        ? formatMeters(live.distanceFromSafeZone)
                        : '—'
                    }
                  />
                </dl>
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-ink-400">
                This patient has not reported a position yet. Ask them to sign in on their phone
                with code <span className="tnum text-acid-500">{selected?.patientCode}</span>.
              </p>
            )}
          </div>

          <div className="panel p-5">
            <h2 className="label">Zones</h2>
            {zones.error ? (
              <ErrorState message={zones.error} onRetry={zones.refresh} />
            ) : (
              <ul className="mt-2 space-y-2.5">
                {(zones.data?.safe ?? []).map((zone) => (
                  <li key={zone.id} className="flex items-center gap-2.5 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-acid-500" />
                    <span className="min-w-0 flex-1 truncate text-ink-300">{zone.name}</span>
                    <span className="tnum shrink-0 text-xs text-ink-500">
                      {formatMeters(zone.radius)}
                    </span>
                  </li>
                ))}
                {(zones.data?.danger ?? []).map((zone) => (
                  <li key={zone.id} className="flex items-center gap-2.5 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-alarm-500" />
                    <span className="min-w-0 flex-1 truncate text-ink-300">{zone.name}</span>
                    <span className="tnum shrink-0 text-xs text-ink-500">
                      {formatMeters(zone.radius)}
                    </span>
                  </li>
                ))}
                {!zones.data?.safe.length && !zones.data?.danger.length ? (
                  <li className="text-sm text-ink-500">
                    No zones yet — without a safe zone there is nothing to alert on.
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          <div className="panel p-5">
            <h2 className="label">Movement trail</h2>
            <p className="mt-2 text-sm text-ink-400">
              {trail.length > 1
                ? `Last ${trail.length} reported positions, oldest first.`
                : 'The trail appears once there are two or more positions.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="tnum font-semibold text-ink-200">{value}</dd>
    </div>
  );
}
