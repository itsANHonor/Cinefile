import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { db } from '../database';
import { normalizeAsin, normalizeBarcode } from '../utils/identifiers.util';
import { ParsedBarcodeMetadata, parseBarcodeProduct } from './barcode-parser.service';
import { tmdbService } from './tmdb.service';

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

export interface EnrichedMovieCandidate {
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

export interface EnrichedTVCandidate {
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
  parts: EnrichedMovieCandidate[];
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
  movieMatches: EnrichedMovieCandidate[];
  tvMatches: EnrichedTVCandidate[];
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

export interface ProviderBatchLookupResult {
  found: Map<string, { product: BarcodeProductInfo; raw: unknown }>;
  rateLimited: boolean;
  retryAfterSeconds?: number;
  error?: string;
}

export interface BarcodeLookupProvider {
  readonly name: 'upcitemdb';
  getQuotaStatus(): Promise<BarcodeQuotaStatus>;
  lookupBatch(barcodes: string[]): Promise<ProviderBatchLookupResult>;
  invalidateApiKeyCache(): void;
}

const UPCITEMDB_FREE_URL = 'https://api.upcitemdb.com/prod/trial/lookup';
const UPCITEMDB_PAID_URL = 'https://api.upcitemdb.com/prod/v1/lookup';
const CACHE_TTL_FOUND_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const CACHE_TTL_MISS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FREE_BATCH_SIZE = 2;
const PAID_BATCH_SIZE = 10;
const FREE_WINDOW_MS = 62_000;
const FREE_MAX_PER_WINDOW = 5; // Stay safely under 6 req/min burst ceiling
const FREE_MIN_SPACING_MS = 10_500;
const PAID_MIN_SPACING_MS = 2_100;

function toEan13Key(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (digits.length === 12) return `0${digits}`;
  return digits || code;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class UpcItemDbProvider implements BarcodeLookupProvider {
  readonly name = 'upcitemdb' as const;
  private cachedKey: string | null | undefined = undefined;
  private keyCheckedAt = 0;
  private readonly KEY_CACHE_TTL_MS = 15_000;

  private limit: number | null = 100;
  private remaining: number | null = null;
  private resetAtMs: number | null = null;
  private rateLimitedUntilMs: number | null = null;

  private requestTimestamps: number[] = [];
  private lastRequestAt = 0;
  private queueMutex: Promise<void> = Promise.resolve();

  invalidateApiKeyCache(): void {
    this.cachedKey = undefined;
    this.keyCheckedAt = 0;
  }

  async resolveUserKey(): Promise<string | null> {
    const now = Date.now();
    if (this.cachedKey !== undefined && now - this.keyCheckedAt < this.KEY_CACHE_TTL_MS) {
      return this.cachedKey;
    }

    let dbKey = '';
    try {
      const row = await db('settings').where({ key: 'upcitemdb_user_key' }).first();
      dbKey = row?.value?.trim() || '';
    } catch {
      // Settings table may not be initialized yet
    }

    const envKey = process.env.UPCITEMDB_USER_KEY?.trim() || '';
    this.cachedKey = dbKey || envKey || null;
    this.keyCheckedAt = now;
    return this.cachedKey;
  }

  async getQuotaStatus(): Promise<BarcodeQuotaStatus> {
    const userKey = await this.resolveUserKey();
    const tier: 'free' | 'paid' = userKey ? 'paid' : 'free';
    const now = Date.now();
    if (this.rateLimitedUntilMs && now >= this.rateLimitedUntilMs) {
      this.rateLimitedUntilMs = null;
    }
    if (this.resetAtMs && now >= this.resetAtMs) {
      this.remaining = tier === 'free' ? 100 : 20000;
      this.resetAtMs = null;
    }

    return {
      provider: 'upcitemdb',
      tier,
      batchSize: tier === 'paid' ? PAID_BATCH_SIZE : FREE_BATCH_SIZE,
      limit: this.limit ?? (tier === 'free' ? 100 : 20000),
      remaining: this.remaining,
      resetAt: this.resetAtMs ? new Date(this.resetAtMs).toISOString() : null,
      rateLimitedUntil: this.rateLimitedUntilMs ? new Date(this.rateLimitedUntilMs).toISOString() : null,
    };
  }

  private updateQuotaFromHeaders(headers: Record<string, any> | undefined): void {
    if (!headers) return;
    const rawLimit = headers['x-ratelimit-limit'];
    const rawRemaining = headers['x-ratelimit-remaining'];
    const rawReset = headers['x-ratelimit-reset'];

    if (rawLimit !== undefined) {
      const parsed = Number(rawLimit);
      if (Number.isFinite(parsed) && parsed > 0) this.limit = parsed;
    }
    if (rawRemaining !== undefined) {
      const parsed = Number(rawRemaining);
      if (Number.isFinite(parsed) && parsed >= 0) this.remaining = parsed;
    }
    if (rawReset !== undefined) {
      const parsed = Number(rawReset);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.resetAtMs = parsed > 1e12 ? parsed : parsed * 1000;
      }
    }
  }

  private async waitForPacing(tier: 'free' | 'paid'): Promise<void> {
    const now = Date.now();
    if (tier === 'paid') {
      const elapsed = now - this.lastRequestAt;
      if (this.lastRequestAt > 0 && elapsed < PAID_MIN_SPACING_MS) {
        await sleep(PAID_MIN_SPACING_MS - elapsed);
      }
      this.lastRequestAt = Date.now();
      return;
    }

    // Free tier: allow up to 2 quick requests for snappy 1-4 item lookups,
    // then pace at FREE_MIN_SPACING_MS and stay under FREE_MAX_PER_WINDOW in 62s.
    this.requestTimestamps = this.requestTimestamps.filter((ts) => now - ts < FREE_WINDOW_MS);

    if (this.requestTimestamps.length >= FREE_MAX_PER_WINDOW) {
      const oldest = this.requestTimestamps[0];
      const waitMs = Math.max(FREE_WINDOW_MS - (Date.now() - oldest) + 500, 1000);
      await sleep(waitMs);
    } else if (this.requestTimestamps.length >= 2) {
      const elapsed = Date.now() - this.lastRequestAt;
      if (elapsed < FREE_MIN_SPACING_MS) {
        await sleep(FREE_MIN_SPACING_MS - elapsed);
      }
    }

    const stamped = Date.now();
    this.lastRequestAt = stamped;
    this.requestTimestamps.push(stamped);
  }

  async lookupBatch(barcodes: string[]): Promise<ProviderBatchLookupResult> {
    let release!: () => void;
    const prev = this.queueMutex;
    this.queueMutex = new Promise<void>((resolve) => {
      release = resolve;
    });

    await prev;
    try {
      return await this.executeBatch(barcodes, false);
    } finally {
      release();
    }
  }

  private async executeBatch(
    barcodes: string[],
    isRetryAfterTooFast: boolean
  ): Promise<ProviderBatchLookupResult> {
    const found = new Map<string, { product: BarcodeProductInfo; raw: unknown }>();
    if (barcodes.length === 0) {
      return { found, rateLimited: false };
    }

    const userKey = await this.resolveUserKey();
    const tier: 'free' | 'paid' = userKey ? 'paid' : 'free';

    if (this.rateLimitedUntilMs && Date.now() < this.rateLimitedUntilMs) {
      return {
        found,
        rateLimited: true,
        retryAfterSeconds: Math.ceil((this.rateLimitedUntilMs - Date.now()) / 1000),
        error: 'Daily UPCitemdb rate limit reached.',
      };
    }

    await this.waitForPacing(tier);

    const url = tier === 'paid' ? UPCITEMDB_PAID_URL : UPCITEMDB_FREE_URL;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    };
    if (tier === 'paid' && userKey) {
      headers.user_key = userKey;
      headers.key_type = '3scale';
    }

    try {
      const response = await axios.get(url, {
        params: { upc: barcodes.join(',') },
        headers,
        timeout: 15_000,
      });

      this.updateQuotaFromHeaders(response.headers);
      const items: any[] = Array.isArray(response.data?.items) ? response.data.items : [];

      for (const rawItem of items) {
        const title = typeof rawItem?.title === 'string' ? rawItem.title.trim() : '';
        if (!title) continue;

        const product: BarcodeProductInfo = {
          ean: typeof rawItem.ean === 'string' ? rawItem.ean : undefined,
          upc: typeof rawItem.upc === 'string' ? rawItem.upc : undefined,
          title,
          brand: typeof rawItem.brand === 'string' && rawItem.brand.trim() ? rawItem.brand.trim() : undefined,
          description:
            typeof rawItem.description === 'string' && rawItem.description.trim()
              ? rawItem.description.trim()
              : undefined,
          asin: normalizeAsin(rawItem.asin) || undefined,
          images: Array.isArray(rawItem.images)
            ? rawItem.images.filter((u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 6)
            : [],
          offerTitles: Array.isArray(rawItem.offers)
            ? rawItem.offers
                .map((o: any) => (typeof o?.title === 'string' ? o.title.trim() : ''))
                .filter(Boolean)
                .slice(0, 8)
            : [],
        };

        const itemKeys = new Set<string>();
        if (product.ean) itemKeys.add(toEan13Key(product.ean));
        if (product.upc) itemKeys.add(toEan13Key(product.upc));

        for (const requested of barcodes) {
          if (itemKeys.has(toEan13Key(requested))) {
            found.set(requested, { product, raw: rawItem });
          }
        }
      }

      return { found, rateLimited: false };
    } catch (err) {
      const axiosErr = err as AxiosError<any>;
      const status = axiosErr.response?.status;
      const errCode = axiosErr.response?.data?.code;
      this.updateQuotaFromHeaders(axiosErr.response?.headers);

      if (status === 404 || errCode === 'NOT_FOUND') {
        return { found, rateLimited: false };
      }

      if (status === 400 && (errCode === 'INVALID_UPC' || errCode === 'INVALID_QUERY')) {
        // When batching 2+ barcodes, one malformed code rejects the whole batch.
        // Fall back to individual lookups so valid codes still succeed.
        if (barcodes.length > 1) {
          for (const single of barcodes) {
            const singleRes = await this.executeBatch([single], false);
            for (const [k, v] of singleRes.found.entries()) {
              found.set(k, v);
            }
            if (singleRes.rateLimited) {
              return {
                found,
                rateLimited: true,
                retryAfterSeconds: singleRes.retryAfterSeconds,
                error: singleRes.error,
              };
            }
          }
          return { found, rateLimited: false };
        }
        return { found, rateLimited: false, error: 'Invalid UPC/EAN format.' };
      }

      if (status === 429) {
        const retryAfterHeader = Number(axiosErr.response?.headers?.['retry-after']);
        if (errCode === 'TOO_FAST' && !isRetryAfterTooFast) {
          const waitSec = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? Math.min(retryAfterHeader, 30) : 12;
          await sleep(waitSec * 1000);
          return this.executeBatch(barcodes, true);
        }

        const retrySec = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : 3600;
        this.rateLimitedUntilMs = Date.now() + retrySec * 1000;
        if (errCode === 'EXCEED_LIMIT') {
          this.remaining = 0;
        }
        return {
          found,
          rateLimited: true,
          retryAfterSeconds: retrySec,
          error:
            errCode === 'EXCEED_LIMIT'
              ? 'Daily UPCitemdb lookup limit reached. You can still search TMDb manually below.'
              : 'UPCitemdb rate limit reached. Please wait a moment before trying again.',
        };
      }

      if (status === 401 || errCode === 'AUTH_ERR') {
        return {
          found,
          rateLimited: false,
          error: 'UPCitemdb API key authentication failed. Check your key in Settings.',
        };
      }

      return {
        found,
        rateLimited: false,
        error: axiosErr.message || 'Failed to contact UPCitemdb.',
      };
    }
  }
}

interface BarcodeCacheRow {
  barcode: string;
  provider: string;
  found: number | boolean;
  title: string | null;
  brand: string | null;
  asin: string | null;
  raw_payload: string | null;
  fetched_at: string;
}

class BarcodeLookupService {
  private provider: BarcodeLookupProvider = new UpcItemDbProvider();
  private jobs: Map<string, { job: BarcodeLookupJob; cancelled: boolean }> = new Map();
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupOldJobs(), 60_000);
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  invalidateApiKeyCache(): void {
    this.provider.invalidateApiKeyCache();
  }

