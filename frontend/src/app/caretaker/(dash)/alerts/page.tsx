'use client';

import { useCallback, useState } from 'react';
import { AlertRow } from '@/components/caretaker/AlertRow';
import Button from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { ShieldIcon } from '@/components/ui/Icons';
import { useApi, useClockTick, useThrottledCallback } from '@/hooks/useApi';
import { ApiError } from '@/lib/api';
import { ALERT_LABELS, SOCKET_EVENTS } from '@/lib/constants';
import { alerts as alertsApi, type AlertFilters } from '@/lib/endpoints';
import type { Alert } from '@/lib/types';
import { usePatients } from '@/providers/PatientsProvider';
import { useSocketEvent } from '@/providers/SocketProvider';
import { useToast } from '@/providers/ToastProvider';

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
const PAGE_SIZE = 20;

export default function AlertsPage() {
  const { patients, selectedId } = usePatients();
  const toast = useToast();

  useClockTick(20_000);

  const [scope, setScope] = useState<'all' | 'patient'>('all');
  const [severity, setSeverity] = useState<string>('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filters: AlertFilters = {
    page,
    limit: PAGE_SIZE,
    severity: severity || undefined,
    unresolvedOnly: onlyOpen || undefined,
    patientId: scope === 'patient' && selectedId ? selectedId : undefined,
  };

  // Serialised so the fetcher stays referentially stable between renders.
  const filterKey = JSON.stringify(filters);

  const feed = useApi(
    useCallback(
      (signal: AbortSignal) => alertsApi.list(JSON.parse(filterKey) as AlertFilters, signal),
      [filterKey]
    )
  );

  const refreshSoon = useThrottledCallback(feed.refresh, 3000);
  useSocketEvent(SOCKET_EVENTS.ALERT_NEW, refreshSoon);
  useSocketEvent(SOCKET_EVENTS.ALERT_UPDATED, refreshSoon);

  /** Reset to the first page whenever a filter changes. */
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  async function act(alert: Alert, action: 'read' | 'resolve') {
    setBusyId(alert.id);
    try {
      if (action === 'read') await alertsApi.markRead(alert.id);
      else await alertsApi.markResolved(alert.id);
      feed.refresh();
    } catch (caught) {
      toast.error(
        'Could not update the alert',
        caught instanceof ApiError ? caught.message : undefined
      );
    } finally {
      setBusyId(null);
    }
  }

  async function markEverythingRead() {
    try {
      const result = await alertsApi.markAllRead(
        scope === 'patient' && selectedId ? selectedId : undefined
      );
      toast.success(`${result.updated} alert${result.updated === 1 ? '' : 's'} marked read`);
      feed.refresh();
    } catch (caught) {
      toast.error('Could not mark them read', caught instanceof ApiError ? caught.message : undefined);
    }
  }

  const items = feed.data?.items ?? [];
  const meta = feed.data?.meta;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Alerts</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">What needs looking at</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={markEverythingRead}>
          Mark all read
        </Button>
      </header>

      {/* ---------------------------------------------------------- filters */}
      <section className="flex flex-wrap items-center gap-2" aria-label="Filter alerts">
        <div className="pillbar">
          <button
            type="button"
            className={`pill ${scope === 'all' ? 'pill-active' : ''}`}
            onClick={() => changeFilter(() => setScope('all'))}
          >
            Everyone
          </button>
          <button
            type="button"
            className={`pill ${scope === 'patient' ? 'pill-active' : ''}`}
            onClick={() => changeFilter(() => setScope('patient'))}
            disabled={!selectedId}
          >
            Selected patient
          </button>
        </div>

        <div className="pillbar">
          <button
            type="button"
            className={`pill ${severity === '' ? 'pill-active' : ''}`}
            onClick={() => changeFilter(() => setSeverity(''))}
          >
            All levels
          </button>
          {SEVERITIES.map((level) => (
            <button
              key={level}
              type="button"
              className={`pill capitalize ${severity === level ? 'pill-active' : ''}`}
              onClick={() => changeFilter(() => setSeverity(level))}
            >
              {level}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-pill border border-ink-100/12 bg-ink-900/70 px-4 py-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(event) => changeFilter(() => setOnlyOpen(event.target.checked))}
            className="h-3.5 w-3.5 accent-acid-500"
          />
          Unresolved only
        </label>
      </section>

      {/* ------------------------------------------------------------- feed */}
      {feed.isLoading ? (
        <SkeletonRows rows={5} height="h-32" />
      ) : feed.error ? (
        <div className="panel">
          <ErrorState message={feed.error} onRetry={feed.refresh} />
        </div>
      ) : !items.length ? (
        <div className="panel">
          <EmptyState
            icon={<ShieldIcon className="h-5 w-5" />}
            title={onlyOpen || severity ? 'Nothing matches those filters' : 'No alerts yet'}
            body={
              patients.length
                ? 'Zone breaches, SOS presses and device problems appear here the moment they happen.'
                : 'Add a patient and a safe zone, and alerts will start appearing here.'
            }
          />
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-500">
            {meta?.total} alert{meta?.total === 1 ? '' : 's'}
            {severity ? ` · ${severity}` : ''}
            {onlyOpen ? ' · unresolved' : ''}
          </p>

          <div className="space-y-2.5">
            {items.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                isBusy={busyId === alert.id}
                showPatient={scope === 'all'}
                onMarkRead={(target) => void act(target, 'read')}
                onResolve={(target) => void act(target, 'resolve')}
              />
            ))}
          </div>

          {meta && meta.totalPages > 1 ? (
            <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Pagination">
              <Button
                variant="ghost"
                size="sm"
                disabled={!meta.hasPrevPage}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span className="tnum text-xs text-ink-500">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={!meta.hasNextPage}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}

      {/* A legend, because the alert labels are the product's vocabulary. */}
      <details className="panel p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink-300">
          What the alert types mean
        </summary>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {Object.entries(ALERT_LABELS).map(([type, label]) => (
            <div key={type} className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-400">{label}</dt>
              <dd className="tnum shrink-0 text-[10px] text-ink-600">{type}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
