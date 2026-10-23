import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet';

describe('Sheet', () => {
  it('does not render when closed', () => {
    render(
      <Sheet isOpen={false} onClose={vi.fn()} title="Settings">
        Content
      </Sheet>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog with title and content when open', () => {
    render(
      <Sheet isOpen onClose={vi.fn()} title="Settings" description="Change preferences">
        Content
      </Sheet>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Change preferences')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(
      <Sheet isOpen onClose={handleClose} title="Settings">
        <button type="button">Inside</button>
      </Sheet>
    );
    screen.getByRole('button', { name: 'Inside' }).focus();
    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', () => {
    const handleClose = vi.fn();
    render(
      <Sheet isOpen onClose={handleClose} title="Settings">
        Content
      </Sheet>
    );
    const backdrop = screen.getByRole('presentation');
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes on close button click', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(
      <Sheet isOpen onClose={handleClose} title="Settings">
        Content
      </Sheet>
    );
    await user.click(screen.getByRole('button', { name: 'Close Settings' }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('compensates body paddingRight when locking scroll removes a visible scrollbar', () => {
    let currentClientWidth = 1009;
    const clientWidthSpy = vi
      .spyOn(document.documentElement, 'clientWidth', 'get')
      .mockImplementation(() => {
        return document.body.style.overflow === 'hidden' ? 1024 : currentClientWidth;
      });

    const { unmount } = render(
      <Sheet isOpen onClose={vi.fn()} title="Settings">
        Content
      </Sheet>
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.paddingRight).toBe('15px');

    unmount();
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.paddingRight).toBe('');

    clientWidthSpy.mockRestore();
  });
});
