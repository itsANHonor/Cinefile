// Series types
export interface Series {
  id: number;
  name: string;
  sort_name: string;
  tmdb_collection_id?: number;
  internal_sort_method?: 'chronological' | 'custom' | 'alphabetical';
  movie_count?: number;
  created_at?: string;
  updated_at?: string;
  auto_populated?: {
    tmdb_collection_id: number;
    collection_name: string;
    collection_parts_count: number;
    matched_count: number;
    added_count: number;
    already_linked_count: number;
    added_titles: string[];
  } | null;
}

export interface PopulateSeriesResponse {
  series: Series;
  tmdb_collection_id: number;
  collection_name: string;
  collection_parts_count: number;
  matched_count: number;
  added_count: number;
  already_linked_count: number;
  added_titles: string[];
}

export interface MovieSeries {
  id: number;
  media_id: number;
  series_id: number;
  sort_order?: number;
  auto_sort: boolean;
  series?: Series;
}

// Media types (pure movie/TV metadata, no physical ownership info)
export interface Media {
  id: number;
  title: string;
  original_title?: string | null;
  original_language?: string | null;
  tmdb_id?: number;
  synopsis?: string;
  cover_art_url?: string;
  release_date?: string;
  director?: string;
  cast?: string[];
  genres?: { id: number; name: string }[];
  series?: Series[];
  primary_series_id?: number;
  // TV show specific fields
  media_type?: 'movie' | 'tv_season';
  tv_show_tmdb_id?: number;
  tv_show_name?: string;
  season_number?: number;
  episode_count?: number;
  // Letterboxd integration fields
  letterboxd_rating?: number | null;
  letterboxd_liked?: boolean;
  letterboxd_watched?: boolean;
  letterboxd_last_watched_date?: string | null;
  letterboxd_rewatch?: boolean;
  letterboxd_uri?: string | null;
  letterboxd_updated_at?: string | null;
  created_at?: string;
  updated_at?: string;
  link_id?: number; // For junction table row ID (physical_item_media.id)
  disc_number?: number; // For junction table data
  formats?: string[]; // For junction table data - per-movie formats
  version_notes?: string | null; // For junction table data - per-movie version/cut tags
}

export interface CollectionMediaPhysicalItem {
  id: number;
  name: string;
  physical_format: string[];
  formats: string[];
  edition_notes?: string;
  version_notes?: string | null;
  disc_number?: number;
  custom_image_url?: string;
  custom_images?: CustomImage[];
  purchase_date?: string;
  cost?: number | null;
  notes?: string;
  archived?: boolean;
  archive_reason?: string | null;
  thickness_units: number;
  media_count: number;
  shelf_placement?: (ShelfPlacement & {
    shelf_display_name?: string;
    group_display_name?: string;
  }) | null;
  created_at?: string;
}

export interface CollectionMedia extends Media {
  owned_formats: string[];
  owned_editions: string[];
  owned_versions: string[];
  physical_item_count: number;
  physical_items: CollectionMediaPhysicalItem[];
}

export interface LetterboxdFuzzySuggestion {
  mediaId: number;
  mediaTitle: string;
  mediaYear: number | null;
  mediaCoverArtUrl: string | null;
  mediaDirector: string | null;
  cacheId: number;
  letterboxdTitle: string;
  letterboxdYear: number | null;
  rating: number | null;
  liked: boolean;
  lastWatchedDate: string | null;
  rewatch: boolean;
  letterboxdUri: string | null;
  confidence: number;
  reason: string;
}

export interface LetterboxdSyncSummary {
  status: 'success' | 'error';
  source: 'rss' | 'export';
  syncedAt: string;
  itemsProcessed: number;
  totalCached: number;
  matchedInCollection: number;
  fuzzySuggestionsCount: number;
  error?: string | null;
}

export interface LetterboxdStatusResponse {
  configured: boolean;
  username: string;
  autoSync: boolean;
  syncIntervalHours: number;
  lastSyncAt: string | null;
  lastSyncStatus: LetterboxdSyncSummary | null;
  totalCachedFilms: number;
  matchedMoviesCount: number;
  totalCollectionMovies: number;
  fuzzySuggestions: LetterboxdFuzzySuggestion[];
}

