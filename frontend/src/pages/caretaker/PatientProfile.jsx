/**
 * Patient profile: everything known about one patient in one place.
 */
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { patientsApi, alertsApi } from '../../api';
import { useFetch, useThrottledCallback } from '../../hooks/useApi';
import { useSocketEvent } from '../../context/SocketContext';
import { SOCKET_EVENTS, categoryMeta } from '../../lib/constants';
import PageHeader, { PageContainer, StatGrid } from '../../components/layout/PageHeader';
import Card, { CardHeader, DataRow } from '../../components/shared/Card';
import StatCard from '../../components/shared/StatCard';
import MapCanvas from '../../components/map/MapCanvas';
import {
  PatientMarker,
  SafeZoneCircle,
  DangerZoneCircle,
  HomeMarker,
  FitBounds,
} from '../../components/map/MapPrimitives';
import TrackingLinkCard from '../../components/caretaker/TrackingLinkCard';
import PatientForm from '../../components/caretaker/PatientForm';
import AlertItem from '../../components/caretaker/AlertItem';
import Button from '../../components/shared/Button';
import { StatusDot, ZoneBadge, BatteryBadge } from '../../components/shared/Badge';
import { LoadingState } from '../../components/shared/Spinner';
import { ErrorState, EmptyState } from '../../components/shared/Feedback';
import {
  EditIcon,
  MapIcon,
  HistoryIcon,
  ShieldIcon,
  PhoneIcon,
  RouteIcon,
  ClockIcon,
  HazardIcon,
  BellIcon,
} from '../../components/shared/Icons';
import {
  formatRelativeTime,
  formatDistance,
  formatDuration,
  formatAccuracy,
  formatSpeed,
  formatDate,
  initialsOf,
} from '../../lib/format';

