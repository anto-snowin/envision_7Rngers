'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LiveMap } from '@/components/map/LiveMap';
import Button, { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, PanelLoading } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { ClockIcon, PlusIcon, RouteIcon, UsersIcon } from '@/components/ui/Icons';
import { useApi, useInterval } from '@/hooks/useApi';
import { location as locationApi, zones as zonesApi } from '@/lib/endpoints';
import {
  formatDateTime,
  formatDuration,
  formatMeters,
  formatTime,
  toDateInputValue,
} from '@/lib/format';
import { usePatients } from '@/providers/PatientsProvider';

/** Playback step interval. */
const PLAYBACK_MS = 220;

export default function HistoryPage() {
  const { selected, selectedId, patients, isLoading: patientsLoading } = usePatients();

  const today = toDateInputValue(new Date());
  const [date, setDate] = useState(today);
  const [cursor, setCursor] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const history = useApi(
    useCallback(
      (signal: AbortSignal) => {
        if (!selectedId) return Promise.resolve(null);
        const from = new Date(`${date}T00:00:00`);
        const to = new Date(`${date}T23:59:59.999`);
        return locationApi.history(
          selectedId,
          { from: from.toISOString(), to: to.toISOString(), limit: 5000 },
          signal
        );
      },
      [selectedId, date]
    ),
    { enabled: Boolean(selectedId) }
  );

  const zones = useApi(
    useCallback(
      (signal: AbortSignal) =>
        selectedId ? zonesApi.forPatient(selectedId, signal) : Promise.resolve(null),
      [selectedId]
    ),
    { enabled: Boolean(selectedId) }
  );

  /**
   * Memoised because an inline `?? []` creates a fresh array on every render,
   * which would invalidate the trail and timeline memos below every time.
   */
  const fixes = useMemo(() => history.data?.fixes ?? [], [history.data]);
  const summary = history.data?.summary;

  // A new day's data invalidates any playback position.
  useEffect(() => {
    setCursor(null);
    setIsPlaying(false);
  }, [date, selectedId]);

  useInterval(
    () => {
      setCursor((current) => {
        const next = (current ?? -1) + 1;
        if (next >= fixes.length - 1) {
          setIsPlaying(false);
          return fixes.length - 1;
        }
        return next;
      });
    },
    isPlaying && fixes.length > 1 ? PLAYBACK_MS : null
  );

  /** The trail shown: the whole day, or up to the playback cursor. */
  const shownTrail = useMemo(() => {
    const upTo = cursor === null ? fixes.length : cursor + 1;
    return fixes.slice(0, upTo).map((fix) => ({ latitude: fix.latitude, longitude: fix.longitude }));
  }, [fixes, cursor]);

  const headFix = cursor === null ? fixes[fixes.length - 1] : fixes[cursor];

  /**
   * A sparse timeline for reading rather than scrolling.
   *
   * A full day at a three-minute cadence is around 260 points; listing them all
   * would be a wall of near-identical rows. Only zone changes and the first and
   * last fix tell a story worth reading.
   */
  const timeline = useMemo(() => {
    const rows: Array<{ at: string; label: string; tone: 'safe' | 'warn' | 'mute' }> = [];
    let previousInside: boolean | null = null;

    fixes.forEach((fix, index) => {
      if (index === 0) {
        rows.push({ at: fix.recordedAt, label: 'First report of the day', tone: 'mute' });
      }

      if (fix.insideSafeZone !== previousInside && previousInside !== null) {
        rows.push(
          fix.insideSafeZone
            ? { at: fix.recordedAt, label: 'Returned to the safe zone', tone: 'safe' }
            : { at: fix.recordedAt, label: 'Left the safe zone', tone: 'warn' }
        );
      }
      previousInside = fix.insideSafeZone;

      if (index === fixes.length - 1 && fixes.length > 1) {
        rows.push({ at: fix.recordedAt, label: 'Last report of the day', tone: 'mute' });
      }
    });

    return rows;
  }, [fixes]);

  if (patientsLoading) return <PanelLoading label="Loading patients…" />;

  if (!patients.length) {
    return (
      <div className="panel">
        <EmptyState
          icon={<UsersIcon className="h-5 w-5" />}
          title="No patients yet"
          body="History appears once a patient's phone has reported its position."
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
          <p className="eyebrow">History</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Where {selected?.name} went</h1>
        </div>

        <Field
          label="Date"
          type="date"
          value={date}
          max={today}
          onChange={(event) => setDate(event.target.value)}
          className="w-44"
        />
      </header>

      {/* ---------------------------------------------------------- summary */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-5">
          <p className="label">Distance travelled</p>
          <p className="tnum mt-2 text-3xl font-black text-acid-500">
            {summary ? formatMeters(summary.distanceMeters) : '—'}
          </p>
        </div>
        <div className="panel p-5">
          <p className="label">Time outside safe zone</p>
          <p className="tnum mt-2 text-3xl font-black text-caution-400">
            {summary ? formatDuration(summary.minutesOutsideSafeZone) : '—'}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-600">
            Estimated from reports that fell outside; a phone that was off contributes nothing.
          </p>
        </div>
        <div className="panel p-5">
          <p className="label">Reports</p>
          <p className="tnum mt-2 text-3xl font-black text-ink-100">{summary?.points ?? 0}</p>
          {summary?.firstFixAt ? (
            <p className="tnum mt-2 text-[11px] text-ink-600">
              {formatTime(summary.firstFixAt)} – {formatTime(summary.lastFixAt)}
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ------------------------------------------------------------- map */}
        <div className="panel overflow-hidden lg:col-span-3">
          <div className="h-[24rem] sm:h-[30rem]">
            {history.isLoading ? (
              <PanelLoading label="Loading the day…" />
            ) : history.error ? (
              <ErrorState message={history.error} onRetry={history.refresh} />
            ) : !fixes.length ? (
              <EmptyState
                icon={<RouteIcon className="h-5 w-5" />}
                title="No reports on this date"
                body="Either the phone was not signed in, or tracking had not started yet."
              />
            ) : (
              <LiveMap
                position={
                  headFix
                    ? {
                        latitude: headFix.latitude,
                        longitude: headFix.longitude,
                        accuracy: headFix.accuracy,
                        recordedAt: headFix.recordedAt,
                      }
                    : null
                }
                patientName={selected?.name}
                markerState={headFix?.insideSafeZone === false ? 'alarm' : 'live'}
                safeZones={zones.data?.safe ?? []}
                dangerZones={zones.data?.danger ?? []}
                trail={shownTrail}
                fitKey={`${selectedId}-${date}-${fixes.length}`}
              />
            )}
          </div>

          {/* --------------------------------------------------- playback */}
          {fixes.length > 1 ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-ink-100/8 p-4">
              <Button
                variant={isPlaying ? 'ghost' : 'acid'}
                size="sm"
                onClick={() => {
                  if (!isPlaying && (cursor === null || cursor >= fixes.length - 1)) setCursor(0);
                  setIsPlaying((value) => !value);
                }}
              >
                {isPlaying ? 'Pause' : 'Play route'}
              </Button>

              <input
                type="range"
                aria-label="Playback position"
                min={0}
                max={fixes.length - 1}
                value={cursor ?? fixes.length - 1}
                onChange={(event) => {
                  setIsPlaying(false);
                  setCursor(Number(event.target.value));
                }}
                className="h-1.5 min-w-40 flex-1 cursor-pointer appearance-none rounded-pill bg-ink-700
                  [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-acid-500"
              />

              <span className="tnum shrink-0 text-xs text-ink-400">
                {headFix ? formatTime(headFix.recordedAt) : '—'}
              </span>

              {cursor !== null ? (
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => {
                    setIsPlaying(false);
                    setCursor(null);
                  }}
                >
                  Show whole day
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* -------------------------------------------------------- timeline */}
        <aside className="panel p-5 lg:col-span-2">
          <h2 className="text-lg font-extrabold">Timeline</h2>

          {timeline.length ? (
            <ol className="mt-4 space-y-3">
              {timeline.map((row, index) => (
                <li key={`${row.at}-${index}`} className="flex gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      row.tone === 'safe'
                        ? 'bg-safe-500'
                        : row.tone === 'warn'
                          ? 'bg-caution-500'
                          : 'bg-ink-600'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-ink-200">{row.label}</p>
                    <p className="tnum text-[11px] text-ink-600">{formatDateTime(row.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-500">
              <ClockIcon className="h-4 w-4" />
              Nothing notable happened on this date.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
