const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const SCHEMA_PATH = path.join(__dirname, '..', 'data', 'schema.sql');
const SEED_PATH = path.join(__dirname, '..', 'data', 'seed.sql');

let client;
let initialized = false;

function getClient() {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

function parseSqlStatements(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

async function executeSqlFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = parseSqlStatements(sql);
  for (let i = 0; i < statements.length; i += 20) {
    const chunk = statements.slice(i, i + 20).map(s => ({ sql: s }));
    await getClient().batch(chunk, 'write');
  }
}

async function init() {
  if (initialized) return;
  const c = getClient();
  const result = await c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='globals'");
  if (result.rows.length === 0) {
    await executeSqlFile(SCHEMA_PATH);
    await executeSqlFile(SEED_PATH);
    const user = process.env.ADMIN_USER || 'admin';
    const pass = process.env.ADMIN_PASS || 'admin123';
    const hash = bcrypt.hashSync(pass, 10);
    await c.execute({ sql: 'INSERT INTO admin_user (username, password_hash) VALUES (?, ?)', args: [user, hash] });
    console.log('Database initialized. Admin:', user);
  }
  initialized = true;
}

// Query helpers
async function query(sql, args) {
  const result = await getClient().execute(args ? { sql, args } : sql);
  return result.rows;
}

async function queryGet(sql, args) {
  const result = await getClient().execute(args ? { sql, args } : sql);
  return result.rows[0] || null;
}

async function run(sql, args) {
  const result = await getClient().execute(args ? { sql, args } : sql);
  return { lastInsertRowid: Number(result.lastInsertRowid), changes: result.rowsAffected };
}

async function batch(stmts) {
  return await getClient().batch(stmts, 'write');
}

// Domain queries
async function getGlobals() {
  const rows = await query('SELECT key, value FROM globals');
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  return obj;
}

async function getGlobalsAll() {
  return await query('SELECT * FROM globals ORDER BY key');
}

async function getSection(id) {
  const row = await queryGet('SELECT * FROM sections WHERE id = ?', [id]);
  if (row && row.extra_json) {
    try { row.extra = JSON.parse(row.extra_json); } catch (e) { row.extra = {}; }
  } else if (row) {
    row.extra = {};
  }
  return row;
}

async function getAllSections() {
  const rows = await query('SELECT * FROM sections ORDER BY rowid');
  const map = {};
  rows.forEach(r => {
    try { r.extra = JSON.parse(r.extra_json || '{}'); } catch (e) { r.extra = {}; }
    map[r.id] = r;
  });
  return map;
}

async function getItems(table, orderBy) {
  const allowed = [
    'nav_links', 'hero_cards', 'problems_items', 'process_steps',
    'checklist_items', 'counters', 'team_members', 'certificates',
    'plans', 'plan_features', 'benefits', 'cases', 'reviews',
    'faq_items', 'legal_links', 'leads'
  ];
  if (!allowed.includes(table)) throw new Error('Invalid table: ' + table);
  const order = orderBy || 'sort_order ASC, id ASC';
  return await query(`SELECT * FROM ${table} ORDER BY ${order}`);
}

async function getItemById(table, id) {
  const allowed = [
    'nav_links', 'hero_cards', 'problems_items', 'process_steps',
    'checklist_items', 'counters', 'team_members', 'certificates',
    'plans', 'plan_features', 'benefits', 'cases', 'reviews',
    'faq_items', 'legal_links', 'leads'
  ];
  if (!allowed.includes(table)) throw new Error('Invalid table: ' + table);
  return await queryGet(`SELECT * FROM ${table} WHERE id = ?`, [id]);
}

async function getFullPageData() {
  const globals = await getGlobals();
  const sections = await getAllSections();
  const navHeader = await query("SELECT * FROM nav_links WHERE location='header' ORDER BY sort_order");
  const navFooter = await query("SELECT * FROM nav_links WHERE location='footer' ORDER BY sort_order");
  const heroCards = await getItems('hero_cards');
  const problemsItems1 = await query("SELECT * FROM problems_items WHERE column_num=1 ORDER BY sort_order");
  const problemsItems2 = await query("SELECT * FROM problems_items WHERE column_num=2 ORDER BY sort_order");
  const processSteps = await getItems('process_steps');
  const checklistCol1 = await query("SELECT * FROM checklist_items WHERE column_num=1 ORDER BY sort_order");
  const checklistCol2 = await query("SELECT * FROM checklist_items WHERE column_num=2 ORDER BY sort_order");
  const featuredCounter = await queryGet("SELECT * FROM counters WHERE location='featured' ORDER BY sort_order LIMIT 1");
  const statsCounters = await query("SELECT * FROM counters WHERE location='stats' ORDER BY sort_order");
  const teamMembers = await getItems('team_members');
  const certificates = await getItems('certificates');

  const plans = await getItems('plans');
  const planFeatures = await getItems('plan_features');
  plans.forEach(p => {
    p.features = planFeatures.filter(f => f.plan_id === p.id);
  });

  const benefits = await getItems('benefits');
  const cases = await getItems('cases');
  const reviews = await getItems('reviews');
  const faqItems = await getItems('faq_items');
  const legalLinks = await getItems('legal_links');

  return {
    g: globals, s: sections,
    navHeader, navFooter, heroCards,
    problemsItems1, problemsItems2, processSteps,
    checklistCol1, checklistCol2,
    featuredCounter, statsCounters,
    teamMembers, certificates,
    plans, benefits, cases, reviews, faqItems, legalLinks
  };
}

module.exports = { init, query, queryGet, run, batch, getGlobals, getGlobalsAll, getSection, getAllSections, getItems, getItemById, getFullPageData };
