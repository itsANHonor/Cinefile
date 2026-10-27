import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import StatisticsPage from './StatisticsPage';
import { apiService } from '../services/api.service';
import type { CollectionDashboardStatistics } from '../types';

const sampleDashboard: CollectionDashboardStatistics = {
  overview: {
    totalPhysicalItems: 42,
    totalMovies: 38,
    totalTVSeasons: 6,
    totalTVShows: 2,
    totalEpisodes: 54,
    multiTitleItemsCount: 4,
    totalSeries: 5,
    itemsWithEditionTags: 14,
  },
  formats: [
    {
      format: '4K UHD',
      itemCount: 18,
      titleCount: 22,
      itemPercentage: 42.9,
      titlePercentage: 50.0,
    },
    {
      format: 'Blu-ray',
      itemCount: 24,
      titleCount: 22,
      itemPercentage: 57.1,
      titlePercentage: 50.0,
    },
  ],
  editions: [
    {
      tag: 'Steelbook',
      itemCount: 10,
      titleCount: 12,
      itemPercentage: 23.8,
      titlePercentage: 27.3,
    },
    {
      tag: "Collector's Edition",
      itemCount: 4,
      titleCount: 5,
      itemPercentage: 9.5,
      titlePercentage: 11.4,
    },
  ],
  content: {
    decades: [
      { decade: '1990', movieCount: 12, tvSeasonCount: 0, titleCount: 12, itemCount: 10 },
      { decade: '2020', movieCount: 26, tvSeasonCount: 6, titleCount: 32, itemCount: 32 },
    ],
    oldestRelease: { title: 'Goodfellas', year: 1990, releaseDate: '1990-09-19' },
    newestRelease: { title: 'Dune: Part Two', year: 2024, releaseDate: '2024-03-01' },
    genres: [
      { id: 878, name: 'Science Fiction', itemCount: 15, titleCount: 18, percentage: 40.9 },
      { id: 18, name: 'Drama', itemCount: 12, titleCount: 14, percentage: 31.8 },
    ],
    topDirectors: [
      {
        name: 'Denis Villeneuve',
        count: 5,
        profileUrl: 'https://image.tmdb.org/t/p/w500/villeneuve.jpg',
        titles: [
          {
            id: 101,
            title: 'Dune: Part Two',
            year: 2024,
            coverArtUrl: 'https://image.tmdb.org/t/p/w500/dune2.jpg',
          },
          {
            id: 102,
            title: 'Blade Runner 2049',
            year: 2017,
            coverArtUrl: null,
          },
        ],
      },
      {
        name: 'Christopher Nolan',
        count: 4,
        profileUrl: null,
        titles: [{ id: 103, title: 'Oppenheimer', year: 2023, coverArtUrl: null }],
      },
    ],
    topCast: [
      {
        name: 'Cillian Murphy',
        count: 6,
        profileUrl: 'https://image.tmdb.org/t/p/w500/cillian.jpg',
        titles: [{ id: 103, title: 'Oppenheimer', year: 2023, coverArtUrl: null }],
      },
      {
        name: 'Rebecca Ferguson',
        count: 4,
        profileUrl: null,
      },
    ],
    topSeries: [{ id: 1, name: 'Dune Collection', ownedCount: 2 }],
  },
  physicalLibrary: {
    totalGroups: 1,
    totalShelves: 2,
    totalCapacityUnits: 50,
    usedUnits: 35,
    utilizationPercent: 70,
    placedItemsCount: 35,
    unassignedItemsCount: 7,
    totalLinearMm: 525,
    totalThicknessUnits: 42,
    shelves: [
      {
        id: 1,
        displayName: 'Top Shelf',
        groupName: 'Living Room',
        usedUnits: 20,
        capacityUnits: 25,
        itemCount: 20,
        utilizationPercent: 80,
      },
    ],
  },
  acquisitions: {
    itemsWithPurchaseDate: 15,
    byYear: [
      { period: '2025', purchasedCount: 6, addedCount: 20 },
      { period: '2026', purchasedCount: 9, addedCount: 22 },
    ],
    byMonth: [],
    topStores: [
      { store: 'Criterion', count: 8 },
      { store: 'Orbit DVD', count: 5 },
    ],
  },
};

