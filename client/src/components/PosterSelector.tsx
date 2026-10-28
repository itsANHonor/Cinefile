import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api.service';
import { CoverCandidate } from '../types';

export interface PosterMovieOption {
  tmdbId: number;
  title: string;
  mediaType?: 'movie' | 'tv_season';
  seasonNumber?: number | null;
}

export interface PosterSelectorProps {
  tmdbId?: number | null;
  movieTitle: string;
  onSelect: (url: string) => void;
  onClose: () => void;
  currentPosterUrl?: string;
  mediaType?: 'movie' | 'tv_season';
  seasonNumber?: number | null;
  initialQuery?: string;
  defaultTab?: 'boxart' | 'tmdb' | 'url';
  movieOptions?: PosterMovieOption[];
}

const QUICK_FILTER_CHIPS = [
  '4K UHD',
  'Blu-ray',
  'Steelbook',
  'Criterion',
  'Collector\'s Edition',
  'DVD',
];

const SOURCE_BADGE_CLASSES: Record<string, string> = {
  amazon: 'bg-amber-500/90 text-gray-950 font-bold',
  bluray: 'bg-blue-600/90 text-white font-semibold',
  tmdb: 'bg-emerald-600/90 text-white font-semibold',
  url: 'bg-purple-600/90 text-white font-semibold',
};

const SOURCE_LABELS: Record<string, string> = {
  amazon: 'Amazon',
  bluray: 'Blu-ray.com',
  tmdb: 'TMDb',
  url: 'Direct URL',
};

