import crypto from 'node:crypto';
import { getDb } from './db.js';
import { config } from './config.js';
import { HttpError, parseCookies, setCookie } from './http.js';

const SESSION_COOKIE = 'avl_sid';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Dummy hash so failed lookups take the same time as real verifications.
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

export function login(res, username, password) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(String(username || '').trim().toLowerCase());
  const ok = verifyPassword(String(password || ''), user ? user.pass_hash : DUMMY_HASH);
  if (!user || !ok) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 864e5).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessions(id, user_id, csrf, expires_at) VALUES (?,?,?,?)').run(sha256(token), user.id, csrf, expires);
  setCookie(res, SESSION_COOKIE, token, { maxAge: config.sessionDays * 86400 });
  return publicUser(user);
}

export function logout(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token));
  setCookie(res, SESSION_COOKIE, '', { maxAge: 0 });
}

export function currentSession(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT s.csrf, s.expires_at, u.id, u.username, u.name, u.role, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .get(sha256(token));
  if (!row || !row.active || row.expires_at < new Date().toISOString()) return null;
  return { user: publicUser(row), csrf: row.csrf };
}

export function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role };
}

// Role → permissions. admin: everything. editor: catalog & content. sales: orders.
export const PERMISSIONS = {
  admin: ['catalog', 'verify', 'content', 'orders', 'stats', 'users', 'settings'],
  editor: ['catalog', 'verify', 'content', 'stats'],
  sales: ['orders', 'stats', 'catalog:read'],
};

export function can(user, perm) {
  if (!user) return false;
  const p = PERMISSIONS[user.role] || [];
  return p.includes(perm) || (perm.endsWith(':read') && p.includes(perm.split(':')[0]));
}

/** Require an authenticated session; for mutating methods also require the CSRF header. */
export function requireAuth(ctx, perm) {
  const s = currentSession(ctx.req);
  if (!s) throw new HttpError(401, 'Not signed in');
  if (!['GET', 'HEAD'].includes(ctx.req.method)) {
    const sent = String(ctx.req.headers['x-csrf-token'] || '');
    const a = Buffer.from(sent);
    const b = Buffer.from(s.csrf);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(403, 'Invalid CSRF token');
  }
  if (perm && !can(s.user, perm)) throw new HttpError(403, 'Forbidden');
  ctx.user = s.user;
  ctx.csrf = s.csrf;
  return s.user;
}

// Simple fixed-window in-memory rate limiter.
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 10000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  b.count++;
  if (b.count > max) throw new HttpError(429, 'Too many requests');
}
