import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Series, Media } from '../types';
import { apiService } from '../services/api.service';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Skeleton } from './ui/Skeleton';
import { resetFacetsCache } from '../hooks/useFacets';

interface SeriesFormData {
  name: string;
  sort_name: string;
  tmdb_collection_id: string;
  internal_sort_method: 'chronological' | 'custom' | 'alphabetical';
}

const emptyFormData: SeriesFormData = {
  name: '',
  sort_name: '',
  tmdb_collection_id: '',
  internal_sort_method: 'chronological',
};

function deriveSortName(name: string): string {
  return name.trim().replace(/^(the|a|an)\s+/i, '');
}

const sortMethodLabels: Record<'chronological' | 'custom' | 'alphabetical', string> = {
  chronological: 'Chronological',
  custom: 'Custom Order',
  alphabetical: 'Alphabetical',
};

/** Inline edit/create form for a series */
const SeriesForm: React.FC<{
  initialData: SeriesFormData;
  editingSeries: Series | null;
  onSave: () => void;
  onCancel: () => void;
}> = ({ initialData, editingSeries, onSave, onCancel }) => {
  const [formData, setFormData] = useState<SeriesFormData>(initialData);
  const [sortNameTouched, setSortNameTouched] = useState<boolean>(Boolean(editingSeries));
  const [seriesMovies, setSeriesMovies] = useState<Media[]>([]);
  const [isLoadingMovies, setIsLoadingMovies] = useState(false);
  const [sortOrders, setSortOrders] = useState<Record<number, number | null>>({});
  const [hasSortOrderChanges, setHasSortOrderChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const formRef = useRef<HTMLDivElement>(null);

  // Load movies when editing an existing series
  useEffect(() => {
    if (editingSeries) {
      setIsLoadingMovies(true);
      apiService
        .getSeriesMovies(editingSeries.id)
        .then((movies) => {
          setSeriesMovies(movies);
          const initialSortOrders: Record<number, number | null> = {};
          movies.forEach((movie) => {
            const movieSortOrder = (movie as any).sort_order;
            initialSortOrders[movie.id] = movieSortOrder !== undefined ? movieSortOrder : null;
          });
          setSortOrders(initialSortOrders);
        })
        .catch((error) => console.error('Failed to load series movies:', error))
        .finally(() => setIsLoadingMovies(false));
    }
  }, [editingSeries]);

  // Scroll into view when form appears
  useEffect(() => {
    if (formRef.current && typeof formRef.current.scrollIntoView === 'function') {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const handleNameChange = (newName: string) => {
    setFormData((prev) => ({
      ...prev,
      name: newName,
      sort_name: sortNameTouched ? prev.sort_name : deriveSortName(newName),
    }));
  };

  const handleSortNameChange = (newSortName: string) => {
    setSortNameTouched(true);
    setFormData((prev) => ({ ...prev, sort_name: newSortName }));
  };

  const handleSortOrderChange = (mediaId: number, value: string) => {
    const numValue = value === '' ? null : parseInt(value, 10);
    if (isNaN(numValue as any) && numValue !== null) return;
    setSortOrders((prev) => ({ ...prev, [mediaId]: numValue }));
    setHasSortOrderChanges(true);
  };

  const handleSaveSortOrders = async () => {
    if (!editingSeries) return;
    try {
      const sortOrdersArray = Object.entries(sortOrders).map(([mediaId, sortOrder]) => ({
        media_id: parseInt(mediaId, 10),
        sort_order: sortOrder,
      }));
      await apiService.bulkUpdateSeriesMovieSortOrders(editingSeries.id, sortOrdersArray);
      setHasSortOrderChanges(false);
      const movies = await apiService.getSeriesMovies(editingSeries.id);
      setSeriesMovies(movies);
      toast({ message: 'Series movie order saved.', type: 'success' });
    } catch (error) {
      console.error('Failed to save sort orders:', error);
      toast({ message: 'Failed to save sort orders. Please try again.', type: 'error' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const data = {
        name: formData.name.trim(),
        sort_name: (formData.sort_name.trim() || deriveSortName(formData.name)),
        tmdb_collection_id: formData.tmdb_collection_id
          ? parseInt(formData.tmdb_collection_id, 10)
          : undefined,
        internal_sort_method: formData.internal_sort_method,
      };

      if (editingSeries) {
        await apiService.updateSeries(editingSeries.id, data);
        if (hasSortOrderChanges) {
          const sortOrdersArray = Object.entries(sortOrders).map(([mediaId, sortOrder]) => ({
            media_id: parseInt(mediaId, 10),
            sort_order: sortOrder,
          }));
          await apiService.bulkUpdateSeriesMovieSortOrders(editingSeries.id, sortOrdersArray);
        }
        toast({ message: `Updated "${data.name}".`, type: 'success' });
      } else {
        await apiService.createSeries(data);
        toast({ message: `Created series "${data.name}".`, type: 'success' });
      }
      onSave();
    } catch (error) {
      console.error('Failed to save series:', error);
      toast({ message: 'Failed to save series. Please try again.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      ref={formRef}
      className="card border-2 border-primary-500 dark:border-primary-400 shadow-lg animate-in"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-content">
              {editingSeries ? `Edit Series: ${editingSeries.name}` : 'Create New Series'}
            </h3>
            <p className="text-xs text-content-muted mt-0.5">
              Configure series naming, TMDb collection linkage, and how titles sort within the series.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-content-muted hover:text-content hover:bg-surface-sunken rounded-full transition-colors"
            aria-label="Cancel editing series"
            title="Cancel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="series-name-input"
              className="block text-sm font-medium text-content mb-1"
            >
              Series Name *
            </label>
            <input
              id="series-name-input"
              type="text"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., The Lord of the Rings Collection"
              className="w-full px-3 py-2 border border-subtle rounded-[--radius-control] bg-surface text-content text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              required
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="series-sort-name-input"
              className="block text-sm font-medium text-content mb-1"
            >
              Sort Name *
              <span className="text-xs font-normal text-content-muted ml-1">
                (used for alphabetical sorting)
              </span>
            </label>
            <input
              id="series-sort-name-input"
              type="text"
              value={formData.sort_name}
              onChange={(e) => handleSortNameChange(e.target.value)}
              placeholder="e.g., Lord of the Rings Collection"
              className="w-full px-3 py-2 border border-subtle rounded-[--radius-control] bg-surface text-content text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              required
            />
          </div>

          <div>
            <label
              htmlFor="series-tmdb-id-input"
              className="block text-sm font-medium text-content mb-1"
            >
              TMDb Collection ID
              <span className="text-xs font-normal text-content-muted ml-1">(optional)</span>
            </label>
            <input
              id="series-tmdb-id-input"
              type="number"
              value={formData.tmdb_collection_id}
              onChange={(e) => setFormData({ ...formData, tmdb_collection_id: e.target.value })}
              placeholder="e.g., 119"
              className="w-full px-3 py-2 border border-subtle rounded-[--radius-control] bg-surface text-content text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
          </div>

          <div>
            <label
              htmlFor="series-sort-method-select"
              className="block text-sm font-medium text-content mb-1"
            >
              Internal Sort Method *
            </label>
            <select
              id="series-sort-method-select"
              value={formData.internal_sort_method}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  internal_sort_method: e.target.value as 'chronological' | 'custom' | 'alphabetical',
                })
              }
              className="w-full px-3 py-2 border border-subtle rounded-[--radius-control] bg-surface text-content text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              required
            >
              <option value="chronological">Chronological (by release date)</option>
              <option value="custom">Custom (by sort order number)</option>
              <option value="alphabetical">Alphabetical (by title)</option>
            </select>
          </div>
        </div>

        {/* Movies in Series (edit mode only) */}
        {editingSeries && (
          <div className="border-t border-subtle pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold text-content">
                  Titles in Series ({seriesMovies.length})
                </h4>
                {formData.internal_sort_method === 'custom' && (
                  <p className="text-xs text-content-muted">
                    Assign sort numbers to control the exact playback or shelf order within this series.
                  </p>
                )}
              </div>
              {hasSortOrderChanges && formData.internal_sort_method === 'custom' && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveSortOrders}
                >
                  Save Sort Order
                </Button>
              )}
            </div>

            {isLoadingMovies ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-[--radius-control]" />
                <Skeleton className="h-10 w-full rounded-[--radius-control]" />
              </div>
            ) : seriesMovies.length === 0 ? (
              <div className="rounded-[--radius-control] border border-dashed border-subtle bg-surface-sunken/50 py-6 text-center text-sm text-content-muted">
                No titles linked to this series yet. Link movies from the Collection or Media editor.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {seriesMovies.map((movie, idx) => (
                  <div
                    key={movie.id}
                    className="flex items-center gap-3 px-3 py-2 border border-subtle rounded-[--radius-control] bg-surface-sunken/60"
                  >
                    <span className="text-xs font-mono text-content-muted w-5 text-right">
                      {idx + 1}.
                    </span>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-sm font-medium text-content truncate">
                        {movie.title}
                      </span>
                      {movie.release_date && (
                        <span className="text-xs text-content-muted flex-shrink-0">
                          ({new Date(movie.release_date).getFullYear()})
                        </span>
                      )}
                    </div>
                    {formData.internal_sort_method === 'custom' && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <label
                          htmlFor={`sort-order-${movie.id}`}
                          className="text-xs text-content-muted"
                        >
                          Order:
                        </label>
                        <input
                          id={`sort-order-${movie.id}`}
                          type="number"
                          value={sortOrders[movie.id] ?? ''}
                          onChange={(e) => handleSortOrderChange(movie.id, e.target.value)}
                          className="w-16 px-2 py-1 text-sm border border-subtle rounded-[--radius-control] bg-surface text-content"
                          placeholder="#"
                        />
                      </div>
                    )}
                    {formData.internal_sort_method !== 'custom' &&
                      (movie as any).sort_order !== undefined &&
                      (movie as any).sort_order !== null && (
                        <div className="text-xs text-content-muted flex-shrink-0">
                          Order #{(movie as any).sort_order}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {editingSeries ? 'Update Series' : 'Create Series'}
          </Button>
        </div>
      </form>
    </div>
  );
};

/** Read-only card for a series */
const SeriesCard: React.FC<{
  series: Series;
  onEdit: (s: Series) => void;
  onDelete: (s: Series) => void;
}> = ({ series: s, onEdit, onDelete }) => {
  const sortMethod = s.internal_sort_method || 'chronological';
  const movieCount = typeof s.movie_count === 'number' ? s.movie_count : undefined;

  return (
    <div className="card p-4 sm:p-5 hover:border-primary-400/60 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base sm:text-lg font-semibold text-content truncate">
              {s.name}
            </h3>
            {movieCount !== undefined && (
              <span className="inline-flex items-center rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300">
                {movieCount} {movieCount === 1 ? 'title' : 'titles'}
              </span>
            )}
            <span className="inline-flex items-center rounded-full bg-surface-sunken border border-subtle px-2.5 py-0.5 text-xs font-medium text-content-muted">
              {sortMethodLabels[sortMethod]}
            </span>
            {s.tmdb_collection_id && (
              <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/20 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                TMDb #{s.tmdb_collection_id}
              </span>
            )}
          </div>
          <p className="text-xs text-content-muted mt-1">
            Sort name: <span className="font-medium text-content">{s.sort_name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(s)}
            aria-label={`Edit ${s.name}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(s)}
            aria-label={`Delete ${s.name}`}
            className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};

const SeriesManager: React.FC = () => {
  const [series, setSeries] = useState<Series[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSeriesId, setEditingSeriesId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    loadSeries();
  }, []);

  const loadSeries = async () => {
    setIsLoading(true);
    try {
      const data = await apiService.getSeries();
      setSeries(data);
    } catch (error) {
      console.error('Failed to load series:', error);
      toast({ message: 'Failed to load series. Please try again.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSeries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return series;
    return series.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.sort_name.toLowerCase().includes(q) ||
        (s.tmdb_collection_id && String(s.tmdb_collection_id).includes(q))
    );
  }, [series, searchQuery]);

  const handleDelete = async (target: Series) => {
    const confirmed = await confirm({
      title: 'Delete series',
      message: `Are you sure you want to delete "${target.name}"? This will unlink the series from its movies without deleting the movies themselves.`,
      confirmLabel: 'Delete Series',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await apiService.deleteSeries(target.id);
      resetFacetsCache();
      toast({ message: `Deleted "${target.name}".`, type: 'success' });
      await loadSeries();
    } catch (error) {
      console.error('Failed to delete series:', error);
      toast({ message: 'Failed to delete series. Please try again.', type: 'error' });
    }
  };

  const handleSaved = async () => {
    resetFacetsCache();
    setEditingSeriesId(null);
    setIsCreating(false);
    await loadSeries();
  };

  const handleCancel = () => {
    setEditingSeriesId(null);
    setIsCreating(false);
  };

  const handleEdit = (s: Series) => {
    setIsCreating(false);
    setEditingSeriesId(s.id);
  };

  const handleStartCreate = () => {
    setEditingSeriesId(null);
    setIsCreating(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading series">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48 rounded-[--radius-control]" />
          <Skeleton className="h-10 w-32 rounded-[--radius-control]" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-[--radius-card]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Section Header & Search Bar */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold text-content">Series & Franchises</h2>
              <span className="inline-flex items-center rounded-full bg-surface-sunken border border-subtle px-2.5 py-0.5 text-xs font-semibold text-content-muted">
                {series.length}
              </span>
            </div>
            <p className="text-sm text-content-muted mt-0.5">
              Group related movies into series and customize their chronological or custom playback order.
            </p>
          </div>
          {!isCreating && (
            <Button onClick={handleStartCreate} className="flex-shrink-0">
              + New Series
            </Button>
          )}
        </div>

        {series.length > 0 && (
          <div className="mt-4 relative">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter series by name or TMDb ID…"
              aria-label="Filter series"
              className="w-full pl-9 pr-4 py-2 text-sm border border-subtle rounded-[--radius-control] bg-surface text-content focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            <svg
              className="w-4 h-4 text-content-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
        )}
      </div>

      {/* Create new series form (at top) */}
      {isCreating && (
        <SeriesForm
          initialData={emptyFormData}
          editingSeries={null}
          onSave={handleSaved}
          onCancel={handleCancel}
        />
      )}

      {/* Series list */}
      {series.length === 0 && !isCreating ? (
        <EmptyState
          title="No series created yet"
          description="Create a series to group trilogies, franchises, or box sets together in your collection."
          action={<Button onClick={handleStartCreate}>Create Your First Series</Button>}
        />
      ) : filteredSeries.length === 0 ? (
        <EmptyState
          title="No matching series"
          description={`No series matched "${searchQuery}".`}
          action={
            <Button variant="secondary" onClick={() => setSearchQuery('')}>
              Clear Filter
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {filteredSeries.map((s) =>
            editingSeriesId === s.id ? (
              <SeriesForm
                key={`edit-${s.id}`}
                initialData={{
                  name: s.name,
                  sort_name: s.sort_name,
                  tmdb_collection_id: s.tmdb_collection_id?.toString() || '',
                  internal_sort_method: s.internal_sort_method || 'chronological',
                }}
                editingSeries={s}
                onSave={handleSaved}
                onCancel={handleCancel}
              />
            ) : (
              <SeriesCard
                key={s.id}
                series={s}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )
          )}
        </div>
      )}
    </div>
  );
};

export default SeriesManager;
