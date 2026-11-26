import { Router, Request, Response } from 'express';
import { db } from '../database';
import { isRequestAdmin } from '../middleware/auth.middleware';
import { queryHistoryFeed } from '../services/collection-events.service';

export async function handleGetHistory(req: Request, res: Response) {
  try {
    const isAdmin = isRequestAdmin(req);

    if (!isAdmin) {
      const historyPublicRow = await db('settings').where({ key: 'history_public' }).first();
      if (!historyPublicRow || historyPublicRow.value !== 'true') {
        return res.status(403).json({
          error: 'Collection history is private.',
          history_public: false,
        });
      }
    }

    const costPublicRow = !isAdmin
      ? await db('settings').where({ key: 'cost_public' }).first()
      : null;
    const canSeeCost = isAdmin || costPublicRow?.value === 'true';

    const category = typeof req.query.category === 'string' ? req.query.category : 'all';
    const dateBasis =
      req.query.date_basis === 'purchased' ? ('purchased' as const) : ('added' as const);
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

    const feed = await queryHistoryFeed({
      isAdmin,
      canSeeCost,
      category,
      dateBasis,
      search,
      limit: Number.isNaN(limit) ? 50 : limit,
      offset: Number.isNaN(offset) ? 0 : offset,
    });

    return res.json(feed);
  } catch (error) {
    console.error('Error fetching collection history:', error);
    return res.status(500).json({ error: 'Failed to fetch collection history' });
  }
}

const router = Router();

router.get('/', handleGetHistory);

export default router;
