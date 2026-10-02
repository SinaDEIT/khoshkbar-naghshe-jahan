/* صفحه‌ی لودینگ نقش جهان
   - سریع و هم‌زمان در <head> اجرا می‌شود تا قبل از دیده‌شدن محتوا، پوشش آماده باشد.
   - صبر می‌کند تا صفحه + عکس‌های قابل‌مشاهده + فونت لود شوند، بعد محو می‌شود.
   - هیچ‌وقت گیر نمی‌کند: بعد از MAX_WAIT به هر حال وارد سایت می‌شویم؛ عکس خراب هم مانع نمی‌شود. */
(function () {
  "use strict";
  var MIN_FIRST = 1800;   // اولین ورود در هر نشست: حداقل زمان نمایش (برای خوانده‌شدن پیام)
  var MAX_WAIT  = 12000;  // سقف انتظار
  var SKIP_AFTER = 5000;  // دکمه‌ی «ورود به سایت» بعد از این مدت

  var root = document.documentElement, start = Date.now(), finished = false;
  var seen = false;
  try { seen = sessionStorage.getItem("njk_seen") === "1"; sessionStorage.setItem("njk_seen", "1"); } catch (e) {}

  root.classList.add("njk-loading");
  var el = document.createElement("div");
  el.id = "njk-loader";
  if (seen) el.className = "njk-quick";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML =
    '<div class="njk-box">' +
      '<div class="njk-logo"><img src="assets/img/logo.webp" alt="خشکبار نقش جهان"></div>' +
      '<div class="njk-bar" aria-hidden="true"><i></i></div>' +
      '<div class="njk-pct" aria-hidden="true">۰٪</div>' +
      '<div class="njk-msg">' +
        '<p>به علت ندادن حقوق به ادمین‌ها توسط کارفرما، هاست و سرور سایت ضعیف است. لطفاً زیاد خرید کنید تا به ما حقوق بدهند.</p>' +
        '<p>از شکیبایی شما متشکریم</p>' +
      '</div>' +
      '<button type="button" class="njk-skip">ورود به سایت</button>' +
    '</div>';
  root.appendChild(el);

  var bar = el.querySelector(".njk-bar > i"), pct = el.querySelector(".njk-pct"), skip = el.querySelector(".njk-skip");
  var fa = function (n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); };
  var shown = 0;
  function setProgress(v) {
    v = Math.max(shown, Math.min(100, Math.round(v))); shown = v;
    bar.style.width = v + "%"; pct.textContent = fa(v) + "٪";
  }

  function finish() {
    if (finished) return; finished = true;
    setProgress(100);
    var wait = seen ? 0 : Math.max(0, MIN_FIRST - (Date.now() - start));
    setTimeout(function () {
      el.classList.add("njk-done");
      root.classList.remove("njk-loading");
      document.dispatchEvent(new Event("njk:ready"));
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
    }, wait + 120);
  }
  skip.addEventListener("click", finish);
  setTimeout(function () { skip.classList.add("is-on"); }, SKIP_AFTER);
  setTimeout(finish, MAX_WAIT);

  /* عکس‌هایی که کاربر همین الان می‌بیند (بالای صفحه) — عکس‌های پایین‌تر lazy هستند و منتظرشان نمی‌مانیم */
  function pendingImages() {
    var list = [], vh = window.innerHeight * 1.5;
    Array.prototype.forEach.call(document.images, function (img) {
      if (el.contains(img)) return;
      var r = img.getBoundingClientRect();
      if (img.loading !== "lazy" || r.top < vh) list.push(img);
    });
    return list;
  }
  function imgDone(img) { return img.complete; }   // complete = لود شد یا خطا داد؛ هر دو یعنی دیگر منتظر نمی‌مانیم

  var imgsTotal = 0, imgsDone = 0, timer;
  function poll() {
    if (finished) return;
    var imgs = pendingImages();
    imgsTotal = imgs.length;
    imgsDone = imgs.filter(imgDone).length;
    var real = imgsTotal ? imgsDone / imgsTotal : 1;
    var loaded = document.readyState === "complete";
    var asym = 90 * (1 - Math.exp(-(Date.now() - start) / 2500));        // پیشرفت نرم تا ۹۰٪
    setProgress(Math.min(loaded ? 99 : 90, Math.max(asym * 0.6, real * (loaded ? 99 : 85))));
    if (loaded && imgsDone >= imgsTotal) {
      // یک بار دیگر کمی بعد چک می‌کنیم؛ شاید main.js هنوز کارت محصولات را تازه ساخته باشد
      clearInterval(timer);
      setTimeout(function () {
        var again = pendingImages();
        if (again.every(imgDone)) {
          var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
          fontsReady.then(finish, finish);
        } else { timer = setInterval(poll, 150); }
      }, 150);
    }
  }
  timer = setInterval(poll, 150);
  window.addEventListener("load", poll);
  window.addEventListener("pageshow", function (e) { if (e.persisted) finish(); });   // برگشت با دکمه‌ی Back
})();
