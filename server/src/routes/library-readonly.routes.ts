import { Router, Request, Response } from 'express';
import { db } from '../database';
import { parseCustomImagesFromRow } from '../utils/custom-images.util';

const router = Router();

/**
 * Read-only library routes for public access.
 * Only exposes GET endpoints - no modifications allowed.
 */

// Helper: Build full library response
async function getFullLibrary() {
  const library = await db('physical_library').first();
  if (!library) {
    return null;
  }

  const groups = await db('shelf_groups')
    .where('library_id', library.id)
    .orderBy('sort_order', 'asc');

  const groupIds = groups.map((g: any) => g.id);

  const shelves = groupIds.length > 0
    ? await db('shelves')
        .whereIn('group_id', groupIds)
        .orderBy('sort_order', 'asc')
    : [];

  const shelfIds = shelves.map((s: any) => s.id);

  const placements = shelfIds.length > 0
    ? await db('shelf_placements')
        .join('physical_items', 'shelf_placements.physical_item_id', 'physical_items.id')
        .whereIn('shelf_placements.shelf_id', shelfIds)
        .where(function () {
          this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
        })
        .select(
          'shelf_placements.*',
          'physical_items.name as physical_item_name',
          'physical_items.sort_name as physical_item_sort_name',
          'physical_items.thickness_units as physical_item_thickness_units',
          'physical_items.custom_image_url as physical_item_custom_image_url',
          'physical_items.custom_images as physical_item_custom_images',
          'physical_items.physical_format as physical_item_physical_format',
          'physical_items.spine_color as physical_item_spine_color',
          'physical_items.spine_color_accent as physical_item_spine_color_accent'
        )
        .orderBy('shelf_placements.position', 'asc')
    : [];

  // Fetch cover art
  const placedItemIds = placements.map((p: any) => p.physical_item_id);
  const itemCovers = placedItemIds.length > 0
    ? await db('physical_item_media')
        .join('media', 'physical_item_media.media_id', 'media.id')
        .whereIn('physical_item_media.physical_item_id', placedItemIds)
        .select('physical_item_media.physical_item_id', 'media.cover_art_url')
        .orderBy('physical_item_media.disc_number', 'asc')
    : [];

  const coverMap = new Map<number, string>();
  itemCovers.forEach((ic: any) => {
    if (!coverMap.has(ic.physical_item_id) && ic.cover_art_url) {
      coverMap.set(ic.physical_item_id, ic.cover_art_url);
    }
  });

  const placementsByShelf = new Map<number, any[]>();
  placements.forEach((p: any) => {
    if (!placementsByShelf.has(p.shelf_id)) {
      placementsByShelf.set(p.shelf_id, []);
    }
    placementsByShelf.get(p.shelf_id)!.push({
      id: p.id,
      shelf_id: p.shelf_id,
      physical_item_id: p.physical_item_id,
      position: p.position,
      is_pinned: Boolean(p.is_pinned),
      physical_item: {
        id: p.physical_item_id,
        name: p.physical_item_name,
        sort_name: p.physical_item_sort_name,
        thickness_units: p.physical_item_thickness_units || 1,
        custom_image_url: p.physical_item_custom_image_url,
        custom_images: parseCustomImagesFromRow(
          p.physical_item_custom_images,
          p.physical_item_custom_image_url
        ),
        physical_format: p.physical_item_physical_format
          ? (typeof p.physical_item_physical_format === 'string'
              ? JSON.parse(p.physical_item_physical_format)
              : p.physical_item_physical_format)
          : [],
        cover_art_url: coverMap.get(p.physical_item_id) || null,
        spine_color: p.physical_item_spine_color || null,
        spine_color_accent: p.physical_item_spine_color_accent || null,
      },
    });
  });

  const shelvesByGroup = new Map<number, any[]>();
  shelves.forEach((s: any) => {
    if (!shelvesByGroup.has(s.group_id)) {
      shelvesByGroup.set(s.group_id, []);
    }
    const shelfPlacements = placementsByShelf.get(s.id) || [];
    const used_units = shelfPlacements.reduce(
      (sum: number, p: any) => sum + (p.physical_item?.thickness_units || 1),
      0
    );
    shelvesByGroup.get(s.group_id)!.push({
      ...s,
      placements: shelfPlacements,
      used_units,
    });
  });

  // Photo counts per group for gallery badges
  const photoCounts = groupIds.length > 0
    ? await db('shelf_photos')
        .whereIn('group_id', groupIds)
        .select('group_id')
        .count('id as count')
        .groupBy('group_id')
    : [];
  const photoCountMap = new Map<number, number>();
  photoCounts.forEach((row: any) => {
    photoCountMap.set(row.group_id, Number(row.count));
  });

  return {
    ...library,
    groups: groups.map((g: any) => ({
      ...g,
      photo_count: photoCountMap.get(g.id) || 0,
      shelves: shelvesByGroup.get(g.id) || [],
    })),
  };
}

// GET /api/library
router.get('/', async (_req: Request, res: Response) => {
  try {
    const library = await getFullLibrary();
    if (!library) {
      return res.status(404).json({ error: 'Physical library not found' });
    }
    res.json(library);
  } catch (error) {
    console.error('Error fetching library:', error);
    res.status(500).json({ error: 'Failed to fetch library' });
  }
});

// GET /api/library/groups
router.get('/groups', async (_req: Request, res: Response) => {
  try {
    const library = await db('physical_library').first();
    if (!library) {
      return res.status(404).json({ error: 'Physical library not found' });
    }
    const groups = await db('shelf_groups')
      .where('library_id', library.id)
      .orderBy('sort_order', 'asc');
    res.json(groups);
  } catch (error) {
    console.error('Error fetching shelf groups:', error);
    res.status(500).json({ error: 'Failed to fetch shelf groups' });
  }
});

// GET /api/library/groups/:groupId/shelves
router.get('/groups/:groupId/shelves', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const shelves = await db('shelves')
      .where('group_id', groupId)
      .orderBy('sort_order', 'asc');
    res.json(shelves);
  } catch (error) {
    console.error('Error fetching shelves:', error);
    res.status(500).json({ error: 'Failed to fetch shelves' });
  }
});

// GET /api/library/photos - real-shelf photo gallery (read-only)
router.get('/photos', async (req: Request, res: Response) => {
  try {
    const library = await db('physical_library').first();
    if (!library) {
      return res.status(404).json({ error: 'Physical library not found' });
    }
    let query = db('shelf_photos')
      .leftJoin('shelf_groups', 'shelf_photos.group_id', 'shelf_groups.id')
      .where('shelf_photos.library_id', library.id)
      .select('shelf_photos.*', 'shelf_groups.display_name as group_display_name')
      .orderBy('shelf_photos.sort_order', 'asc')
      .orderBy('shelf_photos.id', 'asc');
    const groupId = req.query.group_id !== undefined ? Number(req.query.group_id) : undefined;
    if (groupId !== undefined && Number.isInteger(groupId)) {
      query = query.where('shelf_photos.group_id', groupId);
    }
    const rows = await query;
    res.json(rows.map((r: any) => ({
      ...r,
      frame: (() => {
        try {
          return r.frame ? JSON.parse(r.frame) : null;
        } catch {
          return null;
        }
      })(),
    })));
  } catch (error) {
    console.error('Error fetching shelf photos:', error);
    res.status(500).json({ error: 'Failed to fetch shelf photos' });
  }
});

export default router;
