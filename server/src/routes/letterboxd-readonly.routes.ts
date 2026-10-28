import { Router, Request, Response } from 'express';
import { letterboxdService } from '../services/letterboxd.service';

const router = Router();

/**
 * GET /api/letterboxd/status
 * Read-only status endpoint for public collection views
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await letterboxdService.getStatus(false);
    res.json(status);
  } catch (error: any) {
    console.error('Error fetching Letterboxd status:', error);
    res.status(500).json({ error: 'Failed to fetch Letterboxd status' });
  }
});

export default router;