describe('StatisticsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders pinned KPIs and switches across Collection Statistics, Content Insights, and Physical Statistics tabs', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'getDashboardStatistics').mockResolvedValue(sampleDashboard);

    renderWithProviders(<StatisticsPage />, { initialRoute: '/statistics' });

    expect(
      await screen.findByRole('heading', { name: 'Collection Statistics' })
    ).toBeInTheDocument();

    // Pinned Overview KPIs
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText(/2 shows · 54 eps/i)).toBeInTheDocument();

    // Default tab: Collection Statistics (formats, editions, acquisitions)
    expect(screen.getByRole('link', { name: /22 4K UHD/i })).toHaveAttribute(
      'href',
      '/?format=4K%20UHD'
    );
    expect(screen.getByRole('link', { name: /Steelbook/i })).toHaveAttribute(
      'href',
      '/?edition=Steelbook'
    );
    expect(screen.getByText('Criterion')).toBeInTheDocument();

    // Switch to Content Insights tab
    await user.click(screen.getByRole('radio', { name: /Content Insights/i }));

    // Elevated Director & Cast spotlight cards with photos, fallback initials, and owned titles preview
    const villeneuveLink = screen.getByRole('link', { name: /Denis Villeneuve/i });
    expect(villeneuveLink).toHaveAttribute('href', '/?q=Denis%20Villeneuve');
    expect(screen.getByAltText('Denis Villeneuve')).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w500/villeneuve.jpg'
    );
    expect(screen.getByText(/Dune: Part Two, Blade Runner 2049 \+3 more/i)).toBeInTheDocument();

    const cillianLink = screen.getByRole('link', { name: /Cillian Murphy/i });
    expect(cillianLink).toHaveAttribute('href', '/?q=Cillian%20Murphy');
    expect(screen.getByAltText('Cillian Murphy')).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w500/cillian.jpg'
    );

    // Fallback monogram initials when profileUrl is null
    expect(screen.getByText('CN')).toBeInTheDocument();

    // Decades, Genres & Series in Content Insights
    expect(screen.getByRole('link', { name: /Science Fiction/i })).toHaveAttribute(
      'href',
      '/?genre=878'
    );
    expect(screen.getByRole('link', { name: /1990s/i })).toHaveAttribute(
      'href',
      '/?decade=1990'
    );
    expect(screen.getByRole('link', { name: /Dune Collection/i })).toHaveAttribute(
      'href',
      '/?series=1'
    );

    // Switch to Physical Statistics tab
    await user.click(screen.getByRole('radio', { name: /Physical Statistics/i }));

    expect(screen.getByText('70% full')).toBeInTheDocument();
    expect(screen.getByText('Top Shelf')).toBeInTheDocument();

    // Verify Spine Color Palette and Multi-Format & Double-Dip sections are removed
    expect(screen.queryByText(/Spine Color Palette/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Multi-Format & Double-Dip Titles/i)).not.toBeInTheDocument();
  });

  it('toggles format counts between By Titles and By Physical Items', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'getDashboardStatistics').mockResolvedValue(sampleDashboard);

    renderWithProviders(<StatisticsPage />, { initialRoute: '/statistics' });

    const formatLink = await screen.findByRole('link', { name: /22 4K UHD/i });
    expect(formatLink).toHaveTextContent('22');

    await user.click(screen.getByRole('radio', { name: /By Physical Items/i }));
    expect(screen.getByRole('link', { name: /18 4K UHD/i })).toHaveTextContent('18');
  });

  it('renders an empty state when the collection has zero items', async () => {
    vi.spyOn(apiService, 'getDashboardStatistics').mockResolvedValue({
      ...sampleDashboard,
      overview: {
        ...sampleDashboard.overview,
        totalPhysicalItems: 0,
      },
    });

    renderWithProviders(<StatisticsPage />, { initialRoute: '/statistics' });

    expect(await screen.findByText(/No collection statistics yet/i)).toBeInTheDocument();
  });
});
