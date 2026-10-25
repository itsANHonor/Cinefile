import { Router, Request, Response } from 'express';
import { db } from '../database';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

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
    const newSeries = await db('series').where({ id }).first();

    res.status(201).json(newSeries);
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

    const updatedSeries = await db('series').where({ id }).first();

    res.json(updatedSeries);
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


