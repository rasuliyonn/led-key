# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What This Is

Landing page for **Lead Key** agency — Avito marketing service. Rebuilt from the original Tilda site at https://lead-key.ru/ into clean hand-coded HTML/CSS/JS, now with an **Express.js backend** and **admin panel** for content management.

All page content is stored in SQLite and rendered server-side via EJS templates. The admin panel provides full CRUD for every section, lead management, and media uploads.

---

## Commands

```bash
npm install                  # install dependencies (first time)
npm run dev                  # start with --watch (auto-restart on changes)
npm start                    # production start
# Server runs at http://localhost:3000, admin at http://localhost:3000/admin
```

**Environment variables** (`.env` file):
- `PORT` — server port (default 3000)
- `JWT_SECRET` — required for admin auth
- `ADMIN_USER` / `ADMIN_PASS` — initial admin credentials (default `admin`/`admin123`, only used on first DB init)

**Database**: SQLite file at `data/leadkey.db`. Auto-created from `data/schema.sql` + `data/seed.sql` on first run. Delete the `.db` file to re-seed.

---

## Architecture

```
server.js                    # Express app entry point
├── routes/
│   ├── public.js            # GET / — renders index.ejs with full page data
│   ├── auth.js              # /admin/login, /admin/logout (JWT cookie auth)
│   ├── admin.js             # /admin/* — dashboard, section editors, leads, media
│   └── api.js               # /api/* — REST API (lead submission + admin CRUD)
├── models/db.js             # better-sqlite3 wrapper, all queries, getFullPageData()
├── middleware/auth.js        # JWT cookie verification (requireAuth, requireAuthApi)
├── views/
│   ├── index.ejs            # Full landing page template (was static index.html)
│   └── admin/               # Admin panel views (layout.ejs + content partials)
├── data/
│   ├── schema.sql           # All table definitions (20 tables)
│   ├── seed.sql             # Initial content extracted from original HTML
│   └── leadkey.db           # SQLite database (gitignored, auto-created)
├── css/style.css            # Landing page styles (CSS variables, BEM, responsive)
├── js/main.js               # Landing page interactivity (9 modules in one IIFE)
├── public/
│   ├── css/admin.css        # Admin panel styles
│   ├── js/admin.js          # Admin panel JS
│   └── uploads/             # User-uploaded images/videos (gitignored)
└── assets/                  # Static images, logos, icons
```

### Data Flow

1. `routes/public.js` calls `db.getFullPageData()` which assembles all tables into one object
2. Object passed to `views/index.ejs` as template variables: `g` (globals), `s` (sections map), plus arrays for each content type
3. Admin panel edits via `/api/*` endpoints write directly to SQLite; changes appear on next page load

### Key Patterns

- **Generic CRUD**: `routes/api.js` has a table-driven CRUD system via `TABLE_SCHEMAS` — validates table name against whitelist, then builds INSERT/UPDATE/DELETE dynamically. All item tables use `/api/items/:table/:id`.
- **Two auth middlewares**: `requireAuth` (redirects to login) for page routes, `requireAuthApi` (returns 401 JSON) for API routes.
- **Lead submission** (`POST /api/lead`) is the only public API endpoint — has in-memory rate limiting (5/min per IP).
- **File uploads** via multer to `public/uploads/images/` or `public/uploads/videos/`, max 100MB.

---

## Frontend Conventions

- **CSS**: Variables in `:root` (see `css/style.css`). Key: `--purple` (#955FE9), `--grad-brand`, `--container` (1200px). BEM naming. Flexbox/Grid only — no absolute positioning for layout.
- **JS**: Vanilla ES5, single IIFE, 9 modules marked with `/* ---- N. … ---- */` comments. No npm dependencies on frontend.
- **Breakpoints**: 1024px → 768px → 560px (end of `css/style.css`).
- **Font**: Inter Tight from Google Fonts.

### Section Map

Each landing page section is a `<section class="… section">` with `.container` inside. Sections in order: `.hero`, `.problems`, `.process`, `.maintenance`, `.results`, `.cta` (×2), `.team`, `.certs`, `.pricing`, `.benefits`, `.cases`, `.reviews`, `.faq`, `.final-cta`. Reference sections by class name when making changes.

---

## Database Schema

20 tables in `data/schema.sql`. Main content tables all have `sort_order` for ordering:

- `globals` — key-value config (phone, email, meta tags, paths)
- `sections` — per-section chip/title/subtitle + `extra_json` for section-specific fields
- Content tables: `nav_links`, `hero_cards`, `problems_items`, `process_steps`, `checklist_items`, `counters`, `team_members`, `certificates`, `plans`, `plan_features`, `benefits`, `cases`, `reviews`, `faq_items`, `legal_links`
- `leads` — form submissions with `is_read` flag
- `admin_user` — bcrypt-hashed credentials

---

## Gotchas

- **`[hidden]` vs `display`**: Elements with `display:flex/grid` override HTML `hidden` attribute. Use `[hidden]{display:none}` when needed.
- **Static file serving**: Two paths — `css/style.css` and `js/main.js` are served from repo root (backward compat), while `public/css/` and `public/js/` serve admin assets.
- **EJS uses `<%-` for raw HTML** (section titles contain markup like `<span class="mark">`). Use `<%=` only for escaped text.
- **DB re-seed**: Delete `data/leadkey.db` to regenerate from schema+seed. WAL mode files (`.db-wal`, `.db-shm`) also get recreated.
- **No build step**: Frontend CSS/JS are plain files, no bundler or transpiler.