export interface LetterboxdCacheItem {
  id: number;
  tmdbId: number | null;
  matchedMediaId: number | null;
  filmTitle: string;
  filmYear: number | null;
  rating: number | null;
  liked: boolean;
  watched: boolean;
  lastWatchedDate: string | null;
  rewatch: boolean;
  letterboxdUri: string | null;
  source: 'rss' | 'export';
}

export interface CreateMediaDto {
  title: string;
  original_title?: string | null;
  original_language?: string | null;
  tmdb_id?: number;
  synopsis?: string;
  cover_art_url?: string;
  release_date?: string;
  director?: string;
  cast?: string[];
  media_type?: 'movie' | 'tv_season';
  tv_show_tmdb_id?: number;
  tv_show_name?: string;
  season_number?: number;
  episode_count?: number;
  genres?: { id: number; name: string }[];
}

export interface UpdateMediaDto extends Partial<CreateMediaDto> {
  series_associations?: Array<{
    series_id: number;
    sort_order?: number | null;
    auto_sort?: boolean;
  }>;
  primary_series_id?: number | null;
}

export interface ManualMovieData {
  title: string;
  original_title?: string;
  synopsis: string;
  director: string;
  release_date: string;
  cast: string[];
  cover_art_url: string;
  media_type?: 'movie' | 'tv_season';
  tv_show_name?: string;
  season_number?: number;
  episode_count?: number;
}

// Unified Search types
export interface UnifiedSearchResult {
  id: number;
  title: string;
  original_title?: string | null;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  cover_art_url?: string | null;
  director?: string;
  source: 'database' | 'tmdb' | 'manual';
  tmdb_id?: number;
  media_type?: 'movie' | 'tv_season';
  originalData: Media | TMDbMovie | TMDbTVShow | ManualMovieData;
}

// Physical Item types (what you actually own)
export interface ImageFrame {
  /**
   * 'fill' (default) crops the photo into the fixed card frame, positioned by
   * panX/panY and magnified by zoom. 'fit' shows the whole photo letterboxed
   * over an ambient blurred backdrop - best for wide box sets.
   */
  fit?: 'fill' | 'fit';
  /** Focal point percentages (0-100) for crop positioning in 'fill' mode. */
  panX?: number;
  panY?: number;
  /** Additional zoom multiplier (1-3) in 'fill' mode. */
  zoom?: number;
}

export interface CustomImage {
  url: string;
  label?: string | null;
  frame?: ImageFrame;
}

export interface PhysicalItem {
  id: number;
  name: string;
  sort_name?: string;
  physical_format: string[];
  edition_notes?: string;
  notes?: string;
  notes_public?: boolean;
  archived?: boolean;
  archive_reason?: string | null;
  custom_image_url?: string;
  custom_images?: CustomImage[];
  purchase_date?: string;
  cost?: number | null;
  barcode?: string | null;
  asin?: string | null;
  store_links?: Array<{label: string; url: string}>;
  primary_series_id?: number; // Legacy - still present but being phased out
  sort_series_id?: number; // Used for sorting by series
  // Physical dimensions
  thickness_units: number; // How many standard cases thick (default 1)
  width_mm?: number;       // Optional precise width override
  height_mm?: number;      // Optional precise height override
  depth_mm?: number;       // Optional precise depth override
  // Spine display colors
  spine_color?: string;        // Dominant color for spine display (e.g. '#1a3c5e')
  spine_color_accent?: string; // Text/accent color for spine display (e.g. '#e8d4a0')
  // Shelf placement info (populated when fetching)
  shelf_placement?: ShelfPlacement;
  created_at?: string;
  updated_at?: string;
  media: Media[]; // Linked media entries
}

