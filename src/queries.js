import { getDb } from './db.js';

const db = () => getDb();

export const VEHICLE_SELECT = `
  SELECT v.*, m.slug AS model_slug, m.name_ar AS model_ar, m.name_en AS model_en,
         b.id AS brand_id, b.slug AS brand_slug, b.name_ar AS brand_ar, b.name_en AS brand_en
  FROM vehicles v JOIN models m ON m.id = v.model_id JOIN brands b ON b.id = m.brand_id`;

export function brands({ featured } = {}) {
  return db()
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM models m WHERE m.brand_id = b.id) AS model_count,
              (SELECT COUNT(*) FROM vehicles v JOIN models m ON m.id = v.model_id WHERE m.brand_id = b.id AND v.published = 1) AS vehicle_count
       FROM brands b ${featured ? 'WHERE b.featured = 1' : ''} ORDER BY b.sort, b.name_en`,
    )
    .all();
}

export const brandBySlug = (slug) => db().prepare('SELECT * FROM brands WHERE slug = ?').get(slug);

export function modelsOfBrand(brandId) {
  return db()
    .prepare(
      `SELECT m.*, MIN(v.year_from) AS year_min, MAX(COALESCE(v.year_to, strftime('%Y','now'))) AS year_max,
              COUNT(v.id) AS vehicle_count
       FROM models m LEFT JOIN vehicles v ON v.model_id = m.id AND v.published = 1
       WHERE m.brand_id = ? GROUP BY m.id ORDER BY m.name_en`,
    )
    .all(brandId);
}

export const modelBySlug = (brandId, slug) => db().prepare('SELECT * FROM models WHERE brand_id = ? AND slug = ?').get(brandId, slug);

export function vehiclesOfModel(modelId) {
  return db().prepare(`${VEHICLE_SELECT} WHERE v.model_id = ? AND v.published = 1 ORDER BY v.year_from DESC, v.trim_en`).all(modelId);
}

/** Years available for a model (expanded from year ranges). */
export function yearsOfModel(modelId) {
  const now = new Date().getFullYear();
  const set = new Set();
  for (const v of db().prepare('SELECT year_from, year_to FROM vehicles WHERE model_id = ? AND published = 1').all(modelId)) {
    for (let y = v.year_from; y <= (v.year_to || now); y++) set.add(y);
  }
  return [...set].sort((a, b) => b - a);
}

export function findVehicles(modelId, year) {
  return db()
    .prepare(`${VEHICLE_SELECT} WHERE v.model_id = ? AND v.published = 1 AND v.year_from <= ? AND COALESCE(v.year_to, 9999) >= ? ORDER BY v.trim_en`)
    .all(modelId, year, year);
}

export const vehicleBySlug = (slug) => db().prepare(`${VEHICLE_SELECT} WHERE v.slug = ? AND v.published = 1`).get(slug);

export function featuredVehicles(limit = 8) {
  return db()
    .prepare(
      `${VEHICLE_SELECT} WHERE v.published = 1
       ORDER BY v.featured DESC, (SELECT COUNT(*) FROM search_log s WHERE s.model_id = v.model_id) DESC, v.id DESC LIMIT ?`,
    )
    .all(limit);
}

/** Verified compatibility rows only — unverified records never reach the public site. */
export function compatForVehicle(vehicleId) {
  return db()
    .prepare(
      `SELECT c.*, s.slug AS screen_slug, s.name_ar, s.name_en, s.model_code, s.size_in, s.os_version, s.cpu, s.ram_gb, s.rom_gb, s.resolution,
              s.carplay, s.android_auto, s.dsp, s.cam360, s.price, s.sale_price, s.warranty_months, s.image, s.image_kind
       FROM compat c JOIN screens s ON s.id = c.screen_id
       WHERE c.vehicle_id = ? AND c.verified = 1 AND s.published = 1
       ORDER BY CASE c.status WHEN 'compatible' THEN 0 WHEN 'modified' THEN 1 ELSE 2 END, COALESCE(s.sale_price, s.price)`,
    )
    .all(vehicleId);
}

export function compatForScreen(screenId) {
  return db()
    .prepare(
      `SELECT c.status, c.install_price, v.slug, v.year_from, v.year_to, v.trim_ar, v.trim_en, m.name_ar AS model_ar, m.name_en AS model_en,
              b.name_ar AS brand_ar, b.name_en AS brand_en
       FROM compat c JOIN vehicles v ON v.id = c.vehicle_id JOIN models m ON m.id = v.model_id JOIN brands b ON b.id = m.brand_id
       WHERE c.screen_id = ? AND c.verified = 1 AND v.published = 1 AND c.status != 'incompatible'
       ORDER BY b.name_en, m.name_en, v.year_from`,
    )
    .all(screenId);
}

export function mediaForVehicle(vehicleId) {
  return db().prepare('SELECT * FROM media WHERE vehicle_id = ? ORDER BY sort, id').all(vehicleId);
}

export function galleryMedia({ limit = 24, offset = 0 } = {}) {
  const rows = db()
    .prepare(
      `SELECT md.*, v.slug AS vehicle_slug, v.year_from, v.year_to, m.name_ar AS model_ar, m.name_en AS model_en, b.name_ar AS brand_ar, b.name_en AS brand_en
       FROM media md LEFT JOIN vehicles v ON v.id = md.vehicle_id LEFT JOIN models m ON m.id = v.model_id LEFT JOIN brands b ON b.id = m.brand_id
       WHERE md.in_gallery = 1 ORDER BY md.created_at DESC, md.id DESC LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);
  const total = db().prepare('SELECT COUNT(*) n FROM media WHERE in_gallery = 1').get().n;
  return { rows, total };
}

