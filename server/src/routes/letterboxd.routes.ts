import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authMiddleware, isRequestAdmin } from '../middleware/auth.middleware';
import { letterboxdService, normalizeLetterboxdUsername } from '../services/letterboxd.service';
import { db } from '../database';

const router = Router();

const exportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max for Letterboxd export ZIP / CSV
  },
  fileFilter: (_req, file, cb) => {
    const lower = (file.originalname || '').toLowerCase();
    if (lower.endsWith('.zip') || lower.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip and .csv Letterboxd export files are allowed.'));
    }
  },
});

/**
 * GET /api/letterboxd/status
 * Returns Letterboxd connection status, sync metadata, and fuzzy match suggestions (for admin)
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const isAdmin = isRequestAdmin(req);
    const status = await letterboxdService.getStatus(isAdmin);
    res.json(status);
  } catch (error: any) {
    console.error('Error fetching Letterboxd status:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch Letterboxd status' });
  }
});

/**
 * POST /api/letterboxd/sync
 * Trigger an immediate RSS feed sync for the configured (or passed) Letterboxd username
 */
router.post('/sync', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { username } = req.body || {};
    let cleanedUsername: string | undefined;
    if (username !== undefined) {
      cleanedUsername = normalizeLetterboxdUsername(String(username));
      if (!cleanedUsername) {
        return res.status(400).json({
          error: 'Invalid Letterboxd username. Use letters, numbers, underscores, or hyphens.',
        });
      }
    }

    if (cleanedUsername) {
      const existing = await db('settings').where({ key: 'letterboxd_username' }).first();
      if (existing) {
        await db('settings')
          .where({ key: 'letterboxd_username' })
          .update({ value: cleanedUsername, updated_at: db.fn.now() });
      } else {
        await db('settings').insert({ key: 'letterboxd_username', value: cleanedUsername });
      }
    }

    const summary = await letterboxdService.syncFromRss(cleanedUsername);
    const status = await letterboxdService.getStatus(true);

    res.json({
      summary,
      status,
    });
  } catch (error: any) {
    console.error('Error syncing Letterboxd RSS feed:', error);
    res.status(400).json({ error: error?.message || 'Failed to sync Letterboxd RSS feed' });
  }
});

/**
 * POST /api/letterboxd/import
 * Upload a Letterboxd account export .zip or .csv file to backfill historical ratings, likes, and watch dates
 */
router.post(
  '/import',
  authMiddleware,
  (req: Request, res: Response, next) => {
    exportUpload.single('file')(req, res, (err: any) => {
      if (err) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Uploaded file exceeds the 25MB maximum size limit.'
            : err.message || 'Invalid file upload.';
        return res.status(400).json({ error: msg });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'Please select a Letterboxd .zip or .csv file to upload.' });
      }

      const result = await letterboxdService.importFromExportBuffer(
        req.file.buffer,
        req.file.originalname,
      );
      const status = await letterboxdService.getStatus(true);

      res.json({
        summary: result,
        status,
      });
    } catch (error: any) {
      console.error('Error importing Letterboxd export:', error);
      res.status(400).json({ error: error?.message || 'Failed to import Letterboxd data export' });
    }
  },
);

/**
 * GET /api/letterboxd/search-cache
 * Search the user's cached Letterboxd films for manual linking in Settings or MediaEditModal
 */
router.get('/search-cache', authMiddleware, async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);
    const results = await letterboxdService.searchCache(query, limit);
    res.json({ results });
  } catch (error: any) {
    console.error('Error searching Letterboxd cache:', error);
    res.status(500).json({ error: 'Failed to search Letterboxd cache' });
  }
});

/**
 * POST /api/letterboxd/link
 * Manually link a Cinefile media item to a Letterboxd cache entry
 */
router.post('/link', authMiddleware, async (req: Request, res: Response) => {
  try {
    const mediaId = Number(req.body?.mediaId);
    const cacheId = Number(req.body?.cacheId);
    if (!mediaId || !cacheId) {
      return res.status(400).json({ error: 'mediaId and cacheId are required' });
    }

    const updatedMedia = await letterboxdService.linkCacheToMedia(mediaId, cacheId);
    const status = await letterboxdService.getStatus(true);
    res.json({
      media: updatedMedia,
      status,
    });
  } catch (error: any) {
    console.error('Error linking Letterboxd entry:', error);
    res.status(400).json({ error: error?.message || 'Failed to link Letterboxd entry' });
  }
});

/**
 * POST /api/letterboxd/unlink
 * Unlink Letterboxd data from a specific Cinefile media item
 */
router.post('/unlink', authMiddleware, async (req: Request, res: Response) => {
  try {
    const mediaId = Number(req.body?.mediaId);
    if (!mediaId) {
      return res.status(400).json({ error: 'mediaId is required' });
    }

    const updatedMedia = await letterboxdService.unlinkMedia(mediaId);
    const status = await letterboxdService.getStatus(true);
    res.json({
      media: updatedMedia,
      status,
    });
  } catch (error: any) {
    console.error('Error unlinking Letterboxd entry:', error);
    res.status(400).json({ error: error?.message || 'Failed to unlink Letterboxd entry' });
  }
});

/**
 * POST /api/letterboxd/dismiss-suggestion
 * Dismiss a fuzzy match candidate so it is not suggested again for this movie
 */
router.post('/dismiss-suggestion', authMiddleware, async (req: Request, res: Response) => {
  try {
    const mediaId = Number(req.body?.mediaId);
    const cacheId = Number(req.body?.cacheId);
    if (!mediaId || !cacheId) {
      return res.status(400).json({ error: 'mediaId and cacheId are required' });
    }

    await letterboxdService.dismissFuzzySuggestion(mediaId, cacheId);
    const status = await letterboxdService.getStatus(true);
    res.json({ status });
  } catch (error: any) {
    console.error('Error dismissing Letterboxd suggestion:', error);
    res.status(400).json({ error: error?.message || 'Failed to dismiss suggestion' });
  }
});

/**
 * DELETE /api/letterboxd/data
 * Clear all cached Letterboxd films and reset media Letterboxd columns
 */
router.delete('/data', authMiddleware, async (_req: Request, res: Response) => {
  try {
    await letterboxdService.clearAllData();
    const status = await letterboxdService.getStatus(true);
    res.json({ status });
  } catch (error: any) {
    console.error('Error clearing Letterboxd data:', error);
    res.status(500).json({ error: 'Failed to clear Letterboxd data' });
  }
});

export default router;
