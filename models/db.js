const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'leadkey.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'data', 'schema.sql');
const SEED_PATH = path.join(__dirname, '..', 'data', 'seed.sql');

let db;

function init() {
  const isNew = !fs.existsSync(DB_PATH);
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  if (isNew) {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    const seed = fs.readFileSync(SEED_PATH, 'utf8');
    db.exec(seed);

    // Create default admin user from env
    const user = process.env.ADMIN_USER || 'admin';
    const pass = process.env.ADMIN_PASS || 'admin123';
    const hash = bcrypt.hashSync(pass, 10);
    db.prepare('INSERT INTO admin_user (username, password_hash) VALUES (?, ?)').run(user, hash);

    console.log('Database initialized with seed data. Admin:', user);
  }

  // Migrations: ensure new globals exist
  const ensureGlobal = db.prepare('INSERT OR IGNORE INTO globals (key, value, label, field_type) VALUES (?, ?, ?, ?)');
  ensureGlobal.run('max_bot_url', '', 'Ссылка на бота MAX (для виджета чата)', 'url');
  ensureGlobal.run('max_bot_token', '', 'MAX Bot Token (для уведомлений о заявках)', 'text');
  ensureGlobal.run('max_chat_id', '', 'MAX Chat ID (куда слать уведомления)', 'text');

  // Migrate file-type globals
  const setFileType = db.prepare("UPDATE globals SET field_type = 'file' WHERE key = ? AND field_type != 'file'");
  ['logo_path', 'hero_photo', 'footer_bg'].forEach(k => setFileType.run(k));

  // Migrate: create pages table if not exists
  db.exec('CREATE TABLE IF NOT EXISTS pages (slug TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT "")');

  // Seed default pages if empty
  const pageCount = db.prepare('SELECT COUNT(*) as cnt FROM pages').get().cnt;
  if (pageCount === 0) {
    const seedPage = db.prepare('INSERT OR IGNORE INTO pages (slug, title, content) VALUES (?, ?, ?)');
    seedPage.run('politics', 'Политика конфиденциальности', '<h2>1. Общие положения</h2><p>Настоящая Политика конфиденциальности определяет порядок обработки и защиты персональных данных пользователей сайта. Оставляя свои персональные данные, Пользователь даёт согласие на их обработку в соответствии с ФЗ № 152-ФЗ «О персональных данных».</p><h2>2. Какие данные мы собираем</h2><ul><li>Имя;</li><li>Номер телефона;</li><li>Адрес электронной почты;</li><li>Ссылки на профили в мессенджерах.</li></ul><h2>3. Цели обработки</h2><ul><li>Связь с Пользователем;</li><li>Исполнение договорных обязательств;</li><li>Направление рассылок (при наличии согласия).</li></ul><h2>4. Защита данных</h2><p>Оператор принимает необходимые меры для защиты персональных данных от неправомерного доступа.</p><h2>5. Контакты</h2><p>По вопросам обработки персональных данных обращайтесь на email или по телефону, указанным на сайте.</p>');
    seedPage.run('offer', 'Публичная оферта', '<h2>1. Общие положения</h2><p>Настоящий документ является публичной офертой и содержит условия оказания услуг по продвижению бизнеса на маркетплейсах.</p><h2>2. Предмет</h2><p>Исполнитель обязуется оказать услуги в соответствии с выбранным тарифным планом.</p><h2>3. Оплата</h2><p>Стоимость определяется тарифным планом. Оплата — 100% предоплата.</p><h2>4. Контакты</h2><p>Контактная информация указана на сайте.</p>');
    seedPage.run('approval', 'Согласие на информационную рассылку', '<h2>Согласие на рассылку</h2><p>Оставляя контактные данные, я даю согласие на направление мне информационных и рекламных сообщений посредством SMS, мессенджеров, электронной почты и телефонных звонков.</p><p>Я вправе отказаться от рассылки в любой момент, направив запрос на email, указанный на сайте.</p>');
    seedPage.run('approval2', 'Согласие на обработку персональных данных', '<h2>Согласие на обработку ПД</h2><p>Я даю согласие на обработку моих персональных данных (ФИО, телефон, email, ссылки на профили) в целях консультирования, оказания услуг и направления рассылок. Согласие действует до момента отзыва.</p>');
    console.log('Default pages seeded');
  }

  // Migrate legal_links to local URLs
  const updateLegal = db.prepare("UPDATE legal_links SET url = ? WHERE url LIKE ?");
  updateLegal.run('/politics', '%lead-key.ru/politics');
  updateLegal.run('/offer', '%lead-key.ru/offer');
  updateLegal.run('/approval2', '%lead-key.ru/approval2');
  updateLegal.run('/approval', '%lead-key.ru/approval');

  return db;
}

