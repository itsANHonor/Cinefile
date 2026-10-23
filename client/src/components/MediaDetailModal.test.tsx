import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaDetailModal from './MediaDetailModal';
import { PhysicalItem } from '../types';

const singleMovieItem: PhysicalItem = {
  id: 1,
  name: 'The Big Lebowski 4K UHD',
  sort_name: 'Big Lebowski 4K UHD',
  physical_format: ['4K UHD'],
  edition_notes: 'Steelbook, Limited Edition',
  purchase_date: '2025-10-15',
  thickness_units: 1,
  created_at: '2025-11-08T00:00:00.000Z',
  media: [
    {
      id: 101,
      title: 'The Big Lebowski',
      release_date: '1998-03-06',
      director: 'Joel Coen',
      cast: ['Jeff Bridges', 'John Goodman', 'Julianne Moore'],
      synopsis: 'Jeffrey "The Dude" Lebowski is mistaken for a millionaire of the same name.',
      genres: [
        { id: 1, name: 'Comedy' },
        { id: 2, name: 'Crime' },
      ],
      formats: ['4K UHD'],
    },
  ],
};

const multiMovieItem: PhysicalItem = {
  id: 2,
  name: 'Before Trilogy Criterion Box Set',
  sort_name: 'Before Trilogy',
  physical_format: ['Blu-ray'],
  thickness_units: 3,
  created_at: '2025-11-08T00:00:00.000Z',
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
};

describe('MediaDetailModal', () => {
  it('renders the media section above the physical item overview section', () => {
    render(<MediaDetailModal physicalItem={singleMovieItem} isOpen onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    const sections = dialog.querySelectorAll('section');
    expect(sections.length).toBe(2);
    expect(sections[0]).toHaveAttribute('aria-labelledby', 'detail-media-heading');
    expect(sections[1]).toHaveAttribute('aria-labelledby', 'detail-overview-heading');
  });

  it('hides the visible Media (1) heading and deduplicates identical overall formats for single-title items', () => {
    render(<MediaDetailModal physicalItem={singleMovieItem} isOpen onClose={vi.fn()} />);

    expect(screen.queryByText(/Media \(1\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Included Titles/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Overall formats/i)).not.toBeInTheDocument();

    // Movie details and parsed edition chips are rendered
    expect(screen.getByRole('heading', { name: 'The Big Lebowski' })).toBeInTheDocument();
    expect(screen.getByText('1998')).toBeInTheDocument();
    expect(screen.getByText('Joel Coen')).toBeInTheDocument();
    expect(screen.getByText('Steelbook')).toBeInTheDocument();
    expect(screen.getByText('Limited Edition')).toBeInTheDocument();
    expect(screen.getByText('Sort name:').parentElement).toHaveTextContent(
      'Sort name: Big Lebowski 4K UHD'
    );
  });

  it('shows title switcher tabs and Overall formats for multi-title box sets', async () => {
    const user = userEvent.setup();
    render(<MediaDetailModal physicalItem={multiMovieItem} isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Included Titles (2)')).toBeInTheDocument();
    expect(screen.getByText('Overall formats')).toBeInTheDocument();

    // First movie is active initially
    expect(screen.getByRole('heading', { name: 'Before Sunrise' })).toBeInTheDocument();
    expect(
      screen.getByText('A young man and woman meet on a train in Europe.')
    ).toBeInTheDocument();

    // Switch to second movie via tab
    const tablist = screen.getByRole('tablist', { name: /Included titles/i });
    const sunsetTab = within(tablist).getByRole('tab', { name: /Before Sunset/i });
    await user.click(sunsetTab);

    expect(screen.getByRole('heading', { name: 'Before Sunset' })).toBeInTheDocument();
    expect(
      screen.getByText('Nine years after Before Sunrise, Jesse and Celine meet again in Paris.')
    ).toBeInTheDocument();

    // Switch back using Previous title button
    await user.click(screen.getByRole('button', { name: /Previous title/i }));
    expect(screen.getByRole('heading', { name: 'Before Sunrise' })).toBeInTheDocument();
  });

  it('renders an Edit button when onEdit is provided and invokes callback when clicked', async () => {
    const user = userEvent.setup();
    const handleEdit = vi.fn();

    const { rerender } = render(
      <MediaDetailModal physicalItem={singleMovieItem} isOpen onClose={vi.fn()} />
    );
    expect(
      screen.queryByRole('button', { name: `Edit ${singleMovieItem.name}` })
    ).not.toBeInTheDocument();

    rerender(
      <MediaDetailModal
        physicalItem={singleMovieItem}
        isOpen
        onClose={vi.fn()}
        onEdit={handleEdit}
      />
    );

    const editButton = screen.getByRole('button', { name: `Edit ${singleMovieItem.name}` });
    await user.click(editButton);
    expect(handleEdit).toHaveBeenCalledWith(singleMovieItem);
  });
});
