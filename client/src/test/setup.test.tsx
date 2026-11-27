import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './utils';
import CollectionPage from '../pages/CollectionPage';
import { apiService } from '../services/api.service';

describe('test harness', () => {
  it('renders a simple component through all providers', async () => {
    renderWithProviders(<div data-testid="smoke">ok</div>);
    expect(await screen.findByTestId('smoke')).toHaveTextContent('ok');
  });
});

describe('CollectionPage floating Add item button', () => {
  const mockCollectionApis = () => {
    vi.spyOn(apiService, 'getSettings').mockResolvedValue({
      collection_public: 'true',
      collection_title: 'Media Collection',
      site_title: 'Cinefile',
      items_per_page: '50',
      default_theme: 'system',
      default_sort_by: 'created_at',
      default_sort_order: 'desc',
    });
    vi.spyOn(apiService, 'getFacets').mockResolvedValue({ genres: [], decades: [], formats: [] });
    vi.spyOn(apiService, 'getSeries').mockResolvedValue([]);
    vi.spyOn(apiService, 'getMedia').mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10000, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    });
    vi.spyOn(apiService, 'getPhysicalItems').mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    });
    vi.spyOn(apiService, 'getCollectionMedia').mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    });
    vi.spyOn(apiService, 'getStatistics').mockResolvedValue({
      totalPhysicalItems: 0,
      totalMovies: 0,
      totalTVSeasons: 0,
      formatCounts: {} as any,
    });
  };

  it('shows the header and mobile floating Add item buttons in admin mode and opens the card flow on click', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    mockCollectionApis();

    renderWithProviders(<CollectionPage />);

    const addButtons = await screen.findAllByRole('button', { name: 'Add item' });
    expect(addButtons).toHaveLength(2);
    const headerAddBtn = addButtons.find((btn) => btn.classList.contains('sm:inline-flex'));
    const mobileFabBtn = addButtons.find((btn) => btn.classList.contains('fixed'));
    expect(headerAddBtn).toBeDefined();
    expect(mobileFabBtn).toBeDefined();
    expect(mobileFabBtn).toHaveClass('sm:hidden', 'fixed', 'right-4', 'ring-2');

    await user.click(headerAddBtn!);

    expect(await screen.findByRole('heading', { name: 'Add New Media' })).toBeInTheDocument();
  });

  it('hides the floating Add item button when not authenticated', async () => {
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(false);
    mockCollectionApis();

    renderWithProviders(<CollectionPage />);

    await screen.findByRole('heading', { name: 'Media Collection' });
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();
  });

  it('hides the floating Add item button in read-only mode even if token verifies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ mode: 'readonly' }),
      })
    );
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    mockCollectionApis();

    renderWithProviders(<CollectionPage />);

    await screen.findByRole('heading', { name: 'Media Collection' });
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();
  });

  it('toggles between Items, Titles, and Shelf views and swaps toolbar sort controls for shelf actions', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    mockCollectionApis();
    vi.spyOn(apiService, 'getCollectionMedia').mockResolvedValue({
      items: [
        {
          id: 99,
          title: 'Arrival',
          release_date: '2016-11-11',
          director: 'Denis Villeneuve',
          owned_formats: ['4K UHD'],
          owned_editions: [],
          owned_versions: [],
          physical_item_count: 1,
          physical_items: [],
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    });
    vi.spyOn(apiService, 'getLibrary').mockResolvedValue({
      id: 1,
      name: 'default',
      display_name: 'My Physical Library',
      groups: [],
    });
    vi.spyOn(apiService, 'getUnassignedItems').mockResolvedValue([]);

    renderWithProviders(<CollectionPage />);

    const viewGroup = await screen.findByRole('group', { name: 'Collection view mode' });
    const itemsBtn = viewGroup.querySelector('button:nth-of-type(1)') as HTMLButtonElement;
    const moviesBtn = viewGroup.querySelector('button:nth-of-type(2)') as HTMLButtonElement;
    const shelfBtn = viewGroup.querySelector('button:nth-of-type(3)') as HTMLButtonElement;

    expect(itemsBtn).toHaveTextContent('Items');
    expect(moviesBtn).toHaveTextContent('Titles');
    expect(shelfBtn).toHaveTextContent('Shelf');
    expect(itemsBtn).toHaveAttribute('aria-pressed', 'true');
    expect(moviesBtn).toHaveAttribute('aria-pressed', 'false');
    expect(shelfBtn).toHaveAttribute('aria-pressed', 'false');

    // In Items view, sort controls are visible
    expect(screen.getByRole('button', { name: /Director/i })).toBeInTheDocument();

    // Toggle to Titles view
    await user.click(moviesBtn);
    expect(moviesBtn).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('heading', { name: 'Arrival' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Director/i })).toBeInTheDocument();

    // Toggle to Shelf view
    await user.click(shelfBtn);

    expect(shelfBtn).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('heading', { name: 'My Physical Library' })).toBeInTheDocument();

    // Sort controls are replaced with Shelf actions in the toolbar
    expect(screen.queryByRole('button', { name: /Director/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Organize Rules' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Group' })).toBeInTheDocument();
  });
});
