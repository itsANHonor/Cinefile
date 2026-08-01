import React, { useEffect } from 'react';
import { PhysicalFormat } from '../types';

export const PHYSICAL_FORMAT_OPTIONS: PhysicalFormat[] = [
  '4K UHD',
  '3D Blu-ray',
  'Blu-ray',
  'DVD',
  'Digital-HD',
  'Digital-SD',
  'Digital-UHD',
  'LaserDisc',
  'VHS',
];

interface ActiveFilterInput {
  format: PhysicalFormat | PhysicalFormat[];
  selectedGenres: number[];
  selectedDecades: string[];
  mediaType?: 'all' | 'movie' | 'tv_season';
}

/** Count active filters, excluding the search query which has its own visible input. */
export const countActiveFilters = ({
  format,
  selectedGenres,
  selectedDecades,
  mediaType = 'all',
}: ActiveFilterInput): number => {
  const formatCount = Array.isArray(format) ? format.length : (format === 'all' ? 0 : 1);
  return formatCount + selectedGenres.length + selectedDecades.length + (mediaType === 'all' ? 0 : 1);
};

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  format: PhysicalFormat | PhysicalFormat[];
  selectedGenres: number[];
  selectedDecades: string[];
  availableGenres: Array<{ id: number; name: string }>;
  availableDecades: string[];
  mediaType?: 'all' | 'movie' | 'tv_season';
  onFormatChange: (format: PhysicalFormat | PhysicalFormat[]) => void;
  onGenresChange: (genres: number[]) => void;
  onDecadesChange: (decades: string[]) => void;
  onMediaTypeChange?: (mediaType: 'all' | 'movie' | 'tv_season') => void;
  onClearFilters: () => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  isOpen,
  onClose,
  format,
  selectedGenres,
  selectedDecades,
  availableGenres,
  availableDecades,
  mediaType = 'all',
  onFormatChange,
  onGenresChange,
  onDecadesChange,
  onMediaTypeChange,
  onClearFilters,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleFormatToggle = (formatValue: PhysicalFormat) => {
    const formatArray = Array.isArray(format) ? format : (format === 'all' ? [] : [format]);
    if (formatArray.includes(formatValue)) {
      const newFormats = formatArray.filter(f => f !== formatValue);
      onFormatChange(newFormats.length === 0 ? 'all' : newFormats);
    } else {
      onFormatChange([...formatArray, formatValue]);
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

  if (!isOpen) return null;

  const activeCount = countActiveFilters({ format, selectedGenres, selectedDecades, mediaType });
  const isFormatSelected = (fmt: PhysicalFormat) => Array.isArray(format) ? format.includes(fmt) : format === fmt;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="flex min-h-screen items-start justify-center p-4 pt-16">
        <div
          className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Filter options"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Filters{activeCount > 0 ? ` (${activeCount})` : ''}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Close filters"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {onMediaTypeChange && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Media type</h3>
                <div className="inline-flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  {(['all', 'movie', 'tv_season'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
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
              </section>
            )}

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Formats</h3>
                {(Array.isArray(format) ? format.length > 0 : format !== 'all') && (
                  <button
                    type="button"
                    onClick={() => onFormatChange('all')}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {PHYSICAL_FORMAT_OPTIONS.map((fmt) => (
                  <label
                    key={fmt}
                    className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isFormatSelected(fmt)}
                      onChange={() => handleFormatToggle(fmt)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-900 dark:text-gray-100">{fmt}</span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Genres</h3>
                {selectedGenres.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onGenresChange([])}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
              {availableGenres.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No genres available</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-48 overflow-y-auto">
                  {availableGenres.map((genre) => (
                    <label
                      key={genre.id}
                      className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGenres.includes(genre.id)}
                        onChange={() => handleGenreToggle(genre.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-900 dark:text-gray-100">{genre.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Decades</h3>
                {selectedDecades.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onDecadesChange([])}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
              {availableDecades.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No decades available</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1 max-h-48 overflow-y-auto">
                  {availableDecades.map((decade) => (
                    <label
                      key={decade}
                      className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDecades.includes(decade)}
                        onChange={() => handleDecadeToggle(decade)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-900 dark:text-gray-100">{decade}s</span>
                    </label>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClearFilters} className="btn-secondary text-sm">
              Clear all
            </button>
            <button type="button" onClick={onClose} className="btn-primary text-sm">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;
