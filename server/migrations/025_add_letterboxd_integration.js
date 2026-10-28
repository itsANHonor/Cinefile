const MEDIA_LETTERBOXD_COLUMNS = [
  { name: 'letterboxd_rating', add: (t) => t.float('letterboxd_rating').nullable() },
  { name: 'letterboxd_liked', add: (t) => t.boolean('letterboxd_liked').defaultTo(false) },
  { name: 'letterboxd_watched', add: (t) => t.boolean('letterboxd_watched').defaultTo(false) },
  {
    name: 'letterboxd_last_watched_date',
    add: (t) => t.string('letterboxd_last_watched_date').nullable(),
  },
  { name: 'letterboxd_rewatch', add: (t) => t.boolean('letterboxd_rewatch').defaultTo(false) },
  { name: 'letterboxd_uri', add: (t) => t.string('letterboxd_uri').nullable() },
  { name: 'letterboxd_updated_at', add: (t) => t.timestamp('letterboxd_updated_at').nullable() },
  {
    name: 'letterboxd_dismissed_cache_ids',
    add: (t) => t.text('letterboxd_dismissed_cache_ids').nullable(),
  },
];

exports.up = async function (knex) {
  for (const col of MEDIA_LETTERBOXD_COLUMNS) {
    const exists = await knex.schema.hasColumn('media', col.name);
    if (!exists) {
      await knex.schema.alterTable('media', (table) => {
        col.add(table);
      });
    }
  }

  const hasCacheTable = await knex.schema.hasTable('letterboxd_cache');
  if (!hasCacheTable) {
    await knex.schema.createTable('letterboxd_cache', (table) => {
      table.increments('id').primary();
      table.integer('tmdb_id').nullable();
      table.integer('matched_media_id').nullable();
      table.string('normalized_title').notNullable();
      table.string('film_title').notNullable();
      table.integer('film_year').nullable();
      table.float('rating').nullable();
      table.boolean('liked').defaultTo(false);
      table.boolean('watched').defaultTo(true);
      table.string('last_watched_date').nullable();
      table.boolean('rewatch').defaultTo(false);
      table.string('letterboxd_uri').nullable();
      table.string('source').defaultTo('rss');
      table.timestamps(true, true);

      table.index('tmdb_id');
      table.index('matched_media_id');
      table.index(['normalized_title', 'film_year']);
    });
  }
};

exports.down = async function (knex) {
  const hasCacheTable = await knex.schema.hasTable('letterboxd_cache');
  if (hasCacheTable) {
    await knex.schema.dropTableIfExists('letterboxd_cache');
  }

  for (const col of [...MEDIA_LETTERBOXD_COLUMNS].reverse()) {
    const exists = await knex.schema.hasColumn('media', col.name);
    if (exists) {
      await knex.schema.alterTable('media', (table) => {
        table.dropColumn(col.name);
      });
    }
  }
};
