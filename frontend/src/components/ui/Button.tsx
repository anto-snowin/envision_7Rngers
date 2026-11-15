'use client';

import Link from 'next/link';

type Variant = 'acid' | 'ghost' | 'quiet' | 'alarm';
type Size = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<Variant, string> = {
  acid: 'btn-acid',
  ghost: 'btn-ghost',
  quiet: 'btn-quiet',
  alarm: 'btn-alarm',
};

const SIZE_CLASS: Record<Size, string> = { sm: 'btn-sm', md: '', lg: 'btn-lg' };

function classesFor(variant: Variant, size: Size, extra?: string) {
  return ['btn', VARIANT_CLASS[variant], SIZE_CLASS[size], extra].filter(Boolean).join(' ');
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

export default function Button({
  variant = 'acid',
  size = 'md',
  isLoading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type={props.type ?? 'button'}
      className={classesFor(variant, size, className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'acid',
  size = 'md',
  className,
  children,
  ...props
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  return (
    <Link href={href} className={classesFor(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

/** Square icon-only button. Always needs a `label` for screen readers. */
export function IconButton({
  label,
  variant = 'ghost',
  className,
  children,
  ...props
}: {
  label: string;
  variant?: Variant;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={props.type ?? 'button'}
      aria-label={label}
      title={label}
      className={[
        'inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors',
        variant === 'ghost'
          ? 'border border-ink-100/12 bg-ink-100/5 text-ink-300 hover:border-ink-100/25 hover:text-ink-100'
          : '',
        variant === 'quiet' ? 'text-ink-500 hover:bg-ink-100/5 hover:text-ink-100' : '',
        variant === 'alarm' ? 'bg-alarm-500/15 text-alarm-400 hover:bg-alarm-500/25' : '',
        variant === 'acid' ? 'bg-acid-500 text-ink-950 hover:bg-acid-400' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeOpacity="0.2"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
