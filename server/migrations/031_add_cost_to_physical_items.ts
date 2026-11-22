import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasCost = await knex.schema.hasColumn('physical_items', 'cost');
  if (!hasCost) {
    await knex.schema.alterTable('physical_items', (table) => {
      table.decimal('cost', 10, 2).nullable();
    });
  }

  const hasSettings = await knex.schema.hasTable('settings');
  if (hasSettings) {
    const existing = await knex('settings').where({ key: 'cost_public' }).first();
    if (!existing) {
      await knex('settings').insert({
        key: 'cost_public',
        value: 'false',
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCost = await knex.schema.hasColumn('physical_items', 'cost');
  if (hasCost) {
    await knex.schema.alterTable('physical_items', (table) => {
      table.dropColumn('cost');
    });
  }

  const hasSettings = await knex.schema.hasTable('settings');
  if (hasSettings) {
    await knex('settings').where({ key: 'cost_public' }).delete();
  }
}
