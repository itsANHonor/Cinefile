import React from 'react';
import { PhysicalItem } from '../types';

interface MediaCardProps {
  physicalItem: PhysicalItem;
  onClick?: () => void;
  isEditMode?: boolean;
  isAuthenticated?: boolean;
  onEdit?: (item: PhysicalItem) => void;
  onDelete?: (itemId: number) => void;
}

const MediaCard: React.FC<MediaCardProps> = ({ 
  physicalItem, 
  onClick, 
  isEditMode = false, 
  isAuthenticated = false,
  onEdit,
  onDelete
}) => {
  // Get primary media for display
  const primaryMedia = physicalItem.media[0];
  const imageUrl = physicalItem.custom_image_url || primaryMedia?.cover_art_url;
  const formatColors: Record<string, string> = {
    '4K UHD': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'Blu-ray': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'DVD': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    'LaserDisc': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    'VHS': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  const getFormatColor = (format: string) => formatColors[format] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(physicalItem);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && confirm('Are you sure you want to delete this physical item?')) {
      onDelete(physicalItem.id);
    }
  };

  return (
    <div
      className="card cursor-pointer hover:shadow-lg transition-shadow duration-200 overflow-hidden p-0 relative group"
      onClick={onClick}
    >
      {/* Cover Image */}
      <div className="relative aspect-[2/3] bg-gray-200 dark:bg-gray-700 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={physicalItem.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              className="w-16 h-16 text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 4v16M17 4v16M3 8h18M3 12h18M3 16h18"
              />
            </svg>
          </div>
        )}
        
        {/* Admin Controls Overlay */}
        {isAuthenticated && isEditMode && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleEditClick}
              className="p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
              title="Edit item"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={handleDeleteClick}
              className="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
              title="Delete item"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Format Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
          {physicalItem.physical_format.map((format, idx) => (
            <span key={idx} className={`${getFormatColor(format)} text-xs font-medium px-2 py-1 rounded shadow-sm`}>
              {format}
            </span>
          ))}
        </div>
        
        {/* Multi-item indicator */}
        {physicalItem.media.length > 1 && (
          <div className="absolute bottom-2 left-2">
            <span className="bg-black bg-opacity-75 text-white text-xs font-medium px-2 py-1 rounded">
              {(() => {
                const tvCount = physicalItem.media.filter(m => m.media_type === 'tv_season').length;
                const movieCount = physicalItem.media.length - tvCount;
                if (tvCount > 0 && movieCount === 0) return `${tvCount} season${tvCount !== 1 ? 's' : ''}`;
                if (movieCount > 0 && tvCount === 0) return `${movieCount} movie${movieCount !== 1 ? 's' : ''}`;
                return `${physicalItem.media.length} items`;
              })()}
            </span>
          </div>
        )}

        {/* TV type badge */}
        {primaryMedia?.media_type === 'tv_season' && (
          <div className="absolute bottom-2 right-2">
            <span className="bg-purple-600 bg-opacity-90 text-white text-xs font-medium px-1.5 py-0.5 rounded">
              TV
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 mb-1">
          {physicalItem.name}
        </h3>
        {primaryMedia?.media_type === 'tv_season' && primaryMedia.tv_show_name && (
          <p className="text-xs text-purple-600 dark:text-purple-400 line-clamp-1">
            {primaryMedia.tv_show_name}
            {primaryMedia.season_number != null && ` - Season ${primaryMedia.season_number}`}
          </p>
        )}
        {primaryMedia?.release_date && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(primaryMedia.release_date).getFullYear()}
          </p>
        )}
        {primaryMedia?.series && primaryMedia.series.length > 0 && (
          <p className="text-xs text-primary-600 dark:text-primary-400 mt-1 line-clamp-1">
            {primaryMedia.series.map(s => s.name).join(', ')}
          </p>
        )}
        {physicalItem.edition_notes && (
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 italic line-clamp-1">{physicalItem.edition_notes}</p>
        )}
      </div>
    </div>
  );
};

export default MediaCard;

