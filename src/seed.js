// Usage:
//   node src/seed.js            → base data: settings, admin user, brands & models
//   node src/seed.js --demo     → also demo vehicles, screens, compatibility, FAQ, articles
//   node src/seed.js --reset    → delete the database first (DANGER)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { openDb, setDb, DEFAULT_SETTINGS } from './db.js';
import { hashPassword } from './auth.js';

export const slugify = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

// [slug, name_ar, name_en, country, featured, models[[name_en, name_ar, body]]]
const BRANDS = [
  ['toyota', 'تويوتا', 'Toyota', 'JP', 1, [['Camry', 'كامري', 'sedan'], ['Corolla', 'كورولا', 'sedan'], ['Yaris', 'يارس', 'sedan'], ['Land Cruiser', 'لاندكروزر', 'suv'], ['Prado', 'برادو', 'suv'], ['Hilux', 'هايلكس', 'pickup'], ['Fortuner', 'فورتشنر', 'suv'], ['RAV4', 'راف فور', 'suv']]],
  ['hyundai', 'هيونداي', 'Hyundai', 'KR', 1, [['Elantra', 'إلنترا', 'sedan'], ['Accent', 'أكسنت', 'sedan'], ['Sonata', 'سوناتا', 'sedan'], ['Tucson', 'توسان', 'suv'], ['Santa Fe', 'سنتافي', 'suv'], ['Creta', 'كريتا', 'suv']]],
  ['kia', 'كيا', 'Kia', 'KR', 1, [['Cerato', 'سيراتو', 'sedan'], ['Rio', 'ريو', 'sedan'], ['Pegas', 'بيجاس', 'sedan'], ['K5', 'K5', 'sedan'], ['Sportage', 'سبورتاج', 'suv'], ['Sorento', 'سورينتو', 'suv']]],
  ['nissan', 'نيسان', 'Nissan', 'JP', 1, [['Sunny', 'صني', 'sedan'], ['Sentra', 'سنترا', 'sedan'], ['Altima', 'ألتيما', 'sedan'], ['Patrol', 'باترول', 'suv'], ['X-Trail', 'إكس تريل', 'suv'], ['Navara', 'نافارا', 'pickup']]],
  ['chevrolet', 'شفروليه', 'Chevrolet', 'US', 1, [['Malibu', 'ماليبو', 'sedan'], ['Tahoe', 'تاهو', 'suv'], ['Captiva', 'كابتيفا', 'suv'], ['Silverado', 'سلفرادو', 'pickup'], ['Spark', 'سبارك', 'hatch']]],
  ['mitsubishi', 'ميتسوبيشي', 'Mitsubishi', 'JP', 0, [['Lancer', 'لانسر', 'sedan'], ['Attrage', 'أتراج', 'sedan'], ['Pajero', 'باجيرو', 'suv'], ['Outlander', 'أوتلاندر', 'suv'], ['L200', 'L200', 'pickup']]],
  ['mercedes-benz', 'مرسيدس', 'Mercedes-Benz', 'DE', 0, [['C-Class', 'الفئة C', 'sedan'], ['E-Class', 'الفئة E', 'sedan'], ['GLC', 'GLC', 'suv']]],
  ['bmw', 'بي إم دبليو', 'BMW', 'DE', 0, [['3 Series', 'الفئة الثالثة', 'sedan'], ['5 Series', 'الفئة الخامسة', 'sedan'], ['X5', 'X5', 'suv']]],
  ['renault', 'رينو', 'Renault', 'FR', 0, [['Duster', 'داستر', 'suv'], ['Symbol', 'سيمبول', 'sedan'], ['Megane', 'ميجان', 'sedan']]],
  ['honda', 'هوندا', 'Honda', 'JP', 0, [['Accord', 'أكورد', 'sedan'], ['Civic', 'سيفيك', 'sedan'], ['CR-V', 'CR-V', 'suv'], ['Pilot', 'بايلوت', 'suv']]],
  ['mazda', 'مازدا', 'Mazda', 'JP', 0, [['Mazda 3', 'مازدا 3', 'sedan'], ['Mazda 6', 'مازدا 6', 'sedan'], ['CX-5', 'CX-5', 'suv'], ['CX-9', 'CX-9', 'suv']]],
  ['suzuki', 'سوزوكي', 'Suzuki', 'JP', 0, [['Swift', 'سويفت', 'hatch'], ['Dzire', 'ديزاير', 'sedan'], ['Ciaz', 'سياز', 'sedan'], ['Jimny', 'جيمني', 'suv'], ['Vitara', 'فيتارا', 'suv']]],
  ['volkswagen', 'فولكس فاجن', 'Volkswagen', 'DE', 0, [['Golf', 'جولف', 'hatch'], ['Passat', 'باسات', 'sedan'], ['Tiguan', 'تيجوان', 'suv'], ['Teramont', 'تيرامونت', 'suv']]],
  ['skoda', 'سكودا', 'Skoda', 'CZ', 0, [['Octavia', 'أوكتافيا', 'sedan'], ['Superb', 'سوبيرب', 'sedan'], ['Kodiaq', 'كودياك', 'suv']]],
  ['peugeot', 'بيجو', 'Peugeot', 'FR', 0, [['301', '301', 'sedan'], ['3008', '3008', 'suv'], ['508', '508', 'sedan']]],
  ['ford', 'فورد', 'Ford', 'US', 0, [['Taurus', 'توروس', 'sedan'], ['Explorer', 'إكسبلورر', 'suv'], ['Expedition', 'إكسبديشن', 'suv'], ['Edge', 'إيدج', 'suv'], ['F-150', 'F-150', 'pickup']]],
  ['jeep', 'جيب', 'Jeep', 'US', 0, [['Wrangler', 'رانجلر', 'suv'], ['Grand Cherokee', 'جراند شيروكي', 'suv'], ['Cherokee', 'شيروكي', 'suv']]],
  ['gmc', 'جي إم سي', 'GMC', 'US', 0, [['Yukon', 'يوكن', 'suv'], ['Sierra', 'سييرا', 'pickup']]],
  ['lexus', 'لكزس', 'Lexus', 'JP', 0, [['ES', 'ES', 'sedan'], ['LX', 'LX', 'suv']]],
  ['mg', 'إم جي', 'MG', 'CN', 1, [['MG5', 'MG5', 'sedan'], ['ZS', 'ZS', 'suv'], ['RX5', 'RX5', 'suv'], ['GT', 'GT', 'sedan']]],
  ['chery', 'شيري', 'Chery', 'CN', 0, [['Tiggo 7', 'تيجو 7', 'suv'], ['Tiggo 8', 'تيجو 8', 'suv'], ['Arrizo 6', 'أريزو 6', 'sedan']]],
  ['geely', 'جيلي', 'Geely', 'CN', 0, [['Coolray', 'كولراي', 'suv'], ['Emgrand', 'إمجراند', 'sedan'], ['Okavango', 'أوكافانجو', 'suv'], ['Tugella', 'توجيلا', 'suv']]],
  ['changan', 'شانجان', 'Changan', 'CN', 0, [['CS35', 'CS35', 'suv'], ['CS75', 'CS75', 'suv'], ['Alsvin', 'السفن', 'sedan']]],
  ['byd', 'بي واي دي', 'BYD', 'CN', 0, [['Atto 3', 'أتو 3', 'suv'], ['Seal', 'سيل', 'sedan'], ['Han', 'هان', 'sedan']]],
  ['isuzu', 'إيسوزو', 'Isuzu', 'JP', 0, [['D-Max', 'دي ماكس', 'pickup']]],
];

