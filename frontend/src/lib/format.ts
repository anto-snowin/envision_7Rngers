/** Display formatters. All of them tolerate null, because telemetry often is. */

const DASH = '—';

export function formatCoord(value: number | null | undefined, digits = 5): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DASH;
  return value.toFixed(digits);
}

export function formatLatLng(
  lat: number | null | undefined,
  lng: number | null | undefined
): string {
  if (typeof lat !== 'number' || typeof lng !== 'number') return DASH;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function formatMeters(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DASH;
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} km`;
}

export function formatAccuracy(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DASH;
  return `±${Math.round(value)} m`;
}

export function formatBattery(
  level: number | null | undefined,
  isCharging?: boolean | null
): string {
  if (typeof level !== 'number' || !Number.isFinite(level)) return DASH;
  return `${Math.round(level)}%${isCharging ? ' ⚡' : ''}`;
}

export function formatTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return DASH;
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return DASH;
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return DASH;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * "2 min ago" style relative time.
 *
 * The caretaker's core question is "how stale is this?", which a relative
 * string answers faster than a clock time does.
 */
export function formatRelative(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return 'never';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 45) return 'just now';
  if (seconds < 90) return '1 min ago';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 7200) return '1 hour ago';
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours ago`;
  if (seconds < 172800) return 'yesterday';
  return `${Math.round(seconds / 86400)} days ago`;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return '0 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** `YYYY-MM-DD` for date inputs, in the viewer's own timezone. */
export function toDateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '··';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
