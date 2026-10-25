#!/usr/bin/env node
/**
 * Smoke test for JWT auth after `npm run build`.
 * Does not start HTTP or SQLite; validates password check and sign/verify.
 */
process.env.ADMIN_PASSWORD = 'testpass';
process.env.SESSION_SECRET = '01234567890123456789012345678901';
process.env.MCP_API_KEY = 'test-mcp-api-key-12345';
process.env.DESKTOP_SESSION_TOKEN = 'test-desktop-session-token-1234567890';

const path = require('path');
const { verifyPassword, verifyMcpApiKey, verifyDesktopToken } = require(path.join(
  __dirname,
  '../dist/middleware/auth.middleware.js',
));
const { signSessionToken, verifySessionToken } = require(path.join(
  __dirname,
  '../dist/services/jwt-auth.service.js',
));

if (!verifyPassword('testpass')) {
  console.error('FAIL: verifyPassword should accept correct password');
  process.exit(1);
}
if (verifyPassword('wrong')) {
  console.error('FAIL: verifyPassword should reject wrong password');
  process.exit(1);
}

if (!verifyMcpApiKey('test-mcp-api-key-12345')) {
  console.error('FAIL: verifyMcpApiKey should accept correct MCP API key');
  process.exit(1);
}
if (verifyMcpApiKey('wrong-mcp-key')) {
  console.error('FAIL: verifyMcpApiKey should reject wrong MCP API key');
  process.exit(1);
}

if (!verifyDesktopToken('test-desktop-session-token-1234567890')) {
  console.error('FAIL: verifyDesktopToken should accept correct desktop session token');
  process.exit(1);
}
if (verifyDesktopToken('wrong-desktop-token')) {
  console.error('FAIL: verifyDesktopToken should reject wrong desktop session token');
  process.exit(1);
}

const token = signSessionToken();
if (!verifySessionToken(token)) {
  console.error('FAIL: verifySessionToken should accept signed JWT');
  process.exit(1);
}
if (verifySessionToken(token + 'x')) {
  console.error('FAIL: verifySessionToken should reject tampered JWT');
  process.exit(1);
}

console.log('verify-auth-build: OK');
