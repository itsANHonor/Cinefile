import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { format, genres, decades, search } = req.query;

    // Helper function to apply filters to a query (reused from physical-items route)
    const applyFilters = (query: any) => {
      // Filter by format if specified (support multi-select: comma-separated)
      if (format && format !== 'all') {
        const formats = typeof format === 'string' ? format.split(',').map(f => String(f).trim()) : [String(format)];
        if (formats.length > 0) {
          query = query.where(function(this: any) {
            formats.forEach((f: string, index: number) => {
              if (index === 0) {
                this.where('physical_items.physical_format', 'like', `%"${f}"%`);
              } else {
                this.orWhere('physical_items.physical_format', 'like', `%"${f}"%`);
              }
            });
          });
        }
      }

      // Filter by genres if specified (multi-select: comma-separated genre IDs)
      if (genres && typeof genres === 'string') {
        const genreIds = genres.split(',').map(g => parseInt(g.trim())).filter(id => !isNaN(id));
        if (genreIds.length > 0) {
          query = query.where(function(this: any) {
            genreIds.forEach((genreId: number, index: number) => {
              if (index === 0) {
                this.whereRaw(`EXISTS (
                  SELECT 1 FROM physical_item_media
                  JOIN media ON physical_item_media.media_id = media.id
                  WHERE physical_item_media.physical_item_id = physical_items.id
                  AND EXISTS (
                    SELECT 1 FROM json_each(media.genres) 
                    WHERE json_extract(json_each.value, '$.id') = ?
                  )
                )`, [genreId]);
              } else {
                this.orWhereRaw(`EXISTS (
                  SELECT 1 FROM physical_item_media
                  JOIN media ON physical_item_media.media_id = media.id
                  WHERE physical_item_media.physical_item_id = physical_items.id
                  AND EXISTS (
                    SELECT 1 FROM json_each(media.genres) 
                    WHERE json_extract(json_each.value, '$.id') = ?
                  )
                )`, [genreId]);
              }
            });
          });
        }
      }

      // Filter by decades if specified (multi-select: comma-separated decade strings like "1990,2000")
      if (decades && typeof decades === 'string') {
        const decadeStrings = decades.split(',').map(d => d.trim()).filter(d => d.length > 0);
        if (decadeStrings.length > 0) {
          query = query.where(function(this: any) {
            decadeStrings.forEach((decadeStr: string, index: number) => {
              // Extract decade number (e.g., "1990" or "1990s" -> 1990)
              const decadeNum = parseInt(decadeStr.replace(/s$/, ''));
              if (!isNaN(decadeNum)) {
                const startYear = decadeNum;
                const endYear = decadeNum + 9;
                if (index === 0) {
                  this.whereRaw(`EXISTS (
                    SELECT 1 FROM physical_item_media
                    JOIN media ON physical_item_media.media_id = media.id
                    WHERE physical_item_media.physical_item_id = physical_items.id
                    AND media.release_date IS NOT NULL
                    AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) >= ?
                    AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) <= ?
                  )`, [startYear, endYear]);
                } else {
                  this.orWhereRaw(`EXISTS (
                    SELECT 1 FROM physical_item_media
                    JOIN media ON physical_item_media.media_id = media.id
                    WHERE physical_item_media.physical_item_id = physical_items.id
                    AND media.release_date IS NOT NULL
                    AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) >= ?
                    AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) <= ?
                  )`, [startYear, endYear]);
                }
              }
            });
          });
        }
      }

      // Search functionality
      if (search && typeof search === 'string' && search.trim() !== '') {
        const searchTerm = `%${search.trim()}%`;
        query = query.where(function(this: any) {
          this.where('physical_items.name', 'like', searchTerm)
            .orWhere('physical_items.edition_notes', 'like', searchTerm)
            .orWhereRaw(`EXISTS (
              SELECT 1 FROM physical_item_media
              JOIN media ON physical_item_media.media_id = media.id
              WHERE physical_item_media.physical_item_id = physical_items.id
              AND (
                media.title LIKE ? OR
                media.director LIKE ? OR
                media.synopsis LIKE ? OR
                EXISTS (
                  SELECT 1 FROM json_each(media.cast) 
                  WHERE json_each.value LIKE ?
                )
              )
            )`, [searchTerm, searchTerm, searchTerm, searchTerm]);
        });
      }

      return query;
    };

    // Get total physical items with filters applied
    let totalPhysicalItemsQuery = db('physical_items');
    totalPhysicalItemsQuery = applyFilters(totalPhysicalItemsQuery);
    const totalPhysicalItems = await totalPhysicalItemsQuery.count('* as count').first();
    
    // Get total movies with filters applied
    // We need to join with physical_items to apply filters, then count distinct media
    let totalMoviesQuery = db('physical_item_media')
      .leftJoin('physical_items', 'physical_item_media.physical_item_id', 'physical_items.id')
      .leftJoin('media', 'physical_item_media.media_id', 'media.id');
    
    // Apply filters to the joined query
    if (format && format !== 'all') {
      const formats = typeof format === 'string' ? format.split(',').map(f => String(f).trim()) : [String(format)];
      if (formats.length > 0) {
        totalMoviesQuery = totalMoviesQuery.where(function(this: any) {
          formats.forEach((f: string, index: number) => {
            if (index === 0) {
              this.where('physical_items.physical_format', 'like', `%"${f}"%`);
            } else {
              this.orWhere('physical_items.physical_format', 'like', `%"${f}"%`);
            }
          });
        });
      }
    }

    if (genres && typeof genres === 'string') {
      const genreIds = genres.split(',').map(g => parseInt(g.trim())).filter(id => !isNaN(id));
      if (genreIds.length > 0) {
        totalMoviesQuery = totalMoviesQuery.where(function(this: any) {
          genreIds.forEach((genreId: number, index: number) => {
            if (index === 0) {
              this.whereRaw(`EXISTS (
                SELECT 1 FROM json_each(media.genres) 
                WHERE json_extract(json_each.value, '$.id') = ?
              )`, [genreId]);
            } else {
              this.orWhereRaw(`EXISTS (
                SELECT 1 FROM json_each(media.genres) 
                WHERE json_extract(json_each.value, '$.id') = ?
              )`, [genreId]);
            }
          });
        });
      }
    }

    if (decades && typeof decades === 'string') {
      const decadeStrings = decades.split(',').map(d => d.trim()).filter(d => d.length > 0);
      if (decadeStrings.length > 0) {
        totalMoviesQuery = totalMoviesQuery.where(function(this: any) {
          decadeStrings.forEach((decadeStr: string, index: number) => {
            const decadeNum = parseInt(decadeStr.replace(/s$/, ''));
            if (!isNaN(decadeNum)) {
              const startYear = decadeNum;
              const endYear = decadeNum + 9;
              if (index === 0) {
                this.whereRaw(`media.release_date IS NOT NULL
                  AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) >= ?
                  AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) <= ?`, [startYear, endYear]);
              } else {
                this.orWhereRaw(`media.release_date IS NOT NULL
                  AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) >= ?
                  AND CAST(SUBSTR(media.release_date, 1, 4) AS INTEGER) <= ?`, [startYear, endYear]);
              }
            }
          });
        });
      }
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      totalMoviesQuery = totalMoviesQuery.where(function(this: any) {
        this.where('physical_items.name', 'like', searchTerm)
          .orWhere('physical_items.edition_notes', 'like', searchTerm)
          .orWhere('media.title', 'like', searchTerm)
          .orWhere('media.director', 'like', searchTerm)
          .orWhere('media.synopsis', 'like', searchTerm)
          .orWhereRaw(`EXISTS (
            SELECT 1 FROM json_each(media.cast) 
            WHERE json_each.value LIKE ?
          )`, [searchTerm]);
      });
    }

    const totalMovies = await totalMoviesQuery
      .where(function(this: any) {
        this.whereNull('media.media_type').orWhere('media.media_type', 'movie');
      })
      .countDistinct('physical_item_media.media_id as count').first();

    // Count TV seasons (reuse the same base query structure)
    let totalTVSeasonsQuery = db('physical_item_media')
      .leftJoin('physical_items', 'physical_item_media.physical_item_id', 'physical_items.id')
      .leftJoin('media', 'physical_item_media.media_id', 'media.id')
      .where('media.media_type', 'tv_season');

    if (format && format !== 'all') {
      const formats = typeof format === 'string' ? format.split(',').map(f => String(f).trim()) : [String(format)];
      if (formats.length > 0) {
        totalTVSeasonsQuery = totalTVSeasonsQuery.where(function(this: any) {
          formats.forEach((f: string, index: number) => {
            if (index === 0) {
              this.where('physical_items.physical_format', 'like', `%"${f}"%`);
            } else {
              this.orWhere('physical_items.physical_format', 'like', `%"${f}"%`);
            }
          });
        });
      }
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      totalTVSeasonsQuery = totalTVSeasonsQuery.where(function(this: any) {
        this.where('physical_items.name', 'like', searchTerm)
          .orWhere('media.title', 'like', searchTerm)
          .orWhere('media.tv_show_name', 'like', searchTerm);
      });
    }

    const totalTVSeasons = await totalTVSeasonsQuery.countDistinct('physical_item_media.media_id as count').first();
    
    // Count movies by format using SQL aggregation with filters applied
    let formatStatsQuery = db('physical_items')
      .leftJoin('physical_item_media', 'physical_items.id', 'physical_item_media.physical_item_id')
      .leftJoin('media', 'physical_item_media.media_id', 'media.id');
    
    // Apply filters to format stats query
    formatStatsQuery = applyFilters(formatStatsQuery);
    
    const formatStats = await formatStatsQuery
      .select(
        'physical_items.physical_format',
        db.raw('COUNT(DISTINCT physical_item_media.media_id) as movie_count')
      )
      .groupBy('physical_items.id', 'physical_items.physical_format');
    
    const formatCounts: Record<string, number> = {
      '4K UHD': 0,
      'Blu-ray': 0,
      'DVD': 0,
      'LaserDisc': 0,
      'VHS': 0
    };
    
    // Process format statistics (much more efficient than loading all items)
    formatStats.forEach(item => {
      if (item.physical_format) {
        try {
          const formats = JSON.parse(item.physical_format);
          const movieCount = parseInt(item.movie_count as string) || 1;
          
          formats.forEach((format: string) => {
            if (formatCounts[format] !== undefined) {
              formatCounts[format] += movieCount;
            }
          });
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });
    
    // Filter out formats with 0 count
    const activeFormats = Object.entries(formatCounts)
      .filter(([_, count]) => count > 0)
      .reduce((acc, [format, count]) => ({ ...acc, [format]: count }), {});
    
    res.json({
      totalPhysicalItems: parseInt(totalPhysicalItems?.count as string) || 0,
      totalMovies: parseInt(totalMovies?.count as string) || 0,
      totalTVSeasons: parseInt(totalTVSeasons?.count as string) || 0,
      formatCounts: activeFormats
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