  async getQuotaStatus(): Promise<BarcodeQuotaStatus> {
    return this.provider.getQuotaStatus();
  }

  async checkOwnedBarcodes(rawBarcodes: string[]): Promise<Record<string, BarcodeOwnedMatch[]>> {
    const normalized = Array.from(
      new Set(rawBarcodes.map((b) => normalizeBarcode(b)).filter((b): b is string => Boolean(b)))
    );
    const result: Record<string, BarcodeOwnedMatch[]> = {};
    if (normalized.length === 0) return result;

    // Build candidate variants (12-digit UPC and 13-digit leading-zero EAN equivalence)
    const queryCandidates = new Set<string>();
    const canonicalByCandidate = new Map<string, string[]>();
    for (const code of normalized) {
      const variants = [code];
      if (/^\d{12}$/.test(code)) variants.push(`0${code}`);
      if (/^0\d{12}$/.test(code)) variants.push(code.slice(1));
      for (const v of variants) {
        queryCandidates.add(v);
        const list = canonicalByCandidate.get(v) || [];
        list.push(code);
        canonicalByCandidate.set(v, list);
      }
    }

    const rows = await db('physical_items')
      .whereIn('barcode', Array.from(queryCandidates))
      .where((qb) => {
        qb.whereNull('archived').orWhere('archived', 0);
      })
      .select('id', 'name', 'physical_format', 'barcode');

    for (const row of rows) {
      const matchedOriginals = canonicalByCandidate.get(row.barcode) || [row.barcode];
      let formats: string[] = [];
      try {
        formats = typeof row.physical_format === 'string' ? JSON.parse(row.physical_format) : row.physical_format || [];
      } catch {
        formats = [];
      }

      for (const original of matchedOriginals) {
        if (!result[original]) result[original] = [];
        if (!result[original].some((existing) => existing.id === row.id)) {
          result[original].push({
            id: row.id,
            name: row.name,
            physical_format: Array.isArray(formats) ? formats : [],
            barcode: row.barcode,
          });
        }
      }
    }

    return result;
  }

