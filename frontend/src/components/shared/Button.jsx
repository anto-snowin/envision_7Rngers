/**
 * Button and IconButton.
 *
 * Renders as a `<button>`, or as a react-router `<Link>` when `to` is given, so
 * navigation actions stay real links (middle-click, open in new tab) while
 * looking identical.
 */
import { Link } from 'react-router-dom';
import Spinner from './Spinner';

const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-5 py-3 text-base rounded-xl',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  type = 'button',
  to = null,
  href = null,
  className = '',
  leftIcon = null,
  rightIcon = null,
  fullWidth = false,
  ...rest
}) {
  const classes = [
    'btn',
    VARIANTS[variant] || VARIANTS.primary,
    SIZES[size] || SIZES.md,
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {isLoading ? <Spinner className="h-4 w-4" /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={classes} rel="noreferrer" {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || isLoading}
      // Tell assistive technology the control is busy rather than just dead.
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
}

/**
 * Square icon-only button.
 *
 * `label` is required and becomes the accessible name — an icon button with no
 * label is unusable with a screen reader.
 */
export function IconButton({
  children,
  label,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...rest
}) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-11 w-11',
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        'btn shrink-0 !px-0',
        VARIANTS[variant] || VARIANTS.ghost,
        sizeClasses[size] || sizeClasses.md,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
