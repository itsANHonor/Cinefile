import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import BarcodeScanModal from './BarcodeScanModal';
import { apiService } from '../services/api.service';
import * as barcodeDecoder from '../lib/barcodeDecoder';
import { BarcodeLookupJob } from '../types';

vi.mock('../lib/barcodeDecoder', async () => {
  const actual = await vi.importActual<typeof import('../lib/barcodeDecoder')>(
    '../lib/barcodeDecoder'
  );
  return {
    ...actual,
    decodeBarcodesFromFile: vi.fn(),
    decodeBarcodesFromImageData: vi.fn(),
  };
});

const mockQuota = {
  provider: 'upcitemdb' as const,
  tier: 'free' as const,
  batchSize: 2,
  limit: 100,
  remaining: 95,
  resetAt: null,
  rateLimitedUntil: null,
};

describe('BarcodeScanModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(barcodeDecoder.decodeBarcodesFromFile).mockReset();
    vi.spyOn(apiService, 'getBarcodeQuota').mockResolvedValue(mockQuota);
    vi.spyOn(apiService, 'checkOwnedBarcodes').mockResolvedValue({});
    vi.spyOn(apiService, 'getFacets').mockResolvedValue({
      genres: [],
      decades: [],
      formats: [],
      editions: [{ tag: 'Criterion Collection', count: 5 }],
      versions: [],
      series: [],
    });
  });

  it('handles a single photo upload through lookup, review, and bulk import with barcode & edition notes', async () => {
    const user = userEvent.setup();
    vi.mocked(barcodeDecoder.decodeBarcodesFromFile).mockResolvedValue([
      { code: '715515265812', format: 'UPCA' },
    ]);

    const resolvedJob: BarcodeLookupJob = {
      jobId: 'job-1',
      status: 'completed',
      total: 1,
      completed: 1,
      cachedCount: 0,
      uncachedCount: 1,
      estimatedSeconds: 2,
      currentBarcode: null,
      quota: { ...mockQuota, remaining: 94 },
      startTime: Date.now(),
      endTime: Date.now(),
      items: [
        {
          barcode: '715515265812',
          status: 'resolved',
          source: 'provider',
          ownedItems: [],
          product: {
            title: 'Mulholland Drive (Criterion Collection) (4K Ultra HD + Blu-ray)',
            brand: 'CRITERION COLLECTION',
            asin: 'B09ABC1234',
          },
          parsed: {
            cleanedQuery: 'Mulholland Drive',
            alternateQueries: [],
            collectionQuery: null,
            suggestedItemName: 'Mulholland Drive',
            suggestedFormats: ['4K UHD', 'Blu-ray'],
            suggestedEditionTags: ['Criterion Collection'],
            mediaTypeHint: 'movie',
            seasonHints: [],
            isLikelyBoxSet: false,
            yearHint: 2001,
          },
          movieMatches: [
            {
              id: 1018,
              title: 'Mulholland Drive',
              overview: 'A love story in the city of dreams.',
              poster_path: '/poster.jpg',
              poster_url: 'https://image.tmdb.org/t/p/w500/poster.jpg',
              release_date: '2001-10-19',
              director: 'David Lynch',
              cast: ['Naomi Watts', 'Laura Harring'],
              genres: [{ id: 53, name: 'Thriller' }],
            },
          ],
          tvMatches: [],
          collectionSuggestion: null,
        },
      ],
    };

    vi.spyOn(apiService, 'startBarcodeLookupJob').mockResolvedValue(resolvedJob);
    const bulkCreateSpy = vi
      .spyOn(apiService, 'bulkCreatePhysicalItems')
      .mockResolvedValue({
        successful: [
          {
            success: true,
            originalName: 'Mulholland Drive',
            physicalItem: { id: 99, name: 'Mulholland Drive' } as any,
          },
        ],
        failed: [],
        summary: { total: 1, successful: 1, failed: 0 },
      });

    const onSuccess = vi.fn();
    renderWithProviders(
      <BarcodeScanModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />
    );

    const fileInput = screen.getByLabelText('Upload barcode photos');
    const photo = new File(['fake-image'], 'mulholland.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [photo] } });

    expect(await screen.findByText('715515265812')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Look Up 1 Barcode/i }));

    const itemNameInput = (await screen.findByLabelText('Physical Item Name *')) as HTMLInputElement;
    expect(itemNameInput.value).toBe('Mulholland Drive');
    expect(screen.getByText('ASIN: B09ABC1234')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Import 1 Item/i }));

    await waitFor(() => {
      expect(bulkCreateSpy).toHaveBeenCalledTimes(1);
    });

    expect(bulkCreateSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Mulholland Drive',
        barcode: '715515265812',
        asin: 'B09ABC1234',
        physical_format: ['4K UHD', 'Blu-ray'],
        edition_notes: 'Criterion Collection',
        media: expect.objectContaining({
          tmdb_id: 1018,
          title: 'Mulholland Drive',
        }),
      }),
    ]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('supports multi-movie box set review with TMDb collection checkboxes and imports a media array', async () => {
    const user = userEvent.setup();

    const boxSetJob: BarcodeLookupJob = {
      jobId: 'job-boxset',
      status: 'completed',
      total: 1,
      completed: 1,
      cachedCount: 1,
      uncachedCount: 0,
      estimatedSeconds: 1,
      currentBarcode: null,
      quota: mockQuota,
      startTime: Date.now(),
      endTime: Date.now(),
      items: [
        {
          barcode: '191329144657',
          status: 'resolved',
          source: 'cache',
          ownedItems: [],
          product: {
            title: 'Back to the Future Trilogy (4K Ultra HD Anniversary Edition) [UHD]',
            brand: 'SDS',
          },
          parsed: {
            cleanedQuery: 'Back to the Future',
            alternateQueries: [],
            collectionQuery: 'Back to the Future',
            suggestedItemName: 'Back to the Future Trilogy',
            suggestedFormats: ['4K UHD'],
            suggestedEditionTags: ['Anniversary Edition'],
            mediaTypeHint: 'movie',
            seasonHints: [],
            isLikelyBoxSet: true,
            yearHint: null,
          },
          movieMatches: [],
          tvMatches: [],
          collectionSuggestion: {
            id: 264,
            name: 'Back to the Future Collection',
            overview: '',
            poster_url: null,
            parts: [
              {
                id: 105,
                title: 'Back to the Future',
                overview: '',
                poster_path: null,
                poster_url: null,
                release_date: '1985-07-03',
                director: 'Robert Zemeckis',
                cast: [],
              },
              {
                id: 165,
                title: 'Back to the Future Part II',
                overview: '',
                poster_path: null,
                poster_url: null,
                release_date: '1989-11-22',
                director: 'Robert Zemeckis',
                cast: [],
              },
              {
                id: 196,
                title: 'Back to the Future Part III',
                overview: '',
                poster_path: null,
                poster_url: null,
                release_date: '1990-05-25',
                director: 'Robert Zemeckis',
                cast: [],
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(apiService, 'startBarcodeLookupJob').mockResolvedValue(boxSetJob);
    const bulkCreateSpy = vi
      .spyOn(apiService, 'bulkCreatePhysicalItems')
      .mockResolvedValue({
        successful: [
          {
            success: true,
            originalName: 'Back to the Future Trilogy',
            physicalItem: { id: 100, name: 'Back to the Future Trilogy' } as any,
          },
        ],
        failed: [],
        summary: { total: 1, successful: 1, failed: 0 },
      });

    renderWithProviders(
      <BarcodeScanModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />
    );

    // Switch to Manual / USB Scanner tab and enter barcode
    await user.click(screen.getByRole('radio', { name: 'Manual / USB Scanner' }));
    const manualInput = screen.getByLabelText('Quick Scan / USB Barcode Scanner Input');
    await user.type(manualInput, '191329144657{Enter}');

    expect(await screen.findByText('191329144657')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Look Up 1 Barcode/i }));

    expect(await screen.findByDisplayValue('Back to the Future Trilogy')).toBeInTheDocument();
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();

    // Uncheck Part III to verify selective inclusion in a box set
    const part3Checkbox = screen.getByRole('checkbox', { name: /Back to the Future Part III/i });
    await user.click(part3Checkbox);
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Import 1 Item/i }));

    await waitFor(() => {
      expect(bulkCreateSpy).toHaveBeenCalledTimes(1);
    });

    const submitted = bulkCreateSpy.mock.calls[0][0][0];
    expect(submitted.name).toBe('Back to the Future Trilogy');
    expect(submitted.barcode).toBe('191329144657');
    expect(Array.isArray(submitted.media)).toBe(true);
    expect((submitted.media as any[]).map((m) => m.tmdb_id)).toEqual([105, 165]);
  });

  it('shows a clear fallback when Live Camera is opened in a non-secure context', async () => {
    const user = userEvent.setup();
    const originalSecure = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    });

    try {
      renderWithProviders(
        <BarcodeScanModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />
      );

      await user.click(screen.getByRole('radio', { name: 'Live Camera' }));
      expect(
        await screen.findByText(/Live camera requires HTTPS or localhost/i)
      ).toBeInTheDocument();
    } finally {
      if (originalSecure) {
        Object.defineProperty(window, 'isSecureContext', originalSecure);
      }
    }
  });

  it('flags already-owned barcodes in the queue and allows manual recovery for unreadable photos', async () => {
    const user = userEvent.setup();
    vi.mocked(barcodeDecoder.decodeBarcodesFromFile).mockResolvedValue([]);
    vi.spyOn(apiService, 'checkOwnedBarcodes').mockResolvedValue({
      '715515033725': [
        {
          id: 42,
          name: 'The Last Emperor',
          physical_format: ['Blu-ray'],
          barcode: '715515033725',
        },
      ],
    });

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
    URL.revokeObjectURL = vi.fn();

    try {
      renderWithProviders(
        <BarcodeScanModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />
      );

      const fileInput = screen.getByLabelText('Upload barcode photos');
      const unreadable = new File(['blurry'], 'blurry.jpg', { type: 'image/jpeg' });
      fireEvent.change(fileInput, { target: { files: [unreadable] } });

      expect(await screen.findByText(/Couldn’t auto-read 1 photo/i)).toBeInTheDocument();

      const recoveryInput = screen.getByPlaceholderText('Type UPC/EAN digits…');
      await user.type(recoveryInput, '715515033725');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(await screen.findByText('715515033725')).toBeInTheDocument();
      expect(await screen.findByText(/Already owned \(The Last Emperor\)/i)).toBeInTheDocument();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});
