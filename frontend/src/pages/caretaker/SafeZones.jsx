/**
 * Safe zone management.
 *
 * One active zone per patient. The map is editable: clicking moves the centre
 * and the slider changes the radius, with the circle updating live — judging
 * "is 200 m the right radius here?" is impossible from a number alone.
 */
import { useEffect, useMemo, useState } from 'react';
import { Circle } from 'react-leaflet';
import { geofenceApi, patientsApi } from '../../api';
import { useFetch } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import PageHeader, { PageContainer } from '../../components/layout/PageHeader';
import Card, { CardHeader, DataRow } from '../../components/shared/Card';
import MapCanvas from '../../components/map/MapCanvas';
import {
  ClickToPlace,
  FitBounds,
  HomeMarker,
  PatientMarker,
} from '../../components/map/MapPrimitives';
import Button from '../../components/shared/Button';
import { Select, Input, RangeField, FormError } from '../../components/shared/Form';
import { ConfirmDialog } from '../../components/shared/Modal';
import { EmptyState, ErrorState } from '../../components/shared/Feedback';
import { LoadingState } from '../../components/shared/Spinner';
import { ShieldIcon, LocationIcon, TrashIcon, UsersIcon } from '../../components/shared/Icons';
import { formatDistance, formatCoordinate } from '../../lib/format';

