import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
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

  it('renders series as a top eyebrow above a single-line truncated title while keeping metadata clean', () => {
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
    const seriesEyebrow = screen.getByTestId('media-card-series');
    expect(seriesEyebrow).toHaveTextContent('Christopher Nolan Collection');
    expect(seriesEyebrow).toHaveAttribute('title', 'Christopher Nolan Collection');

    const heading = screen.getByRole('heading', { name: 'Inception Blu-ray' });
    expect(heading).toHaveAttribute('title', 'Inception Blu-ray');
    expect(heading.className).toContain('line-clamp-1');

    const metadata = screen.getByText('2010 · Steelbook Edition');
    expect(metadata).toHaveAttribute('title', '2010 · Steelbook Edition');
    expect(metadata.className).toContain('line-clamp-1');
  });

  it('uses two-line clamp for title when item has no series', () => {
    renderWithProviders(<MediaCard physicalItem={mockItem} />);
    expect(screen.queryByTestId('media-card-series')).not.toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'Inception Blu-ray' });
    expect(heading.className).toContain('line-clamp-2');
    expect(heading.className).toContain('min-h-[2.5rem]');
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
    expect(screen.getByTestId('media-card-series')).toHaveTextContent('Dark Knight Trilogy');
    expect(screen.getByText('2010')).toBeInTheDocument();
  });

  it('crossfades poster image in after onLoad fires', () => {
    const itemWithCover = {
      ...mockItem,
      media: [
        {
          id: 10,
          title: 'Inception',
          release_date: '2010-07-16',
          cover_art_url: 'https://example.com/inception.jpg',
        },
      ],
    } as unknown as import('../types').PhysicalItem;

    renderWithProviders(<MediaCard physicalItem={itemWithCover} />);
    const img = screen.getByRole('img', { name: 'Inception Blu-ray' });
    expect(img.className).toContain('opacity-0');

    fireEvent.load(img);
    expect(img.className).toContain('opacity-100');
  });

  it('renders a fit-framed cover photo letterboxed over an ambient backdrop', () => {
    const itemWithFramedCover = {
      ...mockItem,
      custom_image_url: '/uploads/futurama-box.jpg',
      custom_images: [
        { url: '/uploads/futurama-box.jpg', label: 'Front', frame: { fit: 'fit' } },
      ],
    } as unknown as import('../types').PhysicalItem;

    const { container } = renderWithProviders(<MediaCard physicalItem={itemWithFramedCover} />);
    const img = screen.getByRole('img', { name: 'Inception Blu-ray' });
    expect(img.style.objectFit).toBe('contain');
    const backdrop = container.querySelector('img[aria-hidden="true"].blur-2xl');
    expect(backdrop).toBeInTheDocument();
    expect(backdrop).toHaveAttribute('src', '/uploads/futurama-box.jpg');
  });

  it('renders a fill-framed cover photo with pan position and zoom', () => {
    const itemWithFramedCover = {
      ...mockItem,
      custom_image_url: '/uploads/futurama-box.jpg',
      custom_images: [
        {
          url: '/uploads/futurama-box.jpg',
          label: 'Front',
          frame: { fit: 'fill', panX: 20, panY: 30, zoom: 1.6 },
        },
      ],
    } as unknown as import('../types').PhysicalItem;

    renderWithProviders(<MediaCard physicalItem={itemWithFramedCover} />);
    const img = screen.getByRole('img', { name: 'Inception Blu-ray' });
    expect(img.style.objectFit).toBe('cover');
    expect(img.style.objectPosition).toBe('20% 30%');
    expect(img.style.transform).toBe('scale(1.6)');
    expect(img.style.transformOrigin).toBe('20% 30%');
  });

  it('retries once before showing the fallback icon when cover image fails to load', () => {
    vi.useFakeTimers();
    try {
      const itemWithCover = {
        ...mockItem,
        media: [
          {
            id: 10,
            title: 'Inception',
            release_date: '2010-07-16',
            cover_art_url: 'https://example.com/flaky-poster.jpg',
          },
        ],
      } as unknown as import('../types').PhysicalItem;

      renderWithProviders(<MediaCard physicalItem={itemWithCover} />);
      const firstImg = screen.getByRole('img', { name: 'Inception Blu-ray' });
      fireEvent.error(firstImg);

      // Before retry timer elapses, image is still present
      expect(screen.getByRole('img', { name: 'Inception Blu-ray' })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Retried image is rendered; if it loads on retry, it becomes visible
      const retriedImg = screen.getByRole('img', { name: 'Inception Blu-ray' });
      fireEvent.load(retriedImg);
      expect(retriedImg.className).toContain('opacity-100');
    } finally {
      vi.useRealTimers();
    }
  });
});
