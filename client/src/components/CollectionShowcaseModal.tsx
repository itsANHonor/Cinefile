import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PhysicalItem } from '../types';
import { lockBodyScroll } from './ui/Sheet';
import { formatBadgeClasses } from '../lib/formats';
import { parseEditionTags } from '../lib/editionTags';

export type ShowcaseTransitionStyle = 'cascade' | 'dissolve' | 'slide' | 'zoom';

export interface CollectionShowcaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: PhysicalItem[];
  totalCount: number;
  collectionTitle?: string;
  fetchRemainingItems?: () => Promise<PhysicalItem[]>;
}

const INTERVAL_OPTIONS = [
  { seconds: 8, label: '8s' },
  { seconds: 12, label: '12s' },
  { seconds: 20, label: '20s' },
] as const;

export const TRANSITION_OPTIONS: ReadonlyArray<{
  value: ShowcaseTransitionStyle;
  label: string;
  description: string;
}> = [
  { value: 'cascade', label: 'Cascade', description: 'Poster lift with staggered text reveal' },
  { value: 'dissolve', label: 'Dissolve', description: 'Soft unified blur cross-dissolve' },
  { value: 'slide', label: 'Slide', description: 'Directional filmstrip glide' },
  { value: 'zoom', label: 'Zoom', description: 'Cinematic depth camera push' },
];

const SHOWCASE_TRANSITION_STORAGE_KEY = 'showcase_transition_style';
const HUD_IDLE_TIMEOUT_MS = 3000;
const TRANSITION_DURATION_MS = 750;

function isValidTransitionStyle(val: string | null): val is ShowcaseTransitionStyle {
  return val === 'cascade' || val === 'dissolve' || val === 'slide' || val === 'zoom';
}

function shuffleArray<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const formatColor = (format: string) =>
  formatBadgeClasses[format] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';

const getPosterUrl = (item?: PhysicalItem | null): string | undefined =>
  item ? item.custom_image_url || item.media?.[0]?.cover_art_url : undefined;

interface SlideStageProps {
  item: PhysicalItem;
  transitionStyle: ShowcaseTransitionStyle;
  direction: 'next' | 'prev';
  isExiting?: boolean;
  failedIds: Set<number>;
  onImageError?: (id: number) => void;
}

const getStageAnimationClass = (
  style: ShowcaseTransitionStyle,
  isExiting: boolean,
  direction: 'next' | 'prev'
): string => {
  switch (style) {
    case 'dissolve':
      return isExiting ? 'showcase-dissolve-out' : 'showcase-dissolve-in';
    case 'slide':
      if (direction === 'prev') {
        return isExiting ? 'showcase-glide-out-prev' : 'showcase-glide-in-prev';
      }
      return isExiting ? 'showcase-glide-out-next' : 'showcase-glide-in-next';
    case 'zoom':
      return isExiting ? 'showcase-zoom-out' : 'showcase-zoom-in';
    case 'cascade':
    default:
      return isExiting ? 'showcase-slide-exit' : '';
  }
};

