import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB max image buffer
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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

interface CacheEntry {
  timestamp: number;
  data: CoverSearchResponse;
}

const USER_AGENTS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function getBrowserHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  return {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Linux"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...extra,
  };
}

export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower === '::'
  ) {
    return true;
  }

  const ipVersion = net.isIP(lower);
  if (ipVersion === 4) {
    const parts = lower.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  if (ipVersion === 6) {
    if (
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80') ||
      lower.startsWith('::ffff:127.') ||
      lower.startsWith('::ffff:10.') ||
      lower.startsWith('::ffff:192.168.') ||
      lower.startsWith('::ffff:169.254.')
    ) {
      return true;
    }
  }

  return false;
}

export function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_match, dec) => {
      const code = parseInt(dec, 10);
      // Filter out Blu-ray.com private-use icon glyphs (e.g. &#5200;)
      if (code >= 5000 && code <= 5600) return '';
      return Number.isNaN(code) ? '' : String.fromCharCode(code);
    })
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Upgrade an Amazon image URL to its high-resolution version (`._SL1500_.jpg`)
 * and produce a fast thumbnail version (`._AC_UY500_.jpg`).
 */
export function upgradeAmazonImageUrl(rawUrl: string): { hiResUrl: string; thumbnailUrl: string } {
  const cleaned = rawUrl.trim().split(/\s+/)[0];
  // Match base image identifier e.g. https://m.media-amazon.com/images/I/81md8l1LLrL._AC_UY218_.jpg
  const match = cleaned.match(/^(https?:\/\/[^/]+\/images\/[IP]\/[^._]+)(?:\.[^/?#]+)?\.(jpg|jpeg|png|webp)/i);
  if (match) {
    const base = match[1];
    return {
      hiResUrl: `${base}._SL1500_.jpg`,
      thumbnailUrl: `${base}._AC_UY500_.jpg`,
    };
  }
  return {
    hiResUrl: cleaned,
    thumbnailUrl: cleaned,
  };
}

/**
 * Upgrade a Blu-ray.com static image URL to its high-resolution `_front.jpg`
 * and `_large.jpg` thumbnail.
 */
export function upgradeBlurayImageUrl(
  id: string,
  isDvd: boolean = false,
  variant: 'front' | 'large' | 'slip' | 'back' | 'slipback' | 'overview' = 'front'
): { hiResUrl: string; thumbnailUrl: string } {
  const folder = isDvd ? 'dvdcovers' : 'covers';
  const hiResSuffix = variant === 'front' ? 'front' : variant;
  const thumbSuffix = variant === 'front' ? 'large' : variant;
  return {
    hiResUrl: `https://images.static-bluray.com/movies/${folder}/${id}_${hiResSuffix}.jpg`,
    thumbnailUrl: `https://images.static-bluray.com/movies/${folder}/${id}_${thumbSuffix}.jpg`,
  };
}

let sharpModule: any = null;
let sharpLoaded = false;

async function getSharp(): Promise<any> {
  if (sharpLoaded) return sharpModule;
  try {
    sharpModule = (await import('sharp')).default;
    sharpLoaded = true;
    return sharpModule;
  } catch {
    sharpLoaded = true;
    return null;
  }
}

class CoverScraperService {
  private searchCache = new Map<string, CacheEntry>();

  /**
   * Search across requested cover art sources (Amazon, Blu-ray.com) in parallel.
   */
  async searchCovers(
    query: string,
    sources: Array<'amazon' | 'bluray'> = ['amazon', 'bluray']
  ): Promise<CoverSearchResponse> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return {
        results: [],
        sourcesStatus: { amazon: 'empty', bluray: 'empty' },
      };
    }

    const normalizedSources = Array.from(new Set(sources)).sort();
    const cacheKey = `${normalizedSources.join(',')}::${trimmedQuery.toLowerCase()}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const wantAmazon = normalizedSources.includes('amazon');
    const wantBluray = normalizedSources.includes('bluray');

    const [amazonOutcome, blurayOutcome] = await Promise.allSettled([
      wantAmazon ? this.searchAmazon(trimmedQuery) : Promise.resolve([]),
      wantBluray ? this.searchBluray(trimmedQuery) : Promise.resolve([]),
    ]);

    const amazonResults = amazonOutcome.status === 'fulfilled' ? amazonOutcome.value : [];
    const blurayResults = blurayOutcome.status === 'fulfilled' ? blurayOutcome.value : [];

    // Interleave Blu-ray.com and Amazon results so both sources are immediately visible
    const combined: CoverCandidate[] = [];
    const maxLen = Math.max(amazonResults.length, blurayResults.length);
    const seenUrls = new Set<string>();

    for (let i = 0; i < maxLen; i++) {
      if (i < blurayResults.length) {
        const candidate = blurayResults[i];
        if (!seenUrls.has(candidate.url)) {
          seenUrls.add(candidate.url);
          combined.push(candidate);
        }
      }
      if (i < amazonResults.length) {
        const candidate = amazonResults[i];
        if (!seenUrls.has(candidate.url)) {
          seenUrls.add(candidate.url);
          combined.push(candidate);
        }
      }
    }

    const response: CoverSearchResponse = {
      results: combined,
      sourcesStatus: {
        amazon: !wantAmazon
          ? 'empty'
          : amazonOutcome.status === 'rejected'
            ? 'error'
            : amazonResults.length > 0
              ? 'ok'
              : 'empty',
        bluray: !wantBluray
          ? 'empty'
          : blurayOutcome.status === 'rejected'
            ? 'error'
            : blurayResults.length > 0
              ? 'ok'
              : 'empty',
      },
    };

    if (combined.length > 0) {
      if (this.searchCache.size > 100) {
        const oldestKey = this.searchCache.keys().next().value;
        if (oldestKey) this.searchCache.delete(oldestKey);
      }
      this.searchCache.set(cacheKey, { timestamp: Date.now(), data: response });
    }

    return response;
  }

  /**
   * Parse Amazon search HTML into CoverCandidates.
   */
  parseAmazonSearchHtml(html: string): CoverCandidate[] {
    const candidates: CoverCandidate[] = [];
    const seenAsins = new Set<string>();
    const seenImages = new Set<string>();

    const blocks = html.split(/data-component-type="s-search-result"/i);
    for (let i = 1; i < blocks.length; i++) {
      const prevContext = blocks[i - 1].slice(-350);
      const block = prevContext + blocks[i].slice(0, 14000);

      const asinMatch =
        block.match(/data-asin="([A-Z0-9]{10})"/i) ||
        block.match(/amzn1\.asin\.(?:1\.)?([A-Z0-9]{10})/i);
      const asin = asinMatch?.[1];
      if (!asin || seenAsins.has(asin)) continue;

      const imgTagMatch =
        block.match(/<img[^>]+class="[^"]*s-image[^"]*"[^>]*>/i) ||
        block.match(/<img[^>]+src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"[^>]*>/i);
      if (!imgTagMatch) continue;

      const imgTag = imgTagMatch[0];
      const srcMatch = imgTag.match(/src="([^"]+)"/i);
      if (!srcMatch?.[1] || !srcMatch[1].includes('/images/')) continue;

      const { hiResUrl, thumbnailUrl } = upgradeAmazonImageUrl(srcMatch[1]);
      if (seenImages.has(hiResUrl)) continue;

      const altMatch = imgTag.match(/alt="([^"]+)"/i);
      const h2Match = block.match(/<h2[^>]*aria-label="([^"]+)"/i) || block.match(/<h2[^>]*>\s*<span>([^<]+)<\/span>/i);
      let rawTitle = decodeHtmlEntities(h2Match?.[1] || altMatch?.[1] || `Amazon ${asin}`);
      rawTitle = rawTitle.replace(/^Sponsored Ad\s*-\s*/i, '').trim();

      // Extract format/binding label (e.g., "4K", "Blu-ray", "DVD") or edition brackets
      const formatLinkMatch = block.match(
        /class="[^"]*s-link-style\s+a-text-bold[^"]*"[^>]*>\s*([^<]{2,30})\s*<\/a>/i
      );
      let subtitle = formatLinkMatch?.[1] ? decodeHtmlEntities(formatLinkMatch[1]) : undefined;
      if (subtitle && /^(Prime Video|Rent|Buy|Multi-Format)$/i.test(subtitle)) {
        subtitle = undefined;
      }

      if (!subtitle) {
        const bracketMatch = rawTitle.match(/[\[(]([^[\]()]{3,40})[\])]\s*$/);
        if (bracketMatch?.[1] && !/^\d{4}$/.test(bracketMatch[1].trim())) {
          subtitle = bracketMatch[1].trim();
        }
      }

      seenAsins.add(asin);
      seenImages.add(hiResUrl);

      candidates.push({
        id: `amazon-${asin}`,
        url: hiResUrl,
        thumbnailUrl,
        title: rawTitle,
        subtitle: subtitle || 'Amazon',
        source: 'amazon',
        productUrl: `https://www.amazon.com/dp/${asin}`,
        asin,
      });

      if (candidates.length >= 24) break;
    }

    return candidates;
  }

  /**
   * Search Amazon (desktop search first, mobile search fallback).
   */
  async searchAmazon(query: string): Promise<CoverCandidate[]> {
    // If the user typed a physical media query without format keywords, keep it natural
    // but search within movies-tv category so books/soundtracks are excluded.
    const endpoints = [
      `https://www.amazon.com/s?k=${encodeURIComponent(query)}&i=movies-tv`,
      `https://www.amazon.com/gp/aw/s?k=${encodeURIComponent(query)}&i=movies-tv`,
    ];

    let lastError: unknown = null;
    for (const url of endpoints) {
      try {
        const response = await axios.get<string>(url, {
          headers: getBrowserHeaders({
            Referer: 'https://www.amazon.com/',
          }),
          timeout: 9000,
          responseType: 'text',
        });

        if (typeof response.data === 'string' && response.data.length > 1000) {
          const parsed = this.parseAmazonSearchHtml(response.data);
          if (parsed.length > 0) {
            return parsed;
          }
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (lastError) {
      throw lastError;
    }
    return [];
  }

  /**
   * Parse Blu-ray.com search HTML (supports both `full` layout and `thumb` hoverlink layout).
   */
  parseBluraySearchHtml(html: string, isDvdSection: boolean = false): CoverCandidate[] {
    const candidates: CoverCandidate[] = [];
    const seenIds = new Set<string>();

    // 1. Parse detailed "full" layout rows
    const fullRowRegex =
      /<a\s+href="(https:\/\/www\.blu-ray\.com\/(movies|dvd)\/[^/"]+\/(\d+)\/)"\s+class="noline">\s*<h3>([\s\S]*?)<\/h3>\s*<\/a>([\s\S]*?)<small\s+style="color:\s*#666666">([\s\S]*?)<\/small>/gi;

    let match: RegExpExecArray | null;
    while ((match = fullRowRegex.exec(html)) !== null) {
      const productUrl = match[1];
      const mediaSection = match[2]?.toLowerCase();
      const id = match[3];
      if (!id || seenIds.has(id)) continue;

      const isDvd = isDvdSection || mediaSection === 'dvd';
      const title = decodeHtmlEntities(match[4].replace(/<[^>]+>/g, ''));
      const middleHtml = match[5] || '';
      const metaHtml = match[6] || '';

      const subheadingMatch = middleHtml.match(/<span\s+class="subheadingsmall">([\s\S]*?)<\/span>/i);
      const rawSubheading = subheadingMatch?.[1]
        ? decodeHtmlEntities(subheadingMatch[1].replace(/<[^>]+>/g, ''))
            .replace(/^[\s/|-]+|[\s/|-]+$/g, '')
            .trim()
        : '';

      const metaParts = decodeHtmlEntities(metaHtml.replace(/<[^>]+>/g, ' | '))
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean);
      const studio = metaParts[0] || '';
      const year = metaParts.find((p) => /^\d{4}$/.test(p)) || '';

      const subtitleParts: string[] = [];
      if (studio) subtitleParts.push(studio);
      if (year) subtitleParts.push(year);
      if (rawSubheading) subtitleParts.push(rawSubheading);

      const { hiResUrl, thumbnailUrl } = upgradeBlurayImageUrl(id, isDvd, 'front');
      seenIds.add(id);

      candidates.push({
        id: `bluray-${isDvd ? 'dvd-' : ''}${id}`,
        url: hiResUrl,
        thumbnailUrl,
        title: title || `Blu-ray.com #${id}`,
        subtitle: subtitleParts.join(' · ') || (isDvd ? 'DVD' : 'Blu-ray'),
        source: 'bluray',
        productUrl,
      });

      if (candidates.length >= 24) return candidates;
    }

    // 2. Fallback: parse thumbnail/hoverlink grid if full layout was not returned
    const hoverLinkRegex =
      /<a[^>]+class="hoverlink"[^>]+href="(https:\/\/www\.blu-ray\.com\/(movies|dvd)\/([^/"]+)\/(\d+)\/)"[^>]+title="([^"]+)"[^>]*>/gi;
    while ((match = hoverLinkRegex.exec(html)) !== null) {
      const productUrl = match[1];
      const mediaSection = match[2]?.toLowerCase();
      const slug = match[3] || '';
      const id = match[4];
      const rawTitle = decodeHtmlEntities(match[5]);
      if (!id || seenIds.has(id)) continue;

      const isDvd = isDvdSection || mediaSection === 'dvd';
      const { hiResUrl, thumbnailUrl } = upgradeBlurayImageUrl(id, isDvd, 'front');
      seenIds.add(id);

      const readableSlug = slug.replace(/-/g, ' ');
      candidates.push({
        id: `bluray-${isDvd ? 'dvd-' : ''}${id}`,
        url: hiResUrl,
        thumbnailUrl,
        title: rawTitle || readableSlug,
        subtitle: isDvd ? 'DVD Release' : 'Blu-ray Release',
        source: 'bluray',
        productUrl,
      });

      if (candidates.length >= 24) break;
    }

    return candidates;
  }

  /**
   * Search Blu-ray.com (with smart query stripping for studio/label keywords like Criterion/Arrow/Shout).
   */
  async searchBluray(query: string): Promise<CoverCandidate[]> {
    const isDvdQuery = /\bdvd\b/i.test(query) && !/\b(blu-?ray|4k|uhd)\b/i.test(query);
    const section = isDvdQuery ? 'dvdmovies' : 'bluraymovies';

    const fetchSection = async (keyword: string, sec: string): Promise<CoverCandidate[]> => {
      const searchUrl = `https://www.blu-ray.com/search/?quicksearch=1&quicksearch_country=US&quicksearch_keyword=${encodeURIComponent(keyword)}&section=${sec}`;
      const response = await axios.get<string>(searchUrl, {
        headers: getBrowserHeaders({
          Referer: 'https://www.blu-ray.com/',
          Cookie: 'listlayout_7=full; listlayout_21=full',
        }),
        timeout: 9000,
        responseType: 'text',
      });
      if (typeof response.data !== 'string') return [];
      return this.parseBluraySearchHtml(response.data, sec === 'dvdmovies');
    };

    // Normalize common Cinefile format terms into Blu-ray.com search terms
    const normalizedQuery = query
      .replace(/\b4K\s+UHD\b/gi, '4K')
      .replace(/\bUltra\s+HD\b/gi, '4K')
      .replace(/\bBlu-ray\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    let results = await fetchSection(normalizedQuery || query, section);

    // Blu-ray.com's title quicksearch fails if studio/packaging words like "Criterion", "Arrow", "Collector's Edition" are in the title query.
    // If 0 results came back, strip studio/edition tokens, search the base title, and rank matching studio/edition items first!
    if (results.length === 0) {
      const strippedQuery = normalizedQuery
        .replace(
          /\b(criterion(\s+collection)?|steelbook|slipcover|arrow(\s+video)?|shout(\s+factory)?|scream\s+factory|kino(\s+lorber)?|vinegar\s+syndrome|collector'?s(\s+edition)?|limited(\s+edition)?|special(\s+edition)?|deluxe(\s+edition)?|digipack|box\s+set|dvd)\b/gi,
          ''
        )
        .replace(/\s+/g, ' ')
        .trim();

      if (strippedQuery && strippedQuery.toLowerCase() !== normalizedQuery.toLowerCase()) {
        const fallbackResults = await fetchSection(strippedQuery, section);
        const lowerOriginal = query.toLowerCase();
        // Sort results that match the user's filter words (e.g., Criterion, SteelBook) to the top
        results = fallbackResults.sort((a, b) => {
          const aText = `${a.title} ${a.subtitle || ''}`.toLowerCase();
          const bText = `${b.title} ${b.subtitle || ''}`.toLowerCase();
          const filterTokens = ['criterion', 'steelbook', 'arrow', '4k', 'limited', 'deluxe', 'digipack'].filter(
            (t) => lowerOriginal.includes(t)
          );
          const aScore = filterTokens.reduce((acc, t) => acc + (aText.includes(t) ? 1 : 0), 0);
          const bScore = filterTokens.reduce((acc, t) => acc + (bText.includes(t) ? 1 : 0), 0);
          return bScore - aScore;
        });
      }
    }

    return results;
  }

  /**
   * Extract cover art candidates from a pasted Amazon URL, Blu-ray.com URL, ASIN, or direct image URL.
   */
  async extractCoversFromUrl(rawInput: string): Promise<CoverCandidate[]> {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      throw new Error('URL or ASIN is required');
    }

    // 1. Check if rawInput is a bare 10-character Amazon ASIN (e.g. B09MDHXGST)
    if (/^[A-Z0-9]{10}$/i.test(trimmed)) {
      const asin = trimmed.toUpperCase();
      return this.extractFromAmazonAsin(asin, `https://www.amazon.com/dp/${asin}`);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      throw new Error('Please enter a valid URL (https://...) or 10-character Amazon ASIN');
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new Error('Only HTTP and HTTPS URLs are supported');
    }

    if (isPrivateOrLoopbackHost(parsedUrl.hostname)) {
      throw new Error('Private or local network URLs are not allowed');
    }

    const host = parsedUrl.hostname.toLowerCase();

    // 2. Amazon Product Page URL
    const amazonAsinMatch =
      parsedUrl.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})/i);
    if (host.includes('amazon.') && amazonAsinMatch?.[1]) {
      const asin = amazonAsinMatch[1].toUpperCase();
      return this.extractFromAmazonAsin(asin, parsedUrl.toString());
    }

    // 3. Direct Amazon Image URL
    if (host.includes('media-amazon.com') || host.includes('images-amazon.com') || host.includes('ssl-images-amazon.com')) {
      const { hiResUrl, thumbnailUrl } = upgradeAmazonImageUrl(parsedUrl.toString());
      return [
        {
          id: `amazon-img-${Date.now()}`,
          url: hiResUrl,
          thumbnailUrl,
          title: 'Amazon Cover Image',
          subtitle: 'High-Resolution Direct Image',
          source: 'amazon',
        },
      ];
    }

    // 4. Blu-ray.com Release Page URL
    const blurayMatch = parsedUrl.pathname.match(/\/(movies|dvd)\/([^/]+)\/(\d+)\/?/i);
    if (host.includes('blu-ray.com') && blurayMatch) {
      const isDvd = blurayMatch[1].toLowerCase() === 'dvd';
      const slug = blurayMatch[2];
      const id = blurayMatch[3];
      return this.extractFromBlurayRelease(id, isDvd, slug, parsedUrl.toString());
    }

    // 5. Direct Blu-ray.com static image URL
    if (host.includes('static-bluray.com')) {
      const idMatch = parsedUrl.pathname.match(/\/(covers|dvdcovers)\/(\d+)_([a-z]+)\.jpg/i);
      if (idMatch) {
        const isDvd = idMatch[1].toLowerCase() === 'dvdcovers';
        const id = idMatch[2];
        const { hiResUrl, thumbnailUrl } = upgradeBlurayImageUrl(id, isDvd, 'front');
        return [
          {
            id: `bluray-img-${id}`,
            url: hiResUrl,
            thumbnailUrl,
            title: `Blu-ray.com Cover #${id}`,
            subtitle: 'High-Resolution Front Cover',
            source: 'bluray',
          },
        ];
      }
    }

    // 6. Generic Direct Image URL or Webpage with og:image
    return this.extractFromGenericUrl(parsedUrl.toString());
  }

  private async extractFromAmazonAsin(asin: string, productUrl: string): Promise<CoverCandidate[]> {
    const candidates: CoverCandidate[] = [];
    const seenUrls = new Set<string>();

    try {
      const response = await axios.get<string>(productUrl, {
        headers: getBrowserHeaders({ Referer: 'https://www.amazon.com/' }),
        timeout: 9000,
        responseType: 'text',
      });

      if (typeof response.data === 'string') {
        const html = response.data;
        const titleMatch = html.match(/<span[^>]+id="productTitle"[^>]*>([\s\S]*?)<\/span>/i);
        const pageTitle = titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1]) : `Amazon Release (${asin})`;

        // Extract all hiRes images from Amazon's imageGalleryData / colorImages
        const hiResRegex = /"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+\.jpg)"/gi;
        let m: RegExpExecArray | null;
        let idx = 1;
        while ((m = hiResRegex.exec(html)) !== null) {
          const { hiResUrl, thumbnailUrl } = upgradeAmazonImageUrl(m[1]);
          if (!seenUrls.has(hiResUrl)) {
            seenUrls.add(hiResUrl);
            candidates.push({
              id: `amazon-${asin}-${idx}`,
              url: hiResUrl,
              thumbnailUrl,
              title: pageTitle,
              subtitle: idx === 1 ? 'Front Box Art' : `Gallery Image ${idx}`,
              source: 'amazon',
              productUrl,
              asin,
            });
            idx++;
          }
        }

        // Fallback to "large" images or landingImage if hiRes wasn't populated
        if (candidates.length === 0) {
          const largeRegex = /"large"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+\.jpg)"/gi;
          while ((m = largeRegex.exec(html)) !== null) {
            const { hiResUrl, thumbnailUrl } = upgradeAmazonImageUrl(m[1]);
            if (!seenUrls.has(hiResUrl)) {
              seenUrls.add(hiResUrl);
              candidates.push({
                id: `amazon-${asin}-${idx}`,
                url: hiResUrl,
                thumbnailUrl,
                title: pageTitle,
                subtitle: idx === 1 ? 'Front Box Art' : `Gallery Image ${idx}`,
                source: 'amazon',
                productUrl,
                asin,
              });
              idx++;
            }
          }
        }
      }
    } catch {
      // Fall through to direct CDN ASIN probe below
    }

    // Always include/fallback to Amazon's direct ASIN image CDN if no gallery images were parsed
    if (candidates.length === 0) {
      const cdnUrl = `https://m.media-amazon.com/images/P/${asin}.01._SCRM_SL1500_.jpg`;
      const thumbUrl = `https://m.media-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_.jpg`;
      candidates.push({
        id: `amazon-${asin}-cdn`,
        url: cdnUrl,
        thumbnailUrl: thumbUrl,
        title: `Amazon ASIN ${asin}`,
        subtitle: 'Front Cover (Amazon CDN)',
        source: 'amazon',
        productUrl,
        asin,
      });
    }

    return candidates;
  }

  private async extractFromBlurayRelease(
    id: string,
    isDvd: boolean,
    slug: string,
    productUrl: string
  ): Promise<CoverCandidate[]> {
    const candidates: CoverCandidate[] = [];
    const readableTitle = slug.replace(/-/g, ' ');

    const variantLabels: Record<string, string> = {
      front: 'Front Cover (High-Res)',
      slip: 'Slipcover Front',
      overview: '3D Case / Packaging Overview',
      back: 'Back Cover',
      slipback: 'Slipcover Back',
    };

    let availableVariants: Array<'front' | 'slip' | 'overview' | 'back' | 'slipback'> = ['front'];

    try {
      const response = await axios.get<string>(productUrl, {
        headers: getBrowserHeaders({ Referer: 'https://www.blu-ray.com/' }),
        timeout: 8000,
        responseType: 'text',
      });

      if (typeof response.data === 'string') {
        const overlayMatches = [
          ...response.data.matchAll(/id="large(front|slip|overview|back|slipback)image_overlay"/gi),
        ].map((m) => m[1].toLowerCase() as 'front' | 'slip' | 'overview' | 'back' | 'slipback');

        if (overlayMatches.length > 0) {
          // Put 'front' and 'slip' first
          const order = ['front', 'slip', 'overview', 'back', 'slipback'] as const;
          availableVariants = order.filter((v) => overlayMatches.includes(v));
        }
      }
    } catch {
      // Default to front cover if page fetch fails
    }

    for (const variant of availableVariants) {
      const { hiResUrl, thumbnailUrl } = upgradeBlurayImageUrl(id, isDvd, variant);
      candidates.push({
        id: `bluray-${id}-${variant}`,
        url: hiResUrl,
        thumbnailUrl,
        title: readableTitle,
        subtitle: variantLabels[variant] || variant,
        source: 'bluray',
        productUrl,
      });
    }

    return candidates;
  }

  private async extractFromGenericUrl(targetUrl: string): Promise<CoverCandidate[]> {
    const headOrGet = await axios.get(targetUrl, {
      headers: getBrowserHeaders(),
      timeout: 9000,
      maxContentLength: MAX_IMAGE_BYTES,
      responseType: 'arraybuffer',
    });

    const contentType = String(headOrGet.headers['content-type'] || '').toLowerCase();
    if (contentType.startsWith('image/')) {
      return [
        {
          id: `url-${Date.now()}`,
          url: targetUrl,
          thumbnailUrl: targetUrl,
          title: 'Direct Image URL',
          subtitle: contentType.replace('image/', '').toUpperCase(),
          source: 'url',
        },
      ];
    }

    if (contentType.includes('text/html')) {
      const html = Buffer.from(headOrGet.data).toString('utf8');
      const ogImage =
        html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ||
        html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i)?.[1];
      const ogTitle =
        html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ||
        html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];

      if (ogImage) {
        const resolvedImg = new URL(decodeHtmlEntities(ogImage), targetUrl).toString();
        const { hiResUrl, thumbnailUrl } = upgradeAmazonImageUrl(resolvedImg);
        return [
          {
            id: `url-og-${Date.now()}`,
            url: hiResUrl,
            thumbnailUrl,
            title: ogTitle ? decodeHtmlEntities(ogTitle) : 'Extracted Page Cover',
            subtitle: 'OpenGraph Cover Image',
            source: 'url',
            productUrl: targetUrl,
          },
        ];
      }
    }

    throw new Error('No cover art images could be found at the provided URL');
  }

  /**
   * Download a remote cover image URL, validate & normalize with `sharp`, and save locally to `/uploads/`.
   */
  async downloadCoverToUploads(imageUrl: string): Promise<{
    url: string;
    filename: string;
    width?: number;
    height?: number;
  }> {
    const trimmed = imageUrl.trim();
    if (!trimmed) {
      throw new Error('Image URL is required');
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error('Invalid image URL');
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Unsupported URL protocol');
    }

    if (isPrivateOrLoopbackHost(parsed.hostname)) {
      throw new Error('Blocked private or loopback image URL');
    }

    // Attempt fetching the image; if a Blu-ray.com `_front.jpg` returns 404, gracefully fall back to `_large.jpg`
    const fetchBuffer = async (target: string): Promise<Buffer> => {
      const referer = target.includes('static-bluray.com')
        ? 'https://www.blu-ray.com/'
        : target.includes('amazon.com')
          ? 'https://www.amazon.com/'
          : undefined;

      const response = await axios.get(target, {
        responseType: 'arraybuffer',
        timeout: 12000,
        maxContentLength: MAX_IMAGE_BYTES,
        maxBodyLength: MAX_IMAGE_BYTES,
        maxRedirects: 3,
        headers: {
          'User-Agent': USER_AGENTS[0],
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          ...(referer ? { Referer: referer } : {}),
        },
      });
      return Buffer.from(response.data);
    };

    let buffer: Buffer;
    try {
      buffer = await fetchBuffer(parsed.toString());
    } catch (err) {
      if (parsed.hostname.includes('static-bluray.com') && parsed.pathname.endsWith('_front.jpg')) {
        const fallbackUrl = parsed.toString().replace(/_front\.jpg$/i, '_large.jpg');
        buffer = await fetchBuffer(fallbackUrl);
      } else {
        throw new Error('Failed to download cover image from remote server');
      }
    }

    // Reject tiny 1x1 placeholder GIFs (Amazon returns a 43-byte GIF for missing ASIN covers)
    if (buffer.length < 512) {
      throw new Error('Remote cover image is empty or a placeholder');
    }

    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const randomId = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${crypto.randomBytes(12).toString('hex')}`;

    const sharp = await getSharp();
    if (sharp) {
      const image = sharp(buffer);
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || metadata.width < 20 || metadata.height < 20) {
        throw new Error('Invalid or placeholder image dimensions');
      }

      // Normalize to high-quality JPEG (or keep PNG/WebP if transparent)
      const filename = `${randomId}.jpg`;
      const outputPath = path.join(uploadDir, filename);

      const processed = await image
        .rotate() // Auto-orient based on EXIF
        .resize({
          width: 2000,
          height: 2000,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });

      await fs.promises.writeFile(outputPath, processed.data);

      return {
        url: `/uploads/${filename}`,
        filename,
        width: processed.info.width,
        height: processed.info.height,
      };
    }

    // Fallback if sharp is unavailable in environment: validate magic bytes
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isWebp =
      buffer.length > 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';

    if (!isJpeg && !isPng && !isWebp) {
      throw new Error('Downloaded file is not a valid JPEG, PNG, or WebP image');
    }

    const ext = isPng ? '.png' : isWebp ? '.webp' : '.jpg';
    const filename = `${randomId}${ext}`;
    const outputPath = path.join(uploadDir, filename);
    await fs.promises.writeFile(outputPath, buffer);

    return {
      url: `/uploads/${filename}`,
      filename,
    };
  }
}

export const coverScraperService = new CoverScraperService();
