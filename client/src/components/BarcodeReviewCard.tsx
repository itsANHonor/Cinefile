import React, { useState } from 'react';
import {
  BarcodeLookupItemResult,
  BarcodeMovieCandidate,
  BarcodeTVCandidate,
  CollectionFacetEdition,
  TMDbCollectionSearchResult,
  TMDbMovie,
  TMDbTVShow,
} from '../types';
import { apiService } from '../services/api.service';
import { PHYSICAL_FORMATS } from '../lib/formats';
import { detectBarcode } from '../lib/identifiers';
import { generatePhysicalItemName, sortTVSeasons } from '../lib/tvNaming';
import { EditionTagInput } from './EditionTagInput';
import { Button } from './ui/Button';

export type ReviewMode = 'movie' | 'boxset' | 'tv';

export interface BarcodeReviewDraft {
  barcode: string;
  include: boolean;
  mode: ReviewMode;
  itemName: string;
  itemNameManuallyEdited: boolean;
  formats: string[];
  editionNotes: string;
  asin: string;
  // Single movie mode
  movieCandidates: BarcodeMovieCandidate[];
  selectedMovieId: number | null;
  // Multi-movie box set mode
  boxSetMovies: BarcodeMovieCandidate[];
  collectionMoviesPool: BarcodeMovieCandidate[];
  collectionName: string | null;
  // TV mode
  tvCandidates: BarcodeTVCandidate[];
  selectedTVId: number | null;
  selectedSeasonNumbers: number[];
}

export function createInitialReviewDraft(item: BarcodeLookupItemResult): BarcodeReviewDraft {
  const parsed = item.parsed;
  const hasOwned = item.ownedItems.length > 0;
  const hasCollection = Boolean(item.collectionSuggestion && item.collectionSuggestion.parts.length > 1);
  const hasTV = item.tvMatches.length > 0 && (parsed?.mediaTypeHint === 'tv' || item.movieMatches.length === 0);

  let mode: ReviewMode = 'movie';
  if (hasTV) {
    mode = 'tv';
  } else if (hasCollection) {
    mode = 'boxset';
  }

  const selectedMovie = item.movieMatches[0] || null;
  const selectedTV = item.tvMatches[0] || null;

  let selectedSeasonNumbers: number[] = [];
  if (selectedTV) {
    const regularSeasons = sortTVSeasons(selectedTV.seasons).filter((s) => s.season_number > 0);
    if (parsed?.seasonHints && parsed.seasonHints.length > 0) {
      selectedSeasonNumbers = parsed.seasonHints.filter((n) =>
        selectedTV.seasons.some((s) => s.season_number === n)
      );
    }
    if (selectedSeasonNumbers.length === 0 && regularSeasons.length > 0) {
      if (parsed && /\bcomplete\s+series\b/i.test(item.product?.title || '')) {
        selectedSeasonNumbers = regularSeasons.map((s) => s.season_number);
      } else {
        selectedSeasonNumbers = [regularSeasons[0].season_number];
      }
    }
  }

  const boxSetMovies = hasCollection
    ? [...item.collectionSuggestion!.parts]
    : selectedMovie
      ? [selectedMovie]
      : [];

  let itemName = parsed?.suggestedItemName || item.product?.title || '';
  if (mode === 'movie' && selectedMovie) {
    itemName = selectedMovie.title;
  } else if (mode === 'boxset') {
    itemName = parsed?.suggestedItemName || item.collectionSuggestion?.name || itemName;
  } else if (mode === 'tv' && selectedTV) {
    const entries = selectedSeasonNumbers.map((num) => ({
      title: `${selectedTV.name} - Season ${num}`,
      media_type: 'tv_season' as const,
      tv_show_name: selectedTV.name,
      tv_show_tmdb_id: selectedTV.id,
      season_number: num,
      tv_show_total_seasons: selectedTV.number_of_seasons,
    }));
    itemName = entries.length > 0 ? generatePhysicalItemName(entries) : selectedTV.name;
  }

  return {
    barcode: item.barcode,
    include: !hasOwned && (Boolean(selectedMovie) || hasCollection || Boolean(selectedTV)),
    mode,
    itemName,
    itemNameManuallyEdited: false,
    formats: parsed?.suggestedFormats ? [...parsed.suggestedFormats] : [],
    editionNotes: parsed?.suggestedEditionTags?.join(', ') || '',
    asin: item.product?.asin || '',
    movieCandidates: item.movieMatches,
    selectedMovieId: selectedMovie?.id ?? null,
    boxSetMovies,
    collectionMoviesPool: item.collectionSuggestion?.parts || [],
    collectionName: item.collectionSuggestion?.name || null,
    tvCandidates: item.tvMatches,
    selectedTVId: selectedTV?.id ?? null,
    selectedSeasonNumbers,
  };
}

