import { describe, expect, it } from 'vitest';
import {
  formatCoverSearchQuery,
  generatePhysicalItemName,
  sortTVSeasons,
} from './tvNaming';

describe('sortTVSeasons', () => {
  it('places numbered seasons 1..N first in ascending order and Specials (season 0) at the end', () => {
    const raw = [
      { id: 10, season_number: 0, name: 'Specials' },
      { id: 12, season_number: 2, name: 'Season 2' },
      { id: 11, season_number: 1, name: 'Season 1' },
      { id: 13, season_number: 3, name: 'Season 3' },
    ];

    const sorted = sortTVSeasons(raw);
    expect(sorted.map((s) => s.season_number)).toEqual([1, 2, 3, 0]);
  });
});

describe('generatePhysicalItemName', () => {
  it('names a full TV series with Specials as "<Show> - Complete Series" instead of "Seasons 0-5"', () => {
    const entries = [1, 2, 3, 4, 5, 0].map((seasonNum) => ({
      title: seasonNum === 0 ? 'The Wire - Specials' : `The Wire - Season ${seasonNum}`,
      media_type: 'tv_season' as const,
      tv_show_name: 'The Wire',
      tv_show_tmdb_id: 1438,
      season_number: seasonNum,
      tv_show_total_seasons: 5,
    }));

    expect(generatePhysicalItemName(entries)).toBe('The Wire - Complete Series');
  });

  it('excludes Season 0 from partial contiguous season ranges', () => {
    const entries = [0, 1, 2, 3].map((seasonNum) => ({
      title: seasonNum === 0 ? 'The Wire - Specials' : `The Wire - Season ${seasonNum}`,
      media_type: 'tv_season' as const,
      tv_show_name: 'The Wire',
      tv_show_tmdb_id: 1438,
      season_number: seasonNum,
      tv_show_total_seasons: 5,
    }));

    expect(generatePhysicalItemName(entries)).toBe('The Wire - Seasons 1-3');
  });

  it('excludes Season 0 from non-contiguous season lists', () => {
    const entries = [0, 1, 3].map((seasonNum) => ({
      title: `Show - Season ${seasonNum}`,
      media_type: 'tv_season' as const,
      tv_show_name: 'Show',
      tv_show_tmdb_id: 99,
      season_number: seasonNum,
      tv_show_total_seasons: 5,
    }));

    expect(generatePhysicalItemName(entries)).toBe('Show - Seasons 1, 3');
  });

  it('uses "<Show> - Specials" when Season 0 is the only selected season', () => {
    expect(
      generatePhysicalItemName([
        {
          title: 'The Wire - Specials',
          media_type: 'tv_season',
          tv_show_name: 'The Wire',
          tv_show_tmdb_id: 1438,
          season_number: 0,
          tv_show_total_seasons: 5,
        },
      ])
    ).toBe('The Wire - Specials');
  });

  it('uses "<Show> - Season 1" for a single regular season even if Specials is also included', () => {
    expect(
      generatePhysicalItemName([
        {
          title: 'Show - Season 1',
          media_type: 'tv_season',
          tv_show_name: 'Show',
          tv_show_tmdb_id: 50,
          season_number: 1,
          tv_show_total_seasons: 4,
        },
        {
          title: 'Show - Specials',
          media_type: 'tv_season',
          tv_show_name: 'Show',
          tv_show_tmdb_id: 50,
          season_number: 0,
          tv_show_total_seasons: 4,
        },
      ])
    ).toBe('Show - Season 1');
  });

  it('joins movie titles with " / "', () => {
    expect(
      generatePhysicalItemName([
        { title: 'Before Sunrise', media_type: 'movie' },
        { title: 'Before Sunset', media_type: 'movie' },
      ])
    ).toBe('Before Sunrise / Before Sunset');
  });
});

describe('formatCoverSearchQuery', () => {
  it('produces a clean Complete Series cover search query without spaced hyphens or Season 0', () => {
    const entries = [1, 2, 3, 4, 5, 0].map((seasonNum) => ({
      title: `The Wire - Season ${seasonNum}`,
      media_type: 'tv_season' as const,
      tv_show_name: 'The Wire',
      tv_show_tmdb_id: 1438,
      season_number: seasonNum,
      tv_show_total_seasons: 5,
      formats: ['Blu-ray'],
    }));

    expect(formatCoverSearchQuery({ entries })).toBe('The Wire Complete Series Blu-ray');
  });

  it('cleans legacy "Seasons 0-X" custom names when looking up cover art for existing items', () => {
    expect(
      formatCoverSearchQuery({
        customName: 'The Wire - Seasons 0-5',
        entries: [
          {
            title: 'The Wire - Specials',
            media_type: 'tv_season',
            tv_show_name: 'The Wire',
            season_number: 0,
            formats: ['Blu-ray'],
          },
        ],
      })
    ).toBe('The Wire Complete Series Blu-ray');
  });

  it('preserves intra-word hyphens like Spider-Man while appending format and edition', () => {
    expect(
      formatCoverSearchQuery({
        entries: [{ title: 'Spider-Man', media_type: 'movie', formats: ['4K UHD'] }],
        editionNotes: 'Steelbook, Limited Edition',
      })
    ).toBe('Spider-Man 4K UHD Steelbook');
  });
});
