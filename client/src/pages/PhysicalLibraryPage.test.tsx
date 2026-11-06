import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import PhysicalLibraryPage, { libraryCollisionDetection } from './PhysicalLibraryPage';
import { apiService } from '../services/api.service';
import type { PhysicalLibrary, PhysicalItem } from '../types';

const sampleLibrary: PhysicalLibrary = {
  id: 1,
  name: 'default',
  display_name: 'My Physical Library',
  groups: [
    {
      id: 10,
      library_id: 1,
      name: 'living_room',
      display_name: 'Living Room',
      sort_order: 0,
      shelves: [
        {
          id: 100,
          group_id: 10,
          name: 'living_room_-_shelf_1',
          display_name: 'Living Room - Shelf 1',
          capacity_units: 20,
          sort_order: 0,
          placements: [],
          used_units: 0,
        },
      ],
    },
  ],
};

describe('PhysicalLibraryPage Add Shelf / Bulk Add', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ mode: 'admin' }),
    } as Response);
    vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
    vi.spyOn(apiService, 'getLibrary').mockResolvedValue(sampleLibrary);
    vi.spyOn(apiService, 'getUnassignedItems').mockResolvedValue([]);
  });

  it('switches between Single Shelf and Bulk Add modes and submits bulk shelf creation with group-prefixed preview', async () => {
    const user = userEvent.setup();
    const bulkCreateSpy = vi.spyOn(apiService, 'bulkCreateShelves').mockResolvedValue([]);

    renderWithProviders(<PhysicalLibraryPage />, { initialRoute: '/library' });

    const addShelfButton = await screen.findByRole('button', {
      name: /Add shelf to Living Room/i,
    });
    await user.click(addShelfButton);

    expect(screen.getByRole('dialog', { name: /Add Shelf/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Display Name/i)).toBeInTheDocument();

    // Switch to Bulk Add mode
    await user.click(screen.getByRole('radio', { name: /Bulk Add/i }));

    expect(screen.getByRole('dialog', { name: /Bulk Add Shelves/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Display Name/i)).not.toBeInTheDocument();

    // Default count is 5, starting at Shelf 2 since Shelf 1 already exists
    expect(screen.getByText(/Living Room - Shelf 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Living Room - Shelf 6/i)).toBeInTheDocument();

    // Select preset count of 3 and preset width of 30 cases
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: '30 cases' }));

    expect(screen.getByText(/90 total units/i)).toBeInTheDocument();
    expect(screen.getByText(/Living Room - Shelf 4/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Create 3 Shelves/i }));

    expect(bulkCreateSpy).toHaveBeenCalledWith(10, {
      count: 3,
      capacity_units: 30,
    });
  });

  it('preserves unassigned search query and collapsed group state when library refreshes after shelf actions', async () => {
    const user = userEvent.setup();

    const sampleItem1: PhysicalItem = {
      id: 501,
      name: 'The Avengers',
      physical_format: ['Blu-ray'],
      thickness_units: 1,
      media: [],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    const sampleItem2: PhysicalItem = {
      id: 502,
      name: 'Avengers: Age of Ultron',
      physical_format: ['Blu-ray'],
      thickness_units: 1,
      media: [],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const libraryWithTwoGroups: PhysicalLibrary = {
      id: 1,
      name: 'default',
      display_name: 'My Physical Library',
      groups: [
        {
          id: 10,
          library_id: 1,
          name: 'living_room',
          display_name: 'Living Room',
          sort_order: 0,
          shelves: [
            {
              id: 100,
              group_id: 10,
              name: 'living_room_-_shelf_1',
              display_name: 'Living Room - Shelf 1',
              capacity_units: 20,
              sort_order: 0,
              placements: [
                {
                  id: 900,
                  shelf_id: 100,
                  physical_item_id: 501,
                  position: 0,
                  physical_item: sampleItem1,
                },
              ],
              used_units: 1,
            },
          ],
        },
        {
          id: 20,
          library_id: 1,
          name: 'bedroom',
          display_name: 'Bedroom',
          sort_order: 1,
          shelves: [
            {
              id: 200,
              group_id: 20,
              name: 'bedroom_-_shelf_1',
              display_name: 'Bedroom - Shelf 1',
              capacity_units: 20,
              sort_order: 0,
              placements: [],
              used_units: 0,
            },
          ],
        },
      ],
    };

    // Make getLibrary resolve asynchronously on subsequent calls so isLoading transition is observable
    let resolveReload: (lib: PhysicalLibrary) => void = () => {};
    vi.spyOn(apiService, 'getLibrary')
      .mockResolvedValueOnce(libraryWithTwoGroups)
      .mockImplementation(
        () =>
          new Promise<PhysicalLibrary>((resolve) => {
            resolveReload = resolve;
          })
      );

    const getUnassignedSpy = vi
      .spyOn(apiService, 'getUnassignedItems')
      .mockImplementation(async (search?: string) => {
        if (search === 'avengers') {
          return [sampleItem2];
        }
        return [sampleItem1, sampleItem2];
      });

    vi.spyOn(apiService, 'removePlacement').mockResolvedValue(undefined);

    renderWithProviders(<PhysicalLibraryPage />, { initialRoute: '/library' });

    // Both groups and their shelves are initially visible
    expect(await screen.findByText('Living Room - Shelf 1')).toBeInTheDocument();
    expect(screen.getByText('Bedroom - Shelf 1')).toBeInTheDocument();

    // Collapse the second group ("Bedroom")
    await user.click(screen.getByText('Bedroom'));
    expect(screen.queryByText('Bedroom - Shelf 1')).not.toBeInTheDocument();

    // Open Unassigned Items panel and type in the search box
    await user.click(screen.getByRole('button', { name: /Unassigned Items/i }));
    const searchInput = await screen.findByPlaceholderText('Search unassigned items...');
    await user.type(searchInput, 'avengers');
    expect(searchInput).toHaveValue('avengers');

    await waitFor(() => {
      expect(getUnassignedSpy).toHaveBeenCalledWith('avengers');
    });

    // Trigger a shelf action that reloads the library and refreshes unassigned items
    const removeBtn = screen.getByRole('button', { name: /Remove The Avengers from shelf/i });
    await user.click(removeBtn);

    // Finish the reload
    resolveReload({
      ...libraryWithTwoGroups,
      groups: [
        {
          ...libraryWithTwoGroups.groups[0],
          shelves: [
            {
              ...libraryWithTwoGroups.groups[0].shelves[0],
              placements: [],
              used_units: 0,
            },
          ],
        },
        libraryWithTwoGroups.groups[1],
      ],
    });

    await waitFor(() => {
      expect(apiService.removePlacement).toHaveBeenCalledWith(900);
    });

    // Search input should still have "avengers" and not have been cleared by an unmount
    expect(screen.getByPlaceholderText('Search unassigned items...')).toHaveValue('avengers');
    // Collapsed group ("Bedroom") should remain collapsed
    expect(screen.queryByText('Bedroom - Shelf 1')).not.toBeInTheDocument();
  });

  it('keeps hover poster overlay non-interactive (pointer-events-none) so adjacent shelf items remain hoverable', async () => {
    const user = userEvent.setup();

    const itemWithCover: PhysicalItem = {
      id: 601,
      name: 'Blade Runner 2049',
      physical_format: ['4K UHD'],
      thickness_units: 1,
      custom_image_url: '/uploads/br2049.jpg',
      media: [],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    const itemWithoutCover: PhysicalItem = {
      id: 602,
      name: 'Dune',
      physical_format: ['4K UHD'],
      thickness_units: 1,
      media: [],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    vi.spyOn(apiService, 'getLibrary').mockResolvedValue({
      ...sampleLibrary,
      groups: [
        {
          ...sampleLibrary.groups[0],
          shelves: [
            {
              ...sampleLibrary.groups[0].shelves[0],
              placements: [
                {
                  id: 910,
                  shelf_id: 100,
                  physical_item_id: 601,
                  position: 0,
                  physical_item: itemWithCover,
                },
                {
                  id: 911,
                  shelf_id: 100,
                  physical_item_id: 602,
                  position: 1,
                  physical_item: itemWithoutCover,
                },
              ],
              used_units: 2,
            },
          ],
        },
      ],
    });

    renderWithProviders(<PhysicalLibraryPage />, { initialRoute: '/library' });

    const firstSpine = await screen.findByRole('button', {
      name: /Open details for Blade Runner 2049/i,
    });
    await user.hover(firstSpine);

    // The hover overlay container should exist and none of its elements should have pointer-events-auto
    const overlayWrapper = firstSpine.parentElement?.querySelector('.pointer-events-none');
    expect(overlayWrapper).toBeInTheDocument();
    expect(overlayWrapper?.querySelector('.pointer-events-auto')).toBeNull();

    // Hovering the second item (no cover) should also have no pointer-events-auto inside its hover overlay
    const secondSpine = screen.getByRole('button', {
      name: /Open details for Dune/i,
    });
    await user.hover(secondSpine);
    const secondOverlayWrapper = secondSpine.parentElement?.querySelector('.pointer-events-none');
    expect(secondOverlayWrapper).toBeInTheDocument();
    expect(secondOverlayWrapper?.querySelector('.pointer-events-auto')).toBeNull();
  });

  it('resolves unassigned-droppable when dragging a shelf placement over the Unassigned Items panel even when shelf-group or shelf centers are closer', () => {
    const makeContainer = (id: string, type: string, rect: { top: number; left: number; width: number; height: number }) => ({
      id,
      key: id,
      disabled: false,
      node: { current: null },
      rect: {
        current: {
          ...rect,
          bottom: rect.top + rect.height,
          right: rect.left + rect.width,
        },
      },
      data: { current: { type } },
    });

    const activeRect = { top: 610, left: 60, bottom: 870, right: 100, width: 40, height: 260 };
    // Group container covers a huge vertical area whose center is closer to the pointer than the wide Unassigned panel center
    const groupContainer = makeContainer('group-10', 'shelf-group', { top: 100, left: 0, width: 300, height: 500 });
    const shelfSortableContainer = makeContainer('sortable-shelf-100', 'shelf', { top: 300, left: 0, width: 200, height: 280 });
    const unassignedContainer = makeContainer('unassigned-droppable', 'unassigned-container', { top: 620, left: 0, width: 1600, height: 300 });

    const collisions = libraryCollisionDetection({
      active: {
        id: 'placement-900',
        data: { current: { type: 'placement', placement: { id: 900, shelf_id: 100 } } },
        rect: { current: { initial: activeRect, translated: activeRect } },
      } as any,
      collisionRect: activeRect,
      droppableContainers: [groupContainer, shelfSortableContainer, unassignedContainer] as any,
      droppableRects: new Map([
        ['group-10', groupContainer.rect.current],
        ['sortable-shelf-100', shelfSortableContainer.rect.current],
        ['unassigned-droppable', unassignedContainer.rect.current],
      ]) as any,
      pointerCoordinates: { x: 80, y: 650 },
    });

    expect(collisions.length).toBeGreaterThan(0);
    expect(collisions[0].id).toBe('unassigned-droppable');
  });
});
