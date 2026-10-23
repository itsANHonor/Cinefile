import React, { useState } from 'react';
import { TMDbMovie } from '../types';
import { apiService } from '../services/api.service';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (movie: TMDbMovie) => void;
  multiSelect?: boolean;
  selectedMovies?: TMDbMovie[];
  onDone?: (movies: TMDbMovie[]) => void;
}

const SearchModal: React.FC<SearchModalProps> = ({ 
  isOpen, 
  onClose, 
  onSelect, 
  multiSelect = false,
  selectedMovies = [],
  onDone 
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TMDbMovie[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [internalSelection, setInternalSelection] = useState<TMDbMovie[]>(selectedMovies);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const response = await apiService.searchMovies(query);
      setResults(response.results);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (movie: TMDbMovie) => {
    if (multiSelect) {
      // Toggle movie in selection
      const isSelected = internalSelection.some(m => m.id === movie.id);
      if (isSelected) {
        setInternalSelection(internalSelection.filter(m => m.id !== movie.id));
      } else {
        setInternalSelection([...internalSelection, movie]);
      }
    } else {
      // Single select mode - close immediately
      onSelect(movie);
      setQuery('');
      setResults([]);
      setHasSearched(false);
    }
  };

  const handleDone = () => {
    if (multiSelect && onDone) {
      onDone(internalSelection);
    }
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setInternalSelection([]);
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setInternalSelection(selectedMovies);
    onClose();
  };

  const isMovieSelected = (movieId: number) => {
    return internalSelection.some(m => m.id === movieId);
  };

  if (!isOpen) return null;

  const getImageUrl = (path: string | null) => {
    if (!path) return null;
    return `https://image.tmdb.org/t/p/w500${path}`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-screen items-start justify-center p-4 pt-20">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Search TMDb</h2>
                {multiSelect && internalSelection.length > 0 && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {internalSelection.length} movie{internalSelection.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a movie..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                autoFocus
              />
              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                className="btn-primary px-6"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </form>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto p-6">
            {isSearching && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                <p className="text-gray-600 dark:text-gray-300 mt-4">Searching...</p>
              </div>
            )}

            {!isSearching && hasSearched && results.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600 dark:text-gray-300">No results found. Try a different search term.</p>
              </div>
            )}

            {!isSearching && !hasSearched && (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-gray-600 dark:text-gray-300">Enter a movie title to search</p>
              </div>
            )}

            {!isSearching && results.length > 0 && (
              <div className="space-y-3">
                {results.map((movie) => {
                  const isSelected = isMovieSelected(movie.id);
                  return (
                    <div
                      key={movie.id}
                      onClick={() => handleSelect(movie)}
                      className={`flex gap-4 p-3 rounded-lg cursor-pointer transition-colors border ${
                        isSelected 
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500' 
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {/* Poster */}
                      <div className="w-16 h-24 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                        {getImageUrl(movie.poster_path) ? (
                          <img
                            src={getImageUrl(movie.poster_path)!}
                            alt={movie.title}
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

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{movie.title}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A'}
                        </p>
                        {movie.overview && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{movie.overview}</p>
                        )}
                      </div>

                      {/* Rating and Selection */}
                      <div className="flex items-start gap-2">
                        {movie.vote_average > 0 && (
                          <div className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded text-sm font-medium">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            {movie.vote_average.toFixed(1)}
                          </div>
                        )}
                        {multiSelect && isSelected && (
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-600 text-white">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer with Done button for multi-select */}
          {multiSelect && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <button
                onClick={handleDone}
                disabled={internalSelection.length === 0}
                className="btn-primary w-full"
              >
                Done ({internalSelection.length} selected)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchModal;

