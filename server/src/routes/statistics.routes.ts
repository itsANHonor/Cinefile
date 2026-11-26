import { Router, Request, Response } from 'express';
import { db } from '../database';
import { isRequestAdmin } from '../middleware/auth.middleware';
import {
  applyEditionTagFilter,
  applyVersionTagFilter,
  buildCanonicalEditionTagMap,
  buildCanonicalVersionTagMap,
  parseEditionTags,
} from '../utils/edition-tags.util';
import {
  applyItemActorFilter,
  applyItemDirectorFilter,
  applyMediaActorFilter,
  applyMediaDirectorFilter,
  getCastWorkKey,
  hasDirectorFilter,
} from '../utils/person-filter.util';
import { normalizeCost } from '../utils/identifiers.util';
import { STANDARD_UNIT_MM } from '../constants';

const router = Router();

const CANONICAL_FORMATS = [
  '4K UHD',
  '3D Blu-ray',
  'Blu-ray',
  'DVD',
  'Digital-UHD',
  'Digital-HD',
  'Digital-SD',
  'LaserDisc',
  'VHS',
];

router.get('/', async (req: Request, res: Response) => {
  try {
    const { format, genres, decades, editions, edition, versions, version, series, director, actor, search, media_type, archived } = req.query;

    const isAdmin = isRequestAdmin(req);
    const showArchived = isAdmin && (archived === 'true' || archived === '1');

    const applyArchivedFilter = (query: any) => {
      if (showArchived) {
        return query.where('physical_items.archived', 1);
      }
      return query.where(function(this: any) {
        this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
      });
    };

    // Helper function to apply filters to a query (reused from physical-items route)
    const applyFilters = (query: any) => {
      query = applyArchivedFilter(query);

      // Filter by media_type if specified (include physical item if ANY linked media matches)
      if (media_type && typeof media_type === 'string' && media_type !== 'all') {
        if (media_type === 'movie') {
          query = query.whereRaw(`EXISTS (
            SELECT 1 FROM physical_item_media
            JOIN media ON physical_item_media.media_id = media.id
            WHERE physical_item_media.physical_item_id = physical_items.id
            AND (media.media_type = 'movie' OR media.media_type IS NULL)
          )`);
        } else {
          query = query.whereRaw(`EXISTS (
            SELECT 1 FROM physical_item_media
            JOIN media ON physical_item_media.media_id = media.id
            WHERE physical_item_media.physical_item_id = physical_items.id
            AND media.media_type = ?
          )`, [media_type]);
        }
      }

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

      if (editions || edition) {
        query = applyEditionTagFilter(query, editions || edition);
      }

      if (versions || version) {
        query = applyVersionTagFilter(query, versions || version);
      }

      if (director) {
        query = applyItemDirectorFilter(query, director);
      }

      if (actor) {
        query = applyItemActorFilter(query, actor);
      }

      // Filter by series if specified (multi-select: comma-separated series IDs)
      if (series && typeof series === 'string') {
        const seriesIds = series.split(',').map(s => parseInt(s.trim(), 10)).filter(id => !isNaN(id));
        if (seriesIds.length > 0) {
          query = query.where(function(this: any) {
            seriesIds.forEach((seriesId: number, index: number) => {
              const clause = `(
                physical_items.sort_series_id = ?
                OR physical_items.primary_series_id = ?
                OR EXISTS (
                  SELECT 1 FROM physical_item_media
                  JOIN media ON physical_item_media.media_id = media.id
                  LEFT JOIN movie_series ON movie_series.media_id = media.id
                  WHERE physical_item_media.physical_item_id = physical_items.id
                  AND (movie_series.series_id = ? OR media.primary_series_id = ?)
                )
              )`;
              const bindings = [seriesId, seriesId, seriesId, seriesId];
              if (index === 0) {
                this.whereRaw(clause, bindings);
              } else {
                this.orWhereRaw(clause, bindings);
              }
            });
          });
        }
      }

      // Search functionality
      if (search && typeof search === 'string' && search.trim() !== '') {
        const searchTerm = `%${search.trim()}%`;
        const compactBarcodeTerm = `%${search.trim().replace(/[\s-]+/g, '')}%`;
        query = query.where(function(this: any) {
          this.where('physical_items.name', 'like', searchTerm)
            .orWhere('physical_items.edition_notes', 'like', searchTerm)
            .orWhere('physical_items.barcode', 'like', compactBarcodeTerm)
            .orWhere('physical_items.asin', 'like', searchTerm)
            .orWhereRaw(`EXISTS (
              SELECT 1 FROM physical_item_media
              JOIN media ON physical_item_media.media_id = media.id
              WHERE physical_item_media.physical_item_id = physical_items.id
              AND (
                media.title LIKE ? OR
                media.original_title LIKE ? OR
                media.tv_show_name LIKE ? OR
                media.director LIKE ? OR
                media.synopsis LIKE ? OR
                physical_item_media.version_notes LIKE ? OR
                EXISTS (
                  SELECT 1 FROM json_each(media.cast) 
                  WHERE json_each.value LIKE ?
                )
              )
            )`, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);
        });
      }

      return query;
    };

    // Get total physical items with filters applied
    let totalPhysicalItemsQuery = db('physical_items');
    totalPhysicalItemsQuery = applyFilters(totalPhysicalItemsQuery);
    const totalPhysicalItems = await totalPhysicalItemsQuery
      .select(
        db.raw('COUNT(*) as count'),
        db.raw('SUM(CASE WHEN physical_items.cost IS NOT NULL THEN physical_items.cost ELSE 0 END) as total_cost'),
        db.raw('COUNT(CASE WHEN physical_items.cost IS NOT NULL THEN 1 END) as items_with_cost')
      )
      .first();

    const costPublicRow = !isAdmin
      ? await db('settings').where({ key: 'cost_public' }).first()
      : null;
    const canSeeCost = isAdmin || costPublicRow?.value === 'true';
    
    // Get total movies with filters applied
    // We need to join with physical_items to apply filters, then count distinct media
    let totalMoviesQuery = db('physical_item_media')
      .leftJoin('physical_items', 'physical_item_media.physical_item_id', 'physical_items.id')
      .leftJoin('media', 'physical_item_media.media_id', 'media.id');
    totalMoviesQuery = applyArchivedFilter(totalMoviesQuery);
    
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

    if (editions || edition) {
      totalMoviesQuery = applyEditionTagFilter(totalMoviesQuery, editions || edition);
    }

    if (versions || version) {
      totalMoviesQuery = applyVersionTagFilter(totalMoviesQuery, versions || version);
    }

    if (director) {
      totalMoviesQuery = applyMediaDirectorFilter(totalMoviesQuery, director);
    }

    if (actor) {
      totalMoviesQuery = applyMediaActorFilter(totalMoviesQuery, actor);
    }

    if (series && typeof series === 'string') {
      const seriesIds = series.split(',').map(s => parseInt(s.trim(), 10)).filter(id => !isNaN(id));
      if (seriesIds.length > 0) {
        totalMoviesQuery = totalMoviesQuery.where(function(this: any) {
          seriesIds.forEach((seriesId: number, index: number) => {
            const clause = `(
              physical_items.sort_series_id = ?
              OR physical_items.primary_series_id = ?
              OR media.primary_series_id = ?
              OR EXISTS (
                SELECT 1 FROM movie_series
                WHERE movie_series.media_id = media.id
                AND movie_series.series_id = ?
              )
            )`;
            const bindings = [seriesId, seriesId, seriesId, seriesId];
            if (index === 0) {
              this.whereRaw(clause, bindings);
            } else {
              this.orWhereRaw(clause, bindings);
            }
          });
        });
      }
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      const compactBarcodeTerm = `%${search.trim().replace(/[\s-]+/g, '')}%`;
      totalMoviesQuery = totalMoviesQuery.where(function(this: any) {
        this.where('physical_items.name', 'like', searchTerm)
          .orWhere('physical_items.edition_notes', 'like', searchTerm)
          .orWhere('physical_items.barcode', 'like', compactBarcodeTerm)
          .orWhere('physical_items.asin', 'like', searchTerm)
          .orWhere('physical_item_media.version_notes', 'like', searchTerm)
          .orWhere('media.title', 'like', searchTerm)
          .orWhere('media.original_title', 'like', searchTerm)
          .orWhere('media.director', 'like', searchTerm)
          .orWhere('media.synopsis', 'like', searchTerm)
          .orWhereRaw(`EXISTS (
            SELECT 1 FROM json_each(media.cast) 
            WHERE json_each.value LIKE ?
          )`, [searchTerm]);
      });
    }

    const totalMovies = media_type === 'tv_season'
      ? { count: 0 }
      : await totalMoviesQuery
          .where(function(this: any) {
            this.whereNull('media.media_type').orWhere('media.media_type', 'movie');
          })
          .countDistinct('physical_item_media.media_id as count').first();

    // Count TV seasons (reuse the same base query structure)
    let totalTVSeasonsQuery = db('physical_item_media')
      .leftJoin('physical_items', 'physical_item_media.physical_item_id', 'physical_items.id')
      .leftJoin('media', 'physical_item_media.media_id', 'media.id')
      .where('media.media_type', 'tv_season');
    totalTVSeasonsQuery = applyArchivedFilter(totalTVSeasonsQuery);

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

    if (genres && typeof genres === 'string') {
      const genreIds = genres.split(',').map(g => parseInt(g.trim())).filter(id => !isNaN(id));
      if (genreIds.length > 0) {
        totalTVSeasonsQuery = totalTVSeasonsQuery.where(function(this: any) {
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
        totalTVSeasonsQuery = totalTVSeasonsQuery.where(function(this: any) {
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

    if (editions || edition) {
      totalTVSeasonsQuery = applyEditionTagFilter(totalTVSeasonsQuery, editions || edition);
    }

    if (versions || version) {
      totalTVSeasonsQuery = applyVersionTagFilter(totalTVSeasonsQuery, versions || version);
    }

    if (actor) {
      totalTVSeasonsQuery = applyMediaActorFilter(totalTVSeasonsQuery, actor);
    }

    if (series && typeof series === 'string') {
      const seriesIds = series.split(',').map(s => parseInt(s.trim(), 10)).filter(id => !isNaN(id));
      if (seriesIds.length > 0) {
        totalTVSeasonsQuery = totalTVSeasonsQuery.where(function(this: any) {
          seriesIds.forEach((seriesId: number, index: number) => {
            const clause = `(
              physical_items.sort_series_id = ?
              OR physical_items.primary_series_id = ?
              OR media.primary_series_id = ?
              OR EXISTS (
                SELECT 1 FROM movie_series
                WHERE movie_series.media_id = media.id
                AND movie_series.series_id = ?
              )
            )`;
            const bindings = [seriesId, seriesId, seriesId, seriesId];
            if (index === 0) {
              this.whereRaw(clause, bindings);
            } else {
              this.orWhereRaw(clause, bindings);
            }
          });
        });
      }
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      const compactBarcodeTerm = `%${search.trim().replace(/[\s-]+/g, '')}%`;
      totalTVSeasonsQuery = totalTVSeasonsQuery.where(function(this: any) {
        this.where('physical_items.name', 'like', searchTerm)
          .orWhere('physical_items.edition_notes', 'like', searchTerm)
          .orWhere('physical_items.barcode', 'like', compactBarcodeTerm)
          .orWhere('physical_items.asin', 'like', searchTerm)
          .orWhere('physical_item_media.version_notes', 'like', searchTerm)
          .orWhere('media.title', 'like', searchTerm)
          .orWhere('media.original_title', 'like', searchTerm)
          .orWhere('media.tv_show_name', 'like', searchTerm)
          .orWhere('media.director', 'like', searchTerm)
          .orWhere('media.synopsis', 'like', searchTerm)
          .orWhereRaw(`EXISTS (
            SELECT 1 FROM json_each(media.cast) 
            WHERE json_each.value LIKE ?
          )`, [searchTerm]);
      });
    }

    const totalTVSeasons = media_type === 'movie' || hasDirectorFilter(director)
      ? { count: 0 }
      : await totalTVSeasonsQuery.countDistinct('physical_item_media.media_id as count').first();
    
    // Count movies by format using SQL aggregation with filters applied
    let formatStatsQuery = db('physical_items')
      .leftJoin('physical_item_media', 'physical_items.id', 'physical_item_media.physical_item_id')
      .leftJoin('media', 'physical_item_media.media_id', 'media.id');
    
    // Apply filters to format stats query
    formatStatsQuery = applyFilters(formatStatsQuery);
    if (director) {
      formatStatsQuery = applyMediaDirectorFilter(formatStatsQuery, director);
    }
    if (actor) {
      formatStatsQuery = applyMediaActorFilter(formatStatsQuery, actor);
    }
    
    const formatStats = await formatStatsQuery
      .select(
        'physical_items.physical_format',
        db.raw('COUNT(DISTINCT physical_item_media.media_id) as movie_count')
      )
      .groupBy('physical_items.id', 'physical_items.physical_format');
    
    const formatCounts: Record<string, number> = {};
    for (const fmt of CANONICAL_FORMATS) {
      formatCounts[fmt] = 0;
    }
    
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
    
    const totalCostNum = Math.round((Number(totalPhysicalItems?.total_cost) || 0) * 100) / 100;
    const itemsWithCostNum = parseInt(totalPhysicalItems?.items_with_cost as string, 10) || 0;

    res.json({
      totalPhysicalItems: parseInt(totalPhysicalItems?.count as string) || 0,
      totalMovies: parseInt(totalMovies?.count as string) || 0,
      totalTVSeasons: parseInt(totalTVSeasons?.count as string) || 0,
      formatCounts: activeFormats,
      ...(canSeeCost ? { totalCost: totalCostNum, itemsWithCost: itemsWithCostNum } : {}),
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

router.get('/facets', async (req: Request, res: Response) => {
  try {
    // Full-collection genre list with item counts
    const genreRows = await db.raw(`
      SELECT genre_id, genre_name, COUNT(DISTINCT item_id) AS count
      FROM (
        SELECT
          json_extract(je.value, '$.id') AS genre_id,
          json_extract(je.value, '$.name') AS genre_name,
          pi.id AS item_id
        FROM physical_items pi
        JOIN physical_item_media pim ON pim.physical_item_id = pi.id
        JOIN media m ON m.id = pim.media_id,
        json_each(m.genres) AS je
        WHERE m.genres IS NOT NULL AND m.genres <> ''
        AND (pi.archived = 0 OR pi.archived IS NULL)
      )
      WHERE genre_id IS NOT NULL AND genre_name IS NOT NULL
      GROUP BY genre_id, genre_name
      ORDER BY genre_name ASC
    `);

    const genres = (genreRows || []).map((row: any) => ({
      id: Number(row.genre_id),
      name: String(row.genre_name),
      count: Number(row.count),
    }));

    // Full-collection decade list with item counts
    const decadeRows = await db.raw(`
      SELECT decade_start, COUNT(DISTINCT item_id) AS count
      FROM (
        SELECT
          (CAST(SUBSTR(m.release_date, 1, 4) AS INTEGER) / 10 * 10) AS decade_start,
          pi.id AS item_id
        FROM physical_items pi
        JOIN physical_item_media pim ON pim.physical_item_id = pi.id
        JOIN media m ON m.id = pim.media_id
        WHERE m.release_date IS NOT NULL AND m.release_date <> ''
        AND (pi.archived = 0 OR pi.archived IS NULL)
      )
      WHERE decade_start IS NOT NULL AND decade_start > 0
      GROUP BY decade_start
      ORDER BY decade_start ASC
    `);

    const decades = (decadeRows || []).map((row: any) => ({
      decade: String(row.decade_start),
      count: Number(row.count),
    }));

    // Format counts for the canonical format list
    const formatOrder = CANONICAL_FORMATS;

    const formatCounts: Record<string, number> = {};
    for (const format of formatOrder) {
      formatCounts[format] = 0;
    }

    const formatStats = await db('physical_items')
      .leftJoin('physical_item_media', 'physical_items.id', 'physical_item_media.physical_item_id')
      .leftJoin('media', 'physical_item_media.media_id', 'media.id')
      .where(function() {
        this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
      })
      .select('physical_items.physical_format')
      .countDistinct('physical_item_media.media_id as movie_count')
      .groupBy('physical_items.id', 'physical_items.physical_format');

    for (const item of formatStats) {
      if (item.physical_format) {
        try {
          const formats = JSON.parse(String(item.physical_format));
          const movieCount = Number(item.movie_count) || 1;
          for (const format of formats) {
            if (format in formatCounts) {
              formatCounts[format] += movieCount;
            }
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    const formats = formatOrder.map((format) => ({
      format,
      count: formatCounts[format],
    }));

    // Full-collection edition tags list with item counts
    const editionRows = await db('physical_items')
      .where(function() {
        this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
      })
      .whereNotNull('edition_notes')
      .andWhere('edition_notes', '<>', '')
      .select('id', 'edition_notes');

    const canonicalTagMap = buildCanonicalEditionTagMap(editionRows);
    const editionCounts = new Map<string, { tag: string; count: number }>();

    for (const row of editionRows) {
      const tags = parseEditionTags(row.edition_notes);
      for (const rawTag of tags) {
        const key = rawTag.toLowerCase();
        const canonicalTag = canonicalTagMap.get(key) ?? rawTag;
        const existing = editionCounts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          editionCounts.set(key, { tag: canonicalTag, count: 1 });
        }
      }
    }

    const editions = Array.from(editionCounts.values()).sort(
      (a, b) => b.count - a.count || a.tag.localeCompare(b.tag)
    );

    // Full-collection movie version tags list with item counts
    const versionRows = await db('physical_item_media as pim')
      .join('physical_items as pi', 'pim.physical_item_id', 'pi.id')
      .where(function() {
        this.where('pi.archived', 0).orWhereNull('pi.archived');
      })
      .whereNotNull('pim.version_notes')
      .andWhere('pim.version_notes', '<>', '')
      .select('pi.id as item_id', 'pim.version_notes');

    const canonicalVersionMap = buildCanonicalVersionTagMap(versionRows);
    const versionItemSets = new Map<string, { tag: string; itemIds: Set<number> }>();

    for (const row of versionRows) {
      const tags = parseEditionTags(row.version_notes);
      for (const rawTag of tags) {
        const key = rawTag.toLowerCase();
        const canonicalTag = canonicalVersionMap.get(key) ?? rawTag;
        if (!versionItemSets.has(key)) {
          versionItemSets.set(key, { tag: canonicalTag, itemIds: new Set() });
        }
        versionItemSets.get(key)!.itemIds.add(Number(row.item_id));
      }
    }

    const versions = Array.from(versionItemSets.values())
      .map((entry) => ({
        tag: entry.tag,
        count: entry.itemIds.size,
      }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    // Full-collection series list with item counts
    const seriesRows = await db.raw(`
      SELECT s.id, s.name, s.sort_name, COUNT(DISTINCT item_series.item_id) AS count
      FROM (
        SELECT ms.series_id AS series_id, pi.id AS item_id
        FROM physical_items pi
        JOIN physical_item_media pim ON pim.physical_item_id = pi.id
        JOIN movie_series ms ON ms.media_id = pim.media_id
        WHERE (pi.archived = 0 OR pi.archived IS NULL)
        UNION
        SELECT m.primary_series_id AS series_id, pi.id AS item_id
        FROM physical_items pi
        JOIN physical_item_media pim ON pim.physical_item_id = pi.id
        JOIN media m ON m.id = pim.media_id
        WHERE m.primary_series_id IS NOT NULL
        AND (pi.archived = 0 OR pi.archived IS NULL)
        UNION
        SELECT COALESCE(pi.sort_series_id, pi.primary_series_id) AS series_id, pi.id AS item_id
        FROM physical_items pi
        WHERE COALESCE(pi.sort_series_id, pi.primary_series_id) IS NOT NULL
        AND (pi.archived = 0 OR pi.archived IS NULL)
      ) item_series
      JOIN series s ON s.id = item_series.series_id
      GROUP BY s.id, s.name, s.sort_name
      ORDER BY COALESCE(s.sort_name, s.name) ASC
    `);

    const series = (seriesRows || []).map((row: any) => ({
      id: Number(row.id),
      name: String(row.name),
      count: Number(row.count),
    }));

    res.json({
      genres,
      decades,
      formats,
      editions,
      versions,
      series,
    });
  } catch (error) {
    console.error('Error fetching facets:', error);
    res.status(500).json({ error: 'Failed to fetch facets' });
  }
});

/**
 * Helper: Safely parse a JSON array string.
 */
function parseJsonArray<T = any>(raw: unknown): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Helper: Extract a readable store name from a store_link entry.
 */
function normalizeStoreName(link: { label?: string; url?: string }): string | null {
  if (link.label && typeof link.label === 'string' && link.label.trim()) {
    return link.label.trim();
  }
  if (link.url && typeof link.url === 'string') {
    try {
      const hostname = new URL(link.url).hostname.replace(/^www\./i, '').toLowerCase();
      if (hostname.includes('amazon')) return 'Amazon';
      if (hostname.includes('gruv')) return 'GRUV';
      if (hostname.includes('criterion')) return 'Criterion';
      if (hostname.includes('shoutfactory')) return 'Shout! Factory';
      if (hostname.includes('arrowfilms') || hostname.includes('arrowvideo')) return 'Arrow Video';
      if (hostname.includes('vinegarsyndrome')) return 'Vinegar Syndrome';
      if (hostname.includes('kino')) return 'Kino Lorber';
      if (hostname.includes('bestbuy')) return 'Best Buy';
      if (hostname.includes('target')) return 'Target';
      if (hostname.includes('walmart')) return 'Walmart';
      if (hostname.includes('ebay')) return 'eBay';
      if (hostname.includes('orbitdvd')) return 'Orbit DVD';
      if (hostname.includes('diabolikdvd')) return 'DiabolikDVD';
      return hostname;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Helper: Resolve and cache TMDb person profile image URLs idempotently in `person_profiles`.
 */
let personProfilesTableChecked = false;
async function ensurePersonProfilesTable(): Promise<void> {
  if (personProfilesTableChecked) return;
  try {
    const hasTable = await db.schema.hasTable('person_profiles');
    if (!hasTable) {
      await db.schema.createTable('person_profiles', (table) => {
        table.increments('id').primary();
        table.string('name_key').notNullable().unique();
        table.string('name').notNullable();
        table.integer('tmdb_person_id').nullable();
        table.string('profile_url').nullable();
        table.timestamps(true, true);
        table.index('name_key');
      });
    }
    personProfilesTableChecked = true;
  } catch (err) {
    console.warn('Could not verify person_profiles table:', err);
  }
}

async function resolvePersonProfiles(names: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const uniqueNames = Array.from(
    new Map(
      names
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => [n.toLowerCase(), n])
    ).entries()
  );

  if (uniqueNames.length === 0) {
    return result;
  }

  try {
    await ensurePersonProfilesTable();
    const keys = uniqueNames.map(([key]) => key);
    const cachedRows = await db('person_profiles')
      .whereIn('name_key', keys)
      .select('name_key', 'profile_url');

    for (const row of cachedRows) {
      result.set(row.name_key, row.profile_url || null);
    }

    const missing = uniqueNames.filter(([key]) => !result.has(key));
    if (missing.length > 0) {
      const { tmdbService } = await import('../services/tmdb.service');
      if (await tmdbService.isConfigured()) {
        await Promise.allSettled(
          missing.map(async ([key, displayName]) => {
            const person = await tmdbService.searchPerson(displayName);
            const profileUrl = person?.profileUrl ?? null;
            result.set(key, profileUrl);
            try {
              await db('person_profiles')
                .insert({
                  name_key: key,
                  name: displayName,
                  tmdb_person_id: person?.id ?? null,
                  profile_url: profileUrl,
                  updated_at: db.fn.now(),
                })
                .onConflict('name_key')
                .merge({
                  name: displayName,
                  tmdb_person_id: person?.id ?? null,
                  profile_url: profileUrl,
                  updated_at: db.fn.now(),
                });
            } catch (dbErr) {
              console.warn(`Failed to cache person profile for "${displayName}":`, dbErr);
            }
          })
        );
      }
    }
  } catch (err) {
    console.warn('Failed to resolve person profiles:', err);
  }

  return result;
}

/**
 * GET /api/statistics/dashboard
 * Publicly accessible aggregated collection analytics for the Statistics page.
 * Single-request payload designed to respect the read-only server rate limiter
 * and never expose private item notes.
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const isAdmin = isRequestAdmin(req);
    const costPublicRow = !isAdmin
      ? await db('settings').where({ key: 'cost_public' }).first()
      : null;
    const canSeeCost = isAdmin || costPublicRow?.value === 'true';

    // 1. Load physical items (only public/statistical columns — never private notes or archived items)
    const physicalItems = await db('physical_items')
      .where(function() {
        this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
      })
      .select(
        'id',
        'name',
        'physical_format',
        'edition_notes',
        'purchase_date',
        'cost',
        'store_links',
        'sort_series_id',
        'primary_series_id',
        'thickness_units',
        'width_mm',
        'spine_color',
        'created_at'
      );

    // 2. Load physical_item_media joined with media
    const itemMediaRows = await db('physical_item_media as pim')
      .join('media as m', 'pim.media_id', 'm.id')
      .join('physical_items as pi', 'pim.physical_item_id', 'pi.id')
      .where(function() {
        this.where('pi.archived', 0).orWhereNull('pi.archived');
      })
      .select(
        'pim.physical_item_id',
        'pim.media_id',
        'pim.formats as link_formats',
        'pi.physical_format as item_formats',
        'm.title',
        'm.cover_art_url',
        'm.release_date',
        'm.director',
        'm.cast',
        'm.genres',
        'm.media_type',
        'm.tv_show_tmdb_id',
        'm.tv_show_name',
        'm.season_number',
        'm.episode_count',
        'm.primary_series_id as media_primary_series_id'
      );

    const totalPhysicalItems = physicalItems.length;

    // Distinct media tracking
    const uniqueMediaMap = new Map<number, (typeof itemMediaRows)[0]>();
    const mediaIdsByItemId = new Map<number, Set<number>>();
    const itemsByMediaId = new Map<number, Set<number>>();
    const formatsByMediaId = new Map<number, Set<string>>();

    for (const row of itemMediaRows) {
      if (!uniqueMediaMap.has(row.media_id)) {
        uniqueMediaMap.set(row.media_id, row);
      }

      if (!mediaIdsByItemId.has(row.physical_item_id)) {
        mediaIdsByItemId.set(row.physical_item_id, new Set());
      }
      mediaIdsByItemId.get(row.physical_item_id)!.add(row.media_id);

      if (!itemsByMediaId.has(row.media_id)) {
        itemsByMediaId.set(row.media_id, new Set());
      }
      itemsByMediaId.get(row.media_id)!.add(row.physical_item_id);

      if (!formatsByMediaId.has(row.media_id)) {
        formatsByMediaId.set(row.media_id, new Set());
      }
      const linkFormats = parseJsonArray<string>(row.link_formats);
      const itemFormats = parseJsonArray<string>(row.item_formats);
      const effectiveFormats = linkFormats.length > 0 ? linkFormats : itemFormats;
      for (const fmt of effectiveFormats) {
        formatsByMediaId.get(row.media_id)!.add(fmt);
      }
    }

    let totalMovies = 0;
    let totalTVSeasons = 0;
    let totalEpisodes = 0;
    const tvShowKeys = new Set<string>();

    for (const media of uniqueMediaMap.values()) {
      if (media.media_type === 'tv_season') {
        totalTVSeasons += 1;
        totalEpisodes += Number(media.episode_count) || 0;
        const showKey = media.tv_show_tmdb_id
          ? `tmdb:${media.tv_show_tmdb_id}`
          : `name:${(media.tv_show_name || media.title || '').trim().toLowerCase()}`;
        tvShowKeys.add(showKey);
      } else {
        totalMovies += 1;
      }
    }

    let multiTitleItemsCount = 0;
    for (const mediaSet of mediaIdsByItemId.values()) {
      if (mediaSet.size > 1) {
        multiTitleItemsCount += 1;
      }
    }

    // 3. Format breakdown (both by Physical Items and by Titles)
    const formatItemCounts: Record<string, number> = {};
    const formatTitleCounts: Record<string, number> = {};
    for (const fmt of CANONICAL_FORMATS) {
      formatItemCounts[fmt] = 0;
      formatTitleCounts[fmt] = 0;
    }

    for (const item of physicalItems) {
      const formats = parseJsonArray<string>(item.physical_format);
      const linkedCount = mediaIdsByItemId.get(item.id)?.size || 1;
      const seenInItem = new Set<string>();
      for (const fmt of formats) {
        if (fmt in formatItemCounts && !seenInItem.has(fmt)) {
          seenInItem.add(fmt);
          formatItemCounts[fmt] += 1;
          formatTitleCounts[fmt] += linkedCount;
        }
      }
    }

    const totalFormatTitles = Object.values(formatTitleCounts).reduce((a, b) => a + b, 0);

    const formats = CANONICAL_FORMATS.map((format) => ({
      format,
      itemCount: formatItemCounts[format],
      titleCount: formatTitleCounts[format],
      itemPercentage:
        totalPhysicalItems > 0
          ? Math.round((formatItemCounts[format] / totalPhysicalItems) * 1000) / 10
          : 0,
      titlePercentage:
        totalFormatTitles > 0
          ? Math.round((formatTitleCounts[format] / totalFormatTitles) * 1000) / 10
          : 0,
    })).filter((f) => f.itemCount > 0 || f.titleCount > 0);

    // 3b. Edition Tags breakdown (by Physical Items and by Titles)
    const canonicalEditionMap = buildCanonicalEditionTagMap(physicalItems);
    const editionBuckets = new Map<
      string,
      { tag: string; itemIds: Set<number>; mediaIds: Set<number> }
    >();
    let itemsWithEditionTags = 0;

    for (const item of physicalItems) {
      const tags = parseEditionTags(item.edition_notes);
      if (tags.length > 0) {
        itemsWithEditionTags += 1;
      }
      const itemMediaIds = mediaIdsByItemId.get(item.id) || new Set<number>();
      for (const rawTag of tags) {
        const key = rawTag.toLowerCase();
        const canonicalTag = canonicalEditionMap.get(key) ?? rawTag;
        if (!editionBuckets.has(key)) {
          editionBuckets.set(key, {
            tag: canonicalTag,
            itemIds: new Set(),
            mediaIds: new Set(),
          });
        }
        const bucket = editionBuckets.get(key)!;
        bucket.itemIds.add(item.id);
        for (const mId of itemMediaIds) {
          bucket.mediaIds.add(mId);
        }
      }
    }

    const totalDistinctMediaCount = uniqueMediaMap.size;
    const editions = Array.from(editionBuckets.values())
      .map((b) => {
        const itemCount = b.itemIds.size;
        const titleCount = b.mediaIds.size || itemCount;
        return {
          tag: b.tag,
          itemCount,
          titleCount,
          itemPercentage:
            totalPhysicalItems > 0
              ? Math.round((itemCount / totalPhysicalItems) * 1000) / 10
              : 0,
          titlePercentage:
            totalDistinctMediaCount > 0
              ? Math.round((titleCount / totalDistinctMediaCount) * 1000) / 10
              : 0,
        };
      })
      .sort((a, b) => b.itemCount - a.itemCount || a.tag.localeCompare(b.tag));

    // 4. Decades & Release Extremes + Genres + Directors + Cast
    const decadeBuckets = new Map<
      number,
      { movieIds: Set<number>; tvSeasonIds: Set<number>; itemIds: Set<number> }
    >();
    let oldestRelease: { title: string; year: number; releaseDate: string } | null = null;
    let newestRelease: { title: string; year: number; releaseDate: string } | null = null;

    const genreMap = new Map<
      number,
      { id: number; name: string; itemIds: Set<number>; mediaIds: Set<number> }
    >();
    interface PersonWorkPreview {
      id: number;
      title: string;
      year: number | null;
      coverArtUrl: string | null;
      seasonNumber?: number | null;
    }

    const directorMap = new Map<string, Set<number>>();
    const castMap = new Map<string, Map<string, PersonWorkPreview>>();

    const parseValidYear = (releaseDate: unknown): number | null => {
      if (!releaseDate || typeof releaseDate !== 'string') return null;
      const parsed = parseInt(releaseDate.substring(0, 4), 10);
      return !isNaN(parsed) && parsed >= 1880 && parsed <= 2100 ? parsed : null;
    };

    for (const row of itemMediaRows) {
      // Release year & decade
      if (row.release_date && typeof row.release_date === 'string') {
        const year = parseInt(row.release_date.substring(0, 4), 10);
        if (!isNaN(year) && year >= 1880 && year <= 2100) {
          const decadeStart = Math.floor(year / 10) * 10;
          if (!decadeBuckets.has(decadeStart)) {
            decadeBuckets.set(decadeStart, {
              movieIds: new Set(),
              tvSeasonIds: new Set(),
              itemIds: new Set(),
            });
          }
          const bucket = decadeBuckets.get(decadeStart)!;
          bucket.itemIds.add(row.physical_item_id);
          if (row.media_type === 'tv_season') {
            bucket.tvSeasonIds.add(row.media_id);
          } else {
            bucket.movieIds.add(row.media_id);
          }

          if (!oldestRelease || row.release_date < oldestRelease.releaseDate) {
            oldestRelease = { title: row.title, year, releaseDate: row.release_date };
          }
          if (!newestRelease || row.release_date > newestRelease.releaseDate) {
            newestRelease = { title: row.title, year, releaseDate: row.release_date };
          }
        }
      }

      // Genres
      const mediaGenres = parseJsonArray<{ id?: number; name?: string }>(row.genres);
      for (const g of mediaGenres) {
        const gId = Number(g?.id);
        const gName = g?.name ? String(g.name).trim() : '';
        if (gId && gName) {
          if (!genreMap.has(gId)) {
            genreMap.set(gId, { id: gId, name: gName, itemIds: new Set(), mediaIds: new Set() });
          }
          const entry = genreMap.get(gId)!;
          entry.itemIds.add(row.physical_item_id);
          entry.mediaIds.add(row.media_id);
        }
      }

      // Directors (movies only — exclude tv_season so TV series creators don't inflate film director counts)
      if (
        row.media_type !== 'tv_season' &&
        row.director &&
        typeof row.director === 'string' &&
        row.director.trim()
      ) {
        const directors = row.director
          .split(',')
          .map((d: string) => d.trim())
          .filter(Boolean);
        for (const dir of directors) {
          if (!directorMap.has(dir)) {
            directorMap.set(dir, new Set());
          }
          directorMap.get(dir)!.add(row.media_id);
        }
      }

      // Cast (deduplicate TV seasons by show so multi-season TV sets count as 1 title)
      const castList = parseJsonArray<string>(row.cast);
      if (castList.length > 0) {
        const workKey = getCastWorkKey(row);
        const rowYear = parseValidYear(row.release_date);
        const isTV = row.media_type === 'tv_season';
        const cleanTitle = isTV
          ? (row.tv_show_name || row.title || '').trim() || row.title
          : row.title;

        for (const actor of castList) {
          if (typeof actor === 'string' && actor.trim()) {
            const name = actor.trim();
            if (!castMap.has(name)) {
              castMap.set(name, new Map());
            }
            const works = castMap.get(name)!;
            const existing = works.get(workKey);
            if (!existing) {
              works.set(workKey, {
                id: row.media_id,
                title: cleanTitle,
                year: rowYear,
                coverArtUrl: row.cover_art_url || null,
                seasonNumber: row.season_number,
              });
            } else if (isTV) {
              const currSeason = row.season_number ?? 999;
              const prevSeason = existing.seasonNumber ?? 999;
              const currIsRegular = currSeason > 0;
              const prevIsRegular = prevSeason > 0 && prevSeason < 999;
              const prefersCurr =
                (currIsRegular && !prevIsRegular) ||
                (currIsRegular && prevIsRegular && currSeason < prevSeason);

              if (prefersCurr) {
                works.set(workKey, {
                  id: row.media_id,
                  title: cleanTitle,
                  year: rowYear ?? existing.year,
                  coverArtUrl: row.cover_art_url || existing.coverArtUrl,
                  seasonNumber: row.season_number,
                });
              } else {
                if (!existing.coverArtUrl && row.cover_art_url) {
                  existing.coverArtUrl = row.cover_art_url;
                }
                if (existing.year === null && rowYear !== null) {
                  existing.year = rowYear;
                }
              }
            }
          }
        }
      }
    }

    const decades = Array.from(decadeBuckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([decadeStart, bucket]) => ({
        decade: String(decadeStart),
        movieCount: bucket.movieIds.size,
        tvSeasonCount: bucket.tvSeasonIds.size,
        titleCount: bucket.movieIds.size + bucket.tvSeasonIds.size,
        itemCount: bucket.itemIds.size,
      }));

    const totalDistinctTitles = uniqueMediaMap.size;

    const genres = Array.from(genreMap.values())
      .map((g) => ({
        id: g.id,
        name: g.name,
        itemCount: g.itemIds.size,
        titleCount: g.mediaIds.size,
        percentage:
          totalDistinctTitles > 0
            ? Math.round((g.mediaIds.size / totalDistinctTitles) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.titleCount - a.titleCount || a.name.localeCompare(b.name));

    const buildPersonTitles = (mediaSet: Set<number>) => {
      return Array.from(mediaSet)
        .map((mediaId) => uniqueMediaMap.get(mediaId))
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .map((m) => {
          const parsedYear =
            m.release_date && typeof m.release_date === 'string'
              ? parseInt(m.release_date.substring(0, 4), 10)
              : NaN;
          return {
            id: m.media_id,
            title: m.title,
            year: !isNaN(parsedYear) && parsedYear >= 1880 && parsedYear <= 2100 ? parsedYear : null,
            coverArtUrl: m.cover_art_url || null,
          };
        })
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title))
        .slice(0, 4);
    };

    const buildCastTitles = (worksMap: Map<string, PersonWorkPreview>) => {
      return Array.from(worksMap.values())
        .map(({ id, title, year, coverArtUrl }) => ({
          id,
          title,
          year,
          coverArtUrl,
        }))
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title))
        .slice(0, 4);
    };

    const rawTopDirectors = Array.from(directorMap.entries())
      .map(([name, mediaSet]) => ({
        name,
        count: mediaSet.size,
        titles: buildPersonTitles(mediaSet),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 12);

    const rawTopCast = Array.from(castMap.entries())
      .map(([name, worksMap]) => ({
        name,
        count: worksMap.size,
        titles: buildCastTitles(worksMap),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 12);

    const profileMap = await resolvePersonProfiles([
      ...rawTopDirectors.map((d) => d.name),
      ...rawTopCast.map((c) => c.name),
    ]);

    const topDirectors = rawTopDirectors.map((d) => ({
      ...d,
      profileUrl: profileMap.get(d.name.trim().toLowerCase()) ?? null,
    }));

    const topCast = rawTopCast.map((c) => ({
      ...c,
      profileUrl: profileMap.get(c.name.trim().toLowerCase()) ?? null,
    }));

    // 5. Series / Franchises
    const allSeries = await db('series').select('id', 'name');
    const movieSeriesRows = await db('movie_series').select('media_id', 'series_id');

    const seriesMediaMap = new Map<number, Set<number>>();
    for (const s of allSeries) {
      seriesMediaMap.set(s.id, new Set());
    }

    for (const ms of movieSeriesRows) {
      if (uniqueMediaMap.has(ms.media_id) && seriesMediaMap.has(ms.series_id)) {
        seriesMediaMap.get(ms.series_id)!.add(ms.media_id);
      }
    }

    for (const media of uniqueMediaMap.values()) {
      if (media.media_primary_series_id && seriesMediaMap.has(media.media_primary_series_id)) {
        seriesMediaMap.get(media.media_primary_series_id)!.add(media.media_id);
      }
    }

    const activeSeriesList = allSeries
      .map((s) => ({
        id: s.id,
        name: s.name,
        ownedCount: seriesMediaMap.get(s.id)?.size || 0,
      }))
      .filter((s) => s.ownedCount > 0)
      .sort((a, b) => b.ownedCount - a.ownedCount || a.name.localeCompare(b.name));

    const totalSeries = activeSeriesList.length;
    const topSeries = activeSeriesList.slice(0, 10);

    // 6. Physical Library & Shelf Analytics
    const shelfGroups = await db('shelf_groups').orderBy('sort_order', 'asc');
    const shelves = await db('shelves').orderBy('sort_order', 'asc');
    const placements = await db('shelf_placements')
      .join('physical_items', 'shelf_placements.physical_item_id', 'physical_items.id')
      .where(function() {
        this.where('physical_items.archived', 0).orWhereNull('physical_items.archived');
      })
      .select(
        'shelf_placements.shelf_id',
        'shelf_placements.physical_item_id',
        'physical_items.thickness_units'
      );

    const groupNameById = new Map<number, string>();
    for (const g of shelfGroups) {
      groupNameById.set(g.id, g.display_name || g.name);
    }

    const placementsByShelf = new Map<number, { count: number; usedUnits: number }>();
    let placedItemsCount = 0;
    let totalUsedUnits = 0;

    for (const p of placements) {
      placedItemsCount += 1;
      const units = Number(p.thickness_units) || 1;
      totalUsedUnits += units;
      if (!placementsByShelf.has(p.shelf_id)) {
        placementsByShelf.set(p.shelf_id, { count: 0, usedUnits: 0 });
      }
      const entry = placementsByShelf.get(p.shelf_id)!;
      entry.count += 1;
      entry.usedUnits += units;
    }

    let totalCapacityUnits = 0;
    const shelfBreakdown = shelves.map((s: any) => {
      const cap = Number(s.capacity_units) || 0;
      totalCapacityUnits += cap;
      const usage = placementsByShelf.get(s.id) || { count: 0, usedUnits: 0 };
      return {
        id: s.id,
        displayName: s.display_name || s.name,
        groupName: groupNameById.get(s.group_id) || 'Library',
        usedUnits: usage.usedUnits,
        capacityUnits: cap,
        itemCount: usage.count,
        utilizationPercent: cap > 0 ? Math.round((usage.usedUnits / cap) * 1000) / 10 : 0,
      };
    });

    // Total linear footprint & spine colors across all physical items
    let totalLinearMm = 0;
    let totalThicknessUnits = 0;
    const spineColorCounts = new Map<string, number>();
    let itemsWithSpineColor = 0;

    for (const item of physicalItems) {
      const units = Number(item.thickness_units) || 1;
      totalThicknessUnits += units;
      const widthMm = item.width_mm ? Number(item.width_mm) : units * STANDARD_UNIT_MM;
      totalLinearMm += widthMm;

      if (item.spine_color && typeof item.spine_color === 'string' && item.spine_color.trim()) {
        const color = item.spine_color.trim().toLowerCase();
        itemsWithSpineColor += 1;
        spineColorCounts.set(color, (spineColorCounts.get(color) || 0) + 1);
      }
    }

    const spinePalette = Array.from(spineColorCounts.entries())
      .map(([color, count]) => ({
        color,
        count,
        percentage:
          itemsWithSpineColor > 0 ? Math.round((count / itemsWithSpineColor) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    // Format Double-Dips (titles owned across >1 physical item or >1 format)
    const doubleDips = Array.from(uniqueMediaMap.values())
      .map((media) => {
        const itemSet = itemsByMediaId.get(media.media_id) || new Set();
        const formatSet = formatsByMediaId.get(media.media_id) || new Set();
        const sortedFormats = CANONICAL_FORMATS.filter((f) => formatSet.has(f));
        return {
          mediaId: media.media_id,
          title: media.title,
          itemCount: itemSet.size,
          formats: sortedFormats,
        };
      })
      .filter((d) => d.itemCount > 1 || d.formats.length > 1)
      .sort(
        (a, b) =>
          b.itemCount - a.itemCount ||
          b.formats.length - a.formats.length ||
          a.title.localeCompare(b.title)
      )
      .slice(0, 10);

    // 7. Acquisition, Spending & Growth Timeline
    const yearMap = new Map<
      string,
      { purchasedCount: number; addedCount: number; purchasedSpend: number; addedSpend: number }
    >();
    const monthMap = new Map<
      string,
      { purchasedCount: number; addedCount: number; purchasedSpend: number; addedSpend: number }
    >();
    const storeCounts = new Map<string, { itemIds: Set<number>; totalSpend: number; pricedItemIds: Set<number> }>();
    const formatSpendMap = new Map<string, { itemCount: number; totalSpend: number }>();
    let itemsWithPurchaseDate = 0;
    let itemsWithCost = 0;
    let totalSpentCents = 0;
    let titlesInPricedItemsCount = 0;
    let highestCostItem: { id: number; name: string; cost: number; purchaseDate: string | null } | null = null;
    let lowestCostItem: { id: number; name: string; cost: number; purchaseDate: string | null } | null = null;

    for (const item of physicalItems) {
      const itemCost = normalizeCost(item.cost);
      const hasCost = itemCost !== null;
      if (hasCost) {
        itemsWithCost += 1;
        totalSpentCents += Math.round(itemCost * 100);
        titlesInPricedItemsCount += mediaIdsByItemId.get(item.id)?.size || 1;

        if (!highestCostItem || itemCost > highestCostItem.cost) {
          highestCostItem = {
            id: item.id,
            name: item.name,
            cost: itemCost,
            purchaseDate: item.purchase_date || null,
          };
        }
        if (itemCost > 0 && (!lowestCostItem || itemCost < lowestCostItem.cost)) {
          lowestCostItem = {
            id: item.id,
            name: item.name,
            cost: itemCost,
            purchaseDate: item.purchase_date || null,
          };
        }

        const itemFormats = Array.from(new Set(parseJsonArray<string>(item.physical_format)));
        for (const fmt of itemFormats) {
          if (!CANONICAL_FORMATS.includes(fmt)) continue;
          if (!formatSpendMap.has(fmt)) {
            formatSpendMap.set(fmt, { itemCount: 0, totalSpend: 0 });
          }
          const fEntry = formatSpendMap.get(fmt)!;
          fEntry.itemCount += 1;
          fEntry.totalSpend = Math.round((fEntry.totalSpend + itemCost) * 100) / 100;
        }
      }

      if (item.purchase_date && typeof item.purchase_date === 'string') {
        const trimmed = item.purchase_date.trim();
        if (/^\d{4}/.test(trimmed)) {
          itemsWithPurchaseDate += 1;
          const year = trimmed.substring(0, 4);
          if (!yearMap.has(year)) {
            yearMap.set(year, { purchasedCount: 0, addedCount: 0, purchasedSpend: 0, addedSpend: 0 });
          }
          const yEntry = yearMap.get(year)!;
          yEntry.purchasedCount += 1;
          if (hasCost) {
            yEntry.purchasedSpend = Math.round((yEntry.purchasedSpend + itemCost) * 100) / 100;
          }

          if (/^\d{4}-\d{2}/.test(trimmed)) {
            const month = trimmed.substring(0, 7);
            if (!monthMap.has(month)) {
              monthMap.set(month, { purchasedCount: 0, addedCount: 0, purchasedSpend: 0, addedSpend: 0 });
            }
            const mEntry = monthMap.get(month)!;
            mEntry.purchasedCount += 1;
            if (hasCost) {
              mEntry.purchasedSpend = Math.round((mEntry.purchasedSpend + itemCost) * 100) / 100;
            }
          }
        }
      }

      if (item.created_at && typeof item.created_at === 'string') {
        const trimmed = item.created_at.trim();
        if (/^\d{4}/.test(trimmed)) {
          const year = trimmed.substring(0, 4);
          if (!yearMap.has(year)) {
            yearMap.set(year, { purchasedCount: 0, addedCount: 0, purchasedSpend: 0, addedSpend: 0 });
          }
          const yEntry = yearMap.get(year)!;
          yEntry.addedCount += 1;
          if (hasCost) {
            yEntry.addedSpend = Math.round((yEntry.addedSpend + itemCost) * 100) / 100;
          }

          if (/^\d{4}-\d{2}/.test(trimmed)) {
            const month = trimmed.substring(0, 7);
            if (!monthMap.has(month)) {
              monthMap.set(month, { purchasedCount: 0, addedCount: 0, purchasedSpend: 0, addedSpend: 0 });
            }
            const mEntry = monthMap.get(month)!;
            mEntry.addedCount += 1;
            if (hasCost) {
              mEntry.addedSpend = Math.round((mEntry.addedSpend + itemCost) * 100) / 100;
            }
          }
        }
      }

      const links = parseJsonArray<{ label?: string; url?: string }>(item.store_links);
      for (const link of links) {
        const storeName = normalizeStoreName(link);
        if (storeName) {
          if (!storeCounts.has(storeName)) {
            storeCounts.set(storeName, { itemIds: new Set(), totalSpend: 0, pricedItemIds: new Set() });
          }
          const sEntry = storeCounts.get(storeName)!;
          sEntry.itemIds.add(item.id);
          if (hasCost && !sEntry.pricedItemIds.has(item.id)) {
            sEntry.pricedItemIds.add(item.id);
            sEntry.totalSpend = Math.round((sEntry.totalSpend + itemCost) * 100) / 100;
          }
        }
      }
    }

    const acquisitionsByYear = Array.from(yearMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, counts]) => ({
        period,
        purchasedCount: counts.purchasedCount,
        addedCount: counts.addedCount,
        ...(canSeeCost
          ? {
              purchasedSpend: counts.purchasedSpend,
              addedSpend: counts.addedSpend,
            }
          : {}),
      }));

    const acquisitionsByMonth = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([period, counts]) => ({
        period,
        purchasedCount: counts.purchasedCount,
        addedCount: counts.addedCount,
        ...(canSeeCost
          ? {
              purchasedSpend: counts.purchasedSpend,
              addedSpend: counts.addedSpend,
            }
          : {}),
      }));

    const topStores = Array.from(storeCounts.entries())
      .map(([store, sEntry]) => ({
        store,
        count: sEntry.itemIds.size,
        ...(canSeeCost && sEntry.pricedItemIds.size > 0
          ? { totalSpend: sEntry.totalSpend }
          : {}),
      }))
      .sort((a, b) => b.count - a.count || a.store.localeCompare(b.store))
      .slice(0, 10);

    const totalSpent = totalSpentCents / 100;
    const spendingByFormat = CANONICAL_FORMATS.filter((f) => formatSpendMap.has(f)).map((format) => {
      const fEntry = formatSpendMap.get(format)!;
      return {
        format,
        itemCount: fEntry.itemCount,
        totalSpend: fEntry.totalSpend,
        averageSpend:
          fEntry.itemCount > 0 ? Math.round((fEntry.totalSpend / fEntry.itemCount) * 100) / 100 : 0,
      };
    });

    const spendingStats = canSeeCost
      ? {
          totalSpent,
          itemsWithCost,
          averageCostPerItem:
            itemsWithCost > 0 ? Math.round((totalSpent / itemsWithCost) * 100) / 100 : 0,
          averageCostPerTitle:
            titlesInPricedItemsCount > 0
              ? Math.round((totalSpent / titlesInPricedItemsCount) * 100) / 100
              : 0,
          highestCostItem,
          lowestCostItem,
          byFormat: spendingByFormat,
        }
      : undefined;

    res.json({
      overview: {
        totalPhysicalItems,
        totalMovies,
        totalTVSeasons,
        totalTVShows: tvShowKeys.size,
        totalEpisodes,
        multiTitleItemsCount,
        totalSeries,
        itemsWithEditionTags,
      },
      formats,
      editions,
      content: {
        decades,
        oldestRelease,
        newestRelease,
        genres,
        topDirectors,
        topCast,
        topSeries,
      },
      physicalLibrary: {
        totalGroups: shelfGroups.length,
        totalShelves: shelves.length,
        totalCapacityUnits,
        usedUnits: totalUsedUnits,
        utilizationPercent:
          totalCapacityUnits > 0
            ? Math.round((totalUsedUnits / totalCapacityUnits) * 1000) / 10
            : 0,
        placedItemsCount,
        unassignedItemsCount: Math.max(0, totalPhysicalItems - placedItemsCount),
        totalLinearMm: Math.round(totalLinearMm * 10) / 10,
        totalThicknessUnits,
        shelves: shelfBreakdown,
        spinePalette,
        doubleDips,
      },
      acquisitions: {
        itemsWithPurchaseDate,
        byYear: acquisitionsByYear,
        byMonth: acquisitionsByMonth,
        topStores,
        ...(spendingStats ? { spending: spendingStats } : {}),
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

/**
 * Helper: Load cached TMDb person profile URLs from `person_profiles` without making external calls.
 */
async function getCachedPersonProfiles(names: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const keys = Array.from(
    new Set(
      names
        .map((n) => n.trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (keys.length === 0) {
    return result;
  }

  try {
    await ensurePersonProfilesTable();
    const CHUNK_SIZE = 400;
    for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
      const chunk = keys.slice(i, i + CHUNK_SIZE);
      const cachedRows = await db('person_profiles')
        .whereIn('name_key', chunk)
        .select('name_key', 'profile_url');
      for (const row of cachedRows) {
        result.set(row.name_key, row.profile_url || null);
      }
    }
  } catch (err) {
    console.warn('Failed to load cached person profiles:', err);
  }

  return result;
}

/**
 * GET /api/statistics/people
 * Full talent explorer dataset for Directors and Actors across the collection,
 * including per-person formats, decades, genres, owned titles, dual roles, and collaborations.
 */
router.get('/people', async (_req: Request, res: Response) => {
  try {
    const itemMediaRows = await db('physical_item_media as pim')
      .join('media as m', 'pim.media_id', 'm.id')
      .join('physical_items as pi', 'pim.physical_item_id', 'pi.id')
      .where(function() {
        this.where('pi.archived', 0).orWhereNull('pi.archived');
      })
      .select(
        'pim.physical_item_id',
        'pim.media_id',
        'pim.formats as link_formats',
        'pi.physical_format as item_formats',
        'm.title',
        'm.cover_art_url',
        'm.release_date',
        'm.director',
        'm.cast',
        'm.genres',
        'm.media_type',
        'm.tv_show_tmdb_id',
        'm.tv_show_name',
        'm.season_number'
      );

    const parseValidYear = (releaseDate: unknown): number | null => {
      if (!releaseDate || typeof releaseDate !== 'string') return null;
      const parsed = parseInt(releaseDate.substring(0, 4), 10);
      return !isNaN(parsed) && parsed >= 1880 && parsed <= 2100 ? parsed : null;
    };

    interface WorkMeta {
      id: number;
      title: string;
      year: number | null;
      decade: string | null;
      coverArtUrl: string | null;
      mediaType: 'movie' | 'tv_season';
      seasonNumber?: number | null;
      itemIds: Set<number>;
      formats: Set<string>;
      genres: Map<number, string>;
      directors: Set<string>;
      actors: Set<string>;
    }

    const movieWorks = new Map<number, WorkMeta>();
    const castWorks = new Map<string, WorkMeta>();
    const availableFormatsSet = new Set<string>();
    const availableDecadesSet = new Set<string>();
    const availableGenresMap = new Map<number, { id: number; name: string; mediaKeys: Set<string> }>();

    const canonicalNameByKey = new Map<string, string>();
    const getCanonicalName = (raw: string): { key: string; name: string } => {
      const cleaned = raw.replace(/\s+/g, ' ').trim();
      const key = cleaned.toLowerCase();
      if (!canonicalNameByKey.has(key)) {
        canonicalNameByKey.set(key, cleaned);
      }
      return { key, name: canonicalNameByKey.get(key)! };
    };

    for (const row of itemMediaRows) {
      const isTV = row.media_type === 'tv_season';
      const rowYear = parseValidYear(row.release_date);
      const rowDecade = rowYear !== null ? String(Math.floor(rowYear / 10) * 10) : null;
      if (rowDecade) {
        availableDecadesSet.add(rowDecade);
      }

      const linkFormats = parseJsonArray<string>(row.link_formats);
      const itemFormats = parseJsonArray<string>(row.item_formats);
      const effectiveFormats = linkFormats.length > 0 ? linkFormats : itemFormats;
      for (const fmt of effectiveFormats) {
        if (CANONICAL_FORMATS.includes(fmt)) {
          availableFormatsSet.add(fmt);
        }
      }

      const mediaGenres = parseJsonArray<{ id?: number; name?: string }>(row.genres);
      const workKey = getCastWorkKey(row);

      for (const g of mediaGenres) {
        const gId = Number(g?.id);
        const gName = g?.name ? String(g.name).trim() : '';
        if (gId && gName) {
          if (!availableGenresMap.has(gId)) {
            availableGenresMap.set(gId, { id: gId, name: gName, mediaKeys: new Set() });
          }
          availableGenresMap.get(gId)!.mediaKeys.add(workKey);
        }
      }

      // Movie work aggregation (used for directors & collaborations)
      if (!isTV) {
        if (!movieWorks.has(row.media_id)) {
          movieWorks.set(row.media_id, {
            id: row.media_id,
            title: row.title,
            year: rowYear,
            decade: rowDecade,
            coverArtUrl: row.cover_art_url || null,
            mediaType: 'movie',
            itemIds: new Set(),
            formats: new Set(),
            genres: new Map(),
            directors: new Set(),
            actors: new Set(),
          });
        }
        const mw = movieWorks.get(row.media_id)!;
        mw.itemIds.add(row.physical_item_id);
        for (const fmt of effectiveFormats) {
          if (CANONICAL_FORMATS.includes(fmt)) {
            mw.formats.add(fmt);
          }
        }
        for (const g of mediaGenres) {
          const gId = Number(g?.id);
          const gName = g?.name ? String(g.name).trim() : '';
          if (gId && gName) {
            mw.genres.set(gId, gName);
          }
        }

        if (row.director && typeof row.director === 'string' && row.director.trim()) {
          const dirs = row.director
            .split(',')
            .map((d: string) => d.trim())
            .filter(Boolean);
          for (const d of dirs) {
            const { key } = getCanonicalName(d);
            if (key) mw.directors.add(key);
          }
        }

        const castList = parseJsonArray<string>(row.cast);
        for (const actor of castList) {
          if (typeof actor === 'string' && actor.trim()) {
            const { key } = getCanonicalName(actor);
            if (key) mw.actors.add(key);
          }
        }
      }

      // Cast work aggregation (movies + deduplicated TV shows)
      const castList = parseJsonArray<string>(row.cast);
      if (castList.length > 0) {
        const cleanTitle = isTV
          ? (row.tv_show_name || row.title || '').trim() || row.title
          : row.title;

        if (!castWorks.has(workKey)) {
          castWorks.set(workKey, {
            id: row.media_id,
            title: cleanTitle,
            year: rowYear,
            decade: rowDecade,
            coverArtUrl: row.cover_art_url || null,
            mediaType: isTV ? 'tv_season' : 'movie',
            seasonNumber: row.season_number,
            itemIds: new Set(),
            formats: new Set(),
            genres: new Map(),
            directors: new Set(),
            actors: new Set(),
          });
        }

        const cw = castWorks.get(workKey)!;
        cw.itemIds.add(row.physical_item_id);
        for (const fmt of effectiveFormats) {
          if (CANONICAL_FORMATS.includes(fmt)) {
            cw.formats.add(fmt);
          }
        }
        for (const g of mediaGenres) {
          const gId = Number(g?.id);
          const gName = g?.name ? String(g.name).trim() : '';
          if (gId && gName) {
            cw.genres.set(gId, gName);
          }
        }

        if (isTV) {
          const currSeason = row.season_number ?? 999;
          const prevSeason = cw.seasonNumber ?? 999;
          const currIsRegular = currSeason > 0;
          const prevIsRegular = prevSeason > 0 && prevSeason < 999;
          const prefersCurr =
            (currIsRegular && !prevIsRegular) ||
            (currIsRegular && prevIsRegular && currSeason < prevSeason);

          if (prefersCurr) {
            cw.id = row.media_id;
            cw.title = cleanTitle;
            cw.year = rowYear ?? cw.year;
            cw.decade = rowDecade ?? cw.decade;
            cw.coverArtUrl = row.cover_art_url || cw.coverArtUrl;
            cw.seasonNumber = row.season_number;
          } else {
            if (!cw.coverArtUrl && row.cover_art_url) {
              cw.coverArtUrl = row.cover_art_url;
            }
            if (cw.year === null && rowYear !== null) {
              cw.year = rowYear;
              cw.decade = rowDecade;
            }
          }
        }

        for (const actor of castList) {
          if (typeof actor === 'string' && actor.trim()) {
            const { key } = getCanonicalName(actor);
            if (key) cw.actors.add(key);
          }
        }
      }
    }

    // Group works per director & per actor
    const directorWorksMap = new Map<string, WorkMeta[]>();
    const actorWorksMap = new Map<string, WorkMeta[]>();

    for (const mw of movieWorks.values()) {
      for (const dirKey of mw.directors) {
        if (!directorWorksMap.has(dirKey)) {
          directorWorksMap.set(dirKey, []);
        }
        directorWorksMap.get(dirKey)!.push(mw);
      }
    }

    for (const cw of castWorks.values()) {
      for (const actorKey of cw.actors) {
        if (!actorWorksMap.has(actorKey)) {
          actorWorksMap.set(actorKey, []);
        }
        actorWorksMap.get(actorKey)!.push(cw);
      }
    }

    // Build collaborations (Director + Actor pairs appearing together in >= 2 movies)
    const collabPairMap = new Map<string, { directorKey: string; actorKey: string; works: WorkMeta[] }>();
    const collabsByDirectorKey = new Map<string, Map<string, WorkMeta[]>>();
    const collabsByActorKey = new Map<string, Map<string, WorkMeta[]>>();

    for (const mw of movieWorks.values()) {
      for (const dirKey of mw.directors) {
        for (const actorKey of mw.actors) {
          if (dirKey === actorKey) continue; // Skip self-directed acting for pair collaborations
          const pairKey = `${dirKey}:::${actorKey}`;
          if (!collabPairMap.has(pairKey)) {
            collabPairMap.set(pairKey, { directorKey: dirKey, actorKey, works: [] });
          }
          collabPairMap.get(pairKey)!.works.push(mw);

          if (!collabsByDirectorKey.has(dirKey)) {
            collabsByDirectorKey.set(dirKey, new Map());
          }
          const dirMap = collabsByDirectorKey.get(dirKey)!;
          if (!dirMap.has(actorKey)) dirMap.set(actorKey, []);
          dirMap.get(actorKey)!.push(mw);

          if (!collabsByActorKey.has(actorKey)) {
            collabsByActorKey.set(actorKey, new Map());
          }
          const actMap = collabsByActorKey.get(actorKey)!;
          if (!actMap.has(dirKey)) actMap.set(dirKey, []);
          actMap.get(dirKey)!.push(mw);
        }
      }
    }

    const buildPersonEntry = (
      personKey: string,
      role: 'director' | 'actor',
      works: WorkMeta[],
      profileMap: Map<string, string | null>
    ) => {
      const name = canonicalNameByKey.get(personKey) || personKey;
      const itemIds = new Set<number>();
      const formatCounts = new Map<string, number>();
      const decadeSet = new Set<string>();
      const genreCounts = new Map<number, { id: number; name: string; count: number }>();
      let earliestYear: number | null = null;
      let latestYear: number | null = null;

      for (const w of works) {
        for (const itemId of w.itemIds) {
          itemIds.add(itemId);
        }
        for (const fmt of w.formats) {
          formatCounts.set(fmt, (formatCounts.get(fmt) || 0) + 1);
        }
        if (w.decade) {
          decadeSet.add(w.decade);
        }
        if (w.year !== null) {
          if (earliestYear === null || w.year < earliestYear) earliestYear = w.year;
          if (latestYear === null || w.year > latestYear) latestYear = w.year;
        }
        for (const [gId, gName] of w.genres.entries()) {
          const existing = genreCounts.get(gId);
          if (existing) {
            existing.count += 1;
          } else {
            genreCounts.set(gId, { id: gId, name: gName, count: 1 });
          }
        }
      }

      const sortedWorks = [...works]
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title))
        .map((w) => ({
          id: w.id,
          title: w.title,
          year: w.year,
          coverArtUrl: w.coverArtUrl,
          mediaType: w.mediaType,
        }));

      const formats = CANONICAL_FORMATS.filter((f) => formatCounts.has(f)).map((format) => ({
        format,
        count: formatCounts.get(format) || 0,
      }));

      const decades = Array.from(decadeSet).sort((a, b) => a.localeCompare(b));
      const genres = Array.from(genreCounts.values()).sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name)
      );

      const collaboratorMap =
        role === 'director'
          ? collabsByDirectorKey.get(personKey)
          : collabsByActorKey.get(personKey);

      const topCollaborators = collaboratorMap
        ? Array.from(collaboratorMap.entries())
            .filter(([, sharedWorks]) => sharedWorks.length >= 2)
            .map(([collabKey, sharedWorks]) => ({
              name: canonicalNameByKey.get(collabKey) || collabKey,
              role: (role === 'director' ? 'actor' : 'director') as 'director' | 'actor',
              count: sharedWorks.length,
              titles: sharedWorks
                .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title))
                .slice(0, 3)
                .map((w) => w.title),
            }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, 3)
        : [];

      const directedCount = directorWorksMap.get(personKey)?.length || 0;
      const actedCount = actorWorksMap.get(personKey)?.length || 0;
      const alsoRoleCount = role === 'director' ? actedCount : directedCount;

      return {
        name,
        role,
        count: works.length,
        itemCount: itemIds.size,
        profileUrl: profileMap.get(personKey) ?? null,
        titles: sortedWorks,
        formats,
        decades,
        genres,
        earliestYear,
        latestYear,
        alsoRoleCount,
        topCollaborators,
      };
    };

    const allPersonNames = Array.from(canonicalNameByKey.values());
    const cachedProfileMap = await getCachedPersonProfiles(allPersonNames);

    // Proactively resolve TMDb profiles for the top 24 directors and top 24 actors so the initial screen has photos
    const topDirectorKeys = Array.from(directorWorksMap.entries())
      .sort(
        (a, b) =>
          b[1].length - a[1].length ||
          (canonicalNameByKey.get(a[0]) || a[0]).localeCompare(canonicalNameByKey.get(b[0]) || b[0])
      )
      .slice(0, 24)
      .map(([k]) => canonicalNameByKey.get(k) || k);

    const topActorKeys = Array.from(actorWorksMap.entries())
      .sort(
        (a, b) =>
          b[1].length - a[1].length ||
          (canonicalNameByKey.get(a[0]) || a[0]).localeCompare(canonicalNameByKey.get(b[0]) || b[0])
      )
      .slice(0, 24)
      .map(([k]) => canonicalNameByKey.get(k) || k);

    const resolvedTopProfiles = await resolvePersonProfiles([...topDirectorKeys, ...topActorKeys]);
    for (const [k, v] of resolvedTopProfiles.entries()) {
      cachedProfileMap.set(k, v);
    }

    const directors = Array.from(directorWorksMap.entries())
      .map(([key, works]) => buildPersonEntry(key, 'director', works, cachedProfileMap))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const actors = Array.from(actorWorksMap.entries())
      .map(([key, works]) => buildPersonEntry(key, 'actor', works, cachedProfileMap))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const dualRolePeople = Array.from(directorWorksMap.keys())
      .filter((key) => actorWorksMap.has(key))
      .map((key) => {
        const dirWorks = directorWorksMap.get(key) || [];
        const actWorks = actorWorksMap.get(key) || [];
        const combinedTitleMap = new Map<number, { id: number; title: string; year: number | null; coverArtUrl: string | null }>();
        for (const w of [...dirWorks, ...actWorks]) {
          if (!combinedTitleMap.has(w.id)) {
            combinedTitleMap.set(w.id, {
              id: w.id,
              title: w.title,
              year: w.year,
              coverArtUrl: w.coverArtUrl,
            });
          }
        }
        return {
          name: canonicalNameByKey.get(key) || key,
          directedCount: dirWorks.length,
          actedCount: actWorks.length,
          totalUniqueTitles: combinedTitleMap.size,
          profileUrl: cachedProfileMap.get(key) ?? null,
          titles: Array.from(combinedTitleMap.values())
            .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title))
            .slice(0, 4),
        };
      })
      .sort(
        (a, b) =>
          b.totalUniqueTitles - a.totalUniqueTitles ||
          b.directedCount + b.actedCount - (a.directedCount + a.actedCount) ||
          a.name.localeCompare(b.name)
      );

    const topCollaborations = Array.from(collabPairMap.values())
      .filter((pair) => pair.works.length >= 2)
      .map((pair) => ({
        director: canonicalNameByKey.get(pair.directorKey) || pair.directorKey,
        directorProfileUrl: cachedProfileMap.get(pair.directorKey) ?? null,
        actor: canonicalNameByKey.get(pair.actorKey) || pair.actorKey,
        actorProfileUrl: cachedProfileMap.get(pair.actorKey) ?? null,
        count: pair.works.length,
        titles: pair.works
          .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title))
          .map((w) => ({
            id: w.id,
            title: w.title,
            year: w.year,
            coverArtUrl: w.coverArtUrl,
          })),
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.director.localeCompare(b.director) ||
          a.actor.localeCompare(b.actor)
      )
      .slice(0, 24);

    res.json({
      summary: {
        totalDirectors: directors.length,
        totalActors: actors.length,
        multiFilmDirectorsCount: directors.filter((d) => d.count >= 2).length,
        multiTitleActorsCount: actors.filter((a) => a.count >= 2).length,
        dualRoleCount: dualRolePeople.length,
        collaborationsCount: topCollaborations.length,
      },
      directors,
      actors,
      dualRolePeople,
      topCollaborations,
      availableFormats: CANONICAL_FORMATS.filter((f) => availableFormatsSet.has(f)),
      availableDecades: Array.from(availableDecadesSet).sort((a, b) => a.localeCompare(b)),
      availableGenres: Array.from(availableGenresMap.values())
        .map((g) => ({
          id: g.id,
          name: g.name,
          count: g.mediaKeys.size,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    });
  } catch (error) {
    console.error('Error fetching people explorer statistics:', error);
    res.status(500).json({ error: 'Failed to fetch people explorer statistics' });
  }
});

/**
 * GET /api/statistics/people/profiles?names=Name1,Name2
 * On-demand TMDb headshot resolver for people visible in the Talent Explorer.
 * Caches resolved profile URLs in SQLite `person_profiles`.
 */
router.get('/people/profiles', async (req: Request, res: Response) => {
  try {
    const rawNames = req.query.names;
    const namesList: string[] = [];
    if (typeof rawNames === 'string') {
      for (const part of rawNames.split('|')) {
        const trimmed = part.trim();
        if (trimmed) namesList.push(trimmed);
      }
    } else if (Array.isArray(rawNames)) {
      for (const item of rawNames) {
        if (typeof item === 'string' && item.trim()) {
          namesList.push(item.trim());
        }
      }
    }

    const cappedNames = namesList.slice(0, 30);
    const resolvedMap = await resolvePersonProfiles(cappedNames);
    const profiles: Record<string, string | null> = {};
    for (const name of cappedNames) {
      const key = name.trim().toLowerCase();
      profiles[name] = resolvedMap.get(key) ?? null;
    }

    res.json({ profiles });
  } catch (error) {
    console.error('Error resolving person profiles:', error);
    res.status(500).json({ error: 'Failed to resolve person profiles' });
  }
});

export default router;
