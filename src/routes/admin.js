import fs from 'node:fs';
import path from 'node:path';
import { getDb, getSettings, DEFAULT_SETTINGS } from '../db.js';
import { config, ROOT } from '../config.js';
import { HttpError, parseBody, readBody, sendJson, serveStatic, clientIp } from '../http.js';
import { validate, compatRules } from '../validate.js';
import { login, logout, currentSession, requireAuth, rateLimit, can, hashPassword, verifyPassword, PERMISSIONS } from '../auth.js';
import { saveUpload, privatePath } from '../uploads.js';
import { slugify } from '../seed.js';

const yesno = { type: 'bool' };
const media = (label) => ({ type: 'media', label, input: 'upload' });

// Resource registry: drives validation, SQL, and the admin UI forms.
export const RESOURCES = {
  brands: {
    label: 'الماركات', perm: 'catalog', table: 'brands',
    fields: {
      name_ar: { type: 'str', required: true, label: 'الاسم بالعربية' },
      name_en: { type: 'str', required: true, label: 'الاسم بالإنجليزية' },
      slug: { type: 'slug', label: 'الرابط (slug)', hint: 'يُولّد تلقائياً إن تُرك فارغاً' },
      country: { type: 'str', max: 4, label: 'بلد المنشأ' },
      logo: media('الشعار'),
      featured: { ...yesno, label: 'تظهر في الرئيسية' },
      sort: { type: 'int', min: 0, max: 9999, default: 0, label: 'الترتيب' },
    },
    columns: ['id', 'name_ar', 'name_en', 'slug', 'model_count', 'featured'],
    select: 'SELECT t.*, (SELECT COUNT(*) FROM models m WHERE m.brand_id = t.id) AS model_count FROM brands t',
    search: ['t.name_ar', 't.name_en', 't.slug'],
    order: 't.sort, t.name_en',
    autoSlug: (d) => slugify(d.name_en),
  },
  models: {
    label: 'الموديلات', perm: 'catalog', table: 'models',
    fields: {
      brand_id: { type: 'int', required: true, ref: 'brands', label: 'الماركة' },
      name_ar: { type: 'str', required: true, label: 'الاسم بالعربية' },
      name_en: { type: 'str', required: true, label: 'الاسم بالإنجليزية' },
      slug: { type: 'slug', label: 'الرابط (slug)', hint: 'يُولّد تلقائياً' },
      body_type: { type: 'enum', values: ['sedan', 'suv', 'pickup', 'hatch', 'van', 'coupe'], labels: ['سيدان', 'SUV', 'بيك أب', 'هاتشباك', 'فان', 'كوبيه'], label: 'نوع الهيكل' },
      image: media('صورة'),
      featured: { ...yesno, label: 'مميز' },
    },
    columns: ['id', 'brand', 'name_ar', 'name_en', 'vehicle_count'],
    select: `SELECT t.*, b.name_ar AS brand, (SELECT COUNT(*) FROM vehicles v WHERE v.model_id = t.id) AS vehicle_count FROM models t JOIN brands b ON b.id = t.brand_id`,
    search: ['t.name_ar', 't.name_en', 'b.name_en', 'b.name_ar'],
    filters: ['brand_id'],
    order: 'b.name_en, t.name_en',
    autoSlug: (d) => slugify(d.name_en),
  },
  vehicles: {
    label: 'السيارات (سنة/فئة/تابلوه)', perm: 'catalog', table: 'vehicles',
    fields: {
      model_id: { type: 'int', required: true, ref: 'models', label: 'الموديل' },
      year_from: { type: 'year', required: true, label: 'من سنة' },
      year_to: { type: 'year', label: 'إلى سنة', hint: 'اتركه فارغاً إن كان مستمراً' },
      trim_ar: { type: 'str', label: 'الفئة بالعربية' },
      trim_en: { type: 'str', label: 'الفئة بالإنجليزية' },
      dash_code: { type: 'str', max: 40, label: 'رمز شكل التابلوه', hint: 'مثال: OEM-RADIO, OEM-8, OEM-2DIN' },
      dash_ar: { type: 'str', label: 'وصف التابلوه بالعربية' },
      dash_en: { type: 'str', label: 'وصف التابلوه بالإنجليزية' },
      oem_audio: { type: 'enum', values: ['standard', 'premium'], labels: ['قياسي', 'مميز (أمبليفاير)'], default: 'standard', label: 'نظام الصوت الأصلي' },
      has_oem_camera: { ...yesno, label: 'كاميرا خلفية أصلية' },
      has_360: { ...yesno, label: 'كاميرا 360 أصلية' },
      has_sensors: { ...yesno, label: 'حساسات أصلية' },
      has_swc: { ...yesno, label: 'أزرار عجلة القيادة' },
      exterior_img: media('صورة السيارة من الخارج'),
      before_img: media('صورة التابلوه قبل التركيب'),
      after_img: media('صورة التابلوه بعد التركيب'),
      images_kind: { type: 'enum', values: ['real', 'illustrative'], labels: ['صور حقيقية لهذه السيارة', 'صور توضيحية (ستُعلَّم بوضوح)'], default: 'illustrative', label: 'نوع الصور', required: true },
      video_url: { type: 'video', label: 'فيديو التركيب', hint: 'رابط YouTube أو ملف مرفوع', input: 'upload-video' },
      notes_ar: { type: 'text', label: 'ملاحظات بالعربية', input: 'textarea' },
      notes_en: { type: 'text', label: 'ملاحظات بالإنجليزية', input: 'textarea' },
      slug: { type: 'slug', label: 'الرابط (slug)', hint: 'يُولّد تلقائياً' },
      featured: { ...yesno, label: 'مميزة في الرئيسية' },
      published: { ...yesno, default: 1, label: 'منشورة' },
    },
    columns: ['id', 'brand', 'model', 'year_from', 'year_to', 'trim_ar', 'dash_code', 'compat_count', 'images_kind', 'published'],
    select: `SELECT t.*, b.name_en AS brand, m.name_en AS model,
             (SELECT COUNT(*) FROM compat c WHERE c.vehicle_id = t.id AND c.verified = 1) AS compat_count
             FROM vehicles t JOIN models m ON m.id = t.model_id JOIN brands b ON b.id = m.brand_id`,
    search: ['b.name_en', 'b.name_ar', 'm.name_en', 'm.name_ar', 't.trim_ar', 't.trim_en', 't.dash_code'],
    filters: ['model_id'],
    order: 'b.name_en, m.name_en, t.year_from DESC',
    autoSlug: (d, db) => {
      const r = db.prepare('SELECT b.slug AS b, m.slug AS m FROM models m JOIN brands b ON b.id = m.brand_id WHERE m.id = ?').get(d.model_id);
      return slugify(`${r?.b}-${r?.m}-${d.year_from}-${d.year_to || 'now'}-${d.trim_en || d.dash_code || ''}`);
    },
    check: (d) => (d.year_to && d.year_to < d.year_from ? { year_to: 'must be ≥ year_from' } : {}),
  },
  screens: {
    label: 'الشاشات', perm: 'catalog', table: 'screens',
    fields: {
      name_ar: { type: 'str', required: true, label: 'الاسم بالعربية' },
      name_en: { type: 'str', required: true, label: 'الاسم بالإنجليزية' },
      model_code: { type: 'str', required: true, max: 40, label: 'رمز الموديل' },
      size_in: { type: 'num', required: true, min: 5, max: 20, label: 'الحجم (بوصة)' },
      os: { type: 'str', default: 'Android', label: 'نظام التشغيل' },
      os_version: { type: 'str', max: 20, label: 'إصدار النظام' },
      cpu: { type: 'str', label: 'المعالج' },
      ram_gb: { type: 'int', min: 0, max: 64, required: true, label: 'RAM (GB)' },
      rom_gb: { type: 'int', min: 0, max: 2048, required: true, label: 'ROM (GB)' },
      resolution: { type: 'str', max: 30, label: 'الدقة' },
      panel: { type: 'str', max: 30, label: 'نوع اللوحة' },
      wifi: { ...yesno, default: 1, label: 'Wi-Fi' },
      bluetooth: { ...yesno, default: 1, label: 'Bluetooth' },
      gps: { ...yesno, default: 1, label: 'GPS' },
      sim4g: { ...yesno, label: 'شريحة 4G' },
      carplay: { type: 'enum', values: ['none', 'wired', 'wireless'], labels: ['لا', 'سلكي', 'لاسلكي'], default: 'none', label: 'Apple CarPlay' },
      android_auto: { type: 'enum', values: ['none', 'wired', 'wireless'], labels: ['لا', 'سلكي', 'لاسلكي'], default: 'none', label: 'Android Auto' },
      rear_cam: { ...yesno, default: 1, label: 'دعم كاميرا خلفية' },
      cam360: { ...yesno, label: 'دعم كاميرات 360' },
      dsp: { ...yesno, label: 'DSP' },
      audio_ar: { type: 'text', max: 500, label: 'مواصفات الصوت بالعربية', input: 'textarea' },
      audio_en: { type: 'text', max: 500, label: 'مواصفات الصوت بالإنجليزية', input: 'textarea' },
      price: { type: 'num', min: 0, label: 'السعر' },
      sale_price: { type: 'num', min: 0, label: 'سعر العرض' },
      offer_ar: { type: 'str', label: 'نص العرض بالعربية' },
      offer_en: { type: 'str', label: 'نص العرض بالإنجليزية' },
      warranty_months: { type: 'int', min: 0, max: 120, default: 12, label: 'الضمان (شهور)' },
      image: media('صورة المنتج'),
      image_kind: { type: 'enum', values: ['real', 'illustrative'], labels: ['صورة حقيقية للمنتج', 'صورة توضيحية'], default: 'illustrative', required: true, label: 'نوع الصورة' },
      desc_ar: { type: 'text', label: 'الوصف بالعربية', input: 'textarea' },
      desc_en: { type: 'text', label: 'الوصف بالإنجليزية', input: 'textarea' },
      slug: { type: 'slug', label: 'الرابط (slug)', hint: 'يُولّد تلقائياً' },
      featured: { ...yesno, label: 'مميزة' },
      published: { ...yesno, default: 1, label: 'منشورة' },
    },
    columns: ['id', 'name_ar', 'model_code', 'size_in', 'ram_gb', 'rom_gb', 'price', 'sale_price', 'car_count', 'published'],
    select: `SELECT t.*, (SELECT COUNT(*) FROM compat c WHERE c.screen_id = t.id AND c.verified = 1 AND c.status != 'incompatible') AS car_count FROM screens t`,
    search: ['t.name_ar', 't.name_en', 't.model_code'],
    order: 't.created_at DESC, t.id DESC',
    autoSlug: (d) => slugify(`${d.name_en}`),
    check: (d) => (d.sale_price && d.price && d.sale_price > d.price ? { sale_price: 'must be ≤ price' } : {}),
  },
  compat: {
    label: 'ربط التوافق', perm: 'catalog', table: 'compat',
    fields: {
      vehicle_id: { type: 'int', required: true, ref: 'vehicles', label: 'السيارة' },
      screen_id: { type: 'int', required: true, ref: 'screens', label: 'الشاشة' },
      status: { type: 'enum', values: ['compatible', 'modified', 'incompatible'], labels: ['متوافق', 'متوافق مع تعديلات', 'غير متوافق'], required: true, label: 'حالة التوافق' },
      frame: { type: 'str', label: 'الإطار المناسب' },
      harness: { type: 'str', label: 'الضفيرة والتوصيلات' },
      canbus: { type: 'str', label: 'صندوق CANBUS' },
      swc: { type: 'enum', values: ['supported', 'adapter', 'unsupported', 'na'], labels: ['مدعومة', 'تحتاج محوّل', 'غير مدعومة', 'لا توجد'], default: 'supported', label: 'أزرار عجلة القيادة' },
      camera: { type: 'str', label: 'الكاميرا' },
      sensors: { type: 'str', label: 'الحساسات' },
      oem_audio: { type: 'str', label: 'نظام الصوت الأصلي' },
      mods_ar: { type: 'text', max: 1000, label: 'التعديلات المطلوبة بالعربية', input: 'textarea' },
      mods_en: { type: 'text', max: 1000, label: 'التعديلات المطلوبة بالإنجليزية', input: 'textarea' },
      install_price: { type: 'num', min: 0, label: 'تكلفة التركيب' },
      frame_price: { type: 'num', min: 0, label: 'سعر الإطار' },
      verified: { ...yesno, label: '✔ تم التحقق الفني (يظهر للعملاء)', hint: 'لا يظهر الربط في الموقع إلا بعد التحقق' },
    },
    columns: ['id', 'vehicle', 'screen', 'status', 'swc', 'install_price', 'verified'],
    select: `SELECT t.*, (b.name_en || ' ' || m.name_en || ' ' || v.year_from || '-' || COALESCE(v.year_to,'') || ' ' || v.trim_ar) AS vehicle, s.name_ar AS screen
             FROM compat t JOIN vehicles v ON v.id = t.vehicle_id JOIN models m ON m.id = v.model_id JOIN brands b ON b.id = m.brand_id JOIN screens s ON s.id = t.screen_id`,
    search: ['b.name_en', 'm.name_en', 's.name_ar', 's.name_en', 's.model_code'],
    filters: ['vehicle_id', 'screen_id', 'verified', 'status'],
    order: 't.verified ASC, t.updated_at DESC',
    check: (d) => compatRules(d),
  },
  media: {
    label: 'الصور والفيديو', perm: 'catalog', table: 'media',
    fields: {
      type: { type: 'enum', values: ['image', 'video'], labels: ['صورة', 'فيديو'], default: 'image', label: 'النوع' },
      url: { type: 'str', required: true, max: 300, label: 'الملف', input: 'upload-any' },
      kind: { type: 'enum', values: ['real', 'illustrative'], labels: ['حقيقية (تركيب فعلي)', 'توضيحية'], required: true, label: 'حقيقية أم توضيحية' },
      vehicle_id: { type: 'int', ref: 'vehicles', label: 'السيارة' },
      screen_id: { type: 'int', ref: 'screens', label: 'الشاشة' },
      caption_ar: { type: 'str', label: 'التعليق بالعربية' },
      caption_en: { type: 'str', label: 'التعليق بالإنجليزية' },
      in_gallery: { ...yesno, default: 1, label: 'يظهر في معرض الأعمال' },
      sort: { type: 'int', min: 0, max: 9999, default: 0, label: 'الترتيب' },
    },
    columns: ['id', 'thumb', 'type', 'kind', 'vehicle', 'caption_ar', 'in_gallery'],
    select: `SELECT t.*, t.url AS thumb, (b.name_en || ' ' || m.name_en || ' ' || v.year_from) AS vehicle FROM media t
             LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN models m ON m.id = v.model_id LEFT JOIN brands b ON b.id = m.brand_id`,
    search: ['t.caption_ar', 't.caption_en', 'm.name_en'],
    filters: ['vehicle_id', 'screen_id'],
    order: 't.created_at DESC, t.id DESC',
    check: (d) => {
      const isMedia = /^\/(uploads|img)\/[A-Za-z0-9._\-/]+$/.test(d.url || '') && !String(d.url).includes('..');
      const isYt = /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(d.url || '');
      if (!isMedia && !(d.type === 'video' && isYt)) return { url: 'uploaded file or YouTube link (videos)' };
      return {};
    },
  },
  articles: {
    label: 'المقالات', perm: 'content', table: 'articles',
    fields: {
      title_ar: { type: 'str', required: true, label: 'العنوان بالعربية' },
      title_en: { type: 'str', required: true, label: 'العنوان بالإنجليزية' },
      slug: { type: 'slug', label: 'الرابط (slug)', hint: 'يُولّد تلقائياً' },
      excerpt_ar: { type: 'str', max: 300, label: 'مقتطف بالعربية' },
      excerpt_en: { type: 'str', max: 300, label: 'مقتطف بالإنجليزية' },
      body_ar: { type: 'text', max: 50000, label: 'النص بالعربية', input: 'textarea', hint: 'افصل الفقرات بسطر فارغ' },
      body_en: { type: 'text', max: 50000, label: 'النص بالإنجليزية', input: 'textarea' },
      cover: media('صورة الغلاف'),
      published: { ...yesno, default: 1, label: 'منشور' },
    },
    columns: ['id', 'title_ar', 'slug', 'published', 'created_at'],
    select: 'SELECT t.* FROM articles t',
    search: ['t.title_ar', 't.title_en'],
    order: 't.created_at DESC',
    autoSlug: (d) => slugify(d.title_en),
  },
  faqs: {
    label: 'الأسئلة الشائعة', perm: 'content', table: 'faqs',
    fields: {
      q_ar: { type: 'str', required: true, max: 300, label: 'السؤال بالعربية' },
      q_en: { type: 'str', required: true, max: 300, label: 'السؤال بالإنجليزية' },
      a_ar: { type: 'text', required: true, label: 'الإجابة بالعربية', input: 'textarea' },
      a_en: { type: 'text', required: true, label: 'الإجابة بالإنجليزية', input: 'textarea' },
      sort: { type: 'int', min: 0, max: 9999, default: 0, label: 'الترتيب' },
      published: { ...yesno, default: 1, label: 'منشور' },
    },
    columns: ['id', 'q_ar', 'sort', 'published'],
    select: 'SELECT t.* FROM faqs t',
    search: ['t.q_ar', 't.q_en'],
    order: 't.sort, t.id',
  },
  orders: {
    label: 'طلبات العملاء', perm: 'orders', table: 'orders', noCreate: true,
    fields: {
      status: { type: 'enum', values: ['new', 'contacted', 'quoted', 'booked', 'done', 'cancelled'], labels: ['جديد', 'تم التواصل', 'تم إرسال عرض', 'محجوز', 'مكتمل', 'ملغي'], required: true, label: 'الحالة' },
      admin_notes: { type: 'text', max: 2000, label: 'ملاحظات داخلية', input: 'textarea' },
    },
    columns: ['ref', 'created_at', 'name', 'phone', 'car', 'screen', 'region', 'service', 'status'],
    select: `SELECT t.*, (t.brand_text || ' ' || t.model_text || ' ' || COALESCE(t.year,'') || ' ' || t.trim_text) AS car, s.name_ar AS screen
             FROM orders t LEFT JOIN screens s ON s.id = t.screen_id`,
    search: ['t.name', 't.phone', 't.ref', 't.brand_text', 't.model_text', 't.region'],
    filters: ['status'],
    order: "CASE t.status WHEN 'new' THEN 0 ELSE 1 END, t.created_at DESC",
  },
  users: {
    label: 'المستخدمون والصلاحيات', perm: 'users', table: 'users',
    fields: {
      username: { type: 'str', required: true, min: 3, max: 40, pattern: /^[a-z0-9._-]+$/, label: 'اسم الدخول' },
      name: { type: 'str', label: 'الاسم' },
      role: { type: 'enum', values: ['admin', 'editor', 'sales'], labels: ['مدير (كل الصلاحيات)', 'محرر (الكتالوج والمحتوى)', 'مبيعات (الطلبات)'], required: true, label: 'الدور' },
      password: { type: 'str', min: 10, max: 200, label: 'كلمة المرور', input: 'password', hint: '10 أحرف على الأقل. اتركه فارغاً لعدم التغيير', virtual: true },
      active: { ...yesno, default: 1, label: 'نشط' },
    },
    columns: ['id', 'username', 'name', 'role', 'active', 'created_at'],
    select: 'SELECT t.id, t.username, t.name, t.role, t.active, t.created_at, t.updated_at FROM users t',
    search: ['t.username', 't.name'],
    order: 't.id',
  },
};

