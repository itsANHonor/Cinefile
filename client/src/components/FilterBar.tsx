import React, { useState } from 'react';
import { PhysicalFormat, SortField, SortOrder } from '../types';
import ThemeToggle from './ThemeToggle';
import FormatBadgeToggle from './FormatBadgeToggle';
import FilterPanel, { countActiveFilters } from './FilterPanel';

interface FilterBarProps {
  format: PhysicalFormat | PhysicalFormat[];
  sortBy: SortField;
  sortOrder: SortOrder;
  searchQuery: string;
  selectedGenres: number[];
  selectedDecades: string[];
  availableGenres: Array<{ id: number; name: string }>;
  availableDecades: string[];
  mediaType?: 'all' | 'movie' | 'tv_season';
  onFormatChange: (format: PhysicalFormat | PhysicalFormat[]) => void;
  onGenresChange: (genres: number[]) => void;
  onDecadesChange: (decades: string[]) => void;
  onSortChange: (sortBy: SortField, sortOrder: SortOrder) => void;
  onSearchChange: (query: string) => void;
  onMediaTypeChange?: (mediaType: 'all' | 'movie' | 'tv_season') => void;
  onClearFilters: () => void;
}

const SORT_OPTIONS: Array<{ field: SortField; label: string }> = [
  { field: 'title', label: 'Title' },
  { field: 'series_sort', label: 'Series' },
  { field: 'director_last_name', label: 'Director' },
  { field: 'release_date', label: 'Year' },
  { field: 'created_at', label: 'Added' },
];

const FilterBar: React.FC<FilterBarProps> = ({
  format,
  sortBy,
  sortOrder,
  searchQuery,
  selectedGenres,
  selectedDecades,
  availableGenres,
  availableDecades,
  mediaType = 'all',
  onFormatChange,
  onGenresChange,
  onDecadesChange,
  onSortChange,
  onSearchChange,
  onMediaTypeChange,
  onClearFilters,
}) => {
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const handleSortByChange = (newSortBy: SortField) => {
    if (newSortBy === sortBy) {
      // Toggle sort order
      onSortChange(sortBy, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Default to ascending for alphabetical sorts, descending for others
      const defaultOrder = ['title', 'series_sort', 'director_last_name'].includes(newSortBy) ? 'asc' : 'desc';
      onSortChange(newSortBy, defaultOrder);
    }
  };

  const activeFilterCount = countActiveFilters({ format, selectedGenres, selectedDecades, mediaType });
  const hasActiveFilters = activeFilterCount > 0 || Boolean(searchQuery);

  return (
    <>
      <div className="card mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
          {/* Search + Filters */}
          <div className="flex gap-2 items-center flex-1">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search collection..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
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
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-2.5 h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label="Clear search"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowFilterPanel(true)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              aria-haspopup="dialog"
              aria-expanded={showFilterPanel}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.879a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-primary-600 text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {hasActiveFilters && (
              <button
                onClick={onClearFilters}
                className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>

          {/* Sort + display toggles */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sort by:</label>
              <div className="flex flex-wrap gap-2">
                {SORT_OPTIONS.map(({ field, label }) => (
                  <button
                    key={field}
                    onClick={() => handleSortByChange(field)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      sortBy === field
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {label} {sortBy === field && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <FormatBadgeToggle />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      <FilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        format={format}
        selectedGenres={selectedGenres}
        selectedDecades={selectedDecades}
        availableGenres={availableGenres}
        availableDecades={availableDecades}
        mediaType={mediaType}
        onFormatChange={onFormatChange}
        onGenresChange={onGenresChange}
        onDecadesChange={onDecadesChange}
        onMediaTypeChange={onMediaTypeChange}
        onClearFilters={onClearFilters}
      />
    </>
  );
};

export default FilterBar;
