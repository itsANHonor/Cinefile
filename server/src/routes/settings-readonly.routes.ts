import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

const SAFE_SETTINGS = [
  'collection_public',
  'cost_public',
  'history_public',
  'site_title',
  'collection_title',
  'default_theme',
  'letterboxd_username',
];

/**
 * GET /api/settings
 * Get all settings (only safe/public settings)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await db('settings').select('*');

    // Convert to key-value object, filtering to only safe settings
    const settingsObj: Record<string, string> = {};
    settings.forEach((setting) => {
      if (SAFE_SETTINGS.includes(setting.key)) {
        settingsObj[setting.key] = setting.value;
      }
    });

    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * GET /api/settings/:key
 * Get a specific setting by key (only safe/public settings)
 */
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;

    // Only allow access to safe settings
    if (!SAFE_SETTINGS.includes(key)) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    const setting = await db('settings').where({ key }).first();

    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ key: setting.key, value: setting.value });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

export default router;



