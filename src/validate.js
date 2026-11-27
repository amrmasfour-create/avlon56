// Tiny Zod-like validator: every input is validated at the server boundary.
// Field spec: { type, required, max, min, values, pattern }
// types: str, text, int, num, bool, enum, slug, url, media, phone, year

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA_RE = /^\/(uploads|img)\/[A-Za-z0-9._\-/]+$/;
const YT_RE = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[A-Za-z0-9_-]{6,15}([&?#].*)?$/;

export function validate(spec, input, { partial = false } = {}) {
  const out = {};
  const errors = {};
  for (const [name, f] of Object.entries(spec)) {
    if (f.readonly) continue;
    let v = input?.[name];
    const missing = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (missing) {
      if (partial && v === undefined) continue;
      if (f.required) { errors[name] = 'required'; continue; }
      if (f.type === 'bool') out[name] = 0;
      else if (['str', 'text'].includes(f.type)) out[name] = f.nullable ? null : '';
      else out[name] = f.default !== undefined ? f.default : null;
      continue;
    }
    try {
      out[name] = coerce(f, v);
    } catch (e) {
      errors[name] = e.message;
    }
  }
  return { ok: Object.keys(errors).length === 0, data: out, errors };
}

function coerce(f, v) {
  switch (f.type) {
    case 'str':
    case 'text': {
      const s = String(v).trim();
      const max = f.max ?? (f.type === 'str' ? 200 : 20000);
      if (s.length > max) throw new Error(`max ${max} chars`);
      if (f.min && s.length < f.min) throw new Error(`min ${f.min} chars`);
      if (f.pattern && !f.pattern.test(s)) throw new Error('invalid format');
      return s;
    }
    case 'slug': {
      const s = String(v).trim().toLowerCase();
      if (!SLUG_RE.test(s) || s.length > 120) throw new Error('slug: a-z, 0-9 and dashes only');
      return s;
    }
    case 'int':
    case 'year': {
      const n = Number(v);
      if (!Number.isInteger(n)) throw new Error('must be an integer');
      const min = f.type === 'year' ? 1950 : f.min;
      const max = f.type === 'year' ? new Date().getFullYear() + 2 : f.max;
      if (min !== undefined && n < min) throw new Error(`min ${min}`);
      if (max !== undefined && n > max) throw new Error(`max ${max}`);
      return n;
    }
    case 'num': {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error('must be a number');
      if (f.min !== undefined && n < f.min) throw new Error(`min ${f.min}`);
      if (f.max !== undefined && n > f.max) throw new Error(`max ${f.max}`);
      return n;
    }
    case 'bool':
      return v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0;
    case 'enum': {
      const s = String(v);
      if (!f.values.includes(s)) throw new Error(`one of: ${f.values.join(', ')}`);
      return s;
    }
    case 'media': {
      const s = String(v).trim();
      if (!MEDIA_RE.test(s) || s.includes('..')) throw new Error('must be an uploaded file path');
      return s;
    }
    case 'video': {
      const s = String(v).trim();
      if (YT_RE.test(s) || (MEDIA_RE.test(s) && /\.(mp4|webm)$/i.test(s) && !s.includes('..'))) return s;
      throw new Error('YouTube link or uploaded mp4/webm');
    }
    case 'phone': {
      const s = String(v).replace(/[\s\-()]/g, '');
      const normalized = normalizeDigits(s);
      if (!/^\+?\d{8,15}$/.test(normalized)) throw new Error('invalid phone');
      return normalized;
    }
    default:
      throw new Error('unknown field type');
  }
}

/** Convert Arabic-Indic / Persian digits to ASCII. */
export function normalizeDigits(s) {
  return String(s)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function youtubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{6,15})/);
  return m ? m[1] : null;
}

/** Business rules for a compatibility record (quality & honesty requirement). */
export function compatRules(c) {
  const errors = {};
  if (c.status === 'modified' && !c.mods_ar?.trim()) errors.mods_ar = 'required when status is "compatible with modifications"';
  if (c.verified && c.status !== 'incompatible') {
    if (!c.frame?.trim()) errors.frame = 'required before marking verified';
    if (!c.harness?.trim()) errors.harness = 'required before marking verified';
  }
  return errors;
}
