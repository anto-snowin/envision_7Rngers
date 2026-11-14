/**
 * Dashboard overview.
 *
 * The stat row answers "is anyone in trouble right now?", and everything below
 * it supports that answer. Socket events refresh the data in place — the page
 * never polls.
 */
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi, alertsApi, patientsApi } from '../../api';
import { useFetch, useThrottledCallback } from '../../hooks/useApi';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import { SOCKET_EVENTS } from '../../lib/constants';
import PageHeader, { PageContainer, StatGrid } from '../../components/layout/PageHeader';
import StatCard from '../../components/shared/StatCard';
import Card, { CardHeader } from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import PatientCard from '../../components/caretaker/PatientCard';
import AlertItem from '../../components/caretaker/AlertItem';
import {
  EmptyState,
  ErrorState,
  SkeletonStatCard,
  SkeletonPatientCard,
  SkeletonList,
} from '../../components/shared/Feedback';
import {
  UsersIcon,
  BellIcon,
  WifiIcon,
  BatteryIcon,
  PlusIcon,
  HazardIcon,
  ShieldIcon,
  RefreshIcon,
} from '../../components/shared/Icons';
import { formatRelativeTime, pluralise } from '../../lib/format';

export default function Dashboard() {
  const { isConnected } = useSocket();

  const stats = useFetch(() => analyticsApi.dashboard(), []);
  const patients = useFetch(() => patientsApi.list({ limit: 6, sort: '-createdAt' }), []);
  const alerts = useFetch(() => alertsApi.list({ limit: 5, status: 'unresolved' }), []);

  /**
   * Refresh quietly when something happens.
   *
   * `refresh` rather than `refetch` so the cards do not flash back to skeletons
   * as fixes arrive — the figures update underneath.
   *
   * Throttled, because location updates arrive every five seconds per patient.
   * Refetching on each one would generate well over a thousand requests per
   * quarter hour from an idle dashboard and trip the API's rate limiter. The
   * counters shown here are daily aggregates, so a 12-second floor is plenty.
   */
  const refreshLiveData = useThrottledCallback(() => {
    stats.refresh();
    patients.refresh();
  }, 12000);

  useSocketEvent(SOCKET_EVENTS.LOCATION_UPDATE, refreshLiveData);
  useSocketEvent(SOCKET_EVENTS.PRESENCE_UPDATE, refreshLiveData);

  // Alerts are rare and individually important, so these are not throttled.
  useSocketEvent(SOCKET_EVENTS.ALERT_NEW, () => {
    stats.refresh();
    alerts.refresh();
  });

  useSocketEvent(SOCKET_EVENTS.PATIENT_CHANGED, () => {
    stats.refetch();
    patients.refetch();
  });

  // Re-sync after a dropped socket: events missed while disconnected would
  // otherwise leave the dashboard stale without saying so.
  useEffect(() => {
    if (isConnected) {
      stats.refresh();
      patients.refresh();
      alerts.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const data = stats.data;

  /** The headline concern, shown as a banner when something needs attention. */
  const urgent = useMemo(() => {
    if (!data) return null;

    if (data.inDangerZone > 0) {
      return {
        tone: 'critical',
        title: `${pluralise(data.inDangerZone, 'patient')} in a danger zone`,
        body: 'Open the live map and check on them immediately.',
      };
    }
    if (data.criticalAlertsToday > 0 && data.unreadAlerts > 0) {
      return {
        tone: 'critical',
        title: `${pluralise(data.criticalAlertsToday, 'critical alert')} today`,
        body: 'Review the alert feed to see what happened.',
      };
    }
    if (data.outsideSafeZone > 0) {
      return {
        tone: 'warning',
        title: `${pluralise(data.outsideSafeZone, 'patient')} outside their safe zone`,
        body: 'They may simply be out — check the map to confirm.',
      };
    }
    return null;
  }, [data]);

  if (stats.error && !data) {
    return (
      <PageContainer>
        <ErrorState error={stats.error} onRetry={stats.refetch} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        description={
          data?.lastUpdatedAt
            ? `Last location update ${formatRelativeTime(data.lastUpdatedAt)}.`
            : 'No location data has been received yet.'
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                stats.refetch();
                patients.refetch();
                alerts.refetch();
              }}
              leftIcon={<RefreshIcon className="h-4 w-4" />}
            >
              Refresh
            </Button>
            <Button to="/patients?new=1" leftIcon={<PlusIcon className="h-4 w-4" />}>
              Add patient
            </Button>
          </>
        }
      />

      {/* Urgent banner */}
      {urgent ? (
        <div
          role="alert"
          className={`mb-5 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between ${
            urgent.tone === 'critical'
              ? 'bg-rose-50 text-rose-900 ring-1 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-100 dark:ring-rose-900'
              : 'bg-orange-50 text-orange-900 ring-1 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-100 dark:ring-orange-900'
          }`}
        >
          <div className="flex items-start gap-3">
            <HazardIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{urgent.title}</p>
              <p className="mt-0.5 text-sm opacity-90">{urgent.body}</p>
            </div>
          </div>
          <Button to="/map" variant="secondary" className="shrink-0">
            Open live map
          </Button>
        </div>
      ) : null}

      {/* Stat row */}
      <StatGrid className="mb-6">
        {stats.isLoading && !data ? (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        ) : (
          <>
            <StatCard
              label="Total patients"
              value={data?.totalPatients ?? 0}
              hint={
                data?.totalPatients ? `${data.patientsOnline} online now` : 'Add your first patient'
              }
              icon={<UsersIcon className="h-4.5 w-4.5" />}
              tone="brand"
              to="/patients"
            />
            <StatCard
              label="Devices online"
              value={data?.patientsOnline ?? 0}
              hint={
                data?.patientsOffline
                  ? `${data.patientsOffline} not reporting`
                  : 'All devices reporting'
              }
              icon={<WifiIcon className="h-4.5 w-4.5" />}
              tone={data?.patientsOffline > 0 ? 'warning' : 'good'}
            />
            <StatCard
              label="Alerts today"
              value={data?.alertsToday ?? 0}
              hint={data?.unreadAlerts ? `${data.unreadAlerts} unread` : 'Nothing needs attention'}
              icon={<BellIcon className="h-4.5 w-4.5" />}
              tone={data?.criticalAlertsToday > 0 ? 'critical' : 'neutral'}
              emphasise={data?.criticalAlertsToday > 0}
              to="/alerts"
            />
            <StatCard
              label="Average battery"
              value={data?.battery?.averageLevel != null ? `${data.battery.averageLevel}%` : '—'}
              hint={
                data?.battery?.lowCount
                  ? `${pluralise(data.battery.lowCount, 'device')} low`
                  : data?.battery?.reportingCount
                    ? `${data.battery.reportingCount} reporting`
                    : 'No battery data'
              }
              icon={<BatteryIcon level={data?.battery?.averageLevel} className="h-4.5 w-4.5" />}
              tone={data?.battery?.lowCount > 0 ? 'warning' : 'neutral'}
            />
          </>
        )}
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Patients */}
        <section className="lg:col-span-2">
          <Card padded={false} className="p-5">
            <CardHeader
              title="Patients"
              subtitle="Most recently added"
              action={
                <Link
                  to="/patients"
                  className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-400"
                >
                  View all
                </Link>
              }
            />

            {patients.isLoading && !patients.data ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <SkeletonPatientCard />
                <SkeletonPatientCard />
              </div>
            ) : !patients.data?.length ? (
              <EmptyState
                icon={<UsersIcon className="h-6 w-6" />}
                title="No patients yet"
                message="Add the person you care for, set a safe zone around their home, then open their tracking link on their phone."
                action={
                  <Button to="/patients?new=1" leftIcon={<PlusIcon className="h-4 w-4" />}>
                    Add your first patient
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {patients.data.map((patient) => (
                  <PatientCard key={patient._id} patient={patient} />
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* Alerts + quick links */}
        <section className="space-y-5">
          <Card>
            <CardHeader
              title="Needs attention"
              subtitle="Unresolved alerts"
              action={
                <Link
                  to="/alerts"
                  className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-400"
                >
                  All alerts
                </Link>
              }
            />

            {alerts.isLoading && !alerts.data ? (
              <SkeletonList rows={3} />
            ) : !alerts.data?.length ? (
              <EmptyState
                icon={<ShieldIcon className="h-6 w-6" />}
                title="Nothing to review"
                message="Alerts will appear here the moment something needs your attention."
                className="!py-8"
              />
            ) : (
              <div className="space-y-3">
                {alerts.data.map((alert) => (
                  <AlertItem
                    key={alert._id}
                    alert={alert}
                    onMarkRead={async (id) => {
                      await alertsApi.markRead(id);
                      alerts.refresh();
                      stats.refresh();
                    }}
                    onResolve={async (target) => {
                      await alertsApi.resolve(target._id);
                      alerts.refresh();
                      stats.refresh();
                    }}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Set-up" subtitle="Keep monitoring accurate" />
            <div className="space-y-2">
              <QuickLink
                to="/safe-zones"
                icon={<ShieldIcon className="h-4.5 w-4.5" />}
                title="Safe zones"
                body="Set the home boundary for each patient."
              />
              <QuickLink
                to="/danger-zones"
                icon={<HazardIcon className="h-4.5 w-4.5" />}
                title="Danger zones"
                body="Mark railways, rivers and busy roads nearby."
              />
            </div>
          </Card>
        </section>
      </div>
    </PageContainer>
  );
}

/** Row in the set-up card. */
function QuickLink({ to, icon, title, body }) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-surface-900 dark:text-surface-100">
          {title}
        </span>
        <span className="block text-xs text-surface-500 dark:text-surface-400">{body}</span>
      </span>
    </Link>
  );
}
