import { Router, Request, Response } from 'express';
import { db } from '../database';
import { authMiddleware, isRequestAdmin } from '../middleware/auth.middleware';
import { tmdbService } from '../services/tmdb.service';
import { normalizeLetterboxdUsername } from '../services/letterboxd.service';

const router = Router();

const SENSITIVE_SETTING_KEYS = new Set(['tmdb_api_key']);
const ADMIN_ONLY_SETTING_KEYS = new Set([
  'letterboxd_auto_sync',
  'letterboxd_sync_interval_hours',
]);
const ALLOWED_SETTING_KEYS = new Set([
  'collection_public',
  'site_title',
  'collection_title',
  'default_theme',
  'default_sort_by',
  'default_sort_order',
  'tmdb_api_key',
  'letterboxd_username',
  'letterboxd_auto_sync',
  'letterboxd_sync_interval_hours',
]);

function maskApiKey(rawKey: string | undefined | null): string {
  const trimmed = rawKey?.trim() || '';
  if (!trimmed) return '';
  if (trimmed.length <= 4) return '••••';
  return `••••••••${trimmed.slice(-4)}`;
}

async function buildSettingsResponse(isAdmin: boolean): Promise<Record<string, string>> {
  const settings = await db('settings').select('*');
  const settingsObj: Record<string, string> = {};
  let dbTmdbKey = '';

  settings.forEach((setting) => {
    if (setting.key === 'tmdb_api_key') {
      dbTmdbKey = setting.value?.trim() || '';
      return;
    }
    if (!SENSITIVE_SETTING_KEYS.has(setting.key) && ALLOWED_SETTING_KEYS.has(setting.key)) {
      if (ADMIN_ONLY_SETTING_KEYS.has(setting.key) && !isAdmin) {
        return;
      }
      settingsObj[setting.key] = setting.value;
    }
  });

  const envTmdbKey = process.env.TMDB_API_KEY?.trim() || '';
  const activeKey = dbTmdbKey || envTmdbKey;
  settingsObj.tmdb_configured = activeKey ? 'true' : 'false';

  if (isAdmin) {
    settingsObj.tmdb_key_source = dbTmdbKey ? 'database' : envTmdbKey ? 'env' : 'none';
    settingsObj.tmdb_api_key_masked = maskApiKey(activeKey);
  }

  return settingsObj;
}

/**
 * GET /api/settings
 * Get all settings (sensitive keys are masked and admin-only metadata is gated)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const isAdmin = isRequestAdmin(req);
    const settingsObj = await buildSettingsResponse(isAdmin);
    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * GET /api/settings/:key
 * Get a specific setting by key
 */
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;

    if (SENSITIVE_SETTING_KEYS.has(key) || (ADMIN_ONLY_SETTING_KEYS.has(key) && !isRequestAdmin(req))) {
      return res.status(403).json({ error: 'Access to sensitive setting is restricted' });
    }
    if (!ALLOWED_SETTING_KEYS.has(key)) {
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

/**
 * PUT /api/settings/:key
 * Update a setting (protected)
 */
router.put('/:key', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!ALLOWED_SETTING_KEYS.has(key)) {
      return res.status(400).json({ error: `Invalid setting key: ${key}` });
    }

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const normalizedValue =
      key === 'tmdb_api_key'
        ? String(value).trim()
        : key === 'letterboxd_username'
          ? normalizeLetterboxdUsername(String(value))
          : String(value);

    // Check if setting exists
    const existingSetting = await db('settings').where({ key }).first();

    if (existingSetting) {
      // Update existing setting
      await db('settings')
        .where({ key })
        .update({ 
          value: normalizedValue,
          updated_at: db.fn.now(),
        });
    } else {
      // Create new setting
      await db('settings').insert({ 
        key, 
        value: normalizedValue,
      });
    }

    if (key === 'tmdb_api_key') {
      tmdbService.invalidateApiKeyCache();
      const settingsObj = await buildSettingsResponse(true);
      return res.json({
        key: 'tmdb_api_key',
        value: settingsObj.tmdb_api_key_masked,
        tmdb_configured: settingsObj.tmdb_configured,
        tmdb_key_source: settingsObj.tmdb_key_source,
      });
    }

    const updatedSetting = await db('settings').where({ key }).first();
    res.json({ key: updatedSetting.key, value: updatedSetting.value });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

/**
 * POST /api/settings
 * Update multiple settings at once (protected)
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const settings = req.body;

    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      return res.status(400).json({ error: 'Settings must be an object' });
    }

    for (const key of Object.keys(settings)) {
      if (!ALLOWED_SETTING_KEYS.has(key)) {
        return res.status(400).json({ error: `Invalid setting key: ${key}` });
      }
    }

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      const normalizedValue =
      key === 'tmdb_api_key'
        ? String(value).trim()
        : key === 'letterboxd_username'
          ? normalizeLetterboxdUsername(String(value))
          : String(value);
      const existingSetting = await db('settings').where({ key }).first();

      if (existingSetting) {
        await db('settings')
          .where({ key })
          .update({ 
            value: normalizedValue,
            updated_at: db.fn.now(),
          });
      } else {
        await db('settings').insert({ 
          key, 
          value: normalizedValue,
        });
      }

      if (key === 'tmdb_api_key') {
        tmdbService.invalidateApiKeyCache();
      }
    }

    const settingsObj = await buildSettingsResponse(true);
    res.json(settingsObj);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;

