import { Router, Request, Response } from 'express';
import { db } from '../database';
import { authMiddleware } from '../middleware/auth.middleware';
import { STANDARD_UNIT_MM } from '../constants';

const router = Router();

// =============================================
// Helper: Build a full library response with nested groups, shelves, placements
// =============================================
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
          'physical_items.physical_format as physical_item_physical_format',
          'physical_items.spine_color as physical_item_spine_color',
          'physical_items.spine_color_accent as physical_item_spine_color_accent'
        )
        .orderBy('shelf_placements.position', 'asc')
    : [];

  // Also fetch cover art for each placed item (first media's cover)
  const placedItemIds = placements.map((p: any) => p.physical_item_id);
  const itemCovers = placedItemIds.length > 0
    ? await db('physical_item_media')
        .join('media', 'physical_item_media.media_id', 'media.id')
        .whereIn('physical_item_media.physical_item_id', placedItemIds)
        .select('physical_item_media.physical_item_id', 'media.cover_art_url')
        .orderBy('physical_item_media.disc_number', 'asc')
    : [];

  // Build cover map (first cover per item)
  const coverMap = new Map<number, string>();
  itemCovers.forEach((ic: any) => {
    if (!coverMap.has(ic.physical_item_id) && ic.cover_art_url) {
      coverMap.set(ic.physical_item_id, ic.cover_art_url);
    }
  });

  // Build placement map by shelf_id
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
      created_at: p.created_at,
      updated_at: p.updated_at,
      physical_item: {
        id: p.physical_item_id,
        name: p.physical_item_name,
        sort_name: p.physical_item_sort_name,
        thickness_units: p.physical_item_thickness_units || 1,
        custom_image_url: p.physical_item_custom_image_url,
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

  // Build shelf map by group_id
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

  return {
    ...library,
    groups: groups.map((g: any) => ({
      ...g,
      shelves: shelvesByGroup.get(g.id) || [],
    })),
  };
}

// =============================================
// GET /api/library - Get the full library tree
// =============================================
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

// =============================================
// PUT /api/library - Update library settings (protected)
// =============================================
router.put('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, display_name } = req.body;
    const library = await db('physical_library').first();
    if (!library) {
      return res.status(404).json({ error: 'Physical library not found' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (display_name !== undefined) updateData.display_name = display_name;

    await db('physical_library').where('id', library.id).update(updateData);

    const updated = await getFullLibrary();
    res.json(updated);
  } catch (error) {
    console.error('Error updating library:', error);
    res.status(500).json({ error: 'Failed to update library' });
  }
});

// =============================================
// Shelf Groups
// =============================================

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

// POST /api/library/groups (protected)
router.post('/groups', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, display_name } = req.body;
    if (!name || !display_name) {
      return res.status(400).json({ error: 'name and display_name are required' });
    }

    const library = await db('physical_library').first();
    if (!library) {
      return res.status(404).json({ error: 'Physical library not found' });
    }

    // Get next sort_order
    const maxOrder = await db('shelf_groups')
      .where('library_id', library.id)
      .max('sort_order as max')
      .first();
    const nextOrder = (maxOrder?.max ?? -1) + 1;

    const [id] = await db('shelf_groups').insert({
      library_id: library.id,
      name,
      display_name,
      sort_order: nextOrder,
    });

    const group = await db('shelf_groups').where('id', id).first();
    res.status(201).json({ ...group, shelves: [] });
  } catch (error) {
    console.error('Error creating shelf group:', error);
    res.status(500).json({ error: 'Failed to create shelf group' });
  }
});

