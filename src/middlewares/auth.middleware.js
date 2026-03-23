const { loadConfig, verifyJWT } = require('../utils/auth');

function authMiddleware(req, res, next) {
  const cfg = loadConfig();
  if (!cfg) return res.status(503).json({ error: 'Not configured' });
  const token = req.headers['authorization'] || '';
  try {
    verifyJWT(token, cfg.jwtSecret);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = {
  authMiddleware
};
