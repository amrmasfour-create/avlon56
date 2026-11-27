import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { HttpError } from './http.js';

// Detect type from magic bytes — never trust the client-supplied name or MIME.
export function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', kind: 'image' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', kind: 'image' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', kind: 'image' };
  if (buf.toString('ascii', 4, 8) === 'ftyp') return { ext: 'mp4', kind: 'video' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { ext: 'webm', kind: 'video' };
  return null;
}

/**
 * Save a buffer under uploads/<sub>/. `sub` is 'public' (served at /uploads/public/...)
 * or 'private' (customer order photos — only served through authenticated admin routes).
 */
export function saveUpload(buf, { sub = 'public', allow = ['image'], maxImage = config.maxImageBytes, maxVideo = config.maxVideoBytes } = {}) {
  const t = sniff(buf);
  if (!t || !allow.includes(t.kind)) throw new HttpError(415, allow.includes('video') ? 'Only JPG, PNG, WEBP, MP4 or WEBM files' : 'Only JPG, PNG or WEBP images');
  if (t.kind === 'image' && buf.length > maxImage) throw new HttpError(413, 'Image too large');
  if (t.kind === 'video' && buf.length > maxVideo) throw new HttpError(413, 'Video too large');
  const month = new Date().toISOString().slice(0, 7);
  const dir = path.join(config.uploadDir, sub, month);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}.${t.ext}`;
  fs.writeFileSync(path.join(dir, name), buf, { mode: 0o640 });
  return { url: `/uploads/${sub}/${month}/${name}`, kind: t.kind };
}

/** Decode a data: URL (used by the public order form) into a Buffer. */
export function fromDataUrl(s, max) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(s || ''));
  if (!m) throw new HttpError(400, 'Invalid image data');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > max) throw new HttpError(413, 'Image too large');
  return buf;
}

export function privatePath(url) {
  const prefix = '/uploads/private/';
  if (!url || !url.startsWith(prefix) || url.includes('..')) return null;
  return path.join(config.uploadDir, 'private', url.slice(prefix.length));
}
