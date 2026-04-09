import React from 'react';
import { CollectionStatistics as Stats } from '../types';

interface CollectionStatisticsProps {
  statistics: Stats;
  isLoading: boolean;
}

const CollectionStatistics: React.FC<CollectionStatisticsProps> = ({ statistics, isLoading }) => {
  if (isLoading) {
    return (
      <div className="card mb-6 animate-pulse">
        <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  // Format colors matching the MediaCard component
  const formatColors: Record<string, { bg: string; text: string; count: string }> = {
    '4K UHD': {
      bg: 'bg-blue-100 dark:bg-blue-900',
      text: 'text-blue-800 dark:text-blue-200',
      count: 'text-blue-600 dark:text-blue-400'
    },
    'Blu-ray': {
      bg: 'bg-green-100 dark:bg-green-900',
      text: 'text-green-800 dark:text-green-200',
      count: 'text-green-600 dark:text-green-400'
    },
    'DVD': {
      bg: 'bg-orange-100 dark:bg-orange-900',
      text: 'text-orange-800 dark:text-orange-200',
      count: 'text-orange-600 dark:text-orange-400'
    },
    'LaserDisc': {
      bg: 'bg-purple-100 dark:bg-purple-900',
      text: 'text-purple-800 dark:text-purple-200',
      count: 'text-purple-600 dark:text-purple-400'
    },
    'VHS': {
      bg: 'bg-red-100 dark:bg-red-900',
      text: 'text-red-800 dark:text-red-200',
      count: 'text-red-600 dark:text-red-400'
    },
  };

  const getFormatColors = (format: string) => formatColors[format] || {
    bg: 'bg-gray-100 dark:bg-gray-700',
    text: 'text-gray-800 dark:text-gray-200',
    count: 'text-gray-600 dark:text-gray-400'
  };

  const formatOrder = ['4K UHD', 'Blu-ray', 'DVD', 'Digital-HD', 'Digital-SD', 'Digital-UHD', 'LaserDisc', 'VHS'];
  const activeFormats = formatOrder.filter(format => statistics.formatCounts[format] > 0);

  return (
    <div className="card mb-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Total Physical Items */}
        <div className="text-center p-4 rounded-lg bg-primary-50 dark:bg-primary-900/20">
          <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
            {statistics.totalPhysicalItems}
          </div>
          <div className="text-sm text-primary-700 dark:text-primary-300">Physical Items</div>
        </div>

        {/* Total Movies */}
        <div className="text-center p-4 rounded-lg bg-primary-50 dark:bg-primary-900/20">
          <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
            {statistics.totalMovies}
          </div>
          <div className="text-sm text-primary-700 dark:text-primary-300">Movies</div>
        </div>

        {/* Total TV Seasons */}
        {statistics.totalTVSeasons > 0 && (
          <div className="text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {statistics.totalTVSeasons}
            </div>
            <div className="text-sm text-purple-700 dark:text-purple-300">TV Seasons</div>
          </div>
        )}

        {/* Format Counts - Only show formats with items */}
        {activeFormats.map((format) => {
          const { bg, text, count } = getFormatColors(format);
          return (
            <div key={format} className={`text-center p-4 rounded-lg ${bg}`}>
              <div className={`text-2xl font-bold ${count}`}>
                {statistics.formatCounts[format]}
              </div>
              <div className={`text-sm font-medium ${text}`}>{format}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CollectionStatistics;
