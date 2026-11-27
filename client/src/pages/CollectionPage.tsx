import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CollectionMedia,
  Media,
  PhysicalItem,
  PhysicalFormat,
  SortField,
  SortOrder,
  CollectionStatistics as Stats,
} from '../types';
import { apiService } from '../services/api.service';
import { useAuth } from '../context/AuthContext';
import { useServerMode } from '../context/ServerModeContext';
import { useFacets, resetFacetsCache } from '../hooks/useFacets';
import { useCollectionParams } from '../hooks/useCollectionParams';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useToast } from '../context/ToastContext';
import MediaGrid from '../components/MediaGrid';
import MovieGrid from '../components/MovieGrid';
import CollectionToolbar from '../components/CollectionToolbar';
import MediaDetailModal from '../components/MediaDetailModal';
import MovieDetailModal from '../components/MovieDetailModal';
import MediaEditModal from '../components/MediaEditModal';
import MediaForm from '../components/MediaForm';
import BarcodeScanModal from '../components/BarcodeScanModal';
import CollectionStatistics from '../components/CollectionStatistics';
import FormatBadgeToggle from '../components/FormatBadgeToggle';
import CollectionShowcaseModal from '../components/CollectionShowcaseModal';
import PhysicalLibraryPage from './PhysicalLibraryPage';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SEGMENTED_TRACK_CLASSES, segmentedItemClasses } from '../components/ui/SegmentedControl';

const SESSION_SORT_BY_KEY = 'collection_sort_by';
const SESSION_SORT_ORDER_KEY = 'collection_sort_order';

function collectionMediaToShowcaseItem(movie: CollectionMedia): PhysicalItem {
  return {
    id: movie.id,
    name: movie.title,
    physical_format: movie.owned_formats ?? [],
    edition_notes: movie.owned_editions?.length ? movie.owned_editions.join(', ') : undefined,
    thickness_units: 1,
    shelf_placement: movie.physical_items?.[0]?.shelf_placement ?? undefined,
    media: [movie],
  };
}

