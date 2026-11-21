/**
 * Utilities for normalizing UPC/EAN barcodes and extracting Amazon ASINs.
 */

const AMAZON_HOST_REGEX = /(^|\.)amazon\.[a-z.]{2,}$/i;
const AMAZON_ASIN_PATH_REGEX =
  /\/(?:dp|gp\/product|gp\/aw\/d|gp\/video\/detail|exec\/obidos\/ASIN|o\/ASIN|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i;

/**
 * Strip spaces and hyphens from a barcode (UPC / EAN / GTIN) string.
 * Returns null if empty.
 */
export function normalizeBarcode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\s-]+/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 32);
}

/**
 * Normalize an explicit ASIN value (either a 10-char ASIN or an Amazon product URL).
 */
export function normalizeAsin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fromUrl = extractAmazonAsinFromUrl(trimmed);
  if (fromUrl) return fromUrl;

  const compact = trimmed.replace(/[\s-]+/g, '').toUpperCase();
  if (/^[A-Z0-9]{10}$/.test(compact)) {
    return compact;
  }
  return compact.slice(0, 16);
}

/**
 * Extract a 10-character uppercase ASIN from an Amazon regional product URL
 * (e.g. amazon.com, amazon.de, amazon.co.uk, amazon.fr, amazon.co.jp).
 */
export function extractAmazonAsinFromUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (!AMAZON_HOST_REGEX.test(parsed.hostname)) {
      return null;
    }
    const match = parsed.pathname.match(AMAZON_ASIN_PATH_REGEX);
    return match?.[1] ? match[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Scan store_links for the first valid Amazon product ASIN.
 */
export function extractAsinFromStoreLinks(
  links: Array<{ label?: string; url?: string }> | null | undefined
): string | null {
  if (!Array.isArray(links)) return null;
  for (const link of links) {
    const asin = extractAmazonAsinFromUrl(link?.url);
    if (asin) return asin;
  }
  return null;
}