const OPTION_SQL = {
  brands: "SELECT id, name_en || ' — ' || name_ar AS label FROM brands ORDER BY sort, name_en",
  models: "SELECT m.id, b.name_en || ' ' || m.name_en || ' — ' || m.name_ar AS label FROM models m JOIN brands b ON b.id = m.brand_id ORDER BY b.name_en, m.name_en",
  vehicles: `SELECT v.id, b.name_en || ' ' || m.name_en || ' ' || v.year_from || '–' || COALESCE(v.year_to, '') || ' · ' || v.trim_ar || ' · ' || v.dash_code AS label
             FROM vehicles v JOIN models m ON m.id = v.model_id JOIN brands b ON b.id = m.brand_id ORDER BY b.name_en, m.name_en, v.year_from DESC`,
  screens: "SELECT id, name_ar || ' (' || model_code || ', ' || size_in || '″)' AS label FROM screens ORDER BY size_in, name_en",
};

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS).concat(['demo_mode']);

function resource(name, user, write = false) {
  const R = RESOURCES[name];
  if (!R) throw new HttpError(404, 'Unknown resource');
  if (!can(user, write ? R.perm : `${R.perm}:read`)) throw new HttpError(403, 'Forbidden');
  return R;
}

function dbError(e) {
  const m = String(e.message || '');
  if (m.includes('UNIQUE')) return new HttpError(409, 'Duplicate: this record (or slug) already exists');
  if (m.includes('FOREIGN KEY')) return new HttpError(409, 'Linked record missing or still in use');
  if (m.includes('CHECK')) return new HttpError(422, 'Invalid value');
  return e;
}

