exports.up = async function (knex) {
  const hasOriginalTitle = await knex.schema.hasColumn('media', 'original_title');
  if (!hasOriginalTitle) {
    await knex.schema.alterTable('media', (table) => {
      table.string('original_title').nullable();
    });
  }

  const hasOriginalLanguage = await knex.schema.hasColumn('media', 'original_language');
  if (!hasOriginalLanguage) {
    await knex.schema.alterTable('media', (table) => {
      table.string('original_language', 16).nullable();
    });
  }

  try {
    await knex.schema.alterTable('media', (table) => {
      table.index('original_title');
    });
  } catch {
    // Index may already exist
  }
};

exports.down = async function (knex) {
  const hasOriginalTitle = await knex.schema.hasColumn('media', 'original_title');
  if (hasOriginalTitle) {
    try {
      await knex.schema.alterTable('media', (table) => {
        table.dropIndex('original_title');
      });
    } catch {
      // Index may not exist
    }
    await knex.schema.alterTable('media', (table) => {
      table.dropColumn('original_title');
    });
  }

  const hasOriginalLanguage = await knex.schema.hasColumn('media', 'original_language');
  if (hasOriginalLanguage) {
    await knex.schema.alterTable('media', (table) => {
      table.dropColumn('original_language');
    });
  }
};
