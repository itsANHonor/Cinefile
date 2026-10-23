import React, { useState, useEffect, useCallback } from 'react';
import { Media, SortField, SortOrder } from '../types';
import { apiService } from '../services/api.service';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import MediaEditModal from '../components/MediaEditModal';
import BulkMetadataOperation from '../components/BulkMetadataOperation';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';

const MoviesPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [movies, setMovies] = useState<Media[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Media | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>('title');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showBulkMetadata, setShowBulkMetadata] = useState(false);
  const [mediaType, setMediaType] = useState<'all' | 'movie' | 'tv_season'>('all');

  const confirm = useConfirm();
  const { toast } = useToast();

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
    setLoadError(null);
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
      const message = 'Failed to load media. Please try again.';
      setLoadError(message);
      toast({ message, type: 'error', persistent: true });
      console.error('Failed to load media:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreItems = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    setLoadMoreError(null);
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

      setMovies((prev) => [...prev, ...response.items]);
      setCurrentPage(nextPage);
      setHasMore(response.pagination.hasNext);
    } catch (error) {
      const message = 'Failed to load more media. Please try again.';
      setLoadMoreError(message);
      console.error('Failed to load more media:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, currentPage, sortBy, sortOrder, debouncedSearchQuery, mediaType]);

  const sentinelRef = useInfiniteScroll(loadMoreItems, { enabled: !isLoadingMore && hasMore });

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
    const confirmed = await confirm({
      title: `Delete ${itemType}?`,
      message: `Are you sure you want to delete "${movie.title}"? This will remove the ${itemType} from your collection and from any physical items it's linked to. This action cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      await apiService.deleteMedia(movie.id);
      setMovies((prev) => prev.filter((m) => m.id !== movie.id));
    } catch (error) {
      const message = 'Failed to delete item. Please try again.';
      toast({ message, type: 'error' });
      console.error('Failed to delete media:', error);
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

  return (
    <main className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold text-content mb-2">
              Media Management
            </h1>
            <p className="text-content-muted">
              {isLoading ? 'Loading…' : totalCount > 0 ? `${getCountLabel()} in your collection` : 'No media found'}
            </p>
          </div>
          <Button onClick={() => setShowBulkMetadata(!showBulkMetadata)}>
            {showBulkMetadata ? 'Hide' : 'Bulk Update Metadata'}
          </Button>
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
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-gray-700 dark:text-gray-100"
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

      {/* Loading skeleton */}
      {isLoading && (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6' : 'space-y-4'}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card">
              <Skeleton className="aspect-[2/3] w-full rounded-[--radius-control]" />
              <Skeleton className="mt-3 h-4 w-3/4 rounded-[--radius-control]" />
              <Skeleton className="mt-2 h-3 w-1/2 rounded-[--radius-control]" />
            </div>
          ))}
        </div>
      )}

      {loadError && (
        <EmptyState
          title="Couldn’t load media"
          description={loadError}
          action={<Button onClick={() => loadInitialData()} variant="secondary">Try again</Button>}
        />
      )}

      {/* Media Grid/List */}
      {!isLoading && movies.length === 0 && (
        <EmptyState
          title="No media found"
          description={
            searchQuery
              ? 'No items match your search. Try adjusting your search terms.'
              : 'No items have been added to your collection yet.'
          }
        />
      )}

      {movies.length > 0 && (
        <>
        <div
          role="list"
          className={viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6'
            : 'space-y-4'
          }
        >
          {movies.map((movie) => {
            const isTV = movie.media_type === 'tv_season';

            return (
              <div
                key={movie.id}
                role="listitem"
                className={`card group relative transition-shadow hover:shadow-lg ${
                  viewMode === 'list' ? 'flex items-center space-x-4' : ''
                }`}
              >
                {/* Delete Button */}
                <IconButton
                  size="sm"
                  variant="danger"
                  aria-label={`Delete ${movie.title}`}
                  onClick={() => handleDeleteMedia(movie)}
                  className="absolute top-2 right-2 z-10 bg-red-600/90 text-white backdrop-blur-sm"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </IconButton>

                {/* TV Badge (grid view only) */}
                {isTV && viewMode === 'grid' && (
                  <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 bg-purple-600 text-white text-[10px] font-bold rounded">
                    TV
                  </div>
                )}

                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit ${movie.title}`}
                  className="cursor-pointer rounded-[--radius-card] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  onClick={() => handleEditMovie(movie)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleEditMovie(movie);
                    }
                  }}
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
        <div ref={sentinelRef} className="h-px" aria-hidden="true" />

        {loadMoreError && (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-[--radius-card] border border-subtle bg-surface-raised p-4 text-center">
            <p className="text-sm text-content">{loadMoreError}</p>
            <Button onClick={() => loadMoreItems()} variant="secondary" size="sm">Try again</Button>
          </div>
        )}
        </>
      )}

      {/* Loading more indicator */}
      {isLoadingMore && (
        <div className="mt-6 flex items-center justify-center gap-2 text-content-muted">
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading more…</span>
        </div>
      )}

      {/* Edit Modal */}
      <MediaEditModal
        media={selectedMovie}
        isOpen={showEditModal}
        onClose={handleCloseEditModal}
        onSave={handleSaveMovie}
      />
    </main>
  );
};

export default MoviesPage;
