'use client';

import { useState } from 'react';
import { PresenceDot } from '@/components/caretaker/PresenceDot';
import Button, { IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { Field, FormError, Select, TextArea } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { CheckIcon, PencilIcon, PlusIcon, TrashIcon, UsersIcon } from '@/components/ui/Icons';
import { ApiError } from '@/lib/api';
import { patients as patientsApi, type PatientInput } from '@/lib/endpoints';
import { formatRelative, initialsOf } from '@/lib/format';
import type { Patient } from '@/lib/types';
import { usePatients } from '@/providers/PatientsProvider';
import { useToast } from '@/providers/ToastProvider';

const GENDERS = [
  { value: 'unspecified', label: 'Prefer not to say' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
];

const BLANK: PatientInput = {
  name: '',
  age: null,
  gender: 'unspecified',
  email: '',
  phone: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
  medicalNotes: '',
};

export default function PatientsPage() {
  const { patients, isLoading, error, refresh, select, selectedId } = usePatients();
  const toast = useToast();

  const [editing, setEditing] = useState<{ patient: Patient | null; form: PatientInput } | null>(
    null
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Patient | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * Credentials are shown in their own dialog after a create or a reset,
   * because this is the only moment the password exists in readable form —
   * the server stores a hash and cannot ever show it again.
   */
  const [credentials, setCredentials] = useState<{
    name: string;
    code: string;
    password: string;
  } | null>(null);

  function openCreate() {
    setFormError(null);
    setFields({});
    setEditing({ patient: null, form: { ...BLANK } });
  }

  function openEdit(patient: Patient) {
    setFormError(null);
    setFields({});
    setEditing({
      patient,
      form: {
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        email: patient.email || '',
        phone: patient.phone || '',
        emergencyContactName: patient.emergencyContactName || '',
        emergencyContactPhone: patient.emergencyContactPhone || '',
        emergencyContactRelationship: patient.emergencyContactRelationship || '',
        medicalNotes: patient.medicalNotes || '',
      },
    });
  }

  function setField<K extends keyof PatientInput>(key: K, value: PatientInput[K]) {
    setEditing((current) =>
      current ? { ...current, form: { ...current.form, [key]: value } } : current
    );
  }

  async function handleSave() {
    if (!editing) return;

    setFormError(null);
    setFields({});
    setIsSaving(true);

    const payload: PatientInput = {
      ...editing.form,
      name: editing.form.name.trim(),
      email: editing.form.email?.trim() || undefined,
      phone: editing.form.phone?.trim() || undefined,
    };

    try {
      if (editing.patient) {
        await patientsApi.update(editing.patient.id, payload);
        toast.success('Patient updated');
      } else {
        const created = await patientsApi.create(payload);
        setCredentials({
          name: created.name,
          code: created.patientCode,
          password: created.temporaryPassword || '',
        });
        select(created.id);
      }
      setEditing(null);
      refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFormError(caught.message);
        setFields(caught.fields);
      } else {
        setFormError('Could not save. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResetPassword(patient: Patient) {
    try {
      const updated = await patientsApi.resetPassword(patient.id);
      setCredentials({
        name: updated.name,
        code: updated.patientCode,
        password: updated.temporaryPassword || '',
      });
      toast.info('Device signed out', 'The phone must sign in again with the new password.');
    } catch (caught) {
      toast.error(
        'Could not reset the password',
        caught instanceof ApiError ? caught.message : undefined
      );
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await patientsApi.remove(pendingDelete.id);
      toast.success('Patient removed');
      setPendingDelete(null);
      refresh();
    } catch (caught) {
      toast.error('Could not remove them', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Patients</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Who you are caring for</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-400">
            Adding someone creates the login their phone will use. You can reset it at any time.
          </p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon className="h-4 w-4" />
          Add a patient
        </Button>
      </header>

      {isLoading ? (
        <SkeletonRows rows={3} height="h-28" />
      ) : error ? (
        <div className="panel">
          <ErrorState message={error} onRetry={refresh} />
        </div>
      ) : !patients.length ? (
        <div className="panel">
          <EmptyState
            icon={<UsersIcon className="h-5 w-5" />}
            title="Nobody added yet"
            body="Add the person you care for. You will be given a code and password to enter on their phone."
            action={
              <Button onClick={openCreate}>
                <PlusIcon className="h-4 w-4" />
                Add a patient
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {patients.map((patient) => (
            <li
              key={patient.id}
              className={`panel flex flex-wrap items-center gap-4 p-4 ${
                patient.id === selectedId ? 'border-acid-500/30' : ''
              }`}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-100/8 text-sm font-bold text-ink-200">
                {initialsOf(patient.name)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-bold text-ink-100">{patient.name}</p>
                  <PresenceDot isOnline={patient.liveStatus.isOnline} />
                </div>
                <p className="tnum mt-0.5 text-xs text-ink-500">
                  {patient.patientCode}
                  {patient.age ? ` · ${patient.age} years` : ''}
                  {patient.liveStatus.recordedAt
                    ? ` · last report ${formatRelative(patient.liveStatus.recordedAt)}`
                    : ' · never reported'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {patient.id === selectedId ? (
                  <span className="badge badge-acid">
                    <CheckIcon className="h-3 w-3" />
                    Selected
                  </span>
                ) : (
                  <Button variant="quiet" size="sm" onClick={() => select(patient.id)}>
                    Select
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => void handleResetPassword(patient)}>
                  Reset login
                </Button>
                <IconButton
                  label={`Edit ${patient.name}`}
                  variant="quiet"
                  onClick={() => openEdit(patient)}
                >
                  <PencilIcon className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={`Remove ${patient.name}`}
                  variant="quiet"
                  onClick={() => setPendingDelete(patient)}
                >
                  <TrashIcon className="h-4 w-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ------------------------------------------------------- edit dialog */}
      <Modal
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.patient ? `Edit ${editing.patient.name}` : 'Add a patient'}
        description={
          editing?.patient
            ? undefined
            : 'Only a name is required. A login code and password are generated for you.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={isSaving}>
              {editing?.patient ? 'Save changes' : 'Create patient'}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <FormError message={formError} />

            <Field
              label="Full name"
              value={editing.form.name}
              error={fields.name}
              placeholder="Harold Whitfield"
              onChange={(event) => setField('name', event.target.value)}
              required
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Age"
                type="number"
                min={0}
                max={130}
                value={editing.form.age ?? ''}
                error={fields.age}
                onChange={(event) =>
                  setField('age', event.target.value === '' ? null : Number(event.target.value))
                }
              />
              <Select
                label="Gender"
                value={editing.form.gender ?? 'unspecified'}
                options={GENDERS}
                onChange={(event) => setField('gender', event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Email"
                type="email"
                value={editing.form.email ?? ''}
                error={fields.email}
                hint="Optional alternative login"
                onChange={(event) => setField('email', event.target.value)}
              />
              <Field
                label="Phone"
                value={editing.form.phone ?? ''}
                error={fields.phone}
                hint="Optional alternative login"
                onChange={(event) => setField('phone', event.target.value)}
              />
            </div>

            <div className="hairline pt-4">
              <p className="label">Emergency contact</p>
              <div className="mt-1 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Name"
                  value={editing.form.emergencyContactName ?? ''}
                  onChange={(event) => setField('emergencyContactName', event.target.value)}
                />
                <Field
                  label="Phone"
                  value={editing.form.emergencyContactPhone ?? ''}
                  onChange={(event) => setField('emergencyContactPhone', event.target.value)}
                />
              </div>
              <Field
                label="Relationship"
                className="mt-4"
                placeholder="Daughter, son, neighbour…"
                value={editing.form.emergencyContactRelationship ?? ''}
                onChange={(event) => setField('emergencyContactRelationship', event.target.value)}
              />
            </div>

            <TextArea
              label="Medical notes"
              value={editing.form.medicalNotes ?? ''}
              placeholder="Anything a responder should know."
              onChange={(event) => setField('medicalNotes', event.target.value)}
            />
          </div>
        ) : null}
      </Modal>

      {/* ------------------------------------------------- credentials dialog */}
      <Modal
        isOpen={Boolean(credentials)}
        onClose={() => setCredentials(null)}
        title="Device login details"
        description="Write these down now. The password cannot be shown again."
        size="sm"
        footer={<Button onClick={() => setCredentials(null)}>Done</Button>}
      >
        {credentials ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-300">
              On {credentials.name}&apos;s phone, open this site, choose{' '}
              <strong className="text-ink-100">Patient device</strong>, and enter:
            </p>

            <dl className="space-y-3">
              <div className="panel-flat p-4">
                <dt className="label">Code</dt>
                <dd className="tnum mt-1 text-xl font-bold text-acid-500">{credentials.code}</dd>
              </div>
              <div className="panel-flat p-4">
                <dt className="label">Password</dt>
                <dd className="tnum mt-1 text-xl font-bold text-acid-500">
                  {credentials.password}
                </dd>
              </div>
            </dl>

            <p className="text-xs leading-relaxed text-ink-500">
              Only the hash of this password is stored, so nobody — including you — can read it
              back later. If it is lost, use &ldquo;Reset login&rdquo; to generate a new one.
            </p>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title={`Remove ${pendingDelete?.name}?`}
        message="Their location history, alerts and zones are deleted permanently, and their device login stops working. This cannot be undone."
        confirmLabel="Remove permanently"
        isPending={isDeleting}
      />
    </div>
  );
}