// PUT /api/library/groups/:id (protected)
router.put('/groups/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, display_name, sort_order } = req.body;

    const existing = await db('shelf_groups').where('id', id).first();
    if (!existing) {
      return res.status(404).json({ error: 'Shelf group not found' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (display_name !== undefined) updateData.display_name = display_name;
    if (sort_order !== undefined) updateData.sort_order = sort_order;

    await db('shelf_groups').where('id', id).update(updateData);

    const updated = await db('shelf_groups').where('id', id).first();
    res.json(updated);
  } catch (error) {
    console.error('Error updating shelf group:', error);
    res.status(500).json({ error: 'Failed to update shelf group' });
  }
});

// DELETE /api/library/groups/:id (protected)
router.delete('/groups/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await db('shelf_groups').where('id', id).first();
    if (!existing) {
      return res.status(404).json({ error: 'Shelf group not found' });
    }

    // CASCADE will delete shelves and their placements
    await db('shelf_groups').where('id', id).delete();
    res.json({ message: 'Shelf group deleted successfully' });
  } catch (error) {
    console.error('Error deleting shelf group:', error);
    res.status(500).json({ error: 'Failed to delete shelf group' });
  }
});

// PUT /api/library/groups/reorder (protected)
router.put('/groups/reorder', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { order } = req.body; // Array of { id, sort_order }
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array of { id, sort_order }' });
    }

    await db.transaction(async (trx) => {
      for (const item of order) {
        await trx('shelf_groups').where('id', item.id).update({ sort_order: item.sort_order });
      }
    });

    res.json({ message: 'Groups reordered successfully' });
  } catch (error) {
    console.error('Error reordering groups:', error);
    res.status(500).json({ error: 'Failed to reorder groups' });
  }
});

// =============================================
// Shelves
// =============================================

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

// POST /api/library/groups/:groupId/shelves (protected)
router.post('/groups/:groupId/shelves', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { name, display_name, capacity_units, width_mm, depth_mm } = req.body;

    if (!name || !display_name) {
      return res.status(400).json({ error: 'name and display_name are required' });
    }

    const group = await db('shelf_groups').where('id', groupId).first();
    if (!group) {
      return res.status(404).json({ error: 'Shelf group not found' });
    }

    const capacityUnits = capacity_units || 10;

    // Get next sort_order
    const maxOrder = await db('shelves')
      .where('group_id', groupId)
      .max('sort_order as max')
      .first();
    const nextOrder = (maxOrder?.max ?? -1) + 1;

    const [id] = await db('shelves').insert({
      group_id: parseInt(groupId),
      name,
      display_name,
      capacity_units: capacityUnits,
      width_mm: width_mm ?? capacityUnits * STANDARD_UNIT_MM,
      depth_mm: depth_mm || null,
      sort_order: nextOrder,
    });

    const shelf = await db('shelves').where('id', id).first();
    res.status(201).json({ ...shelf, placements: [], used_units: 0 });
  } catch (error) {
    console.error('Error creating shelf:', error);
    res.status(500).json({ error: 'Failed to create shelf' });
  }
});

// POST /api/library/groups/:groupId/shelves/bulk (protected)
router.post('/groups/:groupId/shelves/bulk', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { count, capacity_units, width_mm, depth_mm } = req.body;

    const shelfCount = parseInt(count);
    if (!Number.isInteger(shelfCount) || shelfCount < 1 || shelfCount > 50) {
      return res.status(400).json({ error: 'count must be an integer between 1 and 50' });
    }

    const group = await db('shelf_groups').where('id', groupId).first();
    if (!group) {
      return res.status(404).json({ error: 'Shelf group not found' });
    }

    const capacityUnits = Math.max(1, parseInt(capacity_units) || 10);
    const computedWidthMm = width_mm ?? capacityUnits * STANDARD_UNIT_MM;

    const existingShelves = await db('shelves')
      .where('group_id', groupId)
      .orderBy('sort_order', 'asc');

    const existingDisplayNames = new Set(
      existingShelves.map((s: any) => String(s.display_name).toLowerCase())
    );
    const maxOrder = existingShelves.reduce(
      (max: number, s: any) => Math.max(max, s.sort_order ?? 0),
      -1
    );

    const createdShelves = await db.transaction(async (trx) => {
      const inserted: any[] = [];
      let nextShelfNumber = existingShelves.length + 1;
      let nextSortOrder = maxOrder + 1;

      for (let i = 0; i < shelfCount; i++) {
        let displayName = `${group.display_name} - Shelf ${nextShelfNumber}`;
        while (existingDisplayNames.has(displayName.toLowerCase())) {
          nextShelfNumber++;
          displayName = `${group.display_name} - Shelf ${nextShelfNumber}`;
        }
        existingDisplayNames.add(displayName.toLowerCase());
        const slugName = displayName.toLowerCase().replace(/\s+/g, '_');

        const [id] = await trx('shelves').insert({
          group_id: parseInt(groupId),
          name: slugName,
          display_name: displayName,
          capacity_units: capacityUnits,
          width_mm: computedWidthMm,
          depth_mm: depth_mm || null,
          sort_order: nextSortOrder,
        });

        const shelf = await trx('shelves').where('id', id).first();
        inserted.push({ ...shelf, placements: [], used_units: 0 });
        nextShelfNumber++;
        nextSortOrder++;
      }

      return inserted;
    });

    res.status(201).json(createdShelves);
  } catch (error) {
    console.error('Error bulk creating shelves:', error);
    res.status(500).json({ error: 'Failed to bulk create shelves' });
  }
});

