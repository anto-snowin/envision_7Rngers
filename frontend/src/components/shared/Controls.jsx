/**
 * Small interactive controls: search box, theme toggle, filter pills and a
 * copy-to-clipboard button.
 */
import { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  SearchIcon,
  CloseIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  CopyIcon,
  CheckIcon,
} from './Icons';

/**
 * Search input with a clear button.
 *
 * Debouncing is the caller's job (via `useDebounced`) so this stays a
 * controlled input with no hidden latency.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
  label = 'Search',
}) {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-surface-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="input pr-9 pl-9"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-800"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Theme toggle cycling light → dark → system.
 *
 * The icon shows the *current* preference rather than what the next press will
 * do, and the accessible label spells out both.
 */
export function ThemeToggle({ className = '' }) {
  const { preference, cycleTheme } = useTheme();

  const states = {
    light: { icon: <SunIcon className="h-4.5 w-4.5" />, name: 'Light', next: 'dark' },
    dark: { icon: <MoonIcon className="h-4.5 w-4.5" />, name: 'Dark', next: 'system' },
    system: { icon: <MonitorIcon className="h-4.5 w-4.5" />, name: 'System', next: 'light' },
  };

  const current = states[preference] || states.system;

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className={`btn btn-ghost !h-10 !w-10 !px-0 ${className}`}
      aria-label={`Theme: ${current.name}. Switch to ${states[current.next].name.toLowerCase()}.`}
      title={`Theme: ${current.name}`}
    >
      {current.icon}
    </button>
  );
}

/**
 * Segmented filter pills — used for alert status and date ranges, where the
 * options are few and worth showing all at once instead of hiding in a select.
 *
 * @param {Array<{value:string,label:string,count?:number}>} options
 */
export function FilterPills({ options, value, onChange, label = 'Filter', className = '' }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex flex-wrap items-center gap-1 rounded-xl bg-surface-100 p-1 dark:bg-surface-800 ${className}`}
    >
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-surface-0 text-surface-900 shadow-sm dark:bg-surface-950 dark:text-surface-50'
                : 'text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-200'
            }`}
          >
            {option.label}
            {option.count != null ? (
              <span className="ml-1.5 tabular opacity-60">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Copy-to-clipboard button with confirmation.
 *
 * Used for patient tracking links. Falls back to selecting nothing silently if
 * the Clipboard API is unavailable (non-HTTPS origins), so it reports failure
 * rather than pretending to have copied.
 */
export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [state, setState] = useState('idle'); // idle | copied | failed

  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`btn btn-secondary !px-3 !py-1.5 text-xs ${className}`}
      aria-live="polite"
    >
      {state === 'copied' ? (
        <>
          <CheckIcon className="h-3.5 w-3.5" />
          Copied
        </>
      ) : state === 'failed' ? (
        'Copy failed — select manually'
      ) : (
        <>
          <CopyIcon className="h-3.5 w-3.5" />
          {label}
        </>
      )}
    </button>
  );
}

/**
 * Live connection indicator for the dashboard topbar.
 *
 * Says "Live" when the socket is connected and "Reconnecting" when it is not,
 * because a dashboard that has silently stopped updating is dangerous here —
 * the caregiver would read a stale map as "nothing is happening".
 */
export function ConnectionIndicator({ isConnected, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        isConnected
          ? 'bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-400'
          : 'bg-orange-50 text-severity-high dark:bg-orange-950/60 dark:text-severity-high-soft'
      } ${className}`}
      role="status"
    >
      <span className="relative flex h-2 w-2">
        {isConnected ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
        ) : null}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
      </span>
      {isConnected ? 'Live' : 'Reconnecting…'}
    </span>
  );
}
