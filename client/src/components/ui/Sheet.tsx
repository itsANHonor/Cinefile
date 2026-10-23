import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { VisuallyHidden } from './VisuallyHidden';

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  position?: 'bottom' | 'right' | 'left' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'full';
  showClose?: boolean;
  headerActions?: React.ReactNode;
  className?: string;
}

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function lockBodyScroll(lock: boolean) {
  const previousOverflow = document.body.style.overflow;
  const previousPaddingRight = document.body.style.paddingRight;
  if (lock) {
    const beforeWidth = document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    const afterWidth = document.documentElement.clientWidth;
    const scrollbarDelta = afterWidth - beforeWidth;
    if (scrollbarDelta > 0) {
      const computedPaddingRight =
        parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${computedPaddingRight + scrollbarDelta}px`;
    }
  } else {
    document.body.style.overflow = previousOverflow || '';
    document.body.style.paddingRight = previousPaddingRight || '';
  }
  return () => {
    document.body.style.overflow = previousOverflow;
    document.body.style.paddingRight = previousPaddingRight;
  };
}

const positionClasses: Record<Exclude<SheetProps['position'], undefined>, string> = {
  bottom:
    'bottom-0 left-0 right-0 rounded-t-[--radius-card] max-h-[85dvh] flex flex-col',
  right: 'right-0 top-0 bottom-0 h-full rounded-l-[--radius-card]',
  left: 'left-0 top-0 bottom-0 h-full rounded-r-[--radius-card]',
  center:
    'inset-0 m-auto rounded-[--radius-card] shadow-[--shadow-card] max-h-[85dvh] flex flex-col',
};

const sizeClasses: Record<Exclude<SheetProps['size'], undefined>, string> = {
  sm: 'w-full max-w-sm',
  md: 'w-full max-w-md',
  lg: 'w-full max-w-2xl',
  full: 'w-full h-full max-w-none rounded-none',
};

export const Sheet: React.FC<SheetProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  position = 'bottom',
  size = 'md',
  showClose = true,
  headerActions,
  className = '',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement;
    const timer = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(focusableSelector);
      const first = focusable[0];
      (first as HTMLElement | undefined)?.focus();
    });
    const restore = lockBodyScroll(true);
    return () => {
      cancelAnimationFrame(timer);
      restore();
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
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

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  const isCenter = position === 'center';
  const wrapperBase = isCenter
    ? 'fixed inset-0 z-50 flex items-center justify-center p-4'
    : 'fixed inset-0 z-50';

  const panelBase = isCenter
    ? `bg-surface-raised ${positionClasses[position]} ${sizeClasses[size]}`
    : `absolute bg-surface-raised shadow-[--shadow-card] ${positionClasses[position]} ${
        position === 'bottom' ? sizeClasses[size] : sizeClasses[size]
      }`;

  return createPortal(
    <div
      className={`${wrapperBase} bg-black/50 backdrop-blur-sm`}
      onClick={handleBackdropClick}
      role="presentation"
      aria-hidden="false"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        aria-describedby={description ? 'sheet-desc' : undefined}
        className={`${panelBase} outline-none ${className}`}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-subtle">
          <div className="min-w-0">
            <h2 id="sheet-title" className="text-lg font-semibold text-content">
              {title}
            </h2>
            {description && (
              <p id="sheet-desc" className="mt-1 text-sm text-content-muted">
                {description}
              </p>
            )}
          </div>
          {(headerActions || showClose) && (
            <div className="flex flex-shrink-0 items-center gap-2">
              {headerActions}
              {showClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={`Close ${title}`}
                  className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[--radius-control] text-content-muted hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <VisuallyHidden>Close</VisuallyHidden>
                </button>
              )}
            </div>
          )}
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
};
