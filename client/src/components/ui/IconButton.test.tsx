import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('renders with a required accessible name', () => {
    render(
      <IconButton aria-label="Close dialog" onClick={vi.fn()}>
        X
      </IconButton>
    );
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  it('forwards clicks', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <IconButton aria-label="Toggle" onClick={handleClick}>
        ☰
      </IconButton>
    );
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to ghost variant and touch sizing', () => {
    render(
      <IconButton aria-label="Menu">
        ☰
      </IconButton>
    );
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveClass('bg-transparent');
    expect(button).toHaveClass('min-h-touch');
    expect(button).toHaveClass('min-w-touch');
  });
});
