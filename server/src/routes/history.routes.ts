import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { deleteHistoryEventsByIds } from '../services/collection-events.service';
import { handleGetHistory } from './history-readonly.routes';

const router = Router();

/**
 * GET /api/history
 * Returns chronological collection history entries (respecting history_public & cost_public).
 */
router.get('/', handleGetHistory);

/**
 * POST /api/history/delete
 * Manually delete one or more history events by ID (admin only).
 * Does NOT delete any underlying items, shelves, or photos.
 */
router.post('/delete', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array of event IDs' });
    }

    const deletedCount = await deleteHistoryEventsByIds(ids);
    return res.json({
      deletedCount,
      message: 'History entries removed successfully',
    });
  } catch (error) {
    console.error('Error deleting history events:', error);
    return res.status(500).json({ error: 'Failed to delete history events' });
  }
});

/**
 * DELETE /api/history/:id
 * Manually delete a single history event by ID (admin only).
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid history event ID' });
    }

    const deletedCount = await deleteHistoryEventsByIds([id]);
    if (deletedCount === 0) {
      return res.status(404).json({ error: 'History event not found' });
    }

    return res.json({
      deletedCount,
      message: 'History entry removed successfully',
    });
  } catch (error) {
    console.error('Error deleting history event:', error);
    return res.status(500).json({ error: 'Failed to delete history event' });
  }
});

export default router;
