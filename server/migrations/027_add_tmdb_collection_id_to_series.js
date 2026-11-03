exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('series', 'tmdb_collection_id');

  if (!hasColumn) {
    await knex.schema.alterTable('series', (table) => {
      table.integer('tmdb_collection_id').nullable();
    });
  }

  try {
    await knex.schema.alterTable('series', (table) => {
      table.index('tmdb_collection_id');
    });
  } catch {
    // Index may already exist
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('series', 'tmdb_collection_id');

  if (hasColumn) {
    try {
      await knex.schema.alterTable('series', (table) => {
        table.dropIndex('tmdb_collection_id');
      });
    } catch {
      // Index may not exist
    }

    await knex.schema.alterTable('series', (table) => {
      table.dropColumn('tmdb_collection_id');
    });
  }
};
