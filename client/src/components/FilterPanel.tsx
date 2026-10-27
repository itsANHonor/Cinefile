import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PhysicalFormat } from '../types';
import { PHYSICAL_FORMATS } from '../lib/formats';
import { Chip } from './ui/Chip';
import { lockBodyScroll } from './ui/Sheet';

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface ActiveFilterInput {
  format: PhysicalFormat | PhysicalFormat[];
  selectedGenres: number[];
  selectedDecades: string[];
  selectedEditions?: string[];
  selectedSeries?: number[];
  mediaType?: 'all' | 'movie' | 'tv_season';
  archived?: boolean;
}

/** Count active filters, excluding the search query which has its own visible input. */
export const countActiveFilters = ({
  format,
  selectedGenres,
  selectedDecades,
  selectedEditions = [],
  selectedSeries = [],
  mediaType = 'all',
  archived = false,
}: ActiveFilterInput): number => {
  const formatCount = Array.isArray(format) ? format.length : (format === 'all' ? 0 : 1);
  return (
    formatCount +
    selectedGenres.length +
    selectedDecades.length +
    selectedEditions.length +
    selectedSeries.length +
    (mediaType === 'all' ? 0 : 1) +
    (archived ? 1 : 0)
  );
};

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  format: PhysicalFormat | PhysicalFormat[];
  selectedGenres: number[];
  selectedDecades: string[];
  selectedEditions?: string[];
  selectedSeries?: number[];
  availableGenres: Array<{ id: number; name: string }>;
  availableDecades: string[];
  availableEditions?: Array<{ tag: string; count?: number }>;
  availableSeries?: Array<{ id: number; name: string; count?: number }>;
  mediaType?: 'all' | 'movie' | 'tv_season';
  archived?: boolean;
  showArchivedFilter?: boolean;
  onFormatChange: (format: PhysicalFormat | PhysicalFormat[]) => void;
  onGenresChange: (genres: number[]) => void;
  onDecadesChange: (decades: string[]) => void;
  onEditionsChange?: (editions: string[]) => void;
  onSeriesChange?: (series: number[]) => void;
  onMediaTypeChange?: (mediaType: 'all' | 'movie' | 'tv_season') => void;
  onArchivedChange?: (archived: boolean) => void;
  onClearFilters: () => void;
  resultCount?: number;
}

const MEDIA_TYPE_LABELS: Record<'all' | 'movie' | 'tv_season', string> = {
  all: 'All',
  movie: 'Movies',
  tv_season: 'TV Shows',
};

