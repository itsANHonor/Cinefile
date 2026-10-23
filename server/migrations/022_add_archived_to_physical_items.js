exports.up = async function(knex) {
  const hasArchivedColumn = await knex.schema.hasColumn('physical_items', 'archived');

  if (!hasArchivedColumn) {
    await knex.schema.alterTable('physical_items', (table) => {
      table.boolean('archived').defaultTo(false);
    });
  }

  const hasArchiveReasonColumn = await knex.schema.hasColumn('physical_items', 'archive_reason');

  if (!hasArchiveReasonColumn) {
    await knex.schema.alterTable('physical_items', (table) => {
      table.text('archive_reason').nullable();
    });
  }

  try {
    await knex.schema.alterTable('physical_items', (table) => {
      table.index('archived');
    });
  } catch (e) {
    // Index may already exist
  }
};

exports.down = async function(knex) {
  try {
    await knex.schema.alterTable('physical_items', (table) => {
      table.dropIndex('archived');
    });
  } catch (e) {
    // Index may not exist
  }

  const hasArchiveReasonColumn = await knex.schema.hasColumn('physical_items', 'archive_reason');
  if (hasArchiveReasonColumn) {
    await knex.schema.alterTable('physical_items', (table) => {
      table.dropColumn('archive_reason');
    });
  }

  const hasArchivedColumn = await knex.schema.hasColumn('physical_items', 'archived');
  if (hasArchivedColumn) {
    await knex.schema.alterTable('physical_items', (table) => {
      table.dropColumn('archived');
    });
  }
};
