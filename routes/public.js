const express = require('express');
const router = express.Router();
const db = require('../models/db');

router.get('/', (req, res) => {
  const data = db.getFullPageData();
  // MAX bot URL: from DB or env fallback
  if (!data.g.max_bot_url && process.env.MAX_BOT_USERNAME) {
    data.g.max_bot_url = 'https://max.ru/' + process.env.MAX_BOT_USERNAME;
  }
  res.render('index', data);
});

// Static pages (politics, offer, etc.)
router.get('/:slug', (req, res, next) => {
  const page = db.getDb().prepare('SELECT * FROM pages WHERE slug = ?').get(req.params.slug);
  if (!page) return next();
  const g = db.getGlobals();
  res.render('page', { page, g });
});

module.exports = router;
