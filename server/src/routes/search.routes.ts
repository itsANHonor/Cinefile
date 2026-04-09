import { Router, Request, Response } from 'express';
import { tmdbService } from '../services/tmdb.service';

const router = Router();

/**
 * GET /api/search/movies
 * Search for movies on TMDb
 */
router.get('/movies', async (req: Request, res: Response) => {
  try {
    const { q, page = '1' } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const pageNum = parseInt(page as string, 10);
    const results = await tmdbService.searchMovies(q, pageNum);

    res.json(results);
  } catch (error) {
    console.error('Error searching movies:', error);
    res.status(500).json({ error: 'Failed to search movies' });
  }
});

/**
 * GET /api/search/movies/:id
 * Get detailed information about a movie from TMDb
 */
router.get('/movies/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const movieId = parseInt(id, 10);

    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Invalid movie ID' });
    }

    const movieDetails = await tmdbService.getMovieDetails(movieId);

    // Enhance with helper methods
    const director = tmdbService.getDirector(movieDetails.credits);
    const cast = tmdbService.getTopCast(movieDetails.credits, 10);
    const posterUrl = tmdbService.getImageUrl(movieDetails.poster_path);

    res.json({
      ...movieDetails,
      director,
      cast,
      poster_url: posterUrl,
    });
  } catch (error) {
    console.error('Error fetching movie details:', error);
    res.status(500).json({ error: 'Failed to fetch movie details' });
  }
});

/**
 * GET /api/search/movies/:id/posters
 * Get posters for a movie from TMDb
 */
router.get('/movies/:id/posters', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const movieId = parseInt(id, 10);

    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Invalid movie ID' });
    }

    const posters = await tmdbService.getMovieImages(movieId);
    res.json(posters);
  } catch (error) {
    console.error('Error fetching movie posters:', error);
    res.status(500).json({ error: 'Failed to fetch movie posters' });
  }
});

/**
 * POST /api/search/bulk-movies
 * Search for multiple movies on TMDb with retry logic and rate limiting
 */
