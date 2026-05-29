require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const db = require('./models/db');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DB init middleware — ensures database is ready before handling requests
let initPromise = null;
app.use((req, res, next) => {
  if (!initPromise) initPromise = db.init();
  initPromise.then(() => next()).catch(next);
});

// Static files
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/css/style.css', express.static(path.join(__dirname, 'css', 'style.css')));
app.use('/js/main.js', express.static(path.join(__dirname, 'js', 'main.js')));

// Routes
app.use('/', require('./routes/public'));
app.use('/admin', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Lead-Key server running at http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