  private async getCachedProducts(barcodes: string[]): Promise<Map<string, { found: boolean; product?: BarcodeProductInfo }>> {
    const hits = new Map<string, { found: boolean; product?: BarcodeProductInfo }>();
    if (barcodes.length === 0) return hits;

    const hasTable = await db.schema.hasTable('barcode_cache');
    if (!hasTable) return hits;

    const lookupSet = new Set<string>();
    const mapToOriginal = new Map<string, string[]>();
    for (const code of barcodes) {
      const variants = [code];
      if (/^\d{12}$/.test(code)) variants.push(`0${code}`);
      if (/^0\d{12}$/.test(code)) variants.push(code.slice(1));
      for (const v of variants) {
        lookupSet.add(v);
        const list = mapToOriginal.get(v) || [];
        list.push(code);
        mapToOriginal.set(v, list);
      }
    }

    const rows: BarcodeCacheRow[] = await db('barcode_cache').whereIn('barcode', Array.from(lookupSet));
    const now = Date.now();

    for (const row of rows) {
      const fetchedMs = Date.parse(row.fetched_at);
      const isFound = Boolean(row.found);
      const ttl = isFound ? CACHE_TTL_FOUND_MS : CACHE_TTL_MISS_MS;
      if (Number.isFinite(fetchedMs) && now - fetchedMs > ttl) {
        continue;
      }

      let product: BarcodeProductInfo | undefined;
      if (isFound) {
        let parsedPayload: any = null;
        try {
          parsedPayload = row.raw_payload ? JSON.parse(row.raw_payload) : null;
        } catch {
          parsedPayload = null;
        }

        product = {
          ean: parsedPayload?.ean || undefined,
          upc: parsedPayload?.upc || undefined,
          title: row.title || parsedPayload?.title || '',
          brand: row.brand || parsedPayload?.brand || undefined,
          description: parsedPayload?.description || undefined,
          asin: row.asin || normalizeAsin(parsedPayload?.asin) || undefined,
          images: Array.isArray(parsedPayload?.images) ? parsedPayload.images : [],
          offerTitles: Array.isArray(parsedPayload?.offers)
            ? parsedPayload.offers.map((o: any) => o?.title).filter(Boolean)
            : Array.isArray(parsedPayload?.offerTitles)
              ? parsedPayload.offerTitles
              : [],
        };
      }

      const originals = mapToOriginal.get(row.barcode) || [row.barcode];
      for (const original of originals) {
        hits.set(original, { found: isFound, product });
      }
    }

    return hits;
  }

