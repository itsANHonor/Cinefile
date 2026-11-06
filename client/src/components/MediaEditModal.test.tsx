import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import MediaEditModal from './MediaEditModal';
import { apiService } from '../services/api.service';
import type { Media } from '../types';

describe('MediaEditModal TMDB Lookup & Link (ITS-98)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiService, 'getSeries').mockResolvedValue([]);
  });

  it('auto-opens the TMDB lookup section when media has no tmdb_id and allows searching and linking a TMDB movie', async () => {
    const user = userEvent.setup();
    const unlinkedMedia: Media = {
      id: 42,
      title: 'Disneynature Earth',
      synopsis: '',
      director: '',
      release_date: '',
      cover_art_url: '',
      cast: [],
      genres: [],
      series: [],
    };

    const searchMoviesSpy = vi.spyOn(apiService, 'searchMovies').mockResolvedValue({
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [
        {
          id: 152532,
          title: 'Earth',
          overview: 'An epic story of adventure, starring some of the most magnificent animals on the planet.',
          poster_path: '/earth.jpg',
          release_date: '2007-10-10',
          vote_average: 7.5,
          vote_count: 500,
        },
      ],
    });

    const getMovieDetailsSpy = vi.spyOn(apiService, 'getMovieDetails').mockResolvedValue({
      id: 152532,
      title: 'Earth',
      overview: 'An epic story of adventure, starring some of the most magnificent animals on the planet.',
      poster_path: '/earth.jpg',
      backdrop_path: null,
      release_date: '2007-10-10',
      runtime: 90,
      vote_average: 7.5,
      vote_count: 500,
      director: 'Alastair Fothergill',
      cast: ['Patrick Stewart', 'James Earl Jones'],
      genres: [{ id: 99, name: 'Documentary' }],
      poster_url: 'https://image.tmdb.org/t/p/w500/earth.jpg',
    });

    const updateMediaSpy = vi.spyOn(apiService, 'updateMedia').mockImplementation(async (_id, dto) => ({
      ...unlinkedMedia,
      ...dto,
      primary_series_id: dto.primary_series_id ?? undefined,
      id: 42,
    }));

    const onSave = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <MediaEditModal media={unlinkedMedia} isOpen onClose={onClose} onSave={onSave} />
    );

    expect(screen.getByText('Not linked to TMDB')).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Search TMDB by title');
    expect(searchInput).toHaveValue('Disneynature Earth');

    await user.click(screen.getByRole('button', { name: 'Search TMDB' }));

    await waitFor(() => {
      expect(searchMoviesSpy).toHaveBeenCalledWith('Disneynature Earth', 1);
    });

    const useMatchButton = await screen.findByRole('button', { name: 'Use This Match' });
    await user.click(useMatchButton);

    await waitFor(() => {
      expect(getMovieDetailsSpy).toHaveBeenCalledWith(152532);
    });

    expect(await screen.findByText('Movie ID #152532')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Alastair Fothergill')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2007-10-10')).toBeInTheDocument();
    expect(screen.getByText('Documentary')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(updateMediaSpy).toHaveBeenLastCalledWith(
        42,
        expect.objectContaining({
          tmdb_id: 152532,
          media_type: 'movie',
          title: 'Earth',
          director: 'Alastair Fothergill',
          release_date: '2007-10-10',
          genres: [{ id: 99, name: 'Documentary' }],
        })
      );
    });
    expect(onSave).toHaveBeenCalled();
  });

  it('allows linking a TV documentary (e.g., Planet Earth) via TV / Miniseries mode or direct TMDB ID', async () => {
    const user = userEvent.setup();
    const unlinkedMedia: Media = {
      id: 43,
      title: 'Planet Earth',
      synopsis: '',
      director: '',
      release_date: '',
      cover_art_url: '',
      cast: [],
      genres: [],
      series: [],
    };

    vi.spyOn(apiService, 'getTVDetails').mockResolvedValue({
      id: 1044,
      name: 'Planet Earth',
      overview: 'David Attenborough celebrates the amazing variety of the natural world.',
      poster_path: '/planet-earth.jpg',
      backdrop_path: null,
      first_air_date: '2006-03-05',
      last_air_date: '2006-12-10',
      number_of_seasons: 1,
      number_of_episodes: 11,
      status: 'Ended',
      vote_average: 8.8,
      vote_count: 1200,
      genres: [{ id: 99, name: 'Documentary' }],
      created_by: [{ id: 1, name: 'Alastair Fothergill', profile_path: null }],
      creators: 'Alastair Fothergill',
      cast: ['David Attenborough'],
      poster_url: 'https://image.tmdb.org/t/p/w500/planet-earth.jpg',
      seasons: [
        {
          id: 3624,
          name: 'Season 1',
          overview: 'Original 11-part series.',
          poster_path: '/pe-s1.jpg',
          air_date: '2006-03-05',
          season_number: 1,
          episode_count: 11,
          vote_average: 9.0,
        },
      ],
    });

    vi.spyOn(apiService, 'getTVSeasonDetails').mockResolvedValue({
      overview: 'Original 11-part series.',
      air_date: '2006-03-05',
      poster_path: '/pe-s1.jpg',
      episode_count: 11,
    });

    const updateMediaSpy = vi.spyOn(apiService, 'updateMedia').mockImplementation(async (_id, dto) => ({
      ...unlinkedMedia,
      ...dto,
      primary_series_id: dto.primary_series_id ?? undefined,
      id: 43,
    }));

    renderWithProviders(
      <MediaEditModal media={unlinkedMedia} isOpen onClose={vi.fn()} onSave={vi.fn()} />
    );

    // Switch to TV / Miniseries mode
    await user.click(screen.getByRole('button', { name: 'TV / Miniseries' }));

    // Enter a direct TMDB TV ID
    const idInput = screen.getByLabelText('TMDB ID or URL');
    await user.type(idInput, '1044');
    await user.click(screen.getByRole('button', { name: 'Link by ID' }));

    // Season picker appears
    const linkSeasonButton = await screen.findByRole('button', { name: 'Link Season' });
    await user.click(linkSeasonButton);

    expect(await screen.findByText(/TV ID #1044 • Season 1/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Planet Earth - Season 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(updateMediaSpy).toHaveBeenLastCalledWith(
        43,
        expect.objectContaining({
          tmdb_id: 3624,
          media_type: 'tv_season',
          tv_show_tmdb_id: 1044,
          tv_show_name: 'Planet Earth',
          season_number: 1,
          episode_count: 11,
        })
      );
    });
  });
});
