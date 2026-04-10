import axios, { AxiosInstance } from 'axios';
import {
  Media,
  CreateMediaDto,
  UpdateMediaDto,
  PhysicalItem,
  CreatePhysicalItemDto,
  UpdatePhysicalItemDto,
  TMDbSearchResponse,
  TMDbMovieDetails,
  TMDbTVSearchResponse,
  TMDbTVShowDetails,
  Settings,
  AuthResponse,
  FilterOptions,
  Series,
  BulkSearchResponse,
  BulkPhysicalItemDto,
  BulkCreatePhysicalItemsResponse,
  CollectionStatistics,
  PhysicalLibrary,
  ShelfGroup,
  Shelf,
  ShelfPlacement,
  CreateShelfGroupDto,
  UpdateShelfGroupDto,
  CreateShelfDto,
  UpdateShelfDto,
  ApplySortPreview,
} from '../types';

class ApiService {
  private api: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: '/api',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Load token from localStorage
    this.token = localStorage.getItem('auth_token');
    if (this.token) {
      this.setAuthToken(this.token);
    }
  }

  // Auth methods
  setAuthToken(token: string) {
    this.token = token;
    this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('auth_token', token);
  }

  clearAuthToken() {
    this.token = null;
    delete this.api.defaults.headers.common['Authorization'];
    localStorage.removeItem('auth_token');
  }

  async login(password: string): Promise<AuthResponse> {
    const response = await this.api.post<AuthResponse>('/auth/login', { password });
    if (response.data.success) {
      this.setAuthToken(response.data.token);
    }
    return response.data;
  }

  async verifyAuth(): Promise<boolean> {
    try {
      await this.api.get('/auth/verify');
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.token) {
        await this.api.post('/auth/logout');
      }
    } catch {
      // Still drop local credentials if the server is unreachable or the session was already invalid.
    } finally {
      this.clearAuthToken();
    }
  }

  // Media methods
  async getMedia(filters?: Partial<FilterOptions>): Promise<{ items: Media[]; pagination: any }> {
    const params: any = {};
    if (filters) {
      if (filters.sort_by) params.sort_by = filters.sort_by;
      if (filters.sort_order) params.sort_order = filters.sort_order;
      if (filters.search) params.search = filters.search;
      if (filters.page) params.page = filters.page;
      if (filters.limit) params.limit = filters.limit;
      if (filters.media_type && filters.media_type !== 'all') params.media_type = filters.media_type;
    }
    const response = await this.api.get<{ items: Media[]; pagination: any }>('/media', { params });
    return response.data;
  }

  async getMediaById(id: number): Promise<Media> {
    const response = await this.api.get<Media>(`/media/${id}`);
    return response.data;
  }

  async createMedia(data: CreateMediaDto): Promise<Media> {
    const response = await this.api.post<Media>('/media', data);
    return response.data;
  }

  async updateMedia(id: number, data: UpdateMediaDto): Promise<Media> {
    const response = await this.api.put<Media>(`/media/${id}`, data);
    return response.data;
  }

  async deleteMedia(id: number): Promise<void> {
    await this.api.delete(`/media/${id}`);
  }

  async refreshMediaFromTMDB(id: number): Promise<{ current: any; tmdb: any; tmdb_id: number }> {
    const response = await this.api.post(`/media/${id}/refresh-tmdb`);
    return response.data;
  }

  async updateMediaFromTMDB(id: number, fields: string[]): Promise<Media> {
    const response = await this.api.put(`/media/${id}/update-from-tmdb`, { fields });
    return response.data;
  }

  async uploadImage(file: File): Promise<{ url: string; filename: string }> {
    const formData = new FormData();
    formData.append('image', file);

    const response = await this.api.post<{ url: string; filename: string }>(
      '/media/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  }

  // TMDb search methods
  async searchMovies(query: string, page: number = 1): Promise<TMDbSearchResponse> {
    const response = await this.api.get<TMDbSearchResponse>('/search/movies', {
      params: { q: query, page },
    });
    return response.data;
  }

  async getMovieDetails(tmdbId: number): Promise<TMDbMovieDetails> {
    const response = await this.api.get<TMDbMovieDetails>(`/search/movies/${tmdbId}`);
    return response.data;
  }

  async getMoviePosters(tmdbId: number): Promise<string[]> {
    const response = await this.api.get<string[]>(`/search/movies/${tmdbId}/posters`);
    return response.data;
  }

  async getTMDbCollections(tmdbId: number): Promise<any> {
    const response = await this.api.get(`/search/movies/${tmdbId}/collections`);
    return response.data;
  }

  async getCollectionDetails(collectionId: number): Promise<any> {
    const response = await this.api.get(`/search/collections/${collectionId}`);
    return response.data;
  }

  // TMDb TV search methods
  async searchTV(query: string, page: number = 1): Promise<TMDbTVSearchResponse> {
    const response = await this.api.get<TMDbTVSearchResponse>('/search/tv', {
      params: { q: query, page },
    });
    return response.data;
  }

  async getTVDetails(tvId: number): Promise<TMDbTVShowDetails> {
    const response = await this.api.get<TMDbTVShowDetails>(`/search/tv/${tvId}`);
    return response.data;
  }

  async getTVSeasonDetails(tvId: number, seasonNumber: number): Promise<any> {
    const response = await this.api.get(`/search/tv/${tvId}/season/${seasonNumber}`);
    return response.data;
  }

  async getTVPosters(tvId: number): Promise<string[]> {
    const response = await this.api.get<string[]>(`/search/tv/${tvId}/posters`);
    return response.data;
  }

  async getTVSeasonPosters(tvId: number, seasonNumber: number): Promise<string[]> {
    const response = await this.api.get<string[]>(`/search/tv/${tvId}/season/${seasonNumber}/posters`);
    return response.data;
  }

  // Physical Items methods
  async getPhysicalItems(filterOptions?: FilterOptions): Promise<{ items: PhysicalItem[]; pagination: any }> {
    const params: any = {};
    if (filterOptions) {
      if (filterOptions.format) {
        // Handle both single format and array of formats
        if (Array.isArray(filterOptions.format)) {
          params.format = filterOptions.format.join(',');
        } else {
          params.format = filterOptions.format;
        }
      }
      if (filterOptions.genres && filterOptions.genres.length > 0) {
        params.genres = filterOptions.genres.join(',');
      }
      if (filterOptions.decades && filterOptions.decades.length > 0) {
        params.decades = filterOptions.decades.join(',');
      }
      if (filterOptions.media_type && filterOptions.media_type !== 'all') params.media_type = filterOptions.media_type;
      if (filterOptions.sort_by) params.sort_by = filterOptions.sort_by;
      if (filterOptions.sort_order) params.sort_order = filterOptions.sort_order;
      if (filterOptions.search) params.search = filterOptions.search;
      if (filterOptions.page) params.page = filterOptions.page;
      if (filterOptions.limit) params.limit = filterOptions.limit;
    }
    const response = await this.api.get<{ items: PhysicalItem[]; pagination: any }>('/physical-items', { params });
    return response.data;
  }

  async getPhysicalItemById(id: number): Promise<PhysicalItem> {
    const response = await this.api.get<PhysicalItem>(`/physical-items/${id}`);
    return response.data;
  }

  async createPhysicalItem(data: CreatePhysicalItemDto): Promise<PhysicalItem> {
    const response = await this.api.post<PhysicalItem>('/physical-items', data);
    return response.data;
  }

  async updatePhysicalItem(id: number, data: UpdatePhysicalItemDto): Promise<PhysicalItem> {
    const response = await this.api.put<PhysicalItem>(`/physical-items/${id}`, data);
    return response.data;
  }

  async deletePhysicalItem(id: number): Promise<void> {
    await this.api.delete(`/physical-items/${id}`);
  }

  async addMediaLink(physicalItemId: number, media: any): Promise<PhysicalItem> {
    const response = await this.api.post<PhysicalItem>(`/physical-items/${physicalItemId}/media`, { media });
    return response.data;
  }

  async removeMediaLink(physicalItemId: number, mediaId: number): Promise<PhysicalItem> {
    const response = await this.api.delete<PhysicalItem>(`/physical-items/${physicalItemId}/media/${mediaId}`);
    return response.data;
  }

  async updateMovieFormats(physicalItemId: number, mediaId: number, formats: string[]): Promise<PhysicalItem> {
    const response = await this.api.put<PhysicalItem>(`/physical-items/${physicalItemId}/media/${mediaId}/formats`, { formats });
    return response.data;
  }

  async bulkCreatePhysicalItems(items: BulkPhysicalItemDto[]): Promise<BulkCreatePhysicalItemsResponse> {
    const response = await this.api.post<BulkCreatePhysicalItemsResponse>('/physical-items/bulk', { items });
    return response.data;
  }

  // Bulk operations
  async bulkSearchMovies(titles: string[]): Promise<BulkSearchResponse> {
    const response = await this.api.post<BulkSearchResponse>('/search/bulk-movies', { titles });
    return response.data;
  }

  // Series methods
  async getSeries(): Promise<Series[]> {
    const response = await this.api.get<Series[]>('/series');
    return response.data;
  }

  async getSeriesById(id: number): Promise<Series> {
    const response = await this.api.get<Series>(`/series/${id}`);
    return response.data;
  }

  async getSeriesMovies(id: number): Promise<Media[]> {
    const response = await this.api.get<Media[]>(`/series/${id}/movies`);
    return response.data;
  }

  async createSeries(data: Omit<Series, 'id' | 'created_at' | 'updated_at'>): Promise<Series> {
    const response = await this.api.post<Series>('/series', data);
    return response.data;
  }

  async updateSeries(id: number, data: Partial<Omit<Series, 'id' | 'created_at' | 'updated_at'>>): Promise<Series> {
    const response = await this.api.put<Series>(`/series/${id}`, data);
    return response.data;
  }

  async deleteSeries(id: number): Promise<void> {
    await this.api.delete(`/series/${id}`);
  }

  async updateSeriesMovieSortOrder(seriesId: number, mediaId: number, sortOrder: number | null): Promise<any> {
    const response = await this.api.post(`/series/${seriesId}/movies/${mediaId}/sort-order`, { sort_order: sortOrder });
    return response.data;
  }

  async bulkUpdateSeriesMovieSortOrders(seriesId: number, sortOrders: Array<{media_id: number; sort_order: number | null}>): Promise<Media[]> {
    const response = await this.api.put<Media[]>(`/series/${seriesId}/movies/sort-orders`, { sort_orders: sortOrders });
    return response.data;
  }

  // Settings methods
  async getSettings(): Promise<Settings> {
    const response = await this.api.get<Settings>('/settings');
    return response.data;
  }

  async getSetting(key: string): Promise<{ key: string; value: string }> {
    const response = await this.api.get<{ key: string; value: string }>(`/settings/${key}`);
    return response.data;
  }

  async updateSetting(key: string, value: string): Promise<{ key: string; value: string }> {
    const response = await this.api.put<{ key: string; value: string }>(`/settings/${key}`, {
      value,
    });
    return response.data;
  }

  async updateSettings(settings: Record<string, string>): Promise<Settings> {
    const response = await this.api.post<Settings>('/settings', settings);
    return response.data;
  }

  // Import/Export methods
  async getImportExportSchema(): Promise<any> {
    const response = await this.api.get('/import-export/schema');
    return response.data;
  }

  async exportCollection(): Promise<Blob> {
    const response = await this.api.get('/import-export/export', {
      responseType: 'blob',
    });
    return response.data;
  }

  async validateCSV(csvData: string): Promise<any> {
    const response = await this.api.post('/import-export/validate', { csv_data: csvData });
    return response.data;
  }

  async importCollection(csvData: string, mode: 'add' | 'replace' = 'add'): Promise<any> {
    const response = await this.api.post('/import-export/import', { 
      csv_data: csvData,
      mode,
    });
    return response.data;
  }

  // Statistics methods
  async getStatistics(filters?: {
    format?: string | string[];
    genres?: number[];
    decades?: string[];
    search?: string;
  }): Promise<CollectionStatistics> {
    const params: any = {};
    if (filters) {
      if (filters.format) {
        // Handle both single format and array of formats
        if (Array.isArray(filters.format)) {
          params.format = filters.format.join(',');
        } else {
          params.format = filters.format;
        }
      }
      if (filters.genres && filters.genres.length > 0) {
        params.genres = filters.genres.join(',');
      }
      if (filters.decades && filters.decades.length > 0) {
        params.decades = filters.decades.join(',');
      }
      if (filters.search) {
        params.search = filters.search;
      }
    }
    const response = await this.api.get<CollectionStatistics>('/statistics', { params });
    return response.data;
  }

  // Bulk metadata methods
  async startBulkMetadata(): Promise<{ jobId: string | null; total: number; message?: string }> {
    const response = await this.api.post<{ jobId: string | null; total: number; message?: string }>('/media/bulk-metadata');
    return response.data;
  }

  async getBulkMetadataStatus(jobId: string): Promise<any> {
    const response = await this.api.get(`/media/bulk-metadata/${jobId}`);
    return response.data;
  }

  // =============================================
  // Physical Library methods
  // =============================================

  async getLibrary(): Promise<PhysicalLibrary> {
    const response = await this.api.get<PhysicalLibrary>('/library');
    return response.data;
  }

  async updateLibrary(data: { name?: string; display_name?: string }): Promise<PhysicalLibrary> {
    const response = await this.api.put<PhysicalLibrary>('/library', data);
    return response.data;
  }

  // Shelf Groups
  async getShelfGroups(): Promise<ShelfGroup[]> {
    const response = await this.api.get<ShelfGroup[]>('/library/groups');
    return response.data;
  }

  async createShelfGroup(data: CreateShelfGroupDto): Promise<ShelfGroup> {
    const response = await this.api.post<ShelfGroup>('/library/groups', data);
    return response.data;
  }

  async updateShelfGroup(id: number, data: UpdateShelfGroupDto): Promise<ShelfGroup> {
    const response = await this.api.put<ShelfGroup>(`/library/groups/${id}`, data);
    return response.data;
  }

  async deleteShelfGroup(id: number): Promise<void> {
    await this.api.delete(`/library/groups/${id}`);
  }

  async reorderShelfGroups(order: Array<{ id: number; sort_order: number }>): Promise<void> {
    await this.api.put('/library/groups/reorder', { order });
  }

  // Shelves
  async getShelvesInGroup(groupId: number): Promise<Shelf[]> {
    const response = await this.api.get<Shelf[]>(`/library/groups/${groupId}/shelves`);
    return response.data;
  }

  async createShelf(groupId: number, data: CreateShelfDto): Promise<Shelf> {
    const response = await this.api.post<Shelf>(`/library/groups/${groupId}/shelves`, data);
    return response.data;
  }

  async updateShelf(id: number, data: UpdateShelfDto): Promise<Shelf> {
    const response = await this.api.put<Shelf>(`/library/shelves/${id}`, data);
    return response.data;
  }

  async deleteShelf(id: number): Promise<void> {
    await this.api.delete(`/library/shelves/${id}`);
  }

  async reorderShelves(order: Array<{ id: number; sort_order: number; group_id?: number }>): Promise<void> {
    await this.api.put('/library/shelves/reorder', { order });
  }

  // Shelf Placements
  async getUnassignedItems(search?: string): Promise<PhysicalItem[]> {
    const params: any = {};
    if (search) params.search = search;
    const response = await this.api.get<PhysicalItem[]>('/library/unassigned', { params });
    return response.data;
  }

  async placeItemOnShelf(shelfId: number, physicalItemId: number, position?: number): Promise<ShelfPlacement> {
    const response = await this.api.post<ShelfPlacement>(`/library/shelves/${shelfId}/items`, {
      physical_item_id: physicalItemId,
      position,
    });
    return response.data;
  }

  async reorderShelfItems(shelfId: number, order: Array<{ physical_item_id: number; position: number }>): Promise<void> {
    await this.api.put(`/library/shelves/${shelfId}/items/reorder`, { order });
  }

  async removePlacement(placementId: number): Promise<void> {
    await this.api.delete(`/library/placements/${placementId}`);
  }

  // Apply Sort
  async previewApplySort(sortBy: string, sortOrder: string): Promise<ApplySortPreview> {
    const response = await this.api.post<ApplySortPreview>('/library/apply-sort', {
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    return response.data;
  }

  async confirmApplySort(placements: Array<{ shelf_id: number; items: Array<{ physical_item_id: number; position: number }> }>): Promise<PhysicalLibrary> {
    const response = await this.api.post<PhysicalLibrary>('/library/apply-sort/confirm', { placements });
    return response.data;
  }

  // Spine Colors
  async updateSpineColors(physicalItemId: number, data: {
    spine_color?: string | null;
    spine_color_accent?: string | null;
    auto_detect?: boolean;
  }): Promise<{ spine_color: string; spine_color_accent: string }> {
    const response = await this.api.patch<{ spine_color: string; spine_color_accent: string }>(
      `/physical-items/${physicalItemId}/spine-colors`,
      data
    );
    return response.data;
  }
}

export const apiService = new ApiService();

