import { html, raw, esc } from '../http.js';
import { t, L } from '../i18n.js';
import { config } from '../config.js';

export const url = (lang, p = '') => `/${lang}${p}`;

export function yearRange(v, lang) {
  return `${v.year_from}–${v.year_to || t(lang, 'present')}`;
}

export function vehicleTitle(v, lang) {
  return `${L(v, 'brand', lang)} ${L(v, 'model', lang)} ${yearRange(v, lang)}`;
}

export function money(n, s, lang) {
  if (n === null || n === undefined || n === '') return '';
  const cur = lang === 'en' ? s.currency_en : s.currency_ar;
  return `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur}`;
}

export function priceBlock(row, s, lang) {
  if (!row.price && !row.sale_price) return html`<span class="price muted">${t(lang, 'price_on_request')}</span>`;
  if (row.sale_price && row.price && row.sale_price < row.price) {
    return html`<span class="price"><strong>${money(row.sale_price, s, lang)}</strong> <del>${money(row.price, s, lang)}</del></span>`;
  }
  return html`<span class="price"><strong>${money(row.sale_price || row.price, s, lang)}</strong></span>`;
}

export function waNumber(s) {
  return String(s.whatsapp || '').replace(/\D/g, '');
}

export function waLink(s, text) {
  const n = waNumber(s);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

/** Image that always carries an explicit "illustrative" label when it is not a real photo. */
export function figure(src, alt, kind, { cls = '', lang, loading = 'lazy', w = 800, h = 500 } = {}) {
  if (!src) return '';
  return html`<figure class="media ${cls}">
    <img src="${src}" alt="${alt}" loading="${loading}" width="${w}" height="${h}" decoding="async">
    ${kind === 'illustrative' ? html`<span class="badge-illus">${t(lang, 'illustrative')}</span>` : ''}
  </figure>`;
}

export function beforeAfter(v, lang, { title } = {}) {
  if (!v.before_img || !v.after_img) return '';
  const alt = title || vehicleTitle(v, lang);
  return html`<div class="ba" dir="ltr" data-ba>
    <img class="ba-img" src="${v.after_img}" alt="${t(lang, 'after')} — ${alt}" width="1200" height="675" loading="lazy">
    <div class="ba-before"><img class="ba-img" src="${v.before_img}" alt="${t(lang, 'before')} — ${alt}" width="1200" height="675" loading="lazy"></div>
    <span class="ba-label ba-label-l">${t(lang, 'before')}</span>
    <span class="ba-label ba-label-r">${t(lang, 'after')}</span>
    <span class="ba-handle" aria-hidden="true"></span>
    <input class="ba-range" type="range" min="0" max="100" value="50" aria-label="${t(lang, 'drag_compare')}">
    ${v.images_kind === 'illustrative' ? html`<span class="badge-illus">${t(lang, 'illustrative')}</span>` : ''}
  </div>`;
}

export function statusBadge(status, lang) {
  return html`<span class="status status-${status}">${t(lang, `status_${status}`)}</span>`;
}

export function pager(lang, base, page, pages, query = {}) {
  if (pages <= 1) return '';
  const link = (p) => {
    const q = new URLSearchParams({ ...query, page: String(p) });
    return `${base}?${q}`;
  };
  return html`<nav class="pager" aria-label="${t(lang, 'page')}">
    ${page > 1 ? html`<a rel="prev" href="${link(page - 1)}">${t(lang, 'prev')}</a>` : ''}
    <span>${t(lang, 'page')} ${page} / ${pages}</span>
    ${page < pages ? html`<a rel="next" href="${link(page + 1)}">${t(lang, 'next')}</a>` : ''}
  </nav>`;
}

export function breadcrumbs(lang, items) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], ...(it[1] ? { item: config.siteUrl + it[1] } : {}) })),
  };
  return html`<nav class="crumbs" aria-label="breadcrumb"><ol>
    ${items.map(([name, href]) => html`<li>${href ? html`<a href="${href}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}
  </ol></nav>${jsonLd(ld)}`;
}

export function jsonLd(obj) {
  // Escape "<" so content can never close the script element.
  return raw(`<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`);
}

const LOGO = raw(`<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="8" width="34" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M10 24l6-8 5 6 4-4 5 6" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 34h12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`);
const WA_ICON = raw(`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3z"/></svg>`);
export { WA_ICON };

