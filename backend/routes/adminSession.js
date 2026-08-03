const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  clearSessionCookie,
  createSession,
  destroyRequestSession,
  getAdminPassword,
  isSessionAuthenticated,
  passwordsMatch,
  setSessionCookie
} = require('../lib/adminSessions');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many failed sign-in attempts. Try again later.' }
});

router.get('/', (req, res) => {
  if (!isSessionAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
  return res.sendStatus(204);
});

router.post('/', loginLimiter, (req, res) => {
  if (!getAdminPassword()) {
    return res.status(503).json({ error: 'Admin password not configured on server' });
  }
  if (!passwordsMatch(req.body?.password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = createSession();
  setSessionCookie(res, token);
  return res.sendStatus(204);
});

router.delete('/', (req, res) => {
  destroyRequestSession(req);
  clearSessionCookie(res);
  return res.sendStatus(204);
});

module.exports = router;
