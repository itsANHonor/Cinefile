/**
 * Pure shelf-organization engine: rule-block matching, item sorting,
 * full-library layout and minimal-ripple incremental shelving.
 *
 * This module is intentionally free of database imports so the same logic can
 * be unit-tested directly. All inputs are plain JSON-compatible structures
 * prepared by shelf-organizer.service.ts.
 */

// Canonical format order for `physical_format` sorting (lower index = earlier).
export const CANONICAL_FORMAT_ORDER = [
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

export type ShelfBlockSortBy =
  | 'title'
  | 'series_sort'
  | 'tv_show_season'
  | 'director_last_name'
  | 'release_date'
  | 'created_at'
  | 'physical_format';

export type ShelfBlockTargetScope = 'library' | 'group';

export interface EngineFilterRules {
  match_all?: boolean;
  media_type?: 'movie' | 'tv_season';
  formats?: string[];
  edition_tags?: string[];
  series_ids?: number[];
  has_series?: boolean;
  genre_names?: string[];
  directors?: string[];
  decades?: string[];
}

export interface EngineBlock {
  id: number | string;
  name: string;
  color: string;
  enabled: boolean;
  target_scope: ShelfBlockTargetScope;
  target_group_id?: number | null;
  start_on_fresh_shelf: boolean;
  headroom_units_override?: number | null;
  filter_rules: EngineFilterRules;
  sort_by: ShelfBlockSortBy;
  sort_direction: 'asc' | 'desc';
}

/** Pre-resolved, per-physical-item metadata used for matching and sorting. */
export interface EngineItem {
  id: number;
  name: string;
  sort_name: string | null;
  thickness_units: number;
  formats: string[];
  edition_tags: string[]; // lowercased for matching? we store raw; matching lowercases
  has_series: boolean;
  series_ids: number[];
  primary_series_id: number | null;
  series_sort_name: string | null;
  series_internal_sort: 'chronological' | 'alphabetical' | 'custom' | null;
  series_custom_order: number | null;
  genre_names: string[];
  director_names: string[];
  earliest_release_date: string | null;
  decade: string | null;
  media_types: string[];
  tv_show_name: string | null;
  min_season_number: number | null;
  created_at: string | null;
}

export interface EngineShelf {
  id: number;
  group_id: number;
  display_name: string;
  group_display_name: string;
  capacity_units: number;
}

export interface EnginePlacement {
  physical_item_id: number;
  shelf_id: number;
  position: number;
  is_pinned: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching
// ─────────────────────────────────────────────────────────────────────────────

function normalizeList(values?: string[]): string[] {
  return (values || []).map((v) => v.trim().toLowerCase()).filter(Boolean);
}

function intersects(a: string[], b: string[]): boolean {
  const set = new Set(b);
  return a.some((v) => set.has(v));
}

/**
 * Returns true when the item satisfies the block's filter rules.
 * `match_all` is the catch-all. A filtered block with no criteria matches
 * nothing (so an accidentally-empty block is visible instead of silently
 * swallowing the whole collection).
 */
export function matchBlock(item: EngineItem, rules: EngineFilterRules): boolean {
  if (rules.match_all) return true;

  const hasCriteria =
    rules.media_type !== undefined ||
    (rules.formats?.length ?? 0) > 0 ||
    (rules.edition_tags?.length ?? 0) > 0 ||
    (rules.series_ids?.length ?? 0) > 0 ||
    rules.has_series === true ||
    (rules.genre_names?.length ?? 0) > 0 ||
    (rules.directors?.length ?? 0) > 0 ||
    (rules.decades?.length ?? 0) > 0;
  if (!hasCriteria) return false;

  if (rules.media_type !== undefined && !item.media_types.includes(rules.media_type)) {
    return false;
  }
  if (
    (rules.formats?.length ?? 0) > 0 &&
    !intersects(normalizeList(item.formats), normalizeList(rules.formats))
  ) {
    return false;
  }
  if (
    (rules.edition_tags?.length ?? 0) > 0 &&
    !intersects(normalizeList(item.edition_tags), normalizeList(rules.edition_tags))
  ) {
    return false;
  }
  if (
    (rules.series_ids?.length ?? 0) > 0 &&
    !item.series_ids.some((id) => rules.series_ids!.includes(id))
  ) {
    return false;
  }
  if (rules.has_series === true && !item.has_series) {
    return false;
  }
  if (
    (rules.genre_names?.length ?? 0) > 0 &&
    !intersects(normalizeList(item.genre_names), normalizeList(rules.genre_names))
  ) {
    return false;
  }
  if ((rules.directors?.length ?? 0) > 0) {
    const wanted = normalizeList(rules.directors);
    const matches = item.director_names.some((d) =>
      wanted.some((w) => d.toLowerCase().includes(w))
    );
    if (!matches) return false;
  }
  if ((rules.decades?.length ?? 0) > 0) {
    if (!item.decade || !rules.decades!.includes(item.decade)) return false;
  }

  return true;
}

/** First enabled block (in order) that matches the item, or null. */
export function winningBlockFor(item: EngineItem, blocks: EngineBlock[]): EngineBlock | null {
  for (const block of blocks) {
    if (!block.enabled) continue;
    if (matchBlock(item, block.filter_rules)) return block;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorting
// ─────────────────────────────────────────────────────────────────────────────

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function titleKey(item: EngineItem): string {
  return (item.sort_name || item.name || '').trim();
}

function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function formatRank(item: EngineItem): number {
  const formats = normalizeList(item.formats);
  let best = CANONICAL_FORMAT_ORDER.length + 1;
  formats.forEach((f) => {
    const idx = CANONICAL_FORMAT_ORDER.findIndex((c) => c.toLowerCase() === f);
    if (idx !== -1 && idx < best) best = idx;
  });
  return best;
}

function compareNullable(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls last
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/** Comparator for a block's sort configuration. Always deterministic. */
export function compareItems(block: EngineBlock): (a: EngineItem, b: EngineItem) => number {
  const dir = block.sort_direction === 'desc' ? -1 : 1;
  return (a, b) => {
    let cmp = 0;
    switch (block.sort_by) {
      case 'title':
        cmp = collator.compare(titleKey(a), titleKey(b));
        break;
      case 'series_sort': {
        // Series name first (items without a series sort by title, together)
        const sa = a.series_sort_name || titleKey(a);
        const sb = b.series_sort_name || titleKey(b);
        cmp = collator.compare(sa, sb);
        if (cmp === 0 && a.primary_series_id !== null && a.primary_series_id === b.primary_series_id) {
          // Same series — order inside the series
          const method = a.series_internal_sort || 'chronological';
          if (method === 'alphabetical') {
            cmp = collator.compare(titleKey(a), titleKey(b));
          } else if (method === 'custom') {
            cmp = compareNullable(a.series_custom_order, b.series_custom_order);
          } else {
            cmp = compareNullable(a.earliest_release_date, b.earliest_release_date);
          }
        }
        break;
      }
      case 'tv_show_season': {
        cmp = collator.compare(a.tv_show_name || titleKey(a), b.tv_show_name || titleKey(b));
        if (cmp === 0) {
          cmp = compareNullable(a.min_season_number, b.min_season_number);
        }
        break;
      }
      case 'director_last_name': {
        const da = a.director_names.length > 0 ? lastName(a.director_names[0]) : null;
        const db = b.director_names.length > 0 ? lastName(b.director_names[0]) : null;
        cmp = compareNullable(da, db);
        if (cmp === 0) cmp = compareNullable(a.director_names[0] ?? null, b.director_names[0] ?? null);
        break;
      }
      case 'release_date':
        cmp = compareNullable(a.earliest_release_date, b.earliest_release_date);
        break;
      case 'created_at':
        cmp = compareNullable(a.created_at, b.created_at);
        break;
      case 'physical_format': {
        cmp = formatRank(a) - formatRank(b);
        break;
      }
    }
    if (cmp === 0) cmp = collator.compare(titleKey(a), titleKey(b));
    if (cmp === 0) cmp = a.id - b.id;
    return dir === 1 ? cmp : -cmp;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Full organization layout
// ─────────────────────────────────────────────────────────────────────────────

export interface LayoutItem {
  physical_item_id: number;
  name: string;
  thickness_units: number;
  block_id: number | string | null;
  is_pinned: boolean;
  position: number;
}

export interface LayoutShelf {
  shelf_id: number;
  shelf_display_name: string;
  group_id: number;
  group_display_name: string;
  capacity_units: number;
  effective_capacity_units: number;
  used_units: number;
  items: LayoutItem[];
  overflow: boolean;
}

export interface LayoutBlockSummary {
  block_id: number | string;
  name: string;
  color: string;
  item_count: number;
  unit_count: number;
}

export interface LayoutUnmatched {
  physical_item_id: number;
  name: string;
  thickness_units: number;
}

export interface OrganizationLayoutResult {
  shelves: LayoutShelf[];
  blocks: LayoutBlockSummary[];
  unmatched_items: LayoutUnmatched[];
  unplaceable_items: LayoutUnmatched[];
}

function effectiveCapacity(shelf: EngineShelf, headroom: number, pinnedUnits: number): number {
  return Math.max(1, shelf.capacity_units - headroom) - pinnedUnits;
}

/**
 * Full-library layout: assigns every item to its winning block (first match
 * wins), sorts within each block, and flows items across the block's target
 * scope honoring headroom and fresh-shelf boundaries.
 */
export function layoutOrganization(input: {
  shelves: EngineShelf[]; // global order (group sort, then shelf sort)
  items: EngineItem[]; // all placeable items (placed + unassigned), excluding archived
  pinnedPlacements: EnginePlacement[];
  blocks: EngineBlock[]; // ordered
  default_headroom: number;
}): OrganizationLayoutResult {
  const { shelves, items, pinnedPlacements, blocks, default_headroom } = input;

  const itemById = new Map(items.map((i) => [i.id, i]));
  const pinnedIds = new Set(pinnedPlacements.map((p) => p.physical_item_id));
  const pool = items.filter((i) => !pinnedIds.has(i.id));

  // Pinned items grouped by shelf, ordered by their recorded position.
  const pinnedByShelf = new Map<number, EnginePlacement[]>();
  pinnedPlacements.forEach((p) => {
    if (!itemById.has(p.physical_item_id)) return;
    if (!pinnedByShelf.has(p.shelf_id)) pinnedByShelf.set(p.shelf_id, []);
    pinnedByShelf.get(p.shelf_id)!.push(p);
  });
  pinnedByShelf.forEach((list) => list.sort((a, b) => a.position - b.position));
  const pinnedUnitsByShelf = new Map<number, number>();
  pinnedByShelf.forEach((list, shelfId) => {
    pinnedUnitsByShelf.set(
      shelfId,
      list.reduce((sum, p) => sum + (itemById.get(p.physical_item_id)?.thickness_units || 1), 0)
    );
  });

  // Assign pool items to blocks (first match wins).
  const itemsByBlock = new Map<number | string, EngineItem[]>();
  const unmatched: EngineItem[] = [];
  pool.forEach((item) => {
    const block = winningBlockFor(item, blocks);
    if (!block) {
      unmatched.push(item);
      return;
    }
    if (!itemsByBlock.has(block.id)) itemsByBlock.set(block.id, []);
    itemsByBlock.get(block.id)!.push(item);
  });

  // Track shelf contents (unpinned) and cursors per scope.
  const shelfItems = new Map<number, EngineItem[]>();
  shelves.forEach((s) => shelfItems.set(s.id, []));
  const shelfUsed = new Map<number, number>();
  shelves.forEach((s) => shelfUsed.set(s.id, pinnedUnitsByShelf.get(s.id) || 0));

  const scopeShelves = new Map<string, EngineShelf[]>();
  const scopeCursor = new Map<string, number>();
  const scopeKey = (block: EngineBlock) =>
    block.target_scope === 'group' && block.target_group_id != null
      ? `group:${block.target_group_id}`
      : 'library';
  const shelvesForScope = (key: string): EngineShelf[] => {
    if (!scopeShelves.has(key)) {
      scopeShelves.set(
        key,
        key === 'library'
          ? shelves
          : shelves.filter((s) => s.group_id === Number(key.slice(6)))
      );
    }
    return scopeShelves.get(key)!;
  };

  const unplaceable: EngineItem[] = [];

  for (const block of blocks) {
    if (!block.enabled) continue;
    const matched = (itemsByBlock.get(block.id) || []).slice().sort(compareItems(block));
    if (matched.length === 0) continue;

    const key = scopeKey(block);
    const scope = shelvesForScope(key);
    const headroom = block.headroom_units_override ?? default_headroom;
    let cursor = scopeCursor.get(key) ?? 0;

    const shelfHasItems = (shelf: EngineShelf) =>
      (shelfItems.get(shelf.id) || []).length > 0 || (pinnedByShelf.get(shelf.id) || []).length > 0;

    if (block.start_on_fresh_shelf) {
      while (cursor < scope.length && shelfHasItems(scope[cursor])) cursor++;
    }
    // Ensure cursor is never before any previously-used shelf in this scope.
    cursor = Math.max(cursor, scopeCursor.get(key) ?? 0);

    for (const item of matched) {
      const thickness = item.thickness_units || 1;
      let placed = false;
      while (cursor < scope.length) {
        const shelf = scope[cursor];
        const cap = effectiveCapacity(shelf, headroom, pinnedUnitsByShelf.get(shelf.id) || 0);
        const unpinnedUsed = (shelfUsed.get(shelf.id) || 0) - (pinnedUnitsByShelf.get(shelf.id) || 0);
        if (unpinnedUsed + thickness <= cap) {
          shelfItems.get(shelf.id)!.push(item);
          shelfUsed.set(shelf.id, (shelfUsed.get(shelf.id) || 0) + thickness);
          placed = true;
          break;
        }
        cursor++;
      }
      if (!placed) {
        unplaceable.push(item);
        cursor = scope.length;
      }
    }
    scopeCursor.set(key, cursor);
  }

  // Assemble per-shelf ordered item lists (pinned items keep their slot).
  const resultShelves: LayoutShelf[] = shelves.map((shelf) => {
    const unpinned = shelfItems.get(shelf.id) || [];
    const pinned = pinnedByShelf.get(shelf.id) || [];

    // Merge: pinned placements keep their original index (clamped into range).
    const ordered: { item: EngineItem; is_pinned: boolean }[] = unpinned.map((item) => ({
      item,
      is_pinned: false,
    }));
    pinned.forEach((p) => {
      const item = itemById.get(p.physical_item_id)!;
      const idx = Math.min(Math.max(0, p.position), ordered.length);
      ordered.splice(idx, 0, { item, is_pinned: true });
    });

    // Which block does each unpinned item belong to? Recompute (cheap: set).
    const itemBlock = new Map<number, number | string>();
    for (const block of blocks) {
      if (!block.enabled) continue;
      for (const it of itemsByBlock.get(block.id) || []) itemBlock.set(it.id, block.id);
    }

    const itemsOut: LayoutItem[] = ordered.map((entry, idx) => ({
      physical_item_id: entry.item.id,
      name: entry.item.name,
      thickness_units: entry.item.thickness_units || 1,
      block_id: entry.is_pinned ? null : itemBlock.get(entry.item.id) ?? null,
      is_pinned: entry.is_pinned,
      position: idx,
    }));

    const used = itemsOut.reduce((sum, i) => sum + i.thickness_units, 0);
    return {
      shelf_id: shelf.id,
      shelf_display_name: shelf.display_name,
      group_id: shelf.group_id,
      group_display_name: shelf.group_display_name,
      capacity_units: shelf.capacity_units,
      effective_capacity_units: Math.max(1, shelf.capacity_units - default_headroom),
      used_units: used,
      items: itemsOut,
      overflow: used > shelf.capacity_units,
    };
  });

  const blockSummaries: LayoutBlockSummary[] = blocks
    .filter((b) => b.enabled)
    .map((block) => {
      const blockItems = itemsByBlock.get(block.id) || [];
      return {
        block_id: block.id,
        name: block.name,
        color: block.color,
        item_count: blockItems.length,
        unit_count: blockItems.reduce((s, i) => s + (i.thickness_units || 1), 0),
      };
    });

  return {
    shelves: resultShelves,
    blocks: blockSummaries,
    unmatched_items: unmatched.map((i) => ({
      physical_item_id: i.id,
      name: i.name,
      thickness_units: i.thickness_units || 1,
    })),
    unplaceable_items: unplaceable.map((i) => ({
      physical_item_id: i.id,
      name: i.name,
      thickness_units: i.thickness_units || 1,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Incremental shelving (minimal ripple)
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanAssignment {
  physical_item_id: number;
  physical_item_name: string;
  thickness_units: number;
  status: 'ok' | 'unmatched' | 'no_space';
  block_id?: number | string | null;
  block_name?: string;
  block_color?: string;
  target_shelf_id?: number;
  target_shelf_name?: string;
  target_group_name?: string;
  position?: number;
  before_item_name?: string | null;
  after_item_name?: string | null;
}

export interface PlanStep {
  kind: 'move' | 'insert';
  physical_item_id: number;
  physical_item_name: string;
  from_shelf_id?: number;
  from_shelf_name?: string;
  to_shelf_id: number;
  to_shelf_name: string;
  to_group_name: string;
  to_position: number;
  before_item_name?: string | null;
  after_item_name?: string | null;
}

export interface PlanShelfDiffItem {
  physical_item_id: number;
  name: string;
  thickness_units: number;
  position: number;
  change: 'unchanged' | 'new' | 'shifted';
}

export interface PlanShelfDiff {
  shelf_id: number;
  shelf_display_name: string;
  group_id: number;
  group_display_name: string;
  capacity_units: number;
  before_used_units: number;
  used_units: number;
  touched: boolean;
  before: PlanShelfDiffItem[];
  after: PlanShelfDiffItem[];
}

export interface PlanBoundaryConflict {
  from_shelf_id: number;
  from_shelf_name: string;
  to_shelf_id: number;
  to_shelf_name: string;
  to_block_name: string;
}

export interface IncrementalPlanResult {
  assignments: PlanAssignment[];
  steps: PlanStep[];
  shelf_diffs: PlanShelfDiff[];
  boundary_conflicts: PlanBoundaryConflict[];
  has_blocks: boolean;
}

interface WorkingItem {
  id: number;
  name: string;
  thickness: number;
  is_pinned: boolean;
  is_new: boolean;
  moved: boolean; // shifted by ripple
}

/**
 * Minimal-ripple incremental shelving plan: each queued item is inserted at
 * its sorted position inside its winning block's scope; overflowing shelves
 * push only their rightmost non-pinned items forward to the next shelf,
 * stopping at the first shelf with spare capacity.
 */
export function planIncrementalShelving(input: {
  shelves: EngineShelf[]; // global order
  placements: EnginePlacement[]; // current placements
  items: EngineItem[]; // metadata for ALL items involved (placed + queued)
  queued_item_ids: number[];
  blocks: EngineBlock[]; // ordered, may be empty
  boundary_mode?: 'share' | 'shift';
}): IncrementalPlanResult {
  const { shelves, placements, items, queued_item_ids, blocks, boundary_mode } = input;
  const enabledBlocks = blocks.filter((b) => b.enabled);
  const hasBlocks = enabledBlocks.length > 0;

  const itemById = new Map(items.map((i) => [i.id, i]));
  const shelfById = new Map(shelves.map((s) => [s.id, s]));
  const shelfIndex = new Map(shelves.map((s, i) => [s.id, i]));

  // Working state: ordered contents per shelf.
  const contents = new Map<number, WorkingItem[]>();
  shelves.forEach((s) => contents.set(s.id, []));
  placements
    .slice()
    .sort((a, b) => a.position - b.position)
    .forEach((p) => {
      const meta = itemById.get(p.physical_item_id);
      if (!meta || !contents.has(p.shelf_id)) return;
      contents.get(p.shelf_id)!.push({
        id: p.physical_item_id,
        name: meta.name,
        thickness: meta.thickness_units || 1,
        is_pinned: p.is_pinned,
        is_new: false,
        moved: false,
      });
    });

  // Which block does each currently-placed item belong to? (cache)
  const placedBlockCache = new Map<number, EngineBlock | null>();
  const blockOfPlaced = (id: number): EngineBlock | null => {
    if (!placedBlockCache.has(id)) {
      const meta = itemById.get(id);
      placedBlockCache.set(id, meta ? winningBlockFor(meta, blocks) : null);
    }
    return placedBlockCache.get(id)!;
  };

  // First occupied shelf index per block in its scope (for fresh-boundary detection).
  const boundaryShelfOfBlock = new Map<number | string, number>(); // block.id -> shelf_id
  const scopeKeyOf = (block: EngineBlock) =>
    block.target_scope === 'group' && block.target_group_id != null
      ? `group:${block.target_group_id}`
      : 'library';
  const scopeShelfIds = (block: EngineBlock): number[] => {
    const key = scopeKeyOf(block);
    if (key === 'library') return shelves.map((s) => s.id);
    const gid = Number(key.slice(6));
    return shelves.filter((s) => s.group_id === gid).map((s) => s.id);
  };
  enabledBlocks.forEach((block) => {
    if (!block.start_on_fresh_shelf) return;
    for (const sid of scopeShelfIds(block)) {
      const hasBlockItems = (contents.get(sid) || []).some((w) => blockOfPlaced(w.id)?.id === block.id);
      if (hasBlockItems) {
        boundaryShelfOfBlock.set(block.id, sid);
        break;
      }
    }
  });

  const usedUnits = (shelfId: number) =>
    (contents.get(shelfId) || []).reduce((sum, w) => sum + w.thickness, 0);

  const initialShelfByItem = new Map<number, number>();
  placements.forEach((p) => {
    if (shelfById.has(p.shelf_id)) {
      initialShelfByItem.set(p.physical_item_id, p.shelf_id);
    }
  });

  const assignments: PlanAssignment[] = [];
  const boundaryConflicts = new Map<string, PlanBoundaryConflict>();

  const queueMeta = queued_item_ids
    .map((id) => itemById.get(id))
    .filter((i): i is EngineItem => !!i && !placements.some((p) => p.physical_item_id === i.id));

  for (const item of queueMeta) {
    const thickness = item.thickness_units || 1;
    const block = winningBlockFor(item, blocks);

    const baseAssignment: PlanAssignment = {
      physical_item_id: item.id,
      physical_item_name: item.name,
      thickness_units: thickness,
      status: 'ok',
    };

    if (hasBlocks && !block) {
      assignments.push({ ...baseAssignment, status: 'unmatched' });
      continue;
    }

    // Determine target scope shelves: block scope, or whole library if no blocks.
    const scopeIds = block ? scopeShelfIds(block) : shelves.map((s) => s.id);
    if (scopeIds.length === 0) {
      assignments.push({ ...baseAssignment, status: 'no_space', block_id: block?.id, block_name: block?.name, block_color: block?.color });
      continue;
    }

    // Ordered sequence of currently-placed items belonging to this block within scope.
    const blockSequence: { item: WorkingItem; shelf_id: number; position: number }[] = [];
    if (block) {
      for (const sid of scopeIds) {
        (contents.get(sid) || []).forEach((w, pos) => {
          if (blockOfPlaced(w.id)?.id === block.id) {
            blockSequence.push({ item: w, shelf_id: sid, position: pos });
          }
        });
      }
    }

    // Find insertion index inside the block sequence via the block comparator.
    let insertSeqIdx = blockSequence.length; // default: end of block run
    if (block) {
      const cmp = compareItems(block);
      insertSeqIdx = blockSequence.findIndex((entry) => {
        const meta = itemById.get(entry.item.id)!;
        return cmp(item, meta) < 0;
      });
      if (insertSeqIdx === -1) insertSeqIdx = blockSequence.length;
    }

    // Map sequence index → (shelf, position).
    let targetShelfId: number;
    let targetPos: number;
    if (block && blockSequence.length > 0 && insertSeqIdx < blockSequence.length) {
      const anchor = blockSequence[insertSeqIdx];
      targetShelfId = anchor.shelf_id;
      targetPos = anchor.position;
    } else if (block && blockSequence.length > 0) {
      const anchor = blockSequence[blockSequence.length - 1];
      targetShelfId = anchor.shelf_id;
      targetPos = anchor.position + 1;
    } else {
      // Block has no placed items (or no blocks configured): append to the last
      // shelf in scope that has items, else the first shelf in scope.
      const occupied = scopeIds.filter((sid) => (contents.get(sid) || []).length > 0);
      targetShelfId = occupied.length > 0 ? occupied[occupied.length - 1] : scopeIds[0];
      targetPos = (contents.get(targetShelfId) || []).length;
    }

    // If target shelf is a pinned-only/full shelf with no room AND there are
    // later shelves, that's fine — insert and let the ripple move things.
    const newItem: WorkingItem = {
      id: item.id,
      name: item.name,
      thickness,
      is_pinned: false,
      is_new: true,
      moved: true,
    };
    const targetList = contents.get(targetShelfId)!;
    targetList.splice(Math.min(targetPos, targetList.length), 0, newItem);

    // Ripple overflow forward within scope until a shelf fits.
    let cursorShelfId: number | null = targetShelfId;
    let guard = 0;
    while (cursorShelfId !== null && guard++ < 1000) {
      const shelf = shelfById.get(cursorShelfId)!;
      const list = contents.get(cursorShelfId)!;
      if (usedUnits(cursorShelfId) <= shelf.capacity_units) break;

      // Find rightmost movable (non-pinned) item.
      let moveIdx = -1;
      for (let i = list.length - 1; i >= 0; i--) {
        if (!list[i].is_pinned) {
          moveIdx = i;
          break;
        }
      }
      if (moveIdx === -1) break; // all pinned: shelf stays over capacity

      // Next shelf in scope (optionally skipping fresh-boundary shelves of other blocks).
      const scopePos = scopeIds.indexOf(cursorShelfId);
      let nextShelfId: number | null = null;
      let skippedBoundary: PlanBoundaryConflict | null = null;
      for (let k = scopePos + 1; k < scopeIds.length; k++) {
        const candidate = scopeIds[k];
        // Is candidate a fresh-start shelf of a *different* block?
        const boundaryBlock = enabledBlocks.find(
          (b) => b.id !== (block?.id ?? null) && boundaryShelfOfBlock.get(b.id) === candidate
        );
        if (boundaryBlock) {
          const conflict: PlanBoundaryConflict = {
            from_shelf_id: cursorShelfId,
            from_shelf_name: shelf.display_name,
            to_shelf_id: candidate,
            to_shelf_name: shelfById.get(candidate)!.display_name,
            to_block_name: boundaryBlock.name,
          };
          if (boundary_mode === 'shift') {
            skippedBoundary = conflict;
            continue; // skip this shelf
          }
          if (boundary_mode !== 'share') {
            boundaryConflicts.set(`${cursorShelfId}-${candidate}`, conflict);
          }
        }
        nextShelfId = candidate;
        break;
      }

      const [moving] = list.splice(moveIdx, 1);
      moving.moved = true;
      if (nextShelfId === null) {
        // No next shelf: leave item appended back at the end (over capacity).
        list.push(moving);
        break;
      }

      if (skippedBoundary) {
        boundaryConflicts.set(`${cursorShelfId}-${skippedBoundary.to_shelf_id}`, skippedBoundary);
      }

      const nextList = contents.get(nextShelfId)!;
      nextList.unshift(moving);

      if (moving === newItem) {
        targetShelfId = nextShelfId;
      }
      cursorShelfId = nextShelfId;
    }

    const targetShelf = shelfById.get(targetShelfId)!;
    assignments.push({
      ...baseAssignment,
      status: 'ok',
      block_id: block?.id ?? null,
      block_name: block?.name,
      block_color: block?.color,
      target_shelf_id: targetShelfId,
      target_shelf_name: targetShelf.display_name,
      target_group_name: targetShelf.group_display_name,
    });
  }

  // Resolve final settled location & neighbors for every placed item.
  const finalLocationByItem = new Map<
    number,
    {
      shelf: EngineShelf;
      position: number;
      beforeName: string | null;
      afterName: string | null;
    }
  >();
  for (const shelf of shelves) {
    const list = contents.get(shelf.id) || [];
    list.forEach((w, idx) => {
      finalLocationByItem.set(w.id, {
        shelf,
        position: idx,
        beforeName: idx > 0 ? list[idx - 1].name : null,
        afterName: idx < list.length - 1 ? list[idx + 1].name : null,
      });
    });
  }

  // Update assignments with final settled positions and neighbors.
  for (const assignment of assignments) {
    if (assignment.status !== 'ok') continue;
    const loc = finalLocationByItem.get(assignment.physical_item_id);
    if (!loc) continue;
    assignment.target_shelf_id = loc.shelf.id;
    assignment.target_shelf_name = loc.shelf.display_name;
    assignment.target_group_name = loc.shelf.group_display_name;
    assignment.position = loc.position;
    assignment.before_item_name = loc.beforeName;
    assignment.after_item_name = loc.afterName;
  }

  // Derive net cross-shelf move steps and final insert steps from settled state.
  const moves: PlanStep[] = [];
  initialShelfByItem.forEach((fromShelfId, itemId) => {
    const loc = finalLocationByItem.get(itemId);
    if (!loc || loc.shelf.id === fromShelfId) return;
    const fromShelf = shelfById.get(fromShelfId);
    const meta = itemById.get(itemId);
    if (!fromShelf || !meta) return;
    moves.push({
      kind: 'move',
      physical_item_id: itemId,
      physical_item_name: meta.name,
      from_shelf_id: fromShelfId,
      from_shelf_name: fromShelf.display_name,
      to_shelf_id: loc.shelf.id,
      to_shelf_name: loc.shelf.display_name,
      to_group_name: loc.shelf.group_display_name,
      to_position: loc.position,
      before_item_name: loc.beforeName,
      after_item_name: loc.afterName,
    });
  });

  const inserts: PlanStep[] = assignments
    .filter((a) => a.status === 'ok' && a.target_shelf_id !== undefined && a.position !== undefined)
    .map((a) => ({
      kind: 'insert' as const,
      physical_item_id: a.physical_item_id,
      physical_item_name: a.physical_item_name,
      to_shelf_id: a.target_shelf_id!,
      to_shelf_name: a.target_shelf_name!,
      to_group_name: a.target_group_name!,
      to_position: a.position!,
      before_item_name: a.before_item_name ?? null,
      after_item_name: a.after_item_name ?? null,
    }));

  // Build per-shelf diffs for all shelves; mark touched only when contents actually changed.
  const originalByShelf = new Map<number, { id: number; name: string; thickness: number }[]>();
  placements
    .slice()
    .sort((a, b) => a.position - b.position)
    .forEach((p) => {
      const meta = itemById.get(p.physical_item_id);
      if (!meta) return;
      if (!originalByShelf.has(p.shelf_id)) originalByShelf.set(p.shelf_id, []);
      originalByShelf.get(p.shelf_id)!.push({
        id: p.physical_item_id,
        name: meta.name,
        thickness: meta.thickness_units || 1,
      });
    });

  const shelf_diffs: PlanShelfDiff[] = shelves.map((shelf) => {
    const before = (originalByShelf.get(shelf.id) || []).map((o, idx) => ({
      physical_item_id: o.id,
      name: o.name,
      thickness_units: o.thickness,
      position: idx,
      change: 'unchanged' as const,
    }));
    const after = (contents.get(shelf.id) || []).map((w, idx) => ({
      physical_item_id: w.id,
      name: w.name,
      thickness_units: w.thickness,
      position: idx,
      change: w.is_new
        ? ('new' as const)
        : initialShelfByItem.get(w.id) !== shelf.id
          ? ('shifted' as const)
          : ('unchanged' as const),
    }));
    const before_used_units = before.reduce((sum, b) => sum + b.thickness_units, 0);
    const used_units = after.reduce((sum, a) => sum + a.thickness_units, 0);
    const touched =
      before.length !== after.length ||
      before.some((b, idx) => b.physical_item_id !== after[idx].physical_item_id);
    return {
      shelf_id: shelf.id,
      shelf_display_name: shelf.display_name,
      group_id: shelf.group_id,
      group_display_name: shelf.group_display_name,
      capacity_units: shelf.capacity_units,
      before_used_units,
      used_units,
      touched,
      before,
      after,
    };
  });

  // Order steps: ripple moves deepest-shelf first, then inserts shallowest first & left-to-right.
  moves.sort(
    (a, b) =>
      (shelfIndex.get(b.to_shelf_id) ?? 0) - (shelfIndex.get(a.to_shelf_id) ?? 0) ||
      a.to_position - b.to_position
  );
  inserts.sort(
    (a, b) =>
      (shelfIndex.get(a.to_shelf_id) ?? 0) - (shelfIndex.get(b.to_shelf_id) ?? 0) ||
      a.to_position - b.to_position
  );

  return {
    assignments,
    steps: [...moves, ...inserts],
    shelf_diffs,
    boundary_conflicts: Array.from(boundaryConflicts.values()),
    has_blocks: hasBlocks,
  };
}
