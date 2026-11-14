/**
 * Analytics.
 *
 * Every chart comes from one `/analytics/overview` request, so the figures on
 * the page are always from the same instant rather than drifting apart across
 * several round trips.
 */
import { useMemo, useState } from 'react';
import { analyticsApi, patientsApi } from '../../api';
import { useFetch } from '../../hooks/useApi';
import PageHeader, { PageContainer, StatGrid } from '../../components/layout/PageHeader';
import StatCard from '../../components/shared/StatCard';
import Card, { CardHeader } from '../../components/shared/Card';
import MovementChart from '../../components/charts/MovementChart';
import AlertsChart from '../../components/charts/AlertsChart';
import TimeOutsideChart from '../../components/charts/TimeOutsideChart';
import { Select } from '../../components/shared/Form';
import { FilterPills } from '../../components/shared/Controls';
import { ErrorState } from '../../components/shared/Feedback';
import { RouteIcon, ClockIcon, ShieldIcon, HazardIcon } from '../../components/shared/Icons';
import { alertTypeMeta } from '../../lib/constants';
import { formatDuration } from '../../lib/format';

const RANGE_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

export default function Analytics() {
  const [days, setDays] = useState('7');
  const [patientId, setPatientId] = useState('');

  const patients = useFetch(() => patientsApi.list({ limit: 100 }), []);
  const overview = useFetch(
    () => analyticsApi.overview({ days, patient: patientId }),
    [days, patientId]
  );

  const data = overview.data;
  const summary = data?.summary;

  const patientOptions = useMemo(
    () => [
      { value: '', label: 'All patients' },
      ...(patients.data || []).map((p) => ({ value: p._id, label: p.name })),
    ],
    [patients.data]
  );

  /** Alert totals by type, biggest first, for the breakdown list. */
  const alertBreakdown = useMemo(() => {
    const byType = data?.alertsByType || {};
    return Object.entries(byType)
      .map(([type, count]) => ({ type, count, meta: alertTypeMeta(type) }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const totalAlerts = alertBreakdown.reduce((sum, row) => sum + row.count, 0);

  if (overview.error && !data) {
    return (
      <PageContainer>
        <ErrorState error={overview.error} onRetry={overview.refetch} />
      </PageContainer>
    );
  }

  const scopeLabel = patientId
    ? patients.data?.find((p) => p._id === patientId)?.name
    : 'all patients';

  return (
    <PageContainer>
      <PageHeader
        title="Analytics"
        description={`Movement and alert patterns for ${scopeLabel} over the last ${days} days.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
              options={patientOptions}
              className="w-44"
              aria-label="Filter by patient"
            />
            <FilterPills
              options={RANGE_OPTIONS}
              value={days}
              onChange={setDays}
              label="Date range"
            />
          </div>
        }
      />

      {/* Summary */}
      <StatGrid className="mb-6">
        <StatCard
          label="Total distance"
          value={summary ? `${summary.totalDistanceKm} km` : '—'}
          hint={summary ? `${summary.averageDailyDistanceKm} km per active day` : null}
          icon={<RouteIcon className="h-4.5 w-4.5" />}
          tone="brand"
          isLoading={overview.isLoading && !data}
        />
        <StatCard
          label="Time outside home"
          value={summary ? formatDuration(summary.totalMinutesOutside) : '—'}
          hint={
            summary ? `${formatDuration(summary.averageDailyMinutesOutside)} per active day` : null
          }
          icon={<ClockIcon className="h-4.5 w-4.5" />}
          isLoading={overview.isLoading && !data}
        />
        <StatCard
          label="Safe zone exits"
          value={summary?.safeZoneViolations ?? 0}
          hint="Times the home boundary was crossed"
          icon={<ShieldIcon className="h-4.5 w-4.5" />}
          tone={summary?.safeZoneViolations > 0 ? 'warning' : 'good'}
          isLoading={overview.isLoading && !data}
        />
        <StatCard
          label="Danger zone entries"
          value={summary?.dangerZoneEntries ?? 0}
          hint={summary?.sosCount ? `${summary.sosCount} SOS presses` : 'No SOS presses'}
          icon={<HazardIcon className="h-4.5 w-4.5" />}
          tone="critical"
          emphasise={summary?.dangerZoneEntries > 0}
          isLoading={overview.isLoading && !data}
        />
      </StatGrid>

      {/* Charts */}
      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <MovementChart data={data?.movement || []} isLoading={overview.isLoading && !data} />
          <TimeOutsideChart
            data={data?.timeOutside || []}
            isLoading={overview.isLoading && !data}
          />
        </div>

        <AlertsChart data={data?.alerts || []} isLoading={overview.isLoading && !data} />

        {/* Breakdown table. Figures are in a column, so tabular numerals. */}
        <Card>
          <CardHeader
            title="Alerts by type"
            subtitle={`${totalAlerts} alert${totalAlerts === 1 ? '' : 's'} in this period`}
          />

          {alertBreakdown.length ? (
            <ul className="divide-y divide-surface-100 dark:divide-surface-800">
              {alertBreakdown.map((row) => {
                const share = totalAlerts ? Math.round((row.count / totalAlerts) * 100) : 0;

                return (
                  <li key={row.type} className="flex items-center gap-3 py-2.5">
                    <span className="text-base" aria-hidden="true">
                      {row.meta.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-surface-700 dark:text-surface-200">
                      {row.meta.label}
                    </span>

                    {/* A quiet proportion bar; the figure beside it is the
                        authoritative value. */}
                    <span
                      className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-surface-100 sm:block dark:bg-surface-800"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full bg-brand-500"
                        style={{ width: `${share}%` }}
                      />
                    </span>

                    <span className="w-14 shrink-0 text-right text-sm font-semibold tabular text-surface-900 dark:text-surface-50">
                      {row.count}
                    </span>
                    <span className="w-10 shrink-0 text-right text-xs tabular text-surface-500 dark:text-surface-400">
                      {share}%
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-surface-500 dark:text-surface-400">
              No alerts were raised in this period.
            </p>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
