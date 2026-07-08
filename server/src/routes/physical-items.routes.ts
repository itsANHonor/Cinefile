import { Router, Request, Response } from 'express';
import { db } from '../database';
import { authMiddleware } from '../middleware/auth.middleware';
import { calculateSortName } from '../utils/sort-name.util';
import { extractSpineColors } from '../services/color.service';

const router = Router();

interface PhysicalItem {
  id?: number;
  name: string;
  sort_name?: string;
  physical_format: string; // JSON string of array
  edition_notes?: string;
  notes?: string;
  notes_public?: boolean;
  custom_image_url?: string;
  purchase_date?: string;
  store_links?: string; // JSON string of array
  primary_series_id?: number | null; // Legacy - still used but being phased out
  sort_series_id?: number | null; // Used for sorting by series
  created_at?: string;
  updated_at?: string;
}

interface PhysicalItemWithMedia extends PhysicalItem {
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

    // Calculate pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
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

    // Fetch shelf placements for all items (for showing location info)
    const allPlacements = itemIds.length > 0 ? await db('shelf_placements')
      .leftJoin('shelves', 'shelf_placements.shelf_id', 'shelves.id')
      .leftJoin('shelf_groups', 'shelves.group_id', 'shelf_groups.id')
      .whereIn('shelf_placements.physical_item_id', itemIds)
      .select(
        'shelf_placements.id',
        'shelf_placements.shelf_id',
        'shelf_placements.physical_item_id',
        'shelf_placements.position',
        'shelves.display_name as shelf_display_name',
        'shelf_groups.display_name as group_display_name'
      ) : [];

    const placementByItemId = new Map<number, any>();
    allPlacements.forEach((p: any) => {
      placementByItemId.set(p.physical_item_id, {
        id: p.id,
        shelf_id: p.shelf_id,
        physical_item_id: p.physical_item_id,
        position: p.position,
        shelf_display_name: p.shelf_display_name,
        group_display_name: p.group_display_name,
      });
    });
    
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

    // Fetch series data for all media items (for display in detail modal)
    const allMediaIds = allLinkedMedia.map(m => m.id);
    let allMediaSeriesAssociations: any[] = [];
    let allSeriesData = new Map<number, any>();
    
    if (allMediaIds.length > 0) {
      allMediaSeriesAssociations = await db('movie_series')
        .whereIn('media_id', allMediaIds)
        .select('media_id', 'series_id', 'sort_order');
      
      const allSeriesIdsForDisplay = new Set<number>();
      allMediaSeriesAssociations.forEach(assoc => allSeriesIdsForDisplay.add(assoc.series_id));
      
      if (allSeriesIdsForDisplay.size > 0) {
        const seriesRows = await db('series')
          .whereIn('id', Array.from(allSeriesIdsForDisplay))
          .select('id', 'name', 'sort_name');
        
        seriesRows.forEach(s => allSeriesData.set(s.id, s));
      }
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
      const media = linkedMedia.map(m => {
        // Get series for this media item
        const mediaSeries = allMediaSeriesAssociations
          .filter(assoc => assoc.media_id === m.id)
          .map(assoc => allSeriesData.get(assoc.series_id))
          .filter(Boolean);
        
        return {
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
          series: mediaSeries.length > 0 ? mediaSeries : undefined,
        };
      });

      // Clean up the aggregated fields from the main query
      const cleanedItem = {
        ...item,
        physical_format: item.physical_format ? (typeof item.physical_format === 'string' ? JSON.parse(item.physical_format) : item.physical_format) : [],
        store_links: item.store_links ? (typeof item.store_links === 'string' ? JSON.parse(item.store_links) : item.store_links) : [],
        thickness_units: item.thickness_units || 1,
        shelf_placement: placementByItemId.get(item.id) || null,
        media,
      };

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

    // Get shelf placement
    const placement = await db('shelf_placements')
      .leftJoin('shelves', 'shelf_placements.shelf_id', 'shelves.id')
      .leftJoin('shelf_groups', 'shelves.group_id', 'shelf_groups.id')
      .where('shelf_placements.physical_item_id', id)
      .select(
        'shelf_placements.id',
        'shelf_placements.shelf_id',
        'shelf_placements.physical_item_id',
        'shelf_placements.position',
        'shelves.display_name as shelf_display_name',
        'shelf_groups.display_name as group_display_name'
      )
      .first();

    // Fetch series data for linked media
    const mediaIds = linkedMedia.map(m => m.id);
    let mediaSeriesAssociations: any[] = [];
    const seriesDataMap = new Map<number, any>();
    
    if (mediaIds.length > 0) {
      mediaSeriesAssociations = await db('movie_series')
        .whereIn('media_id', mediaIds)
        .select('media_id', 'series_id', 'sort_order');
      
      const seriesIds = new Set<number>();
      mediaSeriesAssociations.forEach(assoc => seriesIds.add(assoc.series_id));
      
      if (seriesIds.size > 0) {
        const seriesRows = await db('series')
          .whereIn('id', Array.from(seriesIds))
          .select('id', 'name', 'sort_name');
        
        seriesRows.forEach(s => seriesDataMap.set(s.id, s));
      }
    }

    // Parse JSON fields
    const media = linkedMedia.map(m => {
      const mediaSeries = mediaSeriesAssociations
        .filter(assoc => assoc.media_id === m.id)
        .map(assoc => seriesDataMap.get(assoc.series_id))
        .filter(Boolean);
      
      return {
        ...m,
        cast: m.cast ? JSON.parse(m.cast) : [],
        genres: m.genres ? JSON.parse(m.genres) : [],
        formats: m.formats ? JSON.parse(m.formats) : [],
        series: mediaSeries.length > 0 ? mediaSeries : undefined,
      };
    });

    const result: PhysicalItemWithMedia = {
      ...physicalItem,
      physical_format: JSON.parse(physicalItem.physical_format),
      store_links: physicalItem.store_links ? JSON.parse(physicalItem.store_links) : [],
      thickness_units: physicalItem.thickness_units || 1,
      shelf_placement: placement || null,
      media,
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching physical item:', error);
    res.status(500).json({ error: 'Failed to fetch physical item' });
  }
});

