import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { verifySessionToken } from '../services/jwt-auth.service';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export interface AuthRequest extends Request {
  isAuthenticated?: boolean;
}

export function isDesktopMode(): boolean {
  return process.env.DESKTOP_MODE === 'true';
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
 * In DESKTOP_MODE, requests on the local server are automatically authenticated.
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (isDesktopMode()) {
    req.isAuthenticated = true;
    return next();
  }

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

/**
 * Verify MCP API key (timing-safe when lengths match).
 */
export function verifyMcpApiKey(apiKey: string): boolean {
  const configuredKey = process.env.MCP_API_KEY?.trim();
  if (typeof apiKey !== 'string' || !apiKey || !configuredKey) {
    return false;
  }
  try {
    const a = Buffer.from(apiKey, 'utf8');
    const b = Buffer.from(configuredKey, 'utf8');
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Validates MCP requests using `Authorization: Bearer <MCP_API_KEY>`,
 * `X-MCP-API-Key: <MCP_API_KEY>`, or a valid admin session JWT.
 * Fails closed (503) if MCP_API_KEY is not configured.
 */
export function mcpAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!process.env.MCP_API_KEY?.trim()) {
    return res.status(503).json({
      error: 'MCP endpoint is disabled because MCP_API_KEY is not configured.',
    });
  }

  const bearerToken = parseBearerToken(req.headers.authorization);
  const headerApiKey =
    typeof req.headers['x-mcp-api-key'] === 'string'
      ? req.headers['x-mcp-api-key'].trim()
      : null;
  const token = bearerToken || headerApiKey;

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Expected Authorization: Bearer <MCP_API_KEY> or X-MCP-API-Key header.',
    });
  }

  if (!verifyMcpApiKey(token) && !verifySessionToken(token)) {
    return res.status(401).json({ error: 'Invalid MCP API key or session token' });
  }

  req.isAuthenticated = true;
  next();
}