router.post('/bulk-movies', async (req: Request, res: Response) => {
  try {
    const { titles } = req.body;

    if (!titles || !Array.isArray(titles)) {
      return res.status(400).json({ error: 'titles must be an array of strings' });
    }

    if (titles.length === 0) {
      return res.status(400).json({ error: 'At least one title is required' });
    }

    if (titles.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 titles allowed per request' });
    }

    // Process searches in batches to respect rate limits
    // Batch size: process 5 at a time to avoid overwhelming the API
    const BATCH_SIZE = 5;
    const results: Array<{ status: 'fulfilled' | 'rejected'; value?: any; reason?: any }> = [];
    const failedSearches: Array<{ index: number; title: string; error: string; isApiError: boolean }> = [];

    console.log(`[BulkSearch] Starting search for ${titles.length} titles in batches of ${BATCH_SIZE}`);

    // First pass: process all titles in batches
    for (let i = 0; i < titles.length; i += BATCH_SIZE) {
      const batch = titles.slice(i, Math.min(i + BATCH_SIZE, titles.length));
      
      const batchResults = await Promise.allSettled(
        batch.map(async (title: string, batchIndex: number) => {
          const actualIndex = i + batchIndex;
          
          if (typeof title !== 'string' || !title.trim()) {
            throw new Error('Invalid title');
          }
          
          try {
            const searchResults = await tmdbService.searchMovies(title.trim());
            
            // If no results, try searching with common variations
            if (searchResults.results.length === 0) {
              // Try without common prefixes/suffixes
              const variations = [
                title.trim().replace(/^(the|a|an)\s+/i, ''),
                title.trim().replace(/\s+(the|a|an)$/i, ''),
              ].filter(v => v !== title.trim() && v.length > 0);
              
              for (const variation of variations) {
                try {
                  const altResults = await tmdbService.searchMovies(variation);
                  if (altResults.results.length > 0) {
                    searchResults.results = altResults.results;
                    break;
                  }
                } catch {
                  // Continue to next variation
                }
              }
            }
            
            // Fetch detailed information for each match (limit to top 5 to reduce API calls)
            const topMatches = searchResults.results.slice(0, 5);
            const detailedMatches = await Promise.allSettled(
              topMatches.map(async (movie) => {
                try {
                  const details = await tmdbService.getMovieDetails(movie.id);
                  const director = tmdbService.getDirector(details.credits);
                  const cast = tmdbService.getTopCast(details.credits, 10);
                  const posterUrl = tmdbService.getImageUrl(details.poster_path);
                  
                  return {
                    ...details,
                    director,
                    cast,
                    poster_url: posterUrl,
                  };
                } catch (error) {
                  // If detailed fetch fails, return basic movie info
                  console.warn(`Failed to fetch details for movie ${movie.id}:`, error);
                  return movie;
                }
              })
            );
            
            const successfulMatches = detailedMatches
              .filter((result) => result.status === 'fulfilled')
              .map((result) => result.value);
            
            return {
              originalTitle: title.trim(),
              matches: successfulMatches,
              selectedMatch: successfulMatches[0] || null,
            };
          } catch (error: any) {
            // Distinguish between API errors and no matches
            const errorMessage = error.message || 'Unknown error';
            const isApiError = errorMessage.includes('Failed to search') || 
                              errorMessage.includes('Rate limited') ||
                              errorMessage.includes('429') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network');
            
            throw {
              isApiError,
              message: isApiError ? 'API request failed - will retry' : 'No matches found',
              originalError: errorMessage,
            };
          }
        })
      );

      // Collect results and track failures
      batchResults.forEach((result, batchIndex) => {
        const actualIndex = i + batchIndex;
        results[actualIndex] = result;
        
        if (result.status === 'rejected') {
          const error = result.reason;
          failedSearches.push({
            index: actualIndex,
            title: titles[actualIndex],
            error: error.isApiError ? error.originalError : error.message || 'No matches found',
            isApiError: error.isApiError || false,
          });
        }
      });

      // Small delay between batches to help with rate limiting
      if (i + BATCH_SIZE < titles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Second pass: retry failed searches that were API errors
    const apiFailures = failedSearches.filter(f => f.isApiError);

    if (apiFailures.length > 0) {
      console.log(`[BulkSearch] Retrying ${apiFailures.length} failed API requests...`);
      
      // Wait a bit before retry pass to let rate limits reset
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      for (const failure of apiFailures) {
        const title = failure.title;
        
        try {
          const searchResults = await tmdbService.searchMovies(title.trim());
          
          // Try variations if no results
          if (searchResults.results.length === 0) {
            const variations = [
              title.trim().replace(/^(the|a|an)\s+/i, ''),
              title.trim().replace(/\s+(the|a|an)$/i, ''),
            ].filter(v => v !== title.trim() && v.length > 0);
            
            for (const variation of variations) {
              try {
                const altResults = await tmdbService.searchMovies(variation);
                if (altResults.results.length > 0) {
                  searchResults.results = altResults.results;
                  break;
                }
              } catch {
                // Continue to next variation
              }
            }
          }
          
          const topMatches = searchResults.results.slice(0, 5);
          const detailedMatches = await Promise.allSettled(
            topMatches.map(async (movie) => {
              try {
                const details = await tmdbService.getMovieDetails(movie.id);
                const director = tmdbService.getDirector(details.credits);
                const cast = tmdbService.getTopCast(details.credits, 10);
                const posterUrl = tmdbService.getImageUrl(details.poster_path);
                
                return {
                  ...details,
                  director,
                  cast,
                  poster_url: posterUrl,
                };
              } catch (error) {
                console.warn(`Failed to fetch details for movie ${movie.id}:`, error);
                return movie;
              }
            })
          );
          
          const successfulMatches = detailedMatches
            .filter((result) => result.status === 'fulfilled')
            .map((result) => result.value);
          
          // Update the result
          results[failure.index] = {
            status: 'fulfilled',
            value: {
              originalTitle: title.trim(),
              matches: successfulMatches,
              selectedMatch: successfulMatches[0] || null,
            },
          };
          
          // Remove from failures list
          const failureIndex = failedSearches.findIndex(f => f.index === failure.index);
          if (failureIndex >= 0) {
            failedSearches.splice(failureIndex, 1);
          }
          
          console.log(`[BulkSearch] Successfully retried "${title}"`);
        } catch (error: any) {
          // Still failed after retry - keep as failure
          console.warn(`[BulkSearch] Retry failed for "${title}":`, error);
        }
      }
    }

    // Build final results
    const matched: any[] = [];
    const unmatched: any[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.matches.length > 0) {
        matched.push(result.value);
      } else {
        const failure = failedSearches.find(f => f.index === index);
        unmatched.push({
          originalTitle: titles[index],
          error: failure?.error || 
                 (result.status === 'rejected' 
                   ? (result.reason?.message || result.reason?.originalError || 'No matches found')
                   : 'No matches found'),
          wasRetried: failure?.isApiError || false,
        });
      }
    });

    console.log(`[BulkSearch] Completed: ${matched.length} matched, ${unmatched.length} unmatched, ${apiFailures.length} retried`);

    res.json({
      matched,
      unmatched,
      summary: {
        total: titles.length,
        matched: matched.length,
        unmatched: unmatched.length,
        retried: apiFailures.length,
      },
    });
  } catch (error) {
    console.error('Error in bulk movie search:', error);
    res.status(500).json({ error: 'Failed to search movies' });
  }
});