/**
 * POST /api/physical-items
 * Create a new physical item with linked media (protected)
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { 
      name, edition_notes, notes, notes_public, custom_image_url, purchase_date, 
      media, store_links, sort_name,
      thickness_units, width_mm, height_mm, depth_mm,
      sort_series_id, // Used for sorting preference
      media_primary_series_id // When set, adds all media to this series and sets it as their primary
    } = req.body;

    // Validate notes length (max 2000 characters)
    if (notes && typeof notes === 'string' && notes.length > 2000) {
      return res.status(400).json({ error: 'Notes cannot exceed 2000 characters' });
    }

    // Validation function for store links
    const validateStoreLinks = (links: any[]): boolean => {
      if (!Array.isArray(links)) return false;
      
      for (const link of links) {
        if (!link.label || typeof link.label !== 'string' || link.label.trim() === '') {
          return false;
        }
        if (!link.url || typeof link.url !== 'string') {
          return false;
        }
        // URL validation regex
        const urlPattern = /^https?:\/\/.+/i;
        if (!urlPattern.test(link.url)) {
          return false;
        }
      }
      return true;
    };

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Validate store links if provided
    if (store_links && !validateStoreLinks(store_links)) {
      return res.status(400).json({ error: 'Invalid store links format. Each link must have a label and valid URL.' });
    }

    // Validate media data - support both single object and array
    if (!media) {
      return res.status(400).json({ error: 'Media data is required' });
    }

    // Convert single media object to array for uniform processing
    const mediaArray = Array.isArray(media) ? media : [media];

    if (mediaArray.length === 0) {
      return res.status(400).json({ error: 'At least one media entry is required' });
    }

    const validFormats = ['4K UHD', '3D Blu-ray', 'Blu-ray', 'DVD', 'Digital-HD', 'Digital-SD', 'Digital-UHD', 'LaserDisc', 'VHS'];

    // Start a transaction
    const result = await db.transaction(async (trx) => {
      // Validate sort_series_id if provided
      if (sort_series_id !== undefined && sort_series_id !== null) {
        const seriesExists = await trx('series').where({ id: sort_series_id }).first();
        if (!seriesExists) {
          throw new Error('Sort series not found');
        }
      }
      
      // Validate media_primary_series_id if provided
      if (media_primary_series_id !== undefined && media_primary_series_id !== null) {
        const seriesExists = await trx('series').where({ id: media_primary_series_id }).first();
        if (!seriesExists) {
          throw new Error('Series not found');
        }
      }

      // Create physical item first (formats will be calculated after linking media)
      // Calculate sort_name if not provided, but allow user override
      const calculatedSortName = sort_name !== undefined ? sort_name : calculateSortName(name);
      const physicalItemData = {
        name,
        sort_name: calculatedSortName || null,
        physical_format: JSON.stringify([]), // Will be updated after linking media
        edition_notes,
        notes: notes || null,
        notes_public: notes_public === true ? 1 : 0, // SQLite boolean
        custom_image_url,
        purchase_date,
        thickness_units: Math.max(1, parseInt(thickness_units) || 1),
        width_mm: width_mm || null,
        height_mm: height_mm || null,
        depth_mm: depth_mm || null,
        store_links: store_links ? JSON.stringify(store_links) : null,
        sort_series_id: sort_series_id || null,
      };

      const [physicalItemId] = await trx('physical_items').insert(physicalItemData);

      // Process each media entry
      const allFormats = new Set<string>();
      
      for (const mediaItem of mediaArray) {
        let mediaId: number;
        
        if (mediaItem.id) {
          // Use existing media entry
          mediaId = mediaItem.id;
        } else {
          // Create new media entry
          if (!mediaItem.title) {
            throw new Error('Media title is required');
          }

          const mediaData: any = {
            title: mediaItem.title,
            tmdb_id: mediaItem.tmdb_id,
            synopsis: mediaItem.synopsis,
            cover_art_url: mediaItem.cover_art_url,
            release_date: mediaItem.release_date,
            director: mediaItem.director,
            cast: mediaItem.cast ? JSON.stringify(mediaItem.cast) : null,
            media_type: mediaItem.media_type || 'movie',
            tv_show_tmdb_id: mediaItem.tv_show_tmdb_id || null,
            tv_show_name: mediaItem.tv_show_name || null,
            season_number: mediaItem.season_number != null ? mediaItem.season_number : null,
            episode_count: mediaItem.episode_count != null ? mediaItem.episode_count : null,
          };

          if (mediaItem.genres) {
            mediaData.genres = typeof mediaItem.genres === 'string' ? mediaItem.genres : JSON.stringify(mediaItem.genres);
          }

          // #region agent log
          console.log('[DEBUG-0162e4]', JSON.stringify({location:'physical-items.routes.ts:912',message:'media INSERT data',data:{mediaData,mediaItemKeys:Object.keys(mediaItem)}}));
          // #endregion
          const [newMediaId] = await trx('media').insert(mediaData);
          mediaId = newMediaId;
        }

        // Validate and process formats for this media item
        let mediaFormats: string[] = [];
        if (mediaItem.formats && Array.isArray(mediaItem.formats)) {
          mediaFormats = mediaItem.formats;
        } else if (mediaItem.format) {
          mediaFormats = [mediaItem.format];
        } else {
          // Default to Blu-ray if no format specified
          mediaFormats = ['Blu-ray'];
        }

        // Validate formats
        for (const format of mediaFormats) {
          if (!validFormats.includes(format)) {
            throw new Error(`Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}`);
          }
          allFormats.add(format);
        }

        // Link physical item to media with formats
        await trx('physical_item_media').insert({
          physical_item_id: physicalItemId,
          media_id: mediaId,
          disc_number: mediaItem.disc_number,
          formats: JSON.stringify(mediaFormats),
        });
      }

      // Update physical item with calculated formats
      await trx('physical_items')
        .where('id', physicalItemId)
        .update({
          physical_format: JSON.stringify(Array.from(allFormats).sort())
        });

      // Handle media_primary_series_id: add all media to series and set as their primary
      if (media_primary_series_id !== undefined && media_primary_series_id !== null) {
        // Get all media IDs that were just linked
        const linkedMediaIds = await trx('physical_item_media')
          .where('physical_item_id', physicalItemId)
          .select('media_id');
        
        for (const { media_id: mediaId } of linkedMediaIds) {
          // Add to series if not already there
          const existingAssoc = await trx('movie_series')
            .where({ media_id: mediaId, series_id: media_primary_series_id })
            .first();
          
          if (!existingAssoc) {
            await trx('movie_series').insert({
              media_id: mediaId,
              series_id: media_primary_series_id,
              auto_sort: true,
            });
          }
          
          // Set this as the primary series for the media
          await trx('media')
            .where({ id: mediaId })
            .update({ 
              primary_series_id: media_primary_series_id,
              updated_at: trx.fn.now()
            });
        }
      }

      // Fetch the created physical item with media
      const createdItem = await trx('physical_items').where('id', physicalItemId).first();
      const linkedMedia = await trx('physical_item_media')
        .join('media', 'physical_item_media.media_id', 'media.id')
        .where('physical_item_media.physical_item_id', physicalItemId)
        .select('media.*', 'physical_item_media.disc_number', 'physical_item_media.formats');

      return {
        ...createdItem,
        physical_format: JSON.parse(createdItem.physical_format),
        media: linkedMedia.map(m => ({
          ...m,
          cast: m.cast ? JSON.parse(m.cast) : [],
          formats: m.formats ? JSON.parse(m.formats) : [],
        })),
      };
    });

    // Fire-and-forget: extract spine colors from cover art if not set
    if (!result.spine_color) {
      const coverUrl = result.custom_image_url || result.media?.[0]?.cover_art_url;
      if (coverUrl) {
        extractSpineColors(coverUrl, result.name).then(async (colors) => {
          try {
            await db('physical_items').where('id', result.id).update({
              spine_color: colors.dominant,
              spine_color_accent: colors.accent,
            });
          } catch (e) {
            console.warn('Failed to save extracted spine colors:', e);
          }
        }).catch(() => { /* silently ignore */ });
      }
    }

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Error creating physical item:', error);
    // #region agent log
    console.log('[DEBUG-0162e4]', JSON.stringify({location:'physical-items.routes.ts:1018',message:'POST / catch error',data:{errorMessage:error?.message,errorCode:error?.code,reqBodyKeys:Object.keys(req.body||{}),mediaCount:Array.isArray(req.body?.media)?req.body.media.length:0,firstMedia:Array.isArray(req.body?.media)?req.body.media[0]:req.body?.media}}));
    // #endregion
    res.status(500).json({ error: 'Failed to create physical item', details: error?.message });
  }
});