  private async saveToCache(
    barcode: string,
    found: boolean,
    product?: BarcodeProductInfo,
    raw?: unknown
  ): Promise<void> {
    try {
      const hasTable = await db.schema.hasTable('barcode_cache');
      if (!hasTable) return;

      const payload = raw ?? product ?? null;
      await db('barcode_cache')
        .insert({
          barcode,
          provider: this.provider.name,
          found: found ? 1 : 0,
          title: product?.title || null,
          brand: product?.brand || null,
          asin: product?.asin || null,
          raw_payload: payload ? JSON.stringify(payload) : null,
          fetched_at: new Date().toISOString(),
        })
        .onConflict('barcode')
        .merge();
    } catch (err) {
      console.warn(`[BarcodeCache] Failed to cache ${barcode}:`, err);
    }
  }

  private async enrichMovieDetails(movieId: number): Promise<EnrichedMovieCandidate | null> {
    try {
      const details: any = await tmdbService.getMovieDetails(movieId);
      return {
        id: details.id,
        title: details.title,
        original_title: details.original_title,
        original_language: details.original_language,
        overview: details.overview || '',
        poster_path: details.poster_path || null,
        poster_url: tmdbService.getImageUrl(details.poster_path),
        release_date: details.release_date || '',
        runtime: details.runtime,
        director: tmdbService.getDirector(details.credits),
        cast: tmdbService.getTopCast(details.credits, 10),
        genres: details.genres,
        belongs_to_collection: details.belongs_to_collection || null,
      };
    } catch {
      return null;
    }
  }

