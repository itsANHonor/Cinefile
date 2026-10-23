import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CollectionStatistics as Stats } from '../types';
import { PHYSICAL_FORMATS, formatBadgeClasses } from '../lib/formats';
import { Skeleton } from './ui/Skeleton';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';

interface CollectionStatisticsProps {
  statistics: Stats | null;
  isLoading: boolean;
}

const formatCount = (value: number) => value.toLocaleString();

/**
 * One-line collection summary with a "View breakdown" action that opens the
 * full per-format breakdown in a Sheet. Keeps posters above the fold while
 * leaving the detailed numbers one tap away.
 */
const CollectionStatistics: React.FC<CollectionStatisticsProps> = ({ statistics, isLoading }) => {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);

  // Reserve the same vertical space while loading so the layout does not jump.
  if (isLoading || !statistics) {
    return (
      <div className="flex h-10 items-center gap-3">
        <Skeleton className="h-4 w-56 rounded-[--radius-control]" />
      </div>
    );
  }

  const activeFormats = PHYSICAL_FORMATS.filter((format) => statistics.formatCounts[format] > 0);

  const summaryParts = [
    `${formatCount(statistics.totalPhysicalItems)} items`,
    `${formatCount(statistics.totalMovies)} movies`,
  ];
  if (statistics.totalTVSeasons > 0) {
    summaryParts.push(`${formatCount(statistics.totalTVSeasons)} TV seasons`);
  }

  return (
    <div className="flex h-10 flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-sm text-content-muted">{summaryParts.join(' · ')}</p>
      {activeFormats.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsBreakdownOpen(true)}
          aria-haspopup="dialog"
        >
          View breakdown
        </Button>
      )}
      <Button asChild variant="ghost" size="sm">
        <Link to="/statistics">Full statistics</Link>
      </Button>

      <Sheet
        isOpen={isBreakdownOpen}
        onClose={() => setIsBreakdownOpen(false)}
        title="Collection breakdown"
        description="Totals by media type and physical format."
        position="bottom"
        size="lg"
      >
        <div className="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3 md:grid-cols-4">
          <div className="flex flex-col items-center rounded-[--radius-card] bg-primary-50 p-4 text-center dark:bg-primary-900/20">
            <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">
              {formatCount(statistics.totalPhysicalItems)}
            </span>
            <span className="mt-1 text-sm font-medium text-primary-700 dark:text-primary-300">
              Physical Items
            </span>
          </div>

          <div className="flex flex-col items-center rounded-[--radius-card] bg-primary-50 p-4 text-center dark:bg-primary-900/20">
            <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">
              {formatCount(statistics.totalMovies)}
            </span>
            <span className="mt-1 text-sm font-medium text-primary-700 dark:text-primary-300">
              Movies
            </span>
          </div>

          {statistics.totalTVSeasons > 0 && (
            <div className="flex flex-col items-center rounded-[--radius-card] bg-purple-50 p-4 text-center dark:bg-purple-900/20">
              <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatCount(statistics.totalTVSeasons)}
              </span>
              <span className="mt-1 text-sm font-medium text-purple-700 dark:text-purple-300">
                TV Seasons
              </span>
            </div>
          )}

          {activeFormats.map((format) => (
            <div
              key={format}
              className={`flex flex-col items-center rounded-[--radius-card] p-4 text-center ${
                formatBadgeClasses[format] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              <span className="text-2xl font-bold">{formatCount(statistics.formatCounts[format])}</span>
              <span className="mt-1 text-sm font-medium">{format}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end border-t border-subtle pt-3">
          <Button asChild variant="secondary" size="sm" onClick={() => setIsBreakdownOpen(false)}>
            <Link to="/statistics">View full statistics →</Link>
          </Button>
        </div>
      </Sheet>
    </div>
  );
};

export default CollectionStatistics;