/**
 * PUT /api/physical-items/:id
 * Update a physical item (protected)
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      name, physical_format, edition_notes, notes, notes_public, 
      custom_image_url, purchase_date, store_links, sort_name,
      thickness_units, width_mm, height_mm, depth_mm,
      sort_series_id, // Used for sorting preference
      media_primary_series_id // When set, adds all media to this series and sets it as their primary
    } = req.body;

    console.log('PUT /api/physical-items/:id', { id, body: req.body });

    // Validate notes length (max 2000 characters)
    if (notes !== undefined && notes !== null && typeof notes === 'string' && notes.length > 2000) {
      return res.status(400).json({ error: 'Notes cannot exceed 2000 characters' });
    }

    // Check if physical item exists
    const existingItem = await db('physical_items').where('id', id).first();
    if (!existingItem) {
      return res.status(404).json({ error: 'Physical item not found' });
    }

    // Handle media_primary_series_id: add all media to series and set as their primary
    if (media_primary_series_id !== undefined && media_primary_series_id !== null) {
      const seriesExists = await db('series').where({ id: media_primary_series_id }).first();
      if (!seriesExists) {
        return res.status(400).json({ error: 'Series not found' });
      }
      
      // Get all media IDs linked to this physical item
      const linkedMedia = await db('physical_item_media')
        .where('physical_item_id', id)
        .select('media_id');
      
      const mediaIds = linkedMedia.map((m: any) => m.media_id);
      
      if (mediaIds.length > 0) {
        // For each media, add to the series if not already there
        for (const mediaId of mediaIds) {
          const existingAssoc = await db('movie_series')
            .where({ media_id: mediaId, series_id: media_primary_series_id })
            .first();
          
          if (!existingAssoc) {
            await db('movie_series').insert({
              media_id: mediaId,
              series_id: media_primary_series_id,
              auto_sort: true,
            });
          }
          
          // Set this as the primary series for the media
          await db('media')
            .where({ id: mediaId })
            .update({ 
              primary_series_id: media_primary_series_id,
              updated_at: db.fn.now()
            });
        }
      }
    }

    // Validate sort_series_id if provided (just check series exists)
    if (sort_series_id !== undefined && sort_series_id !== null) {
      const seriesExists = await db('series').where({ id: sort_series_id }).first();
      if (!seriesExists) {
        return res.status(400).json({ error: 'Sort series not found' });
      }
    }

    // Prepare update data
    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (edition_notes !== undefined) updateData.edition_notes = edition_notes;
    if (notes !== undefined) updateData.notes = notes || null;
    if (notes_public !== undefined) updateData.notes_public = notes_public === true ? 1 : 0; // SQLite boolean
    if (custom_image_url !== undefined) updateData.custom_image_url = custom_image_url;
    if (purchase_date !== undefined) updateData.purchase_date = purchase_date;
    if (thickness_units !== undefined) updateData.thickness_units = Math.max(1, parseInt(thickness_units) || 1);
    if (width_mm !== undefined) updateData.width_mm = width_mm || null;
    if (height_mm !== undefined) updateData.height_mm = height_mm || null;
    if (depth_mm !== undefined) updateData.depth_mm = depth_mm || null;
    if (sort_series_id !== undefined) updateData.sort_series_id = sort_series_id || null;
    
    // Handle sort_name: if explicitly provided, use it; otherwise recalculate if name changed
    if (sort_name !== undefined) {
      updateData.sort_name = sort_name || null;
    } else if (name !== undefined) {
      // Name is being updated, recalculate sort_name
      updateData.sort_name = calculateSortName(name) || null;
    }
    if (store_links !== undefined) {
      // Validate store links if provided
      if (store_links !== null && store_links !== undefined) {
        const validateStoreLinks = (links: any[]): boolean => {
          if (!Array.isArray(links)) return false;
          
          for (const link of links) {
            if (!link.label || typeof link.label !== 'string' || link.label.trim() === '') {
              return false;
            }
            if (!link.url || typeof link.url !== 'string') {
              return false;
            }
            // URL validation regex
            const urlPattern = /^https?:\/\/.+/i;
            if (!urlPattern.test(link.url)) {
              return false;
            }
          }
          return true;
        };

        if (!validateStoreLinks(store_links)) {
          return res.status(400).json({ error: 'Invalid store links format. Each link must have a label and valid URL.' });
        }
      }
      updateData.store_links = store_links ? JSON.stringify(store_links) : null;
    }

    // Handle physical_format
    if (physical_format !== undefined) {
      let formatArray: string[];
      if (Array.isArray(physical_format)) {
        formatArray = physical_format;
      } else if (typeof physical_format === 'string') {
        formatArray = [physical_format];
      } else {
        return res.status(400).json({ error: 'physical_format must be a string or array' });
      }

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

      updateData.physical_format = JSON.stringify(formatArray);
    }

    // Update physical item
    await db('physical_items').where('id', id).update(updateData);

    // Fetch updated physical item with media
    const updatedItem = await db('physical_items').where('id', id).first();
    const linkedMedia = await db('physical_item_media')
      .join('media', 'physical_item_media.media_id', 'media.id')
      .where('physical_item_media.physical_item_id', id)
      .select('media.*', 'physical_item_media.disc_number', 'physical_item_media.formats');

    const result: PhysicalItemWithMedia = {
      ...updatedItem,
      physical_format: JSON.parse(updatedItem.physical_format),
      store_links: updatedItem.store_links ? JSON.parse(updatedItem.store_links) : [],
      media: linkedMedia.map(m => ({
        ...m,
        cast: m.cast ? JSON.parse(m.cast) : [],
        formats: m.formats ? JSON.parse(m.formats) : [],
      })),
    };

    res.json(result);
  } catch (error) {
    console.error('Error updating physical item:', error);
    res.status(500).json({ error: 'Failed to update physical item' });
  }
});

/**
 * DELETE /api/physical-items/:id
 * Delete a physical item (protected)
 * Note: This deletes the physical item and its links, but keeps the media entry
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if physical item exists
    const existingItem = await db('physical_items').where('id', id).first();
    if (!existingItem) {
      return res.status(404).json({ error: 'Physical item not found' });
    }

    // Delete physical item (CASCADE will delete links automatically)
    await db('physical_items').where('id', id).delete();

    res.json({ message: 'Physical item deleted successfully' });
  } catch (error) {
    console.error('Error deleting physical item:', error);
    res.status(500).json({ error: 'Failed to delete physical item' });
  }
});

/**
 * POST /api/physical-items/:id/media
 * Add a media link to an existing physical item (protected)
 */
