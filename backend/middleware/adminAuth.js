const fs = require('fs');
const path = require('path');

function getAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
    return cfg.adminPassword;
  } catch (e) {
    return null;
  }
}

module.exports = function adminAuth(req, res, next) {
  const password = getAdminPassword();
  if (!password) {
    return res.status(500).json({ error: 'Admin password not configured on server' });
  }

  // Accept Authorization: Bearer <password> header or admin cookie
  const auth = req.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if (token === password) return next();
  }

  if (req.cookies && req.cookies.admin === password) return next();

  return res.status(401).json({ error: 'Unauthorized' });
};
