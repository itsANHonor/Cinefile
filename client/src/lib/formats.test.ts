import { describe, expect, it } from 'vitest';
import {
  PHYSICAL_FORMATS,
  compareFormats,
  formatBadgeClasses,
  formatLabels,
  isPhysicalFormat,
  sortFormatCounts,
  sortFormatStrings,
} from './formats';

describe('formats library', () => {
  it('defines the canonical physical format order', () => {
    expect(PHYSICAL_FORMATS).toEqual([
      '4K UHD',
      '3D Blu-ray',
      'Blu-ray',
      'DVD',
      'Digital-UHD',
      'Digital-HD',
      'Digital-SD',
      'LaserDisc',
      'VHS',
    ]);
  });

  it('labels every canonical format', () => {
    for (const format of PHYSICAL_FORMATS) {
      expect(formatLabels[format]).toBeTruthy();
    }
  });

  it('identifies known physical formats and rejects unknown values', () => {
    expect(isPhysicalFormat('Blu-ray')).toBe(true);
    expect(isPhysicalFormat('all')).toBe(false);
    expect(isPhysicalFormat('Betamax')).toBe(false);
  });

  it('sorts format strings into canonical order and drops unknowns', () => {
    const input = ['VHS', 'DVD', 'Unknown', 'Blu-ray'];
    expect(sortFormatStrings(input)).toEqual(['Blu-ray', 'DVD', 'VHS']);
  });

  it('compares formats using canonical order, falling back to localeCompare', () => {
    expect(compareFormats('VHS', 'DVD')).toBeGreaterThan(0);
    expect(compareFormats('Blu-ray', 'VHS')).toBeLessThan(0);
    expect(compareFormats('UnknownA', 'UnknownB')).toBeLessThan(0);
  });

  it('sorts counted formats into canonical order and keeps unknowns at the end', () => {
    const items = [
      { format: 'VHS', count: 1 },
      { format: 'DVD', count: 5 },
      { format: 'Unknown', count: 2 },
    ];
    expect(sortFormatCounts(items)).toEqual([
      { format: 'DVD', count: 5 },
      { format: 'VHS', count: 1 },
      { format: 'Unknown', count: 2 },
    ]);
  });

  it('provides badge classes for common formats', () => {
    expect(formatBadgeClasses['Blu-ray']).toContain('bg-green-100');
    expect(formatBadgeClasses['DVD']).toContain('bg-orange-100');
  });
});