router.post('/:id/media', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { media } = req.body;

    // Check if physical item exists
    const existingItem = await db('physical_items').where('id', id).first();
    if (!existingItem) {
      return res.status(404).json({ error: 'Physical item not found' });
    }

    // Validate media data
    if (!media || typeof media !== 'object') {
      return res.status(400).json({ error: 'Media data is required' });
    }

    // Validate formats
    let mediaFormats: string[] = [];
    if (media.formats && Array.isArray(media.formats)) {
      mediaFormats = media.formats;
    } else if (media.format) {
      mediaFormats = [media.format];
    } else {
      mediaFormats = ['Blu-ray']; // Default
    }

    const validFormats = ['4K UHD', '3D Blu-ray', 'Blu-ray', 'DVD', 'Digital-HD', 'Digital-SD', 'Digital-UHD', 'LaserDisc', 'VHS'];
    for (const format of mediaFormats) {
      if (!validFormats.includes(format)) {
        return res.status(400).json({ 
          error: `Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}` 
        });
      }
    }

    await db.transaction(async (trx) => {
      let mediaId: number;

      if (media.id) {
        // Use existing media entry
        mediaId = media.id;
        
        // Check if already linked
        const existingLink = await trx('physical_item_media')
          .where({ physical_item_id: id, media_id: mediaId })
          .first();
        
        if (existingLink) {
          throw new Error('Media is already linked to this physical item');
        }
      } else {
        // Create new media entry
        if (!media.title) {
          throw new Error('Media title is required');
        }

        const mediaData: any = {
          title: media.title,
          tmdb_id: media.tmdb_id,
          synopsis: media.synopsis,
          cover_art_url: media.cover_art_url,
          release_date: media.release_date,
          director: media.director,
          cast: media.cast ? JSON.stringify(media.cast) : null,
          media_type: media.media_type || 'movie',
          tv_show_tmdb_id: media.tv_show_tmdb_id || null,
          tv_show_name: media.tv_show_name || null,
          season_number: media.season_number != null ? media.season_number : null,
          episode_count: media.episode_count != null ? media.episode_count : null,
        };

        if (media.genres) {
          mediaData.genres = typeof media.genres === 'string' ? media.genres : JSON.stringify(media.genres);
        }

        const [newMediaId] = await trx('media').insert(mediaData);
        mediaId = newMediaId;
      }

      // Create link with formats
      await trx('physical_item_media').insert({
        physical_item_id: id,
        media_id: mediaId,
        disc_number: media.disc_number,
        formats: JSON.stringify(mediaFormats),
      });

      // Recalculate physical item formats
      const allLinkedMedia = await trx('physical_item_media')
        .where('physical_item_id', id)
        .select('formats');
      
      const allFormats = new Set<string>();
      for (const link of allLinkedMedia) {
        if (link.formats) {
          const formats = JSON.parse(link.formats);
          formats.forEach((f: string) => allFormats.add(f));
        }
      }

      await trx('physical_items')
        .where('id', id)
        .update({
          physical_format: JSON.stringify(Array.from(allFormats).sort())
        });
    });

    // Fetch updated physical item with all media
    const updatedItem = await db('physical_items').where('id', id).first();
    const linkedMedia = await db('physical_item_media')
      .join('media', 'physical_item_media.media_id', 'media.id')
      .where('physical_item_media.physical_item_id', id)
      .select('media.*', 'physical_item_media.disc_number', 'physical_item_media.formats');

    const result: PhysicalItemWithMedia = {
      ...updatedItem,
      physical_format: JSON.parse(updatedItem.physical_format),
      media: linkedMedia.map(m => ({
        ...m,
        cast: m.cast ? JSON.parse(m.cast) : [],
        formats: m.formats ? JSON.parse(m.formats) : [],
      })),
    };

    res.json(result);
  } catch (error: any) {
    console.error('Error adding media link:', error);
    res.status(500).json({ error: error.message || 'Failed to add media link' });
  }
});