export interface CreatePhysicalItemDto {
  name: string;
  sort_name?: string;
  edition_notes?: string;
  notes?: string;
  notes_public?: boolean;
  archived?: boolean;
  archive_reason?: string | null;
  custom_image_url?: string;
  custom_images?: CustomImage[];
  purchase_date?: string;
  cost?: number | null;
  barcode?: string | null;
  asin?: string | null;
  store_links?: Array<{label: string; url: string}>;
  sort_series_id?: number; // Used for sorting by series
  media_primary_series_id?: number; // When set, adds all media to this series
  media: {
    id?: number; // If linking to existing media
    title?: string; // If creating new media
    original_title?: string | null;
    original_language?: string | null;
    tmdb_id?: number;
    synopsis?: string;
    cover_art_url?: string;
    release_date?: string;
    director?: string;
    cast?: string[];
    disc_number?: number;
    formats?: string[]; // Per-movie formats
    version_notes?: string | null; // Per-movie version/cut tags
    media_type?: 'movie' | 'tv_season';
    tv_show_tmdb_id?: number;
    tv_show_name?: string;
    season_number?: number;
    episode_count?: number;
    genres?: { id: number; name: string }[];
  }[] | {
    id?: number;
    title?: string;
    original_title?: string | null;
    original_language?: string | null;
    tmdb_id?: number;
    synopsis?: string;
    cover_art_url?: string;
    release_date?: string;
    director?: string;
    cast?: string[];
    disc_number?: number;
    formats?: string[];
    version_notes?: string | null;
    media_type?: 'movie' | 'tv_season';
    tv_show_tmdb_id?: number;
    tv_show_name?: string;
    season_number?: number;
    episode_count?: number;
    genres?: { id: number; name: string }[];
  };
}

export type UpdatePhysicalItemDto = Partial<Omit<CreatePhysicalItemDto, 'media'>>;

// TMDb types
export interface TMDbMovie {
  id: number;
  title: string;
  original_title?: string;
  original_language?: string;
  overview: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
}

export interface TMDbMovieDetails extends TMDbMovie {
  backdrop_path: string | null;
  runtime: number;
  genres: { id: number; name: string }[];
  director?: string;
  cast?: string[];
  poster_url?: string;
}

export interface TMDbSearchResponse {
  page: number;
  results: TMDbMovie[];
  total_pages: number;
  total_results: number;
}

// TMDb TV types
export interface TMDbTVShow {
  id: number;
  name: string;
  original_name?: string;
  original_language?: string;
  overview: string;
  poster_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
}

export interface TMDbTVShowDetails extends TMDbTVShow {
  backdrop_path: string | null;
  last_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  status: string;
  genres: { id: number; name: string }[];
  created_by: { id: number; name: string; profile_path: string | null }[];
  seasons: TMDbTVSeason[];
  creators?: string;
  cast?: string[];
  poster_url?: string | null;
}

export interface TMDbTVSeason {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string;
  season_number: number;
  episode_count: number;
  vote_average: number;
}

export interface TMDbTVSearchResponse {
  page: number;
  results: TMDbTVShow[];
  total_pages: number;
  total_results: number;
}

// Settings types
export interface Settings {
  collection_public: string;
  site_title: string;
  items_per_page: string;
  default_theme: string;
  default_sort_by: string;
  default_sort_order: string;
  collection_title: string;
  [key: string]: string;
}

// Auth types
export interface AuthResponse {
  success: boolean;
  message: string;
  token: string;
}

// Filter and sort types
export type PhysicalFormat = '4K UHD' | '3D Blu-ray' | 'Blu-ray' | 'DVD' | 'Digital-HD' | 'Digital-SD' | 'Digital-UHD' | 'LaserDisc' | 'VHS' | 'all';
export type SortField = 'title' | 'release_date' | 'created_at' | 'physical_format' | 'series_sort' | 'director_last_name';
export type SortOrder = 'asc' | 'desc';

export interface FilterOptions {
  format?: PhysicalFormat | PhysicalFormat[]; // Support multi-select
  genres?: number[]; // Array of genre IDs for multi-select
  decades?: string[]; // Array of decade strings like ["1990", "2000"] for multi-select
  editions?: string[]; // Array of edition tag strings for multi-select
  versions?: string[]; // Array of movie version tag strings for multi-select
  series?: number[]; // Array of series IDs for multi-select
  director?: string;
  actor?: string;
  media_type?: 'all' | 'movie' | 'tv_season';
  archived?: boolean;
  sort_by?: SortField;
  sort_order?: SortOrder;
  search?: string;
  page?: number;
  limit?: number;
}

