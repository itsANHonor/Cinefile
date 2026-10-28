import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterPanel, { countActiveFilters } from './FilterPanel';
import CollectionToolbar from './CollectionToolbar';
import { CollectionParams } from '../hooks/useCollectionParams';

const defaultParams: CollectionParams = {
  q: '',
  formats: [],
  genres: [],
  decades: [],
  editions: [],
  series: [],
  type: 'all',
  archived: false,
  sortBy: 'title',
  sortOrder: 'asc',
  view: 'grid',
};

describe('FilterPanel', () => {
  it('renders into document.body via a portal so it is not clipped by sticky containers', () => {
    const { container } = render(
      <div data-testid="sticky-wrapper" className="sticky top-16 z-20">
        <FilterPanel
          isOpen
          onClose={vi.fn()}
          format={[]}
          selectedGenres={[]}
          selectedDecades={[]}
          availableGenres={[{ id: 1, name: 'Action' }]}
          availableDecades={['2020']}
          mediaType="all"
          onFormatChange={vi.fn()}
          onGenresChange={vi.fn()}
          onDecadesChange={vi.fn()}
          onMediaTypeChange={vi.fn()}
          onClearFilters={vi.fn()}
          resultCount={42}
        />
      </div>
    );

    const dialog = screen.getByRole('dialog', { name: 'Filter options' });
    expect(dialog).toBeInTheDocument();
    const wrapper = screen.getByTestId('sticky-wrapper');
    expect(wrapper.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('allows switching media type between All, Movies, and TV Shows', async () => {
    const user = userEvent.setup();
    const onMediaTypeChange = vi.fn();

    render(
      <FilterPanel
        isOpen
        onClose={vi.fn()}
        format={[]}
        selectedGenres={[]}
        selectedDecades={[]}
        availableGenres={[]}
        availableDecades={[]}
        mediaType="all"
        onFormatChange={vi.fn()}
        onGenresChange={vi.fn()}
        onDecadesChange={vi.fn()}
        onMediaTypeChange={onMediaTypeChange}
        onClearFilters={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Filter options' });
    await user.click(within(dialog).getByRole('button', { name: 'Movies' }));
    expect(onMediaTypeChange).toHaveBeenCalledWith('movie');

    await user.click(within(dialog).getByRole('button', { name: 'TV Shows' }));
    expect(onMediaTypeChange).toHaveBeenCalledWith('tv_season');
  });

  it('counts active filters accurately', () => {
    expect(
      countActiveFilters({
        format: ['4K UHD'],
        selectedGenres: [1, 2],
        selectedDecades: ['1990'],
        selectedEditions: ['Steelbook'],
        selectedSeries: [5],
        mediaType: 'movie',
        archived: true,
      })
    ).toBe(8);
  });
});

describe('CollectionToolbar', () => {
  it('renders a direct media type filter control and updates type when clicked', async () => {
    const user = userEvent.setup();
    const setParams = vi.fn();

    render(
      <CollectionToolbar
        params={defaultParams}
        setParams={setParams}
        clearAll={vi.fn()}
        searchInput=""
        onSearchChange={vi.fn()}
        availableGenres={[]}
        availableDecades={[]}
        resultCount={100}
      />
    );

    const mediaGroup = screen.getByRole('group', { name: 'Filter by media type' });
    expect(within(mediaGroup).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(mediaGroup).getByRole('button', { name: 'Movies' }));
    expect(setParams).toHaveBeenCalledWith({ type: 'movie' });

    await user.click(within(mediaGroup).getByRole('button', { name: 'TV Shows' }));
    expect(setParams).toHaveBeenCalledWith({ type: 'tv_season' });
  });
});
