import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditionTagInput from './EditionTagInput';

const AVAILABLE_TAGS = [
  { tag: 'Steelbook', count: 12 },
  { tag: 'Criterion', count: 8 },
  { tag: "Collector's Edition", count: 5 },
  { tag: 'Slipcover', count: 4 },
];

describe('EditionTagInput', () => {
  it('renders existing comma-separated tags as removable pills', () => {
    const onChange = vi.fn();
    render(
      <EditionTagInput
        value="Steelbook, Criterion"
        onChange={onChange}
        availableTags={AVAILABLE_TAGS}
      />
    );

    expect(screen.getByText('Steelbook')).toBeInTheDocument();
    expect(screen.getByText('Criterion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Steelbook tag' })).toBeInTheDocument();
  });

  it('auto-suggests matching existing tags as the user types and selects on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <EditionTagInput
        value=""
        onChange={onChange}
        availableTags={AVAILABLE_TAGS}
      />
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'stee');

    // Dropdown with matching existing tag should appear
    const option = await screen.findByRole('option', { name: /Steelbook/i });
    expect(option).toBeInTheDocument();
    expect(option).toHaveTextContent('12 items');

    await user.click(option);

    expect(screen.getByText('Steelbook')).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('Steelbook');
  });

  it('commits tag with canonical casing when pressing Enter or comma', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <EditionTagInput
        value=""
        onChange={onChange}
        availableTags={AVAILABLE_TAGS}
      />
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'criterion, Limited Edition{Enter}');

    expect(screen.getByText('Criterion')).toBeInTheDocument();
    expect(screen.getByText('Limited Edition')).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('Criterion, Limited Edition');
  });

  it('removes the last tag on Backspace when input is empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <EditionTagInput
        value="Steelbook, Slipcover"
        onChange={onChange}
        availableTags={AVAILABLE_TAGS}
      />
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{Backspace}');

    expect(screen.queryByText('Slipcover')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('Steelbook');
  });
});