// Demo vehicles: [brand, model, from, to, trim_ar, trim_en, dash_code, dash_ar, dash_en, oem_audio, cam, 360, sensors, swc, featured]
const DEMO_VEHICLES = [
  ['toyota', 'camry', 2018, 2024, 'الفئة القياسية', 'Standard trim', 'OEM-RADIO', 'راديو أصلي بشاشة صغيرة', 'Factory radio with small display', 'standard', 1, 0, 1, 1, 1],
  ['toyota', 'camry', 2018, 2024, 'الفئة العليا (صوت مميز)', 'Top trim (premium audio)', 'OEM-8-PREMIUM', 'شاشة مصنع 8 بوصة مع أمبليفاير', 'Factory 8-inch display with amplifier', 'premium', 1, 1, 1, 1, 0],
  ['toyota', 'camry', 2012, 2017, 'جميع الفئات', 'All trims', 'OEM-2DIN', 'راديو أصلي مقاس 2DIN', 'Factory 2-DIN radio', 'standard', 0, 0, 0, 1, 0],
  ['toyota', 'corolla', 2014, 2018, 'جميع الفئات', 'All trims', 'OEM-2DIN', 'راديو أصلي مقاس 2DIN', 'Factory 2-DIN radio', 'standard', 0, 0, 0, 1, 1],
  ['toyota', 'land-cruiser', 2016, 2021, 'GX / EXR', 'GX / EXR', 'OEM-RADIO', 'راديو أصلي', 'Factory radio', 'standard', 1, 0, 1, 1, 1],
  ['toyota', 'land-cruiser', 2016, 2021, 'VXR / VX', 'VXR / VX', 'OEM-9-PREMIUM', 'شاشة مصنع مع نظام صوت مميز', 'Factory display with premium audio', 'premium', 1, 1, 1, 1, 0],
  ['toyota', 'hilux', 2016, 2023, 'جميع الفئات', 'All trims', 'OEM-RADIO', 'راديو أصلي', 'Factory radio', 'standard', 0, 0, 0, 1, 0],
  ['hyundai', 'elantra', 2016, 2020, 'الفئة القياسية', 'Standard trim', 'OEM-RADIO', 'راديو أصلي', 'Factory radio', 'standard', 0, 0, 0, 1, 1],
  ['hyundai', 'elantra', 2021, 2023, 'جميع الفئات', 'All trims', 'OEM-8', 'شاشة مصنع 8 بوصة', 'Factory 8-inch display', 'standard', 1, 0, 1, 1, 0],
  ['hyundai', 'accent', 2018, 2022, 'جميع الفئات', 'All trims', 'OEM-RADIO', 'راديو أصلي', 'Factory radio', 'standard', 0, 0, 0, 1, 1],
  ['kia', 'sportage', 2016, 2021, 'جميع الفئات', 'All trims', 'OEM-RADIO', 'راديو أصلي', 'Factory radio', 'standard', 0, 0, 1, 1, 1],
  ['kia', 'cerato', 2019, 2023, 'جميع الفئات', 'All trims', 'OEM-RADIO', 'راديو أصلي', 'Factory radio', 'standard', 1, 0, 0, 1, 0],
  ['nissan', 'sunny', 2012, 2019, 'جميع الفئات', 'All trims', 'OEM-RADIO', 'راديو أصلي', 'Factory radio', 'standard', 0, 0, 0, 0, 1],
  ['nissan', 'patrol', 2010, 2019, 'LE / SE', 'LE / SE', 'OEM-NAV', 'شاشة ملاحة أصلية', 'Factory navigation display', 'premium', 1, 1, 1, 1, 1],
  ['chevrolet', 'tahoe', 2015, 2020, 'جميع الفئات', 'All trims', 'OEM-8', 'شاشة مصنع 8 بوصة', 'Factory 8-inch display', 'premium', 1, 0, 1, 1, 0],
  ['mitsubishi', 'pajero', 2007, 2021, 'جميع الفئات', 'All trims', 'OEM-2DIN', 'راديو أصلي مقاس 2DIN', 'Factory 2-DIN radio', 'standard', 0, 0, 0, 1, 0],
  ['honda', 'accord', 2013, 2017, 'جميع الفئات', 'All trims', 'OEM-RADIO', 'راديو أصلي', 'Factory radio', 'standard', 1, 0, 0, 1, 0],
  ['mg', 'zs', 2018, 2022, 'جميع الفئات', 'All trims', 'OEM-8', 'شاشة مصنع 8 بوصة', 'Factory 8-inch display', 'standard', 1, 0, 1, 1, 0],
];

