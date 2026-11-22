exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('physical_items', 'custom_images');
  if (!hasColumn) {
    await knex.schema.alterTable('physical_items', (table) => {
      table.text('custom_images').nullable();
    });
  }

  // Backfill existing custom_image_url values into custom_images JSON array
  const rows = await knex('physical_items')
    .whereNotNull('custom_image_url')
    .andWhere('custom_image_url', '!=', '')
    .whereNull('custom_images')
    .select('id', 'custom_image_url');

  for (const row of rows) {
    const trimmed = String(row.custom_image_url || '').trim();
    if (!trimmed) continue;
    await knex('physical_items')
      .where('id', row.id)
      .update({
        custom_images: JSON.stringify([{ url: trimmed, label: 'Front' }]),
      });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('physical_items', 'custom_images');
  if (hasColumn) {
    await knex.schema.alterTable('physical_items', (table) => {
      table.dropColumn('custom_images');
    });
  }
};
