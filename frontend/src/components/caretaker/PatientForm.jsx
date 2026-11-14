/**
 * Create / edit patient form, shown inside a modal.
 *
 * The home location and safe-zone radius are part of this form rather than a
 * separate step: a patient without a safe zone generates no geofence alerts at
 * all, which is the whole point of the system, so it should not be easy to skip.
 */
import { useEffect, useState } from 'react';
import { patientsApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { Input, Select, Textarea, RangeField, FormError } from '../shared/Form';
import { LocationIcon } from '../shared/Icons';

const GENDER_OPTIONS = [
  { value: 'unspecified', label: 'Prefer not to say' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
];

const STAGE_OPTIONS = [
  { value: 'unspecified', label: 'Not specified' },
  { value: 'early', label: 'Early stage' },
  { value: 'moderate', label: 'Moderate stage' },
  { value: 'advanced', label: 'Advanced stage' },
];

/** Blank form state. */
const EMPTY = {
  name: '',
  age: '',
  gender: 'unspecified',
  conditionStage: 'unspecified',
  medicalNotes: '',
  emergencyName: '',
  emergencyRelationship: '',
  emergencyPhone: '',
  emergencyAltPhone: '',
  homeAddress: '',
  homeLatitude: '',
  homeLongitude: '',
  safeZoneRadius: 200,
};

/** Map an existing patient record into form fields. */
function toFormState(patient) {
  if (!patient) return EMPTY;

  return {
    name: patient.name || '',
    age: patient.age ?? '',
    gender: patient.gender || 'unspecified',
    conditionStage: patient.conditionStage || 'unspecified',
    medicalNotes: patient.medicalNotes || '',
    emergencyName: patient.emergencyContact?.name || '',
    emergencyRelationship: patient.emergencyContact?.relationship || '',
    emergencyPhone: patient.emergencyContact?.phone || '',
    emergencyAltPhone: patient.emergencyContact?.altPhone || '',
    homeAddress: patient.homeLocation?.address || '',
    homeLatitude: patient.homeLocation?.latitude ?? '',
    homeLongitude: patient.homeLocation?.longitude ?? '',
    safeZoneRadius: 200,
  };
}

export default function PatientForm({ isOpen, onClose, onSaved, patient = null, geofence = null }) {
  const { toast } = useToast();
  const isEditing = Boolean(patient);

  const [form, setForm] = useState(() => toFormState(patient));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Reload the form whenever a different patient is opened.
  useEffect(() => {
    if (!isOpen) return;
    setForm({
      ...toFormState(patient),
      safeZoneRadius: geofence?.radius || 200,
    });
    setFieldErrors({});
    setFormError(null);
  }, [isOpen, patient, geofence]);

  const update = (field) => (event) => {
    const value = event?.target ? event.target.value : event;
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  /**
   * Fill the home coordinates from the caregiver's own device.
   *
   * Convenient when setting a patient up while standing in their house, which
   * is the common case.
   */
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setFormError('This browser cannot read your location.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({
          ...current,
          homeLatitude: position.coords.latitude.toFixed(6),
          homeLongitude: position.coords.longitude.toFixed(6),
        }));
        setIsLocating(false);
      },
      () => {
        setFormError('Could not read your location. Enter the coordinates manually.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = {};
    if (form.name.trim().length < 2) errors.name = "Enter the patient's name";
    if (form.age !== '' && (Number(form.age) < 0 || Number(form.age) > 130)) {
      errors.age = 'Enter a realistic age';
    }

    const hasLat = form.homeLatitude !== '';
    const hasLng = form.homeLongitude !== '';
    if (hasLat !== hasLng) {
      errors.homeLatitude = 'Enter both latitude and longitude, or neither';
    }
    if (hasLat && Math.abs(Number(form.homeLatitude)) > 90) {
      errors.homeLatitude = 'Latitude must be between -90 and 90';
    }
    if (hasLng && Math.abs(Number(form.homeLongitude)) > 180) {
      errors.homeLongitude = 'Longitude must be between -180 and 180';
    }

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const payload = {
      name: form.name.trim(),
      age: form.age === '' ? null : Number(form.age),
      gender: form.gender,
      conditionStage: form.conditionStage,
      medicalNotes: form.medicalNotes.trim(),
      emergencyContact: {
        name: form.emergencyName.trim(),
        relationship: form.emergencyRelationship.trim(),
        phone: form.emergencyPhone.trim(),
        altPhone: form.emergencyAltPhone.trim(),
      },
      homeLocation: {
        label: 'Home',
        address: form.homeAddress.trim(),
        latitude: hasLat ? Number(form.homeLatitude) : null,
        longitude: hasLng ? Number(form.homeLongitude) : null,
      },
    };

    // Only send the radius when there are coordinates for it to centre on.
    if (hasLat && hasLng) payload.safeZoneRadius = Number(form.safeZoneRadius);

    try {
      const response = isEditing
        ? await patientsApi.update(patient._id, payload)
        : await patientsApi.create(payload);

      toast.success(
        isEditing ? 'Patient updated' : 'Patient added',
        isEditing ? undefined : 'Open their tracking link on their phone to begin.'
      );

      onSaved?.(response.data);
      onClose();
    } catch (err) {
      if (err.fields) setFieldErrors(err.fields);
      else setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit ${patient.name}` : 'Add a patient'}
      description={
        isEditing
          ? 'Update the details and home location for this patient.'
          : 'Only a name is required — you can add the rest later.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="patient-form" isLoading={isSubmitting}>
            {isEditing ? 'Save changes' : 'Add patient'}
          </Button>
        </>
      }
    >
      <form id="patient-form" onSubmit={handleSubmit} className="space-y-6" noValidate>
        <FormError error={formError} />

        {/* ------------------------------------------------------- identity */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-surface-900 dark:text-surface-100">
            About the patient
          </legend>

          <Input
            label="Full name"
            value={form.name}
            onChange={update('name')}
            error={fieldErrors.name}
            required
            placeholder="Harold Smith"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Age"
              type="number"
              min="0"
              max="130"
              value={form.age}
              onChange={update('age')}
              error={fieldErrors.age}
              placeholder="78"
            />
            <Select
              label="Gender"
              value={form.gender}
              onChange={update('gender')}
              options={GENDER_OPTIONS}
            />
            <Select
              label="Condition stage"
              value={form.conditionStage}
              onChange={update('conditionStage')}
              options={STAGE_OPTIONS}
            />
          </div>

          <Textarea
            label="Medical notes"
            value={form.medicalNotes}
            onChange={update('medicalNotes')}
            error={fieldErrors.medicalNotes}
            rows={3}
            placeholder="Medication, mobility, known wandering patterns, how best to approach them…"
            help="Visible only to you. Never shown on the patient's phone."
          />
        </fieldset>

        {/* ----------------------------------------------- emergency contact */}
        <fieldset className="space-y-4 border-t border-surface-200 pt-5 dark:border-surface-800">
          <legend className="text-sm font-semibold text-surface-900 dark:text-surface-100">
            Emergency contact
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              value={form.emergencyName}
              onChange={update('emergencyName')}
              placeholder="Jane Smith"
            />
            <Input
              label="Relationship"
              value={form.emergencyRelationship}
              onChange={update('emergencyRelationship')}
              placeholder="Daughter"
            />
            <Input
              label="Phone"
              type="tel"
              value={form.emergencyPhone}
              onChange={update('emergencyPhone')}
              placeholder="+44 7700 900111"
            />
            <Input
              label="Alternative phone"
              type="tel"
              value={form.emergencyAltPhone}
              onChange={update('emergencyAltPhone')}
              placeholder="Optional"
            />
          </div>
        </fieldset>

        {/* --------------------------------------------- home and safe zone */}
        <fieldset className="space-y-4 border-t border-surface-200 pt-5 dark:border-surface-800">
          <legend className="text-sm font-semibold text-surface-900 dark:text-surface-100">
            Home and safe zone
          </legend>

          <Input
            label="Home address"
            value={form.homeAddress}
            onChange={update('homeAddress')}
            placeholder="12 Rosewood Avenue, London"
          />

          <div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Latitude"
                value={form.homeLatitude}
                onChange={update('homeLatitude')}
                error={fieldErrors.homeLatitude}
                placeholder="51.507400"
                inputMode="decimal"
              />
              <Input
                label="Longitude"
                value={form.homeLongitude}
                onChange={update('homeLongitude')}
                error={fieldErrors.homeLongitude}
                placeholder="-0.127800"
                inputMode="decimal"
              />
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2.5"
              onClick={useMyLocation}
              isLoading={isLocating}
              leftIcon={<LocationIcon className="h-3.5 w-3.5" />}
            >
              Use my current location
            </Button>
            <p className="help-text">
              Handy if you are at the patient&apos;s home right now. You can also fine-tune the zone
              on the Safe zones page afterwards.
            </p>
          </div>

          {form.homeLatitude !== '' && form.homeLongitude !== '' ? (
            <RangeField
              label="Safe zone radius"
              value={Number(form.safeZoneRadius)}
              onChange={update('safeZoneRadius')}
              min={20}
              max={2000}
              step={10}
              help="An alert is raised when the patient crosses this distance from home. 150–300 m suits most homes; anything under 50 m will trigger on GPS drift alone."
            />
          ) : null}
        </fieldset>
      </form>
    </Modal>
  );
}
