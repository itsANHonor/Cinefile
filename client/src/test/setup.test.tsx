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
    vi.spyOn(apiService, 'getStatistics').mockResolvedValue({
      totalPhysicalItems: 0,
      totalMovies: 0,
      totalTVSeasons: 0,
      formatCounts: {} as any,
    });
  };

  it('shows the floating Add item button in admin mode and opens the card flow on click', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    mockCollectionApis();

    renderWithProviders(<CollectionPage />);

    const addButton = await screen.findByRole('button', { name: 'Add item' });
    expect(addButton).toBeInTheDocument();
    expect(addButton).toHaveClass('fixed', 'right-4');

    await user.click(addButton);

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

  it('toggles between Grid and Shelf views and swaps toolbar sort controls for shelf actions', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    mockCollectionApis();
    vi.spyOn(apiService, 'getLibrary').mockResolvedValue({
      id: 1,
      name: 'default',
      display_name: 'My Physical Library',
      groups: [],
    });
    vi.spyOn(apiService, 'getUnassignedItems').mockResolvedValue([]);

    renderWithProviders(<CollectionPage />);

    const gridBtn = await screen.findByRole('button', { name: 'Grid' });
    const shelfBtn = screen.getByRole('button', { name: 'Shelf' });
    expect(gridBtn).toHaveAttribute('aria-pressed', 'true');
    expect(shelfBtn).toHaveAttribute('aria-pressed', 'false');

    // In Grid view, sort controls are visible
    expect(screen.getByRole('button', { name: /Director/i })).toBeInTheDocument();

    // Toggle to Shelf view
    await user.click(shelfBtn);

    expect(shelfBtn).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('heading', { name: 'My Physical Library' })).toBeInTheDocument();

    // Sort controls are replaced with Shelf actions in the toolbar
    expect(screen.queryByRole('button', { name: /Director/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply Sort' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Group' })).toBeInTheDocument();
  });
});
