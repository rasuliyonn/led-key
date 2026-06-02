const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { requireAuthApi } = require('../middleware/auth');
const db = require('../models/db');

// --- MAX Messenger notification ---
function getGlobalValue(key) {
  try {
    const row = db.getDb().prepare('SELECT value FROM globals WHERE key = ?').get(key);
    return row && row.value ? row.value : '';
  } catch (e) { return ''; }
}

function notifyMax(lead) {
  const token = getGlobalValue('max_bot_token') || process.env.MAX_BOT_TOKEN;
  const chatId = getGlobalValue('max_chat_id') || process.env.MAX_CHAT_ID;
  if (!token || !chatId) return;

  const text = [
    '📩 *Новая заявка с сайта*',
    '',
    `👤 Имя: ${lead.name || '—'}`,
    `📞 Телефон: ${lead.phone}`,
    lead.link ? `🔗 Ссылка: ${lead.link}` : '',
    `📋 Форма: ${lead.form_source || 'unknown'}`,
    `🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`
  ].filter(Boolean).join('\n');

  const body = JSON.stringify({ text, format: 'markdown' });

  const req = https.request({
    hostname: 'platform-api.max.ru',
    path: `/messages?chat_id=${chatId}`,
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, (res) => {
    if (res.statusCode !== 200) {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => console.error('MAX API error:', res.statusCode, data));
    }
  });
  req.on('error', (err) => console.error('MAX notify error:', err.message));
  req.write(body);
  req.end();
}

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isVideo = file.mimetype.startsWith('video/');
    const dir = path.join(__dirname, '..', 'public', 'uploads', isVideo ? 'videos' : 'images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp', 'video/mp4'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// --- Public: Lead submission ---
const rateMap = new Map();
router.post('/lead', (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  const hits = rateMap.get(ip) || [];
  const recent = hits.filter(t => now - t < 60000);
  if (recent.length >= 5) return res.status(429).json({ error: 'Too many requests' });
  recent.push(now);
  rateMap.set(ip, recent);

  const { name, phone, link, agree_pd, agree_news, form_source } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });

  db.getDb().prepare(
    'INSERT INTO leads (name, phone, link, agree_pd, agree_news, form_source) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name || '', phone, link || '', agree_pd ? 1 : 0, agree_news ? 1 : 0, form_source || 'unknown');

  notifyMax({ name, phone, link, form_source });

  res.json({ ok: true });
});

// --- Protected API ---
router.use(requireAuthApi);

// Update globals
router.put('/globals', (req, res) => {
  const updates = req.body;
  // Delete old uploaded files when file-path globals change
  const getGlobal = db.getDb().prepare('SELECT value FROM globals WHERE key = ?');
  Object.entries(updates).forEach(([key, value]) => {
    if (GLOBAL_FILE_KEYS.includes(key)) {
      const old = getGlobal.get(key);
      if (old && old.value && old.value !== value) removeUploadedFile(old.value);
    }
  });
  const stmt = db.getDb().prepare('UPDATE globals SET value = ? WHERE key = ?');
  const tx = db.getDb().transaction((data) => {
    Object.entries(data).forEach(([key, value]) => stmt.run(value, key));
  });
  tx(updates);
  res.json({ ok: true });
});

// Update section
router.put('/sections/:id', (req, res) => {
  const { chip, title, subtitle, extra_json } = req.body;
  db.getDb().prepare(
    'UPDATE sections SET chip = ?, title = ?, subtitle = ?, extra_json = ? WHERE id = ?'
  ).run(chip ?? null, title ?? null, subtitle ?? null, extra_json ?? '{}', req.params.id);
  res.json({ ok: true });
});

// --- File cleanup helper ---
const FILE_COLUMNS = {
  process_steps: ['icon_path'],
  team_members: ['photo_path'],
  certificates: ['image_path'],
  cases: ['logo_path'],
  reviews: ['video_path'],
};
const GLOBAL_FILE_KEYS = ['logo_path', 'hero_photo', 'footer_bg'];

function removeUploadedFile(filePath) {
  if (!filePath) return;
  const normalized = filePath.startsWith('/') ? filePath : '/' + filePath;
  if (!normalized.startsWith('/uploads/')) return;
  const full = path.join(__dirname, '..', 'public', normalized);
  try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch (e) { /* ignore */ }
}

// --- Generic CRUD for item tables ---
const TABLE_SCHEMAS = {
  nav_links: ['location', 'label', 'href', 'sort_order'],
  hero_cards: ['text_html', 'sort_order'],
  problems_items: ['text', 'column_num', 'sort_order'],
  process_steps: ['day_label', 'title', 'text', 'icon_path', 'is_accent', 'sort_order'],
  checklist_items: ['text', 'column_num', 'is_accent', 'sort_order'],
  counters: ['value', 'prefix', 'suffix', 'unit', 'label', 'use_grouping', 'location', 'sort_order'],
  team_members: ['name', 'badge', 'role', 'photo_path', 'sort_order'],
  certificates: ['image_path', 'alt_text', 'sort_order'],
  plans: ['slug', 'num_label', 'name', 'subtitle', 'price_text', 'includes_text', 'button_text', 'sort_order'],
  plan_features: ['plan_id', 'text', 'is_highlight', 'sort_order'],
  benefits: ['number', 'title', 'text', 'icon_svg', 'color', 'sort_order'],
  cases: ['logo_type', 'logo_path', 'logo_text', 'niche_label', 'title', 'period', 'services', 'lead_cost', 'lead_volume', 'lead_unit', 'link', 'sort_order'],
  reviews: ['type', 'name', 'source', 'text', 'video_url', 'video_path', 'link', 'color', 'sort_order'],
  faq_items: ['question', 'answer', 'sort_order'],
  legal_links: ['label', 'url', 'sort_order']
};

