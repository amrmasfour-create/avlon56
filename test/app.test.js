import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

// Isolated DB + uploads for the test run (must be set before importing app modules).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avlon-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.ADMIN_PASSWORD = 'admin-password-123';

const { getDb } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { createApp } = await import('../src/server.js');
const { validate, compatRules, normalizeDigits } = await import('../src/validate.js');
const { hashPassword } = await import('../src/auth.js');

let server;
let base;

before(async () => {
  const db = getDb();
  seed(db, { demo: true, log: () => {} });
  db.prepare('INSERT INTO users(username, name, pass_hash, role) VALUES (?,?,?,?)').run('editor1', 'Ed', hashPassword('editor-password-1'), 'editor');
  db.prepare('INSERT INTO users(username, name, pass_hash, role) VALUES (?,?,?,?)').run('sales1', 'Sa', hashPassword('sales-password-1'), 'sales');
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function req(p, { method = 'GET', body, cookie, csrf, headers = {} } = {}) {
  const res = await fetch(base + p, {
    method,
    redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, text, json, headers: res.headers };
}

async function loginAs(username, password) {
  const r = await req('/admin/api/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, `login ${username}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const me = await req('/admin/api/me', { cookie });
  return { cookie, csrf: me.json.csrf };
}

// ---------- unit ----------
test('phone validation accepts Arabic-Indic digits and rejects junk', () => {
  assert.equal(normalizeDigits('٠٥٥١٢٣٤٥٦٧'), '0551234567');
  const spec = { phone: { type: 'phone', required: true } };
  assert.equal(validate(spec, { phone: '٠٥٥ ١٢٣ ٤٥٦٧' }).data.phone, '0551234567');
  assert.equal(validate(spec, { phone: 'call me' }).ok, false);
  assert.equal(validate(spec, {}).errors.phone, 'required');
});

test('compatibility rules: modified needs modifications, verified needs frame & harness', () => {
  assert.ok(compatRules({ status: 'modified', mods_ar: '' }).mods_ar);
  const e = compatRules({ status: 'compatible', verified: 1, frame: '', harness: '' });
  assert.ok(e.frame && e.harness);
  assert.deepEqual(compatRules({ status: 'incompatible', verified: 1 }), {});
  assert.deepEqual(compatRules({ status: 'compatible', verified: 1, frame: 'F', harness: 'H' }), {});
});

// ---------- public ----------
test('public pages render in both languages with correct direction', async () => {
  const ar = await req('/ar');
  assert.equal(ar.status, 200);
  assert.match(ar.text, /<html lang="ar" dir="rtl">/);
  const en = await req('/en/screens');
  assert.match(en.text, /<html lang="en" dir="ltr">/);
  assert.match(en.text, /hreflang="ar"/);
  assert.equal((await req('/fr')).status, 404);
});

test('unverified compatibility is never shown publicly', async () => {
  const db = getDb();
  const v = db.prepare("SELECT id, slug FROM vehicles WHERE slug LIKE 'kia-cerato%'").get();
  const s = db.prepare("SELECT id FROM screens WHERE slug = 'av-13-ultra'").get();
  db.prepare("INSERT INTO compat(vehicle_id, screen_id, status, frame, harness, verified) VALUES (?, ?, 'compatible', 'f', 'h', 0)").run(v.id, s.id);
  const page = await req(`/ar/car/${v.slug}`);
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.text, /av-13-ultra/);
  db.prepare('UPDATE compat SET verified = 1 WHERE vehicle_id = ? AND screen_id = ?').run(v.id, s.id);
  assert.match((await req(`/ar/car/${v.slug}`)).text, /av-13-ultra/);
});

test('illustrative images are labelled on the page', async () => {
  const v = getDb().prepare('SELECT slug FROM vehicles LIMIT 1').get();
  const page = await req(`/ar/car/${v.slug}`);
  assert.match(page.text, /صورة توضيحية/);
});

test('finder redirects to the car page on a single match and logs the search', async () => {
  const r = await req('/ar/find?brand=hyundai&model=elantra&year=2018');
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /^\/ar\/car\/hyundai-elantra-2016-2020/);
  const multi = await req('/ar/find?brand=toyota&model=camry&year=2020');
  assert.equal(multi.status, 200); // two trims → choose dashboard variant
  const none = await req('/ar/find?brand=bmw&model=x5');
  assert.match(none.text, /لم نجد هذه السيارة/);
  assert.ok(getDb().prepare('SELECT COUNT(*) n FROM search_log WHERE results = 0').get().n >= 1);
});

test('orders: validation, creation, private photo storage', async () => {
  const bad = await req('/api/orders', { method: 'POST', body: { name: 'A', phone: 'x' } });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.errors.phone && bad.json.errors.region);

  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  const ok = await req('/api/orders', {
    method: 'POST',
    body: { name: 'محمد', phone: '0551234567', brand_text: 'Toyota', model_text: 'Camry', year: 2020, region: 'الرياض', service: 'supply_install', lang: 'ar', photo: `data:image/png;base64,${png.toString('base64')}` },
  });
  assert.equal(ok.status, 201);
  assert.match(ok.json.ref, /^AV-\d{6}-[0-9A-F]{6}$/);
  const row = getDb().prepare('SELECT * FROM orders WHERE ref = ?').get(ok.json.ref);
  assert.match(row.photo, /^\/uploads\/private\//);
  // customer photo is not publicly reachable
  assert.equal((await req(row.photo)).status, 404);
  assert.equal((await req(`/admin/api/orders/${row.id}/photo`)).status, 401);
  const admin = await loginAs('admin', 'admin-password-123');
  const photo = await fetch(`${base}/admin/api/orders/${row.id}/photo`, { headers: { Cookie: admin.cookie } });
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/png');

  const fake = await req('/api/orders', { method: 'POST', body: { name: 'محمد', phone: '0551234567', brand_text: 'x', model_text: 'y', year: 2020, region: 'r', photo: `data:image/png;base64,${Buffer.from('<script>alert(1)</script>xx').toString('base64')}` } });
  assert.equal(fake.status, 422);
});

// ---------- admin / security ----------
test('admin API requires auth, CSRF and correct role', async () => {
  assert.equal((await req('/admin/api/r/orders')).status, 401);
  assert.equal((await req('/admin/api/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } })).status, 401);

  const admin = await loginAs('admin', 'admin-password-123');
  // missing CSRF header → 403
  assert.equal((await req('/admin/api/r/brands', { method: 'POST', cookie: admin.cookie, body: { name_ar: 'س', name_en: 'Test' } })).status, 403);
  const created = await req('/admin/api/r/brands', { method: 'POST', cookie: admin.cookie, csrf: admin.csrf, body: { name_ar: 'تجربة', name_en: 'Test Brand' } });
  assert.equal(created.status, 201);
  assert.equal(created.json.slug, 'test-brand');
  // duplicate slug → 409
  assert.equal((await req('/admin/api/r/brands', { method: 'POST', cookie: admin.cookie, csrf: admin.csrf, body: { name_ar: 'تجربة', name_en: 'Test Brand' } })).status, 409);

  const users = await req('/admin/api/r/users', { cookie: admin.cookie });
  assert.equal(users.status, 200);
  assert.ok(users.json.rows.every((u) => !('pass_hash' in u)));

  const sales = await loginAs('sales1', 'sales-password-1');
  assert.equal((await req('/admin/api/r/orders', { cookie: sales.cookie })).status, 200);
  assert.equal((await req('/admin/api/r/brands', { method: 'POST', cookie: sales.cookie, csrf: sales.csrf, body: { name_ar: 'x', name_en: 'x' } })).status, 403);
  assert.equal((await req('/admin/api/r/users', { cookie: sales.cookie })).status, 403);
  assert.equal((await req('/admin/api/settings', { cookie: sales.cookie })).status, 403);

  const editor = await loginAs('editor1', 'editor-password-1');
  assert.equal((await req('/admin/api/r/orders', { cookie: editor.cookie })).status, 403);
  assert.equal((await req('/admin/api/r/screens', { cookie: editor.cookie })).status, 200);
});

test('admin: verifying compatibility enforces technical details and records the verifier', async () => {
  const editor = await loginAs('editor1', 'editor-password-1');
  const db = getDb();
  const v = db.prepare("SELECT id FROM vehicles WHERE slug LIKE 'mg-zs%'").get();
  const s = db.prepare("SELECT id FROM screens WHERE slug = 'av-13-ultra'").get();
  const bad = await req('/admin/api/r/compat', { method: 'POST', cookie: editor.cookie, csrf: editor.csrf, body: { vehicle_id: v.id, screen_id: s.id, status: 'compatible', verified: true } });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.errors.frame);
  const ok = await req('/admin/api/r/compat', { method: 'POST', cookie: editor.cookie, csrf: editor.csrf, body: { vehicle_id: v.id, screen_id: s.id, status: 'compatible', frame: 'F13', harness: 'H', verified: true } });
  assert.equal(ok.status, 201);
  const row = db.prepare('SELECT verified, verified_by FROM compat WHERE id = ?').get(ok.json.id);
  assert.equal(row.verified, 1);
  assert.equal(row.verified_by, db.prepare("SELECT id FROM users WHERE username = 'editor1'").get().id);
});

test('uploads are type-checked by content, not name', async () => {
  const admin = await loginAs('admin', 'admin-password-123');
  const r = await fetch(`${base}/admin/api/upload?kind=image`, { method: 'POST', headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf, 'Content-Type': 'image/png' }, body: '<svg onload=alert(1)>' });
  assert.equal(r.status, 415);
});

test('sitemap and robots', async () => {
  const sm = await req('/sitemap.xml');
  assert.equal(sm.status, 200);
  assert.match(sm.text, /<loc>http:\/\/localhost:3000\/ar\/car\//);
  assert.match((await req('/robots.txt')).text, /Disallow: \/admin/);
});
