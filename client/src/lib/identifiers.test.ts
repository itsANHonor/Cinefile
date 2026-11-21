import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import StoreLinkManager from '../components/StoreLinkManager';
import {
  detectBarcode,
  extractAmazonAsinFromUrl,
  isAmazonUrl,
  isValidGs1Checksum,
} from './identifiers';

describe('detectBarcode & isValidGs1Checksum', () => {
  it('recognizes a 12-digit UPC-A code and validates its GS1 checksum', () => {
    const res = detectBarcode('036000-291452');
    expect(res).toEqual({
      normalized: '036000291452',
      type: 'UPC',
      checksumValid: true,
    });
    expect(isValidGs1Checksum('036000291453')).toBe(false);
  });

  it('recognizes a 13-digit EAN-13 code and validates its GS1 checksum', () => {
    const res = detectBarcode('4006381 333931');
    expect(res).toEqual({
      normalized: '4006381333931',
      type: 'EAN',
      checksumValid: true,
    });
    expect(detectBarcode('4006381333932')?.checksumValid).toBe(false);
  });

  it('recognizes EAN-8 and GTIN-14 codes and falls back to generic Barcode for custom strings', () => {
    expect(detectBarcode('55123457')?.type).toBe('EAN-8');
    expect(detectBarcode('10036000291459')?.type).toBe('GTIN-14');
    expect(detectBarcode('CAT-1000')).toEqual({
      normalized: 'CAT1000',
      type: 'Barcode',
      checksumValid: null,
    });
    expect(detectBarcode('   ')).toBeNull();
  });
});

describe('extractAmazonAsinFromUrl & isAmazonUrl', () => {
  it('extracts 10-character ASINs across international Amazon domains and URL shapes', () => {
    expect(isAmazonUrl('https://www.amazon.de/dp/B00DU61N52')).toBe(true);
    expect(extractAmazonAsinFromUrl('https://www.amazon.de/dp/B00DU61N52')).toBe('B00DU61N52');
    expect(
      extractAmazonAsinFromUrl(
        'https://www.amazon.de/-/en/East-Eden-Blu-ray/dp/b00du61n52/ref=sr_1_1?crid=123'
      )
    ).toBe('B00DU61N52');
    expect(extractAmazonAsinFromUrl('https://www.amazon.co.uk/gp/product/B09MDHXGST?th=1')).toBe(
      'B09MDHXGST'
    );
    expect(extractAmazonAsinFromUrl('https://www.blu-ray.com/movies/Dune-4K-Blu-ray/295838/')).toBeNull();
    expect(isAmazonUrl('https://www.blu-ray.com/movies/Dune-4K-Blu-ray/295838/')).toBe(false);
  });

  it('auto-selects the Amazon label and emits onAsinExtracted in StoreLinkManager', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onAsinExtracted = vi.fn();

    render(
      React.createElement(StoreLinkManager, {
        links: [],
        onChange,
        onAsinExtracted,
      })
    );

    const urlInput = screen.getByPlaceholderText('https://example.com');
    await user.type(urlInput, 'https://www.amazon.de/dp/B00DU61N52');
    await user.click(screen.getByRole('button', { name: 'Add Link' }));

    expect(onChange).toHaveBeenCalledWith([
      { label: 'Amazon', url: 'https://www.amazon.de/dp/B00DU61N52' },
    ]);
    expect(onAsinExtracted).toHaveBeenCalledWith('B00DU61N52');
  });
});
