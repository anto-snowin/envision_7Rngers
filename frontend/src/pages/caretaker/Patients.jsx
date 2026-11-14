/**
 * Patient management: search, filter, paginate, create, edit, delete.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { patientsApi } from '../../api';
import { useFetch, useDebounced, useThrottledCallback } from '../../hooks/useApi';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { SOCKET_EVENTS, PAGE_SIZE_OPTIONS } from '../../lib/constants';
import PageHeader, { PageContainer, Toolbar } from '../../components/layout/PageHeader';
import PatientCard from '../../components/caretaker/PatientCard';
import PatientForm from '../../components/caretaker/PatientForm';
import TrackingLinkCard from '../../components/caretaker/TrackingLinkCard';
import Button from '../../components/shared/Button';
import { SearchInput, FilterPills } from '../../components/shared/Controls';
import { Select } from '../../components/shared/Form';
import { ConfirmDialog } from '../../components/shared/Modal';
import {
  EmptyState,
  ErrorState,
  Pagination,
  SkeletonPatientCard,
} from '../../components/shared/Feedback';
import { UsersIcon, PlusIcon, SearchIcon } from '../../components/shared/Icons';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
];

const ZONE_FILTERS = [
  { value: 'all', label: 'Any location' },
  { value: 'inside_safe', label: 'In safe zone' },
  { value: 'outside_safe', label: 'Outside safe zone' },
  { value: 'in_danger', label: 'In danger zone' },
  { value: 'unknown', label: 'No zone data' },
];

export default function Patients() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);

  const [status, setStatus] = useState('all');
  const [zone, setZone] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [editing, setEditing] = useState(null); // patient being edited
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState(null);

  const query = useMemo(
    () => ({ page, limit, search: debouncedSearch, status, zone }),
    [page, limit, debouncedSearch, status, zone]
  );

  const patients = useFetch(
    () => patientsApi.list(query),
    [page, limit, debouncedSearch, status, zone]
  );

  // `?new=1` from the dashboard's "Add patient" buttons opens the form directly.
  useEffect(() => {
    if (searchParams.get('new')) {
      setEditing(null);
      setIsFormOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Any filter change invalidates the current page number.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, zone, limit]);

  // Throttled: a fix arrives every five seconds per patient, and this list
  // shows aggregates rather than live coordinates.
  const refreshList = useThrottledCallback(() => patients.refresh(), 12000);

  useSocketEvent(SOCKET_EVENTS.LOCATION_UPDATE, refreshList);
  useSocketEvent(SOCKET_EVENTS.PRESENCE_UPDATE, refreshList);

  const openCreate = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;

    setIsDeletePending(true);
    try {
      const { data } = await patientsApi.remove(deleting._id);
      toast.success(
        'Patient deleted',
        `${data.deleted.locations} location records and ${data.deleted.alerts} alerts were removed.`
      );
      setDeleting(null);
      patients.refetch();
    } catch (err) {
      toast.error('Could not delete patient', err.message);
    } finally {
      setIsDeletePending(false);
    }
  };

  const hasFilters = Boolean(debouncedSearch) || status !== 'all' || zone !== 'all';

  return (
    <PageContainer>
      <PageHeader
        title="Patients"
        description="The people you are monitoring, and their tracking links."
        actions={
          <Button onClick={openCreate} leftIcon={<PlusIcon className="h-4 w-4" />}>
            Add patient
          </Button>
        }
      />

      {/* A freshly created patient's tracking link, surfaced immediately —
          the link is the one thing the caregiver needs next. */}
      {newlyCreated ? (
        <TrackingLinkCard
          patient={newlyCreated}
          className="mb-5"
          onDismiss={() => setNewlyCreated(null)}
        />
      ) : null}

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, address or tracking code…"
          className="sm:max-w-xs"
        />

        <FilterPills
          options={STATUS_FILTERS}
          value={status}
          onChange={setStatus}
          label="Device status"
        />

        <Select
          value={zone}
          onChange={(event) => setZone(event.target.value)}
          options={ZONE_FILTERS}
          className="sm:w-48"
          aria-label="Filter by location"
        />

        <div className="sm:ml-auto">
          <Select
            value={String(limit)}
            onChange={(event) => setLimit(Number(event.target.value))}
            options={PAGE_SIZE_OPTIONS.map((size) => ({
              value: String(size),
              label: `${size} per page`,
            }))}
            aria-label="Results per page"
          />
        </div>
      </Toolbar>

      {/* Results */}
      {patients.error && !patients.data ? (
        <ErrorState error={patients.error} onRetry={patients.refetch} />
      ) : patients.isLoading && !patients.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonPatientCard key={index} />
          ))}
        </div>
      ) : !patients.data?.length ? (
        hasFilters ? (
          <EmptyState
            icon={<SearchIcon className="h-6 w-6" />}
            title="No patients match your filters"
            message="Try a different search term, or clear the filters to see everyone."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setStatus('all');
                  setZone('all');
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<UsersIcon className="h-6 w-6" />}
            title="No patients yet"
            message="Add the person you care for, set a safe zone around their home, then open their tracking link on their phone."
            action={
              <Button onClick={openCreate} leftIcon={<PlusIcon className="h-4 w-4" />}>
                Add your first patient
              </Button>
            }
          />
        )
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {patients.data.map((patient) => (
              <div key={patient._id} className="relative">
                <PatientCard patient={patient} />

                {/* Edit / delete, kept out of the card body so the card stays
                    a clean summary. */}
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(patient);
                      setIsFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="!text-severity-critical"
                    onClick={() => setDeleting(patient)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Pagination meta={patients.meta} onPageChange={setPage} className="mt-6" />
        </>
      )}

      {/* Create / edit */}
      <PatientForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        patient={editing}
        onSaved={(data) => {
          patients.refetch();
          // Show the tracking link only for a brand-new patient.
          if (!editing && data?.patient) setNewlyCreated(data.patient);
        }}
      />

      {/* Delete confirmation. The consequence is spelled out, because this
          removes the patient's entire location history. */}
      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={isDeletePending}
        title={`Delete ${deleting?.name}?`}
        confirmLabel="Delete patient"
        message={
          `This permanently removes ${deleting?.name}, their entire location history, ` +
          'every alert raised for them, and their safe zone. Their tracking link will stop ' +
          'working immediately. This cannot be undone.'
        }
      />
    </PageContainer>
  );
}
