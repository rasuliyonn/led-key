const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/db');

router.get('/login', (req, res) => {
  if (req.cookies && req.cookies.lk_token) {
    try {
      jwt.verify(req.cookies.lk_token, process.env.JWT_SECRET);
      return res.redirect('/admin');
    } catch (e) {}
  }
  res.render('admin/login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.queryGet('SELECT * FROM admin_user WHERE username = ?', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('admin/login', { error: 'Неверный логин или пароль' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.cookie('lk_token', token, { httpOnly: true, sameSite: 'strict', maxAge: 86400000 });
  res.redirect('/admin');
});

router.get('/logout', (req, res) => {
  res.clearCookie('lk_token');
  res.redirect('/admin/login');
});

module.exports = router;
