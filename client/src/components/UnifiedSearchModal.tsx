import React, { useState, useEffect } from 'react';
import { TMDbMovie, TMDbTVShow, Media, PhysicalItem } from '../types';
import { apiService } from '../services/api.service';
import FormatSelector from './FormatSelector';
import TVSeasonPicker from './TVSeasonPicker';

interface UnifiedSearchResult {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  cover_art_url?: string | null;
  director?: string;
  source: 'database' | 'tmdb';
  tmdb_id?: number;
  media_type?: 'movie' | 'tv_season';
  originalData: Media | TMDbMovie | TMDbTVShow;
}

export type SearchMode = 'movies' | 'tv';

interface UnifiedSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (result: UnifiedSearchResult, formats: string[]) => void;
  onSelectTVSeasons?: (seasons: any[], formats: string[]) => void;
  currentPhysicalItem?: PhysicalItem | null;
}

const UnifiedSearchModal: React.FC<UnifiedSearchModalProps> = ({ 
  isOpen, 
  onClose, 
  onSelect,
  onSelectTVSeasons,
  currentPhysicalItem 
}) => {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('movies');
  const [databaseResults, setDatabaseResults] = useState<UnifiedSearchResult[]>([]);
  const [tmdbResults, setTmdbResults] = useState<UnifiedSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFormatSelector, setShowFormatSelector] = useState(false);
  const [selectedResult, setSelectedResult] = useState<UnifiedSearchResult | null>(null);
  const [allMovies, setAllMovies] = useState<Media[]>([]);
  // TV Season Picker state
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [selectedTVShow, setSelectedTVShow] = useState<{ id: number; name: string } | null>(null);

  const linkedMovieIds = currentPhysicalItem?.media.map(m => m.id) || [];

  useEffect(() => {
    if (isOpen) {
      loadAllMovies();
    }
  }, [isOpen]);

  useEffect(() => {
    if (query.trim()) {
      const timeoutId = setTimeout(() => {
        handleSearch();
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setDatabaseResults([]);
      setTmdbResults([]);
      setHasSearched(false);
    }
  }, [query, searchMode]);

  const loadAllMovies = async () => {
    try {
      const response = await apiService.getMedia({ limit: 10000 });
      setAllMovies(response.items);
    } catch (error) {
      console.error('Failed to load media:', error);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      if (searchMode === 'movies') {
        // Search local database for movies
        const filteredMovies = allMovies.filter(movie => {
          const isMovie = !movie.media_type || movie.media_type === 'movie';
          const matchesSearch = 
            movie.title.toLowerCase().includes(query.toLowerCase()) ||
            movie.director?.toLowerCase().includes(query.toLowerCase()) ||
            movie.synopsis?.toLowerCase().includes(query.toLowerCase());
          const notLinked = !linkedMovieIds.includes(movie.id);
          return isMovie && matchesSearch && notLinked;
        });

        const dbResults: UnifiedSearchResult[] = filteredMovies.map(movie => ({
          id: movie.id,
          title: movie.title,
          release_date: movie.release_date,
          overview: movie.synopsis,
          cover_art_url: movie.cover_art_url,
          director: movie.director,
          source: 'database',
          tmdb_id: movie.tmdb_id,
          media_type: 'movie' as const,
          originalData: movie
        }));

        setDatabaseResults(dbResults);

        // Search TMDB movies
        const tmdbResponse = await apiService.searchMovies(query);
        const tmdbMovieResults: UnifiedSearchResult[] = tmdbResponse.results.map(movie => ({
          id: movie.id,
          title: movie.title,
          release_date: movie.release_date,
          overview: movie.overview,
          poster_path: movie.poster_path,
          source: 'tmdb',
          tmdb_id: movie.id,
          media_type: 'movie' as const,
          originalData: movie
        }));

        setTmdbResults(tmdbMovieResults);
      } else {
        // Search local database for TV seasons
        const filteredTV = allMovies.filter(media => {
          const isTV = media.media_type === 'tv_season';
          const matchesSearch = 
            media.title.toLowerCase().includes(query.toLowerCase()) ||
            media.tv_show_name?.toLowerCase().includes(query.toLowerCase()) ||
            media.synopsis?.toLowerCase().includes(query.toLowerCase());
          const notLinked = !linkedMovieIds.includes(media.id);
          return isTV && matchesSearch && notLinked;
        });

        const dbResults: UnifiedSearchResult[] = filteredTV.map(media => ({
          id: media.id,
          title: media.title,
          release_date: media.release_date,
          overview: media.synopsis,
          cover_art_url: media.cover_art_url,
          director: media.director,
          source: 'database',
          tmdb_id: media.tmdb_id,
          media_type: 'tv_season' as const,
          originalData: media
        }));

        setDatabaseResults(dbResults);

        // Search TMDB TV shows
        const tmdbResponse = await apiService.searchTV(query);
        const tmdbTVResults: UnifiedSearchResult[] = tmdbResponse.results.map(show => ({
          id: show.id,
          title: show.name,
          release_date: show.first_air_date,
          overview: show.overview,
          poster_path: show.poster_path,
          source: 'tmdb',
          tmdb_id: show.id,
          media_type: 'tv_season' as const,
          originalData: show
        }));

        setTmdbResults(tmdbTVResults);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setDatabaseResults([]);
      setTmdbResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultSelect = (result: UnifiedSearchResult) => {
    if (searchMode === 'tv' && result.source === 'tmdb') {
      // Open TV Season Picker for TMDB TV shows
      setSelectedTVShow({ id: result.id, name: result.title });
      setShowSeasonPicker(true);
    } else if (searchMode === 'tv' && result.source === 'database') {
      // For DB TV seasons, use format selector like movies
      setSelectedResult(result);
      setShowFormatSelector(true);
    } else {
      // Movie flow: open format selector
      setSelectedResult(result);
      setShowFormatSelector(true);
    }
  };

  const handleFormatsSelected = (formats: string[]) => {
    if (selectedResult) {
      onSelect(selectedResult, formats);
    }
    setShowFormatSelector(false);
    setSelectedResult(null);
    setQuery('');
    setDatabaseResults([]);
    setTmdbResults([]);
    setHasSearched(false);
  };

  const handleTVSeasonsConfirmed = (seasons: any[], formats: string[]) => {
    if (onSelectTVSeasons) {
      onSelectTVSeasons(seasons, formats);
    }
    setShowSeasonPicker(false);
    setSelectedTVShow(null);
    setQuery('');
    setDatabaseResults([]);
    setTmdbResults([]);
    setHasSearched(false);
  };

  const handleClose = () => {
    setQuery('');
    setDatabaseResults([]);
    setTmdbResults([]);
    setHasSearched(false);
    setSelectedResult(null);
    setShowSeasonPicker(false);
    setSelectedTVShow(null);
    onClose();
  };

  const getImageUrl = (result: UnifiedSearchResult) => {
    if (result.source === 'database' && result.cover_art_url) {
      return result.cover_art_url;
    } else if (result.source === 'tmdb' && result.poster_path) {
      return `https://image.tmdb.org/t/p/w500${result.poster_path}`;
    }
    return null;
  };

  const getReleaseYear = (releaseDate?: string) => {
    if (!releaseDate) return 'N/A';
    return new Date(releaseDate).getFullYear();
  };

  if (!isOpen) return null;

  const searchPlaceholder = searchMode === 'movies' ? 'Search for movies...' : 'Search for TV shows...';
  const emptyHint = searchMode === 'movies'
    ? 'Enter a movie title to search your collection and TMDB'
    : 'Enter a TV show name to search your collection and TMDB';
  const noResultsText = searchMode === 'movies'
    ? `No movies found for "${query}"`
    : `No TV shows found for "${query}"`;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={handleClose}
        />

        <div className="flex min-h-screen items-start justify-center p-4 pt-20">
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {searchMode === 'movies' ? 'Add Movie' : 'Add TV Show'}
                </h2>
                <button
                  onClick={handleClose}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Search Mode Toggle */}
              <div className="flex mb-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => {
                    setSearchMode('movies');
                    setQuery('');
                    setDatabaseResults([]);
                    setTmdbResults([]);
                    setHasSearched(false);
                  }}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    searchMode === 'movies'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Movies
                </button>
                <button
                  onClick={() => {
                    setSearchMode('tv');
                    setQuery('');
                    setDatabaseResults([]);
                    setTmdbResults([]);
                    setHasSearched(false);
                  }}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    searchMode === 'tv'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  TV Shows
                </button>
              </div>

              {/* Search Form */}
              <div className="relative">
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <svg
                  className="absolute left-3 top-3.5 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {isSearching && (
                  <div className="absolute right-3 top-3.5">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-6">
              {!hasSearched && !isSearching && (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400">{emptyHint}</p>
                </div>
              )}

              {isSearching && (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                  <p className="text-gray-500 dark:text-gray-400">Searching...</p>
                </div>
              )}

              {hasSearched && !isSearching && databaseResults.length === 0 && tmdbResults.length === 0 && (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.29-1.009-5.824-2.709" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400">{noResultsText}</p>
                </div>
              )}

              {/* Database Results */}
              {databaseResults.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                    <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    In Your Collection ({databaseResults.length})
                  </h3>
                  <div className="space-y-3">
                    {databaseResults.map((result) => (
                      <div
                        key={`db-${result.id}`}
                        onClick={() => handleResultSelect(result)}
                        className="flex gap-4 p-4 rounded-lg cursor-pointer transition-colors border hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700"
                      >
                        <div className="w-16 h-24 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                          {getImageUrl(result) ? (
                            <img
                              src={getImageUrl(result)!}
                              alt={result.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate">
                                {result.title}
                              </h4>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {getReleaseYear(result.release_date)} • {result.director || 'Unknown'}
                              </p>
                              {result.overview && (
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">
                                  {result.overview}
                                </p>
                              )}
                            </div>
                            <span className="ml-2 px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full">
                              Database
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TMDB Results */}
              {tmdbResults.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                    <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    From TMDB ({tmdbResults.length})
                  </h3>
                  <div className="space-y-3">
                    {tmdbResults.map((result) => (
                      <div
                        key={`tmdb-${result.id}`}
                        onClick={() => handleResultSelect(result)}
                        className="flex gap-4 p-4 rounded-lg cursor-pointer transition-colors border hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700"
                      >
                        <div className="w-16 h-24 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                          {getImageUrl(result) ? (
                            <img
                              src={getImageUrl(result)!}
                              alt={result.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate">
                                {result.title}
                              </h4>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {getReleaseYear(result.release_date)}
                                {searchMode === 'tv' && ' • TV Show'}
                              </p>
                              {result.overview && (
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">
                                  {result.overview}
                                </p>
                              )}
                            </div>
                            <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                              TMDB
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Format Selector Modal (for movies and DB TV seasons) */}
      <FormatSelector
        isOpen={showFormatSelector}
        onClose={() => {
          setShowFormatSelector(false);
          setSelectedResult(null);
        }}
        onConfirm={handleFormatsSelected}
        movieTitle={selectedResult?.title || ''}
      />

      {/* TV Season Picker Modal */}
      {selectedTVShow && (
        <TVSeasonPicker
          isOpen={showSeasonPicker}
          onClose={() => {
            setShowSeasonPicker(false);
            setSelectedTVShow(null);
          }}
          onConfirm={handleTVSeasonsConfirmed}
          tvShowId={selectedTVShow.id}
          tvShowName={selectedTVShow.name}
        />
      )}
    </>
  );
};

export default UnifiedSearchModal;
