#!/usr/bin/env node
/**
 * Smoke test for JWT auth after `npm run build`.
 * Does not start HTTP or SQLite; validates password check and sign/verify.
 */
process.env.ADMIN_PASSWORD = 'testpass';
process.env.SESSION_SECRET = '01234567890123456789012345678901';

const path = require('path');
const { verifyPassword } = require(path.join(__dirname, '../dist/middleware/auth.middleware.js'));
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