const PosterSelector: React.FC<PosterSelectorProps> = ({
  tmdbId,
  movieTitle,
  onSelect,
  onClose,
  currentPosterUrl,
  mediaType,
  seasonNumber,
  initialQuery,
  defaultTab,
  movieOptions,
}) => {
  const effectiveMovieOptions: PosterMovieOption[] =
    movieOptions && movieOptions.length > 0
      ? movieOptions
      : tmdbId
        ? [{ tmdbId, title: movieTitle, mediaType, seasonNumber }]
        : [];

  const hasTmdbSupport = effectiveMovieOptions.length > 0;

  const [activeTab, setActiveTab] = useState<'boxart' | 'tmdb' | 'url'>(() => {
    if (defaultTab) {
      if (defaultTab === 'tmdb' && !hasTmdbSupport) return 'boxart';
      return defaultTab;
    }
    return 'boxart';
  });

  // Box Art Search state
  const computedInitialQuery = (initialQuery || movieTitle || '').trim();
  const [searchQuery, setSearchQuery] = useState(computedInitialQuery);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'amazon' | 'bluray'>('all');
  const [boxArtResults, setBoxArtResults] = useState<CoverCandidate[]>([]);
  const [boxArtLoading, setBoxArtLoading] = useState(false);
  const [boxArtError, setBoxArtError] = useState<string | null>(null);
  const [hasSearchedBoxArt, setHasSearchedBoxArt] = useState(false);

  // TMDb Posters state
  const [selectedTmdbOptionIndex, setSelectedTmdbOptionIndex] = useState(0);
  const activeTmdbOption = effectiveMovieOptions[selectedTmdbOptionIndex] || null;
  const [posters, setPosters] = useState<string[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbError, setTmdbError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Paste URL / ASIN state
  const [urlInput, setUrlInput] = useState('');
  const [urlResults, setUrlResults] = useState<CoverCandidate[]>([]);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Downloading state & image metadata state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [fitContain, setFitContain] = useState(true);

  const postersPerPage = 40;
  const pageCount = Math.ceil(posters.length / postersPerPage);
  const visiblePosters = posters.slice(page * postersPerPage, (page + 1) * postersPerPage);

  const executeBoxArtSearch = useCallback(async (queryToRun: string) => {
    const trimmed = queryToRun.trim();
    if (!trimmed) return;

    setBoxArtLoading(true);
    setBoxArtError(null);
    setDownloadError(null);
    setHasSearchedBoxArt(true);
    try {
      const response = await apiService.searchCovers(trimmed, ['amazon', 'bluray']);
      setBoxArtResults(response.results || []);
    } catch (err) {
      console.error('Failed to search box art:', err);
      setBoxArtError('Failed to search box art. Please try again or paste a product URL.');
    } finally {
      setBoxArtLoading(false);
    }
  }, []);

  // Auto-run box art search when opening on boxart tab with an initial query
  useEffect(() => {
    if (activeTab === 'boxart' && !hasSearchedBoxArt && computedInitialQuery) {
      executeBoxArtSearch(computedInitialQuery);
    }
  }, [activeTab, hasSearchedBoxArt, computedInitialQuery, executeBoxArtSearch]);

  // Reset TMDb pagination when movie option changes
  useEffect(() => {
    setPage(0);
  }, [selectedTmdbOptionIndex, tmdbId, mediaType, seasonNumber]);

  // Fetch TMDb posters when TMDb tab is active or movie option changes
  useEffect(() => {
    if (!activeTmdbOption) {
      setPosters([]);
      return;
    }

    const fetchPosters = async () => {
      try {
        setTmdbLoading(true);
        let urls: string[];
        if (activeTmdbOption.mediaType === 'tv_season' && activeTmdbOption.seasonNumber != null) {
          urls = await apiService.getTVSeasonPosters(activeTmdbOption.tmdbId, activeTmdbOption.seasonNumber);
        } else if (activeTmdbOption.mediaType === 'tv_season') {
          urls = await apiService.getTVPosters(activeTmdbOption.tmdbId);
        } else {
          urls = await apiService.getMoviePosters(activeTmdbOption.tmdbId);
        }
        setPosters([...new Set(urls)]);
        setTmdbError(null);
      } catch (err) {
        console.error('Failed to fetch posters:', err);
        setTmdbError('Failed to load posters');
      } finally {
        setTmdbLoading(false);
      }
    };

    fetchPosters();
  }, [
    activeTmdbOption?.tmdbId,
    activeTmdbOption?.mediaType,
    activeTmdbOption?.seasonNumber,
  ]);

  const handleToggleChip = (chip: string) => {
    const escaped = chip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    let nextQuery: string;
    if (regex.test(searchQuery)) {
      nextQuery = searchQuery.replace(regex, '').replace(/\s+/g, ' ').trim();
    } else {
      nextQuery = `${searchQuery.trim()} ${chip}`.trim();
    }
    setSearchQuery(nextQuery);
    if (nextQuery) {
      executeBoxArtSearch(nextQuery);
    }
  };

  const handleSearchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeBoxArtSearch(searchQuery);
  };

  const handleUrlExtractSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    setUrlLoading(true);
    setUrlError(null);
    setDownloadError(null);
    try {
      const response = await apiService.extractCoversFromUrl(trimmed);
      setUrlResults(response.results || []);
      if (!response.results || response.results.length === 0) {
        setUrlError('No cover images found at that URL.');
      }
    } catch (err: any) {
      console.error('Failed to extract covers from URL:', err);
      const msg = err?.response?.data?.error || err?.message || 'Failed to extract covers from URL.';
      setUrlError(msg);
    } finally {
      setUrlLoading(false);
    }
  };

  const handleSelectCandidate = async (candidate: CoverCandidate) => {
    if (downloadingId) return;
    setDownloadingId(candidate.id);
    setDownloadError(null);

    try {
      const saved = await apiService.downloadRemoteCover(candidate.url);
      onSelect(saved.url);
    } catch (err: any) {
      console.error('Failed to download selected cover:', err);
      const msg =
        err?.response?.data?.error ||
        'Could not download high-res cover to local storage. Please try another candidate.';
      setDownloadError(msg);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleImageLoad = (key: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setImageDimensions((prev) => ({
        ...prev,
        [key]: { width: img.naturalWidth, height: img.naturalHeight },
      }));
    }
  };

  const handleImageError = (candidate: CoverCandidate, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // If the high-res URL failed in preview, fall back to thumbnailUrl if different
    if (candidate.thumbnailUrl && img.src !== candidate.thumbnailUrl) {
      img.src = candidate.thumbnailUrl;
      return;
    }
    setFailedImages((prev) => ({ ...prev, [candidate.id]: true }));
  };

  const filteredBoxArtResults = boxArtResults.filter((item) => {
    if (failedImages[item.id]) return false;
    if (sourceFilter === 'all') return true;
    return item.source === sourceFilter;
  });

  const renderCandidateGrid = (candidates: CoverCandidate[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {candidates.map((candidate) => {
        const dims = imageDimensions[candidate.id];
        const isHighRes = dims && (dims.height >= 900 || dims.width >= 900);
        const isDownloadingThis = downloadingId === candidate.id;

        return (
          <div
            key={candidate.id}
            onClick={() => handleSelectCandidate(candidate)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelectCandidate(candidate);
              }
            }}
            className={`
              cursor-pointer group relative flex flex-col rounded-lg overflow-hidden border-2 transition-all bg-gray-50 dark:bg-gray-900/60
              ${
                isDownloadingThis
                  ? 'border-primary-500 ring-2 ring-primary-500'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md'
              }
              ${downloadingId && !isDownloadingThis ? 'opacity-50 pointer-events-none' : ''}
            `}
          >
            <div className="relative aspect-[2/3] w-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
              <img
                src={candidate.url}
                alt={candidate.title}
                onLoad={(e) => handleImageLoad(candidate.id, e)}
                onError={(e) => handleImageError(candidate, e)}
                className={`w-full h-full ${fitContain ? 'object-contain p-1' : 'object-cover'} transition-transform duration-200 group-hover:scale-[1.02]`}
                loading="lazy"
              />

              {/* Source Badge */}
              <span
                className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] tracking-wide uppercase shadow-sm ${
                  SOURCE_BADGE_CLASSES[candidate.source] || 'bg-gray-800 text-white'
                }`}
              >
                {SOURCE_LABELS[candidate.source] || candidate.source}
              </span>

              {/* Resolution Badge */}
              {dims && (
                <span
                  className={`absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono shadow-sm ${
                    isHighRes
                      ? 'bg-emerald-900/85 text-emerald-100 border border-emerald-500/40'
                      : 'bg-black/75 text-gray-200'
                  }`}
                >
                  {dims.width}×{dims.height}
                  {isHighRes ? ' HD' : ''}
                </span>
              )}

              {/* Hover / Downloading Overlay */}
              {isDownloadingThis ? (
                <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center gap-2 text-white p-2 text-center">
                  <div className="animate-spin rounded-full h-7 w-7 border-2 border-white border-t-transparent" />
                  <span className="text-xs font-medium">Saving cover...</span>
                </div>
              ) : (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="px-3 py-1.5 rounded-full bg-primary-600 text-white text-xs font-semibold shadow-lg">
                    Use Cover
                  </span>
                </div>
              )}
            </div>

            {/* Title & Subtitle Footer */}
            <div className="p-2.5 flex-1 flex flex-col justify-between border-t border-gray-200/70 dark:border-gray-700/70 bg-white dark:bg-gray-800">
              <p
                className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug"
                title={candidate.title}
              >
                {candidate.title}
              </p>
              {candidate.subtitle && (
                <p
                  className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 truncate"
                  title={candidate.subtitle}
                >
                  {candidate.subtitle}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-75" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center gap-4">
            <div className="min-w-0">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Select Cover Art
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {movieTitle}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {activeTab !== 'tmdb' && (
                <button
                  type="button"
                  onClick={() => setFitContain((prev) => !prev)}
                  className="text-xs px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Toggle between fitting full packaging box art vs cropping to 2:3 aspect ratio"
                >
                  {fitContain ? 'Fit: Full Box' : 'Fit: Crop 2:3'}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close cover selector"
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="px-4 pt-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('boxart')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === 'boxart'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400 bg-white dark:bg-gray-800'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Box Art Search (Amazon & Blu-ray.com)
            </button>
            {hasTmdbSupport && (
              <button
                type="button"
                onClick={() => setActiveTab('tmdb')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeTab === 'tmdb'
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400 bg-white dark:bg-gray-800'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                TMDb Posters
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === 'url'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400 bg-white dark:bg-gray-800'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              From Product / Image URL
            </button>
          </div>

          {downloadError && (
            <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
              <span>{downloadError}</span>
              <button
                type="button"
                onClick={() => setDownloadError(null)}
                className="ml-2 text-red-500 hover:text-red-700 font-bold"
              >
                ×
              </button>
            </div>
          )}

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* TAB 1: BOX ART SEARCH */}
            {activeTab === 'boxart' && (
              <div className="space-y-4">
                <form onSubmit={handleSearchFormSubmit} className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search movie title, format, edition (e.g. Dune 4K Steelbook)..."
                      aria-label="Search cover art"
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button
                      type="submit"
                      disabled={boxArtLoading || !searchQuery.trim()}
                      className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                    >
                      {boxArtLoading ? 'Searching...' : 'Search'}
                    </button>
                  </div>

                  {/* Quick-toggle keyword chips & source filter */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Refine:</span>
                      {QUICK_FILTER_CHIPS.map((chip) => {
                        const escaped = chip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const isActive = new RegExp(`\\b${escaped}\\b`, 'i').test(searchQuery);
                        return (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => handleToggleChip(chip)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              isActive
                                ? 'bg-primary-100 dark:bg-primary-900/60 border-primary-500 text-primary-800 dark:text-primary-200'
                                : 'bg-gray-100 dark:bg-gray-700/70 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            {isActive ? `✓ ${chip}` : `+ ${chip}`}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/70 p-0.5 rounded-lg">
                      {(
                        [
                          { id: 'all', label: 'All Sources' },
                          { id: 'amazon', label: 'Amazon' },
                          { id: 'bluray', label: 'Blu-ray.com' },
                        ] as const
                      ).map((src) => (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => setSourceFilter(src.id)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                            sourceFilter === src.id
                              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}
                        >
                          {src.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </form>

                {boxArtLoading ? (
                  <div className="flex flex-col justify-center items-center h-64 gap-3">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Searching Amazon & Blu-ray.com for high-resolution box art...
                    </p>
                  </div>
                ) : boxArtError ? (
                  <div className="text-center text-red-600 dark:text-red-400 p-8">
                    {boxArtError}
                  </div>
                ) : filteredBoxArtResults.length === 0 ? (
                  <div className="text-center text-gray-500 dark:text-gray-400 p-8 space-y-2">
                    <p>No box art candidates found for "{searchQuery}".</p>
                    <p className="text-xs">
                      Try simplifying the search terms or paste an Amazon / Blu-ray.com product link in the{' '}
                      <button
                        type="button"
                        onClick={() => setActiveTab('url')}
                        className="text-primary-600 dark:text-primary-400 underline"
                      >
                        From Product / Image URL
                      </button>{' '}
                      tab.
                    </p>
                  </div>
                ) : (
                  renderCandidateGrid(filteredBoxArtResults)
                )}
              </div>
            )}

            {/* TAB 2: TMDB POSTERS */}
            {activeTab === 'tmdb' && (
              <div className="space-y-4">
                {effectiveMovieOptions.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Title:
                    </span>
                    {effectiveMovieOptions.map((opt, idx) => (
                      <button
                        key={`${opt.tmdbId}-${idx}`}
                        type="button"
                        onClick={() => setSelectedTmdbOptionIndex(idx)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          selectedTmdbOptionIndex === idx
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {opt.title}
                      </button>
                    ))}
                  </div>
                )}

                {tmdbLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
                  </div>
                ) : tmdbError ? (
                  <div className="text-center text-red-600 dark:text-red-400 p-8">
                    {tmdbError}
                  </div>
                ) : posters.length === 0 ? (
                  <div className="text-center text-gray-500 dark:text-gray-400 p-8">
                    No posters found for this {activeTmdbOption?.mediaType === 'tv_season' ? 'TV show' : 'movie'}.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {visiblePosters.map((url, index) => (
                      <div
                        key={url}
                        onClick={() => onSelect(url)}
                        className={`
                          cursor-pointer group relative aspect-[2/3] rounded-lg overflow-hidden border-2 transition-all
                          ${
                            currentPosterUrl === url
                              ? 'border-primary-500 ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-800'
                              : 'border-transparent hover:border-primary-300 dark:hover:border-primary-700'
                          }
                        `}
                      >
                        <img
                          src={url}
                          alt={`Poster option ${index + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity" />

                        {/* Selected Indicator */}
                        {currentPosterUrl === url && (
                          <div className="absolute top-2 right-2 bg-primary-500 text-white rounded-full p-1 shadow-lg">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!tmdbLoading && !tmdbError && pageCount > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-6">
                    <button
                      type="button"
                      onClick={() => setPage((currentPage) => currentPage - 1)}
                      disabled={page === 0}
                      className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      Page {page + 1} of {pageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((currentPage) => currentPage + 1)}
                      disabled={page === pageCount - 1}
                      className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: PASTE PRODUCT OR IMAGE URL */}
            {activeTab === 'url' && (
              <div className="space-y-4">
                <form onSubmit={handleUrlExtractSubmit} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Amazon Product URL, ASIN, Blu-ray.com Release URL, or Direct Image URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://www.amazon.com/dp/B09MDHXGST or https://www.blu-ray.com/movies/..."
                      aria-label="Product or image URL"
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button
                      type="submit"
                      disabled={urlLoading || !urlInput.trim()}
                      className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                    >
                      {urlLoading ? 'Extracting...' : 'Fetch Covers'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Extracts high-resolution front covers, slipcovers, and packaging gallery images from the release page and saves your selection locally.
                  </p>
                </form>

                {urlLoading ? (
                  <div className="flex flex-col justify-center items-center h-48 gap-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Extracting high-resolution covers from page...
                    </p>
                  </div>
                ) : urlError ? (
                  <div className="text-center text-red-600 dark:text-red-400 p-6 text-sm">
                    {urlError}
                  </div>
                ) : urlResults.length > 0 ? (
                  renderCandidateGrid(urlResults)
                ) : (
                  <div className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">
                    Paste a link above and click "Fetch Covers" to preview all available artwork from that page.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PosterSelector;
