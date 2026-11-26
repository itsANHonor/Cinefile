import type { ReaderOptions, ReadResult } from 'zxing-wasm/reader';

export interface DecodedBarcode {
  code: string;
  format: string;
}

const RETAIL_FORMATS: NonNullable<ReaderOptions['formats']> = [
  'EAN13',
  'EAN8',
  'UPCA',
  'UPCE',
];

const PHOTO_READER_OPTIONS: ReaderOptions = {
  formats: RETAIL_FORMATS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  eanAddOnSymbol: 'Ignore',
  maxNumberOfSymbols: 20,
};

const CAMERA_READER_OPTIONS: ReaderOptions = {
  formats: RETAIL_FORMATS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
  tryDownscale: false,
  eanAddOnSymbol: 'Ignore',
  maxNumberOfSymbols: 4,
};

const MAX_PHOTO_DIMENSION = 2000;

let zxingReaderPromise: Promise<typeof import('zxing-wasm/reader')> | null = null;

async function getZXingReader(): Promise<typeof import('zxing-wasm/reader')> {
  if (!zxingReaderPromise) {
    zxingReaderPromise = (async () => {
      const [readerMod, wasmUrlMod] = await Promise.all([
        import('zxing-wasm/reader'),
        import('zxing-wasm/reader/zxing_reader.wasm?url'),
      ]);

      const localWasmUrl = wasmUrlMod.default;
      readerMod.prepareZXingModule({
        overrides: {
          locateFile: (filePath: string, prefix: string) => {
            if (filePath.endsWith('.wasm')) {
              return localWasmUrl;
            }
            return prefix + filePath;
          },
        },
      });

      return readerMod;
    })().catch((err) => {
      zxingReaderPromise = null;
      throw err;
    });
  }
  return zxingReaderPromise;
}

function normalizeResults(results: ReadResult[]): DecodedBarcode[] {
  const seen = new Set<string>();
  const out: DecodedBarcode[] = [];

  for (const res of results) {
    if (!res.isValid || !res.text) continue;
    const cleaned = res.text.replace(/[\s-]+/g, '').trim();
    if (!cleaned || !/^\d{8,14}$/.test(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push({ code: cleaned, format: res.format });
  }

  return out;
}

async function fileToDownscaledImageData(
  file: Blob,
  maxDimension: number
): Promise<ImageData | null> {
  if (typeof document === 'undefined') return null;

  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      try {
        const { width, height } = bitmap;
        const longest = Math.max(width, height);
        const scale = longest > maxDimension ? maxDimension / longest : 1;
        const targetW = Math.max(1, Math.round(width * scale));
        const targetH = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0, targetW, targetH);
        return ctx.getImageData(0, 0, targetW, targetH);
      } finally {
        bitmap.close();
      }
    }
  } catch {
    // Fall back to HTMLImageElement or direct Blob decoding
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const longest = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = longest > maxDimension ? maxDimension / longest : 1;
        const targetW = Math.max(1, Math.round(img.naturalWidth * scale));
        const targetH = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(ctx.getImageData(0, 0, targetW, targetH));
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

/**
 * Decode one or more UPC/EAN barcodes from a user-uploaded photo file.
 * Runs entirely client-side via bundled zxing-wasm (no external CDN requests).
 */
export async function decodeBarcodesFromFile(file: Blob): Promise<DecodedBarcode[]> {
  const { readBarcodes } = await getZXingReader();

  // Pass 1: Fast downscaled scan (handles most single-case photos cleanly)
  const imageData = await fileToDownscaledImageData(file, MAX_PHOTO_DIMENSION);
  if (imageData) {
    const downscaledResults = normalizeResults(
      await readBarcodes(imageData, PHOTO_READER_OPTIONS)
    );
    if (downscaledResults.length > 0) {
      return downscaledResults;
    }
  }

  // Pass 2: Full-resolution fallback (helps with wide multi-case photos where bars are small)
  const fullResults = await readBarcodes(file, PHOTO_READER_OPTIONS);
  return normalizeResults(fullResults);
}

/**
 * Decode barcodes from a live camera canvas frame.
 */
export async function decodeBarcodesFromImageData(
  imageData: ImageData
): Promise<DecodedBarcode[]> {
  const { readBarcodes } = await getZXingReader();
  const results = await readBarcodes(imageData, CAMERA_READER_OPTIONS);
  return normalizeResults(results);
}

/**
 * Parse manual / pasted / USB-scanner barcode text into deduplicated normalized codes.
 */
export function parseManualBarcodeInput(raw: string): string[] {
  const tokens = raw
    .split(/[\r\n,;]+/)
    .map((line) => line.replace(/[\s-]+/g, '').trim())
    .filter((code) => code.length >= 6 && /^\d+$/.test(code));

  return Array.from(new Set(tokens));
}
