/**
 * Page header and content wrapper, so every dashboard page shares the same
 * padding, max width and heading rhythm.
 */

/** Consistent page padding. */
export function PageContainer({ children, className = '', wide = false }) {
  return (
    <div className={`mx-auto w-full p-4 sm:p-6 ${wide ? '' : 'max-w-7xl'} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Page title block with an optional description and an actions slot.
 *
 * Renders an `h2`: the topbar already provides the `h1` for the current route,
 * so this keeps the heading order valid.
 */
export default function PageHeader({ title, description = null, actions = null, className = '' }) {
  return (
    <div
      className={`mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-surface-900 sm:text-2xl dark:text-surface-50">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-surface-500 dark:text-surface-400">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Responsive grid for stat tiles. */
export function StatGrid({ children, className = '' }) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 ${className}`}>{children}</div>
  );
}

/** Toolbar row for search and filters, above a list or table. */
export function Toolbar({ children, className = '' }) {
  return (
    <div className={`mb-4 flex flex-col gap-3 sm:flex-row sm:items-center ${className}`}>
      {children}
    </div>
  );
}
