/**
 * Display formatting helpers.
 *
 * Every number a caretaker reads passes through here, so units and rounding
 * stay consistent across the dashboard, the map popups and the alert feed.
 */

/**
 * Distance, switching to kilometres once metres stop being useful.
 * @param {number|null|undefined} metres
 */
export function formatDistance(metres) {
  if (metres == null || !Number.isFinite(Number(metres))) return '—';
  const value = Number(metres);

  if (Math.abs(value) < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} km`;
}

/**
 * Duration in minutes, rendered as hours and minutes past 60.
 * @param {number|null} minutes
 */
export function formatDuration(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return '—';
  const total = Math.round(Number(minutes));

  if (total < 1) return 'under a minute';
  if (total < 60) return `${total} min`;

  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!rest) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

/**
 * "Just now", "3 min ago", "2 h ago", then a date.
 *
 * The dashboard leans on this heavily: a caretaker needs to judge at a glance
 * whether "last seen" means seconds or hours ago.
 */
export function formatRelativeTime(input) {
  if (!input) return 'never';

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '—';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  // Clock skew between the phone and the server can produce small negatives.
  if (seconds < 0) return 'just now';
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;

  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Wall-clock time, e.g. "14:32". */
export function formatTime(input) {
  if (!input) return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Time with seconds, for the patient portal's "last updated". */
export function formatTimeWithSeconds(input) {
  if (!input) return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Date only, e.g. "14 Nov 2026". */
export function formatDate(input) {
  if (!input) return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Date and time together, for alert detail views. */
export function formatDateTime(input) {
  if (!input) return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDate(date)}, ${formatTime(date)}`;
}

/** `YYYY-MM-DD`, the value format for `<input type="date">`. */
export function toDateInputValue(input) {
  const date = input ? new Date(input) : new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** GPS accuracy, with a plain-language quality word. */
export function formatAccuracy(metres) {
  if (metres == null || !Number.isFinite(Number(metres))) return '—';
  const value = Math.round(Number(metres));

  let quality = 'poor';
  if (value <= 20) quality = 'excellent';
  else if (value <= 50) quality = 'good';
  else if (value <= 100) quality = 'fair';

  return `±${value} m (${quality})`;
}

/** Speed in m/s rendered as km/h, which people actually think in. */
export function formatSpeed(metresPerSecond) {
  if (metresPerSecond == null || !Number.isFinite(Number(metresPerSecond))) return '—';
  const kmh = Number(metresPerSecond) * 3.6;
  if (kmh < 0.5) return 'stationary';
  return `${kmh.toFixed(1)} km/h`;
}

/** Battery percentage. */
export function formatBattery(level) {
  if (level == null || !Number.isFinite(Number(level))) return 'unknown';
  return `${Math.round(Number(level))}%`;
}

/** Coordinates at ~1 m precision. */
export function formatCoordinate(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(5);
}

/** A patient's initials, for the avatar fallback. */
export function initialsOf(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Pluralise a count: `pluralise(1, 'alert')` → "1 alert". */
export function pluralise(count, singular, plural) {
  const word = count === 1 ? singular : plural || `${singular}s`;
  return `${count} ${word}`;
}
