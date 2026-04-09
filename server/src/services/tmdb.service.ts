import axios, { AxiosError } from 'axios';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// Rate limiting: 40 requests/second for free tier
const RATE_LIMIT_REQUESTS_PER_SECOND = 40;
const MIN_DELAY_MS = 1000 / RATE_LIMIT_REQUESTS_PER_SECOND; // 25ms minimum delay

export interface TMDbMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
}

export interface TMDbMovieDetails {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number;
  genres: { id: number; name: string }[];
  credits?: {
    cast: { id: number; name: string; character: string; profile_path: string | null }[];
    crew: { id: number; name: string; job: string }[];
  };
}

export interface TMDbSearchResponse {
  page: number;
  results: TMDbMovie[];
  total_pages: number;
  total_results: number;
}

// TV Show types
export interface TMDbTVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
}

export interface TMDbTVShowDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  status: string;
  genres: { id: number; name: string }[];
  created_by: { id: number; name: string; profile_path: string | null }[];
  seasons: TMDbTVSeason[];
  credits?: {
    cast: { id: number; name: string; character: string; profile_path: string | null }[];
    crew: { id: number; name: string; job: string }[];
  };
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

type LogCallback = (message: string, level?: 'info' | 'warn' | 'error') => void;

class TMDbService {
  private apiKey: string;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue: boolean = false;
  private lastRequestTime: number = 0;
  private logCallback?: LogCallback;

