/**
 * ألعاب أيمن — الاتصال بالبث بمكتبة الألعاب (التصميم الجديد).
 *
 * منقول كما هو من games.html (القسم «اتصال حقيقي بالبث» وما بعده): اختيار
 * المنصة، التحقق عبر WebSocket من إن الحساب يبث، حفظ الاتصال
 * ('agp:agp-stream-connection') اللي تقرأه الألعاب، الاتصال التلقائي بالحساب
 * المربوط، غرفة الجوالات، وشارة «التكبيس لتيك توك فقط». الفرق الوحيد: رسم
 * البطاقة (renderConnectUI وrenderPlatformPicker) بشكل التصميم الجديد.
 *
 * يحتاج بالصفحة: [data-connect-card] وفيه [data-platform-picker]
 * و[data-connect-note] و[data-connect-controls].
 */
(function(){
  // [اتصال حقيقي بالبث] استبدلنا بطاقة "اتصل بالبث" التفاعلية المزيَّفة
  // (كانت تقبل أي نص غير فارغ وتضبط conn:true فوراً بلا أي تحقق) بنسخة
  // ساكنة (راجع القالب) يديرها هذا الكود مباشرة عبر نفس بروتوكول
  // WebSocket الحقيقي المستخدَم فعلياً بلوحة التحكم
  // (adapters/agp-tiktok-adapter.js + backend/platforms/tiktok/tiktok-connector.js
  // + backend/websocket/ws-server.js) — الخادم الخلفي هو من يتحقق فعلياً
  // عبر مكتبة tiktok-live-connector أن الحساب يبث الآن قبل أي رد
  // 'connected'؛ أي يوزر عشوائي أو غير مباشر يرجع 'error' فوراً بلا أي
  // إعادة محاولة تلقائية (نفس سلوك الموصِّل الحقيقي). هذه الصفحة لا
  // تحمّل سلسلة سكربتات AGP.* أصلاً، فبدل استيرادها كاملة لميزة مستقلة
  // لا تحتاج جلسة/لوبي، نكلّم نفس نقطة الخادم مباشرة ببروتوكول مطابق
  // تماماً لما توثّقه تلك الملفات.
  var BACKEND_WS_URL = 'wss://project-testing-akds.onrender.com';
  var connectSocket = null;
  var connectState = 'idle'; // idle | connecting | connected | error
  var connectUsername = '';
  var connectErrorMsg = '';

  // [منصة البث] الستريمر يختار منصته (تيك توك / كيك / تويتش) مرة
  // وحدة، والاختيار ينحفظ بالجهاز ('agp:agp-stream-platform'). الاتصال
  // المحفوظ يحمل المنصة ({platform, username})، والألعاب تقرأها منه
  // تلقائياً (adapters/agp-tiktok-adapter.js → AGP.streamPlatform).
  var STREAM_PLATFORM_STORAGE_KEY = 'agp:agp-stream-platform';
  var STREAM_PLATFORMS = {
    tiktok: { label: 'تيك توك', color: '#fe2c55', placeholder: 'يوزر التيك توك (بدون @)', handle: function(u){ return '@' + u; } },
    kick:   { label: 'كيك', color: '#53fc18', placeholder: 'اسم قناة كيك', handle: function(u){ return 'kick.com/' + u; } },
    twitch: { label: 'تويتش', color: '#9146ff', placeholder: 'اسم قناة تويتش', handle: function(u){ return 'twitch.tv/' + u; } }
  };
  function readStreamPlatform(){
    try {
      var p = JSON.parse(localStorage.getItem(STREAM_PLATFORM_STORAGE_KEY) || 'null');
      return (p && STREAM_PLATFORMS[p] && !STREAM_PLATFORMS[p].soon) ? p : 'tiktok';
    } catch (e) { return 'tiktok'; }
  }
  var streamPlatform = readStreamPlatform();
  function platformInfo(){ return STREAM_PLATFORMS[streamPlatform] || STREAM_PLATFORMS.tiktok; }
  function setStreamPlatform(p){
    if (!STREAM_PLATFORMS[p] || STREAM_PLATFORMS[p].soon || p === streamPlatform) return;
    // تغيير المنصة يقطع أي اتصال قائم بالمنصة الثانية (الألعاب ما تتصل بمنصة غير المختارة).
    if (connectState === 'connected' || connectState === 'connecting') {
      closeConnectSocketSilently();
      clearVerifiedStreamConnection();
    }
    streamPlatform = p;
    try { localStorage.setItem(STREAM_PLATFORM_STORAGE_KEY, JSON.stringify(p)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('agp:stream-platform-changed', { detail: { platform: p } })); } catch (e) {}
    connectState = 'idle';
    connectUsername = '';
    connectErrorMsg = '';
    autoFailedAttempts = 0;
    applyAccountForPlatform();
    renderConnectUI();
    refreshPlatformBadges();
    tryAutoConnect();
  }

  // [ألعاب التكبيس] كيك (وتويتش) ما فيها لايكات — الألعاب اللي التكبيس
  // جزء أساسي منها تطلع عليها شارة لما المنصة المختارة غير تيك توك. اللعبة
  // تبقى تشتغل بالشات، بس التكبيس ما يوصل.
  var LIKES_GAMES = { 'tug-of-war': 1, 'formula-race': 1, 'arena': 1 };
  function refreshPlatformBadges(){
    if (!document.getElementById('agp-pp-badge-styles')) {
      var st = document.createElement('style');
      st.id = 'agp-pp-badge-styles';
      st.textContent = '.gl-pp-only{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;color:#ffd0da;background:rgba(254,44,85,.14);border:1px solid rgba(254,44,85,.4)}';
      document.head.appendChild(st);
    }
    Array.prototype.forEach.call(document.querySelectorAll('.gl-card'), function(card){
      var a = card.querySelector('.gl-play');
      var m = a && /games\/([a-z0-9-]+)\//.exec(a.getAttribute('href') || '');
      var meta = card.querySelector('.gl-meta');
      var old = card.querySelector('.gl-pp-only');
      var show = Boolean(m && LIKES_GAMES[m[1]] && streamPlatform !== 'tiktok' && meta);
      if (!show) { if (old) old.remove(); return; }
      if (old) return;
      var tag = document.createElement('span');
      tag.className = 'gl-pp-only';
      tag.title = 'التكبيس (اللايكات) موجود في تيك توك بس — اللعبة تشتغل بالشات على ' + platformInfo().label;
      tag.textContent = 'التكبيس لتيك توك فقط';
      meta.appendChild(tag);
    });
  }
  var __ppBadgeTries = 0;
  var __ppBadgeTimer = setInterval(function(){
    __ppBadgeTries++;
    refreshPlatformBadges();
    if (__ppBadgeTries >= 40) clearInterval(__ppBadgeTimer);
  }, 500);

  // Lets a game page (currently only elimination-roulette — see its own
  // getSavedStreamConnection()) reuse this verified username instead of
  // asking the streamer to retype it. This page deliberately loads none of
  // the AGP.* scripts (see the comment above), so it writes localStorage
  // directly instead of going through js/agp-storage-manager.js — but uses
  // that same module's 'agp:' key prefix and JSON.stringify format, so
  // either side can read what the other wrote without depending on it.
  var STREAM_CONNECTION_STORAGE_KEY = 'agp:agp-stream-connection';
  function saveVerifiedStreamConnection(username) {
    try {
      localStorage.setItem(STREAM_CONNECTION_STORAGE_KEY, JSON.stringify({
        platform: streamPlatform, username: username, connectedAt: Date.now()
      }));
      // Also feeds js/agp-game-shell.js's own pre-existing per-device
      // username memory (AGP.storageManager key 'agp-last-username'),
      // used to prefill this same field on every other game.
      if (streamPlatform === 'tiktok') localStorage.setItem('agp:agp-last-username', JSON.stringify(username));
    } catch (e) {}
  }
  function clearVerifiedStreamConnection() {
    try { localStorage.removeItem(STREAM_CONNECTION_STORAGE_KEY); } catch (e) {}
  }

  function ensureConnectStyles(){
    if (document.getElementById('agp-connect-styles')) return;
    var style = document.createElement('style');
    style.id = 'agp-connect-styles';
    style.textContent = '@keyframes agpConnectPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}';
    document.head.appendChild(style);
  }

  function closeConnectSocketSilently(){
    if (connectSocket) {
      var s = connectSocket;
      connectSocket = null;
      s.onopen = null; s.onmessage = null; s.onerror = null; s.onclose = null;
      try { s.close(); } catch (e) {}
    }
  }

  // [غرفة الجوالات] اللعب بدون بث (phone-room.html): الاتصال المحفوظ يكون
  // {platform:'phone', username:<رقم الغرفة>}، والألعاب تستقبل من جوالات اللاعبين بدل البث.
  function isPhoneRoomSaved(){
    try { var d = JSON.parse(localStorage.getItem(STREAM_CONNECTION_STORAGE_KEY) || 'null'); return Boolean(d && d.platform === 'phone'); } catch (e) { return false; }
  }
  function canHostPhoneRoom(){
    return Boolean(meUser && (meUser.role === 'admin' || (meUser.permissions && meUser.permissions.phone_rooms)));
  }
  // [التصميم الجديد] رسم بطاقة الاتصال بشكل التصميم الجديد (css/agp-site.css، أصناف cn-*).
  // كل المنطق تحت (الاتصال، الاتصال التلقائي، غرفة الجوالات، الحفظ) نفسه بالضبط؛ تغيّر الرسم بس.
  // نفس عناوين الأزرار القديمة data-connect-action وdata-platform-pick فالمستمعات ما تغيرت.
  var PLATFORM_LOGOS = {
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#25f4ee" transform="translate(-1 -1)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/><path fill="#fe2c55" transform="translate(1 1)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/><path fill="#fff" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
    kick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#53fc18" d="M2 2h7v5h2.5V4.5H14V2h7v7h-2.5v2.5H16v1h2.5V15H21v7h-7v-2.5h-2.5V17H9v5H2z"/></svg>',
    twitch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#a970ff" d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>'
  };
  function renderPlatformPicker(card){
    var picker = card.querySelector('[data-platform-picker]');
    if (!picker) return;
    if (!picker.children.length) {
      picker.innerHTML = Object.keys(STREAM_PLATFORMS).map(function(key){
        var info = STREAM_PLATFORMS[key];
        return '<button class="pf" type="button" role="radio" data-platform-pick="' + key + '" style="--c:' + info.color + '">' +
          PLATFORM_LOGOS[key] + info.label + '</button>';
      }).join('');
    }
    Array.prototype.forEach.call(picker.querySelectorAll('[data-platform-pick]'), function(b){
      var on = b.getAttribute('data-platform-pick') === streamPlatform;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }
  document.addEventListener('click', function(ev){
    var b = ev.target && ev.target.closest ? ev.target.closest('[data-platform-pick]') : null;
    if (!b || b.disabled) return;
    var key = b.getAttribute('data-platform-pick');
    if (key === streamPlatform) return;
    if ((connectState === 'connected' || connectState === 'connecting') &&
        !window.confirm('أنت متصل الحين ببث ' + platformInfo().label + '. تغيير المنصة يقطع هذا الاتصال، تكمل؟')) return;
    setStreamPlatform(key);
  });
  document.addEventListener('keydown', function(ev){
    var b = ev.target && ev.target.closest ? ev.target.closest('[data-platform-pick]') : null;
    if (!b) return;
    var keys = Object.keys(STREAM_PLATFORMS), i = keys.indexOf(b.getAttribute('data-platform-pick'));
    var d = ev.key === 'ArrowLeft' ? 1 : ev.key === 'ArrowRight' ? -1 : 0;
    if (!d) return;
    ev.preventDefault();
    var next = document.querySelector('[data-platform-pick="' + keys[(i + d + keys.length) % keys.length] + '"]');
    if (next) { next.focus(); next.click(); }
  });
  function cnButton(text, action, kind){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cn-b' + (kind ? ' ' + kind : '');
    b.textContent = text;
    if (action) b.setAttribute('data-connect-action', action);
    return b;
  }
  function cnLink(text, href, kind){
    var a = document.createElement('a');
    a.className = 'cn-b' + (kind ? ' ' + kind : '');
    a.href = href;
    a.textContent = text;
    return a;
  }
  function appendPhoneRoomLink(controls){
    var phone = connectState === 'connected' && isPhoneRoomSaved();
    if (!phone && !canHostPhoneRoom()) return;
    controls.appendChild(cnLink(phone ? 'الباركود وإدارة الغرفة' : 'العب بدون بث (غرفة الجوالات)', 'phone-room.html'));
  }
  // [قريباً] إحصائيات البث موقوفة مؤقتاً (توفير اتصالات EulerStream).
  function appendStatsButton(controls){
    appendPhoneRoomLink(controls);
    if (connectState === 'connected' && isPhoneRoomSaved()) return;
    if (accountMode !== 'linked' && accountMode !== 'free') return;
    var b = cnButton('إحصائيات البث قريبا', null, 'soon');
    b.disabled = true;
    controls.appendChild(b);
  }
  function renderConnectUI(){
    var card = document.querySelector('[data-connect-card]');
    if (!card) return;
    var note = card.querySelector('[data-connect-note]');
    var controls = card.querySelector('[data-connect-controls]');
    if (!note || !controls) return;
    card.setAttribute('data-s', connectState);
    card.style.setProperty('--pc', platformInfo().color);
    renderPlatformPicker(card);

    var pl = platformInfo();
    var noteText = {
      idle: accountMode === 'loading' ? 'جاري التحقق من حسابك'
        : accountMode === 'guest' ? 'سجّل دخول بحساب ستريمر مربوط ب' + pl.label + ' عشان تتصل بالبث'
        : accountMode === 'player' ? 'تشغيل الألعاب لحسابات الستريمر فقط تواصل مع الإدارة لتحويل حسابك'
        : accountMode === 'unlinked' ? 'اربط حساب ' + pl.label + ' بحسابك في الموقع وبعدها نتصل ببثك تلقائيا'
        : linkedUsername
        ? (isAutoConnectOff()
          ? 'حسابك المربوط ⁦' + pl.handle(linkedUsername) + '⁩ اضغط اتصال لما تبي تربط الألعاب ببثك'
          : 'حسابك المربوط ⁦' + pl.handle(linkedUsername) + '⁩ نتصل تلقائيا أول ما تبدأ البث في ' + pl.label)
        : (streamPlatform !== 'tiktok' ? 'اكتب اسم قناة ' + pl.label + ' عشان نتحقق منها ونربط الألعاب فيها' : 'اكتب يوزر البث عشان نتحقق منه ونربط الألعاب فيه'),
      connecting: 'نتأكد إن الحساب يبث الآن',
      connected: isPhoneRoomSaved()
        ? 'غرفة الجوالات مفتوحة والألعاب تستقبل من جوالات اللاعبين بدون بث'
        : 'متصل الآن ببث ' + pl.label + ' ⁦' + pl.handle(connectUsername) + '⁩',
      error: connectErrorMsg || 'تعذر التحقق من البث'
    };
    note.textContent = noteText[connectState] || noteText.idle;
    note.className = 'cn-msg' + (connectState === 'error' ? ' err' : connectState === 'connected' ? ' ok' : '');

    controls.innerHTML = '';
    if (connectState === 'connected') {
      var badge = document.createElement('span');
      badge.className = 'cn-st';
      badge.innerHTML = '<i aria-hidden="true"></i>';
      var b = document.createElement('b');
      b.textContent = isPhoneRoomSaved() ? 'غرفة ' + connectUsername : platformInfo().handle(connectUsername);
      badge.appendChild(b);
      controls.appendChild(badge);
      controls.appendChild(cnButton('قطع الاتصال', 'disconnect', 'out'));
      appendStatsButton(controls);
      return;
    }
    if (connectState === 'connecting') {
      var wait = cnButton('جاري الاتصال', null);
      wait.disabled = true;
      controls.appendChild(wait);
      controls.appendChild(cnButton('إلغاء', 'cancel'));
      return;
    }
    // خانة اليوزر للأدمن وأصحاب صلاحية «تشغيل كامل» بس. الستريمر العادي يتصل فقط ببث حسابه المربوط.
    if (accountMode !== 'free') {
      if (accountMode === 'linked') controls.appendChild(cnButton('تحقق الآن', 'check', 'pri'));
      else if (accountMode === 'guest') {
        var login = cnButton('تسجيل الدخول', null, 'pri');
        login.addEventListener('click', function(){ if (window.AGPSite) window.AGPSite.openAuth(); else location.href = 'login.html'; });
        controls.appendChild(login);
      } else if (accountMode === 'unlinked') controls.appendChild(cnLink('ربط حساب ' + platformInfo().label, 'profile.html', 'pri'));
      appendStatsButton(controls);
      return;
    }
    var wrap = document.createElement('label');
    wrap.className = 'cn-in';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = platformInfo().placeholder;
    input.setAttribute('dir', 'ltr');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', 'يوزر البث');
    input.setAttribute('data-connect-input', '1');
    if (linkedUsername) input.value = linkedUsername;
    wrap.appendChild(input);
    controls.appendChild(wrap);
    controls.appendChild(cnButton('اتصال', 'submit', 'pri'));
    appendStatsButton(controls);
  }

  // [إصلاح زر "اتصال" الميت — خصوصاً بالآيباد] محرك القالب يعيد بناء محتوى
  // الصفحة بعد التحميل وينسخ الخانة والأزرار اللي ركّبناها كنسخ بدون
  // مستمعات الضغط (تطلع عليها data-dc-tpl)، والنسخة الجديدة من الحاوية
  // تحمل data-wired فما نعيد الربط — فيظهر الزر طبيعي وهو ميت. بالأجهزة
  // الأبطأ (آيباد/Safari) هذا يصير تقريباً كل مرة. نفس حل زر القائمة:
  // مستمع واحد على document يلتقط أي نسخة عبر data-connect-* ويقرأ قيمة
  // الخانة وقت الضغط بدل الاعتماد على مراجع قديمة.
  function getConnectInputValue(){
    var input = document.querySelector('[data-connect-controls] [data-connect-input]');
    return input ? input.value : '';
  }
  document.addEventListener('click', function(ev){
    var btn = ev.target && ev.target.closest ? ev.target.closest('[data-connect-controls] [data-connect-action]') : null;
    if (!btn || btn.disabled) return;
    var action = btn.getAttribute('data-connect-action');
    if (action === 'submit') {
      handleConnectSubmit(getConnectInputValue());
    } else if (action === 'check') {
      if (linkedUsername) { setAutoConnectOff(false); connectToBackend(linkedUsername); }
    } else if (action === 'disconnect') {
      disconnectFromBackend();
    } else if (action === 'stats') {
      if (window.AGPStreamStats) window.AGPStreamStats.open();
    } else if (action === 'cancel') {
      closeConnectSocketSilently();
      connectState = 'idle';
      renderConnectUI();
    }
  });
  document.addEventListener('keydown', function(ev){
    if (ev.key !== 'Enter' || ev.isComposing) return;
    var input = ev.target && ev.target.closest ? ev.target.closest('[data-connect-controls] [data-connect-input]') : null;
    if (!input) return;
    ev.preventDefault();
    handleConnectSubmit(input.value);
  });

  function handleConnectSubmit(rawValue){
    setAutoConnectOff(false);
    var username = (rawValue || '').trim().replace(/^@+/, '');
    if (streamPlatform === 'kick') username = username.replace(/^(https?:\/\/)?(www\.)?kick\.com\//i, '').split(/[\/?#]/)[0].toLowerCase();
    if (streamPlatform === 'twitch') username = username.replace(/^(https?:\/\/)?(www\.|m\.)?twitch\.tv\//i, '').split(/[\/?#]/)[0].toLowerCase();
    if (!username) {
      connectState = 'error';
      connectErrorMsg = 'اكتب يوزر البث أولاً';
      renderConnectUI();
      return;
    }
    var usernameRe = streamPlatform === 'kick' ? /^[a-zA-Z0-9_-]{2,25}$/ : streamPlatform === 'twitch' ? /^[a-zA-Z0-9_]{3,25}$/ : /^[a-zA-Z0-9._]{2,24}$/;
    if (!usernameRe.test(username)) {
      connectState = 'error';
      connectErrorMsg = 'صيغة اليوزر غير صحيحة';
      renderConnectUI();
      return;
    }
    connectToBackend(username);
  }

  function connectToBackend(username){
    connectUsername = username;
    connectErrorMsg = '';
    connectState = 'connecting';
    renderConnectUI();

    closeConnectSocketSilently();
    try {
      connectSocket = new WebSocket(BACKEND_WS_URL);
    } catch (e) {
      connectState = 'error';
      connectErrorMsg = 'تعذر فتح الاتصال بالخادم';
      renderConnectUI();
      return;
    }

    connectSocket.onopen = function(){
      if (connectState !== 'connecting' || !connectSocket) return;
      connectSocket.send(JSON.stringify({
        type: 'connect',
        // authToken: الخادم يسمح بالاتصال فقط ببث حساب تيك توك الموثَّق على
        // حساب الموقع المسجَّل (ws-server.js checkStreamConnectAllowed).
        // source: 'library' — تحقق فقط، لا يُحتسب كساعات بث (ws-server.js).
        payload: { platform: streamPlatform, username: username, followersOnly: false, source: 'library', authToken: (window.AGPAuth && window.AGPAuth.getToken) ? window.AGPAuth.getToken() : null },
        timestamp: Date.now()
      }));
    };

    connectSocket.onmessage = function(event){
      var envelope;
      try { envelope = JSON.parse(event.data); } catch (e) { return; }
      if (!envelope || !envelope.type || !envelope.payload) return;

      if (envelope.type === 'status') {
        var status = envelope.payload.status;
        if (status === 'connecting') {
          connectState = 'connecting';
          renderConnectUI();
        } else if (status === 'connected') {
          connectState = 'connected';
          autoFailedAttempts = 0;
          saveVerifiedStreamConnection(connectUsername);
          if (window.AGPLiveWatch) window.AGPLiveWatch.reset();
          renderConnectUI();
          // التحقق خلص — نقفل الاتصال فوراً عشان ما يظل موصِّل تيك توك شغّال
          // بالخادم وهو يتصفح المكتبة بس (الحالة محفوظة بالمتصفح والألعاب
          // تفتح اتصالها الخاص).
          closeConnectSocketSilently();
        } else if (status === 'error') {
          connectState = 'error';
          connectErrorMsg = envelope.payload.message || 'الحساب غير موجود أو غير مباشر الآن — تأكد إنه يبث فعلاً';
          clearVerifiedStreamConnection();
          closeConnectSocketSilently();
          renderConnectUI();
        } else if (status === 'disconnected') {
          connectState = 'idle';
          connectUsername = '';
          clearVerifiedStreamConnection();
          closeConnectSocketSilently();
          renderConnectUI();
        }
      } else if (envelope.type === 'error') {
        connectState = 'error';
        connectErrorMsg = envelope.payload.message || 'حدث خطأ أثناء الاتصال بالخادم';
        clearVerifiedStreamConnection();
        closeConnectSocketSilently();
        renderConnectUI();
      }
    };

    connectSocket.onerror = function(){
      if (connectState === 'connecting' || connectState === 'connected') {
        connectState = 'error';
        connectErrorMsg = 'تعذر الوصول لخادم البث، حاول مرة ثانية';
        clearVerifiedStreamConnection();
        renderConnectUI();
      }
    };

    connectSocket.onclose = function(){
      connectSocket = null;
      if (connectState === 'connecting' || connectState === 'connected') {
        connectState = 'error';
        connectErrorMsg = 'انقطع الاتصال بالخادم';
        clearVerifiedStreamConnection();
        renderConnectUI();
      }
    };
  }

  function disconnectFromBackend(){
    // قطع يدوي: ما نرجع نتصل تلقائياً بنفس الجلسة لين يضغط "اتصال" بنفسه.
    setAutoConnectOff(true);
    if (connectSocket && connectSocket.readyState === 1) {
      try {
        connectSocket.send(JSON.stringify({ type: 'disconnect', payload: { platform: streamPlatform }, timestamp: Date.now() }));
      } catch (e) {}
    }
    closeConnectSocketSilently();
    connectState = 'idle';
    connectUsername = '';
    connectErrorMsg = '';
    clearVerifiedStreamConnection();
    renderConnectUI();
  }

  // الاتصال المحفوظ يبقى مهما حدّث الصفحة أو رجع للرئيسية — ينمسح فقط
  // لما يضغط "قطع الاتصال" أو يفشل تحقق جديد.
  function readVerifiedStreamConnection() {
    try {
      var data = JSON.parse(localStorage.getItem(STREAM_CONNECTION_STORAGE_KEY) || 'null');
      return (data && typeof data.username === 'string' && data.username) ? data : null;
    } catch (e) { return null; }
  }

  function initConnectWidget(){
    var card = document.querySelector('[data-connect-card]');
    if (!card) return;
    var controls = card.querySelector('[data-connect-controls]');
    if (!controls || controls.dataset.wired === '1') return;
    controls.dataset.wired = '1';
    ensureConnectStyles();
    var saved = readVerifiedStreamConnection();
    // الاتصال المحفوظ يحدد المنصة المعروضة (اتصال قديم قبل الميزة = تيك توك).
    if (saved) {
      var savedPlatform = STREAM_PLATFORMS[saved.platform] && !STREAM_PLATFORMS[saved.platform].soon ? saved.platform : 'tiktok';
      if (savedPlatform !== streamPlatform) {
        streamPlatform = savedPlatform;
        try { localStorage.setItem(STREAM_PLATFORM_STORAGE_KEY, JSON.stringify(savedPlatform)); } catch (e) {}
      }
    }
    if (saved && connectState === 'idle') {
      connectState = 'connected';
      connectUsername = saved.username;
    }
    renderConnectUI();
    // الاتصال المحفوظ ما يبقى للأبد: يُفحص دورياً إن البث لسا شغّال في تيك توك
    // (js/agp-live-watch.js)، ولو انتهى أو صار غير نشط يُقطع ويُمسح.
    if (window.AGPLiveWatch) {
      window.AGPLiveWatch.start({ overlay: false, onEnded: function(){
        closeConnectSocketSilently();
        connectState = 'error';
        connectUsername = '';
        connectErrorMsg = linkedUsername
          ? 'البث في ' + platformInfo().label + ' انتهى أو صار غير نشط — تم قطع الاتصال. نرجع نتصل تلقائياً أول ما تبدأ البث.'
          : 'البث في ' + platformInfo().label + ' انتهى أو صار غير نشط — تم قطع الاتصال. ابدأ البث ثم اتصل من جديد.';
        autoFailedAttempts = 0;
        renderConnectUI();
      } });
    }
    if (!autoConnectStarted) { autoConnectStarted = true; initAutoConnect(); }
  }
  var autoConnectStarted = false;

  // [اتصال تلقائي بالحساب المربوط] لو حساب الموقع مربوط بتيك توك موثَّق
  // (والحساب ستريمر/أدمن/صلاحية تشغيل)، ما يحتاج يكتب اليوزر: نعبّيه من
  // حسابه، ونفحص كل AUTO_POLL_MS هل يبث الحين (GET /api/stream/is-live —
  // نفس فحص js/agp-live-watch.js)، وأول ما يكون يبث نتصل مباشرة. القطع
  // اليدوي يوقف الاتصال التلقائي لين يضغط "اتصال" بنفسه (sessionStorage).
  var linkedUsername = null;
  // loading | guest | player | unlinked | linked | free (أدمن/تشغيل كامل: خانة اليوزر)
  var accountMode = 'loading';
  var AUTO_POLL_MS = 45000;
  var AUTO_MAX_FAILED_ATTEMPTS = 3;
  var autoFailedAttempts = 0;
  var autoAttemptInFlight = false;
  var AUTO_OFF_KEY = 'agp-auto-connect-off';

  function isAutoConnectOff(){
    try { return sessionStorage.getItem(AUTO_OFF_KEY) === '1'; } catch (e) { return false; }
  }
  function setAutoConnectOff(off){
    try { if (off) sessionStorage.setItem(AUTO_OFF_KEY, '1'); else sessionStorage.removeItem(AUTO_OFF_KEY); } catch (e) {}
    if (!off) autoFailedAttempts = 0;
  }

  function canRunGames(u){
    var perms = (u && u.permissions) || {};
    return Boolean(u && (u.role === 'admin' || u.is_streamer || perms.can_run_games || perms.full_game_access));
  }

  function fetchIsLive(username){
    var token = window.AGPAuth && window.AGPAuth.getToken ? window.AGPAuth.getToken() : null;
    var base = (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com';
    if (!token || !window.fetch) return Promise.resolve(null);
    return fetch(base + '/api/stream/is-live?platform=' + streamPlatform + '&username=' + encodeURIComponent(username), {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(res){ return res.json(); }).then(function(d){
      // الستريمر غيّر يوزره في تيك توك — الخادم حدّثه، نكمل على الجديد.
      if (d && d.success && d.renamed && d.username) { linkedUsername = d.username; renderConnectUI(); }
      return d && d.success && (d.live === true || d.live === false) ? d.live : null;
    }).catch(function(){ return null; });
  }

  function tryAutoConnect(){
    if (!linkedUsername || autoAttemptInFlight || isAutoConnectOff() || document.hidden) return;
    if (connectState === 'connected' || connectState === 'connecting') return;
    if (connectState === 'error' && autoFailedAttempts >= AUTO_MAX_FAILED_ATTEMPTS) return;
    autoAttemptInFlight = true;
    fetchIsLive(linkedUsername).then(function(live){
      autoAttemptInFlight = false;
      if (live !== true || isAutoConnectOff()) return;
      if (connectState === 'connected' || connectState === 'connecting') return;
      if (connectState === 'error') autoFailedAttempts++;
      connectToBackend(linkedUsername);
    });
  }

  // حساب الموقع (من AGPAuth.me) — الربط يختلف حسب المنصة المختارة:
  // تيك توك → tiktok_username، كيك → kick_username، تويتش → twitch_username (profile.html).
  var meUser = null;
  function applyAccountForPlatform(){
    if (!meUser) return;
    var u = meUser;
    var perms = u.permissions || {};
    var free = u.role === 'admin' || Boolean(perms.full_game_access);
    var name = streamPlatform === 'tiktok'
      ? (u.tiktok_verified && u.tiktok_username ? String(u.tiktok_username).replace(/^@+/, '') : null)
      : (u[streamPlatform + '_verified'] && u[streamPlatform + '_username'] ? String(u[streamPlatform + '_username']) : null);
    linkedUsername = name;
    setAccountMode(free ? 'free' : !canRunGames(u) ? 'player' : name ? 'linked' : 'unlinked');
  }

  function setAccountMode(mode){
    accountMode = mode;
    if (connectState === 'idle' || connectState === 'error') renderConnectUI();
  }

  function initAutoConnect(){
    if (!window.AGPAuth || !window.AGPAuth.getToken) { setAccountMode('free'); return; }
    if (!window.AGPAuth.getToken()) { setAccountMode('guest'); return; }
    window.AGPAuth.me().then(function(r){
      var u = r && r.success ? r.user : null;
      if (!u) { setAccountMode(r && r.__httpStatus === 401 ? 'guest' : 'free'); return; }
      meUser = u;
      applyAccountForPlatform();
      if (connectState === 'connected') renderConnectUI(); // زر غرفة الجوالات يعتمد على الحساب
      if (!canRunGames(u)) return;
      if (connectState === 'connected') autoFailedAttempts = 0;
      // لو متصل محفوظ ببث حساب ثاني (أدمن مثلاً) نخليه — نتصل تلقائياً بس لما ما فيه اتصال.
      tryAutoConnect();
      setInterval(tryAutoConnect, AUTO_POLL_MS);
      document.addEventListener('visibilitychange', function(){ if (!document.hidden) tryAutoConnect(); });
    }).catch(function(){ setAccountMode('free'); }); // تعذّر التحقق من الحساب — نرجع للخانة اليدوية
  }

  // إغلاق الصفحة (تحديث/انتقال للعبة أو للرئيسية) يسكّر سوكت التحقق —
  // نفصل معالجاته قبلها عشان onclose ما يمسح الاتصال المحفوظ.
  window.addEventListener('pagehide', closeConnectSocketSilently);
  window.addEventListener('beforeunload', closeConnectSocketSilently);
  var __connectTries = 0;
  var __connectTimer = setInterval(function(){
    __connectTries++;
    initConnectWidget();
    if (__connectTries >= 30) clearInterval(__connectTimer);
  }, 300);
})();