  private async enrichTVDetails(tvId: number): Promise<EnrichedTVCandidate | null> {
    try {
      const details = await tmdbService.getTVDetails(tvId);
      return {
        id: details.id,
        name: details.name,
        original_name: details.original_name,
        original_language: details.original_language,
        overview: details.overview || '',
        poster_path: details.poster_path || null,
        poster_url: tmdbService.getImageUrl(details.poster_path),
        first_air_date: details.first_air_date || '',
        number_of_seasons: details.number_of_seasons || 0,
        creators: tmdbService.getCreators(details.created_by),
        cast: tmdbService.getTVTopCast(details.credits, 10),
        genres: details.genres,
        seasons: (details.seasons || [])
          .filter((s) => s.season_number >= 0)
          .map((s) => ({
            id: s.id,
            name: s.name,
            overview: s.overview || '',
            poster_path: s.poster_path || null,
            poster_url: tmdbService.getImageUrl(s.poster_path),
            air_date: s.air_date || '',
            season_number: s.season_number,
            episode_count: s.episode_count || 0,
          })),
      };
    } catch {
      return null;
    }
  }

  private async resolveTmdbForProduct(
    product: BarcodeProductInfo,
    parsed: ParsedBarcodeMetadata
  ): Promise<{
    movieMatches: EnrichedMovieCandidate[];
    tvMatches: EnrichedTVCandidate[];
    collectionSuggestion: BarcodeCollectionSuggestion | null;
    tmdbWarning?: string;
  }> {
    const configured = await tmdbService.isConfigured();
    if (!configured) {
      return {
        movieMatches: [],
        tvMatches: [],
        collectionSuggestion: null,
        tmdbWarning: 'TMDb API key is not configured. Configure it in Settings to auto-match movies.',
      };
    }

    const queriesToTry = [parsed.cleanedQuery, ...parsed.alternateQueries].filter(
      (q) => q && q.trim().length >= 2
    );

    const movieMatches: EnrichedMovieCandidate[] = [];
    const tvMatches: EnrichedTVCandidate[] = [];
    let collectionSuggestion: BarcodeCollectionSuggestion | null = null;

    try {
      // 1. TV Show search if TV hinted
      if (parsed.mediaTypeHint === 'tv') {
        for (const q of queriesToTry) {
          const tvRes = await tmdbService.searchTV(q, 1);
          if (tvRes.results.length > 0) {
            const top = tvRes.results.slice(0, 3);
            const enriched = await Promise.all(top.map((s) => this.enrichTVDetails(s.id)));
            for (const item of enriched) {
              if (item) tvMatches.push(item);
            }
            break;
          }
        }
      }

      // 2. Collection search if likely a box set / trilogy
      if (parsed.isLikelyBoxSet) {
        const colQueries = [parsed.collectionQuery, ...queriesToTry].filter(
          (q): q is string => Boolean(q && q.trim().length >= 2)
        );
        const triedCol = new Set<string>();
        for (const q of colQueries) {
          const key = q.toLowerCase();
          if (triedCol.has(key)) continue;
          triedCol.add(key);

          const colRes = await tmdbService.searchCollections(q, 1);
          if (colRes.results.length > 0) {
            const best = colRes.results[0];
            const colDetails = await tmdbService.getCollectionDetails(best.id);
            const partsRaw: any[] = Array.isArray(colDetails?.parts) ? colDetails.parts : [];
            const sortedParts = [...partsRaw].sort((a, b) =>
              (a.release_date || '9999').localeCompare(b.release_date || '9999')
            );
            const enrichedParts = (
              await Promise.all(sortedParts.slice(0, 15).map((p) => this.enrichMovieDetails(p.id)))
            ).filter((m): m is EnrichedMovieCandidate => Boolean(m));

            if (enrichedParts.length > 0) {
              collectionSuggestion = {
                id: colDetails.id,
                name: colDetails.name,
                overview: colDetails.overview || '',
                poster_url: tmdbService.getImageUrl(colDetails.poster_path),
                parts: enrichedParts,
              };
              break;
            }
          }
        }
      }

      // 3. Movie search (always run unless we already have strong TV matches, as fallback/single-movie candidates)
      if (tvMatches.length === 0) {
        for (const q of queriesToTry) {
          const movieRes = await tmdbService.searchMovies(q, 1);
          if (movieRes.results.length > 0) {
            const top = movieRes.results.slice(0, 5);
            const enriched = await Promise.all(top.map((m) => this.enrichMovieDetails(m.id)));
            for (const item of enriched) {
              if (item) movieMatches.push(item);
            }
            break;
          }
        }
      }

      // 4. If box set was detected and direct collection search missed, check if top movie belongs to a collection
      if (parsed.isLikelyBoxSet && !collectionSuggestion && movieMatches[0]?.belongs_to_collection?.id) {
        try {
          const colDetails = await tmdbService.getCollectionDetails(
            movieMatches[0].belongs_to_collection.id
          );
          const partsRaw: any[] = Array.isArray(colDetails?.parts) ? colDetails.parts : [];
          const sortedParts = [...partsRaw].sort((a, b) =>
            (a.release_date || '9999').localeCompare(b.release_date || '9999')
          );
          const enrichedParts = (
            await Promise.all(sortedParts.slice(0, 15).map((p) => this.enrichMovieDetails(p.id)))
          ).filter((m): m is EnrichedMovieCandidate => Boolean(m));

          if (enrichedParts.length > 1) {
            collectionSuggestion = {
              id: colDetails.id,
              name: colDetails.name,
              overview: colDetails.overview || '',
              poster_url: tmdbService.getImageUrl(colDetails.poster_path),
              parts: enrichedParts,
            };
          }
        } catch {
          // Non-fatal fallback
        }
      }

      // 5. If TV hinted but 0 TV results and 0 movies, fall back to movie search; vice versa if movie missed and TV has hits
      if (parsed.mediaTypeHint === 'movie' && movieMatches.length === 0 && !collectionSuggestion) {
        for (const q of queriesToTry.slice(0, 2)) {
          const tvRes = await tmdbService.searchTV(q, 1);
          if (tvRes.results.length > 0) {
            const enriched = await Promise.all(
              tvRes.results.slice(0, 3).map((s) => this.enrichTVDetails(s.id))
            );
            for (const item of enriched) {
              if (item) tvMatches.push(item);
            }
            break;
          }
        }
      }
    } catch (err: any) {
      return {
        movieMatches,
        tvMatches,
        collectionSuggestion,
        tmdbWarning: err?.message || 'TMDb lookup failed.',
      };
    }

    return { movieMatches, tvMatches, collectionSuggestion };
  }

