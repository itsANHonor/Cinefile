import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './ToastContext';

function TestToast() {
  const { toast, dismiss } = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast({ message: 'Saved', type: 'success' })}>
        Add
      </button>
      <button type="button" onClick={() => toast({ message: 'Failed', type: 'error', persistent: true })}>
        Add Persistent
      </button>
      <button
        type="button"
        onClick={() =>
          toast({
            message: 'Undo available',
            type: 'info',
            action: { label: 'Undo', onClick: vi.fn() },
          })
        }
      >
        Add Action
      </button>
      <button type="button" onClick={() => dismiss('none')}>
        Dismiss None
      </button>
    </div>
  );
}

describe('ToastProvider', () => {
  it('renders a toast with status role and auto-dismisses it', async () => {
    const user = userEvent.setup();
    function QuickToast() {
      const { toast } = useToast();
      return (
        <button type="button" onClick={() => toast({ message: 'Saved', type: 'success', duration: 100 })}>
          Add
        </button>
      );
    }
    render(
      <ToastProvider>
        <QuickToast />
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Saved');
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 1000 });
  });

  it('keeps persistent error toasts on screen', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestToast />
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Add Persistent' }));
    const toast = screen.getByRole('alert');
    expect(toast).toHaveTextContent('Failed');
    // Wait beyond the default auto-dismiss timeout
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('renders an action button that dismisses the toast when clicked', async () => {
    const user = userEvent.setup();
    const actionSpy = vi.fn();
    function ActionTest() {
      const { toast } = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            toast({
              message: 'Undo?',
              type: 'info',
              action: { label: 'Undo', onClick: actionSpy },
            })
          }
        >
          Add
        </button>
      );
    }
    render(
      <ToastProvider>
        <ActionTest />
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(actionSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
