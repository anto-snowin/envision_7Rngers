/**
 * Route history with playback.
 *
 * The playback animates a marker along the recorded fixes. It steps through the
 * points array rather than interpolating by wall-clock time, because fixes are
 * unevenly spaced (gaps while offline) and a time-faithful replay would sit
 * motionless for minutes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Circle } from 'react-leaflet';
import { locationApi, patientsApi } from '../../api';
import { useFetch } from '../../hooks/useApi';
import PageHeader, { PageContainer, StatGrid } from '../../components/layout/PageHeader';
import StatCard from '../../components/shared/StatCard';
import Card, { CardHeader } from '../../components/shared/Card';
import MapCanvas, { MapLegend } from '../../components/map/MapCanvas';
import {
  SafeZoneCircle,
  MovementTrail,
  HomeMarker,
  FitBounds,
} from '../../components/map/MapPrimitives';
import Button from '../../components/shared/Button';
import { Select, Input } from '../../components/shared/Form';
import { FilterPills } from '../../components/shared/Controls';
import { EmptyState, ErrorState } from '../../components/shared/Feedback';
import { LoadingState } from '../../components/shared/Spinner';
import {
  PlayIcon,
  PauseIcon,
  RefreshIcon,
  RouteIcon,
  ClockIcon,
  HistoryIcon,
  UsersIcon,
} from '../../components/shared/Icons';
import {
  formatDistance,
  formatDuration,
  formatTime,
  formatDateTime,
  toDateInputValue,
} from '../../lib/format';

/** Quick ranges, relative to now. */
const RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '24h', label: 'Last 24 h' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'custom', label: 'Custom' },
];

/** Translate a preset into a concrete from/to pair. */
function resolveRange(preset, customFrom, customTo) {
  const now = new Date();

  if (preset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: now.toISOString() };
  }

  if (preset === '24h') {
    return {
      from: new Date(now.getTime() - 24 * 3600 * 1000).toISOString(),
      to: now.toISOString(),
    };
  }

  if (preset === '7d') {
    return {
      from: new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString(),
      to: now.toISOString(),
    };
  }

  // Custom: treat the date inputs as whole local days.
  const start = new Date(`${customFrom}T00:00:00`);
  const end = new Date(`${customTo}T23:59:59`);
  return { from: start.toISOString(), to: end.toISOString() };
}