  async startLookupJob(
    rawBarcodes: string[],
    options: { forceRefresh?: boolean } = {}
  ): Promise<BarcodeLookupJob> {
    const uniqueBarcodes = Array.from(
      new Set(rawBarcodes.map((b) => normalizeBarcode(b)).filter((b): b is string => Boolean(b)))
    ).slice(0, 100);

    const ownedMap = await this.checkOwnedBarcodes(uniqueBarcodes);
    const cachedMap = options.forceRefresh
      ? new Map<string, { found: boolean; product?: BarcodeProductInfo }>()
      : await this.getCachedProducts(uniqueBarcodes);
    const quota = await this.provider.getQuotaStatus();

    const cachedCount = uniqueBarcodes.filter((b) => cachedMap.has(b)).length;
    const uncachedCount = uniqueBarcodes.length - cachedCount;
    const batchesNeeded = Math.ceil(uncachedCount / quota.batchSize);
    const estimatedSeconds =
      batchesNeeded <= 2
        ? Math.max(1, batchesNeeded * 2)
        : Math.ceil(
            2 +
              (batchesNeeded - 2) *
                (quota.tier === 'paid' ? PAID_MIN_SPACING_MS / 1000 : FREE_MIN_SPACING_MS / 1000)
          );

    const jobId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const items: BarcodeLookupItemResult[] = uniqueBarcodes.map((barcode) => ({
      barcode,
      status: 'pending',
      source: 'none',
      ownedItems: ownedMap[barcode] || [],
      movieMatches: [],
      tvMatches: [],
      collectionSuggestion: null,
    }));

    const job: BarcodeLookupJob = {
      jobId,
      status: 'running',
      total: uniqueBarcodes.length,
      completed: 0,
      cachedCount,
      uncachedCount,
      estimatedSeconds,
      currentBarcode: uniqueBarcodes[0] || null,
      quota,
      items,
      startTime: Date.now(),
    };

    const entry = { job, cancelled: false };
    this.jobs.set(jobId, entry);

    // Run asynchronously so the HTTP POST returns immediately with jobId
    void this.runLookupJob(entry, cachedMap).catch((err) => {
      console.error(`[BarcodeLookup] Job ${jobId} failed:`, err);
      entry.job.status = 'failed';
      entry.job.error = err?.message || 'Barcode lookup job failed.';
      entry.job.endTime = Date.now();
    });

    return this.snapshotJob(job);
  }

