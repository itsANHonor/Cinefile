import { db } from '../database';
import { parseEditionTags } from '../utils/edition-tags.util';
import { parseCustomImagesFromRow } from '../utils/custom-images.util';
import { normalizeCost } from '../utils/identifiers.util';

export type CollectionEventType =
  | 'item_added'
  | 'item_archived'
  | 'shelf_group_added'
  | 'shelf_added'
  | 'shelf_resized'
  | 'shelf_photo_added'
  | 'shelf_reorganized';

export type CollectionEventCategory = 'items' | 'shelves' | 'archived';

export interface HistoryItemDetail {
  eventId: number;
  physicalItemId: number | null;
  name: string;
  coverArtUrl: string | null;
  formats: string[];
  editionTags: string[];
  mediaTitles: Array<{
    id: number;
    title: string;
    year: number | null;
    mediaType: 'movie' | 'tv_season';
  }>;
  purchaseDate: string | null;
  occurredAt: string;
  cost?: number | null;
  storeName?: string | null;
  archived: boolean;
  archiveReason?: string | null;
  isUpgrade?: boolean;
  previousFormats?: string[];
}

export interface HistoryShelfDetail {
  eventId: number;
  shelfId: number | null;
  shelfGroupId: number | null;
  groupName: string;
  shelfName?: string;
  capacityUnits?: number;
  previousCapacityUnits?: number;
  widthMm?: number | null;
}

export interface HistoryEntry {
  entryKey: string;
  eventIds: number[];
  batchKey: string | null;
  eventType: CollectionEventType;
  category: CollectionEventCategory;
  effectiveDate: string;
  occurredAt: string;
  title: string;
  items?: HistoryItemDetail[];
  shelves?: HistoryShelfDetail[];
  photo?: {
    photoId: number | null;
    imageUrl: string;
    caption: string | null;
    groupName: string | null;
    shelfName: string | null;
  };
  reorganization?: {
    mode: 'organization' | 'auto_sort' | 'shelving_queue';
    movedCount: number;
    shelfCount?: number;
  };
}

export interface HistoryQueryOptions {
  isAdmin: boolean;
  canSeeCost: boolean;
  category?: string;
  dateBasis?: 'added' | 'purchased';
  search?: string;
  limit?: number;
  offset?: number;
}

export interface HistoryFeedResponse {
  entries: HistoryEntry[];
  totalEntries: number;
  hasMore: boolean;
  counts: {
    all: number;
    items: number;
    shelves: number;
    archived: number;
  };
  itemsWithPurchaseDate: number;
}

function parseJsonObject(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

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

function extractPrimaryStoreName(storeLinksRaw: unknown): string | null {
  const links = parseJsonArray<{ label?: string; url?: string }>(storeLinksRaw);
  for (const link of links) {
    if (link?.label && typeof link.label === 'string' && link.label.trim()) {
      return link.label.trim();
    }
    if (link?.url && typeof link.url === 'string') {
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
        continue;
      }
    }
  }
  return null;
}

export function generateBatchKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function hasEventsTable(): Promise<boolean> {
  try {
    return await db.schema.hasTable('collection_events');
  } catch {
    return false;
  }
}

async function detectUpgradeMetadata(
  physicalItemId: number
): Promise<{ isUpgrade: boolean; previousFormats: string[] }> {
  try {
    const itemLinks = await db('physical_item_media')
      .where('physical_item_id', physicalItemId)
      .select('media_id');
    const mediaIds = itemLinks.map((r: any) => Number(r.media_id)).filter(Boolean);
    if (mediaIds.length === 0) {
      return { isUpgrade: false, previousFormats: [] };
    }

    const priorLinks = await db('physical_item_media as pim')
      .join('physical_items as pi', 'pim.physical_item_id', 'pi.id')
      .whereIn('pim.media_id', mediaIds)
      .whereNot('pim.physical_item_id', physicalItemId)
      .select('pim.formats as link_formats', 'pi.physical_format as item_formats');

    if (priorLinks.length === 0) {
      return { isUpgrade: false, previousFormats: [] };
    }

    const priorFormats = new Set<string>();
    for (const row of priorLinks) {
      const lf = parseJsonArray<string>(row.link_formats);
      const itf = parseJsonArray<string>(row.item_formats);
      (lf.length > 0 ? lf : itf).forEach((f) => priorFormats.add(f));
    }

    return {
      isUpgrade: true,
      previousFormats: Array.from(priorFormats),
    };
  } catch {
    return { isUpgrade: false, previousFormats: [] };
  }
}

