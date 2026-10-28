import React, { useState, useEffect } from 'react';
import { Media } from '../types';
import { apiService } from '../services/api.service';

let cachedLetterboxdUsername: string | null = null;
let inFlightUsernamePromise: Promise<string> | null = null;

export function setCachedLetterboxdUsername(username: string): void {
  cachedLetterboxdUsername = username.trim();
}

function extractUsernameFromUri(uri?: string | null): string | null {
  if (!uri) return null;
  const match = uri.match(/letterboxd\.com\/([a-zA-Z0-9_-]+)\/film\//i);
  if (match && match[1].toLowerCase() !== 'film') {
    return match[1];
  }
  return null;
}

function useLetterboxdUsername(uri?: string | null): string {
  const [username, setUsername] = useState<string>(() => {
    return cachedLetterboxdUsername || extractUsernameFromUri(uri) || '';
  });

  useEffect(() => {
    if (cachedLetterboxdUsername !== null) {
      if (cachedLetterboxdUsername) {
        setUsername(cachedLetterboxdUsername);
      }
      return;
    }

    if (!inFlightUsernamePromise) {
      inFlightUsernamePromise = apiService
        .getLetterboxdStatus()
        .then((status) => {
          const resolved = (status?.username || '').trim();
          cachedLetterboxdUsername = resolved;
          return resolved;
        })
        .catch(() => {
          cachedLetterboxdUsername = '';
          return '';
        })
        .finally(() => {
          inFlightUsernamePromise = null;
        });
    }

    let active = true;
    inFlightUsernamePromise.then((resolved) => {
      if (active && resolved) {
        setUsername(resolved);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return username || extractUsernameFromUri(uri) || '';
}

/**
 * Format a numeric Letterboxd rating (0.5 - 5.0) as Unicode stars (e.g. "★★★★½")
 */
export function formatStarString(rating?: number | null): string {
  if (rating == null || rating <= 0) return '';
  const clamped = Math.min(5, Math.max(0.5, Math.round(rating * 2) / 2));
  const full = Math.floor(clamped);
  const half = clamped % 1 !== 0;
  return '★'.repeat(full) + (half ? '½' : '');
}

/**
 * Format an ISO YYYY-MM-DD watched date without timezone off-by-one shifts
 */
export function formatWatchedDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }
  const fallback = new Date(dateStr);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return dateStr;
}

export function hasLetterboxdActivity(movie?: Media | null): boolean {
  if (!movie) return false;
  return Boolean(
    movie.letterboxd_watched ||
      (movie.letterboxd_rating != null && movie.letterboxd_rating > 0) ||
      movie.letterboxd_liked ||
      movie.letterboxd_last_watched_date,
  );
}

/**
 * Letterboxd signature 3-dot logo icon (Orange #FF8000, Green #00E054, Blue #40BCF4)
 */
export const LetterboxdDotsIcon: React.FC<{ className?: string }> = ({ className = 'h-3.5 w-auto' }) => (
  <svg
    viewBox="0 0 36 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <circle cx="6" cy="6" r="5.5" fill="#FF8000" />
    <circle cx="18" cy="6" r="5.5" fill="#00E054" />
    <circle cx="30" cy="6" r="5.5" fill="#40BCF4" />
  </svg>
);

interface LetterboxdActivityBannerProps {
  movie: Media;
}

/**
 * Prominent Letterboxd Personal Activity Banner for the Movie Hero in MediaDetailModal
 */
export const LetterboxdActivityBanner: React.FC<LetterboxdActivityBannerProps> = ({ movie }) => {
  const username = useLetterboxdUsername(movie?.letterboxd_uri);

  if (!hasLetterboxdActivity(movie)) return null;

  const stars = formatStarString(movie.letterboxd_rating);
  const formattedWatchDate = formatWatchedDate(movie.letterboxd_last_watched_date);
  const hasValidUri = Boolean(
    movie.letterboxd_uri && /^https?:\/\//i.test(movie.letterboxd_uri),
  );

  return (
    <div
      data-testid="letterboxd-activity-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-2 text-xs sm:text-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"
    >
      <div className="inline-flex items-center gap-2">
        <LetterboxdDotsIcon className="h-3 w-auto shrink-0" />
        <span
          className={`text-xs font-bold tracking-wide text-content-muted ${
            username ? '' : 'uppercase'
          }`}
        >
          {username || 'Letterboxd'}
        </span>
      </div>

      {stars && (
        <div
          className="inline-flex items-center gap-1.5"
          aria-label={`Letterboxd rating: ${movie.letterboxd_rating} out of 5 stars`}
        >
          <span className="text-base leading-none tracking-tight text-emerald-600 dark:text-emerald-400">
            {stars}
          </span>
          <span className="text-xs font-bold text-content">
            {Number(movie.letterboxd_rating).toFixed(1)}
          </span>
        </div>
      )}

      {movie.letterboxd_liked && (
        <span
          className="inline-flex items-center gap-1 font-semibold text-orange-600 dark:text-orange-400"
          aria-label="Liked on Letterboxd"
        >
          <span aria-hidden="true" className="text-sm leading-none">
            ♥
          </span>
          <span className="text-xs">Liked</span>
        </span>
      )}

      {(formattedWatchDate || movie.letterboxd_watched) && (
        <span className="inline-flex items-center gap-1.5 text-xs text-content-muted">
          {(stars || movie.letterboxd_liked) && <span aria-hidden="true">&middot;</span>}
          <span>
            {formattedWatchDate ? (
              <>
                Last watched <strong className="font-medium text-content">{formattedWatchDate}</strong>
              </>
            ) : (
              <strong className="font-medium text-content">Watched</strong>
            )}
          </span>
        </span>
      )}

      {hasValidUri && (
        <a
          href={movie.letterboxd_uri!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${movie.title} on Letterboxd`}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          <span>View</span>
          <svg
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      )}
    </div>
  );
};