  private async runLookupJob(
    entry: { job: BarcodeLookupJob; cancelled: boolean },
    cachedMap: Map<string, { found: boolean; product?: BarcodeProductInfo }>
  ): Promise<void> {
    const { job } = entry;
    const itemByCode = new Map<string, BarcodeLookupItemResult>();
    for (const item of job.items) {
      itemByCode.set(item.barcode, item);
    }

    const uncachedBarcodes: string[] = [];

    // Pass 1: Process cached items immediately
    for (const item of job.items) {
      if (entry.cancelled) {
        job.status = 'cancelled';
        job.currentBarcode = null;
        job.endTime = Date.now();
        return;
      }

      const cached = cachedMap.get(item.barcode);
      if (!cached) {
        uncachedBarcodes.push(item.barcode);
        continue;
      }

      job.currentBarcode = item.barcode;
      item.source = 'cache';

      if (cached.found && cached.product) {
        item.product = cached.product;
        item.parsed = parseBarcodeProduct({
          title: cached.product.title,
          brand: cached.product.brand,
          description: cached.product.description,
          offers: (cached.product.offerTitles || []).map((t) => ({ title: t })),
        });
        const tmdb = await this.resolveTmdbForProduct(cached.product, item.parsed);
        item.movieMatches = tmdb.movieMatches;
        item.tvMatches = tmdb.tvMatches;
        item.collectionSuggestion = tmdb.collectionSuggestion;
        item.tmdbWarning = tmdb.tmdbWarning;
        item.status = 'resolved';
      } else {
        item.status = 'not_found';
      }

      job.completed += 1;
    }

    // Pass 2: Query provider in batches for uncached barcodes
    const batchSize = job.quota.batchSize || FREE_BATCH_SIZE;
    let hitRateLimit = false;
    let rateLimitMessage = 'Rate limit reached.';

    for (let i = 0; i < uncachedBarcodes.length; i += batchSize) {
      if (entry.cancelled) {
        job.status = 'cancelled';
        job.currentBarcode = null;
        job.endTime = Date.now();
        return;
      }

      const batch = uncachedBarcodes.slice(i, i + batchSize);
      job.currentBarcode = batch[0];

      if (hitRateLimit) {
        for (const code of batch) {
          const item = itemByCode.get(code)!;
          item.status = 'rate_limited';
          item.error = rateLimitMessage;
          job.completed += 1;
        }
        continue;
      }

      const providerRes = await this.provider.lookupBatch(batch);
      job.quota = await this.provider.getQuotaStatus();

      if (providerRes.rateLimited) {
        hitRateLimit = true;
        rateLimitMessage = providerRes.error || rateLimitMessage;
      }

      for (const code of batch) {
        if (entry.cancelled) {
          job.status = 'cancelled';
          job.currentBarcode = null;
          job.endTime = Date.now();
          return;
        }

        const item = itemByCode.get(code)!;
        const foundEntry = providerRes.found.get(code);

        if (foundEntry) {
          item.source = 'provider';
          item.product = foundEntry.product;
          await this.saveToCache(code, true, foundEntry.product, foundEntry.raw);

          item.parsed = parseBarcodeProduct({
            title: foundEntry.product.title,
            brand: foundEntry.product.brand,
            description: foundEntry.product.description,
            offers: (foundEntry.product.offerTitles || []).map((t) => ({ title: t })),
          });
          const tmdb = await this.resolveTmdbForProduct(foundEntry.product, item.parsed);
          item.movieMatches = tmdb.movieMatches;
          item.tvMatches = tmdb.tvMatches;
          item.collectionSuggestion = tmdb.collectionSuggestion;
          item.tmdbWarning = tmdb.tmdbWarning;
          item.status = 'resolved';
        } else if (providerRes.rateLimited) {
          item.status = 'rate_limited';
          item.error = rateLimitMessage;
        } else if (providerRes.error) {
          item.status = 'error';
          item.error = providerRes.error;
        } else {
          item.source = 'provider';
          item.status = 'not_found';
          await this.saveToCache(code, false);
        }

        job.completed += 1;
      }
    }

    job.currentBarcode = null;
    job.quota = await this.provider.getQuotaStatus();
    job.status = entry.cancelled ? 'cancelled' : 'completed';
    job.endTime = Date.now();
  }

  getJob(jobId: string): BarcodeLookupJob | null {
    const entry = this.jobs.get(jobId);
    if (!entry) return null;
    return this.snapshotJob(entry.job);
  }

  cancelJob(jobId: string): boolean {
    const entry = this.jobs.get(jobId);
    if (!entry) return false;
    entry.cancelled = true;
    if (entry.job.status === 'running') {
      entry.job.status = 'cancelled';
      entry.job.currentBarcode = null;
      entry.job.endTime = Date.now();
    }
    return true;
  }

  private snapshotJob(job: BarcodeLookupJob): BarcodeLookupJob {
    return {
      ...job,
      quota: { ...job.quota },
      items: job.items.map((item) => ({ ...item })),
    };
  }

  private cleanupOldJobs(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, entry] of this.jobs.entries()) {
      if (entry.job.endTime && entry.job.endTime < oneHourAgo) {
        this.jobs.delete(id);
      }
    }
  }
}

export const barcodeLookupService = new BarcodeLookupService();
