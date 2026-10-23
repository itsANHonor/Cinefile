import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders children and is a button', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('shows loading state with aria-busy and disables the button', () => {
    render(<Button isLoading>Save</Button>);
    const button = screen.getByRole('button', { name: /Save/i });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  it('supports primary, secondary, ghost and danger variants', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('bg-primary-600');

    rerender(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole('button', { name: 'Danger' })).toHaveClass('bg-red-600');

    rerender(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass('bg-surface-raised');

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveClass('bg-transparent');
  });

  it('forwards refs and clicks fire onClick', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    await user.click(screen.getByRole('button', { name: 'Click me' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
