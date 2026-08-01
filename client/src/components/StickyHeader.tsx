import React, { useState } from 'react';
import { PhysicalFormat, SortField, SortOrder, CollectionStatistics } from '../types';
import { useSidebar } from '../context/SidebarContext';
import FilterPanel, { countActiveFilters } from './FilterPanel';

interface StickyHeaderProps {
  statistics: CollectionStatistics | null;
  isLoadingStats: boolean;
  searchQuery: string;
  format: PhysicalFormat | PhysicalFormat[];
  sortBy: SortField;
  sortOrder: SortOrder;
  selectedGenres: number[];
  selectedDecades: string[];
  availableGenres: Array<{ id: number; name: string }>;
  availableDecades: string[];
  mediaType?: 'all' | 'movie' | 'tv_season';
  onSearchChange: (query: string) => void;
  onFormatChange: (format: PhysicalFormat | PhysicalFormat[]) => void;
  onSortChange: (sortBy: SortField, sortOrder: SortOrder) => void;
  onGenresChange: (genres: number[]) => void;
  onDecadesChange: (decades: string[]) => void;
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

const StickyHeader: React.FC<StickyHeaderProps> = ({
  statistics,
  isLoadingStats,
  searchQuery,
  format,
  sortBy,
  sortOrder,
  selectedGenres,
  selectedDecades,
  availableGenres,
  availableDecades,
  mediaType = 'all',
  onSearchChange,
  onFormatChange,
  onSortChange,
  onGenresChange,
  onDecadesChange,
  onMediaTypeChange,
  onClearFilters,
}) => {
  const { isCollapsed } = useSidebar();
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
      <div className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ease-in-out bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-lg border-b border-gray-200 dark:border-gray-700 ${
        isCollapsed ? 'lg:ml-16' : 'lg:ml-64'
      }`}>
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 py-4">
            {/* Statistics - Compact badges */}
            {statistics && !isLoadingStats && (
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="px-2 py-1 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                  {statistics.totalPhysicalItems} Items
                </span>
                <span className="text-gray-400">|</span>
                <span className="px-2 py-1 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                  {statistics.totalMovies} Movies
                </span>
                {Object.entries(statistics.formatCounts).map(([fmt, count]) => (
                  <React.Fragment key={fmt}>
                    <span className="text-gray-400">|</span>
                    <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                      {count} {fmt === '4K UHD' ? '4K' : fmt === 'Blu-ray' ? 'BR' : fmt}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}

            {isLoadingStats && (
              <div className="flex items-center gap-2">
                <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Search */}
            <div className="relative w-48">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
              <svg
                className="absolute left-2.5 top-2 h-4 w-4 text-gray-400"
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
                  className="absolute right-2.5 top-2 h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label="Clear search"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Filters */}
            <button
              type="button"
              onClick={() => setShowFilterPanel(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              aria-haspopup="dialog"
              aria-expanded={showFilterPanel}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.879a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-primary-600 text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort buttons */}
            <div className="flex items-center gap-1">
              {SORT_OPTIONS.map(({ field, label }) => (
                <button
                  key={field}
                  onClick={() => handleSortByChange(field)}
                  className={`px-2 py-1.5 text-xs rounded transition-colors ${
                    sortBy === field
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {label} {sortBy === field && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
              ))}
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={onClearFilters}
                className="text-xs text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
              >
                Clear
              </button>
            )}
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

export default StickyHeader;