/**
 * DELETE /api/physical-items/:id/media/:mediaId
 * Remove a media link from a physical item (protected)
 */
router.delete('/:id/media/:mediaId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id, mediaId } = req.params;

    // Check if physical item exists
    const existingItem = await db('physical_items').where('id', id).first();
    if (!existingItem) {
      return res.status(404).json({ error: 'Physical item not found' });
    }

    // Check if link exists
    const existingLink = await db('physical_item_media')
      .where({ physical_item_id: id, media_id: mediaId })
      .first();

    if (!existingLink) {
      return res.status(404).json({ error: 'Media link not found' });
    }

    // Check if this is the last media link
    const linkCount = await db('physical_item_media')
      .where('physical_item_id', id)
      .count('* as count')
      .first();

    if (linkCount && parseInt(linkCount.count as string) <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last media link from a physical item' });
    }

    // Delete the link
    await db('physical_item_media')
      .where({ physical_item_id: id, media_id: mediaId })
      .delete();

    // Fetch updated physical item with all media
    const updatedItem = await db('physical_items').where('id', id).first();
    const linkedMedia = await db('physical_item_media')
      .join('media', 'physical_item_media.media_id', 'media.id')
      .where('physical_item_media.physical_item_id', id)
      .select('media.*', 'physical_item_media.disc_number', 'physical_item_media.formats');

    const result: PhysicalItemWithMedia = {
      ...updatedItem,
      physical_format: JSON.parse(updatedItem.physical_format),
      media: linkedMedia.map(m => ({
        ...m,
        cast: m.cast ? JSON.parse(m.cast) : [],
        formats: m.formats ? JSON.parse(m.formats) : [],
      })),
    };

    res.json(result);
  } catch (error) {
    console.error('Error removing media link:', error);
    res.status(500).json({ error: 'Failed to remove media link' });
  }
});

