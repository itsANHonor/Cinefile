import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  addPhysicalItem,
  CANONICAL_FORMATS,
  checkSeriesCompleteness,
  deletePhysicalItem,
  findItemOnShelf,
  getCollectionFacets,
  getCollectionStats,
  getItemDetails,
  getRecentAcquisitions,
  getSeriesDetails,
  getShelfLayout,
  listSeries,
  placeItemOnShelf,
  recommendForMood,
  searchCollection,
  searchTmdb,
  updatePhysicalItem,
} from './mcp.service';

function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
  };
}

export function createCinefileMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'cinefile-mcp',
      version: '2.0.0',
    },
    {
      instructions:
        'Cinefile MCP Server provides access to a personal physical media collection (4K UHD, Blu-ray, 3D Blu-ray, DVD, LaserDisc, VHS, Digital) and physical shelf locations. ' +
        'Use `get_collection_facets` to discover available genres, decades, formats, and edition tags before filtering. ' +
        'Use `recommend_for_mood` when helping the user pick something to watch, and `find_item_on_shelf` to tell them exactly which shelf and position to grab the disc from.',
    },
  );

  // Wrapper around server.registerTool to avoid TS 5.1 exponential generic instantiation on ZodRawShapeCompat
  const registerTool = <S extends z.ZodRawShape>(
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema: S;
      annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
      };
    },
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<any>,
  ) => {
    (server as any).registerTool(name, config, handler);
  };

  const registerResource = (
    name: string,
    uri: string,
    metadata: { title?: string; description?: string; mimeType?: string },
    handler: (uri: URL) => Promise<any>,
  ) => {
    (server as any).registerResource(name, uri, metadata, handler);
  };

  const registerPrompt = <S extends z.ZodRawShape>(
    name: string,
    config: { title?: string; description?: string; argsSchema: S },
    handler: (args: z.infer<z.ZodObject<S>>) => any,
  ) => {
    (server as any).registerPrompt(name, config, handler);
  };

  // ============================================================================
  // Domain 1: Collection Search, Browse & Mood Discovery (Read-Only)
  // ============================================================================

  registerTool(
    'search_collection',
    {
      title: 'Search & Filter Collection',
      description:
        'Search and filter physical media items and movies/TV seasons in the Cinefile collection. ' +
        'Supports filtering by keyword query, physical formats, genres (by name or ID), decades, release year range, director, actor, edition tags (e.g. Criterion, Steelbook), and media type. ' +
        'Defaults to `minimal=true` for compact token-friendly output; pass `minimal=false` or call `get_item_details` for full synopses, cast lists, and notes.',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe('Keyword search matching title, director, actor, synopsis, or edition notes'),
        formats: z
          .array(z.string())
          .optional()
          .describe(`Filter by physical formats (${CANONICAL_FORMATS.join(', ')})`),
        genres: z
          .array(z.string())
          .optional()
          .describe('Filter by genre names (e.g. ["Horror", "Science Fiction"]) or numeric genre IDs'),
        decades: z
          .array(z.string())
          .optional()
          .describe('Filter by decades (e.g. ["1970", "1980", "1990"])'),
        year_min: z.number().int().optional().describe('Minimum release year (inclusive)'),
        year_max: z.number().int().optional().describe('Maximum release year (inclusive)'),
        director: z.string().optional().describe('Filter by director name (partial match)'),
        actor: z.string().optional().describe('Filter by cast member name (partial match)'),
        edition_tag: z
          .string()
          .optional()
          .describe('Filter by edition tag(s), comma-separated (e.g. "Criterion", "Steelbook")'),
        version_tag: z
          .string()
          .optional()
          .describe('Filter by movie version/cut tag(s), comma-separated (e.g. "Extended", "Director\'s Cut", "Theatrical")'),
        media_type: z
          .enum(['movie', 'tv_season', 'all'])
          .optional()
          .default('all')
          .describe('Filter by media type: movie, tv_season, or all'),
        archived: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to search archived/removed items instead of active collection'),
        sort_by: z
          .enum(['title', 'release_date', 'created_at', 'purchase_date', 'director_last_name'])
          .optional()
          .default('title')
          .describe('Field to sort results by'),
        sort_order: z.enum(['asc', 'desc']).optional().default('asc').describe('Sort direction'),
        page: z.number().int().min(1).optional().default(1).describe('Page number (1-based)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(25)
          .describe('Items per page (max 100)'),
        minimal: z
          .boolean()
          .optional()
          .default(true)
          .describe('Return compact summaries to save context tokens (default true)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const res = await searchCollection(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerTool(
    'get_item_details',
    {
      title: 'Get Item or Media Details',
      description:
        'Fetch full details for a specific physical item (by `physical_item_id`) or media work (by `media_id`), ' +
        'including all linked discs, full cast, synopsis, genres, edition tags, notes, purchase date, store links, series membership, and physical shelf placement.',
      inputSchema: {
        physical_item_id: z.number().int().optional().describe('ID of the physical item'),
        media_id: z.number().int().optional().describe('ID of the movie/TV season media record'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const res = await getItemDetails(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerTool(
    'recommend_for_mood',
    {
      title: 'Recommend Movies for Mood',
      description:
        'Select and sample movies or TV seasons from the user\'s owned collection based on mood, genre preferences, genres to exclude, decades, year range, playback format (e.g. 4K UHD), director, actor, or theme keywords. ' +
        'Returns rich details (synopsis, cast, director, format, edition tags, and exact physical shelf location) so you can pitch tailored recommendations.',
      inputSchema: {
        genres: z
          .array(z.string())
          .optional()
          .describe('Desired genre names (e.g. ["Thriller", "Mystery", "Sci-Fi"])'),
        exclude_genres: z
          .array(z.string())
          .optional()
          .describe('Genre names to exclude (e.g. ["Horror", "Family"])'),
        decades: z
          .array(z.string())
          .optional()
          .describe('Desired decades (e.g. ["1980", "1990"])'),
        year_min: z.number().int().optional().describe('Minimum release year'),
        year_max: z.number().int().optional().describe('Maximum release year'),
        formats: z
          .array(z.string())
          .optional()
          .describe('Preferred physical formats (e.g. ["4K UHD", "Blu-ray"])'),
        keyword: z
          .string()
          .optional()
          .describe('Optional keyword matched against synopsis, title, or edition notes'),
        director: z.string().optional().describe('Optional director name filter'),
        actor: z.string().optional().describe('Optional actor name filter'),
        media_type: z
          .enum(['movie', 'tv_season', 'all'])
          .optional()
          .default('movie')
          .describe('Media type to recommend (default: movie)'),
        count: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .default(5)
          .describe('Number of recommendations to return (1-20, default 5)'),
        random_sample: z
          .boolean()
          .optional()
          .default(true)
          .describe('Randomly sample from matching items so repeated calls yield fresh suggestions'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (args) => {
      try {
        const res = await recommendForMood(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerTool(
    'get_collection_facets',
    {
      title: 'Get Collection Facets',
      description:
        'List all available genres, decades, physical formats, and canonical edition tags (e.g. Steelbook, Criterion) present in the collection along with their item counts.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const res = await getCollectionFacets();
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ============================================================================
  // Domain 2: Statistics & Collection Analytics (Read-Only)
  // ============================================================================

  registerTool(
    'get_collection_stats',
    {
      title: 'Get Collection Statistics',
      description:
        'Get comprehensive collection analytics: overview counts, format breakdown, decade distribution, oldest/newest releases, top directors, top actors, top franchises, format double-dips (titles owned across multiple formats/editions), physical shelf utilization & linear footage (mm), spine color palette, and acquisition timeline/top stores.',
      inputSchema: {
        section: z
          .enum(['all', 'overview', 'formats', 'content', 'physical_library', 'acquisitions'])
          .optional()
          .default('all')
          .describe('Return all statistics or a specific section'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ section }) => {
      try {
        const res = await getCollectionStats(section);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerTool(
    'get_recent_acquisitions',
    {
      title: 'Get Recent Acquisitions',
      description:
        'List the most recently purchased or recently cataloged physical items in the collection.',
      inputSchema: {
        by: z
          .enum(['purchase_date', 'created_at'])
          .optional()
          .default('purchase_date')
          .describe('Sort by purchase_date or created_at timestamp'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe('Number of recent items to return (max 50)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const res = await getRecentAcquisitions(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ============================================================================
  // Domain 3: Series, Franchises & TMDB Intelligence (Read-Only)
  // ============================================================================

  registerTool(
    'list_series',
    {
      title: 'List Movie Series & Franchises',
      description:
        'List all series/franchises configured in the collection with owned movie counts, internal sort methods, and linked TMDB collection IDs.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const res = await listSeries();
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerTool(
    'get_series_details',
    {
      title: 'Get Series Details & Owned Movies',
      description:
        'Get a specific series/franchise by `series_id` or `name`, returning all owned movies in their configured watch/sort order along with the physical items and formats they belong to.',
      inputSchema: {
        series_id: z.number().int().optional().describe('ID of the series'),
        name: z.string().optional().describe('Name of the series (exact or partial match)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const res = await getSeriesDetails(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerTool(
    'check_series_completeness',
    {
      title: 'Check Series / Franchise Completeness via TMDB',
      description:
        'Compare an owned series (or a TMDB Collection ID) against The Movie Database (TMDB) canonical collection to identify which films in the franchise are owned and which are missing from the user\'s collection.',
      inputSchema: {
        series_id: z.number().int().optional().describe('Local Cinefile series ID'),
        series_name: z.string().optional().describe('Local Cinefile series name'),
        tmdb_collection_id: z
          .number()
          .int()
          .optional()
          .describe('Explicit TMDB Collection ID if not already linked on the local series'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const res = await checkSeriesCompleteness(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerTool(
    'search_tmdb',
    {
      title: 'Search TMDB & Check Collection Ownership',
      description:
        'Search The Movie Database (TMDB) for movies or TV shows by title. Returns TMDB metadata (ID, release date, overview, and optional full cast/director/runtime) and flags whether each result is already owned in the local Cinefile collection.',
      inputSchema: {
        query: z.string().min(1).describe('Movie or TV show title to search on TMDB'),
        media_type: z
          .enum(['movie', 'tv'])
          .optional()
          .default('movie')
          .describe('Search movies or TV shows'),
        include_details: z
          .boolean()
          .optional()
          .default(false)
          .describe('Fetch full credits (director, cast, genres, runtime) for top matches'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const res = await searchTmdb(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ============================================================================
  // Domain 4: Physical Library & Shelf Management (Read + Write)
  // ============================================================================

  registerTool(
    'get_shelf_layout',
    {
      title: 'Get Physical Library & Shelf Layout',
      description:
        'Inspect the physical library hierarchy (shelf groups, shelves, capacity units, used units, and utilization percentage). Can optionally include the ordered list of items on each shelf or list unassigned items not yet placed on any shelf.',
      inputSchema: {
        group_id: z.number().int().optional().describe('Filter to a specific shelf group ID'),
        shelf_id: z.number().int().optional().describe('Filter to a specific shelf ID'),
        include_items: z
          .boolean()
          .optional()
          .describe('Include the ordered list of physical items placed on each shelf'),
        unassigned_only: z
          .boolean()
          .optional()
          .default(false)
          .describe('If true, return only physical items not currently assigned to any shelf'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const res = await getShelfLayout(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerTool(
    'find_item_on_shelf',
    {
      title: 'Find Item on Physical Shelf',
      description:
        'Locate where a movie or physical item lives on the user\'s physical shelves. Returns the shelf group name, shelf name, 1-based position from the left, and the immediate left/right neighboring items so the user can walk over and grab it.',
      inputSchema: {
        query: z.string().optional().describe('Movie title or physical item name to locate'),
        physical_item_id: z.number().int().optional().describe('Exact physical item ID to locate'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const res = await findItemOnShelf(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerTool(
    'place_item_on_shelf',
    {
      title: 'Place or Move Item on Shelf',
      description:
        'Place or move a physical item onto a specific physical shelf at an optional position (0-based from left), or pass `shelf_id: null` to unassign the item from its shelf.',
      inputSchema: {
        physical_item_id: z.number().int().describe('ID of the physical item to place or unassign'),
        shelf_id: z
          .number()
          .int()
          .nullable()
          .describe('Target shelf ID, or null to remove the item from all shelves'),
        position: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Optional 0-based position on the shelf (appends to end if omitted)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const res = await placeItemOnShelf(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ============================================================================
  // Domain 5: Collection CRUD Management (Write)
  // ============================================================================

  registerTool(
    'add_physical_item',
    {
      title: 'Add Physical Item to Collection',
      description:
        'Add a new physical media item (single movie, multi-film box set, or TV season) to the collection. ' +
        'If `tmdb_id` is provided (either at top-level or inside `media` entries), metadata (title, synopsis, release date, director, cast, genres, cover art) is automatically fetched from TMDB!',
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe('Display name of the physical item (defaults to the first movie title if omitted)'),
        tmdb_id: z
          .number()
          .int()
          .optional()
          .describe('TMDB movie ID for a single-film physical item (auto-fetches metadata)'),
        formats: z
          .array(z.string())
          .optional()
          .describe(`Physical formats for the item (${CANONICAL_FORMATS.join(', ')})`),
        edition_notes: z
          .string()
          .optional()
          .describe('Comma-separated edition tags (e.g. "Criterion, Steelbook, Limited Edition")'),
        notes: z.string().optional().describe('Personal notes about this copy (max 2000 chars)'),
        notes_public: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether notes should be visible on the public read-only gallery'),
        purchase_date: z
          .string()
          .optional()
          .describe('Purchase date in YYYY-MM-DD format'),
        store_links: z
          .array(
            z.object({
              label: z.string(),
              url: z.string().url(),
            }),
          )
          .optional()
          .describe('Store/retailer links where this item was purchased or listed'),
        thickness_units: z
          .number()
          .int()
          .min(1)
          .optional()
          .default(1)
          .describe('Physical case thickness in standard Blu-ray units (default 1)'),
        sort_series_id: z
          .number()
          .int()
          .optional()
          .describe('Optional series ID used when sorting collection by series'),
        media_primary_series_id: z
          .number()
          .int()
          .optional()
          .describe('Optional series ID to associate all linked media with as their primary series'),
        shelf_id: z
          .number()
          .int()
          .optional()
          .describe('Optional shelf ID to immediately place the new item onto'),
        media: z
          .array(
            z.object({
              id: z.number().int().optional().describe('Existing local media ID to link'),
              tmdb_id: z.number().int().optional().describe('TMDB movie ID (auto-fetches metadata)'),
              title: z.string().optional().describe('Title (required only if tmdb_id is omitted)'),
              synopsis: z.string().optional(),
              cover_art_url: z.string().optional(),
              release_date: z.string().optional(),
              director: z.string().optional(),
              cast: z.array(z.string()).optional(),
              media_type: z.enum(['movie', 'tv_season']).optional().default('movie'),
              tv_show_tmdb_id: z
                .number()
                .int()
                .optional()
                .describe('TMDB TV show ID when adding a tv_season'),
              season_number: z
                .number()
                .int()
                .optional()
                .describe('Season number when adding a tv_season'),
              disc_number: z.number().int().optional().default(1),
              formats: z.array(z.string()).optional(),
              version_notes: z
                .string()
                .optional()
                .describe('Optional comma-separated movie version/cut tags (e.g. "Theatrical", "Extended", "Director\'s Cut")'),
            }),
          )
          .optional()
          .describe('Array of movies/TV seasons included in this physical item (for multi-disc/box sets or manual entries)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (args) => {
      try {
        const res = await addPhysicalItem(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerTool(
    'update_physical_item',
    {
      title: 'Update Physical Item',
      description:
        'Update metadata on an existing physical item in the collection (name, formats, edition tags, notes, purchase date, store links, thickness units, series associations, or archive status).',
      inputSchema: {
        physical_item_id: z.number().int().describe('ID of the physical item to update'),
        name: z.string().optional().describe('Updated item name'),
        physical_format: z
          .array(z.string())
          .optional()
          .describe(`Updated physical formats (${CANONICAL_FORMATS.join(', ')})`),
        edition_notes: z
          .string()
          .nullable()
          .optional()
          .describe('Updated comma-separated edition tags (or null to clear)'),
        notes: z.string().nullable().optional().describe('Updated personal notes (or null to clear)'),
        notes_public: z.boolean().optional().describe('Whether notes are publicly visible'),
        purchase_date: z
          .string()
          .nullable()
          .optional()
          .describe('Updated purchase date YYYY-MM-DD (or null to clear)'),
        store_links: z
          .array(
            z.object({
              label: z.string(),
              url: z.string().url(),
            }),
          )
          .nullable()
          .optional()
          .describe('Updated store links array (or null to clear)'),
        thickness_units: z.number().int().min(1).optional().describe('Updated thickness in standard units'),
        sort_series_id: z.number().int().nullable().optional().describe('Updated sort series ID'),
        media_primary_series_id: z
          .number()
          .int()
          .nullable()
          .optional()
          .describe('Set primary series ID on all media linked to this item'),
        archived: z.boolean().optional().describe('Archive or unarchive this physical item'),
        archive_reason: z
          .string()
          .nullable()
          .optional()
          .describe('Reason for archiving (required when setting archived=true, e.g. "Sold", "Upgraded to 4K")'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const res = await updatePhysicalItem(args);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerTool(
    'delete_physical_item',
    {
      title: 'Delete Physical Item',
      description:
        'Permanently delete a physical item from the collection by ID. (Consider archiving via `update_physical_item` with `archived: true` if the item was sold or upgraded.)',
      inputSchema: {
        physical_item_id: z.number().int().describe('ID of the physical item to delete'),
        delete_orphaned_media: z
          .boolean()
          .optional()
          .default(true)
          .describe('Also delete linked movie/TV media entries if no other physical item references them (default true)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async ({ physical_item_id, delete_orphaned_media }) => {
      try {
        const res = await deletePhysicalItem(physical_item_id, delete_orphaned_media);
        return jsonResult(res);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ============================================================================
  // MCP Resources
  // ============================================================================

  registerResource(
    'collection-stats-summary',
    'cinefile://stats/summary',
    {
      title: 'Cinefile Collection Statistics Summary',
      description: 'Live overview of the physical media collection, format distribution, and shelf usage.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const stats = await getCollectionStats('all');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    },
  );

  registerResource(
    'collection-facets',
    'cinefile://facets',
    {
      title: 'Cinefile Collection Facets',
      description: 'Available genres, decades, physical formats, and edition tags in the collection.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const facets = await getCollectionFacets();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(facets, null, 2),
          },
        ],
      };
    },
  );

  registerResource(
    'physical-library-shelves',
    'cinefile://library/shelves',
    {
      title: 'Cinefile Physical Library Shelves',
      description: 'Hierarchy of shelf groups, shelves, capacity units, and utilization.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const layout = await getShelfLayout({ include_items: false });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(layout, null, 2),
          },
        ],
      };
    },
  );

  // ============================================================================
  // MCP Prompts
  // ============================================================================

  registerPrompt(
    'movie-night-picker',
    {
      title: 'Movie Night Mood Picker',
      description: 'Recommend 3-5 movies from my physical collection based on my mood and tell me which shelf to grab them from.',
      argsSchema: {
        mood: z.string().describe('What mood or vibe are you in tonight? (e.g. "cozy 90s thriller", "mind-bending sci-fi")'),
        preferred_format: z.string().optional().describe('Optional preferred format (e.g. "4K UHD", "Blu-ray", "VHS")'),
        decade: z.string().optional().describe('Optional decade preference (e.g. "1980", "1990")'),
      },
    },
    ({ mood, preferred_format, decade }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `I want to pick a movie to watch tonight from my Cinefile physical media collection.\n` +
              `- Mood / vibe: ${mood}\n` +
              (preferred_format ? `- Preferred format: ${preferred_format}\n` : '') +
              (decade ? `- Preferred decade: ${decade}\n` : '') +
              `\nPlease:\n` +
              `1. Call \`get_collection_facets\` if needed to see what genres/formats I own.\n` +
              `2. Use \`recommend_for_mood\` (and/or \`search_collection\`) to sample matching titles from my collection.\n` +
              `3. Pitch 3 to 5 great options with a short explanation of why each fits my mood, what format/edition I own it in, and the exact shelf & position where I can grab the disc.`,
          },
        },
      ],
    }),
  );

  registerPrompt(
    'franchise-gap-analysis',
    {
      title: 'Franchise & Series Gap Analysis',
      description: 'Check which installments are missing from the movie series/franchises I collect.',
      argsSchema: {
        series_name: z.string().optional().describe('Optional specific series name to check (checks top series if omitted)'),
      },
    },
    ({ series_name }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: series_name
              ? `Please check my "${series_name}" series in Cinefile using \`check_series_completeness\` and tell me which movies I own, which installments I'm missing according to TMDB, and their release dates.`
              : `Please list my movie series using \`list_series\`, run \`check_series_completeness\` on my major franchises, and give me a summary of which series are complete and which ones have missing installments I might want to hunt down.`,
          },
        },
      ],
    }),
  );

  registerPrompt(
    'collection-curator-report',
    {
      title: 'Collection Curator Insights & Stats Report',
      description: 'Generate an insightful curator breakdown of my physical media collection, double-dips, top creators, and shelf space.',
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Please call \`get_collection_stats\` and \`get_collection_facets\` and give me a fun, detailed curator's report on my physical media collection, including:\n` +
              `- Collection size, format breakdown (4K UHD vs Blu-ray vs legacy formats), and edition highlights\n` +
              `- My most-collected directors, actors, decades, and genres\n` +
              `- Notable format "double-dips" (movies I own multiple copies/formats of)\n` +
              `- Physical shelf utilization, linear shelf footprint, and how many unassigned items need shelving.`,
          },
        },
      ],
    }),
  );

  return server;
}