export function layout(ctx, { title, description, body, path: pagePath, noindex = false, ogImage, head = '' }) {
  const { lang, settings: s } = ctx;
  const other = lang === 'ar' ? 'en' : 'ar';
  const company = L({ company_ar: s.company_ar, company_en: s.company_en }, 'company', lang);
  const fullTitle = title ? `${title} | ${company}` : `${company} — ${L(s, 'tagline', lang)}`;
  const desc = description || L(s, 'tagline', lang);
  const canonical = `${config.siteUrl}/${lang}${pagePath}`;
  const altPath = `/${other}${pagePath}`;
  const wa = waLink(s, lang === 'ar' ? 'مرحباً، أريد الاستفسار عن شاشة لسيارتي' : 'Hello, I would like to ask about a screen for my car');
  const cur = (p) => (ctx.navKey === p ? 'aria-current="page"' : '');
  const nav = [
    ['home', url(lang, '/')],
    ['brands', url(lang, '/brands')],
    ['find', url(lang, '/find')],
    ['screens', url(lang, '/screens')],
    ['gallery', url(lang, '/gallery')],
    ['about', url(lang, '/about')],
    ['contact', url(lang, '/contact')],
  ];
  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" hreflang="${lang}" href="${esc(canonical)}">
<link rel="alternate" hreflang="${other}" href="${esc(config.siteUrl + altPath)}">
<link rel="alternate" hreflang="x-default" href="${esc(config.siteUrl + '/ar' + pagePath)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="${lang === 'ar' ? 'ar_SA' : 'en_US'}">
${ogImage ? `<meta property="og:image" content="${esc(config.siteUrl + ogImage)}">` : ''}
<meta name="theme-color" content="#0b1220">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css?v=1">
${head}
</head>
<body>
<a class="skip" href="#main">${lang === 'ar' ? 'تخطَّ إلى المحتوى' : 'Skip to content'}</a>
${s.demo_mode === '1' ? `<div class="demo-bar">${lang === 'ar' ? 'نسخة عرض: السيارات والشاشات والأسعار الحالية بيانات تجريبية.' : 'Preview build: current cars, screens and prices are demo data.'}</div>` : ''}
<header class="site-header">
  <div class="wrap header-row">
    <a class="logo" href="${url(lang, '/')}">${LOGO}<span>${esc(company)}</span></a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="main-nav"><span></span><span></span><span></span><span class="sr">${t(lang, 'menu')}</span></button>
    <nav id="main-nav" class="main-nav" aria-label="${t(lang, 'menu')}">
      <ul>${nav.map(([k, h]) => `<li><a href="${h}" ${cur(k)}>${esc(t(lang, k))}</a></li>`).join('')}</ul>
      <div class="nav-actions">
        <a class="lang-switch" href="${esc(altPath)}" hreflang="${other}" lang="${other}">${t(lang, 'switch_lang')}</a>
        <a class="btn btn-primary btn-sm" href="${url(lang, '/order')}">${t(lang, 'order')}</a>
      </div>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <a class="logo" href="${url(lang, '/')}">${LOGO}<span>${esc(company)}</span></a>
      <p class="muted">${t(lang, 'aftermarket_only')}</p>
    </div>
    <div>
      <h2 class="h6">${t(lang, 'menu')}</h2>
      <ul class="links">${nav.slice(1).map(([k, h]) => `<li><a href="${h}">${esc(t(lang, k))}</a></li>`).join('')}
        <li><a href="${url(lang, '/faq')}">${t(lang, 'faq')}</a></li><li><a href="${url(lang, '/articles')}">${t(lang, 'articles')}</a></li></ul>
    </div>
    <div>
      <h2 class="h6">${t(lang, 'contact_info')}</h2>
      <ul class="links">
        ${s.phone ? `<li><a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}" dir="ltr">${esc(s.phone)}</a></li>` : ''}
        ${s.email ? `<li><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : ''}
        ${L(s, 'address', lang) ? `<li>${esc(L(s, 'address', lang))}</li>` : ''}
        ${L(s, 'hours', lang) ? `<li>${esc(L(s, 'hours', lang))}</li>` : ''}
        ${wa ? `<li><a href="${esc(wa)}" target="_blank" rel="noopener">${t(lang, 'chat_whatsapp')}</a></li>` : ''}
      </ul>
    </div>
  </div>
  <div class="wrap copy muted">© ${new Date().getFullYear()} ${esc(company)} — ${t(lang, 'copyright')}</div>
</footer>
${wa ? `<a class="wa-float" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="${t(lang, 'chat_whatsapp')}">${WA_ICON}<span>${t(lang, 'whatsapp')}</span></a>` : ''}
<script src="/js/site.js?v=1" defer></script>
</body>
</html>`;
}
