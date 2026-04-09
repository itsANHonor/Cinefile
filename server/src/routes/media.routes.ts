import { Router, Request, Response } from 'express';
import { db } from '../database';
import { authMiddleware } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

interface MediaItem {
  id?: number;
  title: string;
  tmdb_id?: number;
  synopsis?: string;
  cover_art_url?: string;
  release_date?: string;
  director?: string;
  cast?: string; // JSON string
  created_at?: string;
  updated_at?: string;
}

/**
 * GET /api/media
 * Get all media items with optional filtering, sorting, and pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { format, sort_by = 'created_at', sort_order = 'desc', search, media_type, page = '1', limit = '100' } = req.query;

    // Start with base query
    let query = db('media')
      .leftJoin('movie_series', 'media.id', 'movie_series.media_id')
      .leftJoin('series', 'movie_series.series_id', 'series.id')
      .leftJoin('series as primary_series', 'media.primary_series_id', 'primary_series.id')
      .select(
        'media.*',
        db.raw('GROUP_CONCAT(DISTINCT series.id) as series_ids'),
        db.raw('GROUP_CONCAT(DISTINCT series.name) as series_names'),
        db.raw('GROUP_CONCAT(DISTINCT series.sort_name) as series_sort_names')
      )
      .groupBy('media.id');

    // Filter by media_type if specified
    if (media_type && typeof media_type === 'string' && media_type !== 'all') {
      if (media_type === 'movie') {
        query = query.where(function() {
          this.where('media.media_type', 'movie').orWhereNull('media.media_type');
        });
      } else {
        query = query.where('media.media_type', media_type);
      }
    }

    // Search functionality
    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      query = query.where(function() {
        this.where('media.title', 'like', searchTerm)
          .orWhere('media.director', 'like', searchTerm)
          .orWhere('media.synopsis', 'like', searchTerm)
          .orWhereRaw(`EXISTS (
            SELECT 1 FROM json_each(media.cast) 
            WHERE json_each.value LIKE ?
          )`, [searchTerm]);
      });
    }

    // Sorting
    const sortDirection = sort_order === 'asc' ? 'asc' : 'desc';
    
    if (sort_by === 'series_sort') {
      // Sort by primary series sort name if set, otherwise first series sort name, otherwise title
      // Use a subquery to get the first series sort_name deterministically
      // Then sort by release_date within the same series to group movies chronologically
      // Handle NULL release_date by using a large date for sorting
      query = query.orderByRaw(`
        COALESCE(
          primary_series.sort_name,
          (SELECT MIN(series.sort_name) 
           FROM movie_series ms 
           JOIN series s ON ms.series_id = s.id 
           WHERE ms.media_id = media.id),
          media.title
        ) ${sortDirection.toUpperCase()},
        COALESCE(media.release_date, '9999-12-31') ${sortDirection.toUpperCase()}
      `);
    } else if (sort_by === 'director_last_name') {
      // Extract last name from director field and sort by it
      query = query.orderByRaw(`
        CASE 
          WHEN media.director IS NOT NULL AND media.director != '' 
          THEN SUBSTR(media.director, INSTR(media.director, ' ') + 1)
          ELSE media.director
        END ${sortDirection.toUpperCase()} NULLS LAST
      `);
    } else {
      const validSortColumns = ['title', 'release_date', 'created_at'];
      const sortColumn = validSortColumns.includes(sort_by as string) ? `media.${sort_by}` : 'media.created_at';
      query = query.orderBy(sortColumn, sortDirection);
    }

    // Get total count for pagination
    let countQuery = db('media')
      .leftJoin('movie_series', 'media.id', 'movie_series.media_id')
      .leftJoin('series', 'movie_series.series_id', 'series.id')
      .groupBy('media.id');

    // Apply same media_type filter to count query
    if (media_type && typeof media_type === 'string' && media_type !== 'all') {
      if (media_type === 'movie') {
        countQuery = countQuery.where(function() {
          this.where('media.media_type', 'movie').orWhereNull('media.media_type');
        });
      } else {
        countQuery = countQuery.where('media.media_type', media_type);
      }
    }

    // Apply same search filters to count query
    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      countQuery = countQuery.where(function() {
        this.where('media.title', 'like', searchTerm)
          .orWhere('media.director', 'like', searchTerm)
          .orWhere('media.synopsis', 'like', searchTerm)
          .orWhereRaw(`EXISTS (
            SELECT 1 FROM json_each(media.cast) 
            WHERE json_each.value LIKE ?
          )`, [searchTerm]);
      });
    }

    const totalCount = await countQuery.countDistinct('media.id as count').first();
    const total = totalCount ? parseInt(totalCount.count as string) : 0;

    // Calculate pagination with limits
    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1); // Minimum 1
    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 100, 1), 10000); // Between 1 and 10000
    const offset = (pageNum - 1) * limitNum;
    const totalPages = Math.ceil(total / limitNum);

    // Apply pagination
    query = query.limit(limitNum).offset(offset);

    const media = await query;

    // Parse cast JSON strings and series data
    const mediaWithParsedData = media.map((item) => {
      const series_ids = item.series_ids ? item.series_ids.split(',').map(Number) : [];
      const series_names = item.series_names ? item.series_names.split(',') : [];
      const series_sort_names = item.series_sort_names ? item.series_sort_names.split(',') : [];
      
      const series = series_ids.map((id: number, index: number) => ({
        id,
        name: series_names[index],
        sort_name: series_sort_names[index],
      }));

      return {
        ...item,
        cast: item.cast ? JSON.parse(item.cast) : [],
        genres: item.genres ? JSON.parse(item.genres) : [],
        series,
        // Remove the concatenated fields
        series_ids: undefined,
        series_names: undefined,
        series_sort_names: undefined,
      };
    });

    res.json({
      items: mediaWithParsedData,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media items' });
  }
});

/**
 * GET /api/media/:id
 * Get a single media item by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const media = await db('media').where({ id }).first();

    if (!media) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    // Parse cast and genres JSON strings
    if (media.cast) {
      media.cast = JSON.parse(media.cast);
    }
    if (media.genres) {
      media.genres = JSON.parse(media.genres);
    }

    // Fetch series data
    const seriesData = await db('movie_series')
      .join('series', 'movie_series.series_id', 'series.id')
      .where('movie_series.media_id', id)
      .select('series.*', 'movie_series.sort_order', 'movie_series.auto_sort');

    media.series = seriesData;

    res.json(media);
  } catch (error) {
    console.error('Error fetching media item:', error);
    res.status(500).json({ error: 'Failed to fetch media item' });
  }
});

/**
 * POST /api/media
 * Create a new media item (protected)
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { series_associations, ...mediaData }: any = req.body;

    // Validate required fields
    if (!mediaData.title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Convert cast array to JSON string if provided
    if (mediaData.cast && typeof mediaData.cast !== 'string') {
      mediaData.cast = JSON.stringify(mediaData.cast);
    }
    // Convert genres array to JSON string if provided
    if (mediaData.genres && typeof mediaData.genres !== 'string') {
      mediaData.genres = JSON.stringify(mediaData.genres);
    }

    const [id] = await db('media').insert(mediaData);

    // Handle series associations
    if (series_associations && Array.isArray(series_associations) && series_associations.length > 0) {
      const associations = series_associations.map((assoc) => ({
        media_id: id,
        series_id: assoc.series_id,
        sort_order: assoc.sort_order || null,
        auto_sort: assoc.auto_sort !== undefined ? assoc.auto_sort : true,
      }));
      await db('movie_series').insert(associations);
    }

    const newMedia = await db('media').where({ id }).first();

    // Parse cast back to array for response
    if (newMedia.cast) {
      newMedia.cast = JSON.parse(newMedia.cast);
    }

    // Fetch series data
    const seriesData = await db('movie_series')
      .join('series', 'movie_series.series_id', 'series.id')
      .where('movie_series.media_id', id)
      .select('series.*', 'movie_series.sort_order', 'movie_series.auto_sort');

    newMedia.series = seriesData;

    res.status(201).json(newMedia);
  } catch (error) {
    console.error('Error creating media item:', error);
    res.status(500).json({ error: 'Failed to create media item' });
  }
});

/**
 * PUT /api/media/:id
 * Update a media item (protected)
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { series_associations, primary_series_id, ...mediaData }: any = req.body;

    // Check if media exists
    const existingMedia = await db('media').where({ id }).first();
    if (!existingMedia) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    // Validate primary_series_id if provided
    if (primary_series_id !== undefined && primary_series_id !== null) {
      // Check if primary_series_id is in series_associations
      if (series_associations && Array.isArray(series_associations)) {
        const isInAssociations = series_associations.some(
          (assoc: any) => assoc.series_id === primary_series_id
        );
        if (!isInAssociations) {
          return res.status(400).json({ 
            error: 'primary_series_id must be included in series_associations' 
          });
        }
      }
      
      // Validate that the series exists
      const seriesExists = await db('series').where({ id: primary_series_id }).first();
      if (!seriesExists) {
        return res.status(400).json({ error: 'Primary series not found' });
      }
    }

    // Validate and convert physical_format to JSON array if provided
    if (mediaData.physical_format !== undefined) {
      let formatArray: string[];
      if (Array.isArray(mediaData.physical_format)) {
        formatArray = mediaData.physical_format;
      } else if (typeof mediaData.physical_format === 'string') {
        formatArray = [mediaData.physical_format];
      } else {
        return res.status(400).json({ error: 'physical_format must be a string or array' });
      }

      // Validate each format
      const validFormats = ['4K UHD', '3D Blu-ray', 'Blu-ray', 'DVD', 'Digital-HD', 'Digital-SD', 'Digital-UHD', 'LaserDisc', 'VHS'];
      for (const format of formatArray) {
        if (!validFormats.includes(format)) {
          return res.status(400).json({ 
            error: `Invalid physical format: ${format}. Must be one of: ${validFormats.join(', ')}` 
          });
        }
      }

      if (formatArray.length === 0) {
        return res.status(400).json({ error: 'At least one physical format is required' });
      }

      mediaData.physical_format = JSON.stringify(formatArray);
    }

    // Convert cast array to JSON string if provided
    if (mediaData.cast && typeof mediaData.cast !== 'string') {
      mediaData.cast = JSON.stringify(mediaData.cast);
    }
    // Convert genres array to JSON string if provided
    if (mediaData.genres && typeof mediaData.genres !== 'string') {
      mediaData.genres = JSON.stringify(mediaData.genres);
    }

    // Remove id and timestamps from update data
    delete mediaData.id;
    delete (mediaData as any).created_at;
    delete (mediaData as any).updated_at;

    // Prepare update data including primary_series_id
    const updateData: any = {
      ...mediaData,
      updated_at: db.fn.now(),
    };
    
    if (primary_series_id !== undefined) {
      updateData.primary_series_id = primary_series_id || null;
    }

    await db('media').where({ id }).update(updateData);

    // Handle series associations update
    if (series_associations !== undefined) {
      // Delete existing associations
      await db('movie_series').where({ media_id: id }).delete();
      
      // Insert new associations
      if (Array.isArray(series_associations) && series_associations.length > 0) {
        const associations = series_associations.map((assoc) => ({
          media_id: parseInt(id),
          series_id: assoc.series_id,
          sort_order: assoc.sort_order || null,
          auto_sort: assoc.auto_sort !== undefined ? assoc.auto_sort : true,
        }));
        await db('movie_series').insert(associations);
        
        // Auto-set primary_series_id if there's exactly one series and none is set
        if (series_associations.length === 1 && (primary_series_id === undefined || primary_series_id === null)) {
          await db('media').where({ id }).update({ primary_series_id: series_associations[0].series_id });
        }
      }
      
      // If primary_series_id was removed from associations, clear it
      if (primary_series_id !== undefined && primary_series_id !== null) {
        if (!series_associations || !Array.isArray(series_associations) || 
            !series_associations.some((assoc: any) => assoc.series_id === primary_series_id)) {
          await db('media').where({ id }).update({ primary_series_id: null });
        }
      } else if (series_associations && Array.isArray(series_associations)) {
        // If primary_series_id is not provided but associations are, check if current primary is still valid
        const currentPrimary = existingMedia.primary_series_id;
        if (currentPrimary && !series_associations.some((assoc: any) => assoc.series_id === currentPrimary)) {
          await db('media').where({ id }).update({ primary_series_id: null });
        }
        
        // Auto-set primary_series_id if there's exactly one series and none is set
        if (series_associations.length === 1 && !currentPrimary) {
          await db('media').where({ id }).update({ primary_series_id: series_associations[0].series_id });
        }
      }
    }

    const updatedMedia = await db('media').where({ id }).first();

    // Parse cast, genres, and physical_format back to arrays for response
    if (updatedMedia.cast) {
      updatedMedia.cast = JSON.parse(updatedMedia.cast);
    }
    if (updatedMedia.genres) {
      updatedMedia.genres = JSON.parse(updatedMedia.genres);
    }
    if (updatedMedia.physical_format) {
      updatedMedia.physical_format = JSON.parse(updatedMedia.physical_format);
    }

    // Fetch series data
    const seriesData = await db('movie_series')
      .join('series', 'movie_series.series_id', 'series.id')
      .where('movie_series.media_id', id)
      .select('series.*', 'movie_series.sort_order', 'movie_series.auto_sort');

    updatedMedia.series = seriesData;

    res.json(updatedMedia);
  } catch (error) {
    console.error('Error updating media item:', error);
    res.status(500).json({ error: 'Failed to update media item' });
  }
});

/**
 * POST /api/media/bulk
 * Create multiple media items (protected)
 */