const SlideStage: React.FC<SlideStageProps> = ({
  item,
  transitionStyle,
  direction,
  isExiting = false,
  failedIds,
  onImageError,
}) => {
  const mediaList = item.media || [];
  const primaryMedia = mediaList[0];
  const isMultiTitle = mediaList.length > 1;
  const isTVSeason = primaryMedia?.media_type === 'tv_season';
  const posterUrl = getPosterUrl(item);
  const imageFailed = failedIds.has(item.id);

  const years = Array.from(
    new Set(
      mediaList
        .map((m) => (m.release_date ? new Date(m.release_date).getFullYear() : null))
        .filter((y): y is number => y !== null && !Number.isNaN(y))
    )
  ).sort((a, b) => a - b);

  const yearDisplay =
    years.length === 0
      ? null
      : years.length === 1
        ? String(years[0])
        : `${years[0]}–${years[years.length - 1]}`;

  const directors = Array.from(
    new Set(mediaList.map((m) => m.director?.trim()).filter((d): d is string => Boolean(d)))
  );
  const directorDisplay = directors.slice(0, 3).join(', ');

  const editionTags = parseEditionTags(item.edition_notes);

  const uniqueSeries = Array.from(
    new Map(mediaList.flatMap((m) => m.series ?? []).map((s) => [s.id, s])).values()
  );

  const uniqueGenres = Array.from(
    new Map(mediaList.flatMap((m) => m.genres ?? []).map((g) => [g.id, g])).values()
  ).slice(0, 6);

  const castList = primaryMedia?.cast?.slice(0, 8) ?? [];

  const useCascade = !isExiting && transitionStyle === 'cascade';
  const cascadeClass = useCascade ? 'showcase-cascade' : '';
  const stageAnimClass = getStageAnimationClass(transitionStyle, isExiting, direction);
  const HeadingTag = isExiting ? 'div' : 'h2';

  return (
    <div
      aria-hidden={isExiting || undefined}
      className={`${
        isExiting ? 'pointer-events-none absolute inset-0' : 'relative'
      } ${stageAnimClass} mx-auto flex h-full w-full max-w-7xl flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-2 lg:grid lg:grid-cols-[42%_58%] lg:gap-12 lg:overflow-hidden lg:px-12`}
    >
      {/* Left Column: Poster Showcase */}
      <div
        className={`flex w-full items-center justify-center ${
          useCascade ? 'showcase-poster-enter' : ''
        }`}
      >
        {posterUrl && !imageFailed ? (
          <img
            src={posterUrl}
            alt={isExiting ? '' : item.name}
            onError={() => onImageError?.(item.id)}
            className="max-h-[38vh] sm:max-h-[48vh] lg:max-h-[68vh] w-auto rounded-2xl object-contain shadow-[0_30px_80px_-15px_rgba(0,0,0,0.95)] ring-1 ring-white/20"
          />
        ) : (
          <div className="flex aspect-[2/3] w-52 sm:w-64 lg:w-80 flex-col items-center justify-center gap-3 rounded-2xl bg-white/5 text-white/40 shadow-2xl ring-1 ring-white/15 backdrop-blur-md">
            <svg
              className="h-16 w-16"
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
            <span className="text-xs uppercase tracking-widest">No Cover Art</span>
          </div>
        )}
      </div>

      {/* Right Column: Cinematic Details Card */}
      <div className="flex w-full flex-col justify-center space-y-4 sm:space-y-5 text-center lg:text-left max-w-2xl">
        {/* Format, Edition, Series & Genre Badges */}
        <div
          style={useCascade ? { animationDelay: '60ms' } : undefined}
          className={`flex flex-wrap items-center justify-center lg:justify-start gap-2 ${cascadeClass}`}
        >
          {item.physical_format.map((format, idx) => (
            <span
              key={`fmt-${idx}`}
              className={`${formatColor(format)} rounded-full px-3 py-1 text-xs font-semibold shadow-sm`}
            >
              {format}
            </span>
          ))}
          {editionTags.map((tag) => (
            <span
              key={`ed-${tag}`}
              className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-medium text-amber-200 ring-1 ring-amber-300/30"
            >
              {tag}
            </span>
          ))}
          {uniqueSeries.map((s) => (
            <span
              key={`ser-${s.id}`}
              className="rounded-full bg-purple-400/20 px-3 py-1 text-xs font-medium text-purple-200 ring-1 ring-purple-300/30"
            >
              {s.name}
            </span>
          ))}
          {uniqueGenres.map((g) => (
            <span
              key={`gen-${g.id}`}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 ring-1 ring-white/15"
            >
              {g.name}
            </span>
          ))}
        </div>

        {/* Title & Year / Director Metadata */}
        <div
          style={useCascade ? { animationDelay: '140ms' } : undefined}
          className={cascadeClass}
        >
          <HeadingTag className="text-2xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl leading-tight">
            {item.name}
          </HeadingTag>
          {!isMultiTitle &&
            primaryMedia?.title &&
            primaryMedia.title.toLowerCase() !== item.name.toLowerCase() && (
              <p className="mt-1 text-base font-medium text-white/70 sm:text-lg">
                {primaryMedia.title}
              </p>
            )}

          {(yearDisplay || directorDisplay || isTVSeason) && (
            <div className="mt-2.5 flex flex-wrap items-center justify-center lg:justify-start gap-x-3 gap-y-1 text-sm sm:text-base text-white/75">
              {yearDisplay && <span className="font-semibold text-white">{yearDisplay}</span>}
              {directorDisplay && (
                <>
                  {yearDisplay && <span aria-hidden="true">&middot;</span>}
                  <span>
                    {isTVSeason ? 'Created by ' : 'Directed by '}
                    <strong className="font-semibold text-white">{directorDisplay}</strong>
                  </span>
                </>
              )}
              {isTVSeason && (
                <>
                  {(yearDisplay || directorDisplay) && <span aria-hidden="true">&middot;</span>}
                  <span className="rounded bg-purple-600/90 px-2 py-0.5 text-xs font-semibold text-white">
                    TV
                  </span>
                  {!isMultiTitle && primaryMedia?.season_number != null && (
                    <span>Season {primaryMedia.season_number}</span>
                  )}
                  {!isMultiTitle && primaryMedia?.episode_count != null && (
                    <span>
                      ({primaryMedia.episode_count}{' '}
                      {primaryMedia.episode_count === 1 ? 'episode' : 'episodes'})
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Multi-Title Box Set Included Titles */}
        {isMultiTitle && (
          <div
            style={useCascade ? { animationDelay: '220ms' } : undefined}
            className={`space-y-2 ${cascadeClass}`}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Included Titles ({mediaList.length})
            </h3>
            <div className="flex flex-wrap justify-center lg:justify-start gap-1.5">
              {mediaList.map((m, idx) => {
                const yr = m.release_date ? new Date(m.release_date).getFullYear() : null;
                return (
                  <span
                    key={m.id || idx}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15"
                  >
                    <span className="text-white/60">{idx + 1}.</span>
                    <span>{m.title}</span>
                    {yr && <span className="text-white/60">({yr})</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Synopsis */}
        {primaryMedia?.synopsis && (
          <p
            style={useCascade ? { animationDelay: isMultiTitle ? '280ms' : '220ms' } : undefined}
            className={`line-clamp-4 sm:line-clamp-5 text-sm sm:text-base leading-relaxed text-white/85 ${cascadeClass}`}
          >
            {primaryMedia.synopsis}
          </p>
        )}

        {/* Cast */}
        {castList.length > 0 && (
          <div
            style={useCascade ? { animationDelay: isMultiTitle ? '340ms' : '280ms' } : undefined}
            className={`pt-1 ${cascadeClass}`}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-white/50 mr-2">
              Starring
            </span>
            <span className="text-xs sm:text-sm text-white/80">{castList.join(', ')}</span>
          </div>
        )}

        {/* Shelf Location Pill */}
        {item.shelf_placement && (
          <div
            style={useCascade ? { animationDelay: isMultiTitle ? '400ms' : '340ms' } : undefined}
            className={`flex items-center justify-center lg:justify-start pt-1 ${cascadeClass}`}
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-md">
              <svg
                className="h-4 w-4 shrink-0 text-primary-400"
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
              <span>
                {(item.shelf_placement as any).group_display_name && (
                  <>{(item.shelf_placement as any).group_display_name} &rsaquo; </>
                )}
                {(item.shelf_placement as any).shelf_display_name || 'Shelf'}, Position{' '}
                {item.shelf_placement.position + 1}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CollectionShowcaseModal: React.FC<CollectionShowcaseModalProps> = ({
  isOpen,
  onClose,
  items,
  totalCount,
  collectionTitle = 'Collection Showcase',
  fetchRemainingItems,
}) => {
  const [allItems, setAllItems] = useState<PhysicalItem[]>([]);
  const [displayItems, setDisplayItems] = useState<PhysicalItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitingItem, setExitingItem] = useState<PhysicalItem | null>(null);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [isPlaying, setIsPlaying] = useState(true);
  const [isShuffled, setIsShuffled] = useState(true);
  const [intervalSec, setIntervalSec] = useState<number>(12);
  const [transitionStyle, setTransitionStyle] = useState<ShowcaseTransitionStyle>(() => {
    try {
      const saved = localStorage.getItem(SHOWCASE_TRANSITION_STORAGE_KEY);
      if (isValidTransitionStyle(saved)) return saved;
    } catch {
      // Ignore storage access errors
    }
    return 'cascade';
  });
  const [isHudVisible, setIsHudVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<number>>(() => new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);
  const hudTimerRef = useRef<number | null>(null);
  const prevActiveItemRef = useRef<PhysicalItem | null>(null);

  const handleSelectTransition = useCallback(
    (style: ShowcaseTransitionStyle) => {
      setTransitionStyle(style);
      try {
        localStorage.setItem(SHOWCASE_TRANSITION_STORAGE_KEY, style);
      } catch {
        // Ignore storage errors
      }
    },
    []
  );

  const handleImageError = useCallback((id: number) => {
    setFailedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const resetHudTimer = useCallback(() => {
    setIsHudVisible(true);
    if (hudTimerRef.current !== null) {
      window.clearTimeout(hudTimerRef.current);
    }
    hudTimerRef.current = window.setTimeout(() => {
      setIsHudVisible(false);
    }, HUD_IDLE_TIMEOUT_MS);
  }, []);

  // Initialize showcase items on open
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const initialDeck = shuffleArray(items);
    setAllItems(items);
    setDisplayItems(initialDeck);
    setCurrentIndex(0);
    setExitingItem(null);
    setDirection('next');
    prevActiveItemRef.current = initialDeck[0] ?? null;
    setIsPlaying(true);
    setIsShuffled(true);
    setFailedIds(new Set());
    resetHudTimer();

    if (fetchRemainingItems && totalCount > items.length) {
      fetchRemainingItems()
        .then((extraItems) => {
          if (cancelled || !extraItems || extraItems.length === 0) return;
          const existingIds = new Set(items.map((item) => item.id));
          const uniqueNew = extraItems.filter((item) => !existingIds.has(item.id));
          if (uniqueNew.length === 0) return;

          const combined = [...items, ...uniqueNew];
          setAllItems(combined);
          setDisplayItems((prev) => [...prev, ...shuffleArray(uniqueNew)]);
        })
        .catch((err) => {
          console.error('Failed to load remaining items for showcase:', err);
        });
    }

    return () => {
      cancelled = true;
      if (hudTimerRef.current !== null) {
        window.clearTimeout(hudTimerRef.current);
      }
    };
    // Only re-initialize when isOpen transitions to true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const activeItem = displayItems[currentIndex];

  // Track outgoing slide for dual-buffer transition
  useEffect(() => {
    if (!isOpen || !activeItem) return;
    const prev = prevActiveItemRef.current;
    if (prev && prev.id !== activeItem.id) {
      setExitingItem(prev);
      prevActiveItemRef.current = activeItem;
      const timer = window.setTimeout(() => {
        setExitingItem(null);
      }, TRANSITION_DURATION_MS);
      return () => window.clearTimeout(timer);
    }
    prevActiveItemRef.current = activeItem;
  }, [activeItem, isOpen]);

  // Preload adjacent slide posters so transitions never flash on uncached images
  useEffect(() => {
    if (!isOpen || displayItems.length <= 1) return;
    const nextIdx = (currentIndex + 1) % displayItems.length;
    const prevIdx = (currentIndex - 1 + displayItems.length) % displayItems.length;
    [displayItems[nextIdx], displayItems[prevIdx]].forEach((candidate) => {
      const url = getPosterUrl(candidate);
      if (url && typeof Image !== 'undefined') {
        const img = new Image();
        img.src = url;
      }
    });
  }, [isOpen, currentIndex, displayItems]);

  // Lock body scroll and manage focus when open
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement;
    const frame = requestAnimationFrame(() => {
      containerRef.current?.focus();
    });
    const restoreScroll = lockBodyScroll(true);

    return () => {
      cancelAnimationFrame(frame);
      restoreScroll();
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      if (previouslyFocusedRef.current instanceof HTMLElement) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [isOpen]);

  // Sync browser fullscreen state
  useEffect(() => {
    if (!isOpen) return;
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isOpen]);

  // Auto-advance timer
  useEffect(() => {
    if (!isOpen || !isPlaying || displayItems.length <= 1) return;

    const timer = window.setTimeout(() => {
      setDirection('next');
      setCurrentIndex((prev) => (prev + 1) % displayItems.length);
    }, intervalSec * 1000);

    return () => window.clearTimeout(timer);
  }, [isOpen, isPlaying, displayItems.length, currentIndex, intervalSec]);

  const handleNext = useCallback(() => {
    if (displayItems.length <= 1) return;
    setDirection('next');
    setCurrentIndex((prev) => (prev + 1) % displayItems.length);
  }, [displayItems.length]);

  const handlePrev = useCallback(() => {
    if (displayItems.length <= 1) return;
    setDirection('prev');
    setCurrentIndex((prev) => (prev - 1 + displayItems.length) % displayItems.length);
  }, [displayItems.length]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
    resetHudTimer();
  }, [resetHudTimer]);

  const handleToggleShuffle = useCallback(() => {
    const currentItem = displayItems[currentIndex];
    if (isShuffled) {
      setIsShuffled(false);
      setDisplayItems(allItems);
      const nextIdx = currentItem ? allItems.findIndex((i) => i.id === currentItem.id) : 0;
      setCurrentIndex(nextIdx >= 0 ? nextIdx : 0);
    } else {
      setIsShuffled(true);
      if (currentItem) {
        const rest = allItems.filter((i) => i.id !== currentItem.id);
        setDisplayItems([currentItem, ...shuffleArray(rest)]);
        setCurrentIndex(0);
      } else {
        setDisplayItems(shuffleArray(allItems));
        setCurrentIndex(0);
      }
    }
    resetHudTimer();
  }, [allItems, currentIndex, displayItems, isShuffled, resetHudTimer]);

  const handleCycleTransition = useCallback(() => {
    const idx = TRANSITION_OPTIONS.findIndex((o) => o.value === transitionStyle);
    const nextOption = TRANSITION_OPTIONS[(idx + 1) % TRANSITION_OPTIONS.length];
    handleSelectTransition(nextOption.value);
    resetHudTimer();
  }, [handleSelectTransition, resetHudTimer, transitionStyle]);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    resetHudTimer();
  }, [resetHudTimer]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      resetHudTimer();
      switch (event.key) {
        case 'Escape':
          event.stopPropagation();
          onClose();
          break;
        case 'ArrowRight':
          event.preventDefault();
          handleNext();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          handlePrev();
          break;
        case ' ':
          if ((event.target as HTMLElement)?.tagName !== 'BUTTON') {
            event.preventDefault();
            handleTogglePlay();
          }
          break;
        case 's':
        case 'S':
          event.preventDefault();
          handleToggleShuffle();
          break;
        case 't':
        case 'T':
          event.preventDefault();
          handleCycleTransition();
          break;
        case 'f':
        case 'F':
          event.preventDefault();
          handleToggleFullscreen();
          break;
      }
    },
    [
      handleCycleTransition,
      handleNext,
      handlePrev,
      handleToggleFullscreen,
      handleTogglePlay,
      handleToggleShuffle,
      onClose,
      resetHudTimer,
    ]
  );

  if (!isOpen || !activeItem) return null;

  const activePosterUrl = getPosterUrl(activeItem);
  const exitingPosterUrl = getPosterUrl(exitingItem);
  const hudShown = isHudVisible || !isPlaying;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${collectionTitle} showcase`}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onMouseMove={resetHudTimer}
      onTouchStart={resetHudTimer}
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden bg-neutral-950 text-white outline-none select-none"
    >
      {/* Ambient Full-Screen Blurred Backdrop with Dual-Buffer Cross-Dissolve & Ken Burns Drift */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {exitingItem && exitingPosterUrl && !failedIds.has(exitingItem.id) && (
          <img
            key={`backdrop-exit-${exitingItem.id}`}
            src={exitingPosterUrl}
            alt=""
            className="showcase-backdrop-out absolute inset-0 h-full w-full object-cover blur-3xl saturate-150"
          />
        )}
        {activePosterUrl && !failedIds.has(activeItem.id) && (
          <img
            key={`backdrop-${activeItem.id}`}
            src={activePosterUrl}
            alt=""
            className="showcase-backdrop-in absolute inset-0 h-full w-full object-cover blur-3xl saturate-150"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-950/90 via-neutral-950/65 to-neutral-950/95" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.06),transparent_65%)]" />
      </div>

      {/* Top HUD Bar */}
      <header
        className={`relative z-20 flex items-center justify-between px-4 py-4 sm:px-8 sm:py-5 transition-opacity duration-500 ${
          hudShown ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/90 backdrop-blur-md ring-1 ring-white/15">
            <span
              className={`h-2 w-2 rounded-full ${
                isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
              aria-hidden="true"
            />
            Showcase
          </span>
          <span className="truncate text-sm font-medium text-white/70 hidden sm:inline">
            {collectionTitle}
          </span>
          <span className="text-xs font-medium text-white/50 tabular-nums">
            {currentIndex + 1} / {displayItems.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {typeof document !== 'undefined' &&
            typeof document.documentElement?.requestFullscreen === 'function' && (
              <button
                type="button"
                onClick={handleToggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/85 backdrop-blur-md ring-1 ring-white/15 transition hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {isFullscreen ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m7 5l5-5m0 0v4m0-4h-4M9 15l-5 5m0 0v-4m0 4h4m7-5l5 5m0 0v-4m0 4h-4" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
            )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close showcase"
            title="Exit showcase (Esc)"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-medium text-white/90 backdrop-blur-md ring-1 ring-white/15 transition hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Exit</span>
          </button>
        </div>
      </header>

      {/* Main Split Stage with Dual-Buffer Outgoing/Incoming Layers */}
      <div className="relative z-10 flex flex-1 w-full items-center justify-center overflow-hidden">
        {exitingItem && (
          <SlideStage
            key={`slide-exit-${exitingItem.id}`}
            item={exitingItem}
            transitionStyle={transitionStyle}
            direction={direction}
            isExiting
            failedIds={failedIds}
          />
        )}
        <SlideStage
          key={`slide-${activeItem.id}`}
          item={activeItem}
          transitionStyle={transitionStyle}
          direction={direction}
          failedIds={failedIds}
          onImageError={handleImageError}
        />
      </div>

      {/* Bottom Playback HUD */}
      <footer
        className={`relative z-20 flex flex-col items-center gap-3 px-4 pb-6 pt-2 transition-opacity duration-500 ${
          hudShown ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl sm:rounded-full bg-black/60 px-4 py-2 backdrop-blur-xl ring-1 ring-white/15 shadow-2xl">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrev}
              disabled={displayItems.length <= 1}
              aria-label="Previous item"
              title="Previous (←)"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Pause showcase' : 'Play showcase'}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-950 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {isPlaying ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                </svg>
              ) : (
                <svg className="h-5 w-5 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={displayItems.length <= 1}
              aria-label="Next item"
              title="Next (→)"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="mx-0.5 h-5 w-px bg-white/15" aria-hidden="true" />

          <button
            type="button"
            onClick={handleToggleShuffle}
            aria-label="Toggle shuffle order"
            aria-pressed={isShuffled}
            title={isShuffled ? 'Shuffled order (S)' : 'Collection sort order (S)'}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              isShuffled
                ? 'bg-primary-600/80 text-white ring-1 ring-primary-400/50'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"
              />
            </svg>
            <span className="hidden sm:inline">{isShuffled ? 'Shuffled' : 'In Order'}</span>
          </button>

          <div className="mx-0.5 h-5 w-px bg-white/15" aria-hidden="true" />

          {/* Transition Style Presets */}
          <div
            role="group"
            aria-label="Transition style"
            className="flex items-center rounded-full bg-white/10 p-0.5"
          >
            {TRANSITION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={transitionStyle === opt.value}
                title={`${opt.label}: ${opt.description} (T)`}
                onClick={() => {
                  handleSelectTransition(opt.value);
                  resetHudTimer();
                }}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  transitionStyle === opt.value
                    ? 'bg-white text-neutral-950'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="mx-0.5 h-5 w-px bg-white/15 hidden sm:block" aria-hidden="true" />

          {/* Rotation Speed */}
          <div
            role="group"
            aria-label="Rotation speed"
            className="flex items-center rounded-full bg-white/10 p-0.5"
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.seconds}
                type="button"
                aria-pressed={intervalSec === opt.seconds}
                onClick={() => {
                  setIntervalSec(opt.seconds);
                  resetHudTimer();
                }}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  intervalSec === opt.seconds
                    ? 'bg-white text-neutral-950'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </footer>

      {/* Subtle 2px Glowing Bottom Progress Bar */}
      {displayItems.length > 1 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-30 h-0.5 overflow-hidden bg-white/10"
        >
          <div
            key={`progress-${activeItem.id}-${intervalSec}`}
            style={{
              animation: `showcaseProgress ${intervalSec}s linear forwards`,
              animationPlayState: isPlaying ? 'running' : 'paused',
            }}
            className="h-full w-full origin-left bg-gradient-to-r from-primary-400 via-white/90 to-primary-300 shadow-[0_0_12px_rgba(255,255,255,0.75)]"
          />
        </div>
      )}
    </div>,
    document.body
  );
};

export default CollectionShowcaseModal;
