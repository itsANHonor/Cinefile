import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import HistoryPage from './HistoryPage';
import { apiService } from '../services/api.service';
import type { HistoryFeedResponse } from '../types';

const sampleHistoryFeed: HistoryFeedResponse = {
  entries: [
    {
      entryKey: 'event-10',
      eventIds: [10],
      batchKey: null,
      eventType: 'item_added',
      category: 'items',
      effectiveDate: '2026-11-20T18:00:00.000Z',
      occurredAt: '2026-11-20T18:00:00.000Z',
      title: 'Dune: Part Two Steelbook',
      items: [
        {
          eventId: 10,
          physicalItemId: 101,
          name: 'Dune: Part Two Steelbook',
          coverArtUrl: 'https://image.tmdb.org/t/p/w500/dune2.jpg',
          formats: ['4K UHD', 'Blu-ray'],
          editionTags: ['Steelbook'],
          mediaTitles: [{ id: 1, title: 'Dune: Part Two', year: 2024, mediaType: 'movie' }],
          purchaseDate: '2026-11-18',
          occurredAt: '2026-11-20T18:00:00.000Z',
          cost: 34.99,
          storeName: 'GRUV',
          archived: false,
          isUpgrade: true,
          previousFormats: ['Blu-ray'],
        },
      ],
    },
    {
      entryKey: 'batch-items-1',
      eventIds: [7, 8, 9],
      batchKey: 'items-1',
      eventType: 'item_added',
      category: 'items',
      effectiveDate: '2026-11-10T15:00:00.000Z',
      occurredAt: '2026-11-10T15:00:00.000Z',
      title: 'Added 3 items to collection',
      items: [
        {
          eventId: 7,
          physicalItemId: 201,
          name: 'Seven Samurai Criterion',
          coverArtUrl: null,
          formats: ['4K UHD'],
          editionTags: ['Criterion'],
          mediaTitles: [{ id: 2, title: 'Seven Samurai', year: 1954, mediaType: 'movie' }],
          purchaseDate: '2026-11-08',
          occurredAt: '2026-11-10T15:00:00.000Z',
          archived: false,
        },
        {
          eventId: 8,
          physicalItemId: 202,
          name: 'High and Low Criterion',
          coverArtUrl: null,
          formats: ['Blu-ray'],
          editionTags: ['Criterion'],
          mediaTitles: [{ id: 3, title: 'High and Low', year: 1963, mediaType: 'movie' }],
          purchaseDate: '2026-11-08',
          occurredAt: '2026-11-10T15:00:00.000Z',
          archived: false,
        },
        {
          eventId: 9,
          physicalItemId: 203,
          name: 'Ikiru Criterion',
          coverArtUrl: null,
          formats: ['Blu-ray'],
          editionTags: ['Criterion'],
          mediaTitles: [{ id: 4, title: 'Ikiru', year: 1952, mediaType: 'movie' }],
          purchaseDate: '2026-11-08',
          occurredAt: '2026-11-10T15:00:00.000Z',
          archived: false,
        },
      ],
    },
    {
      entryKey: 'event-5',
      eventIds: [5],
      batchKey: null,
      eventType: 'shelf_added',
      category: 'shelves',
      effectiveDate: '2026-10-12T12:00:00.000Z',
      occurredAt: '2026-10-12T12:00:00.000Z',
      title: 'Added shelf "Top Shelf"',
      shelves: [
        {
          eventId: 5,
          shelfId: 12,
          shelfGroupId: 2,
          groupName: 'Living Room Bookcase',
          shelfName: 'Top Shelf',
          capacityUnits: 30,
          widthMm: 450,
        },
      ],
    },
    {
      entryKey: 'event-3',
      eventIds: [3],
      batchKey: null,
      eventType: 'item_archived',
      category: 'archived',
      effectiveDate: '2026-10-05T09:00:00.000Z',
      occurredAt: '2026-10-05T09:00:00.000Z',
      title: 'Dune: Part Two Blu-ray',
      items: [
        {
          eventId: 3,
          physicalItemId: 50,
          name: 'Dune: Part Two Blu-ray',
          coverArtUrl: null,
          formats: ['Blu-ray'],
          editionTags: [],
          mediaTitles: [{ id: 1, title: 'Dune: Part Two', year: 2024, mediaType: 'movie' }],
          purchaseDate: null,
          occurredAt: '2026-10-05T09:00:00.000Z',
          archived: true,
          archiveReason: 'Gifted after 4K upgrade',
        },
      ],
    },
  ],
  totalEntries: 4,
  hasMore: false,
  counts: {
    all: 4,
    items: 2,
    shelves: 1,
    archived: 1,
  },
  itemsWithPurchaseDate: 4,
};

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('renders chronological history entries and expands/collapses bulk item additions', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'getHistory').mockResolvedValue(sampleHistoryFeed);

    renderWithProviders(<HistoryPage />, { initialRoute: '/history' });

    expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument();

    // Month groupings
    expect(screen.getByText('November 2026')).toBeInTheDocument();
    expect(screen.getByText('October 2026')).toBeInTheDocument();

    // Single item with upgrade badge & store/cost
    expect(screen.getByText('Dune: Part Two Steelbook')).toBeInTheDocument();
    expect(screen.getByText('Upgrade from Blu-ray')).toBeInTheDocument();
    expect(screen.getByText(/GRUV · \$34\.99/i)).toBeInTheDocument();

    // Shelf addition & archived item
    expect(screen.getByText('Added shelf "Top Shelf"')).toBeInTheDocument();
    expect(screen.getByText(/Living Room Bookcase · 30 case capacity/i)).toBeInTheDocument();
    expect(screen.getByText('Dune: Part Two Blu-ray')).toBeInTheDocument();
    expect(screen.getByText('Gifted after 4K upgrade')).toBeInTheDocument();

    // Bulk item addition is collapsed initially with preview summary
    const bulkToggle = screen.getByRole('button', { name: /Added 3 items/i });
    expect(bulkToggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByText(/Seven Samurai Criterion, High and Low Criterion, Ikiru Criterion/i)
    ).toBeInTheDocument();

    // Expand bulk list to view individual item rows
    await user.click(bulkToggle);
    expect(bulkToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Seven Samurai Criterion' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'High and Low Criterion' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ikiru Criterion' })).toBeInTheDocument();
  });

  it('renders a private empty state when history_public is disabled for unauthenticated viewers', async () => {
    vi.spyOn(apiService, 'getHistory').mockRejectedValue({
      response: {
        status: 403,
        data: { error: 'Collection history is private.', history_public: false },
      },
    });

    renderWithProviders(<HistoryPage />, { initialRoute: '/history' });

    expect(
      await screen.findByText('Collection history is private')
    ).toBeInTheDocument();
  });

  it('allows an authenticated admin to manually delete an entry from History', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/health')) {
        return new Response(JSON.stringify({ status: 'healthy', mode: 'full', desktop: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    });

    const getHistorySpy = vi
      .spyOn(apiService, 'getHistory')
      .mockResolvedValueOnce(sampleHistoryFeed)
      .mockResolvedValue({
        ...sampleHistoryFeed,
        entries: sampleHistoryFeed.entries.slice(1),
        totalEntries: 3,
      });
    const deleteSpy = vi
      .spyOn(apiService, 'deleteHistoryEvents')
      .mockResolvedValue({ deletedCount: 1, message: 'History entries removed successfully' });

    renderWithProviders(<HistoryPage />, { initialRoute: '/history' });

    const deleteBtn = await screen.findByRole('button', {
      name: 'Remove "Dune: Part Two Steelbook" from history',
    });
    await user.click(deleteBtn);

    // Confirm modal
    const confirmBtn = await screen.findByRole('button', { name: 'Remove from History' });
    await user.click(confirmBtn);

    expect(deleteSpy).toHaveBeenCalledWith([10]);
    expect(getHistorySpy).toHaveBeenCalledTimes(2);
  });
});