router.post('/bulk', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { mediaItems } = req.body;

    if (!mediaItems || !Array.isArray(mediaItems)) {
      return res.status(400).json({ error: 'mediaItems must be an array' });
    }

    if (mediaItems.length === 0) {
      return res.status(400).json({ error: 'At least one media item is required' });
    }

    if (mediaItems.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 media items allowed per request' });
    }

    const results = await Promise.allSettled(
      mediaItems.map(async (mediaData: any) => {
        // Validate required fields
        if (!mediaData.title || !mediaData.physical_format) {
          throw new Error('Title and physical_format are required');
        }

        // Validate and convert physical_format to JSON array
        let formatArray: string[];
        if (Array.isArray(mediaData.physical_format)) {
          formatArray = mediaData.physical_format;
        } else if (typeof mediaData.physical_format === 'string') {
          formatArray = [mediaData.physical_format];
        } else {
          throw new Error('physical_format must be a string or array');
        }

        // Validate each format
        const validFormats = ['4K UHD', '3D Blu-ray', 'Blu-ray', 'DVD', 'Digital-HD', 'Digital-SD', 'Digital-UHD', 'LaserDisc', 'VHS'];
        for (const format of formatArray) {
          if (!validFormats.includes(format)) {
            throw new Error(`Invalid physical format: ${format}. Must be one of: ${validFormats.join(', ')}`);
          }
        }

        if (formatArray.length === 0) {
          throw new Error('At least one physical format is required');
        }

        const processedMediaData = {
          ...mediaData,
          physical_format: JSON.stringify(formatArray)
        };

        // Convert cast array to JSON string if provided
        if (processedMediaData.cast && typeof processedMediaData.cast !== 'string') {
          processedMediaData.cast = JSON.stringify(processedMediaData.cast);
        }

        const [id] = await db('media').insert(processedMediaData);

        // Get the created media item
        const createdMedia = await db('media').where('id', id).first();
        
        // Parse cast and physical_format back to arrays for response
        if (createdMedia.cast) {
          createdMedia.cast = JSON.parse(createdMedia.cast);
        }
        if (createdMedia.physical_format) {
          createdMedia.physical_format = JSON.parse(createdMedia.physical_format);
        }

        return {
          success: true,
          media: createdMedia,
          originalTitle: mediaData.title
        };
      })
    );

    const successful: any[] = [];
    const failed: any[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push({
          originalTitle: mediaItems[index].title,
          error: result.reason.message
        });
      }
    });

    res.status(201).json({
      successful,
      failed,
      summary: {
        total: mediaItems.length,
        successful: successful.length,
        failed: failed.length
      }
    });
  } catch (error) {
    console.error('Error creating bulk media:', error);
    res.status(500).json({ error: 'Failed to create media items' });
  }
});

