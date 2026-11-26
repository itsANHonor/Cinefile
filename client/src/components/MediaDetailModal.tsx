import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PhysicalItem, CustomImage, STANDARD_UNIT_MM } from '../types';
import { lockBodyScroll } from './ui/Sheet';
import { Button } from './ui/Button';
import { VisuallyHidden } from './ui/VisuallyHidden';
import { formatBadgeClasses } from '../lib/formats';
import { parseEditionTags } from '../lib/editionTags';
import { getDistinctOriginalTitle } from '../lib/titles';
import { detectBarcode } from '../lib/identifiers';
import { getFramedImageStyle } from '../lib/imageFrame';
import {
  LetterboxdActivityBanner,
  LetterboxdDotsIcon,
  formatStarString,
  formatWatchedDate,
  hasLetterboxdActivity,
} from './LetterboxdBadge';

interface MediaDetailModalProps {
  physicalItem: PhysicalItem | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (physicalItem: PhysicalItem) => void;
  initialMediaId?: number;
  backLabel?: string;
  onBack?: () => void;
}

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const formatColor = (format: string) =>
  formatBadgeClasses[format] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';

const areFormatListsEqual = (a: string[] = [], b: string[] = []) => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
};

const getPackagePhotos = (item: PhysicalItem | null): CustomImage[] => {
  if (!item) return [];
  if (Array.isArray(item.custom_images) && item.custom_images.length > 0) {
    return item.custom_images.filter(
      (img) => img && typeof img.url === 'string' && img.url.trim() !== ''
    );
  }
  if (item.custom_image_url && item.custom_image_url.trim() !== '') {
    return [{ url: item.custom_image_url.trim() }];
  }
  return [];
};

