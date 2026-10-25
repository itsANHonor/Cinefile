import { db } from '../database';
import { STANDARD_UNIT_MM } from '../constants';
import { tmdbService } from '../services/tmdb.service';
import { extractSpineColors } from '../services/color.service';
import { calculateSortName } from '../utils/sort-name.util';
import {
  applyEditionTagFilter,
  buildCanonicalEditionTagMap,
  normalizeEditionNotes,
  parseEditionTags,
} from '../utils/edition-tags.util';

export const CANONICAL_FORMATS = [
  '4K UHD',
  '3D Blu-ray',
  'Blu-ray',
  'DVD',
  'Digital-UHD',
  'Digital-HD',
  'Digital-SD',
  'LaserDisc',
  'VHS',
] as const;

export type CanonicalFormat = (typeof CANONICAL_FORMATS)[number];

function parseJsonArray<T = any>(raw: unknown): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeStoreName(link: { label?: string; url?: string }): string | null {
  if (link.label && typeof link.label === 'string' && link.label.trim()) {
    return link.label.trim();
  }
  if (link.url && typeof link.url === 'string') {
    try {
      const hostname = new URL(link.url).hostname.replace(/^www\./i, '').toLowerCase();
      if (hostname.includes('amazon')) return 'Amazon';
      if (hostname.includes('gruv')) return 'GRUV';
      if (hostname.includes('criterion')) return 'Criterion';
      if (hostname.includes('shoutfactory')) return 'Shout! Factory';
      if (hostname.includes('arrowfilms') || hostname.includes('arrowvideo')) return 'Arrow Video';
      if (hostname.includes('vinegarsyndrome')) return 'Vinegar Syndrome';
      if (hostname.includes('kino')) return 'Kino Lorber';
      if (hostname.includes('bestbuy')) return 'Best Buy';
      if (hostname.includes('target')) return 'Target';
      if (hostname.includes('walmart')) return 'Walmart';
      if (hostname.includes('ebay')) return 'eBay';
      if (hostname.includes('orbitdvd')) return 'Orbit DVD';
      if (hostname.includes('diabolikdvd')) return 'DiabolikDVD';
      return hostname;
    } catch {
      return null;
    }
  }
  return null;
}

export interface SearchCollectionParams {
  query?: string;
  formats?: string[];
  genres?: string[];
  decades?: string[];
  year_min?: number;
  year_max?: number;
  director?: string;
  actor?: string;
  edition_tag?: string;
  media_type?: 'movie' | 'tv_season' | 'all';
  archived?: boolean;
  sort_by?: 'title' | 'release_date' | 'created_at' | 'purchase_date' | 'director_last_name' | 'series_sort';
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  minimal?: boolean;
}

export interface RecommendForMoodParams {
  genres?: string[];
  exclude_genres?: string[];
  decades?: string[];
  year_min?: number;
  year_max?: number;
  formats?: string[];
  keyword?: string;
  director?: string;
  actor?: string;
  media_type?: 'movie' | 'tv_season' | 'all';
  count?: number;
  random_sample?: boolean;
}

function applySearchFilters(queryBuilder: any, params: SearchCollectionParams) {
  let q = queryBuilder;

  if (params.archived) {
    q = q.where('physical_items.archived', 1);
  } else {
    q = q.where(function (this: any) {
      this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
    });
  }

  if (params.media_type && params.media_type !== 'all') {
    if (params.media_type === 'movie') {
      q = q.whereRaw(`EXISTS (
        SELECT 1 FROM physical_item_media
        JOIN media ON physical_item_media.media_id = media.id
        WHERE physical_item_media.physical_item_id = physical_items.id
        AND (media.media_type = 'movie' OR media.media_type IS NULL)
      )`);
    } else {
      q = q.whereRaw(
        `EXISTS (
        SELECT 1 FROM physical_item_media
        JOIN media ON physical_item_media.media_id = media.id
        WHERE physical_item_media.physical_item_id = physical_items.id
        AND media.media_type = ?
      )`,
        [params.media_type],
      );
    }
  }

  if (params.formats && params.formats.length > 0) {
    const cleanFormats = params.formats.map((f) => f.trim()).filter(Boolean);
    if (cleanFormats.length > 0) {
      q = q.where(function (this: any) {
        cleanFormats.forEach((f, idx) => {
          if (idx === 0) {
            this.where('physical_items.physical_format', 'like', `%"${f}"%`);
          } else {
            this.orWhere('physical_items.physical_format', 'like', `%"${f}"%`);
          }
        });
      });
    }
  }

  if (params.genres && params.genres.length > 0) {
    const cleanGenres = params.genres.map((g) => String(g).trim()).filter(Boolean);
    if (cleanGenres.length > 0) {
      q = q.where(function (this: any) {
        cleanGenres.forEach((genreVal, idx) => {
          const asNum = Number(genreVal);
          const isNumericId = !Number.isNaN(asNum) && String(asNum) === genreVal;
          const sql = isNumericId
            ? `EXISTS (
                SELECT 1 FROM physical_item_media
                JOIN media ON physical_item_media.media_id = media.id
                WHERE physical_item_media.physical_item_id = physical_items.id
                AND media.genres IS NOT NULL AND media.genres <> ''
                AND EXISTS (
                  SELECT 1 FROM json_each(media.genres)
                  WHERE json_extract(json_each.value, '$.id') = ?
                )
              )`
            : `EXISTS (
                SELECT 1 FROM physical_item_media
                JOIN media ON physical_item_media.media_id = media.id
                WHERE physical_item_media.physical_item_id = physical_items.id
                AND media.genres IS NOT NULL AND media.genres <> ''
                AND EXISTS (
                  SELECT 1 FROM json_each(media.genres)
                  WHERE LOWER(json_extract(json_each.value, '$.name')) LIKE ?
                )
              )`;
          const bindVal = isNumericId ? asNum : `%${genreVal.toLowerCase()}%`;
          if (idx === 0) {
            this.whereRaw(sql, [bindVal]);
          } else {
            this.orWhereRaw(sql, [bindVal]);
          }
        });
      });
    }
  }

  if (params.decades && params.decades.length > 0) {
    const decadeNums = params.decades
      .map((d) => parseInt(String(d).trim().replace(/s$/i, ''), 10))
      .filter((n) => !Number.isNaN(n));
    if (decadeNums.length > 0) {
      q = q.where(function (this: any) {
        decadeNums.forEach((decadeStart, idx) => {
          const decadeEnd = decadeStart + 9;
          const sql = `EXISTS (
            SELECT 1 FROM physical_item_media
            JOIN media ON physical_item_media.media_id = media.id
            WHERE physical_item_media.physical_item_id = physical_items.id
            AND media.release_date IS NOT NULL
            AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) >= ?
            AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) <= ?
          )`;
          if (idx === 0) {
            this.whereRaw(sql, [decadeStart, decadeEnd]);
          } else {
            this.orWhereRaw(sql, [decadeStart, decadeEnd]);
          }
        });
      });
    }
  }

  if (params.year_min !== undefined || params.year_max !== undefined) {
    const minYear = params.year_min ?? 1880;
    const maxYear = params.year_max ?? 2100;
    q = q.whereRaw(
      `EXISTS (
      SELECT 1 FROM physical_item_media
      JOIN media ON physical_item_media.media_id = media.id
      WHERE physical_item_media.physical_item_id = physical_items.id
      AND media.release_date IS NOT NULL
      AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) >= ?
      AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) <= ?
    )`,
      [minYear, maxYear],
    );
  }

  if (params.director && params.director.trim()) {
    const dirTerm = `%${params.director.trim()}%`;
    q = q.whereRaw(
      `EXISTS (
      SELECT 1 FROM physical_item_media
      JOIN media ON physical_item_media.media_id = media.id
      WHERE physical_item_media.physical_item_id = physical_items.id
      AND media.director LIKE ?
    )`,
      [dirTerm],
    );
  }

  if (params.actor && params.actor.trim()) {
    const actorTerm = `%${params.actor.trim()}%`;
    q = q.whereRaw(
      `EXISTS (
      SELECT 1 FROM physical_item_media
      JOIN media ON physical_item_media.media_id = media.id
      WHERE physical_item_media.physical_item_id = physical_items.id
      AND media.cast IS NOT NULL AND media.cast <> ''
      AND EXISTS (
        SELECT 1 FROM json_each(media.cast)
        WHERE json_each.value LIKE ?
      )
    )`,
      [actorTerm],
    );
  }

  if (params.edition_tag && params.edition_tag.trim()) {
    q = applyEditionTagFilter(q, params.edition_tag);
  }

  if (params.query && params.query.trim()) {
    const searchTerm = `%${params.query.trim()}%`;
    q = q.where(function (this: any) {
      this.where('physical_items.name', 'like', searchTerm)
        .orWhere('physical_items.edition_notes', 'like', searchTerm)
        .orWhere('physical_items.notes', 'like', searchTerm)
        .orWhereRaw(
          `EXISTS (
          SELECT 1 FROM physical_item_media
          JOIN media ON physical_item_media.media_id = media.id
          WHERE physical_item_media.physical_item_id = physical_items.id
          AND (
            media.title LIKE ? OR
            media.tv_show_name LIKE ? OR
            media.director LIKE ? OR
            media.synopsis LIKE ? OR
            (media.cast IS NOT NULL AND media.cast <> '' AND EXISTS (
              SELECT 1 FROM json_each(media.cast)
              WHERE json_each.value LIKE ?
            ))
          )
        )`,
          [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm],
        );
    });
  }

  return q;
}

