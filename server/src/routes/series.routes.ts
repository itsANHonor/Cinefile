import { Router, Request, Response } from 'express';
import { db } from '../database';
import { authMiddleware } from '../middleware/auth.middleware';
import { tmdbService } from '../services/tmdb.service';

const router = Router();

export interface PopulateSeriesResult {
  tmdb_collection_id: number;
  collection_name: string;
  collection_parts_count: number;
  matched_count: number;
  added_count: number;
  already_linked_count: number;
  added_titles: string[];
}

/**
 * Fetch TMDB Collection parts for `tmdbCollectionId` and link any matching local
 * movies (`media.tmdb_id` in collection parts) into `movie_series` for `seriesId`.
 */
async function populateSeriesFromTmdbCollection(
  seriesId: number,
  tmdbCollectionId: number
): Promise<PopulateSeriesResult> {
  const collectionDetails = await tmdbService.getCollectionDetails(tmdbCollectionId);
  const parts: any[] = Array.isArray(collectionDetails?.parts)
    ? [...collectionDetails.parts]
    : [];

  // Sort parts chronologically so sort_order defaults follow release order
  parts.sort((a, b) =>
    String(a.release_date || '9999-12-31').localeCompare(
      String(b.release_date || '9999-12-31')
    )
  );

  const partTmdbIds = parts
    .map((p) => Number(p.id))
    .filter((id) => !Number.isNaN(id) && id > 0);

  if (partTmdbIds.length === 0) {
    return {
      tmdb_collection_id: tmdbCollectionId,
      collection_name: collectionDetails?.name || '',
      collection_parts_count: 0,
      matched_count: 0,
      added_count: 0,
      already_linked_count: 0,
      added_titles: [],
    };
  }

  // Find all local media rows matching any TMDB movie ID in this collection
  const matchingMedia = await db('media')
    .whereIn('tmdb_id', partTmdbIds)
    .andWhere(function () {
      this.where('media_type', 'movie').orWhereNull('media_type');
    })
    .select('id', 'title', 'tmdb_id', 'primary_series_id', 'release_date');

  if (matchingMedia.length === 0) {
    return {
      tmdb_collection_id: tmdbCollectionId,
      collection_name: collectionDetails?.name || '',
      collection_parts_count: parts.length,
      matched_count: 0,
      added_count: 0,
      already_linked_count: 0,
      added_titles: [],
    };
  }

  const existingLinks = await db('movie_series')
    .where({ series_id: seriesId })
    .select('media_id');
  const existingMediaIds = new Set<number>(
    existingLinks.map((row: any) => Number(row.media_id))
  );

  const partOrderByTmdbId = new Map<number, number>();
  parts.forEach((p, idx) => {
    partOrderByTmdbId.set(Number(p.id), idx + 1);
  });

  // Sort matched local media by collection chronological order
  matchingMedia.sort((a: any, b: any) => {
    const orderA = partOrderByTmdbId.get(Number(a.tmdb_id)) ?? 999;
    const orderB = partOrderByTmdbId.get(Number(b.tmdb_id)) ?? 999;
    return orderA - orderB;
  });

  const toInsert: Array<{
    media_id: number;
    series_id: number;
    sort_order: number | null;
    auto_sort: boolean;
  }> = [];
  const addedTitles: string[] = [];
  const mediaIdsWithoutPrimary: number[] = [];

  for (const mediaRow of matchingMedia) {
    const mediaId = Number(mediaRow.id);
    if (!existingMediaIds.has(mediaId)) {
      toInsert.push({
        media_id: mediaId,
        series_id: seriesId,
        sort_order: partOrderByTmdbId.get(Number(mediaRow.tmdb_id)) ?? null,
        auto_sort: true,
      });
      addedTitles.push(mediaRow.title);
    }
    if (!mediaRow.primary_series_id) {
      mediaIdsWithoutPrimary.push(mediaId);
    }
  }

  if (toInsert.length > 0) {
    await db('movie_series').insert(toInsert);
  }

  if (mediaIdsWithoutPrimary.length > 0) {
    await db('media')
      .whereIn('id', mediaIdsWithoutPrimary)
      .whereNull('primary_series_id')
      .update({ primary_series_id: seriesId });
  }

  return {
    tmdb_collection_id: tmdbCollectionId,
    collection_name: collectionDetails?.name || '',
    collection_parts_count: parts.length,
    matched_count: matchingMedia.length,
    added_count: toInsert.length,
    already_linked_count: matchingMedia.length - toInsert.length,
    added_titles: addedTitles,
  };
}

