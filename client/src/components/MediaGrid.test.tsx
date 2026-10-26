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

  it('renders a floating series bar above contiguous grouped series items', () => {
    const groupedItems: PhysicalItem[] = [
      {
        id: 1,
        name: 'Dune 4K',
        physical_format: ['4K UHD'],
        media: [{ id: 10, title: 'Dune', series: [{ id: 5, name: 'Dune Series', sort_name: 'Dune' }] }],
        thickness_units: 1,
      },
      {
        id: 2,
        name: 'Dune: Part Two 4K',
        physical_format: ['4K UHD'],
        media: [{ id: 11, title: 'Dune: Part Two', series: [{ id: 5, name: 'Dune Series', sort_name: 'Dune' }] }],
        thickness_units: 1,
      },
    ] as PhysicalItem[];

    renderWithProviders(<MediaGrid physicalItems={groupedItems} onItemClick={vi.fn()} sortBy="series_sort" />);
    const bar = screen.getByTestId('series-group-bar-5');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveTextContent('Dune Series');
    expect(bar).toHaveTextContent('2');
    expect(bar).toHaveStyle({ gridColumn: '1 / span 2' });
  });

  it('shows floating series bar for a 1-item series when sortBy is series_sort, and hides it otherwise', () => {
    const singleSeriesItem: PhysicalItem[] = [
      {
        id: 1,
        name: 'Furiosa 4K',
        physical_format: ['4K UHD'],
        media: [{ id: 10, title: 'Furiosa', series: [{ id: 9, name: 'The Mad Max Saga', sort_name: 'Mad Max' }] }],
        thickness_units: 1,
      },
    ] as PhysicalItem[];

    const { rerender } = renderWithProviders(
      <MediaGrid physicalItems={singleSeriesItem} onItemClick={vi.fn()} sortBy="title" />
    );
    expect(screen.queryByTestId('series-group-bar-9')).not.toBeInTheDocument();

    rerender(<MediaGrid physicalItems={singleSeriesItem} onItemClick={vi.fn()} sortBy="series_sort" />);
    const bar = screen.getByTestId('series-group-bar-9');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveTextContent('The Mad Max Saga');
    expect(bar).toHaveTextContent('1');
  });
});