export async function recordItemAddedEvent(params: {
  physicalItemId: number;
  name: string;
  purchaseDate?: string | null;
  batchKey?: string | null;
  occurredAt?: string;
  archived?: boolean;
  archiveReason?: string | null;
}): Promise<void> {
  try {
    if (!(await hasEventsTable())) return;

    const occurredAt = params.occurredAt || new Date().toISOString();
    const { isUpgrade, previousFormats } = await detectUpgradeMetadata(params.physicalItemId);
    const metadata: Record<string, unknown> = {};
    if (isUpgrade) {
      metadata.isUpgrade = true;
      metadata.previousFormats = previousFormats;
    }

    await db('collection_events').insert({
      event_type: 'item_added',
      category: 'items',
      occurred_at: occurredAt,
      purchase_date: params.purchaseDate || null,
      batch_key: params.batchKey || null,
      physical_item_id: params.physicalItemId,
      title: params.name,
      metadata_json: JSON.stringify(metadata),
    });

    if (params.archived) {
      await db('collection_events').insert({
        event_type: 'item_archived',
        category: 'archived',
        occurred_at: occurredAt,
        purchase_date: null,
        batch_key: null,
        physical_item_id: params.physicalItemId,
        title: params.name,
        metadata_json: JSON.stringify({
          archiveReason: params.archiveReason || null,
        }),
      });
    }
  } catch (err) {
    console.warn('Failed to record item_added event:', err);
  }
}

export async function recordBulkItemsAddedEvents(
  items: Array<{
    physicalItemId: number;
    name: string;
    purchaseDate?: string | null;
    archived?: boolean;
    archiveReason?: string | null;
  }>
): Promise<void> {
  if (items.length === 0) return;
  const batchKey = items.length > 1 ? generateBatchKey('items') : null;
  const occurredAt = new Date().toISOString();

  for (const item of items) {
    await recordItemAddedEvent({
      physicalItemId: item.physicalItemId,
      name: item.name,
      purchaseDate: item.purchaseDate,
      batchKey,
      occurredAt,
      archived: item.archived,
      archiveReason: item.archiveReason,
    });
  }
}

