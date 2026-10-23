import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import MediaGrid from './MediaGrid';
import type { PhysicalItem } from '../types';

const items: PhysicalItem[] = [
  {
    id: 1,
    name: 'Inception Blu-ray',
    physical_format: ['Blu-ray'],
    media: [{ id: 10, title: 'Inception' }],
    thickness_units: 1,
  },
  {
    id: 2,
    name: 'The Matrix 4K',
    physical_format: ['4K UHD'],
    media: [{ id: 11, title: 'The Matrix' }],
    thickness_units: 1,
  },
] as PhysicalItem[];

describe('MediaGrid', () => {
  it('renders items inside a list with listitem roles', () => {
    renderWithProviders(<MediaGrid physicalItems={items} onItemClick={vi.fn()} />);
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('calls onItemClick when a card is activated', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    renderWithProviders(<MediaGrid physicalItems={items} onItemClick={handleClick} />);
    await user.click(screen.getByRole('button', { name: /Inception Blu-ray/i }));
    expect(handleClick).toHaveBeenCalledWith(items[0]);
  });

  it('renders skeleton placeholders when skeletonCount is provided', () => {
    const { container } = render(<MediaGrid physicalItems={[]} onItemClick={vi.fn()} skeletonCount={3} />);
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(3);
  });
});
