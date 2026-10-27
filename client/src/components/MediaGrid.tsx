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
  isLoadingMore?: boolean;
  sortBy?: SortField;
}

const TARGET_CARD_MIN_WIDTH = 185;
const GRID_GAP_PX = 16;
const MAX_STAGGER_STEPS = 12;

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
  isLoadingMore = false,
  sortBy,
}) => {
  const items = physicalItems;
  const gridRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const staggerMapRef = useRef<Map<number, number>>(new Map());

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
  const effectiveSkeletonCount = skeletonCount > 0 ? skeletonCount : isLoadingMore ? columns : 0;
  const showSkeletons = effectiveSkeletonCount > 0;

  // Assign a batch-local stagger index to newly added items while preserving existing items' indices
  const currentIds = new Set(items.map((item) => item.id));
  for (const id of staggerMapRef.current.keys()) {
    if (!currentIds.has(id)) {
      staggerMapRef.current.delete(id);
    }
  }
  let newBatchCounter = 0;
  for (const item of items) {
    if (!staggerMapRef.current.has(item.id)) {
      staggerMapRef.current.set(item.id, Math.min(newBatchCounter, MAX_STAGGER_STEPS - 1));
      newBatchCounter += 1;
    }
  }

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
          {row.items.map(({ item }) => {
            const staggerIndex = staggerMapRef.current.get(item.id) ?? 0;
            return (
              <div
                key={item.id}
                role="listitem"
                style={{ '--stagger-index': staggerIndex } as React.CSSProperties}
                className="h-full media-card-batch-enter"
              >
                <MediaCard
                  physicalItem={item}
                  onClick={() => onItemClick(item)}
                  isEditMode={isEditMode}
                  isAuthenticated={isAuthenticated}
                  onEdit={onEditItem}
                  onArchive={onArchiveItem}
                />
              </div>
            );
          })}
        </React.Fragment>
      ))}
      {showSkeletons &&
        Array.from({ length: effectiveSkeletonCount }).map((_, i) => (
          <div
            key={`skeleton-${i}`}
            role="listitem"
            aria-hidden="true"
            data-testid="media-grid-skeleton"
            className="card flex h-full flex-col overflow-hidden p-0"
          >
            <Skeleton className="aspect-[2/3] w-full rounded-none" />
            <div className="flex h-[5.25rem] shrink-0 flex-col justify-between border-t border-subtle/60 p-3 sm:h-[5.75rem] sm:p-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4 rounded-[--radius-control]" />
                <Skeleton className="h-3.5 w-1/2 rounded-[--radius-control]" />
              </div>
              <Skeleton className="h-3 w-1/3 rounded-[--radius-control]" />
            </div>
          </div>
        ))}
    </div>
  );
};

export default MediaGrid;
