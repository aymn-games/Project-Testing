/**
 * ألعاب أيمن — صفحة استرداد كود (redeem.html) بالتصميم الجديد.
 *
 * نفس منطق الاسترداد بصفحة الحساب (js/agp-profile-page.js):
 *  - AGP-XXXX-XXXX ← AGPAuth.redeemFrameCode: إطار أو بطاقة إقصاء/فوز أو باكج،
 *    وكود الاختيار (kind 'choice') يفتح AGPFramePicker ثم redeemChoiceCode.
 *  - SUB-XXXX-XXXX ← AGPAuth.redeemSubscriptionCode بدون mode (الخادم يمدّد
 *    الاشتراك الفعّال أو يبدأ اشتراك جديد). التجديد بدل التمديد من صفحة الحساب.
 * الزائر تنفتح له نافذة الدخول (AGPSite.openAuth). يعتمد على js/agp-site.js.
 * الرابط ?code=XXXX يعبّي الخانة تلقائياً.
 */
(function () {
  'use strict';
  var A = window.AGPAuth;
  function $(s) { return document.querySelector(s); }
  var rc = $('#rd-code'), rr = $('#rd-result'), go = $('#rd-go'), form = $('#rd-form');
  if (!rc || !form) return;

  var IC = {
    ok: '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z"/></svg>',
    err: '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128Z" opacity="0.2"/><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"/></svg>',
    lock: '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M216,96V208a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8H208A8,8,0,0,1,216,96Z" opacity="0.2"/><path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-68-56a12,12,0,1,1-12-12A12,12,0,0,1,140,152Z"/></svg>'
  };

  var REDEEM_ERRORS = {
    invalid_code: 'الكود غير صحيح، تأكد منه وحاول مرة ثانية',
    code_used: 'هذا الكود مستخدم من قبل',
    code_burned: 'هذا الكود ملغي ولا يمكن استخدامه',
    already_owned: 'عندك كل الإطارات المتاحة بهذا الكود',
    rate_limited: 'محاولات كثيرة، حاول بعد ربع ساعة',
    code_full: 'هذا الكود وصل الحد الأقصى من الاستخدام',
    already_redeemed: 'استخدمت هذا الكود من قبل',
    invalid_frame: 'هذا الإطار مو متاح بهذا الكود، اختر غيره'
  };
  var SUB_ERRORS = {
    invalid_code: 'الكود غير صحيح، تأكد منه',
    code_used: 'هذا الكود مستخدم من قبل',
    code_burned: 'هذا الكود موقوف',
    not_streamer: 'الاشتراك لحسابات الستريمر',
    rate_limited: 'محاولات كثيرة، حاول بعد ربع ساعة'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function monthsText(n) { return n === 1 ? 'شهر' : n === 2 ? 'شهرين' : n <= 10 ? n + ' أشهر' : n + ' شهر'; }
  function signedIn() { return Boolean(A && A.getToken && A.getToken()); }
  function profileUrl(hash) {
    var u = A && A.getCachedUser ? A.getCachedUser() : null;
    return (u && u.custom_id ? 'profile.html?id=' + encodeURIComponent(u.custom_id) : 'profile.html') + (hash || '');
  }
  function toLatin(v) { return String(v || '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); }); }
  function fmtCode(v) {
    v = toLatin(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    return v.replace(/^(.{3})(.{0,4})?(.{0,4})?$/, function (_, a, b, c) { return a + (b ? '-' + b : '') + (c ? '-' + c : ''); });
  }
  function typeOf(v) { return v.indexOf('SUB') === 0 ? 'sub' : v.indexOf('AGP') === 0 ? 'agp' : null; }
  function hitType(v) {
    var t = typeOf(v);
    Array.prototype.forEach.call(document.querySelectorAll('.rt'), function (x) {
      x.classList.toggle('hit', t === 'sub' ? x.dataset.type === 'sub' : t === 'agp' ? x.dataset.type !== 'sub' : false);
    });
  }
  function clear() { rr.className = 'rd-result'; rr.innerHTML = ''; }
  function result(kind, title, sub, btn) {
    rr.className = 'rd-result ' + kind;
    rr.innerHTML = '<span class="ri">' + IC[kind === 'need' ? 'lock' : kind] + '</span><span><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' + (btn || '');
  }
  function busy(on) { go.classList.toggle('loading', on); go.disabled = on; }
  function profileBtn(hash) { return '<a class="btn btn-secondary btn-sm" href="' + profileUrl(hash) + '">ملفي</a>'; }
  function done() { rc.value = ''; hitType(''); }

  rc.addEventListener('input', function () { rc.value = fmtCode(rc.value); rc.classList.remove('bad'); clear(); hitType(rc.value); });
  var paste = $('#rd-paste');
  if (paste) paste.addEventListener('click', function () {
    function manual() { rc.focus(); if (window.AGPSite) window.AGPSite.toast('اضغط مطوّل على الخانة واختر لصق'); }
    try { navigator.clipboard.readText().then(function (t) { rc.value = fmtCode(t); clear(); hitType(rc.value); rc.focus(); }, manual); } catch (e) { manual(); }
  });

  function redeemAgp(code) {
    busy(true);
    A.redeemFrameCode(code).then(function (r) {
      busy(false);
      if (!(r && r.success)) { rc.classList.add('bad'); result('err', REDEEM_ERRORS[r && r.error] || 'تعذّر الاسترداد، حاول مرة ثانية'); return; }
      if (r.kind === 'choice') {
        result('need', 'اختر إطارك', 'تختار إطار واحد وينضاف مباشرة لمقتنياتك');
        if (!window.AGPFramePicker) return;
        window.AGPFramePicker.open({
          title: 'اختر إطارك',
          subtitle: 'تختار إطار واحد، وينضاف مباشرة لمقتنياتك.',
          choices: r.choices,
          onPick: function (choice, name) {
            return A.redeemChoiceCode(r.code, choice.frameType, choice.frameRef).then(function (x) {
              if (x && x.success) { done(); result('ok', 'تم! انضاف إطار "' + name + '" لمقتنياتك', 'تقدر تختاره من ملفك', profileBtn()); return { ok: true }; }
              return { ok: false, error: REDEEM_ERRORS[x && x.error] || 'تعذّر الاسترداد، حاول مرة ثانية.' };
            });
          }
        });
        return;
      }
      done();
      if (r.kind === 'bundle') {
        var names = function (list) { return (list || []).map(function (i) { return i.displayNameAr; }).filter(Boolean).join('، '); };
        var sub = names(r.granted);
        if (r.alreadyOwned && r.alreadyOwned.length) sub += (sub ? ' — ' : '') + 'كان عندك من قبل: ' + names(r.alreadyOwned);
        result('ok', 'تم! انضاف لك باكج "' + ((r.bundle && r.bundle.name) || '') + '"', sub, profileBtn());
        return;
      }
      var isCard = r.kind === 'elim' || r.kind === 'win';
      var name = ((isCard ? r.card : r.frame) || {}).displayNameAr || '';
      result('ok', isCard ? 'تم! انضافت ' + (name ? '"' + name + '"' : 'البطاقة') + ' لمقتنياتك' : 'تم! انضاف إطار ' + (name ? '"' + name + '" ' : '') + 'لمقتنياتك', 'تقدر تختاره من ملفك', profileBtn());
    }).catch(function () { busy(false); result('err', 'تعذّر الاتصال، حاول مرة ثانية'); });
  }

  function redeemSub(code) {
    busy(true);
    A.redeemSubscriptionCode(code, null).then(function (r) {
      busy(false);
      if (r && r.success) {
        done();
        var dur = monthsText(r.months);
        result('ok', r.mode === 'extend' ? 'تمدّد اشتراكك ' + dur : 'تفعّل اشتراكك (' + dur + ')', 'تفاصيل اشتراكك بصفحة حسابك', profileBtn('#subscription'));
        if (A.refreshUser) A.refreshUser();
      } else { rc.classList.add('bad'); result('err', SUB_ERRORS[r && r.error] || 'تعذّر التفعيل، حاول مرة ثانية'); }
    }).catch(function () { busy(false); result('err', 'تعذّر الاتصال، حاول مرة ثانية'); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = rc.value;
    if (!/^(AGP|SUB)-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(v)) {
      rc.classList.add('bad'); result('err', 'الكود غير مكتمل', 'الكود يكون بالشكل AGP-XXXX-XXXX أو SUB-XXXX-XXXX'); rc.focus(); return;
    }
    if (!signedIn() || !A) {
      result('need', 'سجّل دخولك أول', 'نضيف الكود لحسابك بعد ما تسجّل دخولك', '<button class="btn btn-primary btn-sm" type="button" data-auth-inline>تسجيل الدخول</button>');
      rr.querySelector('[data-auth-inline]').addEventListener('click', function () { if (window.AGPSite) window.AGPSite.openAuth(); else location.href = 'login.html?next=redeem.html'; });
      return;
    }
    if (typeOf(v) === 'sub') redeemSub(v); else redeemAgp(v);
  });

  try {
    var q = new URLSearchParams(location.search).get('code');
    if (q) { rc.value = fmtCode(q); hitType(rc.value); }
  } catch (e) {}
})();
