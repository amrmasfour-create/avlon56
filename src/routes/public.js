import crypto from 'node:crypto';
import { getDb, getSettings } from '../db.js';
import { config } from '../config.js';
import { LANGS, L, t } from '../i18n.js';
import { HttpError, parseBody, redirect, sendHtml, sendJson, clientIp } from '../http.js';
import { validate } from '../validate.js';
import { rateLimit } from '../auth.js';
import { saveUpload, fromDataUrl } from '../uploads.js';
import * as q from '../queries.js';
import * as P from '../views/pages.js';
import { layout, waLink } from '../views/layout.js';

function render(ctx, page, status = 200) {
  sendHtml(ctx.res, status, layout(ctx, page));
}

function withLang(handler, navKey) {
  return (ctx) => {
    const lang = ctx.params.lang;
    if (!LANGS.includes(lang)) throw new HttpError(404, 'Not found');
    ctx.lang = lang;
    ctx.navKey = navKey;
    ctx.settings = getSettings();
    return handler(ctx);
  };
}

export function renderNotFound(ctx) {
  const m = ctx.url.pathname.match(/^\/(ar|en)(\/|$)/);
  ctx.lang = m ? m[1] : 'ar';
  ctx.settings = getSettings();
  render(ctx, P.notFoundPage(ctx), 404);
}

const intParam = (v, def, min = 1, max = 10000) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
};

const ORDER_SPEC = {
  name: { type: 'str', required: true, min: 2, max: 100 },
  phone: { type: 'phone', required: true },
  brand_text: { type: 'str', required: true, max: 60 },
  model_text: { type: 'str', required: true, max: 60 },
  year: { type: 'year', required: true },
  trim_text: { type: 'str', max: 80 },
  vehicle_id: { type: 'int', min: 1 },
  screen_id: { type: 'int', min: 1 },
  region: { type: 'str', required: true, max: 80 },
  service: { type: 'enum', values: ['supply', 'supply_install', 'install', 'quote'], default: 'supply_install' },
  notes: { type: 'text', max: 1000 },
  lang: { type: 'enum', values: ['ar', 'en'], default: 'ar' },
};