async function hydratePhysicalItems(physicalItems: any[], minimal: boolean = false) {
  const itemIds = physicalItems.map((i) => i.id);
  if (itemIds.length === 0) return [];

  const [allPlacements, allLinkedMedia] = await Promise.all([
    db('shelf_placements')
      .leftJoin('shelves', 'shelf_placements.shelf_id', 'shelves.id')
      .leftJoin('shelf_groups', 'shelves.group_id', 'shelf_groups.id')
      .whereIn('shelf_placements.physical_item_id', itemIds)
      .select(
        'shelf_placements.id',
        'shelf_placements.shelf_id',
        'shelf_placements.physical_item_id',
        'shelf_placements.position',
        'shelves.display_name as shelf_display_name',
        'shelf_groups.display_name as group_display_name',
      ),
    db('physical_item_media')
      .join('media', 'physical_item_media.media_id', 'media.id')
      .whereIn('physical_item_media.physical_item_id', itemIds)
      .select(
        'physical_item_media.physical_item_id',
        'media.*',
        'physical_item_media.disc_number',
        'physical_item_media.formats',
      )
      .orderBy('physical_item_media.physical_item_id')
      .orderBy('physical_item_media.disc_number'),
  ]);

  const placementByItemId = new Map<number, any>();
  for (const p of allPlacements) {
    placementByItemId.set(p.physical_item_id, {
      shelf_id: p.shelf_id,
      group_display_name: p.group_display_name,
      shelf_display_name: p.shelf_display_name,
      position: p.position,
    });
  }

  const allMediaIds = allLinkedMedia.map((m) => m.id);
  let allMediaSeriesAssociations: any[] = [];
  const allSeriesData = new Map<number, any>();

  if (allMediaIds.length > 0) {
    allMediaSeriesAssociations = await db('movie_series')
      .whereIn('media_id', allMediaIds)
      .select('media_id', 'series_id', 'sort_order');

    const seriesIds = new Set<number>();
    for (const assoc of allMediaSeriesAssociations) {
      seriesIds.add(assoc.series_id);
    }
    if (seriesIds.size > 0) {
      const seriesRows = await db('series')
        .whereIn('id', Array.from(seriesIds))
        .select('id', 'name', 'sort_name');
      for (const s of seriesRows) {
        allSeriesData.set(s.id, s);
      }
    }
  }

  const mediaByItemId = new Map<number, any[]>();
  for (const m of allLinkedMedia) {
    if (!mediaByItemId.has(m.physical_item_id)) {
      mediaByItemId.set(m.physical_item_id, []);
    }
    mediaByItemId.get(m.physical_item_id)!.push(m);
  }

  return physicalItems.map((item) => {
    const linkedMedia = mediaByItemId.get(item.id) || [];
    const media = linkedMedia.map((m) => {
      const genres = parseJsonArray<{ id: number; name: string }>(m.genres);
      const cast = parseJsonArray<string>(m.cast);
      const formats = parseJsonArray<string>(m.formats);
      const mediaSeries = allMediaSeriesAssociations
        .filter((assoc) => assoc.media_id === m.id)
        .map((assoc) => allSeriesData.get(assoc.series_id))
        .filter(Boolean);

      if (minimal) {
        return {
          id: m.id,
          title: m.title,
          tmdb_id: m.tmdb_id,
          media_type: m.media_type || 'movie',
          release_date: m.release_date,
          director: m.director,
          genres: genres.map((g) => g.name),
          formats,
        };
      }

      return {
        id: m.id,
        title: m.title,
        tmdb_id: m.tmdb_id,
        media_type: m.media_type || 'movie',
        tv_show_tmdb_id: m.tv_show_tmdb_id || undefined,
        tv_show_name: m.tv_show_name || undefined,
        season_number: m.season_number ?? undefined,
        episode_count: m.episode_count ?? undefined,
        synopsis: m.synopsis,
        cover_art_url: m.cover_art_url,
        release_date: m.release_date,
        director: m.director,
        disc_number: m.disc_number,
        formats,
        cast,
        genres,
        series: mediaSeries.length > 0 ? mediaSeries : undefined,
      };
    });

    const formats = parseJsonArray<string>(item.physical_format);
    const editionTags = parseEditionTags(item.edition_notes);
    const shelfPlacement = placementByItemId.get(item.id) || null;

    if (minimal) {
      return {
        id: item.id,
        name: item.name,
        physical_format: formats,
        edition_tags: editionTags,
        purchase_date: item.purchase_date || null,
        archived: Boolean(item.archived),
        shelf_placement: shelfPlacement,
        media,
      };
    }

    return {
      id: item.id,
      name: item.name,
      sort_name: item.sort_name,
      physical_format: formats,
      edition_notes: item.edition_notes || null,
      edition_tags: editionTags,
      notes: item.notes || null,
      notes_public: Boolean(item.notes_public),
      archived: Boolean(item.archived),
      archive_reason: item.archive_reason || null,
      custom_image_url: item.custom_image_url || null,
      purchase_date: item.purchase_date || null,
      store_links: parseJsonArray(item.store_links),
      thickness_units: item.thickness_units || 1,
      width_mm: item.width_mm || null,
      spine_color: item.spine_color || null,
      sort_series_id: item.sort_series_id || null,
      shelf_placement: shelfPlacement,
      created_at: item.created_at,
      updated_at: item.updated_at,
      media,
    };
  });
}

export async function searchCollection(params: SearchCollectionParams) {
  const pageNum = Math.max(params.page || 1, 1);
  const limitNum = Math.min(Math.max(params.limit || 25, 1), 100);
  const offset = (pageNum - 1) * limitNum;
  const sortDirection = params.sort_order === 'desc' ? 'desc' : 'asc';
  const sortBy = params.sort_by || 'title';
  const minimal = params.minimal !== undefined ? params.minimal : true;

  let query = applySearchFilters(db('physical_items').select('physical_items.*'), params);
  const countQuery = applySearchFilters(db('physical_items'), params);

  const totalRow = await countQuery.count('physical_items.id as count').first();
  const total = totalRow ? parseInt(String(totalRow.count), 10) : 0;
  const totalPages = Math.ceil(total / limitNum);

  if (sortBy === 'title') {
    query = query.orderByRaw(`COALESCE(physical_items.sort_name, physical_items.name) ${sortDirection}`);
  } else if (sortBy === 'director_last_name') {
    query = query.orderByRaw(`(
      SELECT SUBSTR(media.director, INSTR(media.director || ' ', ' ') + 1)
      FROM physical_item_media
      JOIN media ON physical_item_media.media_id = media.id
      WHERE physical_item_media.physical_item_id = physical_items.id
      AND media.director IS NOT NULL AND media.director != ''
      LIMIT 1
    ) ${sortDirection.toUpperCase()} NULLS LAST`);
  } else if (sortBy === 'release_date') {
    query = query.orderByRaw(`(
      SELECT MIN(media.release_date)
      FROM physical_item_media
      JOIN media ON physical_item_media.media_id = media.id
      WHERE physical_item_media.physical_item_id = physical_items.id
    ) ${sortDirection.toUpperCase()} NULLS LAST`);
  } else if (sortBy === 'purchase_date') {
    query = query.orderByRaw(
      `physical_items.purchase_date ${sortDirection.toUpperCase()} NULLS LAST, physical_items.created_at ${sortDirection.toUpperCase()}`,
    );
  } else {
    query = query.orderBy('physical_items.created_at', sortDirection);
  }

  const rows = await query.limit(limitNum).offset(offset);
  const items = await hydratePhysicalItems(rows, minimal);

  return {
    items,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  };
}

export async function getItemDetails(params: { physical_item_id?: number; media_id?: number }) {
  if (!params.physical_item_id && !params.media_id) {
    throw new Error('Provide either physical_item_id or media_id');
  }

  if (params.physical_item_id) {
    const row = await db('physical_items').where('id', params.physical_item_id).first();
    if (!row) {
      throw new Error(`Physical item ${params.physical_item_id} not found`);
    }
    const [hydrated] = await hydratePhysicalItems([row], false);
    return hydrated;
  }

  // Lookup by media_id: return media details plus all physical items containing it
  const mediaRow = await db('media').where('id', params.media_id).first();
  if (!mediaRow) {
    throw new Error(`Media item ${params.media_id} not found`);
  }

  const linkedItemRows = await db('physical_item_media')
    .join('physical_items', 'physical_item_media.physical_item_id', 'physical_items.id')
    .where('physical_item_media.media_id', params.media_id)
    .select('physical_items.*');

  const hydratedItems = await hydratePhysicalItems(linkedItemRows, false);
  const seriesRows = await db('movie_series')
    .join('series', 'movie_series.series_id', 'series.id')
    .where('movie_series.media_id', params.media_id)
    .select('series.*', 'movie_series.sort_order', 'movie_series.auto_sort');

  return {
    media: {
      ...mediaRow,
      cast: parseJsonArray<string>(mediaRow.cast),
      genres: parseJsonArray<{ id: number; name: string }>(mediaRow.genres),
      series: seriesRows,
    },
    owned_physical_items: hydratedItems,
  };
}

export async function recommendForMood(params: RecommendForMoodParams) {
  const count = Math.min(Math.max(params.count || 5, 1), 20);
  const randomSample = params.random_sample !== undefined ? params.random_sample : true;

  let query = applySearchFilters(db('physical_items').select('physical_items.*'), {
    query: params.keyword,
    formats: params.formats,
    genres: params.genres,
    decades: params.decades,
    year_min: params.year_min,
    year_max: params.year_max,
    director: params.director,
    actor: params.actor,
    media_type: params.media_type || 'movie',
    archived: false,
  });

  if (params.exclude_genres && params.exclude_genres.length > 0) {
    for (const exGenre of params.exclude_genres) {
      const trimmed = exGenre.trim().toLowerCase();
      if (!trimmed) continue;
      query = query.whereRaw(
        `NOT EXISTS (
        SELECT 1 FROM physical_item_media
        JOIN media ON physical_item_media.media_id = media.id
        WHERE physical_item_media.physical_item_id = physical_items.id
        AND media.genres IS NOT NULL AND media.genres <> ''
        AND EXISTS (
          SELECT 1 FROM json_each(media.genres)
          WHERE LOWER(json_extract(json_each.value, '$.name')) LIKE ?
        )
      )`,
        [`%${trimmed}%`],
      );
    }
  }

  const candidateRows = await query;
  const totalMatches = candidateRows.length;

  let selectedRows = candidateRows;
  if (randomSample && candidateRows.length > count) {
    const shuffled = [...candidateRows];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    selectedRows = shuffled.slice(0, count);
  } else {
    selectedRows = candidateRows.slice(0, count);
  }

  const hydrated = await hydratePhysicalItems(selectedRows, false);

  return {
    total_matching_items: totalMatches,
    returned_count: hydrated.length,
    sampled_randomly: randomSample,
    recommendations: hydrated.map((item) => ({
      physical_item_id: item.id,
      item_name: item.name,
      physical_format: item.physical_format,
      edition_tags: item.edition_tags,
      shelf_location: item.shelf_placement
        ? `${item.shelf_placement.group_display_name} -> ${item.shelf_placement.shelf_display_name} (Position ${item.shelf_placement.position + 1})`
        : 'Unassigned (not placed on a shelf)',
      media: item.media.map((m: any) => ({
        media_id: m.id,
        title: m.title,
        release_date: m.release_date,
        director: m.director,
        cast: m.cast?.slice(0, 6) || [],
        genres: (m.genres || []).map((g: any) => (typeof g === 'string' ? g : g.name)),
        synopsis: m.synopsis,
      })),
    })),
  };
}

