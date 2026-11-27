/**
 * ألعاب أيمن — إضافات مكتبة الألعاب منقولة كما هي من games.html:
 * التحكم عن بعد بأوامر الشات، حضور المكتبة لتحديات البثين، زر الدعم العائم،
 * زر «استوديو البث»، وزر «تحديث للنسخة الأخيرة» مع تنبيه النسخة الجديدة.
 * وفوقها: صندوق دعوات التحدي جنب «العب ضد بث آخر» وبطاقة متابعة تيك توك.
 */
// التحكم عن بعد بأوامر الشات (js/agp-remote-control.js)
(function(){
(function(){
  var RC = window.AymanGamesPlatform && window.AymanGamesPlatform.remoteControl;
  if (!RC) return;
  RC.attach({ page: 'مكتبة الألعاب', overlayChat: true,
    status: function () { return 'اختر لعبة من الشبكة تحت'; },
    commands: [
      // الاسم القديم من أول نسخة (قبل !لعبه) — يبقى للي متعودين عليه
      { names: ['روليت', 'الاقصاء'], desc: 'يفتح إعدادات روليت الإقصاء', phone: false, run: function () {
        setTimeout(function () { location.href = 'games/elimination-roulette/index.html'; }, 700);
        return 'جارٍ فتح روليت الإقصاء';
      } }
    ] });
})();
})();

// حضور الستريمر بالمكتبة لتحديات البثين (js/agp-challenge-lobby.js)
(function(){
window.AGPChallengeLobby && window.AGPChallengeLobby.startPresence(function () { return 'library'; });
})();

(function(){
  // [زر الدعم] زر عائم ثابت بزاوية الشاشة يفتح نموذج تذاكر الدعم
  // (support-tickets.html — تبويب "تذكرة جديدة" هو الافتراضي) لأي شكوى
  // أو استفسار أو مشكلة. يُضاف على body مباشرة فما يتأثر بإعادة بناء
  // القالب لمحتوى الصفحة، ونعيد التحقق لين تستقر الصفحة.
  function ensureSupportFab(){
    if (!document.getElementById('agp-support-fab-style')) {
      var st = document.createElement('style');
      st.id = 'agp-support-fab-style';
      st.textContent =
        '.agp-support-fab{position:fixed;left:20px;bottom:20px;z-index:80;display:inline-flex;align-items:center;gap:9px;padding:13px 20px;border-radius:999px;background:linear-gradient(180deg,#8a4fe8,#7a3fd4);border:1px solid rgba(214,194,255,.35);color:#fff !important;font-family:"IBM Plex Sans Arabic",system-ui,sans-serif;font-size:14.5px;font-weight:700;text-decoration:none;box-shadow:0 16px 36px -12px rgba(122,63,212,.85),0 0 0 4px rgba(122,63,212,.12);transition:transform .25s,box-shadow .25s,background .25s}' +
        '.agp-support-fab:hover{transform:translateY(-3px);background:#9a6cf0;box-shadow:0 20px 44px -12px rgba(154,108,240,.9),0 0 0 5px rgba(122,63,212,.18)}' +
        '.agp-support-fab-icon{font-size:17px;line-height:1}' +
        '@media (max-width:600px){.agp-support-fab{left:14px;bottom:calc(14px + env(safe-area-inset-bottom));padding:12px 16px;font-size:13.5px}}';
      document.head.appendChild(st);
    }
    if (document.querySelector('.agp-support-fab')) return;
    var a = document.createElement('a');
    a.className = 'agp-support-fab';
    a.href = 'support-tickets.html';
    a.title = 'تواصل مع الدعم: شكوى، استفسار، أو مشكلة';
    a.setAttribute('aria-label', 'واجهتك مشكلة؟ تواصل معنا');
    var icon = document.createElement('span');
    icon.className = 'agp-support-fab-icon';
    icon.textContent = '💬';
    var text = document.createElement('span');
    text.textContent = 'واجهتك مشكلة؟ تواصل معنا';
    a.appendChild(icon);
    a.appendChild(text);
    document.body.appendChild(a);
  }
  var __fabTries = 0;
  var __fabTimer = setInterval(function(){
    __fabTries++;
    ensureSupportFab();
    if (__fabTries >= 30) clearInterval(__fabTimer);
  }, 300);
})();