const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  physicalItem,
  isOpen,
  onClose,
  onEdit,
  initialMediaId,
  backLabel,
  onBack,
}) => {
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [showCustomArt, setShowCustomArt] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    const initialIndex =
      initialMediaId != null && physicalItem?.media
        ? physicalItem.media.findIndex((m) => m.id === initialMediaId)
        : -1;
    setActiveMediaIndex(initialIndex >= 0 ? initialIndex : 0);
    setActivePhotoIndex(0);
    setShowCustomArt(true);
  }, [physicalItem?.id, initialMediaId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement;
    const timer = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(focusableSelector);
      focusable[0]?.focus();
    });
    const restore = lockBodyScroll(true);
    return () => {
      cancelAnimationFrame(timer);
      restore();
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (physicalItem) {
        const photos = getPackagePhotos(physicalItem);
        if (showCustomArt && photos.length > 1) {
          if (event.key === 'ArrowLeft') {
            setActivePhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
            return;
          }
          if (event.key === 'ArrowRight') {
            setActivePhotoIndex((prev) => (prev + 1) % photos.length);
            return;
          }
        } else if (physicalItem.media.length > 1) {
          if (event.key === 'ArrowLeft') {
            setActiveMediaIndex(
              (prev) => (prev - 1 + physicalItem.media.length) % physicalItem.media.length
            );
            return;
          }
          if (event.key === 'ArrowRight') {
            setActiveMediaIndex((prev) => (prev + 1) % physicalItem.media.length);
            return;
          }
        }
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose, physicalItem, showCustomArt]
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen || !physicalItem) return null;

  const mediaList = physicalItem.media || [];
  const isMultiTitle = mediaList.length > 1;
  const safeIndex = Math.min(activeMediaIndex, Math.max(0, mediaList.length - 1));
  const activeMovie = mediaList[safeIndex];

  const movieFormats =
    activeMovie?.formats && activeMovie.formats.length > 0
      ? activeMovie.formats
      : physicalItem.physical_format.length > 0
        ? physicalItem.physical_format
        : ['Blu-ray'];

  const showOverallFormats =
    physicalItem.physical_format.length > 0 &&
    (isMultiTitle || !areFormatListsEqual(physicalItem.physical_format, movieFormats));

  const editionTags = parseEditionTags(physicalItem.edition_notes);
  const hasThickness = Boolean(physicalItem.thickness_units && physicalItem.thickness_units > 1);
  const hasStoreLinks = Boolean(physicalItem.store_links && physicalItem.store_links.length > 0);
  const barcodeInfo = detectBarcode(physicalItem.barcode);
  const hasCost = physicalItem.cost !== null && physicalItem.cost !== undefined && Number.isFinite(Number(physicalItem.cost));
  const watchedMediaCount = mediaList.filter((m) => hasLetterboxdActivity(m)).length;
  const hasAnyLetterboxdInItem = watchedMediaCount > 0;
  const hasDetailFields =
    showOverallFormats ||
    editionTags.length > 0 ||
    Boolean(physicalItem.shelf_placement) ||
    Boolean(physicalItem.purchase_date) ||
    hasCost ||
    Boolean(barcodeInfo) ||
    Boolean(physicalItem.asin) ||
    hasThickness ||
    hasStoreLinks;

  const releaseYear = activeMovie?.release_date
    ? new Date(activeMovie.release_date).getFullYear()
    : null;
  const isTVSeason = activeMovie?.media_type === 'tv_season';
  const distinctOriginalTitle = activeMovie ? getDistinctOriginalTitle(activeMovie) : null;

  const packagePhotos = getPackagePhotos(physicalItem);
  const hasPackagePhotos = packagePhotos.length > 0;
  const safePhotoIndex = Math.min(activePhotoIndex, Math.max(0, packagePhotos.length - 1));
  const activePackagePhoto = packagePhotos[safePhotoIndex] || null;
  const isViewingPackagePhotos = showCustomArt && hasPackagePhotos;

  const primaryPosterUrl = isViewingPackagePhotos
    ? activePackagePhoto?.url
    : activeMovie?.cover_art_url || activePackagePhoto?.url;

  const handlePrevTitle = () => {
    setActiveMediaIndex((prev) => (prev - 1 + mediaList.length) % mediaList.length);
  };

  const handleNextTitle = () => {
    setActiveMediaIndex((prev) => (prev + 1) % mediaList.length);
  };

  const handlePrevPhoto = () => {
    setActivePhotoIndex((prev) => (prev - 1 + packagePhotos.length) % packagePhotos.length);
  };

  const handleNextPhoto = () => {
    setActivePhotoIndex((prev) => (prev + 1) % packagePhotos.length);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6 backdrop-blur-md"
      onClick={handleBackdropClick}
      role="presentation"
      aria-hidden="false"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onKeyDown={handleKeyDown}
        className="grid max-h-[88dvh] w-full max-w-6xl overflow-hidden rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-white/10 outline-none lg:grid-cols-[48%_52%]"
      >
        {/* Left Stage: Ambient Poster Showcase */}
        <div
          className={`relative flex min-h-[340px] flex-col items-center justify-center overflow-hidden bg-neutral-950 p-6 sm:p-10 lg:min-h-[620px] ${
            isViewingPackagePhotos && packagePhotos.length > 1 ? 'pb-24 sm:pb-28' : ''
          }`}
        >
          {primaryPosterUrl && (
            <img
              src={primaryPosterUrl}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-3xl saturate-150"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/50" />

          {/* Active Photo Label & Counter Badge */}
          {isViewingPackagePhotos && (activePackagePhoto?.label || packagePhotos.length > 1) && (
            <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-md ring-1 ring-white/15">
              {activePackagePhoto?.label && (
                <span className="font-semibold">{activePackagePhoto.label}</span>
              )}
              {activePackagePhoto?.label && packagePhotos.length > 1 && (
                <span className="opacity-50" aria-hidden="true">&middot;</span>
              )}
              {packagePhotos.length > 1 && (
                <span className="tabular-nums opacity-85">
                  {safePhotoIndex + 1} / {packagePhotos.length}
                </span>
              )}
            </div>
          )}

          {/* Poster Frame */}
          <div className="relative z-10 flex items-center justify-center">
            {primaryPosterUrl ? (
              <img
                src={primaryPosterUrl}
                alt={activeMovie?.title || physicalItem.name}
                width={360}
                height={540}
                decoding="async"
                className={`w-auto rounded-xl object-contain shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] ring-1 ring-white/15 ${
                  isViewingPackagePhotos && packagePhotos.length > 1
                    ? 'max-h-[290px] sm:max-h-[370px] lg:max-h-[450px]'
                    : 'max-h-[360px] sm:max-h-[440px] lg:max-h-[540px]'
                }`}
              />
            ) : (
              <div className="aspect-[2/3] w-60 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/15 sm:w-64">
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-neutral-900 text-neutral-500">
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
                  <span className="text-xs uppercase tracking-widest">No Poster Art</span>
                </div>
              </div>
            )}
          </div>

          {/* Package Photo Gallery controls & thumbnail strip when multiple package photos exist */}
          {isViewingPackagePhotos && packagePhotos.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrevPhoto}
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 z-20 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleNextPhoto}
                aria-label="Next photo"
                className="absolute right-3 top-1/2 z-20 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <div
                role="tablist"
                aria-label="Package photos"
                data-testid="package-photo-thumbnails"
                className="absolute bottom-3 inset-x-4 z-20 flex items-center justify-center gap-2 overflow-x-auto py-1"
              >
                {packagePhotos.map((photo, idx) => {
                  const isActive = idx === safePhotoIndex;
                  const thumbLabel = photo.label || `Photo ${idx + 1}`;
                  return (
                    <button
                      key={`${photo.url}-${idx}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`View package photo: ${thumbLabel}`}
                      onClick={() => setActivePhotoIndex(idx)}
                      className={`group relative h-14 w-10 shrink-0 overflow-hidden rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isActive
                          ? 'ring-2 ring-white scale-105 shadow-lg opacity-100'
                          : 'ring-1 ring-white/25 opacity-60 hover:opacity-95'
                      }`}
                    >
                      <img
                        src={photo.url}
                        alt=""
                        aria-hidden="true"
                        className="h-full w-full object-cover bg-neutral-900"
                        style={getFramedImageStyle(photo.frame)}
                      />
                      {photo.label && (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1 py-0.5 text-[9px] font-semibold leading-none text-white">
                          {photo.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Instagram-style stage overlay arrows & dots for multi-movie box sets (when viewing movie posters or single-photo box sets) */}
          {isMultiTitle && (!isViewingPackagePhotos || packagePhotos.length <= 1) && (
            <>
              <button
                type="button"
                onClick={handlePrevTitle}
                aria-label="Previous movie"
                className="absolute left-3 top-1/2 z-20 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleNextTitle}
                aria-label="Next movie"
                className="absolute right-3 top-1/2 z-20 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-md">
                {mediaList.map((m, idx) => (
                  <button
                    key={m.link_id ?? `media-${idx}`}
                    type="button"
                    onClick={() => setActiveMediaIndex(idx)}
                    aria-label={`View ${m.title}`}
                    className={`h-2 rounded-full transition-all ${
                      idx === safeIndex ? 'w-6 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right Pane: Movie Hero + Bottom Collection Details */}
        <div className="flex max-h-[88dvh] flex-col justify-between overflow-y-auto lg:overflow-hidden">
          {/* Top Header */}
          <div className="flex items-center justify-between gap-4 border-b border-subtle px-6 py-4">
            <div className="flex min-w-0 items-center gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[--radius-control] px-2 py-1 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="max-w-[140px] truncate">{backLabel || 'Back'}</span>
                </button>
              )}
              <h2 id="sheet-title" className="truncate text-sm font-semibold text-content-muted">
                {physicalItem.name}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onEdit && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onEdit(physicalItem)}
                  aria-label={`Edit ${physicalItem.name}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    <span>Edit</span>
                  </span>
                </Button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${physicalItem.name}`}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[--radius-control] text-content-muted transition-colors hover:bg-surface-sunken hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <VisuallyHidden>Close</VisuallyHidden>
              </button>
            </div>
          </div>

          {/* Scrollable Movie Content */}
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
            {physicalItem.archived && (
              <div className="rounded-[--radius-card] border border-amber-300 bg-amber-50 p-3.5 text-sm dark:border-amber-700/60 dark:bg-amber-950/40">
                <span className="font-semibold text-amber-900 dark:text-amber-200">Archived</span>
                {physicalItem.archive_reason && (
                  <span className="ml-2 text-amber-800 dark:text-amber-300">
                    &mdash; {physicalItem.archive_reason}
                  </span>
                )}
              </div>
            )}

            {/* Primary Focus: Media Section */}
            <section aria-labelledby="detail-media-heading" className="space-y-5">
              {isMultiTitle ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2
                      id="detail-media-heading"
                      className="text-xs font-semibold uppercase tracking-wider text-content-muted"
                    >
                      Included Titles ({mediaList.length})
                    </h2>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-content-muted">
                        {safeIndex + 1} of {mediaList.length}
                      </span>
                      <button
                        type="button"
                        onClick={handlePrevTitle}
                        aria-label="Previous title"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-subtle bg-surface text-content-muted transition-colors hover:bg-surface-sunken hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={handleNextTitle}
                        aria-label="Next title"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-subtle bg-surface text-content-muted transition-colors hover:bg-surface-sunken hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div role="tablist" aria-label="Included titles" className="flex flex-wrap gap-1.5">
                    {mediaList.map((movie, idx) => {
                      const isActive = idx === safeIndex;
                      const yr = movie.release_date
                        ? new Date(movie.release_date).getFullYear()
                        : null;
                      return (
                        <button
                          key={movie.link_id ?? `media-${idx}`}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setActiveMediaIndex(idx)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isActive
                              ? 'bg-primary-600 text-white shadow-sm'
                              : 'bg-surface-sunken text-content-muted hover:text-content'
                          }`}
                        >
                          <span className="font-semibold">{idx + 1}.</span>
                          <span className="max-w-[180px] truncate">{movie.title}</span>
                          {yr && <span className="opacity-75">({yr})</span>}
                          {movie.version_notes && (
                            <span className="max-w-[140px] truncate rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                              {movie.version_notes}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <h2 id="detail-media-heading" className="sr-only">
                  Media
                </h2>
              )}

              {activeMovie && (
                <div className="space-y-5">
                  <div>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                      <h3 className="text-3xl font-extrabold tracking-tight text-content sm:text-4xl">
                        {activeMovie.title}
                      </h3>
                      {parseEditionTags(activeMovie.version_notes).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-amber-100/80 px-2 py-0.5 text-sm font-semibold text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {distinctOriginalTitle && (
                      <p className="mt-1 text-sm font-medium italic text-content-muted">
                        Original title: {distinctOriginalTitle}
                      </p>
                    )}
                    {(releaseYear || activeMovie.director || isTVSeason) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-content-muted">
                        {releaseYear && (
                          <span className="text-base font-semibold text-content">{releaseYear}</span>
                        )}
                        {activeMovie.director && (
                          <>
                            {releaseYear && <span aria-hidden="true">&middot;</span>}
                            <span>
                              {isTVSeason ? 'Created by ' : 'Directed by '}
                              <strong className="font-semibold text-content">
                                {activeMovie.director}
                              </strong>
                            </span>
                          </>
                        )}
                        {isTVSeason && (
                          <>
                            {(releaseYear || activeMovie.director) && (
                              <span aria-hidden="true">&middot;</span>
                            )}
                            <span className="rounded bg-purple-600/90 px-1.5 py-0.5 text-xs font-semibold text-white">
                              TV
                            </span>
                            {activeMovie.season_number != null && (
                              <span>Season {activeMovie.season_number}</span>
                            )}
                            {activeMovie.episode_count != null && (
                              <span>
                                ({activeMovie.episode_count}{' '}
                                {activeMovie.episode_count === 1 ? 'episode' : 'episodes'})
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Letterboxd Personal Activity Banner */}
                  <LetterboxdActivityBanner movie={activeMovie} />

                  {/* Format, Series & Genre pills */}
                  <div className="flex flex-wrap items-center gap-2">
                    {movieFormats.map((format, i) => (
                      <span
                        key={i}
                        className={`${formatColor(format)} rounded-full px-3 py-1 text-xs font-semibold shadow-sm`}
                      >
                        {format}
                      </span>
                    ))}
                    {activeMovie.series?.map((s) => (
                      <span
                        key={s.id}
                        className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      >
                        {s.name}
                      </span>
                    ))}
                    {activeMovie.genres?.map((g) => (
                      <span
                        key={g.id}
                        className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700/80 dark:text-gray-200"
                      >
                        {g.name}
                      </span>
                    ))}
                  </div>

                  {/* Synopsis */}
                  {activeMovie.synopsis && (
                    <div>
                      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-content-muted">
                        Synopsis
                      </h4>
                      <p className="text-base leading-relaxed text-content">
                        {activeMovie.synopsis}
                      </p>
                    </div>
                  )}

                  {/* Credits */}
                  {activeMovie.cast && activeMovie.cast.length > 0 && (
                    <div className="border-t border-subtle/60 pt-4">
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-content-muted">
                        Cast
                      </h4>
                      <p className="text-sm leading-relaxed text-content">
                        {activeMovie.cast.join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Secondary Focus: Bottom-Anchored Physical Item Overview */}
          <section
            aria-labelledby="detail-overview-heading"
            className="space-y-3 border-t border-subtle bg-surface-sunken/60 px-6 py-4"
          >
            <h2 id="detail-overview-heading" className="sr-only">
              Physical item overview
            </h2>

            {hasPackagePhotos && activeMovie?.cover_art_url && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowCustomArt((v) => !v)}
                  className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                  {showCustomArt
                    ? 'Show movie poster'
                    : packagePhotos.length > 1
                      ? `Show package photos (${packagePhotos.length})`
                      : 'Show package photo'}
                </button>
              </div>
            )}

            {hasDetailFields && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {showOverallFormats && (
                  <div>
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                      Overall formats
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {physicalItem.physical_format.map((format, idx) => (
                        <span
                          key={idx}
                          className={`${formatColor(format)} rounded-full px-2.5 py-0.5 text-xs font-semibold`}
                        >
                          {format}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {editionTags.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                      Edition
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {editionTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-amber-100/80 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {physicalItem.shelf_placement && (
                  <div>
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                      Shelf location
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-content">
                      <svg
                        className="h-3.5 w-3.5 shrink-0 text-primary-500"
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
                        {(physicalItem.shelf_placement as any).group_display_name && (
                          <>{(physicalItem.shelf_placement as any).group_display_name} &rsaquo; </>
                        )}
                        {(physicalItem.shelf_placement as any).shelf_display_name || 'Shelf'}, Position{' '}
                        {physicalItem.shelf_placement.position + 1}
                      </span>
                    </div>
                  </div>
                )}

                {physicalItem.purchase_date && (
                  <div>
                    <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                      Purchase date
                    </h3>
                    <p className="text-xs font-medium text-content">
                      {new Date(physicalItem.purchase_date).toLocaleDateString()}
                    </p>
                  </div>
                )}

                {hasCost && (
                  <div>
                    <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                      Cost
                    </h3>
                    <p className="text-xs font-medium text-content">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      }).format(Number(physicalItem.cost))}
                    </p>
                  </div>
                )}

                {barcodeInfo && (
                  <div>
                    <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                      {barcodeInfo.type}
                    </h3>
                    <p className="font-mono text-xs font-medium text-content">
                      {barcodeInfo.normalized}
                    </p>
                  </div>
                )}

                {physicalItem.asin && (
                  <div>
                    <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                      ASIN
                    </h3>
                    <p className="font-mono text-xs font-medium text-content">
                      {physicalItem.asin}
                    </p>
                  </div>
                )}

                {hasThickness && (
                  <div>
                    <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                      Case thickness
                    </h3>
                    <p className="text-xs font-medium text-content">
                      {physicalItem.thickness_units} standard cases (
                      {(physicalItem.thickness_units * STANDARD_UNIT_MM).toFixed(1)}mm)
                    </p>
                  </div>
                )}

                {hasStoreLinks && (
                  <div>
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                      Store / release links
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {physicalItem.store_links!
                        .filter((link) => /^https?:\/\//i.test(link.url || ''))
                        .map((link, idx) => (
                        <a
                          key={idx}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-primary-600 shadow-sm hover:underline dark:text-primary-400"
                        >
                          {link.label}
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isMultiTitle && hasAnyLetterboxdInItem && (
              <div
                data-testid="letterboxd-multi-watch-log"
                className="rounded-lg border border-subtle/60 bg-surface p-2.5"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                    <LetterboxdDotsIcon className="h-2.5 w-auto" />
                    <span>
                      Letterboxd Watch Log ({watchedMediaCount} of {mediaList.length} watched)
                    </span>
                  </h3>
                </div>
                <div className="divide-y divide-subtle/40">
                  {mediaList.map((m, idx) => {
                    const isWatched = hasLetterboxdActivity(m);
                    const stars = formatStarString(m.letterboxd_rating);
                    const watchedDate = formatWatchedDate(m.letterboxd_last_watched_date);
                    const yr = m.release_date ? new Date(m.release_date).getFullYear() : null;
                    return (
                      <button
                        key={m.link_id ?? `media-${idx}`}
                        type="button"
                        onClick={() => setActiveMediaIndex(idx)}
                        className={`grid w-full grid-cols-[minmax(0,1fr)_4.5rem_1.25rem_9.75rem] items-center gap-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-sunken/70 ${
                          idx === safeIndex ? 'font-semibold text-content' : 'text-content-muted'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                              isWatched
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-surface-sunken text-content-muted'
                            }`}
                            aria-hidden="true"
                          >
                            {isWatched ? '✓' : '○'}
                          </span>
                          <span className="truncate text-content">
                            {m.title}
                            {yr ? ` (${yr})` : ''}
                            {m.version_notes ? ` · ${m.version_notes}` : ''}
                          </span>
                        </div>
                        <span className="text-left font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
                          {stars || ''}
                        </span>
                        <span className="text-center text-orange-500 dark:text-orange-400" title={m.letterboxd_liked ? 'Liked' : undefined}>
                          {m.letterboxd_liked ? '♥' : ''}
                        </span>
                        <span className="text-left text-[11px] tabular-nums text-content-muted">
                          {watchedDate
                            ? `Last watched ${watchedDate}`
                            : isWatched
                              ? 'Watched'
                              : 'Unwatched'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {physicalItem.notes && (
              <div className="rounded-lg border border-subtle/60 bg-surface p-2.5">
                <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                  Notes
                </h3>
                <p className="whitespace-pre-wrap text-xs text-content">{physicalItem.notes}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-subtle/50 pt-2 text-[11px] text-content-muted">
              <div>
                {physicalItem.sort_name && (
                  <span>
                    <span className="font-medium">Sort name:</span> {physicalItem.sort_name}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3">
                {physicalItem.created_at && (
                  <span>Added: {new Date(physicalItem.created_at).toLocaleDateString()}</span>
                )}
                {physicalItem.updated_at && physicalItem.updated_at !== physicalItem.created_at && (
                  <span>Updated: {new Date(physicalItem.updated_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MediaDetailModal;
