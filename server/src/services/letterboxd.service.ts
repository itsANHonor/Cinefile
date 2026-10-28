import axios from 'axios';
import zlib from 'zlib';
import { db } from '../database';

export interface ParsedLetterboxdFilm {
  tmdbId: number | null;
  filmTitle: string;
  normalizedTitle: string;
  filmYear: number | null;
  rating: number | null;
  liked: boolean;
  watched: boolean;
  lastWatchedDate: string | null;
  rewatch: boolean;
  letterboxdUri: string | null;
  source: 'rss' | 'export';
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

/**
 * Decode XML / HTML entities in text nodes from RSS feeds safely
 */
export function decodeXmlEntities(input: string): string {
  if (!input) return '';
  const safeFromCodePoint = (cp: number): string => {
    if (Number.isNaN(cp) || cp < 0 || cp > 0x10ffff) return '';
    try {
      return String.fromCodePoint(cp);
    } catch {
      return '';
    }
  };
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Validate and sanitize a Letterboxd permalink URI.
 * Only permits https:// URLs on letterboxd.com or boxd.it to prevent XSS (javascript:/data:) or open redirects.
 */
export function sanitizeLetterboxdUri(rawUri: string | null | undefined): string | null {
  const trimmed = (rawUri || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== 'letterboxd.com' && host !== 'www.letterboxd.com' && host !== 'boxd.it') {
      return null;
    }
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Normalize a movie title for deterministic and fuzzy matching.
 * Strips diacritics, normalizes '&' -> 'and', removes punctuation, and collapses whitespace.
 */
export function normalizeFilmTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip leading English/French/Spanish articles ("the", "a", "an") for secondary matching
 */
export function stripLeadingArticle(normalizedTitle: string): string {
  return normalizedTitle.replace(/^(the|a|an)\s+/i, '').trim();
}

/**
 * Extract base title before a subtitle separator (":" or " - ") for franchise/subtitle matching
 * e.g. "Star Wars: Episode IV - A New Hope" -> "star wars"
 */
export function extractBaseTitleWithoutSubtitle(rawTitle: string): string | null {
  if (!rawTitle) return null;
  const match = rawTitle.split(/\s*[:–—-]\s+/);
  if (match.length > 1 && match[0].trim().length >= 3) {
    const base = normalizeFilmTitle(match[0]);
    const full = normalizeFilmTitle(rawTitle);
    if (base && base !== full && base.length >= 4) {
      return base;
    }
  }
  return null;
}

/**
 * Compute Levenshtein edit distance between two strings (bounded to 200 chars for DoS safety)
 */
function levenshteinDistance(rawA: string, rawB: string): number {
  const a = rawA.slice(0, 200);
  const b = rawB.slice(0, 200);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Compute similarity (0.0 - 1.0) between two movie titles
 */
export function computeTitleSimilarity(rawA: string, rawB: string): { score: number; reason: string } {
  const normA = normalizeFilmTitle(rawA);
  const normB = normalizeFilmTitle(rawB);
  if (!normA || !normB) return { score: 0, reason: '' };

  if (normA === normB) {
    return { score: 1.0, reason: 'Exact title match' };
  }

  const noArtA = stripLeadingArticle(normA);
  const noArtB = stripLeadingArticle(normB);
  if (noArtA && noArtA === noArtB) {
    return { score: 0.96, reason: 'Title matches without leading article' };
  }

  // Check subtitle match (e.g. "Star Wars: Episode IV - A New Hope" vs "Star Wars")
  const baseA = extractBaseTitleWithoutSubtitle(rawA);
  const baseB = extractBaseTitleWithoutSubtitle(rawB);
  if ((baseA && (baseA === normB || baseA === noArtB)) || (baseB && (baseB === normA || baseB === noArtA))) {
    return { score: 0.9, reason: 'Base title matches (with subtitle difference)' };
  }

  // Check if one contains the other as a prefix/suffix with significant length
  if (normA.length >= 5 && normB.length >= 5) {
    if (normA.startsWith(normB + ' ') || normB.startsWith(normA + ' ')) {
      return { score: 0.86, reason: 'Title prefix match' };
    }
  }

  // Token Jaccard + Levenshtein blend
  const tokensA = new Set(noArtA.split(' ').filter(Boolean));
  const tokensB = new Set(noArtB.split(' ').filter(Boolean));
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  const maxLen = Math.max(noArtA.length, noArtB.length);
  const editSim = maxLen > 0 ? 1 - levenshteinDistance(noArtA, noArtB) / maxLen : 0;

  const blended = Math.max(editSim, jaccard * 0.6 + editSim * 0.4);
  return {
    score: Number(blended.toFixed(3)),
    reason: editSim >= 0.8 ? 'Close spelling / alternate punctuation' : 'Similar title keywords',
  };
}

/**
 * Clean and strictly validate a user-provided Letterboxd username or profile URL.
 * Enforces strict alphanumeric/underscore/hyphen format to prevent SSRF or path traversal.
 */
export function normalizeLetterboxdUsername(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?letterboxd\.com\/([a-zA-Z0-9_-]{1,40})(?:\/|$)/i);
  const candidate = urlMatch ? urlMatch[1] : trimmed.replace(/^@/, '').replace(/\/+$/, '').trim();
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(candidate)) {
    return '';
  }
  return candidate;
}

/**
 * Parse a Letterboxd RSS XML string into structured film records
 */
export function parseLetterboxdRssXml(xml: string): ParsedLetterboxdFilm[] {
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  const extractTag = (block: string, tagName: string): string => {
    const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, 'i');
    const match = block.match(regex);
    return match ? decodeXmlEntities(match[1]) : '';
  };

  // Deduplicate by key (tmdbId or normalizedTitle+year), keeping newest watch date
  const filmMap = new Map<string, ParsedLetterboxdFilm>();

  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const guid = extractTag(itemXml, 'guid');
    // Skip list entries in the RSS feed
    if (guid.startsWith('letterboxd-list-')) {
      continue;
    }

    const filmTitle = extractTag(itemXml, 'letterboxd:filmTitle');
    if (!filmTitle) {
      continue;
    }

    const normalizedTitle = normalizeFilmTitle(filmTitle);
    if (!normalizedTitle) {
      continue;
    }

    const yearStr = extractTag(itemXml, 'letterboxd:filmYear');
    const filmYear = yearStr && !Number.isNaN(Number(yearStr)) ? parseInt(yearStr, 10) : null;

    const ratingStr = extractTag(itemXml, 'letterboxd:memberRating');
    const rating =
      ratingStr && !Number.isNaN(Number(ratingStr)) && Number(ratingStr) > 0
        ? Number(ratingStr)
        : null;

    const likedStr = extractTag(itemXml, 'letterboxd:memberLike');
    const liked = likedStr.toLowerCase() === 'yes';

    const rewatchStr = extractTag(itemXml, 'letterboxd:rewatch');
    const rewatch = rewatchStr.toLowerCase() === 'yes';

    const watchedDate = extractTag(itemXml, 'letterboxd:watchedDate') || null;
    const tmdbStr = extractTag(itemXml, 'tmdb:movieId');
    const tmdbId = tmdbStr && !Number.isNaN(Number(tmdbStr)) ? parseInt(tmdbStr, 10) : null;
    const link = sanitizeLetterboxdUri(extractTag(itemXml, 'link'));

    const key = tmdbId ? `tmdb:${tmdbId}` : `title:${normalizedTitle}:${filmYear ?? ''}`;
    const existing = filmMap.get(key);

    if (!existing) {
      filmMap.set(key, {
        tmdbId,
        filmTitle,
        normalizedTitle,
        filmYear,
        rating,
        liked,
        watched: true,
        lastWatchedDate: watchedDate,
        rewatch,
        letterboxdUri: link,
        source: 'rss',
      });
    } else {
      // Merge multiple diary entries for the same movie in the feed
      const isNewerWatch =
        watchedDate && (!existing.lastWatchedDate || watchedDate >= existing.lastWatchedDate);
      filmMap.set(key, {
        ...existing,
        tmdbId: existing.tmdbId || tmdbId,
        rating: isNewerWatch ? (rating ?? existing.rating) : (existing.rating ?? rating),
        liked: existing.liked || liked,
        watched: true,
        lastWatchedDate: isNewerWatch ? watchedDate : existing.lastWatchedDate,
        rewatch: existing.rewatch || rewatch || Boolean(existing.lastWatchedDate && watchedDate),
        letterboxdUri: isNewerWatch ? (link || existing.letterboxdUri) : existing.letterboxdUri,
      });
    }
  }

