import { db } from '../database';
import { calculateSortName } from '../utils/sort-name.util';
import { parseEditionTags } from '../utils/edition-tags.util';
import { applyMediaActorFilter, applyMediaDirectorFilter } from '../utils/person-filter.util';
import { parseCustomImagesFromRow } from '../utils/custom-images.util';
import { normalizeCost } from '../utils/identifiers.util';

const CANONICAL_FORMATS = [
  '4K UHD',
  '3D Blu-ray',
  'Blu-ray',
  'DVD',
  'Digital-UHD',
  'Digital-HD',
  'Digital-SD',
  'LaserDisc',
  'VHS',
];

function compareFormats(a: string, b: string): number {
  const indexA = CANONICAL_FORMATS.indexOf(a);
  const indexB = CANONICAL_FORMATS.indexOf(b);
  if (indexA === -1 && indexB === -1) return a.localeCompare(b);
  if (indexA === -1) return 1;
  if (indexB === -1) return -1;
  return indexA - indexB;
}

function safeParseJsonArray<T = any>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface CollectionMediaQueryParams {
  format?: unknown;
  genres?: unknown;
  decades?: unknown;
  editions?: unknown;
  edition?: unknown;
  versions?: unknown;
  version?: unknown;
  series?: unknown;
  director?: unknown;
  actor?: unknown;
  sort_by?: unknown;
  sort_order?: unknown;
  search?: unknown;
  media_type?: unknown;
  archived?: unknown;
  page?: unknown;
  limit?: unknown;
}

export interface QueryCollectionMediaOptions {
  queryParams: CollectionMediaQueryParams;
  isAdmin: boolean;
}

