import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { PhysicalItem } from '../types';
import { useDisplayPreferences } from '../context/DisplayPreferencesContext';
import { useConfirm } from '../context/ConfirmContext';
import { IconButton } from './ui/IconButton';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';
import { formatBadgeClasses } from '../lib/formats';
import { getItemSeriesList } from '../lib/series';
import { parseEditionTags } from '../lib/editionTags';

interface MediaCardProps {
  physicalItem: PhysicalItem;
  onClick?: () => void;
  isEditMode?: boolean;
  isAuthenticated?: boolean;
  onEdit?: (item: PhysicalItem) => void;
  onArchive?: (itemId: number, archived: boolean, archiveReason: string | null) => Promise<void> | void;
}

const MediaCard: React.FC<MediaCardProps> = ({
  physicalItem,
  onClick,
  isEditMode = false,
  isAuthenticated = false,
  onEdit,
  onArchive,
}) => {
  const { showFormatBadges } = useDisplayPreferences();
  const confirm = useConfirm();
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUnclamped, setIsUnclamped] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const seriesRowRef = useRef<HTMLParagraphElement>(null);
  const seriesSpanRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const metaRef = useRef<HTMLParagraphElement>(null);
  const lastMeasuredHeightsRef = useRef<{
    drawer: number;
    series: number;
    title: number;
    meta: number;
  } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const primaryMedia = physicalItem.media[0];
  const imageUrl = physicalItem.custom_image_url || primaryMedia?.cover_art_url;

  useEffect(() => {
    setImageFailed(false);
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setImageLoaded(true);
    } else {
      setImageLoaded(false);
    }
  }, [imageUrl]);

  const getFormatColor = (format: string) =>
    formatBadgeClasses[format] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';

  const itemSeries = getItemSeriesList(physicalItem);
  const seriesText = itemSeries.map((s) => s.name).join(', ');

  const metadataParts: string[] = [];
  if (primaryMedia?.release_date) {
    metadataParts.push(String(new Date(primaryMedia.release_date).getFullYear()));
  }
  if (primaryMedia?.media_type === 'tv_season' && primaryMedia.tv_show_name) {
    metadataParts.push(
      `${primaryMedia.tv_show_name}${primaryMedia.season_number != null ? ` - Season ${primaryMedia.season_number}` : ''}`
    );
  }
  if (physicalItem.edition_notes) {
    metadataParts.push(physicalItem.edition_notes);
  }
  // Unique version/cut tags across linked media (e.g., "Extended, Theatrical")
  const versionTags = Array.from(
    new Set(physicalItem.media.flatMap((m) => parseEditionTags(m.version_notes)))
  );
  if (versionTags.length > 0) {
    metadataParts.push(versionTags.join(', '));
  }
  if (physicalItem.archived && physicalItem.archive_reason) {
    metadataParts.push(`Archived: ${physicalItem.archive_reason}`);
  }
  const metadataText = metadataParts.join(' · ');

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(physicalItem);
  };

  const handleArchiveClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (physicalItem.archived) {
      const confirmed = await confirm({
        title: 'Unarchive item?',
        message: `Move "${physicalItem.name}" back to your active collection?`,
        confirmLabel: 'Unarchive',
        cancelLabel: 'Cancel',
      });
      if (confirmed) {
        await onArchive?.(physicalItem.id, false, null);
      }
      return;
    }
    setArchiveReason(physicalItem.archive_reason || '');
    setShowArchiveModal(true);
  };

  const handleArchiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = archiveReason.trim();
    if (!trimmed) return;
    setIsArchiving(true);
    try {
      await onArchive?.(physicalItem.id, true, trimmed);
      setShowArchiveModal(false);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  const hasTextOverflow = useCallback(() => {
    const checkEl = (el: HTMLElement | null) =>
      Boolean(el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1));

    return checkEl(seriesSpanRef.current) || checkEl(titleRef.current) || checkEl(metaRef.current);
  }, []);

  const clearInlineHeights = useCallback(() => {
    if (drawerRef.current) drawerRef.current.style.height = '';
    if (seriesRowRef.current) seriesRowRef.current.style.height = '';
    if (titleRef.current) titleRef.current.style.height = '';
    if (metaRef.current) metaRef.current.style.height = '';
    lastMeasuredHeightsRef.current = null;
  }, []);

  const expandCardInfo = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (!isUnclamped && !hasTextOverflow()) {
      return;
    }
    const drawer = drawerRef.current;
    const slot = slotRef.current;
    if (drawer && slot) {
      lastMeasuredHeightsRef.current = {
        drawer: drawer.offsetHeight || slot.clientHeight,
        series: seriesRowRef.current?.offsetHeight || 16,
        title: titleRef.current?.offsetHeight || (seriesText ? 20 : 40),
        meta: metaRef.current?.offsetHeight || 16,
      };
    }
    setIsUnclamped(true);
    setIsExpanded(true);
  }, [hasTextOverflow, isUnclamped, seriesText]);

  const collapseCardInfo = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!isExpanded && !isUnclamped) return;
    setIsExpanded(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      clearInlineHeights();
      setIsUnclamped(false);
    }, 240);
  }, [clearInlineHeights, isExpanded, isUnclamped]);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      expandCardInfo();
    }, 70);
  }, [expandCardInfo]);

  const handleMouseLeave = useCallback(() => {
    collapseCardInfo();
  }, [collapseCardInfo]);

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      expandCardInfo();
    },
    [expandCardInfo]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      collapseCardInfo();
    },
    [collapseCardInfo]
  );

  useLayoutEffect(() => {
    const drawer = drawerRef.current;
    const slot = slotRef.current;
    if (!drawer || !slot) return;

    const baseHeight = slot.clientHeight;
    if (baseHeight === 0) return;

    const seriesEl = seriesRowRef.current;
    const titleEl = titleRef.current;
    const metaEl = metaRef.current;
    const restSeriesH = 16;
    const restTitleH = seriesText ? 20 : 40;
    const restMetaH = 16;

    if (isExpanded && isUnclamped) {
      const starts = lastMeasuredHeightsRef.current ?? {
        drawer: baseHeight,
        series: restSeriesH,
        title: restTitleH,
        meta: restMetaH,
      };

      if (seriesEl) seriesEl.style.height = 'auto';
      if (titleEl) titleEl.style.height = 'auto';
      if (metaEl) metaEl.style.height = 'auto';
      drawer.style.height = 'auto';

      const targetSeriesH = seriesEl ? Math.max(restSeriesH, seriesEl.scrollHeight) : restSeriesH;
      const targetTitleH = titleEl ? Math.max(restTitleH, titleEl.scrollHeight) : restTitleH;
      const targetMetaH = metaEl ? Math.max(restMetaH, metaEl.scrollHeight) : restMetaH;
      const targetDrawerH = Math.max(
        baseHeight,
        drawer.scrollHeight,
        baseHeight + (targetSeriesH - restSeriesH) + (targetTitleH - restTitleH) + (targetMetaH - restMetaH)
      );

      if (targetDrawerH <= baseHeight + 1) {
        clearInlineHeights();
        setIsExpanded(false);
        setIsUnclamped(false);
        return;
      }

      if (seriesEl) seriesEl.style.height = `${starts.series}px`;
      if (titleEl) titleEl.style.height = `${starts.title}px`;
      if (metaEl) metaEl.style.height = `${starts.meta}px`;
      drawer.style.height = `${starts.drawer}px`;

      void drawer.offsetHeight;

      if (seriesEl) seriesEl.style.height = `${targetSeriesH}px`;
      if (titleEl) titleEl.style.height = `${targetTitleH}px`;
      if (metaEl) metaEl.style.height = `${targetMetaH}px`;
      drawer.style.height = `${targetDrawerH}px`;
    } else if (!isExpanded && isUnclamped) {
      const curDrawerH = drawer.offsetHeight || baseHeight;
      const curSeriesH = seriesEl ? seriesEl.offsetHeight || restSeriesH : restSeriesH;
      const curTitleH = titleEl ? titleEl.offsetHeight || restTitleH : restTitleH;
      const curMetaH = metaEl ? metaEl.offsetHeight || restMetaH : restMetaH;

      if (seriesEl) seriesEl.style.height = `${curSeriesH}px`;
      if (titleEl) titleEl.style.height = `${curTitleH}px`;
      if (metaEl) metaEl.style.height = `${curMetaH}px`;
      drawer.style.height = `${curDrawerH}px`;

      void drawer.offsetHeight;

      if (seriesEl) seriesEl.style.height = `${restSeriesH}px`;
      if (titleEl) titleEl.style.height = `${restTitleH}px`;
      if (metaEl) metaEl.style.height = `${restMetaH}px`;
      drawer.style.height = `${baseHeight}px`;
    }
  }, [clearInlineHeights, isExpanded, isUnclamped, seriesText]);

  const handleDrawerTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== 'height') return;
    if (!isExpanded) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      clearInlineHeights();
      setIsUnclamped(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={onClick ? 0 : -1}
      aria-label={`Open details for ${physicalItem.name}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="card group relative flex h-full cursor-pointer flex-col overflow-hidden p-0 text-left transition-shadow duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {/* Cover Image */}
      <div
        className={`relative aspect-[2/3] overflow-hidden bg-surface-sunken ${
          imageUrl && !imageFailed && !imageLoaded ? 'skeleton-shimmer' : ''
        }`}
      >
        {imageUrl && !imageFailed ? (
          <img
            ref={imgRef}
            src={imageUrl}
            alt={physicalItem.name}
            width={300}
            height={450}
            decoding="async"
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageFailed(true)}
            className={`h-full w-full object-cover transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
              imageLoaded ? 'scale-100 opacity-100' : 'scale-[1.02] opacity-0'
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              className="h-16 w-16 text-content-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
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
          <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
            <IconButton
              size="sm"
              variant="secondary"
              aria-label={`Edit ${physicalItem.name}`}
              onClick={handleEditClick}
              className="bg-surface-raised/90 backdrop-blur-sm"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </IconButton>
            <IconButton
              size="sm"
              variant="secondary"
              aria-label={physicalItem.archived ? `Unarchive ${physicalItem.name}` : `Archive ${physicalItem.name}`}
              onClick={handleArchiveClick}
              className={
                physicalItem.archived
                  ? 'bg-amber-600/90 text-white hover:bg-amber-700 backdrop-blur-sm'
                  : 'bg-surface-raised/90 backdrop-blur-sm'
              }
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
            </IconButton>
          </div>
        )}

        {/* Format Badges */}
        {showFormatBadges && (
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {physicalItem.archived && (
              <span className="rounded bg-amber-600/95 px-2 py-1 text-xs font-semibold text-white shadow-sm">
                Archived
              </span>
            )}
            {physicalItem.physical_format.map((format, idx) => (
              <span key={idx} className={`${getFormatColor(format)} rounded px-2 py-1 text-xs font-medium shadow-sm`}>
                {format}
              </span>
            ))}
          </div>
        )}
        {!showFormatBadges && physicalItem.archived && (
          <div className="absolute left-2 top-2">
            <span className="rounded bg-amber-600/95 px-2 py-1 text-xs font-semibold text-white shadow-sm">
              Archived
            </span>
          </div>
        )}

        {/* Multi-item indicator - counts unique titles, not links (a movie
            linked twice for different versions still counts once) */}
        {(() => {
          const tvCount = new Set(
            physicalItem.media.filter((m) => m.media_type === 'tv_season').map((m) => m.id)
          ).size;
          const movieCount = new Set(
            physicalItem.media.filter((m) => m.media_type !== 'tv_season').map((m) => m.id)
          ).size;
          const uniqueTotal = tvCount + movieCount;
          if (uniqueTotal <= 1) return null;
          let label: string;
          if (tvCount > 0 && movieCount === 0) {
            label = `${tvCount} season${tvCount !== 1 ? 's' : ''}`;
          } else if (movieCount > 0 && tvCount === 0) {
            label = `${movieCount} movie${movieCount !== 1 ? 's' : ''}`;
          } else {
            label = `${uniqueTotal} items`;
          }
          return (
            <div className="absolute bottom-2 left-2">
              <span className="rounded bg-black/75 px-2 py-1 text-xs font-medium text-white">
                {label}
              </span>
            </div>
          );
        })()}

        {/* TV type badge */}
        {primaryMedia?.media_type === 'tv_season' && (
          <div className="absolute bottom-2 right-2">
            <span className="rounded bg-purple-600/90 px-1.5 py-0.5 text-xs font-medium text-white">TV</span>
          </div>
        )}
      </div>

      {/* Info (fixed outer height, smoothly animates upward only when text overflows) */}
      <div ref={slotRef} className="relative h-[5.25rem] shrink-0 sm:h-[5.75rem]">
        <div
          ref={drawerRef}
          onTransitionEnd={handleDrawerTransitionEnd}
          className={`absolute inset-x-0 bottom-0 flex flex-col justify-between overflow-hidden border-t border-subtle/60 bg-surface p-3 transition-[height,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-surface-raised sm:p-4 ${
            isExpanded
              ? 'z-10 shadow-[0_-10px_24px_-6px_rgb(0_0_0/0.22)] dark:shadow-[0_-12px_28px_-6px_rgb(0_0_0/0.55)]'
              : 'h-full'
          }`}
        >
          <div className="min-h-[2.5rem]">
            {seriesText ? (
              <>
                <p
                  ref={seriesRowRef}
                  title={seriesText}
                  data-testid="media-card-series"
                  className="flex h-4 items-start gap-1 overflow-hidden text-[11px] font-semibold uppercase tracking-wider leading-4 text-primary-600 transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] dark:text-primary-400"
                >
                  <svg
                    className="mt-0.5 h-3 w-3 shrink-0"
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
                  <span
                    ref={seriesSpanRef}
                    className={`min-w-0 flex-1 break-words ${isUnclamped ? 'line-clamp-none' : 'line-clamp-1'}`}
                  >
                    {seriesText}
                  </span>
                </p>
                <h3
                  ref={titleRef}
                  title={physicalItem.name}
                  className={`mt-1 h-5 overflow-hidden break-words font-semibold leading-5 text-content transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isUnclamped ? 'line-clamp-none' : 'line-clamp-1'
                  }`}
                >
                  {physicalItem.name}
                </h3>
              </>
            ) : (
              <h3
                ref={titleRef}
                title={physicalItem.name}
                className={`h-10 min-h-[2.5rem] overflow-hidden break-words font-semibold leading-5 text-content transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isUnclamped ? 'line-clamp-none' : 'line-clamp-2'
                }`}
              >
                {physicalItem.name}
              </h3>
            )}
          </div>
          <p
            ref={metaRef}
            title={metadataText || undefined}
            className={`mt-1 h-4 overflow-hidden break-words text-xs leading-4 text-content-muted transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isUnclamped ? 'line-clamp-none' : 'line-clamp-1'
            }`}
          >
            {metadataText}
          </p>
        </div>
      </div>

      {/* Archive Reason Prompt Modal */}
      <Sheet
        isOpen={showArchiveModal}
        onClose={() => !isArchiving && setShowArchiveModal(false)}
        title="Archive Physical Item"
        description={`Why is "${physicalItem.name}" being archived?`}
        position="center"
        size="sm"
      >
        <form onSubmit={handleArchiveSubmit} onClick={(e) => e.stopPropagation()} className="space-y-4">
          <div>
            <label htmlFor={`archive-reason-${physicalItem.id}`} className="mb-1 block text-sm font-medium text-content">
              Archive Reason *
            </label>
            <input
              id={`archive-reason-${physicalItem.id}`}
              type="text"
              required
              maxLength={500}
              placeholder="e.g., Given away, sold, trashed"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              className="w-full rounded-[--radius-control] border border-subtle bg-surface px-3 py-2 text-sm text-content placeholder-content-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            <p className="mt-1 text-xs text-content-muted">
              Archived items are removed from shelves and hidden from the main collection unless the Archived filter is selected.
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={isArchiving}
              onClick={() => setShowArchiveModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isArchiving || !archiveReason.trim()}
              isLoading={isArchiving}
            >
              Archive Item
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
};

export default MediaCard;
