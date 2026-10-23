import React, { useState, useEffect } from 'react';
import { Media, PhysicalItem } from '../types';
import { apiService } from '../services/api.service';
import { useToast } from '../context/ToastContext';
import FormatSelector from './FormatSelector';

interface ExistingMoviesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (movie: Media, formats: string[]) => void;
  currentPhysicalItem?: PhysicalItem | null;
}

const ExistingMoviesModal: React.FC<ExistingMoviesModalProps> = ({ 
  isOpen, 
  onClose, 
  onSelect, 
  currentPhysicalItem 
}) => {
  const [movies, setMovies] = useState<Media[]>([]);
  const [filteredMovies, setFilteredMovies] = useState<Media[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showFormatSelector, setShowFormatSelector] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Media | null>(null);
  const { toast } = useToast();

  // Get IDs of movies already linked to current physical item
  const linkedMovieIds = currentPhysicalItem?.media.map(m => m.id) || [];

  useEffect(() => {
    if (isOpen) {
      loadMovies();
    }
  }, [isOpen]);

  useEffect(() => {
    // Filter movies based on search query and exclude already linked movies
    const filtered = movies.filter(movie => {
      const matchesSearch = !searchQuery || 
        movie.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movie.director?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movie.synopsis?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const notLinked = !linkedMovieIds.includes(movie.id);
      
      return matchesSearch && notLinked;
    });
    
    setFilteredMovies(filtered);
  }, [movies, searchQuery, linkedMovieIds]);

  const loadMovies = async () => {
    setIsLoading(true);
    try {
      // Load all movies by requesting a high limit
      const response = await apiService.getMedia({ limit: 10000 });
      setMovies(response.items);
    } catch (error) {
      console.error('Failed to load movies:', error);
      toast({ message: 'Failed to load movies. Please try again.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMovieSelect = (movie: Media) => {
    setSelectedMovie(movie);
    setShowFormatSelector(true);
  };

  const handleFormatsSelected = (formats: string[]) => {
    if (selectedMovie) {
      onSelect(selectedMovie, formats);
      setShowFormatSelector(false);
      setSelectedMovie(null);
      onClose();
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSelectedMovie(null);
    setShowFormatSelector(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Link Existing Movie
              </h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search movies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-gray-700 dark:text-gray-100"
                />
                <svg
                  className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Movies List */}
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : filteredMovies.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h18M3 12h18M3 16h18" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    {searchQuery ? 'No movies found' : 'No movies available'}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    {searchQuery 
                      ? 'Try adjusting your search terms'
                      : 'All movies are already linked to this physical item'
                    }
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredMovies.map((movie) => (
                    <div
                      key={movie.id}
                      className="card hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => handleMovieSelect(movie)}
                    >
                      <div className="flex gap-4">
                        {/* Movie Poster */}
                        <div className="w-16 h-24 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden flex-shrink-0">
                          {movie.cover_art_url ? (
                            <img
                              src={movie.cover_art_url}
                              alt={movie.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h18M3 12h18M3 16h18" />
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Movie Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 mb-1">
                            {movie.title}
                          </h3>
                          {movie.release_date && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                              {new Date(movie.release_date).getFullYear()}
                            </p>
                          )}
                          {movie.director && (
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                              Directed by {movie.director}
                            </p>
                          )}
                          {movie.synopsis && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                              {movie.synopsis}
                            </p>
                          )}
                        </div>

                        {/* Link Button */}
                        <div className="flex items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMovieSelect(movie);
                            }}
                            className="btn-primary text-sm"
                          >
                            Link
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Format Selector Modal */}
      <FormatSelector
        isOpen={showFormatSelector}
        onClose={() => {
          setShowFormatSelector(false);
          setSelectedMovie(null);
        }}
        onConfirm={handleFormatsSelected}
        movieTitle={selectedMovie?.title || ''}
      />
    </>
  );
};

export default ExistingMoviesModal;
