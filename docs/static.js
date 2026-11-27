(() => {
  const lang = document.documentElement.lang === 'en' ? 'en' : 'ar';
  const root = window.__ROOT || '.';
  const F = window.__FINDER || {};
  document.querySelectorAll('[data-finder-static]').forEach((form) => {
    const [brand, model, year] = ['brand', 'model', 'year'].map((n) => form.querySelector(`[data-f=${n}]`));
    const fill = (sel, items) => { const ph = sel.options[0].textContent; sel.innerHTML = ''; sel.append(new Option(ph, '')); items.forEach(([v, t]) => sel.append(new Option(t, v))); sel.disabled = !items.length; };
    const go = () => {
      const m = F[brand.value]?.[model.value];
      if (!m) return;
      const hits = m.vehicles.filter((v) => v.from <= +year.value && (v.to || 9999) >= +year.value);
      location.href = hits.length === 1 ? `${root}/${lang}/car/${hits[0].slug}.html` : `${root}/${lang}/brands/${brand.value}/${model.value}.html`;
    };
    brand.addEventListener('change', () => { fill(year, []); fill(model, Object.entries(F[brand.value] || {}).map(([s, m]) => [s, m[lang]])); });
    model.addEventListener('change', () => fill(year, (F[brand.value]?.[model.value]?.years || []).map((y) => [y, y])));
    year.addEventListener('change', () => year.value && go());
    form.addEventListener('submit', (e) => { e.preventDefault(); if (year.value) go(); });
  });
  document.querySelectorAll('[data-order-static]').forEach((form) => {
    const msg = form.querySelector('.form-msg');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      msg.style.background = '#e3f6fd'; msg.style.color = '#0a5f82';
      msg.textContent = lang === 'ar' ? 'هذه معاينة ثابتة، لذلك لم يُرسَل الطلب. في الموقع المنشور يُحفظ الطلب في لوحة التحكم ويحصل العميل على رقم طلب ورابط واتساب.' : 'This is a static preview, so nothing was sent. On the live site the request is saved to the admin dashboard and the customer gets a reference number and a WhatsApp link.';
      msg.hidden = false;
    });
  });
})();
