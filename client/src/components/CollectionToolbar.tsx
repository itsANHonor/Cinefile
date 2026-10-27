import React, { useState } from 'react';
import { CollectionParams, CollectionViewMode } from '../hooks/useCollectionParams';
import { SortField } from '../types';
import FilterPanel, { countActiveFilters } from './FilterPanel';
import { Chip } from './ui/Chip';

export interface CollectionToolbarProps {
  params: CollectionParams;
  setParams: (p: Partial<CollectionParams>) => void;
  clearAll: () => void;
  searchInput: string;
  onSearchChange: (q: string) => void;
  availableGenres: Array<{ id: number; name: string }>;
  availableDecades: string[];
  availableEditions?: Array<{ tag: string; count?: number }>;
  availableSeries?: Array<{ id: number; name: string; count?: number }>;
  resultCount?: number;
  isLoading?: boolean;
  showArchivedFilter?: boolean;
  viewMode?: CollectionViewMode;
  shelfActions?: React.ReactNode;
}

const MEDIA_TYPE_LABELS: Record<'all' | 'movie' | 'tv_season', string> = {
  all: 'All',
  movie: 'Movies',
  tv_season: 'TV Shows',
};

const SORT_OPTIONS: Array<{ field: SortField; label: string }> = [
  { field: 'title', label: 'Title' },
  { field: 'series_sort', label: 'Series' },
  { field: 'director_last_name', label: 'Director' },
  { field: 'release_date', label: 'Year' },
  { field: 'created_at', label: 'Added' },
];

const defaultSortOrder = (field: SortField) =>
  ['title', 'series_sort', 'director_last_name'].includes(field) ? 'asc' : 'desc';

