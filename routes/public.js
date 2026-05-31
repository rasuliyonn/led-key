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

module.exports = router;