const FilterPanel: React.FC<FilterPanelProps> = ({
  isOpen,
  onClose,
  format,
  selectedGenres,
  selectedDecades,
  selectedEditions = [],
  selectedSeries = [],
  availableGenres,
  availableDecades,
  availableEditions = [],
  availableSeries = [],
  mediaType = 'all',
  archived = false,
  showArchivedFilter = false,
  onFormatChange,
  onGenresChange,
  onDecadesChange,
  onEditionsChange,
  onSeriesChange,
  onMediaTypeChange,
  onArchivedChange,
  onClearFilters,
  resultCount,
}) => {
  const [genreQuery, setGenreQuery] = useState('');
  const [editionQuery, setEditionQuery] = useState('');
  const [seriesQuery, setSeriesQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement;
    const timer = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(focusableSelector);
      focusable[0]?.focus();
    });
    const restore = lockBodyScroll(true);
    return () => {
      cancelAnimationFrame(timer);
      restore();
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setGenreQuery('');
      setEditionQuery('');
      setSeriesQuery('');
    }
  }, [isOpen]);

  const handleDialogKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

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

  const isEditionSelected = (tag: string) =>
    selectedEditions.some((e) => e.toLowerCase() === tag.toLowerCase());

  const handleEditionToggle = (tag: string) => {
    if (!onEditionsChange) return;
    if (isEditionSelected(tag)) {
      onEditionsChange(selectedEditions.filter((e) => e.toLowerCase() !== tag.toLowerCase()));
    } else {
      onEditionsChange([...selectedEditions, tag]);
    }
  };

  const handleSeriesToggle = (seriesId: number) => {
    if (!onSeriesChange) return;
    if (selectedSeries.includes(seriesId)) {
      onSeriesChange(selectedSeries.filter((id) => id !== seriesId));
    } else {
      onSeriesChange([...selectedSeries, seriesId]);
    }
  };

  const activeCount = countActiveFilters({
    format,
    selectedGenres,
    selectedDecades,
    selectedEditions,
    selectedSeries,
    mediaType,
    archived: showArchivedFilter && archived,
  });
  const isFormatSelected = (fmt: PhysicalFormat) => Array.isArray(format) ? format.includes(fmt) : format === fmt;
  const selectedFormats = Array.isArray(format) ? format : (format === 'all' ? [] : [format]);

  const filteredGenres = useMemo(() => {
    const q = genreQuery.trim().toLowerCase();
    if (!q) return availableGenres;
    return availableGenres.filter(g => g.name.toLowerCase().includes(q));
  }, [availableGenres, genreQuery]);

  const filteredEditions = useMemo(() => {
    const q = editionQuery.trim().toLowerCase();
    if (!q) return availableEditions;
    return availableEditions.filter((e) => e.tag.toLowerCase().includes(q));
  }, [availableEditions, editionQuery]);

  const filteredSeries = useMemo(() => {
    const q = seriesQuery.trim().toLowerCase();
    if (!q) return availableSeries;
    return availableSeries.filter((s) => s.name.toLowerCase().includes(q));
  }, [availableSeries, seriesQuery]);

  const genreName = (id: number) => availableGenres.find(g => g.id === id)?.name ?? `Genre ${id}`;
  const seriesName = (id: number) => availableSeries.find(s => s.id === id)?.name ?? `Series ${id}`;

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center sm:p-4">
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-[fadeIn_150ms_ease-out]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        onKeyDown={handleDialogKeyDown}
        className="relative w-full sm:max-w-2xl bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 max-h-[88dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden outline-none animate-[sheetIn_180ms_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-label="Filter options"
      >
        {/* Drag affordance on mobile */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center flex-shrink-0">
          <div className="h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-3 sm:pt-5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filters</h2>
              {activeCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-primary-600 text-white">
                  {activeCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="px-2.5 py-1 text-xs font-medium rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close filters"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Applied filter summary */}
          {activeCount > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {showArchivedFilter && archived && onArchivedChange && (
                <Chip label="Archived" onRemove={() => onArchivedChange(false)} />
              )}
              {mediaType !== 'all' && onMediaTypeChange && (
                <Chip label={MEDIA_TYPE_LABELS[mediaType]} onRemove={() => onMediaTypeChange('all')} />
              )}
              {selectedFormats.map((fmt) => (
                <Chip key={fmt} label={fmt} onRemove={() => handleFormatToggle(fmt)} />
              ))}
              {selectedGenres.map((id) => (
                <Chip key={id} label={genreName(id)} onRemove={() => handleGenreToggle(id)} />
              ))}
              {selectedDecades.map((decade) => (
                <Chip key={decade} label={`${decade}s`} onRemove={() => handleDecadeToggle(decade)} />
              ))}
              {selectedEditions.map((tag) => (
                <Chip key={tag} label={tag} onRemove={() => handleEditionToggle(tag)} />
              ))}
              {selectedSeries.map((id) => (
                <Chip key={`series-${id}`} label={seriesName(id)} onRemove={() => handleSeriesToggle(id)} />
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 space-y-6 border-t border-gray-100 dark:border-gray-800 pt-5">
          {onMediaTypeChange && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                Media type
              </h3>
              <div className="inline-flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                {(['all', 'movie', 'tv_season'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={mediaType === type}
                    onClick={() => onMediaTypeChange(type)}
                    className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      mediaType === type
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    {MEDIA_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Formats
              </h3>
              {selectedFormats.length > 0 && (
                <button
                  type="button"
                  onClick={() => onFormatChange('all')}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {PHYSICAL_FORMATS.map((fmt) => (
                <Chip
                  key={fmt}
                  label={fmt}
                  selected={isFormatSelected(fmt)}
                  onClick={() => handleFormatToggle(fmt)}
                />
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Genres
              </h3>
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
              <>
                {availableGenres.length > 10 && (
                  <div className="relative mb-3">
                    <input
                      type="text"
                      value={genreQuery}
                      onChange={(e) => setGenreQuery(e.target.value)}
                      placeholder="Find a genre..."
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-primary-500 focus:bg-white dark:focus:bg-gray-900 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface text-gray-900 dark:text-gray-100 placeholder-gray-500"
                    />
                    <svg
                      className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                )}
                {filteredGenres.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No genres match "{genreQuery}"</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {filteredGenres.map((genre) => (
                      <Chip
                        key={genre.id}
                        label={genre.name}
                        selected={selectedGenres.includes(genre.id)}
                        onClick={() => handleGenreToggle(genre.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Decades
              </h3>
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
              <div className="flex flex-wrap gap-2">
                {availableDecades.map((decade) => (
                  <Chip
                    key={decade}
                    label={`${decade}s`}
                    selected={selectedDecades.includes(decade)}
                    onClick={() => handleDecadeToggle(decade)}
                  />
                ))}
              </div>
            )}
          </section>

          {onSeriesChange && (
            <section>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Series
                </h3>
                {selectedSeries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onSeriesChange([])}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
              {availableSeries.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No series available</p>
              ) : (
                <>
                  {availableSeries.length > 10 && (
                    <div className="relative mb-3">
                      <input
                        type="text"
                        value={seriesQuery}
                        onChange={(e) => setSeriesQuery(e.target.value)}
                        placeholder="Find a series..."
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-primary-500 focus:bg-white dark:focus:bg-gray-900 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface text-gray-900 dark:text-gray-100 placeholder-gray-500"
                      />
                      <svg
                        className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  )}
                  {filteredSeries.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No series match "{seriesQuery}"
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {filteredSeries.map((s) => (
                        <Chip
                          key={s.id}
                          label={s.name}
                          count={s.count}
                          selected={selectedSeries.includes(s.id)}
                          onClick={() => handleSeriesToggle(s.id)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {onEditionsChange && (
            <section>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Edition Tags
                </h3>
                {selectedEditions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onEditionsChange([])}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
              {availableEditions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No edition tags available</p>
              ) : (
                <>
                  {availableEditions.length > 10 && (
                    <div className="relative mb-3">
                      <input
                        type="text"
                        value={editionQuery}
                        onChange={(e) => setEditionQuery(e.target.value)}
                        placeholder="Find an edition tag..."
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-primary-500 focus:bg-white dark:focus:bg-gray-900 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface text-gray-900 dark:text-gray-100 placeholder-gray-500"
                      />
                      <svg
                        className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  )}
                  {filteredEditions.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No edition tags match "{editionQuery}"
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {filteredEditions.map((edition) => (
                        <Chip
                          key={edition.tag}
                          label={edition.tag}
                          count={edition.count}
                          selected={isEditionSelected(edition.tag)}
                          onClick={() => handleEditionToggle(edition.tag)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {showArchivedFilter && onArchivedChange && (
            <section>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Status
                </h3>
              </div>
              <div className="inline-flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <button
                  type="button"
                  aria-pressed={!archived}
                  onClick={() => onArchivedChange(false)}
                  className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    !archived
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  In Collection
                </button>
                <button
                  type="button"
                  aria-pressed={archived}
                  onClick={() => onArchivedChange(true)}
                  className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    archived
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Archived
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80 rounded-b-2xl">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {activeCount === 0 ? 'No filters applied' : `${activeCount} filter${activeCount === 1 ? '' : 's'} applied`}
          </span>
          <button type="button" onClick={onClose} className="btn-primary text-sm">
            {typeof resultCount === 'number'
              ? `Show ${resultCount} result${resultCount === 1 ? '' : 's'}`
              : 'Show results'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FilterPanel;