export function registerPublic(r) {
  registerSeo(r);

  r.get('/', (ctx) => {
    const al = String(ctx.req.headers['accept-language'] || '');
    redirect(ctx.res, /^en/i.test(al) && !/ar/i.test(al.split(',')[0]) ? '/en' : '/ar');
  });

  r.get('/:lang', withLang((ctx) => {
    const brands = q.brands();
    const screens = q.searchScreens({ perPage: 6 }).rows;
    render(ctx, P.homePage(ctx, { brands, vehicles: q.featuredVehicles(8), screens, showcase: q.beforeAfterShowcase(2) }));
  }, 'home'));

  r.get('/:lang/brands', withLang((ctx) => render(ctx, P.brandsPage(ctx, { brands: q.brands() })), 'brands'));

  r.get('/:lang/brands/:brand', withLang((ctx) => {
    const brand = q.brandBySlug(ctx.params.brand);
    if (!brand) throw new HttpError(404, 'Not found');
    render(ctx, P.brandPage(ctx, { brand, models: q.modelsOfBrand(brand.id) }));
  }, 'brands'));

  r.get('/:lang/brands/:brand/:model', withLang((ctx) => {
    const brand = q.brandBySlug(ctx.params.brand);
    const model = brand && q.modelBySlug(brand.id, ctx.params.model);
    if (!model) throw new HttpError(404, 'Not found');
    render(ctx, P.modelPage(ctx, { brand, model, vehicles: q.vehiclesOfModel(model.id) }));
  }, 'brands'));

  // Finder: works without JS (stepwise GET), redirects straight to the car page on a single match.
  r.get('/:lang/find', withLang((ctx) => {
    const sp = ctx.url.searchParams;
    const sel = { brand: sp.get('brand') || '', model: sp.get('model') || '', year: sp.get('year') || '' };
    const brands = q.brands();
    const brand = sel.brand ? q.brandBySlug(sel.brand) : null;
    const models = brand ? q.modelsOfBrand(brand.id).filter((m) => m.vehicle_count > 0) : [];
    const model = brand && sel.model ? q.modelBySlug(brand.id, sel.model) : null;
    const years = model ? q.yearsOfModel(model.id) : [];
    const year = intParam(sel.year, null, 1950, 2100);
    let vehicles = [];
    let searched = false;
    if (model && year) {
      searched = true;
      vehicles = q.findVehicles(model.id, year);
      q.logSearch({ brand_id: brand.id, model_id: model.id, year, results: vehicles.length });
      if (vehicles.length === 1) return redirect(ctx.res, `/${ctx.lang}/car/${vehicles[0].slug}`);
    } else if (model && !years.length) {
      searched = true;
      q.logSearch({ brand_id: brand.id, model_id: model.id, year: null, results: 0 });
    }
    render(ctx, P.findPage(ctx, { brands, models, years, sel, brand, model, vehicles, searched }));
  }, 'find'));

  r.get('/:lang/car/:slug', withLang((ctx) => {
    const v = q.vehicleBySlug(ctx.params.slug);
    if (!v) throw new HttpError(404, 'Not found');
    render(ctx, P.carPage(ctx, { v, compat: q.compatForVehicle(v.id), media: q.mediaForVehicle(v.id) }));
  }, 'brands'));

  r.get('/:lang/screens', withLang((ctx) => {
    const sp = ctx.url.searchParams;
    const query = {
      size: sp.get('size') || '',
      carplay: ['any', 'wireless'].includes(sp.get('carplay')) ? sp.get('carplay') : '',
      min_ram: intParam(sp.get('min_ram'), '', 1, 64),
      max_price: intParam(sp.get('max_price'), '', 1, 1e7),
      dsp: sp.get('dsp') === '1' ? '1' : '',
      cam360: sp.get('cam360') === '1' ? '1' : '',
      sort: ['new', 'price_asc', 'price_desc'].includes(sp.get('sort')) ? sp.get('sort') : '',
      page: intParam(sp.get('page'), 1),
    };
    if (query.size && !Number.isFinite(Number(query.size))) query.size = '';
    const result = q.searchScreens({ ...query, sort: query.sort || 'new' });
    render(ctx, P.screensPage(ctx, { result, sizes: q.screenSizes(), q: query }));
  }, 'screens'));

  r.get('/:lang/screens/:slug', withLang((ctx) => {
    const s = q.screenBySlug(ctx.params.slug);
    if (!s) throw new HttpError(404, 'Not found');
    const media = getDb().prepare("SELECT * FROM media WHERE screen_id = ? AND type = 'image' ORDER BY sort, id").all(s.id);
    render(ctx, P.screenPage(ctx, { s, cars: q.compatForScreen(s.id), media }));
  }, 'screens'));

  r.get('/:lang/gallery', withLang((ctx) => {
    const page = intParam(ctx.url.searchParams.get('page'), 1);
    const per = 24;
    const { rows, total } = q.galleryMedia({ limit: per, offset: (page - 1) * per });
    render(ctx, P.galleryPage(ctx, { rows, total, page, pages: Math.max(1, Math.ceil(total / per)) }));
  }, 'gallery'));

  r.get('/:lang/about', withLang((ctx) => render(ctx, P.aboutPage(ctx)), 'about'));

  const orderData = (ctx) => {
    const sp = ctx.url.searchParams;
    const vid = intParam(sp.get('vehicle'), null);
    const vehicle = vid ? getDb().prepare(`${q.VEHICLE_SELECT} WHERE v.id = ? AND v.published = 1`).get(vid) : null;
    return {
      brands: q.brands(),
      screens: getDb().prepare('SELECT id, name_ar, name_en, size_in FROM screens WHERE published = 1 ORDER BY size_in, name_en').all(),
      pre: { vehicle, screen: intParam(sp.get('screen'), null), brand: (sp.get('brand') || '').slice(0, 60), model: (sp.get('model') || '').slice(0, 60), year: intParam(sp.get('year'), '', 1950, 2100) },
    };
  };
  r.get('/:lang/contact', withLang((ctx) => render(ctx, P.contactPage(ctx, orderData(ctx))), 'contact'));
  r.get('/:lang/order', withLang((ctx) => render(ctx, P.orderPage(ctx, orderData(ctx))), 'contact'));
  r.get('/:lang/faq', withLang((ctx) => render(ctx, P.faqPage(ctx, { faqs: q.faqs() }))));
  r.get('/:lang/articles', withLang((ctx) => render(ctx, P.articlesPage(ctx, { articles: q.articles() }))));
  r.get('/:lang/articles/:slug', withLang((ctx) => {
    const a = q.articleBySlug(ctx.params.slug);
    if (!a) throw new HttpError(404, 'Not found');
    render(ctx, P.articlePage(ctx, { a }));
  }));

  // ---------- public JSON API ----------
  r.get('/api/models', (ctx) => {
    const brand = q.brandBySlug(ctx.url.searchParams.get('brand') || '');
    if (!brand) return sendJson(ctx.res, 200, []);
    const lang = ctx.url.searchParams.get('lang') === 'en' ? 'en' : 'ar';
    const onlyListed = ctx.url.searchParams.get('listed') !== '0';
    sendJson(ctx.res, 200, q.modelsOfBrand(brand.id).filter((m) => !onlyListed || m.vehicle_count > 0).map((m) => ({ slug: m.slug, name: L(m, 'name', lang) })));
  });

  r.get('/api/years', (ctx) => {
    const sp = ctx.url.searchParams;
    const brand = q.brandBySlug(sp.get('brand') || '');
    const model = brand && q.modelBySlug(brand.id, sp.get('model') || '');
    sendJson(ctx.res, 200, model ? q.yearsOfModel(model.id) : []);
  });

  r.post('/api/orders', async (ctx) => {
    rateLimit(`order:${clientIp(ctx.req)}`, 8, 60 * 60 * 1000);
    const body = await parseBody(ctx.req, config.maxOrderPhotoBytes * 1.4 + 20000);
    if (body.website) return sendJson(ctx.res, 201, { ref: 'OK' }); // honeypot: silently drop bots
    const { ok, data, errors } = validate(ORDER_SPEC, body);
    if (!ok) return sendJson(ctx.res, 422, { error: 'validation', errors });
    const db = getDb();
    if (data.vehicle_id && !db.prepare('SELECT 1 FROM vehicles WHERE id = ?').get(data.vehicle_id)) data.vehicle_id = null;
    if (data.screen_id && !db.prepare('SELECT 1 FROM screens WHERE id = ?').get(data.screen_id)) data.screen_id = null;
    let photo = null;
    if (body.photo) {
      try {
        photo = saveUpload(fromDataUrl(body.photo, config.maxOrderPhotoBytes), { sub: 'private', allow: ['image'], maxImage: config.maxOrderPhotoBytes }).url;
      } catch (e) {
        return sendJson(ctx.res, 422, { error: 'validation', errors: { photo: e.message } });
      }
    }
    const ref = `AV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    db.prepare(
      `INSERT INTO orders(ref, name, phone, brand_text, model_text, year, trim_text, vehicle_id, screen_id, region, service, photo, notes, lang)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(ref, data.name, data.phone, data.brand_text, data.model_text, data.year, data.trim_text, data.vehicle_id, data.screen_id, data.region, data.service, photo, data.notes, data.lang);

    // Pre-filled WhatsApp follow-up for the customer to message the shop.
    const s = getSettings();
    const lang = data.lang;
    const screen = data.screen_id ? db.prepare('SELECT name_ar, name_en FROM screens WHERE id = ?').get(data.screen_id) : null;
    const lines = [
      `${t(lang, 'order_ok')}: ${ref}`,
      `${data.brand_text} ${data.model_text} ${data.year} ${data.trim_text}`.trim(),
      screen ? `${t(lang, 'screen_wanted')}: ${L(screen, 'name', lang)}` : '',
      `${t(lang, 'service')}: ${t(lang, `service_${data.service}`)}`,
    ].filter(Boolean);
    sendJson(ctx.res, 201, { ref, whatsapp: waLink(s, lines.join('\n')) });
  });


}