/**
 * POST /api/physical-items/bulk
 * Create multiple physical items (protected)
 */
router.post('/bulk', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    if (items.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 items allowed per request' });
    }

    const results = await Promise.allSettled(
      items.map(async (item: any) => {
        return db.transaction(async (trx) => {
          // Validate required fields
          if (!item.name || !item.physical_format || !item.media) {
            throw new Error('Name, physical_format, and media are required');
          }

          // Validate physical_format
          let formatArray: string[];
          if (Array.isArray(item.physical_format)) {
            formatArray = item.physical_format;
          } else if (typeof item.physical_format === 'string') {
            formatArray = [item.physical_format];
          } else {
            throw new Error('physical_format must be a string or array');
          }

          const validFormats = ['4K UHD', '3D Blu-ray', 'Blu-ray', 'DVD', 'Digital-HD', 'Digital-SD', 'Digital-UHD', 'LaserDisc', 'VHS'];
          for (const format of formatArray) {
            if (!validFormats.includes(format)) {
              throw new Error(`Invalid physical format: ${format}`);
            }
          }

          if (formatArray.length === 0) {
            throw new Error('At least one physical format is required');
          }

          // Create or get media entry
          let mediaId: number;
          
          if (item.media.id) {
            mediaId = item.media.id;
          } else {
            if (!item.media.title) {
              throw new Error('Media title is required');
            }

            const mediaData: any = {
              title: item.media.title,
              tmdb_id: item.media.tmdb_id,
              synopsis: item.media.synopsis,
              cover_art_url: item.media.cover_art_url,
              release_date: item.media.release_date,
              director: item.media.director,
              cast: item.media.cast ? JSON.stringify(item.media.cast) : null,
              media_type: item.media.media_type || 'movie',
              tv_show_tmdb_id: item.media.tv_show_tmdb_id || null,
              tv_show_name: item.media.tv_show_name || null,
              season_number: item.media.season_number != null ? item.media.season_number : null,
              episode_count: item.media.episode_count != null ? item.media.episode_count : null,
            };

            if (item.media.genres) {
              mediaData.genres = typeof item.media.genres === 'string' ? item.media.genres : JSON.stringify(item.media.genres);
            }

            const [newMediaId] = await trx('media').insert(mediaData);
            mediaId = newMediaId;
          }

          // Create physical item
          // Calculate sort_name if not provided, but allow user override
          const calculatedSortName = item.sort_name !== undefined ? item.sort_name : calculateSortName(item.name);
          const physicalItemData = {
            name: item.name,
            sort_name: calculatedSortName || null,
            physical_format: JSON.stringify(formatArray),
            edition_notes: item.edition_notes,
            custom_image_url: item.custom_image_url,
            purchase_date: item.purchase_date,
          };

          const [physicalItemId] = await trx('physical_items').insert(physicalItemData);

          // Link physical item to media with formats
          await trx('physical_item_media').insert({
            physical_item_id: physicalItemId,
            media_id: mediaId,
            disc_number: item.media.disc_number,
            formats: JSON.stringify(formatArray),
          });

          // Fetch created item with media
          const createdItem = await trx('physical_items').where('id', physicalItemId).first();
          const linkedMedia = await trx('physical_item_media')
            .join('media', 'physical_item_media.media_id', 'media.id')
            .where('physical_item_media.physical_item_id', physicalItemId)
            .select('media.*', 'physical_item_media.disc_number', 'physical_item_media.formats');

          return {
            success: true,
            physicalItem: {
              ...createdItem,
              physical_format: JSON.parse(createdItem.physical_format),
              media: linkedMedia.map(m => ({
                ...m,
                cast: m.cast ? JSON.parse(m.cast) : [],
              })),
            },
            originalName: item.name,
          };
        });
      })
    );

    const successful: any[] = [];
    const failed: any[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push({
          originalName: items[index].name,
          error: result.reason.message,
        });
      }
    });

    res.status(201).json({
      successful,
      failed,
      summary: {
        total: items.length,
        successful: successful.length,
        failed: failed.length,
      },
    });
  } catch (error) {
    console.error('Error creating bulk physical items:', error);
    res.status(500).json({ error: 'Failed to create physical items' });
  }
});

