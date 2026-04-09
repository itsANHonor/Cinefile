import React, { useState, useEffect, useCallback } from 'react';
import { Media, SortField, SortOrder } from '../types';
import { apiService } from '../services/api.service';
import { useAuth } from '../context/AuthContext';
import MediaEditModal from '../components/MediaEditModal';
import BulkMetadataOperation from '../components/BulkMetadataOperation';

const MoviesPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [movies, setMovies] = useState<Media[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<Media | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>('title');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showBulkMetadata, setShowBulkMetadata] = useState(false);
  const [mediaType, setMediaType] = useState<'all' | 'movie' | 'tv_season'>('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    if (isAuthenticated) {
      loadInitialData();
    }
  }, [isAuthenticated, sortBy, sortOrder, debouncedSearchQuery, mediaType]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const response = await apiService.getMedia({
        sort_by: sortBy,
        sort_order: sortOrder,
        search: debouncedSearchQuery || undefined,
        media_type: mediaType !== 'all' ? mediaType : undefined,
        page: 1,
        limit: 100,
      });
      setMovies(response.items);
      setCurrentPage(1);
      setHasMore(response.pagination.hasNext);
      setTotalCount(response.pagination.total);
    } catch (error) {
      console.error('Failed to load media:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreItems = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const response = await apiService.getMedia({
        sort_by: sortBy,
        sort_order: sortOrder,
        search: debouncedSearchQuery || undefined,
        media_type: mediaType !== 'all' ? mediaType : undefined,
        page: nextPage,
        limit: 100,
      });
      
      setMovies(prev => [...prev, ...response.items]);
      setCurrentPage(nextPage);
      setHasMore(response.pagination.hasNext);
    } catch (error) {
      console.error('Failed to load more media:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, currentPage, sortBy, sortOrder, debouncedSearchQuery, mediaType]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop !== document.documentElement.offsetHeight) {
        return;
      }
      if (!isLoadingMore && hasMore) {
        loadMoreItems();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoadingMore, hasMore, loadMoreItems]);

  const handleSortChange = (newSortBy: SortField) => {
    if (newSortBy === sortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleEditMovie = (movie: Media) => {
    setSelectedMovie(movie);
    setShowEditModal(true);
  };

  const handleSaveMovie = (updatedMovie: Media) => {
    setMovies(prev => prev.map(m => m.id === updatedMovie.id ? updatedMovie : m));
    setShowEditModal(false);
    setSelectedMovie(null);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setSelectedMovie(null);
  };

  const handleDeleteMedia = async (movie: Media) => {
    const itemType = movie.media_type === 'tv_season' ? 'TV season' : 'movie';
    const confirmed = window.confirm(
      `Are you sure you want to delete "${movie.title}"?\n\nThis will remove the ${itemType} from your collection and from any physical items it's linked to. This action cannot be undone.`
    );
    
    if (!confirmed) return;

    try {
      await apiService.deleteMedia(movie.id);
      setMovies(prev => prev.filter(m => m.id !== movie.id));
    } catch (error) {
      console.error('Failed to delete media:', error);
      alert('Failed to delete item. Please try again.');
    }
  };

  const getCountLabel = () => {
    if (totalCount === 0) return 'Loading...';
    if (mediaType === 'movie') {
      return `${totalCount.toLocaleString()} ${totalCount === 1 ? 'movie' : 'movies'}`;
    }
    if (mediaType === 'tv_season') {
      return `${totalCount.toLocaleString()} TV ${totalCount === 1 ? 'season' : 'seasons'}`;
    }
    return `${totalCount.toLocaleString()} ${totalCount === 1 ? 'item' : 'items'}`;
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Access Denied
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            You need to be logged in to access media management.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Loading media...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Media Management
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              {totalCount > 0 ? `${getCountLabel()} in your collection` : 'Loading...'}
            </p>
          </div>
          <button
            onClick={() => setShowBulkMetadata(!showBulkMetadata)}
            className="btn-primary"
          >
            {showBulkMetadata ? 'Hide' : 'Bulk Update Metadata'}
          </button>
        </div>
      </div>

      {/* Bulk Metadata Operation */}
      {showBulkMetadata && (
        <div className="mb-6">
          <BulkMetadataOperation
          onComplete={() => {
            loadInitialData();
          }}
          />
        </div>
      )}

      {/* Controls */}
      <div className="card mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <input
                type="text"
                placeholder="Search media..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
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
            </div>
          </div>

          {/* Media Type Filter */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            {(['all', 'movie', 'tv_season'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setMediaType(type)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mediaType === type
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {type === 'all' ? 'All' : type === 'movie' ? 'Movies' : 'TV Seasons'}
              </button>
            ))}
          </div>

          {/* Sort Options */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleSortChange('title')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === 'title'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Title {sortBy === 'title' && (sortOrder === 'asc' ? '\u2191' : '\u2193')}
            </button>
            <button
              onClick={() => handleSortChange('director_last_name')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === 'director_last_name'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {mediaType === 'tv_season' ? 'Creator' : 'Director'} {sortBy === 'director_last_name' && (sortOrder === 'asc' ? '\u2191' : '\u2193')}
            </button>
            <button
              onClick={() => handleSortChange('release_date')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === 'release_date'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Year {sortBy === 'release_date' && (sortOrder === 'asc' ? '\u2191' : '\u2193')}
            </button>
            <button
              onClick={() => handleSortChange('created_at')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === 'created_at'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Added {sortBy === 'created_at' && (sortOrder === 'asc' ? '\u2191' : '\u2193')}
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 text-sm rounded-l-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm rounded-r-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Media Grid/List */}
      {movies.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V1a1 1 0 011-1h2a1 1 0 011 1v3m0 0h8M7 4v16a1 1 0 001 1h8a1 1 0 001-1V4M7 4H5a1 1 0 00-1 1v14a1 1 0 001 1h2V4z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No Media Found</h3>
          <p className="text-gray-600 dark:text-gray-300">
            {searchQuery 
              ? 'No items match your search. Try adjusting your search terms.' 
              : 'No items have been added to your collection yet.'}
          </p>
        </div>
      ) : (
        <div className={viewMode === 'grid' 
          ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6'
          : 'space-y-4'
        }>
          {movies.map((movie) => {
            const isTV = movie.media_type === 'tv_season';
            
            return (
              <div
                key={movie.id}
                className={`card hover:shadow-lg transition-shadow relative group ${
                  viewMode === 'list' ? 'flex items-center space-x-4' : ''
                }`}
              >
                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMedia(movie);
                  }}
                  className="absolute top-2 right-2 z-10 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-700 transition-all duration-200"
                  title="Delete item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>

                {/* TV Badge (grid view only) */}
                {isTV && viewMode === 'grid' && (
                  <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 bg-purple-600 text-white text-[10px] font-bold rounded">
                    TV
                  </div>
                )}

                <div 
                  className="cursor-pointer"
                  onClick={() => handleEditMovie(movie)}
                >
                  {viewMode === 'grid' ? (
                    <>
                      <div className="aspect-[2/3] mb-4">
                        {movie.cover_art_url ? (
                          <img
                            src={movie.cover_art_url}
                            alt={movie.title}
                            className="w-full h-full object-cover rounded-lg"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder-movie.jpg';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V1a1 1 0 011-1h2a1 1 0 011 1v3m0 0h8M7 4v16a1 1 0 001 1h8a1 1 0 001-1V4M7 4H5a1 1 0 00-1 1v14a1 1 0 001 1h2V4z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">
                        {movie.title}
                      </h3>
                      {movie.director && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                          {movie.director}
                        </p>
                      )}
                      {movie.release_date && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                          {new Date(movie.release_date).getFullYear()}
                        </p>
                      )}
                      {movie.genres && movie.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {movie.genres.slice(0, 3).map((genre) => (
                            <span
                              key={genre.id}
                              className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                            >
                              {genre.name}
                            </span>
                          ))}
                          {movie.genres.length > 3 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              +{movie.genres.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* List View */}
                      <div className="w-16 h-24 flex-shrink-0 relative">
                        {isTV && (
                          <div className="absolute top-0 left-0 z-10 px-1 py-0.5 bg-purple-600 text-white text-[9px] font-bold rounded-br">
                            TV
                          </div>
                        )}
                        {movie.cover_art_url ? (
                          <img
                            src={movie.cover_art_url}
                            alt={movie.title}
                            className="w-full h-full object-cover rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder-movie.jpg';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V1a1 1 0 011-1h2a1 1 0 011 1v3m0 0h8M7 4v16a1 1 0 001 1h8a1 1 0 001-1V4M7 4H5a1 1 0 00-1 1v14a1 1 0 001 1h2V4z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                          {movie.title}
                        </h3>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-300 mb-2">
                          {movie.director && (
                            <span>
                              {isTV ? 'Creator: ' : ''}{movie.director}
                            </span>
                          )}
                          {movie.release_date && <span>{new Date(movie.release_date).getFullYear()}</span>}
                          {isTV && movie.tv_show_name && (
                            <span className="text-purple-600 dark:text-purple-400">
                              {movie.tv_show_name} {movie.season_number != null && `- Season ${movie.season_number}`}
                            </span>
                          )}
                          {!isTV && movie.series && movie.series.length > 0 && (
                            <span className="text-primary-600 dark:text-primary-400">
                              {movie.series.map(s => s.name).join(', ')}
                            </span>
                          )}
                        </div>
                        {movie.genres && movie.genres.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {movie.genres.map((genre) => (
                              <span
                                key={genre.id}
                                className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                              >
                                {genre.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Loading more indicator */}
      {isLoadingMore && (
        <div className="flex justify-center py-8">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
            Loading more...
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <MediaEditModal
        media={selectedMovie}
        isOpen={showEditModal}
        onClose={handleCloseEditModal}
        onSave={handleSaveMovie}
      />
    </div>
  );
};

export default MoviesPage;
