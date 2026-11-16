'use client';

import { useCallback, useMemo, useState } from 'react';
import { LiveMap } from '@/components/map/LiveMap';
import Button, { ButtonLink, IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, PanelLoading } from '@/components/ui/Feedback';
import { Field, FormError, Select, Slider, TextArea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { AlertIcon, PencilIcon, PinIcon, PlusIcon, ShieldIcon, TrashIcon, UsersIcon } from '@/components/ui/Icons';
import { useApi } from '@/hooks/useApi';
import { ApiError } from '@/lib/api';
import { DANGER_ZONE_CATEGORIES } from '@/lib/constants';
import { zones as zonesApi, type ZoneInput } from '@/lib/endpoints';
import { formatLatLng, formatMeters } from '@/lib/format';
import type { Zone, ZoneKind } from '@/lib/types';
import { usePatients } from '@/providers/PatientsProvider';
import { useToast } from '@/providers/ToastProvider';

interface Draft {
  id: string | null;
  kind: ZoneKind;
  name: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
  radius: number;
}

/** Minimum radius differs by kind — see the zone validator for why. */
const MIN_RADIUS: Record<ZoneKind, number> = { safe: 20, danger: 10 };

export default function ZonesPage() {
  const { selected, selectedId, patients, isLoading: patientsLoading } = usePatients();
  const toast = useToast();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Zone | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const zones = useApi(
    useCallback(
      (signal: AbortSignal) =>
        selectedId ? zonesApi.forPatient(selectedId, signal) : Promise.resolve(null),
      [selectedId]
    ),
    { enabled: Boolean(selectedId) }
  );

  const live = selected?.liveStatus;

  /**
   * Where a brand-new zone starts.
   *
   * The patient's last known position is the best guess available: a caretaker
   * drawing a home zone is nearly always drawing it around where the patient
   * already is, and starting at an arbitrary map centre would mean panning
   * across a continent first.
   */
  const defaultCentre = useMemo(() => {
    if (live?.latitude !== null && live?.latitude !== undefined && live.longitude !== null) {
      return { latitude: live.latitude, longitude: live.longitude };
    }
    const firstZone = zones.data?.safe[0] ?? zones.data?.danger[0];
    if (firstZone) return { latitude: firstZone.latitude, longitude: firstZone.longitude };
    return null;
  }, [live, zones.data]);

  function startCreate(kind: ZoneKind) {
    setError(null);
    setFields({});
    setDraft({
      id: null,
      kind,
      name: kind === 'safe' ? 'Home' : '',
      description: '',
      category: 'railway',
      latitude: defaultCentre?.latitude ?? 28.6139,
      longitude: defaultCentre?.longitude ?? 77.209,
      radius: kind === 'safe' ? 200 : 100,
    });
  }

  function startEdit(zone: Zone) {
    setError(null);
    setFields({});
    setDraft({
      id: zone.id,
      kind: zone.kind,
      name: zone.name,
      description: zone.description || '',
      category: zone.category || 'other',
      latitude: zone.latitude,
      longitude: zone.longitude,
      radius: zone.radius,
    });
  }

  async function handleSave() {
    if (!draft || !selectedId) return;

    setError(null);
    setFields({});
    setIsSaving(true);

    // The editable fields, shared by create and update. Only create carries a
    // patient id: a zone can never be moved to a different patient.
    const shape = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      latitude: draft.latitude,
      longitude: draft.longitude,
      radius: draft.radius,
      ...(draft.kind === 'danger' ? { category: draft.category } : {}),
    };

    try {
      if (draft.id) {
        await zonesApi.update(draft.kind, draft.id, shape);
        toast.success('Zone updated');
      } else {
        await zonesApi.create(draft.kind, { ...shape, patientId: selectedId } as ZoneInput);
        toast.success(draft.kind === 'safe' ? 'Safe zone created' : 'Danger zone created');
      }
      setDraft(null);
      zones.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields);
      } else {
        setError('Could not save the zone.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await zonesApi.remove(pendingDelete.kind, pendingDelete.id);
      toast.success('Zone deleted');
      setPendingDelete(null);
      zones.refresh();
    } catch (caught) {
      toast.error(
        'Could not delete the zone',
        caught instanceof ApiError ? caught.message : undefined
      );
    } finally {
      setIsDeleting(false);
    }
  }

  if (patientsLoading) return <PanelLoading label="Loading patients…" />;

  if (!patients.length) {
    return (
      <div className="panel">
        <EmptyState
          icon={<UsersIcon className="h-5 w-5" />}
          title="No patients yet"
          body="Zones belong to a patient, so add someone first."
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

  const safeZones = zones.data?.safe ?? [];
  const dangerZones = zones.data?.danger ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Geofencing</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Zones for {selected?.name}</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-400">
            Leaving a safe zone raises an alert. Entering a danger zone raises a high-priority one.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="acid" size="sm" onClick={() => startCreate('safe')}>
            <ShieldIcon className="h-4 w-4" />
            Safe zone
          </Button>
          <Button variant="ghost" size="sm" onClick={() => startCreate('danger')}>
            <AlertIcon className="h-4 w-4" />
            Danger zone
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* -------------------------------------------------------------- map */}
        <div className="panel overflow-hidden lg:col-span-3">
          <div className="h-[24rem] sm:h-[32rem]">
            {zones.isLoading ? (
              <PanelLoading label="Loading zones…" />
            ) : (
              <LiveMap
                position={
                  live?.latitude !== null && live?.latitude !== undefined && live.longitude !== null
                    ? {
                        latitude: live.latitude,
                        longitude: live.longitude,
                        accuracy: live.accuracy,
                        recordedAt: live.recordedAt,
                      }
                    : null
                }
                patientName={selected?.name}
                safeZones={safeZones}
                dangerZones={dangerZones}
                draft={
                  draft
                    ? {
                        latitude: draft.latitude,
                        longitude: draft.longitude,
                        radius: draft.radius,
                        kind: draft.kind,
                      }
                    : null
                }
                onPick={
                  draft
                    ? (point) =>
                        setDraft((current) =>
                          current
                            ? { ...current, latitude: point.latitude, longitude: point.longitude }
                            : current
                        )
                    : undefined
                }
                fitKey={`${selectedId}-${safeZones.length}-${dangerZones.length}-${draft?.id ?? 'none'}`}
              />
            )}
          </div>
          {draft ? (
            <p className="border-t border-ink-100/8 px-5 py-3 text-xs text-acid-500">
              Tap the map to move the centre of this zone.
            </p>
          ) : null}
        </div>

        {/* --------------------------------------------------- editor or list */}
        <aside className="lg:col-span-2">
          {draft ? (
            <div className="panel panel-lit space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold">
                  {draft.id ? 'Edit' : 'New'} {draft.kind === 'safe' ? 'safe' : 'danger'} zone
                </h2>
                <span className={draft.kind === 'safe' ? 'badge badge-acid' : 'badge badge-alarm'}>
                  {draft.kind}
                </span>
              </div>

              <FormError message={error} />

              <Field
                label="Name"
                value={draft.name}
                error={fields.name}
                placeholder={draft.kind === 'safe' ? 'Home' : 'Railway crossing'}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, name: event.target.value } : current))
                }
              />

              {draft.kind === 'danger' ? (
                <Select
                  label="Hazard type"
                  value={draft.category}
                  error={fields.category}
                  options={DANGER_ZONE_CATEGORIES.map((option) => ({ ...option }))}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, category: event.target.value } : current
                    )
                  }
                />
              ) : null}

              <Slider
                label="Radius"
                valueLabel={formatMeters(draft.radius)}
                min={MIN_RADIUS[draft.kind]}
                max={2000}
                step={10}
                value={draft.radius}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, radius: Number(event.target.value) } : current
                  )
                }
              />

              <TextArea
                label="Notes"
                value={draft.description}
                error={fields.description}
                placeholder={
                  draft.kind === 'safe'
                    ? 'Anything the alert should mention.'
                    : 'Why is this area dangerous?'
                }
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, description: event.target.value } : current
                  )
                }
              />

              <div className="panel-flat flex items-center gap-2.5 p-3 text-xs">
                <PinIcon className="h-4 w-4 shrink-0 text-ink-500" />
                <span className="tnum text-ink-300">
                  {formatLatLng(draft.latitude, draft.longitude)}
                </span>
              </div>

              {draft.kind === 'safe' && MIN_RADIUS.safe === 20 ? (
                <p className="text-xs leading-relaxed text-ink-500">
                  A safe zone cannot be smaller than 20 m: consumer GPS drifts by 10–20 m, and a
                  tighter zone would raise exit alerts while the patient sits indoors.
                </p>
              ) : null}

              <div className="flex gap-2 pt-1">
                <Button onClick={handleSave} isLoading={isSaving} className="flex-1">
                  {draft.id ? 'Save changes' : 'Create zone'}
                </Button>
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={isSaving}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <ZoneList
                title="Safe zones"
                emptyBody="Without a safe zone, nothing raises an exit alert."
                zones={safeZones}
                accent="bg-acid-500"
                onEdit={startEdit}
                onDelete={setPendingDelete}
              />
              <ZoneList
                title="Danger zones"
                emptyBody="Add the hazards near home: railway, river, highway, construction."
                zones={dangerZones}
                accent="bg-alarm-500"
                onEdit={startEdit}
                onDelete={setPendingDelete}
              />
              {zones.error ? (
                <div className="panel">
                  <ErrorState message={zones.error} onRetry={zones.refresh} />
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title={`Delete "${pendingDelete?.name}"?`}
        message={
          pendingDelete?.kind === 'safe'
            ? 'Alerts will stop being raised when the patient leaves this area. Past alerts are kept.'
            : 'The patient will no longer be warned about entering this area. Past alerts are kept.'
        }
        confirmLabel="Delete zone"
        isPending={isDeleting}
      />
    </div>
  );
}

function ZoneList({
  title,
  emptyBody,
  zones,
  accent,
  onEdit,
  onDelete,
}: {
  title: string;
  emptyBody: string;
  zones: Zone[];
  accent: string;
  onEdit: (zone: Zone) => void;
  onDelete: (zone: Zone) => void;
}) {
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">{title}</h2>
        <span className="tnum text-xs text-ink-500">{zones.length}</span>
      </div>

      {zones.length ? (
        <ul className="mt-3 space-y-2">
          {zones.map((zone) => (
            <li key={zone.id} className="panel-flat flex items-center gap-3 p-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-100">{zone.name}</p>
                <p className="tnum truncate text-[11px] text-ink-500">
                  {formatMeters(zone.radius)} · {formatLatLng(zone.latitude, zone.longitude)}
                </p>
              </div>
              <IconButton label={`Edit ${zone.name}`} variant="quiet" onClick={() => onEdit(zone)}>
                <PencilIcon className="h-4 w-4" />
              </IconButton>
              <IconButton
                label={`Delete ${zone.name}`}
                variant="quiet"
                onClick={() => onDelete(zone)}
              >
                <TrashIcon className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{emptyBody}</p>
      )}
    </section>
  );
}
