(() => {
  'use strict';
  const lang = document.documentElement.lang === 'en' ? 'en' : 'ar';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Mobile nav
  const toggle = $('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const nav = $('#main-nav');
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // Before / after slider (range input drives a CSS variable; works with mouse, touch and keyboard)
  $$('[data-ba]').forEach((ba) => {
    const range = $('.ba-range', ba);
    const set = (v) => ba.style.setProperty('--pos', `${v}%`);
    range.addEventListener('input', () => set(range.value));
    set(range.value);
  });

  // Finder: cascading brand → model → year
  $$('[data-finder]').forEach((form) => {
    const brand = $('[data-f=brand]', form);
    const model = $('[data-f=model]', form);
    const year = $('[data-f=year]', form);
    const fill = (sel, items, placeholder) => {
      sel.innerHTML = '';
      sel.append(new Option(placeholder, ''));
      items.forEach((it) => sel.append(typeof it === 'object' ? new Option(it.name, it.slug) : new Option(String(it), String(it))));
      sel.disabled = items.length === 0;
    };
    const ph = (s) => s.options[0]?.textContent || '';
    brand.addEventListener('change', async () => {
      fill(year, [], ph(year));
      if (!brand.value) return fill(model, [], ph(model));
      const res = await fetch(`/api/models?brand=${encodeURIComponent(brand.value)}&lang=${lang}`);
      fill(model, await res.json(), ph(model));
      model.focus();
    });
    model.addEventListener('change', async () => {
      if (!model.value) return fill(year, [], ph(year));
      const res = await fetch(`/api/years?brand=${encodeURIComponent(brand.value)}&model=${encodeURIComponent(model.value)}`);
      const years = await res.json();
      fill(year, years, ph(year));
      if (!years.length) form.submit(); // let the server show the "not listed yet" page
      else year.focus();
    });
    year.addEventListener('change', () => { if (year.value) form.submit(); });
  });

  // Client-side list filter (brands page)
  $$('[data-filter]').forEach((input) => {
    const items = $$(input.dataset.filter);
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      items.forEach((li) => { li.hidden = q && !li.dataset.text.toLowerCase().includes(q); });
    });
  });

  // Lightbox
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-lightbox]');
    if (!a) return;
    e.preventDefault();
    const box = document.createElement('div');
    box.className = 'lb';
    box.setAttribute('role', 'dialog');
    const img = new Image();
    img.src = a.getAttribute('href');
    img.alt = $('img', a)?.alt || '';
    box.append(img);
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    box.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.append(box);
  });

  // Order form
  const MSG = {
    ar: { required: 'هذا الحقل مطلوب', phone: 'رقم جوال غير صحيح', invalid: 'قيمة غير صحيحة', photo: 'الصورة غير صالحة أو كبيرة جداً', network: 'تعذر الاتصال، حاول مرة أخرى.' },
    en: { required: 'This field is required', phone: 'Invalid mobile number', invalid: 'Invalid value', photo: 'Image is invalid or too large', network: 'Connection failed, please try again.' },
  }[lang];

  async function shrinkImage(file) {
    if (file.size < 1.5 * 1024 * 1024) return readAsDataUrl(file);
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return readAsDataUrl(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }
  const readAsDataUrl = (file) => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(file); });

  $$('[data-order]').forEach((form) => {
    const msg = $('.form-msg', form);
    const btn = $('button[type=submit]', form);
    const showErrors = (errors) => {
      $$('label', form).forEach((l) => { l.classList.remove('invalid'); const em = $('.err', l); if (em) em.textContent = ''; });
      Object.entries(errors).forEach(([name, code]) => {
        const field = form.elements[name];
        const label = field && (field.closest ? field.closest('label') : null);
        if (!label) return;
        label.classList.add('invalid');
        const em = $('.err', label);
        if (em) em.textContent = MSG[code] || (code === 'required' ? MSG.required : name === 'phone' ? MSG.phone : name === 'photo' ? MSG.photo : MSG.invalid);
      });
      const first = Object.keys(errors)[0];
      if (first && form.elements[first]?.focus) form.elements[first].focus();
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.hidden = true;
      const fd = new FormData(form);
      const data = Object.fromEntries([...fd.entries()].filter(([k]) => k !== 'photo'));
      // Light client checks (server validates everything again)
      const errors = {};
      $$('[required]', form).forEach((f) => { if (!String(f.value).trim()) errors[f.name] = 'required'; });
      if (data.phone && !/^\+?[\d٠-٩۰-۹\s\-()]{8,20}$/.test(data.phone)) errors.phone = 'phone';
      if (Object.keys(errors).length) return showErrors(errors);
      showErrors({});
      const file = form.elements.photo?.files?.[0];
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = btn.dataset.sending;
      try {
        if (file) {
          if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { showErrors({ photo: 'photo' }); return; }
          data.photo = await shrinkImage(file);
        }
        const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const out = await res.json().catch(() => ({}));
        if (res.status === 201) {
          form.hidden = true;
          const ok = form.nextElementSibling;
          ok.hidden = false;
          $('.order-ref', ok).textContent = out.ref;
          if (out.whatsapp) $$('.wa-follow', ok).forEach((el) => { el.hidden = false; if (el.tagName === 'A') el.href = out.whatsapp; });
          ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (out.errors) showErrors(Object.fromEntries(Object.entries(out.errors).map(([k, v]) => [k, v === 'required' ? 'required' : k === 'phone' ? 'phone' : k === 'photo' ? 'photo' : 'invalid'])));
        msg.textContent = res.status === 429 ? (lang === 'ar' ? 'طلبات كثيرة، حاول لاحقاً.' : 'Too many requests, try later.') : form.dataset.error || (lang === 'ar' ? 'تعذر إرسال الطلب. راجع الحقول وحاول مرة أخرى.' : 'Could not send. Check the fields and try again.');
        msg.hidden = false;
      } catch {
        msg.textContent = MSG.network;
        msg.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  });
})();
