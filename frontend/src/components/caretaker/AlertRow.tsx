'use client';

import Button from '@/components/ui/Button';
import { AlertIcon, BatteryIcon, CheckIcon, PinIcon, ShieldIcon, SosIcon, WifiOffIcon } from '@/components/ui/Icons';
import { ALERT_LABELS, ALERT_TYPES } from '@/lib/constants';
import { formatDateTime, formatMeters, formatRelative } from '@/lib/format';
import type { Alert, AlertSeverity } from '@/lib/types';

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  critical: 'badge badge-alarm',
  high: 'badge badge-alarm',
  medium: 'badge badge-caution',
  low: 'badge badge-mute',
  info: 'badge badge-mute',
};

const ICON_FOR: Record<string, React.ComponentType<{ className?: string }>> = {
  [ALERT_TYPES.SOS]: SosIcon,
  [ALERT_TYPES.SAFE_ZONE_EXIT]: ShieldIcon,
  [ALERT_TYPES.SAFE_ZONE_RETURN]: ShieldIcon,
  [ALERT_TYPES.DANGER_ZONE_ENTRY]: AlertIcon,
  [ALERT_TYPES.DANGER_ZONE_EXIT]: CheckIcon,
  [ALERT_TYPES.LOW_BATTERY]: BatteryIcon,
  [ALERT_TYPES.GPS_UNAVAILABLE]: PinIcon,
  [ALERT_TYPES.INTERNET_DISCONNECTED]: WifiOffIcon,
  [ALERT_TYPES.INTERNET_RESTORED]: WifiOffIcon,
  [ALERT_TYPES.PATIENT_OFFLINE]: WifiOffIcon,
};

export function AlertRow({
  alert,
  onMarkRead,
  onResolve,
  isBusy = false,
  showPatient = true,
}: {
  alert: Alert;
  onMarkRead?: (alert: Alert) => void;
  onResolve?: (alert: Alert) => void;
  isBusy?: boolean;
  showPatient?: boolean;
}) {
  const Icon = ICON_FOR[alert.type] || AlertIcon;
  const isUrgent = alert.severity === 'critical' || alert.severity === 'high';

  return (
    <article
      className={`panel-flat flex gap-3.5 p-4 transition-colors
        ${alert.isRead ? '' : 'border-l-2 border-l-acid-500'}
        ${alert.severity === 'critical' && !alert.isResolved ? 'border-alarm-500/35' : ''}`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl
          ${isUrgent ? 'bg-alarm-500/14 text-alarm-400' : 'bg-ink-100/6 text-ink-400'}`}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-ink-100">
            {ALERT_LABELS[alert.type] || alert.title}
          </h3>
          <span className={SEVERITY_BADGE[alert.severity]}>{alert.severity}</span>
          {alert.isResolved ? <span className="badge badge-safe">resolved</span> : null}
        </div>

        {showPatient && alert.patientName ? (
          <p className="mt-0.5 text-xs font-medium text-acid-500">{alert.patientName}</p>
        ) : null}

        <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{alert.message}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-600">
          <time dateTime={alert.createdAt} title={formatDateTime(alert.createdAt)}>
            {formatRelative(alert.createdAt)}
          </time>
          {alert.zoneName ? <span>· {alert.zoneName}</span> : null}
          {Number.isFinite(alert.distance) ? (
            <span>· {formatMeters(alert.distance)} beyond the edge</span>
          ) : null}
        </div>

        {onMarkRead || onResolve ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {!alert.isRead && onMarkRead ? (
              <Button variant="ghost" size="sm" onClick={() => onMarkRead(alert)} disabled={isBusy}>
                Mark read
              </Button>
            ) : null}
            {!alert.isResolved && onResolve ? (
              <Button variant="ghost" size="sm" onClick={() => onResolve(alert)} disabled={isBusy}>
                <CheckIcon className="h-3.5 w-3.5" />
                Resolve
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
