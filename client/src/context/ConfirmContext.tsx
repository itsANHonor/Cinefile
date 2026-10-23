import React, { createContext, useCallback, useContext, useState } from 'react';
import { Sheet } from '../components/ui/Sheet';
import { Button } from '../components/ui/Button';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setRequest({ ...options, resolve });
    });
  }, []);

  const handleClose = useCallback(
    (value: boolean) => {
      request?.resolve(value);
      setRequest(null);
    },
    [request]
  );

  const title = request?.title ?? 'Are you sure?';
  const message = request?.message ?? '';
  const confirmLabel = request?.confirmLabel ?? 'Confirm';
  const cancelLabel = request?.cancelLabel ?? 'Cancel';
  const variant = request?.variant ?? 'primary';

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Sheet
        isOpen={request !== null}
        onClose={() => handleClose(false)}
        title={title}
        position="center"
        size="sm"
        showClose={false}
      >
        <p className="text-content">{message}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => handleClose(false)} className="w-full sm:w-auto">
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={() => handleClose(true)}
            className="w-full sm:w-auto"
          >
            {confirmLabel}
          </Button>
        </div>
      </Sheet>
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmContextValue['confirm'] => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return ctx.confirm;
};
