import { html, raw } from '../http.js';
import { t, L } from '../i18n.js';
import { config } from '../config.js';
import { youtubeId } from '../validate.js';
import {
  url, yearRange, vehicleTitle, money, priceBlock, waLink, figure, beforeAfter, statusBadge, pager, breadcrumbs, jsonLd, WA_ICON,
} from './layout.js';

const yn = (v, lang) => t(lang, v ? 'yes' : 'no');
const linkMode = (v, lang) => (v === 'none' ? t(lang, 'none') : t(lang, v));

// ---------- shared fragments ----------

export function finderForm(ctx, { brands, models = [], years = [], sel = {}, compact = false }) {
  const { lang } = ctx;
  return html`<form class="finder ${compact ? 'finder-compact' : ''}" action="${url(lang, '/find')}" method="get" data-finder>
    <label><span>${t(lang, 'brand')}</span>
      <select name="brand" required data-f="brand">
        <option value="">${t(lang, 'choose_brand')}</option>
        ${brands.map((b) => html`<option value="${b.slug}" ${sel.brand === b.slug ? raw('selected') : ''}>${L(b, 'name', lang)}</option>`)}
      </select></label>
    <label><span>${t(lang, 'model')}</span>
      <select name="model" data-f="model" ${models.length ? '' : raw('disabled')}>
        <option value="">${t(lang, 'choose_model')}</option>
        ${models.map((m) => html`<option value="${m.slug}" ${sel.model === m.slug ? raw('selected') : ''}>${L(m, 'name', lang)}</option>`)}
      </select></label>
    <label><span>${t(lang, 'year')}</span>
      <select name="year" data-f="year" ${years.length ? '' : raw('disabled')}>
        <option value="">${t(lang, 'choose_year')}</option>
        ${years.map((y) => html`<option value="${y}" ${Number(sel.year) === y ? raw('selected') : ''}>${y}</option>`)}
      </select></label>
    <button class="btn btn-primary" type="submit">${t(lang, 'search')}</button>
  </form>`;
}

function vehicleCard(ctx, v) {
  const { lang } = ctx;
  return html`<a class="card vcard" href="${url(lang, `/car/${v.slug}`)}">
    ${figure(v.after_img || v.exterior_img || '/img/ph-exterior.svg', vehicleTitle(v, lang), v.images_kind, { lang, w: 640, h: 360 })}
    <div class="card-body">
      <h3 class="h5">${L(v, 'brand', lang)} ${L(v, 'model', lang)}</h3>
      <p class="muted">${yearRange(v, lang)}${L(v, 'trim', lang) ? ` · ${L(v, 'trim', lang)}` : ''}</p>
    </div>
  </a>`;
}

function screenCard(ctx, s) {
  const { lang, settings } = ctx;
  return html`<article class="card scard">
    <a href="${url(lang, `/screens/${s.slug}`)}">${figure(s.image || '/img/ph-screen.svg', L(s, 'name', lang), s.image_kind, { lang, w: 640, h: 400 })}</a>
    <div class="card-body">
      ${L(s, 'offer', lang) ? html`<span class="tag tag-offer">${L(s, 'offer', lang)}</span>` : ''}
      <h3 class="h5"><a href="${url(lang, `/screens/${s.slug}`)}">${L(s, 'name', lang)}</a></h3>
      <ul class="chips">
        <li>${s.size_in}″</li><li>${s.ram_gb}/${s.rom_gb} GB</li><li>Android ${s.os_version}</li>
        ${s.carplay !== 'none' ? html`<li>CarPlay ${t(lang, s.carplay)}</li>` : ''}
        ${s.dsp ? html`<li>DSP</li>` : ''}
      </ul>
      <div class="card-foot">${priceBlock(s, settings, lang)}
        <a class="btn btn-ghost btn-sm" href="${url(lang, `/screens/${s.slug}`)}">${t(lang, 'view_details')}</a></div>
    </div>
  </article>`;
}

// ---------- pages ----------