export async function syncItemUpdatedEventFields(params: {
  physicalItemId: number;
  name?: string;
  purchaseDate?: string | null;
  wasArchived: boolean;
  isArchived: boolean;
  archiveReason?: string | null;
}): Promise<void> {
  try {
    if (!(await hasEventsTable())) return;

    const itemUpdateFields: Record<string, any> = {};
    if (params.name !== undefined) {
      itemUpdateFields.title = params.name;
    }
    if (params.purchaseDate !== undefined) {
      itemUpdateFields.purchase_date = params.purchaseDate || null;
    }
    if (Object.keys(itemUpdateFields).length > 0) {
      await db('collection_events')
        .where({ physical_item_id: params.physicalItemId, event_type: 'item_added' })
        .update(itemUpdateFields);
      if (params.name !== undefined) {
        await db('collection_events')
          .where({ physical_item_id: params.physicalItemId, event_type: 'item_archived' })
          .update({ title: params.name });
      }
    }

    if (!params.wasArchived && params.isArchived) {
      const itemRow = await db('physical_items').where('id', params.physicalItemId).first();
      await db('collection_events').insert({
        event_type: 'item_archived',
        category: 'archived',
        occurred_at: new Date().toISOString(),
        physical_item_id: params.physicalItemId,
        title: params.name || itemRow?.name || 'Archived Item',
        metadata_json: JSON.stringify({
          archiveReason: params.archiveReason || null,
        }),
      });
    } else if (params.wasArchived && !params.isArchived) {
      await db('collection_events')
        .where({ physical_item_id: params.physicalItemId, event_type: 'item_archived' })
        .delete();
    } else if (params.wasArchived && params.isArchived && params.archiveReason !== undefined) {
      const existingArchive = await db('collection_events')
        .where({ physical_item_id: params.physicalItemId, event_type: 'item_archived' })
        .orderBy('id', 'desc')
        .first();
      if (existingArchive) {
        const meta = parseJsonObject(existingArchive.metadata_json);
        meta.archiveReason = params.archiveReason || null;
        await db('collection_events')
          .where('id', existingArchive.id)
          .update({ metadata_json: JSON.stringify(meta) });
      }
    }
  } catch (err) {
    console.warn('Failed to sync item history events:', err);
  }
}

export async function removeEventsForPhysicalItem(physicalItemId: number): Promise<void> {
  try {
    if (!(await hasEventsTable())) return;
    await db('collection_events').where('physical_item_id', physicalItemId).delete();
  } catch (err) {
    console.warn('Failed to clean up physical item events:', err);
  }
}

export async function removeAllPhysicalItemEvents(): Promise<void> {
  try {
    if (!(await hasEventsTable())) return;
    await db('collection_events').whereNotNull('physical_item_id').delete();
  } catch (err) {
    console.warn('Failed to clean up all physical item events:', err);
  }
}

export async function recordShelfGroupAddedEvent(params: {
  groupId: number;
  displayName: string;
}): Promise<void> {
  try {
    if (!(await hasEventsTable())) return;
    await db('collection_events').insert({
      event_type: 'shelf_group_added',
      category: 'shelves',
      occurred_at: new Date().toISOString(),
      shelf_group_id: params.groupId,
      title: params.displayName,
      metadata_json: JSON.stringify({
        groupName: params.displayName,
      }),
    });
  } catch (err) {
    console.warn('Failed to record shelf_group_added event:', err);
  }
}

export async function removeEventsForShelfGroup(groupId: number): Promise<void> {
  try {
    if (!(await hasEventsTable())) return;
    await db('collection_events').where('shelf_group_id', groupId).delete();
  } catch (err) {
    console.warn('Failed to clean up shelf group events:', err);
  }
}

export async function recordShelvesAddedEvents(
  shelves: Array<{
    shelfId: number;
    groupId: number;
    groupName: string;
    shelfName: string;
    capacityUnits: number;
    widthMm?: number | null;
  }>
): Promise<void> {
  try {
    if (shelves.length === 0 || !(await hasEventsTable())) return;
    const batchKey = shelves.length > 1 ? generateBatchKey('shelves') : null;
    const occurredAt = new Date().toISOString();

    const rows = shelves.map((s) => ({
      event_type: 'shelf_added',
      category: 'shelves',
      occurred_at: occurredAt,
      batch_key: batchKey,
      shelf_group_id: s.groupId,
      shelf_id: s.shelfId,
      title: s.shelfName,
      metadata_json: JSON.stringify({
        groupName: s.groupName,
        shelfName: s.shelfName,
        capacityUnits: s.capacityUnits,
        widthMm: s.widthMm ?? null,
      }),
    }));

    await db('collection_events').insert(rows);
  } catch (err) {
    console.warn('Failed to record shelf_added events:', err);
  }
}

