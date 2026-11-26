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

  it('displays Letterboxd star ratings, liked heart, and last watched date for single and multi-movie items', async () => {
    const user = userEvent.setup();
    const ratedSingleItem: PhysicalItem = {
      ...singleMovieItem,
      media: [
        {
          ...singleMovieItem.media[0],
          letterboxd_rating: 4.5,
          letterboxd_liked: true,
          letterboxd_watched: true,
          letterboxd_last_watched_date: '2026-10-14',
          letterboxd_rewatch: true,
          letterboxd_uri: 'https://letterboxd.com/alex/film/the-big-lebowski/',
        },
      ],
    };

    const { rerender } = render(
      <MediaDetailModal physicalItem={ratedSingleItem} isOpen onClose={vi.fn()} />
    );

    const banner = screen.getByTestId('letterboxd-activity-banner');
    expect(banner).toHaveTextContent('alex');
    expect(banner).toHaveTextContent('★★★★½');
    expect(banner).toHaveTextContent('4.5');
    expect(banner).toHaveTextContent('Liked');
    expect(banner).toHaveTextContent(/Last watched/i);
    expect(banner).not.toHaveTextContent(/Rewatch/i);
    expect(
      within(banner).getByRole('link', { name: /diary entry on Letterboxd/i })
    ).toHaveAttribute('href', 'https://letterboxd.com/alex/film/the-big-lebowski/');

    // Test multi-movie box set with partial Letterboxd watch progress
    const ratedMultiItem: PhysicalItem = {
      ...multiMovieItem,
      media: [
        {
          ...multiMovieItem.media[0],
          letterboxd_rating: 5,
          letterboxd_liked: true,
          letterboxd_watched: true,
          letterboxd_last_watched_date: '2026-09-20',
        },
        {
          ...multiMovieItem.media[1],
          letterboxd_watched: false,
        },
      ],
    };

    rerender(<MediaDetailModal physicalItem={ratedMultiItem} isOpen onClose={vi.fn()} />);

    expect(screen.queryByText('Watched 1 of 2')).not.toBeInTheDocument();
    const watchLog = screen.getByTestId('letterboxd-multi-watch-log');
    expect(watchLog).toHaveTextContent('Letterboxd Watch Log (1 of 2 watched)');
    expect(watchLog).toHaveTextContent('★★★★★');
    expect(watchLog).toHaveTextContent('Unwatched');

    // Clicking the second movie in the watch log switches the active movie
    await user.click(within(watchLog).getByRole('button', { name: /Before Sunset/i }));
    expect(screen.getByRole('heading', { name: 'Before Sunset' })).toBeInTheDocument();
  });

  it('defaults to showing the physical item package photo (custom_image_url) when available and toggles to movie poster', async () => {
    const user = userEvent.setup();
    const itemWithBothPhotos: PhysicalItem = {
      ...singleMovieItem,
      custom_image_url: '/uploads/lebowski-steelbook.jpg',
      media: [
        {
          ...singleMovieItem.media[0],
          cover_art_url: 'https://image.tmdb.org/t/p/w500/lebowski-poster.jpg',
        },
      ],
    };

    render(<MediaDetailModal physicalItem={itemWithBothPhotos} isOpen onClose={vi.fn()} />);

    const mainPoster = screen.getByAltText('The Big Lebowski') as HTMLImageElement;
    expect(mainPoster.getAttribute('src')).toBe('/uploads/lebowski-steelbook.jpg');

    const toggleBtn = screen.getByRole('button', { name: 'Show movie poster' });
    await user.click(toggleBtn);

    expect(mainPoster.getAttribute('src')).toBe('https://image.tmdb.org/t/p/w500/lebowski-poster.jpg');
    expect(screen.getByRole('button', { name: 'Show package photo' })).toBeInTheDocument();
  });

  it('displays Original title subtitle only when original_title differs from title', () => {
    const englishItem: PhysicalItem = {
      ...singleMovieItem,
      media: [{ ...singleMovieItem.media[0], original_title: 'The Big Lebowski' }],
    };

    const { rerender } = render(<MediaDetailModal physicalItem={englishItem} isOpen onClose={vi.fn()} />);
    expect(screen.queryByText(/Original title:/i)).not.toBeInTheDocument();

    const internationalItem: PhysicalItem = {
      ...singleMovieItem,
      name: 'Gigantic Blu-ray',
      media: [
        {
          ...singleMovieItem.media[0],
          title: 'Gigantic',
          original_title: 'Absolute Giganten',
        },
      ],
    };

    rerender(<MediaDetailModal physicalItem={internationalItem} isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Gigantic' })).toBeInTheDocument();
    expect(screen.getByText('Original title: Absolute Giganten')).toBeInTheDocument();
  });

  it('auto-labels 13-digit barcodes as EAN and 12-digit barcodes as UPC alongside ASIN', () => {
    const eanItem: PhysicalItem = {
      ...singleMovieItem,
      barcode: '4006381333931',
      asin: 'B00DU61N52',
    };

    const { rerender } = render(<MediaDetailModal physicalItem={eanItem} isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'EAN' })).toBeInTheDocument();
    expect(screen.getByText('4006381333931')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ASIN' })).toBeInTheDocument();
    expect(screen.getByText('B00DU61N52')).toBeInTheDocument();

    const upcItem: PhysicalItem = {
      ...singleMovieItem,
      barcode: '036000291452',
    };
    rerender(<MediaDetailModal physicalItem={upcItem} isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'UPC' })).toBeInTheDocument();
    expect(screen.getByText('036000291452')).toBeInTheDocument();
  });

  it('renders a package photo gallery with thumbnails, labels, and prev/next navigation when custom_images has multiple photos', async () => {
    const user = userEvent.setup();
    const multiPhotoItem: PhysicalItem = {
      ...singleMovieItem,
      custom_image_url: '/uploads/lebowski-front.jpg',
      custom_images: [
        { url: '/uploads/lebowski-front.jpg', label: 'Front' },
        { url: '/uploads/lebowski-back.jpg', label: 'Back' },
        { url: '/uploads/lebowski-inside.jpg', label: 'Inside' },
      ],
      media: [
        {
          ...singleMovieItem.media[0],
          cover_art_url: 'https://image.tmdb.org/t/p/w500/lebowski-poster.jpg',
        },
      ],
    };

    render(<MediaDetailModal physicalItem={multiPhotoItem} isOpen onClose={vi.fn()} />);

    const mainPoster = screen.getByAltText('The Big Lebowski') as HTMLImageElement;
    expect(mainPoster.getAttribute('src')).toBe('/uploads/lebowski-front.jpg');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    // Thumbnail strip is rendered with all 3 photos
    const thumbStrip = screen.getByTestId('package-photo-thumbnails');
    const thumbButtons = within(thumbStrip).getAllByRole('tab');
    expect(thumbButtons).toHaveLength(3);

    // Click second thumbnail ("Back")
    await user.click(within(thumbStrip).getByRole('tab', { name: /View package photo: Back/i }));
    expect(mainPoster.getAttribute('src')).toBe('/uploads/lebowski-back.jpg');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    // Advance to third photo via Next photo arrow button
    await user.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(mainPoster.getAttribute('src')).toBe('/uploads/lebowski-inside.jpg');
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    // Toggle to movie poster and back to package photos (3)
    await user.click(screen.getByRole('button', { name: 'Show movie poster' }));
    expect(mainPoster.getAttribute('src')).toBe('https://image.tmdb.org/t/p/w500/lebowski-poster.jpg');
    expect(screen.queryByTestId('package-photo-thumbnails')).not.toBeInTheDocument();

    const showPackageBtn = screen.getByRole('button', { name: 'Show package photos (3)' });
    await user.click(showPackageBtn);
    expect(mainPoster.getAttribute('src')).toBe('/uploads/lebowski-inside.jpg');
  });

  it('displays formatted Cost in the physical item overview when cost is provided', () => {
    const pricedItem: PhysicalItem = {
      ...singleMovieItem,
      cost: 34.99,
    };

    render(<MediaDetailModal physicalItem={pricedItem} isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Cost' })).toBeInTheDocument();
    expect(screen.getByText('$34.99')).toBeInTheDocument();
  });

  it('pre-selects initialMediaId in multi-movie items and renders a back button when onBack is provided', async () => {
    const user = userEvent.setup();
    const handleBack = vi.fn();

    render(
      <MediaDetailModal
        physicalItem={multiMovieItem}
        isOpen
        initialMediaId={202}
        backLabel="Before Sunset"
        onBack={handleBack}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Before Sunset' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Before Sunset' }));
    expect(handleBack).toHaveBeenCalledTimes(1);
  });
});
