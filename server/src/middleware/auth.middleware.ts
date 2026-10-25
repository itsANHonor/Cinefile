import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { verifySessionToken } from '../services/jwt-auth.service';
import { db } from '../database';

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
 * Verify per-launch desktop session token (timing-safe when lengths match).
 * If DESKTOP_SESSION_TOKEN is configured, requests must supply a matching
 * X-Cinefile-Desktop-Token header or Bearer token.
 */
export function verifyDesktopToken(token: string | undefined | null): boolean {
  const configuredToken = process.env.DESKTOP_SESSION_TOKEN?.trim();
  if (!configuredToken) {
    // Fallback if running DESKTOP_MODE manually without Electron main.ts setting a token:
    // require no Origin header or a loopback Origin header to block external cross-origin sites
    return false;
  }
  if (typeof token !== 'string' || !token) {
    return false;
  }
  try {
    const a = Buffer.from(token, 'utf8');
    const b = Buffer.from(configuredToken, 'utf8');
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Checks whether a request in DESKTOP_MODE is authorized.
 */
export function isDesktopRequestAuthorized(req: Request): boolean {
  if (!isDesktopMode()) return false;

  const configuredToken = process.env.DESKTOP_SESSION_TOKEN?.trim();
  if (configuredToken) {
    const headerToken =
      typeof req.headers['x-cinefile-desktop-token'] === 'string'
        ? req.headers['x-cinefile-desktop-token'].trim()
        : null;
    const bearerToken = parseBearerToken(req.headers.authorization);
    return verifyDesktopToken(headerToken) || verifyDesktopToken(bearerToken);
  }

  // When DESKTOP_MODE is run without DESKTOP_SESSION_TOKEN, reject cross-origin browser requests
  const origin = req.headers.origin;
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return false;
  }
  if (origin && !origin.startsWith('http://127.0.0.1:') && !origin.startsWith('http://localhost:')) {
    return false;
  }
  return true;
}

/**
 * Determines whether an incoming request is authenticated as admin
 * (via valid Bearer JWT or authorized Desktop Mode session).
 */
export function isRequestAdmin(req: Request): boolean {
  if (isDesktopMode()) {
    return isDesktopRequestAuthorized(req);
  }
  const token = parseBearerToken(req.headers.authorization);
  return Boolean(token && verifySessionToken(token));
}

/**
 * Validates JWT issued by POST /api/auth/login. Admin password is only sent on login.
 * In DESKTOP_MODE, validates the per-launch desktop session token.
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (isDesktopMode()) {
    if (!isDesktopRequestAuthorized(req)) {
      return res.status(401).json({
        error: 'Unauthorized desktop request',
      });
    }
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
 * Enforces the `collection_public` setting on collection read routes.
 * Authenticated admins (or authorized Desktop requests) always have access.
 * Unauthenticated callers are blocked with 403 when `collection_public === 'false'`.
 */
export async function requirePublicCollectionOrAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (isRequestAdmin(req)) {
    req.isAuthenticated = true;
    return next();
  }

  try {
    const row = await db('settings').where({ key: 'collection_public' }).first();
    // Default to public ('true') unless explicitly set to 'false'
    if (row && row.value === 'false') {
      return res.status(403).json({
        error: 'This collection is private.',
        collection_public: false,
      });
    }
    return next();
  } catch (error) {
    console.error('Error checking collection_public setting:', error);
    return res.status(500).json({ error: 'Failed to verify collection visibility' });
  }
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