function getRow(R, id) {
  return getDb().prepare(`${R.select} WHERE t.id = ?`).get(id);
}

function saveRecord(name, R, user, id, input) {
  const db = getDb();
  const existing = id ? db.prepare(`SELECT * FROM ${R.table} WHERE id = ?`).get(id) : null;
  if (id && !existing) throw new HttpError(404, 'Not found');
  const { ok, data, errors } = validate(R.fields, input, { partial: !!id });
  if (!ok) throw new HttpError(422, 'Validation failed', errors);
  const merged = { ...(existing || {}), ...data };
  if (R.autoSlug && R.fields.slug && !merged.slug) {
    merged.slug = R.autoSlug(merged, db) || `item-${Date.now()}`;
    data.slug = merged.slug;
  }
  const extra = R.check ? R.check(merged) : {};
  if (Object.keys(extra).length) throw new HttpError(422, 'Validation failed', extra);

  // Resource-specific handling
  if (name === 'users') {
    if (data.password) data.pass_hash = hashPassword(data.password);
    else if (!id) throw new HttpError(422, 'Validation failed', { password: 'required' });
    delete data.password;
    data.username = data.username?.toLowerCase() ?? undefined;
    if (data.username === undefined) delete data.username;
    if (id === user.id && (data.role && data.role !== 'admin' || data.active === 0)) throw new HttpError(422, 'You cannot demote or deactivate yourself');
  }
  if (name === 'compat') {
    const nowVerified = merged.verified === 1;
    if (nowVerified && !can(user, 'verify')) throw new HttpError(403, 'Not allowed to verify compatibility');
    if (nowVerified && (!existing || !existing.verified || Object.keys(data).some((k) => k !== 'verified'))) {
      data.verified_by = user.id;
      data.verified_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    if (!nowVerified) { data.verified_by = null; data.verified_at = null; }
  }

  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  const cols = Object.keys(data);
  try {
    if (id) {
      if (cols.length) db.prepare(`UPDATE ${R.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...cols.map((c) => data[c]), id);
      return id;
    }
    const r = db.prepare(`INSERT INTO ${R.table}(${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => data[c]));
    return Number(r.lastInsertRowid);
  } catch (e) {
    throw dbError(e);
  }
}

export function registerAdmin(r) {
  r.get('/admin', (ctx) => {
    const ok = serveStatic(ctx.req, ctx.res, path.join(ROOT, 'public', 'admin'), '/index.html', { maxAge: 0 });
    if (!ok) throw new HttpError(404, 'Not found');
  });

  r.post('/admin/api/login', async (ctx) => {
    rateLimit(`login:${clientIp(ctx.req)}`, 10, 15 * 60 * 1000);
    const body = await parseBody(ctx.req, 10000);
    const user = login(ctx.res, body.username, body.password);
    if (!user) throw new HttpError(401, 'Wrong username or password');
    sendJson(ctx.res, 200, { ok: true });
  });

  r.post('/admin/api/logout', (ctx) => {
    requireAuth(ctx);
    logout(ctx.req, ctx.res);
    sendJson(ctx.res, 200, { ok: true });
  });

  r.get('/admin/api/me', (ctx) => {
    const s = currentSession(ctx.req);
    if (!s) return sendJson(ctx.res, 200, { user: null });
    sendJson(ctx.res, 200, { user: s.user, csrf: s.csrf, perms: PERMISSIONS[s.user.role] });
  });

  r.post('/admin/api/password', async (ctx) => {
    const user = requireAuth(ctx);
    const body = await parseBody(ctx.req, 10000);
    const row = getDb().prepare('SELECT pass_hash FROM users WHERE id = ?').get(user.id);
    if (!verifyPassword(String(body.current || ''), row.pass_hash)) throw new HttpError(422, 'Current password is wrong', { current: 'wrong' });
    if (String(body.next || '').length < 10) throw new HttpError(422, 'Validation failed', { next: 'min 10 chars' });
    getDb().prepare("UPDATE users SET pass_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hashPassword(String(body.next)), user.id);
    sendJson(ctx.res, 200, { ok: true });
  });

  r.get('/admin/api/schema', (ctx) => {
    const user = requireAuth(ctx);
    const out = {};
    for (const [name, R] of Object.entries(RESOURCES)) {
      if (!can(user, `${R.perm}:read`)) continue;
      out[name] = {
        label: R.label, columns: R.columns, filters: R.filters || [], noCreate: !!R.noCreate, writable: can(user, R.perm),
        fields: Object.fromEntries(Object.entries(R.fields).map(([k, f]) => [k, { ...f, pattern: undefined }])),
      };
    }
    sendJson(ctx.res, 200, out);
  });

  r.get('/admin/api/options/:res', (ctx) => {
    const user = requireAuth(ctx);
    const sql = OPTION_SQL[ctx.params.res];
    if (!sql || !can(user, 'catalog:read')) throw new HttpError(404, 'Not found');
    sendJson(ctx.res, 200, getDb().prepare(sql).all());
  });

  r.get('/admin/api/r/:res', (ctx) => {
    const user = requireAuth(ctx);
    const R = resource(ctx.params.res, user);
    const sp = ctx.url.searchParams;
    const where = [];
    const args = [];
    const term = (sp.get('q') || '').trim().slice(0, 100);
    if (term && R.search) {
      where.push(`(${R.search.map((c) => `${c} LIKE ?`).join(' OR ')})`);
      for (let i = 0; i < R.search.length; i++) args.push(`%${term}%`);
    }
    for (const f of R.filters || []) {
      const v = sp.get(f);
      if (v !== null && v !== '') { where.push(`t.${f} = ?`); args.push(v); }
    }
    const per = Math.min(200, Math.max(1, parseInt(sp.get('per') || '25', 10) || 25));
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) n FROM (${R.select} ${w})`).get(...args).n;
    const rows = db.prepare(`${R.select} ${w} ORDER BY ${R.order} LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
    if (ctx.params.res === 'users') rows.forEach((row) => delete row.pass_hash);
    sendJson(ctx.res, 200, { rows, total, page, pages: Math.max(1, Math.ceil(total / per)) });
  });

  r.get('/admin/api/r/:res/:id', (ctx) => {
    const user = requireAuth(ctx);
    const R = resource(ctx.params.res, user);
    const row = getRow(R, Number(ctx.params.id));
    if (!row) throw new HttpError(404, 'Not found');
    delete row.pass_hash;
    sendJson(ctx.res, 200, row);
  });

  r.post('/admin/api/r/:res', async (ctx) => {
    const user = requireAuth(ctx);
    const R = resource(ctx.params.res, user, true);
    if (R.noCreate) throw new HttpError(405, 'Not allowed');
    const id = saveRecord(ctx.params.res, R, user, null, await parseBody(ctx.req));
    sendJson(ctx.res, 201, getRow(R, id));
  });

  r.patch('/admin/api/r/:res/:id', async (ctx) => {
    const user = requireAuth(ctx);
    const R = resource(ctx.params.res, user, true);
    const id = saveRecord(ctx.params.res, R, user, Number(ctx.params.id), await parseBody(ctx.req));
    const row = getRow(R, id);
    delete row?.pass_hash;
    sendJson(ctx.res, 200, row);
  });

  r.delete('/admin/api/r/:res/:id', (ctx) => {
    const user = requireAuth(ctx);
    const R = resource(ctx.params.res, user, true);
    const id = Number(ctx.params.id);
    if (ctx.params.res === 'users' && id === user.id) throw new HttpError(422, 'You cannot delete yourself');
    try {
      const r2 = getDb().prepare(`DELETE FROM ${R.table} WHERE id = ?`).run(id);
      if (!r2.changes) throw new HttpError(404, 'Not found');
    } catch (e) {
      throw dbError(e);
    }
    sendJson(ctx.res, 200, { ok: true });
  });

  // Duplicate all compatibility links of one vehicle onto another (speeds up data entry for similar trims).
  r.post('/admin/api/compat/copy', async (ctx) => {
    const user = requireAuth(ctx, 'catalog');
    const { from, to } = await parseBody(ctx.req, 1000);
    const db = getDb();
    if (!db.prepare('SELECT 1 FROM vehicles WHERE id = ?').get(Number(to))) throw new HttpError(404, 'Target vehicle not found');
    // Copied rows start UNVERIFIED: each vehicle must be checked on its own.
    const r2 = db.prepare(
      `INSERT OR IGNORE INTO compat(vehicle_id, screen_id, status, frame, harness, canbus, swc, camera, sensors, oem_audio, mods_ar, mods_en, install_price, frame_price, verified)
       SELECT ?, screen_id, status, frame, harness, canbus, swc, camera, sensors, oem_audio, mods_ar, mods_en, install_price, frame_price, 0 FROM compat WHERE vehicle_id = ?`,
    ).run(Number(to), Number(from));
    sendJson(ctx.res, 200, { copied: Number(r2.changes), by: user.username });
  });

  r.post('/admin/api/upload', async (ctx) => {
    requireAuth(ctx, 'catalog');
    const kind = ctx.url.searchParams.get('kind');
    const allow = kind === 'video' ? ['video'] : kind === 'any' ? ['image', 'video'] : ['image'];
    const buf = await readBody(ctx.req, allow.includes('video') ? config.maxVideoBytes : config.maxImageBytes);
    sendJson(ctx.res, 201, saveUpload(buf, { sub: 'public', allow }));
  });

  r.get('/admin/api/orders/:id/photo', (ctx) => {
    requireAuth(ctx, 'orders');
    const o = getDb().prepare('SELECT photo FROM orders WHERE id = ?').get(Number(ctx.params.id));
    const p = o && privatePath(o.photo);
    if (!p || !fs.existsSync(p)) throw new HttpError(404, 'Not found');
    const ok = serveStatic(ctx.req, ctx.res, path.join(config.uploadDir, 'private'), o.photo.slice('/uploads/private'.length), { maxAge: 0 });
    if (!ok) throw new HttpError(404, 'Not found');
  });

  r.get('/admin/api/settings', (ctx) => {
    requireAuth(ctx, 'settings');
    sendJson(ctx.res, 200, getSettings());
  });

  r.patch('/admin/api/settings', async (ctx) => {
    requireAuth(ctx, 'settings');
    const body = await parseBody(ctx.req, 50000);
    const db = getDb();
    const stmt = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    const errors = {};
    for (const [k, v] of Object.entries(body)) {
      if (!SETTINGS_KEYS.includes(k)) continue;
      const s = String(v ?? '').trim();
      if (s.length > 5000) { errors[k] = 'too long'; continue; }
      if (k === 'whatsapp' && s && !/^\+?\d{8,15}$/.test(s.replace(/[\s-]/g, ''))) { errors[k] = 'digits with country code, e.g. 9665XXXXXXXX'; continue; }
      if (k === 'hero_image' && s && !/^\/(uploads|img)\/[A-Za-z0-9._\-/]+$/.test(s)) { errors[k] = 'uploaded image path'; continue; }
      if (k === 'hero_kind' && !['real', 'illustrative'].includes(s)) { errors[k] = 'real|illustrative'; continue; }
      stmt.run(k, s);
    }
    if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
    sendJson(ctx.res, 200, getSettings());
  });

  r.get('/admin/api/stats', (ctx) => {
    requireAuth(ctx, 'stats');
    const db = getDb();
    const one = (sql, ...a) => db.prepare(sql).get(...a);
    const days = Math.min(365, Math.max(1, parseInt(ctx.url.searchParams.get('days') || '30', 10) || 30));
    const since = `-${days} days`;
    sendJson(ctx.res, 200, {
      counts: {
        brands: one('SELECT COUNT(*) n FROM brands').n,
        models: one('SELECT COUNT(*) n FROM models').n,
        vehicles: one('SELECT COUNT(*) n FROM vehicles').n,
        screens: one('SELECT COUNT(*) n FROM screens').n,
        compat_verified: one('SELECT COUNT(*) n FROM compat WHERE verified = 1').n,
        compat_pending: one('SELECT COUNT(*) n FROM compat WHERE verified = 0').n,
        orders_new: one("SELECT COUNT(*) n FROM orders WHERE status = 'new'").n,
        orders_period: one("SELECT COUNT(*) n FROM orders WHERE created_at >= datetime('now', ?)", since).n,
        searches_period: one("SELECT COUNT(*) n FROM search_log WHERE created_at >= datetime('now', ?)", since).n,
        vehicles_illustrative: one("SELECT COUNT(*) n FROM vehicles WHERE images_kind = 'illustrative'").n,
      },
      orders_by_status: db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all(),
      orders_by_day: db.prepare("SELECT date(created_at) d, COUNT(*) n FROM orders WHERE created_at >= datetime('now', ?) GROUP BY d ORDER BY d").all(since),
      searches_by_day: db.prepare("SELECT date(created_at) d, COUNT(*) n FROM search_log WHERE created_at >= datetime('now', ?) GROUP BY d ORDER BY d").all(since),
      top_searches: db.prepare(`SELECT b.name_en AS brand, m.name_en AS model, COUNT(*) n, SUM(s.results = 0) AS no_result
        FROM search_log s LEFT JOIN models m ON m.id = s.model_id LEFT JOIN brands b ON b.id = s.brand_id
        WHERE s.created_at >= datetime('now', ?) GROUP BY s.model_id ORDER BY n DESC LIMIT 10`).all(since),
      unmet_searches: db.prepare(`SELECT b.name_en AS brand, m.name_en AS model, s.year, COUNT(*) n
        FROM search_log s LEFT JOIN models m ON m.id = s.model_id LEFT JOIN brands b ON b.id = s.brand_id
        WHERE s.results = 0 AND s.created_at >= datetime('now', ?) GROUP BY s.model_id, s.year ORDER BY n DESC LIMIT 10`).all(since),
      top_screens: db.prepare(`SELECT s.name_ar AS name, COUNT(*) n FROM orders o JOIN screens s ON s.id = o.screen_id
        WHERE o.created_at >= datetime('now', ?) GROUP BY o.screen_id ORDER BY n DESC LIMIT 5`).all(since),
      settings_missing: ['whatsapp', 'phone'].filter((k) => !getSettings()[k]),
      demo_mode: getSettings().demo_mode === '1',
    });
  });
}