function getDb() {
  if (!db) init();
  return db;
}

// ---- Helper queries ----

function getGlobals() {
  const rows = getDb().prepare('SELECT key, value FROM globals').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  return obj;
}

function getGlobalsAll() {
  return getDb().prepare('SELECT * FROM globals ORDER BY key').all();
}

function getSection(id) {
  const row = getDb().prepare('SELECT * FROM sections WHERE id = ?').get(id);
  if (row && row.extra_json) {
    try { row.extra = JSON.parse(row.extra_json); } catch (e) { row.extra = {}; }
  } else if (row) {
    row.extra = {};
  }
  return row;
}

function getAllSections() {
  const rows = getDb().prepare('SELECT * FROM sections ORDER BY rowid').all();
  const map = {};
  rows.forEach(r => {
    try { r.extra = JSON.parse(r.extra_json || '{}'); } catch (e) { r.extra = {}; }
    map[r.id] = r;
  });
  return map;
}

function getItems(table, orderBy) {
  const allowed = [
    'nav_links', 'hero_cards', 'problems_items', 'process_steps',
    'checklist_items', 'counters', 'team_members', 'certificates',
    'plans', 'plan_features', 'benefits', 'cases', 'reviews',
    'faq_items', 'legal_links', 'leads'
  ];
  if (!allowed.includes(table)) throw new Error('Invalid table: ' + table);
  const order = orderBy || 'sort_order ASC, id ASC';
  return getDb().prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();
}

function getItemById(table, id) {
  const allowed = [
    'nav_links', 'hero_cards', 'problems_items', 'process_steps',
    'checklist_items', 'counters', 'team_members', 'certificates',
    'plans', 'plan_features', 'benefits', 'cases', 'reviews',
    'faq_items', 'legal_links', 'leads'
  ];
  if (!allowed.includes(table)) throw new Error('Invalid table: ' + table);
  return getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function getFullPageData() {
  const globals = getGlobals();
  const sections = getAllSections();
  const navHeader = getDb().prepare("SELECT * FROM nav_links WHERE location='header' ORDER BY sort_order").all();
  const navFooter = getDb().prepare("SELECT * FROM nav_links WHERE location='footer' ORDER BY sort_order").all();
  const heroCards = getItems('hero_cards');
  const problemsItems1 = getDb().prepare("SELECT * FROM problems_items WHERE column_num=1 ORDER BY sort_order").all();
  const problemsItems2 = getDb().prepare("SELECT * FROM problems_items WHERE column_num=2 ORDER BY sort_order").all();
  const processSteps = getItems('process_steps');
  const checklistCol1 = getDb().prepare("SELECT * FROM checklist_items WHERE column_num=1 ORDER BY sort_order").all();
  const checklistCol2 = getDb().prepare("SELECT * FROM checklist_items WHERE column_num=2 ORDER BY sort_order").all();
  const featuredCounter = getDb().prepare("SELECT * FROM counters WHERE location='featured' ORDER BY sort_order LIMIT 1").get();
  const statsCounters = getDb().prepare("SELECT * FROM counters WHERE location='stats' ORDER BY sort_order").all();
  const teamMembers = getItems('team_members');
  const certificates = getItems('certificates');

  const plans = getItems('plans');
  const planFeatures = getItems('plan_features');
  plans.forEach(p => {
    p.features = planFeatures.filter(f => f.plan_id === p.id);
  });

  const benefits = getItems('benefits');
  const cases = getItems('cases');
  const reviews = getItems('reviews');
  const faqItems = getItems('faq_items');
  const legalLinks = getItems('legal_links');

  return {
    g: globals,
    s: sections,
    navHeader, navFooter, heroCards,
    problemsItems1, problemsItems2,
    processSteps,
    checklistCol1, checklistCol2,
    featuredCounter, statsCounters,
    teamMembers, certificates,
    plans, benefits, cases, reviews, faqItems, legalLinks
  };
}

module.exports = { init, getDb, getGlobals, getGlobalsAll, getSection, getAllSections, getItems, getItemById, getFullPageData };
