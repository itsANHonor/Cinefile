exports.up = async function (knex) {
  const hasBarcode = await knex.schema.hasColumn('physical_items', 'barcode');
  if (!hasBarcode) {
    await knex.schema.alterTable('physical_items', (table) => {
      table.string('barcode', 32).nullable();
    });
  }

  const hasAsin = await knex.schema.hasColumn('physical_items', 'asin');
  if (!hasAsin) {
    await knex.schema.alterTable('physical_items', (table) => {
      table.string('asin', 16).nullable();
    });
  }

  try {
    await knex.schema.alterTable('physical_items', (table) => {
      table.index('barcode');
    });
  } catch {
    // Index may already exist
  }

  try {
    await knex.schema.alterTable('physical_items', (table) => {
      table.index('asin');
    });
  } catch {
    // Index may already exist
  }
};

exports.down = async function (knex) {
  const hasBarcode = await knex.schema.hasColumn('physical_items', 'barcode');
  if (hasBarcode) {
    try {
      await knex.schema.alterTable('physical_items', (table) => {
        table.dropIndex('barcode');
      });
    } catch {
      // Index may not exist
    }
    await knex.schema.alterTable('physical_items', (table) => {
      table.dropColumn('barcode');
    });
  }

  const hasAsin = await knex.schema.hasColumn('physical_items', 'asin');
  if (hasAsin) {
    try {
      await knex.schema.alterTable('physical_items', (table) => {
        table.dropIndex('asin');
      });
    } catch {
      // Index may not exist
    }
    await knex.schema.alterTable('physical_items', (table) => {
      table.dropColumn('asin');
    });
  }
};
