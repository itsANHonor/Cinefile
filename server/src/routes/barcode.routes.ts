import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { barcodeLookupService } from '../services/barcode-lookup.service';

const router = Router();

// All barcode lookup endpoints require admin authentication
router.use(authMiddleware);

/**
 * GET /api/barcodes/quota
 * Return current UPCitemdb tier & rate-limit status
 */
router.get('/quota', async (_req: Request, res: Response) => {
  try {
    const quota = await barcodeLookupService.getQuotaStatus();
    res.json(quota);
  } catch (error) {
    console.error('Error fetching barcode quota status:', error);
    res.status(500).json({ error: 'Failed to fetch barcode quota status' });
  }
});

/**
 * POST /api/barcodes/check-owned
 * Check which scanned barcodes already exist in physical_items
 */
router.post('/check-owned', async (req: Request, res: Response) => {
  try {
    const { barcodes } = req.body;
    if (!Array.isArray(barcodes)) {
      return res.status(400).json({ error: 'barcodes must be an array of strings' });
    }
    if (barcodes.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 barcodes allowed per check' });
    }

    const owned = await barcodeLookupService.checkOwnedBarcodes(barcodes);
    res.json({ owned });
  } catch (error) {
    console.error('Error checking owned barcodes:', error);
    res.status(500).json({ error: 'Failed to check owned barcodes' });
  }
});

/**
 * POST /api/barcodes/lookup-jobs
 * Start an asynchronous paced barcode lookup + TMDb resolution job
 */
router.post('/lookup-jobs', async (req: Request, res: Response) => {
  try {
    const { barcodes, forceRefresh } = req.body;
    if (!Array.isArray(barcodes) || barcodes.length === 0) {
      return res.status(400).json({ error: 'At least one barcode is required' });
    }
    if (barcodes.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 barcodes allowed per lookup job' });
    }

    const job = await barcodeLookupService.startLookupJob(barcodes, {
      forceRefresh: Boolean(forceRefresh),
    });
    if (job.total === 0) {
      return res.status(400).json({ error: 'No valid barcodes provided' });
    }

    res.status(202).json(job);
  } catch (error) {
    console.error('Error starting barcode lookup job:', error);
    res.status(500).json({ error: 'Failed to start barcode lookup job' });
  }
});

/**
 * GET /api/barcodes/lookup-jobs/:jobId
 * Poll status and resolved items for a barcode lookup job
 */
router.get('/lookup-jobs/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = barcodeLookupService.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Lookup job not found' });
  }
  res.json(job);
});

/**
 * POST /api/barcodes/lookup-jobs/:jobId/cancel
 * Cancel an in-progress barcode lookup job
 */
router.post('/lookup-jobs/:jobId/cancel', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const cancelled = barcodeLookupService.cancelJob(jobId);
  if (!cancelled) {
    return res.status(404).json({ error: 'Lookup job not found' });
  }
  res.json({ cancelled: true });
});

export default router;
