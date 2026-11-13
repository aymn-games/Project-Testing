/**
 * صفحة البروفايل (profile.html) — المنطق كامل.
 *
 * الصفحة كانت ملف مضغوط (Bundled) يرسم القالب ثم يعبّيه سكربت يدوّر على
 * النصوص. انكتبت من جديد كصفحة عادية بنفس الوظائف:
 * - زر «لاعب | ستريمر» فوق يبدّل البروفايل بين وضعين (يظهر للكل، ويُحفظ
 *   الاختيار بالمتصفح). أول مرة: ستريمر لحسابات الستريمر، ولاعب للباقي.
 * - قائمة جانبية يمين مقسّمة تصنيفات، وكل قسم يفتح محتواه جنبها.
 *   الرابط يحفظ القسم (#frames مثلاً)، و#win-codes يفتح وضع الستريمر.
 * - أقسام صاحب الحساب فقط (تعديل، ربط تيك توك، الأكواد، الدعم...) ما
 *   تطلع للزائر اللي يشوف بروفايل غيره (?id=).
 * - الخادم يرسل النقاط والمقتنيات لصاحب الحساب أو الأدمن فقط
 *   (handlePublicProfile بـbackend/http/auth-router.js)، فالأقسام اللي
 *   تعتمد عليها تختفي لو البيانات مو موجودة.
 *
 * الشكل (بطلب صاحب المنصة): زجاج سميك بألوان هوية ألعاب أيمن — بنفسجي
 * للاعب، وردي أوركيدي للستريمر، وذهبي للمكافآت. الأقسام أزرار زجاجية
 * بأيقونة، والأزرار الأساسية بلون الوضع. بدون إيموجي بالواجهة.
 */