  constructor() {
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY is not defined in environment variables');
    }
    this.apiKey = TMDB_API_KEY;
  }

  /**
   * Set a callback for logging API calls
   */
  setLogCallback(callback: LogCallback) {
    this.logCallback = callback;
  }

  /**
   * Log a message
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const logMessage = `[TMDB] ${message}`;
    console.log(logMessage);
    if (this.logCallback) {
      this.logCallback(logMessage, level);
    }
  }

  /**
   * Wait for rate limit delay
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < MIN_DELAY_MS) {
      const waitTime = MIN_DELAY_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Make a rate-limited API request with retry logic
   */
  private async makeRequest<T>(
    requestFn: () => Promise<T>,
    retries: number = 2,
    baseDelay: number = 1000
  ): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.waitForRateLimit();
        const result = await requestFn();
        return result;
      } catch (error) {
        const axiosError = error as AxiosError;
        
        // Handle 429 Too Many Requests
        if (axiosError.response?.status === 429) {
          const retryAfter = axiosError.response.headers['retry-after'];
          const delay = retryAfter 
            ? parseInt(retryAfter, 10) * 1000 
            : baseDelay * Math.pow(2, attempt);
          
          this.log(`Rate limited. Retrying after ${delay}ms (attempt ${attempt + 1}/${retries + 1})`, 'warn');
          
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // Handle other errors
        if (attempt < retries) {
          const delay = baseDelay * Math.pow(2, attempt);
          this.log(`Request failed. Retrying after ${delay}ms (attempt ${attempt + 1}/${retries + 1})`, 'warn');
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // All retries exhausted
        throw error;
      }
    }
    
    throw new Error('Request failed after all retries');
  }

  /**
   * Search for movies by title
   */
  async searchMovies(query: string, page: number = 1): Promise<TMDbSearchResponse> {
    this.log(`Searching movies: "${query}" (page ${page})`);
    try {
      const response = await this.makeRequest(() =>
        axios.get(`${TMDB_BASE_URL}/search/movie`, {
          params: {
            api_key: this.apiKey,
            query,
            page,
            include_adult: false,
          },
        })
      );
      this.log(`Found ${response.data.results.length} results for "${query}"`);
      return response.data;
    } catch (error) {
      this.log(`Search error for "${query}": ${error}`, 'error');
      throw new Error('Failed to search movies on TMDb');
    }
  }

  /**
   * Get detailed information about a movie including cast and crew
   */
  async getMovieDetails(movieId: number): Promise<TMDbMovieDetails> {
    this.log(`Fetching movie details for ID: ${movieId}`);
    try {
      const response = await this.makeRequest(() =>
        axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
          params: {
            api_key: this.apiKey,
            append_to_response: 'credits',
          },
        })
      );
      this.log(`Successfully fetched details for movie ID: ${movieId} - "${response.data.title}"`);
      return response.data;
    } catch (error) {
      this.log(`Failed to fetch movie details for ID ${movieId}: ${error}`, 'error');
      throw new Error('Failed to fetch movie details from TMDb');
    }
  }

  /**
   * Get images for a movie
   */
  async getMovieImages(movieId: number): Promise<string[]> {
    this.log(`Fetching images for movie ID: ${movieId}`);
    try {
      const response = await this.makeRequest(() =>
        axios.get(`${TMDB_BASE_URL}/movie/${movieId}/images`, {
          params: {
            api_key: this.apiKey,
          },
        })
      );
      
      const posters = response.data.posters || [];
      // Sort by vote average (popularity)
      posters.sort((a: any, b: any) => b.vote_average - a.vote_average);
      
      return posters.map((poster: any) => this.getImageUrl(poster.file_path, 'w500')).filter((url: string | null) => url !== null) as string[];
    } catch (error) {
      this.log(`Failed to fetch images for movie ID ${movieId}: ${error}`, 'error');
      // Return empty array instead of throwing, so the UI can just show no images
      return [];
    }
  }

  /**
   * Get full image URL from TMDb path
   */
  getImageUrl(path: string | null, size: 'w500' | 'w780' | 'original' = 'w500'): string | null {
    if (!path) return null;
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }

  /**
   * Extract director from credits
   */
  getDirector(credits?: TMDbMovieDetails['credits']): string | null {
    if (!credits?.crew) return null;
    const director = credits.crew.find((person) => person.job === 'Director');
    return director?.name || null;
  }

  /**
   * Get top cast members
   */
  getTopCast(credits?: TMDbMovieDetails['credits'], limit: number = 5): string[] {
    if (!credits?.cast) return [];
    return credits.cast.slice(0, limit).map((actor) => actor.name);
  }

  /**
   * Get movie's belonging collections
   */
  async getMovieCollections(movieId: number): Promise<any> {
    this.log(`Fetching collections for movie ID: ${movieId}`);
    try {
      const response = await this.makeRequest(() =>
        axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
          params: {
            api_key: this.apiKey,
          },
        })
      );
      return response.data.belongs_to_collection;
    } catch (error) {
      this.log(`Failed to fetch collections for movie ID ${movieId}: ${error}`, 'error');
      throw new Error('Failed to fetch movie collections from TMDb');
    }
  }

  /**
   * Get collection details including all movies
   */
  async getCollectionDetails(collectionId: number): Promise<any> {
    this.log(`Fetching collection details for ID: ${collectionId}`);
    try {
      const response = await this.makeRequest(() =>
        axios.get(`${TMDB_BASE_URL}/collection/${collectionId}`, {
          params: {
            api_key: this.apiKey,
          },
        })
      );
      this.log(`Successfully fetched collection details for ID: ${collectionId}`);
      return response.data;
    } catch (error) {
      this.log(`Failed to fetch collection details for ID ${collectionId}: ${error}`, 'error');
      throw new Error('Failed to fetch collection details from TMDb');
    }
  }

  // =============================================
  // TV Show Methods
  // =============================================

  /**
   * Search for TV shows by name
   */
  async searchTV(query: string, page: number = 1): Promise<TMDbTVSearchResponse> {
    this.log(`Searching TV shows: "${query}" (page ${page})`);
    try {
      const response = await this.makeRequest(() =>
        axios.get(`${TMDB_BASE_URL}/search/tv`, {
          params: {
            api_key: this.apiKey,
            query,
            page,
            include_adult: false,
          },
        })
      );
      this.log(`Found ${response.data.results.length} TV results for "${query}"`);
      return response.data;
    } catch (error) {
      this.log(`TV search error for "${query}": ${error}`, 'error');
      throw new Error('Failed to search TV shows on TMDb');
    }
  }

  /**
   * Get detailed information about a TV show including seasons and credits
   */
  async getTVDetails(tvId: number): Promise<TMDbTVShowDetails> {
    this.log(`Fetching TV show details for ID: ${tvId}`);
    try {
      const response = await this.makeRequest(() =>
        axios.get(`${TMDB_BASE_URL}/tv/${tvId}`, {
          params: {
            api_key: this.apiKey,
            append_to_response: 'credits',
          },
        })
      );
      this.log(`Successfully fetched TV details for ID: ${tvId} - "${response.data.name}"`);
      return response.data;
    } catch (error) {
      this.log(`Failed to fetch TV details for ID ${tvId}: ${error}`, 'error');
      throw new Error('Failed to fetch TV show details from TMDb');
    }
  }

  /**
   * Get details for a specific TV season
   */
  async getTVSeasonDetails(tvId: number, seasonNumber: number): Promise<any> {
    this.log(`Fetching TV season details for show ${tvId}, season ${seasonNumber}`);
    try {
      const response = await this.makeRequest(() =>
        axios.get(`${TMDB_BASE_URL}/tv/${tvId}/season/${seasonNumber}`, {
          params: {
            api_key: this.apiKey,
          },
        })
      );
      this.log(`Successfully fetched season ${seasonNumber} for TV show ${tvId}`);
      return response.data;
    } catch (error) {
      this.log(`Failed to fetch TV season details for show ${tvId}, season ${seasonNumber}: ${error}`, 'error');
      throw new Error('Failed to fetch TV season details from TMDb');
    }
  }

  /**
   * Get images for a TV show
   */
  async getTVImages(tvId: number): Promise<string[]> {
    this.log(`Fetching images for TV show ID: ${tvId}`);
    try {
      const response = await this.makeRequest(() =>
        axios.get(`${TMDB_BASE_URL}/tv/${tvId}/images`, {
          params: {
            api_key: this.apiKey,
          },
        })
      );

      const posters = response.data.posters || [];
      posters.sort((a: any, b: any) => b.vote_average - a.vote_average);

      return posters.map((poster: any) => this.getImageUrl(poster.file_path, 'w500')).filter((url: string | null) => url !== null) as string[];
    } catch (error) {
      this.log(`Failed to fetch images for TV show ID ${tvId}: ${error}`, 'error');
      return [];
    }
  }

  /**
   * Get images for a specific TV season
   */
  async getTVSeasonImages(tvId: number, seasonNumber: number): Promise<string[]> {
    this.log(`Fetching images for TV show ${tvId}, season ${seasonNumber}`);
    try {
      const response = await this.makeRequest(() =>
        axios.get(`${TMDB_BASE_URL}/tv/${tvId}/season/${seasonNumber}/images`, {
          params: {
            api_key: this.apiKey,
          },
        })
      );

      const posters = response.data.posters || [];
      posters.sort((a: any, b: any) => b.vote_average - a.vote_average);

      return posters.map((poster: any) => this.getImageUrl(poster.file_path, 'w500')).filter((url: string | null) => url !== null) as string[];
    } catch (error) {
      this.log(`Failed to fetch images for TV show ${tvId}, season ${seasonNumber}: ${error}`, 'error');
      return [];
    }
  }

  /**
   * Extract creators from TV show created_by field
   */
  getCreators(createdBy?: TMDbTVShowDetails['created_by']): string | null {
    if (!createdBy || createdBy.length === 0) return null;
    return createdBy.map((creator) => creator.name).join(', ');
  }

  /**
   * Get top cast members from TV show credits
   */
  getTVTopCast(credits?: TMDbTVShowDetails['credits'], limit: number = 10): string[] {
    if (!credits?.cast) return [];
    return credits.cast.slice(0, limit).map((actor) => actor.name);
  }
}

export const tmdbService = new TMDbService();

