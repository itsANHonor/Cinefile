export interface CustomImageFrame {
  fit?: 'fill' | 'fit';
  panX?: number;
  panY?: number;
  zoom?: number;
}

export interface CustomImageEntry {
  url: string;
  label?: string | null;
  frame?: CustomImageFrame;
}

const MAX_CUSTOM_IMAGES = 24;
const MAX_LABEL_LENGTH = 80;
const MIN_FRAME_ZOOM = 1;
const MAX_FRAME_ZOOM = 3;

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

/**
 * Normalize per-photo framing metadata used for non-standard aspect ratios.
 * `fit` controls whether the photo is cropped ('fill') or letterboxed over an
 * ambient backdrop ('fit'); panX/panY position the crop and zoom magnifies it.
 * Frames that don't change the default render are dropped to keep JSON small.
 */
function normalizeFrame(raw: unknown): CustomImageFrame | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const frame: CustomImageFrame = {};

  if (o.fit === 'fit' || o.fit === 'fill') frame.fit = o.fit;

  const panX = toFiniteNumber(o.panX ?? o.pan_x);
  const panY = toFiniteNumber(o.panY ?? o.pan_y);
  const zoom = toFiniteNumber(o.zoom);
  if (panX !== undefined) frame.panX = Math.min(100, Math.max(0, panX));
  if (panY !== undefined) frame.panY = Math.min(100, Math.max(0, panY));
  if (zoom !== undefined) frame.zoom = Math.min(MAX_FRAME_ZOOM, Math.max(MIN_FRAME_ZOOM, zoom));

  const hasVisibleEffect =
    frame.fit === 'fit' ||
    (frame.panX !== undefined && frame.panX !== 50) ||
    (frame.panY !== undefined && frame.panY !== 50) ||
    (frame.zoom !== undefined && frame.zoom !== MIN_FRAME_ZOOM);
  return hasVisibleEffect ? frame : undefined;
}

/**
 * Parse and normalize a custom_images payload (array, JSON string, or null/undefined)
 * alongside an optional legacy `custom_image_url` string.
 */
export function parseCustomImagesFromRow(
  rawCustomImages: unknown,
  fallbackCustomImageUrl?: string | null
): CustomImageEntry[] {
  const result: CustomImageEntry[] = [];
  const seenUrls = new Set<string>();

  const pushEntry = (urlRaw: unknown, labelRaw?: unknown, frameRaw?: unknown) => {
    if (typeof urlRaw !== 'string') return;
    const url = urlRaw.trim();
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);

    let label: string | undefined;
    if (typeof labelRaw === 'string') {
      const trimmedLabel = labelRaw.trim().slice(0, MAX_LABEL_LENGTH);
      if (trimmedLabel) label = trimmedLabel;
    }
    const frame = normalizeFrame(frameRaw);
    const entry: CustomImageEntry = { url };
    if (label) entry.label = label;
    if (frame) entry.frame = frame;
    result.push(entry);
  };

  let parsed: unknown = rawCustomImages;
  if (typeof rawCustomImages === 'string' && rawCustomImages.trim() !== '') {
    try {
      parsed = JSON.parse(rawCustomImages);
    } catch {
      parsed = null;
    }
  }

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (result.length >= MAX_CUSTOM_IMAGES) break;
      if (typeof entry === 'string') {
        pushEntry(entry);
      } else if (entry && typeof entry === 'object') {
        pushEntry((entry as any).url, (entry as any).label, (entry as any).frame);
      }
    }
  }

  if (result.length === 0 && typeof fallbackCustomImageUrl === 'string' && fallbackCustomImageUrl.trim() !== '') {
    pushEntry(fallbackCustomImageUrl.trim(), 'Front');
  }

  return result;
}

/**
 * Resolve the database columns `{ custom_image_url, custom_images }` from a create/update payload.
 * Keeps `custom_image_url` synced with the primary (first) photo in `custom_images`.
 */
export function resolveCustomImagesForWrite(
  customImagesInput: unknown,
  customImageUrlInput: unknown,
  existingRow?: { custom_images?: string | null; custom_image_url?: string | null }
): { custom_image_url: string | null; custom_images: string | null; parsed: CustomImageEntry[] } {
  if (customImagesInput !== undefined) {
    const normalized = parseCustomImagesFromRow(customImagesInput, null);
    const primaryUrl = normalized[0]?.url || null;
    return {
      custom_image_url: primaryUrl,
      custom_images: normalized.length > 0 ? JSON.stringify(normalized) : null,
      parsed: normalized,
    };
  }

  if (customImageUrlInput !== undefined) {
    const trimmedUrl = typeof customImageUrlInput === 'string' ? customImageUrlInput.trim() : '';
    if (!trimmedUrl) {
      return {
        custom_image_url: null,
        custom_images: null,
        parsed: [],
      };
    }

    const existingList = existingRow
      ? parseCustomImagesFromRow(existingRow.custom_images, existingRow.custom_image_url)
      : [];

    const existingMatch = existingList.find((img) => img.url === trimmedUrl);
    const remainder = existingList.filter((img) => img.url !== trimmedUrl);
    const nextList: CustomImageEntry[] = [
      existingMatch || { url: trimmedUrl, label: 'Front' },
      ...remainder,
    ].slice(0, MAX_CUSTOM_IMAGES);

    return {
      custom_image_url: trimmedUrl,
      custom_images: JSON.stringify(nextList),
      parsed: nextList,
    };
  }

  const fallbackList = existingRow
    ? parseCustomImagesFromRow(existingRow.custom_images, existingRow.custom_image_url)
    : [];
  return {
    custom_image_url: fallbackList[0]?.url || null,
    custom_images: fallbackList.length > 0 ? JSON.stringify(fallbackList) : null,
    parsed: fallbackList,
  };
}
