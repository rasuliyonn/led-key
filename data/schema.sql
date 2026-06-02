-- Lead-Key Admin Panel Database Schema

CREATE TABLE IF NOT EXISTS globals (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL DEFAULT '',
    label       TEXT,
    field_type  TEXT DEFAULT 'text'
);

CREATE TABLE IF NOT EXISTS sections (
    id          TEXT PRIMARY KEY,
    chip        TEXT,
    title       TEXT,
    subtitle    TEXT,
    extra_json  TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nav_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    location    TEXT NOT NULL DEFAULT 'header',
    label       TEXT NOT NULL,
    href        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hero_cards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text_html   TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS problems_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text        TEXT NOT NULL,
    column_num  INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS process_steps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    day_label   TEXT NOT NULL,
    title       TEXT NOT NULL,
    text        TEXT NOT NULL,
    icon_path   TEXT,
    is_accent   INTEGER DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklist_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text        TEXT NOT NULL,
    column_num  INTEGER NOT NULL DEFAULT 1,
    is_accent   INTEGER DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS counters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    value       REAL NOT NULL,
    prefix      TEXT DEFAULT '',
    suffix      TEXT DEFAULT '',
    unit        TEXT DEFAULT '',
    label       TEXT NOT NULL,
    use_grouping INTEGER DEFAULT 0,
    location    TEXT DEFAULT 'stats',
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    badge       TEXT,
    role        TEXT NOT NULL,
    photo_path  TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS certificates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    image_path  TEXT NOT NULL,
    alt_text    TEXT DEFAULT 'Сертификат Avito',
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT NOT NULL UNIQUE,
    num_label   TEXT NOT NULL,
    name        TEXT NOT NULL,
    subtitle    TEXT NOT NULL,
    price_text  TEXT NOT NULL,
    includes_text TEXT,
    button_text TEXT DEFAULT 'Заказать услугу',
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plan_features (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    is_highlight INTEGER DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS benefits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    number      TEXT NOT NULL,
    title       TEXT NOT NULL,
    text        TEXT NOT NULL,
    icon_svg    TEXT,
    color       TEXT DEFAULT 'blue',
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    logo_type   TEXT DEFAULT 'image',
    logo_path   TEXT,
    logo_text   TEXT,
    niche_label TEXT DEFAULT 'НИША',
    title       TEXT NOT NULL,
    period      TEXT NOT NULL,
    services    TEXT NOT NULL,
    lead_cost   TEXT NOT NULL,
    lead_volume TEXT NOT NULL,
    lead_unit   TEXT DEFAULT 'шт/мес',
    link        TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT DEFAULT 'text',
    name        TEXT NOT NULL,
    source      TEXT,
    text        TEXT,
    video_url   TEXT,
    video_path  TEXT,
    link        TEXT,
    color       TEXT DEFAULT 'green',
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS faq_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS legal_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    label       TEXT NOT NULL,
    url         TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pages (
    slug        TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS leads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT,
    phone       TEXT NOT NULL,
    link        TEXT,
    agree_pd    INTEGER DEFAULT 0,
    agree_news  INTEGER DEFAULT 0,
    form_source TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_user (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