  return Array.from(filmMap.values());
}

const MAX_CSV_ROWS = 50000;
const MAX_ZIP_ENTRIES = 250;
const MAX_SINGLE_FILE_UNCOMPRESSED_BYTES = 15 * 1024 * 1024; // 15MB per CSV
const MAX_TOTAL_UNCOMPRESSED_BYTES = 25 * 1024 * 1024; // 25MB total across archive

/**
 * RFC-4180 full CSV parser supporting multiline quoted strings (e.g., in reviews.csv or diary.csv)
 */
export function parseCsvDocument(csvText: string): Array<Record<string, string>> {
  const cleaned = csvText.replace(/^\uFEFF/, ''); // Strip UTF-8 BOM if present
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && next === '\n') {
        i++;
      }
      currentRow.push(currentField);
      if (currentRow.some((cell) => cell.trim() !== '')) {
        rows.push(currentRow);
        if (rows.length > MAX_CSV_ROWS) {
          break;
        }
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if ((currentField.length > 0 || currentRow.length > 0) && rows.length <= MAX_CSV_ROWS) {
    currentRow.push(currentField);
    if (currentRow.some((cell) => cell.trim() !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  const records: Array<Record<string, string>> = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header] = (row[idx] ?? '').trim();
    });
    records.push(obj);
  }

  return records;
}

/**
 * Minimal, zero-dependency ZIP archive reader using Node's built-in zlib.
 * Hardened against ZIP bombs with strict entry count, per-file maxOutputLength, and cumulative byte limits.
 */
export function extractTextFilesFromZip(zipBuffer: Buffer): Map<string, string> {
  const files = new Map<string, string>();

  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  const minEocdOffset = Math.max(0, zipBuffer.length - 65557);
  for (let i = zipBuffer.length - 22; i >= minEocdOffset; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP archive: End of Central Directory not found.');
  }

  const totalEntries = Math.min(zipBuffer.readUInt16LE(eocdOffset + 10), MAX_ZIP_ENTRIES);
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  let ptr = cdOffset;
  let totalUncompressedBytes = 0;

  for (let entryIdx = 0; entryIdx < totalEntries; entryIdx++) {
    if (ptr + 46 > zipBuffer.length || zipBuffer.readUInt32LE(ptr) !== 0x02014b50) {
      break;
    }

    const compressionMethod = zipBuffer.readUInt16LE(ptr + 10);
    const compressedSize = zipBuffer.readUInt32LE(ptr + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(ptr + 24);
    const fileNameLen = zipBuffer.readUInt16LE(ptr + 28);
    const extraLen = zipBuffer.readUInt16LE(ptr + 30);
    const commentLen = zipBuffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(ptr + 42);

    const fileName = zipBuffer
      .subarray(ptr + 46, ptr + 46 + fileNameLen)
      .toString('utf8')
      .replace(/\\/g, '/');

    ptr += 46 + fileNameLen + extraLen + commentLen;

    const lowerFileName = fileName.toLowerCase();
    // Prevent zip-slip or non-CSV extraction
    if (
      !lowerFileName.endsWith('.csv') ||
      lowerFileName.endsWith('/') ||
      lowerFileName.includes('..')
    ) {
      continue;
    }

    if (uncompressedSize > MAX_SINGLE_FILE_UNCOMPRESSED_BYTES) {
      throw new Error(`CSV file "${fileName}" inside ZIP exceeds maximum allowed size (15MB).`);
    }

    if (
      localHeaderOffset + 30 > zipBuffer.length ||
      zipBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50
    ) {
      continue;
    }

    const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > zipBuffer.length || dataStart > dataEnd) {
      continue;
    }

    const compressedSlice = zipBuffer.subarray(dataStart, dataEnd);
    let contentBuffer: Buffer;
    if (compressionMethod === 0) {
      if (compressedSlice.length > MAX_SINGLE_FILE_UNCOMPRESSED_BYTES) {
        throw new Error(`CSV file "${fileName}" exceeds maximum allowed size.`);
      }
      contentBuffer = compressedSlice;
    } else if (compressionMethod === 8) {
      contentBuffer = zlib.inflateRawSync(compressedSlice, {
        maxOutputLength: MAX_SINGLE_FILE_UNCOMPRESSED_BYTES,
      });
    } else {
      continue;
    }

    totalUncompressedBytes += contentBuffer.length;
    if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error('ZIP archive uncompressed content exceeds maximum allowed limit (25MB).');
    }

    files.set(lowerFileName, contentBuffer.toString('utf8'));
  }

  return files;
}

