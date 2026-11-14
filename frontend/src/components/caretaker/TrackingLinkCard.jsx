/**
 * The patient's tracking link, with a copy button and a QR-free set of
 * instructions.
 *
 * This is the one piece of the whole system a caregiver must physically act on:
 * the link has to be opened on the patient's phone once. The card explains that
 * in order, and warns that rotating the code breaks the old link.
 */
import { useState } from 'react';
import { patientsApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import Card from '../shared/Card';
import Button from '../shared/Button';
import { CopyButton } from '../shared/Controls';
import { ConfirmDialog } from '../shared/Modal';
import { CloseIcon, RefreshIcon, LocationIcon } from '../shared/Icons';

export default function TrackingLinkCard({
  patient,
  onDismiss = null,
  onRotated = null,
  className = '',
}) {
  const { toast } = useToast();
  const [code, setCode] = useState(patient.trackingCode);
  const [isRotateOpen, setIsRotateOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  // Absolute URL, since this is going to be typed or messaged to another device.
  const link = `${window.location.origin}/track/${code}`;

  const rotate = async () => {
    setIsRotating(true);
    try {
      const { data } = await patientsApi.regenerateCode(patient._id);
      setCode(data.trackingCode);
      onRotated?.(data.trackingCode);
      toast.success('New tracking link created', 'The previous link no longer works.');
      setIsRotateOpen(false);
    } catch (err) {
      toast.error('Could not create a new link', err.message);
    } finally {
      setIsRotating(false);
    }
  };

  return (
    <>
      <Card
        className={`border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-950/40 ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <LocationIcon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
                {patient.name}&apos;s tracking link
              </h3>
              <p className="mt-0.5 text-xs text-surface-600 dark:text-surface-300">
                Open this once on {patient.name}&apos;s phone and leave the page running.
              </p>
            </div>
          </div>

          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="shrink-0 rounded-lg p-1.5 text-surface-400 hover:bg-surface-200/60 dark:hover:bg-surface-800"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {/* The link itself. `break-all` because it has no spaces and would
            otherwise overflow on a narrow screen. */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 rounded-xl bg-surface-0 px-3 py-2.5 text-xs break-all text-surface-800 ring-1 ring-surface-200 dark:bg-surface-900 dark:text-surface-200 dark:ring-surface-700">
            {link}
          </code>
          <div className="flex shrink-0 gap-2">
            <CopyButton text={link} label="Copy link" />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsRotateOpen(true)}
              leftIcon={<RefreshIcon className="h-3.5 w-3.5" />}
            >
              New link
            </Button>
          </div>
        </div>

        <ol className="mt-3 space-y-1 text-xs text-surface-600 dark:text-surface-300">
          <li>1. Send this link to {patient.name}&apos;s phone, or type it into their browser.</li>
          <li>
            2. Tap “Start sharing my location” and choose <strong>Allow</strong>.
          </li>
          <li>3. Leave the page open. Keep the screen on while they are out.</li>
        </ol>

        <p className="mt-2.5 text-[11px] text-surface-500 dark:text-surface-400">
          Anyone with this link can send location data for {patient.name}, so treat it like a
          password. It cannot be used to read any of your other data.
        </p>
      </Card>

      <ConfirmDialog
        isOpen={isRotateOpen}
        onClose={() => setIsRotateOpen(false)}
        onConfirm={rotate}
        isPending={isRotating}
        title="Create a new tracking link?"
        confirmLabel="Create new link"
        variant="primary"
        message={
          `The current link will stop working immediately, and ${patient.name}'s phone will ` +
          'stop sending locations until you open the new link on it. Only do this if the old ' +
          'link may have been seen by someone it should not have been.'
        }
      />
    </>
  );
}