/**
 * DELETE /api/media/:id
 * Delete a media item (protected)
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if media exists
    const existingMedia = await db('media').where({ id }).first();
    if (!existingMedia) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    // Remove the media from any linked physical items
    await db('physical_item_media').where({ media_id: id }).delete();

    // Delete the media item
    await db('media').where({ id }).delete();

    res.json({ success: true, message: 'Media item deleted successfully' });
  } catch (error) {
    console.error('Error deleting media item:', error);
    res.status(500).json({ error: 'Failed to delete media item' });
  }
});

/**
 * POST /api/media/:id/refresh-tmdb
 * Refresh media data from TMDB (protected)
 */
router.post('/:id/refresh-tmdb', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mediaId = parseInt(id, 10);

    if (isNaN(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID' });
    }

    // Get current media data
    const currentMedia = await db('media').where({ id: mediaId }).first();
    if (!currentMedia) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    if (!currentMedia.tmdb_id) {
      return res.status(400).json({ error: 'Media item has no TMDB ID' });
    }

    // Import TMDB service
    const { tmdbService } = await import('../services/tmdb.service');

    const isTV = currentMedia.media_type === 'tv_season';

    let tmdbFormatted: any;

    if (isTV && currentMedia.tv_show_tmdb_id && currentMedia.season_number != null) {
      // Fetch TV season data from TMDB
      const tvDetails = await tmdbService.getTVDetails(currentMedia.tv_show_tmdb_id);
      const seasonDetails = await tmdbService.getTVSeasonDetails(currentMedia.tv_show_tmdb_id, currentMedia.season_number);
      const creators = tmdbService.getCreators(tvDetails.created_by);
      const cast = tmdbService.getTVTopCast(tvDetails.credits, 10);
      const posterUrl = tmdbService.getImageUrl(seasonDetails.poster_path || tvDetails.poster_path);

      tmdbFormatted = {
        title: `${tvDetails.name} - Season ${currentMedia.season_number}`,
        synopsis: seasonDetails.overview || tvDetails.overview,
        director: creators,
        cast: cast,
        release_date: seasonDetails.air_date,
        cover_art_url: posterUrl,
        genres: tvDetails.genres || [],
        episode_count: seasonDetails.episodes?.length || seasonDetails.episode_count,
        tv_show_name: tvDetails.name,
        season_number: currentMedia.season_number,
      };
    } else {
      // Fetch movie data from TMDB
      const tmdbData = await tmdbService.getMovieDetails(currentMedia.tmdb_id);
      const director = tmdbService.getDirector(tmdbData.credits);
      const cast = tmdbService.getTopCast(tmdbData.credits, 10);
      const posterUrl = tmdbService.getImageUrl(tmdbData.poster_path);

      tmdbFormatted = {
        title: tmdbData.title,
        synopsis: tmdbData.overview,
        director: director,
        cast: cast,
        release_date: tmdbData.release_date,
        cover_art_url: posterUrl,
        genres: tmdbData.genres || [],
      };
    }

    // Parse current data for comparison
    const currentFormatted: any = {
      title: currentMedia.title,
      synopsis: currentMedia.synopsis,
      director: currentMedia.director,
      cast: currentMedia.cast ? JSON.parse(currentMedia.cast) : [],
      release_date: currentMedia.release_date,
      cover_art_url: currentMedia.cover_art_url,
      genres: currentMedia.genres ? JSON.parse(currentMedia.genres) : [],
    };

    if (isTV) {
      currentFormatted.episode_count = currentMedia.episode_count;
      currentFormatted.tv_show_name = currentMedia.tv_show_name;
      currentFormatted.season_number = currentMedia.season_number;
    }

    res.json({
      current: currentFormatted,
      tmdb: tmdbFormatted,
      tmdb_id: currentMedia.tmdb_id,
    });
  } catch (error) {
    console.error('Error refreshing TMDB data:', error);
    res.status(500).json({ error: 'Failed to refresh TMDB data' });
  }
});

