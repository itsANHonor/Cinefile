import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import MovieGrid from './MovieGrid';
import type { CollectionMedia } from '../types';

const sampleMovies: CollectionMedia[] = [
  {
    id: 10,
    title: 'Dune',
    release_date: '2021-10-22',
    director: 'Denis Villeneuve',
    series: [{ id: 5, name: 'Dune Series', sort_name: 'Dune' }],
    owned_formats: ['4K UHD'],
    owned_editions: [],
    owned_versions: [],
    physical_item_count: 1,
    physical_items: [],
  },
  {
    id: 11,
    title: 'Dune: Part Two',
    release_date: '2024-03-01',
    director: 'Denis Villeneuve',
    series: [{ id: 5, name: 'Dune Series', sort_name: 'Dune' }],
    owned_formats: ['4K UHD'],
    owned_editions: [],
    owned_versions: [],
    physical_item_count: 1,
    physical_items: [],
  },
];

describe('MovieGrid', () => {
  it('renders movies inside a list and calls onMovieClick when activated', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    renderWithProviders(<MovieGrid movies={sampleMovies} onMovieClick={handleClick} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /Open details for Dune$/i }));
    expect(handleClick).toHaveBeenCalledWith(sampleMovies[0]);
  });

  it('renders floating series header bars for contiguous series movies', () => {
    renderWithProviders(
      <MovieGrid movies={sampleMovies} onMovieClick={vi.fn()} sortBy="series_sort" />
    );

    const bar = screen.getByTestId('series-group-bar-5');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveTextContent('Dune Series');
    expect(bar).toHaveTextContent('2');
    expect(bar).toHaveStyle({ gridColumn: '1 / span 2' });
  });

  it('renders skeleton placeholders when skeletonCount or isLoadingMore is provided', () => {
    const { container } = render(
      <MovieGrid movies={[]} onMovieClick={vi.fn()} skeletonCount={4} />
    );
    expect(container.querySelectorAll('[data-testid="movie-grid-skeleton"]')).toHaveLength(4);
  });
});