// [slug, name_ar, name_en, code, size, osver, cpu, ram, rom, res, panel, sim4g, carplay, aa, cam360, dsp, price, sale, warranty, featured]
const DEMO_SCREENS = [
  ['av-7-double-din', 'شاشة AV-7 مقاس 2DIN', 'AV-7 Double-DIN', 'AV-7D', 7, '13', 'Quad-core 1.3GHz', 2, 32, '1024×600', 'IPS', 0, 'wired', 'wired', 0, 0, 450, null, 12, 0],
  ['av-9-lite', 'شاشة AV-9 لايت', 'AV-9 Lite', 'AV-9L', 9, '13', 'Quad-core 1.3GHz', 2, 32, '1024×600', 'IPS', 0, 'wired', 'wired', 0, 0, 650, 599, 12, 1],
  ['av-9-pro', 'شاشة AV-9 برو', 'AV-9 Pro', 'AV-9P', 9, '13', 'Unisoc UIS7862 8-core', 4, 64, '1280×720', 'QLED', 1, 'wireless', 'wireless', 1, 1, 990, null, 18, 1],
  ['av-10-pro', 'شاشة AV-10 برو', 'AV-10 Pro', 'AV-10P', 10.1, '13', 'Unisoc UIS7862 8-core', 4, 64, '1280×800', 'QLED', 1, 'wireless', 'wireless', 1, 1, 1150, 1049, 18, 1],
  ['av-10-max', 'شاشة AV-10 ماكس', 'AV-10 Max', 'AV-10M', 10.1, '13', 'Qualcomm Snapdragon 665 8-core', 8, 128, '2000×1200', 'QLED', 1, 'wireless', 'wireless', 1, 1, 1890, null, 24, 1],
  ['av-13-ultra', 'شاشة AV-13 ألترا', 'AV-13 Ultra', 'AV-13U', 13.1, '13', 'Qualcomm Snapdragon 665 8-core', 8, 256, '1920×1080', 'QLED', 1, 'wireless', 'wireless', 1, 1, 2400, null, 24, 0],
];