export async function recordShelfResizedEvent(params: {
  shelfId: number;
  groupId: number;
  groupName: string;
  shelfName: string;
  previousCapacityUnits: number;
  newCapacityUnits: number;
  widthMm?: number | null;
}): Promise<void> {
  try {
    if (
      params.previousCapacityUnits === params.newCapacityUnits ||
      !(await hasEventsTable())
    ) {
      return;
    }
    await db('collection_events').insert({
      event_type: 'shelf_resized',
      category: 'shelves',
      occurred_at: new Date().toISOString(),
      shelf_group_id: params.groupId,
      shelf_id: params.shelfId,
      title: params.shelfName,
      metadata_json: JSON.stringify({
        groupName: params.groupName,
        shelfName: params.shelfName,
        previousCapacityUnits: params.previousCapacityUnits,
        capacityUnits: params.newCapacityUnits,
        widthMm: params.widthMm ?? null,
      }),
    });
  } catch (err) {
    console.warn('Failed to record shelf_resized event:', err);
  }
}

export async function removeEventsForShelf(shelfId: number): Promise<void> {
  try {
    if (!(await hasEventsTable())) return;
    await db('collection_events').where('shelf_id', shelfId).delete();
  } catch (err) {
    console.warn('Failed to clean up shelf events:', err);
  }
}

export async function recordShelfPhotoAddedEvent(params: {
  photoId: number;
  groupName?: string | null;
  shelfName?: string | null;
  caption?: string | null;
  imageUrl: string;
}): Promise<void> {
  try {
    if (!(await hasEventsTable())) return;
    await db('collection_events').insert({
      event_type: 'shelf_photo_added',
      category: 'shelves',
      occurred_at: new Date().toISOString(),
      shelf_photo_id: params.photoId,
      title: params.caption || params.groupName || 'Full Setup Photo',
      metadata_json: JSON.stringify({
        groupName: params.groupName || null,
        shelfName: params.shelfName || null,
        caption: params.caption || null,
        imageUrl: params.imageUrl,
      }),
    });
  } catch (err) {
    console.warn('Failed to record shelf_photo_added event:', err);
  }
}

export async function removeEventsForShelfPhoto(photoId: number): Promise<void> {
  try {
    if (!(await hasEventsTable())) return;
    await db('collection_events').where('shelf_photo_id', photoId).delete();
  } catch (err) {
    console.warn('Failed to clean up shelf photo events:', err);
  }
}

export async function recordShelfReorganizedEvent(params: {
  mode: 'organization' | 'auto_sort' | 'shelving_queue';
  movedCount: number;
  shelfCount?: number;
}): Promise<void> {
  try {
    if (params.movedCount <= 0 || !(await hasEventsTable())) return;

    const title =
      params.mode === 'shelving_queue'
        ? `Shelved ${params.movedCount} ${params.movedCount === 1 ? 'item' : 'items'}`
        : `Reorganized ${params.movedCount} ${params.movedCount === 1 ? 'item' : 'items'}${
            params.shelfCount
              ? ` across ${params.shelfCount} ${params.shelfCount === 1 ? 'shelf' : 'shelves'}`
              : ''
          }`;

    await db('collection_events').insert({
      event_type: 'shelf_reorganized',
      category: 'shelves',
      occurred_at: new Date().toISOString(),
      title,
      metadata_json: JSON.stringify({
        mode: params.mode,
        movedCount: params.movedCount,
        shelfCount: params.shelfCount,
      }),
    });
  } catch (err) {
    console.warn('Failed to record shelf_reorganized event:', err);
  }
}

export async function deleteHistoryEventsByIds(ids: number[]): Promise<number> {
  const cleanIds = Array.from(
    new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
  );
  if (cleanIds.length === 0 || !(await hasEventsTable())) {
    return 0;
  }
  return db('collection_events').whereIn('id', cleanIds).delete();
}

