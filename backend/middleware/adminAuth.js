const { isSessionAuthenticated, passwordsMatch } = require('../lib/adminSessions');

module.exports = function adminAuth(req, res, next) {
  if (isSessionAuthenticated(req)) return next();

  // Temporary opt-in for scripts that have not migrated to the session endpoint.
  if (process.env.ALLOW_LEGACY_ADMIN_BEARER === 'true') {
    const auth = req.get('Authorization');
    if (auth?.startsWith('Bearer ') && passwordsMatch(auth.slice('Bearer '.length).trim())) {
      return next();
    }
  }

  return res.status(401).json({ error: 'Unauthorized' });
};
