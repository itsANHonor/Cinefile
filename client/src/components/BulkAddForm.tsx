import React, { useState } from 'react';
import { apiService } from '../services/api.service';
import { BulkSearchResponse, TMDbMovieDetails, BulkPhysicalItemDto } from '../types';

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

  const availableFormats = ['4K UHD', '3D Blu-ray', 'Blu-ray', 'DVD', 'Digital-HD', 'Digital-SD', 'Digital-UHD', 'LaserDisc', 'VHS'];

  const handleSearch = async () => {
    if (!movieTitles.trim()) return;

    const titles = movieTitles
      .split('\n')
      .map(title => title.trim())
      .filter(title => title.length > 0);

    if (titles.length === 0) return;

    setIsSearching(true);
    try {
      const results = await apiService.bulkSearchMovies(titles);
      setSearchResults(results);
      
      // Initialize selected matches with default (first) match for each movie
      const newSelectedMatches = new Map<string, TMDbMovieDetails>();
      results.matched.forEach(match => {
        if (match.selectedMatch) {
          newSelectedMatches.set(match.originalTitle, match.selectedMatch);
        }
      });
      setSelectedMatches(newSelectedMatches);
      
      // Initialize empty formats for each matched movie
      const newSelectedFormats = new Map<string, string[]>();
      results.matched.forEach(match => {
        newSelectedFormats.set(match.originalTitle, []);
      });
      setSelectedFormats(newSelectedFormats);
    } catch (error) {
      console.error('Search failed:', error);
      alert('Failed to search movies. Please try again.');
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
      newSelectedFormats.set(originalTitle, currentFormats.filter(f => f !== format));
    } else {
      newSelectedFormats.set(originalTitle, [...currentFormats, format]);
    }
    
    setSelectedFormats(newSelectedFormats);
  };

  const handleBulkFormatApply = () => {
    if (!bulkFormat) return;
    
    const newSelectedFormats = new Map(selectedFormats);
    searchResults?.matched.forEach(match => {
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

    // Prepare physical items for bulk creation
    const physicalItems: BulkPhysicalItemDto[] = [];
    
    searchResults.matched.forEach(match => {
      const selectedMovie = selectedMatches.get(match.originalTitle);
      const formats = selectedFormats.get(match.originalTitle) || [];
      
      if (selectedMovie && formats.length > 0) {
        // Auto-generate name: Title + Primary Format
        const primaryFormat = formats[0];
        const itemName = `${selectedMovie.title} ${primaryFormat}`;
        
        physicalItems.push({
          name: itemName,
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
      alert('Please select at least one format for the movies you want to import.');
      return;
    }

    setIsImporting(true);
    try {
      const results = await apiService.bulkCreatePhysicalItems(physicalItems);
      setImportResults(results);
      
      if (results.successful.length > 0) {
        onSuccess(); // Refresh the collection
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import movies. Please try again.');
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

  if (importResults) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Import Results
        </h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {importResults.summary.successful}
              </div>
              <div className="text-sm text-green-600 dark:text-green-400">Successful</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {importResults.summary.failed}
              </div>
              <div className="text-sm text-red-600 dark:text-red-400">Failed</div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {importResults.summary.total}
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">Total</div>
            </div>
          </div>

          {importResults.failed.length > 0 && (
            <div>
              <h4 className="font-medium text-red-600 dark:text-red-400 mb-2">Failed Imports:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                {importResults.failed.map((failed: any, index: number) => (
                  <li key={index}>
                    <strong>{failed.originalTitle}</strong>: {failed.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="btn-primary"
            >
              Import More Movies
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Bulk Add Movies
      </h3>
      
      {!searchResults ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Movie Titles (one per line)
            </label>
            <textarea
              value={movieTitles}
              onChange={(e) => setMovieTitles(e.target.value)}
              placeholder="Enter movie titles, one per line:&#10;The Matrix&#10;Inception&#10;Interstellar"
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Enter each movie title on a separate line. Maximum 200 titles per search.
            </p>
          </div>
          
          <button
            onClick={handleSearch}
            disabled={isSearching || !movieTitles.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {isSearching ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Searching...
              </>
            ) : (
              'Search Movies'
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                {searchResults.summary.matched}
              </div>
              <div className="text-sm text-green-600 dark:text-green-400">Found</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              <div className="text-xl font-bold text-red-600 dark:text-red-400">
                {searchResults.summary.unmatched}
              </div>
              <div className="text-sm text-red-600 dark:text-red-400">Not Found</div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {searchResults.summary.total}
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">Total</div>
            </div>
          </div>

          {/* Bulk Format Selection */}
          {searchResults.matched.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                Apply Format to All Movies
              </h4>
              <div className="flex gap-2">
                <select
                  value={bulkFormat}
                  onChange={(e) => setBulkFormat(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Select format...</option>
                  {availableFormats.map(format => (
                    <option key={format} value={format}>{format}</option>
                  ))}
                </select>
                <button
                  onClick={handleBulkFormatApply}
                  disabled={!bulkFormat}
                  className="btn-secondary disabled:opacity-50"
                >
                  Apply to All
                </button>
              </div>
            </div>
          )}

          {/* Matched Movies */}
          {searchResults.matched.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                Found Movies ({searchResults.matched.length})
              </h4>
              <div className="space-y-4">
                {searchResults.matched.map((match, index) => {
                  const selectedMovie = selectedMatches.get(match.originalTitle);
                  const formats = selectedFormats.get(match.originalTitle) || [];
                  
                  return (
                    <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                      <div className="flex gap-4">
                        <div className="flex-shrink-0">
                          {selectedMovie?.poster_path && (
                            <img
                              src={getImageUrl(selectedMovie.poster_path)}
                              alt={selectedMovie.title}
                              className="w-16 h-24 object-cover rounded"
                            />
                          )}
                        </div>
                        
                        <div className="flex-1 space-y-3">
                          <div>
                            <h5 className="font-medium text-gray-900 dark:text-gray-100">
                              Original: "{match.originalTitle}"
                            </h5>
                            
                            {match.matches.length > 1 ? (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Select correct match:
                                </label>
                                <select
                                  value={selectedMovie?.id || ''}
                                  onChange={(e) => {
                                    const movieId = parseInt(e.target.value);
                                    const movie = match.matches.find(m => m.id === movieId);
                                    if (movie) {
                                      handleMatchSelection(match.originalTitle, movie);
                                    }
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                >
                                  {match.matches.map(movie => (
                                    <option key={movie.id} value={movie.id}>
                                      {movie.title} ({movie.release_date?.split('-')[0] || 'Unknown'})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                <p>Matched: {selectedMovie?.title} ({selectedMovie?.release_date?.split('-')[0] || 'Unknown'})</p>
                                {selectedMovie?.director && (
                                  <p>Director: {selectedMovie.director}</p>
                                )}
                                {selectedMovie?.cast && selectedMovie.cast.length > 0 && (
                                  <p>Cast: {selectedMovie.cast.slice(0, 3).join(', ')}{selectedMovie.cast.length > 3 ? '...' : ''}</p>
                                )}
                              </div>
                            )}
                            
                            {/* Show additional details for selected movie */}
                            {selectedMovie && match.matches.length > 1 && (
                              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                {selectedMovie.director && (
                                  <p>Director: {selectedMovie.director}</p>
                                )}
                                {selectedMovie.cast && selectedMovie.cast.length > 0 && (
                                  <p>Cast: {selectedMovie.cast.slice(0, 3).join(', ')}{selectedMovie.cast.length > 3 ? '...' : ''}</p>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Physical Formats *
                            </label>
                            
                            {/* Selected formats as chips */}
                            {formats.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {formats.map((format) => (
                                  <span
                                    key={format}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200"
                                  >
                                    {format}
                                    <button
                                      type="button"
                                      onClick={() => handleFormatToggle(match.originalTitle, format)}
                                      className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
                                    >
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                      </svg>
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            
                            {/* Format buttons */}
                            <div className="flex flex-wrap gap-2">
                              {availableFormats
                                .filter(format => !formats.includes(format))
                                .map(format => (
                                  <button
                                    key={format}
                                    type="button"
                                    onClick={() => handleFormatToggle(match.originalTitle, format)}
                                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                  >
                                    + {format}
                                  </button>
                                ))}
                            </div>
                            
                            {formats.length === 0 && (
                              <p className="mt-1 text-sm text-red-500 dark:text-red-400">
                                Select at least one format to import this movie
                              </p>
                            )}
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
            <div>
              <h4 className="font-medium text-red-600 dark:text-red-400 mb-3">
                Not Found ({searchResults.unmatched.length})
              </h4>
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                <ul className="list-disc list-inside space-y-1 text-sm text-red-600 dark:text-red-400">
                  {searchResults.unmatched.map((unmatched, index) => (
                    <li key={index}>
                      <strong>{unmatched.originalTitle}</strong>: {unmatched.error}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  Try searching with different titles or add these movies manually.
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={isImporting || searchResults.matched.every(match => 
                (selectedFormats.get(match.originalTitle) || []).length === 0
              )}
              className="btn-primary disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Importing...
                </>
              ) : (
                `Import ${searchResults.matched.filter(match => 
                  (selectedFormats.get(match.originalTitle) || []).length > 0
                ).length} Movies`
              )}
            </button>
            
            <button
              onClick={handleReset}
              className="btn-secondary"
            >
              Start Over
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkAddForm;
