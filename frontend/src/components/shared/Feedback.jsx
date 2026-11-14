/**
 * Empty states, error states, skeleton loaders and pagination — the pieces
 * every list view in the dashboard needs.
 */
import Button from './Button';
import { ChevronLeftIcon, ChevronRightIcon, RefreshIcon } from './Icons';

/**
 * Empty state. `action` should offer the obvious next step rather than leaving
 * the user staring at an empty table.
 */
export function EmptyState({ icon = null, title, message = null, action = null, className = '' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}
    >
      {icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-100 text-surface-400 dark:bg-surface-800 dark:text-surface-500">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">{title}</h3>
      {message ? (
        <p className="mt-1.5 max-w-sm text-sm text-surface-500 dark:text-surface-400">{message}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/**
 * Error state with a retry.
 *
 * A network error gets a gentler message than a server error, because on a
 * free Render instance the first request after idle legitimately times out
 * while the service wakes up.
 */
export function ErrorState({ error, onRetry = null, className = '' }) {
  const isNetwork = error?.isNetworkError;

  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-2xl text-severity-critical dark:bg-rose-950/60">
        {isNetwork ? '🌐' : '!'}
      </div>
      <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">
        {isNetwork ? 'Could not reach the server' : 'Something went wrong'}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-surface-500 dark:text-surface-400">
        {error?.message || 'An unexpected error occurred.'}
      </p>
      {onRetry ? (
        <Button
          variant="secondary"
          className="mt-5"
          onClick={onRetry}
          leftIcon={<RefreshIcon className="h-4 w-4" />}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** A single shimmering placeholder block. */
export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Placeholder matching the shape of a stat tile. */
export function SkeletonStatCard() {
  return (
    <div className="card p-5">
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-2 h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

/** Placeholder matching the shape of a patient card. */
export function SkeletonPatientCard() {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex-1">
          <Skeleton className="mb-2 h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

/**
 * Placeholder rows for a table.
 * `aria-hidden` throughout: the loading state is announced by the live region
 * around the table, not by each skeleton cell.
 */
export function SkeletonRows({ rows = 5, columns = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-surface-100 dark:border-surface-800">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <td key={colIndex} className="px-4 py-3.5">
              <Skeleton className={colIndex === 0 ? 'h-4 w-40' : 'h-4 w-20'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Generic list skeleton for the alert feed. */
export function SkeletonList({ rows = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="card flex items-start gap-3 p-4">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Pagination control.
 *
 * Shows a windowed set of page numbers so a 200-page alert history does not
 * render 200 buttons.
 */
export function Pagination({ meta, onPageChange, className = '' }) {
  if (!meta || meta.totalPages <= 1) return null;

  const { page, totalPages, total, limit } = meta;

  // Window of at most five pages centred on the current one.
  const window = 2;
  let start = Math.max(1, page - window);
  const end = Math.min(totalPages, start + window * 2);
  start = Math.max(1, end - window * 2);

  const pages = [];
  for (let index = start; index <= end; index += 1) pages.push(index);

  const firstItem = (page - 1) * limit + 1;
  const lastItem = Math.min(page * limit, total);

  return (
    <nav
      className={`flex flex-col items-center justify-between gap-3 sm:flex-row ${className}`}
      aria-label="Pagination"
    >
      <p className="text-sm text-surface-500 tabular dark:text-surface-400">
        Showing <span className="font-medium">{firstItem}</span>–
        <span className="font-medium">{lastItem}</span> of{' '}
        <span className="font-medium">{total}</span>
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!meta.hasPrevPage}
          aria-label="Previous page"
          className="btn btn-secondary !px-2 !py-2 disabled:opacity-40"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>

        {start > 1 ? (
          <>
            <button
              type="button"
              onClick={() => onPageChange(1)}
              className="btn btn-ghost !px-3 !py-2 tabular"
            >
              1
            </button>
            {start > 2 ? (
              <span className="px-1 text-surface-400" aria-hidden="true">
                …
              </span>
            ) : null}
          </>
        ) : null}

        {pages.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange(pageNumber)}
            aria-current={pageNumber === page ? 'page' : undefined}
            className={`btn !px-3 !py-2 tabular ${
              pageNumber === page ? 'btn-primary' : 'btn-ghost'
            }`}
          >
            {pageNumber}
          </button>
        ))}

        {end < totalPages ? (
          <>
            {end < totalPages - 1 ? (
              <span className="px-1 text-surface-400" aria-hidden="true">
                …
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              className="btn btn-ghost !px-3 !py-2 tabular"
            >
              {totalPages}
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!meta.hasNextPage}
          aria-label="Next page"
          className="btn btn-secondary !px-2 !py-2 disabled:opacity-40"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
