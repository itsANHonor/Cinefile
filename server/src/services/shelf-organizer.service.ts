import { db } from '../database';
import { parseEditionTags } from '../utils/edition-tags.util';
import {
  EngineBlock,
  EngineItem,
  EnginePlacement,
  EngineShelf,
  IncrementalPlanResult,
  OrganizationLayoutResult,
  layoutOrganization,
  planIncrementalShelving,
} from './shelf-organizer.engine';

// ─────────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────────

function parseJsonArray(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** All shelves in global order (group sort_order, then shelf sort_order). */
export async function loadEngineShelves(): Promise<EngineShelf[]> {
  const rows = await db('shelves')
    .join('shelf_groups', 'shelves.group_id', 'shelf_groups.id')
    .select(
      'shelves.id',
      'shelves.group_id',
      'shelves.display_name',
      'shelf_groups.display_name as group_display_name',
      'shelves.capacity_units'
    )
    .orderBy('shelf_groups.sort_order', 'asc')
    .orderBy('shelves.sort_order', 'asc')
    .orderBy('shelves.id', 'asc');
  return rows.map((r: any) => ({
    id: r.id,
    group_id: r.group_id,
    display_name: r.display_name,
    group_display_name: r.group_display_name,
    capacity_units: r.capacity_units,
  }));
}

export async function loadEnginePlacements(): Promise<EnginePlacement[]> {
  const rows = await db('shelf_placements')
    .join('physical_items', 'shelf_placements.physical_item_id', 'physical_items.id')
    .where(function () {
      this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
    })
    .select('shelf_placements.shelf_id', 'shelf_placements.physical_item_id', 'shelf_placements.position', 'shelf_placements.is_pinned');
  return rows.map((r: any) => ({
    physical_item_id: r.physical_item_id,
    shelf_id: r.shelf_id,
    position: r.position,
    is_pinned: Boolean(r.is_pinned),
  }));
}

/**
 * Load per-item metadata used by the organizer engine for all non-archived
 * physical items (optionally restricted to a subset of ids).
 */
export async function loadEngineItems(onlyIds?: number[]): Promise<Map<number, EngineItem>> {
  let itemQuery = db('physical_items').where(function () {
    this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
  });
  if (onlyIds && onlyIds.length > 0) {
    itemQuery = itemQuery.whereIn('physical_items.id', onlyIds);
  }
  const itemRows = await itemQuery.select(
    'physical_items.id',
    'physical_items.name',
    'physical_items.sort_name',
    'physical_items.thickness_units',
    'physical_items.physical_format',
    'physical_items.edition_notes',
    'physical_items.sort_series_id',
    'physical_items.primary_series_id',
    'physical_items.created_at'
  );

  const itemIds = itemRows.map((r: any) => r.id);
  if (itemIds.length === 0) return new Map();

  const mediaRows = await db('physical_item_media')
    .join('media', 'physical_item_media.media_id', 'media.id')
    .whereIn('physical_item_media.physical_item_id', itemIds)
    .select(
      'physical_item_media.physical_item_id',
      'media.id as media_id',
      'media.title',
      'media.release_date',
      'media.director',
      'media.genres',
      'media.media_type',
      'media.tv_show_name',
      'media.season_number',
      'media.primary_series_id'
    )
    .orderBy('physical_item_media.disc_number', 'asc');

  const mediaIds = mediaRows.map((m: any) => m.media_id);
  const movieSeriesRows = mediaIds.length > 0
    ? await db('movie_series')
        .whereIn('media_id', mediaIds)
        .select('media_id', 'series_id', 'sort_order')
    : [];

  // Collect all series ids (item-level + media-level + junction).
  const seriesIds = new Set<number>();
  itemRows.forEach((r: any) => {
    if (r.sort_series_id) seriesIds.add(r.sort_series_id);
    if (r.primary_series_id) seriesIds.add(r.primary_series_id);
  });
  mediaRows.forEach((m: any) => {
    if (m.primary_series_id) seriesIds.add(m.primary_series_id);
  });
  movieSeriesRows.forEach((ms: any) => seriesIds.add(ms.series_id));

  const seriesRows = seriesIds.size > 0
    ? await db('series')
        .whereIn('id', Array.from(seriesIds))
        .select('id', 'name', 'sort_name', 'internal_sort_method')
    : [];
  const seriesMap = new Map(seriesRows.map((s: any) => [s.id, s]));

  const mediaByItem = new Map<number, any[]>();
  mediaRows.forEach((m: any) => {
    if (!mediaByItem.has(m.physical_item_id)) mediaByItem.set(m.physical_item_id, []);
    mediaByItem.get(m.physical_item_id)!.push(m);
  });
  const movieSeriesByMedia = new Map<number, any[]>();
  movieSeriesRows.forEach((ms: any) => {
    if (!movieSeriesByMedia.has(ms.media_id)) movieSeriesByMedia.set(ms.media_id, []);
    movieSeriesByMedia.get(ms.media_id)!.push(ms);
  });

  const result = new Map<number, EngineItem>();
  for (const row of itemRows) {
    const linked = mediaByItem.get(row.id) || [];

    // ── Series resolution (mirrors series_sort in physical-items routes) ──
    const itemSeriesIds = new Set<number>();
    if (row.sort_series_id) itemSeriesIds.add(row.sort_series_id);
    if (row.primary_series_id) itemSeriesIds.add(row.primary_series_id);
    let primarySeriesId: number | null = row.sort_series_id || row.primary_series_id || null;
    for (const m of linked) {
      if (m.primary_series_id) itemSeriesIds.add(m.primary_series_id);
      (movieSeriesByMedia.get(m.media_id) || []).forEach((ms: any) => itemSeriesIds.add(ms.series_id));
    }
    if (primarySeriesId === null) {
      for (const m of linked) {
        if (m.primary_series_id) {
          primarySeriesId = m.primary_series_id;
          break;
        }
        const assoc = (movieSeriesByMedia.get(m.media_id) || [])[0];
        if (assoc) {
          primarySeriesId = assoc.series_id;
          break;
        }
      }
    }
    const primarySeries = primarySeriesId !== null ? seriesMap.get(primarySeriesId) : null;

    // Min custom sort_order within the primary series.
    let seriesCustomOrder: number | null = null;
    if (primarySeriesId !== null) {
      linked.forEach((m: any) => {
        (movieSeriesByMedia.get(m.media_id) || [])
          .filter((ms: any) => ms.series_id === primarySeriesId && ms.sort_order !== null)
          .forEach((ms: any) => {
            if (seriesCustomOrder === null || ms.sort_order < seriesCustomOrder) {
              seriesCustomOrder = ms.sort_order;
            }
          });
      });
    }

    // ── Genres / directors / media types / TV fields / dates ──
    const genreNames = new Set<string>();
    const directorNames = new Set<string>();
    const mediaTypes = new Set<string>();
    const releaseDates: string[] = [];
    let tvShowName: string | null = null;
    let minSeason: number | null = null;

    linked.forEach((m: any) => {
      parseJsonArray(m.genres).forEach((g: any) => {
        if (g && g.name) genreNames.add(String(g.name));
      });
      if (m.director) {
        String(m.director)
          .split(/[,;&]/)
          .map((d) => d.trim())
          .filter(Boolean)
          .forEach((d) => directorNames.add(d));
      }
      mediaTypes.add(m.media_type || 'movie');
      if (m.release_date) releaseDates.push(String(m.release_date));
      if (m.media_type === 'tv_season') {
        if (!tvShowName && m.tv_show_name) tvShowName = m.tv_show_name;
        if (m.season_number !== null && m.season_number !== undefined) {
          const sn = Number(m.season_number);
          if (minSeason === null || sn < minSeason) minSeason = sn;
        }
      }
    });

    releaseDates.sort();
    const earliestRelease = releaseDates.length > 0 ? releaseDates[0] : null;
    const releaseYear = earliestRelease ? parseInt(earliestRelease.slice(0, 4), 10) : NaN;
    const decade = Number.isFinite(releaseYear) ? String(Math.floor(releaseYear / 10) * 10) : null;

    result.set(row.id, {
      id: row.id,
      name: row.name,
      sort_name: row.sort_name ?? null,
      thickness_units: row.thickness_units || 1,
      formats: parseJsonArray(row.physical_format).map(String),
      edition_tags: parseEditionTags(row.edition_notes),
      has_series: itemSeriesIds.size > 0,
      series_ids: Array.from(itemSeriesIds),
      primary_series_id: primarySeriesId,
      series_sort_name: primarySeries ? primarySeries.sort_name || primarySeries.name : null,
      series_internal_sort: primarySeries?.internal_sort_method || null,
      series_custom_order: seriesCustomOrder,
      genre_names: Array.from(genreNames),
      director_names: Array.from(directorNames),
      earliest_release_date: earliestRelease,
      decade,
      media_types: Array.from(mediaTypes),
      tv_show_name: tvShowName,
      min_season_number: minSeason,
      created_at: row.created_at ? String(row.created_at) : null,
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Organization blocks persistence
// ─────────────────────────────────────────────────────────────────────────────

function rowToBlock(row: any): EngineBlock & { id: number; sort_order: number } {
  return {
    id: row.id,
    name: row.name,
    color: row.color || '#6366f1',
    sort_order: row.sort_order,
    enabled: Boolean(row.enabled),
    target_scope: row.target_scope === 'group' ? 'group' : 'library',
    target_group_id: row.target_group_id ?? null,
    start_on_fresh_shelf: Boolean(row.start_on_fresh_shelf),
    headroom_units_override: row.headroom_units_override ?? null,
    filter_rules: (() => {
      try {
        return row.filter_rules ? JSON.parse(row.filter_rules) : {};
      } catch {
        return {};
      }
    })(),
    sort_by: row.sort_by || 'title',
    sort_direction: row.sort_direction === 'desc' ? 'desc' : 'asc',
  };
}

export async function loadBlocks(): Promise<Array<EngineBlock & { id: number; sort_order: number }>> {
  const library = await db('physical_library').first();
  if (!library) return [];
  const rows = await db('shelf_organization_blocks')
    .where('library_id', library.id)
    .orderBy('sort_order', 'asc')
    .orderBy('id', 'asc');
  return rows.map(rowToBlock);
}

export async function getOrganization() {
  const library = await db('physical_library').first();
  const blocks = await loadBlocks();
  return {
    headroom_units: library?.default_headroom_units ?? 2,
    blocks,
  };
}

/** Replace all blocks + headroom in a single transaction. */
export async function saveOrganization(
  blocks: any[],
  headroomUnits: number | null | undefined
): Promise<void> {
  const library = await db('physical_library').first();
  if (!library) throw new Error('Physical library not found');

  await db.transaction(async (trx) => {
    if (headroomUnits !== undefined && headroomUnits !== null) {
      await trx('physical_library')
        .where('id', library.id)
        .update({ default_headroom_units: Math.max(0, Math.min(5, Math.floor(headroomUnits))) });
    }
    await trx('shelf_organization_blocks').where('library_id', library.id).delete();
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      await trx('shelf_organization_blocks').insert({
        library_id: library.id,
        name: String(b.name || `Block ${i + 1}`).slice(0, 200),
        color: String(b.color || '#6366f1').slice(0, 20),
        sort_order: i,
        enabled: b.enabled === false ? 0 : 1,
        target_scope: b.target_scope === 'group' ? 'group' : 'library',
        target_group_id:
          b.target_scope === 'group' && b.target_group_id !== undefined && b.target_group_id !== null
            ? Number(b.target_group_id)
            : null,
        start_on_fresh_shelf: b.start_on_fresh_shelf === false ? 0 : 1,
        headroom_units_override:
          b.headroom_units_override === undefined || b.headroom_units_override === null
            ? null
            : Math.max(0, Math.min(5, Math.floor(Number(b.headroom_units_override)))),
        filter_rules: JSON.stringify(b.filter_rules || {}),
        sort_by: String(b.sort_by || 'title'),
        sort_direction: b.sort_direction === 'desc' ? 'desc' : 'asc',
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Full organization evaluation / apply
// ─────────────────────────────────────────────────────────────────────────────

function draftToEngineBlock(b: any, idx: number): EngineBlock {
  return {
    id: b.id ?? `draft-${idx}`,
    name: String(b.name || `Block ${idx + 1}`),
    color: String(b.color || '#6366f1'),
    enabled: b.enabled !== false,
    target_scope: b.target_scope === 'group' ? 'group' : 'library',
    target_group_id: b.target_group_id ?? null,
    start_on_fresh_shelf: b.start_on_fresh_shelf !== false,
    headroom_units_override: b.headroom_units_override ?? null,
    filter_rules: b.filter_rules || {},
    sort_by: b.sort_by || 'title',
    sort_direction: b.sort_direction === 'desc' ? 'desc' : 'asc',
  };
}

export async function evaluateOrganization(
  draftBlocks?: any[],
  headroomUnits?: number
): Promise<OrganizationLayoutResult> {
  const library = await db('physical_library').first();
  const headroom = headroomUnits ?? library?.default_headroom_units ?? 2;
  const blocks: EngineBlock[] =
    draftBlocks !== undefined
      ? draftBlocks.map((b, i) => draftToEngineBlock(b, i))
      : await loadBlocks();

  const shelves = await loadEngineShelves();
  const placements = await loadEnginePlacements();
  const items = await loadEngineItems();

  return layoutOrganization({
    shelves,
    items: Array.from(items.values()),
    pinnedPlacements: placements.filter((p) => p.is_pinned),
    blocks,
    default_headroom: headroom,
  });
}

/** Commit a layout result to shelf_placements inside a transaction. */
export async function commitLayout(layout: OrganizationLayoutResult): Promise<void> {
  await db.transaction(async (trx) => {
    // Remove every placement; pinned state is carried through the layout items.
    const shelfIds = layout.shelves.map((s) => s.shelf_id);
    if (shelfIds.length > 0) {
      await trx('shelf_placements').whereIn('shelf_id', shelfIds).delete();
    }
    for (const shelf of layout.shelves) {
      for (const item of shelf.items) {
        await trx('shelf_placements').insert({
          shelf_id: shelf.shelf_id,
          physical_item_id: item.physical_item_id,
          position: item.position,
          is_pinned: item.is_pinned ? 1 : 0,
        });
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Incremental shelving (queue)
// ─────────────────────────────────────────────────────────────────────────────

export async function planShelving(
  queuedItemIds: number[],
  boundaryMode?: 'share' | 'shift'
): Promise<IncrementalPlanResult> {
  const shelves = await loadEngineShelves();
  const placements = await loadEnginePlacements();
  const blocks = await loadBlocks();
  const items = await loadEngineItems();

  return planIncrementalShelving({
    shelves,
    placements,
    items: Array.from(items.values()),
    queued_item_ids: queuedItemIds,
    blocks,
    boundary_mode: boundaryMode,
  });
}

/**
 * Commit queue plan: for each touched shelf, replace its placement list with
 * the plan's `after` order (preserving pin state from prior placements).
 */
export async function commitShelvingPlan(
  plan: IncrementalPlanResult,
  existingPlacements: EnginePlacement[]
): Promise<void> {
  const pinnedByItem = new Map<number, boolean>();
  existingPlacements.forEach((p) => pinnedByItem.set(p.physical_item_id, p.is_pinned));

  await db.transaction(async (trx) => {
    for (const diff of plan.shelf_diffs) {
      if (!diff.touched) continue;
      await trx('shelf_placements').where('shelf_id', diff.shelf_id).delete();
      for (const item of diff.after) {
        await trx('shelf_placements').insert({
          shelf_id: diff.shelf_id,
          physical_item_id: item.physical_item_id,
          position: item.position,
          is_pinned: pinnedByItem.get(item.physical_item_id) ? 1 : 0,
        });
      }
    }
  });
}
