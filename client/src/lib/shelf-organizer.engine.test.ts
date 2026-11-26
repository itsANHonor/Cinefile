import { describe, it, expect } from 'vitest';
import { STANDARD_UNIT_MM } from '../types';
import {
  EngineBlock,
  EngineItem,
  EnginePlacement,
  EngineShelf,
  compareItems,
  layoutOrganization,
  matchBlock,
  planIncrementalShelving,
  winningBlockFor,
} from '../../../server/src/services/shelf-organizer.engine';

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

const makeItem = (id: number, name: string, extra: Partial<EngineItem> = {}): EngineItem => ({
  id,
  name,
  sort_name: null,
  thickness_units: 1,
  formats: ['Blu-ray'],
  edition_tags: [],
  has_series: false,
  series_ids: [],
  primary_series_id: null,
  series_sort_name: null,
  series_internal_sort: null,
  series_custom_order: null,
  genre_names: [],
  director_names: [],
  earliest_release_date: null,
  decade: null,
  media_types: ['movie'],
  tv_show_name: null,
  min_season_number: null,
  created_at: null,
  ...extra,
});

const makeBlock = (id: number | string, extra: Partial<EngineBlock> = {}): EngineBlock => ({
  id,
  name: `Block ${id}`,
  color: '#3b82f6',
  enabled: true,
  target_scope: 'library',
  target_group_id: null,
  start_on_fresh_shelf: true,
  headroom_units_override: null,
  filter_rules: { match_all: true },
  sort_by: 'title',
  sort_direction: 'asc',
  ...extra,
});

const makeShelf = (id: number, capacity = 4, groupId = 1): EngineShelf => ({
  id,
  group_id: groupId,
  display_name: `Shelf ${id}`,
  group_display_name: 'Living Room',
  capacity_units: capacity,
});

const namesOf = (items: { name: string }[]) => items.map((i) => i.name);

// ─────────────────────────────────────────────────────────────────────────────
// 15mm standard
// ─────────────────────────────────────────────────────────────────────────────