/**
 * PUT /api/physical-items/:id/media/:mediaId/formats
 * Update formats for a specific movie in a physical item (protected)
 */
router.put('/:id/media/:mediaId/formats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id, mediaId } = req.params;
    const { formats } = req.body;

    // Validate input
    if (!formats || !Array.isArray(formats) || formats.length === 0) {
      return res.status(400).json({ error: 'Formats array is required and must contain at least one format' });
    }

    // Validate formats
    const validFormats = ['4K UHD', '3D Blu-ray', 'Blu-ray', 'DVD', 'Digital-HD', 'Digital-SD', 'Digital-UHD', 'LaserDisc', 'VHS'];
    for (const format of formats) {
      if (!validFormats.includes(format)) {
        return res.status(400).json({ 
          error: `Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}` 
        });
      }
    }

    // Check if physical item exists
    const existingItem = await db('physical_items').where('id', id).first();
    if (!existingItem) {
      return res.status(404).json({ error: 'Physical item not found' });
    }

    // Check if media link exists
    const existingLink = await db('physical_item_media')
      .where({ physical_item_id: id, media_id: mediaId })
      .first();

    if (!existingLink) {
      return res.status(404).json({ error: 'Media link not found' });
    }

    // Update formats in transaction
    await db.transaction(async (trx) => {
      // Update the formats for this specific movie
      await trx('physical_item_media')
        .where({ physical_item_id: id, media_id: mediaId })
        .update({ formats: JSON.stringify(formats) });

      // Recalculate physical item formats based on all linked media
      const allLinkedMedia = await trx('physical_item_media')
        .where('physical_item_id', id)
        .select('formats');
      
      const allFormats = new Set<string>();
      for (const link of allLinkedMedia) {
        if (link.formats) {
          const linkFormats = JSON.parse(link.formats);
          linkFormats.forEach((f: string) => allFormats.add(f));
        }
      }

      // Update the parent physical item's format field
      await trx('physical_items')
        .where('id', id)
        .update({
          physical_format: JSON.stringify(Array.from(allFormats).sort())
        });
    });

    // Fetch updated physical item with all media
    const updatedItem = await db('physical_items').where('id', id).first();
    const linkedMedia = await db('physical_item_media')
      .join('media', 'physical_item_media.media_id', 'media.id')
      .where('physical_item_media.physical_item_id', id)
      .select('media.*', 'physical_item_media.disc_number', 'physical_item_media.formats');

    const result: PhysicalItemWithMedia = {
      ...updatedItem,
      physical_format: JSON.parse(updatedItem.physical_format),
      store_links: updatedItem.store_links ? JSON.parse(updatedItem.store_links) : [],
      media: linkedMedia.map(m => ({
        ...m,
        cast: m.cast ? JSON.parse(m.cast) : [],
        formats: m.formats ? JSON.parse(m.formats) : [],
      })),
    };

    res.json(result);
  } catch (error) {
    console.error('Error updating movie formats:', error);
    res.status(500).json({ error: 'Failed to update movie formats' });
  }
});

