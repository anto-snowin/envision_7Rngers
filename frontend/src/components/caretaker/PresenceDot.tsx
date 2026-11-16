'use client';

/**
 * Online indicator.
 *
 * Carries a `title` and visually-hidden text as well as the colour, so the
 * state is available to a screen reader and to anyone who cannot tell the two
 * dots apart.
 */
export function PresenceDot({ isOnline, size = 'sm' }: { isOnline: boolean; size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2';

  return (
    <span className="relative inline-flex shrink-0 items-center" title={isOnline ? 'Online' : 'Offline'}>
      {isOnline ? (
        <span
          aria-hidden="true"
          className={`absolute ${box} rounded-full bg-safe-500/50 animate-pulse-ring`}
        />
      ) : null}
      <span
        aria-hidden="true"
        className={`${box} rounded-full ${isOnline ? 'bg-safe-500' : 'bg-ink-600'}`}
      />
      <span className="sr-only">{isOnline ? 'Online' : 'Offline'}</span>
    </span>
  );
}
