import React, { useState, useEffect, useRef } from 'react';
import { Series, Media } from '../types';
import { apiService } from '../services/api.service';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

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

/** Inline edit/create form for a series */
const SeriesForm: React.FC<{
  initialData: SeriesFormData;
  editingSeries: Series | null;
  onSave: () => void;
  onCancel: () => void;
}> = ({ initialData, editingSeries, onSave, onCancel }) => {
  const [formData, setFormData] = useState<SeriesFormData>(initialData);
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
      apiService.getSeriesMovies(editingSeries.id)
        .then(movies => {
          setSeriesMovies(movies);
          const initialSortOrders: Record<number, number | null> = {};
          movies.forEach(movie => {
            const movieSortOrder = (movie as any).sort_order;
            initialSortOrders[movie.id] = movieSortOrder !== undefined ? movieSortOrder : null;
          });
          setSortOrders(initialSortOrders);
        })
        .catch(error => console.error('Failed to load series movies:', error))
        .finally(() => setIsLoadingMovies(false));
    }
  }, [editingSeries]);

  // Scroll into view when form appears
  useEffect(() => {
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const handleSortOrderChange = (mediaId: number, value: string) => {
    const numValue = value === '' ? null : parseInt(value);
    if (isNaN(numValue as any) && numValue !== null) return;
    setSortOrders(prev => ({ ...prev, [mediaId]: numValue }));
    setHasSortOrderChanges(true);
  };

  const handleSaveSortOrders = async () => {
    if (!editingSeries) return;
    try {
      const sortOrdersArray = Object.entries(sortOrders).map(([mediaId, sortOrder]) => ({
        media_id: parseInt(mediaId),
        sort_order: sortOrder,
      }));
      await apiService.bulkUpdateSeriesMovieSortOrders(editingSeries.id, sortOrdersArray);
      setHasSortOrderChanges(false);
      const movies = await apiService.getSeriesMovies(editingSeries.id);
      setSeriesMovies(movies);
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
        name: formData.name,
        sort_name: formData.sort_name,
        tmdb_collection_id: formData.tmdb_collection_id ? parseInt(formData.tmdb_collection_id) : undefined,
        internal_sort_method: formData.internal_sort_method,
      };

      if (editingSeries) {
        await apiService.updateSeries(editingSeries.id, data);
        if (hasSortOrderChanges) {
          const sortOrdersArray = Object.entries(sortOrders).map(([mediaId, sortOrder]) => ({
            media_id: parseInt(mediaId),
            sort_order: sortOrder,
          }));
          await apiService.bulkUpdateSeriesMovieSortOrders(editingSeries.id, sortOrdersArray);
        }
      } else {
        await apiService.createSeries(data);
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
    <div ref={formRef} className="card border-2 border-primary-500 dark:border-primary-400 shadow-lg animate-in">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {editingSeries ? 'Edit Series' : 'Add New Series'}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            title="Cancel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sort Name *
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(for alphabetical sorting)</span>
            </label>
            <input
              type="text"
              value={formData.sort_name}
              onChange={(e) => setFormData({ ...formData, sort_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              TMDb Collection ID
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(optional)</span>
            </label>
            <input
              type="number"
              value={formData.tmdb_collection_id}
              onChange={(e) => setFormData({ ...formData, tmdb_collection_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Internal Sort Method *
            </label>
            <select
              value={formData.internal_sort_method}
              onChange={(e) => setFormData({ ...formData, internal_sort_method: e.target.value as 'chronological' | 'custom' | 'alphabetical' })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Movies in Series</h4>
              {hasSortOrderChanges && formData.internal_sort_method === 'custom' && (
                <button
                  type="button"
                  onClick={handleSaveSortOrders}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Save Sort Orders
                </button>
              )}
            </div>

            {isLoadingMovies ? (
              <div className="text-center py-3 text-sm text-gray-600 dark:text-gray-400">Loading movies...</div>
            ) : seriesMovies.length === 0 ? (
              <div className="text-center py-3 text-sm text-gray-600 dark:text-gray-400">No movies in this series yet.</div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {seriesMovies.map((movie) => (
                  <div
                    key={movie.id}
                    className="flex items-center gap-3 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{movie.title}</div>
                      {movie.release_date && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(movie.release_date).getFullYear()}
                        </div>
                      )}
                    </div>
                    {formData.internal_sort_method === 'custom' && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <label className="text-xs text-gray-500 dark:text-gray-400">Order:</label>
                        <input
                          type="number"
                          value={sortOrders[movie.id] ?? ''}
                          onChange={(e) => handleSortOrderChange(movie.id, e.target.value)}
                          className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          placeholder="#"
                        />
                      </div>
                    )}
                    {formData.internal_sort_method !== 'custom' && (movie as any).sort_order !== undefined && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                        Order: {(movie as any).sort_order ?? '—'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? 'Saving...' : editingSeries ? 'Update Series' : 'Create Series'}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

/** Read-only card for a series */
const SeriesCard: React.FC<{
  series: Series;
  onEdit: (s: Series) => void;
  onDelete: (id: number) => void;
}> = ({ series: s, onEdit, onDelete }) => (
  <div className="card hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start">
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{s.name}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">Sort name: {s.sort_name}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Internal sort: {s.internal_sort_method === 'chronological' ? 'Chronological' : s.internal_sort_method === 'custom' ? 'Custom' : 'Alphabetical'}
        </p>
        {s.tmdb_collection_id && (
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            TMDb Collection ID: {s.tmdb_collection_id}
          </p>
        )}
      </div>
      <div className="flex gap-2 flex-shrink-0 ml-4">
        <button
          onClick={() => onEdit(s)}
          className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(s.id)}
          className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800 text-red-700 dark:text-red-200 rounded transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
);

const SeriesManager: React.FC = () => {
  const [series, setSeries] = useState<Series[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: 'Delete series',
      message: 'Are you sure you want to delete this series? This will remove it from all movies.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await apiService.deleteSeries(id);
      toast({ message: 'Series deleted.', type: 'success' });
      await loadSeries();
    } catch (error) {
      console.error('Failed to delete series:', error);
      toast({ message: 'Failed to delete series. Please try again.', type: 'error' });
    }
  };

  const handleSaved = async () => {
    setEditingSeriesId(null);
    setIsCreating(false);
    await loadSeries();
  };

  const handleCancel = () => {
    setEditingSeriesId(null);
    setIsCreating(false);
  };

  const handleEdit = (s: Series) => {
    // Close any open create form first
    setIsCreating(false);
    setEditingSeriesId(s.id);
  };

  const handleStartCreate = () => {
    // Close any open edit form first
    setEditingSeriesId(null);
    setIsCreating(true);
  };

  if (isLoading) {
    return <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading series...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Manage Series</h2>
        {!isCreating && (
          <button onClick={handleStartCreate} className="btn-primary">
            + Add Series
          </button>
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
        <div className="card text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 mb-4">No series created yet.</p>
          <button onClick={handleStartCreate} className="btn-primary">
            Create Your First Series
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {series.map((s) =>
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
