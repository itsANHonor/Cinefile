import React, { useState, useEffect } from 'react';
import { Media, Series } from '../types';
import { apiService } from '../services/api.service';
import PosterSelector from './PosterSelector';

interface MediaEditModalProps {
  media: Media | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedMedia: Media) => void;
}

interface TMDBComparison {
  current: any;
  tmdb: any;
  tmdb_id: number;
}

const MediaEditModal: React.FC<MediaEditModalProps> = ({ media, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: '',
    synopsis: '',
    director: '',
    release_date: '',
    cover_art_url: '',
  });
  const [cast, setCast] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [tmdbData, setTmdbData] = useState<TMDBComparison | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPosterSelector, setShowPosterSelector] = useState(false);
  
  // Series management state
  const [availableSeries, setAvailableSeries] = useState<Series[]>([]);
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<number[]>([]);
  const [selectedSeriesData, setSelectedSeriesData] = useState<Series[]>([]); // Store full series objects
  const [primarySeriesId, setPrimarySeriesId] = useState<number | undefined>(undefined);
  const [seriesSearchQuery, setSeriesSearchQuery] = useState<string>('');
  const [showSeriesDropdown, setShowSeriesDropdown] = useState(false);

  useEffect(() => {
    if (media && isOpen) {
      setFormData({
        title: media.title || '',
        synopsis: media.synopsis || '',
        director: media.director || '',
        release_date: media.release_date || '',
        cover_art_url: media.cover_art_url || '',
      });
      setCast(media.cast || []);
      setTmdbData(null);
      setSelectedFields([]);
      
      // Initialize series data
      if (media.series && Array.isArray(media.series)) {
        setSelectedSeriesIds(media.series.map(s => s.id));
        setSelectedSeriesData(media.series); // Store the series objects
      } else {
        setSelectedSeriesIds([]);
        setSelectedSeriesData([]);
      }
      setPrimarySeriesId(media.primary_series_id);
      setSeriesSearchQuery('');
      setShowSeriesDropdown(false);
    }
  }, [media, isOpen]);

  // Load available series when modal opens
  useEffect(() => {
    if (isOpen) {
      const loadSeries = async () => {
        try {
          const series = await apiService.getSeries();
          setAvailableSeries(series);
        } catch (error) {
          console.error('Failed to load series:', error);
        }
      };
      loadSeries();
    }
  }, [isOpen]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCastChange = (index: number, value: string) => {
    const newCast = [...cast];
    newCast[index] = value;
    setCast(newCast);
  };

  const addCastMember = () => {
    setCast([...cast, '']);
  };

  const removeCastMember = (index: number) => {
    setCast(cast.filter((_, i) => i !== index));
  };

  const handleRefreshFromTMDB = async () => {
    if (!media?.tmdb_id) return;

    setIsRefreshing(true);
    try {
      const data = await apiService.refreshMediaFromTMDB(media.id);
      setTmdbData(data);
    } catch (error) {
      console.error('Failed to refresh TMDB data:', error);
      alert('Failed to refresh TMDB data. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFieldToggle = (field: string) => {
    setSelectedFields(prev => 
      prev.includes(field) 
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  const handleApplyTMDBFields = async () => {
    if (!media || selectedFields.length === 0) return;

    setIsSaving(true);
    try {
      const updatedMedia = await apiService.updateMediaFromTMDB(media.id, selectedFields);
      onSave(updatedMedia);
      setTmdbData(null);
      setSelectedFields([]);
    } catch (error) {
      console.error('Failed to apply TMDB fields:', error);
      alert('Failed to apply TMDB fields. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!media) return;

    setIsSaving(true);
    try {
      // Build series_associations array
      const series_associations = selectedSeriesIds.map(seriesId => ({
        series_id: seriesId,
        sort_order: null,
        auto_sort: true,
      }));

      const updatedMedia = await apiService.updateMedia(media.id, {
        ...formData,
        cast: cast.filter(c => c.trim() !== ''),
        series_associations,
        primary_series_id: primarySeriesId || null,
      });
      onSave(updatedMedia);
      onClose();
    } catch (error) {
      console.error('Failed to save media:', error);
      alert('Failed to save media. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Series management handlers
  const handleAddSeries = (seriesId: number) => {
    if (!selectedSeriesIds.includes(seriesId)) {
      const seriesToAdd = availableSeries.find(s => s.id === seriesId);
      if (seriesToAdd) {
        setSelectedSeriesIds([...selectedSeriesIds, seriesId]);
        setSelectedSeriesData([...selectedSeriesData, seriesToAdd]);
      }
    }
    setSeriesSearchQuery('');
    setShowSeriesDropdown(false);
  };

  const handleRemoveSeries = (seriesId: number) => {
    setSelectedSeriesIds(selectedSeriesIds.filter(id => id !== seriesId));
    setSelectedSeriesData(selectedSeriesData.filter(s => s.id !== seriesId));
    // If removing primary series, clear it
    if (primarySeriesId === seriesId) {
      setPrimarySeriesId(undefined);
    }
  };

  const handleSetPrimarySeries = (seriesId: number) => {
    if (selectedSeriesIds.includes(seriesId)) {
      setPrimarySeriesId(seriesId === primarySeriesId ? undefined : seriesId);
    }
  };

  const handleSelectPosterClick = () => {
    const hasTmdbLink = media?.tmdb_id || (media?.media_type === 'tv_season' && media?.tv_show_tmdb_id);
    if (!hasTmdbLink) {
      alert('This media item is not linked to TMDB.');
      return;
    }
    setShowPosterSelector(true);
  };

  const handlePosterSelected = (url: string) => {
    setFormData(prev => ({ ...prev, cover_art_url: url }));
    setShowPosterSelector(false);
  };

  // Filter available series for dropdown
  const filteredAvailableSeries = availableSeries.filter(series => {
    const matchesSearch = series.name.toLowerCase().includes(seriesSearchQuery.toLowerCase()) ||
                         series.sort_name.toLowerCase().includes(seriesSearchQuery.toLowerCase());
    const notAlreadySelected = !selectedSeriesIds.includes(series.id);
    return matchesSearch && notAlreadySelected;
  });

  if (!isOpen || !media) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Edit Media: {media.title}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6">
            {/* TMDB Refresh Section */}
            {(media.tmdb_id || (media.media_type === 'tv_season' && media.tv_show_tmdb_id)) && (
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Refresh from TMDB
                  </h3>
                  <button
                    onClick={handleRefreshFromTMDB}
                    disabled={isRefreshing}
                    className="btn-primary"
                  >
                    {isRefreshing ? 'Refreshing...' : 'Refresh from TMDB'}
                  </button>
                </div>

                {tmdbData && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Compare current data with latest TMDB data and select which fields to update:
                    </p>
                    
                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Current Data */}
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Current Data</h4>
                        <div className="space-y-3">
                          {Object.entries(tmdbData.current).map(([key, _value]) => (
                            <div key={key} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`current-${key}`}
                                checked={selectedFields.includes(key)}
                                onChange={() => handleFieldToggle(key)}
                                className="rounded"
                              />
                              <label htmlFor={`current-${key}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* TMDB Data */}
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">TMDB Data</h4>
                        <div className="space-y-3">
                          {Object.entries(tmdbData.tmdb).map(([key, _value]) => (
                            <div key={key} className="text-sm">
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                              </span>
                              <div className="mt-1 text-gray-600 dark:text-gray-400">
                                {key === 'cast' ? (_value as string[]).join(', ') : 
                                 key === 'genres' ? (_value as Array<{id: number; name: string}>).map(g => g.name).join(', ') :
                                 String(_value || 'N/A')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-3">
                      <button
                        onClick={() => setTmdbData(null)}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleApplyTMDBFields}
                        disabled={selectedFields.length === 0 || isSaving}
                        className="btn-primary"
                      >
                        {isSaving ? 'Applying...' : `Apply ${selectedFields.length} Fields`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Manual Edit Form */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Manual Edit
              </h3>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  {/* TV Show Info (read-only) */}
                  {media.media_type === 'tv_season' && (
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <div className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">TV Season</div>
                      {media.tv_show_name && (
                        <div className="text-sm text-gray-900 dark:text-gray-100">{media.tv_show_name}</div>
                      )}
                      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {media.season_number != null && <span>Season {media.season_number}</span>}
                        {media.episode_count != null && <span>{media.episode_count} episodes</span>}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {media.media_type === 'tv_season' ? 'Creator' : 'Director'}
                    </label>
                    <input
                      type="text"
                      value={formData.director}
                      onChange={(e) => handleInputChange('director', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Release Date
                    </label>
                    <input
                      type="date"
                      value={formData.release_date}
                      onChange={(e) => handleInputChange('release_date', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Cover Art URL
                    </label>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={handleSelectPosterClick}
                        disabled={!media?.tmdb_id && !(media?.media_type === 'tv_season' && media?.tv_show_tmdb_id)}
                        className="btn-secondary text-sm flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={(!media?.tmdb_id && !(media?.media_type === 'tv_season' && media?.tv_show_tmdb_id)) ? 'Not linked to TMDB' : 'Select alternative poster from TMDB'}
                      >
                        Select Poster
                      </button>
                    </div>
                    <input
                      type="url"
                      value={formData.cover_art_url}
                      onChange={(e) => handleInputChange('cover_art_url', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                    {formData.cover_art_url && (
                      <img
                        src={formData.cover_art_url}
                        alt="Cover preview"
                        className="mt-2 w-32 h-48 object-cover rounded"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Synopsis
                    </label>
                    <textarea
                      value={formData.synopsis}
                      onChange={(e) => handleInputChange('synopsis', e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Cast
                    </label>
                    <div className="space-y-2">
                      {cast.map((member, index) => (
                        <div key={index} className="flex space-x-2">
                          <input
                            type="text"
                            value={member}
                            onChange={(e) => handleCastChange(index, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="Cast member name"
                          />
                          <button
                            type="button"
                            onClick={() => removeCastMember(index)}
                            className="px-3 py-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addCastMember}
                        className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        + Add Cast Member
                      </button>
                    </div>
                  </div>

                  {media.genres && media.genres.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Genres
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {media.genres.map((genre) => (
                          <span
                            key={genre.id}
                            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                          >
                            {genre.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Series Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Series
                    </label>
                    
                    {/* Selected Series Chips */}
                    {selectedSeriesIds.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {selectedSeriesIds.map((seriesId) => {
                          // Use selectedSeriesData first, fallback to availableSeries
                          const series = selectedSeriesData.find(s => s.id === seriesId) || 
                                       availableSeries.find(s => s.id === seriesId);
                          if (!series) {
                            // Series not loaded yet, show placeholder
                            return (
                              <span
                                key={seriesId}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                              >
                                <span>Loading...</span>
                              </span>
                            );
                          }
                          const isPrimary = primarySeriesId === seriesId;
                          
                          return (
                            <span
                              key={seriesId}
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                                isPrimary
                                  ? 'bg-primary-200 text-primary-900 dark:bg-primary-800 dark:text-primary-200 border-2 border-primary-500'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {isPrimary && (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              )}
                              <span>{series.name}</span>
                              <button
                                type="button"
                                onClick={() => handleSetPrimarySeries(seriesId)}
                                className={`ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors ${
                                  isPrimary
                                    ? 'hover:bg-primary-300 dark:hover:bg-primary-700'
                                    : 'hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                                title={isPrimary ? 'Remove as primary' : 'Set as primary'}
                              >
                                {!isPrimary && (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                  </svg>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveSeries(seriesId)}
                                className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                title="Remove series"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Add Series Input */}
                    <div className="relative">
                      <input
                        type="text"
                        value={seriesSearchQuery}
                        onChange={(e) => {
                          setSeriesSearchQuery(e.target.value);
                          setShowSeriesDropdown(true);
                        }}
                        onBlur={() => {
                          // Delay closing to allow clicking on dropdown items
                          setTimeout(() => setShowSeriesDropdown(false), 200);
                        }}
                        placeholder="Search and add series..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                      />
                      
                      {/* Dropdown */}
                      {showSeriesDropdown && filteredAvailableSeries.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredAvailableSeries.map((series) => (
                            <button
                              key={series.id}
                              type="button"
                              onClick={() => handleAddSeries(series.id)}
                              className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              {series.name}
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {showSeriesDropdown && seriesSearchQuery && filteredAvailableSeries.length === 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                          No series found
                        </div>
                      )}
                    </div>
                    
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onClose}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Poster Selector */}
      {showPosterSelector && (media?.tmdb_id || (media?.media_type === 'tv_season' && media?.tv_show_tmdb_id)) && (
        <PosterSelector
          tmdbId={(media.media_type === 'tv_season' ? (media.tv_show_tmdb_id || media.tmdb_id) : media.tmdb_id)!}
          movieTitle={media.title}
          onSelect={handlePosterSelected}
          onClose={() => setShowPosterSelector(false)}
          currentPosterUrl={formData.cover_art_url}
          mediaType={media.media_type}
          seasonNumber={media.season_number}
        />
      )}
    </div>
  );
};

export default MediaEditModal;
