/**
 * Danger zone management.
 *
 * Zones belong to the caregiver, not to one patient, so a single "railway
 * crossing" is evaluated for everyone they look after. A zone can optionally be
 * narrowed to specific patients.
 */
import { useEffect, useMemo, useState } from 'react';
import { Circle } from 'react-leaflet';
import { dangerZoneApi, patientsApi } from '../../api';
import { useFetch, useDebounced } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DANGER_ZONE_CATEGORIES, categoryMeta, SEVERITY } from '../../lib/constants';
import PageHeader, { PageContainer, Toolbar } from '../../components/layout/PageHeader';
import Card from '../../components/shared/Card';
import MapCanvas from '../../components/map/MapCanvas';
import {
  ClickToPlace,
  DangerZoneCircle,
  FitBounds,
  PatientMarker,
} from '../../components/map/MapPrimitives';
import Button from '../../components/shared/Button';
import Modal, { ConfirmDialog } from '../../components/shared/Modal';
import {
  Input,
  Select,
  Textarea,
  RangeField,
  FormError,
  Checkbox,
} from '../../components/shared/Form';
import { SearchInput } from '../../components/shared/Controls';
import { EmptyState, ErrorState, Pagination, SkeletonList } from '../../components/shared/Feedback';
import { HazardIcon, PlusIcon, TrashIcon, EditIcon } from '../../components/shared/Icons';
import { formatDistance } from '../../lib/format';

const CATEGORY_FILTER_OPTIONS = [
  { value: 'all', label: 'All categories' },
  ...DANGER_ZONE_CATEGORIES.map((category) => ({
    value: category.value,
    label: category.label,
  })),
];

const SEVERITY_OPTIONS = [
  { value: SEVERITY.CRITICAL, label: 'Critical — immediate danger' },
  { value: SEVERITY.HIGH, label: 'High — serious hazard' },
  { value: SEVERITY.MEDIUM, label: 'Medium — worth knowing' },
];

const EMPTY_ZONE = {
  name: '',
  category: 'other',
  description: '',
  latitude: '',
  longitude: '',
  radius: 150,
  severity: SEVERITY.CRITICAL,
  patients: [],
};

