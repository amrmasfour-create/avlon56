(() => {
  'use strict';
  const app = document.getElementById('app');
  let ME = null;
  let CSRF = '';
  let SCHEMA = {};
  const optionCache = {};

  // ---------- helpers ----------
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  function toast(msg, bad = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = bad ? 'bad' : '';
    t.hidden = false;
    clearTimeout(toast.tm);
    toast.tm = setTimeout(() => { t.hidden = true; }, 3500);
  }
  async function api(path, { method = 'GET', body, raw, contentType } = {}) {
    const headers = {};
    if (method !== 'GET') headers['X-CSRF-Token'] = CSRF;
    if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
    if (raw) headers['Content-Type'] = contentType || 'application/octet-stream';
    const res = await fetch(path, { method, headers, body: raw ? raw : body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/admin/api/login') { ME = null; renderLogin(); throw new Error('401'); }
    if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; e.errors = data.errors; throw e; }
    return data;
  }
  const parseHash = () => {
    const [p, q] = (location.hash.slice(1) || '/').split('?');
    return { parts: p.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(q || '')) };
  };
  const go = (hash) => { location.hash = hash; };
  const fmtDate = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');
  const ROLE = { admin: 'مدير', editor: 'محرر', sales: 'مبيعات' };
  const COL_LABEL = {
    id: '#', name_ar: 'الاسم', name_en: 'English', slug: 'الرابط', featured: 'مميز', model_count: 'الموديلات', brand: 'الماركة', model: 'الموديل', vehicle_count: 'السيارات',
    year_from: 'من', year_to: 'إلى', trim_ar: 'الفئة', dash_code: 'التابلوه', compat_count: 'شاشات موثقة', images_kind: 'الصور', published: 'منشور', model_code: 'الرمز', size_in: 'الحجم',
    ram_gb: 'RAM', rom_gb: 'ROM', price: 'السعر', sale_price: 'العرض', car_count: 'سيارات متوافقة', vehicle: 'السيارة', screen: 'الشاشة', status: 'الحالة', swc: 'أزرار المقود',
    install_price: 'التركيب', verified: 'التحقق', thumb: 'معاينة', type: 'النوع', kind: 'حقيقية/توضيحية', caption_ar: 'التعليق', in_gallery: 'بالمعرض', title_ar: 'العنوان', created_at: 'التاريخ',
    q_ar: 'السؤال', sort: 'الترتيب', ref: 'رقم الطلب', name: 'الاسم', phone: 'الجوال', car: 'السيارة', region: 'المنطقة', service: 'الخدمة', username: 'المستخدم', role: 'الدور', active: 'نشط',
  };
  const SERVICE = { supply: 'توريد', supply_install: 'توريد وتركيب', install: 'تركيب فقط', quote: 'استفسار' };

  function enumLabel(field, v) {
    if (!field || !field.values) return v;
    const i = field.values.indexOf(v);
    return i >= 0 && field.labels ? field.labels[i] : v;
  }
  function cell(res, col, row) {
    const v = row[col];
    const f = SCHEMA[res]?.fields?.[col];
    if (col === 'thumb') return /\.(mp4|webm)$/i.test(v) || /youtu/.test(v) ? '🎬' : h('img', { src: v, alt: '' });
    if (col === 'verified') return v ? h('span', { class: 'badge b-yes' }, '✔ موثّق') : h('span', { class: 'badge b-pending' }, 'بانتظار التحقق');
    if (['featured', 'published', 'in_gallery', 'active'].includes(col)) return v ? '✓' : '—';
    if (col === 'status') return h('span', { class: `badge b-${v}` }, enumLabel(f, v));
    if (col === 'images_kind' || col === 'kind') return v === 'real' ? 'حقيقية' : h('span', { class: 'badge b-pending' }, 'توضيحية');
    if (col === 'service') return SERVICE[v] || v;
    if (col === 'role') return ROLE[v] || v;
    if (col === 'created_at') return fmtDate(v);
    if (f?.values) return enumLabel(f, v);
    return v === null || v === undefined ? '' : String(v);
  }
  async function options(res) {
    if (!optionCache[res]) optionCache[res] = api(`/admin/api/options/${res}`);
    return optionCache[res];
  }
  const clearOptions = (res) => { delete optionCache[res]; };

  // ---------- auth ----------
  function renderLogin() {
    app.replaceChildren(h('div', { class: 'login' }, h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const f = e.target;
        const btn = f.querySelector('button');
        btn.disabled = true;
        try {
          await api('/admin/api/login', { method: 'POST', body: { username: f.username.value, password: f.password.value } });
          await boot();
        } catch (err) {
          toast(err.status === 429 ? 'محاولات كثيرة، انتظر قليلاً' : 'اسم المستخدم أو كلمة المرور غير صحيحة', true);
        } finally { btn.disabled = false; }
      },
    },
    h('h1', {}, 'لوحة التحكم'),
    h('p', { class: 'muted' }, 'سجّل الدخول لإدارة الموقع'),
    h('input', { class: 'in', name: 'username', placeholder: 'اسم المستخدم', autocomplete: 'username', required: true, dir: 'ltr' }),
    h('input', { class: 'in', name: 'password', type: 'password', placeholder: 'كلمة المرور', autocomplete: 'current-password', required: true, dir: 'ltr' }),
    h('button', { class: 'btn', type: 'submit' }, 'دخول'))));
  }

  async function boot() {
    const me = await api('/admin/api/me');
    if (!me.user) return renderLogin();
    ME = me.user;
    CSRF = me.csrf;
    ME.perms = me.perms;
    SCHEMA = await api('/admin/api/schema');
    route();
  }

  // ---------- shell ----------
  function shell(active, content) {
    const order = ['orders', 'vehicles', 'compat', 'screens', 'media', 'brands', 'models', 'articles', 'faqs', 'users'];
    const navs = [h('a', { class: `nav ${active === 'dash' ? 'on' : ''}`, href: '#/' }, 'لوحة المعلومات')];
    for (const r of order) if (SCHEMA[r]) navs.push(h('a', { class: `nav ${active === r ? 'on' : ''}`, href: `#/r/${r}` }, SCHEMA[r].label));
    if (ME.perms.includes('settings')) navs.push(h('a', { class: `nav ${active === 'settings' ? 'on' : ''}`, href: '#/settings' }, 'إعدادات الموقع'));
    app.replaceChildren(h('div', { class: 'shell' },
      h('aside', { class: 'side' },
        h('a', { class: 'brand', href: '/ar', target: '_blank' }, 'عرض الموقع ↗'),
        ...navs,
        h('div', { class: 'sep' }),
        h('a', { class: `nav ${active === 'password' ? 'on' : ''}`, href: '#/password' }, 'تغيير كلمة المرور'),
        h('a', { class: 'nav', href: '#', onclick: async (e) => { e.preventDefault(); await api('/admin/api/logout', { method: 'POST' }); ME = null; renderLogin(); } }, 'تسجيل الخروج'),
        h('div', { class: 'who' }, `${ME.username} · ${ROLE[ME.role]}`)),
      h('main', {}, content)));
  }

  // ---------- dashboard ----------
  async function dashboard() {
    const s = await api('/admin/api/stats?days=30');
    const c = s.counts;
    const tile = (n, label, href) => h(href ? 'a' : 'div', { class: 'tile', href, style: 'text-decoration:none;color:inherit' }, h('b', {}, n), h('span', {}, label));
    const chart = (rows) => {
      const max = Math.max(1, ...rows.map((r) => r.n));
      return rows.length ? h('div', { class: 'chart' }, rows.map((r) => h('div', { style: `height:${(r.n / max) * 100}%`, 'data-t': `${r.d}: ${r.n}` }))) : h('p', { class: 'muted' }, 'لا توجد بيانات بعد');
    };
    const list = (rows, fmt) => (rows.length ? h('table', {}, h('tbody', {}, rows.map((r) => h('tr', { style: 'cursor:default' }, fmt(r).map((x) => h('td', {}, x)))))) : h('p', { class: 'muted' }, 'لا توجد بيانات بعد'));
    const warns = [];
    if (s.demo_mode) warns.push('الموقع يعرض بيانات تجريبية. احذفها قبل الإطلاق: npm run seed -- --reset ثم أدخل بياناتك الحقيقية، أو عطّل "وضع العرض" من الإعدادات.');
    if (s.settings_missing.includes('whatsapp')) warns.push('رقم واتساب غير مُدخل — أزرار واتساب مخفية في الموقع. أضفه من الإعدادات.');
    if (c.compat_pending) warns.push(`${c.compat_pending} ربط توافق بانتظار التحقق الفني ولن يظهر للعملاء.`);
    if (c.vehicles_illustrative) warns.push(`${c.vehicles_illustrative} سيارة تستخدم صوراً توضيحية — استبدلها بصور حقيقية عند توفرها.`);
    shell('dash', [
      h('h1', {}, 'لوحة المعلومات'),
      ...warns.map((w) => h('div', { class: 'warn' }, w)),
      h('div', { class: 'tiles' },
        tile(c.orders_new, 'طلبات جديدة', SCHEMA.orders ? '#/r/orders?status=new' : null),
        tile(c.orders_period, 'طلبات آخر 30 يوم'),
        tile(c.searches_period, 'عمليات بحث آخر 30 يوم'),
        tile(c.vehicles, 'سيارة (سنة/فئة)', SCHEMA.vehicles && '#/r/vehicles'),
        tile(c.screens, 'شاشة', SCHEMA.screens && '#/r/screens'),
        tile(c.compat_verified, 'ربط توافق موثّق', SCHEMA.compat && '#/r/compat?verified=1'),
        tile(c.brands, 'ماركة'), tile(c.models, 'موديل')),
      h('div', { class: 'cols' },
        h('div', { class: 'card' }, h('h2', {}, 'الطلبات يومياً'), chart(s.orders_by_day)),
        h('div', { class: 'card' }, h('h2', {}, 'عمليات البحث يومياً'), chart(s.searches_by_day)),
        h('div', { class: 'card' }, h('h2', {}, 'الأكثر بحثاً'), list(s.top_searches, (r) => [`${r.brand || ''} ${r.model || ''}`, `${r.n} بحث`, r.no_result ? `${r.no_result} بلا نتائج` : ''])),
        h('div', { class: 'card' }, h('h2', {}, 'طلب غير مُلبّى (بحث بلا نتائج)'), h('p', { class: 'muted' }, 'سيارات يبحث عنها العملاء وليست في الدليل — أولوية للإضافة.'), list(s.unmet_searches, (r) => [`${r.brand || ''} ${r.model || ''} ${r.year || ''}`, `${r.n}×`])),
        h('div', { class: 'card' }, h('h2', {}, 'الطلبات حسب الحالة'), list(s.orders_by_status, (r) => [cell('orders', 'status', r), r.n])),
        h('div', { class: 'card' }, h('h2', {}, 'الشاشات الأكثر طلباً'), list(s.top_screens, (r) => [r.name, r.n]))),
    ]);
  }

  // ---------- generic list ----------
  async function listView(res, query) {
    const S = SCHEMA[res];
    if (!S) return shell('', h('p', {}, 'غير مسموح'));
    const page = Number(query.page || 1);
    const qs = new URLSearchParams({ ...query, page: String(page) });
    const data = await api(`/admin/api/r/${res}?${qs}`);
    const setQ = (patch) => {
      const q = { ...query, ...patch };
      Object.keys(q).forEach((k) => (q[k] === '' || q[k] === undefined) && delete q[k]);
      go(`#/r/${res}?${new URLSearchParams(q)}`);
    };
    const filters = [];
    for (const f of S.filters) {
      const field = S.fields[f];
      if (field?.ref) {
        const opts = await options(field.ref);
        filters.push(h('select', { onchange: (e) => setQ({ [f]: e.target.value, page: '' }) }, h('option', { value: '' }, `كل ${field.label}`), opts.map((o) => h('option', { value: o.id, selected: String(o.id) === query[f] }, o.label))));
      } else if (field?.values) {
        filters.push(h('select', { onchange: (e) => setQ({ [f]: e.target.value, page: '' }) }, h('option', { value: '' }, `كل ${field.label}`), field.values.map((v, i) => h('option', { value: v, selected: v === query[f] }, field.labels?.[i] || v))));
      } else if (f === 'verified') {
        filters.push(h('select', { onchange: (e) => setQ({ verified: e.target.value, page: '' }) }, h('option', { value: '' }, 'الكل'), h('option', { value: '1', selected: query.verified === '1' }, 'موثّق'), h('option', { value: '0', selected: query.verified === '0' }, 'بانتظار التحقق')));
      }
    }
    let t;
    const search = h('input', { class: 'in', type: 'search', placeholder: 'بحث…', value: query.q || '', oninput: (e) => { clearTimeout(t); t = setTimeout(() => setQ({ q: e.target.value, page: '' }), 350); } });
    const pre = Object.fromEntries(S.filters.filter((f) => query[f] && S.fields[f]?.ref).map((f) => [f, query[f]]));
    shell(res, [
      h('h1', {}, S.label, h('span', { class: 'muted' }, ` (${data.total})`)),
      h('div', { class: 'bar' }, search, ...filters, h('span', { class: 'grow' }),
        S.writable && !S.noCreate ? h('a', { class: 'btn', href: `#/r/${res}/new?${new URLSearchParams(pre)}` }, '+ إضافة') : null),
      h('div', { class: 'tbl-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, S.columns.map((c) => h('th', {}, COL_LABEL[c] || c)))),
        h('tbody', {}, data.rows.length ? data.rows.map((row) => h('tr', { onclick: () => go(res === 'orders' ? `#/orders/${row.id}` : `#/r/${res}/${row.id}`) }, S.columns.map((c) => h('td', {}, cell(res, c, row)))))
          : h('tr', {}, h('td', { colspan: S.columns.length, class: 'muted' }, 'لا توجد سجلات'))))),
      data.pages > 1 ? h('div', { class: 'pager' },
        page > 1 ? h('button', { class: 'btn ghost sm', onclick: () => setQ({ page: page - 1 }) }, 'السابق') : null,
        h('span', {}, `${page} / ${data.pages}`),
        page < data.pages ? h('button', { class: 'btn ghost sm', onclick: () => setQ({ page: page + 1 }) }, 'التالي') : null) : null,
    ]);
  }

  // ---------- generic form ----------
  async function uploadFile(file, kind) {
    const out = await api(`/admin/api/upload?kind=${kind}`, { method: 'POST', raw: file, contentType: file.type || 'application/octet-stream' });
    return out.url;
  }

  async function fieldInput(name, f, value, disabled) {
    const id = `f_${name}`;
    let input;
    if (f.type === 'bool') {
      input = h('input', { id, type: 'checkbox', name, checked: value === undefined || value === null ? !!f.default : !!value, disabled });
      return h('div', { class: 'f chk wide' }, input, h('label', { for: id }, f.label), f.hint ? h('span', { class: 'hint' }, `— ${f.hint}`) : null, h('span', { class: 'err' }));
    }
    if (f.ref) {
      const opts = await options(f.ref);
      input = h('select', { id, name, disabled }, h('option', { value: '' }, '— اختر —'), opts.map((o) => h('option', { value: o.id, selected: String(o.id) === String(value ?? '') }, o.label)));
    } else if (f.values) {
      const cur = value ?? f.default ?? '';
      input = h('select', { id, name, disabled }, f.required ? null : h('option', { value: '' }, '—'), f.values.map((v, i) => h('option', { value: v, selected: v === cur }, f.labels?.[i] || v)));
    } else if (f.input === 'textarea') {
      input = h('textarea', { id, name, class: 'in', disabled }, value ?? '');
    } else if (f.input === 'upload' || f.input === 'upload-video' || f.input === 'upload-any') {
      const kind = f.input === 'upload' ? 'image' : f.input === 'upload-video' ? 'video' : 'any';
      const text = h('input', { id, name, class: 'in', value: value ?? '', dir: 'ltr', disabled, placeholder: kind === 'image' ? '/uploads/…' : '/uploads/… أو رابط YouTube' });
      const prev = h('span');
      const showPrev = () => {
        const v = text.value;
        prev.replaceChildren(!v ? '' : /\.(mp4|webm)$/i.test(v) ? h('video', { src: v, muted: true }) : /^\/(uploads|img)\//.test(v) ? h('img', { src: v, alt: '' }) : '');
      };
      text.addEventListener('input', showPrev);
      showPrev();
      const file = h('input', { type: 'file', accept: kind === 'image' ? 'image/jpeg,image/png,image/webp' : kind === 'video' ? 'video/mp4,video/webm' : 'image/*,video/mp4,video/webm', hidden: true,
        onchange: async (e) => {
          const fl = e.target.files[0];
          if (!fl) return;
          btn.disabled = true; btn.textContent = 'جارٍ الرفع…';
          try { text.value = await uploadFile(fl, kind); showPrev(); toast('تم رفع الملف'); } catch (err) { toast(`فشل الرفع: ${err.message}`, true); }
          finally { btn.disabled = false; btn.textContent = 'رفع ملف'; }
        } });
      const btn = h('button', { type: 'button', class: 'btn ghost sm', disabled, onclick: () => file.click() }, 'رفع ملف');
      return h('div', { class: 'f wide' }, h('label', { for: id }, f.label), h('div', { class: 'up' }, prev, text, btn, file), f.hint ? h('span', { class: 'hint' }, f.hint) : null, h('span', { class: 'err' }));
    } else {
      const type = ['int', 'num', 'year'].includes(f.type) ? 'number' : f.input === 'password' ? 'password' : 'text';
      input = h('input', { id, name, class: 'in', type, value: f.virtual ? '' : value ?? '', step: f.type === 'num' ? 'any' : null, disabled, dir: ['slug', 'url'].includes(f.type) || name.endsWith('_en') || type !== 'text' ? 'ltr' : null, autocomplete: type === 'password' ? 'new-password' : null });
    }
    const wide = f.input === 'textarea';
    return h('div', { class: `f ${wide ? 'wide' : ''}` }, h('label', { for: id }, f.label, f.required ? ' *' : ''), input, f.hint ? h('span', { class: 'hint' }, f.hint) : null, h('span', { class: 'err' }));
  }

  function readForm(form, fields) {
    const out = {};
    for (const [name, f] of Object.entries(fields)) {
      const el = form.elements[name];
      if (!el) continue;
      if (f.type === 'bool') out[name] = el.checked;
      else if (f.virtual && !el.value) continue;
      else out[name] = el.value === '' ? null : el.value;
    }
    return out;
  }

  function showFieldErrors(form, errors = {}) {
    form.querySelectorAll('.f').forEach((d) => { d.classList.remove('bad'); const e = d.querySelector('.err'); if (e) e.textContent = ''; });
    for (const [k, v] of Object.entries(errors)) {
      const el = form.elements[k];
      const box = el?.closest?.('.f');
      if (box) { box.classList.add('bad'); box.querySelector('.err').textContent = v === 'required' ? 'مطلوب' : v; }
    }
  }

  async function formView(res, id, query) {
    const S = SCHEMA[res];
    if (!S) return shell('', h('p', {}, 'غير مسموح'));
    const isNew = id === 'new';
    const row = isNew ? { ...query } : await api(`/admin/api/r/${res}/${id}`);
    const disabled = !S.writable;
    const inputs = [];
    for (const [name, f] of Object.entries(S.fields)) inputs.push(await fieldInput(name, f, row[name], disabled));
    const form = h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const body = readForm(form, S.fields);
        const saved = isNew ? await api(`/admin/api/r/${res}`, { method: 'POST', body }) : await api(`/admin/api/r/${res}/${id}`, { method: 'PATCH', body });
        toast('تم الحفظ');
        clearOptions(res);
        showFieldErrors(form, {});
        if (isNew) go(`#/r/${res}/${saved.id}`);
      } catch (err) {
        showFieldErrors(form, err.errors);
        toast(err.errors ? 'راجع الحقول المظللة' : err.message, true);
      } finally { btn.disabled = false; }
    } },
    h('div', { class: 'form' }, inputs),
    h('div', { class: 'actions' },
      !disabled ? h('button', { class: 'btn', type: 'submit' }, isNew ? 'إضافة' : 'حفظ التغييرات') : null,
      h('a', { class: 'btn ghost', href: `#/r/${res}` }, 'رجوع'),
      !isNew && !disabled ? h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        if (!confirm('حذف هذا السجل نهائياً؟ لا يمكن التراجع.')) return;
        try { await api(`/admin/api/r/${res}/${id}`, { method: 'DELETE' }); clearOptions(res); toast('تم الحذف'); go(`#/r/${res}`); } catch (err) { toast(err.message, true); }
      } }, 'حذف') : null));

    const extra = [];
    if (!isNew && res === 'vehicles') extra.push(...(await vehicleExtras(row)));
    if (!isNew && res === 'screens') extra.push(h('p', {}, h('a', { href: `#/r/compat?screen_id=${row.id}` }, `عرض السيارات المرتبطة بهذه الشاشة (${row.car_count})`)));
    const publicLink = !isNew && row.slug && { vehicles: `/ar/car/${row.slug}`, screens: `/ar/screens/${row.slug}`, articles: `/ar/articles/${row.slug}`, brands: `/ar/brands/${row.slug}` }[res];
    shell(res, [
      h('h1', {}, isNew ? `إضافة — ${S.label}` : `تعديل — ${S.label} #${id}`, publicLink ? h('a', { href: publicLink, target: '_blank', style: 'font-size:.85rem;margin-inline-start:12px' }, 'عرض في الموقع ↗') : null),
      res === 'compat' ? h('div', { class: 'warn' }, 'لا يظهر الربط للعملاء إلا بعد تفعيل "تم التحقق الفني". لا تفعّله قبل التأكد من الإطار والضفيرة وأزرار المقود والكاميرا ونظام الصوت.') : null,
      (res === 'vehicles' || res === 'screens' || res === 'media') ? h('p', { class: 'muted' }, 'استخدم صوراً حقيقية لهذه السيارة/الشاشة. أي صورة غير مطابقة يجب تعليمها "توضيحية" وستظهر بعلامة واضحة للعميل.') : null,
      form, ...extra,
    ]);
  }

  async function vehicleExtras(v) {
    const compat = await api(`/admin/api/r/compat?vehicle_id=${v.id}&per=100`);
    const media = await api(`/admin/api/r/media?vehicle_id=${v.id}&per=100`);
    const vehicles = await options('vehicles');
    const copySel = h('select', {}, h('option', { value: '' }, 'نسخ روابط التوافق من سيارة أخرى…'), vehicles.filter((o) => o.id !== v.id).map((o) => h('option', { value: o.id }, o.label)));
    return [
      h('h2', {}, `الشاشات المرتبطة (${compat.total})`),
      h('div', { class: 'bar' },
        SCHEMA.compat?.writable ? h('a', { class: 'btn', href: `#/r/compat/new?vehicle_id=${v.id}` }, '+ ربط شاشة') : null,
        SCHEMA.compat?.writable ? copySel : null,
        SCHEMA.compat?.writable ? h('button', { class: 'btn ghost', onclick: async () => {
          if (!copySel.value) return;
          const r = await api('/admin/api/compat/copy', { method: 'POST', body: { from: Number(copySel.value), to: v.id } });
          toast(`تم نسخ ${r.copied} ربط — بانتظار التحقق`);
          route();
        } }, 'نسخ') : null),
      h('div', { class: 'tbl-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['screen', 'status', 'swc', 'install_price', 'verified'].map((c) => h('th', {}, COL_LABEL[c])))),
        h('tbody', {}, compat.rows.map((r) => h('tr', { onclick: () => go(`#/r/compat/${r.id}`) }, ['screen', 'status', 'swc', 'install_price', 'verified'].map((c) => h('td', {}, cell('compat', c, r)))))))),
      h('h2', {}, `صور وفيديوهات التركيب (${media.total})`),
      h('div', { class: 'bar' }, SCHEMA.media?.writable ? h('a', { class: 'btn', href: `#/r/media/new?vehicle_id=${v.id}` }, '+ إضافة صورة/فيديو') : null),
      h('div', { class: 'tbl-wrap' }, h('table', {}, h('tbody', {}, media.rows.map((r) => h('tr', { onclick: () => go(`#/r/media/${r.id}`) }, ['thumb', 'type', 'kind', 'caption_ar'].map((c) => h('td', {}, cell('media', c, r)))))))),
    ];
  }

  // ---------- orders ----------
  function intlPhone(p) {
    const d = String(p || '').replace(/\D/g, '');
    if (d.startsWith('05') && d.length === 10) return `966${d.slice(1)}`; // Saudi local → international
    if (d.startsWith('00')) return d.slice(2);
    return d;
  }
  async function orderView(id) {
    const o = await api(`/admin/api/r/orders/${id}`);
    const F = SCHEMA.orders.fields;
    const msg = `مرحباً ${o.name}، بخصوص طلبك رقم ${o.ref} لسيارة ${o.car.trim()}.`;
    const status = h('select', { name: 'status' }, F.status.values.map((v, i) => h('option', { value: v, selected: v === o.status }, F.status.labels[i])));
    const notes = h('textarea', { name: 'admin_notes', class: 'in' }, o.admin_notes || '');
    const dl = (pairs) => h('dl', { class: 'kv' }, pairs.filter(([, v]) => v !== null && v !== '' && v !== undefined).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
    shell('orders', [
      h('h1', {}, `طلب ${o.ref}`),
      h('div', { class: 'cols' },
        h('div', { class: 'card' },
          dl([['التاريخ', fmtDate(o.created_at)], ['العميل', o.name], ['الجوال', h('span', { dir: 'ltr' }, o.phone)], ['السيارة', o.car], ['الشاشة', o.screen || 'غير محددة'], ['المنطقة', o.region],
            ['الخدمة', SERVICE[o.service]], ['اللغة', o.lang === 'en' ? 'English' : 'العربية'], ['ملاحظات العميل', o.notes],
            ['صفحة السيارة', o.vehicle_id ? h('a', { href: `#/r/vehicles/${o.vehicle_id}` }, `#${o.vehicle_id}`) : null]]),
          h('div', { class: 'actions' },
            h('a', { class: 'btn wa', href: `https://wa.me/${intlPhone(o.phone)}?text=${encodeURIComponent(msg)}`, target: '_blank', rel: 'noopener' }, 'مراسلة العميل عبر واتساب'),
            h('a', { class: 'btn ghost', href: `tel:${o.phone}` }, 'اتصال')),
          o.photo ? h('div', {}, h('h2', {}, 'صورة التابلوه من العميل'), h('a', { href: `/admin/api/orders/${o.id}/photo`, target: '_blank' }, h('img', { class: 'order-photo', src: `/admin/api/orders/${o.id}/photo`, alt: 'صورة التابلوه' }))) : null),
        h('form', { class: 'card', onsubmit: async (e) => {
          e.preventDefault();
          try { await api(`/admin/api/r/orders/${id}`, { method: 'PATCH', body: { status: status.value, admin_notes: notes.value } }); toast('تم تحديث الطلب'); } catch (err) { toast(err.message, true); }
        } },
        h('div', { class: 'form' }, h('div', { class: 'f wide' }, h('label', {}, 'الحالة'), status), h('div', { class: 'f wide' }, h('label', {}, 'ملاحظات داخلية'), notes)),
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, 'حفظ'), h('a', { class: 'btn ghost', href: '#/r/orders' }, 'رجوع'),
          h('button', { type: 'button', class: 'btn danger', onclick: async () => {
            if (!confirm('حذف الطلب وبيانات العميل نهائياً؟')) return;
            await api(`/admin/api/r/orders/${id}`, { method: 'DELETE' }); toast('تم الحذف'); go('#/r/orders');
          } }, 'حذف بيانات العميل')))),
    ]);
  }

  // ---------- settings ----------
  const SETTINGS_FIELDS = [
    ['company_ar', 'اسم الشركة بالعربية'], ['company_en', 'اسم الشركة بالإنجليزية'], ['tagline_ar', 'الشعار النصي بالعربية'], ['tagline_en', 'الشعار النصي بالإنجليزية'],
    ['whatsapp', 'رقم واتساب (مع رمز الدولة، مثل 9665XXXXXXXX)'], ['phone', 'رقم الهاتف'], ['email', 'البريد الإلكتروني'],
    ['address_ar', 'العنوان بالعربية'], ['address_en', 'العنوان بالإنجليزية'], ['hours_ar', 'ساعات العمل بالعربية'], ['hours_en', 'ساعات العمل بالإنجليزية'],
    ['currency_ar', 'العملة بالعربية'], ['currency_en', 'العملة بالإنجليزية'], ['regions', 'المناطق (مفصولة بفاصلة)'],
    ['hero_image', 'الصورة الرئيسية', 'upload'], ['hero_kind', 'نوع الصورة الرئيسية', 'kind'],
    ['about_ar', 'نبذة "من نحن" بالعربية', 'textarea'], ['about_en', 'نبذة "من نحن" بالإنجليزية', 'textarea'],
    ['demo_mode', 'وضع العرض (يظهر شريط "بيانات تجريبية" للزوار)', 'bool'],
  ];
  async function settingsView() {
    const s = await api('/admin/api/settings');
    const inputs = [];
    for (const [k, label, kind] of SETTINGS_FIELDS) {
      if (kind === 'upload') inputs.push(await fieldInput(k, { label, input: 'upload' }, s[k]));
      else if (kind === 'kind') inputs.push(await fieldInput(k, { label, values: ['real', 'illustrative'], labels: ['صورة حقيقية', 'صورة توضيحية'], required: true }, s[k]));
      else if (kind === 'bool') inputs.push(await fieldInput(k, { label, type: 'bool' }, s[k] === '1'));
      else inputs.push(await fieldInput(k, { label, input: kind }, s[k]));
    }
    const form = h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      const body = {};
      for (const [k, , kind] of SETTINGS_FIELDS) body[k] = kind === 'bool' ? (form.elements[k].checked ? '1' : '0') : form.elements[k].value;
      try { await api('/admin/api/settings', { method: 'PATCH', body }); showFieldErrors(form, {}); toast('تم حفظ الإعدادات'); } catch (err) { showFieldErrors(form, err.errors); toast('راجع الحقول', true); }
    } }, h('div', { class: 'form' }, inputs), h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, 'حفظ')));
    shell('settings', [h('h1', {}, 'إعدادات الموقع'), form]);
  }

  function passwordView() {
    const form = h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      try { await api('/admin/api/password', { method: 'POST', body: { current: form.current.value, next: form.next.value } }); form.reset(); toast('تم تغيير كلمة المرور'); }
      catch (err) { toast(err.status === 422 && err.errors?.current ? 'كلمة المرور الحالية غير صحيحة' : 'كلمة المرور الجديدة 10 أحرف على الأقل', true); }
    } },
    h('div', { class: 'form' },
      h('div', { class: 'f' }, h('label', {}, 'كلمة المرور الحالية'), h('input', { class: 'in', type: 'password', name: 'current', autocomplete: 'current-password', dir: 'ltr', required: true })),
      h('div', { class: 'f' }, h('label', {}, 'كلمة المرور الجديدة (10 أحرف+)'), h('input', { class: 'in', type: 'password', name: 'next', autocomplete: 'new-password', dir: 'ltr', minlength: 10, required: true }))),
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, 'تغيير')));
    shell('password', [h('h1', {}, 'تغيير كلمة المرور'), form]);
  }

  // ---------- router ----------
  async function route() {
    if (!ME) return renderLogin();
    const { parts, query } = parseHash();
    try {
      if (!parts.length) return await dashboard();
      if (parts[0] === 'r' && parts[1] && !parts[2]) return await listView(parts[1], query);
      if (parts[0] === 'r' && parts[1] && parts[2]) return await formView(parts[1], parts[2], query);
      if (parts[0] === 'orders' && parts[1]) return await orderView(parts[1]);
      if (parts[0] === 'settings') return await settingsView();
      if (parts[0] === 'password') return passwordView();
      return await dashboard();
    } catch (err) {
      if (err.message !== '401') { console.error(err); toast(err.message, true); }
    }
  }
  window.addEventListener('hashchange', route);
  boot().catch(() => renderLogin());
})();
