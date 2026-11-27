import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const TS = `created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))`;

// Ordered, append-only migrations. Never edit an applied one — add a new entry.
export const MIGRATIONS = [
  {
    name: '001_init',
    sql: `
CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  country TEXT,
  logo TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  ${TS}
);

CREATE TABLE models (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  body_type TEXT,
  image TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  ${TS},
  UNIQUE (brand_id, slug)
);
CREATE INDEX idx_models_brand ON models(brand_id);

-- A vehicle = one model + year range + trim + dashboard layout.
-- Dashboards differ by trim and year, so each combination is its own row.
CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY,
  model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  year_from INTEGER NOT NULL,
  year_to INTEGER,
  trim_ar TEXT NOT NULL DEFAULT '',
  trim_en TEXT NOT NULL DEFAULT '',
  dash_code TEXT NOT NULL DEFAULT '',
  dash_ar TEXT NOT NULL DEFAULT '',
  dash_en TEXT NOT NULL DEFAULT '',
  oem_audio TEXT NOT NULL DEFAULT 'standard' CHECK (oem_audio IN ('standard','premium')),
  has_oem_camera INTEGER NOT NULL DEFAULT 0,
  has_360 INTEGER NOT NULL DEFAULT 0,
  has_sensors INTEGER NOT NULL DEFAULT 0,
  has_swc INTEGER NOT NULL DEFAULT 1,
  exterior_img TEXT,
  before_img TEXT,
  after_img TEXT,
  images_kind TEXT NOT NULL DEFAULT 'illustrative' CHECK (images_kind IN ('real','illustrative')),
  video_url TEXT,
  notes_ar TEXT NOT NULL DEFAULT '',
  notes_en TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  ${TS},
  CHECK (year_to IS NULL OR year_to >= year_from)
);
CREATE INDEX idx_vehicles_model ON vehicles(model_id);
CREATE INDEX idx_vehicles_years ON vehicles(model_id, year_from, year_to);

CREATE TABLE screens (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  model_code TEXT NOT NULL,
  size_in REAL NOT NULL,
  os TEXT NOT NULL DEFAULT 'Android',
  os_version TEXT NOT NULL DEFAULT '',
  cpu TEXT NOT NULL DEFAULT '',
  ram_gb INTEGER NOT NULL DEFAULT 0,
  rom_gb INTEGER NOT NULL DEFAULT 0,
  resolution TEXT NOT NULL DEFAULT '',
  panel TEXT NOT NULL DEFAULT '',
  wifi INTEGER NOT NULL DEFAULT 1,
  bluetooth INTEGER NOT NULL DEFAULT 1,
  gps INTEGER NOT NULL DEFAULT 1,
  sim4g INTEGER NOT NULL DEFAULT 0,
  carplay TEXT NOT NULL DEFAULT 'none' CHECK (carplay IN ('none','wired','wireless')),
  android_auto TEXT NOT NULL DEFAULT 'none' CHECK (android_auto IN ('none','wired','wireless')),
  rear_cam INTEGER NOT NULL DEFAULT 1,
  cam360 INTEGER NOT NULL DEFAULT 0,
  dsp INTEGER NOT NULL DEFAULT 0,
  audio_ar TEXT NOT NULL DEFAULT '',
  audio_en TEXT NOT NULL DEFAULT '',
  price REAL,
  sale_price REAL,
  offer_ar TEXT NOT NULL DEFAULT '',
  offer_en TEXT NOT NULL DEFAULT '',
  warranty_months INTEGER NOT NULL DEFAULT 12,
  image TEXT,
  image_kind TEXT NOT NULL DEFAULT 'illustrative' CHECK (image_kind IN ('real','illustrative')),
  desc_ar TEXT NOT NULL DEFAULT '',
  desc_en TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  ${TS}
);
CREATE INDEX idx_screens_pub ON screens(published, created_at);

-- Compatibility between a screen and a vehicle. Only rows with verified = 1
-- are ever shown on the public site (quality & honesty requirement).
CREATE TABLE compat (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  screen_id INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('compatible','modified','incompatible')),
  frame TEXT NOT NULL DEFAULT '',
  harness TEXT NOT NULL DEFAULT '',
  canbus TEXT NOT NULL DEFAULT '',
  swc TEXT NOT NULL DEFAULT 'supported' CHECK (swc IN ('supported','adapter','unsupported','na')),
  camera TEXT NOT NULL DEFAULT '',
  sensors TEXT NOT NULL DEFAULT '',
  oem_audio TEXT NOT NULL DEFAULT '',
  mods_ar TEXT NOT NULL DEFAULT '',
  mods_en TEXT NOT NULL DEFAULT '',
  install_price REAL,
  frame_price REAL,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at TEXT,
  ${TS},
  UNIQUE (vehicle_id, screen_id)
);
CREATE INDEX idx_compat_vehicle ON compat(vehicle_id, verified);
CREATE INDEX idx_compat_screen ON compat(screen_id, verified);

CREATE TABLE media (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
  screen_id INTEGER REFERENCES screens(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'image' CHECK (type IN ('image','video')),
  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'real' CHECK (kind IN ('real','illustrative')),
  caption_ar TEXT NOT NULL DEFAULT '',
  caption_en TEXT NOT NULL DEFAULT '',
  in_gallery INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  ${TS}
);
CREATE INDEX idx_media_vehicle ON media(vehicle_id);
CREATE INDEX idx_media_screen ON media(screen_id);
CREATE INDEX idx_media_gallery ON media(in_gallery, created_at);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','editor','sales')),
  active INTEGER NOT NULL DEFAULT 1,
  ${TS}
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  brand_text TEXT NOT NULL DEFAULT '',
  model_text TEXT NOT NULL DEFAULT '',
  year INTEGER,
  trim_text TEXT NOT NULL DEFAULT '',
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  screen_id INTEGER REFERENCES screens(id) ON DELETE SET NULL,
  region TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT 'supply_install' CHECK (service IN ('supply','supply_install','install','quote')),
  photo TEXT,
  notes TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'ar',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','quoted','booked','done','cancelled')),
  admin_notes TEXT NOT NULL DEFAULT '',
  ${TS}
);
CREATE INDEX idx_orders_status ON orders(status, created_at);
CREATE INDEX idx_orders_vehicle ON orders(vehicle_id);
CREATE INDEX idx_orders_screen ON orders(screen_id);

CREATE TABLE articles (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  excerpt_ar TEXT NOT NULL DEFAULT '',
  excerpt_en TEXT NOT NULL DEFAULT '',
  body_ar TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  cover TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  ${TS}
);

CREATE TABLE faqs (
  id INTEGER PRIMARY KEY,
  q_ar TEXT NOT NULL,
  q_en TEXT NOT NULL,
  a_ar TEXT NOT NULL,
  a_en TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  ${TS}
);

CREATE TABLE search_log (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  model_id INTEGER REFERENCES models(id) ON DELETE SET NULL,
  year INTEGER,
  results INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_search_created ON search_log(created_at);
CREATE INDEX idx_search_model ON search_log(model_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
`,
  },
];

