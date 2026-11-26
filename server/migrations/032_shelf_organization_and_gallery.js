/**
 * Migration 032: Shelf Organization Studio, Reshelving Queue & Photo Gallery
 *
 * 1. shelves.width_source ('cases' | 'manual') + one-time source-aware
 *    backfill of the 12.5mm -> 15mm standard case width change.
 * 2. physical_library.default_headroom_units (breathing room per shelf).
 * 3. shelf_placements.is_pinned (pinned display items).
 * 4. shelf_organization_blocks (draggable rule blocks for auto-layout).
 * 5. shelf_photos (real-shelf photo gallery).
 */
exports.up = async function (knex) {
  // ── 1. shelves.width_source + 15mm backfill ────────────────────────────
  const hasWidthSource = await knex.schema.hasColumn('shelves', 'width_source');
  if (!hasWidthSource) {
    await knex.schema.alterTable('shelves', (table) => {
      table.string('width_source').notNullable().defaultTo('cases');
    });

    // Manually measured shelves (width_mm present and NOT equal to
    // capacity_units * 12.5, the legacy case-derived width): keep width_mm,
    // recompute capacity as floor(width_mm / 15).
    await knex.raw(`
      UPDATE shelves
      SET width_source = 'manual',
          capacity_units = MAX(1, CAST((width_mm + 0.0000001) / 15.0 AS INTEGER))
      WHERE width_mm IS NOT NULL
        AND ABS(width_mm - capacity_units * 12.5) >= 0.05
    `);

    // Case-defined shelves (width_source still 'cases'): keep capacity_units
    // intact and update width_mm to the new 15mm standard.
    await knex.raw(`
      UPDATE shelves
      SET width_mm = capacity_units * 15.0
      WHERE width_source = 'cases'
        AND (width_mm IS NULL OR ABS(width_mm - capacity_units * 15.0) >= 0.05)
    `);
  }

  // ── 2. physical_library.default_headroom_units ─────────────────────────
  const hasHeadroom = await knex.schema.hasColumn('physical_library', 'default_headroom_units');
  if (!hasHeadroom) {
    await knex.schema.alterTable('physical_library', (table) => {
      table.integer('default_headroom_units').notNullable().defaultTo(2);
    });
  }

  // ── 3. shelf_placements.is_pinned ──────────────────────────────────────
  const hasPinned = await knex.schema.hasColumn('shelf_placements', 'is_pinned');
  if (!hasPinned) {
    await knex.schema.alterTable('shelf_placements', (table) => {
      table.boolean('is_pinned').notNullable().defaultTo(false);
    });
  }

  // ── 4. shelf_organization_blocks ───────────────────────────────────────
  const hasBlocks = await knex.schema.hasTable('shelf_organization_blocks');
  if (!hasBlocks) {
    await knex.schema.createTable('shelf_organization_blocks', (table) => {
      table.increments('id').primary();
      table.integer('library_id').notNullable();
      table.string('name').notNullable();
      table.string('color').notNullable().defaultTo('#6366f1');
      table.integer('sort_order').notNullable().defaultTo(0);
      table.boolean('enabled').notNullable().defaultTo(true);
      table.string('target_scope').notNullable().defaultTo('library'); // 'library' | 'group'
      table.integer('target_group_id').nullable();
      table.boolean('start_on_fresh_shelf').notNullable().defaultTo(true);
      table.integer('headroom_units_override').nullable(); // null = use library default
      table.text('filter_rules').notNullable().defaultTo('{}'); // JSON
      table.string('sort_by').notNullable().defaultTo('title');
      table.string('sort_direction').notNullable().defaultTo('asc');
      table.timestamps(true, true);

      table.foreign('library_id').references('id').inTable('physical_library').onDelete('CASCADE');
      table.foreign('target_group_id').references('id').inTable('shelf_groups').onDelete('SET NULL');

      table.index('library_id');
      table.index('sort_order');
    });
  }

  // ── 5. shelf_photos ────────────────────────────────────────────────────
  const hasPhotos = await knex.schema.hasTable('shelf_photos');
  if (!hasPhotos) {
    await knex.schema.createTable('shelf_photos', (table) => {
      table.increments('id').primary();
      table.integer('library_id').notNullable();
      table.integer('group_id').nullable(); // null = "Full Setup" photo
      table.integer('shelf_id').nullable();
      table.string('image_url').notNullable();
      table.text('caption').nullable();
      table.text('frame').nullable(); // JSON ImageFrame
      table.integer('sort_order').notNullable().defaultTo(0);
      table.timestamps(true, true);

      table.foreign('library_id').references('id').inTable('physical_library').onDelete('CASCADE');
      table.foreign('group_id').references('id').inTable('shelf_groups').onDelete('SET NULL');
      table.foreign('shelf_id').references('id').inTable('shelves').onDelete('SET NULL');

      table.index('library_id');
      table.index('group_id');
      table.index('sort_order');
    });
  }
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('shelf_photos');
  await knex.schema.dropTableIfExists('shelf_organization_blocks');

  const hasPinned = await knex.schema.hasColumn('shelf_placements', 'is_pinned');
  if (hasPinned) {
    await knex.schema.alterTable('shelf_placements', (table) => {
      table.dropColumn('is_pinned');
    });
  }

  const hasHeadroom = await knex.schema.hasColumn('physical_library', 'default_headroom_units');
  if (hasHeadroom) {
    await knex.schema.alterTable('physical_library', (table) => {
      table.dropColumn('default_headroom_units');
    });
  }

  const hasWidthSource = await knex.schema.hasColumn('shelves', 'width_source');
  if (hasWidthSource) {
    await knex.schema.alterTable('shelves', (table) => {
      table.dropColumn('width_source');
    });
  }
}