/**
 * PUT /api/media/:id/update-from-tmdb
 * Update media with selected TMDB fields (protected)
 */
router.put('/:id/update-from-tmdb', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fields } = req.body; // Array of field names to update from TMDB

    const mediaId = parseInt(id, 10);
    if (isNaN(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID' });
    }

    // Get current media data
    const currentMedia = await db('media').where({ id: mediaId }).first();
    if (!currentMedia) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    if (!currentMedia.tmdb_id) {
      return res.status(400).json({ error: 'Media item has no TMDB ID' });
    }

    // Import TMDB service
    const { tmdbService } = await import('../services/tmdb.service');

    const isTV = currentMedia.media_type === 'tv_season';

    // Prepare update data based on selected fields
    const updateData: any = {};

    if (isTV && currentMedia.tv_show_tmdb_id && currentMedia.season_number != null) {
      const tvDetails = await tmdbService.getTVDetails(currentMedia.tv_show_tmdb_id);
      const seasonDetails = await tmdbService.getTVSeasonDetails(currentMedia.tv_show_tmdb_id, currentMedia.season_number);
      const creators = tmdbService.getCreators(tvDetails.created_by);
      const cast = tmdbService.getTVTopCast(tvDetails.credits, 10);
      const posterUrl = tmdbService.getImageUrl(seasonDetails.poster_path || tvDetails.poster_path);

      if (fields.includes('title')) {
        updateData.title = `${tvDetails.name} - Season ${currentMedia.season_number}`;
      }
      if (fields.includes('synopsis')) {
        updateData.synopsis = seasonDetails.overview || tvDetails.overview;
      }
      if (fields.includes('director')) {
        updateData.director = creators;
      }
      if (fields.includes('cast')) {
        updateData.cast = JSON.stringify(cast);
      }
      if (fields.includes('release_date')) {
        updateData.release_date = seasonDetails.air_date;
      }
      if (fields.includes('cover_art_url')) {
        updateData.cover_art_url = posterUrl;
      }
      if (fields.includes('genres')) {
        updateData.genres = JSON.stringify(tvDetails.genres || []);
      }
      if (fields.includes('episode_count')) {
        updateData.episode_count = seasonDetails.episodes?.length || seasonDetails.episode_count;
      }
      if (fields.includes('tv_show_name')) {
        updateData.tv_show_name = tvDetails.name;
      }
    } else {
      // Fetch movie data from TMDB
      const tmdbData = await tmdbService.getMovieDetails(currentMedia.tmdb_id);
      const director = tmdbService.getDirector(tmdbData.credits);
      const cast = tmdbService.getTopCast(tmdbData.credits, 10);
      const posterUrl = tmdbService.getImageUrl(tmdbData.poster_path);

      if (fields.includes('title')) {
        updateData.title = tmdbData.title;
      }
      if (fields.includes('synopsis')) {
        updateData.synopsis = tmdbData.overview;
      }
      if (fields.includes('director')) {
        updateData.director = director;
      }
      if (fields.includes('cast')) {
        updateData.cast = JSON.stringify(cast);
      }
      if (fields.includes('release_date')) {
        updateData.release_date = tmdbData.release_date;
      }
      if (fields.includes('cover_art_url')) {
        updateData.cover_art_url = posterUrl;
      }
      if (fields.includes('genres')) {
        updateData.genres = JSON.stringify(tmdbData.genres || []);
      }
    }

    // Update the media item
    await db('media').where({ id: mediaId }).update({
      ...updateData,
      updated_at: db.fn.now(),
    });

    // Fetch updated media
    const updatedMedia = await db('media').where({ id: mediaId }).first();
    
    // Parse cast, genres, and physical_format back to arrays for response
    if (updatedMedia.cast) {
      updatedMedia.cast = JSON.parse(updatedMedia.cast);
    }
    if (updatedMedia.genres) {
      updatedMedia.genres = JSON.parse(updatedMedia.genres);
    }
    if (updatedMedia.physical_format) {
      updatedMedia.physical_format = JSON.parse(updatedMedia.physical_format);
    }

    res.json(updatedMedia);
  } catch (error) {
    console.error('Error updating media from TMDB:', error);
    res.status(500).json({ error: 'Failed to update media from TMDB' });
  }
});

