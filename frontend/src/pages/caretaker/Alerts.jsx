/**
 * Alert feed.
 *
 * New alerts arrive over Socket.IO. They are prepended rather than triggering a
 * refetch, so the list the caregiver is reading does not jump underneath them.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { alertsApi, patientsApi } from '../../api';
import { useFetch } from '../../hooks/useApi';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { SOCKET_EVENTS, ALERT_TYPES, SEVERITY, alertTypeMeta } from '../../lib/constants';
import PageHeader, { PageContainer, StatGrid, Toolbar } from '../../components/layout/PageHeader';
import StatCard from '../../components/shared/StatCard';
import AlertItem from '../../components/caretaker/AlertItem';
import Button from '../../components/shared/Button';
import { FilterPills } from '../../components/shared/Controls';
import { Select, Textarea } from '../../components/shared/Form';
import Modal from '../../components/shared/Modal';
import { EmptyState, ErrorState, Pagination, SkeletonList } from '../../components/shared/Feedback';
import {
  BellIcon,
  CheckIcon,
  ShieldIcon,
  HazardIcon,
  SosIcon,
} from '../../components/shared/Icons';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'unresolved', label: 'Unresolved' },
  { value: 'resolved', label: 'Resolved' },
];

const SEVERITY_OPTIONS = [
  { value: 'all', label: 'Any severity' },
  { value: SEVERITY.CRITICAL, label: 'Critical' },
  { value: SEVERITY.HIGH, label: 'High' },
  { value: SEVERITY.MEDIUM, label: 'Medium' },
  { value: SEVERITY.LOW, label: 'Low' },
  { value: SEVERITY.INFO, label: 'Info' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Any type' },
  ...Object.values(ALERT_TYPES).map((type) => ({
    value: type,
    label: alertTypeMeta(type).label,
  })),
];

export default function Alerts() {
  const { toast } = useToast();

  const [status, setStatus] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [type, setType] = useState('all');
  const [patientId, setPatientId] = useState('');
  const [page, setPage] = useState(1);

  const [resolving, setResolving] = useState(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [isPending, setIsPending] = useState(false);

  const summary = useFetch(() => alertsApi.summary(), []);
  const patients = useFetch(() => patientsApi.list({ limit: 100 }), []);

  const alerts = useFetch(
    () => alertsApi.list({ page, limit: 20, status, severity, type, patient: patientId }),
    [page, status, severity, type, patientId]
  );

  useEffect(() => {
    setPage(1);
  }, [status, severity, type, patientId]);

  /**
   * A new alert arrives: prepend it if it passes the active filters, so the
   * feed stays live without yanking the scroll position.
   */
  useSocketEvent(SOCKET_EVENTS.ALERT_NEW, (alert) => {
    summary.refresh();

    const matchesFilters =
      (status === 'all' || status === 'unread' || status === 'unresolved') &&
      (severity === 'all' || severity === alert.severity) &&
      (type === 'all' || type === alert.type) &&
      (!patientId || patientId === String(alert.patient?._id));

    if (!matchesFilters || page !== 1) return;

    alerts.setData((current) => [alert, ...(current || [])].slice(0, 20));
  });

  useSocketEvent(SOCKET_EVENTS.ALERT_UPDATED, () => {
    summary.refresh();
    alerts.refresh();
  });

  const markRead = useCallback(
    async (id) => {
      // Optimistic: marking read is trivially reversible and the feedback
      // should be instant.
      alerts.setData((current) =>
        (current || []).map((alert) => (alert._id === id ? { ...alert, isRead: true } : alert))
      );

      try {
        await alertsApi.markRead(id);
        summary.refresh();
      } catch (err) {
        toast.error('Could not mark the alert as read', err.message);
        alerts.refresh();
      }
    },
    [alerts, summary, toast]
  );

  const markAllRead = async () => {
    setIsPending(true);
    try {
      const { data } = await alertsApi.markAllRead();
      toast.success(`${data.updated} alert${data.updated === 1 ? '' : 's'} marked as read`);
      alerts.refetch();
      summary.refresh();
    } catch (err) {
      toast.error('Could not mark alerts as read', err.message);
    } finally {
      setIsPending(false);
    }
  };

  const confirmResolve = async () => {
    if (!resolving) return;

    setIsPending(true);
    try {
      await alertsApi.resolve(resolving._id, resolutionNote.trim());
      toast.success('Alert resolved');
      setResolving(null);
      setResolutionNote('');
      alerts.refresh();
      summary.refresh();
    } catch (err) {
      toast.error('Could not resolve the alert', err.message);
    } finally {
      setIsPending(false);
    }
  };

  const patientOptions = useMemo(
    () => [
      { value: '', label: 'All patients' },
      ...(patients.data || []).map((patient) => ({ value: patient._id, label: patient.name })),
    ],
    [patients.data]
  );

  const hasFilters = status !== 'all' || severity !== 'all' || type !== 'all' || Boolean(patientId);
  const stats = summary.data;

  return (
    <PageContainer>
      <PageHeader
        title="Alerts"
        description="Everything the system has flagged, newest first."
        actions={
          stats?.unread > 0 ? (
            <Button
              variant="secondary"
              onClick={markAllRead}
              isLoading={isPending}
              leftIcon={<CheckIcon className="h-4 w-4" />}
            >
              Mark all read
            </Button>
          ) : null
        }
      />

      <StatGrid className="mb-6">
        <StatCard
          label="Unread"
          value={stats?.unread ?? 0}
          icon={<BellIcon className="h-4.5 w-4.5" />}
          tone={stats?.unread > 0 ? 'warning' : 'good'}
          isLoading={summary.isLoading && !stats}
        />
        <StatCard
          label="Unresolved"
          value={stats?.unresolved ?? 0}
          icon={<ShieldIcon className="h-4.5 w-4.5" />}
          tone="neutral"
          isLoading={summary.isLoading && !stats}
        />
        <StatCard
          label="Critical open"
          value={stats?.criticalUnresolved ?? 0}
          icon={<HazardIcon className="h-4.5 w-4.5" />}
          tone="critical"
          emphasise={stats?.criticalUnresolved > 0}
          isLoading={summary.isLoading && !stats}
        />
        <StatCard
          label="SOS presses"
          value={stats?.byType?.SOS ?? 0}
          hint="All time"
          icon={<SosIcon className="h-4.5 w-4.5" />}
          tone={stats?.byType?.SOS > 0 ? 'critical' : 'neutral'}
          emphasise={false}
          isLoading={summary.isLoading && !stats}
        />
      </StatGrid>

      <Toolbar>
        <FilterPills options={STATUS_FILTERS} value={status} onChange={setStatus} label="Status" />

        <Select
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
          options={SEVERITY_OPTIONS}
          className="sm:w-40"
          aria-label="Filter by severity"
        />
        <Select
          value={type}
          onChange={(event) => setType(event.target.value)}
          options={TYPE_OPTIONS}
          className="sm:w-52"
          aria-label="Filter by alert type"
        />
        <Select
          value={patientId}
          onChange={(event) => setPatientId(event.target.value)}
          options={patientOptions}
          className="sm:w-44"
          aria-label="Filter by patient"
        />
      </Toolbar>

      {alerts.error && !alerts.data ? (
        <ErrorState error={alerts.error} onRetry={alerts.refetch} />
      ) : alerts.isLoading && !alerts.data ? (
        <SkeletonList rows={6} />
      ) : !alerts.data?.length ? (
        <EmptyState
          icon={<ShieldIcon className="h-6 w-6" />}
          title={hasFilters ? 'No alerts match your filters' : 'No alerts yet'}
          message={
            hasFilters
              ? 'Try widening the filters to see more.'
              : 'This is the quiet you want. Alerts will appear the instant something needs your attention.'
          }
          action={
            hasFilters ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setStatus('all');
                  setSeverity('all');
                  setType('all');
                  setPatientId('');
                }}
              >
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="space-y-3" aria-live="polite">
            {alerts.data.map((alert) => (
              <AlertItem
                key={alert._id}
                alert={alert}
                onMarkRead={markRead}
                onResolve={(target) => {
                  setResolving(target);
                  setResolutionNote('');
                }}
                isPending={isPending}
              />
            ))}
          </div>

          <Pagination meta={alerts.meta} onPageChange={setPage} className="mt-6" />
        </>
      )}

      {/* Resolve, with an optional note recording what was done. */}
      <Modal
        isOpen={Boolean(resolving)}
        onClose={() => setResolving(null)}
        title="Resolve alert"
        description={resolving?.title}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolving(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={confirmResolve} isLoading={isPending}>
              Resolve
            </Button>
          </>
        }
      >
        <Textarea
          label="What happened? (optional)"
          value={resolutionNote}
          onChange={(event) => setResolutionNote(event.target.value)}
          rows={3}
          placeholder="Phoned her daughter — she was at the shop and is home now."
          help="Recorded against the alert so you have a history of how each situation was handled."
        />
      </Modal>
    </PageContainer>
  );
}
