import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CollectionDashboardStatistics, PersonStatItem, PhysicalFormat } from '../types';
import { apiService } from '../services/api.service';
import { formatBadgeClasses, formatLabels, isPhysicalFormat } from '../lib/formats';
import { useAuth } from '../context/AuthContext';
import { useServerMode } from '../context/ServerModeContext';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';

type StatisticsTab = 'collection' | 'content' | 'physical';

const VALID_TABS: StatisticsTab[] = ['collection', 'content', 'physical'];

const formatCount = (value: number) => value.toLocaleString();

const formatBarColors: Record<string, string> = {
  '4K UHD': 'bg-blue-500 dark:bg-blue-400',
  '3D Blu-ray': 'bg-cyan-500 dark:bg-cyan-400',
  'Blu-ray': 'bg-green-500 dark:bg-green-400',
  DVD: 'bg-orange-500 dark:bg-orange-400',
  'Digital-UHD': 'bg-indigo-500 dark:bg-indigo-400',
  'Digital-HD': 'bg-teal-500 dark:bg-teal-400',
  'Digital-SD': 'bg-slate-500 dark:bg-slate-400',
  LaserDisc: 'bg-purple-500 dark:bg-purple-400',
  VHS: 'bg-red-500 dark:bg-red-400',
};

function formatLinearSpace(mm: number): { metric: string; imperial: string } {
  if (mm <= 0) {
    return { metric: '0 cm', imperial: '0 in' };
  }
  const cm = mm / 10;
  const meters = mm / 1000;
  const metric = meters >= 1 ? `${meters.toFixed(2)} m` : `${cm.toFixed(1)} cm`;

  const totalInches = mm / 25.4;
  const feet = Math.floor(totalInches / 12);
  const remainingInches = Math.round(totalInches % 12);
  const imperial =
    feet >= 1
      ? `${feet} ft ${remainingInches} in`
      : `${totalInches.toFixed(1)} in`;

  return { metric, imperial };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getRankBadgeClass(rank: number): string {
  if (rank === 1) {
    return 'bg-amber-500 text-white shadow-sm';
  }
  if (rank === 2) {
    return 'bg-slate-400 text-white shadow-sm dark:bg-slate-500';
  }
  if (rank === 3) {
    return 'bg-amber-700 text-white shadow-sm';
  }
  return 'bg-surface-raised/90 text-content-muted border border-subtle';
}

interface TalentSpotlightCardProps {
  person: PersonStatItem;
  rank: number;
  maxCount: number;
  unitSingular: string;
  unitPlural: string;
}

const TalentSpotlightCard: React.FC<TalentSpotlightCardProps> = ({
  person,
  rank,
  maxCount,
  unitSingular,
  unitPlural,
}) => {
  const [imgError, setImgError] = useState(false);
  const widthPct = Math.round((person.count / Math.max(1, maxCount)) * 100);
  const showPhoto = Boolean(person.profileUrl) && !imgError;
  const titles = person.titles ?? [];
  const extraTitlesCount = Math.max(0, person.count - titles.length);

  return (
    <Link
      to={`/?q=${encodeURIComponent(person.name)}`}
      className="group relative flex gap-3.5 rounded-[--radius-card] border border-subtle bg-surface-sunken/40 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-400 hover:bg-surface-sunken/80 hover:shadow-[--shadow-card]"
    >
      {/* Portrait Photo / Monogram Fallback */}
      <div className="relative h-24 w-16 sm:h-28 sm:w-20 flex-shrink-0 overflow-hidden rounded-[--radius-control] bg-gradient-to-br from-primary-600/20 via-primary-500/10 to-purple-600/20 border border-subtle">
        {showPhoto ? (
          <img
            src={person.profileUrl!}
            alt={person.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center select-none text-primary-700 dark:text-primary-300"
            aria-hidden="true"
          >
            <span className="text-lg sm:text-xl font-bold tracking-tight">
              {getInitials(person.name)}
            </span>
          </div>
        )}
        <span
          className={`absolute top-1.5 left-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none ${getRankBadgeClass(
            rank
          )}`}
        >
          #{rank}
        </span>
      </div>

      {/* Details & Owned Titles Preview */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h4 className="truncate text-sm sm:text-base font-semibold text-content group-hover:text-primary-600 dark:group-hover:text-primary-400">
              {person.name}
            </h4>
            <span className="flex-shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
              {formatCount(person.count)} {person.count === 1 ? unitSingular : unitPlural}
            </span>
          </div>

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              style={{ width: `${Math.max(widthPct, 6)}%` }}
              className="h-full rounded-full bg-primary-500 dark:bg-primary-400 transition-all duration-300"
            />
          </div>
        </div>

        {/* Owned Titles Preview Strip */}
        {titles.length > 0 ? (
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex -space-x-1.5 overflow-hidden flex-shrink-0" aria-hidden="true">
              {titles.slice(0, 3).map((t) =>
                t.coverArtUrl ? (
                  <img
                    key={t.id}
                    src={t.coverArtUrl}
                    alt=""
                    loading="lazy"
                    className="h-7 w-5 rounded-[3px] object-cover ring-1 ring-surface"
                  />
                ) : null
              )}
            </div>
            <p className="truncate text-xs text-content-muted">
              {titles.map((t) => t.title).join(', ')}
              {extraTitlesCount > 0 ? ` +${extraTitlesCount} more` : ''}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-content-muted group-hover:text-primary-600 dark:group-hover:text-primary-400">
            Filter collection →
          </p>
        )}
      </div>
    </Link>
  );
};

const StatisticsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { isReadOnly } = useServerMode();
  const canEdit = isAuthenticated && !isReadOnly;
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab') as StatisticsTab | null;
  const initialTab: StatisticsTab =
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'collection';
  const [activeTab, setActiveTab] = useState<StatisticsTab>(initialTab);

  const [data, setData] = useState<CollectionDashboardStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formatBasis, setFormatBasis] = useState<'titles' | 'items'>('titles');
  const [timelineBasis, setTimelineBasis] = useState<'added' | 'purchased'>('added');

  useEffect(() => {
    const currentParam = searchParams.get('tab') as StatisticsTab | null;
    if (currentParam && VALID_TABS.includes(currentParam) && currentParam !== activeTab) {
      setActiveTab(currentParam);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (nextTab: StatisticsTab) => {
    setActiveTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === 'collection') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', nextTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const stats = await apiService.getDashboardStatistics();
      setData(stats);
      if (stats.acquisitions.itemsWithPurchaseDate > 0) {
        setTimelineBasis('purchased');
      }
    } catch (err) {
      console.error('Failed to load dashboard statistics:', err);
      setError('Could not load collection statistics. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 sm:py-8" aria-busy="true">
        <div className="mb-6">
          <Skeleton className="h-8 w-56 rounded-[--radius-control] mb-2" />
          <Skeleton className="h-4 w-80 rounded-[--radius-control]" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-[--radius-card]" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-[--radius-card]" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <EmptyState
          title="Couldn’t load statistics"
          description={error || 'Statistics are currently unavailable.'}
          action={
            <Button onClick={loadDashboard} variant="secondary">
              Try again
            </Button>
          }
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M12 4a8 8 0 100 16 8 8 0 000-16z"
              />
            </svg>
          }
        />
      </div>
    );
  }

  const { overview, formats, editions = [], content, physicalLibrary, acquisitions } = data;

  if (overview.totalPhysicalItems === 0) {
    return (
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-content sm:text-3xl">Collection Statistics</h1>
          <p className="mt-1 text-sm text-content-muted">
            Insights and breakdowns across your physical media library
          </p>
        </header>
        <EmptyState
          title="No collection statistics yet"
          description="Add movies or TV seasons to your collection to unlock format, genre, talent, and shelf analytics."
          action={
            canEdit ? (
              <Button asChild>
                <Link to="/admin">Add your first item</Link>
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link to="/">Back to Collection</Link>
              </Button>
            )
          }
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          }
        />
      </div>
    );
  }

  const maxDecadeCount = Math.max(1, ...content.decades.map((d) => d.titleCount));
  const maxGenreCount = Math.max(1, ...content.genres.map((g) => g.titleCount));
  const maxEditionCount = Math.max(1, ...editions.map((e) => e.itemCount));
  const maxDirectorCount = Math.max(1, ...content.topDirectors.map((d) => d.count));
  const maxCastCount = Math.max(1, ...content.topCast.map((c) => c.count));
  const maxSeriesCount = Math.max(1, ...content.topSeries.map((s) => s.ownedCount));

  const timelinePoints = acquisitions.byYear;
  const maxTimelineVal = Math.max(
    1,
    ...timelinePoints.map((pt) =>
      timelineBasis === 'purchased' ? pt.purchasedCount : pt.addedCount
    )
  );
  const maxStoreCount = Math.max(1, ...acquisitions.topStores.map((s) => s.count));

  const linearSpace = formatLinearSpace(physicalLibrary.totalLinearMm);

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Page Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content sm:text-3xl">Collection Statistics</h1>
          <p className="mt-1 text-sm text-content-muted">
            Select any format, decade, genre, director, or cast member to filter your collection.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/">Browse Collection</Link>
        </Button>
      </header>

      {/* Pinned KPI Summary Cards */}
      <div
        aria-label="Collection summary metrics"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <Link
          to="/"
          className="flex flex-col items-center justify-center rounded-[--radius-card] bg-primary-50 p-4 text-center border border-transparent hover:border-primary-400 transition-colors dark:bg-primary-900/20"
        >
          <span className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-400">
            {formatCount(overview.totalPhysicalItems)}
          </span>
          <span className="mt-1 text-sm font-medium text-primary-700 dark:text-primary-300">
            Physical Items
          </span>
        </Link>

        <Link
          to="/?type=movie"
          className="flex flex-col items-center justify-center rounded-[--radius-card] bg-primary-50 p-4 text-center border border-transparent hover:border-primary-400 transition-colors dark:bg-primary-900/20"
        >
          <span className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-400">
            {formatCount(overview.totalMovies)}
          </span>
          <span className="mt-1 text-sm font-medium text-primary-700 dark:text-primary-300">
            Movies
          </span>
        </Link>

        <Link
          to="/?type=tv_season"
          className="flex flex-col items-center justify-center rounded-[--radius-card] bg-purple-50 p-4 text-center border border-transparent hover:border-purple-400 transition-colors dark:bg-purple-900/20"
        >
          <span className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">
            {formatCount(overview.totalTVSeasons)}
          </span>
          <span className="mt-1 text-sm font-medium text-purple-700 dark:text-purple-300">
            TV Seasons
          </span>
          {overview.totalTVShows > 0 && (
            <span className="mt-0.5 text-xs text-purple-600/80 dark:text-purple-300/80">
              {formatCount(overview.totalTVShows)} show{overview.totalTVShows === 1 ? '' : 's'}
              {overview.totalEpisodes > 0 ? ` · ${formatCount(overview.totalEpisodes)} eps` : ''}
            </span>
          )}
        </Link>

        <div className="flex flex-col items-center justify-center rounded-[--radius-card] bg-surface-raised border border-subtle p-4 text-center shadow-[--shadow-card]">
          <span className="text-2xl sm:text-3xl font-bold text-content">
            {formatCount(overview.multiTitleItemsCount)}
          </span>
          <span className="mt-1 text-sm font-medium text-content-muted">
            Multi-Title Sets
          </span>
        </div>

        <div className="flex flex-col items-center justify-center rounded-[--radius-card] bg-surface-raised border border-subtle p-4 text-center shadow-[--shadow-card] col-span-2 sm:col-span-1">
          <span className="text-2xl sm:text-3xl font-bold text-content">
            {formatCount(overview.totalSeries)}
          </span>
          <span className="mt-1 text-sm font-medium text-content-muted">
            Active Series
          </span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-subtle pb-3 overflow-x-auto">
        <SegmentedControl
          name="Statistics category tabs"
          value={activeTab}
          onChange={(val) => handleTabChange(val as StatisticsTab)}
          className="w-full sm:w-auto"
          options={[
            { value: 'collection', label: 'Collection Statistics' },
            { value: 'content', label: 'Content Insights' },
            { value: 'physical', label: 'Physical Statistics' },
          ]}
        />
      </div>

      {/* =========================================================
          TAB 1: COLLECTION STATISTICS (Formats, Editions, Acquisitions)
      ========================================================= */}
      {activeTab === 'collection' && (
        <div className="space-y-6 animate-in" role="region" aria-label="Collection Statistics">
          {/* Format Breakdown Card */}
          <div className="card space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-content">Format Distribution</h2>
                <p className="text-xs text-content-muted">
                  Click any format to filter the collection
                </p>
              </div>
              <SegmentedControl
                name="Format counting basis"
                value={formatBasis}
                onChange={(val) => setFormatBasis(val as 'titles' | 'items')}
                options={[
                  { value: 'titles', label: 'By Titles' },
                  { value: 'items', label: 'By Physical Items' },
                ]}
              />
            </div>

            {formats.length === 0 ? (
              <p className="text-sm text-content-muted">No format data available.</p>
            ) : (
              <>
                {/* Stacked Proportional Share Bar */}
                <div
                  className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
                  aria-label="Format share distribution"
                >
                  {formats.map((f) => {
                    const pct = formatBasis === 'titles' ? f.titlePercentage : f.itemPercentage;
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={f.format}
                        style={{ width: `${Math.max(pct, 1.5)}%` }}
                        title={`${f.format}: ${pct}%`}
                        className={`${formatBarColors[f.format] ?? 'bg-primary-500'} transition-all duration-300`}
                      />
                    );
                  })}
                </div>

                {/* Format Tile Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {formats.map((f) => {
                    const count = formatBasis === 'titles' ? f.titleCount : f.itemCount;
                    const pct = formatBasis === 'titles' ? f.titlePercentage : f.itemPercentage;
                    const label = isPhysicalFormat(f.format)
                      ? formatLabels[f.format as PhysicalFormat]
                      : f.format;

                    return (
                      <Link
                        key={f.format}
                        to={`/?format=${encodeURIComponent(f.format)}`}
                        className={`group flex flex-col items-center rounded-[--radius-card] p-4 text-center transition-transform hover:-translate-y-0.5 ${
                          formatBadgeClasses[f.format] ??
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}
                      >
                        <span className="text-2xl font-bold">{formatCount(count)}</span>
                        <span className="mt-1 text-sm font-medium group-hover:underline">
                          {label}
                        </span>
                        <span className="mt-0.5 text-xs opacity-75">{pct}%</span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Edition Tags Breakdown Card */}
          <div className="card space-y-5">
            <div>
              <h2 className="text-base font-semibold text-content">Edition Tags Breakdown</h2>
              <p className="text-xs text-content-muted">
                {overview.itemsWithEditionTags
                  ? `Tagged across ${formatCount(overview.itemsWithEditionTags)} physical ${
                      overview.itemsWithEditionTags === 1 ? 'item' : 'items'
                    } — click any tag to filter`
                  : 'Click any edition tag to filter the collection'}
              </p>
            </div>

            {editions.length === 0 ? (
              <p className="text-sm text-content-muted">
                No edition tags recorded yet. Add tags like Steelbook, Criterion, or Collector&apos;s
                Edition when editing items.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 md:grid-cols-2">
                  {editions.slice(0, 12).map((ed) => {
                    const widthPct = Math.round((ed.itemCount / maxEditionCount) * 100);
                    return (
                      <Link
                        key={ed.tag}
                        to={`/?edition=${encodeURIComponent(ed.tag)}`}
                        className="group block rounded-[--radius-control] p-1.5 -mx-1.5 hover:bg-surface-sunken transition-colors"
                      >
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="inline-flex items-center gap-1.5 font-medium text-content group-hover:text-primary-600 dark:group-hover:text-primary-400">
                            <span className="h-2 w-2 rounded-full bg-primary-500" aria-hidden="true" />
                            {ed.tag}
                          </span>
                          <span className="text-xs text-content-muted">
                            {formatCount(ed.itemCount)} ({ed.itemPercentage}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                          <div
                            style={{ width: `${Math.max(widthPct, 2)}%` }}
                            className="h-full rounded-full bg-primary-600 dark:bg-primary-500 transition-all duration-300"
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {editions.length > 12 && (
                  <div className="border-t border-subtle pt-3">
                    <p className="mb-2 text-xs font-medium text-content-muted">More edition tags</p>
                    <div className="flex flex-wrap gap-2">
                      {editions.slice(12).map((ed) => (
                        <Link
                          key={ed.tag}
                          to={`/?edition=${encodeURIComponent(ed.tag)}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-sunken px-3 py-1 text-xs font-medium text-content hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        >
                          <span>{ed.tag}</span>
                          <span className="text-content-muted">{formatCount(ed.itemCount)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Acquisition & Growth Timeline */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="card space-y-4 lg:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-content">Collection Growth by Year</h2>
                  <p className="text-xs text-content-muted">
                    {timelineBasis === 'purchased'
                      ? `Based on ${formatCount(acquisitions.itemsWithPurchaseDate)} items with a recorded purchase date`
                      : 'Based on when items were cataloged in Cinefile'}
                  </p>
                </div>
                <SegmentedControl
                  name="Timeline date source"
                  value={timelineBasis}
                  onChange={(val) => setTimelineBasis(val as 'added' | 'purchased')}
                  options={[
                    { value: 'added', label: 'By Date Added' },
                    {
                      value: 'purchased',
                      label: 'By Purchase Date',
                      disabled: acquisitions.itemsWithPurchaseDate === 0,
                    },
                  ]}
                />
              </div>

              {timelinePoints.length === 0 ? (
                <p className="text-sm text-content-muted">No timeline data available yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {timelinePoints
                    .filter((pt) =>
                      timelineBasis === 'purchased' ? pt.purchasedCount > 0 : pt.addedCount > 0
                    )
                    .map((pt) => {
                      const count =
                        timelineBasis === 'purchased' ? pt.purchasedCount : pt.addedCount;
                      const widthPct = Math.round((count / maxTimelineVal) * 100);
                      return (
                        <div key={pt.period} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-content">{pt.period}</span>
                            <span className="text-xs text-content-muted">
                              {formatCount(count)} {count === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                            <div
                              style={{ width: `${Math.max(widthPct, 2)}%` }}
                              className="h-full rounded-full bg-primary-600 dark:bg-primary-500 transition-all duration-300"
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Top Retailers / Store Links */}
            <div className="card space-y-4">
              <div>
                <h2 className="text-base font-semibold text-content">Top Retailers &amp; Sources</h2>
                <p className="text-xs text-content-muted">
                  Aggregated from item store links
                </p>
              </div>

              {acquisitions.topStores.length === 0 ? (
                <p className="text-sm text-content-muted">
                  No store links recorded on collection items yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {acquisitions.topStores.map((store) => {
                    const widthPct = Math.round((store.count / maxStoreCount) * 100);
                    return (
                      <div key={store.store} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-content truncate pr-2">
                            {store.store}
                          </span>
                          <span className="text-xs text-content-muted">
                            {formatCount(store.count)} {store.count === 1 ? 'item' : 'items'}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                          <div
                            style={{ width: `${Math.max(widthPct, 4)}%` }}
                            className="h-full rounded-full bg-primary-500 dark:bg-primary-400"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 2: CONTENT INSIGHTS (Directors, Cast, Decades, Genres, Franchises)
      ========================================================= */}
      {activeTab === 'content' && (
        <div className="space-y-6 animate-in" role="region" aria-label="Content Insights">
          {/* Most-Collected Directors (First-Class Spotlight Grid) */}
          <div className="card space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-content">Most-Collected Directors</h2>
                <p className="text-xs text-content-muted">
                  Filmmakers with the most titles in your library — select any card to browse their films
                </p>
              </div>
            </div>

            {content.topDirectors.length === 0 ? (
              <p className="text-sm text-content-muted">No director credits recorded yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {content.topDirectors.map((dir, index) => (
                  <TalentSpotlightCard
                    key={dir.name}
                    person={dir}
                    rank={index + 1}
                    maxCount={maxDirectorCount}
                    unitSingular="film"
                    unitPlural="films"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Most-Featured Cast (First-Class Spotlight Grid) */}
          <div className="card space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-content">Most-Featured Cast</h2>
                <p className="text-xs text-content-muted">
                  Actors appearing in the most owned titles — select any card to browse their appearances
                </p>
              </div>
            </div>

            {content.topCast.length === 0 ? (
              <p className="text-sm text-content-muted">No cast credits recorded yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {content.topCast.map((actor, index) => (
                  <TalentSpotlightCard
                    key={actor.name}
                    person={actor}
                    rank={index + 1}
                    maxCount={maxCastCount}
                    unitSingular="title"
                    unitPlural="titles"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Decades & Genres */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Decades Breakdown */}
            <div className="card flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-content">Titles by Decade</h2>
                  <p className="text-xs text-content-muted">
                    Release era distribution across movies and TV seasons
                  </p>
                </div>

                {content.decades.length === 0 ? (
                  <p className="text-sm text-content-muted">No release dates recorded yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {content.decades.map((d) => {
                      const widthPct = Math.round((d.titleCount / maxDecadeCount) * 100);
                      return (
                        <Link
                          key={d.decade}
                          to={`/?decade=${encodeURIComponent(d.decade)}`}
                          className="group block rounded-[--radius-control] p-1.5 -mx-1.5 hover:bg-surface-sunken transition-colors"
                        >
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="font-medium text-content group-hover:text-primary-600 dark:group-hover:text-primary-400">
                              {d.decade}s
                            </span>
                            <span className="text-xs text-content-muted">
                              {formatCount(d.titleCount)}{' '}
                              {d.titleCount === 1 ? 'title' : 'titles'}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                            <div
                              style={{ width: `${Math.max(widthPct, 2)}%` }}
                              className="h-full rounded-full bg-primary-600 dark:bg-primary-500 transition-all duration-300"
                            />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {(content.oldestRelease || content.newestRelease) && (
                <div className="grid grid-cols-1 gap-3 border-t border-subtle pt-4 sm:grid-cols-2">
                  {content.oldestRelease && (
                    <div className="rounded-[--radius-control] bg-surface-sunken p-3">
                      <span className="block text-xs font-medium uppercase tracking-wide text-content-muted">
                        Oldest Release
                      </span>
                      <span className="mt-1 block truncate text-sm font-semibold text-content">
                        {content.oldestRelease.title}
                      </span>
                      <span className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                        {content.oldestRelease.year}
                      </span>
                    </div>
                  )}
                  {content.newestRelease && (
                    <div className="rounded-[--radius-control] bg-surface-sunken p-3">
                      <span className="block text-xs font-medium uppercase tracking-wide text-content-muted">
                        Newest Release
                      </span>
                      <span className="mt-1 block truncate text-sm font-semibold text-content">
                        {content.newestRelease.title}
                      </span>
                      <span className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                        {content.newestRelease.year}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Top Genres */}
            <div className="card space-y-4">
              <div>
                <h2 className="text-base font-semibold text-content">Top Genres</h2>
                <p className="text-xs text-content-muted">
                  Most represented genres in your collection
                </p>
              </div>

              {content.genres.length === 0 ? (
                <p className="text-sm text-content-muted">No genre metadata recorded yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {content.genres.slice(0, 10).map((g) => {
                    const widthPct = Math.round((g.titleCount / maxGenreCount) * 100);
                    return (
                      <Link
                        key={g.id}
                        to={`/?genre=${g.id}`}
                        className="group block rounded-[--radius-control] p-1.5 -mx-1.5 hover:bg-surface-sunken transition-colors"
                      >
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-content group-hover:text-primary-600 dark:group-hover:text-primary-400">
                            {g.name}
                          </span>
                          <span className="text-xs text-content-muted">
                            {formatCount(g.titleCount)} ({g.percentage}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                          <div
                            style={{ width: `${Math.max(widthPct, 2)}%` }}
                            className="h-full rounded-full bg-primary-600 dark:bg-primary-500 transition-all duration-300"
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Largest Series / Franchises */}
          {content.topSeries.length > 0 && (
            <div className="card space-y-4">
              <div>
                <h2 className="text-base font-semibold text-content">
                  Largest Series &amp; Franchises
                </h2>
                <p className="text-xs text-content-muted">
                  Franchises ranked by number of owned installments
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {content.topSeries.map((s) => {
                  const widthPct = Math.round((s.ownedCount / maxSeriesCount) * 100);
                  return (
                    <Link
                      key={s.id}
                      to={`/?q=${encodeURIComponent(s.name)}`}
                      className="group rounded-[--radius-control] border border-subtle bg-surface-sunken/60 p-3 hover:border-primary-400 transition-colors"
                    >
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="font-medium text-content group-hover:text-primary-600 dark:group-hover:text-primary-400 truncate pr-2">
                          {s.name}
                        </span>
                        <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 whitespace-nowrap">
                          {formatCount(s.ownedCount)} {s.ownedCount === 1 ? 'entry' : 'entries'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                        <div
                          style={{ width: `${Math.max(widthPct, 6)}%` }}
                          className="h-full rounded-full bg-primary-600 dark:bg-primary-500"
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          TAB 3: PHYSICAL STATISTICS (Shelf Space & Utilization)
      ========================================================= */}
      {activeTab === 'physical' && (
        <div className="space-y-6 animate-in" role="region" aria-label="Physical Statistics">
          <div className="card space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-semibold text-content">
                    Shelf Space &amp; Utilization
                  </h2>
                  <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                    {physicalLibrary.utilizationPercent}% full
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-content-muted">
                  Capacity across {formatCount(physicalLibrary.totalShelves)}{' '}
                  {physicalLibrary.totalShelves === 1 ? 'shelf' : 'shelves'} in{' '}
                  {formatCount(physicalLibrary.totalGroups)}{' '}
                  {physicalLibrary.totalGroups === 1 ? 'group' : 'groups'}
                </p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link to="/library">Open Shelf View →</Link>
              </Button>
            </div>

            {/* Physical Footprint KPI Tiles */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
              <div className="rounded-[--radius-control] bg-surface-sunken p-4">
                <span className="block text-xl font-bold text-content">
                  {formatCount(physicalLibrary.placedItemsCount)}
                </span>
                <span className="text-xs text-content-muted">Placed on Shelves</span>
              </div>
              <div className="rounded-[--radius-control] bg-surface-sunken p-4">
                <span className="block text-xl font-bold text-content">
                  {formatCount(physicalLibrary.unassignedItemsCount)}
                </span>
                <span className="text-xs text-content-muted">Unassigned Items</span>
              </div>
              <div className="rounded-[--radius-control] bg-surface-sunken p-4">
                <span className="block text-xl font-bold text-content">{linearSpace.metric}</span>
                <span className="block text-xs text-content-muted">
                  Linear Width ({linearSpace.imperial})
                </span>
              </div>
              <div className="rounded-[--radius-control] bg-surface-sunken p-4">
                <span className="block text-xl font-bold text-content">
                  {formatCount(physicalLibrary.usedUnits)} /{' '}
                  {formatCount(physicalLibrary.totalCapacityUnits)}
                </span>
                <span className="block text-xs text-content-muted">Shelf Units Used</span>
              </div>
            </div>

            {physicalLibrary.shelves.length === 0 ? (
              <p className="text-sm text-content-muted">
                No shelves configured yet. Visit the{' '}
                <Link to="/library" className="text-primary-600 dark:text-primary-400 underline">
                  Shelf View
                </Link>{' '}
                to set up shelves.
              </p>
            ) : (
              <div className="space-y-3 border-t border-subtle pt-5">
                <h3 className="text-sm font-semibold text-content">Per-Shelf Capacity Breakdown</h3>
                <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
                  {physicalLibrary.shelves.map((shelf) => {
                    const pct = Math.min(100, shelf.utilizationPercent);
                    const isOverCapacity = shelf.usedUnits > shelf.capacityUnits;
                    return (
                      <div key={shelf.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-content truncate pr-2">
                            <span className="text-content-muted">{shelf.groupName} / </span>
                            {shelf.displayName}
                          </span>
                          <span className="text-content-muted whitespace-nowrap">
                            {shelf.usedUnits} / {shelf.capacityUnits} units ({shelf.utilizationPercent}
                            %)
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                          <div
                            style={{ width: `${pct}%` }}
                            className={`h-full rounded-full transition-all duration-300 ${
                              isOverCapacity
                                ? 'bg-red-500'
                                : pct >= 85
                                ? 'bg-amber-500'
                                : 'bg-primary-600 dark:bg-primary-500'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StatisticsPage;