/**
 * PATCH /api/physical-items/:id/spine-colors
 * Update spine colors for a physical item (protected)
 */
router.patch('/:id/spine-colors', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { spine_color, spine_color_accent, auto_detect } = req.body;

    const existingItem = await db('physical_items').where('id', id).first();
    if (!existingItem) {
      return res.status(404).json({ error: 'Physical item not found' });
    }

    if (auto_detect) {
      // Auto-detect colors from cover art
      const linkedMedia = await db('physical_item_media')
        .join('media', 'physical_item_media.media_id', 'media.id')
        .where('physical_item_media.physical_item_id', id)
        .select('media.cover_art_url')
        .orderBy('physical_item_media.disc_number', 'asc')
        .first();

      const coverUrl = existingItem.custom_image_url || linkedMedia?.cover_art_url;
      if (coverUrl) {
        const colors = await extractSpineColors(coverUrl, existingItem.name);
        await db('physical_items').where('id', id).update({
          spine_color: colors.dominant,
          spine_color_accent: colors.accent,
        });
        const updated = await db('physical_items').where('id', id).first();
        return res.json({
          spine_color: updated.spine_color,
          spine_color_accent: updated.spine_color_accent,
        });
      } else {
        return res.status(400).json({ error: 'No cover art available for color detection' });
      }
    }

    // Manual color override
    const updateData: any = {};
    if (spine_color !== undefined) updateData.spine_color = spine_color || null;
    if (spine_color_accent !== undefined) updateData.spine_color_accent = spine_color_accent || null;

    await db('physical_items').where('id', id).update(updateData);
    const updated = await db('physical_items').where('id', id).first();
    res.json({
      spine_color: updated.spine_color,
      spine_color_accent: updated.spine_color_accent,
    });
  } catch (error) {
    console.error('Error updating spine colors:', error);
    res.status(500).json({ error: 'Failed to update spine colors' });
  }
});

export default router;

