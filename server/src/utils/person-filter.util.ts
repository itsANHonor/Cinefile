/**
 * Utilities for filtering physical_items and media queries by director or cast member,
 * and deduplicating person credits across TV seasons.
 */

function normalizePersonParam(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

const DIRECTOR_MATCH_SQL = `(media.media_type = 'movie' OR media.media_type IS NULL) AND INSTR(',' || REPLACE(REPLACE(REPLACE(LOWER(TRIM(COALESCE(media.director, ''))), ',  ', ','), ', ', ','), ' ,', ',') || ',', ?) > 0`;

const ACTOR_MATCH_SQL = `media.cast IS NOT NULL AND media.cast <> '' AND EXISTS (SELECT 1 FROM json_each(media.cast) WHERE LOWER(TRIM(json_each.value)) = ?)`;

export function hasDirectorFilter(raw: unknown): boolean {
  return normalizePersonParam(raw) !== null;
}

export function hasActorFilter(raw: unknown): boolean {
  return normalizePersonParam(raw) !== null;
}

/**
 * Filter a `physical_items` query to items containing at least one movie directed by `directorParam`.
 */
export function applyItemDirectorFilter(query: any, directorParam: unknown): any {
  const director = normalizePersonParam(directorParam);
  if (!director) return query;

  const needle = `,${director.toLowerCase()},`;
  return query.whereRaw(
    `EXISTS (
      SELECT 1 FROM physical_item_media
      JOIN media ON physical_item_media.media_id = media.id
      WHERE physical_item_media.physical_item_id = physical_items.id
      AND ${DIRECTOR_MATCH_SQL}
    )`,
    [needle]
  );
}

/**
 * Filter a joined query (with `media` table in scope) to movies directed by `directorParam`.
 */
export function applyMediaDirectorFilter(query: any, directorParam: unknown): any {
  const director = normalizePersonParam(directorParam);
  if (!director) return query;

  const needle = `,${director.toLowerCase()},`;
  return query.whereRaw(DIRECTOR_MATCH_SQL, [needle]);
}

/**
 * Filter a `physical_items` query to items containing at least one media entry featuring `actorParam`.
 */
export function applyItemActorFilter(query: any, actorParam: unknown): any {
  const actor = normalizePersonParam(actorParam);
  if (!actor) return query;

  return query.whereRaw(
    `EXISTS (
      SELECT 1 FROM physical_item_media
      JOIN media ON physical_item_media.media_id = media.id
      WHERE physical_item_media.physical_item_id = physical_items.id
      AND ${ACTOR_MATCH_SQL}
    )`,
    [actor.toLowerCase()]
  );
}

/**
 * Filter a joined query (with `media` table in scope) to media entries featuring `actorParam`.
 */
export function applyMediaActorFilter(query: any, actorParam: unknown): any {
  const actor = normalizePersonParam(actorParam);
  if (!actor) return query;

  return query.whereRaw(ACTOR_MATCH_SQL, [actor.toLowerCase()]);
}

/**
 * Compute a deduplicated work key for talent statistics:
 * - Movies count per distinct `media_id`
 * - TV seasons collapse all seasons of the same show into a single work key
 */
export function getCastWorkKey(row: {
  media_id: number;
  media_type?: string | null;
  tv_show_tmdb_id?: number | null;
  tv_show_name?: string | null;
  title?: string | null;
}): string {
  if (row.media_type === 'tv_season') {
    if (row.tv_show_tmdb_id) {
      return `tv:${row.tv_show_tmdb_id}`;
    }
    const showName = (row.tv_show_name || row.title || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return showName ? `tv-name:${showName}` : `tv-media:${row.media_id}`;
  }
  return `movie:${row.media_id}`;
}
