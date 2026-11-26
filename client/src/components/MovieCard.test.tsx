import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import MovieCard from './MovieCard';
import type { CollectionMedia } from '../types';

const baseMovie: CollectionMedia = {
  id: 10,
  title: 'Blade Runner',
  release_date: '1982-06-25',
  director: 'Ridley Scott',
  cover_art_url: 'https://image.tmdb.org/t/p/w500/blade-runner.jpg',
  letterboxd_rating: 4.5,
  owned_formats: ['4K UHD', 'Blu-ray'],
  owned_editions: ['Steelbook'],
  owned_versions: ['Final Cut'],
  physical_item_count: 1,
  physical_items: [
    {
      id: 1,
      name: 'Blade Runner 4K Steelbook',
      physical_format: ['4K UHD', 'Blu-ray'],
      formats: ['4K UHD', 'Blu-ray'],
      edition_notes: 'Steelbook',
      version_notes: 'Final Cut',
      thickness_units: 1,
      media_count: 1,
    },
  ],
};

describe('MovieCard', () => {
  it('renders movie title, year, director, rating, and owned format badges', () => {
    renderWithProviders(<MovieCard media={baseMovie} onClick={vi.fn()} />);

    const card = screen.getByRole('button', { name: /Open details for Blade Runner/i });
    expect(card).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Blade Runner' })).toBeInTheDocument();
    expect(screen.getByText('1982 · Ridley Scott · ★ 4.5')).toBeInTheDocument();
    expect(screen.getByText('4K UHD')).toBeInTheDocument();
    expect(screen.getByText('Blu-ray')).toBeInTheDocument();
    expect(screen.queryByTestId('movie-copies-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('movie-boxset-badge')).not.toBeInTheDocument();
  });

  it('activates on Enter and Space keys', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    renderWithProviders(<MovieCard media={baseMovie} onClick={handleClick} />);

    const card = screen.getByRole('button', { name: /Open details for Blade Runner/i });
    card.focus();
    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('shows copies badge when owned in multiple physical items', () => {
    const doubleDip: CollectionMedia = {
      ...baseMovie,
      physical_item_count: 3,
      owned_formats: ['4K UHD', 'Blu-ray', 'DVD', 'VHS'],
    };

    renderWithProviders(<MovieCard media={doubleDip} onClick={vi.fn()} />);
    expect(screen.getByTestId('movie-copies-badge')).toHaveTextContent('3 copies');
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('shows Box set badge when sole copy is a multi-title release', () => {
    const inBoxSet: CollectionMedia = {
      ...baseMovie,
      physical_item_count: 1,
      physical_items: [
        {
          ...baseMovie.physical_items[0],
          name: 'Sci-Fi Classics Box Set',
          media_count: 5,
        },
      ],
    };

    renderWithProviders(<MovieCard media={inBoxSet} onClick={vi.fn()} />);
    const badge = screen.getByTestId('movie-boxset-badge');
    expect(badge).toHaveTextContent('Box set');
    expect(badge).toHaveAttribute('title', 'Part of Sci-Fi Classics Box Set');
  });

  it('renders series eyebrow, TV badge, and admin edit button without triggering card click', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    const handleEdit = vi.fn();

    const tvSeason: CollectionMedia = {
      ...baseMovie,
      id: 20,
      title: 'Twin Peaks: Season 1',
      media_type: 'tv_season',
      series: [{ id: 9, name: 'Twin Peaks', sort_name: 'Twin Peaks' }],
    };

    renderWithProviders(
      <MovieCard
        media={tvSeason}
        onClick={handleClick}
        isEditMode
        isAuthenticated
        onEdit={handleEdit}
      />
    );

    expect(screen.getByTestId('movie-card-series')).toHaveTextContent('Twin Peaks');
    expect(screen.getByText('TV')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Edit Twin Peaks: Season 1/i }));
    expect(handleEdit).toHaveBeenCalledWith(tvSeason);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