export function seed(db, { demo = false, log = console.log } = {}) {
  db.exec('BEGIN');
  try {
    const setStmt = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) setStmt.run(k, v);

    // Admin user
    let adminPassword = null;
    if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
      const username = (process.env.ADMIN_USER || 'admin').toLowerCase();
      adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
      db.prepare('INSERT INTO users(username, name, pass_hash, role) VALUES (?,?,?,?)').run(username, 'Administrator', hashPassword(adminPassword), 'admin');
      log(`\n  Admin user: ${username}\n  Password:   ${process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD)' : adminPassword}\n  → change it after first login.\n`);
    }

    // Brands & models (real names — safe as a starting catalog)
    const insBrand = db.prepare('INSERT OR IGNORE INTO brands(slug, name_ar, name_en, country, featured, sort) VALUES (?,?,?,?,?,?)');
    const insModel = db.prepare('INSERT OR IGNORE INTO models(brand_id, slug, name_ar, name_en, body_type) VALUES (?,?,?,?,?)');
    BRANDS.forEach(([slug, ar, en, country, featured, models], i) => {
      insBrand.run(slug, ar, en, country, featured, i);
      const bid = db.prepare('SELECT id FROM brands WHERE slug = ?').get(slug).id;
      for (const [men, mar, body] of models) insModel.run(bid, slugify(men), mar, men, body);
    });

    if (demo) seedDemo(db, log);
    db.exec('COMMIT');
    return { adminPassword };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function seedDemo(db, log) {
  if (db.prepare('SELECT 1 FROM vehicles LIMIT 1').get()) {
    log('Demo data skipped: vehicles already exist.');
    return;
  }
  db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES ('demo_mode', '1')").run();
  const modelId = (b, m) => db.prepare('SELECT m.id FROM models m JOIN brands b ON b.id = m.brand_id WHERE b.slug = ? AND m.slug = ?').get(b, m)?.id;
  const insV = db.prepare(`INSERT INTO vehicles(model_id, slug, year_from, year_to, trim_ar, trim_en, dash_code, dash_ar, dash_en, oem_audio, has_oem_camera, has_360, has_sensors, has_swc, featured,
      exterior_img, before_img, after_img, images_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'illustrative')`);
  const vIds = [];
  for (const v of DEMO_VEHICLES) {
    const [b, m, from, to, tar, ten, code, dar, den, audio, cam, c360, sens, swc, feat] = v;
    const slug = slugify(`${b}-${m}-${from}-${to}-${ten}`);
    const r = insV.run(modelId(b, m), slug, from, to, tar, ten, code, dar, den, audio, cam, c360, sens, swc, feat,
      '/img/ph-exterior.svg', '/img/ph-dash-before.svg', '/img/ph-dash-after.svg');
    vIds.push({ id: Number(r.lastInsertRowid), b, m, code, audio, cam, c360 });
  }

  const insS = db.prepare(`INSERT INTO screens(slug, name_ar, name_en, model_code, size_in, os_version, cpu, ram_gb, rom_gb, resolution, panel, sim4g, carplay, android_auto, cam360, dsp, price, sale_price, warranty_months, featured,
      audio_ar, audio_en, desc_ar, desc_en, image, image_kind, offer_ar, offer_en) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, '/img/ph-screen.svg', 'illustrative', ?, ?)`);
  const sIds = {};
  for (const s of DEMO_SCREENS) {
    const [slug, ar, en, code, size, osv, cpu, ram, rom, res, panel, sim, cp, aa, c360, dsp, price, sale, war, feat] = s;
    const audioAr = dsp ? 'معالج صوت DSP بـ 32 نطاق معادل، خرج RCA للأمبليفاير' : 'معادل صوت أساسي، خرج سماعات 4×45 واط';
    const audioEn = dsp ? '32-band DSP equaliser, RCA pre-outs for an amplifier' : 'Basic equaliser, 4×45W speaker output';
    const r = insS.run(slug, ar, en, code, size, osv, cpu, ram, rom, res, panel, sim, cp, aa, c360, dsp, price, sale, war, feat, audioAr, audioEn,
      `شاشة Android ${size} بوصة (بيانات تجريبية للعرض).`, `${size}-inch Android head unit (demo data).`,
      sale ? 'خصم لفترة محدودة' : '', sale ? 'Limited-time discount' : '');
    sIds[slug] = Number(r.lastInsertRowid);
  }

  const insC = db.prepare(`INSERT INTO compat(vehicle_id, screen_id, status, frame, harness, canbus, swc, camera, sensors, oem_audio, mods_ar, mods_en, install_price, frame_price, verified, verified_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1, datetime('now'))`);
  for (const v of vIds) {
    const sizes = v.code === 'OEM-2DIN' ? ['av-7-double-din', 'av-9-lite', 'av-9-pro'] : ['av-9-lite', 'av-9-pro', 'av-10-pro', 'av-10-max'];
    if (['land-cruiser', 'patrol', 'tahoe'].includes(v.m)) sizes.push('av-13-ultra');
    for (const s of sizes) {
      const premium = v.audio === 'premium';
      const lite = s === 'av-9-lite' || s === 'av-7-double-din';
      let status = 'compatible';
      let modsAr = '', modsEn = '';
      if (premium && lite) {
        status = 'incompatible';
      } else if (premium) {
        status = 'modified';
        modsAr = 'يلزم محوّل خاص لنظام الصوت المميز للحفاظ على الأمبليفاير الأصلي.';
        modsEn = 'Requires a premium-audio adapter to keep the factory amplifier.';
      }
      const frame = status === 'incompatible' ? '' : `إطار ${s.includes('13') ? '13.1' : s.includes('10') ? '10.1' : s.includes('7') ? '2DIN' : '9'} بوصة مخصص للموديل`;
      insC.run(v.id, sIds[s], status, frame, status === 'incompatible' ? '' : 'ضفيرة Plug & Play بدون قص أسلاك', premium ? 'صندوق CANBUS مطلوب' : '',
        'supported', v.cam ? 'تعمل الكاميرا الأصلية عبر محوّل' : 'يمكن إضافة كاميرا خلفية', v.c360 ? 'نظام 360 الأصلي يحتاج فحص' : '', premium ? 'نظام صوت مميز' : 'قياسي',
        modsAr, modsEn, status === 'incompatible' ? null : 150, status === 'incompatible' ? null : 120);
    }
  }

  const insM = db.prepare(`INSERT INTO media(vehicle_id, type, url, kind, caption_ar, caption_en, in_gallery, sort) VALUES (?, 'image', ?, 'illustrative', ?, ?, 1, ?)`);
  vIds.slice(0, 6).forEach((v, i) => {
    insM.run(v.id, '/img/ph-dash-after.svg', 'مثال توضيحي لتركيب شاشة', 'Illustrative installation example', i);
    insM.run(v.id, '/img/ph-detail.svg', 'تفاصيل التركيب (توضيحية)', 'Installation detail (illustrative)', i);
  });

  const insF = db.prepare('INSERT INTO faqs(q_ar, q_en, a_ar, a_en, sort) VALUES (?,?,?,?,?)');
  [
    ['هل تبيعون الشاشات الأصلية من المصنع؟', 'Do you sell factory (OEM) screens?', 'لا، نختص فقط بالشاشات الخارجية Android التي تُركّب بعد تصنيع السيارة.', 'No. We only supply aftermarket Android screens installed after the car is built.'],
    ['هل تعمل أزرار عجلة القيادة بعد التركيب؟', 'Will my steering wheel buttons still work?', 'في أغلب السيارات نعم، وتظهر حالة الأزرار في صفحة كل سيارة (مدعومة، تحتاج محوّل، أو غير مدعومة).', 'In most cars yes. Each car page shows whether they are supported, need an adapter, or are not supported.'],
    ['ماذا يعني "متوافق مع تعديلات"؟', 'What does "compatible with modifications" mean?', 'أن الشاشة يمكن تركيبها لكن تحتاج قطعة أو محوّل إضافي، وتجد التعديلات المطلوبة مكتوبة بوضوح.', 'The screen fits but needs an extra part or adapter; the required modifications are listed clearly.'],
    ['هل تعمل الكاميرا الخلفية الأصلية؟', 'Does my factory reverse camera keep working?', 'غالباً نعم عبر محوّل مناسب، وتوضح صفحة السيارة تفاصيل الكاميرا والحساسات.', 'Usually yes through the right adapter; the car page details camera and sensor support.'],
    ['كم يستغرق التركيب؟', 'How long does installation take?', 'عادة من ساعة إلى ثلاث ساعات حسب السيارة والتجهيزات.', 'Typically one to three hours depending on the car and its equipment.'],
  ].forEach((f, i) => insF.run(...f, i));

  db.prepare(`INSERT INTO articles(slug, title_ar, title_en, excerpt_ar, excerpt_en, body_ar, body_en) VALUES (?,?,?,?,?,?,?)`).run(
    'how-to-choose-android-car-screen',
    'كيف تختار شاشة Android المناسبة لسيارتك؟',
    'How to choose the right Android screen for your car',
    'الحجم، المعالج، الذاكرة، ودعم CarPlay — ما الذي يهم فعلاً؟',
    'Size, processor, memory and CarPlay support — what actually matters?',
    'ابدأ بالتوافق: الإطار والضفيرة وأزرار عجلة القيادة ونظام الصوت الأصلي هي ما يحدد إن كانت الشاشة ستعمل بشكل صحيح في سيارتك.\n\nبعد ذلك اختر الذاكرة: 4 جيجابايت RAM أو أكثر تمنح تجربة سلسة مع الخرائط وCarPlay اللاسلكي.\n\nأخيراً قارن دقة الشاشة ونوع اللوحة ودعم DSP إذا كان الصوت يهمك.',
    'Start with fit: the frame, harness, steering-wheel controls and factory audio decide whether a screen will work properly in your car.\n\nThen pick memory: 4 GB of RAM or more gives a smooth experience with maps and wireless CarPlay.\n\nFinally compare resolution, panel type and DSP support if sound matters to you.',
  );
  log('Demo data inserted (vehicles, screens, verified demo compatibility, FAQ, article). Remove before launch: npm run seed -- --reset');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Set(process.argv.slice(2));
  if (args.has('--reset') && fs.existsSync(config.dbPath)) {
    for (const f of [config.dbPath, config.dbPath + '-wal', config.dbPath + '-shm']) fs.rmSync(f, { force: true });
    console.log('Database deleted.');
  }
  const db = openDb();
  setDb(db);
  seed(db, { demo: args.has('--demo') });
  console.log('Seed complete →', config.dbPath);
}
