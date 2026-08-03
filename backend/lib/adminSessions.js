const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COOKIE_NAME = 'flight_frame_admin';
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

const getSessionTtlMs = () => {
  const configured = Number(process.env.ADMIN_SESSION_TTL_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TTL_MS;
  return Math.min(Math.max(configured, 60 * 1000), 7 * 24 * 60 * 60 * 1000);
};

const getAdminPassword = () => {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;

  const configPath = process.env.CONFIG_PATH
    ? path.resolve(process.env.CONFIG_PATH)
    : path.join(__dirname, '..', 'config.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')).adminPassword || null;
  } catch {
    return null;
  }
};

const passwordsMatch = (candidate) => {
  const expected = getAdminPassword();
  if (!expected || typeof candidate !== 'string') return false;

  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  const candidateDigest = crypto.createHash('sha256').update(candidate).digest();
  return crypto.timingSafeEqual(expectedDigest, candidateDigest);
};

const removeExpiredSessions = (now = Date.now()) => {
  for (const [token, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(token);
  }
};

const createSession = () => {
  removeExpiredSessions();
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, Date.now() + getSessionTtlMs());
  return token;
};

const sessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.ADMIN_COOKIE_SECURE === 'true',
  maxAge: getSessionTtlMs(),
  path: '/'
});

const setSessionCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, sessionCookieOptions());
};

const clearSessionCookie = (res) => {
  const { maxAge, ...options } = sessionCookieOptions();
  res.clearCookie(COOKIE_NAME, options);
};

const getRequestSessionToken = (req) => req.cookies?.[COOKIE_NAME] || null;

const isSessionAuthenticated = (req) => {
  const token = getRequestSessionToken(req);
  if (!token) return false;

  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
};

const destroyRequestSession = (req) => {
  const token = getRequestSessionToken(req);
  if (token) sessions.delete(token);
};

module.exports = {
  clearSessionCookie,
  createSession,
  destroyRequestSession,
  getAdminPassword,
  isSessionAuthenticated,
  passwordsMatch,
  setSessionCookie
};
