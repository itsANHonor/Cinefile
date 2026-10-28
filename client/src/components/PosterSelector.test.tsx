import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PosterSelector from './PosterSelector';

vi.mock('../services/api.service', () => ({
  apiService: {
    searchCovers: vi.fn(),
    extractCoversFromUrl: vi.fn(),
    downloadRemoteCover: vi.fn(),
    getMoviePosters: vi.fn(),
    getTVPosters: vi.fn(),
    getTVSeasonPosters: vi.fn(),
  },
}));

import { apiService } from '../services/api.service';

const mockSearchCovers = apiService.searchCovers as ReturnType<typeof vi.fn>;
const mockExtractCoversFromUrl = apiService.extractCoversFromUrl as ReturnType<typeof vi.fn>;
const mockDownloadRemoteCover = apiService.downloadRemoteCover as ReturnType<typeof vi.fn>;
const mockGetMoviePosters = apiService.getMoviePosters as ReturnType<typeof vi.fn>;

const amazonCandidate = {
  id: 'amazon-B123',
  url: 'https://m.media-amazon.com/images/I/abc._SL1500_.jpg',
  thumbnailUrl: 'https://m.media-amazon.com/images/I/abc._AC_UY500_.jpg',
  title: 'Dune (4K Ultra HD + Blu-ray)',
  subtitle: '4K',
  source: 'amazon' as const,
  productUrl: 'https://www.amazon.com/dp/B123',
  asin: 'B123',
};

const blurayCandidate = {
  id: 'bluray-295838',
  url: 'https://images.static-bluray.com/movies/covers/295838_front.jpg',
  thumbnailUrl: 'https://images.static-bluray.com/movies/covers/295838_large.jpg',
  title: 'Dune 4K Blu-ray',
  subtitle: 'Warner Bros. | 2021 | 4K Ultra HD + Blu-ray',
  source: 'bluray' as const,
  productUrl: 'https://www.blu-ray.com/movies/Dune-4K-Blu-ray/295838/',
};

describe('PosterSelector (unified cover picker)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchCovers.mockResolvedValue({
      results: [blurayCandidate, amazonCandidate],
      sourcesStatus: { amazon: 'ok', bluray: 'ok' },
    });
    mockGetMoviePosters.mockResolvedValue(['https://image.tmdb.org/t/p/w500/poster1.jpg']);
  });

  it('auto-searches box art on open using the initial query', async () => {
    render(
      <PosterSelector
        tmdbId={null}
        movieTitle="Dune"
        initialQuery="Dune 4K UHD Steelbook"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockSearchCovers).toHaveBeenCalledWith('Dune 4K UHD Steelbook', ['amazon', 'bluray']);
    });

    expect(await screen.findByText('Dune 4K Blu-ray')).toBeInTheDocument();
    expect(screen.getByText('Dune (4K Ultra HD + Blu-ray)')).toBeInTheDocument();
    // Source badges appear on candidates (multiple "Amazon"/"Blu-ray.com" texts expected)
    expect(screen.getAllByText('Amazon').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Blu-ray.com').length).toBeGreaterThan(0);
  });

  it('filters candidates by source when source pills are clicked', async () => {
    const user = userEvent.setup();
    render(
      <PosterSelector
        tmdbId={null}
        movieTitle="Dune"
        initialQuery="Dune"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await screen.findByText('Dune 4K Blu-ray');

    // Click "Amazon" source filter (the pill, not the candidate badge)
    const filterButtons = screen.getAllByRole('button', { name: 'Amazon' });
    await user.click(filterButtons[0]);

    expect(screen.queryByText('Dune 4K Blu-ray')).not.toBeInTheDocument();
    expect(screen.getByText('Dune (4K Ultra HD + Blu-ray)')).toBeInTheDocument();
  });

  it('downloads the selected cover to /uploads and calls onSelect with the local URL', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockDownloadRemoteCover.mockResolvedValue({
      url: '/uploads/abc-123.jpg',
      filename: 'abc-123.jpg',
      width: 1200,
      height: 1800,
    });

    render(
      <PosterSelector
        tmdbId={null}
        movieTitle="Dune"
        initialQuery="Dune"
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );

    await screen.findByText('Dune 4K Blu-ray');
    await user.click(screen.getByText('Dune 4K Blu-ray'));

    await waitFor(() => {
      expect(mockDownloadRemoteCover).toHaveBeenCalledWith(blurayCandidate.url);
      expect(onSelect).toHaveBeenCalledWith('/uploads/abc-123.jpg');
    });
  });

  it('appends a quick-filter chip to the query and re-runs the search', async () => {
    const user = userEvent.setup();
    render(
      <PosterSelector
        tmdbId={null}
        movieTitle="Dune"
        initialQuery="Dune"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockSearchCovers).toHaveBeenCalledWith('Dune', ['amazon', 'bluray']);
    });

    await user.click(screen.getByRole('button', { name: /Steelbook/i }));

    await waitFor(() => {
      expect(mockSearchCovers).toHaveBeenCalledWith('Dune Steelbook', ['amazon', 'bluray']);
    });
  });

  it('extracts covers from a pasted product URL in the URL tab', async () => {
    const user = userEvent.setup();
    mockExtractCoversFromUrl.mockResolvedValue({ results: [amazonCandidate] });

    render(
      <PosterSelector
        tmdbId={null}
        movieTitle="Dune"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        defaultTab="url"
      />
    );

    const input = screen.getByLabelText(/Product or image URL/i);
    await user.type(input, 'https://www.amazon.com/dp/B09MDHXGST');
    await user.click(screen.getByRole('button', { name: /Fetch Covers/i }));

    await waitFor(() => {
      expect(mockExtractCoversFromUrl).toHaveBeenCalledWith('https://www.amazon.com/dp/B09MDHXGST');
    });
    expect(await screen.findByText('Dune (4K Ultra HD + Blu-ray)')).toBeInTheDocument();
  });

  it('loads TMDb posters in the TMDb tab and lets users pick one directly', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <PosterSelector
        tmdbId={438631}
        movieTitle="Dune"
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'TMDb Posters' }));

    await waitFor(() => {
      expect(mockGetMoviePosters).toHaveBeenCalledWith(438631);
    });

    const posterImg = await screen.findByAltText('Poster option 1');
    await user.click(posterImg);
    expect(onSelect).toHaveBeenCalledWith('https://image.tmdb.org/t/p/w500/poster1.jpg');
  });
});
