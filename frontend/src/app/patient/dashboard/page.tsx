'use client';

import { useState } from 'react';
import { SosButton } from '@/components/patient/SosButton';
import { StatusTile } from '@/components/patient/StatusTile';
import Button from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/Feedback';
import { LogoutIcon, RadarIcon } from '@/components/ui/Icons';
import { useClockTick } from '@/hooks/useApi';
import { useTracking } from '@/hooks/useTracking';
import { LOCATION_INTERVAL_LABEL } from '@/lib/constants';
import { formatAccuracy, formatBattery, formatLatLng, formatRelative } from '@/lib/format';
import { useAuth, useRequireRole } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';

/**
 * The patient's whole app: one screen.
 *
 * Everything on it answers a question the patient or their carer might ask out
 * loud — am I being tracked, does the phone know where I am, is there internet,
 * when did it last report, and how do I get help. No navigation, no settings,
 * nothing to configure or accidentally switch off.
 */
export default function PatientDashboardPage() {
  const { isAllowed, isRestoring, session } = useRequireRole('patient');
  const { logout } = useAuth();
  const toast = useToast();

  const [isSigningOut, setIsSigningOut] = useState(false);

  // Keeps the "last reported" line honest as time passes.
  useClockTick(15_000);

  const tracking = useTracking({ enabled: isAllowed });

  if (isRestoring || !isAllowed) return <PageLoading label="Checking your sign-in…" />;

  const patient = session?.patient;

  const gpsOk = tracking.phase === 'tracking';
  const gpsSearching = tracking.phase === 'acquiring' || tracking.phase === 'starting';

  /** The headline banner, which is the only thing most viewers will read. */
  const banner = (() => {
    if (tracking.dangerZone) {
      return {
        tone: 'bad' as const,
        title: 'You are in an unsafe area',
        body: `${tracking.dangerZone}. Please move away and call your carer.`,
      };
    }
    if (tracking.phase === 'gps-denied') {
      return {
        tone: 'bad' as const,
        title: 'Location is switched off',
        body: 'Your carer cannot see where you are. Allow location for this site in your browser settings.',
      };
    }
    if (tracking.phase === 'unsupported') {
      return {
        tone: 'bad' as const,
        title: 'This browser cannot share location',
        body: 'Please open this page in Chrome or Safari on the phone.',
      };
    }
    if (tracking.phase === 'gps-unavailable') {
      return {
        tone: 'warn' as const,
        title: 'Looking for a GPS signal',
        body: 'Try standing near a window or stepping outside.',
      };
    }
    if (tracking.queuedCount > 0) {
      return {
        tone: 'warn' as const,
        title: 'No internet right now',
        body: `Your location is being saved on this phone (${tracking.queuedCount} waiting) and will be sent when you are back online.`,
      };
    }
    if (tracking.insideSafeZone === false) {
      return {
        tone: 'warn' as const,
        title: 'You have left your safe area',
        body: 'Your carer has been told. You are still being tracked.',
      };
    }
    if (tracking.insideSafeZone === true) {
      return {
        tone: 'good' as const,
        title: 'You are in your safe area',
        body: `Your carer can see you. Keep this page open.`,
      };
    }
    return {
      tone: 'good' as const,
      title: gpsSearching ? 'Getting your location' : 'Sharing your location',
      body: `Your phone reports where you are every ${LOCATION_INTERVAL_LABEL}. Keep this page open.`,
    };
  })();

  const BANNER_STYLES = {
    good: 'border-acid-500/35 bg-acid-500/8',
    warn: 'border-caution-500/40 bg-caution-500/8',
    bad: 'border-alarm-500/50 bg-alarm-500/10',
  };

  async function handleSignOut() {
    setIsSigningOut(true);
    tracking.stopTracking();
    try {
      await logout();
    } catch {
      toast.error('Could not sign out', 'Please check your connection and try again.');
      setIsSigningOut(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pt-6 pb-12">
      {/* --------------------------------------------------------- header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-acid-500 text-ink-950">
            <RadarIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-100">{patient?.name}</p>
            <p className="tnum truncate text-xs text-ink-500">{patient?.patientCode}</p>
          </div>
        </div>

        <Button
          variant="quiet"
          size="sm"
          onClick={handleSignOut}
          isLoading={isSigningOut}
          aria-label="Sign out and stop sharing your location"
        >
          <LogoutIcon className="h-4 w-4" />
          Sign out
        </Button>
      </header>

      {/* --------------------------------------------------------- banner */}
      <section
        className={`mt-6 rounded-3xl border p-6 ${BANNER_STYLES[banner.tone]}`}
        aria-live="polite"
      >
        <h1 className="text-2xl font-black">{banner.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">{banner.body}</p>
      </section>

      {/* ------------------------------------------------------------ SOS */}
      <section className="mt-9 flex flex-col items-center">
        <SosButton
          onTrigger={async () => {
            const ok = await tracking.sendSos();
            if (ok) toast.success('Help is on the way', 'Your carer has been alerted.');
            else toast.error('Could not send the SOS', 'Check your connection and try again.');
            return ok;
          }}
        />
      </section>

      {/* -------------------------------------------------------- status */}
      <section className="mt-9 space-y-2.5">
        <h2 className="label">Device status</h2>

        <StatusTile
          label="Tracking"
          value={gpsOk ? 'On' : gpsSearching ? 'Starting' : 'Paused'}
          tone={gpsOk ? 'good' : gpsSearching ? 'warn' : 'bad'}
          detail={
            tracking.fixesSent
              ? `${tracking.fixesSent} update${tracking.fixesSent === 1 ? '' : 's'} sent`
              : 'No updates sent yet'
          }
        />

        <StatusTile
          label="GPS"
          value={
            tracking.phase === 'gps-denied'
              ? 'Not allowed'
              : tracking.lastFix
                ? 'Found'
                : 'Searching'
          }
          tone={tracking.phase === 'gps-denied' ? 'bad' : tracking.lastFix ? 'good' : 'warn'}
          detail={
            tracking.lastFix
              ? `${formatLatLng(tracking.lastFix.latitude, tracking.lastFix.longitude)} · ${formatAccuracy(tracking.lastFix.accuracy)}`
              : tracking.gpsMessage
          }
        />

        <StatusTile
          label="Internet"
          value={tracking.queuedCount > 0 ? 'Saving locally' : tracking.isOnline ? 'Connected' : 'Offline'}
          tone={tracking.queuedCount > 0 ? 'warn' : tracking.isOnline ? 'good' : 'bad'}
          detail={
            tracking.queuedCount > 0
              ? `${tracking.queuedCount} location${tracking.queuedCount === 1 ? '' : 's'} waiting to send`
              : null
          }
        />

        <StatusTile
          label="Last reported"
          value={tracking.lastUploadAt ? formatRelative(tracking.lastUploadAt) : 'Not yet'}
          tone={tracking.lastUploadAt ? 'good' : 'warn'}
          detail={tracking.isUploading ? 'Sending now…' : `Every ${LOCATION_INTERVAL_LABEL}`}
        />

        <StatusTile
          label="Battery"
          value={
            tracking.batteryUnsupported
              ? 'Not available'
              : formatBattery(tracking.batteryLevel, tracking.isCharging)
          }
          tone={
            tracking.batteryUnsupported
              ? 'mute'
              : (tracking.batteryLevel ?? 100) <= 20 && !tracking.isCharging
                ? 'bad'
                : 'good'
          }
          detail={
            tracking.batteryUnsupported
              ? 'This browser does not report battery level'
              : tracking.isCharging
                ? 'Charging'
                : null
          }
        />
      </section>

      {/* -------------------------------------------------------- carer */}
      {patient?.caretakerName ? (
        <section className="panel mt-8 p-5">
          <p className="label">Your carer</p>
          <p className="mt-1 text-lg font-bold">{patient.caretakerName}</p>
          {patient.caretakerPhone ? (
            <a
              href={`tel:${patient.caretakerPhone}`}
              className="btn btn-ghost mt-4 w-full"
              aria-label={`Call ${patient.caretakerName}`}
            >
              Call {patient.caretakerPhone}
            </a>
          ) : null}
        </section>
      ) : null}

      <p className="mt-8 text-center text-xs leading-relaxed text-ink-600">
        {tracking.wakeLockHeld
          ? 'This phone will stay awake while the page is open.'
          : 'Keep this page open and the screen on so your location keeps updating.'}
      </p>
    </main>
  );
}
