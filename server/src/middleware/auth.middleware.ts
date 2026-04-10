import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { verifySessionToken } from '../services/jwt-auth.service';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export interface AuthRequest extends Request {
  isAuthenticated?: boolean;
}

/**
 * Parses `Authorization: Bearer <token>` or returns null.
 */
export function parseBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1] || null;
}

/**
 * Validates JWT issued by POST /api/auth/login. Admin password is only sent on login.
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = parseBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({
      error: 'Invalid authorization format. Expected: Bearer <token>',
    });
  }

  if (!verifySessionToken(token)) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.isAuthenticated = true;
  next();
}

/**
 * Verify admin password (timing-safe when lengths match).
 */
export function verifyPassword(password: string): boolean {
  if (typeof password !== 'string' || !ADMIN_PASSWORD) {
    return false;
  }
  try {
    const a = Buffer.from(password, 'utf8');
    const b = Buffer.from(ADMIN_PASSWORD, 'utf8');
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
