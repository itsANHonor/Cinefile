import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

interface PhysicalItemWithMedia {
  id?: number;
  name: string;
  sort_name?: string;
  physical_format: string | string[];
  edition_notes?: string;
  notes?: string;
  custom_image_url?: string;
  purchase_date?: string;
  store_links?: string | any[];
  primary_series_id?: number | null; // Legacy - still used but being phased out
  sort_series_id?: number | null; // Used for sorting by series
  created_at?: string;
  updated_at?: string;
  media: Array<{
    id: number;
    title: string;
    tmdb_id?: number;
    synopsis?: string;
    cover_art_url?: string;
    release_date?: string;
    director?: string;
    cast?: string[];
    disc_number?: number;
    formats?: string[];
  }>;
}

/**
 * GET /api/physical-items
 * Get all physical items with their linked media
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { format, genres, decades, sort_by = 'created_at', sort_order = 'desc', search, media_type, page = '1', limit = '24' } = req.query;

    // Start with base query - fetch physical items WITHOUT joins first
    // This ensures all items are returned, then we'll filter and attach media separately
    let query = db('physical_items')
      .select('physical_items.*');

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
        query = query.where(function() {
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
        query = query.where(function() {
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
        query = query.where(function() {
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
      query = query.where(function() {
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

    // Apply sorting based on sort_by parameter
    const sortDirection = sort_order === 'asc' ? 'asc' : 'desc';
    const isSeriesSort = sort_by === 'series_sort';
    
    if (sort_by === 'title') {
      // Sort by physical item sort_name (fallback to name if sort_name is null)
      query = query.orderByRaw('COALESCE(physical_items.sort_name, physical_items.name) ' + sortDirection);
    } else if (isSeriesSort) {
      // For series_sort, skip SQL-level sorting - will be handled after fetching series data
      // No orderBy clause here
    } else if (sort_by === 'director_last_name') {
      // Sort by director - use subquery to get first media's director
      query = query.orderByRaw(`(
        SELECT SUBSTR(media.director, INSTR(media.director || ' ', ' ') + 1)
        FROM physical_item_media
        JOIN media ON physical_item_media.media_id = media.id
        WHERE physical_item_media.physical_item_id = physical_items.id
        AND media.director IS NOT NULL AND media.director != ''
        LIMIT 1
      ) ${sortDirection.toUpperCase()} NULLS LAST`);
    } else if (sort_by === 'release_date') {
      // Sort by earliest release date among linked media
      query = query.orderByRaw(`(
        SELECT MIN(media.release_date)
        FROM physical_item_media
        JOIN media ON physical_item_media.media_id = media.id
        WHERE physical_item_media.physical_item_id = physical_items.id
      ) ${sortDirection.toUpperCase()} NULLS LAST`);
    } else if (sort_by === 'physical_format') {
      // Sort by physical format
      query = query.orderBy('physical_items.physical_format', sortDirection);
    } else {
      // Default to created_at
      query = query.orderBy('physical_items.created_at', sortDirection);
    }

    // Get total count for pagination - use same filters but without joins
    let countQuery = db('physical_items');

    // Apply the same filters as the main query
    if (media_type && typeof media_type === 'string' && media_type !== 'all') {
      if (media_type === 'movie') {
        countQuery = countQuery.whereRaw(`EXISTS (
          SELECT 1 FROM physical_item_media
          JOIN media ON physical_item_media.media_id = media.id
          WHERE physical_item_media.physical_item_id = physical_items.id
          AND (media.media_type = 'movie' OR media.media_type IS NULL)
        )`);
      } else {
        countQuery = countQuery.whereRaw(`EXISTS (
          SELECT 1 FROM physical_item_media
          JOIN media ON physical_item_media.media_id = media.id
          WHERE physical_item_media.physical_item_id = physical_items.id
          AND media.media_type = ?
        )`, [media_type]);
      }
    }

    if (format && format !== 'all') {
      const formats = typeof format === 'string' ? format.split(',').map(f => String(f).trim()) : [String(format)];
      if (formats.length > 0) {
        countQuery = countQuery.where(function() {
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

    // Filter by genres in count query
    if (genres && typeof genres === 'string') {
      const genreIds = genres.split(',').map(g => parseInt(g.trim())).filter(id => !isNaN(id));
      if (genreIds.length > 0) {
        countQuery = countQuery.where(function() {
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

    // Filter by decades in count query
    if (decades && typeof decades === 'string') {
      const decadeStrings = decades.split(',').map(d => d.trim()).filter(d => d.length > 0);
      if (decadeStrings.length > 0) {
        countQuery = countQuery.where(function() {
          decadeStrings.forEach((decadeStr: string, index: number) => {
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

    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      countQuery = countQuery.where(function() {
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

    const totalCount = await countQuery.count('physical_items.id as count').first();
    const total = totalCount ? parseInt(totalCount.count as string) : 0;

    // Calculate pagination with limits
    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1); // Minimum 1
    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 24, 1), 100); // Between 1 and 100
    const offset = (pageNum - 1) * limitNum;
    const totalPages = Math.ceil(total / limitNum);

    // For series_sort, fetch ALL items first (no pagination), then sort and paginate
    // For other sorts, apply pagination at SQL level
    if (!isSeriesSort) {
      query = query.limit(limitNum).offset(offset);
    }

    const physicalItems = await query;

    // Get all physical item IDs for batch fetching media
    const itemIds = physicalItems.map(item => item.id);
    
    // Fetch all linked media for all physical items in a single query (eliminates N+1 problem)
    const allLinkedMedia = itemIds.length > 0 ? await db('physical_item_media')
      .join('media', 'physical_item_media.media_id', 'media.id')
      .whereIn('physical_item_media.physical_item_id', itemIds)
      .select(
        'physical_item_media.physical_item_id',
        'media.*',
        'physical_item_media.disc_number',
        'physical_item_media.formats'
      )
      .orderBy('physical_item_media.physical_item_id')
      .orderBy('physical_item_media.disc_number') : [];

    // For series_sort, fetch series data and movie_series data
    let seriesMap = new Map<number, any>();
    let mediaSeriesMap = new Map<number, any[]>(); // media_id -> array of {series_id, sort_order}
    
    if (isSeriesSort && itemIds.length > 0) {
      // Fetch series data for physical items (via sort_series_id, falling back to primary_series_id for legacy)
      const physicalItemSeriesIds = physicalItems
        .map(item => item.sort_series_id || item.primary_series_id)
        .filter(id => id !== null && id !== undefined) as number[];
      
      // Also get series IDs from media's primary_series_id or movie_series associations
      const mediaIds = allLinkedMedia.map(m => m.id);
      
      // Get media's primary_series_id values
      const mediaPrimarySeriesIds = allLinkedMedia
        .map(m => m.primary_series_id)
        .filter(id => id !== null && id !== undefined) as number[];
      
      const mediaSeriesAssociations = mediaIds.length > 0 ? await db('movie_series')
        .whereIn('media_id', mediaIds)
        .select('media_id', 'series_id', 'sort_order') : [];
      
      // Get all unique series IDs
      const allSeriesIds = new Set<number>();
      physicalItemSeriesIds.forEach(id => allSeriesIds.add(id));
      mediaPrimarySeriesIds.forEach(id => allSeriesIds.add(id));
      mediaSeriesAssociations.forEach(assoc => allSeriesIds.add(assoc.series_id));
      
      // Fetch all series data
      if (allSeriesIds.size > 0) {
        const seriesData = await db('series')
          .whereIn('id', Array.from(allSeriesIds))
          .select('id', 'sort_name', 'internal_sort_method');
        
        seriesData.forEach(series => {
          seriesMap.set(series.id, series);
        });
      }
      
      // Build mediaSeriesMap: for each media, store its series associations
      // Also include primary_series_id if it exists
      allLinkedMedia.forEach(m => {
        if (m.primary_series_id) {
          if (!mediaSeriesMap.has(m.id)) {
            mediaSeriesMap.set(m.id, []);
          }
          // Add primary series as first entry (higher priority)
          mediaSeriesMap.get(m.id)!.unshift({
            series_id: m.primary_series_id,
            sort_order: null // Will be looked up from movie_series if needed
          });
        }
      });
      
      mediaSeriesAssociations.forEach(assoc => {
        if (!mediaSeriesMap.has(assoc.media_id)) {
          mediaSeriesMap.set(assoc.media_id, []);
        }
        // Check if this series is already in the map (from primary_series_id)
        const existing = mediaSeriesMap.get(assoc.media_id)!.find(
          ms => ms.series_id === assoc.series_id
        );
        if (!existing) {
          mediaSeriesMap.get(assoc.media_id)!.push({
            series_id: assoc.series_id,
            sort_order: assoc.sort_order
          });
        } else {
          // Update sort_order if it wasn't set
          if (existing.sort_order === null) {
            existing.sort_order = assoc.sort_order;
          }
        }
      });
    }

    // Group media by physical_item_id for efficient lookup
    const mediaByItemId = new Map<number, any[]>();
    allLinkedMedia.forEach((mediaItem: any) => {
      const itemId = mediaItem.physical_item_id;
      if (!mediaByItemId.has(itemId)) {
        mediaByItemId.set(itemId, []);
      }
      mediaByItemId.get(itemId)!.push(mediaItem);
    });

    // Build response with media grouped by physical item
    let physicalItemsWithMedia: PhysicalItemWithMedia[] = physicalItems.map((item) => {
      const linkedMedia = mediaByItemId.get(item.id) || [];
      
      // Parse JSON fields
      const media = linkedMedia.map(m => ({
        id: m.id,
        title: m.title,
        tmdb_id: m.tmdb_id,
        synopsis: m.synopsis,
        cover_art_url: m.cover_art_url,
        release_date: m.release_date,
        director: m.director,
        disc_number: m.disc_number,
        formats: m.formats ? (typeof m.formats === 'string' ? JSON.parse(m.formats) : m.formats) : [],
        cast: m.cast ? (typeof m.cast === 'string' ? JSON.parse(m.cast) : m.cast) : [],
        genres: m.genres ? (typeof m.genres === 'string' ? JSON.parse(m.genres) : m.genres) : [],
      }));

      // Clean up the aggregated fields from the main query
      // Only include notes if notes_public is true (public view)
      const cleanedItem: PhysicalItemWithMedia = {
        ...item,
        physical_format: item.physical_format ? (typeof item.physical_format === 'string' ? JSON.parse(item.physical_format) : item.physical_format) : [],
        store_links: item.store_links ? (typeof item.store_links === 'string' ? JSON.parse(item.store_links) : item.store_links) : [],
        notes: item.notes_public ? item.notes : undefined,
        media,
      };
      
      // Remove notes_public from response (public users don't need to see this flag)
      delete (cleanedItem as any).notes_public;

      return cleanedItem;
    });

    // For series_sort, perform post-processing sort
    if (isSeriesSort) {
      physicalItemsWithMedia.sort((a, b) => {
        // Determine primary series for each item
        const getPrimarySeries = (item: PhysicalItemWithMedia) => {
          // First check physical item's sort_series_id (or legacy primary_series_id)
          const sortSeriesId = item.sort_series_id || item.primary_series_id;
          if (sortSeriesId) {
            return seriesMap.get(sortSeriesId);
          }
          
          // Otherwise, check if any media has a primary_series_id or series association
          for (const mediaItem of item.media) {
            // Check if media has series associations (primary_series_id is already included)
            const mediaSeries = mediaSeriesMap.get(mediaItem.id);
            if (mediaSeries && mediaSeries.length > 0) {
              // Use the first series found (which is the primary if it exists)
              return seriesMap.get(mediaSeries[0].series_id);
            }
          }
          
          return null;
        };
        
        const seriesA = getPrimarySeries(a);
        const seriesB = getPrimarySeries(b);
        
        // Primary sort: Series sort_name (or physical item sort_name/name if no series)
        const primaryKeyA = seriesA?.sort_name || a.sort_name || a.name || '';
        const primaryKeyB = seriesB?.sort_name || b.sort_name || b.name || '';
        
        let primaryCompare = primaryKeyA.localeCompare(primaryKeyB, undefined, { sensitivity: 'base' });
        if (primaryCompare !== 0) {
          return sortDirection === 'asc' ? primaryCompare : -primaryCompare;
        }
        
        // Secondary sort: Based on series internal_sort_method
        if (seriesA && seriesB && seriesA.id === seriesB.id) {
          // Same series - apply internal sort method
          const sortMethod = seriesA.internal_sort_method || 'chronological';
          
          let secondaryKeyA: string | number | null = null;
          let secondaryKeyB: string | number | null = null;
          
          if (sortMethod === 'chronological') {
            // Sort by earliest release_date
            const datesA = a.media
              .map(m => m.release_date)
              .filter(d => d !== null && d !== undefined)
              .sort();
            const datesB = b.media
              .map(m => m.release_date)
              .filter(d => d !== null && d !== undefined)
              .sort();
            secondaryKeyA = datesA.length > 0 ? datesA[0] : null;
            secondaryKeyB = datesB.length > 0 ? datesB[0] : null;
          } else if (sortMethod === 'alphabetical') {
            // Sort by first title alphabetically
            const titlesA = a.media
              .map(m => m.title)
              .filter(t => t !== null && t !== undefined)
              .sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' }));
            const titlesB = b.media
              .map(m => m.title)
              .filter(t => t !== null && t !== undefined)
              .sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' }));
            secondaryKeyA = titlesA.length > 0 ? titlesA[0] : null;
            secondaryKeyB = titlesB.length > 0 ? titlesB[0] : null;
          } else if (sortMethod === 'custom') {
            // Sort by minimum sort_order from movie_series
            const sortOrdersA: number[] = [];
            const sortOrdersB: number[] = [];
            
            a.media.forEach(m => {
              const mediaSeries = mediaSeriesMap.get(m.id);
              if (mediaSeries) {
                mediaSeries.forEach(ms => {
                  if (ms.series_id === seriesA.id && ms.sort_order !== null) {
                    sortOrdersA.push(ms.sort_order);
                  }
                });
              }
            });
            
            b.media.forEach(m => {
              const mediaSeries = mediaSeriesMap.get(m.id);
              if (mediaSeries) {
                mediaSeries.forEach(ms => {
                  if (ms.series_id === seriesB.id && ms.sort_order !== null) {
                    sortOrdersB.push(ms.sort_order);
                  }
                });
              }
            });
            
            secondaryKeyA = sortOrdersA.length > 0 ? Math.min(...sortOrdersA) : null;
            secondaryKeyB = sortOrdersB.length > 0 ? Math.min(...sortOrdersB) : null;
          }
          
          // Compare secondary keys
          if (secondaryKeyA === null && secondaryKeyB === null) {
            // Both null - fall back to physical item sort_name/name
            const nameA = a.sort_name || a.name || '';
            const nameB = b.sort_name || b.name || '';
            const nameCompare = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
            return sortDirection === 'asc' ? nameCompare : -nameCompare;
          } else if (secondaryKeyA === null) {
            return sortDirection === 'asc' ? 1 : -1; // nulls last
          } else if (secondaryKeyB === null) {
            return sortDirection === 'asc' ? -1 : 1; // nulls last
          } else {
            let secondaryCompare: number;
            if (typeof secondaryKeyA === 'string' && typeof secondaryKeyB === 'string') {
              secondaryCompare = secondaryKeyA.localeCompare(secondaryKeyB, undefined, { sensitivity: 'base' });
            } else {
              secondaryCompare = (secondaryKeyA as number) - (secondaryKeyB as number);
            }
            if (secondaryCompare !== 0) {
              return sortDirection === 'asc' ? secondaryCompare : -secondaryCompare;
            }
          }
        }
        
        // Fallback: sort by physical item sort_name/name
        const nameA = a.sort_name || a.name || '';
        const nameB = b.sort_name || b.name || '';
        const nameCompare = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
        return sortDirection === 'asc' ? nameCompare : -nameCompare;
      });
      
      // Apply pagination after sorting
      physicalItemsWithMedia = physicalItemsWithMedia.slice(offset, offset + limitNum);
    }

    res.json({
      items: physicalItemsWithMedia,
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
    console.error('Error fetching physical items:', error);
    res.status(500).json({ error: 'Failed to fetch physical items' });
  }
});

/**
 * GET /api/physical-items/:id
 * Get a specific physical item with its linked media
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const physicalItem = await db('physical_items').where('id', id).first();

    if (!physicalItem) {
      return res.status(404).json({ error: 'Physical item not found' });
    }

    // Get linked media
    const linkedMedia = await db('physical_item_media')
      .join('media', 'physical_item_media.media_id', 'media.id')
      .where('physical_item_media.physical_item_id', id)
      .select(
        'media.*',
        'physical_item_media.disc_number',
        'physical_item_media.formats'
      );

    // Parse JSON fields
    const media = linkedMedia.map(m => ({
      ...m,
      cast: m.cast ? JSON.parse(m.cast) : [],
      genres: m.genres ? JSON.parse(m.genres) : [],
      formats: m.formats ? JSON.parse(m.formats) : [],
    }));

    // Only include notes if notes_public is true (public view)
    const result: PhysicalItemWithMedia = {
      ...physicalItem,
      physical_format: JSON.parse(physicalItem.physical_format),
      store_links: physicalItem.store_links ? JSON.parse(physicalItem.store_links) : [],
      notes: physicalItem.notes_public ? physicalItem.notes : undefined,
      media,
    };
    
    // Remove notes_public from response (public users don't need to see this flag)
    delete (result as any).notes_public;

    res.json(result);
  } catch (error) {
    console.error('Error fetching physical item:', error);
    res.status(500).json({ error: 'Failed to fetch physical item' });
  }
});

export default router;



