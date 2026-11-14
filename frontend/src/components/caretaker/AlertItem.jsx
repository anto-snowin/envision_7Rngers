/**
 * One alert in the feed.
 *
 * Unread alerts are marked with a filled dot *and* a heavier background, so
 * "needs attention" is not conveyed by colour alone. Severity drives the left
 * border, the badge and the icon tint.
 */
import { Link } from 'react-router-dom';
import { SeverityBadge } from '../shared/Badge';
import { alertTypeMeta, severityMeta } from '../../lib/constants';
import { formatRelativeTime, formatDateTime } from '../../lib/format';
import { CheckIcon, MapIcon } from '../shared/Icons';

export default function AlertItem({ alert, onMarkRead, onResolve, isPending = false }) {
  const typeMeta = alertTypeMeta(alert.type);
  const sevMeta = severityMeta(alert.severity);

  const patientName = alert.patient?.name || 'Unknown patient';
  const patientId = alert.patient?._id || alert.patient;

  const hasLocation =
    Number.isFinite(alert.location?.latitude) && Number.isFinite(alert.location?.longitude);

  return (
    <article
      className={`card border-l-4 p-4 ${sevMeta.border} ${
        alert.isRead ? '' : 'bg-brand-50/40 dark:bg-brand-950/20'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-100 text-base dark:bg-surface-800"
          aria-hidden="true"
        >
          {typeMeta.icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {!alert.isRead ? (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-brand-600 dark:bg-brand-400"
                aria-label="Unread"
              />
            ) : null}

            <h3 className="min-w-0 text-sm font-semibold text-surface-900 dark:text-surface-50">
              {alert.title}
            </h3>

            <SeverityBadge severity={alert.severity} />

            {alert.isResolved ? (
              <span className="badge bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-950/60 dark:text-green-300 dark:ring-green-900">
                <CheckIcon className="h-3 w-3" />
                Resolved
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">
            {alert.message || typeMeta.label}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-500 dark:text-surface-400">
            {patientId ? (
              <Link
                to={`/patients/${patientId}`}
                className="font-medium text-brand-700 hover:underline dark:text-brand-400"
              >
                {patientName}
              </Link>
            ) : (
              <span className="font-medium">{patientName}</span>
            )}

            <time dateTime={alert.createdAt} title={formatDateTime(alert.createdAt)}>
              {formatRelativeTime(alert.createdAt)}
            </time>

            {alert.resolutionNote ? <span className="italic">“{alert.resolutionNote}”</span> : null}
          </div>

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {hasLocation ? (
              <Link
                to={`/map?patient=${patientId}&lat=${alert.location.latitude}&lng=${alert.location.longitude}`}
                className="btn btn-secondary !px-2.5 !py-1.5 text-xs"
              >
                <MapIcon className="h-3.5 w-3.5" />
                Show on map
              </Link>
            ) : null}

            {!alert.isRead ? (
              <button
                type="button"
                onClick={() => onMarkRead(alert._id)}
                disabled={isPending}
                className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
              >
                Mark read
              </button>
            ) : null}

            {!alert.isResolved ? (
              <button
                type="button"
                onClick={() => onResolve(alert)}
                disabled={isPending}
                className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
              >
                <CheckIcon className="h-3.5 w-3.5" />
                Resolve
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
