import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api.service';

interface PosterSelectorProps {
  tmdbId: number;
  movieTitle: string;
  onSelect: (url: string) => void;
  onClose: () => void;
  currentPosterUrl?: string;
  mediaType?: 'movie' | 'tv_season';
  seasonNumber?: number | null;
}

const PosterSelector: React.FC<PosterSelectorProps> = ({
  tmdbId,
  movieTitle,
  onSelect,
  onClose,
  currentPosterUrl,
  mediaType,
  seasonNumber,
}) => {
  const [posters, setPosters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosters = async () => {
      try {
        setLoading(true);
        let urls: string[];
        if (mediaType === 'tv_season' && seasonNumber != null) {
          urls = await apiService.getTVSeasonPosters(tmdbId, seasonNumber);
        } else if (mediaType === 'tv_season') {
          urls = await apiService.getTVPosters(tmdbId);
        } else {
          urls = await apiService.getMoviePosters(tmdbId);
        }
        setPosters(urls);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch posters:', err);
        setError('Failed to load posters');
      } finally {
        setLoading(false);
      }
    };

    fetchPosters();
  }, [tmdbId, mediaType, seasonNumber]);

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-75" 
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Select Poster
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {movieTitle}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
              </div>
            ) : error ? (
              <div className="text-center text-red-600 dark:text-red-400 p-8">
                {error}
              </div>
            ) : posters.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 p-8">
                No posters found for this {mediaType === 'tv_season' ? 'TV show' : 'movie'}.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {posters.map((url, index) => (
                  <div
                    key={index}
                    onClick={() => onSelect(url)}
                    className={`
                      cursor-pointer group relative aspect-[2/3] rounded-lg overflow-hidden border-2 transition-all
                      ${currentPosterUrl === url 
                        ? 'border-primary-500 ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-800' 
                        : 'border-transparent hover:border-primary-300 dark:hover:border-primary-700'
                      }
                    `}
                  >
                    <img
                      src={url}
                      alt={`Poster option ${index + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity" />
                    
                    {/* Selected Indicator */}
                    {currentPosterUrl === url && (
                      <div className="absolute top-2 right-2 bg-primary-500 text-white rounded-full p-1 shadow-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PosterSelector;