interface BarcodeReviewCardProps {
  result: BarcodeLookupItemResult;
  draft: BarcodeReviewDraft;
  availableEditions: CollectionFacetEdition[];
  onChange: (next: BarcodeReviewDraft) => void;
}

const getPosterUrl = (posterUrl?: string | null, posterPath?: string | null): string | undefined => {
  if (posterUrl) return posterUrl;
  if (posterPath) return `https://image.tmdb.org/t/p/w200${posterPath}`;
  return undefined;
};

const BarcodeReviewCard: React.FC<BarcodeReviewCardProps> = ({
  result,
  draft,
  availableEditions,
  onChange,
}) => {
  const [showRawDetails, setShowRawDetails] = useState(false);

  // Inline TMDb search state
  const [searchQuery, setSearchQuery] = useState(
    result.parsed?.cleanedQuery || result.product?.title || ''
  );
  const [isSearchingTmdb, setIsSearchingTmdb] = useState(false);
  const [movieSearchResults, setMovieSearchResults] = useState<TMDbMovie[]>([]);
  const [tvSearchResults, setTvSearchResults] = useState<TMDbTVShow[]>([]);
  const [collectionSearchResults, setCollectionSearchResults] = useState<TMDbCollectionSearchResult[]>([]);
  const [searchTab, setSearchTab] = useState<'movies' | 'collections'>('movies');
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const barcodeInfo = detectBarcode(result.barcode);
  const selectedMovie =
    draft.movieCandidates.find((m) => m.id === draft.selectedMovieId) || null;
  const selectedTV =
    draft.tvCandidates.find((t) => t.id === draft.selectedTVId) || null;

  const isMissingMedia =
    (draft.mode === 'movie' && !selectedMovie) ||
    (draft.mode === 'boxset' && draft.boxSetMovies.length === 0) ||
    (draft.mode === 'tv' && (!selectedTV || draft.selectedSeasonNumbers.length === 0));
  const isMissingFormat = draft.formats.length === 0;

  const updateDraft = (patch: Partial<BarcodeReviewDraft>) => {
    onChange({ ...draft, ...patch });
  };

  const handleModeChange = (nextMode: ReviewMode) => {
    if (nextMode === draft.mode) return;
    const patch: Partial<BarcodeReviewDraft> = { mode: nextMode };
    setMovieSearchResults([]);
    setTvSearchResults([]);
    setCollectionSearchResults([]);
    setSearchError(null);

    if (nextMode === 'boxset' && draft.boxSetMovies.length === 0 && selectedMovie) {
      patch.boxSetMovies = [selectedMovie];
    }
    if (nextMode === 'movie' && !draft.selectedMovieId && draft.boxSetMovies[0]) {
      const first = draft.boxSetMovies[0];
      patch.selectedMovieId = first.id;
      if (!draft.movieCandidates.some((m) => m.id === first.id)) {
        patch.movieCandidates = [first, ...draft.movieCandidates];
      }
      if (!draft.itemNameManuallyEdited) {
        patch.itemName = first.title;
      }
    }
    updateDraft(patch);
  };

  const handleFormatToggle = (format: string) => {
    const nextFormats = draft.formats.includes(format)
      ? draft.formats.filter((f) => f !== format)
      : [...draft.formats, format];
    updateDraft({ formats: nextFormats });
  };

  const fetchFullMovieCandidate = async (movieId: number): Promise<BarcodeMovieCandidate> => {
    const details = await apiService.getMovieDetails(movieId);
    return {
      id: details.id,
      title: details.title,
      original_title: details.original_title,
      original_language: details.original_language,
      overview: details.overview || '',
      poster_path: details.poster_path || null,
      poster_url:
        details.poster_url ||
        (details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null),
      release_date: details.release_date || '',
      runtime: details.runtime,
      director: details.director || null,
      cast: details.cast || [],
      genres: details.genres,
      belongs_to_collection: (details as any).belongs_to_collection || null,
    };
  };

  const handleRunSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearchingTmdb(true);
    setSearchError(null);
    try {
      if (draft.mode === 'tv') {
        const res = await apiService.searchTV(q, 1);
        setTvSearchResults(res.results.slice(0, 8));
        if (res.results.length === 0) setSearchError(`No TV shows found for "${q}".`);
      } else if (draft.mode === 'boxset' && searchTab === 'collections') {
        const res = await apiService.searchCollections(q, 1);
        setCollectionSearchResults(res.results.slice(0, 6));
        if (res.results.length === 0) setSearchError(`No TMDb collections found for "${q}".`);
      } else {
        const res = await apiService.searchMovies(q, 1);
        setMovieSearchResults(res.results.slice(0, 8));
        if (res.results.length === 0) setSearchError(`No movies found for "${q}".`);
      }
    } catch (err: any) {
      setSearchError(err?.response?.data?.error || err?.message || 'TMDb search failed.');
    } finally {
      setIsSearchingTmdb(false);
    }
  };

  const handlePickSearchedMovie = async (movie: TMDbMovie) => {
    setIsLoadingDetails(true);
    setSearchError(null);
    try {
      const full = await fetchFullMovieCandidate(movie.id);
      if (draft.mode === 'movie') {
        const nextCandidates = [
          full,
          ...draft.movieCandidates.filter((m) => m.id !== full.id),
        ];
        updateDraft({
          movieCandidates: nextCandidates,
          selectedMovieId: full.id,
          itemName: draft.itemNameManuallyEdited ? draft.itemName : full.title,
          include: result.ownedItems.length === 0 ? true : draft.include,
        });
        setMovieSearchResults([]);
      } else {
        if (!draft.boxSetMovies.some((m) => m.id === full.id)) {
          const nextMovies = [...draft.boxSetMovies, full];
          updateDraft({
            boxSetMovies: nextMovies,
            include: result.ownedItems.length === 0 ? true : draft.include,
            itemName:
              draft.itemNameManuallyEdited || draft.itemName
                ? draft.itemName
                : generatePhysicalItemName(nextMovies.map((m) => ({ title: m.title, media_type: 'movie' }))),
          });
        }
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to fetch movie details.');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleLoadCollectionById = async (collectionId: number, fallbackName?: string) => {
    setIsLoadingDetails(true);
    setSearchError(null);
    try {
      const details = await apiService.getCollectionDetails(collectionId);
      const rawParts: any[] = Array.isArray(details?.parts) ? details.parts : [];
      const sorted = [...rawParts].sort((a, b) =>
        (a.release_date || '9999').localeCompare(b.release_date || '9999')
      );
      const fullParts = await Promise.all(
        sorted.slice(0, 15).map(async (part) => {
          try {
            return await fetchFullMovieCandidate(part.id);
          } catch {
            return {
              id: part.id,
              title: part.title,
              overview: part.overview || '',
              poster_path: part.poster_path || null,
              poster_url: part.poster_path
                ? `https://image.tmdb.org/t/p/w500${part.poster_path}`
                : null,
              release_date: part.release_date || '',
              director: null,
              cast: [],
            } as BarcodeMovieCandidate;
          }
        })
      );

      updateDraft({
        mode: 'boxset',
        collectionName: details?.name || fallbackName || null,
        collectionMoviesPool: fullParts,
        boxSetMovies: fullParts,
        itemName: draft.itemNameManuallyEdited
          ? draft.itemName
          : result.parsed?.suggestedItemName || details?.name || draft.itemName,
        include: result.ownedItems.length === 0 ? true : draft.include,
      });
      setCollectionSearchResults([]);
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to load TMDb collection.');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleToggleBoxSetPoolMovie = (movie: BarcodeMovieCandidate) => {
    const exists = draft.boxSetMovies.some((m) => m.id === movie.id);
    const nextMovies = exists
      ? draft.boxSetMovies.filter((m) => m.id !== movie.id)
      : [...draft.boxSetMovies, movie].sort((a, b) =>
          (a.release_date || '9999').localeCompare(b.release_date || '9999')
        );
    updateDraft({ boxSetMovies: nextMovies });
  };

  const handleRemoveBoxSetMovie = (movieId: number) => {
    updateDraft({
      boxSetMovies: draft.boxSetMovies.filter((m) => m.id !== movieId),
    });
  };

  const handlePickSearchedTV = async (show: TMDbTVShow) => {
    setIsLoadingDetails(true);
    setSearchError(null);
    try {
      const details = await apiService.getTVDetails(show.id);
      const candidate: BarcodeTVCandidate = {
        id: details.id,
        name: details.name,
        original_name: details.original_name,
        original_language: details.original_language,
        overview: details.overview || '',
        poster_path: details.poster_path || null,
        poster_url:
          details.poster_url ||
          (details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null),
        first_air_date: details.first_air_date || '',
        number_of_seasons: details.number_of_seasons || 0,
        creators: details.creators || null,
        cast: details.cast || [],
        genres: details.genres,
        seasons: (details.seasons || [])
          .filter((s) => s.season_number >= 0)
          .map((s) => ({
            id: s.id,
            name: s.name,
            overview: s.overview || '',
            poster_path: s.poster_path || null,
            poster_url: s.poster_path
              ? `https://image.tmdb.org/t/p/w500${s.poster_path}`
              : null,
            air_date: s.air_date || '',
            season_number: s.season_number,
            episode_count: s.episode_count || 0,
          })),
      };

      const regular = sortTVSeasons(candidate.seasons).filter((s) => s.season_number > 0);
      const defaultSeasons = regular.length > 0 ? [regular[0].season_number] : [];
      const autoName =
        defaultSeasons.length > 0
          ? generatePhysicalItemName(
              defaultSeasons.map((num) => ({
                title: `${candidate.name} - Season ${num}`,
                media_type: 'tv_season',
                tv_show_name: candidate.name,
                tv_show_tmdb_id: candidate.id,
                season_number: num,
                tv_show_total_seasons: candidate.number_of_seasons,
              }))
            )
          : candidate.name;

      updateDraft({
        tvCandidates: [candidate, ...draft.tvCandidates.filter((t) => t.id !== candidate.id)],
        selectedTVId: candidate.id,
        selectedSeasonNumbers: defaultSeasons,
        itemName: draft.itemNameManuallyEdited ? draft.itemName : autoName,
        include: result.ownedItems.length === 0 ? true : draft.include,
      });
      setTvSearchResults([]);
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to fetch TV show details.');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleToggleTVSeason = (seasonNumber: number) => {
    if (!selectedTV) return;
    const nextSeasons = draft.selectedSeasonNumbers.includes(seasonNumber)
      ? draft.selectedSeasonNumbers.filter((n) => n !== seasonNumber)
      : [...draft.selectedSeasonNumbers, seasonNumber].sort((a, b) => a - b);

    const autoName =
      nextSeasons.length > 0
        ? generatePhysicalItemName(
            nextSeasons.map((num) => ({
              title: `${selectedTV.name} - Season ${num}`,
              media_type: 'tv_season',
              tv_show_name: selectedTV.name,
              tv_show_tmdb_id: selectedTV.id,
              season_number: num,
              tv_show_total_seasons: selectedTV.number_of_seasons,
            }))
          )
        : selectedTV.name;

    updateDraft({
      selectedSeasonNumbers: nextSeasons,
      itemName: draft.itemNameManuallyEdited ? draft.itemName : autoName,
    });
  };

  const primaryPoster =
    draft.mode === 'movie'
      ? getPosterUrl(selectedMovie?.poster_url, selectedMovie?.poster_path)
      : draft.mode === 'tv'
        ? getPosterUrl(selectedTV?.poster_url, selectedTV?.poster_path)
        : getPosterUrl(
            draft.boxSetMovies[0]?.poster_url || result.collectionSuggestion?.poster_url,
            draft.boxSetMovies[0]?.poster_path
          );

  const statusBadge =
    result.status === 'resolved'
      ? result.source === 'cache'
        ? { label: 'Cached', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' }
        : { label: 'UPCitemdb', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' }
      : result.status === 'rate_limited'
        ? { label: 'Rate Limited', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' }
        : { label: 'Not in UPC DB', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };

  return (
    <div
      className={`rounded-[--radius-card] border p-4 space-y-3.5 transition-colors ${
        draft.include
          ? 'border-subtle bg-surface'
          : 'border-subtle/70 bg-surface-sunken/40 opacity-75'
      }`}
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.include}
              onChange={(e) => updateDraft({ include: e.target.checked })}
              aria-label={`Include barcode ${result.barcode}`}
              className="h-4 w-4 rounded border-subtle text-primary-600 focus:ring-primary-500"
            />
            <span className="font-mono text-xs font-semibold text-content">
              {barcodeInfo?.normalized || result.barcode}
            </span>
          </label>

          {barcodeInfo && barcodeInfo.type !== 'Barcode' && (
            <span className="rounded bg-surface-sunken border border-subtle px-1.5 py-0.5 text-[10px] font-semibold text-content-muted">
              {barcodeInfo.type}
            </span>
          )}

          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>

          {draft.asin && (
            <span className="rounded bg-surface-sunken border border-subtle px-1.5 py-0.5 text-[10px] font-mono text-content-muted">
              ASIN: {draft.asin}
            </span>
          )}

          {result.ownedItems.length > 0 && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
              Already in collection ({result.ownedItems[0].name})
            </span>
          )}
        </div>

        {/* Mode Switcher */}
        <div className="inline-flex rounded-[--radius-control] border border-subtle bg-surface-sunken p-0.5 text-xs">
          {(
            [
              { id: 'movie', label: 'Movie' },
              { id: 'boxset', label: 'Box Set' },
              { id: 'tv', label: 'TV Show' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleModeChange(tab.id)}
              className={`px-2.5 py-1 rounded-[--radius-control] font-medium transition-colors ${
                draft.mode === tab.id
                  ? 'bg-surface text-content shadow-sm'
                  : 'text-content-muted hover:text-content'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Raw retail title banner */}
      {result.product?.title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[--radius-control] bg-surface-sunken/70 px-3 py-1.5 text-xs">
          <div className="min-w-0 truncate text-content-muted">
            <span className="font-medium text-content">Retail title:</span> {result.product.title}
            {result.product.brand ? ` · ${result.product.brand}` : ''}
          </div>
          {(result.product.description || (result.product.offerTitles?.length ?? 0) > 0) && (
            <button
              type="button"
              onClick={() => setShowRawDetails((v) => !v)}
              className="text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
            >
              {showRawDetails ? 'Hide details' : 'Details'}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-[--radius-control] bg-surface-sunken/70 px-3 py-1.5 text-xs text-content-muted">
          {result.error || 'No product match in UPCitemdb — search TMDb below to still link this barcode.'}
        </div>
      )}

      {showRawDetails && result.product && (
        <div className="rounded-[--radius-control] border border-subtle bg-surface-sunken/50 p-2.5 text-xs text-content-muted space-y-1">
          {result.product.description && <p>{result.product.description}</p>}
          {result.product.offerTitles && result.product.offerTitles.length > 0 && (
            <p>
              <span className="font-medium text-content">Store titles:</span>{' '}
              {result.product.offerTitles.slice(0, 4).join(' · ')}
            </p>
          )}
        </div>
      )}

      {result.tmdbWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{result.tmdbWarning}</p>
      )}

      {/* Main Content Body */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Poster */}
        <div className="flex-shrink-0">
          {primaryPoster ? (
            <img
              src={primaryPoster}
              alt={draft.itemName || 'Poster'}
              className="w-16 h-24 object-cover rounded-[--radius-control] border border-subtle"
            />
          ) : (
            <div className="w-16 h-24 rounded-[--radius-control] bg-surface-sunken border border-subtle flex items-center justify-center text-[11px] text-content-muted text-center px-1">
              No Poster
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Physical Item Name */}
          <div>
            <label
              htmlFor={`barcode-item-name-${result.barcode}`}
              className="block text-xs font-medium text-content-muted mb-1"
            >
              Physical Item Name *
            </label>
            <input
              id={`barcode-item-name-${result.barcode}`}
              type="text"
              value={draft.itemName}
              onChange={(e) =>
                updateDraft({ itemName: e.target.value, itemNameManuallyEdited: true })
              }
              placeholder="e.g., Mulholland Drive or Back to the Future Trilogy"
              className="w-full px-3 py-1.5 text-sm border border-subtle rounded-[--radius-control] bg-surface text-content"
            />
          </div>

          {/* MODE 1: Single Movie */}
          {draft.mode === 'movie' && (
            <div className="space-y-2">
              {draft.movieCandidates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-content-muted mb-1">
                    Matched TMDb Movie
                  </label>
                  <select
                    aria-label={`Matched movie for ${result.barcode}`}
                    value={draft.selectedMovieId ?? ''}
                    onChange={(e) => {
                      const id = parseInt(e.target.value, 10);
                      const chosen = draft.movieCandidates.find((m) => m.id === id);
                      if (chosen) {
                        updateDraft({
                          selectedMovieId: chosen.id,
                          itemName: draft.itemNameManuallyEdited ? draft.itemName : chosen.title,
                        });
                      }
                    }}
                    className="w-full px-3 py-1.5 text-sm border border-subtle rounded-[--radius-control] bg-surface text-content"
                  >
                    {draft.movieCandidates.map((movie) => (
                      <option key={movie.id} value={movie.id}>
                        {movie.title} ({movie.release_date?.split('-')[0] || 'Unknown'})
                        {movie.director ? ` — ${movie.director}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedMovie?.belongs_to_collection && (
                <div className="flex items-center justify-between gap-2 rounded-[--radius-control] bg-primary-50/70 dark:bg-primary-900/20 px-2.5 py-1.5 text-xs">
                  <span className="text-primary-800 dark:text-primary-200 truncate">
                    Part of <strong>{selectedMovie.belongs_to_collection.name}</strong>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isLoadingDetails}
                    onClick={() =>
                      handleLoadCollectionById(
                        selectedMovie.belongs_to_collection!.id,
                        selectedMovie.belongs_to_collection!.name
                      )
                    }
                  >
                    Load as Box Set
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* MODE 2: Multi-Movie Box Set */}
          {draft.mode === 'boxset' && (
            <div className="space-y-2.5">
              {draft.collectionMoviesPool.length > 0 && (
                <div className="rounded-[--radius-control] border border-subtle bg-surface-sunken/50 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-content">
                      {draft.collectionName || 'TMDb Collection'} — select included films:
                    </span>
                    <span className="text-content-muted">
                      {draft.boxSetMovies.length} selected
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                    {draft.collectionMoviesPool.map((movie) => {
                      const checked = draft.boxSetMovies.some((m) => m.id === movie.id);
                      return (
                        <label
                          key={movie.id}
                          className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-surface cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleBoxSetPoolMovie(movie)}
                            className="h-3.5 w-3.5 rounded border-subtle text-primary-600"
                          />
                          <span className="truncate text-content">
                            {movie.title}{' '}
                            {movie.release_date && (
                              <span className="text-content-muted">
                                ({movie.release_date.split('-')[0]})
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected movies chips/list (includes manually added movies outside collection) */}
              {draft.boxSetMovies.length > 0 && (
                <div className="space-y-1">
                  <span className="block text-xs font-medium text-content-muted">
                    Movies in this physical item ({draft.boxSetMovies.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.boxSetMovies.map((movie) => (
                      <span
                        key={movie.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-sunken px-2.5 py-1 text-xs text-content"
                      >
                        <span>
                          {movie.title}
                          {movie.release_date ? ` (${movie.release_date.split('-')[0]})` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveBoxSetMovie(movie.id)}
                          aria-label={`Remove ${movie.title}`}
                          className="text-content-muted hover:text-red-500"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE 3: TV Show */}
          {draft.mode === 'tv' && (
            <div className="space-y-2.5">
              {draft.tvCandidates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-content-muted mb-1">
                    Matched TV Show
                  </label>
                  <select
                    aria-label={`Matched TV show for ${result.barcode}`}
                    value={draft.selectedTVId ?? ''}
                    onChange={(e) => {
                      const id = parseInt(e.target.value, 10);
                      const show = draft.tvCandidates.find((t) => t.id === id);
                      if (show) {
                        const regular = sortTVSeasons(show.seasons).filter((s) => s.season_number > 0);
                        const defaultSeasons = regular.length > 0 ? [regular[0].season_number] : [];
                        updateDraft({
                          selectedTVId: show.id,
                          selectedSeasonNumbers: defaultSeasons,
                          itemName: draft.itemNameManuallyEdited
                            ? draft.itemName
                            : defaultSeasons.length > 0
                              ? `${show.name} - Season ${defaultSeasons[0]}`
                              : show.name,
                        });
                      }
                    }}
                    className="w-full px-3 py-1.5 text-sm border border-subtle rounded-[--radius-control] bg-surface text-content"
                  >
                    {draft.tvCandidates.map((show) => (
                      <option key={show.id} value={show.id}>
                        {show.name} ({show.first_air_date?.split('-')[0] || 'Unknown'}) ·{' '}
                        {show.number_of_seasons}{' '}
                        {show.number_of_seasons === 1 ? 'season' : 'seasons'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedTV && selectedTV.seasons.length > 0 && (
                <div>
                  <span className="block text-xs font-medium text-content-muted mb-1.5">
                    Seasons included *
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {sortTVSeasons(selectedTV.seasons).map((season) => {
                      const active = draft.selectedSeasonNumbers.includes(season.season_number);
                      return (
                        <button
                          key={season.id}
                          type="button"
                          onClick={() => handleToggleTVSeason(season.season_number)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                            active
                              ? 'bg-primary-600 text-white border-primary-600'
                              : 'bg-surface border-subtle text-content-muted hover:text-content'
                          }`}
                        >
                          {season.season_number === 0
                            ? 'Specials'
                            : `Season ${season.season_number}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Inline TMDb Search / Re-search */}
          <div className="rounded-[--radius-control] border border-subtle/80 bg-surface-sunken/30 p-2.5 space-y-2">
            <form onSubmit={handleRunSearch} className="flex flex-wrap items-center gap-2">
              {draft.mode === 'boxset' && (
                <select
                  aria-label="Box set search type"
                  value={searchTab}
                  onChange={(e) => {
                    setSearchTab(e.target.value as 'movies' | 'collections');
                    setMovieSearchResults([]);
                    setCollectionSearchResults([]);
                  }}
                  className="px-2 py-1.5 text-xs border border-subtle rounded-[--radius-control] bg-surface text-content"
                >
                  <option value="movies">Add Movie</option>
                  <option value="collections">Load Collection</option>
                </select>
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  draft.mode === 'tv'
                    ? 'Search TMDb TV shows…'
                    : draft.mode === 'boxset' && searchTab === 'collections'
                      ? 'Search TMDb collections (e.g., Back to the Future)…'
                      : draft.mode === 'boxset'
                        ? 'Search TMDb to add another movie…'
                        : 'Search TMDb to change or find match…'
                }
                className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs border border-subtle rounded-[--radius-control] bg-surface text-content"
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                isLoading={isSearchingTmdb || isLoadingDetails}
                disabled={!searchQuery.trim()}
              >
                Search TMDb
              </Button>
            </form>

            {searchError && (
              <p className="text-xs text-red-600 dark:text-red-400">{searchError}</p>
            )}

            {movieSearchResults.length > 0 && (
              <ul className="max-h-40 overflow-y-auto divide-y divide-subtle rounded-[--radius-control] border border-subtle bg-surface">
                {movieSearchResults.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                    <span className="truncate text-content">
                      <strong>{m.title}</strong>{' '}
                      <span className="text-content-muted">
                        ({m.release_date?.split('-')[0] || 'Unknown'})
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isLoadingDetails}
                      onClick={() => handlePickSearchedMovie(m)}
                    >
                      {draft.mode === 'boxset' ? '+ Add' : 'Select'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {collectionSearchResults.length > 0 && (
              <ul className="max-h-40 overflow-y-auto divide-y divide-subtle rounded-[--radius-control] border border-subtle bg-surface">
                {collectionSearchResults.map((col) => (
                  <li key={col.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                    <span className="truncate font-medium text-content">{col.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isLoadingDetails}
                      onClick={() => handleLoadCollectionById(col.id, col.name)}
                    >
                      Load Films
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {tvSearchResults.length > 0 && (
              <ul className="max-h-40 overflow-y-auto divide-y divide-subtle rounded-[--radius-control] border border-subtle bg-surface">
                {tvSearchResults.map((show) => (
                  <li key={show.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                    <span className="truncate text-content">
                      <strong>{show.name}</strong>{' '}
                      <span className="text-content-muted">
                        ({show.first_air_date?.split('-')[0] || 'Unknown'})
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isLoadingDetails}
                      onClick={() => handlePickSearchedTV(show)}
                    >
                      Select
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Physical Formats */}
          <div>
            <span className="block text-xs font-medium text-content-muted mb-1.5">
              Physical Formats *
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PHYSICAL_FORMATS.map((format) => {
                const isSelected = draft.formats.includes(format);
                return (
                  <button
                    key={format}
                    type="button"
                    onClick={() => handleFormatToggle(format)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                      isSelected
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-surface border-subtle text-content-muted hover:text-content hover:border-primary-400'
                    }`}
                  >
                    {isSelected ? `✓ ${format}` : `+ ${format}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Edition Tags */}
          <div>
            <span className="block text-xs font-medium text-content-muted mb-1">
              Edition Notes
            </span>
            <EditionTagInput
              value={draft.editionNotes}
              onChange={(value) => updateDraft({ editionNotes: value })}
              availableTags={availableEditions}
              placeholder="e.g., Criterion Collection, Steelbook, Director's Cut…"
            />
          </div>

          {/* Validation callout when checked but incomplete */}
          {draft.include && (isMissingMedia || isMissingFormat || !draft.itemName.trim()) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {isMissingMedia
                ? draft.mode === 'tv'
                  ? 'Select a TV show and at least one season to import this item.'
                  : 'Select at least one TMDb movie to import this item.'
                : !draft.itemName.trim()
                  ? 'Enter a physical item name.'
                  : 'Select at least one physical format.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BarcodeReviewCard;