let db;

export function openDb(file = config.dbPath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(d);
  return d;
}

export function migrate(d) {
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const done = new Set(d.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue;
    d.exec('BEGIN');
    try {
      d.exec(m.sql);
      d.prepare('INSERT INTO schema_migrations(name) VALUES (?)').run(m.name);
      d.exec('COMMIT');
    } catch (e) {
      d.exec('ROLLBACK');
      throw e;
    }
  }
}

export function getDb() {
  if (!db) db = openDb();
  return db;
}

export function setDb(d) {
  db = d;
}

export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const r = fn(d);
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function getSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

export const DEFAULT_SETTINGS = {
  company_ar: 'أفلون لشاشات السيارات',
  company_en: 'Avlon Car Screens',
  tagline_ar: 'شاشات Android خارجية لسيارتك — اختر، شاهد الفرق، واطلب التركيب',
  tagline_en: 'Aftermarket Android screens for your car — choose, see the difference, book installation',
  phone: '',
  whatsapp: '',
  email: '',
  address_ar: '',
  address_en: '',
  hours_ar: '',
  hours_en: '',
  currency_ar: 'ر.س',
  currency_en: 'SAR',
  hero_image: '/img/hero.svg',
  hero_kind: 'illustrative',
  about_ar: '',
  about_en: '',
  regions: 'الرياض,جدة,الدمام,مكة المكرمة,المدينة المنورة,القصيم,أبها,تبوك',
};
