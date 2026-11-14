/**
 * Live map.
 *
 * Shows every patient, their safe zones, all danger zones, and a movement trail
 * behind the selected patient. Positions arrive over Socket.IO and are merged
 * into local state, so the map updates without refetching the whole payload
 * every five seconds.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { patientsApi, dangerZoneApi, locationApi } from '../../api';
import { useFetch } from '../../hooks/useApi';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import { SOCKET_EVENTS } from '../../lib/constants';
import MapCanvas, { MapLegend, MapControls } from '../../components/map/MapCanvas';
import {
  PatientMarker,
  SafeZoneCircle,
  DangerZoneCircle,
  MovementTrail,
  HomeMarker,
  FitBounds,
  FollowPatient,
  ResizeHandler,
} from '../../components/map/MapPrimitives';
import { PatientRow } from '../../components/caretaker/PatientCard';
import { SearchInput } from '../../components/shared/Controls';
import { Checkbox } from '../../components/shared/Form';
import Button from '../../components/shared/Button';
import { LoadingState } from '../../components/shared/Spinner';
import { EmptyState, ErrorState } from '../../components/shared/Feedback';
import { UsersIcon, LocationIcon, CloseIcon } from '../../components/shared/Icons';
import { ZoneBadge, StatusDot, BatteryBadge } from '../../components/shared/Badge';
import { formatRelativeTime, formatDistance, formatAccuracy, formatSpeed } from '../../lib/format';

export default function LiveMap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isConnected, subscribeToPatient, unsubscribeFromPatient } = useSocket();

  const live = useFetch(() => patientsApi.live(), []);
  const zones = useFetch(() => dangerZoneApi.list({ limit: 100 }), []);

  /**
   * Live positions keyed by patient id, merged from socket events on top of the
   * initial fetch. Kept separate from `live.data` so a background refetch
   * cannot clobber a newer socket position.
   */
  const [livePositions, setLivePositions] = useState({});

  const [selectedId, setSelectedId] = useState(searchParams.get('patient') || null);
  const [trail, setTrail] = useState([]);
  const [search, setSearch] = useState('');
  const [follow, setFollow] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [showDangerZones, setShowDangerZones] = useState(true);
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // ------------------------------------------------------------- live updates

  useSocketEvent(SOCKET_EVENTS.LOCATION_UPDATE, (payload) => {
    setLivePositions((current) => ({
      ...current,
      [payload.patientId]: {
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy,
        speed: payload.speed,
        batteryLevel: payload.batteryLevel,
        isCharging: payload.isCharging,
        zoneState: payload.zoneState,
        distanceFromHome: payload.distanceFromHome,
        isOnline: true,
        lastSeenAt: payload.recordedAt,
      },
    }));

    // Extend the trail of whichever patient is selected.
    if (payload.patientId === selectedId) {
      setTrail((current) => {
        const next = [
          ...current,
          {
            latitude: payload.latitude,
            longitude: payload.longitude,
            recordedAt: payload.recordedAt,
            isQueued: payload.isQueued,
          },
        ];
        // Cap the trail so a long session does not grow without bound.
        return next.length > 300 ? next.slice(-300) : next;
      });
    }
  });

  useSocketEvent(SOCKET_EVENTS.PRESENCE_UPDATE, (payload) => {
    setLivePositions((current) => ({
      ...current,
      [payload.patientId]: {
        ...(current[payload.patientId] || {}),
        isOnline: payload.isOnline,
        ...(payload.batteryLevel != null ? { batteryLevel: payload.batteryLevel } : {}),
      },
    }));
  });

  // Zone edits are rare and user-initiated, so these are not throttled. Note
  // that marker positions are NOT refetched at all — they come straight from
  // the socket payload above, which is the whole point of the live map.
  useSocketEvent(SOCKET_EVENTS.GEOFENCE_CHANGED, () => live.refresh());
  useSocketEvent(SOCKET_EVENTS.DANGER_ZONE_CHANGED, () => zones.refresh());
  useSocketEvent(SOCKET_EVENTS.PATIENT_CHANGED, () => live.refetch());

  // --------------------------------------------------------- patient selection

  const patients = useMemo(() => {
    const base = live.data?.patients || [];

    // Overlay any newer socket position onto the fetched record.
    return base.map((patient) => {
      const update = livePositions[patient._id];
      if (!update) return patient;
      return { ...patient, liveStatus: { ...patient.liveStatus, ...update } };
    });
  }, [live.data, livePositions]);

  const filteredPatients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((patient) => patient.name.toLowerCase().includes(term));
  }, [patients, search]);

  const selected = useMemo(
    () => patients.find((patient) => patient._id === selectedId) || null,
    [patients, selectedId]
  );

  /** Select a patient, subscribe to their room and load their recent trail. */
  const selectPatient = useCallback(
    async (patient) => {
      const id = patient?._id || null;

      if (selectedId && selectedId !== id) unsubscribeFromPatient(selectedId);

      setSelectedId(id);
      setTrail([]);
      setFollow(true);
      setIsPanelOpen(false);

      // Keep the selection in the URL so the view is linkable from an alert.
      setSearchParams(id ? { patient: id } : {}, { replace: true });

      if (!id) return;

      await subscribeToPatient(id);

      try {
        const { data } = await locationApi.trail(id, 100);
        setTrail(data.points || []);
      } catch {
        setTrail([]);
      }
    },
    [selectedId, subscribeToPatient, unsubscribeFromPatient, setSearchParams]
  );

  // Honour `?patient=` on first load, and re-subscribe after a reconnect.
  useEffect(() => {
    if (!selectedId || !isConnected) return;
    subscribeToPatient(selectedId);

    if (!trail.length) {
      locationApi
        .trail(selectedId, 100)
        .then(({ data }) => setTrail(data.points || []))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, isConnected]);

  useEffect(
    () => () => {
      if (selectedId) unsubscribeFromPatient(selectedId);
    },
    [selectedId, unsubscribeFromPatient]
  );

  // ------------------------------------------------------------------- layers

  // Memoised so the fallback `[]` does not create a new array each render and
  // invalidate every dependent memo below it.
  const geofences = useMemo(() => live.data?.geofences || [], [live.data]);

  const selectedGeofence = useMemo(
    () => geofences.find((fence) => String(fence.patient) === String(selectedId)) || null,
    [geofences, selectedId]
  );

  const visibleGeofences = selectedId
    ? geofences.filter((fence) => String(fence.patient) === String(selectedId))
    : geofences;

  const visiblePatients = selectedId ? patients.filter((p) => p._id === selectedId) : patients;

  // Points the viewport should fit on first render.
  const fitPoints = useMemo(() => {
    if (selected?.liveStatus?.latitude) {
      return [
        {
          latitude: selected.liveStatus.latitude,
          longitude: selected.liveStatus.longitude,
        },
      ];
    }
    return patients
      .filter((p) => Number.isFinite(p.liveStatus?.latitude))
      .map((p) => ({ latitude: p.liveStatus.latitude, longitude: p.liveStatus.longitude }));
  }, [patients, selected]);

  if (live.isLoading && !live.data) {
    return <LoadingState message="Loading the map…" />;
  }

  if (live.error && !live.data) {
    return (
      <div className="p-6">
        <ErrorState error={live.error} onRetry={live.refetch} />
      </div>
    );
  }

  if (!patients.length) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<UsersIcon className="h-6 w-6" />}
          title="No patients to show"
          message="Add a patient and open their tracking link on their phone — they will appear here as soon as the first location arrives."
          action={<Button to="/patients?new=1">Add a patient</Button>}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full">
      {/* ------------------------------------------------ patient list panel */}
      <aside
        className={`absolute inset-y-0 left-0 z-[500] w-72 shrink-0 overflow-y-auto border-r border-surface-200 bg-surface-0 transition-transform lg:static lg:translate-x-0 dark:border-surface-800 dark:bg-surface-900 ${
          isPanelOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="sticky top-0 space-y-3 border-b border-surface-200 bg-surface-0 p-3 dark:border-surface-800 dark:bg-surface-900">
          <div className="flex items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Find a patient…"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setIsPanelOpen(false)}
              className="btn btn-ghost !px-2 lg:hidden"
              aria-label="Close patient list"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          {selectedId ? (
            <Button variant="secondary" size="sm" fullWidth onClick={() => selectPatient(null)}>
              Show all patients
            </Button>
          ) : null}
        </div>

        <div className="space-y-1 p-2">
          {filteredPatients.length ? (
            filteredPatients.map((patient) => (
              <PatientRow
                key={patient._id}
                patient={patient}
                isSelected={patient._id === selectedId}
                onSelect={selectPatient}
              />
            ))
          ) : (
            <p className="p-4 text-center text-sm text-surface-500 dark:text-surface-400">
              No patients match “{search}”.
            </p>
          )}
        </div>

        {/* Layer toggles */}
        <div className="space-y-2.5 border-t border-surface-200 p-4 dark:border-surface-800">
          <p className="text-xs font-semibold text-surface-700 dark:text-surface-200">Layers</p>
          <Checkbox
            label="Safe zones"
            checked={showSafeZones}
            onChange={(event) => setShowSafeZones(event.target.checked)}
          />
          <Checkbox
            label="Danger zones"
            checked={showDangerZones}
            onChange={(event) => setShowDangerZones(event.target.checked)}
          />
          <Checkbox
            label="Movement trail"
            checked={showTrail}
            onChange={(event) => setShowTrail(event.target.checked)}
          />
        </div>
      </aside>

      {/* ------------------------------------------------------------- map */}
      <div className="relative min-w-0 flex-1">
        <MapCanvas
          center={
            fitPoints[0] || {
              latitude: selectedGeofence?.latitude,
              longitude: selectedGeofence?.longitude,
            }
          }
          overlay={
            <>
              {/* Top bar over the map */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] flex items-start justify-between gap-3 p-3">
                <button
                  type="button"
                  onClick={() => setIsPanelOpen(true)}
                  className="glass pointer-events-auto flex items-center gap-2 px-3 py-2 text-sm font-medium lg:hidden"
                >
                  <UsersIcon className="h-4 w-4" />
                  Patients
                </button>

                {selected ? (
                  <div className="glass pointer-events-auto ml-auto max-w-xs p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-surface-900 dark:text-surface-50">
                          {selected.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <StatusDot isOnline={selected.liveStatus?.isOnline} />
                          <ZoneBadge zoneState={selected.liveStatus?.zoneState} />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => selectPatient(null)}
                        aria-label="Clear selection"
                        className="shrink-0 rounded-lg p-1 text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800"
                      >
                        <CloseIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <dl className="mt-2.5 space-y-1 text-[11px]">
                      <Row
                        label="Last seen"
                        value={formatRelativeTime(selected.liveStatus?.lastSeenAt)}
                      />
                      <Row
                        label="From home"
                        value={formatDistance(selected.liveStatus?.distanceFromHome)}
                      />
                      <Row label="Accuracy" value={formatAccuracy(selected.liveStatus?.accuracy)} />
                      <Row label="Speed" value={formatSpeed(selected.liveStatus?.speed)} />
                    </dl>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <BatteryBadge
                        level={selected.liveStatus?.batteryLevel}
                        isCharging={selected.liveStatus?.isCharging}
                      />
                      <Button
                        to={`/history/${selected._id}`}
                        variant="secondary"
                        size="sm"
                        className="!px-2 !py-1 text-[11px]"
                      >
                        History
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Legend, and the follow toggle when a patient is selected */}
              <MapControls>
                {selected ? (
                  <button
                    type="button"
                    onClick={() => setFollow((value) => !value)}
                    aria-pressed={follow}
                    className={`glass flex items-center gap-2 px-3 py-2 text-xs font-semibold ${
                      follow ? 'text-brand-700 dark:text-brand-300' : ''
                    }`}
                  >
                    <LocationIcon className="h-4 w-4" />
                    {follow ? 'Following' : 'Follow'}
                  </button>
                ) : null}

                <MapLegend
                  className="hidden sm:block"
                  showDanger={showDangerZones}
                  showTrail={showTrail}
                />
              </MapControls>
            </>
          }
        >
          <ResizeHandler trigger={`${selectedId}-${isPanelOpen}`} />
          <FitBounds points={fitPoints} enabled={!follow || !selected} />

          {selected ? (
            <FollowPatient
              position={selected.liveStatus}
              follow={follow}
              onUserInteract={() => setFollow(false)}
            />
          ) : null}

          {/* Safe zones + home markers */}
          {showSafeZones
            ? visibleGeofences.map((fence) => <SafeZoneCircle key={fence._id} geofence={fence} />)
            : null}

          {showSafeZones && selected?.homeLocation ? (
            <HomeMarker location={selected.homeLocation} label={`${selected.name}'s home`} />
          ) : null}

          {/* Danger zones */}
          {showDangerZones
            ? (zones.data || []).map((zone) => <DangerZoneCircle key={zone._id} zone={zone} />)
            : null}

          {/* Trail behind the selected patient */}
          {showTrail && selectedId && trail.length > 1 ? <MovementTrail points={trail} /> : null}

          {/* Patient markers */}
          {visiblePatients.map((patient) => (
            <PatientMarker key={patient._id} patient={patient} onSelect={selectPatient} />
          ))}
        </MapCanvas>
      </div>
    </div>
  );
}

/** Compact label/value row for the map overlay. */
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-surface-500 dark:text-surface-400">{label}</dt>
      <dd className="font-medium tabular text-surface-800 dark:text-surface-200">{value}</dd>
    </div>
  );
}