// PUT /api/library/shelves/:id (protected)
router.put('/shelves/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, display_name, capacity_units, width_mm, depth_mm, sort_order } = req.body;

    const existing = await db('shelves').where('id', id).first();
    if (!existing) {
      return res.status(404).json({ error: 'Shelf not found' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (display_name !== undefined) updateData.display_name = display_name;
    if (capacity_units !== undefined) {
      updateData.capacity_units = capacity_units;
      // Auto-update width_mm unless explicitly provided
      if (width_mm === undefined) {
        updateData.width_mm = capacity_units * STANDARD_UNIT_MM;
      }
    }
    if (width_mm !== undefined) updateData.width_mm = width_mm;
    if (depth_mm !== undefined) updateData.depth_mm = depth_mm;
    if (sort_order !== undefined) updateData.sort_order = sort_order;

    await db('shelves').where('id', id).update(updateData);

    const updated = await db('shelves').where('id', id).first();
    res.json(updated);
  } catch (error) {
    console.error('Error updating shelf:', error);
    res.status(500).json({ error: 'Failed to update shelf' });
  }
});

// DELETE /api/library/shelves/:id (protected)
router.delete('/shelves/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await db('shelves').where('id', id).first();
    if (!existing) {
      return res.status(404).json({ error: 'Shelf not found' });
    }

    // CASCADE will delete placements (items become unassigned)
    await db('shelves').where('id', id).delete();
    res.json({ message: 'Shelf deleted successfully' });
  } catch (error) {
    console.error('Error deleting shelf:', error);
    res.status(500).json({ error: 'Failed to delete shelf' });
  }
});

// PUT /api/library/shelves/reorder (protected)
router.put('/shelves/reorder', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { order } = req.body; // Array of { id, sort_order, group_id? }
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array of { id, sort_order }' });
    }

    await db.transaction(async (trx) => {
      for (const item of order) {
        const updateData: any = { sort_order: item.sort_order };
        if (item.group_id !== undefined) {
          updateData.group_id = item.group_id;
        }
        await trx('shelves').where('id', item.id).update(updateData);
      }
    });

    res.json({ message: 'Shelves reordered successfully' });
  } catch (error) {
    console.error('Error reordering shelves:', error);
    res.status(500).json({ error: 'Failed to reorder shelves' });
  }
});

// =============================================
// Shelf Placements
// =============================================

