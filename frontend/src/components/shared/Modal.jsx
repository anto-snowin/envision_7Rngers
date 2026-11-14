/**
 * Modal dialog and confirmation prompt.
 *
 * Implements the accessibility basics by hand rather than pulling in a dialog
 * library: Escape to close, a focus trap, focus restored to the trigger on
 * close, background scroll locked, and `aria-modal` with a labelled title.
 */
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';
import { IconButton } from './Button';
import Button from './Button';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  description = null,
  children,
  footer = null,
  size = 'md',
  closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  /** Keep focus inside the dialog while it is open. */
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return undefined;

    // Remember what had focus so it can be restored on close.
    previouslyFocused.current = document.activeElement;

    // Lock background scrolling, compensating for the scrollbar so the page
    // behind does not visibly shift.
    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    // Move focus into the dialog.
    const timer = setTimeout(() => {
      const target = panelRef.current?.querySelector(
        'input:not([type="hidden"]), textarea, select, button'
      );
      (target || panelRef.current)?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-950/50 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={description ? 'modal-description' : undefined}
        tabIndex={-1}
        className={[
          'card relative z-10 flex max-h-[92vh] w-full flex-col',
          // Full-width sheet on phones, centred dialog from `sm` up.
          'rounded-t-2xl rounded-b-none sm:rounded-2xl',
          SIZES[size] || SIZES.md,
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-4 border-b border-surface-200 p-5 dark:border-surface-800">
          <div className="min-w-0">
            <h2
              id="modal-title"
              className="text-lg font-semibold text-surface-900 dark:text-surface-50"
            >
              {title}
            </h2>
            {description ? (
              <p
                id="modal-description"
                className="mt-1 text-sm text-surface-500 dark:text-surface-400"
              >
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close dialog" onClick={onClose} size="sm">
            <CloseIcon className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-surface-200 p-5 sm:flex-row sm:justify-end dark:border-surface-800">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/**
 * Confirmation dialog for destructive actions.
 *
 * `confirmLabel` should name the action ("Delete patient") rather than say
 * "OK", so the consequence is clear from the button itself.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isPending = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      closeOnBackdrop={!isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} isLoading={isPending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-surface-600 dark:text-surface-300">{message}</p>
    </Modal>
  );
}
