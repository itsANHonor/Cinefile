import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasVersionNotes = await knex.schema.hasColumn('physical_item_media', 'version_notes');
  if (!hasVersionNotes) {
    await knex.schema.alterTable('physical_item_media', (table) => {
      table.text('version_notes').nullable();
    });
  }

  try {
    await knex.schema.alterTable('physical_item_media', (table) => {
      table.dropUnique(['physical_item_id', 'media_id']);
    });
  } catch {
    // Unique constraint may already be dropped or absent
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasVersionNotes = await knex.schema.hasColumn('physical_item_media', 'version_notes');
  if (hasVersionNotes) {
    await knex.schema.alterTable('physical_item_media', (table) => {
      table.dropColumn('version_notes');
    });
  }
}
