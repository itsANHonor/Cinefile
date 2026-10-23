import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import PhysicalLibraryPage from './PhysicalLibraryPage';
import { apiService } from '../services/api.service';
import type { PhysicalLibrary } from '../types';

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
});
