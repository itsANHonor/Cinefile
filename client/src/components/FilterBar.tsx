import React, { useState, useRef, useEffect } from 'react';
import { PhysicalFormat, SortField, SortOrder } from '../types';
import ThemeToggle from './ThemeToggle';

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
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);
  const [showDecadeDropdown, setShowDecadeDropdown] = useState(false);
  const [showFormatDropdown, setShowFormatDropdown] = useState(false);
  const genreDropdownRef = useRef<HTMLDivElement>(null);
  const decadeDropdownRef = useRef<HTMLDivElement>(null);
  const formatDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(event.target as Node)) {
        setShowGenreDropdown(false);
      }
      if (decadeDropdownRef.current && !decadeDropdownRef.current.contains(event.target as Node)) {
        setShowDecadeDropdown(false);
      }
      if (formatDropdownRef.current && !formatDropdownRef.current.contains(event.target as Node)) {
        setShowFormatDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleGenreToggle = (genreId: number) => {
    if (selectedGenres.includes(genreId)) {
      onGenresChange(selectedGenres.filter(id => id !== genreId));
    } else {
      onGenresChange([...selectedGenres, genreId]);
    }
  };

  const handleDecadeToggle = (decade: string) => {
    if (selectedDecades.includes(decade)) {
      onDecadesChange(selectedDecades.filter(d => d !== decade));
    } else {
      onDecadesChange([...selectedDecades, decade]);
    }
  };

  const handleFormatToggle = (formatValue: PhysicalFormat) => {
    if (formatValue === 'all') {
      onFormatChange('all');
    } else {
      const formatArray = Array.isArray(format) ? format : (format === 'all' ? [] : [format]);
      if (formatArray.includes(formatValue)) {
        const newFormats = formatArray.filter(f => f !== formatValue);
        onFormatChange(newFormats.length === 0 ? 'all' : newFormats);
      } else {
        onFormatChange([...formatArray, formatValue]);
      }
    }
  };

  const formatDisplay = Array.isArray(format) 
    ? (format.length === 0 ? 'All Formats' : `${format.length} selected`)
    : (format === 'all' ? 'All Formats' : format);

  const hasActiveFilters = searchQuery || 
    (Array.isArray(format) ? format.length > 0 : format !== 'all') || 
    selectedGenres.length > 0 || 
    selectedDecades.length > 0 ||
    mediaType !== 'all';

  return (
    <div className="card mb-6">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center flex-1">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
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
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Media Type Filter */}
          {onMediaTypeChange && (
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              {(['all', 'movie', 'tv_season'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => onMediaTypeChange(type)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mediaType === type
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  {type === 'all' ? 'All' : type === 'movie' ? 'Movies' : 'TV Shows'}
                </button>
              ))}
            </div>
          )}

          {/* Format Filter - Multi-select */}
          <div className="flex items-center gap-2 relative" ref={formatDropdownRef}>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Format:</label>
            <div className="relative">
              <button
                onClick={() => setShowFormatDropdown(!showFormatDropdown)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[120px] text-left flex items-center justify-between"
              >
                <span>{formatDisplay}</span>
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showFormatDropdown && (
                <div className="absolute z-50 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  <div className="p-2">
                    <label className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Array.isArray(format) ? format.length === 0 : format === 'all'}
                        onChange={() => handleFormatToggle('all')}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-900 dark:text-gray-100">All Formats</span>
                    </label>
                    {(['4K UHD', 'Blu-ray', 'DVD', 'Digital-HD', 'Digital-SD', 'Digital-UHD', 'LaserDisc', 'VHS'] as PhysicalFormat[]).map((fmt) => {
                      const isChecked = Array.isArray(format) ? format.includes(fmt) : false;
                      return (
                        <label key={fmt} className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleFormatToggle(fmt)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-900 dark:text-gray-100">{fmt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Genre Filter - Multi-select */}
          <div className="flex items-center gap-2 relative" ref={genreDropdownRef}>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Genres:</label>
            <div className="relative">
              <button
                onClick={() => setShowGenreDropdown(!showGenreDropdown)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[120px] text-left flex items-center justify-between"
              >
                <span>{selectedGenres.length === 0 ? 'All Genres' : `${selectedGenres.length} selected`}</span>
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showGenreDropdown && (
                <div className="absolute z-50 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  <div className="p-2">
                    {availableGenres.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No genres available</p>
                    ) : (
                      availableGenres.map((genre) => (
                        <label key={genre.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedGenres.includes(genre.id)}
                            onChange={() => handleGenreToggle(genre.id)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-900 dark:text-gray-100">{genre.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Decade Filter - Multi-select */}
          <div className="flex items-center gap-2 relative" ref={decadeDropdownRef}>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Decade:</label>
            <div className="relative">
              <button
                onClick={() => setShowDecadeDropdown(!showDecadeDropdown)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[120px] text-left flex items-center justify-between"
              >
                <span>{selectedDecades.length === 0 ? 'All Decades' : `${selectedDecades.length} selected`}</span>
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showDecadeDropdown && (
                <div className="absolute z-50 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  <div className="p-2">
                    {availableDecades.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No decades available</p>
                    ) : (
                      availableDecades.map((decade) => (
                        <label key={decade} className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedDecades.includes(decade)}
                            onChange={() => handleDecadeToggle(decade)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-900 dark:text-gray-100">{decade}s</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sort Options */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sort by:</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSortByChange('title')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  sortBy === 'title'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Title {sortBy === 'title' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <button
                onClick={() => handleSortByChange('series_sort')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  sortBy === 'series_sort'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Series {sortBy === 'series_sort' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <button
                onClick={() => handleSortByChange('director_last_name')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  sortBy === 'director_last_name'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Director {sortBy === 'director_last_name' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <button
                onClick={() => handleSortByChange('release_date')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  sortBy === 'release_date'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Year {sortBy === 'release_date' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <button
                onClick={() => handleSortByChange('created_at')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  sortBy === 'created_at'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Added {sortBy === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
            </div>
          </div>
        </div>

        {/* Clear Filters & Theme Toggle */}
        <div className="flex items-center gap-4">
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
            >
              Clear Filters
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
};

export default FilterBar;

