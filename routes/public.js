const express = require('express');
const router = express.Router();
const db = require('../models/db');

router.get('/', async (req, res) => {
  const data = await db.getFullPageData();
  res.render('index', data);
});

module.exports = router;
