import React, { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { PhysicalItem, SortField } from '../types';
import MediaCard from './MediaCard';
import { Skeleton } from './ui/Skeleton';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { computeGridRowsWithSeries } from '../lib/series';

interface MediaGridProps {
  physicalItems: PhysicalItem[];
  onItemClick: (item: PhysicalItem) => void;
  isEditMode?: boolean;
  isAuthenticated?: boolean;
  onEditItem?: (item: PhysicalItem) => void;
  onArchiveItem?: (itemId: number, archived: boolean, archiveReason: string | null) => Promise<void> | void;
  skeletonCount?: number;
  sortBy?: SortField;
}

const TARGET_CARD_MIN_WIDTH = 185;
const GRID_GAP_PX = 16;

function computeColumnsFromWidth(width: number, fallbackCols: number): number {
  if (!width || width <= 0) return fallbackCols;
  if (width < 520) return 2;
  return Math.max(2, Math.floor((width + GRID_GAP_PX) / (TARGET_CARD_MIN_WIDTH + GRID_GAP_PX)));
}

const MediaGrid: React.FC<MediaGridProps> = ({
  physicalItems,
  onItemClick,
  isEditMode = false,
  isAuthenticated = false,
  onEditItem,
  onArchiveItem,
  skeletonCount = 0,
  sortBy,
}) => {
  const items = physicalItems;
  const showSkeletons = skeletonCount > 0;
  const gridRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const isXl = useMediaQuery('(min-width: 1280px)');
  const isLg = useMediaQuery('(min-width: 1024px)');
  const isMd = useMediaQuery('(min-width: 768px)');
  const isSm = useMediaQuery('(min-width: 640px)');
  const fallbackColumns = isXl ? 6 : isLg ? 5 : isMd ? 4 : isSm ? 3 : 2;

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const updateWidth = () => {
      const nextWidth = el.clientWidth;
      if (nextWidth > 0) {
        setContainerWidth((prev) => (prev === nextWidth ? prev : nextWidth));
      }
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateWidth();
      });
      observer.observe(el);
      return () => observer.disconnect();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, []);

  const columns = computeColumnsFromWidth(containerWidth, fallbackColumns);
  const gridTemplateStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }),
    [columns]
  );

  const rows = useMemo(
    () =>
      computeGridRowsWithSeries(items, columns, {
        showSingleItemSeries: sortBy === 'series_sort',
      }),
    [items, columns, sortBy]
  );

  return (
    <div
      ref={gridRef}
      role="list"
      aria-busy={showSkeletons || undefined}
      style={gridTemplateStyle}
      className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-x-4 sm:gap-y-5"
    >
      {rows.map((row) => (
        <React.Fragment key={`row-${row.rowIndex}`}>
          {row.segments.length > 0 && (
            <div
              role="presentation"
              data-testid={`series-row-track-${row.rowIndex}`}
              style={gridTemplateStyle}
              className="col-span-full -mb-2.5 grid grid-cols-2 gap-x-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-x-4"
            >
              {row.segments.map((seg) => (
                <div
                  key={`seg-${row.rowIndex}-${seg.series.id}-${seg.startCol}`}
                  style={{ gridColumn: `${seg.startCol} / span ${seg.spanCols}` }}
                  data-testid={`series-group-bar-${seg.series.id}`}
                  title={`${seg.series.name} (${seg.totalInRun} ${seg.totalInRun === 1 ? 'item' : 'items'})`}
                  className={`flex h-7 items-center justify-between gap-2 border border-primary-500/35 border-b-2 border-b-primary-600/70 bg-primary-50/90 px-2.5 text-xs font-semibold text-primary-800 shadow-sm backdrop-blur-sm dark:border-primary-400/30 dark:border-b-primary-400/70 dark:bg-primary-950/60 dark:text-primary-200 ${
                    seg.continuesFromPrevRow ? 'rounded-tl-sm border-l-dashed' : 'rounded-tl-[--radius-control]'
                  } ${
                    seg.continuesToNextRow ? 'rounded-tr-sm border-r-dashed' : 'rounded-tr-[--radius-control]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {seg.continuesFromPrevRow && (
                      <span
                        className="shrink-0 text-[11px] font-normal text-primary-600/80 dark:text-primary-300/80"
                        aria-hidden="true"
                      >
                        &larr;
                      </span>
                    )}
                    <svg
                      className="h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                    <span className="truncate tracking-tight">{seg.series.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="rounded-full bg-primary-600/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-700 dark:bg-primary-400/20 dark:text-primary-200">
                      {seg.totalInRun}
                    </span>
                    {seg.continuesToNextRow && (
                      <span
                        className="text-[11px] font-normal text-primary-600/80 dark:text-primary-300/80"
                        aria-hidden="true"
                      >
                        &rarr;
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {row.items.map(({ item }) => (
            <div key={item.id} role="listitem" className="h-full">
              <MediaCard
                physicalItem={item}
                onClick={() => onItemClick(item)}
                isEditMode={isEditMode}
                isAuthenticated={isAuthenticated}
                onEdit={onEditItem}
                onArchive={onArchiveItem}
              />
            </div>
          ))}
        </React.Fragment>
      ))}
      {showSkeletons &&
        Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={`skeleton-${i}`} role="listitem" aria-hidden="true">
            <Skeleton className="aspect-[2/3] w-full rounded-[--radius-card]" />
            <Skeleton className="mt-2 h-4 w-3/4 rounded-[--radius-control]" />
            <Skeleton className="mt-1.5 h-3 w-1/2 rounded-[--radius-control]" />
          </div>
        ))}
    </div>
  );
};

export default MediaGrid;
