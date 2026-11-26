import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MovieDetailModal from './MovieDetailModal';
import type { CollectionMedia } from '../types';

const richMovie: CollectionMedia = {
  id: 42,
  title: 'The Fellowship of the Ring',
  original_title: 'The Lord of the Rings: The Fellowship of the Ring',
  release_date: '2001-12-19',
  director: 'Peter Jackson',
  synopsis: 'A meek Hobbit from the Shire sets out on a journey to destroy the One Ring.',
  cast: ['Elijah Wood', 'Ian McKellen', 'Viggo Mortensen'],
  cover_art_url: 'https://image.tmdb.org/t/p/w500/fellowship.jpg',
  genres: [
    { id: 12, name: 'Adventure' },
    { id: 14, name: 'Fantasy' },
  ],
  series: [{ id: 7, name: 'Middle-earth', sort_name: 'Middle-earth' }],
  letterboxd_rating: 5,
  letterboxd_liked: true,
  letterboxd_watched: true,
  letterboxd_last_watched_date: '2026-10-01',
  owned_formats: ['4K UHD', 'Blu-ray'],
  owned_editions: ['Steelbook'],
  owned_versions: ['Extended', 'Theatrical'],
  physical_item_count: 2,
  physical_items: [
    {
      id: 101,
      name: 'The Lord of the Rings Trilogy 4K',
      physical_format: ['4K UHD'],
      formats: ['4K UHD'],
      edition_notes: 'Steelbook',
      version_notes: 'Extended, Theatrical',
      thickness_units: 3,
      media_count: 3,
      cost: 89.99,
      shelf_placement: {
        id: 1,
        shelf_id: 2,
        physical_item_id: 101,
        position: 3,
        shelf_display_name: 'Shelf 1',
        group_display_name: 'Living Room',
      },
    },
    {
      id: 102,
      name: 'Fellowship Extended Blu-ray',
      physical_format: ['Blu-ray'],
      formats: ['Blu-ray'],
      version_notes: 'Extended',
      thickness_units: 1,
      media_count: 1,
    },
  ],
};

describe('MovieDetailModal', () => {
  it('renders movie hero details, Letterboxd activity, and all owned physical releases', () => {
    render(<MovieDetailModal media={richMovie} isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The Fellowship of the Ring' })).toBeInTheDocument();
    expect(
      screen.getByText('Original title: The Lord of the Rings: The Fellowship of the Ring')
    ).toBeInTheDocument();
    expect(screen.getByText('2001')).toBeInTheDocument();
    expect(screen.getByText('Peter Jackson')).toBeInTheDocument();
    expect(screen.getByTestId('letterboxd-activity-banner')).toHaveTextContent('★★★★★');
    expect(screen.getByText(/A meek Hobbit from the Shire/i)).toBeInTheDocument();
    expect(screen.getByText('Elijah Wood, Ian McKellen, Viggo Mortensen')).toBeInTheDocument();

    expect(screen.getByText(/In your collection \(2 releases\)/i)).toBeInTheDocument();
    const firstRelease = screen.getByTestId('owned-release-101');
    expect(within(firstRelease).getByText('The Lord of the Rings Trilogy 4K')).toBeInTheDocument();
    expect(within(firstRelease).getByText('Box set · 3 titles')).toBeInTheDocument();
    expect(within(firstRelease).getByText(/Living Room/)).toBeInTheDocument();
    expect(within(firstRelease).getByText(/Shelf 1, Pos 4/)).toBeInTheDocument();
    expect(within(firstRelease).getByText('$89.99')).toBeInTheDocument();

    const secondRelease = screen.getByTestId('owned-release-102');
    expect(within(secondRelease).getByText('Fellowship Extended Blu-ray')).toBeInTheDocument();
    expect(within(secondRelease).queryByText(/Box set/i)).not.toBeInTheDocument();
  });

  it('invokes view release, edit movie, edit release, and filter shortcut callbacks', async () => {
    const user = userEvent.setup();
    const onViewPhysicalItem = vi.fn();
    const onEditMovie = vi.fn();
    const onEditPhysicalItem = vi.fn();
    const onFilterByDirector = vi.fn();
    const onFilterBySeries = vi.fn();
    const onFilterByGenre = vi.fn();

    render(
      <MovieDetailModal
        media={richMovie}
        isOpen
        onClose={vi.fn()}
        onViewPhysicalItem={onViewPhysicalItem}
        onEditMovie={onEditMovie}
        onEditPhysicalItem={onEditPhysicalItem}
        onFilterByDirector={onFilterByDirector}
        onFilterBySeries={onFilterBySeries}
        onFilterByGenre={onFilterByGenre}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Edit The Fellowship of the Ring' }));
    expect(onEditMovie).toHaveBeenCalledWith(richMovie);

    await user.click(
      screen.getByRole('button', { name: 'View release The Lord of the Rings Trilogy 4K' })
    );
    expect(onViewPhysicalItem).toHaveBeenCalledWith(101, 42);

    await user.click(
      screen.getByRole('button', { name: 'Edit release Fellowship Extended Blu-ray' })
    );
    expect(onEditPhysicalItem).toHaveBeenCalledWith(102);

    await user.click(screen.getByRole('button', { name: 'Peter Jackson' }));
    expect(onFilterByDirector).toHaveBeenCalledWith('Peter Jackson');

    await user.click(screen.getByRole('button', { name: 'Middle-earth' }));
    expect(onFilterBySeries).toHaveBeenCalledWith(7);

    await user.click(screen.getByRole('button', { name: 'Fantasy' }));
    expect(onFilterByGenre).toHaveBeenCalledWith(14);
  });

  it('closes on Escape key press', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(<MovieDetailModal media={richMovie} isOpen onClose={handleClose} />);
    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
