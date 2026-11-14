/**
 * Card primitives: the standard content container used across the dashboard.
 */

export default function Card({ children, className = '', glass = false, padded = true, ...rest }) {
  return (
    <div
      className={[glass ? 'glass' : 'card', padded ? 'p-5' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Card header with a title, optional subtitle and a right-hand action slot.
 * `as` lets a page keep a sensible heading order (h2 inside an h1 page title).
 */
export function CardHeader({ title, subtitle, action = null, as: Heading = 'h2', className = '' }) {
  return (
    <div className={`mb-4 flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <Heading className="truncate text-base font-semibold text-surface-900 dark:text-surface-50">
          {title}
        </Heading>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-surface-500 dark:text-surface-400">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A divider-separated section inside a card. */
export function CardSection({ children, className = '' }) {
  return (
    <div className={`border-t border-surface-200 pt-4 dark:border-surface-800 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Label/value row, used throughout the patient profile and alert detail views.
 */
export function DataRow({ label, value, className = '' }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${className}`}>
      <dt className="shrink-0 text-sm text-surface-500 dark:text-surface-400">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-surface-900 tabular dark:text-surface-100">
        {value ?? '—'}
      </dd>
    </div>
  );
}
