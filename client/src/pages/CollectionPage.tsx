import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PhysicalItem, PhysicalFormat, SortField, SortOrder, CollectionStatistics as Stats } from '../types';
import { apiService } from '../services/api.service';
import { useAuth } from '../context/AuthContext';
import { useServerMode } from '../context/ServerModeContext';
import { useFacets, resetFacetsCache } from '../hooks/useFacets';
import { useCollectionParams } from '../hooks/useCollectionParams';
import { useToast } from '../context/ToastContext';
import MediaGrid from '../components/MediaGrid';
import CollectionToolbar from '../components/CollectionToolbar';
import MediaDetailModal from '../components/MediaDetailModal';
import MediaForm from '../components/MediaForm';
import CollectionStatistics from '../components/CollectionStatistics';
import FormatBadgeToggle from '../components/FormatBadgeToggle';
import CollectionShowcaseModal from '../components/CollectionShowcaseModal';
import PhysicalLibraryPage from './PhysicalLibraryPage';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

const SESSION_SORT_BY_KEY = 'collection_sort_by';
const SESSION_SORT_ORDER_KEY = 'collection_sort_order';

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
  const [isInitialized, setIsInitialized] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('Media Collection');
  const [showShelfApplySort, setShowShelfApplySort] = useState(false);
  const [showShelfAddGroup, setShowShelfAddGroup] = useState(false);
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
    if (isInitialized) {
      setLoadError(null);
      setLoadMoreError(null);
      loadInitialData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.q,
    params.formats,
    params.genres,
    params.decades,
    params.editions,
    params.series,
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
          series: params.series.length > 0 ? params.series : undefined,
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
  }, [params.formats, params.genres, params.decades, params.editions, params.series, params.q, effectiveArchived, isInitialized]);

  const loadInitialData = async () => {
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
        series: params.series.length > 0 ? params.series : undefined,
        media_type: params.type !== 'all' ? params.type : undefined,
        archived: canEdit && params.archived ? true : undefined,
        sort_by: params.sortBy,
        sort_order: params.sortOrder,
        search: params.q || undefined,
        page: 1,
        limit: 50,
      });
      setPhysicalItems(response.items);
      setMatchingIds(response.matchingIds ?? response.items.map((item) => item.id));
      setCurrentPage(1);
      setHasMore(response.pagination.hasNext);
      setTotalCount(response.pagination.total);
      setAnnouncement(`Showing ${response.pagination.total} results`);
    } catch (error: any) {
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
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  };

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
        series: params.series.length > 0 ? params.series : undefined,
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
    params.series,
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
          series: params.series.length > 0 ? params.series : undefined,
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
    params.series,
    params.type,
    canEdit,
    params.archived,
    params.sortBy,
    params.sortOrder,
    params.q,
  ]);

  // Available genres, decades, edition tags, and series come from server-side facets
  const availableGenres = React.useMemo(() => facets?.genres ?? [], [facets]);
  const availableDecades = React.useMemo(
    () => (facets?.decades ?? []).map((d) => d.decade),
    [facets]
  );
  const availableEditions = React.useMemo(() => facets?.editions ?? [], [facets]);
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
      await loadInitialData();
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
      await loadInitialData();
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
        series: params.series.length > 0 ? params.series : undefined,
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

  const handleEditSuccess = () => {
    setShowEditForm(false);
    setEditingItem(null);
    loadInitialData(); // Reload data to show changes
    refreshStatistics(); // Refresh statistics
    setShelfRefreshKey((k) => k + 1);
  };

  // Infinite scroll effect
  useEffect(() => {
    const handleScroll = () => {
      if (params.view !== 'grid' || isLoading || isLoadingMore || !hasMore) return;
      
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
  }, [params.view, isLoading, isLoadingMore, hasMore, loadMoreItems]);

  const hasActiveFilters =
    Boolean(params.q) ||
    params.formats.length > 0 ||
    params.genres.length > 0 ||
    params.decades.length > 0 ||
    params.editions.length > 0 ||
    params.series.length > 0 ||
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
    !params.q &&
    params.formats.length === 0 &&
    params.genres.length === 0 &&
    params.decades.length === 0 &&
    params.editions.length === 0 &&
    params.series.length === 0 &&
    params.type === 'all' &&
    !params.archived &&
    !isLoading;
  const isNoResults =
    !isPrivateCollection &&
    physicalItems.length === 0 &&
    !isLoading &&
    !loadError &&
    !isEmptyCollection;

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
        availableSeries={availableSeries}
        resultCount={totalCount}
        isLoading={isLoading}
        showArchivedFilter={canEdit && params.view === 'grid'}
        viewMode={params.view}
        shelfActions={
          canEdit ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button onClick={() => setShowShelfApplySort(true)} variant="secondary" size="sm">
                Apply Sort
              </Button>
              <Button onClick={() => setShowShelfAddGroup(true)} size="sm">
                Add Group
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Header */}
      <header className="mb-4 mt-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
        <h1 className="text-2xl font-bold text-content sm:text-3xl">{collectionTitle}</h1>
        <div className="flex items-center gap-2">
          <FormatBadgeToggle />
          <div
            role="group"
            aria-label="Collection view mode"
            className="flex items-center rounded-[--radius-control] bg-surface-sunken p-0.5"
          >
            <button
              type="button"
              aria-pressed={params.view === 'grid'}
              onClick={() => setParams({ view: 'grid' })}
              className={`px-3 py-1.5 text-sm font-medium rounded-[calc(var(--radius-control)-0.25rem)] transition-colors ${
                params.view === 'grid'
                  ? 'bg-surface-raised text-content shadow-sm'
                  : 'text-content-muted hover:text-content'
              }`}
            >
              Grid
            </button>
            <button
              type="button"
              aria-pressed={params.view === 'shelf'}
              onClick={() => setParams({ view: 'shelf' })}
              className={`px-3 py-1.5 text-sm font-medium rounded-[calc(var(--radius-control)-0.25rem)] transition-colors ${
                params.view === 'shelf'
                  ? 'bg-surface-raised text-content shadow-sm'
                  : 'text-content-muted hover:text-content'
              }`}
            >
              Shelf
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsShowcaseOpen(true)}
            disabled={isLoading || physicalItems.length === 0}
            aria-label="Open collection showcase"
            title="Launch full-screen collection showcase"
            className="inline-flex h-9 items-center gap-1.5 rounded-[--radius-control] border border-subtle bg-surface-raised px-3 py-1.5 text-sm font-medium text-content shadow-sm transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className="h-4 w-4 text-primary-600 dark:text-primary-400"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>Showcase</span>
          </button>
        </div>
      </header>

      {/* Collection summary — one line, full breakdown opens in a sheet */}
      <section aria-label="Collection statistics" className="mb-4">
        <CollectionStatistics statistics={statistics} isLoading={isLoadingStats} />
      </section>

      {params.view === 'shelf' ? (
        <section aria-label="Shelf view" className="relative min-h-[12rem]">
          <PhysicalLibraryPage
            key={shelfRefreshKey}
            embedded
            matchingItemIds={matchingItemIds}
            showApplySortModal={showShelfApplySort}
            onCloseApplySortModal={() => setShowShelfApplySort(false)}
            showAddGroupModal={showShelfAddGroup}
            onCloseAddGroupModal={() => setShowShelfAddGroup(false)}
            onDataChange={() => {
              loadInitialData();
              refreshStatistics();
            }}
          />
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
                sortBy={params.sortBy}
              />

              {loadMoreError && (
                <div className="mt-6 flex flex-col items-center gap-3 rounded-[--radius-card] border border-subtle bg-surface-raised p-4 text-center">
                  <p className="text-sm text-content">{loadMoreError}</p>
                  <Button onClick={() => loadMoreItems()} variant="secondary" size="sm">
                    Try again
                  </Button>
                </div>
              )}

              {isLoadingMore && !loadMoreError && (
                <div className="mt-6 flex items-center justify-center gap-2 text-content-muted">
                  <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-sm">Loading more items…</span>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Detail Modal */}
      <MediaDetailModal
        physicalItem={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onEdit={
          canEdit
            ? (item) => {
                setSelectedItem(null);
                handleEditItem(item);
              }
            : undefined
        }
      />

      {/* Showcase Slideshow Modal */}
      <CollectionShowcaseModal
        isOpen={isShowcaseOpen}
        onClose={() => setIsShowcaseOpen(false)}
        items={physicalItems}
        totalCount={totalCount}
        collectionTitle={collectionTitle}
        fetchRemainingItems={fetchRemainingShowcaseItems}
      />

      {canEdit && (
        <button
          type="button"
          onClick={handleAddItem}
          className="fixed bottom-[calc(var(--tabbar-h)+var(--safe-b)+1rem)] lg:bottom-6 right-4 sm:right-6 z-30 inline-flex min-h-touch items-center gap-2 rounded-full bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:bg-primary-700 hover:shadow-xl active:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
      )}
    </main>
  );
};

export default CollectionPage;