export async function queryCollectionMedia({
  queryParams,
  isAdmin,
}: QueryCollectionMediaOptions) {
  const {
    format,
    genres,
    decades,
    editions,
    edition,
    versions,
    version,
    series,
    director,
    actor,
    sort_by = 'created_at',
    sort_order = 'desc',
    search,
    media_type,
    archived,
    page = '1',
    limit = '50',
  } = queryParams;

  const showArchived = isAdmin && (archived === 'true' || archived === '1');
  const costPublicSetting = !isAdmin
    ? await db('settings').where({ key: 'cost_public' }).first()
    : null;
  const canSeeCost = isAdmin || costPublicSetting?.value === 'true';

  const archivedSql = showArchived
    ? 'pi.archived = 1'
    : '(pi.archived = 0 OR pi.archived IS NULL)';

  // Build physical-item-level filter predicates that must hold on at least one linked physical item
  const formatValues: string[] =
    format && format !== 'all'
      ? (typeof format === 'string'
          ? format
              .split(',')
              .map((f) => f.trim())
              .filter((f) => f && f !== 'all')
          : [String(format)])
      : [];

  const editionTags = parseEditionTags(editions || edition);
  const versionTags = parseEditionTags(versions || version);

  const applyFilters = (q: any) => {
    // Media must belong to at least one matching (active or archived) physical item
    q = q.whereRaw(
      `EXISTS (
        SELECT 1 FROM physical_item_media pim
        JOIN physical_items pi ON pim.physical_item_id = pi.id
        WHERE pim.media_id = media.id
        AND ${archivedSql}
        ${
          formatValues.length > 0
            ? `AND (${formatValues
                .map(
                  () =>
                    `(CASE WHEN pim.formats IS NOT NULL AND TRIM(pim.formats) != '' AND TRIM(pim.formats) != '[]' THEN pim.formats ELSE pi.physical_format END) LIKE ?`
                )
                .join(' OR ')})`
            : ''
        }
        ${
          editionTags.length > 0
            ? `AND (${editionTags
                .map(
                  () =>
                    `INSTR(',' || REPLACE(REPLACE(REPLACE(LOWER(TRIM(COALESCE(pi.edition_notes, ''))), ',  ', ','), ', ', ','), ' ,', ',') || ',', ?) > 0`
                )
                .join(' OR ')})`
            : ''
        }
        ${
          versionTags.length > 0
            ? `AND (${versionTags
                .map(
                  () =>
                    `INSTR(',' || REPLACE(REPLACE(REPLACE(LOWER(TRIM(COALESCE(pim.version_notes, ''))), ',  ', ','), ', ', ','), ' ,', ',') || ',', ?) > 0`
                )
                .join(' OR ')})`
            : ''
        }
      )`,
      [
        ...formatValues.map((f) => `%"${f}"%`),
        ...editionTags.map((t) => `,${t.toLowerCase()},`),
        ...versionTags.map((t) => `,${t.toLowerCase()},`),
      ]
    );

    // Media type filter
    if (media_type && typeof media_type === 'string' && media_type !== 'all') {
      if (media_type === 'movie') {
        q = q.where(function (this: any) {
          this.where('media.media_type', 'movie').orWhereNull('media.media_type');
        });
      } else {
        q = q.where('media.media_type', media_type);
      }
    }

    // Genres filter (multi-select OR)
    if (genres && typeof genres === 'string') {
      const genreIds = genres
        .split(',')
        .map((g) => parseInt(g.trim(), 10))
        .filter((id) => !isNaN(id));
      if (genreIds.length > 0) {
        q = q.where(function (this: any) {
          genreIds.forEach((genreId, index) => {
            const sql = `EXISTS (
              SELECT 1 FROM json_each(media.genres)
              WHERE json_extract(json_each.value, '$.id') = ?
            )`;
            if (index === 0) this.whereRaw(sql, [genreId]);
            else this.orWhereRaw(sql, [genreId]);
          });
        });
      }
    }

    // Decades filter (multi-select OR)
    if (decades && typeof decades === 'string') {
      const decadeStrings = decades
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d.length > 0);
      if (decadeStrings.length > 0) {
        q = q.where(function (this: any) {
          decadeStrings.forEach((decadeStr, index) => {
            const decadeNum = parseInt(decadeStr.replace(/s$/, ''), 10);
            if (!isNaN(decadeNum)) {
              const startYear = decadeNum;
              const endYear = decadeNum + 9;
              const sql = `(
                media.release_date IS NOT NULL
                AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) >= ?
                AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) <= ?
              )`;
              if (index === 0) this.whereRaw(sql, [startYear, endYear]);
              else this.orWhereRaw(sql, [startYear, endYear]);
            }
          });
        });
      }
    }

    // Director & actor filters
    if (director) {
      q = applyMediaDirectorFilter(q, director);
    }
    if (actor) {
      q = applyMediaActorFilter(q, actor);
    }

    // Series filter (multi-select OR)
    if (series && typeof series === 'string') {
      const seriesIds = series
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((id) => !isNaN(id));
      if (seriesIds.length > 0) {
        q = q.where(function (this: any) {
          seriesIds.forEach((seriesId, index) => {
            const clause = `(
              media.primary_series_id = ?
              OR EXISTS (
                SELECT 1 FROM movie_series ms
                WHERE ms.media_id = media.id AND ms.series_id = ?
              )
              OR EXISTS (
                SELECT 1 FROM physical_item_media pim
                JOIN physical_items pi ON pim.physical_item_id = pi.id
                WHERE pim.media_id = media.id
                AND ${archivedSql}
                AND (pi.sort_series_id = ? OR pi.primary_series_id = ?)
              )
            )`;
            const bindings = [seriesId, seriesId, seriesId, seriesId];
            if (index === 0) this.whereRaw(clause, bindings);
            else this.orWhereRaw(clause, bindings);
          });
        });
      }
    }

    // Search filter (matches movie metadata OR linked physical item metadata)
    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      const compactBarcodeTerm = `%${search.trim().replace(/[\s-]+/g, '')}%`;
      q = q.where(function (this: any) {
        this.where('media.title', 'like', searchTerm)
          .orWhere('media.original_title', 'like', searchTerm)
          .orWhere('media.tv_show_name', 'like', searchTerm)
          .orWhere('media.director', 'like', searchTerm)
          .orWhere('media.synopsis', 'like', searchTerm)
          .orWhereRaw(
            `EXISTS (
              SELECT 1 FROM json_each(media.cast)
              WHERE json_each.value LIKE ?
            )`,
            [searchTerm]
          )
          .orWhereRaw(
            `EXISTS (
              SELECT 1 FROM physical_item_media pim
              JOIN physical_items pi ON pim.physical_item_id = pi.id
              WHERE pim.media_id = media.id
              AND ${archivedSql}
              AND (
                pi.name LIKE ? OR
                pi.edition_notes LIKE ? OR
                pi.barcode LIKE ? OR
                pi.asin LIKE ? OR
                pim.version_notes LIKE ?
              )
            )`,
            [searchTerm, searchTerm, compactBarcodeTerm, searchTerm, searchTerm]
          );
      });
    }

    return q;
  };

  // Total count
  const countResult = await applyFilters(db('media')).countDistinct('media.id as count').first();
  const total = countResult ? parseInt(String(countResult.count), 10) : 0;

  // Pagination
  const pageNum = Math.max(parseInt(String(page), 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
  const offset = (pageNum - 1) * limitNum;
  const totalPages = Math.ceil(total / limitNum);

  const sortDirection = sort_order === 'asc' ? 'asc' : 'desc';
  const dirSql = sortDirection.toUpperCase();
  const isSeriesSort = sort_by === 'series_sort';

  let mainQuery = applyFilters(db('media')).select('media.*');

  if (sort_by === 'title') {
    mainQuery = mainQuery.orderByRaw(`
      CASE
        WHEN LOWER(TRIM(media.title)) LIKE 'the %' THEN SUBSTR(TRIM(media.title), 5)
        WHEN LOWER(TRIM(media.title)) LIKE 'a %' THEN SUBSTR(TRIM(media.title), 3)
        WHEN LOWER(TRIM(media.title)) LIKE 'an %' THEN SUBSTR(TRIM(media.title), 4)
        ELSE TRIM(media.title)
      END COLLATE NOCASE ${dirSql},
      media.id ASC
    `);
  } else if (isSeriesSort) {
    // Handled in JS after fetching series associations so series internal_sort_method is respected
  } else if (sort_by === 'director_last_name') {
    mainQuery = mainQuery.orderByRaw(`
      CASE
        WHEN media.director IS NOT NULL AND TRIM(media.director) != ''
        THEN SUBSTR(TRIM(media.director), INSTR(TRIM(media.director) || ' ', ' ') + 1)
        ELSE NULL
      END COLLATE NOCASE ${dirSql} NULLS LAST,
      media.release_date ASC NULLS LAST,
      media.title COLLATE NOCASE ASC
    `);
  } else if (sort_by === 'release_date') {
    mainQuery = mainQuery.orderByRaw(`
      media.release_date ${dirSql} NULLS LAST,
      media.title COLLATE NOCASE ASC
    `);
  } else {
    // Default: created_at (most recently added physical copy in the collection)
    mainQuery = mainQuery.orderByRaw(`
      (
        SELECT MAX(pi.created_at)
        FROM physical_item_media pim
        JOIN physical_items pi ON pim.physical_item_id = pi.id
        WHERE pim.media_id = media.id
        AND ${archivedSql}
      ) ${dirSql} NULLS LAST,
      media.created_at ${dirSql},
      media.id DESC
    `);
  }

  if (!isSeriesSort) {
    mainQuery = mainQuery.limit(limitNum).offset(offset);
  }

  let mediaRows: any[] = await mainQuery;

  // If series_sort, load series data for all matching rows, sort, and slice page BEFORE loading heavy physical_item details
  const preloadedSeriesIds = new Set<number>();
  let allMovieSeriesAssocs: any[] = [];
  const seriesById = new Map<number, any>();

  if (isSeriesSort && mediaRows.length > 0) {
    const allIds = mediaRows.map((m) => m.id);
    allMovieSeriesAssocs = await db('movie_series')
      .whereIn('media_id', allIds)
      .select('media_id', 'series_id', 'sort_order');

    mediaRows.forEach((m) => {
      if (m.primary_series_id) preloadedSeriesIds.add(m.primary_series_id);
    });
    allMovieSeriesAssocs.forEach((a) => preloadedSeriesIds.add(a.series_id));

    if (preloadedSeriesIds.size > 0) {
      const seriesRows = await db('series')
        .whereIn('id', Array.from(preloadedSeriesIds))
        .select('id', 'name', 'sort_name', 'internal_sort_method');
      seriesRows.forEach((s) => seriesById.set(s.id, s));
    }

    const assocByMediaId = new Map<number, Array<{ series_id: number; sort_order: number | null }>>();
    allMovieSeriesAssocs.forEach((a) => {
      if (!assocByMediaId.has(a.media_id)) assocByMediaId.set(a.media_id, []);
      assocByMediaId.get(a.media_id)!.push({ series_id: a.series_id, sort_order: a.sort_order });
    });

    const getPrimarySeries = (m: any) => {
      if (m.primary_series_id && seriesById.has(m.primary_series_id)) {
        return seriesById.get(m.primary_series_id);
      }
      const assocs = assocByMediaId.get(m.id);
      if (assocs && assocs.length > 0) {
        return seriesById.get(assocs[0].series_id) ?? null;
      }
      return null;
    };

    mediaRows.sort((a, b) => {
      const seriesA = getPrimarySeries(a);
      const seriesB = getPrimarySeries(b);

      const primaryKeyA = seriesA?.sort_name || calculateSortName(a.title || '');
      const primaryKeyB = seriesB?.sort_name || calculateSortName(b.title || '');

      const primaryCompare = primaryKeyA.localeCompare(primaryKeyB, undefined, {
        sensitivity: 'base',
      });
      if (primaryCompare !== 0) {
        return sortDirection === 'asc' ? primaryCompare : -primaryCompare;
      }

      if (seriesA && seriesB && seriesA.id === seriesB.id) {
        const sortMethod = seriesA.internal_sort_method || 'chronological';
        let secondaryA: string | number | null = null;
        let secondaryB: string | number | null = null;

        if (sortMethod === 'chronological') {
          secondaryA = a.release_date || null;
          secondaryB = b.release_date || null;
        } else if (sortMethod === 'alphabetical') {
          secondaryA = calculateSortName(a.title || '');
          secondaryB = calculateSortName(b.title || '');
        } else if (sortMethod === 'custom') {
          const aAssoc = (assocByMediaId.get(a.id) || []).find(
            (x) => x.series_id === seriesA.id && x.sort_order !== null
          );
          const bAssoc = (assocByMediaId.get(b.id) || []).find(
            (x) => x.series_id === seriesB.id && x.sort_order !== null
          );
          secondaryA = aAssoc ? aAssoc.sort_order : null;
          secondaryB = bAssoc ? bAssoc.sort_order : null;
        }

        if (secondaryA === null && secondaryB !== null) {
          return sortDirection === 'asc' ? 1 : -1;
        }
        if (secondaryA !== null && secondaryB === null) {
          return sortDirection === 'asc' ? -1 : 1;
        }
        if (secondaryA !== null && secondaryB !== null) {
          const secCompare =
            typeof secondaryA === 'string' && typeof secondaryB === 'string'
              ? secondaryA.localeCompare(secondaryB, undefined, { sensitivity: 'base' })
              : (secondaryA as number) - (secondaryB as number);
          if (secCompare !== 0) {
            return sortDirection === 'asc' ? secCompare : -secCompare;
          }
        }
      }

      const fallbackCompare = calculateSortName(a.title || '').localeCompare(
        calculateSortName(b.title || ''),
        undefined,
        { sensitivity: 'base' }
      );
      return sortDirection === 'asc' ? fallbackCompare : -fallbackCompare;
    });

    mediaRows = mediaRows.slice(offset, offset + limitNum);
  }

  const pageMediaIds = mediaRows.map((m) => m.id);

  // Batch fetch series associations for the page (if not already loaded)
  if (!isSeriesSort && pageMediaIds.length > 0) {
    allMovieSeriesAssocs = await db('movie_series')
      .whereIn('media_id', pageMediaIds)
      .select('media_id', 'series_id', 'sort_order');

    const seriesIds = new Set<number>();
    mediaRows.forEach((m) => {
      if (m.primary_series_id) seriesIds.add(m.primary_series_id);
    });
    allMovieSeriesAssocs.forEach((a) => seriesIds.add(a.series_id));

    if (seriesIds.size > 0) {
      const seriesRows = await db('series')
        .whereIn('id', Array.from(seriesIds))
        .select('id', 'name', 'sort_name');
      seriesRows.forEach((s) => seriesById.set(s.id, s));
    }
  }

  // Batch fetch all linked physical items for this page of media
  const linkedItemRows =
    pageMediaIds.length > 0
      ? await db('physical_item_media as pim')
          .join('physical_items as pi', 'pim.physical_item_id', 'pi.id')
          .whereIn('pim.media_id', pageMediaIds)
          .whereRaw(archivedSql)
          .select(
            'pim.media_id',
            'pim.id as link_id',
            'pim.disc_number',
            'pim.formats as link_formats',
            'pim.version_notes as link_version_notes',
            'pi.id as physical_item_id',
            'pi.name',
            'pi.physical_format',
            'pi.edition_notes',
            'pi.notes',
            'pi.notes_public',
            'pi.archived',
            'pi.archive_reason',
            'pi.custom_image_url',
            'pi.custom_images',
            'pi.purchase_date',
            'pi.cost',
            'pi.thickness_units',
            'pi.created_at as item_created_at'
          )
          .orderBy('pi.created_at', 'desc')
          .orderBy('pim.id', 'asc')
      : [];

  const linkedPhysicalItemIds = Array.from(
    new Set(linkedItemRows.map((r: any) => Number(r.physical_item_id)))
  );

  // Batch fetch distinct media count per physical item (so UI knows if a copy is part of a box set)
  const mediaCountByItemId = new Map<number, number>();
  if (linkedPhysicalItemIds.length > 0) {
    const countRows = await db('physical_item_media')
      .whereIn('physical_item_id', linkedPhysicalItemIds)
      .groupBy('physical_item_id')
      .select('physical_item_id')
      .countDistinct('media_id as media_count');

    countRows.forEach((r: any) => {
      mediaCountByItemId.set(Number(r.physical_item_id), Number(r.media_count) || 1);
    });
  }

  // Batch fetch shelf placements for all linked physical items
  const placementByItemId = new Map<number, any>();
  if (linkedPhysicalItemIds.length > 0) {
    const placements = await db('shelf_placements')
      .leftJoin('shelves', 'shelf_placements.shelf_id', 'shelves.id')
      .leftJoin('shelf_groups', 'shelves.group_id', 'shelf_groups.id')
      .whereIn('shelf_placements.physical_item_id', linkedPhysicalItemIds)
      .select(
        'shelf_placements.id',
        'shelf_placements.shelf_id',
        'shelf_placements.physical_item_id',
        'shelf_placements.position',
        'shelves.display_name as shelf_display_name',
        'shelf_groups.display_name as group_display_name'
      );

    placements.forEach((p: any) => {
      placementByItemId.set(p.physical_item_id, {
        id: p.id,
        shelf_id: p.shelf_id,
        physical_item_id: p.physical_item_id,
        position: p.position,
        shelf_display_name: p.shelf_display_name,
        group_display_name: p.group_display_name,
      });
    });
  }

  // Group and deduplicate physical items per media_id
  const itemsByMediaId = new Map<number, Map<number, any>>();
  for (const row of linkedItemRows) {
    const mediaId = Number(row.media_id);
    const piId = Number(row.physical_item_id);
    if (!itemsByMediaId.has(mediaId)) {
      itemsByMediaId.set(mediaId, new Map());
    }
    const perMediaMap = itemsByMediaId.get(mediaId)!;

    const itemFormats = safeParseJsonArray<string>(row.physical_format);
    const linkFormats = safeParseJsonArray<string>(row.link_formats);
    const effectiveFormats = linkFormats.length > 0 ? linkFormats : itemFormats;
    const linkVersionTags = parseEditionTags(row.link_version_notes);

    if (!perMediaMap.has(piId)) {
      const parsedCustomImages = parseCustomImagesFromRow(row.custom_images, row.custom_image_url);
      const entry: any = {
        id: piId,
        name: row.name,
        physical_format: itemFormats,
        formats: [...effectiveFormats],
        edition_notes: row.edition_notes || undefined,
        version_notes: linkVersionTags.length > 0 ? linkVersionTags.join(', ') : null,
        disc_number: row.disc_number ?? undefined,
        custom_image_url: parsedCustomImages[0]?.url || row.custom_image_url || undefined,
        custom_images: parsedCustomImages,
        purchase_date: row.purchase_date || undefined,
        cost: canSeeCost ? normalizeCost(row.cost) : undefined,
        notes: isAdmin ? row.notes : row.notes_public ? row.notes : undefined,
        archived: isAdmin ? Boolean(row.archived) : undefined,
        archive_reason: isAdmin ? row.archive_reason || null : undefined,
        thickness_units: row.thickness_units || 1,
        media_count: mediaCountByItemId.get(piId) || 1,
        shelf_placement: placementByItemId.get(piId) || null,
        created_at: row.item_created_at || undefined,
      };
      if (!isAdmin) {
        delete entry.archived;
        delete entry.archive_reason;
        if (!canSeeCost) delete entry.cost;
      }
      perMediaMap.set(piId, entry);
    } else {
      // Movie linked multiple times on the same physical item (e.g. multiple cuts/discs)
      const existing = perMediaMap.get(piId)!;
      const mergedFormats = Array.from(new Set([...existing.formats, ...effectiveFormats])).sort(
        compareFormats
      );
      existing.formats = mergedFormats;
      const mergedVersions = parseEditionTags([existing.version_notes, ...linkVersionTags]);
      existing.version_notes = mergedVersions.length > 0 ? mergedVersions.join(', ') : null;
    }
  }

  // Build response items
  const items = mediaRows.map((m) => {
    const mediaSeries = allMovieSeriesAssocs
      .filter((a) => a.media_id === m.id)
      .map((a) => seriesById.get(a.series_id))
      .filter(Boolean);

    if (m.primary_series_id) {
      const idx = mediaSeries.findIndex((s: any) => s.id === m.primary_series_id);
      if (idx > 0) {
        const [preferred] = mediaSeries.splice(idx, 1);
        mediaSeries.unshift(preferred);
      } else if (idx === -1) {
        const preferred = seriesById.get(m.primary_series_id);
        if (preferred) mediaSeries.unshift(preferred);
      }
    }

    const ownedItemsMap = itemsByMediaId.get(m.id);
    const ownedItems = ownedItemsMap ? Array.from(ownedItemsMap.values()) : [];

    // Sort formats on each physical item cleanly
    ownedItems.forEach((pi) => {
      pi.formats = Array.from(new Set<string>(pi.formats || [])).sort(compareFormats);
    });

    // Aggregate owned formats, editions, and versions across all physical copies
    const ownedFormatsSet = new Set<string>();
    const rawEditions: string[] = [];
    const rawVersions: string[] = [];

    for (const pi of ownedItems) {
      const fmts = pi.formats && pi.formats.length > 0 ? pi.formats : pi.physical_format || [];
      fmts.forEach((f: string) => ownedFormatsSet.add(f));
      if (pi.edition_notes) rawEditions.push(pi.edition_notes);
      if (pi.version_notes) rawVersions.push(pi.version_notes);
    }

    const owned_formats = Array.from(ownedFormatsSet).sort(compareFormats);
    const owned_editions = parseEditionTags(rawEditions);
    const owned_versions = parseEditionTags(rawVersions);

    return {
      id: m.id,
      title: m.title,
      original_title: m.original_title || null,
      original_language: m.original_language || null,
      tmdb_id: m.tmdb_id,
      synopsis: m.synopsis,
      cover_art_url: m.cover_art_url,
      release_date: m.release_date,
      director: m.director,
      cast: safeParseJsonArray<string>(m.cast),
      genres: safeParseJsonArray<{ id: number; name: string }>(m.genres),
      series: mediaSeries.length > 0 ? mediaSeries : undefined,
      primary_series_id: m.primary_series_id,
      media_type: m.media_type,
      tv_show_tmdb_id: m.tv_show_tmdb_id,
      tv_show_name: m.tv_show_name,
      season_number: m.season_number,
      episode_count: m.episode_count,
      letterboxd_rating: m.letterboxd_rating ?? null,
      letterboxd_liked: Boolean(m.letterboxd_liked),
      letterboxd_watched: Boolean(m.letterboxd_watched),
      letterboxd_last_watched_date: m.letterboxd_last_watched_date || null,
      letterboxd_rewatch: Boolean(m.letterboxd_rewatch),
      letterboxd_uri: m.letterboxd_uri || null,
      letterboxd_updated_at: m.letterboxd_updated_at || null,
      created_at: m.created_at,
      updated_at: m.updated_at,
      owned_formats,
      owned_editions,
      owned_versions,
      physical_item_count: ownedItems.length,
      physical_items: ownedItems,
    };
  });

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
