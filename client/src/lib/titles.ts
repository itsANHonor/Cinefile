/**
 * Return `original_title` only when it meaningfully differs from the displayed
 * English `title` (and, for TV seasons, from `tv_show_name` / the show prefix).
 * Prevents redundant subtitles on English-language releases like "The Matrix"
 * or "The Wire - Season 1".
 */
export function getDistinctOriginalTitle(item: {
  title?: string | null;
  original_title?: string | null;
  tv_show_name?: string | null;
  media_type?: 'movie' | 'tv_season' | string | null;
}): string | null {
  const orig = item.original_title?.trim();
  if (!orig) return null;

  const normOrig = orig.toLowerCase();
  const title = item.title?.trim() || '';
  if (title && title.toLowerCase() === normOrig) {
    return null;
  }

  if (item.media_type === 'tv_season') {
    const showName = item.tv_show_name?.trim() || '';
    if (showName && showName.toLowerCase() === normOrig) {
      return null;
    }
    const prefix = title.split(/\s+-\s+/)[0]?.trim() || '';
    if (prefix && prefix.toLowerCase() === normOrig) {
      return null;
    }
  }

  return orig;
}
