'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { AlertRow } from '@/components/caretaker/AlertRow';
import { PresenceDot } from '@/components/caretaker/PresenceDot';
import { StatTile } from '@/components/caretaker/StatTile';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonRows, SkeletonTiles } from '@/components/ui/Feedback';
import {
  AlertIcon,
  BatteryIcon,
  MapIcon,
  PlusIcon,
  ShieldIcon,
  UsersIcon,
} from '@/components/ui/Icons';
import { useApi, useClockTick, useThrottledCallback } from '@/hooks/useApi';
import { SOCKET_EVENTS } from '@/lib/constants';
import { alerts as alertsApi, dashboard as dashboardApi } from '@/lib/endpoints';
import { formatBattery, formatMeters, formatRelative, initialsOf } from '@/lib/format';
import { usePatients } from '@/providers/PatientsProvider';
import { useSocketEvent } from '@/providers/SocketProvider';

export default function OverviewPage() {
  const { patients, isLoading: patientsLoading, error: patientsError, select } = usePatients();

  useClockTick(20_000);

  const summary = useApi(useCallback((signal: AbortSignal) => dashboardApi.summary(signal), []));

  const recentAlerts = useApi(
    useCallback(
      (signal: AbortSignal) => alertsApi.list({ limit: 6, unresolvedOnly: true }, signal),
      []
    )
  );

  /**
   * Counters and the alert list are refetched on live events, throttled.
   *
   * The patient rows themselves are updated in place by the provider from the
   * socket payload; only the aggregates genuinely need the server to recount.
   */
  const refreshAggregates = useThrottledCallback(() => {
    summary.refresh();
    recentAlerts.refresh();
  }, 15_000);

  useSocketEvent(SOCKET_EVENTS.LOCATION_UPDATE, refreshAggregates);
  useSocketEvent(SOCKET_EVENTS.PRESENCE_UPDATE, refreshAggregates);

  // A new alert is the one thing worth refetching promptly.
  const refreshAlertsSoon = useThrottledCallback(() => {
    recentAlerts.refresh();
    summary.refresh();
  }, 3000);
  useSocketEvent(SOCKET_EVENTS.ALERT_NEW, refreshAlertsSoon);
  useSocketEvent(SOCKET_EVENTS.ALERT_UPDATED, refreshAlertsSoon);

  const stats = summary.data;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Overview</p>
          <h1 className="mt-2 text-4xl font-black sm:text-5xl">Everyone in your care</h1>
        </div>
        <p className="text-xs text-ink-500">
          Updated {stats?.lastUpdatedAt ? formatRelative(stats.lastUpdatedAt) : 'never'}
        </p>
      </header>

      {/* ------------------------------------------------------------- stats */}
      {summary.isLoading ? (
        <SkeletonTiles count={4} />
      ) : summary.error ? (
        <div className="panel">
          <ErrorState message={summary.error} onRetry={summary.refresh} />
        </div>
      ) : stats ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Patients"
            value={stats.totalPatients}
            detail={`${stats.online} online · ${stats.offline} offline`}
            tone="acid"
            icon={<UsersIcon className="h-4.5 w-4.5" />}
          />
          <StatTile
            label="Alerts today"
            value={stats.alertsToday}
            detail={
              stats.unresolvedAlerts
                ? `${stats.unresolvedAlerts} still unresolved`
                : 'Nothing outstanding'
            }
            tone={stats.criticalAlertsToday > 0 ? 'alarm' : 'neutral'}
            icon={<AlertIcon className="h-4.5 w-4.5" />}
          />
          <StatTile
            label="Outside safe zone"
            value={stats.outsideSafeZone + stats.inDangerZone}
            detail={
              stats.inDangerZone
                ? `${stats.inDangerZone} in a danger zone`
                : 'No one in a danger zone'
            }
            tone={
              stats.inDangerZone > 0 ? 'alarm' : stats.outsideSafeZone > 0 ? 'caution' : 'safe'
            }
            icon={<ShieldIcon className="h-4.5 w-4.5" />}
          />
          <StatTile
            label="Battery"
            value={stats.averageBattery === null ? '—' : `${stats.averageBattery}%`}
            detail={
              stats.batteryReportingCount === 0
                ? 'No device reports battery level'
                : stats.lowBattery
                  ? `${stats.lowBattery} device${stats.lowBattery === 1 ? '' : 's'} low`
                  : 'All devices healthy'
            }
            tone={stats.lowBattery > 0 ? 'caution' : 'safe'}
            icon={<BatteryIcon className="h-4.5 w-4.5" />}
          />
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* --------------------------------------------------------- patients */}
        <section className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold">Patients</h2>
            <ButtonLink href="/caretaker/patients" variant="ghost" size="sm">
              <PlusIcon className="h-3.5 w-3.5" />
              Manage
            </ButtonLink>
          </div>

          {patientsLoading ? (
            <SkeletonRows rows={3} height="h-24" />
          ) : patientsError ? (
            <div className="panel">
              <ErrorState message={patientsError} />
            </div>
          ) : !patients.length ? (
            <div className="panel">
              <EmptyState
                icon={<UsersIcon className="h-5 w-5" />}
                title="No patients yet"
                body="Add the person you care for to generate the login they will use on their phone."
                action={
                  <ButtonLink href="/caretaker/patients">
                    <PlusIcon className="h-4 w-4" />
                    Add a patient
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <ul className="space-y-2.5">
              {patients.map((patient) => {
                const live = patient.liveStatus;

                const state = live.dangerZone
                  ? { label: live.dangerZone, className: 'badge badge-alarm' }
                  : live.insideSafeZone === false
                    ? { label: 'Outside safe zone', className: 'badge badge-caution' }
                    : live.insideSafeZone === true
                      ? { label: 'In safe zone', className: 'badge badge-safe' }
                      : { label: 'No position yet', className: 'badge badge-mute' };

                return (
                  <li key={patient.id}>
                    <Link
                      href="/caretaker/map"
                      onClick={() => select(patient.id)}
                      className="panel flex items-center gap-4 p-4 transition-colors hover:border-acid-500/35"
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-100/8 text-sm font-bold text-ink-200">
                        {initialsOf(patient.name)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-bold text-ink-100">{patient.name}</p>
                          <PresenceDot isOnline={live.isOnline} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className={state.className}>{state.label}</span>
                          <span className="text-[11px] text-ink-600">
                            {live.recordedAt ? formatRelative(live.recordedAt) : 'never reported'}
                          </span>
                        </div>
                      </div>

                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="tnum text-sm font-semibold text-ink-300">
                          {formatBattery(live.batteryLevel, live.isCharging)}
                        </p>
                        {live.distanceFromSafeZone !== null ? (
                          <p className="tnum mt-0.5 text-[11px] text-ink-600">
                            {formatMeters(live.distanceFromSafeZone)} from home
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------- alerts */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold">Needs attention</h2>
            <ButtonLink href="/caretaker/alerts" variant="quiet" size="sm">
              See all
            </ButtonLink>
          </div>

          {recentAlerts.isLoading ? (
            <SkeletonRows rows={3} height="h-28" />
          ) : recentAlerts.error ? (
            <div className="panel">
              <ErrorState message={recentAlerts.error} onRetry={recentAlerts.refresh} />
            </div>
          ) : !recentAlerts.data?.items.length ? (
            <div className="panel">
              <EmptyState
                icon={<ShieldIcon className="h-5 w-5" />}
                title="All clear"
                body="Nothing unresolved. Zone breaches and SOS presses will appear here immediately."
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentAlerts.data.items.map((alert) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
            </div>
          )}

          <ButtonLink href="/caretaker/map" variant="ghost" className="mt-4 w-full">
            <MapIcon className="h-4 w-4" />
            Open the live map
          </ButtonLink>
        </section>
      </div>
    </div>
  );
}