export default function SafeZones() {
  const { toast } = useToast();

  const patients = useFetch(() => patientsApi.list({ limit: 100 }), []);
  const geofences = useFetch(() => geofenceApi.list(), []);

  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null); // { latitude, longitude, radius, name }
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!selectedId && patients.data?.length) setSelectedId(patients.data[0]._id);
  }, [patients.data, selectedId]);

  const patient = useMemo(
    () => (patients.data || []).find((p) => p._id === selectedId) || null,
    [patients.data, selectedId]
  );

  const existing = useMemo(
    () =>
      (geofences.data || []).find(
        (fence) => String(fence.patient?._id || fence.patient) === String(selectedId)
      ) || null,
    [geofences.data, selectedId]
  );

  /**
   * Seed the draft from the existing zone, or from the patient's home, or from
   * their last known position — in that order of preference.
   */
  useEffect(() => {
    if (!patient) {
      setDraft(null);
      return;
    }

    if (existing) {
      setDraft({
        latitude: existing.latitude,
        longitude: existing.longitude,
        radius: existing.radius,
        name: existing.name,
      });
      return;
    }

    const home = patient.homeLocation;
    const live = patient.liveStatus;
    const seed =
      Number.isFinite(home?.latitude) && Number.isFinite(home?.longitude)
        ? home
        : Number.isFinite(live?.latitude)
          ? live
          : null;

    setDraft(
      seed
        ? {
            latitude: seed.latitude,
            longitude: seed.longitude,
            radius: 200,
            name: `${patient.name.split(' ')[0]}'s safe zone`,
          }
        : null
    );
    setError(null);
  }, [patient, existing]);

  const isDirty =
    existing &&
    draft &&
    (existing.latitude !== draft.latitude ||
      existing.longitude !== draft.longitude ||
      existing.radius !== draft.radius ||
      existing.name !== draft.name);

  const save = async () => {
    if (!draft || !patient) return;

    setIsSaving(true);
    setError(null);

    try {
      if (existing) {
        await geofenceApi.update(existing._id, {
          name: draft.name,
          latitude: draft.latitude,
          longitude: draft.longitude,
          radius: draft.radius,
        });
        toast.success('Safe zone updated');
      } else {
        await geofenceApi.create({
          patient: patient._id,
          name: draft.name,
          latitude: draft.latitude,
          longitude: draft.longitude,
          radius: draft.radius,
        });
        toast.success('Safe zone created', `${patient.name} will now be monitored.`);
      }

      geofences.refetch();
      patients.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;

    setIsSaving(true);
    try {
      await geofenceApi.remove(existing._id);
      toast.warning(
        'Safe zone deleted',
        `${patient.name} will no longer be alerted on for leaving home.`
      );
      setIsDeleteOpen(false);
      geofences.refetch();
    } catch (err) {
      toast.error('Could not delete the safe zone', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (patients.isLoading && !patients.data) return <LoadingState message="Loading patients…" />;

  if (!patients.data?.length) {
    return (
      <PageContainer>
        <EmptyState
          icon={<UsersIcon className="h-6 w-6" />}
          title="No patients yet"
          message="Safe zones are set per patient, so add a patient first."
          action={<Button to="/patients?new=1">Add a patient</Button>}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer wide>
      <PageHeader
        title="Safe zones"
        description="A circular boundary around home. Leaving it raises an alert; coming back clears it."
      />

      {geofences.error ? <ErrorState error={geofences.error} onRetry={geofences.refetch} /> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* -------------------------------------------------------- editor */}
        <div className="space-y-4">
          <Card>
            <Select
              label="Patient"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              options={(patients.data || []).map((p) => ({ value: p._id, label: p.name }))}
            />

            <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface-100 p-3 text-xs dark:bg-surface-800">
              <ShieldIcon
                className={`h-4 w-4 shrink-0 ${
                  existing ? 'text-brand-600 dark:text-brand-400' : 'text-surface-400'
                }`}
              />
              <span className="text-surface-600 dark:text-surface-300">
                {existing ? 'This patient has an active safe zone.' : 'No safe zone set yet.'}
              </span>
            </div>
          </Card>

          {draft ? (
            <Card>
              <CardHeader title={existing ? 'Edit zone' : 'Create zone'} />

              <div className="space-y-4">
                <FormError error={error} />

                <Input
                  label="Zone name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />

                <RangeField
                  label="Radius"
                  value={draft.radius}
                  onChange={(radius) => setDraft({ ...draft, radius })}
                  min={20}
                  max={2000}
                  step={10}
                  help="Under 50 m will trigger on GPS drift alone. 150–300 m suits most homes."
                />

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Latitude"
                    value={draft.latitude}
                    inputMode="decimal"
                    onChange={(event) =>
                      setDraft({ ...draft, latitude: Number(event.target.value) })
                    }
                  />
                  <Input
                    label="Longitude"
                    value={draft.longitude}
                    inputMode="decimal"
                    onChange={(event) =>
                      setDraft({ ...draft, longitude: Number(event.target.value) })
                    }
                  />
                </div>

                <p className="help-text">Click anywhere on the map to move the centre.</p>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={save} isLoading={isSaving} disabled={existing && !isDirty}>
                    {existing ? 'Save changes' : 'Create safe zone'}
                  </Button>

                  {existing ? (
                    <Button
                      variant="ghost"
                      className="!text-severity-critical"
                      onClick={() => setIsDeleteOpen(true)}
                      leftIcon={<TrashIcon className="h-4 w-4" />}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<LocationIcon className="h-6 w-6" />}
                title="No starting point"
                message="This patient has no home location and no recorded position yet. Add a home address on their profile, or click the map to place the zone."
                action={
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setDraft({
                        latitude: 51.5074,
                        longitude: -0.1278,
                        radius: 200,
                        name: `${patient?.name?.split(' ')[0] || 'Home'} safe zone`,
                      })
                    }
                  >
                    Place manually
                  </Button>
                }
                className="!py-8"
              />
            </Card>
          )}

          {/* Current patient state, for sanity-checking the zone. */}
          {patient?.liveStatus?.latitude ? (
            <Card>
              <CardHeader title="Current position" as="h3" />
              <dl className="divide-y divide-surface-100 dark:divide-surface-800">
                <DataRow
                  label="Distance from zone centre"
                  value={draft ? formatDistance(haversine(patient.liveStatus, draft)) : '—'}
                />
                <DataRow
                  label="Inside the zone?"
                  value={
                    draft
                      ? haversine(patient.liveStatus, draft) <= draft.radius
                        ? 'Yes'
                        : 'No'
                      : '—'
                  }
                />
                <DataRow label="Latitude" value={formatCoordinate(patient.liveStatus.latitude)} />
                <DataRow label="Longitude" value={formatCoordinate(patient.liveStatus.longitude)} />
              </dl>
            </Card>
          ) : null}
        </div>

        {/* ----------------------------------------------------------- map */}
        <Card padded={false} className="overflow-hidden lg:col-span-2">
          <div className="h-[560px]">
            {draft ? (
              <MapCanvas center={draft} zoom={15}>
                <FitBounds points={[draft]} maxZoom={16} />
                <ClickToPlace
                  onPlace={({ latitude, longitude }) =>
                    setDraft((current) => ({ ...current, latitude, longitude }))
                  }
                />

                {/* The live draft circle. */}
                <Circle
                  center={[draft.latitude, draft.longitude]}
                  radius={draft.radius}
                  pathOptions={{
                    color: '#0d9488',
                    fillColor: '#0d9488',
                    fillOpacity: 0.1,
                    weight: 2,
                  }}
                />

                <HomeMarker location={draft} label={draft.name} />

                {patient?.liveStatus?.latitude ? (
                  <PatientMarker patient={patient} showAccuracy />
                ) : null}
              </MapCanvas>
            ) : (
              <div className="flex h-full items-center justify-center bg-surface-100 dark:bg-surface-800">
                <p className="text-sm text-surface-500 dark:text-surface-400">
                  Select a patient to edit their safe zone.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={remove}
        isPending={isSaving}
        title="Delete this safe zone?"
        confirmLabel="Delete safe zone"
        message={
          `${patient?.name} will no longer be monitored for leaving home — no "left the safe ` +
          'zone" alerts will be raised. Danger zone alerts and SOS will still work.'
        }
      />
    </PageContainer>
  );
}

/**
 * Local haversine, so the preview can show the live distance without a round
 * trip to the server.
 */
function haversine(from, to) {
  if (!from || !to) return 0;
  const R = 6371008.8;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLat = lat2 - lat1;
  const dLng = toRad(to.longitude - from.longitude);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
