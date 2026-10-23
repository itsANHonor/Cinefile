import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from './SegmentedControl';

const options = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV' },
];

function StatefulSegmentedControl() {
  const [value, setValue] = React.useState('all');
  return <SegmentedControl options={options} value={value} onChange={setValue} />;
}

describe('SegmentedControl', () => {
  it('renders options as a radio group', () => {
    render(<SegmentedControl options={options} value="all" onChange={vi.fn()} name="Media type" />);
    const group = screen.getByRole('radiogroup', { name: 'Media type' });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange when an option is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<SegmentedControl options={options} value="all" onChange={handleChange} />);
    await user.click(screen.getByRole('radio', { name: 'Movies' }));
    expect(handleChange).toHaveBeenCalledWith('movie');
  });

  it('moves selection with arrow keys when the value is bound', async () => {
    const user = userEvent.setup();
    render(<StatefulSegmentedControl />);
    const first = screen.getByRole('radio', { name: 'All' });
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Movies' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'TV' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Movies' })).toHaveAttribute('aria-checked', 'true');
  });

  it('jumps to first and last options with Home and End', async () => {
    const user = userEvent.setup();
    render(<StatefulSegmentedControl />);
    screen.getByRole('radio', { name: 'All' }).focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'TV' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
  });
});