function registerSeo(r) {
  // ---------- SEO ----------
  r.get('/robots.txt', (ctx) => {
    ctx.res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    ctx.res.end(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /*/find?\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  });

  r.get('/sitemap.xml', (ctx) => {
    const db = getDb();
    const paths = ['', '/brands', '/find', '/screens', '/gallery', '/about', '/contact', '/faq', '/articles'].map((p) => [p, null]);
    for (const b of db.prepare('SELECT id, slug, updated_at FROM brands').all()) {
      paths.push([`/brands/${b.slug}`, b.updated_at]);
      for (const m of db.prepare('SELECT m.slug, m.updated_at FROM models m WHERE m.brand_id = ? AND EXISTS (SELECT 1 FROM vehicles v WHERE v.model_id = m.id AND v.published = 1)').all(b.id)) paths.push([`/brands/${b.slug}/${m.slug}`, m.updated_at]);
    }
    for (const v of db.prepare('SELECT slug, updated_at FROM vehicles WHERE published = 1').all()) paths.push([`/car/${v.slug}`, v.updated_at]);
    for (const s of db.prepare('SELECT slug, updated_at FROM screens WHERE published = 1').all()) paths.push([`/screens/${s.slug}`, s.updated_at]);
    for (const a of db.prepare('SELECT slug, updated_at FROM articles WHERE published = 1').all()) paths.push([`/articles/${a.slug}`, a.updated_at]);
    const xe = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const urls = paths.map(([p, mod]) => LANGS.map((lang) => `<url><loc>${xe(`${config.siteUrl}/${lang}${p}`)}</loc>${mod ? `<lastmod>${mod.slice(0, 10)}</lastmod>` : ''}${LANGS.map((l2) => `<xhtml:link rel="alternate" hreflang="${l2}" href="${xe(`${config.siteUrl}/${l2}${p}`)}"/>`).join('')}</url>`).join('')).join('\n');
    ctx.res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    ctx.res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>`);
  });
}