// GET /api/library/unassigned - Get items not on any shelf (protected)
router.get('/unassigned', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { search } = req.query;

    let query = db('physical_items')
      .leftJoin('shelf_placements', 'physical_items.id', 'shelf_placements.physical_item_id')
      .whereNull('shelf_placements.id')
      .where(function () {
        this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
      })
      .select('physical_items.*');

    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      query = query.where(function () {
        this.where('physical_items.name', 'like', searchTerm)
          .orWhereRaw(`EXISTS (
            SELECT 1 FROM physical_item_media
            JOIN media ON physical_item_media.media_id = media.id
            WHERE physical_item_media.physical_item_id = physical_items.id
            AND media.title LIKE ?
          )`, [searchTerm]);
      });
    }

    query = query.orderBy('physical_items.name', 'asc');

    const items = await query;

    // Fetch cover art for each unassigned item
    const itemIds = items.map((i: any) => i.id);
    const itemCovers = itemIds.length > 0
      ? await db('physical_item_media')
          .join('media', 'physical_item_media.media_id', 'media.id')
          .whereIn('physical_item_media.physical_item_id', itemIds)
          .select('physical_item_media.physical_item_id', 'media.cover_art_url', 'media.title')
          .orderBy('physical_item_media.disc_number', 'asc')
      : [];

    const coverMap = new Map<number, string>();
    itemCovers.forEach((ic: any) => {
      if (!coverMap.has(ic.physical_item_id) && ic.cover_art_url) {
        coverMap.set(ic.physical_item_id, ic.cover_art_url);
      }
    });

    const result = items.map((item: any) => ({
      ...item,
      physical_format: item.physical_format
        ? (typeof item.physical_format === 'string' ? JSON.parse(item.physical_format) : item.physical_format)
        : [],
      thickness_units: item.thickness_units || 1,
      cover_art_url: coverMap.get(item.id) || null,
      spine_color: item.spine_color || null,
      spine_color_accent: item.spine_color_accent || null,
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching unassigned items:', error);
    res.status(500).json({ error: 'Failed to fetch unassigned items' });
  }
});

// POST /api/library/shelves/:shelfId/items (protected) - Place item on shelf
router.post('/shelves/:shelfId/items', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { shelfId } = req.params;
    const { physical_item_id, position } = req.body;

    if (!physical_item_id) {
      return res.status(400).json({ error: 'physical_item_id is required' });
    }

    const shelf = await db('shelves').where('id', shelfId).first();
    if (!shelf) {
      return res.status(404).json({ error: 'Shelf not found' });
    }

    const item = await db('physical_items').where('id', physical_item_id).first();
    if (!item) {
      return res.status(404).json({ error: 'Physical item not found' });
    }
    if (item.archived) {
      return res.status(400).json({ error: 'Cannot place an archived item on a shelf' });
    }

    // Check if item is already placed somewhere
    const existingPlacement = await db('shelf_placements')
      .where('physical_item_id', physical_item_id)
      .first();

    if (existingPlacement) {
      // Move it: delete old placement
      await db('shelf_placements').where('id', existingPlacement.id).delete();
    }

    // Determine position
    let pos = position;
    if (pos === undefined || pos === null) {
      const maxPos = await db('shelf_placements')
        .where('shelf_id', shelfId)
        .max('position as max')
        .first();
      pos = (maxPos?.max ?? -1) + 1;
    }

    const [id] = await db('shelf_placements').insert({
      shelf_id: parseInt(shelfId),
      physical_item_id,
      position: pos,
    });

    const placement = await db('shelf_placements').where('id', id).first();
    res.status(201).json(placement);
  } catch (error) {
    console.error('Error placing item on shelf:', error);
    res.status(500).json({ error: 'Failed to place item on shelf' });
  }
});

// PUT /api/library/shelves/:shelfId/items/reorder (protected)
router.put('/shelves/:shelfId/items/reorder', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { shelfId } = req.params;
    const { order } = req.body; // Array of { physical_item_id, position }

    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array of { physical_item_id, position }' });
    }

    await db.transaction(async (trx) => {
      for (const item of order) {
        await trx('shelf_placements')
          .where({ shelf_id: shelfId, physical_item_id: item.physical_item_id })
          .update({ position: item.position });
      }
    });

    res.json({ message: 'Items reordered successfully' });
  } catch (error) {
    console.error('Error reordering shelf items:', error);
    res.status(500).json({ error: 'Failed to reorder shelf items' });
  }
});

// DELETE /api/library/placements/:id (protected) - Unassign item from shelf
router.delete('/placements/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await db('shelf_placements').where('id', id).first();
    if (!existing) {
      return res.status(404).json({ error: 'Placement not found' });
    }

    await db('shelf_placements').where('id', id).delete();
    res.json({ message: 'Item removed from shelf successfully' });
  } catch (error) {
    console.error('Error removing placement:', error);
    res.status(500).json({ error: 'Failed to remove placement' });
  }
});

