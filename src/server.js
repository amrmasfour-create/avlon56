import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, ROOT } from './config.js';
import { getDb } from './db.js';
import { seed } from './seed.js';
import { Router, HttpError, applySecurityHeaders, sendJson, serveStatic, sendHtml } from './http.js';
import { registerPublic, renderNotFound } from './routes/public.js';
import { registerAdmin } from './routes/admin.js';

export function createApp() {
  const router = new Router();
  registerAdmin(router);
  registerPublic(router);
  const publicDir = path.join(ROOT, 'public');
  const uploadsPublic = path.join(config.uploadDir, 'public');

  return async function handle(req, res) {
    applySecurityHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    const ctx = { req, res, url, params: {} };
    try {
      const p = url.pathname;
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (/^\/(css|js|img|admin\/assets)\//.test(p) && serveStatic(req, res, publicDir, p, { maxAge: 86400 })) return;
        if (p === '/favicon.ico' && serveStatic(req, res, publicDir, '/img/favicon.svg')) return;
        // Only /uploads/public is web-served. Customer photos live in /uploads/private.
        if (p.startsWith('/uploads/public/') && serveStatic(req, res, uploadsPublic, p.slice('/uploads/public'.length), { maxAge: 604800 })) return;
      }
      const m = router.match(req.method, p);
      if (!m) throw new HttpError(404, 'Not found');
      ctx.params = m.params;
      for (const h of m.route.handlers) await h(ctx);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (res.headersSent) return res.end();
      const wantsJson = url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/');
      if (wantsJson) return sendJson(res, status, { error: status === 500 ? 'Server error' : e.message, ...(e.details ? { errors: e.details } : {}) });
      if (status === 404) return renderNotFound(ctx);
      sendHtml(res, status, `<!doctype html><meta charset="utf-8"><title>${status}</title><p style="font-family:sans-serif">Error ${status}</p>`);
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = getDb();
  seed(db); // idempotent: ensures settings, first admin, base brands/models
  const server = http.createServer(createApp());
  server.requestTimeout = 120000;
  server.listen(config.port, config.host, () => {
    console.log(`Avlon running → http://localhost:${config.port}  (admin: /admin)`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
