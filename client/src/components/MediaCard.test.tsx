import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import MediaCard from './MediaCard';

const mockItem = {
  id: 1,
  name: 'Inception Blu-ray',
  physical_format: ['Blu-ray'],
  media: [
    {
      id: 10,
      title: 'Inception',
      release_date: '2010-07-16',
    },
  ],
  thickness_units: 1,
} as unknown as import('../types').PhysicalItem;

describe('MediaCard', () => {
  it('renders as a focusable button with the item name', () => {
    const handleClick = vi.fn();
    renderWithProviders(<MediaCard physicalItem={mockItem} onClick={handleClick} />);
    const card = screen.getByRole('button', { name: /Open details for Inception Blu-ray/i });
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute('tabIndex', '0');
  });

  it('activates on Enter and Space', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    renderWithProviders(<MediaCard physicalItem={mockItem} onClick={handleClick} />);
    const card = screen.getByRole('button', { name: /Open details for Inception Blu-ray/i });
    card.focus();
    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('fires edit and archive callbacks for admin controls', async () => {
    const user = userEvent.setup();
    const handleEdit = vi.fn();
    const handleArchive = vi.fn();
    renderWithProviders(
      <MediaCard
        physicalItem={mockItem}
        isEditMode
        isAuthenticated
        onEdit={handleEdit}
        onArchive={handleArchive}
      />
    );
    await user.click(screen.getByRole('button', { name: /Edit Inception Blu-ray/i }));
    expect(handleEdit).toHaveBeenCalledWith(mockItem);

    await user.click(screen.getByRole('button', { name: /Archive Inception Blu-ray/i }));
    const reasonInput = screen.getByLabelText(/Archive Reason/i);
    await user.type(reasonInput, 'Given away to friend');
    await user.click(screen.getByRole('button', { name: /Archive Item/i }));
    expect(handleArchive).toHaveBeenCalledWith(mockItem.id, true, 'Given away to friend');
  });

  it('consolidates secondary metadata into a single uniform slot and sets title attributes', () => {
    const richItem = {
      ...mockItem,
      edition_notes: 'Steelbook Edition',
      media: [
        {
          id: 10,
          title: 'Inception',
          release_date: '2010-07-16',
          series: [{ id: 1, name: 'Christopher Nolan Collection' }],
        },
      ],
    } as unknown as import('../types').PhysicalItem;

    renderWithProviders(<MediaCard physicalItem={richItem} />);
    const heading = screen.getByRole('heading', { name: 'Inception Blu-ray' });
    expect(heading).toHaveAttribute('title', 'Inception Blu-ray');
    expect(heading.className).toContain('line-clamp-2');
    expect(heading.className).toContain('min-h-[2.5rem]');

    const metadata = screen.getByText('2010 · Christopher Nolan Collection · Steelbook Edition');
    expect(metadata).toHaveAttribute('title', '2010 · Christopher Nolan Collection · Steelbook Edition');
    expect(metadata.className).toContain('truncate');
  });

  it('shows archived badge and archive reason when item is archived', () => {
    const archivedItem = {
      ...mockItem,
      archived: true,
      archive_reason: 'Given away to friend',
    } as unknown as import('../types').PhysicalItem;

    renderWithProviders(<MediaCard physicalItem={archivedItem} />);
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('2010 · Archived: Given away to friend')).toBeInTheDocument();
  });

  it('aggregates series across all linked media in multi-movie items', () => {
    const multiItem = {
      ...mockItem,
      name: 'Double Feature',
      media: [
        {
          id: 10,
          title: 'Movie One',
          release_date: '2010-07-16',
        },
        {
          id: 11,
          title: 'Movie Two',
          release_date: '2012-07-20',
          series: [{ id: 2, name: 'Dark Knight Trilogy', sort_name: 'Dark Knight Trilogy' }],
        },
      ],
    } as unknown as import('../types').PhysicalItem;

    renderWithProviders(<MediaCard physicalItem={multiItem} />);
    expect(screen.getByText('2010 · Dark Knight Trilogy')).toBeInTheDocument();
  });
});
