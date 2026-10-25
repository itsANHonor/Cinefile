import React, { useState } from 'react';
import { apiService } from '../services/api.service';
import { BulkSearchResponse, TMDbMovieDetails, BulkPhysicalItemDto } from '../types';
import { PHYSICAL_FORMATS } from '../lib/formats';
import { useToast } from '../context/ToastContext';
import { Button } from './ui/Button';

interface BulkAddFormProps {
  onSuccess: () => void;
}

const BulkAddForm: React.FC<BulkAddFormProps> = ({ onSuccess }) => {
  const [movieTitles, setMovieTitles] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<BulkSearchResponse | null>(null);
  const [selectedMatches, setSelectedMatches] = useState<Map<string, TMDbMovieDetails>>(new Map());
  const [selectedFormats, setSelectedFormats] = useState<Map<string, string[]>>(new Map());
  const [bulkFormat, setBulkFormat] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<any>(null);
  const { toast } = useToast();

  const availableFormats = PHYSICAL_FORMATS;

  const handleSearch = async () => {
    if (!movieTitles.trim()) return;

    const titles = movieTitles
      .split('\n')
      .map((title) => title.trim())
      .filter((title) => title.length > 0);

    if (titles.length === 0) return;

    setIsSearching(true);
    try {
      const results = await apiService.bulkSearchMovies(titles);
      setSearchResults(results);

      const newSelectedMatches = new Map<string, TMDbMovieDetails>();
      results.matched.forEach((match) => {
        if (match.selectedMatch) {
          newSelectedMatches.set(match.originalTitle, match.selectedMatch);
        }
      });
      setSelectedMatches(newSelectedMatches);

      const newSelectedFormats = new Map<string, string[]>();
      results.matched.forEach((match) => {
        newSelectedFormats.set(match.originalTitle, []);
      });
      setSelectedFormats(newSelectedFormats);
    } catch (error) {
      console.error('Search failed:', error);
      toast({ message: 'Failed to search movies. Please try again.', type: 'error' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleMatchSelection = (originalTitle: string, selectedMovie: TMDbMovieDetails) => {
    const newSelectedMatches = new Map(selectedMatches);
    newSelectedMatches.set(originalTitle, selectedMovie);
    setSelectedMatches(newSelectedMatches);
  };

  const handleFormatToggle = (originalTitle: string, format: string) => {
    const newSelectedFormats = new Map(selectedFormats);
    const currentFormats = newSelectedFormats.get(originalTitle) || [];

    if (currentFormats.includes(format)) {
      newSelectedFormats.set(
        originalTitle,
        currentFormats.filter((f) => f !== format)
      );
    } else {
      newSelectedFormats.set(originalTitle, [...currentFormats, format]);
    }

    setSelectedFormats(newSelectedFormats);
  };

  const handleBulkFormatApply = () => {
    if (!bulkFormat) return;

    const newSelectedFormats = new Map(selectedFormats);
    searchResults?.matched.forEach((match) => {
      const currentFormats = newSelectedFormats.get(match.originalTitle) || [];
      if (!currentFormats.includes(bulkFormat)) {
        newSelectedFormats.set(match.originalTitle, [...currentFormats, bulkFormat]);
      }
    });

    setSelectedFormats(newSelectedFormats);
    setBulkFormat('');
  };

  const handleImport = async () => {
    if (!searchResults) return;

    const physicalItems: BulkPhysicalItemDto[] = [];

    searchResults.matched.forEach((match) => {
      const selectedMovie = selectedMatches.get(match.originalTitle);
      const formats = selectedFormats.get(match.originalTitle) || [];

      if (selectedMovie && formats.length > 0) {
        physicalItems.push({
          name: selectedMovie.title,
          physical_format: formats,
          edition_notes: undefined,
          custom_image_url: undefined,
          purchase_date: undefined,
          media: {
            title: selectedMovie.title,
            tmdb_id: selectedMovie.id,
            synopsis: selectedMovie.overview,
            cover_art_url: selectedMovie.poster_url || undefined,
            release_date: selectedMovie.release_date,
            director: selectedMovie.director || undefined,
            cast: selectedMovie.cast || undefined,
            genres: selectedMovie.genres || undefined,
          },
        });
      }
    });

    if (physicalItems.length === 0) {
      toast({
        message: 'Please select at least one format for the movies you want to import.',
        type: 'warning',
      });
      return;
    }

    setIsImporting(true);
    try {
      const results = await apiService.bulkCreatePhysicalItems(physicalItems);
      setImportResults(results);

      if (results.successful.length > 0) {
        toast({
          message: `Imported ${results.summary.successful} movie(s) into your collection.`,
          type: 'success',
        });
        onSuccess();
      }
    } catch (error) {
      console.error('Import failed:', error);
      toast({ message: 'Failed to import movies. Please try again.', type: 'error' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setMovieTitles('');
    setSearchResults(null);
    setSelectedMatches(new Map());
    setSelectedFormats(new Map());
    setImportResults(null);
  };

  const getImageUrl = (path: string | null) => {
    if (!path) return undefined;
    return `https://image.tmdb.org/t/p/w200${path}`;
  };

  const titleCount = movieTitles
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean).length;

  if (importResults) {
    return (
      <div className="card space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-content">Bulk Add Results</h3>
          <p className="text-sm text-content-muted">
            Summary of movies added to your collection.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-green-50 dark:bg-green-900/20 p-3.5 rounded-[--radius-control]">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {importResults.summary.successful}
            </div>
            <div className="text-xs font-medium text-green-700 dark:text-green-300">Successful</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-3.5 rounded-[--radius-control]">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {importResults.summary.failed}
            </div>
            <div className="text-xs font-medium text-red-700 dark:text-red-300">Failed</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3.5 rounded-[--radius-control]">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {importResults.summary.total}
            </div>
            <div className="text-xs font-medium text-blue-700 dark:text-blue-300">Total</div>
          </div>
        </div>

        {importResults.failed.length > 0 && (
          <div className="rounded-[--radius-control] border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10 p-3">
            <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-1.5">
              Failed Imports
            </h4>
            <ul className="list-disc list-inside space-y-1 text-xs text-red-600 dark:text-red-400">
              {importResults.failed.map((failed: any, index: number) => (
                <li key={index}>
                  <strong>{failed.originalTitle || failed.originalName}</strong>: {failed.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <Button onClick={handleReset}>Add More Movies</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-content">Bulk Add Movies by Title</h3>
          <p className="text-sm text-content-muted">
            Paste a list of movie titles (one per line) to match against TMDb and add them in batch.
          </p>
        </div>
        {titleCount > 0 && !searchResults && (
          <span className="inline-flex items-center self-start rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300">
            {titleCount} {titleCount === 1 ? 'title' : 'titles'} ready
          </span>
        )}
      </div>

      {!searchResults ? (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="bulk-movie-titles"
              className="block text-sm font-medium text-content mb-1.5"
            >
              Movie Titles (one per line, up to 200)
            </label>
            <textarea
              id="bulk-movie-titles"
              value={movieTitles}
              onChange={(e) => setMovieTitles(e.target.value)}
              placeholder={'The Matrix\nInception\nInterstellar'}
              rows={6}
              className="w-full px-3 py-2 text-sm border border-subtle rounded-[--radius-control] bg-surface text-content focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            {movieTitles.trim() && (
              <Button variant="ghost" size="sm" onClick={() => setMovieTitles('')}>
                Clear
              </Button>
            )}
            <Button
              onClick={handleSearch}
              isLoading={isSearching}
              disabled={!movieTitles.trim()}
            >
              Match Titles on TMDb
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-[--radius-control]">
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                {searchResults.summary.matched}
              </div>
              <div className="text-xs font-medium text-green-700 dark:text-green-300">Matched</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-[--radius-control]">
              <div className="text-xl font-bold text-red-600 dark:text-red-400">
                {searchResults.summary.unmatched}
              </div>
              <div className="text-xs font-medium text-red-700 dark:text-red-300">Not Found</div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-[--radius-control]">
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {searchResults.summary.total}
              </div>
              <div className="text-xs font-medium text-blue-700 dark:text-blue-300">Total</div>
            </div>
          </div>

          {/* Bulk Format Selection */}
          {searchResults.matched.length > 0 && (
            <div className="bg-surface-sunken border border-subtle p-4 rounded-[--radius-control] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-content">Apply Format to All Matched Movies</h4>
                <p className="text-xs text-content-muted">
                  Quickly assign a default format to every matched title below.
                </p>
              </div>
              <div className="flex gap-2">
                <select
                  value={bulkFormat}
                  onChange={(e) => setBulkFormat(e.target.value)}
                  aria-label="Select format to apply to all movies"
                  className="px-3 py-1.5 text-sm border border-subtle rounded-[--radius-control] bg-surface text-content"
                >
                  <option value="">Select format…</option>
                  {availableFormats.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleBulkFormatApply}
                  disabled={!bulkFormat}
                >
                  Apply to All
                </Button>
              </div>
            </div>
          )}

          {/* Matched Movies */}
          {searchResults.matched.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-content mb-3">
                Matched Movies ({searchResults.matched.length})
              </h4>
              <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                {searchResults.matched.map((match, index) => {
                  const selectedMovie = selectedMatches.get(match.originalTitle);
                  const formats = selectedFormats.get(match.originalTitle) || [];

                  return (
                    <div
                      key={index}
                      className="border border-subtle bg-surface-sunken/40 rounded-[--radius-control] p-4"
                    >
                      <div className="flex gap-4">
                        <div className="flex-shrink-0">
                          {selectedMovie?.poster_path ? (
                            <img
                              src={getImageUrl(selectedMovie.poster_path)}
                              alt={selectedMovie.title}
                              className="w-16 h-24 object-cover rounded-[--radius-control]"
                            />
                          ) : (
                            <div className="w-16 h-24 rounded-[--radius-control] bg-surface-sunken border border-subtle flex items-center justify-center text-xs text-content-muted">
                              No Poster
                            </div>
                          )}
                        </div>

                        <div className="flex-1 space-y-3 min-w-0">
                          <div>
                            <h5 className="text-sm font-semibold text-content">
                              {selectedMovie?.title || match.originalTitle}{' '}
                              {selectedMovie?.release_date && (
                                <span className="font-normal text-content-muted">
                                  ({selectedMovie.release_date.split('-')[0]})
                                </span>
                              )}
                            </h5>

                            {match.matches.length > 1 && (
                              <div className="mt-2">
                                <label className="block text-xs font-medium text-content-muted mb-1">
                                  Multiple TMDb matches for "{match.originalTitle}":
                                </label>
                                <select
                                  value={selectedMovie?.id || ''}
                                  onChange={(e) => {
                                    const movieId = parseInt(e.target.value, 10);
                                    const movie = match.matches.find((m) => m.id === movieId);
                                    if (movie) {
                                      handleMatchSelection(match.originalTitle, movie);
                                    }
                                  }}
                                  className="w-full px-3 py-1.5 text-sm border border-subtle rounded-[--radius-control] bg-surface text-content"
                                >
                                  {match.matches.map((movie) => (
                                    <option key={movie.id} value={movie.id}>
                                      {movie.title} ({movie.release_date?.split('-')[0] || 'Unknown'})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {selectedMovie?.director && (
                              <p className="text-xs text-content-muted mt-1">
                                Director: {selectedMovie.director}
                              </p>
                            )}
                          </div>

                          <div>
                            <span className="block text-xs font-medium text-content-muted mb-1.5">
                              Physical Formats *
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {availableFormats.map((format) => {
                                const isSelected = formats.includes(format);
                                return (
                                  <button
                                    key={format}
                                    type="button"
                                    onClick={() => handleFormatToggle(match.originalTitle, format)}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                                      isSelected
                                        ? 'bg-primary-600 text-white border-primary-600'
                                        : 'bg-surface border-subtle text-content-muted hover:text-content hover:border-primary-400'
                                    }`}
                                  >
                                    {isSelected ? `✓ ${format}` : `+ ${format}`}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unmatched Movies */}
          {searchResults.unmatched.length > 0 && (
            <div className="rounded-[--radius-control] border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10 p-3.5">
              <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-1.5">
                Not Found ({searchResults.unmatched.length})
              </h4>
              <ul className="list-disc list-inside space-y-1 text-xs text-red-600 dark:text-red-400">
                {searchResults.unmatched.map((unmatched, index) => (
                  <li key={index}>
                    <strong>{unmatched.originalTitle}</strong>: {unmatched.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
            <Button variant="secondary" onClick={handleReset}>
              Start Over
            </Button>
            <Button
              onClick={handleImport}
              isLoading={isImporting}
              disabled={searchResults.matched.every(
                (match) => (selectedFormats.get(match.originalTitle) || []).length === 0
              )}
            >
              Import{' '}
              {
                searchResults.matched.filter(
                  (match) => (selectedFormats.get(match.originalTitle) || []).length > 0
                ).length
              }{' '}
              Movies
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkAddForm;