interface Series {
  id?: number;
  name: string;
  sort_name: string;
  tmdb_collection_id?: number;
  internal_sort_method?: 'chronological' | 'custom' | 'alphabetical';
  created_at?: string;
  updated_at?: string;
}

interface MovieSeries {
  id?: number;
  media_id: number;
  series_id: number;
  sort_order?: number;
  auto_sort: boolean;
}

/**
 * GET /api/series
 * Get all series
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const series = await db('series')
      .leftJoin('movie_series', 'series.id', 'movie_series.series_id')
      .select('series.*')
      .count('movie_series.media_id as movie_count')
      .groupBy('series.id')
      .orderBy('series.sort_name', 'asc');

    res.json(
      series.map((row: any) => ({
        ...row,
        movie_count: Number(row.movie_count ?? 0),
      }))
    );
  } catch (error) {
    console.error('Error fetching series:', error);
    res.status(500).json({ error: 'Failed to fetch series' });
  }
});

/**
 * GET /api/series/:id
 * Get a single series by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const series = await db('series').where({ id }).first();

    if (!series) {
      return res.status(404).json({ error: 'Series not found' });
    }

    res.json(series);
  } catch (error) {
    console.error('Error fetching series:', error);
    res.status(500).json({ error: 'Failed to fetch series' });
  }
});

/**
 * GET /api/series/:id/movies
 * Get all movies in a series
 */
router.get('/:id/movies', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get series to check internal_sort_method
    const series = await db('series').where({ id }).first();
    if (!series) {
      return res.status(404).json({ error: 'Series not found' });
    }

    const internalSortMethod = series.internal_sort_method || 'chronological';

    let query = db('media')
      .join('movie_series', 'media.id', 'movie_series.media_id')
      .where('movie_series.series_id', id)
      .select(
        'media.*',
        'movie_series.sort_order',
        'movie_series.auto_sort'
      );

    // Apply sorting based on internal_sort_method
    if (internalSortMethod === 'custom') {
      // Custom: sort by sort_order, then release_date
      query = query.orderBy([
        { column: 'movie_series.sort_order', order: 'asc' },
        { column: 'media.release_date', order: 'asc' }
      ]);
    } else if (internalSortMethod === 'alphabetical') {
      // Alphabetical: sort by title
      query = query.orderBy('media.title', 'asc');
    } else {
      // Chronological: sort by release_date (default)
      query = query.orderBy('media.release_date', 'asc');
    }

    const movies = await query;

    // Parse cast JSON strings
    const moviesWithParsedCast = movies.map((item) => ({
      ...item,
      cast: item.cast ? JSON.parse(item.cast) : [],
    }));

    res.json(moviesWithParsedCast);
  } catch (error) {
    console.error('Error fetching series movies:', error);
    res.status(500).json({ error: 'Failed to fetch series movies' });
  }
});

const VALID_SORT_METHODS = ['chronological', 'custom', 'alphabetical'] as const;

