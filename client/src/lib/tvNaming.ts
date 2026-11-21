export interface NamingMediaEntry {
  title: string;
  media_type?: 'movie' | 'tv_season';
  tv_show_name?: string;
  tv_show_tmdb_id?: number;
  season_number?: number | null;
  tv_show_total_seasons?: number | null;
  formats?: string[];
}

/**
 * Sort TV seasons so regular numbered seasons (1..N) come first in ascending order
 * and Season 0 ("Specials") appears at the end.
 */
export function sortTVSeasons<T extends { season_number: number }>(seasons: T[]): T[] {
  return [...seasons].sort((a, b) => {
    const aIsSpecial = a.season_number <= 0;
    const bIsSpecial = b.season_number <= 0;
    if (aIsSpecial !== bIsSpecial) {
      return aIsSpecial ? 1 : -1;
    }
    return a.season_number - b.season_number;
  });
}

function formatSingleTVShowName(entries: NamingMediaEntry[]): string {
  const showName = entries[0].tv_show_name || entries[0].title;
  const seasonNumbers = Array.from(
    new Set(
      entries
        .map((s) => s.season_number)
        .filter((n): n is number => n !== null && n !== undefined)
    )
  ).sort((a, b) => a - b);

  if (seasonNumbers.length === 0) {
    return showName;
  }

  const regularSeasons = seasonNumbers.filter((n) => n > 0);
  const hasSpecials = seasonNumbers.some((n) => n <= 0);

  if (regularSeasons.length === 0 && hasSpecials) {
    return `${showName} - Specials`;
  }

  if (regularSeasons.length === 1) {
    return `${showName} - Season ${regularSeasons[0]}`;
  }

  const min = regularSeasons[0];
  const max = regularSeasons[regularSeasons.length - 1];
  const isContiguous = max - min + 1 === regularSeasons.length;

  const totalSeasons = entries.find(
    (s) => s.tv_show_total_seasons != null && s.tv_show_total_seasons > 0
  )?.tv_show_total_seasons;

  if (isContiguous) {
    const coversAllKnownSeasons =
      min === 1 &&
      ((totalSeasons != null && regularSeasons.length >= totalSeasons) ||
        regularSeasons.length >= 10);

    if (coversAllKnownSeasons) {
      return `${showName} - Complete Series`;
    }
    return `${showName} - Seasons ${min}-${max}`;
  }

  return `${showName} - Seasons ${regularSeasons.join(', ')}`;
}

/**
 * Generate a clean default physical item name from its selected movies / TV seasons.
 * Excludes Season 0 ("Specials") from season range numbers and names complete multi-season
 * sets "<Show> - Complete Series".
 */
export function generatePhysicalItemName(entries: NamingMediaEntry[]): string {
  if (entries.length === 0) return '';

  const isAllTV = entries.every((m) => m.media_type === 'tv_season');
  if (isAllTV) {
    const groups = new Map<string, NamingMediaEntry[]>();
    for (const entry of entries) {
      const key = entry.tv_show_tmdb_id
        ? `tmdb:${entry.tv_show_tmdb_id}`
        : `name:${(entry.tv_show_name || entry.title).trim().toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(entry);
    }

    return Array.from(groups.values())
      .map((group) => formatSingleTVShowName(group))
      .join(' / ');
  }

  return entries.map((m) => m.title).join(' / ');
}

/**
 * Build a clean search query for Amazon & Blu-ray.com box art scrapers.
 * Strips legacy "Seasons 0-X" artifacts and spaced hyphen separators so TV box sets
 * match real-world product listings.
 */
export function formatCoverSearchQuery(options: {
  customName?: string;
  entries: NamingMediaEntry[];
  editionNotes?: string;
}): string {
  const { customName, entries, editionNotes } = options;
  let baseTitle = (customName || generatePhysicalItemName(entries) || '').trim();

  // Replace legacy "Seasons 0-X" suffix with "Complete Series"
  baseTitle = baseTitle
    .replace(/\s*[-–:]?\s*\bSeasons?\s+0\s*-\s*\d+\b/gi, ' Complete Series')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parts: string[] = [];
  if (baseTitle) parts.push(baseTitle);

  const primaryFormats = Array.from(new Set(entries.flatMap((m) => m.formats ?? [])));
  if (primaryFormats.includes('4K UHD') && !/\b4k\b/i.test(baseTitle)) {
    parts.push('4K UHD');
  } else if (primaryFormats.includes('Blu-ray') && !/\bblu-?ray\b/i.test(baseTitle)) {
    parts.push('Blu-ray');
  } else if (primaryFormats.includes('DVD') && !/\bdvd\b/i.test(baseTitle)) {
    parts.push('DVD');
  }

  if (editionNotes) {
    const firstTag = editionNotes.split(',')[0]?.trim();
    if (firstTag && !baseTitle.toLowerCase().includes(firstTag.toLowerCase())) {
      parts.push(firstTag);
    }
  }

  return parts.join(' ').trim();
}