// Bulk operations types
export interface BulkSearchMatch {
  originalTitle: string;
  matches: TMDbMovieDetails[];
  selectedMatch: TMDbMovieDetails | null;
}

export interface BulkSearchUnmatched {
  originalTitle: string;
  error: string;
  wasRetried?: boolean;
}

export interface BulkSearchResponse {
  matched: BulkSearchMatch[];
  unmatched: BulkSearchUnmatched[];
  summary: {
    total: number;
    matched: number;
    unmatched: number;
    retried?: number;
  };
}

export interface BulkMediaItemDto {
  id?: number;
  title: string;
  original_title?: string | null;
  original_language?: string | null;
  tmdb_id?: number;
  synopsis?: string;
  cover_art_url?: string;
  release_date?: string;
  director?: string;
  cast?: string[];
  genres?: { id: number; name: string }[];
  media_type?: 'movie' | 'tv_season';
  tv_show_tmdb_id?: number;
  tv_show_name?: string;
  season_number?: number;
  episode_count?: number;
  disc_number?: number;
  formats?: string[];
  version_notes?: string;
}

export interface BulkPhysicalItemDto {
  name: string;
  physical_format: string[];
  edition_notes?: string;
  custom_image_url?: string;
  purchase_date?: string;
  barcode?: string | null;
  asin?: string | null;
  media: BulkMediaItemDto | BulkMediaItemDto[];
}