export function homePage(ctx, d) {
  const { lang, settings: s } = ctx;
  const wa = waLink(s, lang === 'ar' ? 'مرحباً، أريد معرفة الشاشات المناسبة لسيارتي' : 'Hello, which screens fit my car?');
  const body = html`
  <section class="hero">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">Android · CarPlay · Android Auto</p>
        <h1>${L(s, 'tagline', lang)}</h1>
        <p class="lead">${t(lang, 'aftermarket_only')}</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#finder">${t(lang, 'find')}</a>
          ${wa ? html`<a class="btn btn-wa" href="${wa}" target="_blank" rel="noopener">${WA_ICON} ${t(lang, 'chat_whatsapp')}</a>` : ''}
        </div>
      </div>
      ${figure(s.hero_image, lang === 'ar' ? 'تابلوه سيارة مزود بشاشة Android خارجية' : 'Car dashboard fitted with an aftermarket Android screen', s.hero_kind, { lang, cls: 'hero-media', loading: 'eager', w: 1200, h: 750 })}
    </div>
    <div class="wrap finder-card" id="finder">
      <h2 class="h4">${t(lang, 'find')}</h2>
      <p class="muted">${t(lang, 'search_hint')}</p>
      ${finderForm(ctx, { brands: d.brands })}
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <div class="section-head"><h2>${t(lang, 'popular_brands')}</h2><a href="${url(lang, '/brands')}">${t(lang, 'view_all')}</a></div>
      <ul class="brand-grid">
        ${d.brands.filter((b) => b.featured).map((b) => html`<li><a class="brand-tile" href="${url(lang, `/brands/${b.slug}`)}">
          ${b.logo ? html`<img src="${b.logo}" alt="" width="64" height="64" loading="lazy">` : html`<span class="brand-initial" aria-hidden="true">${b.name_en.slice(0, 1)}</span>`}
          <strong>${L(b, 'name', lang)}</strong><small class="muted">${b.model_count} ${t(lang, 'models_count')}</small></a></li>`)}
      </ul>
    </div>
  </section>

  ${d.vehicles.length ? html`<section class="section section-alt">
    <div class="wrap">
      <div class="section-head"><h2>${t(lang, 'popular_cars')}</h2><a href="${url(lang, '/brands')}">${t(lang, 'view_all')}</a></div>
      <div class="grid grid-4">${d.vehicles.map((v) => vehicleCard(ctx, v))}</div>
    </div>
  </section>` : ''}

  ${d.screens.length ? html`<section class="section">
    <div class="wrap">
      <div class="section-head"><h2>${t(lang, 'latest_screens')}</h2><a href="${url(lang, '/screens')}">${t(lang, 'view_all')}</a></div>
      <div class="grid grid-3">${d.screens.map((sc) => screenCard(ctx, sc))}</div>
    </div>
  </section>` : ''}

  ${d.showcase.length ? html`<section class="section section-alt">
    <div class="wrap">
      <div class="section-head"><h2>${t(lang, 'before_after')}</h2><a href="${url(lang, '/gallery')}">${t(lang, 'gallery')}</a></div>
      <div class="grid grid-2">
        ${d.showcase.slice(0, 2).map((v) => html`<div>${beforeAfter(v, lang)}<p class="ba-caption"><a href="${url(lang, `/car/${v.slug}`)}">${vehicleTitle(v, lang)}</a> · ${t(lang, 'drag_compare')}</p></div>`)}
      </div>
    </div>
  </section>` : ''}

  <section class="section">
    <div class="wrap">
      <h2>${t(lang, 'why_us')}</h2>
      <div class="grid grid-3 features">
        ${[1, 2, 3].map((i) => html`<div class="feature"><span class="feature-num">0${i}</span><h3 class="h5">${t(lang, `why${i}_t`)}</h3><p class="muted">${t(lang, `why${i}`)}</p></div>`)}
      </div>
      <ol class="steps">
        <li><strong>1</strong>${t(lang, 'step1')}</li><li><strong>2</strong>${t(lang, 'step2')}</li><li><strong>3</strong>${t(lang, 'step3')}</li>
      </ol>
    </div>
  </section>
  ${jsonLd({
    '@context': 'https://schema.org',
    '@type': 'AutoPartsStore',
    name: L(s, 'company', lang),
    url: config.siteUrl + url(lang, '/'),
    ...(s.phone ? { telephone: s.phone } : {}),
    ...(L(s, 'address', lang) ? { address: L(s, 'address', lang) } : {}),
  })}
  ${jsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: config.siteUrl + url(lang, '/'),
    potentialAction: { '@type': 'SearchAction', target: `${config.siteUrl}${url(lang, '/find')}?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
  })}`;
  return { body, path: '/', ogImage: s.hero_image };
}

export function brandsPage(ctx, { brands }) {
  const { lang } = ctx;
  const body = html`<div class="wrap page">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'brands')]])}
    <h1>${t(lang, 'brands')}</h1>
    <input class="input filter-input" type="search" placeholder="${t(lang, 'search')}…" aria-label="${t(lang, 'search')}" data-filter=".brand-grid li">
    <ul class="brand-grid">
      ${brands.map((b) => html`<li data-text="${b.name_ar} ${b.name_en}"><a class="brand-tile" href="${url(lang, `/brands/${b.slug}`)}">
        ${b.logo ? html`<img src="${b.logo}" alt="" width="64" height="64" loading="lazy">` : html`<span class="brand-initial" aria-hidden="true">${b.name_en.slice(0, 1)}</span>`}
        <strong>${L(b, 'name', lang)}</strong><small class="muted">${b.model_count} ${t(lang, 'models_count')}</small></a></li>`)}
    </ul>
  </div>`;
  return { title: t(lang, 'brands'), body, path: '/brands', description: lang === 'ar' ? 'دليل ماركات السيارات والشاشات الخارجية Android المتوافقة مع كل موديل.' : 'Car brands and the aftermarket Android screens that fit each model.' };
}

export function brandPage(ctx, { brand, models }) {
  const { lang } = ctx;
  const name = L(brand, 'name', lang);
  const body = html`<div class="wrap page">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'brands'), url(lang, '/brands')], [name]])}
    <h1>${t(lang, 'screens_for')} ${name}</h1>
    <ul class="model-list">
      ${models.map((m) => html`<li><a href="${url(lang, `/brands/${brand.slug}/${m.slug}`)}">
        <strong>${L(m, 'name', lang)}</strong>
        <span class="muted">${m.vehicle_count ? `${m.year_min}–${m.year_max}` : ''}</span></a></li>`)}
    </ul>
  </div>`;
  return {
    title: `${t(lang, 'screens_for')} ${name}`,
    body,
    path: `/brands/${brand.slug}`,
    description: lang === 'ar' ? `شاشات Android خارجية لسيارات ${name}: اختر الموديل وسنة الصنع لمعرفة الشاشات المتوافقة.` : `Aftermarket Android screens for ${name}: choose model and year to see compatible screens.`,
  };
}

export function modelPage(ctx, { brand, model, vehicles }) {
  const { lang } = ctx;
  const name = `${L(brand, 'name', lang)} ${L(model, 'name', lang)}`;
  const body = html`<div class="wrap page">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'brands'), url(lang, '/brands')], [L(brand, 'name', lang), url(lang, `/brands/${brand.slug}`)], [L(model, 'name', lang)]])}
    <h1>${t(lang, 'screens_for')} ${name}</h1>
    ${vehicles.length
      ? html`<p class="muted">${t(lang, 'choose_variant_hint')}</p><div class="grid grid-3">${vehicles.map((v) => vehicleCard(ctx, v))}</div>`
      : notListed(ctx, { brand: L(brand, 'name', lang), model: L(model, 'name', lang) })}
  </div>`;
  return { title: `${t(lang, 'screens_for')} ${name}`, body, path: `/brands/${brand.slug}/${model.slug}` };
}

function notListed(ctx, q) {
  const { lang, settings: s } = ctx;
  const wa = waLink(s, `${lang === 'ar' ? 'أريد شاشة لسيارة' : 'I need a screen for'}: ${[q.brand, q.model, q.year].filter(Boolean).join(' ')}`);
  const params = new URLSearchParams(Object.entries({ brand: q.brand || '', model: q.model || '', year: q.year || '' }).filter(([, v]) => v));
  return html`<div class="empty">
    <h2 class="h4">${t(lang, 'not_found_car')}</h2>
    <p>${t(lang, 'not_found_car_hint')}</p>
    <div class="row-btns"><a class="btn btn-primary" href="${url(lang, `/order?${params}`)}">${t(lang, 'request_quote')}</a>
    ${wa ? html`<a class="btn btn-wa" href="${wa}" target="_blank" rel="noopener">${WA_ICON} ${t(lang, 'chat_whatsapp')}</a>` : ''}</div>
  </div>`;
}

export function findPage(ctx, d) {
  const { lang } = ctx;
  let results = '';
  if (d.searched) {
    if (!d.vehicles.length) results = notListed(ctx, { brand: d.brand && L(d.brand, 'name', lang), model: d.model && L(d.model, 'name', lang), year: d.sel.year });
    else results = html`<h2 class="h4">${t(lang, 'choose_variant')}</h2><p class="muted">${t(lang, 'choose_variant_hint')}</p>
      <div class="grid grid-3">${d.vehicles.map((v) => html`<a class="card variant" href="${url(lang, `/car/${v.slug}`)}">
        ${figure(v.before_img || v.exterior_img || '/img/ph-dash-before.svg', vehicleTitle(v, lang), v.images_kind, { lang, w: 640, h: 360 })}
        <div class="card-body"><h3 class="h5">${L(v, 'trim', lang) || vehicleTitle(v, lang)}</h3><p class="muted">${L(v, 'dash', lang)} · ${yearRange(v, lang)}</p></div></a>`)}</div>`;
  }
  const body = html`<div class="wrap page">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'find')]])}
    <h1>${t(lang, 'find')}</h1>
    <p class="muted">${t(lang, 'search_hint')}</p>
    <div class="finder-card finder-inline">${finderForm(ctx, d)}</div>
    <div class="results">${results}</div>
  </div>`;
  return { title: t(lang, 'find'), body, path: '/find', noindex: d.searched };
}

function compatRow(label, value) {
  return value ? html`<tr><th scope="row">${label}</th><td>${value}</td></tr>` : '';
}

function compatCard(ctx, v, c) {
  const { lang, settings: s } = ctx;
  const orderHref = url(lang, `/order?vehicle=${v.id}&screen=${c.screen_id}`);
  const wa = waLink(s, `${lang === 'ar' ? 'أريد عرض سعر' : 'Quote request'}: ${L(c, 'name', lang)} — ${vehicleTitle(v, lang)} ${L(v, 'trim', lang)}`);
  return html`<article class="ccard ccard-${c.status}">
    <a href="${url(lang, `/screens/${c.screen_slug}`)}">${figure(c.image || '/img/ph-screen.svg', L(c, 'name', lang), c.image_kind, { lang, w: 480, h: 300 })}</a>
    <div class="ccard-body">
      <div class="ccard-head">${statusBadge(c.status, lang)}<span class="tag">${c.model_code}</span></div>
      <h3 class="h5"><a href="${url(lang, `/screens/${c.screen_slug}`)}">${L(c, 'name', lang)}</a></h3>
      <ul class="chips"><li>${c.size_in}″</li><li>${c.ram_gb}/${c.rom_gb} GB</li><li>${c.cpu}</li>
        ${c.carplay !== 'none' ? html`<li>CarPlay ${t(lang, c.carplay)}</li>` : ''}${c.android_auto !== 'none' ? html`<li>Android Auto ${t(lang, c.android_auto)}</li>` : ''}</ul>
      ${c.status !== 'incompatible' ? html`<div class="ccard-prices">${priceBlock(c, s, lang)}
        ${c.install_price ? html`<span class="muted">+ ${t(lang, 'install_price')}: ${money(c.install_price, s, lang)}</span>` : ''}
        ${c.frame_price ? html`<span class="muted">+ ${t(lang, 'frame_price')}: ${money(c.frame_price, s, lang)}</span>` : ''}</div>` : ''}
      <details class="compat-details" ${c.status === 'modified' ? raw('open') : ''}>
        <summary>${t(lang, 'verified_fit')} — ${t(lang, 'view_details')}</summary>
        <table class="spec">
          ${compatRow(t(lang, 'frame'), c.frame)}
          ${compatRow(t(lang, 'harness'), c.harness)}
          ${compatRow(t(lang, 'canbus'), c.canbus)}
          ${compatRow(t(lang, 'swc'), t(lang, `swc_${c.swc}`))}
          ${compatRow(t(lang, 'camera'), c.camera)}
          ${compatRow(t(lang, 'sensors'), c.sensors)}
          ${compatRow(t(lang, 'oem_audio'), c.oem_audio)}
          ${compatRow(t(lang, 'modifications'), L(c, 'mods', lang))}
        </table>
      </details>
      ${c.status !== 'incompatible' ? html`<div class="row-btns">
        <a class="btn btn-primary btn-sm" href="${orderHref}">${t(lang, 'request_quote')}</a>
        ${wa ? html`<a class="btn btn-wa btn-sm" href="${wa}" target="_blank" rel="noopener">${WA_ICON} ${t(lang, 'whatsapp')}</a>` : ''}</div>` : ''}
    </div>
  </article>`;
}

export function carPage(ctx, { v, compat, media }) {
  const { lang, settings: s } = ctx;
  const title = vehicleTitle(v, lang);
  const trim = L(v, 'trim', lang);
  const ok = compat.filter((c) => c.status !== 'incompatible');
  const bad = compat.filter((c) => c.status === 'incompatible');
  const images = media.filter((m) => m.type === 'image');
  const videos = media.filter((m) => m.type === 'video');
  const vid = v.video_url || videos[0]?.url;
  const yt = youtubeId(vid);
  const feats = [
    [t(lang, 'oem_audio'), t(lang, `oem_${v.oem_audio}`)],
    [t(lang, 'camera'), yn(v.has_oem_camera, lang)],
    ['360°', yn(v.has_360, lang)],
    [t(lang, 'sensors'), yn(v.has_sensors, lang)],
    [t(lang, 'swc'), yn(v.has_swc, lang)],
  ];
  const body = html`<div class="wrap page car">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [L(v, 'brand', lang), url(lang, `/brands/${v.brand_slug}`)], [L(v, 'model', lang), url(lang, `/brands/${v.brand_slug}/${v.model_slug}`)], [`${yearRange(v, lang)}${trim ? ` · ${trim}` : ''}`]])}
    <header class="car-head">
      <div>
        <p class="eyebrow">${L(v, 'brand', lang)}</p>
        <h1>${L(v, 'model', lang)} <span class="years">${yearRange(v, lang)}</span></h1>
        <dl class="kv">
          ${trim ? html`<div><dt>${t(lang, 'trim')}</dt><dd>${trim}</dd></div>` : ''}
          ${L(v, 'dash', lang) ? html`<div><dt>${t(lang, 'dashboard')}</dt><dd>${L(v, 'dash', lang)}</dd></div>` : ''}
          ${feats.map(([k, val]) => html`<div><dt>${k}</dt><dd>${val}</dd></div>`)}
        </dl>
        <div class="row-btns">
          <a class="btn btn-primary" href="${url(lang, `/order?vehicle=${v.id}`)}">${t(lang, 'request_quote')}</a>
          <a class="btn btn-ghost" href="#compatible">${t(lang, 'compatible_screens')} (${ok.length})</a>
        </div>
      </div>
      ${figure(v.exterior_img, `${title} — ${t(lang, 'exterior')}`, v.images_kind, { lang, cls: 'car-exterior', loading: 'eager', w: 800, h: 450 })}
    </header>

    <section class="section-tight">
      <h2>${t(lang, 'before_after')}</h2>
      ${beforeAfter(v, lang, { title: `${title} ${trim}` })}
      <p class="ba-caption muted">${t(lang, 'drag_compare')}</p>
    </section>

    ${images.length ? html`<section class="section-tight">
      <h2>${t(lang, 'install_photos')}</h2>
      <div class="grid grid-4 thumbs">${images.map((m) => html`<a href="${m.url}" class="thumb" data-lightbox>${figure(m.url, L(m, 'caption', lang) || title, m.kind, { lang, w: 400, h: 260 })}${L(m, 'caption', lang) ? html`<span class="cap">${L(m, 'caption', lang)}</span>` : ''}</a>`)}</div>
    </section>` : ''}

    ${vid ? html`<section class="section-tight">
      <h2>${t(lang, 'install_video')}</h2>
      ${yt ? html`<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="${t(lang, 'install_video')} — ${title}" loading="lazy" allowfullscreen allow="encrypted-media; picture-in-picture"></iframe></div>`
        : html`<video class="video" src="${vid}" controls preload="metadata"></video>`}
    </section>` : ''}

    <section class="section-tight" id="compatible">
      <h2>${t(lang, 'compatible_screens')}</h2>
      ${ok.length ? html`<div class="compat-list">${ok.map((c) => compatCard(ctx, v, c))}</div>` : html`<div class="empty"><p>${t(lang, 'no_compatible')}</p><a class="btn btn-primary" href="${url(lang, `/order?vehicle=${v.id}`)}">${t(lang, 'request_quote')}</a></div>`}
      ${bad.length ? html`<details class="incompatible"><summary>${t(lang, 'status_incompatible')} (${bad.length})</summary><div class="compat-list">${bad.map((c) => compatCard(ctx, v, c))}</div></details>` : ''}
      <p class="muted small">${t(lang, 'vat_note')}</p>
      ${v.images_kind === 'illustrative' || media.some((m) => m.kind === 'illustrative') ? html`<p class="muted small">${t(lang, 'illustrative_note')}</p>` : ''}
    </section>
    ${L(v, 'notes', lang) ? html`<section class="section-tight"><h2>${t(lang, 'notes')}</h2>${paras(L(v, 'notes', lang))}</section>` : ''}
  </div>
  ${jsonLd({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${t(lang, 'compatible_screens')} — ${title}`,
    itemListElement: ok.map((c, i) => ({
      '@type': 'ListItem', position: i + 1, url: config.siteUrl + url(lang, `/screens/${c.screen_slug}`), name: L(c, 'name', lang),
    })),
  })}`;
  const desc = lang === 'ar'
    ? `الشاشات الخارجية Android المتوافقة مع ${title} ${trim}: صور قبل وبعد التركيب، المواصفات، الأسعار وحالة التوافق.`
    : `Aftermarket Android screens for ${title} ${trim}: before/after photos, specs, prices and verified compatibility.`;
  return { title: `${t(lang, 'screens_for')} ${title} ${trim}`, body, path: `/car/${v.slug}`, description: desc, ogImage: v.after_img };
}

export function paras(text) {
  return html`${String(text).split(/\n{2,}/).map((p) => html`<p>${p}</p>`)}`;
}

export function screensPage(ctx, { result, sizes, q }) {
  const { lang } = ctx;
  const sel = (name, val) => (String(q[name] ?? '') === String(val) ? raw('selected') : '');
  const body = html`<div class="wrap page">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'screens')]])}
    <h1>${t(lang, 'screens')}</h1>
    <div class="catalog">
      <form class="filters" method="get" action="${url(lang, '/screens')}">
        <h2 class="h6">${t(lang, 'filters')}</h2>
        <label><span>${t(lang, 'size')}</span><select name="size"><option value="">${t(lang, 'all')}</option>${sizes.map((z) => html`<option value="${z}" ${sel('size', z)}>${z}″</option>`)}</select></label>
        <label><span>${t(lang, 'carplay')}</span><select name="carplay"><option value="">${t(lang, 'any')}</option><option value="any" ${sel('carplay', 'any')}>${t(lang, 'wired')} / ${t(lang, 'wireless')}</option><option value="wireless" ${sel('carplay', 'wireless')}>${t(lang, 'wireless')}</option></select></label>
        <label><span>${t(lang, 'min_ram')}</span><select name="min_ram"><option value="">${t(lang, 'any')}</option>${[2, 4, 6, 8].map((r) => html`<option value="${r}" ${sel('min_ram', r)}>${r} GB+</option>`)}</select></label>
        <label><span>${t(lang, 'max_price')}</span><input class="input" type="number" name="max_price" min="0" step="50" value="${q.max_price || ''}" inputmode="numeric"></label>
        <label class="check"><input type="checkbox" name="dsp" value="1" ${q.dsp ? raw('checked') : ''}> <span>${t(lang, 'dsp')}</span></label>
        <label class="check"><input type="checkbox" name="cam360" value="1" ${q.cam360 ? raw('checked') : ''}> <span>${t(lang, 'cam360')}</span></label>
        <label><span>${t(lang, 'sort')}</span><select name="sort">
          <option value="new" ${sel('sort', 'new')}>${t(lang, 'sort_new')}</option>
          <option value="price_asc" ${sel('sort', 'price_asc')}>${t(lang, 'sort_price_asc')}</option>
          <option value="price_desc" ${sel('sort', 'price_desc')}>${t(lang, 'sort_price_desc')}</option></select></label>
        <div class="row-btns"><button class="btn btn-primary btn-sm" type="submit">${t(lang, 'apply')}</button><a class="btn btn-ghost btn-sm" href="${url(lang, '/screens')}">${t(lang, 'reset')}</a></div>
      </form>
      <div>
        <p class="muted">${result.total} ${t(lang, 'results')}</p>
        ${result.rows.length ? html`<div class="grid grid-3">${result.rows.map((s) => screenCard(ctx, s))}</div>` : html`<p class="empty">${t(lang, 'no_results')}</p>`}
        ${pager(lang, url(lang, '/screens'), q.page, result.pages, Object.fromEntries(Object.entries(q).filter(([k, v]) => k !== 'page' && v)))}
      </div>
    </div>
  </div>`;
  return { title: t(lang, 'screens'), body, path: '/screens', noindex: Object.keys(q).some((k) => k !== 'page' && q[k]) };
}

export function screenPage(ctx, { s: sc, cars, media }) {
  const { lang, settings: s } = ctx;
  const name = L(sc, 'name', lang);
  const specs = [
    [t(lang, 'size'), `${sc.size_in} ${t(lang, 'inch')}`],
    [t(lang, 'os'), `${sc.os} ${sc.os_version}`],
    [t(lang, 'cpu'), sc.cpu],
    [t(lang, 'ram'), `${sc.ram_gb} GB`],
    [t(lang, 'rom'), `${sc.rom_gb} GB`],
    [t(lang, 'resolution'), sc.resolution],
    [t(lang, 'panel'), sc.panel],
    ['Wi-Fi', yn(sc.wifi, lang)],
    ['Bluetooth', yn(sc.bluetooth, lang)],
    ['GPS', yn(sc.gps, lang)],
    [t(lang, 'sim4g'), yn(sc.sim4g, lang)],
    [t(lang, 'carplay'), linkMode(sc.carplay, lang)],
    [t(lang, 'android_auto'), linkMode(sc.android_auto, lang)],
    [t(lang, 'rear_cam'), yn(sc.rear_cam, lang)],
    [t(lang, 'cam360'), sc.cam360 ? `${t(lang, 'yes')} (${t(lang, 'cam360_note')})` : t(lang, 'no')],
    [t(lang, 'dsp'), yn(sc.dsp, lang)],
    [t(lang, 'audio'), L(sc, 'audio', lang)],
    [t(lang, 'warranty'), `${sc.warranty_months} ${t(lang, 'months')}`],
  ];
  const wa = waLink(s, `${lang === 'ar' ? 'أريد الاستفسار عن' : 'I would like to ask about'}: ${name} (${sc.model_code})`);
  const body = html`<div class="wrap page">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'screens'), url(lang, '/screens')], [name]])}
    <div class="product">
      <div>${figure(sc.image || '/img/ph-screen.svg', name, sc.image_kind, { lang, loading: 'eager', w: 900, h: 560 })}
        ${media.length ? html`<div class="grid grid-4 thumbs">${media.map((m) => html`<a class="thumb" href="${m.url}" data-lightbox>${figure(m.url, L(m, 'caption', lang) || name, m.kind, { lang, w: 300, h: 200 })}</a>`)}</div>` : ''}
      </div>
      <div class="product-info">
        <p class="eyebrow">${sc.model_code}</p>
        <h1>${name}</h1>
        ${L(sc, 'offer', lang) ? html`<span class="tag tag-offer">${L(sc, 'offer', lang)}</span>` : ''}
        <div class="product-price">${priceBlock(sc, s, lang)}</div>
        ${L(sc, 'desc', lang) ? paras(L(sc, 'desc', lang)) : ''}
        <div class="row-btns">
          <a class="btn btn-primary" href="${url(lang, `/order?screen=${sc.id}`)}">${t(lang, 'request_quote')}</a>
          ${wa ? html`<a class="btn btn-wa" href="${wa}" target="_blank" rel="noopener">${WA_ICON} ${t(lang, 'whatsapp')}</a>` : ''}
        </div>
        <h2 class="h5">${t(lang, 'specs')}</h2>
        <table class="spec">${specs.filter(([, v]) => v).map(([k, v]) => html`<tr><th scope="row">${k}</th><td>${v}</td></tr>`)}</table>
      </div>
    </div>
    <section class="section-tight">
      <h2>${t(lang, 'compatible_cars')}</h2>
      ${cars.length ? html`<ul class="car-list">${cars.map((c) => html`<li><a href="${url(lang, `/car/${c.slug}`)}"><strong>${L(c, 'brand', lang)} ${L(c, 'model', lang)}</strong> <span>${yearRange(c, lang)}</span> <span class="muted">${L(c, 'trim', lang)}</span></a>${statusBadge(c.status, lang)}</li>`)}</ul>`
        : html`<p class="muted">${t(lang, 'no_compatible_cars')}</p>`}
    </section>
  </div>
  ${jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    sku: sc.model_code,
    image: config.siteUrl + (sc.image || '/img/ph-screen.svg'),
    description: L(sc, 'desc', lang) || name,
    category: 'Car Android head unit',
    ...(sc.price || sc.sale_price ? { offers: { '@type': 'Offer', priceCurrency: 'SAR', price: sc.sale_price || sc.price, availability: 'https://schema.org/InStock', url: config.siteUrl + url(lang, `/screens/${sc.slug}`) } } : {}),
  })}`;
  return {
    title: `${name} — ${sc.size_in}″ Android ${sc.os_version}`,
    body,
    path: `/screens/${sc.slug}`,
    description: `${name}: ${sc.size_in}″, ${sc.ram_gb}/${sc.rom_gb}GB, ${sc.cpu}${sc.carplay !== 'none' ? ', CarPlay' : ''}.`,
    ogImage: sc.image,
  };
}

export function galleryPage(ctx, { rows, total, page, pages }) {
  const { lang } = ctx;
  const body = html`<div class="wrap page">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'gallery')]])}
    <h1>${t(lang, 'gallery')}</h1>
    <p class="muted">${t(lang, 'gallery_intro')}</p>
    ${rows.length ? html`<div class="grid grid-3 gallery">${rows.map((m) => html`<figure class="gitem">
      ${m.type === 'video'
        ? (youtubeId(m.url)
          ? html`<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${youtubeId(m.url)}" title="${L(m, 'caption', lang) || t(lang, 'install_video')}" loading="lazy" allowfullscreen></iframe></div>`
          : html`<video class="video" src="${m.url}" controls preload="metadata"></video>`)
        : html`<a href="${m.url}" data-lightbox>${figure(m.url, L(m, 'caption', lang) || t(lang, 'gallery'), m.kind, { lang, w: 640, h: 400 })}</a>`}
      <figcaption>${L(m, 'caption', lang)}${m.vehicle_slug ? html` — <a href="${url(lang, `/car/${m.vehicle_slug}`)}">${L(m, 'brand', lang)} ${L(m, 'model', lang)} ${m.year_from}–${m.year_to || ''}</a>` : ''}</figcaption>
    </figure>`)}</div>
    ${pager(lang, url(lang, '/gallery'), page, pages)}
    ${rows.some((m) => m.kind === 'illustrative') ? html`<p class="muted small">${t(lang, 'illustrative_note')}</p>` : ''}`
      : html`<p class="empty">${t(lang, 'gallery_empty')}</p>`}
  </div>`;
  return { title: t(lang, 'gallery'), body, path: '/gallery' };
}

export function aboutPage(ctx) {
  const { lang, settings: s } = ctx;
  const about = L(s, 'about', lang);
  const body = html`<div class="wrap page narrow">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'about')]])}
    <h1>${t(lang, 'about')}</h1>
    ${about ? paras(about) : html`<p class="lead">${L(s, 'tagline', lang)}</p>`}
    <p>${t(lang, 'aftermarket_only')}</p>
    <div class="grid grid-3 features">
      ${[1, 2, 3].map((i) => html`<div class="feature"><h2 class="h5">${t(lang, `why${i}_t`)}</h2><p class="muted">${t(lang, `why${i}`)}</p></div>`)}
    </div>
  </div>`;
  return { title: t(lang, 'about'), body, path: '/about' };
}

export function orderForm(ctx, { brands, screens, pre = {} }) {
  const { lang, settings: s } = ctx;
  const regions = String(s.regions || '').split(',').map((r) => r.trim()).filter(Boolean);
  const services = ['supply_install', 'supply', 'install', 'quote'];
  return html`<form class="order-form" data-order novalidate>
    <input type="hidden" name="lang" value="${lang}">
    <input type="hidden" name="vehicle_id" value="${pre.vehicle?.id || ''}">
    ${pre.vehicle ? html`<div class="pre-car">${figure(pre.vehicle.before_img, vehicleTitle(pre.vehicle, lang), pre.vehicle.images_kind, { lang, w: 240, h: 135 })}
      <div><strong>${vehicleTitle(pre.vehicle, lang)}</strong><br><span class="muted">${L(pre.vehicle, 'trim', lang)} · ${L(pre.vehicle, 'dash', lang)}</span></div></div>` : ''}
    <div class="form-grid">
      <label><span>${t(lang, 'your_name')} *</span><input class="input" name="name" required maxlength="100" autocomplete="name"><em class="err"></em></label>
      <label><span>${t(lang, 'phone')} *</span><input class="input" name="phone" required type="tel" inputmode="tel" dir="ltr" maxlength="20" autocomplete="tel" placeholder="05XXXXXXXX"><em class="err"></em></label>
      ${pre.vehicle ? html`
        <input type="hidden" name="brand_text" value="${L(pre.vehicle, 'brand', lang)}">
        <input type="hidden" name="model_text" value="${L(pre.vehicle, 'model', lang)}">
        <label><span>${t(lang, 'year')} *</span><input class="input" name="year" type="number" required min="${pre.vehicle.year_from}" max="${pre.vehicle.year_to || new Date().getFullYear() + 1}" value="${pre.vehicle.year_from}" inputmode="numeric"><em class="err"></em></label>
        <input type="hidden" name="trim_text" value="${L(pre.vehicle, 'trim', lang)}">`
      : html`
        <label><span>${t(lang, 'brand')} *</span><input class="input" name="brand_text" required maxlength="60" list="dl-brands" value="${pre.brand || ''}"><em class="err"></em></label>
        <datalist id="dl-brands">${brands.map((b) => html`<option value="${L(b, 'name', lang)}">`)}</datalist>
        <label><span>${t(lang, 'model')} *</span><input class="input" name="model_text" required maxlength="60" value="${pre.model || ''}"><em class="err"></em></label>
        <label><span>${t(lang, 'year')} *</span><input class="input" name="year" type="number" required min="1950" max="${new Date().getFullYear() + 1}" value="${pre.year || ''}" inputmode="numeric"><em class="err"></em></label>
        <label><span>${t(lang, 'trim')}</span><input class="input" name="trim_text" maxlength="80"><em class="err"></em></label>`}
      <label><span>${t(lang, 'screen_wanted')}</span><select name="screen_id"><option value="">${t(lang, 'not_sure')}</option>
        ${screens.map((sc) => html`<option value="${sc.id}" ${Number(pre.screen) === sc.id ? raw('selected') : ''}>${L(sc, 'name', lang)} — ${sc.size_in}″</option>`)}</select><em class="err"></em></label>
      <label><span>${t(lang, 'region')} *</span><input class="input" name="region" required maxlength="80" list="dl-regions"><em class="err"></em></label>
      <datalist id="dl-regions">${regions.map((r) => html`<option value="${r}">`)}</datalist>
      <fieldset class="span-2"><legend>${t(lang, 'service')}</legend><div class="radios">
        ${services.map((sv, i) => html`<label class="radio"><input type="radio" name="service" value="${sv}" ${i === 0 ? raw('checked') : ''}> <span>${t(lang, `service_${sv}`)}</span></label>`)}
      </div></fieldset>
      <label class="span-2"><span>${t(lang, 'dash_photo')}</span><input class="input" type="file" name="photo" accept="image/jpeg,image/png,image/webp"><small class="muted">${t(lang, 'dash_photo_hint')}</small><em class="err"></em></label>
      <label class="span-2"><span>${t(lang, 'notes')}</span><textarea class="input" name="notes" rows="3" maxlength="1000"></textarea></label>
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    </div>
    <p class="muted small">${t(lang, 'privacy_note')}</p>
    <p class="form-msg" role="alert" hidden></p>
    <button class="btn btn-primary btn-lg" type="submit" data-sending="${t(lang, 'sending')}">${t(lang, 'submit')}</button>
  </form>
  <div class="order-ok" hidden>
    <h2 class="h3">✓ ${t(lang, 'order_ok_title')}</h2>
    <p>${t(lang, 'order_ok')}: <strong class="order-ref" dir="ltr"></strong></p>
    <p class="wa-follow" hidden>${t(lang, 'order_ok_hint')}</p>
    <a class="btn btn-wa wa-follow" hidden target="_blank" rel="noopener">${WA_ICON} ${t(lang, 'chat_whatsapp')}</a>
  </div>`;
}

export function orderPage(ctx, d) {
  const { lang } = ctx;
  const body = html`<div class="wrap page narrow">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'order')]])}
    <h1>${t(lang, 'order_title')}</h1>
    <p class="muted">${t(lang, 'order_intro')}</p>
    <div class="panel">${orderForm(ctx, d)}</div>
  </div>`;
  return { title: t(lang, 'order_title'), body, path: '/order' };
}

export function contactPage(ctx, d) {
  const { lang, settings: s } = ctx;
  const wa = waLink(s, lang === 'ar' ? 'مرحباً' : 'Hello');
  const body = html`<div class="wrap page">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'contact')]])}
    <h1>${t(lang, 'contact')}</h1>
    <div class="contact-grid">
      <aside class="panel">
        <h2 class="h5">${t(lang, 'contact_info')}</h2>
        <dl class="kv kv-col">
          ${s.phone ? html`<div><dt>${t(lang, 'phone')}</dt><dd><a href="tel:${s.phone.replace(/[^\d+]/g, '')}" dir="ltr">${s.phone}</a></dd></div>` : ''}
          ${s.email ? html`<div><dt>${t(lang, 'email')}</dt><dd><a href="mailto:${s.email}">${s.email}</a></dd></div>` : ''}
          ${L(s, 'address', lang) ? html`<div><dt>${t(lang, 'address')}</dt><dd>${L(s, 'address', lang)}</dd></div>` : ''}
          ${L(s, 'hours', lang) ? html`<div><dt>${t(lang, 'hours')}</dt><dd>${L(s, 'hours', lang)}</dd></div>` : ''}
        </dl>
        ${wa ? html`<a class="btn btn-wa" href="${wa}" target="_blank" rel="noopener">${WA_ICON} ${t(lang, 'chat_whatsapp')}</a>` : ''}
      </aside>
      <div class="panel"><h2 class="h5">${t(lang, 'order_title')}</h2>${orderForm(ctx, d)}</div>
    </div>
  </div>`;
  return { title: t(lang, 'contact'), body, path: '/contact' };
}

export function faqPage(ctx, { faqs }) {
  const { lang } = ctx;
  const body = html`<div class="wrap page narrow">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'faq')]])}
    <h1>${t(lang, 'faq')}</h1>
    <div class="faq">${faqs.map((f) => html`<details><summary>${L(f, 'q', lang)}</summary>${paras(L(f, 'a', lang))}</details>`)}</div>
  </div>
  ${jsonLd({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: L(f, 'q', lang), acceptedAnswer: { '@type': 'Answer', text: L(f, 'a', lang) } })),
  })}`;
  return { title: t(lang, 'faq'), body, path: '/faq' };
}

export function articlesPage(ctx, { articles }) {
  const { lang } = ctx;
  const body = html`<div class="wrap page">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'articles')]])}
    <h1>${t(lang, 'articles')}</h1>
    <div class="grid grid-3">${articles.map((a) => html`<article class="card"><a href="${url(lang, `/articles/${a.slug}`)}">
      ${a.cover ? figure(a.cover, L(a, 'title', lang), 'real', { lang, w: 640, h: 360 }) : ''}
      <div class="card-body"><h2 class="h5">${L(a, 'title', lang)}</h2><p class="muted">${L(a, 'excerpt', lang)}</p><span class="link">${t(lang, 'read_more')}</span></div></a></article>`)}</div>
    ${articles.length ? '' : html`<p class="empty">${t(lang, 'no_results')}</p>`}
  </div>`;
  return { title: t(lang, 'articles'), body, path: '/articles' };
}

export function articlePage(ctx, { a }) {
  const { lang } = ctx;
  const title = L(a, 'title', lang);
  const body = html`<article class="wrap page narrow prose">
    ${breadcrumbs(lang, [[t(lang, 'home'), url(lang, '/')], [t(lang, 'articles'), url(lang, '/articles')], [title]])}
    <h1>${title}</h1>
    <p class="muted"><time datetime="${a.created_at.slice(0, 10)}">${a.created_at.slice(0, 10)}</time></p>
    ${a.cover ? figure(a.cover, title, 'real', { lang, loading: 'eager' }) : ''}
    ${paras(L(a, 'body', lang))}
    <p><a class="btn btn-primary" href="${url(lang, '/find')}">${t(lang, 'find')}</a></p>
  </article>
  ${jsonLd({ '@context': 'https://schema.org', '@type': 'Article', headline: title, datePublished: a.created_at, dateModified: a.updated_at, inLanguage: lang })}`;
  return { title, body, path: `/articles/${a.slug}`, description: L(a, 'excerpt', lang) };
}

export function notFoundPage(ctx) {
  const { lang } = ctx;
  const body = html`<div class="wrap page narrow center"><h1>404</h1><p class="lead">${t(lang, 'page_not_found')}</p>
    <a class="btn btn-primary" href="${url(lang, '/')}">${t(lang, 'back_home')}</a></div>`;
  return { title: t(lang, 'page_not_found'), body, path: '/404', noindex: true };
}
