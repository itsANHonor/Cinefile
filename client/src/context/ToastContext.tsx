import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number | null;
  persistent?: boolean;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const toastRole: Record<ToastType, 'status' | 'alert'> = {
  info: 'status',
  success: 'status',
  warning: 'alert',
  error: 'alert',
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, number>>({});

  const clearTimer = useCallback((id: string) => {
    const handle = timers.current[id];
    if (handle) {
      window.clearTimeout(handle);
      delete timers.current[id];
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const toast = useCallback(
    (opts: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const item: Toast = { ...opts, id };
      setToasts((prev) => [...prev, item]);
      const duration = opts.persistent ? null : opts.duration ?? 5000;
      if (duration !== null && duration > 0) {
        timers.current[id] = window.setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          aria-atomic="true"
          className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 p-4 bottom-[calc(var(--tabbar-h)+var(--safe-b))] lg:bottom-[max(1rem,var(--safe-b))] lg:pb-[max(1rem,var(--safe-b))]"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role={toastRole[t.type]}
              className="pointer-events-auto w-full max-w-md rounded-[--radius-card] border border-subtle bg-surface-raised p-4 shadow-[--shadow-card]"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0" aria-hidden="true">
                  {t.type === 'error' && <span className="text-red-500">●</span>}
                  {t.type === 'warning' && <span className="text-amber-500">●</span>}
                  {t.type === 'success' && <span className="text-green-500">●</span>}
                  {t.type === 'info' && <span className="text-primary-500">●</span>}
                </span>
                <div className="flex-1">
                  <p className="text-sm text-content">{t.message}</p>
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        t.action?.onClick();
                        dismiss(t.id);
                      }}
                      className="mt-2 text-sm font-medium text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-[--radius-control]"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="flex-shrink-0 rounded-[--radius-control] p-1 text-content-muted hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};