(function () {
  'use strict';

  /* ================================================================ أدوات */

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(kids) ? kids : kids === undefined ? [] : [kids]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  }
  function $(sel) { return document.querySelector(sel); }
  function num(v) { return Number(v || 0).toLocaleString('en-US'); }
  function formatDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ar-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) { return '—'; }
  }
  function isStreamerAccount(p) { return !!(p && (p.is_streamer || p.can_run_games || p.role === 'admin')); }
  function roleLabel(p) {
    if (p.role === 'admin') return 'أدمن';
    // ستريمر = اختار "ستريمر" بالتسجيل، أو حوّله الأدمن (can_run_games).
    return (p.is_streamer || p.can_run_games) ? 'ستريمر' : 'لاعب';
  }
  function levelName(l) { return l ? (l.displayNameAr || l.display_name_ar || l.slug || '') : ''; }
  function plural(n, one, many) { return num(n) + ' ' + (n === 1 ? one : many); }
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) {}
    return null;
  }
  function cachedUser() {
    try { return window.AGPAuth && window.AGPAuth.getCachedUser ? window.AGPAuth.getCachedUser() : null; } catch (e) { return null; }
  }
  function showToast(text, bad) {
    var t = h('div', { class: 'agp-ed-toast' + (bad ? ' bad' : ''), role: 'status', text: text });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }
  function copyText(text, done) {
    var fallback = function () {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove(); done();
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }

  /* أيقونات خطية 16px بنفس الوزن — بدل الإيموجي بالقائمة والعناوين */
  var ICONS = {
    home: '<path d="M4 10.5 12 4l8 6.5V20h-5v-5.5H9V20H4z"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5"/>',
    link: '<path d="M10 14.2a3.8 3.8 0 0 0 5.4 0l3-3a3.8 3.8 0 0 0-5.4-5.4l-1 1"/><path d="M14 9.8a3.8 3.8 0 0 0-5.4 0l-3 3a3.8 3.8 0 0 0 5.4 5.4l1-1"/>',
    star: '<path d="m12 4 2.5 5.1 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z"/>',
    frame: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 15.5-4.5-4.5-8 8"/>',
    person: '<circle cx="12" cy="5.5" r="2.3"/><path d="M12 8.5v6M7.5 11h9M9 20.5l3-6 3 6"/>',
    sparkle: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.6 6.6l2 2M15.4 15.4l2 2M6.6 17.4l2-2M15.4 8.6l2-2"/>',
    cards: '<rect x="4" y="7" width="11" height="13.5" rx="1.8"/><path d="M8.5 3.5H18a2 2 0 0 1 2 2V17"/>',
    gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5.5 12v8.5h13V12M12 8v12.5M12 8C10.5 4 7 4 7 6.2 7 7.6 9 8 12 8zM12 8c1.5-4 5-4 5-1.8C17 7.6 15 8 12 8z"/>',
    chart: '<path d="M4 20h16M7 16.5V11M12 16.5V6M17 16.5v-4"/>',
    trophy: '<path d="M8.5 20.5h7M12 16v4.5M7.5 4h9v5a4.5 4.5 0 0 1-9 0zM7.5 6H4.5v1a3 3 0 0 0 3 3M16.5 6h3v1a3 3 0 0 1-3 3"/>',
    signal: '<circle cx="12" cy="12" r="1.8"/><path d="M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8M5.8 5.8a8.8 8.8 0 0 0 0 12.4M18.2 5.8a8.8 8.8 0 0 1 0 12.4"/>',
    monitor: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="1.8"/><path d="M8.5 20h7M12 16v4"/>',
    medal: '<circle cx="12" cy="15" r="4.8"/><path d="M9 10.8 6.5 3.5h3.6L12 7.4l1.9-3.9h3.6L15 10.8"/>',
    clock: '<circle cx="12" cy="12" r="8.3"/><path d="M12 7.5V12l3 2"/>',
    pad: '<rect x="2.5" y="7" width="19" height="10.5" rx="4"/><path d="M7 12.2h3.2M8.6 10.6v3.2M15 11h.01M17 13.4h.01"/>',
    ticket: '<path d="M4 7.5h16v3a1.8 1.8 0 0 0 0 3.6v2.4H4v-2.4a1.8 1.8 0 0 0 0-3.6z"/><path d="M14 7.5v9" stroke-dasharray="1.6 1.8"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/>',
    check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17 14.6c2 .5 3.2 2.1 3.6 4.9"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    sound: '<path d="M4.5 9.5h3.2L12 6v12l-4.3-3.5H4.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>',
    coin: '<circle cx="12" cy="12" r="8.3"/><path d="M12 7.2 15.3 16h-1.8l-.7-1.9h-1.6l-.7 1.9H8.7zm0 3.4-.6 1.8h1.2z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.8A1.8 1.8 0 0 0 14.2 4H5.8A1.8 1.8 0 0 0 4 5.8v8.4A1.8 1.8 0 0 0 5.8 16H8"/>'
  };
  function icon(name, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'pf-ic' + (cls ? ' ' + cls : ''));
    s.innerHTML = ICONS[name] || '';
    return s;
  }

  // كتل بناء موحّدة للأقسام
  function panel(title, sub, kids, extraClass) {
    return h('div', { class: 'pf-panel' + (extraClass ? ' ' + extraClass : '') }, [
      title ? h('div', { class: 'pf-panel-head' }, [
        h('h3', { class: 'pf-panel-title', text: title }),
        sub ? (typeof sub === 'string' ? h('span', { class: 'pf-panel-sub', text: sub }) : sub) : null
      ]) : null
    ].concat(kids || []));
  }
  function emptyNote(text) { return h('div', { class: 'pf-empty', text: text }); }
  function kvRow(k, v) { return h('div', { class: 'pf-kv' }, [h('span', { class: 'pf-kv-k', text: k }), typeof v === 'string' ? h('span', { class: 'pf-kv-v', text: v }) : h('span', { class: 'pf-kv-v' }, v)]); }
  function pill(text, kind) { return h('span', { class: 'pf-pill' + (kind ? ' ' + kind : ''), text: text }); }
  // صف أرقام واحد مقسوم بخطوط رفيعة: العنوان فوق والرقم تحته
  function kpiStrip(items) {
    return h('div', { class: 'pf-kpis', style: '--n:' + items.length }, items.map(function (it) {
      return h('div', { class: 'pf-kpi' }, [
        h('div', { class: 'pf-kpi-l', text: it.label }),
        h('div', { class: 'pf-kpi-v num' }, [it.value, it.unit ? h('span', { class: 'pf-unit', text: ' ' + it.unit }) : null]),
        it.note ? h('div', { class: 'pf-kpi-n', text: it.note }) : null
      ]);
    }));
  }
  // صف أداة: الوصف يمين والزر يسار (قاعدة صفوف الإعدادات بالمنصة)
  function toolRow(ic, title, desc, control, extraClass) {
    return h('div', { class: 'pf-tool' + (extraClass ? ' ' + extraClass : '') }, [
      h('div', { class: 'pf-tool-txt' }, [
        h('div', { class: 'pf-tool-title' }, [ic ? icon(ic) : null, h('span', { text: title })]),
        desc ? h('div', { class: 'pf-tool-desc', text: desc }) : null
      ]),
      control
    ]);
  }
  function soonBtn() { return h('span', { class: 'pf-btn pf-btn-soon', 'aria-disabled': 'true', title: 'إطلاق جديد قريباً', text: 'قريباً' }); }
  // حلقة تقدّم رفيعة: لون الوضع على الجزء المكتمل بس
  function ring(pct, label) {
    pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
    var r = 42, c = 2 * Math.PI * r;
    var wrap = h('div', { class: 'pf-ring', role: 'img', 'aria-label': label + ' — ' + pct + '٪' });
    wrap.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="' + r + '" class="pf-ring-track"/>' +
      '<circle cx="50" cy="50" r="' + r + '" class="pf-ring-arc" stroke-dasharray="' + (c * pct / 100).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg>';
    wrap.appendChild(h('span', { class: 'pf-ring-pct num', text: pct + '%' }));
    return wrap;
  }

  /* ================================================================ الحالة */

  var S = {
    p: null,          // بيانات البروفايل من الخادم
    owner: false,     // المستخدم يشوف بروفايله هو
    mode: 'player',   // player | streamer
    section: null,
    remoteAccess: [], // بثوث أعطت صاحب الحساب صلاحية التحكم
    winCodes: null,   // أكواد جوائز الفوز (تنجاب أول ما ينفتح القسم)
    emailUnverified: null,
    team: null,       // فريقي + الفرق اللي أنا فيها (/api/teams/mine)
    grants: null,     // أكواد منحها لي ستريمر (/api/collectibles/grants)
    unread: 0
  };

  /* ===================================================== تعريف الأقسام */
  // أقسام قليلة ومدموجة: كل قسم يبان بشاشة وحدة قدر الإمكان.
  // mode: player | streamer | both — owner: لصاحب الحساب فقط
  // show(p): شرط إضافي — streamerOnly: يطلع مقفول لحساب اللاعب العادي
  var GROUPS = [
    { id: 'account', label: 'الحساب' },
    { id: 'items', label: 'المقتنيات' },
    { id: 'broadcast', label: 'البث' },
    { id: 'community', label: 'المجتمع' },
    { id: 'help', label: 'الدعم' }
  ];

  var SECTIONS = [
    { id: 'overview', group: 'account', mode: 'both', icon: 'home', label: 'نظرة عامة', render: renderOverview },
    { id: 'account', group: 'account', mode: 'both', icon: 'user', label: 'حسابي', render: renderAccount },
    { id: 'level', group: 'account', mode: 'player', icon: 'star', label: 'المستوى', show: function (p) { return !!p.points; }, render: renderLevel },
    { id: 'wallet', group: 'account', mode: 'both', owner: true, icon: 'coin', label: 'عملات أيمن', render: renderWallet },

    { id: 'frames', group: 'items', mode: 'player', icon: 'frame', label: 'الإطارات', show: function (p) { return !!p.frames; }, render: renderFrames },
    { id: 'win-cards', group: 'items', mode: 'player', icon: 'trophy', label: 'بطاقات الفوز', show: function (p) { return !!p.winCards; }, render: renderWinCards },
    { id: 'elim-cards', group: 'items', mode: 'player', icon: 'cards', label: 'بطاقات الإقصاء', show: function (p) { return !!p.elimCards; }, render: renderElimCards },
    { id: 'character', group: 'items', mode: 'player', icon: 'person', label: 'الشخصيات', show: function (p) { return S.owner || p.character !== undefined; }, render: renderCharacter },
    { id: 'entrance', group: 'items', mode: 'player', icon: 'sparkle', label: 'الدخولية', show: function (p) { return !!p.entrance; }, render: renderEntrance },
    { id: 'codes', group: 'items', mode: 'player', owner: true, icon: 'gift', label: 'أكوادي', render: renderCodes },

    { id: 'broadcast', group: 'broadcast', mode: 'streamer', icon: 'chart', label: 'إحصائيات البث', render: renderBroadcast },
    { id: 'win-codes', group: 'broadcast', mode: 'streamer', owner: true, streamerOnly: true, icon: 'medal', label: 'الإطارات والجوائز', render: renderRewards },

    { id: 'team', group: 'community', mode: 'streamer', owner: true, streamerOnly: true, icon: 'users', label: 'فريقك', render: renderTeam },
    { id: 'teams', group: 'community', mode: 'both', owner: true, icon: 'search', label: 'ابحث عن ستريمر', render: renderTeams },
    { id: 'remote', group: 'community', mode: 'both', owner: true, icon: 'signal', label: 'التحكم عن بعد', show: function (p) { return isStreamerAccount(p) || S.remoteAccess.length > 0; }, render: renderRemote },

    { id: 'soon', group: 'help', mode: 'streamer', icon: 'clock', label: 'قريباً', render: renderSoon },
    { id: 'support', group: 'help', mode: 'both', owner: true, icon: 'ticket', label: 'تذاكري', render: renderSupport }
  ];
  // روابط قديمة (#info، #win-codes من شاشة الفوز...) توصل للقسم المدموج الجديد
  var ALIASES = { info: 'account', tiktok: 'account', 'remote-control': 'remote', 'remote-access': 'remote', screens: 'soon',
    'stream-stats': 'broadcast', 'streamer-level': 'broadcast', cards: 'win-cards', redeem: 'codes', rewards: 'win-codes', coins: 'wallet' };

  function sectionVisible(sec) {
    if (sec.mode !== 'both' && sec.mode !== S.mode) return false;
    if (sec.owner && !S.owner) return false;
    if (sec.show && !sec.show(S.p)) return false;
    return true;
  }
  function visibleSections() { return SECTIONS.filter(sectionVisible); }
  function findSection(id) { id = ALIASES[id] || id; return SECTIONS.filter(function (s) { return s.id === id; })[0] || null; }

  /* ===================================================== صف العنوان */

  function renderHero() {
    var p = S.p;
    var name = p.display_name || p.username || 'اسم المستخدم';
    $('#pfName').textContent = name;
    document.title = name + ' — ألعاب أيمن';

    var av = $('#pfAvatar');
    av.innerHTML = '';
    if (p.avatar_image_base64) av.appendChild(h('img', { src: p.avatar_image_base64, alt: '' }));
    else av.appendChild(h('span', { class: 'pf-avatar-fallback', text: (name || '؟').charAt(0) }));
    if (S.owner) {
      av.classList.add('editable');
      av.setAttribute('role', 'button');
      av.setAttribute('tabindex', '0');
      av.setAttribute('aria-label', 'تغيير الصورة');
      av.setAttribute('title', 'تغيير الصورة');
    }

    // سطر واحد رمادي تحت الاسم: الدور · الـID · تاريخ الانضمام · حالة تيك توك
    var meta = $('#pfChips');
    meta.innerHTML = '';
    var roleKey = p.role === 'admin' ? 'admin' : (p.is_streamer || p.can_run_games) ? 'streamer' : 'player';
    meta.appendChild(h('span', { class: 'pf-role pf-role-' + roleKey, text: roleLabel(p) }));
    if (p.custom_id) {
      var idBtn = h('button', { type: 'button', class: 'pf-meta-btn num', title: 'نسخ الـID', 'aria-label': 'نسخ الـID ' + p.custom_id }, [h('span', { text: 'ID #' + p.custom_id }), icon('copy')]);
      idBtn.addEventListener('click', function () {
        copyText(p.custom_id, function () {
          idBtn.firstChild.textContent = 'تم النسخ';
          setTimeout(function () { idBtn.firstChild.textContent = 'ID #' + p.custom_id; }, 1500);
        });
      });
      meta.appendChild(idBtn);
    }
    if (p.joined_at) meta.appendChild(h('span', { text: 'انضم ' + formatDate(p.joined_at) }));
    // شارة توثيق تيك توك — بألوان تيك توك، أو مقطّعة لو الحساب مو مربوط
    meta.appendChild(p.tiktok_verified
      ? h('span', { class: 'pf-tt-badge', title: p.tiktok_username ? '@' + p.tiktok_username : 'حساب تيك توك موثّق' }, [h('img', { src: 'tiktok-logo.png', alt: '' }), 'موثّق بتيك توك', icon('check')])
      : h('a', { class: 'pf-tt-badge off', href: S.owner ? '#tiktok' : null, 'data-sec': S.owner ? 'tiktok' : null }, [h('img', { src: 'tiktok-logo.png', alt: '' }), 'تيك توك غير مربوط']));

    var acts = $('#pfHeroActions');
    acts.innerHTML = '';
    if (S.owner) {
      if (p.role === 'admin') acts.appendChild(h('a', { href: 'admin.html', class: 'pf-btn pf-btn-ghost' }, 'لوحة الأدمن'));
      acts.appendChild(h('button', { type: 'button', class: 'pf-btn pf-btn-ghost', onclick: function () { openEditModal(); } }, 'تعديل الملف'));
      if (window.AGPProfileCard) acts.appendChild(h('button', { type: 'button', class: 'pf-btn pf-btn-primary', onclick: function () { window.AGPProfileCard.open(S.p); } }, 'صورة بروفايلي'));
    }
    paintModeSwitch();
  }

  function paintModeSwitch() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
      var on = b.getAttribute('data-mode') === S.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.setAttribute('tabindex', on ? '0' : '-1');
    });
    var sw = $('#pfMode');
    if (sw) sw.setAttribute('data-active', S.mode);
    document.body.setAttribute('data-pf-mode', S.mode);
  }

  /* ===================================================== القائمة الجانبية */

  function renderSideNav() {
    var nav = $('#pfSideNav');
    nav.innerHTML = '';
    var vis = visibleSections();
    GROUPS.forEach(function (g) {
      var items = vis.filter(function (s) { return s.group === g.id; });
      if (!items.length) return;
      var grp = h('div', { class: 'pf-side-group' }, [h('div', { class: 'pf-side-label', text: g.label })]);
      items.forEach(function (s) {
        var locked = s.streamerOnly && !isStreamerAccount(S.p);
        var badge = null;
        // العدّاد بس على شي يحتاج إجراء: ردود الدعم الجديدة
        if (s.id === 'support' && S.unread > 0) badge = h('span', { class: 'pf-side-count num', title: 'ردود جديدة من فريق الدعم', text: S.unread > 99 ? '99+' : String(S.unread) });
        if (s.id === 'codes' && pendingGrants() > 0) badge = h('span', { class: 'pf-side-count num', title: 'أكواد وصلتك ما استرديتها', text: String(pendingGrants()) });
        if (s.id === 'account' && S.emailUnverified) badge = h('span', { class: 'pf-side-dot', title: 'الإيميل غير مؤكد' });
        if (locked) badge = icon('lock', 'pf-side-lock');
        var a = h('a', {
          href: '#' + s.id,
          class: 'pf-side-item' + (s.id === S.section ? ' on' : ''),
          'aria-current': s.id === S.section ? 'page' : null,
          'data-sec': s.id
        }, [h('span', { class: 'pf-side-ic' }, icon(s.icon)), h('span', { class: 'pf-side-txt', text: s.label }), badge]);
        grp.appendChild(a);
      });
      nav.appendChild(grp);
    });
  }

  /* ===================================================== التنقل */

  function go(sectionId, opts) {
    opts = opts || {};
    var sec = findSection(sectionId);
    if (sec && sec.mode !== 'both' && sec.mode !== S.mode) setMode(sec.mode, { keepSection: true });
    if (!sec || !sectionVisible(sec)) sec = visibleSections()[0];
    S.section = sec.id;
    if (!opts.noHash && location.hash !== '#' + sec.id) history.replaceState(null, '', location.pathname + location.search + '#' + sec.id);
    renderSideNav();
    var c = $('#pfContent');
    c.innerHTML = '';
    var locked = sec.streamerOnly && !isStreamerAccount(S.p);
    var body = h('div', { class: 'pf-content-body pf-anim' });
    c.appendChild(h('h2', { class: 'pf-content-title', text: sec.label }));
    c.appendChild(body);
    try {
      if (locked) body.appendChild(lockedNotice());
      else sec.render(body, S.p);
    } catch (e) {
      body.appendChild(emptyNote('تعذّر عرض هذا القسم.'));
      var AGP = window.AymanGamesPlatform; if (AGP && AGP.log) AGP.log('profile: section render failed', e);
    }
    var active = document.querySelector('.pf-side-item.on');
    if (active && active.scrollIntoView && window.innerWidth < 900) active.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (opts.scroll && window.innerWidth < 900) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setMode(mode, opts) {
    opts = opts || {};
    if (mode !== 'player' && mode !== 'streamer') return;
    if (mode === S.mode && !opts.keepSection) return;
    S.mode = mode;
    store('agp_profile_mode', mode);
    paintModeSwitch();
    if (!opts.keepSection) {
      var cur = findSection(S.section);
      go(cur && sectionVisible(cur) ? cur.id : 'overview');
      // الشاشة كلها تبدّل ألوانها، ورسالة قصيرة تأكد وين صرت
      document.body.classList.remove('pf-switching'); void document.body.offsetWidth; document.body.classList.add('pf-switching');
      setTimeout(function () { document.body.classList.remove('pf-switching'); }, 700);
      showToast(mode === 'streamer' ? 'صرت ببروفايل الستريمر' : 'صرت ببروفايل اللاعب');
    }
  }

  function lockedNotice() {
    return h('div', { class: 'pf-lock' }, [
      icon('lock', 'pf-lock-ic'),
      h('div', { class: 'pf-lock-t', text: 'هذي الأداة لحسابات الستريمر' }),
      h('div', { class: 'pf-lock-d', text: 'حسابك حالياً حساب لاعب. أدوات البث تتفعّل لما يكون حسابك ستريمر.' })
    ]);
  }

  /* ===================================================== الأقسام */

  function emailBanner() {
    if (!S.owner || !S.emailUnverified) return null;
    return h('div', { class: 'pf-notice' }, [
      h('div', { class: 'pf-notice-txt' }, [
        h('strong', { text: 'إيميلك غير مؤكد. ' }),
        'أكّده عشان تقدر تستعيد حسابك لو نسيت كلمة المرور أو اسم المستخدم.'
      ]),
      h('button', { type: 'button', class: 'pf-btn pf-btn-ghost', onclick: function () {
        openEmailVerifyModal(S.emailUnverified.email, function () { S.emailUnverified = null; go(S.section, { noHash: true }); });
      } }, 'أكّد الإيميل')
    ]);
  }

  function activeFrame(p) { return (p.frames || []).filter(function (x) { return x.equipped; })[0] || null; }

  function playerLevelInfo(p) {
    var pts = p.points || {};
    var total = pts.totalPoints || 0;
    var cur = pts.currentLevel, next = pts.nextLevel;
    var base = cur ? cur.pointsRequired : 0;
    var pct = next ? ((total - base) / Math.max(1, next.pointsRequired - base)) * 100 : (cur ? 100 : 0);
    var note = next
      ? ('باقي ' + num(Math.max(0, next.pointsRequired - total)) + ' نقطة على مستوى «' + levelName(next) + '»')
      : (cur ? 'وصلت أعلى مستوى متاح حالياً' : 'لا توجد مستويات مفعَّلة بعد');
    return { total: total, pct: pct, note: note, cur: cur, next: next };
  }

  function streamerLevelInfo(p) {
    var sl = p.streamerLevel || {};
    var next = sl.nextLevel;
    var need = next ? (next.minSp != null ? next.minSp : next.min_sp) : null;
    var note = next
      ? (need != null ? 'باقي ' + num(Math.max(0, need - (sl.sp || 0))) + ' SP على مستوى «' + levelName(next) + '»' : 'المستوى التالي: ' + levelName(next))
      : (sl.currentLevel ? 'وصلت أعلى مستوى متاح حالياً' : 'ابدأ البث عشان تجمع SP');
    return { sp: sl.sp || 0, pct: sl.progressPercent || (sl.currentLevel && !next ? 100 : 0), cur: sl.currentLevel, note: note };
  }

  // الكتلة القائدة: الحلقة + الرقم الأكبر بالصفحة + المستوى وكم باقي
  function levelLead(opts) {
    return h('div', { class: 'pf-lead' }, [
      ring(opts.pct, opts.ringLabel),
      h('div', { class: 'pf-lead-txt' }, [
        h('div', { class: 'pf-lead-l', text: opts.label }),
        h('div', { class: 'pf-lead-v num' }, [opts.value, h('span', { class: 'pf-unit', text: ' ' + opts.unit })]),
        h('div', { class: 'pf-lead-lvl', text: opts.level ? 'المستوى: ' + opts.level : 'بدون مستوى بعد' }),
        h('div', { class: 'pf-lead-n', text: opts.note })
      ])
    ]);
  }

  function renderOverview(body, p) {
    var banner = emailBanner();
    if (banner) body.appendChild(banner);

    if (S.mode === 'player') {
      if (p.points) {
        var L = playerLevelInfo(p);
        body.appendChild(panel(null, null, [
          levelLead({ pct: L.pct, ringLabel: 'التقدّم للمستوى التالي', label: 'نقاط الخبرة', value: num(L.total), unit: 'نقطة', level: levelName(L.cur), note: L.note }),
          kpiStrip([
            { label: 'جولات مكتملة', value: num(p.points.gamesPlayed) },
            { label: 'فوز', value: num(p.points.gamesWon) },
            { label: 'نسبة الفوز', value: (p.points.winRatePct || 0) + '%' }
          ])
        ], 'pf-panel-lead'));
      }
    } else {
      var s = p.stats || {};
      var kids = [];
      if (p.streamerLevel) {
        var SL = streamerLevelInfo(p);
        kids.push(levelLead({ pct: SL.pct, ringLabel: 'التقدّم لمستوى الستريمر التالي', label: 'نقاط الستريمر', value: num(SL.sp), unit: 'SP', level: levelName(SL.cur), note: SL.note }));
      }
      kids.push(kpiStrip([
        { label: 'عدد البثوث', value: num(s.total_broadcasts) },
        { label: 'ساعات البث', value: String(Math.round(((s.total_live_ms || 0) / 3600000) * 10) / 10), unit: 'ساعة' },
        { label: 'قيمة الهدايا', value: num(s.total_gifts_value), unit: 'ألماسة' }
      ]));
      body.appendChild(panel(null, null, kids, 'pf-panel-lead'));
    }

    var row = h('div', { class: 'pf-row2' });
    row.appendChild(panel('ملخص الحساب', null, [h('div', { class: 'pf-kvs' }, [
      kvRow('نوع الحساب', roleLabel(p)),
      kvRow('اسم المستخدم', p.username || '—'),
      kvRow('انضم في', formatDate(p.joined_at)),
      kvRow('حساب تيك توك', p.tiktok_verified ? (p.tiktok_username ? '@' + p.tiktok_username : 'مرتبط') : 'غير مربوط')
    ])]));

    if (S.mode === 'player' && p.frames) {
      // العنصر الخاص بالمنصة: الإطار المفعّل نفسه بحجمه
      var f = activeFrame(p);
      row.appendChild(panel('الإطار المفعّل', S.owner ? h('a', { href: '#frames', class: 'pf-link', 'data-sec': 'frames' }, 'غيّر الإطار') : null, [
        f ? h('div', { class: 'pf-frame-show' }, [
          f.imageFilename ? h('img', { src: f.imageFilename, alt: f.displayNameAr || '', loading: 'lazy' }) : null,
          h('div', { class: 'pf-frame-name', text: f.displayNameAr || f.frameRef })
        ]) : h('div', { class: 'pf-empty' }, ['ما فعّلت إطار بعد. ', S.owner ? h('a', { href: '#frames', class: 'pf-link', 'data-sec': 'frames' }, 'اختر إطار من مقتنياتك') : null])
      ]));
    } else if (S.mode === 'streamer' && S.owner && isStreamerAccount(p)) {
      row.appendChild(panel('أدوات البث', null, [h('div', { class: 'pf-kvs' }, [
        kvRow('فريقك', h('a', { href: '#team', class: 'pf-link', 'data-sec': 'team' }, 'الأعضاء')),
        kvRow('الإطارات والجوائز', h('a', { href: '#win-codes', class: 'pf-link', 'data-sec': 'win-codes' }, 'أكواد ومنح')),
        kvRow('التحكم عن بعد', h('a', { href: '#remote', class: 'pf-link', 'data-sec': 'remote' }, 'إدارة'))
      ])]));
    }
    body.appendChild(row);
  }

  /* ---------- حسابي: البيانات + تيك توك + الحذف بقسم واحد */
  function renderAccount(body, p) {
    var banner = emailBanner();
    if (banner) body.appendChild(banner);
    // تشغيل الألعاب: حساب ستريمر + تيك توك موثَّق (بدون موافقة أدمن).
    var play = p.role === 'admin' ? pill('مفعّلة', 'ok')
      : !(p.is_streamer || p.can_run_games) ? pill('لحسابات الستريمر')
      : p.tiktok_verified ? pill('مفعّلة', 'ok') : pill('تحتاج ربط تيك توك', 'warn');
    body.appendChild(panel('بيانات الحساب', S.owner ? h('button', { type: 'button', class: 'pf-btn pf-btn-ghost pf-btn-sm', onclick: function () { openEditModal(); } }, 'تعديل') : null, [
      h('div', { class: 'pf-kvs pf-kvs-2' }, [
        kvRow('اسم العرض', p.display_name || p.username || '—'),
        kvRow('اسم المستخدم', p.username || '—'),
        kvRow('نوع الحساب', roleLabel(p)),
        kvRow('تاريخ الانضمام', formatDate(p.joined_at)),
        kvRow('تشغيل الألعاب', play)
      ])
    ]));
    if (S.owner) {
      body.appendChild(tiktokRow(p));
      body.appendChild(h('div', { class: 'pf-danger-row' }, [
        h('span', { text: 'حذف الحساب يمسح نقاطك ومقتنياتك نهائياً.' }),
        h('button', { type: 'button', class: 'pf-btn pf-btn-danger pf-btn-sm', onclick: deleteAccount }, 'حذف الحساب')
      ]));
    }
  }

  // حذف الحساب الذاتي — تأكيد مزدوج لأنه نهائي (handleDeleteMyAccount بـauth-router.js).
  function deleteAccount(e) {
    var btn = e.currentTarget;
    var label = btn.textContent;
    var typed = window.prompt('هذا الإجراء نهائي ولا يمكن التراجع عنه — كل بياناتك ونقاطك وربط حسابك بتيك توك بتُحذف تماماً.\n\nاكتب كلمة "حذف" بالضبط للتأكيد:');
    if (typed === null) return;
    if (typed.trim() !== 'حذف') { window.alert('لم تتطابق الكلمة — تم إلغاء الحذف.'); return; }
    if (!window.confirm('تأكيد أخير: هل أنت متأكد تماماً من حذف حسابك نهائياً؟')) return;
    btn.disabled = true;
    btn.textContent = 'جارٍ الحذف...';
    window.AGPAuth.deleteMyAccount().then(function (result) {
      if (result && result.success) {
        try { window.AGPAuth.logout && window.AGPAuth.logout(); } catch (er) {}
        try { localStorage.removeItem('agp_auth_token'); localStorage.removeItem('agp_auth_user'); } catch (er) {}
        window.alert('تم حذف حسابك نهائياً.');
        window.location.href = './';
      } else {
        btn.disabled = false; btn.textContent = label;
        window.alert('تعذّر حذف الحساب: ' + (result && result.error ? result.error : 'خطأ غير معروف'));
      }
    }).catch(function () { btn.disabled = false; btn.textContent = label; });
  }

  // صف تيك توك المختصر: الشعار والحالة يمين، والزر يسار
  function tiktokRow(p) {
    var linked = !!p.tiktok_verified;
    var btn;
    if (linked) {
      btn = h('button', { type: 'button', class: 'pf-btn pf-btn-danger pf-btn-sm', text: 'إلغاء الربط' });
      // POST /api/auth/tiktok/unlink عبر AGPAuth.unlinkTikTok
      btn.addEventListener('click', function () {
        if (!window.confirm('متأكد تبي تلغي ربط حساب تيك توك؟')) return;
        btn.disabled = true;
        window.AGPAuth.unlinkTikTok().then(function (result) {
          btn.disabled = false;
          if (result && result.success) window.location.reload();
          else if (result && result.error === 'tiktok_only_account') window.alert('حسابك أنشأته بتيك توك وما له طريقة دخول ثانية — لو ألغيت الربط ما تقدر تدخل حسابك. أضف إيميل وكلمة مرور أو اربط جوجل أولاً، بعدها تقدر تلغي الربط.');
          else window.alert('تعذّر إلغاء الربط: ' + (result && result.error ? result.error : 'خطأ غير معروف'));
        }).catch(function () { btn.disabled = false; });
      });
    } else {
      btn = h('button', { type: 'button', class: 'pf-btn pf-btn-primary pf-btn-sm', text: 'ربط تيك توك' });
      // تسجيل دخول تيك توك الرسمي — انتقال مباشر لخادمنا وهو يحوّل (302) لتيك توك
      // (backend/auth/tiktok-oauth-service.js). جلب الرابط بالخلفية طلّع شاشة بيضاء عند ناس كثير.
      btn.addEventListener('click', function () {
        var token = window.AGPAuth && window.AGPAuth.getToken ? window.AGPAuth.getToken() : null;
        if (!token) { window.location.href = 'login.html'; return; }
        var apiBase = (window.AGPAuth && window.AGPAuth.API_BASE) || '';
        window.location.href = apiBase + '/api/auth/tiktok/oauth/start?token=' + encodeURIComponent(token);
      });
    }
    return h('div', { class: 'pf-panel pf-tt-row' + (linked ? '' : ' off'), id: 'tiktok' }, [
      h('span', { class: 'pf-tt-logo' }, h('img', { src: 'tiktok-logo.png', alt: 'تيك توك' })),
      h('div', { class: 'pf-tt-id' }, [
        h('div', { class: 'pf-tt-title' }, ['حساب تيك توك ', linked ? pill('موثّق', 'ok') : pill('غير مربوط', 'warn')]),
        h('div', { class: 'pf-tt-handle', text: linked ? (p.tiktok_username ? '@' + p.tiktok_username : 'مرتبط') : 'اربطه عشان تنحسب نقاطك وتطلع شخصيتك بالألعاب' })
      ]),
      btn
    ]);
  }

  function renderLevel(body, p) {
    var L = playerLevelInfo(p);
    body.appendChild(panel(null, null, [
      levelLead({ pct: L.pct, ringLabel: 'التقدّم للمستوى التالي', label: 'نقاط الخبرة', value: num(L.total), unit: 'نقطة', level: levelName(L.cur), note: L.note }),
      kpiStrip([
        { label: 'جولات مكتملة', value: num(p.points.gamesPlayed) },
        { label: 'فوز', value: num(p.points.gamesWon) },
        { label: 'نسبة الفوز', value: (p.points.winRatePct || 0) + '%' }
      ])
    ], 'pf-panel-lead'));
    // القيم من points-service.js نفسه — ما تنكتب يدوياً هنا.
    var r = p.points.rules;
    if (r) body.appendChild(h('details', { class: 'pf-more' }, [
      h('summary', { text: 'كيف تكسب النقاط؟' }),
      h('div', { class: 'pf-kvs pf-kvs-2' }, [
        kvRow('إكمال جولة', num(r.perCompletedRound) + ' نقاط'),
        kvRow('الفوز', num(r.winBonus) + ' فردي · ' + num(r.teamWinBonus) + ' فريق'),
        kvRow('كل ساعة لعب', num(r.perHourPlayed) + ' نقاط'),
        kvRow('الحد اليومي', num(r.dailyCap) + ' نقطة')
      ])
    ]));
  }

  function itemCard(opts) {
    var card = h('div', { class: 'pf-item' + (opts.wide ? ' wide' : '') });
    var box = h('div', { class: 'pf-item-art', style: opts.artHeight ? '--art-h:' + opts.artHeight + 'px' : null });
    if (opts.img) {
      var im = h('img', { src: opts.img, alt: opts.name || '', loading: 'lazy' });
      im.onerror = function () { im.style.display = 'none'; };
      box.appendChild(im);
    } else if (opts.glyph) box.appendChild(h('span', { class: 'pf-item-glyph', text: opts.glyph }));
    card.appendChild(box);
    card.appendChild(h('div', { class: 'pf-item-row' }, [h('div', { class: 'pf-item-name', text: opts.name }), opts.status || null]));
    if (opts.control) card.appendChild(opts.control);
    return card;
  }
  // زر إجراء على عنصر: يعطّل نفسه، ينادي الخادم، ويعيد التحميل لو نجح
  function actionBtn(label, fn, cls) {
    var b = h('button', { type: 'button', class: 'pf-btn pf-btn-sm ' + (cls || 'pf-btn-ghost'), text: label });
    b.addEventListener('click', function () {
      b.disabled = true; b.textContent = 'جارٍ...';
      fn().then(function (r) {
        if (r && r.success) window.location.reload();
        else { b.disabled = false; b.textContent = label; showToast('تعذّر التنفيذ، حاول مرة ثانية.', true); }
      }).catch(function () { b.disabled = false; b.textContent = label; });
    });
    return b;
  }

  function renderFrames(body, p) {
    var frames = (p.frames || []).slice().sort(function (a, b) { return (b.equipped ? 1 : 0) - (a.equipped ? 1 : 0); });
    var grid = h('div', { class: 'pf-items pf-items-frames' });
    if (!frames.length) grid.appendChild(emptyNote('ما عندك إطارات بعد. تجيك من المتجر أو المستويات أو أكواد الجوائز.'));
    frames.forEach(function (f) {
      var control = f.equipped ? null : (S.owner ? actionBtn('تفعيل', function () { return window.AGPAuth.equipFrame(f.frameType, f.frameRef); }) : null);
      grid.appendChild(itemCard({ img: f.imageFilename, name: f.displayNameAr || f.frameRef, artHeight: 76, status: f.equipped ? pill('مفعّل', 'ok') : null, control: control }));
    });
    body.appendChild(panel('إطاراتي', S.owner ? h('a', { href: '#codes', class: 'pf-link', 'data-sec': 'codes' }, 'عندك كود؟') : plural(frames.length, 'إطار', 'إطار'), [grid]));
  }

  function renderCharacter(body, p) {
    var cur = p.character === 'girl' || p.character === 'boy' ? p.character : null;
    var grid = h('div', { class: 'pf-items pf-items-3 pf-items-chars' });
    [
      { kind: 'girl', name: 'بنت', img: 'assets/characters/girl.png' },
      { kind: 'boy', name: 'ولد', img: 'assets/characters/boy.png' },
      { kind: null, name: 'عشوائي', img: null }
    ].forEach(function (opt) {
      var active = opt.kind === cur;
      var control = S.owner && !active ? actionBtn('اختيار', function () { return window.AGPAuth.setCharacter(opt.kind); }) : null;
      grid.appendChild(itemCard({ img: opt.img, glyph: opt.img ? null : '؟', name: opt.name, artHeight: 170, status: active ? pill('مختارة', 'ok') : null, control: control }));
    });
    body.appendChild(panel(null, null, [
      h('p', { class: 'pf-muted', text: 'شخصيتك الثري دي تطلع معك بالألعاب لما يكون حسابك موثّق بتيك توك.' }),
      grid
    ]));
  }

  /* ---------- المقتنيات: كل نوع بقسم، والمتحرك يتحرك، واللي له صوت يشتغل صوته */
  function cardsGrid(kind, list, toggleFn, emptyText, artHeight) {
    var grid = h('div', { class: 'pf-items pf-items-cards' });
    if (!list.length) grid.appendChild(emptyNote(emptyText));
    list.forEach(function (c) {
      var ctl = h('div', { class: 'pf-item-ctl' }, [
        S.owner ? actionBtn(c.enabled ? 'إيقاف' : 'تفعيل', function () { return toggleFn(c.cardKey, !c.enabled); }) : null,
        h('button', { type: 'button', class: 'pf-btn pf-btn-ghost pf-btn-sm', onclick: function () { openCardPreview(kind, c); } }, [icon('play'), 'معاينة'])
      ]);
      var card = itemCard({
        img: c.imageFilename, name: cleanCardName(c.displayNameAr || c.cardKey), artHeight: artHeight,
        status: c.enabled ? pill('مفعّلة', 'ok') : pill('موقوفة'),
        control: ctl
      });
      if (cardHasSound(kind, c)) card.querySelector('.pf-item-art').appendChild(h('span', { class: 'pf-item-flag', title: 'لها صوت خاص' }, icon('sound')));
      grid.appendChild(card);
    });
    return grid;
  }
  // «بطاقة الإقصاء — عزوز (منح محدود)» ← «عزوز»
  function cleanCardName(n) { return String(n || '').replace(/^بطاقة (الإقصاء|الفوز)\s*[—-]\s*/, '').replace(/\s*\(منح محدود\)\s*$/, ''); }
  function previewPlayer(kind, c) {
    var p = S.p || {};
    var pl = { name: p.display_name || p.username || 'أنت', avatarUrl: p.avatar_image_base64 || p.tiktok_avatar_url || null };
    pl[kind === 'elim' ? 'elimCard' : 'winCard'] = { cardKey: c.cardKey };
    return pl;
  }
  function cardApi(kind) { var A = window.AymanGamesPlatform || {}; return kind === 'elim' ? A.elimCard : A.winCard; }
  function cardHasSound(kind, c) { var api = cardApi(kind); return !!(api && api.hasSound && api.hasSound(previewPlayer(kind, c))); }

  // معاينة البطاقة بشكلها الحقيقي بالألعاب (نفس js/agp-elim-card.js وjs/agp-win-card.js)
  function openCardPreview(kind, c) {
    var api = cardApi(kind);
    var sheet = openSheet(cleanCardName(c.displayNameAr || c.cardKey), kind === 'elim' ? 'كذا تطلع بطاقتك لما تقصي لاعب بالألعاب.' : 'كذا تطلع بطاقتك لما تفوز بجولة.');
    var stage = h('div', { class: 'pf-preview' });
    var me = previewPlayer(kind, c);
    function paint() {
      if (api && api.canShow && api.canShow(me)) {
        stage.innerHTML = kind === 'elim'
          ? api.renderHtml(me, { name: 'لاعب', avatarUrl: null })
          : api.renderHtml(me, ['المركز الأول', '+10 نقاط'], { pop: true });
      } else {
        stage.innerHTML = '';
        if (c.imageFilename) stage.appendChild(h('img', { src: c.imageFilename, alt: '', class: 'pf-preview-img' }));
      }
      stage.classList.remove('pf-pop'); void stage.offsetWidth; stage.classList.add('pf-pop');
    }
    paint();
    sheet.body.appendChild(stage);
    var actions = h('div', { class: 'pf-actions pf-actions-center' });
    actions.appendChild(h('button', { type: 'button', class: 'pf-btn pf-btn-ghost pf-btn-sm', onclick: paint }, [icon('play'), 'إعادة الحركة']));
    if (api && api.hasSound && api.hasSound(me)) {
      actions.appendChild(h('button', { type: 'button', class: 'pf-btn pf-btn-primary pf-btn-sm', onclick: function () { paint(); api.playSound(me, 1); } }, [icon('sound'), 'تشغيل الصوت']));
    }
    sheet.body.appendChild(actions);
  }

  function renderWinCards(body, p) {
    var win = p.winCards || [];
    body.appendChild(panel(null, null, [cardsGrid('win', win, function (k, on) { return window.AGPAuth.toggleWinCard(k, on); }, 'ما عندك بطاقات فوز بعد.', 150)]));
  }
  function renderElimCards(body, p) {
    var elim = p.elimCards || [];
    body.appendChild(panel(null, null, [cardsGrid('elim', elim, function (k, on) { return window.AGPAuth.toggleElimCard(k, on); }, 'ما عندك بطاقات إقصاء بعد.', 104)]));
  }
  function renderEntrance(body, p) {
    var e = p.entrance;
    body.appendChild(panel(null, null, [e ? h('div', { class: 'pf-kvs' }, [
      kvRow('الدخولية', e.template_key || '—'),
      e.entrance_text ? kvRow('النص', e.entrance_text) : null,
      kvRow('الحالة', e.enabled === false ? pill('موقوفة', 'warn') : pill('مفعّلة', 'ok'))
    ]) : emptyNote('ما عندك دخولية مفعّلة بعد.')]));
  }

  /* ---------- محفظة عملات أيمن (تصميم جاهز — النظام نفسه ينبني لاحقاً) */
  function coinSvg(cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'pf-coin' + (cls ? ' ' + cls : ''));
    s.innerHTML =
      '<defs><linearGradient id="pfCoinG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1c2"/><stop offset=".45" stop-color="#e8d8a6"/><stop offset="1" stop-color="#b48a3c"/></linearGradient>' +
      '<linearGradient id="pfCoinV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8c5ae0"/><stop offset="1" stop-color="#4a2290"/></linearGradient></defs>' +
      '<circle cx="32" cy="32" r="30" fill="url(#pfCoinG)"/><circle cx="32" cy="32" r="24.5" fill="url(#pfCoinV)" stroke="#fff3cf" stroke-opacity=".55" stroke-width="1.5"/>' +
      '<path d="M32 17 44.5 45h-6.2l-2.6-6.2h-7.4L25.7 45h-6.2zm0 11.2-2.4 6h4.8z" fill="#fff3cf"/>' +
      '<circle cx="32" cy="32" r="28" fill="none" stroke="#fff" stroke-opacity=".35" stroke-dasharray="2 3.2"/>';
    return s;
  }
  function renderWallet(body) {
    body.appendChild(h('div', { class: 'pf-panel pf-wallet' }, [
      h('div', { class: 'pf-wallet-coin' }, coinSvg('spin')),
      h('div', { class: 'pf-wallet-txt' }, [
        h('div', { class: 'pf-lead-l', text: 'رصيدك من عملات أيمن' }),
        h('div', { class: 'pf-wallet-v' }, [h('span', { class: 'num', text: '—' }), h('span', { class: 'pf-unit', text: ' عملة' })]),
        pill('قريباً')
      ])
    ]));
    var steps = [
      ['trophy', 'تكسبها', 'من الفوز بالمباريات، والمهام اليومية، وهدايا الستريمر اللي تتابعه.'],
      ['gift', 'تصرفها', 'على إطارات وبطاقات من المتجر، أو تهديها للاعبين.'],
      ['users', 'الستريمر يوزّع', 'الستريمر يقدر يمنح لاعبينه عملات من رصيده.']
    ];
    body.appendChild(h('div', { class: 'pf-howgrid' }, steps.map(function (st) {
      return h('div', { class: 'pf-panel pf-how' }, [h('span', { class: 'pf-how-ic' }, icon(st[0])), h('div', { class: 'pf-how-t', text: st[1] }), h('p', { class: 'pf-how-d', text: st[2] })]);
    })));
  }

  /* ---------- الجوائز (الستريمر): أكواد الفوز + منح عملات + أكواد يومية */
  function renderRewards(body, p) {
    var tabs = [
      { id: 'codes', label: 'أكواد الفوز', render: function () { var w = h('div'); renderWinCodes(w, p); return w; } },
      { id: 'coins', label: 'منح عملات', render: renderGrantCoins },
      { id: 'daily', label: 'أكواد يومية', render: renderDailyCodes }
    ];
    body.appendChild(segTabs(tabs, 'rewards'));
  }
  function renderGrantCoins() {
    var who = h('input', { type: 'search', class: 'pf-input', placeholder: 'الـID أو يوزر تيك توك', disabled: true, 'aria-label': 'اللاعب' });
    var amount = h('input', { type: 'number', class: 'pf-input pf-input-amt', placeholder: 'عدد العملات', min: '1', disabled: true, 'aria-label': 'عدد العملات' });
    return h('div', { class: 'pf-content-body' }, [
      h('div', { class: 'pf-panel pf-wallet pf-wallet-sm' }, [
        h('div', { class: 'pf-wallet-coin' }, coinSvg()),
        h('div', { class: 'pf-wallet-txt' }, [h('div', { class: 'pf-lead-l', text: 'رصيدك للمنح' }), h('div', { class: 'pf-wallet-v' }, [h('span', { class: 'num', text: '—' }), h('span', { class: 'pf-unit', text: ' عملة' })])]),
        pill('قريباً')
      ]),
      panel('امنح لاعب عملات', null, [
        h('div', { class: 'pf-grant-form' }, [who, amount, h('button', { type: 'button', class: 'pf-btn pf-btn-primary', disabled: true, title: 'يتفعّل مع نظام العملات' }, 'منح')]),
        h('p', { class: 'pf-field-help', text: 'تمنح أي لاعب عملات من رصيدك، وتوصله بحسابه على طول. يتفعّل مع إطلاق نظام العملات.' })
      ])
    ]);
  }
  function renderDailyCodes() {
    var days = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
    return h('div', { class: 'pf-content-body' }, [
      panel('كود كل يوم', pill('قريباً'), [
        h('p', { class: 'pf-muted', text: 'تكسب كود جوائز جديد كل يوم مع نشاط بثّك، وتمنحه لفريقك أو تسترده لنفسك.' }),
        h('div', { class: 'pf-daily' }, days.map(function (d, i) {
          return h('div', { class: 'pf-day' + (i === 6 ? ' big' : '') }, [h('span', { class: 'pf-day-n', text: d }), icon(i === 6 ? 'gift' : 'medal'), h('span', { class: 'pf-day-s', text: i === 6 ? 'كود مميز' : 'كود' })]);
        }))
      ])
    ]);
  }

  // تبويبات صغيرة داخل قسم (تتذكر آخر تبويب)
  var segMemory = {};
  function segTabs(tabs, key) {
    var wrap = h('div', { class: 'pf-segwrap' });
    var bar = h('div', { class: 'pf-seg', role: 'tablist' });
    var pane = h('div', { class: 'pf-segpane' });
    function show(id) {
      segMemory[key] = id;
      Array.prototype.forEach.call(bar.children, function (b) { var on = b.getAttribute('data-t') === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      pane.innerHTML = '';
      pane.appendChild(tabs.filter(function (t) { return t.id === id; })[0].render());
    }
    tabs.forEach(function (t) {
      bar.appendChild(h('button', { type: 'button', role: 'tab', 'data-t': t.id, onclick: function () { show(t.id); } }, [t.label, t.count != null ? h('span', { class: 'pf-seg-n num', text: String(t.count) }) : null]));
    });
    wrap.appendChild(bar); wrap.appendChild(pane);
    show(segMemory[key] && tabs.some(function (t) { return t.id === segMemory[key]; }) ? segMemory[key] : tabs[0].id);
    return wrap;
  }

  var REDEEM_ERRORS = {
    invalid_code: 'الكود غير صحيح، تأكد منه وحاول مرة ثانية.',
    code_used: 'هذا الكود مستخدم من قبل.',
    code_burned: 'هذا الكود ملغي ولا يمكن استخدامه.',
    already_owned: 'عندك كل الإطارات المتاحة بهذا الكود.',
    rate_limited: 'محاولات كثيرة، حاول بعد ربع ساعة.',
    code_full: 'هذا الكود وصل الحد الأقصى من الاستخدام.',
    already_redeemed: 'استخدمت هذا الكود من قبل.',
    invalid_frame: 'هذا الإطار مو متاح بهذا الكود، اختر غيره.'
  };

  // استرداد كود (يدوي أو ممنوح أو كود فوز الستريمر لنفسه): كود الاختيار يفتح
  // قائمة الإطارات، والباقي يضيف العنصر مباشرة. done(text, ok) لعرض النتيجة.
  function redeemCode(code, done) {
    return window.AGPAuth.redeemFrameCode(code).then(function (result) {
      if (!(result && result.success)) { done(REDEEM_ERRORS[result && result.error] || 'تعذّر الاسترداد، حاول مرة ثانية.', false); return; }
      if (result.kind === 'choice') {
        done('اختر إطارك من القائمة.', true);
        window.AGPFramePicker.open({
          title: 'اختر إطارك',
          subtitle: 'تختار إطار واحد، وينضاف مباشرة لمقتنياتك.',
          choices: result.choices,
          onPick: function (choice, name) {
            return window.AGPAuth.redeemChoiceCode(result.code, choice.frameType, choice.frameRef).then(function (r) {
              if (r && r.success) {
                done('تم! انضاف إطار "' + name + '" لمقتنياتك.', true);
                setTimeout(function () { window.location.reload(); }, 1300);
                return { ok: true };
              }
              return { ok: false, error: REDEEM_ERRORS[r && r.error] || 'تعذّر الاسترداد، حاول مرة ثانية.' };
            });
          }
        });
        return;
      }
      if (result.kind === 'bundle') {
        var names = function (list) { return (list || []).map(function (i) { return i.displayNameAr; }).filter(Boolean).join('، '); };
        var m = 'تم! انضاف لك باكج "' + ((result.bundle && result.bundle.name) || '') + '": ' + names(result.granted) + '.';
        if (result.alreadyOwned && result.alreadyOwned.length) m += ' (كان عندك من قبل: ' + names(result.alreadyOwned) + ')';
        done(m, true);
        setTimeout(function () { window.location.reload(); }, 2200);
        return;
      }
      var isCard = result.kind === 'elim' || result.kind === 'win';
      var name = ((isCard ? result.card : result.frame) || {}).displayNameAr || '';
      done(isCard ? 'تم! انضافت ' + (name ? '"' + name + '" ' : 'البطاقة ') + 'لمقتنياتك.' : 'تم! انضاف إطار ' + (name ? '"' + name + '" ' : '') + 'لمقتنياتك.', true);
      setTimeout(function () { window.location.reload(); }, 1300);
    }).catch(function () { done('تعذّر الاتصال، حاول مرة ثانية.', false); });
  }

  // أكوادي: الأكواد اللي منحها لي ستريمر + خانة كود يدوي
  function renderCodes(body) {
    var input = h('input', { id: 'pfRedeemCode', type: 'text', class: 'pf-input pf-input-code', placeholder: 'AGP-XXXX-XXXX', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'الكود' });
    var btn = h('button', { type: 'button', class: 'pf-btn pf-btn-primary', text: 'استرداد' });
    var msg = h('div', { class: 'pf-msg', 'aria-live': 'polite' });
    function setMsg(text, ok) { msg.textContent = text; msg.className = 'pf-msg ' + (ok ? 'ok' : 'err'); }
    function go2() {
      var code = input.value.trim();
      if (!code) { setMsg('اكتب الكود أولاً.', false); return; }
      btn.disabled = true; btn.textContent = 'جارٍ...';
      redeemCode(code, function (t, ok) { setMsg(t, ok); btn.disabled = false; btn.textContent = 'استرداد'; });
    }
    btn.addEventListener('click', go2);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go2(); });

    var list = h('div', { class: 'pf-list' }, [h('div', { class: 'pf-skel-row' })]);
    body.appendChild(panel('أكواد وصلتك', null, [list]));
    body.appendChild(panel('عندك كود؟', null, [h('div', { class: 'pf-redeem' }, [input, btn]), msg]));

    function paint(grants) {
      list.innerHTML = '';
      if (!grants.length) { list.appendChild(emptyNote('ما وصلك كود للحين. لما يمنحك ستريمر كود من فريقه يطلع هنا.')); return; }
      grants.forEach(function (g) {
        var rowMsg = h('span', { class: 'pf-row-msg' });
        var action;
        if (g.redeemed) action = pill('تم الاسترداد', 'ok');
        else if (g.burned) action = pill('ملغي');
        else {
          action = h('button', { type: 'button', class: 'pf-btn pf-btn-primary pf-btn-sm', text: 'استرداد' });
          action.addEventListener('click', function () {
            action.disabled = true; action.textContent = 'جارٍ...';
            redeemCode(g.code, function (t, ok) { rowMsg.textContent = ok ? '' : t; action.disabled = false; action.textContent = 'استرداد'; if (!ok) showToast(t, true); });
          });
        }
        list.appendChild(h('div', { class: 'pf-lrow' }, [
          avatarEl(g.from),
          h('div', { class: 'pf-lrow-txt' }, [
            h('div', { class: 'pf-lrow-t', text: 'كود جائزة من ' + (g.from.name || 'ستريمر') }),
            h('div', { class: 'pf-lrow-s', text: formatDate(g.grantedAt) }),
            rowMsg
          ]),
          action
        ]));
      });
    }
    if (S.grants) { paint(S.grants); return; }
    loadGrants().then(function () { if (document.body.contains(list)) paint(S.grants || []); });
  }
  function loadGrants() {
    if (typeof window.AGPAuth.getMyGrants !== 'function') { S.grants = []; return Promise.resolve(); }
    return window.AGPAuth.getMyGrants().then(function (r) { S.grants = (r && r.success && r.grants) || []; }).catch(function () { S.grants = S.grants || []; });
  }
  function pendingGrants() { return (S.grants || []).filter(function (g) { return !g.redeemed && !g.burned; }).length; }

  function metaLine(parts) {
    var el = h('div', { class: 'pf-lrow-s' });
    parts.filter(Boolean).forEach(function (part, i) {
      if (i) el.appendChild(document.createTextNode(' · '));
      el.appendChild(h('bdi', { text: part }));
    });
    return el;
  }

  function avatarEl(u) {
    u = u || {};
    return u.avatar ? h('img', { src: u.avatar, alt: '', class: 'pf-av' }) : h('span', { class: 'pf-av', 'aria-hidden': 'true', text: (u.name || '؟').charAt(0) });
  }

  /* ---------- البث: المستوى + الإحصائيات بقسم واحد */
  function renderBroadcast(body, p) {
    var s = p.stats || {};
    var hours = Math.round(((s.total_live_ms || 0) / 3600000) * 10) / 10;
    if (p.streamerLevel) {
      var SL = streamerLevelInfo(p);
      body.appendChild(panel(null, null, [levelLead({ pct: SL.pct, ringLabel: 'التقدّم لمستوى الستريمر التالي', label: 'نقاط الستريمر', value: num(SL.sp), unit: 'SP', level: levelName(SL.cur), note: SL.note })], 'pf-panel-lead'));
    }
    body.appendChild(panel('أرقام بثوثك', null, [h('div', { class: 'pf-stats6' }, [
      { l: 'البثوث', v: num(s.total_broadcasts) },
      { l: 'ساعات البث', v: String(hours) },
      { l: 'التعليقات', v: num(s.total_comments) },
      { l: 'متابعين جدد', v: num(s.total_follows) },
      { l: 'لاعبون انضموا', v: num(s.total_players) },
      { l: 'قيمة الهدايا', v: num(s.total_gifts_value), n: num(s.total_gifts) + ' هدية' }
    ].map(function (k) { return h('div', { class: 'pf-kpi' }, [h('div', { class: 'pf-kpi-l', text: k.l }), h('div', { class: 'pf-kpi-v num', text: k.v }), k.n ? h('div', { class: 'pf-kpi-n', text: k.n }) : null]); }))]));
  }

  /* ---------- أكواد جوائز الفوز: كل كود صف فيه «استرداد» و«منح» */
  var GAME_NAMES = { 'penalty': 'بلنتي', 'fastest-answer': 'أسرع إجابة' };
  function renderWinCodes(body) {
    var list = h('div', { class: 'pf-list' }, [h('div', { class: 'pf-skel-row' })]);
    body.appendChild(panel('أكوادك', h('a', { href: '#team', class: 'pf-link', 'data-sec': 'team' }, 'فريقك'), [list]));
    body.appendChild(h('details', { class: 'pf-more' }, [
      h('summary', { text: 'كيف تشتغل الأكواد؟' }),
      h('ul', { class: 'pf-steps' }, [
        'كل كود له عدد استخدامات، تشوفه تحت الكود.',
        '«استرداد»: تستخدم الكود لنفسك وتختار إطارك.',
        '«منح»: تختار عضو من فريقك، ويوصله الكود بحسابه يسترده ويختار إطاره.',
        'كل منح ياخذ استخدام واحد من رصيد الكود.'
      ].map(function (t) { return h('li', { text: t }); }))
    ]));

    function paint(codes) {
      list.innerHTML = '';
      if (!codes.length) { list.appendChild(emptyNote('ما عندك أكواد للحين. تطلع هنا لما تفوز بمباراة بين بثين.')); return; }
      codes.forEach(function (c) {
        var full = c.uses >= c.maxUses, off = Boolean(c.burnedAt);
        var left = Math.max(0, c.maxUses - c.uses);
        var actions = h('div', { class: 'pf-lrow-act' });
        if (!off && !c.redeemedBySelf && !full) {
          var rb = h('button', { type: 'button', class: 'pf-btn pf-btn-ghost pf-btn-sm', text: 'استرداد' });
          rb.addEventListener('click', function () {
            rb.disabled = true; rb.textContent = 'جارٍ...';
            redeemCode(c.code, function (t, ok) { rb.disabled = false; rb.textContent = 'استرداد'; if (!ok) showToast(t, true); });
          });
          actions.appendChild(rb);
        }
        if (!off && !full) actions.appendChild(h('button', { type: 'button', class: 'pf-btn pf-btn-primary pf-btn-sm', text: 'منح', onclick: function () { openGrantModal(c); } }));
        var copy = h('button', { type: 'button', class: 'pf-iconbtn', title: 'نسخ الكود', 'aria-label': 'نسخ الكود' }, icon('copy'));
        copy.addEventListener('click', function () { copyText(c.code, function () { showToast('انسخ الكود'); }); });
        actions.appendChild(copy);
        list.appendChild(h('div', { class: 'pf-lrow pf-code-row' + (off || full ? ' dim' : '') }, [
          h('div', { class: 'pf-lrow-txt' }, [
            h('div', { class: 'pf-code-v', text: c.code }),
            h('div', { class: 'pf-lrow-s', text: (GAME_NAMES[c.game] || c.game) + (c.teamName ? ' · ' + c.teamName : '') + ' · ' + new Date(c.createdAt).toLocaleDateString('ar-u-ca-gregory', { day: 'numeric', month: 'long' }) }),
            h('div', { class: 'pf-uses' }, [
              h('span', { class: 'pf-uses-bar' }, h('span', { style: 'width:' + Math.round(100 * Math.min(1, c.uses / Math.max(1, c.maxUses))) + '%' })),
              h('span', { class: 'pf-uses-t num', text: off ? 'موقوف' : full ? 'اكتمل' : 'باقي ' + left + ' من ' + c.maxUses }),
              (c.grants && c.grants.length) ? h('span', { class: 'pf-uses-t', text: '· ممنوح لـ ' + c.grants.length }) : null
            ])
          ]),
          actions
        ]));
      });
    }
    if (S.winCodes) { paint(S.winCodes); return; }
    window.AGPAuth.getWinRewardCodes().then(function (res) {
      S.winCodes = (res && res.success && res.codes) || [];
      if (document.body.contains(list)) paint(S.winCodes);
    }).catch(function () {
      list.innerHTML = '';
      list.appendChild(h('div', { class: 'pf-empty' }, ['تعذّر تحميل الأكواد. ', h('button', { type: 'button', class: 'pf-textbtn', onclick: function () { go('win-codes', { noHash: true }); } }, 'إعادة المحاولة')]));
    });
  }

  // نافذة «منح»: أعضاء الفريق مع بحث سريع، وكل عضو زر منح
  function openGrantModal(c) {
    var granted = {};
    (c.grants || []).forEach(function (g) { granted[g.customId] = g; });
    var sheet = openSheet('منح الكود', 'اختر عضو من فريقك. يوصله الكود بحسابه ويختار إطاره بنفسه.');
    var filter = h('input', { type: 'search', class: 'pf-input pf-input-sm', placeholder: 'ابحث بالاسم أو اليوزر', 'aria-label': 'ابحث بفريقك' });
    var list = h('div', { class: 'pf-list pf-list-scroll' }, [h('div', { class: 'pf-skel-row' })]);
    var left = h('div', { class: 'pf-sheet-note num', text: 'باقي ' + Math.max(0, c.maxUses - c.uses) + ' استخدام' });
    sheet.body.appendChild(filter);
    sheet.body.appendChild(list);
    sheet.body.appendChild(left);
    loadTeam().then(function () {
      var members = (S.team && S.team.members) || [];
      function paint() {
        var q = filter.value.trim().replace(/^@/, '').toLowerCase();
        list.innerHTML = '';
        if (!members.length) {
          list.appendChild(h('div', { class: 'pf-empty' }, ['فريقك فاضي. ', h('a', { href: '#team', class: 'pf-link', 'data-sec': 'team', onclick: function () { sheet.close(); } }, 'شوف كيف يدخلون فريقك')]));
          return;
        }
        var shown = members.filter(function (m) { return !q || (m.name || '').toLowerCase().indexOf(q) > -1 || (m.tiktok || '').toLowerCase().indexOf(q) > -1 || String(m.customId).indexOf(q) > -1; });
        if (!shown.length) { list.appendChild(emptyNote('ما فيه عضو بهالاسم.')); return; }
        shown.forEach(function (m) {
          var g = granted[m.customId];
          var act;
          if (g) act = pill(g.redeemed ? 'استرده' : 'ممنوح', 'ok');
          else {
            act = h('button', { type: 'button', class: 'pf-btn pf-btn-primary pf-btn-sm', text: 'منح' });
            act.addEventListener('click', function () {
              act.disabled = true; act.textContent = 'جارٍ...';
              window.AGPAuth.grantWinCode(c.code, m.customId).then(function (r) {
                if (r && r.success) {
                  granted[m.customId] = { customId: m.customId, redeemed: false };
                  c.uses += 1; c.grants = (c.grants || []).concat([{ customId: m.customId, name: m.name, redeemed: false }]);
                  left.textContent = 'باقي ' + Math.max(0, c.maxUses - c.uses) + ' استخدام';
                  showToast('انمنح الكود لـ ' + m.name);
                  if (c.uses >= c.maxUses) { sheet.close(); }
                  paint();
                } else {
                  act.disabled = false; act.textContent = 'منح';
                  showToast(GRANT_ERRORS[r && r.error] || 'تعذّر المنح، حاول مرة ثانية.', true);
                }
              }).catch(function () { act.disabled = false; act.textContent = 'منح'; });
            });
          }
          list.appendChild(h('div', { class: 'pf-lrow' }, [
            avatarEl(m),
            h('div', { class: 'pf-lrow-txt' }, [h('div', { class: 'pf-lrow-t', text: m.name }), metaLine([m.tiktok ? '@' + m.tiktok : '#' + m.customId])]),
            act
          ]));
        });
      }
      filter.addEventListener('input', paint);
      paint();
    });
    sheet.onClose = function () { go('win-codes', { noHash: true }); };
  }
  var GRANT_ERRORS = {
    not_team_member: 'هذا الشخص مو بفريقك.',
    code_full: 'الكود خلص رصيده.',
    already_granted: 'منحته هذا الكود من قبل.',
    already_redeemed: 'هذا الشخص استخدم الكود من قبل.',
    code_burned: 'الكود موقوف.',
    not_your_code: 'هذا الكود مو لك.'
  };

  // نافذة صغيرة عامة (نفس شكل نافذة التعديل)
  function openSheet(title, sub) {
    var ov = h('div', { class: 'agp-ed-overlay' });
    var bodyEl = h('div', { class: 'pf-sheet-body' });
    var api = { body: bodyEl, onClose: null, close: close };
    var sheet = h('div', { class: 'agp-ed-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { class: 'agp-ed-head' }, [h('span', { class: 'agp-ed-title', text: title }), h('button', { type: 'button', class: 'agp-ed-x', 'aria-label': 'إغلاق', text: '×', onclick: close })]),
      sub ? h('p', { class: 'pf-sheet-sub', text: sub }) : null,
      bodyEl
    ]);
    ov.appendChild(sheet);
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      document.removeEventListener('keydown', onKey);
      ov.classList.remove('open'); document.body.style.overflow = '';
      setTimeout(function () { ov.remove(); }, 200);
      if (api.onClose) api.onClose();
    }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { ov.classList.add('open'); });
    return api;
  }

  /* ---------- فريقك (للستريمر) */
  function loadTeam() {
    if (S.team) return Promise.resolve(S.team);
    if (typeof window.AGPAuth.teamMine !== 'function') { S.team = { members: [], teams: [] }; return Promise.resolve(S.team); }
    return window.AGPAuth.teamMine().then(function (r) { S.team = (r && r.success) ? r : { members: [], teams: [] }; return S.team; })
      .catch(function () { S.team = { members: [], teams: [] }; return S.team; });
  }
  function renderTeam(body, p) {
    var count = h('span', { class: 'pf-panel-sub num' });
    var filter = h('input', { type: 'search', class: 'pf-input pf-input-sm', placeholder: 'ابحث بفريقك', 'aria-label': 'ابحث بفريقك', hidden: true });
    var list = h('div', { class: 'pf-list' }, [h('div', { class: 'pf-skel-row' })]);
    var idBtn = h('button', { type: 'button', class: 'pf-chipbtn num', title: 'نسخ الـID' }, ['#' + p.custom_id, icon('copy')]);
    idBtn.addEventListener('click', function () { copyText(String(p.custom_id), function () { showToast('انسخ الـID'); }); });
    body.appendChild(h('div', { class: 'pf-invite' }, [
      h('span', { text: 'متابعينك يدخلون فريقك من «ابحث عن ستريمر» بالـID ' }), idBtn,
      p.tiktok_username ? h('span', { text: ' أو @' + p.tiktok_username }) : null
    ]));
    body.appendChild(panel('أعضاء فريقك', count, [filter, list]));
    loadTeam().then(function (t) {
      var members = t.members || [];
      count.textContent = plural(members.length, 'عضو', 'عضو');
      filter.hidden = members.length < 7;
      function paint() {
        var q = filter.value.trim().replace(/^@/, '').toLowerCase();
        list.innerHTML = '';
        if (!members.length) { list.appendChild(emptyNote('فريقك فاضي للحين. شارك الـID مع متابعينك.')); return; }
        members.filter(function (m) { return !q || (m.name || '').toLowerCase().indexOf(q) > -1 || (m.tiktok || '').toLowerCase().indexOf(q) > -1; }).forEach(function (m) {
          var rm = h('button', { type: 'button', class: 'pf-iconbtn danger', title: 'شيل من الفريق', 'aria-label': 'شيل ' + m.name + ' من الفريق', text: '×' });
          rm.addEventListener('click', function () {
            if (!window.confirm('تشيل ' + m.name + ' من فريقك؟')) return;
            rm.disabled = true;
            window.AGPAuth.teamRemove(m.customId).then(function (r) {
              if (r && r.success) { members = members.filter(function (x) { return x.customId !== m.customId; }); count.textContent = plural(members.length, 'عضو', 'عضو'); paint(); }
              else rm.disabled = false;
            }).catch(function () { rm.disabled = false; });
          });
          list.appendChild(h('div', { class: 'pf-lrow' }, [
            avatarEl(m),
            h('div', { class: 'pf-lrow-txt' }, [h('div', { class: 'pf-lrow-t', text: m.name }), metaLine([m.tiktok ? '@' + m.tiktok : null, 'انضم ' + formatDate(m.joinedAt)])]),
            rm
          ]));
        });
      }
      filter.addEventListener('input', paint);
      paint();
    });
  }

  /* ---------- ابحث عن ستريمر (للكل) + فرقي */
  function renderTeams(body) {
    var input = h('input', { id: 'pfTeamSearch', type: 'search', class: 'pf-input', placeholder: 'الـID أو يوزر تيك توك', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'ابحث عن ستريمر' });
    var results = h('div', { class: 'pf-list' });
    var mineList = h('div', { class: 'pf-list' }, [h('div', { class: 'pf-skel-row' })]);
    body.appendChild(panel(null, null, [h('div', { class: 'pf-searchbox' }, [icon('search'), input]), results]));
    body.appendChild(panel('فرقي', null, [mineList]));

    function joinBtn(st, onDone) {
      var joined = st.joined;
      var b = h('button', { type: 'button', class: 'pf-btn pf-btn-sm ' + (joined ? 'pf-btn-ghost' : 'pf-btn-primary'), text: joined ? 'اطلع' : 'انضم' });
      b.addEventListener('click', function () {
        b.disabled = true;
        var fn = joined ? window.AGPAuth.teamLeave : window.AGPAuth.teamJoin;
        fn(st.customId).then(function (r) {
          b.disabled = false;
          if (r && r.success) {
            joined = !joined; st.joined = joined;
            b.textContent = joined ? 'اطلع' : 'انضم';
            b.className = 'pf-btn pf-btn-sm ' + (joined ? 'pf-btn-ghost' : 'pf-btn-primary');
            showToast(joined ? 'انضميت لفريق ' + st.name : 'طلعت من فريق ' + st.name);
            S.team = null; if (onDone) onDone();
          } else showToast('تعذّر التنفيذ، حاول مرة ثانية.', true);
        }).catch(function () { b.disabled = false; });
      });
      return b;
    }
    function stRow(st, onDone) {
      return h('div', { class: 'pf-lrow' }, [
        avatarEl(st),
        h('div', { class: 'pf-lrow-txt' }, [
          h('div', { class: 'pf-lrow-t', text: st.name }),
          metaLine([st.tiktok ? '@' + st.tiktok : null, '#' + st.customId, st.members != null ? plural(st.members, 'عضو', 'عضو') : null])
        ]),
        st.self ? pill('أنت') : joinBtn(st, onDone)
      ]);
    }
    function paintMine() {
      loadTeam().then(function (t) {
        mineList.innerHTML = '';
        var teams = t.teams || [];
        if (!teams.length) { mineList.appendChild(emptyNote('ما انضميت لأي فريق. ابحث عن الستريمر اللي تتابعه وانضم لفريقه.')); return; }
        teams.forEach(function (st) { st.joined = true; mineList.appendChild(stRow(st, paintMine)); });
      });
    }
    var timer = null, seq = 0;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.replace(/^[@#]/, '').length < 2) { results.innerHTML = ''; return; }
      timer = setTimeout(function () {
        var my = ++seq;
        window.AGPAuth.teamSearch(q).then(function (r) {
          if (my !== seq) return;
          results.innerHTML = '';
          var list = (r && r.success && r.results) || [];
          if (!list.length) { results.appendChild(emptyNote('ما لقينا ستريمر بهذا الـID أو اليوزر.')); return; }
          list.forEach(function (st) { results.appendChild(stRow(st, paintMine)); });
        }).catch(function () {});
      }, 300);
    });
    paintMine();
  }

  /* ---------- التحكم عن بعد: بثّي + البثوث اللي أتحكم فيها بقسم واحد */
  function renderRemote(body, p) {
    var RC = window.AymanGamesPlatform && window.AymanGamesPlatform.remoteControl;
    if (isStreamerAccount(p) && RC) {
      var state = h('span', { class: 'pf-pill' });
      var btn = h('button', { type: 'button', class: 'pf-btn pf-btn-primary pf-btn-sm', 'data-rc-btn': '1', onclick: function () { RC.openPanel(); } });
      var paint = function () {
        var on = RC.isEnabled();
        state.textContent = on ? 'مفعّل' : 'متوقف';
        state.className = 'pf-pill' + (on ? ' ok' : '');
        btn.textContent = on ? 'إدارة' : 'تفعيل';
      };
      paint();
      if (RC.loadConfig) RC.loadConfig().then(paint, paint);
      paintRemote = paint;
      body.appendChild(panel('بثّي', state, [
        h('div', { class: 'pf-lrow pf-lrow-plain' }, [
          h('div', { class: 'pf-lrow-txt' }, [h('div', { class: 'pf-lrow-s', text: 'تضيف يوزر تيك توك لأشخاص يشغّلون ألعابك من جوالهم أو بأوامر الشات.' })]),
          btn
        ])
      ]));
    }
    if (S.remoteAccess.length) {
      body.appendChild(panel('بثوث تتحكم فيها', null, [h('div', { class: 'pf-list' }, S.remoteAccess.map(function (st) {
        return h('div', { class: 'pf-lrow' }, [
          avatarEl(st),
          h('div', { class: 'pf-lrow-txt' }, [h('div', { class: 'pf-lrow-t', text: st.name || 'ستريمر' })]),
          h('a', { href: 'control.html?s=' + encodeURIComponent(st.id), class: 'pf-btn pf-btn-primary pf-btn-sm' }, 'افتح')
        ]);
      }))]));
    }
  }
  var paintRemote = null;
  window.addEventListener('agp:remote-control-changed', function () { if (paintRemote && document.querySelector('[data-rc-btn]')) paintRemote(); });

  function renderSoon(body) {
    body.appendChild(panel(null, null, [h('div', { class: 'pf-kvs' }, [
      ['شاشات البث', 'أليرتات وتوب وأهداف لـOBS وLIVE Studio'],
      ['صورة ستوري لآخر بث', 'الداعمين والمتفاعلين بصورة وحدة'],
      ['تحليلات الجمهور', 'مين يتفاعل معك أكثر، ومتى'],
      ['البث القادم', 'تعلن عن بثك الجاي لفريقك'],
      ['إنجازات الستريمر', 'شارات تنفتح مع نشاطك']
    ].map(function (c) {
      return h('div', { class: 'pf-kv pf-kv-2' }, [
        h('div', null, [h('div', { class: 'pf-kv-title', text: c[0] }), h('div', { class: 'pf-kv-k', text: c[1] })]),
        pill('قريباً')
      ]);
    }))]));
  }

  function renderSupport(body) {
    body.appendChild(panel(null, null, [h('div', { class: 'pf-lrow pf-lrow-plain' }, [
      h('div', { class: 'pf-lrow-txt' }, [
        h('div', { class: 'pf-lrow-t', text: 'تذاكر الدعم' }),
        h('div', { class: 'pf-lrow-s', text: S.unread > 0 ? ('عندك ' + plural(S.unread, 'رد جديد', 'ردود جديدة') + ' من فريق الدعم.') : 'تابع تذاكرك أو افتح تذكرة جديدة.' })
      ]),
      h('a', { href: 'support-tickets.html?tab=list', class: 'pf-btn pf-btn-primary pf-btn-sm' }, 'فتح')
    ])]));
  }

  /* ===================================================== تعديل الملف */
  // نافذة واحدة لتغيير الصورة والاسم واسم المستخدم — نفس المنطق السابق:
  // قص مربع وضغط تحت حد الخادم (~85KB)، الاسم ≤ 40، اسم المستخدم 3–30
  // حرف/رقم/_/. ومرة كل 7 أيام (auth-service.updateUsername).
  var EDIT_NAME_MAX = 40;
  var EDIT_USER_MIN = 3, EDIT_USER_MAX = 30;
  var EDIT_USER_RE = /^[\p{L}\p{N}_.]+$/u;
  var AVATAR_MAX_LEN = 80 * 1024;
  var editState = { pendingAvatar: null, busy: false };

  function editErrorText(code) {
    var map = {
      empty_display_name: 'الاسم ما يصير يكون فاضي.',
      display_name_too_long: 'الاسم أطول من ' + EDIT_NAME_MAX + ' حرف.',
      image_too_large: 'الصورة كبيرة جداً، جرّب صورة ثانية.',
      invalid_image_format: 'نوع الصورة غير مدعوم (PNG أو JPG أو WEBP).',
      empty_image: 'اختر صورة أولاً.',
      username_too_short: 'اسم المستخدم لازم ' + EDIT_USER_MIN + ' خانات على الأقل.',
      username_too_long: 'اسم المستخدم أطول من ' + EDIT_USER_MAX + ' خانة.',
      username_invalid_chars: 'اسم المستخدم: حروف وأرقام و _ و . فقط، بدون مسافات أو @.',
      username_taken: 'اسم المستخدم هذا مأخوذ، جرّب اسم ثاني.'
    };
    if (code && code.error === 'username_change_cooldown') return cooldownText(code.nextChangeAt);
    return map[code] || 'حصل خطأ، جرّب مرة ثانية.';
  }
  function cooldownText(nextAt) {
    var ms = (Number(nextAt) || 0) - Date.now();
    if (ms <= 0) return 'تقدر تغيّر اسم المستخدم الحين.';
    var days = Math.floor(ms / 86400000), hours = Math.ceil((ms % 86400000) / 3600000);
    if (hours === 24) { days += 1; hours = 0; }
    var parts = [];
    if (days) parts.push(days === 1 ? 'يوم' : days === 2 ? 'يومين' : days + ' أيام');
    if (hours) parts.push(hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتين' : hours + ' ساعات');
    return 'تقدر تغيّر اسم المستخدم مرة كل 7 أيام، باقي ' + (parts.join(' و ') || 'أقل من ساعة') + '.';
  }

  function processAvatarFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.type)) { reject('invalid_image_format'); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject('invalid_image_format'); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject('invalid_image_format'); };
        img.onload = function () {
          var side = Math.min(img.width, img.height);
          var sx = (img.width - side) / 2, sy = (img.height - side) / 2;
          var sizes = [320, 256, 200, 160];
          for (var si = 0; si < sizes.length; si++) {
            var out = Math.min(sizes[si], side);
            var canvas = document.createElement('canvas');
            canvas.width = out; canvas.height = out;
            var ctx = canvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
            for (var q = 0.9; q >= 0.5; q -= 0.1) {
              var url = canvas.toDataURL('image/jpeg', q);
              if (url.length <= AVATAR_MAX_LEN) { resolve(url); return; }
            }
          }
          reject('image_too_large');
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function closeEditModal() {
    var ov = document.querySelector('.agp-ed-overlay');
    if (!ov || editState.busy) return;
    ov.classList.remove('open');
    document.removeEventListener('keydown', editKeyHandler);
    setTimeout(function () { ov.remove(); }, 200);
    document.body.style.overflow = '';
  }
  function editKeyHandler(e) { if (e.key === 'Escape') closeEditModal(); }

  function openEditModal(focus) {
    var p = S.p;
    if (!p || !S.owner || document.querySelector('.agp-ed-overlay')) return;
    editState.pendingAvatar = null;
    var currentName = p.display_name || p.username || '';
    var currentAvatar = p.avatar_image_base64 || '';
    var currentUser = p.username || '';

    var ov = document.createElement('div');
    ov.className = 'agp-ed-overlay';
    ov.innerHTML =
      '<div class="agp-ed-sheet" role="dialog" aria-modal="true" aria-label="تعديل الملف">' +
        '<div class="agp-ed-head"><span class="agp-ed-title">تعديل الملف</span><button type="button" class="agp-ed-x" aria-label="إغلاق">×</button></div>' +
        '<div class="agp-ed-photo">' +
          '<div class="agp-ed-avatar" title="اضغط أو اسحب صورة هنا"><div class="agp-ed-avatar-in"></div></div>' +
          '<div class="agp-ed-photo-btns"><button type="button" class="agp-ed-btn" data-pick>تغيير الصورة</button><button type="button" class="agp-ed-btn ghost" data-undo style="display:none">تراجع عن الصورة</button></div>' +
          '<div class="agp-ed-hint">PNG أو JPG أو WEBP، نقصّها ونضغطها تلقائياً</div>' +
        '</div>' +
        '<div class="agp-ed-field">' +
          '<label class="agp-ed-label" for="agp-ed-name"><span>اسم العرض</span><span class="agp-ed-count"></span></label>' +
          '<input id="agp-ed-name" class="agp-ed-input" type="text" autocomplete="off" maxlength="' + (EDIT_NAME_MAX + 20) + '">' +
        '</div>' +
        '<div class="agp-ed-field">' +
          '<label class="agp-ed-label" for="agp-ed-user"><span>اسم المستخدم (للدخول)</span><span class="agp-ed-count" data-user-count></span></label>' +
          '<input id="agp-ed-user" class="agp-ed-input" type="text" dir="ltr" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="' + (EDIT_USER_MAX + 10) + '">' +
          '<div class="agp-ed-hint" style="margin-top:6px;text-align:start">حروف وأرقام و _ و . فقط · مرة كل 7 أيام · تسجّل دخولك فيه بعد التغيير</div>' +
        '</div>' +
        '<div class="agp-ed-msg" aria-live="polite"></div>' +
        '<div class="agp-ed-actions"><button type="button" class="agp-ed-btn primary" data-save>حفظ التغييرات</button><button type="button" class="agp-ed-btn ghost" data-cancel>إلغاء</button></div>' +
        '<input type="file" accept="image/png,image/jpeg,image/webp" style="display:none" data-file>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';

    var sheet = ov.querySelector('.agp-ed-sheet');
    var avatarWrap = ov.querySelector('.agp-ed-avatar');
    var avatarIn = ov.querySelector('.agp-ed-avatar-in');
    var fileInput = ov.querySelector('[data-file]');
    var undoBtn = ov.querySelector('[data-undo]');
    var nameInput = ov.querySelector('#agp-ed-name');
    var countEl = ov.querySelector('.agp-ed-count');
    var userInput = ov.querySelector('#agp-ed-user');
    var userCountEl = ov.querySelector('[data-user-count]');
    var msgEl = ov.querySelector('.agp-ed-msg');
    var saveBtn = ov.querySelector('[data-save]');

    function renderPreview(src) {
      avatarIn.innerHTML = '';
      if (src) { var im = document.createElement('img'); im.src = src; im.alt = ''; avatarIn.appendChild(im); }
    }
    function setMsg(text, kind) { msgEl.textContent = text || ''; msgEl.className = 'agp-ed-msg' + (kind ? ' ' + kind : ''); }
    function refresh() {
      var len = nameInput.value.trim().length;
      countEl.textContent = len + ' / ' + EDIT_NAME_MAX;
      countEl.classList.toggle('over', len > EDIT_NAME_MAX);
      var nameChanged = nameInput.value.trim() !== currentName;
      var valid = len > 0 && len <= EDIT_NAME_MAX;
      var u = userInput.value.trim().replace(/^@+/, '');
      userCountEl.textContent = u.length + ' / ' + EDIT_USER_MAX;
      var userChanged = u !== currentUser;
      var userValid = u.length >= EDIT_USER_MIN && u.length <= EDIT_USER_MAX && EDIT_USER_RE.test(u);
      userCountEl.classList.toggle('over', userChanged && !userValid);
      saveBtn.disabled = editState.busy || !(editState.pendingAvatar || (nameChanged && valid) || (userChanged && userValid)) || (nameChanged && !valid) || (userChanged && !userValid);
    }
    function handleFile(file) {
      if (!file) return;
      setMsg('جارٍ تجهيز الصورة...');
      processAvatarFile(file).then(function (url) {
        editState.pendingAvatar = url;
        renderPreview(url);
        undoBtn.style.display = '';
        setMsg('');
        refresh();
      }).catch(function (code) { setMsg(editErrorText(code), 'err'); });
    }

    renderPreview(currentAvatar);
    nameInput.value = currentName;
    userInput.value = currentUser;
    refresh();

    avatarWrap.addEventListener('click', function () { fileInput.click(); });
    ov.querySelector('[data-pick]').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { handleFile(fileInput.files && fileInput.files[0]); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { avatarWrap.addEventListener(ev, function (e) { e.preventDefault(); avatarWrap.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { avatarWrap.addEventListener(ev, function (e) { e.preventDefault(); avatarWrap.classList.remove('drag'); }); });
    avatarWrap.addEventListener('drop', function (e) { handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
    undoBtn.addEventListener('click', function () { editState.pendingAvatar = null; renderPreview(currentAvatar); undoBtn.style.display = 'none'; refresh(); });
    nameInput.addEventListener('input', function () { setMsg(''); refresh(); });
    nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !saveBtn.disabled) saveBtn.click(); });
    userInput.addEventListener('input', function () { setMsg(''); refresh(); });
    userInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !saveBtn.disabled) saveBtn.click(); });
    ov.querySelector('.agp-ed-x').addEventListener('click', closeEditModal);
    ov.querySelector('[data-cancel]').addEventListener('click', closeEditModal);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeEditModal(); });
    sheet.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('keydown', editKeyHandler);

    saveBtn.addEventListener('click', function () {
      var newName = nameInput.value.trim();
      var nameChanged = newName !== currentName;
      var newUser = userInput.value.trim().replace(/^@+/, '');
      var userChanged = newUser !== currentUser;
      var avatar = editState.pendingAvatar;
      editState.busy = true;
      saveBtn.textContent = 'جارٍ الحفظ...';
      refresh();
      setMsg('');
      var chain = Promise.resolve();
      if (avatar) chain = chain.then(function () {
        return window.AGPAuth.updateAvatarImage(avatar).then(function (r) {
          if (!(r && r.success)) throw (r && r.error) || 'unknown';
          p.avatar_image_base64 = avatar;
          currentAvatar = avatar;
          editState.pendingAvatar = null;
          undoBtn.style.display = 'none';
        });
      });
      if (nameChanged) chain = chain.then(function () {
        return window.AGPAuth.updateDisplayName(newName).then(function (r) {
          if (!(r && r.success)) throw (r && r.error) || 'unknown';
          p.display_name = r.displayName || newName;
          currentName = p.display_name;
        });
      });
      if (userChanged) chain = chain.then(function () {
        return window.AGPAuth.updateUsername(newUser).then(function (r) {
          if (r && r.error === 'username_change_cooldown') throw r;
          if (!(r && r.success)) throw (r && r.error) || 'unknown';
          p.username = r.username || newUser;
          currentUser = p.username;
        });
      });
      chain.then(function () {
        editState.busy = false;
        closeEditModal();
        renderHero();
        go(S.section, { noHash: true });
        showToast('تم حفظ التعديلات');
      }).catch(function (code) {
        editState.busy = false;
        saveBtn.textContent = 'حفظ التغييرات';
        setMsg(editErrorText(code), 'err');
        refresh();
        // اللي انحفظ قبل الخطأ يبان بالصفحة
        renderHero();
      });
    });

    requestAnimationFrame(function () { ov.classList.add('open'); });
    if (focus === 'name') setTimeout(function () { nameInput.focus(); nameInput.select(); }, 120);
    if (focus === 'photo') setTimeout(function () { fileInput.click(); }, 60);
  }

  /* ===================================================== تأكيد الإيميل */
  // رمز 6 أرقام (AGPAuth.sendEmailVerification / verifyEmail). الإيميل
  // المؤكد هو اللي توصله رسائل «نسيت كلمة المرور/الحساب».
  function emailErrorText(r) {
    var err = r && r.error;
    var map = {
      invalid_email: 'تأكد من البريد الإلكتروني.',
      email_taken: 'هذا الإيميل مستخدم بحساب ثاني.',
      already_verified: 'إيميلك مؤكد من قبل.',
      invalid_or_expired_code: 'الرمز غلط أو انتهت صلاحيته.',
      email_send_failed: 'تعذّر إرسال الإيميل، حاول بعد شوي.'
    };
    if (err === 'code_resend_wait') return 'انتظر ' + ((r && r.retryAfter) || 60) + ' ثانية قبل ما تطلب رمز جديد.';
    return map[err] || 'حصل خطأ، جرّب مرة ثانية.';
  }

  function openEmailVerifyModal(currentEmail, onDone) {
    if (document.querySelector('.agp-ed-overlay')) return;
    var ov = document.createElement('div');
    ov.className = 'agp-ed-overlay';
    ov.innerHTML =
      '<div class="agp-ed-sheet" role="dialog" aria-modal="true" aria-label="تأكيد الإيميل">' +
        '<div class="agp-ed-head"><span class="agp-ed-title">تأكيد البريد الإلكتروني</span><button type="button" class="agp-ed-x" aria-label="إغلاق">×</button></div>' +
        '<div class="agp-ed-hint" style="text-align:start;line-height:1.8;margin-top:6px" data-sub></div>' +
        '<div class="agp-ed-field" data-email-f><label class="agp-ed-label" for="agp-ev-email"><span>البريد الإلكتروني</span></label>' +
          '<input id="agp-ev-email" class="agp-ed-input" type="email" dir="ltr" autocomplete="email"></div>' +
        '<div class="agp-ed-field" data-code-f style="display:none"><label class="agp-ed-label" for="agp-ev-code"><span>الرمز اللي وصلك بالإيميل</span></label>' +
          '<input id="agp-ev-code" class="agp-ed-input" type="text" dir="ltr" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456"></div>' +
        '<div class="agp-ed-msg" aria-live="polite"></div>' +
        '<div class="agp-ed-actions"><button type="button" class="agp-ed-btn primary" data-go></button><button type="button" class="agp-ed-btn ghost" data-back style="display:none">تغيير الإيميل</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    var sub = ov.querySelector('[data-sub]'), emailF = ov.querySelector('[data-email-f]'), codeF = ov.querySelector('[data-code-f]');
    var emailIn = ov.querySelector('#agp-ev-email'), codeIn = ov.querySelector('#agp-ev-code');
    var msg = ov.querySelector('.agp-ed-msg'), goBtn = ov.querySelector('[data-go]'), back = ov.querySelector('[data-back]');
    var busy = false, step = 1, sentTo = '';
    function setMsg(t, kind) { msg.textContent = t || ''; msg.className = 'agp-ed-msg' + (kind ? ' ' + kind : ''); }
    function show(n) {
      step = n;
      emailF.style.display = n === 1 ? '' : 'none';
      codeF.style.display = n === 2 ? '' : 'none';
      back.style.display = n === 2 ? '' : 'none';
      goBtn.textContent = n === 1 ? 'أرسل رمز التأكيد' : 'تأكيد';
      sub.textContent = n === 1
        ? 'تأكد إن هذا إيميلك الصحيح (تقدر تغيّره)، ونرسل له رمز من 6 أرقام. بعد التأكيد تقدر تستعيد حسابك عليه لو نسيت بياناته.'
        : 'أرسلنا الرمز إلى ' + sentTo + '، صالح 15 دقيقة. (لو ما لقيته شوف مجلد الرسائل المزعجة)';
      (n === 1 ? emailIn : codeIn).focus();
    }
    function close() { if (busy) return; document.removeEventListener('keydown', onKey); ov.classList.remove('open'); setTimeout(function () { ov.remove(); }, 200); document.body.style.overflow = ''; }
    function onKey(e) { if (e.key === 'Escape') close(); else if (e.key === 'Enter') goBtn.click(); }
    document.addEventListener('keydown', onKey);
    ov.querySelector('.agp-ed-x').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    back.addEventListener('click', function () { setMsg(''); codeIn.value = ''; show(1); });
    goBtn.addEventListener('click', function () {
      if (busy) return;
      var pr;
      if (step === 1) {
        var em = emailIn.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setMsg('تأكد من البريد الإلكتروني.', 'err'); return; }
        busy = true; goBtn.disabled = true; setMsg('جارٍ الإرسال...');
        pr = window.AGPAuth.sendEmailVerification(em).then(function (r) {
          if (r && r.success) { sentTo = r.email || em; setMsg(''); show(2); }
          else setMsg(emailErrorText(r), 'err');
        });
      } else {
        var code = codeIn.value.replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); }).replace(/\D/g, '');
        if (code.length !== 6) { setMsg('الرمز 6 أرقام.', 'err'); return; }
        busy = true; goBtn.disabled = true; setMsg('جارٍ التأكيد...');
        pr = window.AGPAuth.verifyEmail(code).then(function (r) {
          if (r && r.success) { busy = false; close(); showToast('تم تأكيد إيميلك'); if (onDone) onDone(r.email); }
          else setMsg(emailErrorText(r), 'err');
        });
      }
      pr.catch(function () { setMsg('تعذّر الوصول للخادم.', 'err'); }).then(function () { busy = false; goBtn.disabled = false; });
    });
    emailIn.value = currentEmail || '';
    show(1);
    requestAnimationFrame(function () { ov.classList.add('open'); });
  }

  /* ===================================================== رجوع ربط تيك توك */

  function handleTikTokReturn() {
    var res = new URLSearchParams(window.location.search).get('tiktok_link');
    if (!res) return;
    var msgMap = {
      success: 'تم ربط حساب تيك توك بنجاح.',
      cancelled: 'ألغيت عملية الربط.',
      invalid_state: 'انتهت صلاحية محاولة الربط، جرّب مرة ثانية.',
      missing_code: 'حصل خطأ أثناء الربط، جرّب مرة ثانية.',
      token_exchange_failed: 'تعذّر إكمال الربط مع تيك توك، جرّب مرة ثانية.',
      user_info_failed: 'تعذّر جلب بيانات حسابك من تيك توك، جرّب مرة ثانية.',
      already_linked: 'حساب التيك توك هذا مرتبط بحساب AGP ثاني بالفعل.',
      link_failed: 'تعذّر حفظ الربط، جرّب مرة ثانية.'
    };
    var ok = res === 'success';
    showToast(msgMap[res] || 'حصل خطأ غير متوقع.', !ok);
    history.replaceState({}, '', window.location.pathname + '#tiktok');
    if (ok) setTimeout(function () { window.location.reload(); }, 900);
  }

  /* ===================================================== التشغيل */

  function showState(kind) {
    var c = $('#pfContent');
    document.body.classList.add('pf-state');
    $('#pfSideNav').innerHTML = '';
    c.innerHTML = '';
    if (kind === 'login') {
      $('#pfName').textContent = 'سجّل دخولك';
      c.appendChild(h('div', { class: 'pf-lock' }, [
        icon('user', 'pf-lock-ic'),
        h('div', { class: 'pf-lock-t', text: 'سجّل دخولك عشان تشوف بروفايلك' }),
        h('div', { class: 'pf-lock-d', text: 'بروفايلك فيه نقاطك ومقتنياتك وأدوات البث.' }),
        h('a', { href: 'login.html', class: 'pf-btn pf-btn-primary' }, 'تسجيل الدخول')
      ]));
    } else {
      $('#pfName').textContent = 'تعذّر تحميل البروفايل';
      c.appendChild(h('div', { class: 'pf-lock' }, [
        icon('clock', 'pf-lock-ic'),
        h('div', { class: 'pf-lock-t', text: kind === 'missing' ? 'البروفايل غير موجود' : 'تعذّر تحميل البروفايل' }),
        h('div', { class: 'pf-lock-d', text: kind === 'missing' ? 'تأكد من الرابط أو الـID.' : 'تأكد من اتصالك وحاول مرة ثانية.' }),
        h('button', { type: 'button', class: 'pf-btn pf-btn-ghost', onclick: function () { location.reload(); } }, 'إعادة المحاولة')
      ]));
    }
  }

  function showRestricted() {
    document.body.classList.add('pf-state');
    $('#pfSideNav').innerHTML = '';
    $('#pfHeroActions').innerHTML = '';
    var chips = $('#pfChips');
    chips.innerHTML = '';
    if (S.p.custom_id) chips.appendChild(h('span', { class: 'pf-chip', text: 'ID #' + S.p.custom_id }));
    var c = $('#pfContent');
    c.innerHTML = '';
    c.appendChild(h('div', { class: 'pf-lock' }, [
      icon('lock', 'pf-lock-ic'),
      h('div', { class: 'pf-lock-t', text: 'تفاصيل البروفايل خاصة بصاحبه' }),
      h('div', { class: 'pf-lock-d', text: 'النقاط والمقتنيات والإحصائيات تطلع لصاحب الحساب بس.' })
    ]));
  }

  function start(p) {
    var me = cachedUser();
    S.p = p;
    S.owner = Boolean(me && me.custom_id && me.custom_id === p.custom_id);
    window.__profileData = p;
    window.__profileIsOwner = S.owner;
    document.body.classList.remove('pf-state', 'pf-loading');
    document.body.classList.toggle('pf-visitor', !S.owner);

    var hash = (location.hash || '').replace('#', '');
    var saved = store('agp_profile_mode');
    S.mode = saved === 'player' || saved === 'streamer' ? saved : (isStreamerAccount(p) ? 'streamer' : 'player');
    var hashSec = findSection(hash);
    if (hashSec && hashSec.mode !== 'both') S.mode = hashSec.mode;

    renderHero();
    // زائر يشوف بروفايل غيره: الخادم يرسل الاسم والـID بس (restricted)
    if (p.restricted && !S.owner) { showRestricted(); return; }
    go(hashSec ? hashSec.id : 'overview', { noHash: !hashSec });
    if (hash === 'win-codes' || hash === 'codes') setTimeout(function () { $('#pfContent').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);

    if (!S.owner) return;
    handleTikTokReturn();
    // الحالة الحقيقية من الخادم — النسخة المحفوظة بالمتصفح ممكن تكون قديمة.
    if (window.AGPAuth.refreshUser) window.AGPAuth.refreshUser().then(function (u) {
      if (u && u.email_verified === false) { S.emailUnverified = { email: u.email }; go(S.section, { noHash: true }); }
    }).catch(function () {});
    if (typeof window.AGPAuth.supportUnreadCount === 'function') window.AGPAuth.supportUnreadCount().then(function (r) {
      if (r && r.success && r.unread > 0) { S.unread = r.unread; renderSideNav(); if (S.section === 'support') go('support', { noHash: true }); }
    }).catch(function () {});
    if (window.AGPAuth.request) window.AGPAuth.request('/api/remote-control/access').then(function (r) {
      S.remoteAccess = (r && r.success && r.streamers) || [];
      if (S.remoteAccess.length) {
        if (findSection(hash) && findSection(hash).id === 'remote') go('remote'); else renderSideNav();
      }
    }).catch(function () {});
    // أكواد ممنوحة ما انستردت — شارة على «أكوادي»
    loadGrants().then(function () { if (pendingGrants() > 0) renderSideNav(); });
  }

  function init() {
    wireChrome();
    if (!window.AGPAuth) { showState('error'); return; }
    var params = new URLSearchParams(window.location.search);
    var customId = params.get('id');
    if (!customId) { var c = cachedUser(); if (c && c.custom_id) customId = c.custom_id; }
    if (!customId) { showState('login'); return; }
    window.AGPAuth.getPublicProfile(customId).then(function (result) {
      if (result && result.success && result.profile) start(result.profile);
      else showState(result && result.error === 'not_found' ? 'missing' : 'error');
    }).catch(function () { showState('error'); });
  }

  // أحداث ثابتة بالصفحة: زر الوضع، القائمة الجانبية، الصورة، الخروج، قائمة الجوال
  function wireChrome() {
    document.addEventListener('click', function (e) {
      var modeBtn = e.target.closest('[data-mode]');
      if (modeBtn && S.p) { setMode(modeBtn.getAttribute('data-mode')); return; }
      var secLink = e.target.closest('[data-sec]');
      if (secLink && S.p) { e.preventDefault(); go(secLink.getAttribute('data-sec'), { scroll: !secLink.classList.contains('pf-side-item') }); return; }
      var av = e.target.closest('#pfAvatar.editable');
      if (av) { openEditModal('photo'); return; }
      var out = e.target.closest('[data-logout]');
      if (out) {
        e.preventDefault();
        if (window.AGPAuth && window.AGPAuth.logout) window.AGPAuth.logout().then(function () { window.location.href = './'; }, function () { window.location.href = './'; });
        else window.location.href = './';
        return;
      }
      var burger = e.target.closest('#pfBurger');
      if (burger) {
        var open = document.body.classList.toggle('pf-menu-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }
      if (document.body.classList.contains('pf-menu-open') && !e.target.closest('.pf-nav')) {
        document.body.classList.remove('pf-menu-open');
        $('#pfBurger').setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.id === 'pfAvatar' && e.target.classList.contains('editable')) { e.preventDefault(); openEditModal('photo'); }
    });
    // أسهم الكيبورد تتنقل بين زرّي الوضع (نمط tablist)
    var sw = $('#pfMode');
    if (sw) sw.addEventListener('keydown', function (e) {
      if (!S.p || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      var next = S.mode === 'player' ? 'streamer' : 'player';
      setMode(next);
      var b = sw.querySelector('[data-mode="' + next + '"]'); if (b) b.focus();
    });
    window.addEventListener('hashchange', function () {
      var id = (location.hash || '').replace('#', '');
      if (S.p && id && id !== S.section && findSection(id)) go(id, { noHash: true });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
