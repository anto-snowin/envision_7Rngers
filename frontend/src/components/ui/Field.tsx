'use client';

import { useId } from 'react';

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | null;
  hint?: string;
}

/**
 * Labelled text input.
 *
 * The error is wired up with `aria-describedby` and `aria-invalid` rather than
 * only coloured red, so it is announced rather than merely visible.
 */
export function Field({ label, error, hint, className, ...props }: FieldProps) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        className={`field ${error ? 'field-invalid' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-alarm-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface TextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  error?: string | null;
  hint?: string;
}

export function TextArea({ label, error, hint, className, ...props }: TextAreaProps) {
  const id = useId();

  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <textarea
        id={id}
        className={`field min-h-24 resize-y ${error ? 'field-invalid' : ''}`}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint && !error ? <p className="mt-1.5 text-xs text-ink-500">{hint}</p> : null}
      {error ? <p className="mt-1.5 text-xs text-alarm-300">{error}</p> : null}
    </div>
  );
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  error?: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function Select({ label, error, options, className, ...props }: SelectProps) {
  const id = useId();

  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select
        id={id}
        className={`field appearance-none ${error ? 'field-invalid' : ''}`}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-ink-850">
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1.5 text-xs text-alarm-300">{error}</p> : null}
    </div>
  );
}

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  /** Rendered beside the label, e.g. "250 m". */
  valueLabel: string;
}

export function Slider({ label, valueLabel, className, ...props }: SliderProps) {
  const id = useId();

  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label mb-0">
          {label}
        </label>
        <span className="tnum text-sm font-semibold text-acid-500">{valueLabel}</span>
      </div>
      <input
        id={id}
        type="range"
        className="h-1.5 w-full cursor-pointer appearance-none rounded-pill bg-ink-700
          accent-acid-500
          [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-acid-500"
        {...props}
      />
    </div>
  );
}

/** Non-field error banner, for whole-form failures. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-2xl border border-alarm-500/35 bg-alarm-500/10 px-4 py-3 text-sm text-alarm-300"
    >
      {message}
    </p>
  );
}