/**
 * POST /api/media/bulk-metadata
 * Start bulk metadata operation (protected)
 */
router.post('/bulk-metadata', authMiddleware, async (req: Request, res: Response) => {
  try {
    // First, count total movies with tmdb_id
    const totalWithTmdbId = await db('media').whereNotNull('tmdb_id').count('id as count').first();
    console.log(`[BulkMetadata] Total movies with tmdb_id: ${totalWithTmdbId?.count || 0}`);

    // Find all movies with empty metadata fields that have tmdb_id
    // A movie matches if ANY of these fields are missing/empty
    const movies = await db('media')
      .whereNotNull('tmdb_id')
      .where(function() {
        this.whereNull('synopsis')
          .orWhere('synopsis', '')
          .orWhereNull('director')
          .orWhere('director', '')
          .orWhereNull('cast')
          .orWhere('cast', '')
          .orWhere('cast', '[]')
          .orWhereNull('cover_art_url')
          .orWhere('cover_art_url', '')
          .orWhereNull('release_date')
          .orWhereNull('genres')
          .orWhere('genres', '')
          .orWhere('genres', '[]');
      });

    console.log(`[BulkMetadata] Found ${movies.length} movies with missing metadata`);

    // Debug: Check a sample movie to see what the data looks like
    if (movies.length === 0 && totalWithTmdbId && parseInt(totalWithTmdbId.count as string) > 0) {
      const sampleMovie = await db('media').whereNotNull('tmdb_id').first();
      if (sampleMovie) {
        console.log('[BulkMetadata] Sample movie data:', {
          id: sampleMovie.id,
          title: sampleMovie.title,
          synopsis: sampleMovie.synopsis ? 'has value' : 'null/empty',
          director: sampleMovie.director ? 'has value' : 'null/empty',
          cast: sampleMovie.cast ? `has value (${sampleMovie.cast.substring(0, 50)}...)` : 'null/empty',
          cover_art_url: sampleMovie.cover_art_url ? 'has value' : 'null/empty',
          release_date: sampleMovie.release_date ? 'has value' : 'null/empty',
          genres: sampleMovie.genres ? `has value (${sampleMovie.genres.substring(0, 50)}...)` : 'null/empty',
        });
      }
    }

    if (movies.length === 0) {
      console.log('[BulkMetadata] No movies found with missing metadata');
      return res.status(200).json({ 
        message: 'No movies found with missing metadata. All movies appear to have complete metadata.',
        jobId: null,
        total: 0,
        totalWithTmdbId: totalWithTmdbId?.count || 0
      });
    }

    // Generate job ID
    const jobId = `bulk-metadata-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create job
    const { jobTracker } = await import('../services/job-tracker.service');
    jobTracker.createJob(jobId, movies.length);

    // Start processing in background (don't await)
    processBulkMetadata(jobId, movies).catch((error) => {
      console.error('Bulk metadata operation failed:', error);
      jobTracker.updateJob(jobId, {
        status: 'failed',
        endTime: Date.now(),
      });
    });

    res.json({ jobId, total: movies.length });
  } catch (error) {
    console.error('Error starting bulk metadata operation:', error);
    res.status(500).json({ error: 'Failed to start bulk metadata operation' });
  }
});

/**
 * GET /api/media/bulk-metadata/:jobId
 * Get bulk metadata operation status (protected)
 */
router.get('/bulk-metadata/:jobId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { jobTracker } = await import('../services/job-tracker.service');
    const job = jobTracker.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('Error fetching job status:', error);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

/**
 * GET /api/media/bulk-metadata/:jobId/stream
 * Stream bulk metadata operation progress via SSE (protected)
 */
router.get('/bulk-metadata/:jobId/stream', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { jobTracker } = await import('../services/job-tracker.service');
    const job = jobTracker.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial state
    res.write(`data: ${JSON.stringify(job)}\n\n`);

    // Poll for updates every 500ms
    const interval = setInterval(() => {
      const currentJob = jobTracker.getJob(jobId);
      if (!currentJob) {
        res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
        clearInterval(interval);
        res.end();
        return;
      }

      res.write(`data: ${JSON.stringify(currentJob)}\n\n`);

      // Close connection if job is complete
      if (currentJob.status === 'completed' || currentJob.status === 'failed' || currentJob.status === 'cancelled') {
        clearInterval(interval);
        res.end();
      }
    }, 500);

    // Send heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(interval);
      clearInterval(heartbeat);
      res.end();
    });
  } catch (error) {
    console.error('Error streaming job progress:', error);
    res.status(500).json({ error: 'Failed to stream job progress' });
  }
});

/**
 * Background function to process bulk metadata
 */
async function processBulkMetadata(jobId: string, movies: any[]): Promise<void> {
  const { jobTracker } = await import('../services/job-tracker.service');
  const { tmdbService } = await import('../services/tmdb.service');
  const { db } = await import('../database');

  jobTracker.updateJob(jobId, { status: 'running' });

  // First pass: attempt all movies
  const failedMovies: Array<{ movie: any; error: string }> = [];

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    
    // Check if job was cancelled
    const job = jobTracker.getJob(jobId);
    if (job?.status === 'cancelled') {
      return;
    }

    jobTracker.updateJob(jobId, {
      current: movie.title,
      completed: i,
    });

    try {
      const isTV = movie.media_type === 'tv_season';
      const updateData: any = {};

      if (isTV && movie.tv_show_tmdb_id && movie.season_number != null) {
        const tvDetails = await tmdbService.getTVDetails(movie.tv_show_tmdb_id);
        const seasonDetails = await tmdbService.getTVSeasonDetails(movie.tv_show_tmdb_id, movie.season_number);
        const creators = tmdbService.getCreators(tvDetails.created_by);
        const cast = tmdbService.getTVTopCast(tvDetails.credits, 10);
        const posterUrl = tmdbService.getImageUrl(seasonDetails.poster_path || tvDetails.poster_path);

        if (!movie.synopsis || movie.synopsis === '') {
          updateData.synopsis = seasonDetails.overview || tvDetails.overview || null;
        }
        if (!movie.director || movie.director === '') {
          updateData.director = creators || null;
        }
        if (!movie.cast || movie.cast === '') {
          updateData.cast = cast.length > 0 ? JSON.stringify(cast) : null;
        }
        if (!movie.cover_art_url || movie.cover_art_url === '') {
          updateData.cover_art_url = posterUrl || null;
        }
        if (!movie.release_date) {
          updateData.release_date = seasonDetails.air_date || null;
        }
        if (!movie.genres || movie.genres === '') {
          updateData.genres = tvDetails.genres && tvDetails.genres.length > 0
            ? JSON.stringify(tvDetails.genres) : null;
        }
        if (!movie.episode_count) {
          updateData.episode_count = seasonDetails.episodes?.length || seasonDetails.episode_count || null;
        }
      } else {
        const tmdbData = await tmdbService.getMovieDetails(movie.tmdb_id);
        const director = tmdbService.getDirector(tmdbData.credits);
        const cast = tmdbService.getTopCast(tmdbData.credits, 10);
        const posterUrl = tmdbService.getImageUrl(tmdbData.poster_path);

        if (!movie.synopsis || movie.synopsis === '') {
          updateData.synopsis = tmdbData.overview || null;
        }
        if (!movie.director || movie.director === '') {
          updateData.director = director || null;
        }
        if (!movie.cast || movie.cast === '') {
          updateData.cast = cast.length > 0 ? JSON.stringify(cast) : null;
        }
        if (!movie.cover_art_url || movie.cover_art_url === '') {
          updateData.cover_art_url = posterUrl || null;
        }
        if (!movie.release_date) {
          updateData.release_date = tmdbData.release_date || null;
        }
        if (!movie.genres || movie.genres === '') {
          updateData.genres = tmdbData.genres && tmdbData.genres.length > 0
            ? JSON.stringify(tmdbData.genres) : null;
        }
      }

      // Update the media item
      await db('media').where({ id: movie.id }).update({
        ...updateData,
        updated_at: db.fn.now(),
      });

      jobTracker.updateJob(jobId, {
        successful: (jobTracker.getJob(jobId)?.successful || 0) + 1,
      });
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      failedMovies.push({ movie, error: errorMessage });
      jobTracker.addError(jobId, movie.id, movie.title, errorMessage);
      jobTracker.updateJob(jobId, {
        failed: (jobTracker.getJob(jobId)?.failed || 0) + 1,
      });
    }

    jobTracker.updateJob(jobId, {
      completed: i + 1,
    });
  }

  // Second pass: retry failed items
  if (failedMovies.length > 0) {
    jobTracker.updateJob(jobId, {
      pass: 2,
      current: 'Retrying failed items...',
    });

    for (let i = 0; i < failedMovies.length; i++) {
      const { movie, error: previousError } = failedMovies[i];
      
      // Check if job was cancelled
      const job = jobTracker.getJob(jobId);
      if (job?.status === 'cancelled') {
        return;
      }

      jobTracker.updateJob(jobId, {
        current: `Retrying: ${movie.title}`,
      });

      try {
        const isTV = movie.media_type === 'tv_season';
        const updateData: any = {};

        if (isTV && movie.tv_show_tmdb_id && movie.season_number != null) {
          const tvDetails = await tmdbService.getTVDetails(movie.tv_show_tmdb_id);
          const seasonDetails = await tmdbService.getTVSeasonDetails(movie.tv_show_tmdb_id, movie.season_number);
          const creators = tmdbService.getCreators(tvDetails.created_by);
          const cast = tmdbService.getTVTopCast(tvDetails.credits, 10);
          const posterUrl = tmdbService.getImageUrl(seasonDetails.poster_path || tvDetails.poster_path);

          if (!movie.synopsis || movie.synopsis === '') {
            updateData.synopsis = seasonDetails.overview || tvDetails.overview || null;
          }
          if (!movie.director || movie.director === '') {
            updateData.director = creators || null;
          }
          if (!movie.cast || movie.cast === '') {
            updateData.cast = cast.length > 0 ? JSON.stringify(cast) : null;
          }
          if (!movie.cover_art_url || movie.cover_art_url === '') {
            updateData.cover_art_url = posterUrl || null;
          }
          if (!movie.release_date) {
            updateData.release_date = seasonDetails.air_date || null;
          }
          if (!movie.genres || movie.genres === '') {
            updateData.genres = tvDetails.genres && tvDetails.genres.length > 0
              ? JSON.stringify(tvDetails.genres) : null;
          }
        } else {
          const tmdbData = await tmdbService.getMovieDetails(movie.tmdb_id);
          const director = tmdbService.getDirector(tmdbData.credits);
          const cast = tmdbService.getTopCast(tmdbData.credits, 10);
          const posterUrl = tmdbService.getImageUrl(tmdbData.poster_path);

          if (!movie.synopsis || movie.synopsis === '') {
            updateData.synopsis = tmdbData.overview || null;
          }
          if (!movie.director || movie.director === '') {
            updateData.director = director || null;
          }
          if (!movie.cast || movie.cast === '') {
            updateData.cast = cast.length > 0 ? JSON.stringify(cast) : null;
          }
          if (!movie.cover_art_url || movie.cover_art_url === '') {
            updateData.cover_art_url = posterUrl || null;
          }
          if (!movie.release_date) {
            updateData.release_date = tmdbData.release_date || null;
          }
          if (!movie.genres || movie.genres === '') {
            updateData.genres = tmdbData.genres && tmdbData.genres.length > 0
              ? JSON.stringify(tmdbData.genres) : null;
          }
        }

        await db('media').where({ id: movie.id }).update({
          ...updateData,
          updated_at: db.fn.now(),
        });

        jobTracker.updateJob(jobId, {
          successful: (jobTracker.getJob(jobId)?.successful || 0) + 1,
          failed: (jobTracker.getJob(jobId)?.failed || 0) - 1,
        });

        // Remove from errors list
        const job = jobTracker.getJob(jobId);
        if (job) {
          job.errors = job.errors.filter(e => e.movieId !== movie.id);
        }
      } catch (error: any) {
        // Still failed after retry
        console.error(`Failed to update movie ${movie.id} after retry:`, error);
      }
    }
  }

  // Mark job as completed
  jobTracker.updateJob(jobId, {
    status: 'completed',
    endTime: Date.now(),
    current: undefined,
  });
}

/**
 * POST /api/media/upload
 * Upload custom image for media item (protected)
 */
router.post('/upload', authMiddleware, upload.single('image'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, filename: req.file.filename });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

export default router;

