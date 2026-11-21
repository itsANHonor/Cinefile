export type BarcodeStandard = 'UPC' | 'EAN' | 'EAN-8' | 'GTIN-14' | 'Barcode';

export interface BarcodeDetection {
  normalized: string;
  type: BarcodeStandard;
  checksumValid: boolean | null;
}

const AMAZON_HOST_REGEX = /(^|\.)amazon\.[a-z.]{2,}$/i;
const AMAZON_ASIN_PATH_REGEX =
  /\/(?:dp|gp\/product|gp\/aw\/d|gp\/video\/detail|exec\/obidos\/ASIN|o\/ASIN|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i;

/**
 * Compute GS1 Modulo-10 check digit validity for 8, 12, 13, or 14-digit GTIN/UPC/EAN codes.
 */
export function isValidGs1Checksum(digits: string): boolean {
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) {
    return false;
  }
  const checkDigit = Number(digits[digits.length - 1]);
  let sum = 0;
  let weight = 3;
  for (let i = digits.length - 2; i >= 0; i--) {
    sum += Number(digits[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const expected = (10 - (sum % 10)) % 10;
  return checkDigit === expected;
}

/**
 * Normalize and classify a barcode string into UPC (12 digits), EAN (13 digits),
 * EAN-8 (8 digits), GTIN-14 (14 digits), or generic Barcode.
 */
export function detectBarcode(raw: string | null | undefined): BarcodeDetection | null {
  if (!raw) return null;
  const normalized = raw.replace(/[\s-]+/g, '').trim();
  if (!normalized) return null;

  if (/^\d{12}$/.test(normalized)) {
    return { normalized, type: 'UPC', checksumValid: isValidGs1Checksum(normalized) };
  }
  if (/^\d{13}$/.test(normalized)) {
    return { normalized, type: 'EAN', checksumValid: isValidGs1Checksum(normalized) };
  }
  if (/^\d{8}$/.test(normalized)) {
    return { normalized, type: 'EAN-8', checksumValid: isValidGs1Checksum(normalized) };
  }
  if (/^\d{14}$/.test(normalized)) {
    return { normalized, type: 'GTIN-14', checksumValid: isValidGs1Checksum(normalized) };
  }

  return { normalized, type: 'Barcode', checksumValid: null };
}

export function isAmazonUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return AMAZON_HOST_REGEX.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function extractAmazonAsinFromUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
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
