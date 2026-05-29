const express = require('express');
const router = express.Router();
const db = require('../models/db');

router.get('/', (req, res) => {
  const data = db.getFullPageData();
  res.render('index', data);
});

module.exports = router;
