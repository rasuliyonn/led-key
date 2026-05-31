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