(function(){
  // زر «استوديو البث» (stream-studio.html) أعلى المكتبة تحت العنوان — يفتح
  // صفحة تصميم أوفرلي البث (js/agp-stream-studio.js). الصفحة مبنية بعد
  // التحميل، فنحاول كل 300ms لين يطلع العنوان (نفس أسلوب بانر الإطارات).
  // [قريباً] مقفول للعامة (شارة «إطلاق جديد قريباً» بدون رابط)، ويفتح كرابط
  // فعلي للأدمن ولمن منحه الأدمن صلاحية «استوديو البث» (permissions.stream_studio
  // من لوحة الأدمن). نفس الفحص بـstream-studio.html نفسها.
  function canUseStudio(u){
    return Boolean(u && (u.role === 'admin' || (u.permissions && u.permissions.stream_studio)));
  }
  function studioUser(){
    try { return window.AGPAuth && window.AGPAuth.getCachedUser ? window.AGPAuth.getCachedUser() : null; } catch (e) { return null; }
  }
  var STUDIO_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="m2 16 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>';
  function buildStudioButton(open){
    var a;
    if (open) {
      a = document.createElement('a');
      a.href = 'stream-studio.html';
      a.style.cssText = 'display:inline-flex;align-items:center;gap:10px;margin-top:22px;padding:13px 26px;border-radius:999px;' +
        'background:linear-gradient(135deg,rgba(122,63,212,.55),rgba(178,140,245,.35));border:1px solid rgba(178,140,245,.7);color:#fff;font-weight:700;font-size:15px;text-decoration:none;box-shadow:0 6px 22px rgba(122,63,212,.35)';
      a.innerHTML = STUDIO_ICON;
      a.appendChild(document.createTextNode('استوديو البث'));
    } else {
      a = document.createElement('span');
      a.setAttribute('aria-disabled', 'true');
      a.title = 'إطلاق جديد قريباً';
      a.style.cssText = 'display:inline-flex;align-items:center;gap:10px;margin-top:22px;padding:13px 26px;border-radius:999px;' +
        'background:rgba(122,63,212,.12);border:1px dashed rgba(178,140,245,.45);color:#b9a8dd;font-weight:700;font-size:15px;cursor:not-allowed';
      a.innerHTML = STUDIO_ICON;
      a.appendChild(document.createTextNode('استوديو البث — إطلاق جديد قريباً'));
    }
    a.setAttribute('data-studio-btn', open ? 'open' : 'locked');
    return a;
  }
  function mountStudioButton(){
    var open = canUseStudio(studioUser());
    var cur = document.querySelector('[data-studio-btn]');
    if (cur) {
      // الصلاحية تغيّرت (وصل /api/auth/me) — نبدّل الزر بمكانه
      if (cur.getAttribute('data-studio-btn') !== (open ? 'open' : 'locked')) cur.parentNode.replaceChild(buildStudioButton(open), cur);
      return true;
    }
    var heading = Array.prototype.slice.call(document.querySelectorAll('h1')).find(function(h){
      return h.textContent.trim() === 'مكتبة الألعاب';
    });
    var host = heading && heading.parentNode;
    if (!host) return false;
    host.appendChild(buildStudioButton(open));
    return true;
  }
  var __studioTries = 0;
  var __studioTimer = setInterval(function(){
    __studioTries++;
    if (mountStudioButton() || __studioTries >= 30) clearInterval(__studioTimer);
  }, 300);
  // الكاش ممكن يكون قديم (الأدمن منح الصلاحية بعد آخر دخول) — نحدّث من السيرفر
  if (window.AGPAuth && window.AGPAuth.refreshUser) {
    window.AGPAuth.refreshUser().then(function(){ mountStudioButton(); });
  }
})();