export default function PatientProfile() {
  const { patientId } = useParams();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const profile = useFetch(() => patientsApi.get(patientId), [patientId]);
  const zones = useFetch(() => patientsApi.zones(patientId), [patientId]);

  // Keep the live status fresh while the page is open. Throttled: fixes arrive
  // every five seconds, and the figures here are daily aggregates.
  const refreshProfile = useThrottledCallback(() => profile.refresh(), 12000);

  useSocketEvent(SOCKET_EVENTS.LOCATION_UPDATE, (payload) => {
    if (payload.patientId === patientId) refreshProfile();
  });
  useSocketEvent(SOCKET_EVENTS.PRESENCE_UPDATE, (payload) => {
    if (payload.patientId === patientId) refreshProfile();
  });
  useSocketEvent(SOCKET_EVENTS.ALERT_NEW, (alert) => {
    if (String(alert.patient?._id) === patientId) profile.refresh();
  });

  if (profile.isLoading && !profile.data) return <LoadingState message="Loading patient…" />;

  if (profile.error) {
    return (
      <PageContainer>
        <ErrorState error={profile.error} onRetry={profile.refetch} />
      </PageContainer>
    );
  }

  const { patient, geofence, latestLocation, recentAlerts, todaySummary } = profile.data || {};
  if (!patient) return null;

  const status = patient.liveStatus || {};
  const contact = patient.emergencyContact || {};

  // Frame the map on the patient, their home and their safe zone.
  const mapPoints = [
    Number.isFinite(status.latitude)
      ? { latitude: status.latitude, longitude: status.longitude }
      : null,
    geofence ? { latitude: geofence.latitude, longitude: geofence.longitude } : null,
    Number.isFinite(patient.homeLocation?.latitude) ? patient.homeLocation : null,
  ].filter(Boolean);

  return (
    <PageContainer>
      <PageHeader
        title={patient.name}
        description={
          [
            patient.age ? `${patient.age} years old` : null,
            patient.gender !== 'unspecified' ? patient.gender : null,
            patient.conditionStage !== 'unspecified' ? `${patient.conditionStage} stage` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'No details recorded'
        }
        actions={
          <>
            <Button
              variant="secondary"
              to={`/map?patient=${patient._id}`}
              leftIcon={<MapIcon className="h-4 w-4" />}
            >
              Live map
            </Button>
            <Button
              variant="secondary"
              to={`/history/${patient._id}`}
              leftIcon={<HistoryIcon className="h-4 w-4" />}
            >
              History
            </Button>
            <Button onClick={() => setIsEditOpen(true)} leftIcon={<EditIcon className="h-4 w-4" />}>
              Edit
            </Button>
          </>
        }
      />

      {/* Status strip */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white"
            style={{ backgroundColor: '#0d9488' }}
            aria-hidden="true"
          >
            {initialsOf(patient.name)}
          </span>

          <div className="flex flex-wrap items-center gap-3">
            <StatusDot isOnline={status.isOnline} />
            <ZoneBadge zoneState={status.zoneState} />
            <BatteryBadge level={status.batteryLevel} isCharging={status.isCharging} />
            <span className="text-xs text-surface-500 dark:text-surface-400">
              Last seen {formatRelativeTime(status.lastSeenAt)}
            </span>
          </div>

          {!geofence ? (
            <Link
              to="/safe-zones"
              className="ml-auto flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-medium text-orange-900 hover:brightness-95 dark:bg-orange-950/60 dark:text-orange-200"
            >
              <ShieldIcon className="h-4 w-4" />
              No safe zone set — set one up
            </Link>
          ) : null}
        </div>
      </Card>

      {/* Today */}
      <StatGrid className="mb-5">
        <StatCard
          label="Distance today"
          value={formatDistance(todaySummary?.distanceMetres)}
          hint={todaySummary?.fixCount ? `${todaySummary.fixCount} fixes` : 'No data yet'}
          icon={<RouteIcon className="h-4.5 w-4.5" />}
          tone="brand"
        />
        <StatCard
          label="Time outside zone"
          value={formatDuration(todaySummary?.minutesOutsideSafeZone)}
          icon={<ClockIcon className="h-4.5 w-4.5" />}
          tone={todaySummary?.minutesOutsideSafeZone > 0 ? 'warning' : 'good'}
        />
        <StatCard
          label="Furthest from home"
          value={formatDistance(todaySummary?.maxDistanceFromHome)}
          icon={<HistoryIcon className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Distance from home"
          value={formatDistance(status.distanceFromHome)}
          hint="Right now"
          icon={<ShieldIcon className="h-4.5 w-4.5" />}
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ------------------------------------------------------- left */}
        <div className="space-y-5 lg:col-span-2">
          {/* Map */}
          <Card padded={false} className="overflow-hidden">
            <div className="h-80">
              {mapPoints.length ? (
                <MapCanvas center={mapPoints[0]}>
                  <FitBounds points={mapPoints} />
                  <SafeZoneCircle geofence={geofence} />
                  {(zones.data?.dangerZones || []).map((zone) => (
                    <DangerZoneCircle key={zone._id} zone={zone} />
                  ))}
                  {Number.isFinite(patient.homeLocation?.latitude) ? (
                    <HomeMarker location={patient.homeLocation} label="Home" />
                  ) : null}
                  {Number.isFinite(status.latitude) ? <PatientMarker patient={patient} /> : null}
                </MapCanvas>
              ) : (
                <div className="flex h-full items-center justify-center bg-surface-100 dark:bg-surface-800">
                  <p className="px-6 text-center text-sm text-surface-500 dark:text-surface-400">
                    No location recorded yet. Open the tracking link on their phone to begin.
                  </p>
                </div>
              )}
            </div>
          </Card>

          <TrackingLinkCard patient={patient} onRotated={() => profile.refetch()} />

          {/* Recent alerts */}
          <Card>
            <CardHeader
              title="Recent alerts"
              subtitle="The last ten raised for this patient"
              action={
                <Link
                  to={`/alerts?patient=${patient._id}`}
                  className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-400"
                >
                  View all
                </Link>
              }
            />

            {recentAlerts?.length ? (
              <div className="space-y-3">
                {recentAlerts.map((alert) => (
                  <AlertItem
                    key={alert._id}
                    alert={{ ...alert, patient }}
                    onMarkRead={async (id) => {
                      await alertsApi.markRead(id);
                      profile.refresh();
                    }}
                    onResolve={async (target) => {
                      await alertsApi.resolve(target._id);
                      profile.refresh();
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<BellIcon className="h-6 w-6" />}
                title="No alerts for this patient"
                message="Nothing has needed your attention."
                className="!py-8"
              />
            )}
          </Card>
        </div>

        {/* ------------------------------------------------------ right */}
        <div className="space-y-5">
          {/* Emergency contact — first, because it is what you need in a crisis. */}
          <Card>
            <CardHeader title="Emergency contact" as="h3" />

            {contact.name || contact.phone ? (
              <>
                <p className="font-semibold text-surface-900 dark:text-surface-50">
                  {contact.name || 'Not named'}
                </p>
                {contact.relationship ? (
                  <p className="text-sm text-surface-500 dark:text-surface-400">
                    {contact.relationship}
                  </p>
                ) : null}

                <div className="mt-3 space-y-2">
                  {contact.phone ? (
                    <a href={`tel:${contact.phone}`} className="btn btn-primary w-full">
                      <PhoneIcon className="h-4 w-4" />
                      {contact.phone}
                    </a>
                  ) : null}
                  {contact.altPhone ? (
                    <a href={`tel:${contact.altPhone}`} className="btn btn-secondary w-full">
                      <PhoneIcon className="h-4 w-4" />
                      {contact.altPhone}
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-surface-500 dark:text-surface-400">
                No emergency contact recorded.{' '}
                <button
                  type="button"
                  onClick={() => setIsEditOpen(true)}
                  className="font-semibold text-brand-700 hover:underline dark:text-brand-400"
                >
                  Add one
                </button>
                .
              </p>
            )}
          </Card>

          {/* Live detail */}
          <Card>
            <CardHeader title="Device status" as="h3" />
            <dl className="divide-y divide-surface-100 dark:divide-surface-800">
              <DataRow label="Accuracy" value={formatAccuracy(status.accuracy)} />
              <DataRow label="Speed" value={formatSpeed(status.speed)} />
              <DataRow
                label="Battery"
                value={
                  Number.isFinite(status.batteryLevel)
                    ? `${Math.round(status.batteryLevel)}%${status.isCharging ? ' (charging)' : ''}`
                    : 'Unknown'
                }
              />
              <DataRow label="Last fix" value={formatRelativeTime(status.lastFixAt)} />
              <DataRow label="Recorded fixes" value={latestLocation ? 'Reporting' : 'None yet'} />
            </dl>
          </Card>

          {/* Home + safe zone */}
          <Card>
            <CardHeader title="Home and safe zone" as="h3" />
            <dl className="divide-y divide-surface-100 dark:divide-surface-800">
              <DataRow label="Address" value={patient.homeLocation?.address || 'Not set'} />
              <DataRow
                label="Safe zone"
                value={geofence ? `${geofence.name} · ${geofence.radius} m` : 'Not set'}
              />
              <DataRow label="Danger zones nearby" value={zones.data?.dangerZones?.length ?? 0} />
            </dl>

            <Button variant="secondary" to="/safe-zones" fullWidth className="mt-3">
              <ShieldIcon className="h-4 w-4" />
              Manage safe zone
            </Button>
          </Card>

          {/* Applicable hazards */}
          {zones.data?.dangerZones?.length ? (
            <Card>
              <CardHeader title="Hazards being watched" as="h3" />
              <ul className="space-y-2">
                {zones.data.dangerZones.map((zone) => {
                  const meta = categoryMeta(zone.category);
                  return (
                    <li key={zone._id} className="flex items-start gap-2.5 text-sm">
                      <span aria-hidden="true">{meta.icon}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-surface-800 dark:text-surface-200">
                          {zone.name}
                        </span>
                        <span className="block text-xs text-surface-500 dark:text-surface-400">
                          {meta.label} · {zone.radius} m
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              <Button variant="secondary" to="/danger-zones" fullWidth className="mt-3">
                <HazardIcon className="h-4 w-4" />
                Manage danger zones
              </Button>
            </Card>
          ) : null}

          {/* Medical notes */}
          <Card>
            <CardHeader title="Medical notes" as="h3" />
            {patient.medicalNotes ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-surface-700 dark:text-surface-300">
                {patient.medicalNotes}
              </p>
            ) : (
              <p className="text-sm text-surface-500 dark:text-surface-400">No notes recorded.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Record" as="h3" />
            <dl className="divide-y divide-surface-100 dark:divide-surface-800">
              <DataRow label="Added" value={formatDate(patient.createdAt)} />
              <DataRow label="Tracking code" value={patient.trackingCode} />
            </dl>
          </Card>
        </div>
      </div>

      <PatientForm
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        patient={patient}
        geofence={geofence}
        onSaved={() => {
          profile.refetch();
          zones.refetch();
        }}
      />
    </PageContainer>
  );
}