/**
 * GET /api/search/movies/:id/collections
 * Get collections that a movie belongs to
 */
router.get('/movies/:id/collections', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const movieId = parseInt(id, 10);

    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Invalid movie ID' });
    }

    const collection = await tmdbService.getMovieCollections(movieId);

    res.json(collection);
  } catch (error) {
    console.error('Error fetching movie collections:', error);
    res.status(500).json({ error: 'Failed to fetch movie collections' });
  }
});

/**
 * GET /api/search/collections/:id
 * Get collection details including all movies
 */
router.get('/collections/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const collectionId = parseInt(id, 10);

    if (isNaN(collectionId)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    const collectionDetails = await tmdbService.getCollectionDetails(collectionId);

    res.json(collectionDetails);
  } catch (error) {
    console.error('Error fetching collection details:', error);
    res.status(500).json({ error: 'Failed to fetch collection details' });
  }
});

// =============================================
// TV Show Search Endpoints
// =============================================

/**
 * GET /api/search/tv
 * Search for TV shows on TMDb
 */
router.get('/tv', async (req: Request, res: Response) => {
  try {
    const { q, page = '1' } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const pageNum = parseInt(page as string, 10);
    const results = await tmdbService.searchTV(q, pageNum);

    res.json(results);
  } catch (error) {
    console.error('Error searching TV shows:', error);
    res.status(500).json({ error: 'Failed to search TV shows' });
  }
});

/**
 * GET /api/search/tv/:id
 * Get detailed information about a TV show from TMDb
 */
router.get('/tv/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tvId = parseInt(id, 10);

    if (isNaN(tvId)) {
      return res.status(400).json({ error: 'Invalid TV show ID' });
    }

    const tvDetails = await tmdbService.getTVDetails(tvId);

    const creators = tmdbService.getCreators(tvDetails.created_by);
    const cast = tmdbService.getTVTopCast(tvDetails.credits, 10);
    const posterUrl = tmdbService.getImageUrl(tvDetails.poster_path);

    res.json({
      ...tvDetails,
      creators,
      cast,
      poster_url: posterUrl,
    });
  } catch (error) {
    console.error('Error fetching TV show details:', error);
    res.status(500).json({ error: 'Failed to fetch TV show details' });
  }
});

/**
 * GET /api/search/tv/:id/season/:seasonNumber
 * Get details for a specific TV season
 */
router.get('/tv/:id/season/:seasonNumber', async (req: Request, res: Response) => {
  try {
    const { id, seasonNumber } = req.params;
    const tvId = parseInt(id, 10);
    const seasonNum = parseInt(seasonNumber, 10);

    if (isNaN(tvId)) {
      return res.status(400).json({ error: 'Invalid TV show ID' });
    }
    if (isNaN(seasonNum)) {
      return res.status(400).json({ error: 'Invalid season number' });
    }

    const seasonDetails = await tmdbService.getTVSeasonDetails(tvId, seasonNum);
    res.json(seasonDetails);
  } catch (error) {
    console.error('Error fetching TV season details:', error);
    res.status(500).json({ error: 'Failed to fetch TV season details' });
  }
});

/**
 * GET /api/search/tv/:id/posters
 * Get posters for a TV show from TMDb
 */
router.get('/tv/:id/posters', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tvId = parseInt(id, 10);

    if (isNaN(tvId)) {
      return res.status(400).json({ error: 'Invalid TV show ID' });
    }

    const posters = await tmdbService.getTVImages(tvId);
    res.json(posters);
  } catch (error) {
    console.error('Error fetching TV show posters:', error);
    res.status(500).json({ error: 'Failed to fetch TV show posters' });
  }
});

/**
 * GET /api/search/tv/:id/season/:seasonNumber/posters
 * Get posters for a specific TV season from TMDb
 */
router.get('/tv/:id/season/:seasonNumber/posters', async (req: Request, res: Response) => {
  try {
    const { id, seasonNumber } = req.params;
    const tvId = parseInt(id, 10);
    const seasonNum = parseInt(seasonNumber, 10);

    if (isNaN(tvId) || isNaN(seasonNum)) {
      return res.status(400).json({ error: 'Invalid TV show ID or season number' });
    }

    const posters = await tmdbService.getTVSeasonImages(tvId, seasonNum);
    res.json(posters);
  } catch (error) {
    console.error('Error fetching TV season posters:', error);
    res.status(500).json({ error: 'Failed to fetch TV season posters' });
  }
});

export default router;