export async function queryHistoryFeed(
  options: HistoryQueryOptions
): Promise<HistoryFeedResponse> {
  if (!(await hasEventsTable())) {
    return {
      entries: [],
      totalEntries: 0,
      hasMore: false,
      counts: { all: 0, items: 0, shelves: 0, archived: 0 },
      itemsWithPurchaseDate: 0,
    };
  }

  const dateBasis = options.dateBasis === 'purchased' ? 'purchased' : 'added';
  const categoryFilter =
    options.category && ['items', 'shelves', 'archived'].includes(options.category)
      ? (options.category as CollectionEventCategory)
      : 'all';
  const searchQuery = options.search?.trim().toLowerCase() || '';
  const limit = Math.min(Math.max(1, options.limit || 50), 250);
  const offset = Math.max(0, options.offset || 0);

  const rawEvents = await db('collection_events')
    .select('*')
    .orderBy('occurred_at', 'desc')
    .orderBy('id', 'desc');

  // Collect referenced IDs for batch hydration
  const physicalItemIds = Array.from(
    new Set(
      rawEvents
        .map((e: any) => (e.physical_item_id ? Number(e.physical_item_id) : null))
        .filter((id): id is number => id !== null)
    )
  );
  const shelfIds = Array.from(
    new Set(
      rawEvents
        .map((e: any) => (e.shelf_id ? Number(e.shelf_id) : null))
        .filter((id): id is number => id !== null)
    )
  );
  const shelfGroupIds = Array.from(
    new Set(
      rawEvents
        .map((e: any) => (e.shelf_group_id ? Number(e.shelf_group_id) : null))
        .filter((id): id is number => id !== null)
    )
  );
  const photoIds = Array.from(
    new Set(
      rawEvents
        .map((e: any) => (e.shelf_photo_id ? Number(e.shelf_photo_id) : null))
        .filter((id): id is number => id !== null)
    )
  );

  // Hydrate physical items + media
  const itemsById = new Map<number, any>();
  const mediaByItemId = new Map<
    number,
    Array<{
      id: number;
      title: string;
      year: number | null;
      mediaType: 'movie' | 'tv_season';
      coverArtUrl: string | null;
    }>
  >();

  if (physicalItemIds.length > 0) {
    const itemRows = await db('physical_items')
      .whereIn('id', physicalItemIds)
      .select(
        'id',
        'name',
        'physical_format',
        'edition_notes',
        'purchase_date',
        'cost',
        'store_links',
        'custom_image_url',
        'custom_images',
        'archived',
        'archive_reason'
      );
    for (const row of itemRows) {
      itemsById.set(Number(row.id), row);
    }

    const pimRows = await db('physical_item_media as pim')
      .join('media as m', 'pim.media_id', 'm.id')
      .whereIn('pim.physical_item_id', physicalItemIds)
      .select(
        'pim.physical_item_id',
        'm.id as media_id',
        'm.title',
        'm.release_date',
        'm.media_type',
        'm.cover_art_url'
      )
      .orderBy('pim.disc_number', 'asc')
      .orderBy('pim.id', 'asc');

    for (const row of pimRows) {
      const pid = Number(row.physical_item_id);
      if (!mediaByItemId.has(pid)) {
        mediaByItemId.set(pid, []);
      }
      const list = mediaByItemId.get(pid)!;
      if (!list.some((m) => m.id === Number(row.media_id))) {
        const yearNum = row.release_date ? parseInt(String(row.release_date).slice(0, 4), 10) : NaN;
        list.push({
          id: Number(row.media_id),
          title: row.title,
          year: !isNaN(yearNum) ? yearNum : null,
          mediaType: row.media_type === 'tv_season' ? 'tv_season' : 'movie',
          coverArtUrl: row.cover_art_url || null,
        });
      }
    }
  }

  // Hydrate shelf groups, shelves, photos (so deleted entities are skipped even if FK cascade wasn't triggered)
  const groupsById = new Map<number, any>();
  if (shelfGroupIds.length > 0) {
    const rows = await db('shelf_groups').whereIn('id', shelfGroupIds).select('id', 'display_name');
    for (const r of rows) groupsById.set(Number(r.id), r);
  }

  const shelvesById = new Map<number, any>();
  if (shelfIds.length > 0) {
    const rows = await db('shelves')
      .leftJoin('shelf_groups', 'shelves.group_id', 'shelf_groups.id')
      .whereIn('shelves.id', shelfIds)
      .select(
        'shelves.id',
        'shelves.group_id',
        'shelves.display_name',
        'shelves.capacity_units',
        'shelves.width_mm',
        'shelf_groups.display_name as group_display_name'
      );
    for (const r of rows) shelvesById.set(Number(r.id), r);
  }

  const photosById = new Map<number, any>();
  if (photoIds.length > 0) {
    const rows = await db('shelf_photos')
      .leftJoin('shelf_groups', 'shelf_photos.group_id', 'shelf_groups.id')
      .leftJoin('shelves', 'shelf_photos.shelf_id', 'shelves.id')
      .whereIn('shelf_photos.id', photoIds)
      .select(
        'shelf_photos.id',
        'shelf_photos.image_url',
        'shelf_photos.caption',
        'shelf_groups.display_name as group_display_name',
        'shelves.display_name as shelf_display_name'
      );
    for (const r of rows) photosById.set(Number(r.id), r);
  }

  let itemsWithPurchaseDate = 0;

  // Group into entries (preserving batch_key grouping; under 'purchased' basis, split batch items with distinct purchase dates)
  const entryMap = new Map<string, HistoryEntry>();
  const orderedEntries: HistoryEntry[] = [];

  for (const ev of rawEvents) {
    const eventId = Number(ev.id);
    const eventType = ev.event_type as CollectionEventType;
    const category = ev.category as CollectionEventCategory;
    const meta = parseJsonObject(ev.metadata_json);

    // Enforce rule: permanently deleted entities never appear in history
    if (ev.physical_item_id != null && !itemsById.has(Number(ev.physical_item_id))) {
      continue;
    }
    if (ev.shelf_id != null && !shelvesById.has(Number(ev.shelf_id))) {
      continue;
    }
    if (
      ev.shelf_group_id != null &&
      ev.shelf_id == null &&
      !groupsById.has(Number(ev.shelf_group_id))
    ) {
      continue;
    }
    if (ev.shelf_photo_id != null && !photosById.has(Number(ev.shelf_photo_id))) {
      continue;
    }

    if (eventType === 'item_added' || eventType === 'item_archived') {
      const pid = Number(ev.physical_item_id);
      const itemRow = itemsById.get(pid);
      if (!itemRow) continue;

      // Only show item_archived if the item is currently archived
      if (eventType === 'item_archived' && !itemRow.archived) {
        continue;
      }

      const linkedMedia = mediaByItemId.get(pid) || [];
      const customImages = parseCustomImagesFromRow(
        itemRow.custom_images,
        itemRow.custom_image_url
      );
      const coverArtUrl =
        customImages[0]?.url ||
        itemRow.custom_image_url ||
        linkedMedia[0]?.coverArtUrl ||
        null;

      const formats = parseJsonArray<string>(itemRow.physical_format);
      const editionTags = parseEditionTags(itemRow.edition_notes);
      const purchaseDate: string | null = itemRow.purchase_date || ev.purchase_date || null;

      if (eventType === 'item_added' && purchaseDate) {
        itemsWithPurchaseDate += 1;
      }

      const effectiveDate =
        eventType === 'item_added' && dateBasis === 'purchased' && purchaseDate
          ? `${purchaseDate}T12:00:00.000Z`
          : ev.occurred_at;

      const itemDetail: HistoryItemDetail = {
        eventId,
        physicalItemId: pid,
        name: itemRow.name || ev.title,
        coverArtUrl,
        formats,
        editionTags,
        mediaTitles: linkedMedia.map((m) => ({
          id: m.id,
          title: m.title,
          year: m.year,
          mediaType: m.mediaType,
        })),
        purchaseDate,
        occurredAt: ev.occurred_at,
        cost: options.canSeeCost ? normalizeCost(itemRow.cost) : undefined,
        storeName: extractPrimaryStoreName(itemRow.store_links),
        archived: Boolean(itemRow.archived),
        archiveReason: options.isAdmin
          ? (meta.archiveReason ?? itemRow.archive_reason ?? null)
          : undefined,
        isUpgrade: Boolean(meta.isUpgrade),
        previousFormats: Array.isArray(meta.previousFormats) ? meta.previousFormats : undefined,
      };

      // Search filter on item
      if (searchQuery) {
        const haystack = [
          itemDetail.name,
          ...itemDetail.formats,
          ...itemDetail.editionTags,
          ...itemDetail.mediaTitles.map((m) => m.title),
          itemDetail.storeName || '',
          options.isAdmin && itemDetail.archiveReason ? itemDetail.archiveReason : '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchQuery)) {
          continue;
        }
      }

      const groupKey =
        eventType === 'item_added' && ev.batch_key
          ? dateBasis === 'purchased'
            ? `batch-${ev.batch_key}-${purchaseDate || 'nopurchase'}`
            : `batch-${ev.batch_key}`
          : `event-${eventId}`;

      const existingEntry = entryMap.get(groupKey);
      if (existingEntry && existingEntry.items) {
        existingEntry.eventIds.push(eventId);
        existingEntry.items.push(itemDetail);
        existingEntry.title =
          existingEntry.items.length === 1
            ? existingEntry.items[0].name
            : `Added ${existingEntry.items.length} items to collection`;
      } else {
        const entry: HistoryEntry = {
          entryKey: groupKey,
          eventIds: [eventId],
          batchKey: ev.batch_key || null,
          eventType,
          category,
          effectiveDate,
          occurredAt: ev.occurred_at,
          title: itemDetail.name,
          items: [itemDetail],
        };
        entryMap.set(groupKey, entry);
        orderedEntries.push(entry);
      }
      continue;
    }

    if (
      eventType === 'shelf_group_added' ||
      eventType === 'shelf_added' ||
      eventType === 'shelf_resized'
    ) {
      const shelfRow = ev.shelf_id ? shelvesById.get(Number(ev.shelf_id)) : null;
      const groupRow = ev.shelf_group_id ? groupsById.get(Number(ev.shelf_group_id)) : null;

      const groupName =
        shelfRow?.group_display_name || groupRow?.display_name || meta.groupName || ev.title;
      const shelfName =
        eventType === 'shelf_group_added'
          ? undefined
          : shelfRow?.display_name || meta.shelfName || ev.title;

      const shelfDetail: HistoryShelfDetail = {
        eventId,
        shelfId: ev.shelf_id ? Number(ev.shelf_id) : null,
        shelfGroupId: ev.shelf_group_id ? Number(ev.shelf_group_id) : null,
        groupName,
        shelfName,
        capacityUnits:
          eventType === 'shelf_resized'
            ? (meta.capacityUnits ?? shelfRow?.capacity_units)
            : (shelfRow?.capacity_units ?? meta.capacityUnits),
        previousCapacityUnits: meta.previousCapacityUnits,
        widthMm: shelfRow?.width_mm ?? meta.widthMm ?? null,
      };

      if (searchQuery) {
        const haystack = [groupName, shelfName || ''].join(' ').toLowerCase();
        if (!haystack.includes(searchQuery)) {
          continue;
        }
      }

      const groupKey =
        eventType === 'shelf_added' && ev.batch_key
          ? `batch-${ev.batch_key}`
          : `event-${eventId}`;

      const existingEntry = entryMap.get(groupKey);
      if (existingEntry && existingEntry.shelves) {
        existingEntry.eventIds.push(eventId);
        existingEntry.shelves.push(shelfDetail);
        existingEntry.title = `Added ${existingEntry.shelves.length} shelves to ${groupName}`;
      } else {
        const title =
          eventType === 'shelf_group_added'
            ? `Added shelf group "${groupName}"`
            : eventType === 'shelf_resized'
              ? `Updated shelf "${shelfName}" capacity`
              : `Added shelf "${shelfName}"`;
        const entry: HistoryEntry = {
          entryKey: groupKey,
          eventIds: [eventId],
          batchKey: ev.batch_key || null,
          eventType,
          category: 'shelves',
          effectiveDate: ev.occurred_at,
          occurredAt: ev.occurred_at,
          title,
          shelves: [shelfDetail],
        };
        entryMap.set(groupKey, entry);
        orderedEntries.push(entry);
      }
      continue;
    }

    if (eventType === 'shelf_photo_added') {
      const photoRow = ev.shelf_photo_id ? photosById.get(Number(ev.shelf_photo_id)) : null;
      if (!photoRow) continue;

      const caption = photoRow.caption ?? meta.caption ?? null;
      const groupName = photoRow.group_display_name ?? meta.groupName ?? null;
      const shelfName = photoRow.shelf_display_name ?? meta.shelfName ?? null;

      if (searchQuery) {
        const haystack = [caption || '', groupName || '', shelfName || '', 'photo']
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchQuery)) {
          continue;
        }
      }

      orderedEntries.push({
        entryKey: `event-${eventId}`,
        eventIds: [eventId],
        batchKey: null,
        eventType: 'shelf_photo_added',
        category: 'shelves',
        effectiveDate: ev.occurred_at,
        occurredAt: ev.occurred_at,
        title: caption || (groupName ? `Added photo of ${groupName}` : 'Added setup photo'),
        photo: {
          photoId: Number(photoRow.id),
          imageUrl: photoRow.image_url,
          caption,
          groupName,
          shelfName,
        },
      });
      continue;
    }

    if (eventType === 'shelf_reorganized') {
      if (searchQuery && !String(ev.title).toLowerCase().includes(searchQuery)) {
        continue;
      }

      orderedEntries.push({
        entryKey: `event-${eventId}`,
        eventIds: [eventId],
        batchKey: null,
        eventType: 'shelf_reorganized',
        category: 'shelves',
        effectiveDate: ev.occurred_at,
        occurredAt: ev.occurred_at,
        title: ev.title,
        reorganization: {
          mode: meta.mode || 'organization',
          movedCount: Number(meta.movedCount) || 0,
          shelfCount: meta.shelfCount ? Number(meta.shelfCount) : undefined,
        },
      });
    }
  }

  // Sort items inside multi-item entries oldest-to-newest (natural reading order inside expanded batch)
  for (const entry of orderedEntries) {
    if (entry.items && entry.items.length > 1) {
      entry.items.reverse();
    }
    if (entry.shelves && entry.shelves.length > 1) {
      entry.shelves.reverse();
    }
  }

  // Re-sort entries by effectiveDate DESC (important when dateBasis === 'purchased')
  orderedEntries.sort((a, b) => {
    const cmp = b.effectiveDate.localeCompare(a.effectiveDate);
    if (cmp !== 0) return cmp;
    return (b.eventIds[0] || 0) - (a.eventIds[0] || 0);
  });

  // Compute category counts before category filtering (respecting search query)
  const counts = {
    all: orderedEntries.length,
    items: 0,
    shelves: 0,
    archived: 0,
  };
  for (const entry of orderedEntries) {
    counts[entry.category] += 1;
  }

  const filteredEntries =
    categoryFilter === 'all'
      ? orderedEntries
      : orderedEntries.filter((e) => e.category === categoryFilter);

  const pagedEntries = filteredEntries.slice(offset, offset + limit);

  return {
    entries: pagedEntries,
    totalEntries: filteredEntries.length,
    hasMore: offset + limit < filteredEntries.length,
    counts,
    itemsWithPurchaseDate,
  };
}
