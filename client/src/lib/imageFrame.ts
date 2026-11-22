import type { CSSProperties } from 'react';
import { CustomImage, ImageFrame } from '../types';

export const FRAME_MIN_ZOOM = 1;
export const FRAME_MAX_ZOOM = 3;
export const FRAME_DEFAULT_PAN = 50;

export interface NormalizedImageFrame {
  fit: 'fill' | 'fit';
  panX: number;
  panY: number;
  zoom: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

/** Coerce loose frame metadata into bounded, render-ready values. */
export function normalizeImageFrame(frame?: ImageFrame | null): NormalizedImageFrame {
  return {
    fit: frame?.fit === 'fit' ? 'fit' : 'fill',
    panX: clamp(toFiniteNumber(frame?.panX) ?? FRAME_DEFAULT_PAN, 0, 100),
    panY: clamp(toFiniteNumber(frame?.panY) ?? FRAME_DEFAULT_PAN, 0, 100),
    zoom: clamp(toFiniteNumber(frame?.zoom) ?? FRAME_MIN_ZOOM, FRAME_MIN_ZOOM, FRAME_MAX_ZOOM),
  };
}

/**
 * Reduce a frame to only the values that differ from defaults so stored JSON
 * stays minimal. Returns undefined when the frame has no visible effect.
 */
export function normalizeFrameForWrite(frame?: ImageFrame | null): ImageFrame | undefined {
  if (!frame || typeof frame !== 'object') return undefined;
  const normalized = normalizeImageFrame(frame);
  const out: ImageFrame = {};
  if (normalized.fit === 'fit') out.fit = 'fit';
  if (normalized.panX !== FRAME_DEFAULT_PAN) out.panX = normalized.panX;
  if (normalized.panY !== FRAME_DEFAULT_PAN) out.panY = normalized.panY;
  if (normalized.zoom !== FRAME_MIN_ZOOM) out.zoom = normalized.zoom;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Inline styles for the <img> element rendering a framed photo.
 * `forceCover` keeps `object-cover` even for 'fit' photos and drops zoom —
 * used on thin shelf spines where letterboxing is unreadable.
 */
export function getFramedImageStyle(
  frame?: ImageFrame | null,
  options?: { forceCover?: boolean }
): CSSProperties {
  const normalized = normalizeImageFrame(frame);
  const fit = options?.forceCover ? 'fill' : normalized.fit;
  if (fit === 'fit') {
    return { objectFit: 'contain' };
  }
  const style: CSSProperties = {
    objectFit: 'cover',
    objectPosition: `${normalized.panX}% ${normalized.panY}%`,
  };
  if (!options?.forceCover && normalized.zoom > FRAME_MIN_ZOOM) {
    style.transform = `scale(${normalized.zoom})`;
    style.transformOrigin = `${normalized.panX}% ${normalized.panY}%`;
  }
  return style;
}

/**
 * Resolve the package photo entry that backs an item's `custom_image_url`.
 * The two fields are kept in sync server-side, so this is normally just
 * custom_images[0] — the url check guards stale/legacy rows.
 */
export function getCoverPhoto(item: {
  custom_image_url?: string;
  custom_images?: CustomImage[];
}): CustomImage | undefined {
  const photos = Array.isArray(item.custom_images)
    ? item.custom_images.filter(
        (img) => img && typeof img.url === 'string' && img.url.trim() !== ''
      )
    : [];
  if (!item.custom_image_url) return photos[0];
  return photos.find((p) => p.url === item.custom_image_url) ?? { url: item.custom_image_url };
}

/**
 * Frame metadata for whatever `custom_image_url` resolves to, or undefined
 * when the card will fall back to a media poster instead.
 */
export function getCoverFrame(
  item: { custom_image_url?: string; custom_images?: CustomImage[] }
): ImageFrame | undefined {
  if (!item.custom_image_url) return undefined;
  const photo = getCoverPhoto(item);
  return photo?.url === item.custom_image_url ? photo.frame : undefined;
}
