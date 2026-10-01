/* =============================================================
   خشکبار نقش جهان — main.js
   Vanilla JS، بدون وابستگی. بخش‌ها:
   داده محصولات → رندر تصویر SVG → سبد/علاقه‌مندی (localStorage) →
   رندر گرید (صفحه اصلی: پیش‌نمایش ثابت | صفحه فروشگاه: فیلتر واقعی
   بر اساس ?category= در URL) → جستجوی زنده → مشاهده سریع → پنل‌ها → هدر
   ============================================================= */
(function () {
  "use strict";

  /* ---------- ابزارهای عمومی ---------- */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const fa = (n) => Number(n).toLocaleString("fa-IR"); // اعداد فارسی با جداکننده هزار
  const PAGE = document.body.dataset.page || "home"; // "home" | "shop" | "account" | "checkout"

  function storage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* حالت خصوصی مرورگر */ }
  }

  /* =============================================================
     تقویم شمسی (بدون کتابخانه): تبدیل میلادی → جلالی
     الگوریتم استاندارد و کوتاه؛ فقط محاسبات عددی، هیچ وزنی اضافه نمی‌کند
     ============================================================= */
  function gregorianToJalali(gy, gm, gd) {
    const div = (a, b) => Math.trunc(a / b);
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    const gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = (365 * gy) + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * div(days, 12053);
    days %= 12053;
    jy += 4 * div(days, 1461);
    days %= 1461;
    if (days > 365) { jy += div(days - 1, 365); days = (days - 1) % 365; }
    const jm = (days < 186) ? 1 + div(days, 31) : 7 + div(days - 186, 30);
    const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return [jy, jm, jd];
  }
  const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  const JALALI_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
  /* اعداد بدون جداکننده‌ی هزارگان (برعکس fa()) — برای سال/روزِ تاریخ */
  const faDigits = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  function formatJalali(date, withWeekday) {
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const base = `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)}`;
    return withWeekday ? `${JALALI_WEEKDAYS[(date.getDay() + 1) % 7]}، ${base}` : base;
  }
  /* تاریخ تحویل تخمینی: امروز + چند روز کاری (جمعه‌ها حساب نمی‌شود) */
  function estimateDeliveryDate(workDays) {
    const d = new Date();
    let added = 0;
    while (added < workDays) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 5) added++; // ۵ = جمعه در جاوااسکریپت
    }
    return d;
  }

  /* =============================================================
     حساب کاربری (شبیه‌سازی سمت کاربر — بدون بک‌اند واقعی)
     نکته‌ی مهم: چون این یک سایت استاتیک بدون سرور است، پیامک واقعی
     ارسال نمی‌شود؛ کد تایید به‌صورت آزمایشی همین‌جا نمایش داده می‌شود
     تا کل مسیر ورود/ثبت‌نام واقعاً و به‌طور کامل قابل تست باشد.
     ============================================================= */
  const AUTH = {
    getUser() { return storage("njk_user", null); },
    isLoggedIn() {
      const phone = storage("njk_session", null);
      const u = this.getUser();
      return !!(phone && u && u.phone === phone);
    },
    currentUser() { return this.isLoggedIn() ? this.getUser() : null; },
    sendOtp(phone) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      const payload = { phone, code, expires: Date.now() + 2 * 60 * 1000 };
      try { sessionStorage.setItem("njk_otp", JSON.stringify(payload)); } catch (e) {}
      return code;
    },
    verifyOtp(phone, code) {
      let payload = null;
      try { payload = JSON.parse(sessionStorage.getItem("njk_otp") || "null"); } catch (e) {}
      if (!payload || payload.phone !== phone) return { ok: false, reason: "notfound" };
      if (Date.now() > payload.expires) return { ok: false, reason: "expired" };
      if (payload.code !== code) return { ok: false, reason: "mismatch" };
      return { ok: true };
    },
    registerUser({ phone, name, family, address, city, password }) {
      const user = { phone, name, family, address, city, password, createdAt: new Date().toISOString() };
      save("njk_user", user);
      save("njk_session", phone);
      try { sessionStorage.removeItem("njk_otp"); } catch (e) {}
      return user;
    },
    login(phone, password) {
      const u = this.getUser();
      if (!u || u.phone !== phone) return { ok: false, reason: "notfound" };
      if (u.password !== password) return { ok: false, reason: "password" };
      save("njk_session", phone);
      return { ok: true, user: u };
    },
    logout() { save("njk_session", null); }
  };

  /* ---------- داده محصولات (مرجع رسمی فروشگاه) ----------
     قیمت‌ها: تومان به ازای هر ۱ کیلوگرم. وزن‌های فروش برای همه‌ی محصولات:
     ۱ کیلوگرم (۱۰۰٪)، ۵۰۰ گرم (۵۰٪)، ۲۵۰ گرم (۲۵٪). price:null ⇒ «قیمت نامشخص». */
  const CATEGORIES = [
    ["pistachio", "پسته"],
    ["mixed", "آجیل مخلوط"],
    ["nokhodchi", "نخودچی"],
    ["almond", "بادام"],
    ["walnut", "گردو"],
    ["hazelnut", "فندق"],
    ["raisin", "کشمش و مویز"],
    ["date", "خرما"],
    ["fruit", "میوه خشک"],
    ["legumes", "حبوبات"],
    ["seeds", "تخمه"]
  ];
  const CATEGORY_LABEL = Object.fromEntries(CATEGORIES);
  const WEIGHTS = [
    { g: 1000, label: "۱ کیلوگرم" },
    { g: 500, label: "۵۰۰ گرم" },
    { g: 250, label: "۲۵۰ گرم" }
  ];
  const DEFAULT_G = 1000;
  const UNKNOWN_PRICE = "قیمت نامشخص";

  // شکل و رنگ تصویر جایگزین (placeholder) هر دسته
  const ART = {
    pistachio: { kind: "pistachio", bg: ["#EEF2DC", "#DCE6B8"] },
    mixed: { kind: ["pistachio", "almond", "walnut", "raisin"], bg: ["#F1EEDD", "#DCE0BE"] },
    nokhodchi: { kind: "chickpea", bg: ["#F6EEDA", "#E3C88F"] },
    almond: { kind: "almond", bg: ["#F8ECDD", "#EBD3B4"] },
    walnut: { kind: "walnut", bg: ["#F4EAE0", "#DFC9B2"] },
    hazelnut: { kind: "walnut", bg: ["#F1E6DA", "#D2B594"] },
    raisin: { kind: "raisin", bg: ["#EFE7F0", "#D6C3DA"] },
    date: { kind: "date", bg: ["#F2E5DA", "#D9BDA6"] },
    fruit: { kind: "apricot", bg: ["#FBE9D3", "#F1C68A"] },
    legumes: { kind: "chickpea", bg: ["#F3ECD6", "#DCC98E"] },
    seeds: { kind: "almond", bg: ["#F5EFD9", "#DCCB93"] }
  };

  const RAW = [
    ["pistachio", "\u067e\u0633\u062a\u0647 \u0627\u06a9\u0628\u0631\u06cc \u0634\u0648\u0631", 4000000],
    ["pistachio", "\u067e\u0633\u062a\u0647 \u0627\u062d\u0645\u062f \u0622\u0642\u0627\u06cc\u06cc \u0634\u0648\u0631", 3800000],
    ["pistachio", "\u067e\u0633\u062a\u0647 \u06a9\u0644\u0647 \u0642\u0648\u0686\u06cc \u0634\u0648\u0631", 3800000],
    ["mixed", "\u067e\u0646\u062c \u0645\u063a\u0632", 3500000],
    ["nokhodchi", "\u0646\u062e\u0648\u062f\u0686\u06cc \u062e\u0627\u0645", 500000],
    ["nokhodchi", "\u0646\u062e\u0648\u062f\u0686\u06cc \u062f\u0648\u067e\u0648", 520000],
    ["nokhodchi", "\u0646\u062e\u0648\u062f\u0686\u06cc \u0634\u06cc\u0631\u06cc\u0646", 520000],
    ["almond", "\u0645\u063a\u0632 \u0628\u0627\u062f\u0627\u0645 \u062e\u0627\u0645 \u0627\u06cc\u0631\u0627\u0646\u06cc", 3500000],
    ["almond", "\u0645\u063a\u0632 \u0628\u0627\u062f\u0627\u0645 \u0634\u0648\u0631 \u0627\u06cc\u0631\u0627\u0646\u06cc", 3600000],
    ["almond", "\u0645\u063a\u0632 \u0628\u0627\u062f\u0627\u0645 \u062e\u0627\u0645 \u062e\u0627\u0631\u062c\u06cc", 3500000],
    ["almond", "\u0645\u063a\u0632 \u0628\u0627\u062f\u0627\u0645 \u0634\u0648\u0631 \u062e\u0627\u0631\u062c\u06cc", 3600000],
    ["almond", "\u0645\u063a\u0632 \u0628\u0627\u062f\u0627\u0645 \u0645\u0627\u0645\u0627\u06cc\u06cc", 500000],
    ["almond", "\u0628\u0627\u062f\u0627\u0645 \u0647\u0646\u062f\u06cc \u062e\u0627\u0645", 3200000],
    ["almond", "\u0628\u0627\u062f\u0627\u0645 \u0647\u0646\u062f\u06cc \u0634\u0648\u0631", 3300000],
    ["almond", "\u0628\u0627\u062f\u0627\u0645 \u0645\u062d\u0628 \u0627\u06cc\u0631\u0627\u0646\u06cc", 2200000],
    ["almond", "\u0628\u0627\u062f\u0627\u0645 \u0645\u062d\u0628 \u0634\u0648\u0631", 2300000],
    ["almond", "\u0628\u0627\u062f\u0627\u0645 \u0632\u0645\u06cc\u0646\u06cc \u0622\u0641\u062a\u0627\u0628\u06af\u0631\u062f\u0627\u0646\u06cc", 1000000],
    ["almond", "\u0628\u0627\u062f\u0627\u0645 \u0632\u0645\u06cc\u0646\u06cc \u0634\u0648\u0631 \u062e\u0627\u0631\u062c\u06cc", 700000],
    ["walnut", "\u0645\u063a\u0632 \u06af\u0631\u062f\u0648 \u062e\u0627\u0631\u062c\u06cc", 750000],
    ["hazelnut", "\u0641\u0646\u062f\u0642 \u062e\u0627\u0645", null],
    ["hazelnut", "\u0641\u0646\u062f\u0642 \u0634\u0648\u0631", null],
    ["hazelnut", "\u0645\u063a\u0632 \u0641\u0646\u062f\u0642 \u062e\u0627\u0645", null],
    ["hazelnut", "\u0645\u063a\u0632 \u0641\u0646\u062f\u0642 \u0634\u0648\u0631", null],
    ["raisin", "\u06a9\u0634\u0645\u0634 \u067e\u0644\u0648\u06cc\u06cc \u0637\u0644\u0627\u06cc\u06cc", 690000],
    ["raisin", "\u06a9\u0634\u0645\u0634 \u067e\u0644\u0648\u06cc\u06cc \u0645\u0634\u06a9\u06cc", 670000],
    ["raisin", "\u0645\u0648\u06cc\u0632", 950000],
    ["date", "\u062e\u0631\u0645\u0627 \u0632\u0627\u0647\u062f\u06cc", 2850000],
    ["fruit", "\u0622\u0644\u0648\u0686\u0647 \u0628\u0631\u063a\u0627\u0646\u06cc", 1600000],
    ["fruit", "\u062a\u0648\u062a \u062e\u0634\u06a9", 1300000],
    ["fruit", "\u0627\u0646\u062c\u06cc\u0631 \u0627\u0633\u062a\u0647\u0628\u0627\u0646", 1550000],
    ["fruit", "\u0628\u0631\u06af\u0647 \u0632\u0631\u062f\u0622\u0644\u0648", 1100000],
    ["fruit", "\u0628\u0631\u06af\u0647 \u0647\u0644\u0648", 1400000],
    ["legumes", "\u0644\u0648\u0628\u06cc\u0627 \u0686\u06cc\u062a\u06cc", 450000],
    ["legumes", "\u0644\u0648\u0628\u06cc\u0627 \u06a9\u0631\u0645", 470000],
    ["legumes", "\u0644\u0648\u0628\u06cc\u0627 \u0633\u0641\u06cc\u062f", 360000],
    ["legumes", "\u0644\u0648\u0628\u06cc\u0627 \u0686\u0634\u0645 \u0628\u0644\u0628\u0644\u06cc", 320000],
    ["legumes", "\u0644\u0648\u0628\u06cc\u0627 \u0639\u0631\u0648\u0633", 380000],
    ["legumes", "\u0644\u0648\u0628\u06cc\u0627 \u0642\u0631\u0645\u0632", 350000],
    ["legumes", "\u0646\u062e\u0648\u062f \u062f\u0631\u0634\u062a", 310000],
    ["legumes", "\u0639\u062f\u0633 \u0631\u06cc\u0632", 280000],
    ["legumes", "\u0639\u062f\u0633 \u062f\u0631\u0634\u062a", 310000],
    ["legumes", "\u0645\u0627\u0634 \u06af\u0644\u200c\u06af\u0646\u062f\u0647", 360000],
    ["legumes", "\u0644\u067e\u0647 \u0622\u0630\u0631\u0634\u0647\u0631", 340000],
    ["legumes", "\u062f\u0627\u0644 \u0639\u062f\u0633", 300000],
    ["legumes", "\u0646\u062e\u0648\u062f\u0686\u06cc \u06af\u0648\u0634\u062a\u06cc", 390000],
    ["seeds", "\u062a\u062e\u0645\u0647 \u0698\u0627\u067e\u0646\u06cc", 1000000],
    ["seeds", "\u062a\u062e\u0645\u0647 \u0645\u0631\u0645\u0631\u06cc \u062e\u0627\u0645", 1100000],
    ["seeds", "\u062a\u062e\u0645\u0647 \u0645\u0631\u0645\u0631\u06cc \u062a\u06af\u0631\u06cc", 1200000],
    ["seeds", "\u062a\u062e\u0645\u0647 \u06a9\u062f\u0648 \u06af\u0648\u0634\u062a\u06cc \u067e\u0648\u062f\u0631\u06cc", 1100000],
    ["seeds", "\u062a\u062e\u0645\u0647 \u06a9\u062f\u0648 \u0632\u0631\u062f", 1100000],
    ["seeds", "\u062a\u062e\u0645\u0647 \u06a9\u062f\u0648 \u062f\u0648 \u0622\u062a\u06cc\u0634\u0647", 1180000],
    ["seeds", "\u062a\u062e\u0645\u0647 \u06a9\u062f\u0648 \u0645\u0634\u0647\u062f\u06cc \u0628\u0648 \u062f\u0627\u062f\u0647", 1000000],
    ["seeds", "\u062a\u062e\u0645\u0647 \u0647\u0646\u062f\u0648\u0627\u0646\u0647 \u0634\u0648\u0631 \u0632\u0631\u062f", 1000000],
    ["seeds", "\u062a\u062e\u0645\u0647 \u0647\u0646\u062f\u0648\u0627\u0646\u0647 \u0633\u0641\u06cc\u062f", 1000000]
  ];
  const PRODUCTS = RAW.map(([cat, name, price], i) => ({
    id: "p" + (i + 1), name, cat, price,
    kind: ART[cat].kind, bg: ART[cat].bg, seed: 11 + i * 7
  }));

  /* ---------- لیبل‌ها و قیمت قبل از تخفیف (فقط نمایشی) ----------
     old = قیمت نمایشی قبل از تخفیف برای ۱ کیلوگرم؛ قیمت نهایی/پرداختی همیشه همان price در RAW است.
     badge: "new" = ویژه، "sale" = تخفیف، "best" = پرفروش */
  const MARKS = {
    "پسته اکبری شور":        { badge: "sale",  old: 4260000 },
    "مغز بادام مامایی":       { badge: "sale",  old: 540000 },
    "آلوچه برغانی":          { badge: "sale",  old: 1690000 },
    "تخمه کدو دو آتیشه":     { badge: "sale",  old: 1240000 },
    "پسته احمد آقایی شور":   { badge: "sale", old: 3990000 },
    "پنج مغز":               { badge: "sale", old: 3700000 },
    "مغز بادام خام ایرانی":   { badge: "sale", old: 3680000 },
    "خرما زاهدی":            { badge: "sale", old: 3000000 },
    "مغز گردو خارجی":        { badge: "sale", old: 800000 },
    "انجیر استهبان":         { badge: "sale", old: 1650000 },
    "نخودچی دوپو": { badge: "new" },
    "بادام هندی خام": { badge: "new" },
    "بادام محب شور": { badge: "new" },
    "مویز": { badge: "new" },
    "توت خشک": { badge: "new" },
    "برگه زردآلو": { badge: "new" },
    "برگه هلو": { badge: "new" },
    "تخمه مرمری تگری": { badge: "new" },
    "تخمه کدو مشهدی بو داده": { badge: "new" },
    "پسته کله قوچی شور":     { badge: "best" },
    "نخودچی شیرین":          { badge: "best" },
    "مغز بادام شور ایرانی":   { badge: "best" },
    "بادام هندی شور":        { badge: "best" },
    "کشمش پلویی طلایی":      { badge: "best" },
    "تخمه ژاپنی":            { badge: "best" }
  };
  PRODUCTS.forEach(p => { const m = MARKS[p.name]; if (m) { p.badge = m.badge; if (m.old) p.old = m.old; } });
  function oldPrice(p, g) { return p.old ? (p.old * g) / 1000 : null; }
  function saveAmount(p, g) { return p.old && p.price != null ? oldPrice(p, g) - unitPrice(p, g) : null; }
  function oldPriceHTML(p, g) {
    const sv = saveAmount(p, g);
    return sv > 0
      ? `<span class="price-old-wrap"><span class="price-old">${fa(oldPrice(p, g))}</span><span class="price-save">${fa(sv)} تومان تخفیف</span></span>`
      : `<span class="price-old"></span>`;
  }

  // قیمت دقیق هر وزن: ۱kg = قیمت مرجع، ۵۰۰g = ۵۰٪، ۲۵۰g = ۲۵٪ (بدون گردکردن)
  function unitPrice(p, g) { return p.price == null ? null : (p.price * g) / 1000; }
  function weightLabel(g) { return (WEIGHTS.find(w => w.g === g) || WEIGHTS[0]).label; }
  function priceText(n) { return n == null ? UNKNOWN_PRICE : fa(n) + " تومان"; }

  const BADGE = {
    sale: { label: "تخفیف", cls: "badge--sale" },
    best: { label: "پرفروش", cls: "badge--best" },
    new:  { label: "ویژه",   cls: "badge--new"  }
  };

  const FREE_SHIP_THRESHOLD = 1000000;
  const SHIP_COST = 45000;
  const FEATURED_COUNT = 8; // تعداد کارت‌های پیش‌نمایش در صفحه اصلی

  /* ---------- تولید تصویر SVG کاسه‌ی خشکبار (بدون تصویر واقعی) ---------- */
  function bowlSVG(kind, bg, seed, viewW, viewH) {
    let s = seed || 7;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const w = viewW || 260, h = viewH || 230;
    const cx = w / 2, bw = w * .66, bh = h * .24, by = h * .60;
    const kinds = Array.isArray(kind) ? kind : [kind];
    const items = [];
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.04 + 0.92 * rnd());
      const rr = Math.sqrt(rnd());
      const x = cx + Math.cos(a) * bw * .5 * rr * .98;
      const y = by - Math.sin(a) * bh * 1.25 * rr;
      const scale = (0.85 + rnd() * 0.4) * (w / 260);
      const rot = rnd() * 180;
      items.push({ x, y, scale, rot, k: kinds[i % kinds.length] });
    }
    items.sort((a, b) => a.y - b.y);
    const nutUses = items.map(it =>
      `<use href="#n-${it.k}" transform="translate(${it.x.toFixed(1)} ${it.y.toFixed(1)}) rotate(${it.rot.toFixed(0)}) scale(${it.scale.toFixed(2)})"/>`
    ).join("");
    const gradId = "bg" + Math.random().toString(36).slice(2, 8);
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/>
      </linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#${gradId})"/>
      <circle cx="${cx}" cy="${h * .42}" r="${w * .3}" fill="#fff" opacity=".35"/>
      ${nutUses}
      <path d="M${cx - bw / 2} ${by - 3} Q${cx - bw / 2} ${by + bh} ${cx} ${by + bh} Q${cx + bw / 2} ${by + bh} ${cx + bw / 2} ${by - 3} Z" fill="url(#g-bowl)"/>
      <ellipse cx="${cx}" cy="${by - 3}" rx="${bw / 2}" ry="${h * .026}" fill="#EADCBB"/>
      <path d="M${cx - bw / 2 + 10} ${by + bh * .32} Q${cx} ${by + bh * .52} ${cx + bw / 2 - 10} ${by + bh * .32}" stroke="#D4AF37" stroke-width="2" fill="none" opacity=".8"/>
    </svg>`;
  }

  /* ---------- وضعیت: سبد خرید و علاقه‌مندی ---------- */
  const state = {
    cart: storage("njk_cart_v2", {}),        // { "productId|grams": qty }
    wishlist: storage("njk_wishlist_v2", []) // [productId]
  };

  function findProduct(id) { return PRODUCTS.find(p => p.id === id); }
  const cartKey = (id, g) => id + "|" + g;
  function parseKey(key) {
    const [id, g] = String(key).split("|");
    const p = findProduct(id), grams = Number(g);
    return p && WEIGHTS.some(w => w.g === grams) ? { p, g: grams } : null;
  }
  // پاک‌سازی سبد/علاقه‌مندی ذخیره‌شده‌ی قدیمی (محصول حذف‌شده، ساختار قدیمی، بدون قیمت)
  (function sanitizeStored() {
    const clean = {};
    Object.entries(state.cart).forEach(([k, q]) => {
      const r = parseKey(k);
      if (r && r.p.price != null && Number.isInteger(q) && q > 0) clean[k] = q;
    });
    state.cart = clean; save("njk_cart_v2", clean);
    state.wishlist = state.wishlist.filter(id => findProduct(id));
    save("njk_wishlist_v2", state.wishlist);
  })();
  function cartCount() { return Object.values(state.cart).reduce((a, b) => a + b, 0); }
  function cartSubtotal() {
    return Object.entries(state.cart).reduce((sum, [k, qty]) => {
      const r = parseKey(k); return r ? sum + unitPrice(r.p, r.g) * qty : sum;
    }, 0);
  }

  function addToCart(id, g, qty) {
    const p = findProduct(id);
    if (!p || p.price == null) { toast("قیمت این محصول هنوز مشخص نشده است."); return false; }
    const k = cartKey(id, g || DEFAULT_G);
    state.cart[k] = (state.cart[k] || 0) + (qty || 1);
    save("njk_cart_v2", state.cart);
    renderCart(); updateCounts();
    return true;
  }
  function setQty(key, qty) {
    if (qty <= 0) { delete state.cart[key]; } else { state.cart[key] = qty; }
    save("njk_cart_v2", state.cart);
    renderCart(); updateCounts();
  }
  function removeFromCart(key) { setQty(key, 0); }

  function toggleWishlist(id) {
    const i = state.wishlist.indexOf(id);
    if (i > -1) state.wishlist.splice(i, 1); else state.wishlist.push(id);
    save("njk_wishlist_v2", state.wishlist);
    renderWishlist(); updateCounts();
    $$(`[data-wish-toggle="${id}"]`).forEach(btn => btn.classList.toggle("is-active", state.wishlist.includes(id)));
    return state.wishlist.includes(id);
  }

  function updateCounts() {
    const cc = cartCount(), wc = state.wishlist.length;
    $$("[data-cart-count]").forEach(el => { el.textContent = fa(cc); el.hidden = cc === 0; });
    $$("[data-wish-count]").forEach(el => { el.textContent = fa(wc); el.hidden = wc === 0; });
    const cct = $("[data-cart-count-text]"); if (cct) cct.textContent = cc ? `(${fa(cc)})` : "";
    const wct = $("[data-wish-count-text]"); if (wct) wct.textContent = wc ? `(${fa(wc)})` : "";
  }

  /* ---------- کارت محصول (مشترک بین صفحه اصلی و فروشگاه) ---------- */
  function productCard(p) {
    const li = document.createElement("li");
    li.innerHTML = `
      <article class="product-card neo" data-card="${p.id}">
        <div class="product-card__media">
          ${bowlSVG(p.kind, p.bg, p.seed, 252, 220)}
          ${p.badge ? `<span class="badge ${BADGE[p.badge].cls}">${p.badge === "new" ? '<svg class="icon icon--fill icon--xs" aria-hidden="true"><use href="#i-star"/></svg>' : ""}${BADGE[p.badge].label}</span>` : ""}
          <button class="wish-btn" type="button" data-wish-toggle="${p.id}" aria-pressed="${state.wishlist.includes(p.id)}" aria-label="افزودن ${p.name} به علاقه‌مندی‌ها">
            <svg class="icon" aria-hidden="true"><use href="#i-heart"/></svg>
          </button>
          <button class="qv-btn glass" type="button" data-quickview="${p.id}">
            <svg class="icon icon--sm" aria-hidden="true"><use href="#i-eye"/></svg>
            مشاهده سریع
          </button>
        </div>
        <div class="product-card__info">
          <p class="product-card__cat">${CATEGORY_LABEL[p.cat]}</p>
          <h3 class="product-card__name">${p.name}</h3>
          <span class="weight-chip">${weightLabel(DEFAULT_G)}</span>
          <div class="price-row">
            ${oldPriceHTML(p, DEFAULT_G)}
            ${p.price == null
              ? `<span class="price-now"><b class="price-unknown">${UNKNOWN_PRICE}</b></span>`
              : `<span class="price-now"><b>${fa(p.price)}</b><span>تومان</span></span>`}
          </div>
        </div>
        <button class="add-btn" type="button" data-add-to-cart="${p.id}"${p.price == null ? " disabled" : ""}>
          <svg class="icon" aria-hidden="true"><use href="#i-cart"/></svg>
          افزودن به سبد خرید
        </button>
      </article>`;
    li.querySelector(`[data-wish-toggle="${p.id}"]`).classList.toggle("is-active", state.wishlist.includes(p.id));
    return li;
  }

  const GRID = $("#product-grid");

  function fillGrid(list) {
    GRID.innerHTML = "";
    if (!list.length) {
      GRID.innerHTML = `<li class="no-results">محصولی در این دسته پیدا نشد.</li>`;
    } else {
      list.forEach(p => GRID.appendChild(productCard(p)));
    }
  }

  /* شمارنده‌ی هر دسته — روی هر عنصر [data-count] در هر صفحه‌ای که باشد */
  function renderCategoryCounts() {
    $$("[data-count]").forEach(el => {
      const n = PRODUCTS.filter(p => p.cat === el.dataset.count).length;
      el.textContent = fa(n);
    });
  }

  /* ---------- صفحه اصلی: پیش‌نمایش ثابت محصولات ویژه (بدون فیلتر/اسکرول) ---------- */
  function renderFeaturedGrid() {
    /* فقط محصولات دارای لیبل (تخفیف/پرفروش/ویژه)، به‌صورت چرخشی تا ترکیب متنوع باشد */
    const groups = ["sale", "best", "new"].map(b => PRODUCTS.filter(p => p.badge === b));
    const picked = [];
    for (let i = 0; picked.length < FEATURED_COUNT && groups.some(g => i < g.length); i++) {
      groups.forEach(g => { if (g[i] && picked.length < FEATURED_COUNT) picked.push(g[i]); });
    }
    fillGrid(picked);
    renderCategoryCounts();
  }

  /* ---------- صفحه فروشگاه: فیلتر واقعی بر اساس ?category= در آدرس ---------- */
  function renderShopGrid() {
    const params = new URLSearchParams(location.search);
    const cat = params.get("category");
    const valid = cat && CATEGORY_LABEL[cat] ? cat : null;

    const list = valid ? PRODUCTS.filter(p => p.cat === valid) : PRODUCTS.slice();
    fillGrid(list);
    renderCategoryCounts();

    // به‌روزرسانی بنر و بردکرامب
    const titleEl = $("[data-shop-title]");
    const subEl = $("[data-shop-sub]");
    const crumbEl = $("#breadcrumb-current");
    if (valid) {
      if (titleEl) titleEl.textContent = CATEGORY_LABEL[valid];
      if (subEl) subEl.textContent = `${fa(list.length)} محصول در دسته‌بندی «${CATEGORY_LABEL[valid]}»`;
      if (crumbEl) crumbEl.textContent = CATEGORY_LABEL[valid];
    } else {
      if (titleEl) titleEl.textContent = "فروشگاه خشکبار نقش جهان";
      if (subEl) subEl.textContent = "مرور و خرید همه‌ی محصولات، بر اساس دسته‌بندی دلخواه شما";
      if (crumbEl) crumbEl.textContent = "فروشگاه";
    }

    // هایلایت Pill فعال
    $$("[data-cat-pill]").forEach(pill => {
      const isActive = valid ? pill.dataset.category === valid : !pill.dataset.category;
      pill.classList.toggle("is-active", isActive);
    });

    document.title = (valid ? `${CATEGORY_LABEL[valid]} | فروشگاه` : "فروشگاه") + " | خشکبار نقش جهان";

    // توضیحات دسته‌بندی زیر محصولات: فقط برای دسته‌ی انتخاب‌شده
    const infoSection = $("#cat-info-section");
    if (infoSection) {
      const hasInfo = !!(valid && $(`[data-cat-info="${valid}"]`));
      infoSection.hidden = !hasInfo;
      $$("[data-cat-info]").forEach(a => { a.hidden = a.dataset.catInfo !== valid; });
    }
  }

  if (GRID) {
    if (PAGE === "shop") {
      renderShopGrid();
    } else if (PAGE === "home") {
      renderFeaturedGrid();
    }

    GRID.addEventListener("click", (e) => {
    const wishBtn = e.target.closest("[data-wish-toggle]");
    if (wishBtn) {
      const active = toggleWishlist(wishBtn.dataset.wishToggle);
      wishBtn.setAttribute("aria-pressed", String(active));
      if (active) { wishBtn.classList.remove("is-popping"); void wishBtn.offsetWidth; wishBtn.classList.add("is-popping"); }
      return;
    }
    const qvBtn = e.target.closest("[data-quickview]");
    if (qvBtn) { openQuickView(qvBtn.dataset.quickview); return; }
    const addBtn = e.target.closest("[data-add-to-cart]");
    if (addBtn) {
      if (!addToCart(addBtn.dataset.addToCart, DEFAULT_G, 1)) return;
      const p = findProduct(addBtn.dataset.addToCart);
      toast(`«${p.name}» به سبد خرید افزوده شد`);
      addBtn.classList.add("is-added");
      addBtn.querySelector("svg use").setAttribute("href", "#i-check");
      setTimeout(() => { addBtn.classList.remove("is-added"); addBtn.querySelector("svg use").setAttribute("href", "#i-cart"); }, 1100);
      return;
    }
    // کلیک روی هر قسمت خالیِ دیگرِ کارت (تصویر، عنوان، قیمت و ...) هم
    // مثل دکمه‌ی «مشاهده سریع» عمل می‌کند
    const card = e.target.closest("[data-card]");
    if (card) { openQuickView(card.dataset.card); }
    });
  }

  /* ---------- رندر سبد خرید ---------- */
  const CART_LIST = $("#cart-list");
  function renderCart() {
    const entries = Object.entries(state.cart);
    CART_LIST.innerHTML = "";
    $("#cart-empty").hidden = entries.length > 0;
    $("#cart-foot").hidden = entries.length === 0;
    entries.forEach(([id, qty]) => {
      const r = parseKey(id); if (!r) return;
      const p = r.p;
      const li = document.createElement("li");
      li.className = "line-item";
      li.innerHTML = `
        <div class="line-item__thumb">${bowlSVG(p.kind, p.bg, p.seed, 80, 80)}</div>
        <div class="line-item__body">
          <div class="line-item__top">
            <div><p class="line-item__name">${p.name}</p><p class="line-item__weight">${weightLabel(r.g)}</p></div>
            <button class="line-item__remove" type="button" data-remove="${id}" aria-label="حذف ${p.name}">
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-trash"/></svg>
            </button>
          </div>
          <div class="line-item__bottom">
            <div class="stepper" role="group" aria-label="تعداد ${p.name}">
              <button type="button" data-step="-1" data-id="${id}" aria-label="کم کردن یک عدد">
                <svg class="icon icon--sm" aria-hidden="true"><use href="#i-minus"/></svg>
              </button>
              <span>${fa(qty)}</span>
              <button type="button" data-step="1" data-id="${id}" aria-label="یک عدد بیشتر">
                <svg class="icon icon--sm" aria-hidden="true"><use href="#i-plus"/></svg>
              </button>
            </div>
            <span class="line-item__price">${fa(unitPrice(p, r.g) * qty)} تومان</span>
          </div>
        </div>`;
      CART_LIST.appendChild(li);
    });

    const subtotal = cartSubtotal();
    $("#cart-subtotal").textContent = fa(subtotal) + " تومان";
    const remaining = FREE_SHIP_THRESHOLD - subtotal;
    const shipEl = $("#cart-shipping");
    if (subtotal === 0) {
      shipEl.textContent = "—";
    } else if (remaining > 0) {
      shipEl.textContent = fa(SHIP_COST) + " تومان";
    } else {
      shipEl.textContent = "رایگان";
    }
    const shipText = $("#ship-text");
    const shipFill = $("#ship-fill");
    if (subtotal === 0) {
      shipText.textContent = "با اولین خرید، از ارسال رایگان مطلع می‌شوید.";
      shipFill.style.width = "0%";
    } else if (remaining > 0) {
      shipText.innerHTML = `تا <strong>${fa(remaining)} تومان</strong> دیگر، ارسال رایگان می‌شود.`;
      shipFill.style.width = Math.min(100, (subtotal / FREE_SHIP_THRESHOLD) * 100) + "%";
    } else {
      shipText.textContent = "سفارش شما شامل ارسال رایگان است. 🎉";
      shipFill.style.width = "100%";
    }
  }

  CART_LIST.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]");
    if (rm) { removeFromCart(rm.dataset.remove); return; }
    const step = e.target.closest("[data-step]");
    if (step) {
      const id = step.dataset.id;
      const delta = Number(step.dataset.step);
      setQty(id, (state.cart[id] || 0) + delta);
    }
  });

  $("[data-action='checkout']").addEventListener("click", () => {
    if (cartCount() === 0) { toast("سبد خرید شما خالی است."); return; }
    if (!AUTH.isLoggedIn()) {
      toast("برای تسویه‌حساب ابتدا وارد حساب کاربری خود شوید.");
      location.href = "account.html?next=checkout.html";
      return;
    }
    location.href = "checkout.html";
  });

  /* ---------- رندر علاقه‌مندی‌ها ---------- */
  const WISH_LIST = $("#wishlist-list");
  function renderWishlist() {
    WISH_LIST.innerHTML = "";
    $("#wishlist-empty").hidden = state.wishlist.length > 0;
    state.wishlist.forEach(id => {
      const p = findProduct(id); if (!p) return;
      const li = document.createElement("li");
      li.className = "line-item";
      li.innerHTML = `
        <div class="line-item__thumb">${bowlSVG(p.kind, p.bg, p.seed, 80, 80)}</div>
        <div class="line-item__body">
          <div class="line-item__top">
            <div><p class="line-item__name">${p.name}</p><p class="line-item__weight">${weightLabel(DEFAULT_G)}</p></div>
            <button class="line-item__remove" type="button" data-wish-remove="${id}" aria-label="حذف ${p.name} از علاقه‌مندی‌ها">
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-trash"/></svg>
            </button>
          </div>
          <div class="line-item__bottom">
            <span class="line-item__price">${priceText(p.price)}</span>
            <button class="wish-move" type="button" data-wish-to-cart="${id}">افزودن به سبد</button>
          </div>
        </div>`;
      WISH_LIST.appendChild(li);
    });
  }
  WISH_LIST.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-wish-remove]");
    if (rm) { toggleWishlist(rm.dataset.wishRemove); return; }
    const add = e.target.closest("[data-wish-to-cart]");
    if (add && addToCart(add.dataset.wishToCart, DEFAULT_G, 1)) { toast("به سبد خرید افزوده شد"); }
  });

  /* ---------- مشاهده سریع ---------- */
  const QV = $("#quickview");
  function openQuickView(id) {
    const p = findProduct(id); if (!p) return;
    let activeG = DEFAULT_G;

    function render() {
      const price = unitPrice(p, activeG);
      $("#qv-content").innerHTML = `
        <div class="qv__media">${bowlSVG(p.kind, p.bg, p.seed, 420, 420)}</div>
        <div class="qv__info">
          <p class="qv__cat">${CATEGORY_LABEL[p.cat]}</p>
          <h2 class="qv__name" id="qv-title">${p.name}</h2>
          <div class="qv__weights" role="group" aria-label="انتخاب وزن">
            ${WEIGHTS.map(w => `<button type="button" data-g="${w.g}" class="${w.g === activeG ? "is-active" : ""}" aria-pressed="${w.g === activeG}">${w.label}</button>`).join("")}
          </div>
          ${price == null
            ? `<p class="qv__price"><b class="price-unknown">${UNKNOWN_PRICE}</b></p>`
            : `<p class="qv__price"><b>${fa(price)}</b><span>تومان</span>${saveAmount(p, activeG) > 0 ? `<span class="price-old">${fa(oldPrice(p, activeG))}</span><span class="price-save">${fa(saveAmount(p, activeG))} تومان تخفیف</span>` : ""}</p>`}
          <div class="qv__actions">
            <button class="add-btn" type="button" id="qv-add"${price == null ? " disabled" : ""}>
              <svg class="icon" aria-hidden="true"><use href="#i-cart"/></svg>
              افزودن به سبد خرید
            </button>
            <button class="icon-btn neo" type="button" id="qv-wish" aria-label="افزودن به علاقه‌مندی‌ها" aria-pressed="${state.wishlist.includes(p.id)}">
              <svg class="icon ${state.wishlist.includes(p.id) ? 'icon--fill' : ''}" aria-hidden="true"><use href="#i-heart"/></svg>
            </button>
          </div>
        </div>`;
      $$("[data-g]", QV).forEach(btn => btn.addEventListener("click", () => { activeG = Number(btn.dataset.g); render(); }));
      $("#qv-add", QV).addEventListener("click", () => {
        if (!addToCart(p.id, activeG, 1)) return;
        toast(`«${p.name}» (${weightLabel(activeG)}) به سبد خرید افزوده شد`); closeAllDialogs();
      });
      $("#qv-wish", QV).addEventListener("click", (e) => {
        const active = toggleWishlist(p.id);
        e.currentTarget.setAttribute("aria-pressed", String(active));
        e.currentTarget.querySelector("svg").classList.toggle("icon--fill", active);
      });
    }
    render();
    openDialog(QV);
  }

  /* ---------- جستجوی زنده (قابل استفاده برای چند نمونه: هدر دسکتاپ + منوی موبایل) ---------- */
  function highlight(text, q) {
    if (!q) return text;
    const idx = text.indexOf(q);
    if (idx === -1) return text;
    return text.slice(0, idx) + "<mark>" + text.slice(idx, idx + q.length) + "</mark>" + text.slice(idx + q.length);
  }

  function initSearch(formId) {
    const form = $(formId);
    if (!form) return; // این صفحه ممکن است این نمونه از سرچ را نداشته باشد
    const input = $(".search__input", form);
    const panel = $(".search__panel", form);
    const results = $(".search__list", form);
    const allBtn = $(".search__all", form);

    function runSearch(q) {
      q = q.trim();
      if (!q) { panel.hidden = true; input.setAttribute("aria-expanded", "false"); return; }
      const matches = PRODUCTS.filter(p => p.name.includes(q) || CATEGORY_LABEL[p.cat].includes(q));
      results.innerHTML = "";
      if (!matches.length) {
        results.innerHTML = `<li class="search__empty">چیزی برای «${q}» پیدا نشد.</li>`;
      } else {
        matches.slice(0, 6).forEach(p => {
          const li = document.createElement("li");
          li.innerHTML = `
            <button class="search__item" type="button" data-goto="${p.id}" role="option">
              <span class="search__thumb">${bowlSVG(p.kind, p.bg, p.seed, 60, 60)}</span>
              <span class="search__meta">
                <span class="search__name">${highlight(p.name, q)}</span>
                <span class="search__price">${weightLabel(DEFAULT_G)} · ${priceText(p.price)}</span>
              </span>
            </button>`;
          results.appendChild(li);
        });
      }
      allBtn.hidden = matches.length <= 6;
      allBtn.textContent = `مشاهده همه ${fa(matches.length)} نتیجه در فروشگاه`;
      panel.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    let debounce;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => runSearch(input.value), 120);
    });
    input.addEventListener("focus", () => { if (input.value.trim()) runSearch(input.value); });
    results.addEventListener("click", (e) => {
      const item = e.target.closest("[data-goto]");
      if (item) { openQuickView(item.dataset.goto); panel.hidden = true; input.value = ""; }
    });
    document.addEventListener("click", (e) => {
      if (!form.contains(e.target)) panel.hidden = true;
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Escape") { panel.hidden = true; input.blur(); } });
  }

  initSearch("#search");    // نوار سرچ هدر (دسکتاپ)
  initSearch("#search-m");  // سرچ داخل منوی موبایل

  /* ---------- منوی «دسته‌بندی‌ها» در هدر (فقط باز/بسته‌شدن dropdown، لینک‌ها واقعی‌اند) ---------- */
  const hasMenu = $(".has-menu");
  const submenuBtn = $("[data-action='submenu']");
  submenuBtn.addEventListener("click", () => {
    const open = hasMenu.classList.toggle("is-open");
    submenuBtn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => {
    if (!hasMenu.contains(e.target)) { hasMenu.classList.remove("is-open"); submenuBtn.setAttribute("aria-expanded", "false"); }
  });

  /* ---------- پنل‌های <dialog>: باز/بسته‌شدن، فوکوس، اسکرول پس‌زمینه ---------- */
  let openDialogEl = null;
  function openDialog(el) {
    if (openDialogEl && openDialogEl !== el) closeAllDialogs();
    document.documentElement.style.overflow = "hidden";
    el.showModal();
    openDialogEl = el;
  }
  function closeAllDialogs() {
    $$("dialog[open]").forEach(d => d.close());
  }
  $$("dialog").forEach(d => {
    d.addEventListener("close", () => {
      document.documentElement.style.overflow = "";
      if (openDialogEl === d) openDialogEl = null;
    });
    // کلیک روی بک‌دراپ برای بستن
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  });
  document.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-action='cart-open']");
    if (openBtn) { openDialog($("#cart-drawer")); return; }
    const wishBtn = e.target.closest("[data-action='wishlist-open']");
    if (wishBtn) { openDialog($("#wishlist-drawer")); return; }
    const menuBtn = e.target.closest("[data-action='menu-open']");
    if (menuBtn) { openDialog($("#mobile-menu")); return; }
    const closeBtn = e.target.closest("[data-action='close']");
    if (closeBtn) { closeAllDialogs(); }
  });
  // با کلیک روی هر لینک داخل منوی موبایل، منو بسته شود (پیش از هدایت به صفحه مقصد)
  $("#mobile-menu").addEventListener("click", (e) => { if (e.target.closest("a")) closeAllDialogs(); });

  /* ---------- Toast ---------- */
  function toast(msg) {
    const box = $("#toasts");
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><span>${msg}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .25s"; setTimeout(() => t.remove(), 260); }, 2600);
  }

  /* ---------- وضعیت ورود در سراسر سایت: آیکون هدر + نوار فوتر ---------- */
  function renderAuthUI() {
    const user = AUTH.currentUser();
    const link = $("#account-link");
    if (link) {
      link.classList.toggle("is-logged-in", !!user);
      link.setAttribute("aria-label", user ? `حساب کاربری (${user.name})` : "ورود / ثبت‌نام");
    }
    const band = $("#auth-band-content");
    if (band) {
      if (user) {
        band.innerHTML = `
          <div>
            <h2>سلام ${user.name} عزیز 👋</h2>
            <p>به حساب کاربری خود وارد شده‌اید. سفارش‌های خود را از این‌جا پیگیری کنید.</p>
          </div>
          <div class="auth-band__actions">
            <a class="btn btn--gold" href="account.html">
              حساب من
              <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg>
            </a>
            <button class="btn btn--outline-gold" type="button" data-action="logout">خروج از حساب</button>
          </div>`;
      } else {
        band.innerHTML = `
          <div>
            <h2>عضو خانواده نقش جهان شوید</h2>
            <p>برای ثبت سفارش، پیگیری ارسال و تسویه‌حساب سریع‌تر وارد حساب کاربری خود شوید</p>
          </div>
          <div class="auth-band__actions">
            <a class="btn btn--gold" href="account.html">
              ورود / ثبت‌نام
              <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg>
            </a>
          </div>`;
      }
    }
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-action='logout']")) {
      AUTH.logout();
      toast("از حساب کاربری خارج شدید.");
      renderAuthUI();
    }
  });


  const header = $("#site-header");
  const sentinel = $("#header-sentinel");
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      header.classList.toggle("is-scrolled", !entry.isIntersecting);
    }, { threshold: 0 }).observe(sentinel);
  } else {
    window.addEventListener("scroll", () => header.classList.toggle("is-scrolled", window.scrollY > 10));
  }

  /* ---------- نوار اعلان: بستن با یادآوری در همین بازدید ---------- */
  const announce = $("#announce");
  $("[data-action='announce-close']").addEventListener("click", () => {
    announce.classList.add("is-closed");
    try { sessionStorage.setItem("njk_announce_closed", "1"); } catch (e) {}
  });
  try { if (sessionStorage.getItem("njk_announce_closed") === "1") announce.classList.add("is-closed"); } catch (e) {}

  /* ---------- اسکرول نرم فقط برای لنگرهای داخل همین صفحه ---------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    if (id.length < 2) return;
    const target = $(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", id);
    }
  });

  /* ---------- صفحه حساب کاربری: ورود / ثبت‌نام ---------- */
  function toEnDigits(s) {
    return String(s).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  }
  function isValidPhone(p) { return /^09\d{9}$/.test(p); }

  function initAccountPage() {
    const nextUrl = new URLSearchParams(location.search).get("next") || "index.html";
    const guestBox = $("#auth-guest");
    const profileBox = $("#auth-profile");

    function showProfile() {
      const u = AUTH.currentUser();
      if (!u) return;
      guestBox.hidden = true;
      profileBox.hidden = false;
      $("#profile-name").textContent = `${u.name} ${u.family}`;
      $("#profile-phone").textContent = u.phone;
      $("#profile-city").textContent = u.city || "—";
      $("#profile-address").textContent = u.address || "—";
      $("#profile-next").href = nextUrl;
    }
    if (AUTH.isLoggedIn()) { showProfile(); return; } // برای مهمان ادامه می‌دهیم

    // --- تب‌های ورود/ثبت‌نام ---
    function activateTab(name) {
      $$(".auth-tab").forEach(t => { const on = t.dataset.tab === name; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", String(on)); });
      $$(".auth-panel").forEach(p => p.classList.toggle("is-active", p.dataset.panel === name));
    }
    $$(".auth-tab").forEach(t => t.addEventListener("click", () => activateTab(t.dataset.tab)));
    $$("[data-goto-tab]").forEach(b => b.addEventListener("click", () => activateTab(b.dataset.gotoTab)));

    // --- نمایش/مخفی‌کردن رمز عبور ---
    $$("[data-action='toggle-pass']").forEach(btn => {
      btn.addEventListener("click", () => {
        const input = btn.previousElementSibling;
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        btn.querySelector("use").setAttribute("href", showing ? "#i-eye" : "#i-eye-off");
      });
    });

    function showError(id, msg) { const el = $(id); el.textContent = msg; el.hidden = false; }
    function hideError(id) { $(id).hidden = true; }

    // --- پنل ورود ---
    $("#panel-login").addEventListener("submit", (e) => {
      e.preventDefault();
      hideError("#login-error");
      const phone = toEnDigits($("#login-phone").value.trim());
      const password = $("#login-password").value;
      if (!isValidPhone(phone)) { showError("#login-error", "شماره موبایل معتبر نیست (باید با ۰۹ شروع شود و ۱۱ رقم باشد)."); return; }
      const res = AUTH.login(phone, password);
      if (!res.ok) {
        showError("#login-error", res.reason === "notfound" ? "حسابی با این شماره پیدا نشد. از تب «ثبت‌نام» شروع کنید." : "رمز عبور اشتباه است.");
        return;
      }
      toast(`خوش آمدید ${res.user.name}!`);
      renderAuthUI();
      location.href = nextUrl;
    });

    // --- پنل ثبت‌نام: گام‌ها ---
    let currentPhone = "";
    function goStep(step) { $$(".auth-step").forEach(s => s.classList.toggle("is-active", s.dataset.step === step)); }

    let countdownTimer = null;
    function startCountdown(seconds) {
      const el = $("#otp-countdown");
      const resend = $("#otp-resend");
      resend.hidden = true;
      clearInterval(countdownTimer);
      let left = seconds;
      const tick = () => {
        el.textContent = left > 0 ? `ارسال مجدد کد تا ${fa(left)} ثانیه دیگر` : "";
        if (left <= 0) { clearInterval(countdownTimer); resend.hidden = false; }
        left--;
      };
      tick();
      countdownTimer = setInterval(tick, 1000);
    }

    function requestOtp() {
      hideError("#signup-phone-error");
      const phone = toEnDigits($("#signup-phone").value.trim());
      if (!isValidPhone(phone)) { showError("#signup-phone-error", "شماره موبایل معتبر نیست (باید با ۰۹ شروع شود و ۱۱ رقم باشد)."); return; }
      if (AUTH.getUser() && AUTH.getUser().phone === phone) {
        showError("#signup-phone-error", "این شماره قبلاً ثبت‌نام کرده؛ از تب «ورود» استفاده کنید.");
        return;
      }
      currentPhone = phone;
      const code = AUTH.sendOtp(phone);
      $("#otp-demo-note").innerHTML = `چون این نسخه‌ی نمایشی بدون سرویس پیامک واقعی است، کد تایید همین‌جا نشان داده می‌شود:<strong dir="ltr">${code}</strong>`;
      $$(".otp-box").forEach(b => b.value = "");
      hideError("#otp-error");
      goStep("otp");
      startCountdown(120);
      setTimeout(() => $(".otp-box").focus(), 50);
    }
    $("[data-action='send-otp']").addEventListener("click", requestOtp);
    $("#otp-resend").addEventListener("click", requestOtp);

    // --- جعبه‌های کد تایید: پیشروی خودکار ---
    const otpBoxes = $$(".otp-box");
    otpBoxes.forEach((box, i) => {
      box.addEventListener("input", () => {
        box.value = toEnDigits(box.value).replace(/\D/g, "").slice(0, 1);
        if (box.value && otpBoxes[i + 1]) otpBoxes[i + 1].focus();
      });
      box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !box.value && otpBoxes[i - 1]) otpBoxes[i - 1].focus();
      });
      box.addEventListener("paste", (e) => {
        const text = toEnDigits((e.clipboardData || window.clipboardData).getData("text")).replace(/\D/g, "");
        if (text.length) { e.preventDefault(); text.slice(0, 4).split("").forEach((ch, k) => { if (otpBoxes[k]) otpBoxes[k].value = ch; }); (otpBoxes[Math.min(text.length, 4) - 1] || otpBoxes[3]).focus(); }
      });
    });

    $("[data-action='verify-otp']").addEventListener("click", () => {
      hideError("#otp-error");
      const code = otpBoxes.map(b => b.value).join("");
      if (code.length < 4) { showError("#otp-error", "کد ۴ رقمی را کامل وارد کنید."); return; }
      const res = AUTH.verifyOtp(currentPhone, code);
      if (!res.ok) {
        showError("#otp-error", res.reason === "expired" ? "کد منقضی شده؛ دوباره درخواست دهید." : "کد وارد شده درست نیست.");
        return;
      }
      clearInterval(countdownTimer);
      goStep("profile");
      setTimeout(() => $("#signup-name").focus(), 50);
    });

    // --- گام ۳: تکمیل ثبت‌نام ---
    $("#panel-signup").addEventListener("submit", (e) => {
      e.preventDefault();
      hideError("#signup-error");
      const name = $("#signup-name").value.trim();
      const family = $("#signup-family").value.trim();
      const city = $("#signup-city").value.trim();
      const address = $("#signup-address").value.trim();
      const password = $("#signup-password").value;
      const password2 = $("#signup-password2").value;
      if (!name || !family) { showError("#signup-error", "نام و نام خانوادگی را وارد کنید."); return; }
      if (!address) { showError("#signup-error", "آدرس را وارد کنید."); return; }
      if (password.length < 4) { showError("#signup-error", "رمز عبور باید حداقل ۴ کاراکتر باشد."); return; }
      if (password !== password2) { showError("#signup-error", "رمز عبور و تکرار آن یکسان نیستند."); return; }
      const user = AUTH.registerUser({ phone: currentPhone, name, family, city, address, password });
      toast(`ثبت‌نام شما تکمیل شد، ${user.name}!`);
      renderAuthUI();
      location.href = nextUrl;
    });
  }
  if (PAGE === "account") initAccountPage();

  /* ---------- صفحه تسویه‌حساب ---------- */
  function initCheckoutPage() {
    if (!AUTH.isLoggedIn()) { location.href = "account.html?next=checkout.html"; return; }

    const formView = $("#checkout-form-view");
    const successView = $("#order-success-view");
    const emptyView = $("#empty-cart-view");

    if (cartCount() === 0) { formView.hidden = true; emptyView.hidden = false; return; }

    const user = AUTH.currentUser();
    $("#co-name").value = `${user.name} ${user.family}`.trim();
    $("#co-phone").value = user.phone;
    $("#co-city").value = user.city || "";
    $("#co-address").value = user.address || "";

    const deliveryDate = estimateDeliveryDate(3);
    $("#delivery-date").textContent = formatJalali(deliveryDate, true);

    // --- خلاصه سفارش ---
    const itemsList = $("#checkout-items");
    itemsList.innerHTML = "";
    Object.entries(state.cart).forEach(([id, qty]) => {
      const r = parseKey(id); if (!r) return;
      const p = r.p;
      const li = document.createElement("li");
      li.className = "line-item";
      li.innerHTML = `
        <div class="line-item__thumb">${bowlSVG(p.kind, p.bg, p.seed, 80, 80)}</div>
        <div class="line-item__body">
          <div class="line-item__top">
            <div><p class="line-item__name">${p.name}</p><p class="line-item__weight">${weightLabel(r.g)} × ${fa(qty)}</p></div>
          </div>
          <div class="line-item__bottom">
            <span></span>
            <span class="line-item__price">${fa(unitPrice(p, r.g) * qty)} تومان</span>
          </div>
        </div>`;
      itemsList.appendChild(li);
    });
    const subtotal = cartSubtotal();
    const shipping = subtotal >= FREE_SHIP_THRESHOLD || subtotal === 0 ? 0 : SHIP_COST;
    $("#co-subtotal").textContent = fa(subtotal) + " تومان";
    $("#co-shipping").textContent = shipping ? fa(shipping) + " تومان" : "رایگان";
    $("#co-total").textContent = fa(subtotal + shipping) + " تومان";

    $("#checkout-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const errEl = $("#co-error");
      errEl.hidden = true;
      const name = $("#co-name").value.trim();
      const phone = toEnDigits($("#co-phone").value.trim());
      const city = $("#co-city").value.trim();
      const address = $("#co-address").value.trim();
      if (!name) { errEl.textContent = "نام گیرنده را وارد کنید."; errEl.hidden = false; return; }
      if (!isValidPhone(phone)) { errEl.textContent = "شماره تماس معتبر نیست."; errEl.hidden = false; return; }
      if (!city) { errEl.textContent = "شهر را وارد کنید."; errEl.hidden = false; return; }
      if (!address) { errEl.textContent = "آدرس کامل را وارد کنید."; errEl.hidden = false; return; }

      const orderNo = "NJ-" + Math.floor(100000 + Math.random() * 900000);
      $("#order-number").textContent = orderNo;
      $("#order-delivery-date").textContent = formatJalali(deliveryDate, true);

      state.cart = {};
      save("njk_cart_v2", state.cart);
      updateCounts();

      formView.hidden = true;
      successView.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast("سفارش شما ثبت شد!");
    });
  }
  if (PAGE === "checkout") initCheckoutPage();


  renderCart();
  renderWishlist();
  updateCounts();
  renderAuthUI();
})();