/**
 * POST /api/series
 * Create a new series (protected)
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, sort_name, tmdb_collection_id, internal_sort_method } = req.body || {};

    // Validate required fields
    if (!name || !sort_name) {
      return res.status(400).json({ error: 'Name and sort_name are required' });
    }

    const sortMethod = VALID_SORT_METHODS.includes(internal_sort_method)
      ? internal_sort_method
      : 'chronological';

    const insertData: Series = {
      name: String(name),
      sort_name: String(sort_name),
      tmdb_collection_id: tmdb_collection_id ?? null,
      internal_sort_method: sortMethod,
    };

    const [id] = await db('series').insert(insertData);
    let autoPopulateResult: PopulateSeriesResult | null = null;
    if (insertData.tmdb_collection_id) {
      try {
        autoPopulateResult = await populateSeriesFromTmdbCollection(
          Number(id),
          Number(insertData.tmdb_collection_id)
        );
      } catch (populateError) {
        console.warn(
          `[Series] Could not auto-populate series ${id} from TMDB collection ${insertData.tmdb_collection_id}:`,
          populateError
        );
      }
    }

    const newSeries = await db('series').where({ id }).first();
    const movieCountRow = await db('movie_series')
      .where({ series_id: id })
      .count('media_id as count')
      .first();

    res.status(201).json({
      ...newSeries,
      movie_count: Number(movieCountRow?.count ?? 0),
      auto_populated: autoPopulateResult,
    });
  } catch (error) {
    console.error('Error creating series:', error);
    res.status(500).json({ error: 'Failed to create series' });
  }
});

/**
 * PUT /api/series/:id
 * Update a series (protected)
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, sort_name, tmdb_collection_id, internal_sort_method } = req.body || {};

    // Check if series exists
    const existingSeries = await db('series').where({ id }).first();
    if (!existingSeries) {
      return res.status(404).json({ error: 'Series not found' });
    }

    const updateData: Record<string, any> = {
      updated_at: db.fn.now(),
    };
    if (name !== undefined) updateData.name = String(name);
    if (sort_name !== undefined) updateData.sort_name = String(sort_name);
    if (tmdb_collection_id !== undefined) updateData.tmdb_collection_id = tmdb_collection_id;
    if (internal_sort_method !== undefined && VALID_SORT_METHODS.includes(internal_sort_method)) {
      updateData.internal_sort_method = internal_sort_method;
    }

    await db('series').where({ id }).update(updateData);

    let autoPopulateResult: PopulateSeriesResult | null = null;
    const nextCollectionId =
      tmdb_collection_id !== undefined
        ? tmdb_collection_id
        : existingSeries.tmdb_collection_id;
    if (nextCollectionId) {
      try {
        autoPopulateResult = await populateSeriesFromTmdbCollection(
          Number(id),
          Number(nextCollectionId)
        );
      } catch (populateError) {
        console.warn(
          `[Series] Could not auto-populate series ${id} from TMDB collection ${nextCollectionId}:`,
          populateError
        );
      }
    }

    const updatedSeries = await db('series').where({ id }).first();
    const movieCountRow = await db('movie_series')
      .where({ series_id: id })
      .count('media_id as count')
      .first();

    res.json({
      ...updatedSeries,
      movie_count: Number(movieCountRow?.count ?? 0),
      auto_populated: autoPopulateResult,
    });
  } catch (error) {
    console.error('Error updating series:', error);
    res.status(500).json({ error: 'Failed to update series' });
  }
});

/**
 * DELETE /api/series/:id
 * Delete a series (protected)
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if series exists
    const existingSeries = await db('series').where({ id }).first();
    if (!existingSeries) {
      return res.status(404).json({ error: 'Series not found' });
    }

    // Delete will cascade to movie_series due to foreign key
    await db('series').where({ id }).delete();

    res.json({ success: true, message: 'Series deleted successfully' });
  } catch (error) {
    console.error('Error deleting series:', error);
    res.status(500).json({ error: 'Failed to delete series' });
  }
});

/**
 * POST /api/series/:id/populate-from-tmdb
 * Populate a series with matching local movies from its TMDb Collection ID
 * (or infer the TMDb Collection ID from one of its already-linked movies).
 */
