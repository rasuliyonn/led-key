const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../models/db');

router.use(requireAuth);

// Helper: render admin page with layout
function renderAdmin(res, contentView, locals) {
  locals.contentView = contentView;
  res.render('admin/layout', locals);
}

// Dashboard
router.get('/', (req, res) => {
  const leadCount = db.getDb().prepare('SELECT COUNT(*) as cnt FROM leads').get().cnt;
  const unreadCount = db.getDb().prepare('SELECT COUNT(*) as cnt FROM leads WHERE is_read = 0').get().cnt;
  renderAdmin(res, 'dashboard', { page: 'dashboard', admin: req.admin, leadCount, unreadCount });
});

// Globals
router.get('/globals', (req, res) => {
  const globals = db.getGlobalsAll();
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

router.get('/section/:id', (req, res) => {
  const sectionId = req.params.id;
  if (!sectionNames[sectionId]) return res.status(404).send('Section not found');

  const section = db.getSection(sectionId);
  let items = {};

  switch (sectionId) {
    case 'hero':
      items.heroCards = db.getItems('hero_cards');
      break;
    case 'problems':
      items.items1 = db.getDb().prepare("SELECT * FROM problems_items WHERE column_num=1 ORDER BY sort_order").all();
      items.items2 = db.getDb().prepare("SELECT * FROM problems_items WHERE column_num=2 ORDER BY sort_order").all();
      break;
    case 'process':
      items.steps = db.getItems('process_steps');
      break;
    case 'maintenance':
      items.col1 = db.getDb().prepare("SELECT * FROM checklist_items WHERE column_num=1 ORDER BY sort_order").all();
      items.col2 = db.getDb().prepare("SELECT * FROM checklist_items WHERE column_num=2 ORDER BY sort_order").all();
      break;
    case 'results':
      items.featured = db.getDb().prepare("SELECT * FROM counters WHERE location='featured' ORDER BY sort_order").all();
      items.stats = db.getDb().prepare("SELECT * FROM counters WHERE location='stats' ORDER BY sort_order").all();
      break;
    case 'team':
      items.members = db.getItems('team_members');
      break;
    case 'certs':
      items.certificates = db.getItems('certificates');
      break;
    case 'pricing':
      items.plans = db.getItems('plans');
      const allFeatures = db.getItems('plan_features');
      items.plans.forEach(p => { p.features = allFeatures.filter(f => f.plan_id === p.id); });
      break;
    case 'benefits':
      items.benefits = db.getItems('benefits');
      break;
    case 'cases':
      items.cases = db.getItems('cases');
      break;
    case 'reviews':
      items.reviews = db.getItems('reviews');
      break;
    case 'faq':
      items.faqItems = db.getItems('faq_items');
      break;
    case 'footer':
      items.navLinks = db.getDb().prepare("SELECT * FROM nav_links WHERE location='footer' ORDER BY sort_order").all();
      items.legalLinks = db.getItems('legal_links');
      break;
  }

  const globals = db.getGlobals();

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

// Pages
router.get('/pages', (req, res) => {
  const pages = db.getDb().prepare('SELECT * FROM pages').all();
  renderAdmin(res, 'pages', { page: 'pages', admin: req.admin, pages });
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
router.get('/leads', (req, res) => {
  const leads = db.getDb().prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  renderAdmin(res, 'leads', { page: 'leads', admin: req.admin, leads });
});

module.exports = router;
