const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../models/db');

router.use(requireAuth);

function renderAdmin(res, contentView, locals) {
  locals.contentView = contentView;
  res.render('admin/layout', locals);
}

// Dashboard
router.get('/', async (req, res) => {
  const leadCountRow = await db.queryGet('SELECT COUNT(*) as cnt FROM leads');
  const unreadCountRow = await db.queryGet('SELECT COUNT(*) as cnt FROM leads WHERE is_read = 0');
  renderAdmin(res, 'dashboard', { page: 'dashboard', admin: req.admin, leadCount: leadCountRow.cnt, unreadCount: unreadCountRow.cnt });
});

// Globals
router.get('/globals', async (req, res) => {
  const globals = await db.getGlobalsAll();
  renderAdmin(res, 'globals', { page: 'globals', admin: req.admin, globals });
});

// Section editors
const sectionNames = {
  hero: 'Hero',
  problems: 'Проблемы',
  process: 'Процесс',
  maintenance: 'Ведение',
  results: 'Результаты',
  cta1: 'CTA форма 1',
  team: 'Команда',
  certs: 'Сертификаты',
  pricing: 'Тарифы',
  benefits: 'Почему мы',
  cases: 'Кейсы',
  cta2: 'CTA форма 2',
  reviews: 'Отзывы',
  faq: 'FAQ',
  final_cta: 'Финальный CTA',
  footer: 'Футер'
};

router.get('/section/:id', async (req, res) => {
  const sectionId = req.params.id;
  if (!sectionNames[sectionId]) return res.status(404).send('Section not found');

  const section = await db.getSection(sectionId);
  let items = {};

  switch (sectionId) {
    case 'hero':
      items.heroCards = await db.getItems('hero_cards');
      break;
    case 'problems':
      items.items1 = await db.query("SELECT * FROM problems_items WHERE column_num=1 ORDER BY sort_order");
      items.items2 = await db.query("SELECT * FROM problems_items WHERE column_num=2 ORDER BY sort_order");
      break;
    case 'process':
      items.steps = await db.getItems('process_steps');
      break;
    case 'maintenance':
      items.col1 = await db.query("SELECT * FROM checklist_items WHERE column_num=1 ORDER BY sort_order");
      items.col2 = await db.query("SELECT * FROM checklist_items WHERE column_num=2 ORDER BY sort_order");
      break;
    case 'results':
      items.featured = await db.query("SELECT * FROM counters WHERE location='featured' ORDER BY sort_order");
      items.stats = await db.query("SELECT * FROM counters WHERE location='stats' ORDER BY sort_order");
      break;
    case 'team':
      items.members = await db.getItems('team_members');
      break;
    case 'certs':
      items.certificates = await db.getItems('certificates');
      break;
    case 'pricing':
      items.plans = await db.getItems('plans');
      const allFeatures = await db.getItems('plan_features');
      items.plans.forEach(p => { p.features = allFeatures.filter(f => f.plan_id === p.id); });
      break;
    case 'benefits':
      items.benefits = await db.getItems('benefits');
      break;
    case 'cases':
      items.cases = await db.getItems('cases');
      break;
    case 'reviews':
      items.reviews = await db.getItems('reviews');
      break;
    case 'faq':
      items.faqItems = await db.getItems('faq_items');
      break;
    case 'footer':
      items.navLinks = await db.query("SELECT * FROM nav_links WHERE location='footer' ORDER BY sort_order");
      items.legalLinks = await db.getItems('legal_links');
      break;
  }

  const globals = await db.getGlobals();

  renderAdmin(res, 'section', {
    page: 'section-' + sectionId,
    admin: req.admin,
    sectionId,
    sectionName: sectionNames[sectionId],
    section,
    items,
    globals
  });
});

// Media library
router.get('/media', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'images');
  let files = [];
  if (fs.existsSync(uploadsDir)) {
    files = fs.readdirSync(uploadsDir).map(f => ({
      name: f,
      path: '/uploads/images/' + f,
      size: fs.statSync(path.join(uploadsDir, f)).size
    }));
  }
  renderAdmin(res, 'media', { page: 'media', admin: req.admin, files });
});

// Leads
router.get('/leads', async (req, res) => {
  const leads = await db.query('SELECT * FROM leads ORDER BY created_at DESC');
  renderAdmin(res, 'leads', { page: 'leads', admin: req.admin, leads });
});

module.exports = router;
