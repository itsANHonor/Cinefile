import { describe, expect, it } from 'vitest';
import {
  FRAME_MAX_ZOOM,
  getCoverFrame,
  getFramedImageStyle,
  normalizeFrameForWrite,
  normalizeImageFrame,
} from './imageFrame';

describe('normalizeImageFrame', () => {
  it('returns defaults for missing or partial frames', () => {
    expect(normalizeImageFrame(undefined)).toEqual({
      fit: 'fill',
      panX: 50,
      panY: 50,
      zoom: 1,
    });
    expect(normalizeImageFrame({ panX: 20 })).toEqual({
      fit: 'fill',
      panX: 20,
      panY: 50,
      zoom: 1,
    });
  });

  it('clamps pan and zoom into bounds and ignores invalid fit', () => {
    expect(normalizeImageFrame({ panX: -20, panY: 140, zoom: 99 })).toEqual({
      fit: 'fill',
      panX: 0,
      panY: 100,
      zoom: FRAME_MAX_ZOOM,
    });
    expect(normalizeImageFrame({ fit: 'stretch' as any, zoom: 0.2 })).toEqual({
      fit: 'fill',
      panX: 50,
      panY: 50,
      zoom: 1,
    });
    expect(normalizeImageFrame({ fit: 'fit' }).fit).toBe('fit');
  });
});

describe('normalizeFrameForWrite', () => {
  it('drops frames that produce the default render', () => {
    expect(normalizeFrameForWrite(undefined)).toBeUndefined();
    expect(normalizeFrameForWrite({})).toBeUndefined();
    expect(normalizeFrameForWrite({ fit: 'fill', panX: 50, panY: 50, zoom: 1 })).toBeUndefined();
  });

  it('keeps only non-default values', () => {
    expect(normalizeFrameForWrite({ fit: 'fit' })).toEqual({ fit: 'fit' });
    expect(normalizeFrameForWrite({ panX: 25, zoom: 1.5 })).toEqual({ panX: 25, zoom: 1.5 });
    expect(normalizeFrameForWrite({ fit: 'fill', panY: 80 })).toEqual({ panY: 80 });
  });
});

describe('getFramedImageStyle', () => {
  it('defaults to centered cover without a transform', () => {
    const style = getFramedImageStyle(undefined);
    expect(style.objectFit).toBe('cover');
    expect(style.objectPosition).toBe('50% 50%');
    expect(style.transform).toBeUndefined();
  });

  it('applies pan and zoom for fill mode', () => {
    const style = getFramedImageStyle({ fit: 'fill', panX: 20, panY: 30, zoom: 1.8 });
    expect(style.objectFit).toBe('cover');
    expect(style.objectPosition).toBe('20% 30%');
    expect(style.transform).toBe('scale(1.8)');
    expect(style.transformOrigin).toBe('20% 30%');
  });

  it('uses contain for fit mode', () => {
    expect(getFramedImageStyle({ fit: 'fit' }).objectFit).toBe('contain');
  });

  it('forceCover keeps cover + pan and drops zoom', () => {
    const style = getFramedImageStyle({ fit: 'fit', panX: 30, zoom: 2 }, { forceCover: true });
    expect(style.objectFit).toBe('cover');
    expect(style.objectPosition).toBe('30% 50%');
    expect(style.transform).toBeUndefined();
  });
});

describe('getCoverFrame', () => {
  it('returns the frame of the photo matching custom_image_url', () => {
    const frame = { fit: 'fit' as const };
    expect(
      getCoverFrame({
        custom_image_url: '/uploads/box.jpg',
        custom_images: [
          { url: '/uploads/box.jpg', label: 'Front', frame },
          { url: '/uploads/back.jpg', label: 'Back' },
        ],
      })
    ).toEqual(frame);
  });

  it('returns undefined when the cover is a media poster or frame is missing', () => {
    expect(
      getCoverFrame({
        custom_images: [{ url: '/uploads/box.jpg', frame: { fit: 'fit' } }],
      })
    ).toBeUndefined();
    expect(
      getCoverFrame({ custom_image_url: '/uploads/other.jpg', custom_images: [] })
    ).toBeUndefined();
    expect(
      getCoverFrame({ custom_image_url: '/uploads/box.jpg', custom_images: [{ url: '/uploads/box.jpg' }] })
    ).toBeUndefined();
  });
});
