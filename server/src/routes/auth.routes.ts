import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyPassword, authMiddleware } from '../middleware/auth.middleware';
import { signSessionToken } from '../services/jwt-auth.service';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/login
 * Login with password; returns a signed JWT (not the password).
 */
router.post('/login', loginLimiter, (req: Request, res: Response) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  if (!verifyPassword(password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  try {
    const token = signSessionToken();
    return res.json({
      success: true,
      message: 'Authentication successful',
      token,
    });
  } catch (e) {
    console.error('Failed to sign session token:', e);
    return res.status(500).json({ error: 'Authentication configuration error' });
  }
});

/**
 * POST /api/auth/logout
 * Client should discard the JWT; it remains valid until expiry (stateless).
 */
router.post('/logout', authMiddleware, (_req: Request, res: Response) => {
  res.status(204).send();
});

/**
 * GET /api/auth/verify
 * Verify current authentication
 */
router.get('/verify', authMiddleware, (_req: Request, res: Response) => {
  res.json({ authenticated: true });
});

export default router;