const CollectionToolbar: React.FC<CollectionToolbarProps> = ({
  params,
  setParams,
  clearAll,
  searchInput,
  onSearchChange,
  availableGenres,
  availableDecades,
  availableEditions = [],
  availableSeries = [],
  resultCount,
  isLoading,
  showArchivedFilter = false,
  viewMode = 'grid',
  shelfActions,
}) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const selectedEditions = params.editions ?? [];
  const selectedSeries = params.series ?? [];

  const activeFilterCount = countActiveFilters({
    format: params.formats,
    selectedGenres: params.genres,
    selectedDecades: params.decades,
    selectedEditions,
    selectedSeries,
    mediaType: params.type,
    archived: showArchivedFilter && params.archived,
  });
  const hasActiveFilters = activeFilterCount > 0 || Boolean(searchInput);

  const handleSortByChange = (newSortBy: SortField) => {
    if (newSortBy === params.sortBy) {
      setParams({ sortOrder: params.sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      setParams({ sortBy: newSortBy, sortOrder: defaultSortOrder(newSortBy) });
    }
  };

  const handleSortOrderToggle = () => {
    setParams({ sortOrder: params.sortOrder === 'asc' ? 'desc' : 'asc' });
  };

  const genreName = (id: number) =>
    availableGenres.find((g) => g.id === id)?.name ?? `Genre ${id}`;

  const seriesName = (id: number) =>
    availableSeries.find((s) => s.id === id)?.name ?? `Series ${id}`;

  return (
    <div className="sticky top-16 lg:top-16 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-2 bg-white/85 dark:bg-gray-900/85 backdrop-blur border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search collection..."
            className="w-full min-h-11 pl-10 pr-10 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-gray-700 dark:text-gray-100"
          />
          <svg
            className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchInput && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-2.5 h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Clear search"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label="Filter by media type"
          className="hidden sm:inline-flex items-center rounded-lg bg-gray-100 dark:bg-gray-800 p-1 flex-shrink-0"
        >
          {(['all', 'movie', 'tv_season'] as const).map((type) => {
            const isSelected = params.type === type;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={isSelected}
                disabled={isLoading}
                onClick={() => setParams({ type })}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {MEDIA_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setIsFilterOpen(true)}
          disabled={isLoading}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            activeFilterCount > 0
              ? 'border-primary-500 text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50'
              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'
          }`}
          aria-haspopup="dialog"
          aria-expanded={isFilterOpen}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.879a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-primary-600 text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        {viewMode === 'shelf' ? (
          shelfActions
        ) : (
          <>
            <div className="hidden lg:flex items-center gap-1">
              {SORT_OPTIONS.map(({ field, label }) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => handleSortByChange(field)}
                  disabled={isLoading}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    params.sortBy === field
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {label} {params.sortBy === field && (params.sortOrder === 'asc' ? '↑' : '↓')}
                </button>
              ))}
            </div>

            <div className="flex lg:hidden items-center gap-1">
              <label htmlFor="sort-select" className="sr-only">
                Sort by
              </label>
              <select
                id="sort-select"
                value={params.sortBy}
                onChange={(e) => handleSortByChange(e.target.value as SortField)}
                disabled={isLoading}
                className="min-h-11 pl-2 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {SORT_OPTIONS.map(({ field, label }) => (
                  <option key={field} value={field}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleSortOrderToggle}
                disabled={isLoading}
                aria-label="Toggle sort order"
                className="min-h-11 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                {params.sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </>
        )}
      </div>

      {hasActiveFilters && (
        <div className="flex items-center gap-2 mt-2 overflow-x-auto">
          {typeof resultCount === 'number' && (
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap" aria-live="polite">
              {resultCount} result{resultCount === 1 ? '' : 's'}
            </span>
          )}
          {showArchivedFilter && params.archived && (
            <Chip
              label="Archived"
              onRemove={() => setParams({ archived: false })}
            />
          )}
          {params.type !== 'all' && (
            <Chip
              label={MEDIA_TYPE_LABELS[params.type]}
              onRemove={() => setParams({ type: 'all' })}
            />
          )}
          {params.formats.map((fmt) => (
            <Chip
              key={fmt}
              label={fmt}
              onRemove={() => setParams({ formats: params.formats.filter((f) => f !== fmt) })}
            />
          ))}
          {params.genres.map((id) => (
            <Chip
              key={id}
              label={genreName(id)}
              onRemove={() => setParams({ genres: params.genres.filter((g) => g !== id) })}
            />
          ))}
          {params.decades.map((decade) => (
            <Chip
              key={decade}
              label={`${decade}s`}
              onRemove={() => setParams({ decades: params.decades.filter((d) => d !== decade) })}
            />
          ))}
          {selectedEditions.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              onRemove={() =>
                setParams({
                  editions: selectedEditions.filter((e) => e.toLowerCase() !== tag.toLowerCase()),
                })
              }
            />
          ))}
          {selectedSeries.map((id) => (
            <Chip
              key={`series-${id}`}
              label={seriesName(id)}
              onRemove={() =>
                setParams({
                  series: selectedSeries.filter((s) => s !== id),
                })
              }
            />
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 underline underline-offset-2 whitespace-nowrap"
          >
            Clear all
          </button>
        </div>
      )}

      <FilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        format={params.formats}
        selectedGenres={params.genres}
        selectedDecades={params.decades}
        selectedEditions={selectedEditions}
        selectedSeries={selectedSeries}
        availableGenres={availableGenres}
        availableDecades={availableDecades}
        availableEditions={availableEditions}
        availableSeries={availableSeries}
        mediaType={params.type}
        archived={showArchivedFilter ? params.archived : false}
        showArchivedFilter={showArchivedFilter}
        onFormatChange={(format) => {
          const arr = Array.isArray(format) ? format : format === 'all' ? [] : [format];
          setParams({ formats: arr });
        }}
        onGenresChange={(genres) => setParams({ genres })}
        onDecadesChange={(decades) => setParams({ decades })}
        onEditionsChange={(editions) => setParams({ editions })}
        onSeriesChange={(series) => setParams({ series })}
        onMediaTypeChange={(type) => setParams({ type })}
        onArchivedChange={(archived) => setParams({ archived })}
        onClearFilters={clearAll}
        resultCount={resultCount}
      />
    </div>
  );
};

export default CollectionToolbar;