export interface BulkCreatePhysicalItemsResponse {
  successful: Array<{
    success: true;
    physicalItem: PhysicalItem;
    originalName: string;
  }>;
  failed: Array<{
    originalName: string;
    error: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export interface CollectionStatistics {
  totalPhysicalItems: number;
  totalMovies: number;
  totalTVSeasons: number;
  formatCounts: Record<string, number>;
  totalCost?: number;
  itemsWithCost?: number;
}

export interface FormatStatItem {
  format: string;
  itemCount: number;
  titleCount: number;
  itemPercentage: number;
  titlePercentage: number;
}

export interface EditionStatItem {
  tag: string;
  itemCount: number;
  titleCount: number;
  itemPercentage: number;
  titlePercentage: number;
}

export interface DecadeStatItem {
  decade: string;
  movieCount: number;
  tvSeasonCount: number;
  titleCount: number;
  itemCount: number;
}

export interface ReleaseExtreme {
  title: string;
  year: number;
  releaseDate: string;
}

export interface GenreStatItem {
  id: number;
  name: string;
  itemCount: number;
  titleCount: number;
  percentage: number;
}

export interface PersonTitlePreview {
  id: number;
  title: string;
  year?: number | null;
  coverArtUrl?: string | null;
  mediaType?: 'movie' | 'tv_season';
}

export interface PersonStatItem {
  name: string;
  count: number;
  profileUrl?: string | null;
  titles?: PersonTitlePreview[];
}

export interface PersonCollaboratorPreview {
  name: string;
  role: 'director' | 'actor';
  count: number;
  titles: string[];
}

export interface PersonExplorerItem {
  name: string;
  role: 'director' | 'actor';
  count: number;
  itemCount: number;
  profileUrl: string | null;
  titles: PersonTitlePreview[];
  formats: Array<{ format: string; count: number }>;
  decades: string[];
  genres: Array<{ id: number; name: string; count: number }>;
  earliestYear: number | null;
  latestYear: number | null;
  alsoRoleCount: number;
  topCollaborators: PersonCollaboratorPreview[];
}

export interface DualRolePersonItem {
  name: string;
  directedCount: number;
  actedCount: number;
  totalUniqueTitles: number;
  profileUrl: string | null;
  titles: PersonTitlePreview[];
}

export interface TalentCollaborationItem {
  director: string;
  directorProfileUrl: string | null;
  actor: string;
  actorProfileUrl: string | null;
  count: number;
  titles: PersonTitlePreview[];
}

export interface PeopleExplorerResponse {
  summary: {
    totalDirectors: number;
    totalActors: number;
    multiFilmDirectorsCount: number;
    multiTitleActorsCount: number;
    dualRoleCount: number;
    collaborationsCount: number;
  };
  directors: PersonExplorerItem[];
  actors: PersonExplorerItem[];
  dualRolePeople: DualRolePersonItem[];
  topCollaborations: TalentCollaborationItem[];
  availableFormats: string[];
  availableDecades: string[];
  availableGenres: Array<{ id: number; name: string; count: number }>;
}

export interface SeriesStatItem {
  id: number;
  name: string;
  ownedCount: number;
}

export interface ShelfUtilizationItem {
  id: number;
  displayName: string;
  groupName: string;
  usedUnits: number;
  capacityUnits: number;
  itemCount: number;
  utilizationPercent: number;
}

export interface SpinePaletteItem {
  color: string;
  count: number;
  percentage: number;
}

export interface DoubleDipItem {
  mediaId: number;
  title: string;
  itemCount: number;
  formats: string[];
}

export interface AcquisitionTimelinePoint {
  period: string;
  purchasedCount: number;
  addedCount: number;
  purchasedSpend?: number;
  addedSpend?: number;
}

export interface StoreStatItem {
  store: string;
  count: number;
  totalSpend?: number;
}

export interface SpendingCostExtreme {
  id: number;
  name: string;
  cost: number;
  purchaseDate: string | null;
}

export interface FormatSpendingStatItem {
  format: string;
  itemCount: number;
  totalSpend: number;
  averageSpend: number;
}

export interface CollectionSpendingStatistics {
  totalSpent: number;
  itemsWithCost: number;
  averageCostPerItem: number;
  averageCostPerTitle: number;
  highestCostItem: SpendingCostExtreme | null;
  lowestCostItem: SpendingCostExtreme | null;
  byFormat: FormatSpendingStatItem[];
}

export interface CollectionDashboardStatistics {
  overview: {
    totalPhysicalItems: number;
    totalMovies: number;
    totalTVSeasons: number;
    totalTVShows: number;
    totalEpisodes: number;
    multiTitleItemsCount: number;
    totalSeries: number;
    itemsWithEditionTags?: number;
  };
  formats: FormatStatItem[];
  editions?: EditionStatItem[];
  content: {
    decades: DecadeStatItem[];
    oldestRelease: ReleaseExtreme | null;
    newestRelease: ReleaseExtreme | null;
    genres: GenreStatItem[];
    topDirectors: PersonStatItem[];
    topCast: PersonStatItem[];
    topSeries: SeriesStatItem[];
  };
  physicalLibrary: {
    totalGroups: number;
    totalShelves: number;
    totalCapacityUnits: number;
    usedUnits: number;
    utilizationPercent: number;
    placedItemsCount: number;
    unassignedItemsCount: number;
    totalLinearMm: number;
    totalThicknessUnits: number;
    shelves: ShelfUtilizationItem[];
    spinePalette?: SpinePaletteItem[];
    doubleDips?: DoubleDipItem[];
  };
  acquisitions: {
    itemsWithPurchaseDate: number;
    byYear: AcquisitionTimelinePoint[];
    byMonth: AcquisitionTimelinePoint[];
    topStores: StoreStatItem[];
    spending?: CollectionSpendingStatistics;
  };
}

// =============================================
// Physical Library types
// =============================================

/** Standard Blu-ray case width in millimeters. 1 unit = 15mm (with breathing room between cases) */
export const STANDARD_UNIT_MM = 15;

/** How a shelf's physical width was defined */
export type ShelfWidthSource = 'cases' | 'manual';

export interface PhysicalLibrary {
  id: number;
  name: string;
  display_name: string;
  default_headroom_units?: number;
  groups: ShelfGroup[];
  created_at?: string;
  updated_at?: string;
}

export interface ShelfGroup {
  id: number;
  library_id: number;
  name: string;
  display_name: string;
  sort_order: number;
  shelves: Shelf[];
  photo_count?: number; // count of real-shelf photos tagged to this group
  created_at?: string;
  updated_at?: string;
}export interface Shelf {
  id: number;
  group_id: number;
  name: string;
  display_name: string;
  capacity_units: number;
  width_mm?: number;
  width_source?: ShelfWidthSource;
  depth_mm?: number;
  sort_order: number;
  placements: ShelfPlacement[];
  used_units: number; // computed: sum of placed item thickness_units
  created_at?: string;
  updated_at?: string;
}export interface ShelfPlacement {
  id: number;
  shelf_id: number;
  physical_item_id: number;
  position: number;
  is_pinned?: boolean;
  physical_item?: PhysicalItem; // populated when fetching
  created_at?: string;
  updated_at?: string;
}

export interface CreateShelfGroupDto {
  name: string;
  display_name: string;
}

export interface UpdateShelfGroupDto {
  name?: string;
  display_name?: string;
  sort_order?: number;
}

export interface CreateShelfDto {
  name: string;
  display_name: string;
  capacity_units: number;
  width_mm?: number;
  width_source?: ShelfWidthSource;
  depth_mm?: number;
}

export interface BulkCreateShelvesDto {
  count: number;
  capacity_units: number;
  width_mm?: number;
  width_source?: ShelfWidthSource;
  depth_mm?: number;
}

export interface UpdateShelfDto {
  name?: string;
  display_name?: string;
  capacity_units?: number;
  width_mm?: number;
  width_source?: ShelfWidthSource;
  depth_mm?: number;
  sort_order?: number;
}

export interface ApplySortPreview {
  placements: Array<{
    shelf_id: number;
    shelf_display_name: string;
    items: Array<{
      physical_item_id: number;
      physical_item_name: string;
      position: number;
      thickness_units: number;
    }>;
    used_units: number;
    capacity_units: number;
    overflow: boolean;
  }>;
  unplaceable: Array<{
    physical_item_id: number;
    physical_item_name: string;
    thickness_units: number;
  }>;
}

// =============================================
// Shelf Organization (Flow Blocks) types
// =============================================

export type ShelfBlockSortBy =
  | 'title'
  | 'series_sort'
  | 'tv_show_season'
  | 'director_last_name'
  | 'release_date'
  | 'created_at'
  | 'physical_format';

export type ShelfBlockTargetScope = 'library' | 'group';

export interface ShelfBlockFilterRules {
  match_all?: boolean;
  media_type?: 'movie' | 'tv_season';
  formats?: string[];
  edition_tags?: string[];
  series_ids?: number[];
  has_series?: boolean;
  genre_names?: string[];
  directors?: string[];
  decades?: string[];
}

export interface ShelfOrganizationBlock {
  id: number;
  library_id?: number;
  name: string;
  color: string;
  sort_order: number;
  enabled: boolean;
  target_scope: ShelfBlockTargetScope;
  target_group_id?: number | null;
  start_on_fresh_shelf: boolean;
  headroom_units_override?: number | null;
  filter_rules: ShelfBlockFilterRules;
  sort_by: ShelfBlockSortBy;
  sort_direction: 'asc' | 'desc';
  created_at?: string;
  updated_at?: string;
}

export interface ShelfOrganization {
  headroom_units: number;
  blocks: ShelfOrganizationBlock[];
}

export interface OrganizationPreviewItem {
  physical_item_id: number;
  name: string;
  thickness_units: number;
  block_id: number | null;
  is_pinned: boolean;
}

export interface OrganizationPreviewShelf {
  shelf_id: number;
  shelf_display_name: string;
  group_id: number;
  group_display_name: string;
  capacity_units: number;
  effective_capacity_units: number;
  used_units: number;
  items: OrganizationPreviewItem[];
  overflow: boolean;
}

export interface OrganizationPreviewBlock {
  block_id: number;
  name: string;
  color: string;
  item_count: number;
  unit_count: number;
}

export interface OrganizationPreviewUnmatched {
  physical_item_id: number;
  name: string;
  thickness_units: number;
}

export interface OrganizationPreview {
  shelves: OrganizationPreviewShelf[];
  blocks: OrganizationPreviewBlock[];
  unmatched_items: OrganizationPreviewUnmatched[];
  unplaceable_items: OrganizationPreviewUnmatched[];
}

// =============================================
// Shelving Queue (Minimal Ripple) types
// =============================================

export interface ShelvingPlanAssignment {
  physical_item_id: number;
  physical_item_name: string;
  thickness_units: number;
  status: 'ok' | 'unmatched' | 'no_space';
  block_id?: number | null;
  block_name?: string;
  block_color?: string;
  target_shelf_id?: number;
  target_shelf_name?: string;
  target_group_name?: string;
  position?: number;
  before_item_name?: string | null;
  after_item_name?: string | null;
}

export interface PhysicalMoveStep {
  kind: 'move' | 'insert';
  physical_item_id: number;
  physical_item_name: string;
  from_shelf_id?: number;
  from_shelf_name?: string;
  to_shelf_id: number;
  to_shelf_name: string;
  to_group_name: string;
  to_position: number;
  before_item_name?: string | null;
  after_item_name?: string | null;
}

export interface ShelfDiffItem {
  physical_item_id: number;
  name: string;
  thickness_units: number;
  position: number;
  change: 'unchanged' | 'new' | 'shifted';
}

export interface ShelfDiff {
  shelf_id: number;
  shelf_display_name: string;
  group_id: number;
  group_display_name: string;
  capacity_units?: number;
  before_used_units?: number;
  used_units?: number;
  touched: boolean;
  before: ShelfDiffItem[];
  after: ShelfDiffItem[];
}

export interface BoundaryConflict {
  from_shelf_id: number;
  from_shelf_name: string;
  to_shelf_id: number;
  to_shelf_name: string;
  to_block_name: string;
}

export interface ShelvingQueuePlan {
  assignments: ShelvingPlanAssignment[];
  steps: PhysicalMoveStep[];
  shelf_diffs: ShelfDiff[];
  boundary_conflicts: BoundaryConflict[];
  has_blocks: boolean;
}

// =============================================
// Shelf Photos (Real-Shelf Gallery) types
// =============================================

export interface ShelfPhoto {
  id: number;
  library_id: number;
  group_id?: number | null;
  shelf_id?: number | null;
  image_url: string;
  caption?: string | null;
  frame?: ImageFrame | null;
  sort_order: number;
  group_display_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

// Collection facets (full-collection filter options, independent of the loaded page)
export interface CollectionFacetGenre {
  id: number;
  name: string;
  count: number;
}

export interface CollectionFacetDecade {
  decade: string;
  count: number;
}

export interface CollectionFacetFormat {
  format: string;
  count: number;
}

export interface CollectionFacetEdition {
  tag: string;
  count: number;
}

export interface CollectionFacetSeries {
  id: number;
  name: string;
  count: number;
}

export interface CollectionFacets {
  genres: CollectionFacetGenre[];
  decades: CollectionFacetDecade[];
  formats: CollectionFacetFormat[];
  editions?: CollectionFacetEdition[];
  versions?: CollectionFacetEdition[];
  series?: CollectionFacetSeries[];
}

// Cover art scraper / picker types
export type CoverSource = 'amazon' | 'bluray' | 'tmdb' | 'url';

export interface CoverCandidate {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  subtitle?: string;
  source: CoverSource;
  productUrl?: string;
  asin?: string;
}

export interface CoverSearchResponse {
  results: CoverCandidate[];
  sourcesStatus: {
    amazon: 'ok' | 'empty' | 'error';
    bluray: 'ok' | 'empty' | 'error';
  };
}

// =============================================
// Collection History / Timeline types
// =============================================

export type CollectionEventType =
  | 'item_added'
  | 'item_archived'
  | 'shelf_group_added'
  | 'shelf_added'
  | 'shelf_resized'
  | 'shelf_photo_added'
  | 'shelf_reorganized';

export type HistoryCategory = 'all' | 'items' | 'shelves' | 'archived';

export interface HistoryItemDetail {
  eventId: number;
  physicalItemId: number | null;
  name: string;
  coverArtUrl: string | null;
  formats: string[];
  editionTags: string[];
  mediaTitles: Array<{
    id: number;
    title: string;
    year: number | null;
    mediaType: 'movie' | 'tv_season';
  }>;
  purchaseDate: string | null;
  occurredAt: string;
  cost?: number | null;
  storeName?: string | null;
  archived: boolean;
  archiveReason?: string | null;
  isUpgrade?: boolean;
  previousFormats?: string[];
}

export interface HistoryShelfDetail {
  eventId: number;
  shelfId: number | null;
  shelfGroupId: number | null;
  groupName: string;
  shelfName?: string;
  capacityUnits?: number;
  previousCapacityUnits?: number;
  widthMm?: number | null;
}

export interface HistoryEntry {
  entryKey: string;
  eventIds: number[];
  batchKey: string | null;
  eventType: CollectionEventType;
  category: 'items' | 'shelves' | 'archived';
  effectiveDate: string;
  occurredAt: string;
  title: string;
  items?: HistoryItemDetail[];
  shelves?: HistoryShelfDetail[];
  photo?: {
    photoId: number | null;
    imageUrl: string;
    caption: string | null;
    groupName: string | null;
    shelfName: string | null;
  };
  reorganization?: {
    mode: 'organization' | 'auto_sort' | 'shelving_queue';
    movedCount: number;
    shelfCount?: number;
  };
}

export interface HistoryFeedResponse {
  entries: HistoryEntry[];
  totalEntries: number;
  hasMore: boolean;
  counts: {
    all: number;
    items: number;
    shelves: number;
    archived: number;
  };
  itemsWithPurchaseDate: number;
}

// =============================================
// Barcode Scanning & Lookup types
// =============================================

export interface BarcodeQuotaStatus {
  provider: 'upcitemdb';
  tier: 'free' | 'paid';
  batchSize: number;
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
  rateLimitedUntil: string | null;
}

export interface BarcodeOwnedMatch {
  id: number;
  name: string;
  physical_format: string[];
  barcode: string;
}

export interface BarcodeProductInfo {
  ean?: string;
  upc?: string;
  title: string;
  brand?: string;
  description?: string;
  asin?: string;
  images?: string[];
  offerTitles?: string[];
}

export interface ParsedBarcodeMetadata {
  cleanedQuery: string;
  alternateQueries: string[];
  collectionQuery: string | null;
  suggestedItemName: string;
  suggestedFormats: string[];
  suggestedEditionTags: string[];
  mediaTypeHint: 'movie' | 'tv';
  seasonHints: number[];
  isLikelyBoxSet: boolean;
  yearHint: number | null;
}

export interface BarcodeMovieCandidate {
  id: number;
  title: string;
  original_title?: string;
  original_language?: string;
  overview: string;
  poster_path: string | null;
  poster_url: string | null;
  release_date: string;
  runtime?: number;
  director: string | null;
  cast: string[];
  genres?: { id: number; name: string }[];
  belongs_to_collection?: { id: number; name: string; poster_path: string | null } | null;
}

export interface BarcodeTVCandidate {
  id: number;
  name: string;
  original_name?: string;
  original_language?: string;
  overview: string;
  poster_path: string | null;
  poster_url: string | null;
  first_air_date: string;
  number_of_seasons: number;
  creators: string | null;
  cast: string[];
  genres?: { id: number; name: string }[];
  seasons: Array<{
    id: number;
    name: string;
    overview: string;
    poster_path: string | null;
    poster_url: string | null;
    air_date: string;
    season_number: number;
    episode_count: number;
  }>;
}

export interface BarcodeCollectionSuggestion {
  id: number;
  name: string;
  overview: string;
  poster_url: string | null;
  parts: BarcodeMovieCandidate[];
}

export interface BarcodeLookupItemResult {
  barcode: string;
  status: 'pending' | 'resolved' | 'not_found' | 'rate_limited' | 'error';
  source: 'cache' | 'provider' | 'none';
  error?: string;
  ownedItems: BarcodeOwnedMatch[];
  product?: BarcodeProductInfo;
  parsed?: ParsedBarcodeMetadata;
  tmdbWarning?: string;
  movieMatches: BarcodeMovieCandidate[];
  tvMatches: BarcodeTVCandidate[];
  collectionSuggestion?: BarcodeCollectionSuggestion | null;
}

export interface BarcodeLookupJob {
  jobId: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  total: number;
  completed: number;
  cachedCount: number;
  uncachedCount: number;
  estimatedSeconds: number;
  currentBarcode: string | null;
  quota: BarcodeQuotaStatus;
  items: BarcodeLookupItemResult[];
  startTime: number;
  endTime?: number;
  error?: string;
}

export interface TMDbCollectionSearchResult {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
}


