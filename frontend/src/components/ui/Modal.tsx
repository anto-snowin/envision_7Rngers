'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button, { IconButton } from './Button';
import { CloseIcon } from './Icons';

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

/**
 * Dialog with the accessibility basics done by hand: Escape to close, a focus
 * trap, focus restored on close, background scroll locked, and a labelled
 * `aria-modal` container.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
  closeOnBackdrop?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  /**
   * Only Tab is handled here. Escape is bound to the document below, because
   * this handler sits on the dialog wrapper: when focus has landed outside the
   * panel — on `body` after clicking a non-focusable element, say — a wrapper
   * handler never fires and Escape silently stops working.
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Tab' || !panelRef.current) return;

    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
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
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement;

    // Lock scrolling, compensating for the scrollbar so the page behind does
    // not visibly shift as the dialog opens.
    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    const timer = setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), textarea, select, button'
      );
      (target || panelRef.current)?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
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
        className={`panel relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-3xl rounded-b-none sm:rounded-3xl ${SIZES[size]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100/8 p-5">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-xl font-extrabold">
              {title}
            </h2>
            {description ? (
              <p id="modal-description" className="mt-1 text-sm text-ink-400">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close dialog" variant="quiet" onClick={onClose}>
            <CloseIcon className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-ink-100/8 p-5 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/** Confirmation for a destructive action. The button names the action. */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  isPending = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  isPending?: boolean;
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
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="alarm" onClick={onConfirm} isLoading={isPending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-300">{message}</p>
    </Modal>
  );
}
