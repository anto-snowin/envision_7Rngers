/**
 * Form controls with built-in validation display.
 *
 * Each control wires `aria-invalid` and `aria-describedby` to its error and
 * help text, so a screen-reader user hears why a field was rejected instead of
 * only seeing a red border.
 */
import { useId } from 'react';

/**
 * Wrapper that renders the label, the control, and any help/error text.
 */
export function Field({ label, error, help, required = false, children, className = '', htmlFor }) {
  return (
    <div className={className}>
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required ? (
            <span className="ml-0.5 text-severity-critical" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      {children}

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : help ? (
        <p className="help-text">{help}</p>
      ) : null}
    </div>
  );
}

/** Single-line text input. */
export function Input({
  label,
  error,
  help,
  required,
  className = '',
  inputClassName = '',
  leftIcon = null,
  id: providedId,
  ...rest
}) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const describedBy = error || help ? `${id}-description` : undefined;

  return (
    <Field
      label={label}
      error={error}
      help={help}
      required={required}
      className={className}
      htmlFor={id}
    >
      <div className="relative">
        {leftIcon ? (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-surface-400">
            {leftIcon}
          </span>
        ) : null}
        <input
          id={id}
          className={[
            'input',
            leftIcon ? 'pl-10' : '',
            error ? 'input-error' : '',
            inputClassName,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          required={required}
          {...rest}
        />
      </div>
      {/* Hidden node that `aria-describedby` points at, so the message is
          announced even though it is rendered by <Field> above. */}
      {describedBy ? (
        <span id={describedBy} className="sr-only">
          {error || help}
        </span>
      ) : null}
    </Field>
  );
}

/** Multi-line text input. */
export function Textarea({
  label,
  error,
  help,
  required,
  rows = 4,
  className = '',
  id: providedId,
  ...rest
}) {
  const generatedId = useId();
  const id = providedId || generatedId;

  return (
    <Field
      label={label}
      error={error}
      help={help}
      required={required}
      className={className}
      htmlFor={id}
    >
      <textarea
        id={id}
        rows={rows}
        className={['input resize-y', error ? 'input-error' : ''].filter(Boolean).join(' ')}
        aria-invalid={error ? 'true' : undefined}
        required={required}
        {...rest}
      />
    </Field>
  );
}

/**
 * Select dropdown.
 * @param {Array<{value:string,label:string}>} options
 */
export function Select({
  label,
  error,
  help,
  required,
  options = [],
  placeholder = null,
  className = '',
  id: providedId,
  ...rest
}) {
  const generatedId = useId();
  const id = providedId || generatedId;

  return (
    <Field
      label={label}
      error={error}
      help={help}
      required={required}
      className={className}
      htmlFor={id}
    >
      <select
        id={id}
        className={['input cursor-pointer pr-9', error ? 'input-error' : '']
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? 'true' : undefined}
        required={required}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Checkbox with an inline label. */
export function Checkbox({ label, description, className = '', id: providedId, ...rest }) {
  const generatedId = useId();
  const id = providedId || generatedId;

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4.5 w-4.5 shrink-0 cursor-pointer rounded border-surface-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30 dark:border-surface-600 dark:bg-surface-900"
        {...rest}
      />
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="cursor-pointer text-sm font-medium text-surface-800 dark:text-surface-200"
        >
          {label}
        </label>
        {description ? (
          <p className="text-xs text-surface-500 dark:text-surface-400">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Range slider showing its current value — used for picking a zone radius,
 * where a number box alone makes it hard to judge what 250 m means.
 */
export function RangeField({
  label,
  value,
  onChange,
  min = 20,
  max = 2000,
  step = 10,
  unit = 'm',
  help,
  className = '',
  id: providedId,
}) {
  const generatedId = useId();
  const id = providedId || generatedId;

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="label mb-0" htmlFor={id}>
          {label}
        </label>
        <span className="text-sm font-semibold text-brand-700 tabular dark:text-brand-400">
          {value} {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-200 accent-brand-600 dark:bg-surface-700"
      />
      <div className="mt-1 flex justify-between text-[11px] text-surface-400">
        <span>
          {min} {unit}
        </span>
        <span>
          {max} {unit}
        </span>
      </div>
      {help ? <p className="help-text">{help}</p> : null}
    </div>
  );
}

/**
 * Non-field-specific form error, shown above the submit button.
 */
export function FormError({ error }) {
  if (!error) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900"
    >
      <span aria-hidden="true" className="mt-0.5 font-bold">
        !
      </span>
      <span>{typeof error === 'string' ? error : error.message}</span>
    </div>
  );
}