class LetterboxdService {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;

  /**
   * Initialize startup / background sync scheduler.
   * - In Desktop Mode: runs immediately on app launch (non-blocking), plus periodic check.
   * - In Container/Server Mode: checks periodically and runs whenever the configured interval has elapsed.
   */
  public initializeScheduler(options: { isDesktop: boolean }): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }

    // Initial check shortly after server start (non-blocking)
    setTimeout(() => {
      this.checkAndRunScheduledSync(options.isDesktop).catch((err) => {
        console.warn('⚠️ Letterboxd startup sync check warning:', err?.message || err);
      });
    }, 3000).unref();

    // Check every 15 minutes whether a scheduled background sync is due
    this.schedulerInterval = setInterval(() => {
      this.checkAndRunScheduledSync(false).catch((err) => {
        console.warn('⚠️ Letterboxd scheduled sync warning:', err?.message || err);
      });
    }, 15 * 60 * 1000);

    this.schedulerInterval.unref();
  }

  private async checkAndRunScheduledSync(forceOnDesktopStartup: boolean): Promise<void> {
    if (this.isSyncing) return;

    const settingsRows = await db('settings')
      .whereIn('key', [
        'letterboxd_username',
        'letterboxd_auto_sync',
        'letterboxd_sync_interval_hours',
        'letterboxd_last_sync_at',
      ])
      .select('key', 'value');

    const map: Record<string, string> = {};
    settingsRows.forEach((r: any) => {
      map[r.key] = r.value;
    });

    const username = normalizeLetterboxdUsername(map.letterboxd_username || '');
    if (!username) return;

    const autoSync = map.letterboxd_auto_sync !== 'false';
    if (!autoSync) return;

    if (forceOnDesktopStartup) {
      console.log(`🎬 [Letterboxd] Desktop launch sync triggered for @${username}`);
      await this.syncFromRss(username);
      return;
    }

    const intervalHours = Math.max(1, parseInt(map.letterboxd_sync_interval_hours || '4', 10) || 4);
    const lastSyncAt = map.letterboxd_last_sync_at ? Date.parse(map.letterboxd_last_sync_at) : 0;
    const elapsedMs = Date.now() - (Number.isNaN(lastSyncAt) ? 0 : lastSyncAt);

    if (elapsedMs >= intervalHours * 3600 * 1000) {
      console.log(`🎬 [Letterboxd] Scheduled background RSS sync triggered for @${username}`);
      await this.syncFromRss(username);
    }
  }

  /**
   * Upsert a single setting key/value in the `settings` table
   */
  private async setSettingValue(key: string, value: string): Promise<void> {
    const existing = await db('settings').where({ key }).first();
    if (existing) {
      await db('settings').where({ key }).update({ value, updated_at: db.fn.now() });
    } else {
      await db('settings').insert({ key, value });
    }
  }

  /**
   * Fetch and sync the user's public Letterboxd RSS feed
   */
  public async syncFromRss(usernameOverride?: string): Promise<LetterboxdSyncSummary> {
    if (this.isSyncing) {
      throw new Error('A Letterboxd sync is already in progress.');
    }

    this.isSyncing = true;
    const syncedAt = new Date().toISOString();

    try {
      let username = normalizeLetterboxdUsername(usernameOverride || '');
      if (!username) {
        const row = await db('settings').where({ key: 'letterboxd_username' }).first();
        username = normalizeLetterboxdUsername(row?.value || '');
      }

      if (!username) {
        throw new Error('Letterboxd username is not configured.');
      }

      const rssUrl = `https://letterboxd.com/${encodeURIComponent(username)}/rss/`;
      const response = await axios.get<string>(rssUrl, {
        timeout: 15000,
        maxContentLength: 2 * 1024 * 1024, // 2MB cap
        maxBodyLength: 2 * 1024 * 1024,
        maxRedirects: 2,
        responseType: 'text',
        headers: {
          'User-Agent': 'Cinefile/2.0 (+https://github.com/itsanhonor/Cinefile)',
          Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        },
      });

      const xmlText = typeof response.data === 'string' ? response.data : String(response.data);
      const parsedFilms = parseLetterboxdRssXml(xmlText);

      await this.upsertParsedFilmsIntoCache(parsedFilms);
      const { matchedInCollection } = await this.reconcileMediaWithCache();
      const totalCachedRow = await db('letterboxd_cache').count('id as count').first();
      const totalCached = Number(totalCachedRow?.count || 0);
      const fuzzySuggestions = await this.getFuzzyMatchSuggestions();

      const summary: LetterboxdSyncSummary = {
        status: 'success',
        source: 'rss',
        syncedAt,
        itemsProcessed: parsedFilms.length,
        totalCached,
        matchedInCollection,
        fuzzySuggestionsCount: fuzzySuggestions.length,
        error: null,
      };

      await this.setSettingValue('letterboxd_last_sync_at', syncedAt);
      await this.setSettingValue('letterboxd_last_sync_status', JSON.stringify(summary));

      return summary;
    } catch (error: any) {
      const errMsg =
        error?.response?.status === 404
          ? 'Letterboxd user not found. Please check your username.'
          : error?.message || 'Failed to fetch Letterboxd RSS feed.';

      const totalCachedRow = await db('letterboxd_cache').count('id as count').first();
      const matchedRow = await db('media')
        .where('letterboxd_watched', 1)
        .orWhereNotNull('letterboxd_rating')
        .count('id as count')
        .first();

      const summary: LetterboxdSyncSummary = {
        status: 'error',
        source: 'rss',
        syncedAt,
        itemsProcessed: 0,
        totalCached: Number(totalCachedRow?.count || 0),
        matchedInCollection: Number(matchedRow?.count || 0),
        fuzzySuggestionsCount: 0,
        error: errMsg,
      };

      await this.setSettingValue('letterboxd_last_sync_status', JSON.stringify(summary));
      throw new Error(errMsg);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Import Letterboxd historical data from a Letterboxd account export (.zip or individual .csv)
   */
  public async importFromExportBuffer(
    fileBuffer: Buffer,
    originalFilename: string,
  ): Promise<LetterboxdSyncSummary & { fuzzySuggestions: LetterboxdFuzzySuggestion[] }> {
    const syncedAt = new Date().toISOString();
    const lowerName = (originalFilename || '').toLowerCase();
    const isZip =
      lowerName.endsWith('.zip') ||
      (fileBuffer.length >= 4 && fileBuffer.readUInt32LE(0) === 0x04034b50);

    const csvFiles = new Map<string, string>();
    if (isZip) {
      const extracted = extractTextFilesFromZip(fileBuffer);
      for (const [name, content] of extracted.entries()) {
        csvFiles.set(name, content);
      }
    } else {
      csvFiles.set(lowerName || 'upload.csv', fileBuffer.toString('utf8'));
    }

    if (csvFiles.size === 0) {
      throw new Error('No CSV files found in the uploaded file.');
    }

    // Merge film records across watched.csv, ratings.csv, diary.csv, reviews.csv, and likes/films.csv
    const mergedByKey = new Map<string, ParsedLetterboxdFilm>();

    const getOrCreateEntry = (
      title: string,
      yearStr: string | undefined,
      uri: string | undefined,
    ): ParsedLetterboxdFilm | null => {
      const cleanTitle = (title || '').trim();
      const normalizedTitle = normalizeFilmTitle(cleanTitle);
      if (!normalizedTitle) return null;

      const parsedYear =
        yearStr && !Number.isNaN(Number(yearStr)) && Number(yearStr) > 1880
          ? parseInt(yearStr, 10)
          : null;
      const sanitizedUri = sanitizeLetterboxdUri(uri);

      const key = `${normalizedTitle}::${parsedYear ?? ''}`;
      let entry = mergedByKey.get(key);
      if (!entry) {
        entry = {
          tmdbId: null,
          filmTitle: cleanTitle,
          normalizedTitle,
          filmYear: parsedYear,
          rating: null,
          liked: false,
          watched: true,
          lastWatchedDate: null,
          rewatch: false,
          letterboxdUri: sanitizedUri,
          source: 'export',
        };
        mergedByKey.set(key, entry);
      } else if (sanitizedUri && !entry.letterboxdUri) {
        entry.letterboxdUri = sanitizedUri;
      }
      return entry;
    };

    // Helper to find CSV content by suffix (handles root or subfolder inside zip)
    const findCsvBySuffix = (suffix: string): string | undefined => {
      for (const [pathKey, content] of csvFiles.entries()) {
        if (pathKey === suffix || pathKey.endsWith(`/${suffix}`)) {
          return content;
        }
      }
      return undefined;
    };

    const watchedCsv = findCsvBySuffix('watched.csv');
    const ratingsCsv = findCsvBySuffix('ratings.csv');
    const diaryCsv = findCsvBySuffix('diary.csv');
    const reviewsCsv = findCsvBySuffix('reviews.csv');
    const likesCsv = findCsvBySuffix('likes/films.csv');

    const hasRecognizedArchiveFiles = Boolean(
      watchedCsv || ratingsCsv || diaryCsv || reviewsCsv || likesCsv,
    );

    const processRows = (
      rows: Array<Record<string, string>>,
      fileKind: 'watched' | 'ratings' | 'diary' | 'reviews' | 'likes' | 'generic',
    ) => {
      for (const row of rows) {
        const name = row['Name'] || row['Title'] || row['filmTitle'] || '';
        const year = row['Year'] || row['filmYear'] || '';
        const uri = row['Letterboxd URI'] || row['LetterboxdURI'] || row['url'] || '';
        if (!name) continue;

        const entry = getOrCreateEntry(name, year, uri);
        if (!entry) continue;

        const ratingStr = row['Rating'] || '';
        const parsedRating =
          ratingStr && !Number.isNaN(Number(ratingStr)) && Number(ratingStr) > 0
            ? Number(ratingStr)
            : null;

        const watchedDate = row['Watched Date'] || row['WatchedDate'] || '';
        const fallbackDate = row['Date'] || '';
        const isRewatch = (row['Rewatch'] || '').toLowerCase() === 'yes';
        const isLikedCol = (row['Liked'] || '').toLowerCase() === 'yes';

        if (fileKind === 'likes' || isLikedCol) {
          entry.liked = true;
        }

        if (fileKind === 'ratings' && parsedRating !== null) {
          entry.rating = parsedRating;
        } else if (parsedRating !== null && entry.rating === null) {
          entry.rating = parsedRating;
        }

        if (fileKind === 'diary' || fileKind === 'reviews' || fileKind === 'generic') {
          const effectiveWatchDate = watchedDate || (fileKind === 'diary' ? fallbackDate : '');
          if (effectiveWatchDate) {
            if (entry.lastWatchedDate && entry.lastWatchedDate !== effectiveWatchDate) {
              entry.rewatch = true;
            }
            if (!entry.lastWatchedDate || effectiveWatchDate >= entry.lastWatchedDate) {
              entry.lastWatchedDate = effectiveWatchDate;
              const safeUri = sanitizeLetterboxdUri(uri);
              if (safeUri) entry.letterboxdUri = safeUri;
              if (parsedRating !== null) entry.rating = parsedRating;
            }
          }
          if (isRewatch) {
            entry.rewatch = true;
          }
        }
      }
    };

    if (hasRecognizedArchiveFiles) {
      if (watchedCsv) processRows(parseCsvDocument(watchedCsv), 'watched');
      if (ratingsCsv) processRows(parseCsvDocument(ratingsCsv), 'ratings');
      if (diaryCsv) processRows(parseCsvDocument(diaryCsv), 'diary');
      if (reviewsCsv) processRows(parseCsvDocument(reviewsCsv), 'reviews');
      if (likesCsv) processRows(parseCsvDocument(likesCsv), 'likes');
    } else {
      // Single arbitrary Letterboxd CSV uploaded (e.g. renamed diary.csv or ratings.csv)
      for (const [name, content] of csvFiles.entries()) {
        const rows = parseCsvDocument(content);
        if (rows.length === 0) continue;
        const firstRow = rows[0];
        const isLikesFile =
          name.includes('like') &&
          !('Rating' in firstRow) &&
          !('Watched Date' in firstRow) &&
          !('Review' in firstRow);
        processRows(rows, isLikesFile ? 'likes' : 'generic');
      }
    }

    const parsedFilms = Array.from(mergedByKey.values());
    if (parsedFilms.length === 0) {
      throw new Error(
        'No valid Letterboxd film rows found. Please upload a Letterboxd export .zip or ratings/diary/watched .csv file.',
      );
    }

    await this.upsertParsedFilmsIntoCache(parsedFilms);
    const { matchedInCollection } = await this.reconcileMediaWithCache();
    const totalCachedRow = await db('letterboxd_cache').count('id as count').first();
    const totalCached = Number(totalCachedRow?.count || 0);
    const fuzzySuggestions = await this.getFuzzyMatchSuggestions();

    const summary: LetterboxdSyncSummary = {
      status: 'success',
      source: 'export',
      syncedAt,
      itemsProcessed: parsedFilms.length,
      totalCached,
      matchedInCollection,
      fuzzySuggestionsCount: fuzzySuggestions.length,
      error: null,
    };

    await this.setSettingValue('letterboxd_last_sync_at', syncedAt);
    await this.setSettingValue('letterboxd_last_sync_status', JSON.stringify(summary));

    return {
      ...summary,
      fuzzySuggestions,
    };
  }

  /**
   * Upsert parsed film records into `letterboxd_cache`, merging with any existing cache rows
   */
  public async upsertParsedFilmsIntoCache(films: ParsedLetterboxdFilm[]): Promise<void> {
    if (films.length === 0) return;

    const existingRows = await db('letterboxd_cache').select('*');
    const byTmdbId = new Map<number, any>();
    const byTitleYear = new Map<string, any>();

    for (const row of existingRows) {
      if (row.tmdb_id) {
        byTmdbId.set(Number(row.tmdb_id), row);
      }
      const key = `${row.normalized_title}::${row.film_year ?? ''}`;
      byTitleYear.set(key, row);
    }

    await db.transaction(async (trx) => {
      for (const film of films) {
        const key = `${film.normalizedTitle}::${film.filmYear ?? ''}`;
        const existing = (film.tmdbId ? byTmdbId.get(film.tmdbId) : null) || byTitleYear.get(key);

        if (existing) {
          const mergedRating = film.rating !== null ? film.rating : existing.rating;
          const mergedLiked = Boolean(existing.liked) || film.liked;
          const mergedWatched = Boolean(existing.watched) || film.watched;
          const mergedLastWatched =
            film.lastWatchedDate &&
            (!existing.last_watched_date || film.lastWatchedDate >= existing.last_watched_date)
              ? film.lastWatchedDate
              : existing.last_watched_date;
          const mergedRewatch =
            Boolean(existing.rewatch) ||
            film.rewatch ||
            Boolean(
              existing.last_watched_date &&
                film.lastWatchedDate &&
                existing.last_watched_date !== film.lastWatchedDate,
            );
          const mergedUri = film.letterboxdUri || existing.letterboxd_uri;
          const mergedTmdbId = film.tmdbId || existing.tmdb_id || null;

          await trx('letterboxd_cache')
            .where({ id: existing.id })
            .update({
              tmdb_id: mergedTmdbId,
              film_title: film.filmTitle || existing.film_title,
              normalized_title: film.normalizedTitle,
              film_year: film.filmYear ?? existing.film_year,
              rating: mergedRating,
              liked: mergedLiked,
              watched: mergedWatched,
              last_watched_date: mergedLastWatched,
              rewatch: mergedRewatch,
              letterboxd_uri: mergedUri,
              source: film.source,
              updated_at: trx.fn.now(),
            });
        } else {
          const [insertedId] = await trx('letterboxd_cache').insert({
            tmdb_id: film.tmdbId,
            normalized_title: film.normalizedTitle,
            film_title: film.filmTitle,
            film_year: film.filmYear,
            rating: film.rating,
            liked: film.liked,
            watched: film.watched,
            last_watched_date: film.lastWatchedDate,
            rewatch: film.rewatch,
            letterboxd_uri: film.letterboxdUri,
            source: film.source,
          });

          const created = {
            id: insertedId,
            tmdb_id: film.tmdbId,
            normalized_title: film.normalizedTitle,
            film_title: film.filmTitle,
            film_year: film.filmYear,
            rating: film.rating,
            liked: film.liked,
            watched: film.watched,
            last_watched_date: film.lastWatchedDate,
            rewatch: film.rewatch,
            letterboxd_uri: film.letterboxdUri,
          };
          if (film.tmdbId) byTmdbId.set(film.tmdbId, created);
          byTitleYear.set(key, created);
        }
      }
    });
  }

  /**
   * Reconcile `letterboxd_cache` against the Cinefile `media` table using 3-tier high-confidence matching:
   *  - Tier 0: Explicit manual link (`matched_media_id`)
   *  - Tier 1a: Exact `tmdb_id` match
   *  - Tier 1b: Exact `normalized_title` + exact release year
   *  - Tier 1c: Exact `normalized_title` + ±1 release year (festival vs theatrical release tolerance, when unambiguous)
   *  - Tier 1d: Exact `normalized_title` when year is missing on one side and title is unique
   */
  public async reconcileMediaWithCache(): Promise<{ matchedInCollection: number }> {
    const allMedia = await db('media')
      .where(function () {
        this.where('media_type', 'movie').orWhereNull('media_type');
      })
      .select('id', 'title', 'tmdb_id', 'release_date', 'letterboxd_dismissed_cache_ids');

    const allCache = await db('letterboxd_cache').select('*');

    if (allMedia.length === 0 || allCache.length === 0) {
      return { matchedInCollection: 0 };
    }

    const cacheByMatchedMediaId = new Map<number, any>();
    const cacheByTmdbId = new Map<number, any>();
    const cacheByNormalizedTitle = new Map<string, any[]>();

    for (const c of allCache) {
      if (c.matched_media_id) {
        cacheByMatchedMediaId.set(Number(c.matched_media_id), c);
      }
      if (c.tmdb_id) {
        cacheByTmdbId.set(Number(c.tmdb_id), c);
      }
      const list = cacheByNormalizedTitle.get(c.normalized_title) || [];
      list.push(c);
      cacheByNormalizedTitle.set(c.normalized_title, list);
    }

    // Count how many media items share each normalized title
    const mediaTitleCounts = new Map<string, number>();
    for (const m of allMedia) {
      const norm = normalizeFilmTitle(m.title);
      mediaTitleCounts.set(norm, (mediaTitleCounts.get(norm) || 0) + 1);
    }

    let matchedInCollection = 0;

    await db.transaction(async (trx) => {
      for (const m of allMedia) {
        const mediaId = Number(m.id);
        const mediaTmdbId = m.tmdb_id ? Number(m.tmdb_id) : null;
        const normTitle = normalizeFilmTitle(m.title);
        const mediaYear = m.release_date ? parseInt(String(m.release_date).slice(0, 4), 10) : null;
        const validMediaYear = mediaYear && !Number.isNaN(mediaYear) ? mediaYear : null;

        let matchedCache: any = null;

        // Tier 0: Explicit manual link
        if (cacheByMatchedMediaId.has(mediaId)) {
          matchedCache = cacheByMatchedMediaId.get(mediaId);
        }

        // Tier 1a: Exact TMDb ID
        if (!matchedCache && mediaTmdbId && cacheByTmdbId.has(mediaTmdbId)) {
          matchedCache = cacheByTmdbId.get(mediaTmdbId);
        }

        // Tier 1b / 1c / 1d: Exact Normalized Title + Year checks
        if (!matchedCache && normTitle) {
          const candidates = cacheByNormalizedTitle.get(normTitle) || [];
          if (candidates.length > 0 && validMediaYear !== null) {
            // Tier 1b: Exact year match
            const exactYearMatches = candidates.filter((c) => Number(c.film_year) === validMediaYear);
            if (exactYearMatches.length === 1) {
              matchedCache = exactYearMatches[0];
            } else if (exactYearMatches.length === 0 && candidates.length === 1) {
              const singleCandidate = candidates[0];
              const candidateYear = singleCandidate.film_year ? Number(singleCandidate.film_year) : null;
              const isUniqueTitleInCollection = (mediaTitleCounts.get(normTitle) || 0) === 1;

              // Tier 1c: ±1 year festival release tolerance when unique on both sides
              if (
                candidateYear !== null &&
                Math.abs(candidateYear - validMediaYear) === 1 &&
                isUniqueTitleInCollection
              ) {
                matchedCache = singleCandidate;
              }
              // Tier 1d: Year missing in cache, unique title
              else if (candidateYear === null && isUniqueTitleInCollection) {
                matchedCache = singleCandidate;
              }
            }
          } else if (
            candidates.length === 1 &&
            validMediaYear === null &&
            (mediaTitleCounts.get(normTitle) || 0) === 1
          ) {
            matchedCache = candidates[0];
          }
        }

        if (matchedCache) {
          matchedInCollection++;
          await trx('media')
            .where({ id: mediaId })
            .update({
              letterboxd_rating: matchedCache.rating ?? null,
              letterboxd_liked: Boolean(matchedCache.liked),
              letterboxd_watched: Boolean(matchedCache.watched),
              letterboxd_last_watched_date: matchedCache.last_watched_date || null,
              letterboxd_rewatch: Boolean(matchedCache.rewatch),
              letterboxd_uri: matchedCache.letterboxd_uri || null,
              letterboxd_updated_at: trx.fn.now(),
            });

          // Backfill matched_media_id and tmdb_id onto the cache row for future syncs
          if (
            matchedCache.matched_media_id !== mediaId ||
            (mediaTmdbId && !matchedCache.tmdb_id)
          ) {
            await trx('letterboxd_cache')
              .where({ id: matchedCache.id })
              .update({
                matched_media_id: mediaId,
                tmdb_id: matchedCache.tmdb_id || mediaTmdbId,
                updated_at: trx.fn.now(),
              });
          }
        }
      }
    });

    return { matchedInCollection };
  }

  /**
   * Reconcile a single newly created or updated media item against `letterboxd_cache`
   */
  public async reconcileSingleMedia(mediaId: number): Promise<void> {
    const hasCache = await db.schema.hasTable('letterboxd_cache');
    if (!hasCache) return;
    const countRow = await db('letterboxd_cache').count('id as count').first();
    if (!countRow || Number(countRow.count) === 0) return;
    await this.reconcileMediaWithCache();
  }

  /**
   * Compute fuzzy match suggestions for unmatched movies in the user's Cinefile collection
   */
  public async getFuzzyMatchSuggestions(): Promise<LetterboxdFuzzySuggestion[]> {
    const unmatchedMedia = await db('media')
      .where(function () {
        this.where('media_type', 'movie').orWhereNull('media_type');
      })
      .andWhere(function () {
        this.where('letterboxd_watched', 0).orWhereNull('letterboxd_watched');
      })
      .andWhere(function () {
        this.whereNull('letterboxd_rating');
      })
      .select('id', 'title', 'release_date', 'cover_art_url', 'director', 'letterboxd_dismissed_cache_ids');

    if (unmatchedMedia.length === 0) return [];

    const unmatchedCache = await db('letterboxd_cache')
      .whereNull('matched_media_id')
      .select('*');

    if (unmatchedCache.length === 0) return [];

    const suggestions: LetterboxdFuzzySuggestion[] = [];

    for (const m of unmatchedMedia) {
      const mediaId = Number(m.id);
      const mediaYear = m.release_date ? parseInt(String(m.release_date).slice(0, 4), 10) : null;
      const validMediaYear = mediaYear && !Number.isNaN(mediaYear) ? mediaYear : null;

      let dismissedIds: number[] = [];
      if (m.letterboxd_dismissed_cache_ids) {
        try {
          const parsed = JSON.parse(m.letterboxd_dismissed_cache_ids);
          if (Array.isArray(parsed)) dismissedIds = parsed.map(Number);
        } catch {
          dismissedIds = [];
        }
      }
      const dismissedSet = new Set(dismissedIds);

      let bestCandidate: any = null;
      let bestScore = 0;
      let bestReason = '';

      for (const c of unmatchedCache) {
        if (dismissedSet.has(Number(c.id))) continue;

        const cacheYear = c.film_year ? Number(c.film_year) : null;
        const yearDiff =
          validMediaYear !== null && cacheYear !== null
            ? Math.abs(validMediaYear - cacheYear)
            : null;

        // If both have years and they are more than 3 years apart, skip unless titles are near-identical
        const { score: titleSim, reason } = computeTitleSimilarity(m.title, c.film_title);
        if (titleSim < 0.62) continue;

        let combinedScore = titleSim;
        let matchReason = reason;

        if (yearDiff !== null) {
          if (yearDiff === 0) {
            combinedScore = Math.min(0.99, titleSim + 0.08);
            matchReason = `${reason} (${cacheYear})`;
          } else if (yearDiff === 1) {
            combinedScore = Math.min(0.96, titleSim + 0.03);
            matchReason = `${reason} (release year off by 1 yr: ${cacheYear} vs ${validMediaYear})`;
          } else if (yearDiff === 2 && titleSim >= 0.85) {
            combinedScore = titleSim - 0.04;
            matchReason = `${reason} (release year ${cacheYear} vs ${validMediaYear})`;
          } else {
            // Different decade / remake (e.g., Suspiria 1977 vs 2018) -> do not suggest unless user searches manually
            continue;
          }
        }

        if (combinedScore >= 0.72 && combinedScore > bestScore) {
          bestScore = combinedScore;
          bestCandidate = c;
          bestReason = matchReason;
        }
      }

      if (bestCandidate) {
        suggestions.push({
          mediaId,
          mediaTitle: m.title,
          mediaYear: validMediaYear,
          mediaCoverArtUrl: m.cover_art_url || null,
          mediaDirector: m.director || null,
          cacheId: Number(bestCandidate.id),
          letterboxdTitle: bestCandidate.film_title,
          letterboxdYear: bestCandidate.film_year ? Number(bestCandidate.film_year) : null,
          rating: bestCandidate.rating ?? null,
          liked: Boolean(bestCandidate.liked),
          lastWatchedDate: bestCandidate.last_watched_date || null,
          rewatch: Boolean(bestCandidate.rewatch),
          letterboxdUri: bestCandidate.letterboxd_uri || null,
          confidence: Number(bestScore.toFixed(2)),
          reason: bestReason,
        });
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Manually link a Cinefile `media` item to a `letterboxd_cache` entry
   */
  public async linkCacheToMedia(mediaId: number, cacheId: number): Promise<any> {
    const media = await db('media').where({ id: mediaId }).first();
    if (!media) {
      throw new Error('Media item not found.');
    }

    const cacheEntry = await db('letterboxd_cache').where({ id: cacheId }).first();
    if (!cacheEntry) {
      throw new Error('Letterboxd entry not found.');
    }

    await db.transaction(async (trx) => {
      // Clear any previous cache row linked to this mediaId
      await trx('letterboxd_cache')
        .where({ matched_media_id: mediaId })
        .update({ matched_media_id: null });

      await trx('letterboxd_cache')
        .where({ id: cacheId })
        .update({
          matched_media_id: mediaId,
          tmdb_id: cacheEntry.tmdb_id || media.tmdb_id || null,
          updated_at: trx.fn.now(),
        });

      await trx('media')
        .where({ id: mediaId })
        .update({
          letterboxd_rating: cacheEntry.rating ?? null,
          letterboxd_liked: Boolean(cacheEntry.liked),
          letterboxd_watched: Boolean(cacheEntry.watched),
          letterboxd_last_watched_date: cacheEntry.last_watched_date || null,
          letterboxd_rewatch: Boolean(cacheEntry.rewatch),
          letterboxd_uri: cacheEntry.letterboxd_uri || null,
          letterboxd_updated_at: trx.fn.now(),
        });
    });

    return db('media').where({ id: mediaId }).first();
  }

  /**
   * Unlink Letterboxd data from a specific `media` item
   */
  public async unlinkMedia(mediaId: number): Promise<any> {
    await db.transaction(async (trx) => {
      await trx('letterboxd_cache')
        .where({ matched_media_id: mediaId })
        .update({ matched_media_id: null, tmdb_id: null });

      await trx('media')
        .where({ id: mediaId })
        .update({
          letterboxd_rating: null,
          letterboxd_liked: false,
          letterboxd_watched: false,
          letterboxd_last_watched_date: null,
          letterboxd_rewatch: false,
          letterboxd_uri: null,
          letterboxd_updated_at: null,
        });
    });

    return db('media').where({ id: mediaId }).first();
  }

  /**
   * Dismiss a fuzzy match candidate for a media item so it won't be suggested again
   */
  public async dismissFuzzySuggestion(mediaId: number, cacheId: number): Promise<void> {
    const media = await db('media').where({ id: mediaId }).first();
    if (!media) return;

    let dismissed: number[] = [];
    if (media.letterboxd_dismissed_cache_ids) {
      try {
        const parsed = JSON.parse(media.letterboxd_dismissed_cache_ids);
        if (Array.isArray(parsed)) dismissed = parsed.map(Number);
      } catch {
        dismissed = [];
      }
    }

    if (!dismissed.includes(cacheId)) {
      dismissed.push(cacheId);
      await db('media')
        .where({ id: mediaId })
        .update({
          letterboxd_dismissed_cache_ids: JSON.stringify(dismissed),
        });
    }
  }

  /**
   * Search cached Letterboxd entries (for manual linking in Settings or MediaEditModal)
   */
  public async searchCache(query: string, limit = 20): Promise<any[]> {
    const trimmed = (query || '').trim();
    const norm = normalizeFilmTitle(trimmed);

    let q = db('letterboxd_cache').select('*');
    if (norm) {
      q = q.where(function () {
        this.where('normalized_title', 'like', `%${norm}%`).orWhere(
          'film_title',
          'like',
          `%${trimmed}%`,
        );
      });
    }

    const rows = await q.orderBy('last_watched_date', 'desc').orderBy('film_title', 'asc').limit(limit);
    return rows.map((r: any) => ({
      id: Number(r.id),
      tmdbId: r.tmdb_id ? Number(r.tmdb_id) : null,
      matchedMediaId: r.matched_media_id ? Number(r.matched_media_id) : null,
      filmTitle: r.film_title,
      filmYear: r.film_year ? Number(r.film_year) : null,
      rating: r.rating ?? null,
      liked: Boolean(r.liked),
      watched: Boolean(r.watched),
      lastWatchedDate: r.last_watched_date || null,
      rewatch: Boolean(r.rewatch),
      letterboxdUri: r.letterboxd_uri || null,
      source: r.source,
    }));
  }

  /**
   * Get full Letterboxd integration status, counts, and pending fuzzy match suggestions
   */
  public async getStatus(includeFuzzySuggestions = true): Promise<LetterboxdStatusResponse> {
    const settingsRows = await db('settings')
      .whereIn('key', [
        'letterboxd_username',
        'letterboxd_auto_sync',
        'letterboxd_sync_interval_hours',
        'letterboxd_last_sync_at',
        'letterboxd_last_sync_status',
      ])
      .select('key', 'value');

    const map: Record<string, string> = {};
    settingsRows.forEach((r: any) => {
      map[r.key] = r.value;
    });

    const username = normalizeLetterboxdUsername(map.letterboxd_username || '');
    const autoSync = map.letterboxd_auto_sync !== 'false';
    const syncIntervalHours = Math.max(
      1,
      parseInt(map.letterboxd_sync_interval_hours || '4', 10) || 4,
    );
    const lastSyncAt = map.letterboxd_last_sync_at || null;

    let lastSyncStatus: LetterboxdSyncSummary | null = null;
    if (map.letterboxd_last_sync_status) {
      try {
        lastSyncStatus = JSON.parse(map.letterboxd_last_sync_status);
      } catch {
        lastSyncStatus = null;
      }
    }

    const totalCachedRow = await db('letterboxd_cache').count('id as count').first();
    const totalCachedFilms = Number(totalCachedRow?.count || 0);

    const matchedRow = await db('media')
      .where(function () {
        this.where('media_type', 'movie').orWhereNull('media_type');
      })
      .andWhere(function () {
        this.where('letterboxd_watched', 1).orWhereNotNull('letterboxd_rating');
      })
      .count('id as count')
      .first();
    const matchedMoviesCount = Number(matchedRow?.count || 0);

    const totalMoviesRow = await db('media')
      .where(function () {
        this.where('media_type', 'movie').orWhereNull('media_type');
      })
      .count('id as count')
      .first();
    const totalCollectionMovies = Number(totalMoviesRow?.count || 0);

    const fuzzySuggestions = includeFuzzySuggestions
      ? await this.getFuzzyMatchSuggestions()
      : [];

    return {
      configured: Boolean(username || totalCachedFilms > 0),
      username,
      autoSync,
      syncIntervalHours,
      lastSyncAt,
      lastSyncStatus: includeFuzzySuggestions ? lastSyncStatus : null,
      totalCachedFilms,
      matchedMoviesCount,
      totalCollectionMovies,
      fuzzySuggestions,
    };
  }

  /**
   * Clear all Letterboxd cached data and reset media columns
   */
  public async clearAllData(): Promise<void> {
    await db.transaction(async (trx) => {
      await trx('letterboxd_cache').del();
      await trx('media').update({
        letterboxd_rating: null,
        letterboxd_liked: false,
        letterboxd_watched: false,
        letterboxd_last_watched_date: null,
        letterboxd_rewatch: false,
        letterboxd_uri: null,
        letterboxd_updated_at: null,
        letterboxd_dismissed_cache_ids: null,
      });
      await trx('settings')
        .whereIn('key', ['letterboxd_last_sync_at', 'letterboxd_last_sync_status'])
        .del();
    });
  }
}

export const letterboxdService = new LetterboxdService();
