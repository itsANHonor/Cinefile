import { describe, expect, it } from 'vitest';
import { getDistinctOriginalTitle } from './titles';

describe('getDistinctOriginalTitle', () => {
  it('returns the original title when it differs from the English movie title', () => {
    expect(
      getDistinctOriginalTitle({
        title: 'Gigantic',
        original_title: 'Absolute Giganten',
        media_type: 'movie',
      })
    ).toBe('Absolute Giganten');
  });

  it('returns null when original_title matches title case-insensitively', () => {
    expect(
      getDistinctOriginalTitle({
        title: 'The Matrix',
        original_title: 'the matrix',
        media_type: 'movie',
      })
    ).toBeNull();
  });

  it('returns null for English TV seasons where original_title matches tv_show_name or season prefix', () => {
    expect(
      getDistinctOriginalTitle({
        title: 'The Wire - Season 1',
        original_title: 'The Wire',
        tv_show_name: 'The Wire',
        media_type: 'tv_season',
      })
    ).toBeNull();
  });

  it('returns the native show name for non-English TV seasons', () => {
    expect(
      getDistinctOriginalTitle({
        title: 'Money Heist - Season 1',
        original_title: 'La casa de papel',
        tv_show_name: 'Money Heist',
        media_type: 'tv_season',
      })
    ).toBe('La casa de papel');
  });
});