function validateTable(table) {
  if (!TABLE_SCHEMAS[table]) throw { status: 400, message: 'Invalid table' };
  return TABLE_SCHEMAS[table];
}

// List items
router.get('/items/:table', (req, res) => {
  try {
    validateTable(req.params.table);
    const items = db.getItems(req.params.table);
    res.json(items);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Create item
router.post('/items/:table', (req, res) => {
  try {
    const cols = validateTable(req.params.table);
    const data = req.body;
    const usedCols = cols.filter(c => data[c] !== undefined);
    const placeholders = usedCols.map(() => '?').join(', ');
    const values = usedCols.map(c => data[c] ?? null);

    const result = db.getDb().prepare(
      `INSERT INTO ${req.params.table} (${usedCols.join(', ')}) VALUES (${placeholders})`
    ).run(...values);

    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Update item
router.put('/items/:table/:id', (req, res) => {
  try {
    const cols = validateTable(req.params.table);
    const data = req.body;
    const usedCols = cols.filter(c => data[c] !== undefined);
    if (!usedCols.length) return res.json({ ok: true });

    // Delete old uploaded files when file columns change
    const fileCols = FILE_COLUMNS[req.params.table];
    if (fileCols) {
      const old = db.getDb().prepare(`SELECT * FROM ${req.params.table} WHERE id = ?`).get(parseInt(req.params.id));
      if (old) {
        fileCols.forEach(col => {
          if (data[col] !== undefined && old[col] && old[col] !== data[col]) {
            removeUploadedFile(old[col]);
          }
        });
      }
    }

    const sets = usedCols.map(c => `${c} = ?`).join(', ');
    const values = usedCols.map(c => data[c] ?? null);
    values.push(parseInt(req.params.id));

    db.getDb().prepare(`UPDATE ${req.params.table} SET ${sets} WHERE id = ?`).run(...values);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Delete item
router.delete('/items/:table/:id', (req, res) => {
  try {
    validateTable(req.params.table);
    // Delete associated uploaded files before removing record
    const fileCols = FILE_COLUMNS[req.params.table];
    if (fileCols) {
      const old = db.getDb().prepare(`SELECT * FROM ${req.params.table} WHERE id = ?`).get(parseInt(req.params.id));
      if (old) fileCols.forEach(col => removeUploadedFile(old[col]));
    }
    db.getDb().prepare(`DELETE FROM ${req.params.table} WHERE id = ?`).run(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Reorder items
router.put('/items/:table/reorder', (req, res) => {
  try {
    validateTable(req.params.table);
    const { order } = req.body; // [{id, sort_order}]
    const stmt = db.getDb().prepare(`UPDATE ${req.params.table} SET sort_order = ? WHERE id = ?`);
    const tx = db.getDb().transaction((items) => {
      items.forEach(item => stmt.run(item.sort_order, item.id));
    });
    tx(order);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// File upload
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const isVideo = req.file.mimetype.startsWith('video/');
  const relativePath = 'uploads/' + (isVideo ? 'videos/' : 'images/') + req.file.filename;
  res.json({ ok: true, path: relativePath, filename: req.file.filename });
});

// Delete uploaded file
router.delete('/upload/:filename', (req, res) => {
  const filename = req.params.filename;
  // Prevent path traversal
  if (filename.includes('/') || filename.includes('..')) return res.status(400).json({ error: 'Invalid filename' });

  const imgPath = path.join(__dirname, '..', 'public', 'uploads', 'images', filename);
  const vidPath = path.join(__dirname, '..', 'public', 'uploads', 'videos', filename);

  if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  else if (fs.existsSync(vidPath)) fs.unlinkSync(vidPath);

  res.json({ ok: true });
});

// Leads
router.get('/leads', (req, res) => {
  const leads = db.getDb().prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  res.json(leads);
});

router.put('/leads/:id/read', (req, res) => {
  db.getDb().prepare('UPDATE leads SET is_read = 1 WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

router.delete('/leads/:id', (req, res) => {
  db.getDb().prepare('DELETE FROM leads WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// Pages CRUD
router.get('/pages', (req, res) => {
  const pages = db.getDb().prepare('SELECT * FROM pages').all();
  res.json(pages);
});

router.post('/pages', (req, res) => {
  const { slug, title, content } = req.body;
  if (!slug || !title) return res.status(400).json({ error: 'Slug and title required' });
  db.getDb().prepare('INSERT INTO pages (slug, title, content) VALUES (?, ?, ?)').run(slug, title, content || '');
  res.json({ ok: true });
});

router.put('/pages/:slug', (req, res) => {
  const { title, content } = req.body;
  db.getDb().prepare('UPDATE pages SET title = ?, content = ? WHERE slug = ?').run(title, content || '', req.params.slug);
  res.json({ ok: true });
});

router.delete('/pages/:slug', (req, res) => {
  db.getDb().prepare('DELETE FROM pages WHERE slug = ?').run(req.params.slug);
  res.json({ ok: true });
});

module.exports = router;