export default function DangerZones() {
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [isPending, setIsPending] = useState(false);

  const zones = useFetch(
    () => dangerZoneApi.list({ page, limit: 20, search: debouncedSearch, category }),
    [page, debouncedSearch, category]
  );
  const patients = useFetch(() => patientsApi.list({ limit: 100 }), []);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category]);

  const handleDelete = async () => {
    if (!deleting) return;

    setIsPending(true);
    try {
      await dangerZoneApi.remove(deleting._id);
      toast.success('Danger zone deleted');
      setDeleting(null);
      zones.refetch();
    } catch (err) {
      toast.error('Could not delete the zone', err.message);
    } finally {
      setIsPending(false);
    }
  };

  // Points the overview map should frame.
  const mapPoints = useMemo(
    () =>
      (zones.data || []).map((zone) => ({ latitude: zone.latitude, longitude: zone.longitude })),
    [zones.data]
  );

  return (
    <PageContainer wide>
      <PageHeader
        title="Danger zones"
        description="Hazards to alert on the moment a patient enters one — railways, rivers, building sites, busy roads."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setIsFormOpen(true);
            }}
            leftIcon={<PlusIcon className="h-4 w-4" />}
          >
            Add danger zone
          </Button>
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search zones…"
          className="sm:max-w-xs"
        />
        <Select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          options={CATEGORY_FILTER_OPTIONS}
          className="sm:w-52"
          aria-label="Filter by category"
        />
      </Toolbar>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* -------------------------------------------------------- list */}
        <div className="space-y-3 xl:col-span-1">
          {zones.error && !zones.data ? (
            <ErrorState error={zones.error} onRetry={zones.refetch} />
          ) : zones.isLoading && !zones.data ? (
            <SkeletonList rows={4} />
          ) : !zones.data?.length ? (
            <Card>
              <EmptyState
                icon={<HazardIcon className="h-6 w-6" />}
                title={
                  debouncedSearch || category !== 'all'
                    ? 'No matching zones'
                    : 'No danger zones yet'
                }
                message={
                  debouncedSearch || category !== 'all'
                    ? 'Try a different search or category.'
                    : 'Mark the hazards near your patients. Each one raises a critical alert the moment a patient steps inside.'
                }
                action={
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setIsFormOpen(true);
                    }}
                    leftIcon={<PlusIcon className="h-4 w-4" />}
                  >
                    Add a danger zone
                  </Button>
                }
                className="!py-8"
              />
            </Card>
          ) : (
            <>
              {zones.data.map((zone) => {
                const meta = categoryMeta(zone.category);

                return (
                  <Card key={zone._id} className="border-l-4 border-l-severity-critical">
                    <div className="flex items-start gap-3">
                      <span className="text-xl" aria-hidden="true">
                        {meta.icon}
                      </span>

                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-surface-900 dark:text-surface-50">
                          {zone.name}
                        </h3>
                        <p className="text-xs text-surface-500 dark:text-surface-400">
                          {meta.label} · {formatDistance(zone.radius)} radius
                        </p>

                        {zone.description ? (
                          <p className="mt-1.5 text-xs text-surface-600 dark:text-surface-300">
                            {zone.description}
                          </p>
                        ) : null}

                        <p className="mt-1.5 text-[11px] text-surface-500 dark:text-surface-400">
                          {zone.patients?.length
                            ? `Applies to ${zone.patients.map((p) => p.name).join(', ')}`
                            : 'Applies to all patients'}
                        </p>

                        <div className="mt-2.5 flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditing(zone);
                              setIsFormOpen(true);
                            }}
                            leftIcon={<EditIcon className="h-3.5 w-3.5" />}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="!text-severity-critical"
                            onClick={() => setDeleting(zone)}
                            leftIcon={<TrashIcon className="h-3.5 w-3.5" />}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}

              <Pagination meta={zones.meta} onPageChange={setPage} />
            </>
          )}
        </div>

        {/* --------------------------------------------------------- map */}
        <Card padded={false} className="overflow-hidden xl:col-span-2">
          <div className="h-[560px]">
            {mapPoints.length ? (
              <MapCanvas center={mapPoints[0]}>
                <FitBounds points={mapPoints} />
                {(zones.data || []).map((zone) => (
                  <DangerZoneCircle key={zone._id} zone={zone} />
                ))}
                {(patients.data || [])
                  .filter((p) => Number.isFinite(p.liveStatus?.latitude))
                  .map((patient) => (
                    <PatientMarker key={patient._id} patient={patient} />
                  ))}
              </MapCanvas>
            ) : (
              <div className="flex h-full items-center justify-center bg-surface-100 dark:bg-surface-800">
                <p className="px-6 text-center text-sm text-surface-500 dark:text-surface-400">
                  Danger zones you add will be shown here.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <DangerZoneForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        zone={editing}
        patients={patients.data || []}
        onSaved={() => zones.refetch()}
      />

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={isPending}
        title={`Delete “${deleting?.name}”?`}
        confirmLabel="Delete zone"
        message="Patients will no longer be alerted on for entering this area. Alerts already raised for it are kept."
      />
    </PageContainer>
  );
}

