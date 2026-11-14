/**
 * Patient summary card, used on the dashboard and the patients list.
 *
 * The card leads with the two things that matter at a glance — is the device
 * reporting, and is the patient where they should be — then fills in detail.
 */
import { Link } from 'react-router-dom';
import { StatusDot, ZoneBadge, BatteryBadge } from '../shared/Badge';
import { formatRelativeTime, formatDistance, initialsOf } from '../../lib/format';
import { zoneStateMeta } from '../../lib/constants';
import { MapIcon, HistoryIcon } from '../shared/Icons';

export default function PatientCard({ patient, showActions = true }) {
  const status = patient.liveStatus || {};
  const meta = zoneStateMeta(status.zoneState);

  // A left edge tinted by zone state gives the card a second, non-textual cue
  // that still works when scanning a long list quickly.
  return (
    <div
      className="card relative overflow-hidden p-4 transition-shadow hover:shadow-md"
      style={{ borderLeftWidth: 3, borderLeftColor: meta.marker }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: meta.marker }}
          aria-hidden="true"
        >
          {initialsOf(patient.name)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              to={`/patients/${patient._id}`}
              className="truncate font-semibold text-surface-900 hover:underline dark:text-surface-50"
            >
              {patient.name}
            </Link>
            <StatusDot isOnline={status.isOnline} showLabel={false} />
          </div>

          <p className="mt-0.5 truncate text-xs text-surface-500 dark:text-surface-400">
            {patient.age ? `${patient.age} years` : 'Age not set'}
            {patient.conditionStage && patient.conditionStage !== 'unspecified'
              ? ` · ${patient.conditionStage} stage`
              : ''}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <ZoneBadge zoneState={status.zoneState} />
            <BatteryBadge level={status.batteryLevel} isCharging={status.isCharging} />
          </div>

          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-surface-500 dark:text-surface-400">Last seen</dt>
              <dd className="font-medium tabular text-surface-800 dark:text-surface-200">
                {formatRelativeTime(status.lastSeenAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-surface-500 dark:text-surface-400">Distance from home</dt>
              <dd className="font-medium tabular text-surface-800 dark:text-surface-200">
                {formatDistance(status.distanceFromHome)}
              </dd>
            </div>
          </dl>

          {showActions ? (
            <div className="mt-3 flex gap-2">
              <Link
                to={`/map?patient=${patient._id}`}
                className="btn btn-secondary !px-2.5 !py-1.5 text-xs"
              >
                <MapIcon className="h-3.5 w-3.5" />
                Map
              </Link>
              <Link
                to={`/history/${patient._id}`}
                className="btn btn-secondary !px-2.5 !py-1.5 text-xs"
              >
                <HistoryIcon className="h-3.5 w-3.5" />
                History
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Compact single-line variant, for the live map's patient list. */
export function PatientRow({ patient, isSelected = false, onSelect }) {
  const status = patient.liveStatus || {};
  const meta = zoneStateMeta(status.zoneState);

  return (
    <button
      type="button"
      onClick={() => onSelect(patient)}
      aria-pressed={isSelected}
      className={`flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left transition-colors ${
        isSelected
          ? 'bg-brand-50 dark:bg-brand-950'
          : 'hover:bg-surface-100 dark:hover:bg-surface-800'
      }`}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
        style={{ backgroundColor: meta.marker }}
        aria-hidden="true"
      >
        {initialsOf(patient.name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-surface-900 dark:text-surface-100">
          {patient.name}
        </span>
        <span className="block truncate text-[11px] text-surface-500 dark:text-surface-400">
          {meta.label} · {formatRelativeTime(status.lastSeenAt)}
        </span>
      </span>

      <StatusDot isOnline={status.isOnline} showLabel={false} />
    </button>
  );
}
