// Series types
export interface Series {
  id: number;
  name: string;
  sort_name: string;
  tmdb_collection_id?: number;
  internal_sort_method?: 'chronological' | 'custom' | 'alphabetical';
  created_at?: string;
  updated_at?: string;
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
  created_at?: string;
  updated_at?: string;
  disc_number?: number; // For junction table data
  formats?: string[]; // For junction table data - per-movie formats
}

export interface CreateMediaDto {
  title: string;
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

// Unified Search types
export interface UnifiedSearchResult {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  cover_art_url?: string | null;
  director?: string;
  source: 'database' | 'tmdb';
  tmdb_id?: number;
  media_type?: 'movie' | 'tv_season';
  originalData: Media | TMDbMovie | TMDbTVShow;
}

// Physical Item types (what you actually own)
export interface PhysicalItem {
  id: number;
  name: string;
  sort_name?: string;
  physical_format: string[];
  edition_notes?: string;
  notes?: string;
  notes_public?: boolean;
  custom_image_url?: string;
  purchase_date?: string;
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
  custom_image_url?: string;
  purchase_date?: string;
  store_links?: Array<{label: string; url: string}>;
  sort_series_id?: number; // Used for sorting by series
  media_primary_series_id?: number; // When set, adds all media to this series
  media: {
    id?: number; // If linking to existing media
    title?: string; // If creating new media
    tmdb_id?: number;
    synopsis?: string;
    cover_art_url?: string;
    release_date?: string;
    director?: string;
    cast?: string[];
    disc_number?: number;
    formats?: string[]; // Per-movie formats
    media_type?: 'movie' | 'tv_season';
    tv_show_tmdb_id?: number;
    tv_show_name?: string;
    season_number?: number;
    episode_count?: number;
    genres?: { id: number; name: string }[];
  }[] | {
    id?: number;
    title?: string;
    tmdb_id?: number;
    synopsis?: string;
    cover_art_url?: string;
    release_date?: string;
    director?: string;
    cast?: string[];
    disc_number?: number;
    formats?: string[];
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
  media_type?: 'all' | 'movie' | 'tv_season';
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

export interface BulkPhysicalItemDto {
  name: string;
  physical_format: string[];
  edition_notes?: string;
  custom_image_url?: string;
  purchase_date?: string;
  media: {
    title: string;
    tmdb_id?: number;
    synopsis?: string;
    cover_art_url?: string;
    release_date?: string;
    director?: string;
    cast?: string[];
    genres?: { id: number; name: string }[];
  };
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
}

// =============================================
// Physical Library types
// =============================================

/** Standard Blu-ray case width in millimeters. 1 unit = 12.5mm */
export const STANDARD_UNIT_MM = 12.5;

export interface PhysicalLibrary {
  id: number;
  name: string;
  display_name: string;
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
  created_at?: string;
  updated_at?: string;
}export interface Shelf {
  id: number;
  group_id: number;
  name: string;
  display_name: string;
  capacity_units: number;
  width_mm?: number;
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
  depth_mm?: number;
}

export interface UpdateShelfDto {
  name?: string;
  display_name?: string;
  capacity_units?: number;
  width_mm?: number;
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