export default function History() {
  const { patientId: routePatientId } = useParams();
  const navigate = useNavigate();

  const patients = useFetch(() => patientsApi.list({ limit: 100 }), []);

  const [selectedId, setSelectedId] = useState(routePatientId || '');
  const [preset, setPreset] = useState('today');
  const [customFrom, setCustomFrom] = useState(toDateInputValue());
  const [customTo, setCustomTo] = useState(toDateInputValue());

  // Pick the first patient automatically when arriving without one.
  useEffect(() => {
    if (!selectedId && patients.data?.length) {
      setSelectedId(patients.data[0]._id);
    }
  }, [patients.data, selectedId]);

  // Keep the URL in step, so the view is shareable and the back button works.
  useEffect(() => {
    if (selectedId && selectedId !== routePatientId) {
      navigate(`/history/${selectedId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const range = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const history = useFetch(
    () => locationApi.history(selectedId, { ...range, limit: 5000 }),
    [selectedId, range.from, range.to],
    { enabled: Boolean(selectedId) }
  );

  const points = history.data?.points || [];
  const summary = history.data?.summary;

  // ---------------------------------------------------------------- playback

  const [playIndex, setPlayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(8); // points per second
  const timerRef = useRef(null);

  // Reset playback whenever the underlying track changes.
  useEffect(() => {
    setIsPlaying(false);
    setPlayIndex(0);
  }, [selectedId, range.from, range.to]);

  useEffect(() => {
    if (!isPlaying || points.length < 2) return undefined;

    timerRef.current = setInterval(() => {
      setPlayIndex((current) => {
        if (current >= points.length - 1) {
          setIsPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1000 / speed);

    return () => clearInterval(timerRef.current);
  }, [isPlaying, speed, points.length]);

  const togglePlay = useCallback(() => {
    // Restarting from the end should replay from the beginning.
    if (playIndex >= points.length - 1) setPlayIndex(0);
    setIsPlaying((value) => !value);
  }, [playIndex, points.length]);

  /** The slice of the route drawn so far during playback. */
  const visiblePoints = isPlaying || playIndex > 0 ? points.slice(0, playIndex + 1) : points;
  const currentPoint = points[playIndex] || null;

  const patientOptions = useMemo(
    () => (patients.data || []).map((p) => ({ value: p._id, label: p.name })),
    [patients.data]
  );

  if (patients.isLoading && !patients.data) {
    return <LoadingState message="Loading patients…" />;
  }

  if (!patients.data?.length) {
    return (
      <PageContainer>
        <EmptyState
          icon={<UsersIcon className="h-6 w-6" />}
          title="No patients to show history for"
          message="Add a patient first, then their recorded routes will appear here."
          action={<Button to="/patients?new=1">Add a patient</Button>}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer wide>
      <PageHeader
        title="Route history"
        description="Where the patient has been, and how long they spent away from home."
        actions={
          <Button
            variant="secondary"
            onClick={history.refetch}
            leftIcon={<RefreshIcon className="h-4 w-4" />}
          >
            Refresh
          </Button>
        }
      />

      {/* Controls */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end">
        <Select
          label="Patient"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          options={patientOptions}
          className="lg:w-56"
        />

        <div>
          <span className="label">Period</span>
          <FilterPills options={RANGE_PRESETS} value={preset} onChange={setPreset} label="Period" />
        </div>

        {preset === 'custom' ? (
          <div className="flex gap-3">
            <Input
              label="From"
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
            <Input
              label="To"
              type="date"
              value={customTo}
              min={customFrom}
              max={toDateInputValue()}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </div>
        ) : null}
      </div>

      {/* Summary */}
      <StatGrid className="mb-5">
        <StatCard
          label="Distance travelled"
          value={formatDistance(summary?.distanceMetres)}
          hint={summary?.fixCount ? `${summary.fixCount} location points` : 'No data'}
          icon={<RouteIcon className="h-4.5 w-4.5" />}
          tone="brand"
          isLoading={history.isLoading && !history.data}
        />
        <StatCard
          label="Time outside safe zone"
          value={formatDuration(summary?.minutesOutsideSafeZone)}
          icon={<ClockIcon className="h-4.5 w-4.5" />}
          tone={summary?.minutesOutsideSafeZone > 0 ? 'warning' : 'good'}
          isLoading={history.isLoading && !history.data}
        />
        <StatCard
          label="Furthest from home"
          value={formatDistance(summary?.maxDistanceFromHome)}
          icon={<HistoryIcon className="h-4.5 w-4.5" />}
          isLoading={history.isLoading && !history.data}
        />
        <StatCard
          label="Tracked for"
          value={formatDuration(summary?.durationMinutes)}
          hint={
            summary?.firstFixAt
              ? `${formatTime(summary.firstFixAt)} – ${formatTime(summary.lastFixAt)}`
              : null
          }
          icon={<ClockIcon className="h-4.5 w-4.5" />}
          isLoading={history.isLoading && !history.data}
        />
      </StatGrid>

      {history.error ? (
        <ErrorState error={history.error} onRetry={history.refetch} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          {/* Map */}
          <Card padded={false} className="overflow-hidden xl:col-span-2">
            <div className="h-[460px]">
              {history.isLoading && !history.data ? (
                <div className="skeleton h-full w-full rounded-none" />
              ) : points.length < 2 ? (
                <EmptyState
                  icon={<RouteIcon className="h-6 w-6" />}
                  title="No route recorded for this period"
                  message="Either the patient stayed put, or their phone was not sharing its location. Try a wider date range."
                />
              ) : (
                <MapCanvas
                  center={points[0]}
                  overlay={
                    <div className="absolute bottom-3 left-3 z-[400]">
                      <MapLegend className="hidden sm:block" showDanger={false} />
                    </div>
                  }
                >
                  <FitBounds points={points} enabled={!isPlaying && playIndex === 0} />

                  <SafeZoneCircle geofence={history.data?.geofence} />
                  {history.data?.geofence ? (
                    <HomeMarker location={history.data.geofence} label="Safe zone centre" />
                  ) : null}

                  <MovementTrail points={visiblePoints} />

                  {/* Playback head */}
                  {currentPoint && playIndex > 0 ? (
                    <Circle
                      center={[currentPoint.latitude, currentPoint.longitude]}
                      radius={12}
                      pathOptions={{
                        color: '#ffffff',
                        weight: 3,
                        fillColor: '#2a78d6',
                        fillOpacity: 1,
                      }}
                    />
                  ) : null}
                </MapCanvas>
              )}
            </div>

            {/* Playback bar */}
            {points.length > 1 ? (
              <div className="flex flex-col gap-3 border-t border-surface-200 p-4 sm:flex-row sm:items-center dark:border-surface-800">
                <Button
                  onClick={togglePlay}
                  size="sm"
                  leftIcon={
                    isPlaying ? (
                      <PauseIcon className="h-3.5 w-3.5" />
                    ) : (
                      <PlayIcon className="h-3.5 w-3.5" />
                    )
                  }
                >
                  {isPlaying ? 'Pause' : playIndex >= points.length - 1 ? 'Replay' : 'Play route'}
                </Button>

                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={points.length - 1}
                    value={playIndex}
                    onChange={(event) => {
                      setIsPlaying(false);
                      setPlayIndex(Number(event.target.value));
                    }}
                    aria-label="Playback position"
                    className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-surface-200 accent-brand-600 dark:bg-surface-700"
                  />
                  <span className="shrink-0 text-xs tabular text-surface-500 dark:text-surface-400">
                    {currentPoint ? formatTime(currentPoint.recordedAt) : '—'}
                  </span>
                </div>

                <Select
                  value={String(speed)}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                  options={[
                    { value: '4', label: '0.5×' },
                    { value: '8', label: '1×' },
                    { value: '24', label: '3×' },
                    { value: '60', label: '8×' },
                  ]}
                  aria-label="Playback speed"
                  className="sm:w-24"
                />
              </div>
            ) : null}
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader
              title="Timeline"
              subtitle={
                history.data?.truncated
                  ? 'Showing the first 5,000 points — narrow the date range to see all of them.'
                  : `${points.length} location points`
              }
            />

            {points.length ? (
              <TimelineList points={points} activeIndex={playIndex} onSelect={setPlayIndex} />
            ) : (
              <p className="py-8 text-center text-sm text-surface-500 dark:text-surface-400">
                Nothing recorded for this period.
              </p>
            )}
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

/**
 * Condensed timeline.
 *
 * A fix every five seconds is far too granular to list, so this groups the
 * track into zone-state segments — "in safe zone 09:00–11:20", "away from home
 * 11:20–12:05" — which is how a caregiver actually thinks about the day.
 */
function TimelineList({ points, activeIndex, onSelect }) {
  const segments = useMemo(() => {
    const result = [];

    points.forEach((point, index) => {
      const state = point.zoneState || 'unknown';
      const last = result[result.length - 1];

      if (last && last.state === state) {
        last.endIndex = index;
        last.endAt = point.recordedAt;
      } else {
        result.push({
          state,
          startIndex: index,
          endIndex: index,
          startAt: point.recordedAt,
          endAt: point.recordedAt,
        });
      }
    });

    return result;
  }, [points]);

  const STATE_META = {
    inside_safe: { label: 'In safe zone', color: '#0d9488' },
    outside_safe: { label: 'Away from home', color: '#ea580c' },
    in_danger: { label: 'In a danger zone', color: '#e11d48' },
    unknown: { label: 'No zone data', color: '#64748b' },
  };

  return (
    <ol className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
      {segments.map((segment, index) => {
        const meta = STATE_META[segment.state] || STATE_META.unknown;
        const isActive = activeIndex >= segment.startIndex && activeIndex <= segment.endIndex;
        const minutes = Math.round((new Date(segment.endAt) - new Date(segment.startAt)) / 60000);

        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => onSelect(segment.startIndex)}
              className={`flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition-colors ${
                isActive
                  ? 'bg-brand-50 dark:bg-brand-950'
                  : 'hover:bg-surface-100 dark:hover:bg-surface-800'
              }`}
            >
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: meta.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-surface-900 dark:text-surface-100">
                  {meta.label}
                </span>
                <span
                  className="block text-xs tabular text-surface-500 dark:text-surface-400"
                  title={formatDateTime(segment.startAt)}
                >
                  {formatTime(segment.startAt)} – {formatTime(segment.endAt)}
                  {minutes >= 1 ? ` · ${formatDuration(minutes)}` : ''}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
