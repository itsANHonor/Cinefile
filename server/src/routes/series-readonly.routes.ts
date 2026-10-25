import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

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

    const movies = await db('media')
      .join('movie_series', 'media.id', 'movie_series.media_id')
      .where('movie_series.series_id', id)
      .select(
        'media.*',
        'movie_series.sort_order',
        'movie_series.auto_sort'
      )
      .orderBy([
        { column: 'movie_series.auto_sort', order: 'desc' },
        { column: 'media.release_date', order: 'asc' },
        { column: 'movie_series.sort_order', order: 'asc' }
      ]);

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

export default router;