describe('15mm standard case width', () => {
  it('uses 15mm as the standard Blu-ray case width', () => {
    expect(STANDARD_UNIT_MM).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block matching
// ─────────────────────────────────────────────────────────────────────────────

describe('matchBlock / winningBlockFor', () => {
  it('match_all matches everything', () => {
    expect(matchBlock(makeItem(1, 'Alien'), { match_all: true })).toBe(true);
  });

  it('a filtered block with no criteria matches nothing', () => {
    expect(matchBlock(makeItem(1, 'Alien'), {})).toBe(false);
  });

  it('media_type filters movies vs tv seasons', () => {
    const movie = makeItem(1, 'Alien');
    const season = makeItem(2, 'Andor S1', { media_types: ['tv_season'] });
    expect(matchBlock(movie, { media_type: 'movie' })).toBe(true);
    expect(matchBlock(season, { media_type: 'movie' })).toBe(false);
    expect(matchBlock(season, { media_type: 'tv_season' })).toBe(true);
  });

  it('formats match case-insensitively', () => {
    const item = makeItem(1, 'Dune', { formats: ['4K UHD'] });
    expect(matchBlock(item, { formats: ['4k uhd'] })).toBe(true);
    expect(matchBlock(item, { formats: ['DVD'] })).toBe(false);
  });

  it('first enabled block wins and disabled blocks are skipped', () => {
    const blocks = [
      makeBlock(1, { filter_rules: { media_type: 'movie' }, enabled: false }),
      makeBlock(2, { filter_rules: { media_type: 'movie' } }),
      makeBlock(3, { filter_rules: { match_all: true } }),
    ];
    expect(winningBlockFor(makeItem(1, 'Alien'), blocks)?.id).toBe(2);
  });

  it('returns null when nothing matches', () => {
    const blocks = [makeBlock(1, { filter_rules: { formats: ['LaserDisc'] } })];
    expect(winningBlockFor(makeItem(1, 'Alien'), blocks)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Comparators
// ─────────────────────────────────────────────────────────────────────────────

describe('compareItems', () => {
  it('sorts titles ascending and descending', () => {
    const a = makeItem(1, 'Alien');
    const b = makeItem(2, 'Dune');
    const asc = compareItems(makeBlock(1, { sort_by: 'title' }));
    expect(asc(a, b)).toBeLessThan(0);
    const desc = compareItems(makeBlock(1, { sort_by: 'title', sort_direction: 'desc' }));
    expect(desc(a, b)).toBeGreaterThan(0);
  });

  it('series_sort groups by series name and orders chronologically inside a series', () => {
    const s1e2 = makeItem(1, 'The Dark Knight', {
      has_series: true,
      series_ids: [10],
      primary_series_id: 10,
      series_sort_name: 'The Dark Knight Trilogy',
      series_internal_sort: 'chronological',
      earliest_release_date: '2008-07-18',
    });
    const s1e1 = makeItem(2, 'Batman Begins', {
      has_series: true,
      series_ids: [10],
      primary_series_id: 10,
      series_sort_name: 'The Dark Knight Trilogy',
      series_internal_sort: 'chronological',
      earliest_release_date: '2005-06-15',
    });
    const other = makeItem(3, 'Alien', {
      has_series: true,
      series_ids: [20],
      primary_series_id: 20,
      series_sort_name: 'Alien',
    });
    const cmp = compareItems(makeBlock(1, { sort_by: 'series_sort' }));
    // Alien series before Dark Knight Trilogy
    expect(cmp(other, s1e1)).toBeLessThan(0);
    // Within the same series, Batman Begins (2005) before The Dark Knight (2008)
    expect(cmp(s1e1, s1e2)).toBeLessThan(0);
    expect(cmp(s1e2, s1e1)).toBeGreaterThan(0);
  });

  it('tv_show_season sorts by show name then season number', () => {
    const andorS2 = makeItem(1, 'Andor S2', { tv_show_name: 'Andor', min_season_number: 2 });
    const andorS1 = makeItem(2, 'Andor S1', { tv_show_name: 'Andor', min_season_number: 1 });
    const b5S1 = makeItem(3, 'Babylon 5 S1', { tv_show_name: 'Babylon 5', min_season_number: 1 });
    const cmp = compareItems(makeBlock(1, { sort_by: 'tv_show_season' }));
    expect(cmp(andorS1, andorS2)).toBeLessThan(0);
    expect(cmp(andorS2, b5S1)).toBeLessThan(0); // Andor < Babylon 5
    expect(cmp(andorS1, b5S1)).toBeLessThan(0);
  });

  it('director_last_name sorts by last name', () => {
    const nolan = makeItem(1, 'Inception', { director_names: ['Christopher Nolan'] });
    const scott = makeItem(2, 'Alien', { director_names: ['Ridley Scott'] });
    const cmp = compareItems(makeBlock(1, { sort_by: 'director_last_name' }));
    expect(cmp(nolan, scott)).toBeLessThan(0);
  });

  it('physical_format uses the canonical format order', () => {
    const uhd = makeItem(1, '4K disc', { formats: ['4K UHD'] });
    const dvd = makeItem(2, 'DVD disc', { formats: ['DVD'] });
    const cmp = compareItems(makeBlock(1, { sort_by: 'physical_format' }));
    expect(cmp(uhd, dvd)).toBeLessThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full layout (headroom, boundaries, first-match-wins, pinned)
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutOrganization', () => {
  it('honors headroom: shelves fill to capacity - headroom', () => {
    const shelves = [makeShelf(1, 4), makeShelf(2, 4), makeShelf(3, 4)];
    const items = [1, 2, 3, 4, 5].map((i) => makeItem(i, `Item ${i}`));
    const result = layoutOrganization({
      shelves,
      items,
      pinnedPlacements: [],
      blocks: [makeBlock(1)],
      default_headroom: 2,
    });
    expect(result.shelves[0].effective_capacity_units).toBe(2);
    expect(namesOf(result.shelves[0].items)).toEqual(['Item 1', 'Item 2']);
    expect(namesOf(result.shelves[1].items)).toEqual(['Item 3', 'Item 4']);
    expect(namesOf(result.shelves[2].items)).toEqual(['Item 5']);
  });

  it('never fills below 1 effective capacity even with huge headroom', () => {
    const shelves = [makeShelf(1, 4), makeShelf(2, 4)];
    const items = [makeItem(1, 'A'), makeItem(2, 'B')];
    const result = layoutOrganization({
      shelves,
      items,
      pinnedPlacements: [],
      blocks: [makeBlock(1)],
      default_headroom: 5,
    });
    expect(result.shelves[0].effective_capacity_units).toBe(1);
    expect(namesOf(result.shelves[0].items)).toEqual(['A']);
  });

  it('start_on_fresh_shelf blocks begin on the next shelf', () => {
    const shelves = [makeShelf(1, 10), makeShelf(2, 10)];
    const movies = [
      makeItem(1, 'Alien', { media_types: ['movie'] }),
      makeItem(2, 'Dune', { media_types: ['movie'] }),
    ];
    const tv = [makeItem(3, 'Andor S1', { media_types: ['tv_season'] })];
    const result = layoutOrganization({
      shelves,
      items: [...movies, ...tv],
      pinnedPlacements: [],
      blocks: [
        makeBlock(1, { filter_rules: { media_type: 'movie' }, sort_by: 'title' }),
        makeBlock(2, { filter_rules: { match_all: true }, sort_by: 'title', start_on_fresh_shelf: true }),
      ],
      default_headroom: 0,
    });
    expect(namesOf(result.shelves[0].items)).toEqual(['Alien', 'Dune']);
    expect(namesOf(result.shelves[1].items)).toEqual(['Andor S1']);
  });

  it('shares a shelf when start_on_fresh_shelf is off', () => {
    const shelves = [makeShelf(1, 10), makeShelf(2, 10)];
    const items = [
      makeItem(1, 'Alien', { media_types: ['movie'] }),
      makeItem(2, 'Andor S1', { media_types: ['tv_season'] }),
    ];
    const result = layoutOrganization({
      shelves,
      items,
      pinnedPlacements: [],
      blocks: [
        makeBlock(1, { filter_rules: { media_type: 'movie' } }),
        makeBlock(2, { filter_rules: { match_all: true }, start_on_fresh_shelf: false }),
      ],
      default_headroom: 0,
    });
    expect(namesOf(result.shelves[0].items)).toEqual(['Alien', 'Andor S1']);
  });

  it('does not duplicate items across blocks (first match wins)', () => {
    const shelves = [makeShelf(1, 10), makeShelf(2, 10)];
    const items = [makeItem(1, 'Alien', { formats: ['4K UHD'] }), makeItem(2, 'Dune')];
    const result = layoutOrganization({
      shelves,
      items,
      pinnedPlacements: [],
      blocks: [
        makeBlock(1, { filter_rules: { formats: ['4K UHD'] } }),
        makeBlock(2, { filter_rules: { match_all: true } }),
      ],
      default_headroom: 0,
    });
    const placedIds = result.shelves.flatMap((s) => s.items.map((i) => i.physical_item_id));
    expect(placedIds.sort()).toEqual([1, 2]);
    // Alien lives in block 1
    const alien = result.shelves.flatMap((s) => s.items).find((i) => i.physical_item_id === 1)!;
    expect(alien.block_id).toBe(1);
  });

  it('reports unmatched items', () => {
    const result = layoutOrganization({
      shelves: [makeShelf(1, 10)],
      items: [makeItem(1, 'Alien')],
      pinnedPlacements: [],
      blocks: [makeBlock(1, { filter_rules: { formats: ['LaserDisc'] } })],
      default_headroom: 0,
    });
    expect(result.unmatched_items.map((i) => i.name)).toEqual(['Alien']);
  });

  it('keeps pinned items on their current shelf', () => {
    const shelves = [makeShelf(1, 4), makeShelf(2, 4)];
    const items = [
      makeItem(1, 'Pinned One'),
      makeItem(2, 'A'),
      makeItem(3, 'B'),
      makeItem(4, 'C'),
    ];
    const pinned: EnginePlacement[] = [
      { physical_item_id: 1, shelf_id: 2, position: 0, is_pinned: true },
    ];
    const result = layoutOrganization({
      shelves,
      items,
      pinnedPlacements: pinned,
      blocks: [makeBlock(1)],
      default_headroom: 0,
    });
    const pinnedItem = result.shelves
      .flatMap((s) => s.items.map((i) => ({ ...i, shelf_id: s.shelf_id })))
      .find((i) => i.physical_item_id === 1);
    expect(pinnedItem?.shelf_id).toBe(2);
    expect(pinnedItem?.is_pinned).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Minimal-ripple incremental shelving
// ─────────────────────────────────────────────────────────────────────────────

describe('planIncrementalShelving', () => {
  const shelves = [makeShelf(1, 2), makeShelf(2, 2), makeShelf(3, 2)];

  it('inserts in place without moves when the target shelf has room', () => {
    const roomShelves = [makeShelf(1, 3), makeShelf(2, 3)];
    const items = [
      makeItem(1, 'Alien'),
      makeItem(2, 'Dune'),
      makeItem(3, 'Batman Begins'),
    ];
    const placements: EnginePlacement[] = [
      { physical_item_id: 1, shelf_id: 1, position: 0, is_pinned: false },
      { physical_item_id: 2, shelf_id: 1, position: 1, is_pinned: false },
    ];
    const result = planIncrementalShelving({
      shelves: roomShelves,
      placements,
      items,
      queued_item_ids: [3],
      blocks: [makeBlock(1)],
    });
    expect(result.steps.filter((s) => s.kind === 'move')).toHaveLength(0);
    const inserts = result.steps.filter((s) => s.kind === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].to_shelf_id).toBe(1);
    expect(inserts[0].to_position).toBe(1);
    expect(result.shelf_diffs.filter((d) => d.touched)).toHaveLength(1);
    const diff = result.shelf_diffs.find((d) => d.shelf_id === 1)!;
    expect(namesOf(diff.after)).toEqual(['Alien', 'Batman Begins', 'Dune']);
    expect(diff.after[1].change).toBe('new');
  });

  it('ripples only the rightmost item when the shelf is full', () => {
    // S1 full: [Alien, Batman Begins]; S2 has room.
    const items = [
      makeItem(1, 'Alien'),
      makeItem(2, 'Batman Begins'),
      makeItem(3, 'Dune'),
      makeItem(4, 'Alien: Romulus'),
    ];
    const placements: EnginePlacement[] = [
      { physical_item_id: 1, shelf_id: 1, position: 0, is_pinned: false },
      { physical_item_id: 2, shelf_id: 1, position: 1, is_pinned: false },
      { physical_item_id: 3, shelf_id: 2, position: 0, is_pinned: false },
    ];
    const result = planIncrementalShelving({
      shelves,
      placements,
      items,
      queued_item_ids: [4],
      blocks: [makeBlock(1)],
    });
    const moves = result.steps.filter((s) => s.kind === 'move');
    expect(moves).toHaveLength(1);
    expect(moves[0].physical_item_name).toBe('Batman Begins');
    expect(moves[0].from_shelf_id).toBe(1);
    expect(moves[0].to_shelf_id).toBe(2);
    expect(moves[0].to_position).toBe(0);
    // S3 untouched
    expect(result.shelf_diffs.find((d) => d.shelf_id === 3)?.touched).toBe(false);
    // S1 ends with Alien + new item
    const diff1 = result.shelf_diffs.find((d) => d.shelf_id === 1)!;
    expect(namesOf(diff1.after)).toEqual(['Alien', 'Alien: Romulus']);
    expect(diff1.after[1].change).toBe('new');
    const diff2 = result.shelf_diffs.find((d) => d.shelf_id === 2)!;
    expect(diff2.after[0].change).toBe('shifted');
  });

  it('respects pins: pinned items are never moved by the ripple', () => {
    // S1: [Alien, Batman(pinned)] full; S2: [Dune, Dune: Part Two] full.
    // "Alien: Romulus" sorts between Alien and Batman but can't stay on S1 —
    // it flows directly to S2 and pushes Dune: Part Two to S3.
    const items = [
      makeItem(1, 'Alien'),
      makeItem(2, 'Batman Begins'), // pinned
      makeItem(3, 'Alien: Romulus'),
      makeItem(4, 'Dune'),
      makeItem(5, 'Dune: Part Two'),
    ];
    const placements: EnginePlacement[] = [
      { physical_item_id: 1, shelf_id: 1, position: 0, is_pinned: false },
      { physical_item_id: 2, shelf_id: 1, position: 1, is_pinned: true },
      { physical_item_id: 4, shelf_id: 2, position: 0, is_pinned: false },
      { physical_item_id: 5, shelf_id: 2, position: 1, is_pinned: false },
    ];
    const result = planIncrementalShelving({
      shelves,
      placements,
      items,
      queued_item_ids: [3],
      blocks: [makeBlock(1)],
    });
    const moves = result.steps.filter((s) => s.kind === 'move');
    expect(moves.map((m) => m.physical_item_name)).toEqual(['Dune: Part Two']);
    // The queued item lands directly on S2 — no wasteful insert+move pair.
    const insert = result.steps.find((s) => s.kind === 'insert')!;
    expect(insert.to_shelf_id).toBe(2);
    expect(insert.to_position).toBe(0);
    const assignment = result.assignments[0];
    expect(assignment.target_shelf_id).toBe(2);
    expect(assignment.position).toBe(0);
    // Batman stays pinned on S1, untouched.
    const diff1 = result.shelf_diffs.find((d) => d.shelf_id === 1)!;
    expect(namesOf(diff1.after)).toEqual(['Alien', 'Batman Begins']);
    const diff3 = result.shelf_diffs.find((d) => d.shelf_id === 3)!;
    expect(namesOf(diff3.after)).toEqual(['Dune: Part Two']);
  });

  it('marks items unmatched when no block matches', () => {
    const items = [makeItem(1, 'LaserDisc Thing', { formats: ['LaserDisc'] })];
    const result = planIncrementalShelving({
      shelves,
      placements: [],
      items,
      queued_item_ids: [1],
      blocks: [makeBlock(1, { filter_rules: { formats: ['Blu-ray'] } })],
    });
    expect(result.assignments[0].status).toBe('unmatched');
    expect(result.steps).toHaveLength(0);
  });

  it('reports a boundary conflict when overflow reaches a fresh-start shelf of another block', () => {
    // Block 1: movies on S1 (full). Block 2: TV starts fresh on S2.
    const movieBlock = makeBlock(1, { filter_rules: { media_type: 'movie' } });
    const tvBlock = makeBlock(2, { filter_rules: { match_all: true }, start_on_fresh_shelf: true });
    const items = [
      makeItem(1, 'Alien', { media_types: ['movie'] }),
      makeItem(2, 'Batman Begins', { media_types: ['movie'] }),
      makeItem(3, 'Andor S1', { media_types: ['tv_season'] }),
      makeItem(4, 'Alien: Romulus', { media_types: ['movie'] }),
    ];
    const placements: EnginePlacement[] = [
      { physical_item_id: 1, shelf_id: 1, position: 0, is_pinned: false },
      { physical_item_id: 2, shelf_id: 1, position: 1, is_pinned: false },
      { physical_item_id: 3, shelf_id: 2, position: 0, is_pinned: false },
    ];

    // Default: records the conflict and spills onto the boundary shelf.
    const conflicted = planIncrementalShelving({
      shelves,
      placements,
      items,
      queued_item_ids: [4],
      blocks: [movieBlock, tvBlock],
    });
    expect(conflicted.boundary_conflicts).toHaveLength(1);
    expect(conflicted.boundary_conflicts[0].to_shelf_id).toBe(2);
    expect(conflicted.boundary_conflicts[0].to_block_name).toBe('Block 2');
    const move = conflicted.steps.find((s) => s.kind === 'move');
    expect(move?.to_shelf_id).toBe(2);

    // Shift mode: skips the boundary shelf entirely.
    const shifted = planIncrementalShelving({
      shelves,
      placements,
      items,
      queued_item_ids: [4],
      blocks: [movieBlock, tvBlock],
      boundary_mode: 'shift',
    });
    const shiftedMove = shifted.steps.find((s) => s.kind === 'move');
    expect(shiftedMove?.to_shelf_id).toBe(3);
  });

  it('does not mark a full shelf as touched when new items flow directly past it, and computes settled batch positions', () => {
    const items = [
      makeItem(1, 'Alien'),
      makeItem(2, 'Batman Begins'),
      makeItem(3, 'Zombieland'),
      makeItem(4, 'WALL-E'),
    ];
    const placements: EnginePlacement[] = [
      { physical_item_id: 1, shelf_id: 1, position: 0, is_pinned: false },
      { physical_item_id: 2, shelf_id: 1, position: 1, is_pinned: false },
    ];
    // Queue Zombieland first, then WALL-E — both append after Batman on S1,
    // immediately flow onto S2 without altering S1, and settle as [WALL-E, Zombieland].
    const result = planIncrementalShelving({
      shelves,
      placements,
      items,
      queued_item_ids: [3, 4],
      blocks: [makeBlock(1)],
    });

    const diff1 = result.shelf_diffs.find((d) => d.shelf_id === 1)!;
    const diff2 = result.shelf_diffs.find((d) => d.shelf_id === 2)!;
    expect(diff1.touched).toBe(false);
    expect(diff1.capacity_units).toBe(2);
    expect(diff1.used_units).toBe(2);
    expect(diff2.touched).toBe(true);
    expect(namesOf(diff2.after)).toEqual(['WALL-E', 'Zombieland']);

    const walleInsert = result.steps.find((s) => s.physical_item_id === 4)!;
    const zombieInsert = result.steps.find((s) => s.physical_item_id === 3)!;
    expect(walleInsert.to_position).toBe(0);
    expect(walleInsert.after_item_name).toBe('Zombieland');
    expect(zombieInsert.to_position).toBe(1);
    expect(zombieInsert.before_item_name).toBe('WALL-E');
  });
});
