import jwt, { SignOptions } from 'jsonwebtoken';

const SESSION_SECRET = process.env.SESSION_SECRET;
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? '8h') as SignOptions['expiresIn'];

const ALGORITHM: jwt.Algorithm = 'HS256';

/**
 * Signs a short-lived JWT after password verification. Uses SESSION_SECRET only — never ADMIN_PASSWORD.
 */
export function signSessionToken(): string {
  if (!SESSION_SECRET?.trim()) {
    throw new Error('SESSION_SECRET is not configured');
  }
  return jwt.sign({ sub: 'admin' }, SESSION_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: ALGORITHM,
  });
}

/**
 * Verifies Bearer JWT: signature, algorithm allowlist, and expiry.
 */
export function verifySessionToken(token: string): boolean {
  if (!SESSION_SECRET?.trim() || !token) {
    return false;
  }
  try {
    jwt.verify(token, SESSION_SECRET, {
      algorithms: [ALGORITHM],
    });
    return true;
  } catch {
    return false;
  }
}
