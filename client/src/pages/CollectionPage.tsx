import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhysicalItem, PhysicalFormat, SortField, SortOrder, CollectionStatistics as Stats } from '../types';
import { apiService } from '../services/api.service';
import { useAuth } from '../context/AuthContext';
import { useServerMode } from '../context/ServerModeContext';
import MediaGrid from '../components/MediaGrid';
import FilterBar from '../components/FilterBar';
import MediaDetailModal from '../components/MediaDetailModal';
import MediaForm from '../components/MediaForm';
import CollectionStatistics from '../components/CollectionStatistics';
import StickyHeader from '../components/StickyHeader';

const SESSION_SORT_BY_KEY = 'collection_sort_by';
const SESSION_SORT_ORDER_KEY = 'collection_sort_order';

const CollectionPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isReadOnly } = useServerMode();
  
  // Only allow edit mode when authenticated AND not in read-only mode
  const canEdit = isAuthenticated && !isReadOnly;
  const [physicalItems, setPhysicalItems] = useState<PhysicalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedItem, setSelectedItem] = useState<PhysicalItem | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('Media Collection');
  
  // Filter state
  const [format, setFormat] = useState<PhysicalFormat | PhysicalFormat[]>('all');
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [selectedDecades, setSelectedDecades] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<'all' | 'movie' | 'tv_season'>('all');
  const [sortBy, setSortBy] = useState<SortField>('title');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  
  // Infinite scroll state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  
  // Admin edit state
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PhysicalItem | null>(null);
  
  // Statistics state
  const [statistics, setStatistics] = useState<Stats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  
  // Scroll detection state
  const [isScrolled, setIsScrolled] = useState(false);
  
  // Ref for canceling in-flight statistics requests
  const statsAbortControllerRef = useRef<AbortController | null>(null);

  // Initialize sort preferences and collection title
  useEffect(() => {
    const initializeSettings = async () => {
      try {
        const settings = await apiService.getSettings();
        
        // Load collection title for all users
        setCollectionTitle(settings.collection_title || 'Media Collection');
        
        if (canEdit) {
          // Admin user: use server-side default sort settings
          const adminSortBy = (settings.default_sort_by as SortField) || 'created_at';
          const adminSortOrder = (settings.default_sort_order as SortOrder) || 'desc';
          setSortBy(adminSortBy);
          setSortOrder(adminSortOrder);
        } else {
          // Public user: check session storage, default to title ascending
          const savedSortBy = sessionStorage.getItem(SESSION_SORT_BY_KEY) as SortField | null;
          const savedSortOrder = sessionStorage.getItem(SESSION_SORT_ORDER_KEY) as SortOrder | null;
          
          if (savedSortBy && savedSortOrder) {
            setSortBy(savedSortBy);
            setSortOrder(savedSortOrder);
          }
          // else: keep default 'title' and 'asc' from state initialization
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
      setIsInitialized(true);
    };

    initializeSettings();
  }, [canEdit]);

  // Debounce search query to prevent API calls on every keystroke
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms delay

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    if (isInitialized) {
      loadInitialData();
    }
  }, [format, selectedGenres, selectedDecades, mediaType, sortBy, sortOrder, debouncedSearchQuery, isInitialized]);

  // Load statistics on mount and when filters change (debounced)
  useEffect(() => {
    // Cancel any in-flight request
    if (statsAbortControllerRef.current) {
      statsAbortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    statsAbortControllerRef.current = abortController;

    const loadStatistics = async () => {
      setIsLoadingStats(true);
      try {
        // Prepare filter values
        const formatValue: PhysicalFormat | PhysicalFormat[] | undefined = Array.isArray(format) 
          ? (format.length === 0 ? undefined : format)
          : (format === 'all' ? undefined : format);
        
        const stats = await apiService.getStatistics({
          format: formatValue,
          genres: selectedGenres.length > 0 ? selectedGenres : undefined,
          decades: selectedDecades.length > 0 ? selectedDecades : undefined,
          search: debouncedSearchQuery || undefined,
        });
        
        // Only update if request wasn't aborted
        if (!abortController.signal.aborted) {
          setStatistics(stats);
        }
      } catch (error: any) {
        // Ignore abort errors
        if (error.name !== 'AbortError' && !abortController.signal.aborted) {
          console.error('Failed to load statistics:', error);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingStats(false);
        }
      }
    };

    // Debounce statistics loading
    const timeoutId = setTimeout(() => {
      loadStatistics();
    }, 400); // 400ms delay

    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [format, selectedGenres, selectedDecades, debouncedSearchQuery]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      // Load physical items with filters
      const formatValue: PhysicalFormat | PhysicalFormat[] | undefined = Array.isArray(format) 
        ? (format.length === 0 ? undefined : format)
        : (format === 'all' ? undefined : format);
      
      const response = await apiService.getPhysicalItems({
        format: formatValue,
        genres: selectedGenres.length > 0 ? selectedGenres : undefined,
        decades: selectedDecades.length > 0 ? selectedDecades : undefined,
        media_type: mediaType !== 'all' ? mediaType : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        search: debouncedSearchQuery || undefined,
        page: 1,
        limit: 50,
      });
      setPhysicalItems(response.items);
      setCurrentPage(1);
      setHasMore(response.pagination.hasNext);
      setTotalCount(response.pagination.total);
    } catch (error) {
      console.error('Failed to load collection:', error);
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false); // Mark initial load complete
    }
  };

  const loadMoreItems = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const formatValue: PhysicalFormat | PhysicalFormat[] | undefined = Array.isArray(format) 
        ? (format.length === 0 ? undefined : format)
        : (format === 'all' ? undefined : format);
      
      const response = await apiService.getPhysicalItems({
        format: formatValue,
        genres: selectedGenres.length > 0 ? selectedGenres : undefined,
        decades: selectedDecades.length > 0 ? selectedDecades : undefined,
        media_type: mediaType !== 'all' ? mediaType : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        search: debouncedSearchQuery || undefined,
        page: nextPage,
        limit: 50,
      });
      
      setPhysicalItems(prev => [...prev, ...response.items]);
      setCurrentPage(nextPage);
      setHasMore(response.pagination.hasNext);
    } catch (error) {
      console.error('Failed to load more items:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, currentPage, format, selectedGenres, selectedDecades, mediaType, sortBy, sortOrder, debouncedSearchQuery]);

  const handleSortChange = (newSortBy: SortField, newSortOrder: SortOrder) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    
    // Save to session storage for public users
    if (!canEdit) {
      sessionStorage.setItem(SESSION_SORT_BY_KEY, newSortBy);
      sessionStorage.setItem(SESSION_SORT_ORDER_KEY, newSortOrder);
    }
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleClearFilters = () => {
    setFormat('all');
    setSelectedGenres([]);
    setSelectedDecades([]);
    setMediaType('all');
    setSearchQuery('');
    // Reset to default sort for public users
    if (!canEdit) {
      setSortBy('title');
      setSortOrder('asc');
    }
  };

  // Extract available genres and decades from collection
  const availableGenres = React.useMemo(() => {
    const genreMap = new Map<number, { id: number; name: string }>();
    physicalItems.forEach(item => {
      item.media.forEach(media => {
        if (media.genres) {
          media.genres.forEach(genre => {
            if (!genreMap.has(genre.id)) {
              genreMap.set(genre.id, genre);
            }
          });
        }
      });
    });
    return Array.from(genreMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [physicalItems]);

  const availableDecades = React.useMemo(() => {
    const decadeSet = new Set<string>();
    physicalItems.forEach(item => {
      item.media.forEach(media => {
        if (media.release_date) {
          const year = new Date(media.release_date).getFullYear();
          const decade = Math.floor(year / 10) * 10;
          decadeSet.add(decade.toString());
        }
      });
    });
    return Array.from(decadeSet).sort((a, b) => parseInt(a) - parseInt(b));
  }, [physicalItems]);


  const handleEditItem = (item: PhysicalItem) => {
    setEditingItem(item);
    setShowEditForm(true);
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      await apiService.deletePhysicalItem(itemId);
      // Reload data to refresh the list
      await loadInitialData();
      refreshStatistics(); // Refresh statistics
    } catch (error) {
      console.error('Failed to delete physical item:', error);
      alert('Failed to delete item. Please try again.');
    }
  };

  const refreshStatistics = async () => {
    // Cancel any in-flight request
    if (statsAbortControllerRef.current) {
      statsAbortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    statsAbortControllerRef.current = abortController;

    try {
      setIsLoadingStats(true);
      // Prepare filter values
      const formatValue: PhysicalFormat | PhysicalFormat[] | undefined = Array.isArray(format) 
        ? (format.length === 0 ? undefined : format)
        : (format === 'all' ? undefined : format);
      
      const stats = await apiService.getStatistics({
        format: formatValue,
        genres: selectedGenres.length > 0 ? selectedGenres : undefined,
        decades: selectedDecades.length > 0 ? selectedDecades : undefined,
        search: debouncedSearchQuery || undefined,
      });
      
      if (!abortController.signal.aborted) {
        setStatistics(stats);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError' && !abortController.signal.aborted) {
        console.error('Failed to refresh statistics:', error);
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoadingStats(false);
      }
    }
  };

  const handleEditSuccess = () => {
    setShowEditForm(false);
    setEditingItem(null);
    loadInitialData(); // Reload data to show changes
    refreshStatistics(); // Refresh statistics
  };

  // Scroll detection for sticky header
  useEffect(() => {
    const handleScroll = () => {
      const scrollThreshold = 100; // Start sticking after 100px scroll
      setIsScrolled(window.scrollY > scrollThreshold);
    };

    // Throttle scroll events - runs immediately and then at most every 16ms
    let isThrottled = false;
    const throttledHandleScroll = () => {
      if (!isThrottled) {
        handleScroll();
        isThrottled = true;
        setTimeout(() => {
          isThrottled = false;
        }, 16); // ~60fps
      }
    };

    window.addEventListener('scroll', throttledHandleScroll);
    // Check initial scroll position
    handleScroll();
    
    return () => {
      window.removeEventListener('scroll', throttledHandleScroll);
    };
  }, []);

  // Infinite scroll effect
  useEffect(() => {
    const handleScroll = () => {
      if (isLoading || isLoadingMore || !hasMore) return;
      
      const scrollPosition = window.innerHeight + window.scrollY;
      const threshold = document.documentElement.scrollHeight - 300;
      
      if (scrollPosition >= threshold) {
        loadMoreItems();
      }
    };

    // Throttle scroll events
    let timeoutId: number;
    const throttledHandleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(handleScroll, 100);
    };

    window.addEventListener('scroll', throttledHandleScroll);
    return () => {
      window.removeEventListener('scroll', throttledHandleScroll);
      clearTimeout(timeoutId);
    };
  }, [isLoading, isLoadingMore, hasMore, loadMoreItems]);

  if (isLoading && isInitialLoad) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Loading collection...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Sticky Header - Only shows when scrolled */}
      {isScrolled && (
        <StickyHeader
          statistics={statistics}
          isLoadingStats={isLoadingStats}
          searchQuery={searchQuery}
          format={format}
          sortBy={sortBy}
          sortOrder={sortOrder}
          selectedGenres={selectedGenres}
          selectedDecades={selectedDecades}
          availableGenres={availableGenres}
          availableDecades={availableDecades}
          mediaType={mediaType}
          onSearchChange={handleSearchChange}
          onFormatChange={setFormat}
          onSortChange={handleSortChange}
          onGenresChange={setSelectedGenres}
          onDecadesChange={setSelectedDecades}
          onMediaTypeChange={setMediaType}
          onClearFilters={handleClearFilters}
        />
      )}

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{collectionTitle}</h1>
          {/* View toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            <button
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm"
              disabled
            >
              Virtual
            </button>
            <button
              onClick={() => navigate('/library')}
              className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              Physical
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {statistics && (
        <CollectionStatistics 
          statistics={statistics} 
          isLoading={isLoadingStats}
        />
      )}

      {/* Filter Bar */}
      <FilterBar
        format={format}
        sortBy={sortBy}
        sortOrder={sortOrder}
        searchQuery={searchQuery}
        selectedGenres={selectedGenres}
        selectedDecades={selectedDecades}
        availableGenres={availableGenres}
        availableDecades={availableDecades}
        mediaType={mediaType}
        onFormatChange={setFormat}
        onGenresChange={setSelectedGenres}
        onDecadesChange={setSelectedDecades}
        onSortChange={handleSortChange}
        onSearchChange={handleSearchChange}
        onMediaTypeChange={setMediaType}
        onClearFilters={handleClearFilters}
      />

      {/* Media Grid or Empty State */}
      <div className="relative">
        {isLoading && !isInitialLoad && (
          <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
              <span>Searching...</span>
            </div>
          </div>
        )}
        
        {physicalItems.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect width="18" height="18" x="3" y="3" rx="2"/>
              <path d="M7 3v18"/>
              <path d="M3 7.5h4"/>
              <path d="M3 12h18"/>
              <path d="M3 16.5h4"/>
              <path d="M17 3v18"/>
              <path d="M17 7.5h4"/>
              <path d="M17 16.5h4"/>
            </svg>
          </div>
          
          {/* Check if this is truly empty collection or filtered results */}
          {totalCount === 0 && !debouncedSearchQuery && format === 'all' ? (
            // Truly empty collection
            <>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No Media Found</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Start building your collection by adding your first movie or TV show
              </p>
              {canEdit && (
                <a href="/admin" className="btn-primary inline-block">
                  Add Your First Item
                </a>
              )}
            </>
          ) : (
            // Zero results from search/filters
            <>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No Results Found</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                {debouncedSearchQuery 
                  ? `No items match "${debouncedSearchQuery}". Try adjusting your search or filters.`
                  : format !== 'all' 
                    ? `No items match the selected filter. Try changing your filter settings.`
                    : 'No items found. Try adjusting your search or filters.'
                }
              </p>
              <button 
                onClick={handleClearFilters}
                className="btn-secondary inline-block"
              >
                Clear Filters & Search
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <MediaGrid 
            physicalItems={physicalItems} 
            onItemClick={setSelectedItem}
            isEditMode={canEdit}
            isAuthenticated={canEdit}
            onEditItem={canEdit ? handleEditItem : undefined}
            onDeleteItem={canEdit ? handleDeleteItem : undefined}
          />
          
          {/* Loading indicator */}
          {isLoadingMore && (
            <div className="flex justify-center py-8">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
                Loading more items...
              </div>
            </div>
          )}
        </>
      )}
      </div>

      {/* Detail Modal */}
      <MediaDetailModal
        physicalItem={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* Edit Form Modal - only show if can edit */}
      {canEdit && (
        <MediaForm
          isOpen={showEditForm}
          onClose={() => {
            setShowEditForm(false);
            setEditingItem(null);
          }}
          onSuccess={handleEditSuccess}
          editItem={editingItem}
        />
      )}
    </div>
  );
};

export default CollectionPage;