export function beforeAfterShowcase(limit = 3) {
  return db()
    .prepare(`${VEHICLE_SELECT} WHERE v.published = 1 AND v.before_img IS NOT NULL AND v.after_img IS NOT NULL ORDER BY v.images_kind = 'real' DESC, v.featured DESC, v.id DESC LIMIT ?`)
    .all(limit);
}

export const SCREEN_SORTS = {
  new: 's.created_at DESC, s.id DESC',
  price_asc: 'COALESCE(s.sale_price, s.price) IS NULL, COALESCE(s.sale_price, s.price) ASC',
  price_desc: 'COALESCE(s.sale_price, s.price) DESC',
};

export function searchScreens({ size, carplay, min_ram, max_price, dsp, cam360, sort = 'new', page = 1, perPage = 12 } = {}) {
  const where = ['s.published = 1'];
  const args = [];
  if (size) { where.push('s.size_in BETWEEN ? AND ?'); args.push(Number(size) - 0.5, Number(size) + 0.5); }
  if (carplay === 'wireless') where.push("s.carplay = 'wireless'");
  else if (carplay === 'any') where.push("s.carplay != 'none'");
  if (min_ram) { where.push('s.ram_gb >= ?'); args.push(Number(min_ram)); }
  if (max_price) { where.push('COALESCE(s.sale_price, s.price) <= ?'); args.push(Number(max_price)); }
  if (dsp) where.push('s.dsp = 1');
  if (cam360) where.push('s.cam360 = 1');
  const w = where.join(' AND ');
  const total = db().prepare(`SELECT COUNT(*) n FROM screens s WHERE ${w}`).get(...args).n;
  const rows = db()
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM compat c WHERE c.screen_id = s.id AND c.verified = 1 AND c.status != 'incompatible') AS car_count
       FROM screens s WHERE ${w} ORDER BY ${SCREEN_SORTS[sort] || SCREEN_SORTS.new} LIMIT ? OFFSET ?`,
    )
    .all(...args, perPage, (page - 1) * perPage);
  return { rows, total, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export const screenBySlug = (slug) => db().prepare('SELECT * FROM screens WHERE slug = ? AND published = 1').get(slug);

export function screenSizes() {
  return db().prepare('SELECT DISTINCT size_in FROM screens WHERE published = 1 ORDER BY size_in').all().map((r) => r.size_in);
}

export const faqs = () => db().prepare('SELECT * FROM faqs WHERE published = 1 ORDER BY sort, id').all();
export const articles = () => db().prepare('SELECT * FROM articles WHERE published = 1 ORDER BY created_at DESC, id DESC').all();
export const articleBySlug = (slug) => db().prepare('SELECT * FROM articles WHERE slug = ? AND published = 1').get(slug);

export function logSearch({ brand_id, model_id, year, results }) {
  db().prepare('INSERT INTO search_log(brand_id, model_id, year, results) VALUES (?,?,?,?)').run(brand_id ?? null, model_id ?? null, year ?? null, results);
}