export async function getCollectionFacets() {
  const [genreRows, decadeRows, formatStats, editionRows] = await Promise.all([
    db.raw(`
      SELECT genre_id, genre_name, COUNT(DISTINCT item_id) AS count
      FROM (
        SELECT
          json_extract(je.value, '$.id') AS genre_id,
          json_extract(je.value, '$.name') AS genre_name,
          pi.id AS item_id
        FROM physical_items pi
        JOIN physical_item_media pim ON pim.physical_item_id = pi.id
        JOIN media m ON m.id = pim.media_id,
        json_each(m.genres) AS je
        WHERE m.genres IS NOT NULL AND m.genres <> ''
        AND (pi.archived = 0 OR pi.archived IS NULL)
      )
      WHERE genre_id IS NOT NULL AND genre_name IS NOT NULL
      GROUP BY genre_id, genre_name
      ORDER BY genre_name ASC
    `),
    db.raw(`
      SELECT decade_start, COUNT(DISTINCT item_id) AS count
      FROM (
        SELECT
          (CAST(SUBSTR(m.release_date, 1, 4) AS INTEGER) / 10 * 10) AS decade_start,
          pi.id AS item_id
        FROM physical_items pi
        JOIN physical_item_media pim ON pim.physical_item_id = pi.id
        JOIN media m ON m.id = pim.media_id
        WHERE m.release_date IS NOT NULL AND m.release_date <> ''
        AND (pi.archived = 0 OR pi.archived IS NULL)
      )
      WHERE decade_start IS NOT NULL AND decade_start > 0
      GROUP BY decade_start
      ORDER BY decade_start ASC
    `),
    db('physical_items')
      .leftJoin('physical_item_media', 'physical_items.id', 'physical_item_media.physical_item_id')
      .where(function () {
        this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
      })
      .select('physical_items.physical_format')
      .countDistinct('physical_item_media.media_id as movie_count')
      .groupBy('physical_items.id', 'physical_items.physical_format'),
    db('physical_items')
      .where(function () {
        this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
      })
      .whereNotNull('edition_notes')
      .andWhere('edition_notes', '<>', '')
      .select('id', 'edition_notes'),
  ]);

  const genres = (genreRows || []).map((row: any) => ({
    id: Number(row.genre_id),
    name: String(row.genre_name),
    count: Number(row.count),
  }));

  const decades = (decadeRows || []).map((row: any) => ({
    decade: String(row.decade_start),
    count: Number(row.count),
  }));

  const formatCounts: Record<string, number> = {};
  for (const fmt of CANONICAL_FORMATS) {
    formatCounts[fmt] = 0;
  }
  for (const item of formatStats) {
    const formats = parseJsonArray<string>(item.physical_format);
    const movieCount = Number(item.movie_count) || 1;
    for (const fmt of formats) {
      if (fmt in formatCounts) {
        formatCounts[fmt] += movieCount;
      }
    }
  }
  const formats = CANONICAL_FORMATS.map((format) => ({
    format,
    count: formatCounts[format],
  })).filter((f) => f.count > 0);

  const canonicalEditionMap = buildCanonicalEditionTagMap(editionRows);
  const editionCounts = new Map<string, number>();
  for (const row of editionRows) {
    const tags = parseEditionTags(row.edition_notes);
    for (const tag of tags) {
      const canonical = canonicalEditionMap.get(tag.toLowerCase()) || tag;
      editionCounts.set(canonical, (editionCounts.get(canonical) || 0) + 1);
    }
  }
  const edition_tags = Array.from(editionCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return {
    genres,
    decades,
    formats,
    edition_tags,
  };
}

export async function getCollectionStats(
  section: 'all' | 'overview' | 'formats' | 'content' | 'physical_library' | 'acquisitions' = 'all',
) {
  const physicalItems = await db('physical_items')
    .where(function () {
      this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
    })
    .select(
      'id',
      'name',
      'physical_format',
      'purchase_date',
      'store_links',
      'sort_series_id',
      'primary_series_id',
      'thickness_units',
      'width_mm',
      'spine_color',
      'created_at',
    );

  const itemMediaRows = await db('physical_item_media as pim')
    .join('media as m', 'pim.media_id', 'm.id')
    .join('physical_items as pi', 'pim.physical_item_id', 'pi.id')
    .where(function () {
      this.where('pi.archived', 0).orWhereNull('pi.archived');
    })
    .select(
      'pim.physical_item_id',
      'pim.media_id',
      'pim.formats as link_formats',
      'pi.physical_format as item_formats',
      'm.title',
      'm.release_date',
      'm.director',
      'm.cast',
      'm.genres',
      'm.media_type',
      'm.tv_show_tmdb_id',
      'm.tv_show_name',
      'm.season_number',
      'm.episode_count',
      'm.primary_series_id as media_primary_series_id',
    );

  const totalPhysicalItems = physicalItems.length;
  const uniqueMediaMap = new Map<number, (typeof itemMediaRows)[0]>();
  const mediaIdsByItemId = new Map<number, Set<number>>();
  const itemsByMediaId = new Map<number, Set<number>>();
  const formatsByMediaId = new Map<number, Set<string>>();

  for (const row of itemMediaRows) {
    if (!uniqueMediaMap.has(row.media_id)) {
      uniqueMediaMap.set(row.media_id, row);
    }
    if (!mediaIdsByItemId.has(row.physical_item_id)) {
      mediaIdsByItemId.set(row.physical_item_id, new Set());
    }
    mediaIdsByItemId.get(row.physical_item_id)!.add(row.media_id);

    if (!itemsByMediaId.has(row.media_id)) {
      itemsByMediaId.set(row.media_id, new Set());
    }
    itemsByMediaId.get(row.media_id)!.add(row.physical_item_id);

    if (!formatsByMediaId.has(row.media_id)) {
      formatsByMediaId.set(row.media_id, new Set());
    }
    const linkFormats = parseJsonArray<string>(row.link_formats);
    const itemFormats = parseJsonArray<string>(row.item_formats);
    const effectiveFormats = linkFormats.length > 0 ? linkFormats : itemFormats;
    for (const fmt of effectiveFormats) {
      formatsByMediaId.get(row.media_id)!.add(fmt);
    }
  }

  let totalMovies = 0;
  let totalTVSeasons = 0;
  let totalEpisodes = 0;
  const tvShowKeys = new Set<string>();

  for (const media of uniqueMediaMap.values()) {
    if (media.media_type === 'tv_season') {
      totalTVSeasons += 1;
      totalEpisodes += Number(media.episode_count) || 0;
      const showKey = media.tv_show_tmdb_id
        ? `tmdb:${media.tv_show_tmdb_id}`
        : `name:${(media.tv_show_name || media.title || '').trim().toLowerCase()}`;
      tvShowKeys.add(showKey);
    } else {
      totalMovies += 1;
    }
  }

  let multiTitleItemsCount = 0;
  for (const mediaSet of mediaIdsByItemId.values()) {
    if (mediaSet.size > 1) {
      multiTitleItemsCount += 1;
    }
  }

  const formatItemCounts: Record<string, number> = {};
  const formatTitleCounts: Record<string, number> = {};
  for (const fmt of CANONICAL_FORMATS) {
    formatItemCounts[fmt] = 0;
    formatTitleCounts[fmt] = 0;
  }

  for (const item of physicalItems) {
    const formats = parseJsonArray<string>(item.physical_format);
    const linkedCount = mediaIdsByItemId.get(item.id)?.size || 1;
    const seenInItem = new Set<string>();
    for (const fmt of formats) {
      if (fmt in formatItemCounts && !seenInItem.has(fmt)) {
        seenInItem.add(fmt);
        formatItemCounts[fmt] += 1;
        formatTitleCounts[fmt] += linkedCount;
      }
    }
  }

  const totalFormatTitles = Object.values(formatTitleCounts).reduce((a, b) => a + b, 0);
  const formats = CANONICAL_FORMATS.map((format) => ({
    format,
    itemCount: formatItemCounts[format],
    titleCount: formatTitleCounts[format],
    itemPercentage:
      totalPhysicalItems > 0 ? Math.round((formatItemCounts[format] / totalPhysicalItems) * 1000) / 10 : 0,
    titlePercentage:
      totalFormatTitles > 0 ? Math.round((formatTitleCounts[format] / totalFormatTitles) * 1000) / 10 : 0,
  })).filter((f) => f.itemCount > 0 || f.titleCount > 0);

  const decadeBuckets = new Map<
    number,
    { movieIds: Set<number>; tvSeasonIds: Set<number>; itemIds: Set<number> }
  >();
  let oldestRelease: { title: string; year: number; releaseDate: string } | null = null;
  let newestRelease: { title: string; year: number; releaseDate: string } | null = null;
  const genreMap = new Map<number, { id: number; name: string; itemIds: Set<number>; mediaIds: Set<number> }>();
  const directorMap = new Map<string, Set<number>>();
  const castMap = new Map<string, Set<number>>();

  for (const row of itemMediaRows) {
    if (row.release_date && typeof row.release_date === 'string') {
      const year = parseInt(row.release_date.substring(0, 4), 10);
      if (!Number.isNaN(year) && year >= 1880 && year <= 2100) {
        const decadeStart = Math.floor(year / 10) * 10;
        if (!decadeBuckets.has(decadeStart)) {
          decadeBuckets.set(decadeStart, { movieIds: new Set(), tvSeasonIds: new Set(), itemIds: new Set() });
        }
        const bucket = decadeBuckets.get(decadeStart)!;
        bucket.itemIds.add(row.physical_item_id);
        if (row.media_type === 'tv_season') {
          bucket.tvSeasonIds.add(row.media_id);
        } else {
          bucket.movieIds.add(row.media_id);
        }

        if (!oldestRelease || row.release_date < oldestRelease.releaseDate) {
          oldestRelease = { title: row.title, year, releaseDate: row.release_date };
        }
        if (!newestRelease || row.release_date > newestRelease.releaseDate) {
          newestRelease = { title: row.title, year, releaseDate: row.release_date };
        }
      }
    }

    const mediaGenres = parseJsonArray<{ id?: number; name?: string }>(row.genres);
    for (const g of mediaGenres) {
      const gId = Number(g?.id);
      const gName = g?.name ? String(g.name).trim() : '';
      if (gId && gName) {
        if (!genreMap.has(gId)) {
          genreMap.set(gId, { id: gId, name: gName, itemIds: new Set(), mediaIds: new Set() });
        }
        const entry = genreMap.get(gId)!;
        entry.itemIds.add(row.physical_item_id);
        entry.mediaIds.add(row.media_id);
      }
    }

    if (row.director && typeof row.director === 'string' && row.director.trim()) {
      const directors = row.director
        .split(',')
        .map((d: string) => d.trim())
        .filter(Boolean);
      for (const dir of directors) {
        if (!directorMap.has(dir)) {
          directorMap.set(dir, new Set());
        }
        directorMap.get(dir)!.add(row.media_id);
      }
    }

    const castList = parseJsonArray<string>(row.cast);
    for (const actor of castList) {
      if (typeof actor === 'string' && actor.trim()) {
        const name = actor.trim();
        if (!castMap.has(name)) {
          castMap.set(name, new Set());
        }
        castMap.get(name)!.add(row.media_id);
      }
    }
  }

  const decades = Array.from(decadeBuckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([decadeStart, bucket]) => ({
      decade: String(decadeStart),
      movieCount: bucket.movieIds.size,
      tvSeasonCount: bucket.tvSeasonIds.size,
      titleCount: bucket.movieIds.size + bucket.tvSeasonIds.size,
      itemCount: bucket.itemIds.size,
    }));

  const totalDistinctTitles = uniqueMediaMap.size;
  const genres = Array.from(genreMap.values())
    .map((g) => ({
      id: g.id,
      name: g.name,
      itemCount: g.itemIds.size,
      titleCount: g.mediaIds.size,
      percentage:
        totalDistinctTitles > 0 ? Math.round((g.mediaIds.size / totalDistinctTitles) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.titleCount - a.titleCount || a.name.localeCompare(b.name));

  const topDirectors = Array.from(directorMap.entries())
    .map(([name, mediaSet]) => ({ name, count: mediaSet.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 15);

  const topCast = Array.from(castMap.entries())
    .map(([name, mediaSet]) => ({ name, count: mediaSet.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 15);

  const allSeries = await db('series').select('id', 'name');
  const movieSeriesRows = await db('movie_series').select('media_id', 'series_id');
  const seriesMediaMap = new Map<number, Set<number>>();
  for (const s of allSeries) {
    seriesMediaMap.set(s.id, new Set());
  }
  for (const ms of movieSeriesRows) {
    if (uniqueMediaMap.has(ms.media_id) && seriesMediaMap.has(ms.series_id)) {
      seriesMediaMap.get(ms.series_id)!.add(ms.media_id);
    }
  }
  for (const media of uniqueMediaMap.values()) {
    if (media.media_primary_series_id && seriesMediaMap.has(media.media_primary_series_id)) {
      seriesMediaMap.get(media.media_primary_series_id)!.add(media.media_id);
    }
  }

  const activeSeriesList = allSeries
    .map((s) => ({
      id: s.id,
      name: s.name,
      ownedCount: seriesMediaMap.get(s.id)?.size || 0,
    }))
    .filter((s) => s.ownedCount > 0)
    .sort((a, b) => b.ownedCount - a.ownedCount || a.name.localeCompare(b.name));

  const totalSeries = activeSeriesList.length;
  const topSeries = activeSeriesList.slice(0, 15);

  const shelfGroups = await db('shelf_groups').orderBy('sort_order', 'asc');
  const shelves = await db('shelves').orderBy('sort_order', 'asc');
  const placements = await db('shelf_placements')
    .join('physical_items', 'shelf_placements.physical_item_id', 'physical_items.id')
    .where(function () {
      this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
    })
    .select(
      'shelf_placements.shelf_id',
      'shelf_placements.physical_item_id',
      'physical_items.thickness_units',
    );

  const groupNameById = new Map<number, string>();
  for (const g of shelfGroups) {
    groupNameById.set(g.id, g.display_name || g.name);
  }

  const placementsByShelf = new Map<number, { count: number; usedUnits: number }>();
  let placedItemsCount = 0;
  let totalUsedUnits = 0;

  for (const p of placements) {
    placedItemsCount += 1;
    const units = Number(p.thickness_units) || 1;
    totalUsedUnits += units;
    if (!placementsByShelf.has(p.shelf_id)) {
      placementsByShelf.set(p.shelf_id, { count: 0, usedUnits: 0 });
    }
    const entry = placementsByShelf.get(p.shelf_id)!;
    entry.count += 1;
    entry.usedUnits += units;
  }

  let totalCapacityUnits = 0;
  const shelfBreakdown = shelves.map((s: any) => {
    const cap = Number(s.capacity_units) || 0;
    totalCapacityUnits += cap;
    const usage = placementsByShelf.get(s.id) || { count: 0, usedUnits: 0 };
    return {
      id: s.id,
      displayName: s.display_name || s.name,
      groupName: groupNameById.get(s.group_id) || 'Library',
      usedUnits: usage.usedUnits,
      capacityUnits: cap,
      itemCount: usage.count,
      utilizationPercent: cap > 0 ? Math.round((usage.usedUnits / cap) * 1000) / 10 : 0,
    };
  });

  let totalLinearMm = 0;
  let totalThicknessUnits = 0;
  const spineColorCounts = new Map<string, number>();
  let itemsWithSpineColor = 0;

  for (const item of physicalItems) {
    const units = Number(item.thickness_units) || 1;
    totalThicknessUnits += units;
    const widthMm = item.width_mm ? Number(item.width_mm) : units * STANDARD_UNIT_MM;
    totalLinearMm += widthMm;

    if (item.spine_color && typeof item.spine_color === 'string' && item.spine_color.trim()) {
      const color = item.spine_color.trim().toLowerCase();
      itemsWithSpineColor += 1;
      spineColorCounts.set(color, (spineColorCounts.get(color) || 0) + 1);
    }
  }

  const spinePalette = Array.from(spineColorCounts.entries())
    .map(([color, count]) => ({
      color,
      count,
      percentage: itemsWithSpineColor > 0 ? Math.round((count / itemsWithSpineColor) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const doubleDips = Array.from(uniqueMediaMap.values())
    .map((media) => {
      const itemSet = itemsByMediaId.get(media.media_id) || new Set();
      const formatSet = formatsByMediaId.get(media.media_id) || new Set();
      const sortedFormats = CANONICAL_FORMATS.filter((f) => formatSet.has(f));
      return {
        mediaId: media.media_id,
        title: media.title,
        itemCount: itemSet.size,
        formats: sortedFormats,
      };
    })
    .filter((d) => d.itemCount > 1 || d.formats.length > 1)
    .sort((a, b) => b.itemCount - a.itemCount || b.formats.length - a.formats.length || a.title.localeCompare(b.title))
    .slice(0, 15);

  const yearMap = new Map<string, { purchasedCount: number; addedCount: number }>();
  const monthMap = new Map<string, { purchasedCount: number; addedCount: number }>();
  const storeCounts = new Map<string, Set<number>>();
  let itemsWithPurchaseDate = 0;

  for (const item of physicalItems) {
    if (item.purchase_date && typeof item.purchase_date === 'string') {
      const trimmed = item.purchase_date.trim();
      if (/^\d{4}/.test(trimmed)) {
        itemsWithPurchaseDate += 1;
        const year = trimmed.substring(0, 4);
        if (!yearMap.has(year)) {
          yearMap.set(year, { purchasedCount: 0, addedCount: 0 });
        }
        yearMap.get(year)!.purchasedCount += 1;

        if (/^\d{4}-\d{2}/.test(trimmed)) {
          const month = trimmed.substring(0, 7);
          if (!monthMap.has(month)) {
            monthMap.set(month, { purchasedCount: 0, addedCount: 0 });
          }
          monthMap.get(month)!.purchasedCount += 1;
        }
      }
    }

    if (item.created_at && typeof item.created_at === 'string') {
      const trimmed = item.created_at.trim();
      if (/^\d{4}/.test(trimmed)) {
        const year = trimmed.substring(0, 4);
        if (!yearMap.has(year)) {
          yearMap.set(year, { purchasedCount: 0, addedCount: 0 });
        }
        yearMap.get(year)!.addedCount += 1;

        if (/^\d{4}-\d{2}/.test(trimmed)) {
          const month = trimmed.substring(0, 7);
          if (!monthMap.has(month)) {
            monthMap.set(month, { purchasedCount: 0, addedCount: 0 });
          }
          monthMap.get(month)!.addedCount += 1;
        }
      }
    }

    const links = parseJsonArray<{ label?: string; url?: string }>(item.store_links);
    for (const link of links) {
      const storeName = normalizeStoreName(link);
      if (storeName) {
        if (!storeCounts.has(storeName)) {
          storeCounts.set(storeName, new Set());
        }
        storeCounts.get(storeName)!.add(item.id);
      }
    }
  }

  const acquisitionsByYear = Array.from(yearMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, counts]) => ({
      period,
      purchasedCount: counts.purchasedCount,
      addedCount: counts.addedCount,
    }));

  const acquisitionsByMonth = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([period, counts]) => ({
      period,
      purchasedCount: counts.purchasedCount,
      addedCount: counts.addedCount,
    }));

  const topStores = Array.from(storeCounts.entries())
    .map(([store, itemSet]) => ({ store, count: itemSet.size }))
    .sort((a, b) => b.count - a.count || a.store.localeCompare(b.store))
    .slice(0, 10);

  const fullStats = {
    overview: {
      totalPhysicalItems,
      totalMovies,
      totalTVSeasons,
      totalTVShows: tvShowKeys.size,
      totalEpisodes,
      multiTitleItemsCount,
      totalSeries,
    },
    formats,
    content: {
      decades,
      oldestRelease,
      newestRelease,
      genres,
      topDirectors,
      topCast,
      topSeries,
    },
    physicalLibrary: {
      totalGroups: shelfGroups.length,
      totalShelves: shelves.length,
      totalCapacityUnits,
      usedUnits: totalUsedUnits,
      utilizationPercent:
        totalCapacityUnits > 0 ? Math.round((totalUsedUnits / totalCapacityUnits) * 1000) / 10 : 0,
      placedItemsCount,
      unassignedItemsCount: Math.max(0, totalPhysicalItems - placedItemsCount),
      totalLinearMm: Math.round(totalLinearMm * 10) / 10,
      totalThicknessUnits,
      shelves: shelfBreakdown,
      spinePalette,
      doubleDips,
    },
    acquisitions: {
      itemsWithPurchaseDate,
      byYear: acquisitionsByYear,
      byMonth: acquisitionsByMonth,
      topStores,
    },
  };

  if (section === 'overview') return { overview: fullStats.overview };
  if (section === 'formats') return { overview: fullStats.overview, formats: fullStats.formats };
  if (section === 'content') return { content: fullStats.content };
  if (section === 'physical_library') return { physicalLibrary: fullStats.physicalLibrary };
  if (section === 'acquisitions') return { acquisitions: fullStats.acquisitions };
  return fullStats;
}

export async function getRecentAcquisitions(params: {
  by?: 'purchase_date' | 'created_at';
  limit?: number;
}) {
  const by = params.by || 'purchase_date';
  const limitNum = Math.min(Math.max(params.limit || 10, 1), 50);

  let query = db('physical_items')
    .where(function () {
      this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
    })
    .select('physical_items.*');

  if (by === 'purchase_date') {
    query = query
      .whereNotNull('physical_items.purchase_date')
      .andWhere('physical_items.purchase_date', '<>', '')
      .orderBy('physical_items.purchase_date', 'desc')
      .orderBy('physical_items.created_at', 'desc');
  } else {
    query = query.orderBy('physical_items.created_at', 'desc');
  }

  const rows = await query.limit(limitNum);
  const items = await hydratePhysicalItems(rows, false);
  return {
    sorted_by: by,
    count: items.length,
    items,
  };
}

export async function listSeries() {
  const seriesRows = await db('series').select('*').orderBy('sort_name', 'asc');
  const assocRows = await db('movie_series')
    .join('media', 'movie_series.media_id', 'media.id')
    .select('movie_series.series_id', 'media.id as media_id', 'media.title', 'media.release_date');

  const mediaBySeries = new Map<number, Array<{ id: number; title: string; release_date: string }>>();
  for (const row of assocRows) {
    if (!mediaBySeries.has(row.series_id)) {
      mediaBySeries.set(row.series_id, []);
    }
    mediaBySeries.get(row.series_id)!.push({
      id: row.media_id,
      title: row.title,
      release_date: row.release_date,
    });
  }

  return seriesRows.map((s) => {
    const ownedMovies = mediaBySeries.get(s.id) || [];
    return {
      id: s.id,
      name: s.name,
      sort_name: s.sort_name,
      tmdb_collection_id: s.tmdb_collection_id || null,
      internal_sort_method: s.internal_sort_method || 'chronological',
      owned_movie_count: ownedMovies.length,
      owned_titles: ownedMovies.map((m) => m.title),
    };
  });
}

export async function getSeriesDetails(params: { series_id?: number; name?: string }) {
  if (!params.series_id && !params.name) {
    throw new Error('Provide either series_id or name');
  }

  let series: any;
  if (params.series_id) {
    series = await db('series').where('id', params.series_id).first();
  } else if (params.name) {
    series = await db('series')
      .whereRaw('LOWER(name) = LOWER(?)', [params.name.trim()])
      .orWhere('name', 'like', `%${params.name.trim()}%`)
      .first();
  }

  if (!series) {
    throw new Error('Series not found');
  }

  const internalSortMethod = series.internal_sort_method || 'chronological';
  let query = db('media')
    .join('movie_series', 'media.id', 'movie_series.media_id')
    .where('movie_series.series_id', series.id)
    .select('media.*', 'movie_series.sort_order', 'movie_series.auto_sort');

  if (internalSortMethod === 'custom') {
    query = query.orderBy([
      { column: 'movie_series.sort_order', order: 'asc' },
      { column: 'media.release_date', order: 'asc' },
    ]);
  } else if (internalSortMethod === 'alphabetical') {
    query = query.orderBy('media.title', 'asc');
  } else {
    query = query.orderBy('media.release_date', 'asc');
  }

  const movies = await query;
  const mediaIds = movies.map((m: any) => m.id);
  const itemLinks =
    mediaIds.length > 0
      ? await db('physical_item_media')
          .join('physical_items', 'physical_item_media.physical_item_id', 'physical_items.id')
          .whereIn('physical_item_media.media_id', mediaIds)
          .select(
            'physical_item_media.media_id',
            'physical_items.id as physical_item_id',
            'physical_items.name as physical_item_name',
            'physical_items.physical_format',
            'physical_items.edition_notes',
          )
      : [];

  const itemsByMedia = new Map<number, any[]>();
  for (const link of itemLinks) {
    if (!itemsByMedia.has(link.media_id)) {
      itemsByMedia.set(link.media_id, []);
    }
    itemsByMedia.get(link.media_id)!.push({
      physical_item_id: link.physical_item_id,
      name: link.physical_item_name,
      formats: parseJsonArray<string>(link.physical_format),
      edition_tags: parseEditionTags(link.edition_notes),
    });
  }

  return {
    series,
    movies: movies.map((m: any) => ({
      id: m.id,
      title: m.title,
      tmdb_id: m.tmdb_id,
      release_date: m.release_date,
      director: m.director,
      sort_order: m.sort_order,
      cast: parseJsonArray<string>(m.cast),
      genres: parseJsonArray<{ id: number; name: string }>(m.genres),
      owned_on_items: itemsByMedia.get(m.id) || [],
    })),
  };
}

export async function checkSeriesCompleteness(params: {
  series_id?: number;
  series_name?: string;
  tmdb_collection_id?: number;
}) {
  let series: any = null;
  let tmdbCollectionId = params.tmdb_collection_id;

  if (params.series_id || params.series_name) {
    const details = await getSeriesDetails({
      series_id: params.series_id,
      name: params.series_name,
    });
    series = details.series;
    if (!tmdbCollectionId && series.tmdb_collection_id) {
      tmdbCollectionId = series.tmdb_collection_id;
    }

    // If series doesn't have tmdb_collection_id stored yet, try inferring from one of its owned movies' tmdb_id
    if (!tmdbCollectionId && details.movies.length > 0) {
      for (const m of details.movies) {
        if (m.tmdb_id) {
          try {
            const belongsTo = await tmdbService.getMovieCollections(m.tmdb_id);
            if (belongsTo?.id) {
              tmdbCollectionId = belongsTo.id;
              break;
            }
          } catch {
            // Ignore and try next movie
          }
        }
      }
    }
  }

  if (!tmdbCollectionId) {
    throw new Error(
      'Could not resolve a TMDB Collection ID for this series. Provide tmdb_collection_id or link a TMDB movie to the series.',
    );
  }

  const collectionDetails = await tmdbService.getCollectionDetails(tmdbCollectionId);
  const parts: any[] = Array.isArray(collectionDetails.parts) ? collectionDetails.parts : [];
  parts.sort((a, b) => String(a.release_date || '9999').localeCompare(String(b.release_date || '9999')));

  // Check all owned media in the entire collection by tmdb_id or normalized title
  const allOwnedMedia = await db('media')
    .join('physical_item_media', 'media.id', 'physical_item_media.media_id')
    .join('physical_items', 'physical_item_media.physical_item_id', 'physical_items.id')
    .where(function () {
      this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
    })
    .select('media.id', 'media.title', 'media.tmdb_id', 'media.release_date')
    .groupBy('media.id');

  const ownedByTmdbId = new Map<number, any>();
  const ownedByTitle = new Map<string, any>();
  for (const m of allOwnedMedia) {
    if (m.tmdb_id) {
      ownedByTmdbId.set(Number(m.tmdb_id), m);
    }
    if (m.title) {
      ownedByTitle.set(String(m.title).trim().toLowerCase(), m);
    }
  }

  const ownedFilms: any[] = [];
  const missingFilms: any[] = [];

  for (const part of parts) {
    const match =
      ownedByTmdbId.get(Number(part.id)) ||
      (part.title ? ownedByTitle.get(String(part.title).trim().toLowerCase()) : undefined);

    if (match) {
      ownedFilms.push({
        tmdb_id: part.id,
        title: part.title,
        release_date: part.release_date || null,
        local_media_id: match.id,
      });
    } else {
      missingFilms.push({
        tmdb_id: part.id,
        title: part.title,
        release_date: part.release_date || null,
        overview: part.overview || null,
      });
    }
  }

  return {
    local_series: series ? { id: series.id, name: series.name } : null,
    tmdb_collection: {
      id: collectionDetails.id,
      name: collectionDetails.name,
      overview: collectionDetails.overview,
    },
    total_films_in_collection: parts.length,
    owned_count: ownedFilms.length,
    missing_count: missingFilms.length,
    completion_percentage: parts.length > 0 ? Math.round((ownedFilms.length / parts.length) * 1000) / 10 : 100,
    owned_films: ownedFilms,
    missing_films: missingFilms,
  };
}

export async function searchTmdb(params: {
  query: string;
  media_type?: 'movie' | 'tv';
  include_details?: boolean;
}) {
  const mediaType = params.media_type || 'movie';
  const includeDetails = Boolean(params.include_details);

  if (mediaType === 'tv') {
    const searchRes = await tmdbService.searchTV(params.query, 1);
    const topResults = searchRes.results.slice(0, 10);

    const ownedShows = await db('media')
      .where('media_type', 'tv_season')
      .select('id', 'title', 'tv_show_tmdb_id', 'season_number');
    const seasonsByShowTmdbId = new Map<number, number[]>();
    for (const s of ownedShows) {
      if (s.tv_show_tmdb_id) {
        if (!seasonsByShowTmdbId.has(s.tv_show_tmdb_id)) {
          seasonsByShowTmdbId.set(s.tv_show_tmdb_id, []);
        }
        if (s.season_number != null) {
          seasonsByShowTmdbId.get(s.tv_show_tmdb_id)!.push(s.season_number);
        }
      }
    }

    const enriched = await Promise.all(
      topResults.map(async (show) => {
        const ownedSeasons = seasonsByShowTmdbId.get(show.id) || [];
        if (!includeDetails) {
          return {
            tmdb_id: show.id,
            name: show.name,
            first_air_date: show.first_air_date,
            overview: show.overview,
            vote_average: show.vote_average,
            owned_in_collection: ownedSeasons.length > 0,
            owned_seasons: ownedSeasons.sort((a, b) => a - b),
          };
        }
        try {
          const details = await tmdbService.getTVDetails(show.id);
          return {
            tmdb_id: show.id,
            name: details.name,
            first_air_date: details.first_air_date,
            number_of_seasons: details.number_of_seasons,
            number_of_episodes: details.number_of_episodes,
            status: details.status,
            creators: tmdbService.getCreators(details.created_by),
            cast: tmdbService.getTVTopCast(details.credits, 8),
            genres: details.genres,
            overview: details.overview,
            poster_url: tmdbService.getImageUrl(details.poster_path),
            owned_in_collection: ownedSeasons.length > 0,
            owned_seasons: ownedSeasons.sort((a, b) => a - b),
          };
        } catch {
          return {
            tmdb_id: show.id,
            name: show.name,
            first_air_date: show.first_air_date,
            overview: show.overview,
            owned_in_collection: ownedSeasons.length > 0,
            owned_seasons: ownedSeasons.sort((a, b) => a - b),
          };
        }
      }),
    );

    return { media_type: 'tv', results: enriched };
  }

  // Movie search
  const searchRes = await tmdbService.searchMovies(params.query, 1);
  const topResults = searchRes.results.slice(0, 10);
  const tmdbIds = topResults.map((m) => m.id);

  const ownedRows =
    tmdbIds.length > 0
      ? await db('media')
          .join('physical_item_media', 'media.id', 'physical_item_media.media_id')
          .join('physical_items', 'physical_item_media.physical_item_id', 'physical_items.id')
          .whereIn('media.tmdb_id', tmdbIds)
          .where(function () {
            this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
          })
          .select(
            'media.tmdb_id',
            'media.id as media_id',
            'physical_items.id as physical_item_id',
            'physical_items.name as physical_item_name',
            'physical_items.physical_format',
          )
      : [];

  const ownedByTmdb = new Map<number, any[]>();
  for (const row of ownedRows) {
    if (!ownedByTmdb.has(row.tmdb_id)) {
      ownedByTmdb.set(row.tmdb_id, []);
    }
    ownedByTmdb.get(row.tmdb_id)!.push({
      media_id: row.media_id,
      physical_item_id: row.physical_item_id,
      physical_item_name: row.physical_item_name,
      formats: parseJsonArray<string>(row.physical_format),
    });
  }

  const enriched = await Promise.all(
    topResults.map(async (movie) => {
      const ownedItems = ownedByTmdb.get(movie.id) || [];
      if (!includeDetails) {
        return {
          tmdb_id: movie.id,
          title: movie.title,
          release_date: movie.release_date,
          overview: movie.overview,
          vote_average: movie.vote_average,
          poster_url: tmdbService.getImageUrl(movie.poster_path),
          owned_in_collection: ownedItems.length > 0,
          owned_copies: ownedItems,
        };
      }
      try {
        const details = await tmdbService.getMovieDetails(movie.id);
        return {
          tmdb_id: movie.id,
          title: details.title,
          release_date: details.release_date,
          runtime: details.runtime,
          director: tmdbService.getDirector(details.credits),
          cast: tmdbService.getTopCast(details.credits, 8),
          genres: details.genres,
          overview: details.overview,
          poster_url: tmdbService.getImageUrl(details.poster_path),
          owned_in_collection: ownedItems.length > 0,
          owned_copies: ownedItems,
        };
      } catch {
        return {
          tmdb_id: movie.id,
          title: movie.title,
          release_date: movie.release_date,
          overview: movie.overview,
          owned_in_collection: ownedItems.length > 0,
          owned_copies: ownedItems,
        };
      }
    }),
  );

  return { media_type: 'movie', results: enriched };
}

export async function getShelfLayout(params: {
  group_id?: number;
  shelf_id?: number;
  include_items?: boolean;
  unassigned_only?: boolean;
}) {
  if (params.unassigned_only) {
    const unassignedRows = await db('physical_items')
      .leftJoin('shelf_placements', 'physical_items.id', 'shelf_placements.physical_item_id')
      .whereNull('shelf_placements.id')
      .where(function () {
        this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
      })
      .select('physical_items.*')
      .orderBy('physical_items.name', 'asc');

    return {
      unassigned_count: unassignedRows.length,
      unassigned_items: unassignedRows.map((i: any) => ({
        id: i.id,
        name: i.name,
        physical_format: parseJsonArray<string>(i.physical_format),
        thickness_units: i.thickness_units || 1,
      })),
    };
  }

  const library = await db('physical_library').first();
  if (!library) {
    throw new Error('Physical library not found');
  }

  let groupsQuery = db('shelf_groups').where('library_id', library.id).orderBy('sort_order', 'asc');
  if (params.group_id) {
    groupsQuery = groupsQuery.where('id', params.group_id);
  }
  const groups = await groupsQuery;
  const groupIds = groups.map((g: any) => g.id);

  let shelvesQuery = db('shelves').whereIn('group_id', groupIds).orderBy('sort_order', 'asc');
  if (params.shelf_id) {
    shelvesQuery = shelvesQuery.where('id', params.shelf_id);
  }
  const shelves = groupIds.length > 0 ? await shelvesQuery : [];
  const shelfIds = shelves.map((s: any) => s.id);

  const placements =
    shelfIds.length > 0
      ? await db('shelf_placements')
          .join('physical_items', 'shelf_placements.physical_item_id', 'physical_items.id')
          .whereIn('shelf_placements.shelf_id', shelfIds)
          .where(function () {
            this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
          })
          .select(
            'shelf_placements.*',
            'physical_items.name as physical_item_name',
            'physical_items.thickness_units as physical_item_thickness_units',
            'physical_items.physical_format as physical_item_physical_format',
          )
          .orderBy('shelf_placements.position', 'asc')
      : [];

  const unassignedCountRow = await db('physical_items')
    .leftJoin('shelf_placements', 'physical_items.id', 'shelf_placements.physical_item_id')
    .whereNull('shelf_placements.id')
    .where(function () {
      this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
    })
    .count('physical_items.id as count')
    .first();

  const includeItems = params.include_items ?? Boolean(params.shelf_id || params.group_id);
  const placementsByShelf = new Map<number, any[]>();
  for (const p of placements) {
    if (!placementsByShelf.has(p.shelf_id)) {
      placementsByShelf.set(p.shelf_id, []);
    }
    placementsByShelf.get(p.shelf_id)!.push({
      placement_id: p.id,
      position: p.position,
      physical_item_id: p.physical_item_id,
      name: p.physical_item_name,
      thickness_units: p.physical_item_thickness_units || 1,
      formats: parseJsonArray<string>(p.physical_item_physical_format),
    });
  }

  const shelvesByGroup = new Map<number, any[]>();
  for (const s of shelves) {
    if (!shelvesByGroup.has(s.group_id)) {
      shelvesByGroup.set(s.group_id, []);
    }
    const shelfItems = placementsByShelf.get(s.id) || [];
    const usedUnits = shelfItems.reduce((sum, item) => sum + (item.thickness_units || 1), 0);
    shelvesByGroup.get(s.group_id)!.push({
      id: s.id,
      name: s.name,
      display_name: s.display_name,
      capacity_units: s.capacity_units,
      used_units: usedUnits,
      item_count: shelfItems.length,
      utilization_percent: s.capacity_units > 0 ? Math.round((usedUnits / s.capacity_units) * 1000) / 10 : 0,
      items: includeItems ? shelfItems : undefined,
    });
  }

  return {
    library: {
      id: library.id,
      name: library.name,
      display_name: library.display_name,
    },
    unassigned_items_count: unassignedCountRow ? parseInt(String(unassignedCountRow.count), 10) : 0,
    groups: groups.map((g: any) => ({
      id: g.id,
      name: g.name,
      display_name: g.display_name,
      shelves: shelvesByGroup.get(g.id) || [],
    })),
  };
}

export async function findItemOnShelf(params: { query?: string; physical_item_id?: number }) {
  if (!params.query && !params.physical_item_id) {
    throw new Error('Provide either query or physical_item_id');
  }

  let itemQuery = db('physical_items')
    .where(function () {
      this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
    })
    .select('physical_items.*');

  if (params.physical_item_id) {
    itemQuery = itemQuery.where('physical_items.id', params.physical_item_id);
  } else if (params.query) {
    const term = `%${params.query.trim()}%`;
    itemQuery = itemQuery.where(function () {
      this.where('physical_items.name', 'like', term).orWhereRaw(
        `EXISTS (
        SELECT 1 FROM physical_item_media
        JOIN media ON physical_item_media.media_id = media.id
        WHERE physical_item_media.physical_item_id = physical_items.id
        AND (media.title LIKE ? OR media.tv_show_name LIKE ?)
      )`,
        [term, term],
      );
    });
  }

  const matchingItems = await itemQuery.limit(10);
  if (matchingItems.length === 0) {
    return { matches: [] };
  }

  const results = await Promise.all(
    matchingItems.map(async (item: any) => {
      const placement = await db('shelf_placements')
        .join('shelves', 'shelf_placements.shelf_id', 'shelves.id')
        .join('shelf_groups', 'shelves.group_id', 'shelf_groups.id')
        .where('shelf_placements.physical_item_id', item.id)
        .select(
          'shelf_placements.id as placement_id',
          'shelf_placements.shelf_id',
          'shelf_placements.position',
          'shelves.display_name as shelf_display_name',
          'shelf_groups.display_name as group_display_name',
        )
        .first();

      if (!placement) {
        return {
          physical_item_id: item.id,
          name: item.name,
          formats: parseJsonArray<string>(item.physical_format),
          placed: false,
          location_summary: 'Unassigned (not currently placed on any shelf)',
        };
      }

      const shelfOrderedItems = await db('shelf_placements')
        .join('physical_items', 'shelf_placements.physical_item_id', 'physical_items.id')
        .where('shelf_placements.shelf_id', placement.shelf_id)
        .where(function () {
          this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
        })
        .select('shelf_placements.physical_item_id', 'shelf_placements.position', 'physical_items.name')
        .orderBy('shelf_placements.position', 'asc');

      const idx = shelfOrderedItems.findIndex((s: any) => s.physical_item_id === item.id);
      const leftNeighbor = idx > 0 ? shelfOrderedItems[idx - 1].name : null;
      const rightNeighbor =
        idx >= 0 && idx < shelfOrderedItems.length - 1 ? shelfOrderedItems[idx + 1].name : null;

      return {
        physical_item_id: item.id,
        name: item.name,
        formats: parseJsonArray<string>(item.physical_format),
        placed: true,
        group_display_name: placement.group_display_name,
        shelf_id: placement.shelf_id,
        shelf_display_name: placement.shelf_display_name,
        position_from_left: idx >= 0 ? idx + 1 : placement.position + 1,
        total_items_on_shelf: shelfOrderedItems.length,
        left_neighbor: leftNeighbor,
        right_neighbor: rightNeighbor,
        location_summary: `${placement.group_display_name} -> ${placement.shelf_display_name}, item #${idx >= 0 ? idx + 1 : placement.position + 1} of ${shelfOrderedItems.length} from the left${leftNeighbor ? ` (right of "${leftNeighbor}")` : ' (leftmost item)'}`,
      };
    }),
  );

  return { matches: results };
}

export async function placeItemOnShelf(params: {
  physical_item_id: number;
  shelf_id: number | null;
  position?: number;
}) {
  const item = await db('physical_items').where('id', params.physical_item_id).first();
  if (!item) {
    throw new Error(`Physical item ${params.physical_item_id} not found`);
  }
  if (item.archived && params.shelf_id !== null) {
    throw new Error('Cannot place an archived item on a shelf');
  }

  const existingPlacement = await db('shelf_placements')
    .where('physical_item_id', params.physical_item_id)
    .first();

  if (params.shelf_id === null) {
    if (existingPlacement) {
      await db('shelf_placements').where('id', existingPlacement.id).delete();
    }
    return {
      physical_item_id: params.physical_item_id,
      name: item.name,
      placed: false,
      message: `Removed "${item.name}" from shelf.`,
    };
  }

  const shelf = await db('shelves').where('id', params.shelf_id).first();
  if (!shelf) {
    throw new Error(`Shelf ${params.shelf_id} not found`);
  }

  if (existingPlacement) {
    await db('shelf_placements').where('id', existingPlacement.id).delete();
  }

  let pos = params.position;
  if (pos === undefined || pos === null) {
    const maxPos = await db('shelf_placements')
      .where('shelf_id', params.shelf_id)
      .max('position as max')
      .first();
    pos = (maxPos?.max ?? -1) + 1;
  }

  const [id] = await db('shelf_placements').insert({
    shelf_id: params.shelf_id,
    physical_item_id: params.physical_item_id,
    position: pos,
  });

  return {
    placement_id: id,
    physical_item_id: params.physical_item_id,
    name: item.name,
    shelf_id: params.shelf_id,
    shelf_display_name: shelf.display_name,
    position: pos,
    placed: true,
  };
}

export interface AddPhysicalItemInput {
  name?: string;
  formats?: string[];
  edition_notes?: string;
  notes?: string;
  notes_public?: boolean;
  purchase_date?: string;
  store_links?: Array<{ label: string; url: string }>;
  thickness_units?: number;
  sort_series_id?: number;
  media_primary_series_id?: number;
  shelf_id?: number;
  tmdb_id?: number;
  media?: Array<{
    id?: number;
    tmdb_id?: number;
    title?: string;
    synopsis?: string;
    cover_art_url?: string;
    release_date?: string;
    director?: string;
    cast?: string[];
    genres?: Array<{ id: number; name: string }>;
    media_type?: 'movie' | 'tv_season';
    tv_show_tmdb_id?: number;
    tv_show_name?: string;
    season_number?: number;
    episode_count?: number;
    disc_number?: number;
    formats?: string[];
  }>;
}

export async function addPhysicalItem(input: AddPhysicalItemInput) {
  const rawMediaList =
    input.media && input.media.length > 0
      ? input.media
      : input.tmdb_id
        ? [{ tmdb_id: input.tmdb_id, formats: input.formats }]
        : [];

  if (rawMediaList.length === 0) {
    throw new Error('Provide either tmdb_id or a non-empty media array');
  }

  // Enrich any media entries that specify tmdb_id (or tv_show_tmdb_id + season_number) but lack title/metadata
  const enrichedMediaList = await Promise.all(
    rawMediaList.map(async (m) => {
      const itemFormats =
        m.formats && m.formats.length > 0
          ? m.formats
          : input.formats && input.formats.length > 0
            ? input.formats
            : ['Blu-ray'];

      for (const fmt of itemFormats) {
        if (!CANONICAL_FORMATS.includes(fmt as CanonicalFormat)) {
          throw new Error(`Invalid physical format "${fmt}". Must be one of: ${CANONICAL_FORMATS.join(', ')}`);
        }
      }

      if (m.id) {
        return { ...m, formats: itemFormats };
      }

      if (m.media_type === 'tv_season' && m.tv_show_tmdb_id && m.season_number != null && !m.title) {
        const [tvDetails, seasonDetails] = await Promise.all([
          tmdbService.getTVDetails(m.tv_show_tmdb_id),
          tmdbService.getTVSeasonDetails(m.tv_show_tmdb_id, m.season_number),
        ]);
        const posterPath = seasonDetails.poster_path || tvDetails.poster_path;
        return {
          ...m,
          title: `${tvDetails.name} - ${seasonDetails.name || `Season ${m.season_number}`}`,
          tmdb_id: seasonDetails.id || m.tmdb_id,
          tv_show_tmdb_id: m.tv_show_tmdb_id,
          tv_show_name: tvDetails.name,
          season_number: m.season_number,
          episode_count: Array.isArray(seasonDetails.episodes)
            ? seasonDetails.episodes.length
            : seasonDetails.episode_count || null,
          synopsis: m.synopsis ?? (seasonDetails.overview || tvDetails.overview),
          cover_art_url: m.cover_art_url ?? (tmdbService.getImageUrl(posterPath) || undefined),
          release_date: m.release_date ?? (seasonDetails.air_date || tvDetails.first_air_date),
          director: m.director ?? (tmdbService.getCreators(tvDetails.created_by) || undefined),
          cast: m.cast ?? tmdbService.getTVTopCast(tvDetails.credits, 10),
          genres: m.genres ?? tvDetails.genres,
          media_type: 'tv_season' as const,
          formats: itemFormats,
        };
      }

      if (m.tmdb_id && (!m.title || !m.synopsis || !m.director)) {
        const details = await tmdbService.getMovieDetails(m.tmdb_id);
        return {
          ...m,
          title: m.title || details.title,
          tmdb_id: details.id,
          synopsis: m.synopsis ?? details.overview,
          cover_art_url: m.cover_art_url ?? (tmdbService.getImageUrl(details.poster_path) || undefined),
          release_date: m.release_date ?? details.release_date,
          director: m.director ?? (tmdbService.getDirector(details.credits) || undefined),
          cast: m.cast ?? tmdbService.getTopCast(details.credits, 10),
          genres: m.genres ?? details.genres,
          media_type: m.media_type || ('movie' as const),
          formats: itemFormats,
        };
      }

      if (!m.title) {
        throw new Error('Each media entry must provide either a tmdb_id or a title');
      }

      return { ...m, formats: itemFormats };
    }),
  );

  if (input.store_links) {
    for (const link of input.store_links) {
      if (!link?.label?.trim() || !link?.url || !/^https?:\/\/.+/i.test(link.url)) {
        throw new Error('Invalid store_links: each entry requires a label and an http(s):// URL');
      }
    }
  }

  const itemName = input.name?.trim() || enrichedMediaList[0].title || 'Untitled Item';
  const existingEditions = await db('physical_items').whereNotNull('edition_notes').select('edition_notes');
  const canonicalEditionMap = buildCanonicalEditionTagMap(existingEditions);
  const normalizedEditionNotes = normalizeEditionNotes(input.edition_notes, canonicalEditionMap);

  const createdId = await db.transaction(async (trx) => {
    if (input.sort_series_id) {
      const s = await trx('series').where('id', input.sort_series_id).first();
      if (!s) throw new Error(`Sort series ${input.sort_series_id} not found`);
    }
    if (input.media_primary_series_id) {
      const s = await trx('series').where('id', input.media_primary_series_id).first();
      if (!s) throw new Error(`Primary series ${input.media_primary_series_id} not found`);
    }

    const allFormats = new Set<string>();
    const [physicalItemId] = await trx('physical_items').insert({
      name: itemName,
      sort_name: calculateSortName(itemName) || null,
      physical_format: JSON.stringify([]),
      edition_notes: normalizedEditionNotes,
      notes: input.notes || null,
      notes_public: input.notes_public ? 1 : 0,
      archived: 0,
      archive_reason: null,
      purchase_date: input.purchase_date || null,
      thickness_units: Math.max(1, input.thickness_units || 1),
      store_links: input.store_links ? JSON.stringify(input.store_links) : null,
      sort_series_id: input.sort_series_id || null,
    });

    for (const mediaItem of enrichedMediaList) {
      let mediaId: number;
      if (mediaItem.id) {
        mediaId = mediaItem.id;
      } else {
        const [newMediaId] = await trx('media').insert({
          title: mediaItem.title,
          tmdb_id: mediaItem.tmdb_id || null,
          synopsis: mediaItem.synopsis || null,
          cover_art_url: mediaItem.cover_art_url || null,
          release_date: mediaItem.release_date || null,
          director: mediaItem.director || null,
          cast: mediaItem.cast ? JSON.stringify(mediaItem.cast) : null,
          genres: mediaItem.genres ? JSON.stringify(mediaItem.genres) : null,
          media_type: mediaItem.media_type || 'movie',
          tv_show_tmdb_id: mediaItem.tv_show_tmdb_id || null,
          tv_show_name: mediaItem.tv_show_name || null,
          season_number: mediaItem.season_number ?? null,
          episode_count: mediaItem.episode_count ?? null,
        });
        mediaId = newMediaId;
      }

      const formats = mediaItem.formats || ['Blu-ray'];
      for (const f of formats) {
        allFormats.add(f);
      }

      await trx('physical_item_media').insert({
        physical_item_id: physicalItemId,
        media_id: mediaId,
        disc_number: mediaItem.disc_number || 1,
        formats: JSON.stringify(formats),
      });

      if (input.media_primary_series_id) {
        const existingAssoc = await trx('movie_series')
          .where({ media_id: mediaId, series_id: input.media_primary_series_id })
          .first();
        if (!existingAssoc) {
          await trx('movie_series').insert({
            media_id: mediaId,
            series_id: input.media_primary_series_id,
            auto_sort: true,
          });
        }
        await trx('media').where('id', mediaId).update({
          primary_series_id: input.media_primary_series_id,
          updated_at: trx.fn.now(),
        });
      }
    }

    await trx('physical_items')
      .where('id', physicalItemId)
      .update({
        physical_format: JSON.stringify(Array.from(allFormats).sort()),
      });

    if (input.shelf_id) {
      const shelf = await trx('shelves').where('id', input.shelf_id).first();
      if (!shelf) {
        throw new Error(`Shelf ${input.shelf_id} not found`);
      }
      const maxPos = await trx('shelf_placements')
        .where('shelf_id', input.shelf_id)
        .max('position as max')
        .first();
      const nextPos = (maxPos?.max ?? -1) + 1;
      await trx('shelf_placements').insert({
        shelf_id: input.shelf_id,
        physical_item_id: physicalItemId,
        position: nextPos,
      });
    }

    return physicalItemId;
  });

  const createdItem: any = await getItemDetails({ physical_item_id: createdId });

  // Fire-and-forget spine color extraction
  const coverUrl = createdItem.custom_image_url || createdItem.media?.[0]?.cover_art_url;
  if (coverUrl) {
    extractSpineColors(coverUrl, createdItem.name)
      .then(async (colors) => {
        await db('physical_items').where('id', createdId).update({
          spine_color: colors.dominant,
          spine_color_accent: colors.accent,
        });
      })
      .catch(() => {
        /* ignore background extraction errors */
      });
  }

  return createdItem;
}

export interface UpdatePhysicalItemInput {
  physical_item_id: number;
  name?: string;
  physical_format?: string[];
  edition_notes?: string | null;
  notes?: string | null;
  notes_public?: boolean;
  purchase_date?: string | null;
  store_links?: Array<{ label: string; url: string }> | null;
  thickness_units?: number;
  sort_series_id?: number | null;
  media_primary_series_id?: number | null;
  archived?: boolean;
  archive_reason?: string | null;
}

export async function updatePhysicalItem(input: UpdatePhysicalItemInput) {
  const existing = await db('physical_items').where('id', input.physical_item_id).first();
  if (!existing) {
    throw new Error(`Physical item ${input.physical_item_id} not found`);
  }

  const nextArchived = input.archived !== undefined ? input.archived : Boolean(existing.archived);
  const nextReasonRaw = input.archive_reason !== undefined ? input.archive_reason : existing.archive_reason;
  const nextReasonTrimmed = typeof nextReasonRaw === 'string' ? nextReasonRaw.trim() : '';

  if (nextArchived && !nextReasonTrimmed) {
    throw new Error('archive_reason is required when archiving an item');
  }

  const updateData: any = { updated_at: db.fn.now() };
  if (input.name !== undefined) {
    updateData.name = input.name;
    updateData.sort_name = calculateSortName(input.name) || null;
  }
  if (input.edition_notes !== undefined) {
    const existingEditions = await db('physical_items').whereNotNull('edition_notes').select('edition_notes');
    const canonicalEditionMap = buildCanonicalEditionTagMap(existingEditions);
    updateData.edition_notes = normalizeEditionNotes(input.edition_notes, canonicalEditionMap);
  }
  if (input.notes !== undefined) {
    if (input.notes && input.notes.length > 2000) {
      throw new Error('Notes cannot exceed 2000 characters');
    }
    updateData.notes = input.notes || null;
  }
  if (input.notes_public !== undefined) {
    updateData.notes_public = input.notes_public ? 1 : 0;
  }
  if (input.purchase_date !== undefined) {
    updateData.purchase_date = input.purchase_date || null;
  }
  if (input.thickness_units !== undefined) {
    updateData.thickness_units = Math.max(1, input.thickness_units);
  }
  if (input.sort_series_id !== undefined) {
    if (input.sort_series_id !== null) {
      const s = await db('series').where('id', input.sort_series_id).first();
      if (!s) throw new Error(`Sort series ${input.sort_series_id} not found`);
    }
    updateData.sort_series_id = input.sort_series_id;
  }
  if (input.store_links !== undefined) {
    if (input.store_links) {
      for (const link of input.store_links) {
        if (!link?.label?.trim() || !link?.url || !/^https?:\/\/.+/i.test(link.url)) {
          throw new Error('Invalid store_links: each entry requires a label and an http(s):// URL');
        }
      }
    }
    updateData.store_links = input.store_links ? JSON.stringify(input.store_links) : null;
  }
  if (input.physical_format !== undefined) {
    if (input.physical_format.length === 0) {
      throw new Error('At least one physical format is required');
    }
    for (const fmt of input.physical_format) {
      if (!CANONICAL_FORMATS.includes(fmt as CanonicalFormat)) {
        throw new Error(`Invalid format "${fmt}". Must be one of: ${CANONICAL_FORMATS.join(', ')}`);
      }
    }
    updateData.physical_format = JSON.stringify(input.physical_format);
  }
  if (input.archived !== undefined || input.archive_reason !== undefined) {
    updateData.archived = nextArchived ? 1 : 0;
    updateData.archive_reason = nextArchived ? nextReasonTrimmed : null;
  }

  await db('physical_items').where('id', input.physical_item_id).update(updateData);

  if (nextArchived) {
    await db('shelf_placements').where('physical_item_id', input.physical_item_id).delete();
  }

  if (input.media_primary_series_id !== undefined && input.media_primary_series_id !== null) {
    const s = await db('series').where('id', input.media_primary_series_id).first();
    if (!s) throw new Error(`Series ${input.media_primary_series_id} not found`);

    const linkedMedia = await db('physical_item_media')
      .where('physical_item_id', input.physical_item_id)
      .select('media_id');
    for (const { media_id: mediaId } of linkedMedia) {
      const existingAssoc = await db('movie_series')
        .where({ media_id: mediaId, series_id: input.media_primary_series_id })
        .first();
      if (!existingAssoc) {
        await db('movie_series').insert({
          media_id: mediaId,
          series_id: input.media_primary_series_id,
          auto_sort: true,
        });
      }
      await db('media').where('id', mediaId).update({
        primary_series_id: input.media_primary_series_id,
        updated_at: db.fn.now(),
      });
    }
  }

  return getItemDetails({ physical_item_id: input.physical_item_id });
}

export async function deletePhysicalItem(
  physicalItemId: number,
  deleteOrphanedMedia: boolean = true,
) {
  const existing = await db('physical_items').where('id', physicalItemId).first();
  if (!existing) {
    throw new Error(`Physical item ${physicalItemId} not found`);
  }

  const linkedMediaRows = await db('physical_item_media')
    .where('physical_item_id', physicalItemId)
    .select('media_id');
  const linkedMediaIds = linkedMediaRows.map((r: any) => r.media_id);

  await db('physical_items').where('id', physicalItemId).delete();

  let deletedOrphanMediaCount = 0;
  if (deleteOrphanedMedia && linkedMediaIds.length > 0) {
    for (const mediaId of linkedMediaIds) {
      const remainingLinks = await db('physical_item_media')
        .where('media_id', mediaId)
        .count('id as count')
        .first();
      const count = remainingLinks ? parseInt(String(remainingLinks.count), 10) : 0;
      if (count === 0) {
        await db('media').where('id', mediaId).delete();
        deletedOrphanMediaCount += 1;
      }
    }
  }

  return {
    deleted: true,
    physical_item_id: physicalItemId,
    name: existing.name,
    deleted_orphaned_media_count: deletedOrphanMediaCount,
  };
}