// =============================================
// Apply Sort - Generate suggested arrangement
// =============================================
router.post('/apply-sort', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sort_by = 'title', sort_order = 'asc' } = req.body;

    // Get all physical items in the requested sort order
    let query = db('physical_items')
      .where(function () {
        this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
      })
      .select('physical_items.*');

    const sortDirection = sort_order === 'asc' ? 'asc' : 'desc';

    if (sort_by === 'title') {
      query = query.orderByRaw('COALESCE(physical_items.sort_name, physical_items.name) ' + sortDirection);
    } else if (sort_by === 'release_date') {
      query = query.orderByRaw(`(
        SELECT MIN(media.release_date)
        FROM physical_item_media
        JOIN media ON physical_item_media.media_id = media.id
        WHERE physical_item_media.physical_item_id = physical_items.id
      ) ${sortDirection.toUpperCase()} NULLS LAST`);
    } else {
      query = query.orderBy('physical_items.created_at', sortDirection);
    }

    const items = await query;

    // Get all shelves in order (by group sort_order, then shelf sort_order)
    const shelves = await db('shelves')
      .join('shelf_groups', 'shelves.group_id', 'shelf_groups.id')
      .select('shelves.*', 'shelf_groups.display_name as group_display_name')
      .orderBy('shelf_groups.sort_order', 'asc')
      .orderBy('shelves.sort_order', 'asc');

    // Distribute items across shelves
    const preview: any[] = [];
    const unplaceable: any[] = [];
    let currentShelfIdx = 0;
    let currentShelfUsed = 0;

    // Initialize shelf previews
    for (const shelf of shelves) {
      preview.push({
        shelf_id: shelf.id,
        shelf_display_name: shelf.display_name,
        group_display_name: shelf.group_display_name,
        items: [],
        used_units: 0,
        capacity_units: shelf.capacity_units,
        overflow: false,
      });
    }

    for (const item of items) {
      const thickness = item.thickness_units || 1;
      let placed = false;

      // Try to place in current shelf, then subsequent shelves
      for (let i = currentShelfIdx; i < shelves.length; i++) {
        const shelf = shelves[i];
        const shelfPreview = preview[i];

        if (shelfPreview.used_units + thickness <= shelf.capacity_units) {
          shelfPreview.items.push({
            physical_item_id: item.id,
            physical_item_name: item.name,
            position: shelfPreview.items.length,
            thickness_units: thickness,
          });
          shelfPreview.used_units += thickness;
          currentShelfIdx = i;
          currentShelfUsed = shelfPreview.used_units;
          placed = true;
          break;
        }
      }

      if (!placed) {
        unplaceable.push({
          physical_item_id: item.id,
          physical_item_name: item.name,
          thickness_units: thickness,
        });
      }
    }

    // Mark overflow shelves
    preview.forEach((shelfPreview: any) => {
      shelfPreview.overflow = shelfPreview.used_units > shelfPreview.capacity_units;
    });

    res.json({ placements: preview, unplaceable });
  } catch (error) {
    console.error('Error generating sort preview:', error);
    res.status(500).json({ error: 'Failed to generate sort preview' });
  }
});

// POST /api/library/apply-sort/confirm (protected) - Actually apply the sort
router.post('/apply-sort/confirm', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { placements } = req.body;
    // placements: Array of { shelf_id, items: Array of { physical_item_id, position } }

    if (!Array.isArray(placements)) {
      return res.status(400).json({ error: 'placements must be an array' });
    }

    await db.transaction(async (trx) => {
      // Clear all existing placements
      await trx('shelf_placements').delete();

      // Insert new placements
      for (const shelf of placements) {
        for (const item of shelf.items) {
          await trx('shelf_placements').insert({
            shelf_id: shelf.shelf_id,
            physical_item_id: item.physical_item_id,
            position: item.position,
          });
        }
      }
    });

    const library = await getFullLibrary();
    res.json(library);
  } catch (error) {
    console.error('Error applying sort:', error);
    res.status(500).json({ error: 'Failed to apply sort' });
  }
});

export default router;
