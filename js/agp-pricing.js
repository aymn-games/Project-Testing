/**
 * ألعاب أيمن — صفحة الباقات (pricing.html) بالتصميم الجديد.
 *
 * نفس الصفحة القديمة: العداد لين بدء الاشتراكات (نفس config.subscriptionStartAt
 * بالخادم)، واليوم المجاني عبر AGPAuth.startSubscriptionTrial() بنفس رسائل الأخطاء.
 * زر «اشترك» قبل البدء يوضح إن الاشتراكات تبدأ 1 ديسمبر، وبعده يودي لقسم
 * الاشتراك بصفحة الحساب (الدفع وتفعيل الأكواد هناك).
 * يعتمد على js/agp-site.js (window.AGPSite) قبله.
 */
(function () {
  'use strict';
  var START_AT = Date.parse('2026-12-01T00:00:00+03:00');
  var A = window.AGPAuth;
  function $(s) { return document.querySelector(s); }
  function toast(t) { if (window.AGPSite) window.AGPSite.toast(t); }
  function signedIn() { return Boolean(A && A.getToken && A.getToken()); }
  function profileUrl(hash) {
    var u = A && A.getCachedUser ? A.getCachedUser() : null;
    return (u && u.custom_id ? 'profile.html?id=' + encodeURIComponent(u.custom_id) : 'profile.html') + (hash || '');
  }

  /* العداد لين بدء الاشتراكات، وبعدها يختفي وتنشال شارة «قريبا» */
  var U = {};
  ['d', 'h', 'm', 's'].forEach(function (k) { U[k] = document.querySelector('[data-pu="' + k + '"]'); });
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var left = START_AT - Date.now();
    if (left <= 0) {
      var c = $('#pz-count'); if (c) c.hidden = true;
      Array.prototype.forEach.call(document.querySelectorAll('.pl-btn .soon'), function (x) { x.remove(); });
      return false;
    }
    var t = Math.floor(left / 1000);
    U.d.textContent = pad(Math.floor(t / 86400)); U.h.textContent = pad(Math.floor(t % 86400 / 3600));
    U.m.textContent = pad(Math.floor(t % 3600 / 60)); U.s.textContent = pad(t % 60);
    return true;
  }
  if (U.d && tick()) { var timer = setInterval(function () { if (!tick()) clearInterval(timer); }, 1000); }

  /* الأسعار تعد من الصفر أول ما تنفتح الصفحة */
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-amt]'), function (el) {
      var to = parseFloat(el.dataset.amt), t0 = null, D = 900;
      setTimeout(function () {
        (function f(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); el.textContent = (to * e).toFixed(2); if (k < 1) requestAnimationFrame(f); })(performance.now());
      }, 300);
    });
  }

  /* اشترك */
  var plans = $('.pz-plans');
  if (plans) plans.addEventListener('click', function (e) {
    var b = e.target.closest('.pl-btn');
    if (!b) return;
    if (Date.now() < START_AT) { toast('الاشتراكات تبدأ 1 ديسمبر وحاليا كل الألعاب مفتوحة'); return; }
    if (!signedIn()) { if (window.AGPSite) window.AGPSite.openAuth(); else location.href = 'login.html?next=pricing.html'; return; }
    location.href = profileUrl('#subscription');
  });

  /* اليوم المجاني: بدون دخول ← نافذة الدخول، وقبل البدء رسالة، وبعدها يتفعل من الخادم */
  var btn = $('#pz-trial-btn'), msg = $('#pz-msg');
  var ERR = {
    not_started: 'اليوم المجاني يتفعل مع بداية الاشتراكات 1 ديسمبر',
    not_streamer: 'اليوم المجاني لحسابات الستريمر',
    tiktok_not_linked: 'اربط حساب تيك توك من صفحة حسابك أول وارجع فعّل اليوم المجاني',
    had_subscription: 'اليوم المجاني للحسابات الجديدة اللي ما اشتركت قبل',
    tiktok_trial_used: 'حساب التيك توك المربوط استخدم اليوم المجاني قبل وما ينعطى مرتين'
  };
  function show(text, err) { msg.hidden = false; msg.textContent = text; msg.classList.toggle('err', !!err); }
  var confirmAt = 0;
  if (btn) btn.addEventListener('click', function () {
    if (!signedIn()) { if (window.AGPSite) window.AGPSite.openAuth(); else location.href = 'login.html?next=pricing.html'; return; }
    if (Date.now() < START_AT) { show(ERR.not_started); return; }
    // تأكيد بالضغطة الثانية (يبدأ العد من لحظة التفعيل وينعطى مرة وحدة)
    if (Date.now() - confirmAt > 6000) { confirmAt = Date.now(); show('اضغط مرة ثانية للتأكيد اليوم المجاني 24 ساعة من لحظة التفعيل وينعطى مرة وحدة بس'); btn.textContent = 'تأكيد التفعيل'; return; }
    confirmAt = 0;
    btn.disabled = true;
    A.startSubscriptionTrial().then(function (r) {
      if (r && r.success) { btn.textContent = 'تفعّل يومك المجاني'; show('تفعّل يومك المجاني العب الحين من ألعاب البثوث'); if (A.refreshUser) A.refreshUser(); }
      else { btn.disabled = false; btn.textContent = 'ابدأ اليوم المجاني'; show(ERR[r && r.error] || 'تعذّر التفعيل حاول مرة ثانية', true); }
    }).catch(function () { btn.disabled = false; btn.textContent = 'ابدأ اليوم المجاني'; show('تعذّر التفعيل حاول مرة ثانية', true); });
  });
})();
