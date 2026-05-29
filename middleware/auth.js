const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.lk_token;
  if (!token) return res.redirect('/admin/login');
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    res.clearCookie('lk_token');
    return res.redirect('/admin/login');
  }
}

function requireAuthApi(req, res, next) {
  const token = req.cookies && req.cookies.lk_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token expired' });
  }
}

module.exports = { requireAuth, requireAuthApi };