router.post('/:id/populate-from-tmdb', authMiddleware, async (req: Request, res: Response) => {
  try {
    const seriesId = parseInt(req.params.id, 10);
    if (Number.isNaN(seriesId)) {
      return res.status(400).json({ error: 'Invalid series ID' });
    }

    const series = await db('series').where({ id: seriesId }).first();
    if (!series) {
      return res.status(404).json({ error: 'Series not found' });
    }

    let tmdbCollectionId: number | null =
      req.body?.tmdb_collection_id !== undefined && req.body?.tmdb_collection_id !== null
        ? Number(req.body.tmdb_collection_id)
        : series.tmdb_collection_id
        ? Number(series.tmdb_collection_id)
        : null;

    // If no tmdb_collection_id is stored yet, try inferring it from an already-linked movie
    if (!tmdbCollectionId) {
      const linkedMovies = await db('media')
        .join('movie_series', 'media.id', 'movie_series.media_id')
        .where('movie_series.series_id', seriesId)
        .whereNotNull('media.tmdb_id')
        .select('media.tmdb_id');

      for (const m of linkedMovies) {
        try {
          const belongsTo = await tmdbService.getMovieCollections(Number(m.tmdb_id));
          if (belongsTo?.id) {
            tmdbCollectionId = Number(belongsTo.id);
            await db('series')
              .where({ id: seriesId })
              .update({ tmdb_collection_id: tmdbCollectionId, updated_at: db.fn.now() });
            break;
          }
        } catch {
          // Try next movie
        }
      }
    } else if (tmdbCollectionId !== series.tmdb_collection_id) {
      await db('series')
        .where({ id: seriesId })
        .update({ tmdb_collection_id: tmdbCollectionId, updated_at: db.fn.now() });
    }

    if (!tmdbCollectionId || Number.isNaN(tmdbCollectionId)) {
      return res.status(400).json({
        error:
          'This series does not have a TMDb Collection ID yet. Enter a TMDb Collection ID on the series first.',
      });
    }

    const result = await populateSeriesFromTmdbCollection(seriesId, tmdbCollectionId);
    const updatedSeries = await db('series').where({ id: seriesId }).first();
    const movieCountRow = await db('movie_series')
      .where({ series_id: seriesId })
      .count('media_id as count')
      .first();

    res.json({
      series: {
        ...updatedSeries,
        movie_count: Number(movieCountRow?.count ?? 0),
      },
      ...result,
    });
  } catch (error: any) {
    console.error('Error populating series from TMDb collection:', error);
    res.status(500).json({
      error: error.message || 'Failed to populate series from TMDb collection',
    });
  }
});

/**
 * POST /api/series/:id/movies/:mediaId/sort-order
 * Update sort order for a specific movie in a series (protected)
 */
router.post('/:id/movies/:mediaId/sort-order', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: seriesId, mediaId } = req.params;
    const { sort_order } = req.body;

    // Validate that the association exists
    const association = await db('movie_series')
      .where({ series_id: seriesId, media_id: mediaId })
      .first();

    if (!association) {
      return res.status(404).json({ error: 'Movie is not associated with this series' });
    }

    // Update sort_order
    await db('movie_series')
      .where({ series_id: seriesId, media_id: mediaId })
      .update({ 
        sort_order: sort_order !== undefined ? parseInt(sort_order) : null,
        updated_at: db.fn.now()
      });

    const updated = await db('movie_series')
      .where({ series_id: seriesId, media_id: mediaId })
      .first();

    res.json(updated);
  } catch (error) {
    console.error('Error updating movie sort order:', error);
    res.status(500).json({ error: 'Failed to update movie sort order' });
  }
});

/**
 * PUT /api/series/:id/movies/sort-orders
 * Bulk update sort orders for multiple movies in a series (protected)
 */
router.put('/:id/movies/sort-orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: seriesId } = req.params;
    const { sort_orders } = req.body; // Array of {media_id, sort_order}

    if (!Array.isArray(sort_orders)) {
      return res.status(400).json({ error: 'sort_orders must be an array' });
    }

    // Validate series exists
    const series = await db('series').where({ id: seriesId }).first();
    if (!series) {
      return res.status(404).json({ error: 'Series not found' });
    }

    // Update each sort order in a transaction
    await db.transaction(async (trx) => {
      for (const item of sort_orders) {
        const { media_id, sort_order } = item;
        
        // Validate association exists
        const association = await trx('movie_series')
          .where({ series_id: seriesId, media_id })
          .first();

        if (association) {
          await trx('movie_series')
            .where({ series_id: seriesId, media_id })
            .update({
              sort_order: sort_order !== undefined ? parseInt(sort_order) : null,
              updated_at: db.fn.now()
            });
        }
      }
    });

    // Return updated movies
    const movies = await db('media')
      .join('movie_series', 'media.id', 'movie_series.media_id')
      .where('movie_series.series_id', seriesId)
      .select(
        'media.*',
        'movie_series.sort_order',
        'movie_series.auto_sort'
      )
      .orderBy('movie_series.sort_order', 'asc');

    const moviesWithParsedCast = movies.map((item) => ({
      ...item,
      cast: item.cast ? JSON.parse(item.cast) : [],
    }));

    res.json(moviesWithParsedCast);
  } catch (error) {
    console.error('Error bulk updating movie sort orders:', error);
    res.status(500).json({ error: 'Failed to update movie sort orders' });
  }
});

export default router;


