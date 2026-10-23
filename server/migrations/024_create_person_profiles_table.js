exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('person_profiles');

  if (!hasTable) {
    await knex.schema.createTable('person_profiles', (table) => {
      table.increments('id').primary();
      table.string('name_key').notNullable().unique();
      table.string('name').notNullable();
      table.integer('tmdb_person_id').nullable();
      table.string('profile_url').nullable();
      table.timestamps(true, true);

      table.index('name_key');
    });
  }
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('person_profiles');
  if (hasTable) {
    await knex.schema.dropTableIfExists('person_profiles');
  }
};
