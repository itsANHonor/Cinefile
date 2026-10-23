import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider, useConfirm } from '../context/ConfirmContext';

function TestConfirm({ onResult }: { onResult: (result: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={async () => {
        const result = await confirm({ message: 'Delete The Matrix?' });
        onResult(result);
      }}
    >
      Trigger
    </button>
  );
}

describe('useConfirm', () => {
  it('resolves true when the user confirms', async () => {
    const user = userEvent.setup();
    const handleResult = vi.fn();
    render(
      <ConfirmProvider>
        <TestConfirm onResult={handleResult} />
      </ConfirmProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete The Matrix?');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(handleResult).toHaveBeenCalledWith(true));
  });

  it('resolves false when the user cancels', async () => {
    const user = userEvent.setup();
    const handleResult = vi.fn();
    render(
      <ConfirmProvider>
        <TestConfirm onResult={handleResult} />
      </ConfirmProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(handleResult).toHaveBeenCalledWith(false));
  });
});
