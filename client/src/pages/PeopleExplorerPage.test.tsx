import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import PeopleExplorerPage from './PeopleExplorerPage';
import { apiService } from '../services/api.service';
import type { PeopleExplorerResponse } from '../types';

const samplePeopleExplorer: PeopleExplorerResponse = {
  summary: {
    totalDirectors: 3,
    totalActors: 3,
    multiFilmDirectorsCount: 2,
    multiTitleActorsCount: 2,
    dualRoleCount: 1,
    collaborationsCount: 1,
  },
  directors: [
    {
      name: 'Denis Villeneuve',
      role: 'director',
      count: 5,
      itemCount: 5,
      profileUrl: 'https://image.tmdb.org/t/p/w500/villeneuve.jpg',
      titles: [
        { id: 101, title: 'Dune: Part Two', year: 2024, coverArtUrl: null, mediaType: 'movie' },
        { id: 102, title: 'Blade Runner 2049', year: 2017, coverArtUrl: null, mediaType: 'movie' },
      ],
      formats: [
        { format: '4K UHD', count: 4 },
        { format: 'Blu-ray', count: 1 },
      ],
      decades: ['2010', '2020'],
      genres: [{ id: 878, name: 'Science Fiction', count: 4 }],
      earliestYear: 2013,
      latestYear: 2024,
      alsoRoleCount: 0,
      topCollaborators: [
        { name: 'Rebecca Ferguson', role: 'actor', count: 2, titles: ['Dune: Part Two', 'Dune'] },
      ],
    },
    {
      name: 'Clint Eastwood',
      role: 'director',
      count: 3,
      itemCount: 3,
      profileUrl: null,
      titles: [{ id: 201, title: 'Unforgiven', year: 1992, coverArtUrl: null, mediaType: 'movie' }],
      formats: [{ format: '4K UHD', count: 3 }],
      decades: ['1990', '2000'],
      genres: [{ id: 37, name: 'Western', count: 2 }],
      earliestYear: 1992,
      latestYear: 2008,
      alsoRoleCount: 4,
      topCollaborators: [],
    },
    {
      name: 'Greta Gerwig',
      role: 'director',
      count: 1,
      itemCount: 1,
      profileUrl: null,
      titles: [{ id: 301, title: 'Lady Bird', year: 2017, coverArtUrl: null, mediaType: 'movie' }],
      formats: [{ format: 'Blu-ray', count: 1 }],
      decades: ['2010'],
      genres: [{ id: 18, name: 'Drama', count: 1 }],
      earliestYear: 2017,
      latestYear: 2017,
      alsoRoleCount: 0,
      topCollaborators: [],
    },
  ],
  actors: [
    {
      name: 'Rebecca Ferguson',
      role: 'actor',
      count: 4,
      itemCount: 4,
      profileUrl: null,
      titles: [{ id: 101, title: 'Dune: Part Two', year: 2024, coverArtUrl: null, mediaType: 'movie' }],
      formats: [{ format: '4K UHD', count: 4 }],
      decades: ['2010', '2020'],
      genres: [{ id: 878, name: 'Science Fiction', count: 3 }],
      earliestYear: 2015,
      latestYear: 2024,
      alsoRoleCount: 0,
      topCollaborators: [
        { name: 'Denis Villeneuve', role: 'director', count: 2, titles: ['Dune: Part Two', 'Dune'] },
      ],
    },
    {
      name: 'Clint Eastwood',
      role: 'actor',
      count: 4,
      itemCount: 4,
      profileUrl: null,
      titles: [{ id: 201, title: 'Unforgiven', year: 1992, coverArtUrl: null, mediaType: 'movie' }],
      formats: [{ format: '4K UHD', count: 4 }],
      decades: ['1960', '1990'],
      genres: [{ id: 37, name: 'Western', count: 4 }],
      earliestYear: 1966,
      latestYear: 1992,
      alsoRoleCount: 3,
      topCollaborators: [],
    },
  ],
  dualRolePeople: [
    {
      name: 'Clint Eastwood',
      directedCount: 3,
      actedCount: 4,
      totalUniqueTitles: 5,
      profileUrl: null,
      titles: [{ id: 201, title: 'Unforgiven', year: 1992, coverArtUrl: null }],
    },
  ],
  topCollaborations: [
    {
      director: 'Denis Villeneuve',
      directorProfileUrl: 'https://image.tmdb.org/t/p/w500/villeneuve.jpg',
      actor: 'Rebecca Ferguson',
      actorProfileUrl: null,
      count: 2,
      titles: [
        { id: 101, title: 'Dune: Part Two', year: 2024, coverArtUrl: null },
        { id: 100, title: 'Dune', year: 2021, coverArtUrl: null },
      ],
    },
  ],
  availableFormats: ['4K UHD', 'Blu-ray'],
  availableDecades: ['1960', '1990', '2000', '2010', '2020'],
  availableGenres: [
    { id: 878, name: 'Science Fiction', count: 4 },
    { id: 37, name: 'Western', count: 4 },
    { id: 18, name: 'Drama', count: 1 },
  ],
};

describe('PeopleExplorerPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders directors explorer, resolves missing TMDb headshots, and links cards directly to collection filter', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'getPeopleExplorer').mockResolvedValue(samplePeopleExplorer);
    const resolveSpy = vi.spyOn(apiService, 'resolvePersonProfiles').mockResolvedValue({
      'Clint Eastwood': 'https://image.tmdb.org/t/p/w500/eastwood.jpg',
      'Greta Gerwig': null,
    });

    renderWithProviders(<PeopleExplorerPage role="directors" />, {
      initialRoute: '/statistics/directors',
    });

    expect(
      await screen.findByRole('heading', { name: 'Directors in Collection' })
    ).toBeInTheDocument();

    // Resolves missing TMDb photos for visible people
    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith(['Clint Eastwood', 'Greta Gerwig']);
    });

    // Clicking a person card filters the collection directly
    const villeneuveCard = screen.getByRole('link', { name: /Denis Villeneuve/i });
    expect(villeneuveCard).toHaveAttribute('href', '/?director=Denis%20Villeneuve');

    // Dual-role badge is shown on Clint Eastwood
    expect(screen.getByText(/Also acted in 4/i)).toBeInTheDocument();

    // Filter by search query
    const searchInput = screen.getByPlaceholderText(/Search directors by name/i);
    await user.type(searchInput, 'Greta');
    expect(screen.getByRole('link', { name: /Greta Gerwig/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Denis Villeneuve/i })).not.toBeInTheDocument();
  });

  it('toggles Collaborations & Dual-Role spotlight panel and filters by dual role', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'getPeopleExplorer').mockResolvedValue(samplePeopleExplorer);
    vi.spyOn(apiService, 'resolvePersonProfiles').mockResolvedValue({});

    renderWithProviders(<PeopleExplorerPage role="directors" />, {
      initialRoute: '/statistics/directors',
    });

    await screen.findByRole('heading', { name: 'Directors in Collection' });

    // Open Collaborations spotlight
    await user.click(screen.getByRole('button', { name: /Collaborations/i }));
    expect(
      screen.getByRole('heading', { name: /Collaborations & Dual-Role Talent/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2 films →/i })).toHaveAttribute(
      'href',
      '/?director=Denis%20Villeneuve&actor=Rebecca%20Ferguson'
    );

    // Filter to dual-role only
    await user.click(screen.getByRole('button', { name: /Both Director & Actor only/i }));
    expect(screen.getByText(/Showing 1 of 1 director/i)).toBeInTheDocument();
  });
});
