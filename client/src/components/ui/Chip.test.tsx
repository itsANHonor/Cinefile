import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chip } from './Chip';

describe('Chip', () => {
  it('renders a selectable chip with aria-pressed', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Chip label="Drama" selected onClick={handleClick} />);
    const chip = screen.getByRole('button', { name: 'Drama' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders a removable chip with a remove button', async () => {
    const user = userEvent.setup();
    const handleRemove = vi.fn();
    render(<Chip label="Blu-ray" onRemove={handleRemove} />);
    const remove = screen.getByRole('button', { name: 'Remove Blu-ray' });
    await user.click(remove);
    expect(handleRemove).toHaveBeenCalledTimes(1);
  });

  it('shows count next to the label', () => {
    render(<Chip label="Action" count={12} />);
    expect(screen.getByRole('button', { name: /Action/i })).toHaveTextContent('12');
  });
});
