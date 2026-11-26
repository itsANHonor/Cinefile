function toIsoUtc(raw) {
  if (!raw) {
    return new Date().toISOString();
  }
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? new Date().toISOString() : raw.toISOString();
  }
  const str = String(raw).trim();
  if (!str) {
    return new Date().toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
    const parsed = new Date(str.replace(' ', 'T') + 'Z');
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function parseJsonArrayString(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Migration 033: Collection History Events & Public Visibility Setting
 */
exports.up = async function (knex) {
  const hasSettings = await knex.schema.hasTable('settings');
  if (hasSettings) {
    const existingSetting = await knex('settings').where({ key: 'history_public' }).first();
    if (!existingSetting) {
      await knex('settings').insert({
        key: 'history_public',
        value: 'false',
      });
    }
  }

  const hasEventsTable = await knex.schema.hasTable('collection_events');
  if (hasEventsTable) {
    return;
  }

  await knex.schema.createTable('collection_events', (table) => {
    table.increments('id').primary();
    table.string('event_type').notNullable();
    table.string('category').notNullable();
    table.string('occurred_at').notNullable();
    table.string('purchase_date').nullable();
    table.string('batch_key').nullable();
    table.integer('physical_item_id').nullable();
    table.integer('shelf_group_id').nullable();
    table.integer('shelf_id').nullable();
    table.integer('shelf_photo_id').nullable();
    table.string('title').notNullable();
    table.text('metadata_json').notNullable().defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table
      .foreign('physical_item_id')
      .references('id')
      .inTable('physical_items')
      .onDelete('CASCADE');
    table
      .foreign('shelf_group_id')
      .references('id')
      .inTable('shelf_groups')
      .onDelete('CASCADE');
    table.foreign('shelf_id').references('id').inTable('shelves').onDelete('CASCADE');
    table
      .foreign('shelf_photo_id')
      .references('id')
      .inTable('shelf_photos')
      .onDelete('CASCADE');

    table.index('occurred_at');
    table.index('category');
    table.index('event_type');
    table.index('batch_key');
    table.index('physical_item_id');
  });

  // ── Backfill 1: Physical Items (Additions + Archives) ──────────────────
  const hasPhysicalItems = await knex.schema.hasTable('physical_items');
  if (hasPhysicalItems) {
    const items = await knex('physical_items')
      .select('id', 'name', 'physical_format', 'purchase_date', 'archived', 'archive_reason', 'created_at', 'updated_at')
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc');

    const hasPim = await knex.schema.hasTable('physical_item_media');
    const pimRows = hasPim
      ? await knex('physical_item_media').select('physical_item_id', 'media_id', 'formats')
      : [];

    const mediaByItem = new Map();
    for (const row of pimRows) {
      const itemId = Number(row.physical_item_id);
      if (!mediaByItem.has(itemId)) {
        mediaByItem.set(itemId, []);
      }
      mediaByItem.get(itemId).push({
        mediaId: Number(row.media_id),
        formats: parseJsonArrayString(row.formats),
      });
    }

    const itemClusters = [];
    for (const item of items) {
      const itemTs = new Date(toIsoUtc(item.created_at)).getTime();
      const lastCluster = itemClusters[itemClusters.length - 1];
      if (lastCluster && lastCluster.length > 0) {
        const prevItem = lastCluster[lastCluster.length - 1];
        const prevTs = new Date(toIsoUtc(prevItem.created_at)).getTime();
        if (Math.abs(itemTs - prevTs) <= 90_000) {
          lastCluster.push(item);
          continue;
        }
      }
      itemClusters.push([item]);
    }

    const ownedMediaFormats = new Map();
    const eventsToInsert = [];

    itemClusters.forEach((cluster, clusterIdx) => {
      const batchKey = cluster.length > 1 ? `backfill-items-${clusterIdx + 1}` : null;
      const clusterOccurredAt = toIsoUtc(cluster[0].created_at);

      for (const item of cluster) {
        const itemFormats = parseJsonArrayString(item.physical_format);
        const linked = mediaByItem.get(Number(item.id)) || [];

        let isUpgrade = false;
        const previousFormatsSet = new Set();

        for (const link of linked) {
          const prior = ownedMediaFormats.get(link.mediaId);
          if (prior && prior.size > 0) {
            isUpgrade = true;
            prior.forEach((fmt) => previousFormatsSet.add(fmt));
          }
        }

        for (const link of linked) {
          if (!ownedMediaFormats.has(link.mediaId)) {
            ownedMediaFormats.set(link.mediaId, new Set());
          }
          const effective = link.formats.length > 0 ? link.formats : itemFormats;
          effective.forEach((fmt) => ownedMediaFormats.get(link.mediaId).add(fmt));
        }

        const metadata = {};
        if (isUpgrade) {
          metadata.isUpgrade = true;
          metadata.previousFormats = Array.from(previousFormatsSet);
        }

        eventsToInsert.push({
          event_type: 'item_added',
          category: 'items',
          occurred_at: batchKey ? clusterOccurredAt : toIsoUtc(item.created_at),
          purchase_date: item.purchase_date || null,
          batch_key: batchKey,
          physical_item_id: item.id,
          title: item.name,
          metadata_json: JSON.stringify(metadata),
        });

        if (item.archived === 1 || item.archived === true) {
          eventsToInsert.push({
            event_type: 'item_archived',
            category: 'archived',
            occurred_at: toIsoUtc(item.updated_at || item.created_at),
            purchase_date: null,
            batch_key: null,
            physical_item_id: item.id,
            title: item.name,
            metadata_json: JSON.stringify({
              archiveReason: item.archive_reason || null,
            }),
          });
        }
      }
    });

    for (let i = 0; i < eventsToInsert.length; i += 200) {
      await knex('collection_events').insert(eventsToInsert.slice(i, i + 200));
    }
  }

  // ── Backfill 2: Shelf Groups ───────────────────────────────────────────
  const hasShelfGroups = await knex.schema.hasTable('shelf_groups');
  if (hasShelfGroups) {
    const groups = await knex('shelf_groups')
      .select('id', 'display_name', 'created_at')
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc');

    if (groups.length > 0) {
      const groupEvents = groups.map((g) => ({
        event_type: 'shelf_group_added',
        category: 'shelves',
        occurred_at: toIsoUtc(g.created_at),
        shelf_group_id: g.id,
        title: g.display_name,
        metadata_json: JSON.stringify({
          groupName: g.display_name,
        }),
      }));
      await knex('collection_events').insert(groupEvents);
    }
  }

  // ── Backfill 3: Shelves ────────────────────────────────────────────────
  const hasShelves = await knex.schema.hasTable('shelves');
  if (hasShelves && hasShelfGroups) {
    const shelves = await knex('shelves')
      .join('shelf_groups', 'shelves.group_id', 'shelf_groups.id')
      .select(
        'shelves.id',
        'shelves.group_id',
        'shelves.display_name',
        'shelves.capacity_units',
        'shelves.width_mm',
        'shelves.created_at',
        'shelf_groups.display_name as group_display_name'
      )
      .orderBy('shelves.created_at', 'asc')
      .orderBy('shelves.id', 'asc');

    const shelfClusters = [];
    for (const shelf of shelves) {
      const shelfTs = new Date(toIsoUtc(shelf.created_at)).getTime();
      const lastCluster = shelfClusters[shelfClusters.length - 1];
      if (lastCluster && lastCluster.length > 0) {
        const prev = lastCluster[lastCluster.length - 1];
        const prevTs = new Date(toIsoUtc(prev.created_at)).getTime();
        if (prev.group_id === shelf.group_id && Math.abs(shelfTs - prevTs) <= 60_000) {
          lastCluster.push(shelf);
          continue;
        }
      }
      shelfClusters.push([shelf]);
    }

    const shelfEvents = [];
    shelfClusters.forEach((cluster, idx) => {
      const batchKey = cluster.length > 1 ? `backfill-shelves-${idx + 1}` : null;
      const clusterOccurredAt = toIsoUtc(cluster[0].created_at);
      for (const s of cluster) {
        shelfEvents.push({
          event_type: 'shelf_added',
          category: 'shelves',
          occurred_at: batchKey ? clusterOccurredAt : toIsoUtc(s.created_at),
          batch_key: batchKey,
          shelf_group_id: s.group_id,
          shelf_id: s.id,
          title: s.display_name,
          metadata_json: JSON.stringify({
            groupName: s.group_display_name,
            shelfName: s.display_name,
            capacityUnits: s.capacity_units,
            widthMm: s.width_mm ?? null,
          }),
        });
      }
    });

    for (let i = 0; i < shelfEvents.length; i += 200) {
      await knex('collection_events').insert(shelfEvents.slice(i, i + 200));
    }
  }

  // ── Backfill 4: Shelf Photos ───────────────────────────────────────────
  const hasShelfPhotos = await knex.schema.hasTable('shelf_photos');
  if (hasShelfPhotos) {
    const photos = await knex('shelf_photos')
      .leftJoin('shelf_groups', 'shelf_photos.group_id', 'shelf_groups.id')
      .leftJoin('shelves', 'shelf_photos.shelf_id', 'shelves.id')
      .select(
        'shelf_photos.id',
        'shelf_photos.image_url',
        'shelf_photos.caption',
        'shelf_photos.created_at',
        'shelf_groups.display_name as group_display_name',
        'shelves.display_name as shelf_display_name'
      )
      .orderBy('shelf_photos.created_at', 'asc')
      .orderBy('shelf_photos.id', 'asc');

    if (photos.length > 0) {
      const photoEvents = photos.map((p) => ({
        event_type: 'shelf_photo_added',
        category: 'shelves',
        occurred_at: toIsoUtc(p.created_at),
        shelf_photo_id: p.id,
        title: p.caption || p.group_display_name || 'Full Setup Photo',
        metadata_json: JSON.stringify({
          groupName: p.group_display_name || null,
          shelfName: p.shelf_display_name || null,
          caption: p.caption || null,
          imageUrl: p.image_url,
        }),
      }));
      await knex('collection_events').insert(photoEvents);
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('collection_events');
  const hasSettings = await knex.schema.hasTable('settings');
  if (hasSettings) {
    await knex('settings').where({ key: 'history_public' }).delete();
  }
};