(function(){
  // [تحديث للنسخة الأخيرة] كثير من المستخدمين (خصوصاً بالآيباد) يتركون
  // المكتبة مفتوحة أيام، فيظلون على نسخة قديمة فيها مشاكل انحلّت.
  // ١) زر عائم ثابت فوق زر الدعم: بضغطة وحدة يمسح Cache Storage، ويعيد جلب
  //    سكربتات الصفحة من السيرفر، ثم يعيد تحميل الصفحة برابط جديد
  //    (?v=...) فيتجاوز نسخة المتصفح المحفوظة. ما يلمس localStorage
  //    (تسجيل الدخول والاتصال المحفوظ بالبث يبقون).
  // ٢) تنبيه تلقائي: كل ٥ دقائق (ولما يرجع للتبويب) نجيب games.html من
  //    السيرفر بدون كاش ونقارن بصمته بأول نسخة جبناها وقت فتح الصفحة؛ لو
  //    تغيّرت يطلع شريط "فيه تحديث جديد" بأعلى الشاشة.
  // الاثنين مضافين على body مباشرة (مثل زر الدعم) والضغط عبر مستمع واحد
  // على document، فما يتأثرون بإعادة بناء القالب لمحتوى الصفحة.
  (function(){
    var CHECK_EVERY_MS = 5 * 60 * 1000;
    var baseline = null;
    var updateShown = false;
    var refreshing = false;

    // يشيل ?v= من الرابط بعد التحديث عشان يظل الرابط نظيف.
    try {
      var cur = new URL(location.href);
      if (cur.searchParams.has('v')) {
        cur.searchParams.delete('v');
        history.replaceState(history.state, '', cur.pathname + cur.search + cur.hash);
      }
    } catch (e) {}

    function ensureRefreshStyles(){
      if (document.getElementById('agp-refresh-style')) return;
      var st = document.createElement('style');
      st.id = 'agp-refresh-style';
      st.textContent =
        '.agp-refresh-fab{position:fixed;left:20px;bottom:84px;z-index:80;display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:999px;background:rgba(18,15,28,.92);border:1px solid rgba(178,140,245,.4);color:#e2d6ff;font-family:"IBM Plex Sans Arabic",system-ui,sans-serif;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 14px 30px -14px rgba(0,0,0,.9);-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
        '.agp-refresh-fab:hover{background:rgba(122,63,212,.3);color:#fff}' +
        '.agp-refresh-fab[disabled]{opacity:.7;cursor:progress}' +
        '.agp-refresh-fab-icon{font-size:16px;line-height:1;display:inline-block}' +
        '.agp-refresh-fab[disabled] .agp-refresh-fab-icon{animation:agpRefreshSpin .8s linear infinite}' +
        '.agp-update-bar{position:fixed;top:calc(12px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:120;direction:rtl;display:flex;align-items:center;justify-content:space-between;gap:14px;width:min(560px,calc(100% - 32px));box-sizing:border-box;padding:12px 14px 12px 12px;border-radius:18px;background:linear-gradient(135deg,#2a1d4a,#15111f);border:1px solid rgba(178,140,245,.5);box-shadow:0 24px 50px -20px rgba(0,0,0,.95),0 0 0 4px rgba(122,63,212,.15);font-family:"IBM Plex Sans Arabic",system-ui,sans-serif;animation:agpUpdateIn .35s cubic-bezier(.22,1,.36,1)}' +
        '.agp-update-bar-text{text-align:right;font-size:14px;line-height:1.6;color:#f4f2fb;font-weight:600}' +
        '.agp-update-bar-sub{display:block;font-size:12.5px;font-weight:400;color:#a79fbb}' +
        '.agp-update-bar-actions{display:flex;align-items:center;gap:6px;flex:none}' +
        '.agp-update-bar-btn{padding:9px 16px;border-radius:999px;border:none;background:linear-gradient(135deg,#7a3fd4,#b28cf5);color:#fff;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;touch-action:manipulation}' +
        '.agp-update-bar-close{width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:transparent;color:#a79fbb;font-size:16px;line-height:1;cursor:pointer;touch-action:manipulation}' +
        '@keyframes agpRefreshSpin{to{transform:rotate(360deg)}}' +
        '@keyframes agpUpdateIn{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}' +
        '@media (max-width:600px){.agp-refresh-fab{left:14px;bottom:calc(74px + env(safe-area-inset-bottom));padding:10px 14px;font-size:13px}}';
      document.head.appendChild(st);
    }

    function ensureRefreshFab(){
      ensureRefreshStyles();
      if (document.querySelector('.agp-refresh-fab')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'agp-refresh-fab';
      btn.setAttribute('data-agp-refresh', '1');
      btn.title = 'تحديث الصفحة لآخر نسخة';
      btn.setAttribute('aria-label', 'تحديث الصفحة لآخر نسخة');
      var icon = document.createElement('span');
      icon.className = 'agp-refresh-fab-icon';
      icon.textContent = '⟳';
      var text = document.createElement('span');
      text.textContent = 'تحديث للنسخة الأخيرة';
      btn.appendChild(icon);
      btn.appendChild(text);
      document.body.appendChild(btn);
    }

    function showUpdateBar(){
      if (updateShown || document.querySelector('.agp-update-bar')) return;
      updateShown = true;
      ensureRefreshStyles();
      var bar = document.createElement('div');
      bar.className = 'agp-update-bar';
      bar.setAttribute('role', 'status');
      var text = document.createElement('div');
      text.className = 'agp-update-bar-text';
      text.textContent = 'فيه تحديث جديد للموقع';
      var sub = document.createElement('span');
      sub.className = 'agp-update-bar-sub';
      sub.textContent = 'اضغط تحديث عشان تشتغل على آخر نسخة';
      text.appendChild(sub);
      var actions = document.createElement('div');
      actions.className = 'agp-update-bar-actions';
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'agp-update-bar-btn';
      go.setAttribute('data-agp-refresh', '1');
      go.textContent = 'تحديث الآن';
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'agp-update-bar-close';
      close.setAttribute('data-agp-update-close', '1');
      close.setAttribute('aria-label', 'إغلاق');
      close.textContent = '✕';
      actions.appendChild(go);
      actions.appendChild(close);
      bar.appendChild(text);
      bar.appendChild(actions);
      document.body.appendChild(bar);
    }

    function hardRefresh(){
      if (refreshing) return;
      refreshing = true;
      Array.prototype.forEach.call(document.querySelectorAll('[data-agp-refresh]'), function(b){ b.disabled = true; });
      var jobs = [];
      try {
        if (window.caches && caches.keys) {
          jobs.push(caches.keys().then(function(keys){
            return Promise.all(keys.map(function(k){ return caches.delete(k); }));
          }));
        }
      } catch (e) {}
      // نعيد جلب سكربتات وملفات CSS الصفحة من نفس الموقع بـ cache:'reload'
      // عشان كاش المتصفح يتحدّث لها هي بعد، مو بس للصفحة نفسها.
      try {
        var urls = [];
        Array.prototype.forEach.call(document.querySelectorAll('script[src],link[rel="stylesheet"][href]'), function(el){
          var u = el.src || el.href;
          if (u && u.indexOf(location.origin) === 0 && urls.indexOf(u) === -1) urls.push(u);
        });
        urls.forEach(function(u){ jobs.push(fetch(u, { cache: 'reload' }).catch(function(){})); });
        jobs.push(fetch(location.pathname, { cache: 'reload' }).catch(function(){}));
      } catch (e) {}
      var go = function(){
        try {
          var next = new URL(location.href);
          next.searchParams.set('v', String(Date.now()));
          location.replace(next.toString());
        } catch (e) { location.reload(); }
      };
      // ما ننتظر للأبد لو شبكة الجهاز بطيئة.
      Promise.race([
        Promise.all(jobs.map(function(j){ return Promise.resolve(j).catch(function(){}); })),
        new Promise(function(r){ setTimeout(r, 4000); })
      ]).then(go, go);
    }

    function fingerprint(text){
      var h = 5381;
      for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
      return text.length + ':' + h;
    }

    function fetchFingerprint(){
      var sep = location.pathname.indexOf('?') === -1 ? '?' : '&';
      return fetch(location.pathname + sep + '__check=' + Date.now(), { cache: 'no-store' })
        .then(function(r){ return r.ok ? r.text() : null; })
        .then(function(t){ return t ? fingerprint(t) : null; })
        .catch(function(){ return null; });
    }

    function checkForUpdate(){
      if (updateShown || refreshing || document.hidden) return;
      fetchFingerprint().then(function(fp){
        if (!fp) return;
        if (!baseline) { baseline = fp; return; }
        if (fp !== baseline) showUpdateBar();
      });
    }

    document.addEventListener('click', function(ev){
      var t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      if (t.closest('[data-agp-refresh]')) { ev.preventDefault(); hardRefresh(); return; }
      if (t.closest('[data-agp-update-close]')) {
        var bar = document.querySelector('.agp-update-bar');
        if (bar) bar.remove();
        // يرجع يطلع بالفحص الجاي لو ما حدّث.
        updateShown = false;
      }
    });
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) checkForUpdate(); });
    window.addEventListener('pageshow', function(e){ if (e.persisted) checkForUpdate(); });
    setInterval(checkForUpdate, CHECK_EVERY_MS);
    setTimeout(checkForUpdate, 3000);

    var __refreshTries = 0;
    var __refreshTimer = setInterval(function(){
      __refreshTries++;
      ensureRefreshFab();
      if (__refreshTries >= 30) clearInterval(__refreshTimer);
    }, 300);
  })();
})();

(function(){
  // صندوق دعوات التحدي (js/agp-challenge-inbox.js) جنب «العب ضد بث آخر»
  var row = document.getElementById('lib-acts');
  if (row && window.AGPChallengeInbox) window.AGPChallengeInbox.mount(row, { root: '', before: row.firstChild });
  // بطاقة متابعة حساب المنصة على تيك توك فوق الذيل
  var grid = document.getElementById('lib-empty');
  if (grid && window.AGPTikTokFollow) window.AGPTikTokFollow.insertAfter(grid);
})();
