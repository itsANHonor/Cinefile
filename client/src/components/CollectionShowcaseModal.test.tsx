import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollectionShowcaseModal from './CollectionShowcaseModal';
import { PhysicalItem } from '../types';

const sampleItems: PhysicalItem[] = [
  {
    id: 1,
    name: 'Blade Runner 2049 4K UHD',
    sort_name: 'Blade Runner 2049',
    physical_format: ['4K UHD', 'Blu-ray'],
    edition_notes: 'Steelbook',
    thickness_units: 1,
    shelf_placement: {
      id: 10,
      shelf_id: 2,
      physical_item_id: 1,
      position: 4,
      shelf_display_name: 'Shelf 2',
      group_display_name: 'Main Rack',
    } as any,
    media: [
      {
        id: 101,
        title: 'Blade Runner 2049',
        release_date: '2017-10-06',
        director: 'Denis Villeneuve',
        cast: ['Ryan Gosling', 'Harrison Ford', 'Ana de Armas'],
        synopsis: 'Young Blade Runner K’s discovery of a long-buried secret leads him to track down former Blade Runner Rick Deckard.',
        genres: [{ id: 1, name: 'Sci-Fi' }],
        formats: ['4K UHD'],
      },
    ],
  },
  {
    id: 2,
    name: 'Before Trilogy Criterion Box Set',
    sort_name: 'Before Trilogy',
    physical_format: ['Blu-ray'],
    edition_notes: 'Criterion Collection',
    thickness_units: 3,
    media: [
      {
        id: 201,
        title: 'Before Sunrise',
        release_date: '1995-01-27',
        director: 'Richard Linklater',
        synopsis: 'A young man and woman meet on a train in Europe.',
        formats: ['Blu-ray'],
      },
      {
        id: 202,
        title: 'Before Sunset',
        release_date: '2004-07-02',
        director: 'Richard Linklater',
        synopsis: 'Nine years after Before Sunrise, Jesse and Celine meet again in Paris.',
        formats: ['Blu-ray'],
      },
    ],
  },
];

describe('CollectionShowcaseModal', () => {
  it('does not render when closed', () => {
    render(
      <CollectionShowcaseModal
        isOpen={false}
        onClose={vi.fn()}
        items={sampleItems}
        totalCount={sampleItems.length}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders rich item details including format badges, edition tags, director, synopsis, cast, and shelf location', () => {
    render(
      <CollectionShowcaseModal
        isOpen
        onClose={vi.fn()}
        items={[sampleItems[0]]}
        totalCount={1}
        collectionTitle="My Movies"
      />
    );

    expect(screen.getByRole('dialog', { name: 'My Movies showcase' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Blade Runner 2049 4K UHD' })).toBeInTheDocument();
    expect(screen.getByText('2017')).toBeInTheDocument();
    expect(screen.getByText('Denis Villeneuve')).toBeInTheDocument();
    expect(screen.getByText('4K UHD')).toBeInTheDocument();
    expect(screen.getByText('Steelbook')).toBeInTheDocument();
    expect(screen.getByText('Sci-Fi')).toBeInTheDocument();
    expect(screen.getByText(/Young Blade Runner K/)).toBeInTheDocument();
    expect(screen.getByText(/Ryan Gosling, Harrison Ford/)).toBeInTheDocument();
    expect(screen.getByText(/Main Rack › Shelf 2, Position 5/)).toBeInTheDocument();
  });

  it('displays included titles for multi-title physical box sets', () => {
    render(
      <CollectionShowcaseModal
        isOpen
        onClose={vi.fn()}
        items={[sampleItems[1]]}
        totalCount={1}
      />
    );

    expect(screen.getByRole('heading', { name: 'Before Trilogy Criterion Box Set' })).toBeInTheDocument();
    expect(screen.getByText('Included Titles (2)')).toBeInTheDocument();
    expect(screen.getByText('Before Sunrise')).toBeInTheDocument();
    expect(screen.getByText('Before Sunset')).toBeInTheDocument();
    expect(screen.getByText('1995–2004')).toBeInTheDocument();
  });

  it('supports next/previous navigation, play/pause, shuffle toggle, and Escape to close', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <CollectionShowcaseModal
        isOpen
        onClose={handleClose}
        items={sampleItems}
        totalCount={sampleItems.length}
      />
    );

    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    // Advance to next slide
    await user.click(screen.getByRole('button', { name: 'Next item' }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    // Toggle Play / Pause
    const pauseBtn = screen.getByRole('button', { name: 'Pause showcase' });
    await user.click(pauseBtn);
    expect(screen.getByRole('button', { name: 'Play showcase' })).toBeInTheDocument();

    // Toggle Shuffle off (switches to In Order)
    const shuffleBtn = screen.getByRole('button', { name: 'Toggle shuffle order' });
    expect(shuffleBtn).toHaveAttribute('aria-pressed', 'true');
    await user.click(shuffleBtn);
    expect(shuffleBtn).toHaveAttribute('aria-pressed', 'false');

    // Escape closes the showcase
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('allows switching between transition style presets and persists the selection in localStorage', async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem('showcase_transition_style');

    render(
      <CollectionShowcaseModal
        isOpen
        onClose={vi.fn()}
        items={sampleItems}
        totalCount={sampleItems.length}
      />
    );

    const cascadeBtn = screen.getByRole('button', { name: 'Cascade' });
    const dissolveBtn = screen.getByRole('button', { name: 'Dissolve' });
    const slideBtn = screen.getByRole('button', { name: 'Slide' });
    const zoomBtn = screen.getByRole('button', { name: 'Zoom' });

    expect(cascadeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(dissolveBtn).toHaveAttribute('aria-pressed', 'false');

    await user.click(slideBtn);
    expect(slideBtn).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('showcase_transition_style')).toBe('slide');

    // Pressing 'T' cycles to the next preset ('zoom')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 't' });
    expect(zoomBtn).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('showcase_transition_style')).toBe('zoom');
  });

  it('auto-advances slides after the selected interval', () => {
    vi.useFakeTimers();
    render(
      <CollectionShowcaseModal
        isOpen
        onClose={vi.fn()}
        items={sampleItems}
        totalCount={sampleItems.length}
      />
    );

    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(12000);
    });

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
