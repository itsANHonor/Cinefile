import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import AdminPage from './AdminPage';
import { apiService } from '../services/api.service';

describe('AdminPage (Settings Hub)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiService, 'getSettings').mockResolvedValue({
      collection_public: 'true',
      site_title: 'Cinefile',
      items_per_page: '24',
      default_theme: 'dark',
      default_sort_by: 'created_at',
      default_sort_order: 'desc',
      collection_title: "Alex's Film Vault",
    });
    vi.spyOn(apiService, 'getSeries').mockResolvedValue([
      {
        id: 1,
        name: 'The Lord of the Rings Collection',
        sort_name: 'Lord of the Rings Collection',
        tmdb_collection_id: 119,
        internal_sort_method: 'chronological',
        movie_count: 3,
      },
      {
        id: 2,
        name: 'Dune Collection',
        sort_name: 'Dune Collection',
        internal_sort_method: 'custom',
        movie_count: 2,
      },
    ]);
  });

  it('renders the sign-in screen when unauthenticated and supports toggling password visibility', async () => {
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(false);
    const user = userEvent.setup();

    renderWithProviders(<AdminPage />, { initialRoute: '/admin' });

    expect(await screen.findByRole('heading', { name: 'Admin Sign In' })).toBeInTheDocument();
    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput.type).toBe('text');
  });

  it('renders the 3-tab Settings Hub (General, Series, Data & Import) without the removed Console tab', async () => {
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);

    renderWithProviders(<AdminPage />, { initialRoute: '/admin' });

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    expect(screen.getByRole('radio', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Series' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Data & Import' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Console/i })).not.toBeInTheDocument();
  });

  it('allows saving the collection title explicitly and toggling collection visibility', async () => {
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    const updateSettingSpy = vi
      .spyOn(apiService, 'updateSetting')
      .mockImplementation(async (key, value) => ({ key, value }));
    const user = userEvent.setup();

    renderWithProviders(<AdminPage />, { initialRoute: '/admin' });

    const titleInput = await screen.findByLabelText('Collection Title');
    expect(titleInput).toHaveValue("Alex's Film Vault");

    const saveButton = screen.getByRole('button', { name: 'Save Title' });
    expect(saveButton).toBeDisabled();

    await user.clear(titleInput);
    await user.type(titleInput, 'Criterion Shelf');
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);
    await waitFor(() => {
      expect(updateSettingSpy).toHaveBeenCalledWith('collection_title', 'Criterion Shelf');
    });

    const publicSwitch = screen.getByRole('switch', { name: 'Make collection public' });
    expect(publicSwitch).toHaveAttribute('aria-checked', 'true');
    await user.click(publicSwitch);
    await waitFor(() => {
      expect(updateSettingSpy).toHaveBeenCalledWith('collection_public', 'false');
    });
  });

  it('displays Series Manager with movie counts, filtering, and auto-derived sort name', async () => {
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    const user = userEvent.setup();

    renderWithProviders(<AdminPage />, { initialRoute: '/admin?tab=series' });

    expect(await screen.findByRole('heading', { name: 'The Lord of the Rings Collection' })).toBeInTheDocument();
    expect(screen.getByText('3 titles')).toBeInTheDocument();
    expect(screen.getByText('TMDb #119')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dune Collection' })).toBeInTheDocument();

    // Filter series
    const filterInput = screen.getByRole('searchbox', { name: 'Filter series' });
    await user.type(filterInput, 'Dune');
    expect(screen.queryByRole('heading', { name: 'The Lord of the Rings Collection' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dune Collection' })).toBeInTheDocument();

    await user.clear(filterInput);

    // Open New Series form and check auto-populated sort_name
    await user.click(screen.getByRole('button', { name: '+ New Series' }));
    const nameInput = screen.getByLabelText(/Series Name/i);
    const sortNameInput = screen.getByLabelText(/Sort Name/i);

    await user.type(nameInput, 'The Matrix Trilogy');
    expect(sortNameInput).toHaveValue('Matrix Trilogy');
  });

  it('displays Data & Import tab with Export, dynamic CSV Schema viewer, and Bulk Add Movies', async () => {
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    vi.spyOn(apiService, 'getImportExportSchema').mockResolvedValue({
      description: 'CSV Import/Export Schema for Cinefile Media Collection',
      encoding: 'UTF-8',
      fields: [
        { name: 'title', type: 'string', required: true, description: 'The title of the media item' },
        { name: 'physical_item_name', type: 'string', required: true, description: 'Name of the physical item' },
        { name: 'formats', type: 'JSON array (string)', required: true, description: 'Physical formats' },
      ],
      example_csv: 'title,physical_item_name,formats\n"The Matrix","The Matrix","[""4K UHD""]"',
    });
    const user = userEvent.setup();

    renderWithProviders(<AdminPage />, { initialRoute: '/admin?tab=data' });

    expect(await screen.findByRole('heading', { name: 'Export Collection Backup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Import Collection from CSV' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bulk Add Movies by Title' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View CSV Schema' }));
    expect(await screen.findByText('CSV Import Schema Reference')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Sample CSV' })).toBeInTheDocument();
  });

  it('allows configuring a TMDb API key from the General Settings tab', async () => {
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    const updateSettingSpy = vi
      .spyOn(apiService, 'updateSetting')
      .mockImplementation(async (key, value) => ({ key, value }));
    const user = userEvent.setup();

    renderWithProviders(<AdminPage />, { initialRoute: '/admin' });

    const apiKeyInput = await screen.findByLabelText('TMDb API Key (v3 auth)');
    const saveApiKeyButton = screen.getByRole('button', { name: 'Save API Key' });
    expect(saveApiKeyButton).toBeDisabled();

    await user.type(apiKeyInput, 'my_custom_tmdb_v3_key');
    expect(saveApiKeyButton).toBeEnabled();

    await user.click(saveApiKeyButton);
    await waitFor(() => {
      expect(updateSettingSpy).toHaveBeenCalledWith('tmdb_api_key', 'my_custom_tmdb_v3_key');
    });
  });

  it('supports Letterboxd RSS sync and confirming fuzzy title match suggestions', async () => {
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    vi.spyOn(apiService, 'getLetterboxdStatus').mockResolvedValue({
      configured: true,
      username: 'alexhsu',
      autoSync: true,
      syncIntervalHours: 4,
      lastSyncAt: '2026-10-27T12:00:00.000Z',
      lastSyncStatus: {
        status: 'success',
        source: 'export',
        syncedAt: '2026-10-27T12:00:00.000Z',
        itemsProcessed: 250,
        totalCached: 250,
        matchedInCollection: 42,
        fuzzySuggestionsCount: 1,
        error: null,
      },
      totalCachedFilms: 250,
      matchedMoviesCount: 42,
      totalCollectionMovies: 50,
      fuzzySuggestions: [
        {
          mediaId: 10,
          mediaTitle: 'Star Wars: Episode IV - A New Hope',
          mediaYear: 1977,
          mediaCoverArtUrl: null,
          mediaDirector: 'George Lucas',
          cacheId: 99,
          letterboxdTitle: 'Star Wars',
          letterboxdYear: 1977,
          rating: 5,
          liked: true,
          lastWatchedDate: '2026-05-04',
          rewatch: true,
          letterboxdUri: 'https://boxd.it/2a2k',
          confidence: 0.95,
          reason: 'Base title matches (with subtitle difference) (1977)',
        },
      ],
    });

    const linkSpy = vi.spyOn(apiService, 'linkLetterboxdMedia').mockResolvedValue({
      media: { id: 10, title: 'Star Wars: Episode IV - A New Hope', letterboxd_rating: 5 },
      status: {
        configured: true,
        username: 'alexhsu',
        autoSync: true,
        syncIntervalHours: 4,
        lastSyncAt: '2026-10-27T12:00:00.000Z',
        lastSyncStatus: null,
        totalCachedFilms: 250,
        matchedMoviesCount: 43,
        totalCollectionMovies: 50,
        fuzzySuggestions: [],
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<AdminPage />, { initialRoute: '/admin' });

    expect(await screen.findByText('Connected: @alexhsu')).toBeInTheDocument();
    const fuzzyReview = screen.getByTestId('letterboxd-fuzzy-review');
    expect(fuzzyReview).toHaveTextContent('Confirm Close Title Matches (1)');
    expect(fuzzyReview).toHaveTextContent('Star Wars: Episode IV - A New Hope');
    expect(fuzzyReview).toHaveTextContent('★★★★★');

    await user.click(screen.getByRole('button', { name: 'Link Match' }));
    await waitFor(() => {
      expect(linkSpy).toHaveBeenCalledWith(10, 99);
    });
  });
});
