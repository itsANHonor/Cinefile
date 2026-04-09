import React, { useState, useEffect } from 'react';
import { TMDbTVShowDetails, TMDbTVSeason } from '../types';
import { apiService } from '../services/api.service';

interface SelectedSeason {
  title: string;
  media_type: 'tv_season';
  tmdb_id: number;
  tv_show_tmdb_id: number;
  tv_show_name: string;
  season_number: number;
  episode_count: number;
  synopsis?: string;
  cover_art_url?: string;
  release_date?: string;
  director?: string;
  cast?: string[];
  genres?: { id: number; name: string }[];
}

interface TVSeasonPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (seasons: SelectedSeason[], formats: string[]) => void;
  tvShowId: number;
  tvShowName: string;
}

const availableFormats = ['4K UHD', '3D Blu-ray', 'Blu-ray', 'DVD', 'Digital-HD', 'Digital-SD', 'Digital-UHD', 'LaserDisc', 'VHS'];

const TVSeasonPicker: React.FC<TVSeasonPickerProps> = ({
  isOpen,
  onClose,
  onConfirm,
  tvShowId,
  tvShowName,
}) => {
  const [tvDetails, setTvDetails] = useState<TMDbTVShowDetails | null>(null);
  const [selectedSeasonIds, setSelectedSeasonIds] = useState<Set<number>>(new Set());
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && tvShowId) {
      loadTVDetails();
    }
  }, [isOpen, tvShowId]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedSeasonIds(new Set());
      setSelectedFormats([]);
      setTvDetails(null);
      setError(null);
    }
  }, [isOpen]);

  const loadTVDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const details = await apiService.getTVDetails(tvShowId);
      setTvDetails(details);
    } catch (err) {
      console.error('Failed to load TV details:', err);
      setError('Failed to load TV show details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSeason = (seasonId: number) => {
    setSelectedSeasonIds(prev => {
      const next = new Set(prev);
      if (next.has(seasonId)) {
        next.delete(seasonId);
      } else {
        next.add(seasonId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!tvDetails) return;
    const allIds = tvDetails.seasons.map(s => s.id);
    if (selectedSeasonIds.size === allIds.length) {
      setSelectedSeasonIds(new Set());
    } else {
      setSelectedSeasonIds(new Set(allIds));
    }
  };

  const handleFormatToggle = (format: string) => {
    setSelectedFormats(prev =>
      prev.includes(format)
        ? prev.filter(f => f !== format)
        : [...prev, format]
    );
  };

  const handleConfirm = () => {
    if (!tvDetails || selectedSeasonIds.size === 0) return;
    if (selectedFormats.length === 0) {
      alert('Please select at least one format.');
      return;
    }

    const selectedSeasons: SelectedSeason[] = tvDetails.seasons
      .filter(s => selectedSeasonIds.has(s.id))
      .map(season => {
        const posterUrl = season.poster_path
          ? `https://image.tmdb.org/t/p/w500${season.poster_path}`
          : tvDetails.poster_url || (tvDetails.poster_path ? `https://image.tmdb.org/t/p/w500${tvDetails.poster_path}` : undefined);

        const title = season.season_number === 0
          ? `${tvDetails.name} - Specials`
          : `${tvDetails.name} - Season ${season.season_number}`;

        return {
          title,
          media_type: 'tv_season' as const,
          tmdb_id: season.id,
          tv_show_tmdb_id: tvDetails.id,
          tv_show_name: tvDetails.name,
          season_number: season.season_number,
          episode_count: season.episode_count,
          synopsis: season.overview || tvDetails.overview,
          cover_art_url: posterUrl,
          release_date: season.air_date,
          director: tvDetails.creators || undefined,
          cast: tvDetails.cast || [],
          genres: tvDetails.genres || [],
        };
      });

    onConfirm(selectedSeasons, selectedFormats);
  };

  const getSeasonPosterUrl = (season: TMDbTVSeason): string | null => {
    if (season.poster_path) {
      return `https://image.tmdb.org/t/p/w500${season.poster_path}`;
    }
    if (tvDetails?.poster_path) {
      return `https://image.tmdb.org/t/p/w500${tvDetails.poster_path}`;
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      <div className="flex min-h-screen items-start justify-center p-4 pt-20">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Select Seasons
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {tvShowName}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">Loading seasons...</p>
              </div>
            )}

            {error && (
              <div className="text-center py-12">
                <p className="text-red-500">{error}</p>
                <button
                  onClick={loadTVDetails}
                  className="mt-4 btn-primary"
                >
                  Retry
                </button>
              </div>
            )}

            {tvDetails && !isLoading && !error && (
              <>
                {/* Select All */}
                <div className="mb-4 flex items-center justify-between">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSeasonIds.size === tvDetails.seasons.length && tvDetails.seasons.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Select All ({tvDetails.seasons.length} seasons)
                    </span>
                  </label>
                  {selectedSeasonIds.size > 0 && (
                    <span className="text-sm text-primary-600 dark:text-primary-400">
                      {selectedSeasonIds.size} selected
                    </span>
                  )}
                </div>

                {/* Season List */}
                <div className="space-y-2 mb-6">
                  {tvDetails.seasons.map((season) => {
                    const posterUrl = getSeasonPosterUrl(season);
                    const isSelected = selectedSeasonIds.has(season.id);

                    return (
                      <div
                        key={season.id}
                        onClick={() => toggleSeason(season.id)}
                        className={`flex gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSeason(season.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded flex-shrink-0"
                        />

                        <div className="w-10 h-[60px] bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                          {posterUrl ? (
                            <img
                              src={posterUrl}
                              alt={season.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {season.name}
                          </h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {season.episode_count} episodes
                            {season.air_date && ` • ${new Date(season.air_date).getFullYear()}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Format Selection */}
                {selectedSeasonIds.size > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Select Formats
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {availableFormats.map((format) => (
                        <button
                          key={format}
                          onClick={() => handleFormatToggle(format)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                            selectedFormats.includes(format)
                              ? 'bg-primary-100 dark:bg-primary-900 border-primary-500 text-primary-800 dark:text-primary-200'
                              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                          }`}
                        >
                          {format}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedSeasonIds.size === 0 || selectedFormats.length === 0}
              className="btn-primary"
            >
              Add {selectedSeasonIds.size} Season{selectedSeasonIds.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TVSeasonPicker;
