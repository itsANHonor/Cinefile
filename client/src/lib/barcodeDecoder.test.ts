import { describe, expect, it } from 'vitest';
import { parseManualBarcodeInput } from './barcodeDecoder';

describe('parseManualBarcodeInput', () => {
  it('parses newline, comma, and semicolon separated barcodes and strips hyphens/spaces', () => {
    const result = parseManualBarcodeInput(
      '715515-265812\n 191329 144657, 5027035018591; 0794043131622 '
    );
    expect(result).toEqual([
      '715515265812',
      '191329144657',
      '5027035018591',
      '0794043131622',
    ]);
  });

  it('deduplicates codes and ignores non-numeric or too-short entries', () => {
    const result = parseManualBarcodeInput('715515265812\nabc123\n12345\n715515265812\n');
    expect(result).toEqual(['715515265812']);
  });
});