/** Create / edit form, with a live map preview of the circle. */
function DangerZoneForm({ isOpen, onClose, zone, patients, onSaved }) {
  const { toast } = useToast();
  const isEditing = Boolean(zone);

  const [form, setForm] = useState(EMPTY_ZONE);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applyToAll, setApplyToAll] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    if (zone) {
      setForm({
        name: zone.name,
        category: zone.category,
        description: zone.description || '',
        latitude: zone.latitude,
        longitude: zone.longitude,
        radius: zone.radius,
        severity: zone.severity,
        patients: (zone.patients || []).map((p) => p._id || p),
      });
      setApplyToAll(!zone.patients?.length);
    } else {
      setForm(EMPTY_ZONE);
      setApplyToAll(true);
    }

    setFieldErrors({});
    setError(null);
  }, [isOpen, zone]);

  const hasPosition = form.latitude !== '' && form.longitude !== '';

  const submit = async (event) => {
    event.preventDefault();

    const errors = {};
    if (form.name.trim().length < 2) errors.name = 'Give the zone a name';
    if (!hasPosition) errors.latitude = 'Click the map to place the zone';

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim(),
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      radius: Number(form.radius),
      severity: form.severity,
      patients: applyToAll ? [] : form.patients,
    };

    try {
      if (isEditing) {
        await dangerZoneApi.update(zone._id, payload);
        toast.success('Danger zone updated');
      } else {
        await dangerZoneApi.create(payload);
        toast.success('Danger zone created', 'Patients entering it will trigger a critical alert.');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      if (err.fields) setFieldErrors(err.fields);
      else setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit “${zone.name}”` : 'Add a danger zone'}
      description="Click the map to place the centre, then size the circle to cover the hazard."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="danger-zone-form" isLoading={isSubmitting}>
            {isEditing ? 'Save changes' : 'Create zone'}
          </Button>
        </>
      }
    >
      <form id="danger-zone-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={error} />

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Fields */}
          <div className="space-y-4">
            <Input
              label="Zone name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              error={fieldErrors.name}
              required
              placeholder="Disused railway line"
            />

            <Select
              label="Category"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              options={DANGER_ZONE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
            />

            <Select
              label="Severity"
              value={form.severity}
              onChange={(event) => setForm({ ...form, severity: event.target.value })}
              options={SEVERITY_OPTIONS}
              help="Critical alerts are sticky in the dashboard until dismissed."
            />

            <RangeField
              label="Radius"
              value={Number(form.radius)}
              onChange={(radius) => setForm({ ...form, radius })}
              min={10}
              max={2000}
              step={10}
              help="Cover the hazard plus a margin, so the alert fires before the patient reaches it."
            />

            <Textarea
              label="Description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={2}
              placeholder="Unfenced track bed. No crossing points for 400 m."
              help="Included in the alert, so you know what you are dealing with."
            />

            <div className="space-y-2.5 border-t border-surface-200 pt-4 dark:border-surface-800">
              <Checkbox
                label="Applies to all patients"
                description="Leave on unless this hazard is only relevant to certain people."
                checked={applyToAll}
                onChange={(event) => setApplyToAll(event.target.checked)}
              />

              {!applyToAll ? (
                <div className="space-y-1.5 pl-7">
                  {patients.map((patient) => (
                    <Checkbox
                      key={patient._id}
                      label={patient.name}
                      checked={form.patients.includes(patient._id)}
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          patients: event.target.checked
                            ? [...current.patients, patient._id]
                            : current.patients.filter((id) => id !== patient._id),
                        }));
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>

            {fieldErrors.latitude ? <p className="error-text">{fieldErrors.latitude}</p> : null}
          </div>

          {/* Map picker */}
          <div className="h-80 overflow-hidden rounded-xl border border-surface-200 lg:h-full lg:min-h-[420px] dark:border-surface-800">
            <MapCanvas
              center={
                hasPosition
                  ? { latitude: Number(form.latitude), longitude: Number(form.longitude) }
                  : undefined
              }
              zoom={hasPosition ? 15 : 13}
            >
              <ClickToPlace
                onPlace={({ latitude, longitude }) =>
                  setForm((current) => ({
                    ...current,
                    latitude: Number(latitude.toFixed(6)),
                    longitude: Number(longitude.toFixed(6)),
                  }))
                }
              />

              {hasPosition ? (
                <>
                  <FitBounds
                    points={[
                      { latitude: Number(form.latitude), longitude: Number(form.longitude) },
                    ]}
                    maxZoom={16}
                  />
                  <Circle
                    center={[Number(form.latitude), Number(form.longitude)]}
                    radius={Number(form.radius)}
                    pathOptions={{
                      color: '#e11d48',
                      fillColor: '#e11d48',
                      fillOpacity: 0.15,
                      weight: 2,
                      dashArray: '6 4',
                    }}
                  />
                </>
              ) : null}

              {patients
                .filter((p) => Number.isFinite(p.liveStatus?.latitude))
                .map((patient) => (
                  <PatientMarker key={patient._id} patient={patient} showAccuracy={false} />
                ))}
            </MapCanvas>
          </div>
        </div>
      </form>
    </Modal>
  );
}
