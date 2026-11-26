import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('barcode_cache');
  if (!hasTable) {
    await knex.schema.createTable('barcode_cache', (table) => {
      table.string('barcode', 32).primary();
      table.string('provider', 32).notNullable().defaultTo('upcitemdb');
      table.boolean('found').notNullable().defaultTo(false);
      table.text('title').nullable();
      table.text('brand').nullable();
      table.string('asin', 16).nullable();
      table.text('raw_payload').nullable();
      table.timestamp('fetched_at').notNullable().defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('barcode_cache');
  if (hasTable) {
    await knex.schema.dropTable('barcode_cache');
  }
}
