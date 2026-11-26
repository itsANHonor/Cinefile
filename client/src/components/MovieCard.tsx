import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { CollectionMedia } from '../types';
import { useDisplayPreferences } from '../context/DisplayPreferencesContext';
import { IconButton } from './ui/IconButton';
import { formatBadgeClasses } from '../lib/formats';
import { getMediaSeriesList } from '../lib/series';

interface MovieCardProps {
  media: CollectionMedia;
  onClick?: () => void;
  isEditMode?: boolean;
  isAuthenticated?: boolean;
  onEdit?: (media: CollectionMedia) => void;
  isArchivedView?: boolean;
}

const MAX_VISIBLE_FORMAT_BADGES = 3;

const MovieCard: React.FC<MovieCardProps> = ({
  media,
  onClick,
  isEditMode = false,
  isAuthenticated = false,
  onEdit,
  isArchivedView = false,
}) => {
  const { showFormatBadges } = useDisplayPreferences();
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageRetryCount, setImageRetryCount] = useState(0);
  const [isCardVisible, setIsCardVisible] = useState(
    () => typeof IntersectionObserver === 'undefined'
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUnclamped, setIsUnclamped] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
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
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const imageUrl = media.cover_art_url;

  const setImgRef = useCallback((node: HTMLImageElement | null) => {
    imgRef.current = node;
    if (node && node.complete && node.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setImageFailed(false);
    setImageRetryCount(0);
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setImageLoaded(true);
    } else {
      setImageLoaded(false);
    }
  }, [imageUrl]);

  useEffect(() => {
    if (isCardVisible || typeof IntersectionObserver === 'undefined') return;
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsCardVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isCardVisible]);

  useEffect(() => {
    if (!isCardVisible || imageLoaded || imageFailed || !imageUrl) return;
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, [isCardVisible, imageLoaded, imageFailed, imageUrl, imageRetryCount]);

  const handleImageError = useCallback(() => {
    if (imageRetryCount < 1) {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        setImageRetryCount((prev) => prev + 1);
      }, 600);
      return;
    }
    setImageFailed(true);
  }, [imageRetryCount]);

  const getFormatColor = (format: string) =>
    formatBadgeClasses[format] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';

  const mediaSeries = getMediaSeriesList(media);
  const seriesText = mediaSeries.map((s) => s.name).join(', ');
  const isTV = media.media_type === 'tv_season';

  const metadataParts: string[] = [];
  if (media.release_date) {
    const year = new Date(media.release_date).getFullYear();
    if (!Number.isNaN(year)) {
      metadataParts.push(String(year));
    }
  }
  if (media.director) {
    metadataParts.push(media.director);
  }
  if (media.letterboxd_rating != null && media.letterboxd_rating > 0) {
    const ratingStr = Number(media.letterboxd_rating).toFixed(1).replace(/\.0$/, '');
    metadataParts.push(`★ ${ratingStr}`);
  }
  const metadataText = metadataParts.join(' · ');

  const ownedFormats = media.owned_formats ?? [];
  const visibleFormats = ownedFormats.slice(0, MAX_VISIBLE_FORMAT_BADGES);
  const hiddenFormatsCount = Math.max(0, ownedFormats.length - MAX_VISIBLE_FORMAT_BADGES);

  const singleCopyBoxSet =
    media.physical_item_count === 1 && (media.physical_items?.[0]?.media_count ?? 1) > 1
      ? media.physical_items[0]
      : null;

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(media);
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
      ref={cardRef}
      role="button"
      tabIndex={onClick ? 0 : -1}
      aria-label={`Open details for ${media.title}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="card group relative flex h-full cursor-pointer flex-col overflow-hidden p-0 text-left transition-shadow duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {/* Movie Poster */}
      <div
        className={`relative aspect-[2/3] overflow-hidden bg-surface-sunken ${
          imageUrl && !imageFailed && !imageLoaded ? 'skeleton-shimmer' : ''
        }`}
      >
        {imageUrl && !imageFailed ? (
          <img
            key={imageRetryCount > 0 ? `${imageUrl}#retry-${imageRetryCount}` : imageUrl}
            ref={setImgRef}
            src={imageUrl}
            alt={media.title}
            width={300}
            height={450}
            decoding="async"
            loading={isCardVisible || imageRetryCount > 0 ? 'eager' : 'lazy'}
            onLoad={() => setImageLoaded(true)}
            onError={handleImageError}
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

        {/* Admin Edit Button Overlay */}
        {isAuthenticated && isEditMode && onEdit && (
          <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
            <IconButton
              size="sm"
              variant="secondary"
              aria-label={`Edit ${media.title}`}
              onClick={handleEditClick}
              className="bg-surface-raised/90 backdrop-blur-sm"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </IconButton>
          </div>
        )}

        {/* Owned Format Badges */}
        {showFormatBadges && (
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {isArchivedView && (
              <span className="rounded bg-amber-600/95 px-2 py-1 text-xs font-semibold text-white shadow-sm">
                Archived
              </span>
            )}
            {visibleFormats.map((format) => (
              <span
                key={format}
                className={`${getFormatColor(format)} rounded px-2 py-1 text-xs font-medium shadow-sm`}
              >
                {format}
              </span>
            ))}
            {hiddenFormatsCount > 0 && (
              <span
                title={ownedFormats.slice(MAX_VISIBLE_FORMAT_BADGES).join(', ')}
                className="rounded bg-black/75 px-2 py-0.5 text-xs font-medium text-white shadow-sm"
              >
                +{hiddenFormatsCount}
              </span>
            )}
          </div>
        )}
        {!showFormatBadges && isArchivedView && (
          <div className="absolute left-2 top-2">
            <span className="rounded bg-amber-600/95 px-2 py-1 text-xs font-semibold text-white shadow-sm">
              Archived
            </span>
          </div>
        )}

        {/* Multiple Copies / Box Set Indicator */}
        {media.physical_item_count > 1 ? (
          <div className="absolute bottom-2 left-2">
            <span
              data-testid="movie-copies-badge"
              title={`Owned in ${media.physical_item_count} physical releases`}
              className="inline-flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm"
            >
              <svg
                className="h-3 w-3 shrink-0 opacity-85"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                />
              </svg>
              <span>{media.physical_item_count} copies</span>
            </span>
          </div>
        ) : singleCopyBoxSet ? (
          <div className="absolute bottom-2 left-2">
            <span
              data-testid="movie-boxset-badge"
              title={`Part of ${singleCopyBoxSet.name}`}
              className="inline-flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm"
            >
              <svg
                className="h-3 w-3 shrink-0 opacity-85"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              <span>Box set</span>
            </span>
          </div>
        ) : null}

        {/* TV type badge */}
        {isTV && (
          <div className="absolute bottom-2 right-2">
            <span className="rounded bg-purple-600/90 px-1.5 py-0.5 text-xs font-medium text-white">
              TV
            </span>
          </div>
        )}
      </div>

      {/* Info Drawer */}
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
                  data-testid="movie-card-series"
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
                  title={media.title}
                  className={`mt-1 h-5 overflow-hidden break-words font-semibold leading-5 text-content transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isUnclamped ? 'line-clamp-none' : 'line-clamp-1'
                  }`}
                >
                  {media.title}
                </h3>
              </>
            ) : (
              <h3
                ref={titleRef}
                title={media.title}
                className={`h-10 min-h-[2.5rem] overflow-hidden break-words font-semibold leading-5 text-content transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isUnclamped ? 'line-clamp-none' : 'line-clamp-2'
                }`}
              >
                {media.title}
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
    </div>
  );
};

export default MovieCard;
