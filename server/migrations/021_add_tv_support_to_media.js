exports.up = async function(knex) {
  // Add media_type column (movie or tv_season)
  const hasMediaType = await knex.schema.hasColumn('media', 'media_type');
  if (!hasMediaType) {
    await knex.schema.alterTable('media', (table) => {
      table.string('media_type').defaultTo('movie');
    });
  }

  // Add tv_show_tmdb_id column (TMDB series ID for API calls)
  const hasTvShowTmdbId = await knex.schema.hasColumn('media', 'tv_show_tmdb_id');
  if (!hasTvShowTmdbId) {
    await knex.schema.alterTable('media', (table) => {
      table.integer('tv_show_tmdb_id').nullable();
    });
  }

  // Add tv_show_name column (parent show display name)
  const hasTvShowName = await knex.schema.hasColumn('media', 'tv_show_name');
  if (!hasTvShowName) {
    await knex.schema.alterTable('media', (table) => {
      table.string('tv_show_name').nullable();
    });
  }

  // Add season_number column
  const hasSeasonNumber = await knex.schema.hasColumn('media', 'season_number');
  if (!hasSeasonNumber) {
    await knex.schema.alterTable('media', (table) => {
      table.integer('season_number').nullable();
    });
  }

  // Add episode_count column
  const hasEpisodeCount = await knex.schema.hasColumn('media', 'episode_count');
  if (!hasEpisodeCount) {
    await knex.schema.alterTable('media', (table) => {
      table.integer('episode_count').nullable();
    });
  }

  // Add indexes
  try {
    await knex.schema.alterTable('media', (table) => {
      table.index('media_type');
    });
  } catch (e) {
    // Index may already exist
  }

  try {
    await knex.schema.alterTable('media', (table) => {
      table.index('tv_show_tmdb_id');
    });
  } catch (e) {
    // Index may already exist
  }
};

exports.down = async function(knex) {
  const hasEpisodeCount = await knex.schema.hasColumn('media', 'episode_count');
  if (hasEpisodeCount) {
    await knex.schema.alterTable('media', (table) => {
      table.dropColumn('episode_count');
    });
  }

  const hasSeasonNumber = await knex.schema.hasColumn('media', 'season_number');
  if (hasSeasonNumber) {
    await knex.schema.alterTable('media', (table) => {
      table.dropColumn('season_number');
    });
  }

  const hasTvShowName = await knex.schema.hasColumn('media', 'tv_show_name');
  if (hasTvShowName) {
    await knex.schema.alterTable('media', (table) => {
      table.dropColumn('tv_show_name');
    });
  }

  const hasTvShowTmdbId = await knex.schema.hasColumn('media', 'tv_show_tmdb_id');
  if (hasTvShowTmdbId) {
    await knex.schema.alterTable('media', (table) => {
      table.dropColumn('tv_show_tmdb_id');
    });
  }

  const hasMediaType = await knex.schema.hasColumn('media', 'media_type');
  if (hasMediaType) {
    await knex.schema.alterTable('media', (table) => {
      table.dropColumn('media_type');
    });
  }
};
