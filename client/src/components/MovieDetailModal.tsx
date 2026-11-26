import React, { useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CollectionMedia } from '../types';
import { lockBodyScroll } from './ui/Sheet';
import { Button } from './ui/Button';
import { VisuallyHidden } from './ui/VisuallyHidden';
import { formatBadgeClasses } from '../lib/formats';
import { parseEditionTags } from '../lib/editionTags';
import { getDistinctOriginalTitle } from '../lib/titles';
import { LetterboxdActivityBanner } from './LetterboxdBadge';

interface MovieDetailModalProps {
  media: CollectionMedia | null;
  isOpen: boolean;
  onClose: () => void;
  onEditMovie?: (media: CollectionMedia) => void;
  onViewPhysicalItem?: (physicalItemId: number, mediaId: number) => void;
  onEditPhysicalItem?: (physicalItemId: number) => void;
  onFilterByDirector?: (director: string) => void;
  onFilterBySeries?: (seriesId: number) => void;
  onFilterByGenre?: (genreId: number) => void;
  loadingPhysicalItemId?: number | null;
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

const MovieDetailModal: React.FC<MovieDetailModalProps> = ({
  media,
  isOpen,
  onClose,
  onEditMovie,
  onViewPhysicalItem,
  onEditPhysicalItem,
  onFilterByDirector,
  onFilterBySeries,
  onFilterByGenre,
  loadingPhysicalItemId = null,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement;
    const timer = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(focusableSelector);
      (focusable[0] ?? panel).focus();
    });
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleDocumentKeyDown);
    const restore = lockBodyScroll(true);
    return () => {
      cancelAnimationFrame(timer);
      document.removeEventListener('keydown', handleDocumentKeyDown);
      restore();
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [isOpen, onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
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
    [onClose]
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen || !media) return null;

  const releaseYear = media.release_date
    ? (() => {
        const yr = new Date(media.release_date).getFullYear();
        return Number.isNaN(yr) ? null : yr;
      })()
    : null;
  const isTVSeason = media.media_type === 'tv_season';
  const distinctOriginalTitle = getDistinctOriginalTitle(media);
  const ownedItems = media.physical_items ?? [];
  const ownedFormats = media.owned_formats ?? [];
  const ownedVersions = media.owned_versions ?? [];
  const directorNames = media.director
    ? media.director
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)
    : [];

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
        aria-labelledby="movie-detail-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="grid max-h-[88dvh] w-full max-w-6xl overflow-hidden rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-white/10 outline-none lg:grid-cols-[46%_54%]"
      >
        {/* Left Stage: Ambient Movie Poster Showcase */}
        <div className="relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden bg-neutral-950 p-6 sm:p-10 lg:min-h-[600px]">
          {media.cover_art_url && (
            <img
              src={media.cover_art_url}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-3xl saturate-150"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/50" />

          {media.physical_item_count > 1 && (
            <div className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-md ring-1 ring-white/15">
              <span>{media.physical_item_count} physical releases owned</span>
            </div>
          )}

          {/* Poster Frame */}
          <div className="relative z-10 flex items-center justify-center">
            {media.cover_art_url ? (
              <img
                src={media.cover_art_url}
                alt={media.title}
                width={360}
                height={540}
                decoding="async"
                className="max-h-[340px] w-auto rounded-xl object-contain shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] ring-1 ring-white/15 sm:max-h-[430px] lg:max-h-[520px]"
              />
            ) : (
              <div className="aspect-[2/3] w-56 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/15 sm:w-64">
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
        </div>

        {/* Right Pane: Movie Hero + Owned Releases */}
        <div className="flex max-h-[88dvh] flex-col justify-between overflow-y-auto lg:overflow-hidden">
          {/* Top Header */}
          <div className="flex items-center justify-between gap-4 border-b border-subtle px-6 py-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-xs font-semibold uppercase tracking-wider text-content-muted">
                {isTVSeason ? 'TV Season' : 'Movie'}
              </span>
              {media.physical_item_count > 0 && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-content-muted">
                  {media.physical_item_count}{' '}
                  {media.physical_item_count === 1 ? 'release' : 'releases'}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onEditMovie && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onEditMovie(media)}
                  aria-label={`Edit ${media.title}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    <span>Edit movie</span>
                  </span>
                </Button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${media.title}`}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[--radius-control] text-content-muted transition-colors hover:bg-surface-sunken hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <VisuallyHidden>Close</VisuallyHidden>
              </button>
            </div>
          </div>

          {/* Scrollable Movie Details */}
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
            <section aria-labelledby="movie-detail-title" className="space-y-5">
              <div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                  <h2
                    id="movie-detail-title"
                    className="text-3xl font-extrabold tracking-tight text-content sm:text-4xl"
                  >
                    {media.title}
                  </h2>
                  {ownedVersions.map((tag) => (
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
                {(releaseYear || directorNames.length > 0 || isTVSeason) && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-content-muted">
                    {releaseYear && (
                      <span className="text-base font-semibold text-content">{releaseYear}</span>
                    )}
                    {directorNames.length > 0 && (
                      <>
                        {releaseYear && <span aria-hidden="true">&middot;</span>}
                        <span>
                          {isTVSeason ? 'Created by ' : 'Directed by '}
                          {directorNames.map((name, idx) => (
                            <React.Fragment key={name}>
                              {idx > 0 && ', '}
                              {onFilterByDirector && !isTVSeason ? (
                                <button
                                  type="button"
                                  onClick={() => onFilterByDirector(name)}
                                  className="font-semibold text-content underline-offset-2 hover:text-primary-600 hover:underline dark:hover:text-primary-400"
                                >
                                  {name}
                                </button>
                              ) : (
                                <strong className="font-semibold text-content">{name}</strong>
                              )}
                            </React.Fragment>
                          ))}
                        </span>
                      </>
                    )}
                    {isTVSeason && (
                      <>
                        {(releaseYear || directorNames.length > 0) && (
                          <span aria-hidden="true">&middot;</span>
                        )}
                        <span className="rounded bg-purple-600/90 px-1.5 py-0.5 text-xs font-semibold text-white">
                          TV
                        </span>
                        {media.season_number != null && <span>Season {media.season_number}</span>}
                        {media.episode_count != null && (
                          <span>
                            ({media.episode_count}{' '}
                            {media.episode_count === 1 ? 'episode' : 'episodes'})
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Letterboxd Personal Activity Banner */}
              <LetterboxdActivityBanner movie={media} />

              {/* Formats, Series & Genres */}
              <div className="flex flex-wrap items-center gap-2">
                {ownedFormats.map((format) => (
                  <span
                    key={format}
                    className={`${formatColor(format)} rounded-full px-3 py-1 text-xs font-semibold shadow-sm`}
                  >
                    {format}
                  </span>
                ))}
                {media.series?.map((s) =>
                  onFilterBySeries ? (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onFilterBySeries(s.id)}
                      className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/55"
                    >
                      {s.name}
                    </button>
                  ) : (
                    <span
                      key={s.id}
                      className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                    >
                      {s.name}
                    </span>
                  )
                )}
                {media.genres?.map((g) =>
                  onFilterByGenre ? (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => onFilterByGenre(g.id)}
                      className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700/80 dark:text-gray-200 dark:hover:bg-gray-600"
                    >
                      {g.name}
                    </button>
                  ) : (
                    <span
                      key={g.id}
                      className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700/80 dark:text-gray-200"
                    >
                      {g.name}
                    </span>
                  )
                )}
              </div>

              {/* Synopsis */}
              {media.synopsis && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-content-muted">
                    Synopsis
                  </h3>
                  <p className="text-base leading-relaxed text-content">{media.synopsis}</p>
                </div>
              )}

              {/* Cast */}
              {media.cast && media.cast.length > 0 && (
                <div className="border-t border-subtle/60 pt-4">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-content-muted">
                    Cast
                  </h3>
                  <p className="text-sm leading-relaxed text-content">{media.cast.join(', ')}</p>
                </div>
              )}
            </section>
          </div>

          {/* Bottom-Anchored Owned Releases Section */}
          <section
            aria-labelledby="movie-owned-releases-heading"
            className="border-t border-subtle bg-surface-sunken/60 px-6 py-4"
          >
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h3
                id="movie-owned-releases-heading"
                className="text-[11px] font-semibold uppercase tracking-wider text-content-muted"
              >
                In your collection ({ownedItems.length}{' '}
                {ownedItems.length === 1 ? 'release' : 'releases'})
              </h3>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto pr-0.5">
              {ownedItems.map((item) => {
                const itemFormats =
                  item.formats && item.formats.length > 0 ? item.formats : item.physical_format;
                const itemEditionTags = parseEditionTags(item.edition_notes);
                const itemVersionTags = parseEditionTags(item.version_notes);
                const isBoxSet = item.media_count > 1;
                const isLoadingThis = loadingPhysicalItemId === item.id;
                const hasCost =
                  item.cost !== null && item.cost !== undefined && Number.isFinite(Number(item.cost));

                return (
                  <div
                    key={item.id}
                    data-testid={`owned-release-${item.id}`}
                    className="flex items-start justify-between gap-3 rounded-xl border border-subtle/70 bg-surface p-3 shadow-sm transition-colors hover:border-primary-500/40"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {item.custom_image_url ? (
                        <img
                          src={item.custom_image_url}
                          alt=""
                          aria-hidden="true"
                          className="h-14 w-10 shrink-0 rounded-md object-cover bg-surface-sunken ring-1 ring-black/10 dark:ring-white/10"
                        />
                      ) : (
                        <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-content-muted ring-1 ring-subtle">
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            {isBoxSet ? (
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.75}
                                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                              />
                            ) : (
                              <>
                                <circle cx="12" cy="12" r="9" strokeWidth={1.75} />
                                <circle cx="12" cy="12" r="2.5" strokeWidth={1.75} />
                              </>
                            )}
                          </svg>
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-semibold text-content">
                            {item.name}
                          </p>
                          {isBoxSet && (
                            <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold text-content-muted ring-1 ring-subtle">
                              Box set · {item.media_count} titles
                            </span>
                          )}
                          {item.archived && (
                            <span className="rounded bg-amber-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              Archived
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                          {itemFormats.map((fmt) => (
                            <span
                              key={fmt}
                              className={`${formatColor(fmt)} rounded-full px-2 py-0.5 text-[11px] font-semibold`}
                            >
                              {fmt}
                            </span>
                          ))}
                          {itemEditionTags.map((tag) => (
                            <span
                              key={`ed-${tag}`}
                              className="rounded-md bg-amber-100/80 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                            >
                              {tag}
                            </span>
                          ))}
                          {itemVersionTags.map((tag) => (
                            <span
                              key={`ver-${tag}`}
                              className="rounded-md bg-primary-100/70 px-1.5 py-0.5 text-[11px] font-medium text-primary-800 dark:bg-primary-900/35 dark:text-primary-200"
                            >
                              {tag}
                            </span>
                          ))}
                          {item.disc_number != null && (
                            <span className="text-[11px] text-content-muted">
                              Disc {item.disc_number}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-content-muted">
                          {item.shelf_placement && (
                            <span className="inline-flex items-center gap-1 font-medium text-content">
                              <svg
                                className="h-3 w-3 shrink-0 text-primary-500"
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
                                {item.shelf_placement.group_display_name && (
                                  <>{item.shelf_placement.group_display_name} &rsaquo; </>
                                )}
                                {item.shelf_placement.shelf_display_name || 'Shelf'}, Pos{' '}
                                {item.shelf_placement.position + 1}
                              </span>
                            </span>
                          )}
                          {item.purchase_date && (
                            <span>
                              Purchased {new Date(item.purchase_date).toLocaleDateString()}
                            </span>
                          )}
                          {hasCost && <span>{formatCurrency(Number(item.cost))}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {onViewPhysicalItem && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          isLoading={isLoadingThis}
                          disabled={loadingPhysicalItemId !== null}
                          onClick={() => onViewPhysicalItem(item.id, media.id)}
                          aria-label={`View release ${item.name}`}
                        >
                          View item
                        </Button>
                      )}
                      {onEditPhysicalItem && (
                        <button
                          type="button"
                          onClick={() => onEditPhysicalItem(item.id)}
                          disabled={loadingPhysicalItemId !== null}
                          aria-label={`Edit release ${item.name}`}
                          title={`Edit ${item.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[--radius-control] border border-subtle bg-surface-raised text-content-muted transition-colors hover:bg-surface-sunken hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MovieDetailModal;