const CollectionPage: React.FC = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isReadOnly } = useServerMode();
  
  // Only allow edit mode when authenticated AND not in read-only mode
  const canEdit = isAuthenticated && !isReadOnly;
  const [physicalItems, setPhysicalItems] = useState<PhysicalItem[]>([]);
  const [matchingIds, setMatchingIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPrivateCollection, setIsPrivateCollection] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [selectedItem, setSelectedItem] = useState<PhysicalItem | null>(null);
  const [selectedItemInitialMediaId, setSelectedItemInitialMediaId] = useState<number | undefined>(undefined);
  const [returnToMovie, setReturnToMovie] = useState<CollectionMedia | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<CollectionMedia | null>(null);
  const [editingMovie, setEditingMovie] = useState<Media | null>(null);
  const [showMovieEditModal, setShowMovieEditModal] = useState(false);
  const [loadingPhysicalItemId, setLoadingPhysicalItemId] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('Media Collection');

  // Movies view state
  const [movies, setMovies] = useState<CollectionMedia[]>([]);
  const [moviesIsLoading, setMoviesIsLoading] = useState(true);
  const [moviesIsInitialLoad, setMoviesIsInitialLoad] = useState(true);
  const [moviesLoadError, setMoviesLoadError] = useState<string | null>(null);
  const [moviesLoadMoreError, setMoviesLoadMoreError] = useState<string | null>(null);
  const [moviesCurrentPage, setMoviesCurrentPage] = useState(1);
  const [moviesHasMore, setMoviesHasMore] = useState(true);
  const [moviesIsLoadingMore, setMoviesIsLoadingMore] = useState(false);
  const [moviesTotalCount, setMoviesTotalCount] = useState(0);
  const moviesRequestIdRef = useRef(0);
  const itemsRequestIdRef = useRef(0);

  const [shelfRefreshKey, setShelfRefreshKey] = useState(0);
  const [isShowcaseOpen, setIsShowcaseOpen] = useState(false);
  const { toast } = useToast();
  
  // Default sort (from admin settings / legacy session storage), used until the URL specifies one
  const [defaultSort, setDefaultSort] = useState<{ sortBy: SortField; sortOrder: SortOrder }>({
    sortBy: 'title',
    sortOrder: 'asc',
  });

  // URL-driven filter/sort/search state
  const { params, setParams, clearAll } = useCollectionParams({
    defaultSortBy: defaultSort.sortBy,
    defaultSortOrder: defaultSort.sortOrder,
  });

  // Raw search box value, debounced into the URL `q` param
  const [searchInput, setSearchInput] = useState(params.q);
  
  // Infinite scroll state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  
  // Facet data (genres / decades from the whole collection)
  const { facets } = useFacets();
  
  // Admin edit state
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PhysicalItem | null>(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  
  // Statistics state
  const [statistics, setStatistics] = useState<Stats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  
  // Ref for canceling in-flight statistics requests
  const statsAbortControllerRef = useRef<AbortController | null>(null);

  const effectiveArchived = canEdit && params.archived;

  // Initialize sort preferences and collection title once auth status has settled
  useEffect(() => {
    if (isAuthLoading) return;

    const initializeSettings = async () => {
      try {
        const settings = await apiService.getSettings();
        
        // Load collection title for all users
        setCollectionTitle(settings.collection_title || 'Media Collection');
        
        if (canEdit) {
          // Admin user: use server-side default sort settings
          const adminSortBy = (settings.default_sort_by as SortField) || 'created_at';
          const adminSortOrder = (settings.default_sort_order as SortOrder) || 'desc';
          setDefaultSort({ sortBy: adminSortBy, sortOrder: adminSortOrder });
        } else {
          // Public user: migrate legacy session storage sort preference (one-time),
          // but only if the URL doesn't already specify a sort.
          const savedSortBy = sessionStorage.getItem(SESSION_SORT_BY_KEY) as SortField | null;
          const savedSortOrder = sessionStorage.getItem(SESSION_SORT_ORDER_KEY) as SortOrder | null;

          if (savedSortBy && savedSortOrder) {
            const hasUrlSort = new URLSearchParams(window.location.search).has('sort');
            if (!hasUrlSort) {
              setDefaultSort({ sortBy: savedSortBy, sortOrder: savedSortOrder });
            }
            sessionStorage.removeItem(SESSION_SORT_BY_KEY);
            sessionStorage.removeItem(SESSION_SORT_ORDER_KEY);
          }
          // else: keep default 'title' and 'asc' from state initialization
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
      setIsInitialized(true);
    };

    initializeSettings();
  }, [canEdit, isAuthLoading]);

  // Keep the search box in sync with the URL when it changes externally
  // (e.g. browser back/forward navigation or clearing all filters).
  useEffect(() => {
    setSearchInput((current) => (current === params.q ? current : params.q));
  }, [params.q]);

  // Debounce search input to prevent API calls (and URL updates) on every keystroke
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchInput !== params.q) {
        setParams({ q: searchInput });
      }
    }, 300); // 300ms delay

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    if (!isInitialized) return;
    if (params.view === 'movies') {
      setMoviesLoadError(null);
      setMoviesLoadMoreError(null);
      loadInitialMovies();
    } else {
      setLoadError(null);
      setLoadMoreError(null);
      loadInitialData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.view,
    params.q,
    params.formats,
    params.genres,
    params.decades,
    params.editions,
    params.versions,
    params.series,
    params.director,
    params.actor,
    params.type,
    effectiveArchived,
    params.sortBy,
    params.sortOrder,
    isInitialized,
  ]);

  // Load statistics on mount and when filters change
  useEffect(() => {
    if (!isInitialized) return;

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
        const formatValue: PhysicalFormat | PhysicalFormat[] | undefined =
          params.formats.length === 0 ? undefined : params.formats;

        const stats = await apiService.getStatistics({
          format: formatValue,
          genres: params.genres.length > 0 ? params.genres : undefined,
          decades: params.decades.length > 0 ? params.decades : undefined,
          editions: params.editions.length > 0 ? params.editions : undefined,
          versions: params.versions.length > 0 ? params.versions : undefined,
          series: params.series.length > 0 ? params.series : undefined,
          director: params.director || undefined,
          actor: params.actor || undefined,
          media_type: params.type !== 'all' ? params.type : undefined,
          search: params.q || undefined,
          archived: effectiveArchived ? true : undefined,
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

    loadStatistics();

    return () => {
      abortController.abort();
    };
  }, [params.formats, params.genres, params.decades, params.editions, params.versions, params.series, params.director, params.actor, params.type, params.q, effectiveArchived, isInitialized]);

  const loadInitialData = async () => {
    const requestId = ++itemsRequestIdRef.current;
    setIsLoading(true);
    setLoadError(null);
    setIsPrivateCollection(false);
    try {
      const formatValue: PhysicalFormat | PhysicalFormat[] | undefined =
        params.formats.length === 0 ? undefined : params.formats;

      const response = await apiService.getPhysicalItems({
        format: formatValue,
        genres: params.genres.length > 0 ? params.genres : undefined,
        decades: params.decades.length > 0 ? params.decades : undefined,
        editions: params.editions.length > 0 ? params.editions : undefined,
        versions: params.versions.length > 0 ? params.versions : undefined,
        series: params.series.length > 0 ? params.series : undefined,
        director: params.director || undefined,
        actor: params.actor || undefined,
        media_type: params.type !== 'all' ? params.type : undefined,
        archived: canEdit && params.archived ? true : undefined,
        sort_by: params.sortBy,
        sort_order: params.sortOrder,
        search: params.q || undefined,
        page: 1,
        limit: 50,
      });
      if (requestId !== itemsRequestIdRef.current) return;
      setPhysicalItems(response.items);
      setMatchingIds(response.matchingIds ?? response.items.map((item) => item.id));
      setCurrentPage(1);
      setHasMore(response.pagination.hasNext);
      setTotalCount(response.pagination.total);
      setAnnouncement(`Showing ${response.pagination.total} results`);
    } catch (error: any) {
      if (requestId !== itemsRequestIdRef.current) return;
      if (error?.response?.status === 403 && error?.response?.data?.collection_public === false) {
        setIsPrivateCollection(true);
        setPhysicalItems([]);
        setTotalCount(0);
      } else {
        const message = 'Failed to load collection. Please try again.';
        setLoadError(message);
        toast({ message, type: 'error', persistent: true });
        console.error('Failed to load collection:', error);
      }
    } finally {
      if (requestId === itemsRequestIdRef.current) {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    }
  };

  const loadInitialMovies = async () => {
    const requestId = ++moviesRequestIdRef.current;
    setMoviesIsLoading(true);
    setMoviesLoadError(null);
    setIsPrivateCollection(false);
    try {
      const formatValue: PhysicalFormat | PhysicalFormat[] | undefined =
        params.formats.length === 0 ? undefined : params.formats;

      const response = await apiService.getCollectionMedia({
        format: formatValue,
        genres: params.genres.length > 0 ? params.genres : undefined,
        decades: params.decades.length > 0 ? params.decades : undefined,
        editions: params.editions.length > 0 ? params.editions : undefined,
        versions: params.versions.length > 0 ? params.versions : undefined,
        series: params.series.length > 0 ? params.series : undefined,
        director: params.director || undefined,
        actor: params.actor || undefined,
        media_type: params.type !== 'all' ? params.type : undefined,
        archived: canEdit && params.archived ? true : undefined,
        sort_by: params.sortBy,
        sort_order: params.sortOrder,
        search: params.q || undefined,
        page: 1,
        limit: 50,
      });
      if (requestId !== moviesRequestIdRef.current) return;
      setMovies(response.items);
      setMoviesCurrentPage(1);
      setMoviesHasMore(response.pagination.hasNext);
      setMoviesTotalCount(response.pagination.total);
      setAnnouncement(`Showing ${response.pagination.total} titles`);
    } catch (error: any) {
      if (requestId !== moviesRequestIdRef.current) return;
      if (error?.response?.status === 403 && error?.response?.data?.collection_public === false) {
        setIsPrivateCollection(true);
        setMovies([]);
        setMoviesTotalCount(0);
      } else {
        const message = 'Failed to load movies. Please try again.';
        setMoviesLoadError(message);
        toast({ message, type: 'error', persistent: true });
        console.error('Failed to load collection movies:', error);
      }
    } finally {
      if (requestId === moviesRequestIdRef.current) {
        setMoviesIsLoading(false);
        setMoviesIsInitialLoad(false);
      }
    }
  };

  const loadMoreMovies = useCallback(async () => {
    if (moviesIsLoadingMore || !moviesHasMore) return;

    const requestId = moviesRequestIdRef.current;
    setMoviesIsLoadingMore(true);
    setMoviesLoadMoreError(null);
    try {
      const nextPage = moviesCurrentPage + 1;
      const formatValue: PhysicalFormat | PhysicalFormat[] | undefined =
        params.formats.length === 0 ? undefined : params.formats;

      const response = await apiService.getCollectionMedia({
        format: formatValue,
        genres: params.genres.length > 0 ? params.genres : undefined,
        decades: params.decades.length > 0 ? params.decades : undefined,
        editions: params.editions.length > 0 ? params.editions : undefined,
        versions: params.versions.length > 0 ? params.versions : undefined,
        series: params.series.length > 0 ? params.series : undefined,
        director: params.director || undefined,
        actor: params.actor || undefined,
        media_type: params.type !== 'all' ? params.type : undefined,
        archived: canEdit && params.archived ? true : undefined,
        sort_by: params.sortBy,
        sort_order: params.sortOrder,
        search: params.q || undefined,
        page: nextPage,
        limit: 50,
      });
      if (requestId !== moviesRequestIdRef.current) return;

      setMovies((prev) => [...prev, ...response.items]);
      setMoviesCurrentPage(nextPage);
      setMoviesHasMore(response.pagination.hasNext);
    } catch (error) {
      if (requestId !== moviesRequestIdRef.current) return;
      const message = 'Failed to load more titles. Please try again.';
      setMoviesLoadMoreError(message);
      console.error('Failed to load more collection movies:', error);
    } finally {
      if (requestId === moviesRequestIdRef.current) {
        setMoviesIsLoadingMore(false);
      }
    }
  }, [
    moviesIsLoadingMore,
    moviesHasMore,
    moviesCurrentPage,
    params.formats,
    params.genres,
    params.decades,
    params.editions,
    params.versions,
    params.series,
    params.director,
    params.actor,
    params.type,
    params.archived,
    canEdit,
    params.sortBy,
    params.sortOrder,
    params.q,
  ]);

  const loadMoreItems = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const nextPage = currentPage + 1;
      const formatValue: PhysicalFormat | PhysicalFormat[] | undefined =
        params.formats.length === 0 ? undefined : params.formats;

      const response = await apiService.getPhysicalItems({
        format: formatValue,
        genres: params.genres.length > 0 ? params.genres : undefined,
        decades: params.decades.length > 0 ? params.decades : undefined,
        editions: params.editions.length > 0 ? params.editions : undefined,
        versions: params.versions.length > 0 ? params.versions : undefined,
        series: params.series.length > 0 ? params.series : undefined,
        director: params.director || undefined,
        actor: params.actor || undefined,
        media_type: params.type !== 'all' ? params.type : undefined,
        archived: canEdit && params.archived ? true : undefined,
        sort_by: params.sortBy,
        sort_order: params.sortOrder,
        search: params.q || undefined,
        page: nextPage,
        limit: 50,
      });

      setPhysicalItems((prev) => [...prev, ...response.items]);
      setCurrentPage(nextPage);
      setHasMore(response.pagination.hasNext);
    } catch (error) {
      const message = 'Failed to load more items. Please try again.';
      setLoadMoreError(message);
      console.error('Failed to load more items:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    isLoadingMore,
    hasMore,
    currentPage,
    params.formats,
    params.genres,
    params.decades,
    params.editions,
    params.versions,
    params.series,
    params.director,
    params.actor,
    params.type,
    params.archived,
    canEdit,
    params.sortBy,
    params.sortOrder,
    params.q,
  ]);

  const handleSearchChange = (query: string) => {
    setSearchInput(query);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    clearAll();
  };

  const fetchRemainingShowcaseItems = useCallback(async (): Promise<PhysicalItem[]> => {
    if (!hasMore && physicalItems.length >= totalCount) {
      return [];
    }
    const formatValue: PhysicalFormat | PhysicalFormat[] | undefined =
      params.formats.length === 0 ? undefined : params.formats;

    const batchLimit = 100;
    const totalPages = Math.ceil(totalCount / batchLimit);
    const pages: number[] = [];
    for (let p = 1; p <= totalPages; p++) {
      pages.push(p);
    }

    const responses = await Promise.all(
      pages.map((page) =>
        apiService.getPhysicalItems({
          format: formatValue,
          genres: params.genres.length > 0 ? params.genres : undefined,
          decades: params.decades.length > 0 ? params.decades : undefined,
          editions: params.editions.length > 0 ? params.editions : undefined,
          versions: params.versions.length > 0 ? params.versions : undefined,
          series: params.series.length > 0 ? params.series : undefined,
          director: params.director || undefined,
          actor: params.actor || undefined,
          media_type: params.type !== 'all' ? params.type : undefined,
          archived: canEdit && params.archived ? true : undefined,
          sort_by: params.sortBy,
          sort_order: params.sortOrder,
          search: params.q || undefined,
          page,
          limit: batchLimit,
        })
      )
    );

    return responses.flatMap((r) => r.items);
  }, [
    hasMore,
    physicalItems.length,
    totalCount,
    params.formats,
    params.genres,
    params.decades,
    params.editions,
    params.versions,
    params.series,
    params.director,
    params.actor,
    params.type,
    canEdit,
    params.archived,
    params.sortBy,
    params.sortOrder,
    params.q,
  ]);

  const fetchRemainingShowcaseMovies = useCallback(async (): Promise<PhysicalItem[]> => {
    if (!moviesHasMore && movies.length >= moviesTotalCount) {
      return [];
    }
    const formatValue: PhysicalFormat | PhysicalFormat[] | undefined =
      params.formats.length === 0 ? undefined : params.formats;

    const batchLimit = 100;
    const totalPages = Math.ceil(moviesTotalCount / batchLimit);
    const pages: number[] = [];
    for (let p = 1; p <= totalPages; p++) {
      pages.push(p);
    }

    const responses = await Promise.all(
      pages.map((page) =>
        apiService.getCollectionMedia({
          format: formatValue,
          genres: params.genres.length > 0 ? params.genres : undefined,
          decades: params.decades.length > 0 ? params.decades : undefined,
          editions: params.editions.length > 0 ? params.editions : undefined,
          versions: params.versions.length > 0 ? params.versions : undefined,
          series: params.series.length > 0 ? params.series : undefined,
          director: params.director || undefined,
          actor: params.actor || undefined,
          media_type: params.type !== 'all' ? params.type : undefined,
          archived: canEdit && params.archived ? true : undefined,
          sort_by: params.sortBy,
          sort_order: params.sortOrder,
          search: params.q || undefined,
          page,
          limit: batchLimit,
        })
      )
    );

    return responses.flatMap((r) => r.items.map(collectionMediaToShowcaseItem));
  }, [
    moviesHasMore,
    movies.length,
    moviesTotalCount,
    params.formats,
    params.genres,
    params.decades,
    params.editions,
    params.versions,
    params.series,
    params.director,
    params.actor,
    params.type,
    canEdit,
    params.archived,
    params.sortBy,
    params.sortOrder,
    params.q,
  ]);

  const showcaseItems = useMemo(
    () =>
      params.view === 'movies'
        ? movies.map(collectionMediaToShowcaseItem)
        : physicalItems,
    [params.view, movies, physicalItems]
  );

  // Available genres, decades, edition tags, and series come from server-side facets
  const availableGenres = React.useMemo(() => facets?.genres ?? [], [facets]);
  const availableDecades = React.useMemo(
    () => (facets?.decades ?? []).map((d) => d.decade),
    [facets]
  );
  const availableEditions = React.useMemo(() => facets?.editions ?? [], [facets]);
  const availableVersions = React.useMemo(() => facets?.versions ?? [], [facets]);
  const availableSeries = React.useMemo(() => facets?.series ?? [], [facets]);


  const handleAddItem = () => {
    setEditingItem(null);
    setShowEditForm(true);
  };

  const handleEditItem = (item: PhysicalItem) => {
    setEditingItem(item);
    setShowEditForm(true);
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      await apiService.deletePhysicalItem(itemId);
      resetFacetsCache();
      // Reload data to refresh the list
      await (params.view === 'movies' ? loadInitialMovies() : loadInitialData());
      refreshStatistics(); // Refresh statistics
      setShelfRefreshKey((k) => k + 1);
    } catch (error) {
      console.error('Failed to delete physical item:', error);
      toast({ message: 'Failed to delete item. Please try again.', type: 'error' });
    }
  };

  const handleArchiveItem = async (itemId: number, archived: boolean, archiveReason: string | null) => {
    try {
      await apiService.updatePhysicalItem(itemId, {
        archived,
        archive_reason: archived ? archiveReason : null,
      });
      resetFacetsCache();
      toast({
        message: archived ? 'Item archived.' : 'Item returned to collection.',
        type: 'success',
      });
      await (params.view === 'movies' ? loadInitialMovies() : loadInitialData());
      refreshStatistics();
      setShelfRefreshKey((k) => k + 1);
    } catch (error) {
      console.error('Failed to update archive state:', error);
      toast({ message: 'Failed to update archive status. Please try again.', type: 'error' });
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
      const formatValue: PhysicalFormat | PhysicalFormat[] | undefined =
        params.formats.length === 0 ? undefined : params.formats;

      const stats = await apiService.getStatistics({
        format: formatValue,
        genres: params.genres.length > 0 ? params.genres : undefined,
        decades: params.decades.length > 0 ? params.decades : undefined,
        editions: params.editions.length > 0 ? params.editions : undefined,
        versions: params.versions.length > 0 ? params.versions : undefined,
        series: params.series.length > 0 ? params.series : undefined,
        director: params.director || undefined,
        actor: params.actor || undefined,
        media_type: params.type !== 'all' ? params.type : undefined,
        search: params.q || undefined,
        archived: canEdit && params.archived ? true : undefined,
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

  const reloadActiveView = () => {
    if (params.view === 'movies') {
      loadInitialMovies();
    } else {
      loadInitialData();
    }
  };

  const handleEditSuccess = () => {
    setShowEditForm(false);
    setEditingItem(null);
    resetFacetsCache();
    reloadActiveView();
    refreshStatistics();
    setShelfRefreshKey((k) => k + 1);
  };

  const handleEditMovie = (movie: CollectionMedia) => {
    setEditingMovie(movie);
    setShowMovieEditModal(true);
  };

  const handleSaveMovie = (updatedMedia: Media) => {
    setShowMovieEditModal(false);
    setEditingMovie(null);
    setMovies((prev) =>
      prev.map((m) => (m.id === updatedMedia.id ? { ...m, ...updatedMedia } : m))
    );
    setSelectedMovie((prev) =>
      prev && prev.id === updatedMedia.id ? { ...prev, ...updatedMedia } : prev
    );
    resetFacetsCache();
    loadInitialMovies();
    refreshStatistics();
  };

  const handleViewPhysicalItemFromMovie = async (physicalItemId: number, mediaId: number) => {
    const originMovie = selectedMovie;
    setLoadingPhysicalItemId(physicalItemId);
    try {
      const fullItem = await apiService.getPhysicalItemById(physicalItemId);
      setSelectedMovie(null);
      setReturnToMovie(originMovie);
      setSelectedItemInitialMediaId(mediaId);
      setSelectedItem(fullItem);
    } catch (error) {
      console.error('Failed to load physical item details:', error);
      toast({ message: 'Failed to load release details. Please try again.', type: 'error' });
    } finally {
      setLoadingPhysicalItemId(null);
    }
  };

  const handleEditPhysicalItemFromMovie = async (physicalItemId: number) => {
    setLoadingPhysicalItemId(physicalItemId);
    try {
      const fullItem = await apiService.getPhysicalItemById(physicalItemId);
      setSelectedMovie(null);
      setEditingItem(fullItem);
      setShowEditForm(true);
    } catch (error) {
      console.error('Failed to load physical item for editing:', error);
      toast({ message: 'Failed to load release for editing. Please try again.', type: 'error' });
    } finally {
      setLoadingPhysicalItemId(null);
    }
  };

  const handleFilterByDirector = (director: string) => {
    setSelectedMovie(null);
    setParams({ director });
  };

  const handleFilterBySeries = (seriesId: number) => {
    setSelectedMovie(null);
    setParams({ series: [seriesId] });
  };

  const handleFilterByGenre = (genreId: number) => {
    setSelectedMovie(null);
    setParams({ genres: [genreId] });
  };

  const sentinelRef = useInfiniteScroll(loadMoreItems, {
    enabled: params.view === 'grid' && !isLoading && !isLoadingMore && hasMore && !loadMoreError,
    rootMargin: '600px',
  });

  const moviesSentinelRef = useInfiniteScroll(loadMoreMovies, {
    enabled:
      params.view === 'movies' &&
      !moviesIsLoading &&
      !moviesIsLoadingMore &&
      moviesHasMore &&
      !moviesLoadMoreError,
    rootMargin: '600px',
  });

  const hasActiveFilters =
    Boolean(params.q) ||
    params.formats.length > 0 ||
    params.genres.length > 0 ||
    params.decades.length > 0 ||
    params.editions.length > 0 ||
    params.versions.length > 0 ||
    params.series.length > 0 ||
    Boolean(params.director) ||
    Boolean(params.actor) ||
    params.type !== 'all' ||
    (canEdit && params.archived);

  const matchingItemIds = React.useMemo(
    () => (hasActiveFilters ? new Set(matchingIds) : null),
    [hasActiveFilters, matchingIds]
  );

  const showSkeletons = physicalItems.length === 0 && (isLoading || isInitialLoad) && !isPrivateCollection;
  const isEmptyCollection =
    !isPrivateCollection &&
    totalCount === 0 &&
    !hasActiveFilters &&
    !isLoading;
  const isNoResults =
    !isPrivateCollection &&
    physicalItems.length === 0 &&
    !isLoading &&
    !loadError &&
    !isEmptyCollection;

  const showMovieSkeletons =
    movies.length === 0 && (moviesIsLoading || moviesIsInitialLoad) && !isPrivateCollection;
  const isEmptyMoviesCollection =
    !isPrivateCollection &&
    moviesTotalCount === 0 &&
    !hasActiveFilters &&
    !moviesIsLoading;
  const isNoMovieResults =
    !isPrivateCollection &&
    movies.length === 0 &&
    !moviesIsLoading &&
    !moviesLoadError &&
    !isEmptyMoviesCollection;

  if (isPrivateCollection && !canEdit) {
    return (
      <main className="w-full px-4 py-12 sm:px-6 lg:px-8">
        <EmptyState
          title="This collection is private"
          description="The owner has set this media collection to private."
          action={
            !isReadOnly ? (
              <Button asChild>
                <Link to="/admin">Sign in as Admin</Link>
              </Button>
            ) : undefined
          }
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          }
        />
      </main>
    );
  }

  return (
    <main className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Live region for collection status announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <CollectionToolbar
        params={params}
        setParams={setParams}
        clearAll={clearAll}
        searchInput={searchInput}
        onSearchChange={handleSearchChange}
        availableGenres={availableGenres}
        availableDecades={availableDecades}
        availableEditions={availableEditions}
        availableVersions={availableVersions}
        availableSeries={availableSeries}
        resultCount={params.view === 'movies' ? moviesTotalCount : totalCount}
        isLoading={params.view === 'movies' ? moviesIsLoading : isLoading}
        showArchivedFilter={canEdit && (params.view === 'grid' || params.view === 'movies')}
        viewMode={params.view}
      />

      {/* Header */}
      <header className="mb-4 mt-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
        <h1 className="text-2xl font-bold text-content sm:text-3xl">{collectionTitle}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <FormatBadgeToggle />
          <div
            role="group"
            aria-label="Collection view mode"
            className={SEGMENTED_TRACK_CLASSES}
          >
            <button
              type="button"
              aria-pressed={params.view === 'grid'}
              onClick={() => setParams({ view: 'grid' })}
              title="Browse physical items and box sets"
              className={segmentedItemClasses(params.view === 'grid')}
            >
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              <span>Items</span>
            </button>
            <button
              type="button"
              aria-pressed={params.view === 'movies'}
              onClick={() => setParams({ view: 'movies' })}
              title="Browse individual movie and TV titles"
              className={segmentedItemClasses(params.view === 'movies')}
            >
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path strokeLinecap="round" d="M7 4v16M17 4v16M3 8h4M17 8h4M3 12h18M3 16h4M17 16h4" />
              </svg>
              <span>Titles</span>
            </button>
            <button
              type="button"
              aria-pressed={params.view === 'shelf'}
              onClick={() => setParams({ view: 'shelf' })}
              title="Browse physical shelves"
              className={segmentedItemClasses(params.view === 'shelf')}
            >
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16M6 5v11M10 5v11M14 7v9M18 5v11" />
              </svg>
              <span>Shelf</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsShowcaseOpen(true)}
            disabled={
              params.view === 'movies'
                ? moviesIsLoading || movies.length === 0
                : isLoading || physicalItems.length === 0
            }
            aria-label="Open collection showcase"
            title="Launch full-screen collection showcase"
            className="group inline-flex h-10 items-center gap-1.5 rounded-[--radius-control] border border-subtle bg-surface-raised px-3 py-1.5 text-sm font-medium text-content shadow-sm transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className="h-4 w-4 text-content-muted transition-colors group-hover:text-content"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>Showcase</span>
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setShowBarcodeScanner(true)}
                aria-label="Scan barcodes"
                title="Scan barcodes from photos, camera, or USB scanner"
                className="inline-flex h-10 items-center gap-1.5 rounded-[--radius-control] border border-subtle bg-surface-raised px-3 py-1.5 text-sm font-medium text-content shadow-sm transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <svg
                  className="h-4 w-4 shrink-0 text-content-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5v14M7 5v14M11 5v14M15 5v14M17 5v14M21 5v14"
                  />
                </svg>
                <span>Scan</span>
              </button>
              <button
                type="button"
                onClick={handleAddItem}
                className="hidden sm:inline-flex h-10 items-center gap-1.5 rounded-[--radius-control] bg-primary-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-primary-700 active:bg-primary-800 dark:ring-1 dark:ring-inset dark:ring-primary-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <svg
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.2}
                    d="M12 5v14m-7-7h14"
                  />
                </svg>
                <span>Add item</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Collection summary — one line, full breakdown opens in a sheet */}
      <section aria-label="Collection statistics" className="mb-4">
        <CollectionStatistics
          statistics={statistics}
          isLoading={isLoadingStats}
          activeView={params.view}
        />
      </section>

      {params.view === 'shelf' ? (
        <section aria-label="Shelf view" className="relative min-h-[12rem]">
          <PhysicalLibraryPage
            embedded
            refreshKey={shelfRefreshKey}
            matchingItemIds={matchingItemIds}
            onDataChange={() => {
              loadInitialData();
              refreshStatistics();
            }}
          />
        </section>
      ) : params.view === 'movies' ? (
        /* Movies Grid or Empty State */
        <section aria-label="Title results" className="relative min-h-[12rem]">
          {moviesLoadError && (
            <EmptyState
              title="Couldn’t load titles"
              description={moviesLoadError}
              action={
                <Button onClick={() => loadInitialMovies()} variant="secondary">
                  Try again
                </Button>
              }
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 4a8 8 0 100 16 8 8 0 000-16z" />
                </svg>
              }
            />
          )}

          {!moviesLoadError && isEmptyMoviesCollection && (
            <EmptyState
              title="No titles found"
              description="Start building your collection by adding your first movie or TV show."
              action={
                canEdit ? (
                  <Button onClick={handleAddItem}>
                    Add your first item
                  </Button>
                ) : undefined
              }
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M7 3v18" />
                  <path d="M3 12h18" />
                </svg>
              }
            />
          )}

          {!moviesLoadError && isNoMovieResults && (
            <EmptyState
              title="No titles found"
              description={
                params.q
                  ? `No titles match "${params.q}". Try adjusting your search or filters.`
                  : params.formats.length > 0
                    ? 'No titles match the selected filter. Try changing your filter settings.'
                    : 'No titles found. Try adjusting your search or filters.'
              }
              action={
                <Button onClick={handleClearFilters} variant="secondary">
                  Clear filters & search
                </Button>
              }
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
            />
          )}

          {!moviesLoadError && (movies.length > 0 || showMovieSkeletons) && (
            <>
              <MovieGrid
                movies={movies}
                onMovieClick={setSelectedMovie}
                isEditMode={canEdit}
                isAuthenticated={canEdit}
                onEditMovie={canEdit ? handleEditMovie : undefined}
                isArchivedView={effectiveArchived}
                skeletonCount={showMovieSkeletons ? 8 : 0}
                isLoadingMore={moviesIsLoadingMore && !moviesLoadMoreError}
                sortBy={params.sortBy}
              />

              <div ref={moviesSentinelRef} className="h-px" aria-hidden="true" />

              {moviesLoadMoreError && (
                <div className="mt-6 flex flex-col items-center gap-3 rounded-[--radius-card] border border-subtle bg-surface-raised p-4 text-center">
                  <p className="text-sm text-content">{moviesLoadMoreError}</p>
                  <Button onClick={() => loadMoreMovies()} variant="secondary" size="sm">
                    Try again
                  </Button>
                </div>
              )}

              {moviesIsLoadingMore && !moviesLoadMoreError && (
                <div role="status" aria-live="polite" className="sr-only">
                  Loading more titles…
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        /* Media Grid or Empty State */
        <section aria-label="Collection results" className="relative min-h-[12rem]">
          {loadError && (
            <EmptyState
              title="Couldn’t load collection"
              description={loadError}
              action={
                <Button onClick={() => loadInitialData()} variant="secondary">
                  Try again
                </Button>
              }
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 4a8 8 0 100 16 8 8 0 000-16z" />
                </svg>
              }
            />
          )}

          {!loadError && isEmptyCollection && (
            <EmptyState
              title="No media found"
              description="Start building your collection by adding your first movie or TV show."
              action={
                canEdit ? (
                  <Button onClick={handleAddItem}>
                    Add your first item
                  </Button>
                ) : undefined
              }
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M7 3v18" />
                  <path d="M3 12h18" />
                </svg>
              }
            />
          )}

          {!loadError && isNoResults && (
            <EmptyState
              title="No results found"
              description={
                params.q
                  ? `No items match "${params.q}". Try adjusting your search or filters.`
                  : params.formats.length > 0
                    ? 'No items match the selected filter. Try changing your filter settings.'
                    : 'No items found. Try adjusting your search or filters.'
              }
              action={
                <Button onClick={handleClearFilters} variant="secondary">
                  Clear filters & search
                </Button>
              }
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
            />
          )}

          {!loadError && (physicalItems.length > 0 || showSkeletons) && (
            <>
              <MediaGrid
                physicalItems={physicalItems}
                onItemClick={setSelectedItem}
                isEditMode={canEdit}
                isAuthenticated={canEdit}
                onEditItem={canEdit ? handleEditItem : undefined}
                onArchiveItem={canEdit ? handleArchiveItem : undefined}
                skeletonCount={showSkeletons ? 8 : 0}
                isLoadingMore={isLoadingMore && !loadMoreError}
                sortBy={params.sortBy}
              />

              <div ref={sentinelRef} className="h-px" aria-hidden="true" />

              {loadMoreError && (
                <div className="mt-6 flex flex-col items-center gap-3 rounded-[--radius-card] border border-subtle bg-surface-raised p-4 text-center">
                  <p className="text-sm text-content">{loadMoreError}</p>
                  <Button onClick={() => loadMoreItems()} variant="secondary" size="sm">
                    Try again
                  </Button>
                </div>
              )}

              {isLoadingMore && !loadMoreError && (
                <div role="status" aria-live="polite" className="sr-only">
                  Loading more items…
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Physical Item Detail Modal */}
      <MediaDetailModal
        physicalItem={selectedItem}
        isOpen={!!selectedItem}
        initialMediaId={selectedItemInitialMediaId}
        backLabel={returnToMovie ? returnToMovie.title : undefined}
        onBack={
          returnToMovie
            ? () => {
                const backMovie = returnToMovie;
                setSelectedItem(null);
                setSelectedItemInitialMediaId(undefined);
                setReturnToMovie(null);
                setSelectedMovie(backMovie);
              }
            : undefined
        }
        onClose={() => {
          setSelectedItem(null);
          setSelectedItemInitialMediaId(undefined);
          setReturnToMovie(null);
        }}
        onEdit={
          canEdit
            ? (item) => {
                setSelectedItem(null);
                setSelectedItemInitialMediaId(undefined);
                setReturnToMovie(null);
                handleEditItem(item);
              }
            : undefined
        }
      />

      {/* Movie Detail Modal */}
      <MovieDetailModal
        media={selectedMovie}
        isOpen={!!selectedMovie}
        onClose={() => setSelectedMovie(null)}
        onEditMovie={canEdit ? handleEditMovie : undefined}
        onViewPhysicalItem={handleViewPhysicalItemFromMovie}
        onEditPhysicalItem={canEdit ? handleEditPhysicalItemFromMovie : undefined}
        onFilterByDirector={handleFilterByDirector}
        onFilterBySeries={handleFilterBySeries}
        onFilterByGenre={handleFilterByGenre}
        loadingPhysicalItemId={loadingPhysicalItemId}
      />

      {/* Showcase Slideshow Modal */}
      <CollectionShowcaseModal
        isOpen={isShowcaseOpen}
        onClose={() => setIsShowcaseOpen(false)}
        items={showcaseItems}
        totalCount={params.view === 'movies' ? moviesTotalCount : totalCount}
        collectionTitle={collectionTitle}
        fetchRemainingItems={
          params.view === 'movies' ? fetchRemainingShowcaseMovies : fetchRemainingShowcaseItems
        }
      />

      {canEdit && (
        <button
          type="button"
          onClick={handleAddItem}
          className="sm:hidden fixed bottom-[calc(var(--tabbar-h)+var(--safe-b)+1rem)] right-4 z-30 inline-flex min-h-touch items-center gap-2 rounded-full bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xl ring-2 ring-surface transition-all duration-200 hover:bg-primary-700 active:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          <span>Add item</span>
        </button>
      )}

      {/* Edit Form Modal - only show if can edit */}
      {canEdit && (
        <>
          <MediaForm
            isOpen={showEditForm}
            onClose={() => {
              setShowEditForm(false);
              setEditingItem(null);
            }}
            onSuccess={handleEditSuccess}
            editItem={editingItem}
            onDelete={handleDeleteItem}
          />
          <BarcodeScanModal
            isOpen={showBarcodeScanner}
            onClose={() => setShowBarcodeScanner(false)}
            onSuccess={() => {
              resetFacetsCache();
              reloadActiveView();
              refreshStatistics();
              setShelfRefreshKey((k) => k + 1);
            }}
          />
          <MediaEditModal
            media={editingMovie}
            isOpen={showMovieEditModal}
            onClose={() => {
              setShowMovieEditModal(false);
              setEditingMovie(null);
            }}
            onSave={handleSaveMovie}
          />
        </>
      )}
    </main>
  );
};

export default CollectionPage;
