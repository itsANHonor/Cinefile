import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('series', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('sort_name').nullable(); // For custom sorting
    table.integer('tmdb_collection_id').nullable();
    table.text('description').nullable();
    table.string('cover_art_url').nullable();
    table.timestamps(true, true); // created_at and updated_at
    
    // Indexes
    table.index('name');
    table.index('sort_name');
    table.index('tmdb_collection_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('series');
}
