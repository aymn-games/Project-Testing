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
  function arDigits(n) { return String(n).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
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

  // كتل بناء موحّدة للأقسام
  function panel(title, sub, kids, extraClass) {
    return h('div', { class: 'pf-panel' + (extraClass ? ' ' + extraClass : '') }, [
      h('div', { class: 'pf-panel-head' }, [
        h('h3', { class: 'pf-panel-title', text: title }),
        sub ? h('span', { class: 'pf-panel-sub', text: sub }) : null
      ])
    ].concat(kids || []));
  }
  function emptyNote(text) { return h('div', { class: 'pf-empty', text: text }); }
  function kvRow(k, v) { return h('div', { class: 'pf-kv' }, [h('span', { class: 'pf-kv-k', text: k }), h('span', { class: 'pf-kv-v', text: v })]); }
  function statTile(value, label, tone) {
    return h('div', { class: 'pf-stat' + (tone ? ' ' + tone : '') }, [
      h('div', { class: 'pf-stat-v', text: value }), h('div', { class: 'pf-stat-l', text: label })
    ]);
  }
  // صف أداة: الوصف يمين والزر يسار (قاعدة صفوف الإعدادات بالمنصة)
  function toolRow(icon, title, desc, control, tone) {
    return h('div', { class: 'pf-tool' + (tone ? ' ' + tone : '') }, [
      h('div', { class: 'pf-tool-txt' }, [
        h('div', { class: 'pf-tool-title' }, [h('span', { class: 'pf-tool-ic', 'aria-hidden': 'true', text: icon }), title]),
        desc ? h('div', { class: 'pf-tool-desc', text: desc }) : null
      ]),
      control
    ]);
  }
  function soonBtn() { return h('span', { class: 'pf-btn pf-btn-soon', 'aria-disabled': 'true', title: 'إطلاق جديد قريباً', text: 'قريباً' }); }
  function ring(pct, value, unit, tone) {
    pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
    return h('div', { class: 'pf-ring' + (tone ? ' ' + tone : ''), style: '--p:' + pct, role: 'img', 'aria-label': value + ' ' + unit + ' — ' + pct + '٪' }, [
      h('div', { class: 'pf-ring-in' }, [h('span', { class: 'pf-ring-v', text: value }), h('span', { class: 'pf-ring-u', text: unit })])
    ]);
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
    unread: 0
  };

  /* ===================================================== تعريف الأقسام */
  // mode: player | streamer | both — owner: لصاحب الحساب فقط
  // show(p): شرط إضافي — streamerOnly: يطلع مقفول لحساب اللاعب العادي
  var GROUPS = [
    { id: 'account', label: 'الحساب', mode: 'both' },
    { id: 'progress', label: 'التقدّم', mode: 'player' },
    { id: 'items', label: 'المقتنيات', mode: 'player' },
    { id: 'broadcast', label: 'البث', mode: 'streamer' },
    { id: 'tools', label: 'أدوات الستريمر', mode: 'streamer' },
    { id: 'help', label: 'الدعم والتحكم', mode: 'both' }
  ];

  var SECTIONS = [
    { id: 'overview', group: 'account', mode: 'both', icon: '🏠', label: 'نظرة عامة', render: renderOverview },
    { id: 'info', group: 'account', mode: 'both', icon: '👤', label: 'معلومات الحساب', render: renderInfo },
    { id: 'tiktok', group: 'account', mode: 'both', owner: true, icon: '🔗', label: 'ربط تيك توك', render: renderTikTok },

    { id: 'level', group: 'progress', mode: 'player', icon: '⭐', label: 'المستوى والنقاط', show: function (p) { return !!p.points; }, render: renderLevel },

    { id: 'frames', group: 'items', mode: 'player', icon: '🖼️', label: 'الإطارات', show: function (p) { return !!p.frames; }, render: renderFrames },
    { id: 'character', group: 'items', mode: 'player', icon: '🧍', label: 'شخصيتي بالألعاب', show: function (p) { return S.owner || p.character !== undefined; }, render: renderCharacter },
    { id: 'entrance', group: 'items', mode: 'player', icon: '✨', label: 'الدخوليات', show: function (p) { return p.entrance !== undefined; }, render: renderEntrance },
    { id: 'cards', group: 'items', mode: 'player', icon: '🃏', label: 'البطاقات', show: function (p) { return !!(p.elimCards || p.winCards); }, render: renderCards },
    { id: 'redeem', group: 'items', mode: 'player', owner: true, icon: '🎁', label: 'استرداد كود', render: renderRedeem },

    { id: 'stream-stats', group: 'broadcast', mode: 'streamer', icon: '📊', label: 'إحصائيات البث', render: renderStreamStats },
    { id: 'streamer-level', group: 'broadcast', mode: 'streamer', icon: '🏆', label: 'مستوى الستريمر', show: function (p) { return !!p.streamerLevel; }, render: renderStreamerLevel },

    { id: 'remote-control', group: 'tools', mode: 'streamer', owner: true, streamerOnly: true, icon: '🕹️', label: 'التحكم عن بعد', render: renderRemoteControl },
    { id: 'screens', group: 'tools', mode: 'streamer', owner: true, streamerOnly: true, icon: '🖥️', label: 'شاشات البث', render: renderScreens },
    { id: 'win-codes', group: 'tools', mode: 'streamer', owner: true, icon: '🏅', label: 'أكواد جوائز الفوز', render: renderWinCodes },
    { id: 'soon', group: 'tools', mode: 'streamer', icon: '🚀', label: 'قريباً', render: renderSoon },

    { id: 'remote-access', group: 'help', mode: 'both', owner: true, icon: '🎮', label: 'لوحة التحكم', show: function () { return S.remoteAccess.length > 0; }, render: renderRemoteAccess },
    { id: 'support', group: 'help', mode: 'both', owner: true, icon: '🎫', label: 'تذاكري', render: renderSupport }
  ];

  function sectionVisible(sec) {
    if (sec.mode !== 'both' && sec.mode !== S.mode) return false;
    if (sec.owner && !S.owner) return false;
    if (sec.show && !sec.show(S.p)) return false;
    return true;
  }
  function visibleSections() { return SECTIONS.filter(sectionVisible); }
  function findSection(id) { return SECTIONS.filter(function (s) { return s.id === id; })[0] || null; }

  /* ===================================================== الهيدر العلوي */

  function renderHero() {
    var p = S.p;
    var name = p.display_name || p.username || 'اسم المستخدم';
    var nameEl = $('#pfName');
    nameEl.textContent = name;
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
      av.appendChild(h('span', { class: 'pf-avatar-cam', 'aria-hidden': 'true', text: '📷' }));
    }

    var chips = $('#pfChips');
    chips.innerHTML = '';
    chips.appendChild(h('span', { class: 'pf-chip role', text: roleLabel(p) }));
    if (p.custom_id) {
      var idBtn = h('button', { type: 'button', class: 'pf-chip pf-chip-btn', title: 'نسخ الـID', text: 'ID #' + p.custom_id });
      idBtn.addEventListener('click', function () {
        copyText(p.custom_id, function () {
          idBtn.textContent = 'تم النسخ ✓';
          setTimeout(function () { idBtn.textContent = 'ID #' + p.custom_id; }, 1500);
        });
      });
      chips.appendChild(idBtn);
    }
    chips.appendChild(p.tiktok_verified
      ? h('span', { class: 'pf-chip ok', text: 'تيك توك موثّق ✅' })
      : h('span', { class: 'pf-chip warn', text: 'تيك توك غير مربوط' }));

    var acts = $('#pfHeroActions');
    acts.innerHTML = '';
    if (S.owner) {
      acts.appendChild(h('button', { type: 'button', class: 'pf-btn pf-btn-ghost', onclick: function () { openEditModal(); } }, '✏️ تعديل الملف'));
      if (window.AGPProfileCard) acts.appendChild(h('button', { type: 'button', class: 'pf-btn pf-btn-primary', onclick: function () { window.AGPProfileCard.open(S.p); } }, '📸 صورة بروفايلي'));
      if (p.role === 'admin') acts.appendChild(h('a', { href: 'admin.html', class: 'pf-btn pf-btn-ghost' }, '⚙️ لوحة الأدمن'));
    }
    paintModeSwitch();
  }

  function paintModeSwitch() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
      var on = b.getAttribute('data-mode') === S.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
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
        if (s.id === 'support' && S.unread > 0) badge = h('span', { class: 'pf-side-badge', title: 'رد جديد من فريق الدعم', text: S.unread > 99 ? '99+' : String(S.unread) });
        if (s.id === 'info' && S.emailUnverified) badge = h('span', { class: 'pf-side-dot', title: 'الإيميل غير مؤكد' });
        if (locked) badge = h('span', { class: 'pf-side-lock', 'aria-label': 'مقفول', text: '🔒' });
        var a = h('a', {
          href: '#' + s.id,
          class: 'pf-side-item' + (s.id === S.section ? ' on' : ''),
          'aria-current': s.id === S.section ? 'page' : null,
          'data-sec': s.id
        }, [h('span', { class: 'pf-side-ic', 'aria-hidden': 'true', text: s.icon }), h('span', { class: 'pf-side-txt', text: s.label }), badge]);
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
    var head = h('div', { class: 'pf-content-head' }, [
      h('span', { class: 'pf-content-ic', 'aria-hidden': 'true', text: sec.icon }),
      h('h2', { class: 'pf-content-title', text: sec.label })
    ]);
    var body = h('div', { class: 'pf-content-body' });
    c.appendChild(head);
    c.appendChild(body);
    try {
      if (locked) body.appendChild(lockedNotice());
      else sec.render(body, S.p);
    } catch (e) {
      body.appendChild(emptyNote('تعذّر عرض هذا القسم.'));
      var AGP = window.AymanGamesPlatform; if (AGP && AGP.log) AGP.log('profile: section render failed', e);
    }
    c.classList.remove('pf-anim'); void c.offsetWidth; c.classList.add('pf-anim');
    var active = document.querySelector('.pf-side-item.on');
    if (active && active.scrollIntoView && window.innerWidth < 900) active.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (opts.scroll && window.innerWidth < 900) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setMode(mode, opts) {
    opts = opts || {};
    if (mode !== 'player' && mode !== 'streamer') return;
    S.mode = mode;
    store('agp_profile_mode', mode);
    paintModeSwitch();
    if (!opts.keepSection) {
      var cur = findSection(S.section);
      go(cur && sectionVisible(cur) ? cur.id : 'overview');
    }
  }

  function lockedNotice() {
    return h('div', { class: 'pf-lock' }, [
      h('div', { class: 'pf-lock-ic', 'aria-hidden': 'true', text: '🔒' }),
      h('div', { class: 'pf-lock-t', text: 'هذي الأداة لحسابات الستريمر' }),
      h('div', { class: 'pf-lock-d', text: 'حسابك حالياً حساب لاعب. أدوات البث تتفعّل لما يكون حسابك ستريمر.' })
    ]);
  }

  /* ===================================================== الأقسام */

  function emailBanner() {
    if (!S.owner || !S.emailUnverified) return null;
    return h('div', { class: 'pf-banner warn' }, [
      h('div', { text: '⚠️ إيميلك غير مؤكد — أكّده عشان تقدر تستعيد حسابك لو نسيت كلمة المرور أو اسم المستخدم.' }),
      h('button', { type: 'button', class: 'pf-btn pf-btn-warn', onclick: function () {
        openEmailVerifyModal(S.emailUnverified.email, function () { S.emailUnverified = null; go(S.section, { noHash: true }); });
      } }, 'أكّد الإيميل')
    ]);
  }

  function activeFrameName(p) {
    var f = (p.frames || []).filter(function (x) { return x.equipped; })[0];
    return f ? (f.displayNameAr || f.frameRef) : 'لا يوجد إطار مفعّل';
  }

  function playerLevelInfo(p) {
    var pts = p.points || {};
    var total = pts.totalPoints || 0;
    var cur = pts.currentLevel, next = pts.nextLevel;
    var base = cur ? cur.pointsRequired : 0;
    var pct = next ? ((total - base) / Math.max(1, next.pointsRequired - base)) * 100 : (cur ? 100 : 0);
    var note = next
      ? ('يحتاج ' + Math.max(0, next.pointsRequired - total) + ' نقطة للمستوى التالي')
      : (cur ? 'أعلى مستوى متاح حالياً' : 'لا توجد مستويات مفعَّلة بعد');
    return { total: total, pct: pct, note: note, cur: cur, next: next };
  }

  function streamerLevelInfo(p) {
    var sl = p.streamerLevel || {};
    var next = sl.nextLevel;
    var need = next ? (next.minSp != null ? next.minSp : next.min_sp) : null;
    var note = next
      ? (need != null ? 'يحتاج ' + Math.max(0, need - (sl.sp || 0)) + ' SP لمستوى «' + levelName(next) + '»' : 'المستوى التالي: ' + levelName(next))
      : (sl.currentLevel ? 'أعلى مستوى متاح حالياً' : 'ابدأ البث عشان تجمع SP');
    return { sp: sl.sp || 0, pct: sl.progressPercent || (sl.currentLevel && !next ? 100 : 0), cur: sl.currentLevel, note: note };
  }

  function renderOverview(body, p) {
    var banner = emailBanner();
    if (banner) body.appendChild(banner);

    var grid = h('div', { class: 'pf-ov' });
    if (S.mode === 'player') {
      if (p.points) {
        var L = playerLevelInfo(p);
        grid.appendChild(h('div', { class: 'pf-panel pf-ov-level' }, [
          ring(L.pct, num(L.total), 'نقطة'),
          h('div', { class: 'pf-ov-level-txt' }, [
            h('div', { class: 'pf-eyebrow', text: 'مستوى اللاعب' }),
            h('div', { class: 'pf-ov-level-name', text: levelName(L.cur) || 'بدون مستوى بعد' }),
            h('div', { class: 'pf-muted', text: L.note }),
            h('a', { href: '#level', class: 'pf-link', 'data-sec': 'level' }, 'تفاصيل النقاط ←')
          ])
        ]));
        grid.appendChild(h('div', { class: 'pf-stats3' }, [
          statTile(num(p.points.gamesPlayed), 'جولات مكتملة'),
          statTile(num(p.points.gamesWon), 'فوز'),
          statTile((p.points.winRatePct || 0) + '%', 'نسبة الفوز')
        ]));
      }
    } else {
      var SL = streamerLevelInfo(p);
      var s = p.stats || {};
      if (p.streamerLevel) {
        grid.appendChild(h('div', { class: 'pf-panel pf-ov-level' }, [
          ring(SL.pct, num(SL.sp), 'SP', 'blue'),
          h('div', { class: 'pf-ov-level-txt' }, [
            h('div', { class: 'pf-eyebrow', text: 'مستوى الستريمر' }),
            h('div', { class: 'pf-ov-level-name', text: levelName(SL.cur) || 'بدون مستوى بعد' }),
            h('div', { class: 'pf-muted', text: SL.note }),
            h('a', { href: '#stream-stats', class: 'pf-link', 'data-sec': 'stream-stats' }, 'إحصائيات البث ←')
          ])
        ]));
      }
      grid.appendChild(h('div', { class: 'pf-stats3' }, [
        statTile(num(s.total_broadcasts), 'عدد البثوث', 'blue'),
        statTile(String(Math.round(((s.total_live_ms || 0) / 3600000) * 10) / 10), 'ساعات البث', 'blue'),
        statTile(num(s.total_gifts_value), 'قيمة الهدايا (ألماس)', 'blue')
      ]));
    }
    body.appendChild(grid);

    body.appendChild(panel('ملخص الحساب', null, [h('div', { class: 'pf-kvs' }, [
      kvRow('انضم في', formatDate(p.joined_at)),
      kvRow('نوع الحساب', roleLabel(p)),
      p.frames ? kvRow('الإطار المفعّل', activeFrameName(p)) : null,
      kvRow('حساب تيك توك', p.tiktok_verified ? (p.tiktok_username ? '@' + p.tiktok_username : 'مرتبط ✅') : 'غير مربوط')
    ])]));

    if (S.owner) {
      var quick = S.mode === 'player'
        ? [['frames', '🖼️', 'إطاراتي'], ['character', '🧍', 'شخصيتي'], ['redeem', '🎁', 'استرداد كود'], ['support', '🎫', 'تذاكري']]
        : [['stream-stats', '📊', 'إحصائيات البث'], ['remote-control', '🕹️', 'التحكم عن بعد'], ['win-codes', '🏅', 'أكواد الفوز'], ['support', '🎫', 'تذاكري']];
      body.appendChild(panel('اختصارات', null, [h('div', { class: 'pf-quick' }, quick.map(function (q) {
        return h('a', { href: '#' + q[0], class: 'pf-quick-item', 'data-sec': q[0] }, [h('span', { class: 'pf-quick-ic', 'aria-hidden': 'true', text: q[1] }), q[2]]);
      }))]));
    }
  }

  function renderInfo(body, p) {
    var banner = emailBanner();
    if (banner) body.appendChild(banner);
    // تشغيل الألعاب: حساب ستريمر + تيك توك موثَّق (بدون موافقة أدمن).
    var playStatus = p.role === 'admin' ? 'مفعّلة ✅'
      : !(p.is_streamer || p.can_run_games) ? 'لحسابات الستريمر فقط'
      : p.tiktok_verified ? 'مفعّلة ✅' : 'تحتاج ربط حساب تيك توك 🔗';
    var rows = [
      kvRow('اسم العرض', p.display_name || p.username || '—'),
      kvRow('اسم المستخدم', p.username || '—'),
      kvRow('الـID', p.custom_id ? '#' + p.custom_id : '—'),
      kvRow('نوع الحساب', roleLabel(p)),
      kvRow('تاريخ الانضمام', formatDate(p.joined_at)),
      kvRow('صلاحية تشغيل الألعاب', playStatus)
    ];
    var kids = [h('div', { class: 'pf-kvs' }, rows)];
    if (S.owner) kids.push(h('div', { class: 'pf-actions' }, [
      h('button', { type: 'button', class: 'pf-btn pf-btn-primary', onclick: function () { openEditModal(); } }, '✏️ تعديل الملف'),
      h('button', { type: 'button', class: 'pf-btn pf-btn-ghost', onclick: function () { openEditModal('photo'); } }, '📷 تغيير الصورة')
    ]));
    body.appendChild(panel('بيانات الحساب', null, kids));

    if (S.owner) body.appendChild(panel('منطقة الخطر', 'إجراءات نهائية', [
      toolRow('🗑️', 'حذف الحساب نهائياً', 'كل بياناتك ونقاطك وربط حسابك بتيك توك بتنحذف تماماً، وما فيه تراجع.',
        h('button', { type: 'button', class: 'pf-btn pf-btn-danger', onclick: deleteAccount }, 'حذف الحساب'), 'danger')
    ], 'pf-panel-danger'));
  }

  // حذف الحساب الذاتي — تأكيد مزدوج لأنه نهائي (handleDeleteMyAccount بـauth-router.js).
  function deleteAccount(e) {
    var btn = e.currentTarget;
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
        btn.disabled = false; btn.textContent = 'حذف الحساب';
        window.alert('تعذّر حذف الحساب: ' + (result && result.error ? result.error : 'خطأ غير معروف'));
      }
    }).catch(function () { btn.disabled = false; btn.textContent = 'حذف الحساب'; });
  }

  function renderTikTok(body, p) {
    var linked = !!p.tiktok_verified;
    var btn = h('button', { type: 'button', class: 'pf-tt-btn' + (linked ? ' unlink' : '') });
    if (linked) {
      btn.textContent = 'إلغاء الربط';
      // "إلغاء الربط" — POST /api/auth/tiktok/unlink عبر AGPAuth.unlinkTikTok
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
      btn.appendChild(document.createTextNode('ربط الحساب'));
      btn.appendChild(h('img', { src: 'tiktok-logo.png', alt: '', class: 'pf-tt-btn-logo' }));
      // تسجيل دخول تيك توك الرسمي — انتقال مباشر لخادمنا وهو يحوّل (302) لتيك توك
      // (backend/auth/tiktok-oauth-service.js). جلب الرابط بالخلفية طلّع شاشة بيضاء عند ناس كثير.
      btn.addEventListener('click', function () {
        var token = window.AGPAuth && window.AGPAuth.getToken ? window.AGPAuth.getToken() : null;
        if (!token) { window.location.href = 'login.html'; return; }
        var apiBase = (window.AGPAuth && window.AGPAuth.API_BASE) || '';
        window.location.href = apiBase + '/api/auth/tiktok/oauth/start?token=' + encodeURIComponent(token);
      });
    }
    body.appendChild(h('div', { class: 'pf-tt' }, [
      h('div', { class: 'pf-tt-head' }, [
        h('span', { class: 'pf-tt-logo' }, h('img', { src: 'tiktok-logo.png', alt: 'تيك توك' })),
        h('div', null, [
          h('div', { class: 'pf-tt-title', text: 'حساب تيك توك' }),
          h('div', { class: 'pf-tt-handle', text: linked ? (p.tiktok_username ? '@' + p.tiktok_username : 'الحساب مرتبط ✅ (اليوزرنيم قريباً)') : 'غير مربوط' })
        ]),
        h('span', { class: 'pf-chip ' + (linked ? 'ok' : 'warn'), text: linked ? 'موثّق ✅' : 'غير مربوط' })
      ]),
      h('div', { class: 'pf-tt-sub', html: 'اربط حسابك بضغطة وحدة عن طريق <b>تسجيل الدخول الرسمي من تيك توك</b> — ربط أسهل، معتمد من تيك توك وموثوق، وبدون ما تشارك كلمة المرور معنا.' }),
      h('div', { class: 'pf-tt-chips' }, ['✅ معتمد من تيك توك', '🔒 آمن وموثوق', '⚡ ربط بضغطة وحدة'].map(function (t) { return h('span', { class: 'pf-tt-chip', text: t }); })),
      h('div', { class: 'pf-tt-why' }, [
        h('b', { text: 'ليش أربط؟ ' }),
        'النقاط والمستويات تنحسب بس للحسابات الموثّقة، وشخصيتك تطلع معك بالألعاب، وحسابات الستريمر تقدر تشغّل الألعاب.'
      ]),
      btn
    ]));
  }

  function renderLevel(body, p) {
    var L = playerLevelInfo(p);
    body.appendChild(h('div', { class: 'pf-panel pf-ov-level' }, [
      ring(L.pct, num(L.total), 'نقطة'),
      h('div', { class: 'pf-ov-level-txt' }, [
        h('div', { class: 'pf-eyebrow', text: 'مستواك الحالي' }),
        h('div', { class: 'pf-ov-level-name', text: levelName(L.cur) || 'بدون مستوى بعد' }),
        h('div', { class: 'pf-muted', text: L.note }),
        L.next ? h('div', { class: 'pf-muted', text: 'المستوى التالي: ' + levelName(L.next) }) : null
      ])
    ]));
    body.appendChild(h('div', { class: 'pf-stats3' }, [
      statTile(num(p.points.gamesPlayed), 'جولات مكتملة'),
      statTile(num(p.points.gamesWon), 'فوز'),
      statTile((p.points.winRatePct || 0) + '%', 'نسبة الفوز')
    ]));
    // القيم من points-service.js نفسه — ما تنكتب يدوياً هنا.
    var r = p.points.rules;
    if (r) body.appendChild(panel('كيف تكسب نقاط الخبرة (XP)؟', 'النقاط للحسابات الموثّقة بتيك توك', [h('div', { class: 'pf-kvs' }, [
      kvRow('إكمال جولة كامل', r.perCompletedRound + ' نقاط'),
      kvRow('الفوز بالجولة', r.winBonus + ' فردي · ' + r.teamWinBonus + ' فريق'),
      kvRow('كل ساعة لعب فعلية', r.perHourPlayed + ' نقاط'),
      kvRow('الحد الأقصى باليوم', r.dailyCap + ' نقطة')
    ])]));
  }

  function itemCard(opts) {
    var card = h('div', { class: 'pf-item' + (opts.active ? ' on' : '') });
    var box = h('div', { class: 'pf-item-art', style: opts.artHeight ? 'height:' + opts.artHeight + 'px' : null });
    if (opts.img) {
      var im = h('img', { src: opts.img, alt: opts.name || '', loading: 'lazy' });
      im.onerror = function () { im.style.display = 'none'; };
      box.appendChild(im);
    } else if (opts.glyph) box.appendChild(h('span', { class: 'pf-item-glyph', text: opts.glyph }));
    card.appendChild(box);
    card.appendChild(h('div', { class: 'pf-item-name', text: opts.name }));
    if (opts.status) card.appendChild(h('div', { class: 'pf-item-status ' + (opts.statusOk ? 'ok' : 'off'), text: opts.status }));
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
    var frames = p.frames || [];
    var grid = h('div', { class: 'pf-items' });
    if (!frames.length) grid.appendChild(emptyNote('ما عندك إطارات بعد.'));
    frames.forEach(function (f) {
      var control;
      if (f.equipped) control = h('span', { class: 'pf-tag ok', text: 'مفعّل الآن' });
      else if (S.owner) control = actionBtn('تفعيل', function () { return window.AGPAuth.equipFrame(f.frameType, f.frameRef); });
      else control = h('span', { class: 'pf-tag', text: 'غير مفعّل' });
      grid.appendChild(itemCard({ img: f.imageFilename, name: f.displayNameAr || f.frameRef, active: f.equipped, control: control }));
    });
    body.appendChild(panel('إطاراتي', arDigits(frames.length) + ' إطار', [grid]));
    if (S.owner) body.appendChild(h('div', { class: 'pf-hint' }, ['عندك كود إطار؟ ', h('a', { href: '#redeem', class: 'pf-link', 'data-sec': 'redeem' }, 'استرده من هنا ←')]));
  }

  function renderCharacter(body, p) {
    var cur = p.character === 'girl' || p.character === 'boy' ? p.character : null;
    var grid = h('div', { class: 'pf-items pf-items-lg' });
    [
      { kind: 'girl', name: 'بنت', img: 'assets/characters/girl.png' },
      { kind: 'boy', name: 'ولد', img: 'assets/characters/boy.png' },
      { kind: null, name: 'عشوائي', img: null }
    ].forEach(function (opt) {
      var active = opt.kind === cur;
      var control = S.owner
        ? (active ? h('span', { class: 'pf-tag on', text: 'مفعّلة الآن' }) : actionBtn('تفعيل', function () { return window.AGPAuth.setCharacter(opt.kind); }))
        : h('span', { class: 'pf-tag' + (active ? ' ok' : ''), text: active ? 'مختارة ✅' : '—' });
      grid.appendChild(itemCard({ img: opt.img, glyph: opt.img ? null : '؟', name: opt.name, active: active, control: control, artHeight: 190 }));
    });
    body.appendChild(panel('شخصيتي بالألعاب', null, [
      h('div', { class: 'pf-muted pf-mt', text: 'الشخصية اللي تختارها تطلع معك لما تدخل الألعاب الثري دي (مثل حجرة ورقة مقص). لازم حسابك يكون موثّق بتيك توك. لو ما اخترت، تطلع لك شخصية عشوائية.' }),
      grid
    ]));
  }

  function renderEntrance(body, p) {
    var e = p.entrance;
    var content;
    if (e) {
      content = h('div', { class: 'pf-entrance' }, [
        h('span', { class: 'pf-entrance-ic', 'aria-hidden': 'true', text: '✨' }),
        h('div', { class: 'pf-entrance-txt' }, [
          h('div', { class: 'pf-entrance-name', text: e.template_key || '—' }),
          e.entrance_text ? h('div', { class: 'pf-muted', text: e.entrance_text }) : null,
          h('div', { class: 'pf-item-status ' + (e.enabled === false ? 'off' : 'ok'), text: e.enabled === false ? 'موقوفة ⏸️' : 'مفعّلة ✅' })
        ])
      ]);
    } else content = emptyNote('ما عندك دخولية مفعّلة بعد.');
    body.appendChild(panel('دخولياتي الحالية', null, [content]));
  }

  function cardsGrid(list, toggleFn, emptyText, artHeight) {
    var grid = h('div', { class: 'pf-items pf-items-md' });
    if (!list.length) grid.appendChild(emptyNote(emptyText));
    list.forEach(function (c) {
      grid.appendChild(itemCard({
        img: c.imageFilename, name: c.displayNameAr || c.cardKey, artHeight: artHeight,
        status: c.enabled ? 'مفعّلة ✅' : 'موقوفة ⏸️', statusOk: c.enabled,
        control: S.owner ? actionBtn(c.enabled ? 'إيقاف' : 'تفعيل', function () { return toggleFn(c.cardKey, !c.enabled); }) : null
      }));
    });
    return grid;
  }
  function renderCards(body, p) {
    var elim = p.elimCards || [], win = p.winCards || [];
    body.appendChild(panel('بطاقات الإقصاء', arDigits(elim.length) + ' بطاقة', [
      cardsGrid(elim, function (k, on) { return window.AGPAuth.toggleElimCard(k, on); }, 'ما عندك بطاقات إقصاء بعد.', 110)
    ]));
    body.appendChild(panel('بطاقات الفوز', arDigits(win.length) + ' بطاقة', [
      cardsGrid(win, function (k, on) { return window.AGPAuth.toggleWinCard(k, on); }, 'ما عندك بطاقات فوز بعد.', 160)
    ]));
  }

  var REDEEM_ERRORS = {
    invalid_code: 'الكود غير صحيح، تأكد منه وحاول مرة ثانية.',
    code_used: 'هذا الكود مستخدم من قبل.',
    code_burned: 'هذا الكود ملغي ولا يمكن استخدامه.',
    already_owned: 'عندك هذا العنصر من قبل — الكود ما انستخدم ويقدر تعطيه لغيرك.',
    rate_limited: 'محاولات كثيرة، حاول بعد ربع ساعة.',
    code_full: 'هذا الكود وصل الحد الأقصى من الاستخدام.',
    already_redeemed: 'استخدمت هذا الكود من قبل.',
    invalid_frame: 'هذا الإطار مو متاح بهذا الكود، اختر غيره.'
  };

  function renderRedeem(body) {
    var input = h('input', { type: 'text', class: 'pf-input pf-input-code', placeholder: 'AGP-XXXX-XXXX', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'الكود' });
    var btn = h('button', { type: 'button', class: 'pf-btn pf-btn-primary', text: 'استرداد' });
    var msg = h('div', { class: 'pf-msg', 'aria-live': 'polite' });
    function setMsg(text, ok) { msg.textContent = text; msg.className = 'pf-msg ' + (ok ? 'ok' : 'err'); }
    function reset() { btn.disabled = false; btn.textContent = 'استرداد'; }
    function doRedeem() {
      var code = input.value.trim();
      if (!code) { setMsg('اكتب الكود أولاً.', false); return; }
      btn.disabled = true; btn.textContent = 'جارٍ...';
      window.AGPAuth.redeemFrameCode(code).then(function (result) {
        if (!(result && result.success)) { setMsg(REDEEM_ERRORS[result && result.error] || 'تعذّر الاسترداد، حاول مرة ثانية.', false); reset(); return; }
        // كود "اختيار إطار": نعرض كل الإطارات المتاحة ويختار واحد بنفسه.
        if (result.kind === 'choice') {
          reset();
          setMsg('اختر إطارك من القائمة 👇', true);
          window.AGPFramePicker.open({
            title: 'اختر إطارك 🎁',
            subtitle: 'الكود يعطيك إطار واحد تختاره بنفسك، وينضاف مباشرة لمقتنياتك.',
            choices: result.choices,
            onPick: function (choice, name) {
              return window.AGPAuth.redeemChoiceCode(result.code, choice.frameType, choice.frameRef).then(function (r) {
                if (r && r.success) {
                  setMsg('🎉 تم! انضاف إطار "' + name + '" لمقتنياتك.', true);
                  setTimeout(function () { window.location.reload(); }, 1500);
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
          var m = '🎉 تم! انضاف لك باكج "' + ((result.bundle && result.bundle.name) || '') + '": ' + names(result.granted) + '.';
          if (result.alreadyOwned && result.alreadyOwned.length) m += ' (كان عندك من قبل: ' + names(result.alreadyOwned) + ')';
          setMsg(m, true);
          setTimeout(function () { window.location.reload(); }, 2500);
          return;
        }
        var isCard = result.kind === 'elim' || result.kind === 'win';
        var name = ((isCard ? result.card : result.frame) || {}).displayNameAr || '';
        setMsg(isCard
          ? '🎉 تم! انضافت ' + (name ? '"' + name + '" ' : 'البطاقة ') + 'لمقتنياتك.'
          : '🎉 تم! انضاف إطار ' + (name ? '"' + name + '" ' : '') + 'لمقتنياتك.', true);
        setTimeout(function () { window.location.reload(); }, 1500);
      }).catch(function () { setMsg('تعذّر الاتصال، حاول مرة ثانية.', false); reset(); });
    }
    btn.addEventListener('click', doRedeem);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doRedeem(); });
    body.appendChild(panel('استرداد كود', 'إطارات · بطاقات · باكجات', [
      h('div', { class: 'pf-muted pf-mt', text: 'اكتب الكود اللي وصلك (من المتجر أو جائزة فوز) وينضاف العنصر مباشرة لمقتنياتك.' }),
      h('div', { class: 'pf-redeem' }, [input, btn]),
      msg
    ]));
    setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) {} }, 50);
  }

  function renderStreamStats(body, p) {
    var s = p.stats || {};
    var hours = Math.round(((s.total_live_ms || 0) / 3600000) * 10) / 10;
    body.appendChild(h('div', { class: 'pf-stats-grid' }, [
      statTile(num(s.total_broadcasts), 'عدد البثوث', 'blue'),
      statTile(String(hours), 'ساعات البث', 'blue'),
      statTile(num(s.total_comments), 'التعليقات', 'blue'),
      statTile(num(s.total_follows), 'متابعين جدد', 'blue'),
      statTile(num(s.total_players), 'لاعبون انضموا', 'blue'),
      statTile(num(s.total_gifts), 'عدد الهدايا', 'blue'),
      statTile(num(s.total_gifts_value), 'قيمة الهدايا (ألماس)', 'blue')
    ]));
    if (S.owner && isStreamerAccount(p)) {
      body.appendChild(toolRow('📸', 'صورة ستوري لآخر بث', 'المكبّسين، الداعمين، الشير، المتفاعلين، والمشاهدين — إطلاق جديد قريباً.', soonBtn()));
    }
  }

  function renderStreamerLevel(body, p) {
    var SL = streamerLevelInfo(p);
    body.appendChild(h('div', { class: 'pf-panel pf-ov-level' }, [
      ring(SL.pct, num(SL.sp), 'SP', 'blue'),
      h('div', { class: 'pf-ov-level-txt' }, [
        h('div', { class: 'pf-eyebrow', text: 'مستوى الستريمر' }),
        h('div', { class: 'pf-ov-level-name', text: levelName(SL.cur) || 'بدون مستوى بعد' }),
        h('div', { class: 'pf-muted', text: SL.note }),
        h('div', { class: 'pf-muted', text: 'نقاط الستريمر (SP) تنحسب من نشاط بثوثك على المنصة.' })
      ])
    ]));
  }

  // التحكم عن بعد (js/agp-remote-control.js): الحالة من /api/remote-control/config
  function renderRemoteControl(body) {
    var RC = window.AymanGamesPlatform && window.AymanGamesPlatform.remoteControl;
    if (!RC) { body.appendChild(emptyNote('تعذّر تحميل أداة التحكم عن بعد.')); return; }
    var state = h('span', { class: 'pf-tag' });
    var btn = h('button', { type: 'button', class: 'pf-btn pf-btn-green', 'data-rc-btn': '1', onclick: function () { RC.openPanel(); } });
    function paint() {
      var on = RC.isEnabled();
      state.textContent = on ? 'مفعّل ✅' : 'متوقف';
      state.className = 'pf-tag' + (on ? ' ok' : '');
      btn.textContent = on ? 'إدارة التحكم عن بعد' : 'تفعيل التحكم عن بعد';
    }
    paint();
    if (RC.loadConfig) RC.loadConfig().then(paint, paint);
    paintRemote = paint;
    body.appendChild(toolRow('🕹️', 'التحكم عن بعد',
      'تضيف يوزر تيك توك لشخص أو أكثر، فيشغّلون ألعابك كاملة من «لوحة التحكم» بجوالهم أو بأوامر الشات — يختارون اللعبة، يضبطون الإعدادات والدخول، ويبدؤون وينهون المباراة.',
      h('div', { class: 'pf-tool-ctl' }, [state, btn]), 'green'));
  }
  var paintRemote = null;
  window.addEventListener('agp:remote-control-changed', function () { if (paintRemote && document.querySelector('[data-rc-btn]')) paintRemote(); });

  function renderScreens(body) {
    body.appendChild(toolRow('🖥️', 'شاشات البث', 'شاشات البث لـOBS وTikTok LIVE Studio: أليرتات الهدايا والمتابعين، التوب، الأهداف، النصوص والأيقونات — إطلاق جديد قريباً.', soonBtn(), 'cyan'));
    body.appendChild(toolRow('📸', 'صورة ستوري لآخر بث', 'المكبّسين، الداعمين، الشير، المتفاعلين، والمشاهدين — إطلاق جديد قريباً.', soonBtn()));
  }

  // أكواد جوائز الفوز (مباريات البثين) — يوصلها الستريمر من زر
  // «اذهب لكشف كود الاسترداد» بشاشة الفوز (profile.html#win-codes)
  var GAME_NAMES = { 'penalty': 'بلنتي', 'fastest-answer': 'أسرع إجابة' };
  function renderWinCodes(body) {
    var list = h('div', { class: 'pf-codes' }, [emptyNote('جارٍ التحميل...')]);
    var countEl = h('span', { class: 'pf-panel-sub' });
    var pnl = panel('أكواد جوائز الفوز', null, [
      h('div', { class: 'pf-howto', html: '<b>كيف اللاعبين يستردون الكود؟</b><br>' +
        '1. انسخ الكود وأرسله للاعبين فريقك الفائز (لا تعرضه بالبث).<br>' +
        '2. لازم كل لاعب يكون عنده حساب بالموقع <b>مربوط بحساب تيك توك</b>.<br>' +
        '3. اللاعب يفتح بروفايله ← قسم «استرداد كود»، يكتب الكود ويضغط «استرداد».<br>' +
        '4. تطلع له قائمة الإطارات المتاحة ويختار إطار واحد ينضاف لمقتنياته.<br>' +
        'كل كود له عدد استخدامات محدد، وكل لاعب يستخدمه مرة وحدة.' }),
      list
    ]);
    pnl.querySelector('.pf-panel-head').appendChild(countEl);
    body.appendChild(pnl);

    function paint(codes) {
      list.innerHTML = '';
      countEl.textContent = codes.length ? codes.length + ' كود' : '';
      if (!codes.length) { list.appendChild(emptyNote('ما عندك أكواد جوائز للحين — تطلع لك هنا لما تفوز بمباراة بين بثين.')); return; }
      codes.forEach(function (c) {
        var full = c.uses >= c.maxUses, off = Boolean(c.burnedAt);
        var d = new Date(c.createdAt);
        var item = h('div', { class: 'pf-code' + (off || full ? ' dim' : '') }, [
          h('div', { class: 'pf-code-info' }, [
            h('span', { class: 'pf-code-v', text: c.code }),
            h('span', { class: 'pf-muted', text: (GAME_NAMES[c.game] || c.game) + (c.teamName ? ' · ' + c.teamName : '') + ' · ' + d.toLocaleDateString('ar-SA') +
              ' · ' + c.uses + ' / ' + c.maxUses + ' استخدام' + (off ? ' · موقوف' : full ? ' · اكتمل' : '') })
          ])
        ]);
        if (!off && !full) {
          var copy = h('button', { type: 'button', class: 'pf-btn pf-btn-sm pf-btn-gold', text: 'نسخ' });
          copy.addEventListener('click', function () {
            copyText(c.code, function () { copy.textContent = 'تم النسخ ✓'; setTimeout(function () { copy.textContent = 'نسخ'; }, 1500); });
          });
          item.appendChild(copy);
        }
        list.appendChild(item);
      });
    }
    if (S.winCodes) { paint(S.winCodes); return; }
    window.AGPAuth.getWinRewardCodes().then(function (res) {
      S.winCodes = (res && res.success && res.codes) || [];
      if (document.body.contains(list)) paint(S.winCodes);
    }).catch(function () { list.innerHTML = ''; list.appendChild(emptyNote('تعذّر تحميل الأكواد.')); });
  }

  function renderSoon(body) {
    var grid = h('div', { class: 'pf-soon' });
    [
      ['🎮', 'الألعاب التي تم بثها', 'سجل بكل الألعاب اللي شغّلتها ببثوثك.'],
      ['👥', 'تحليلات الجمهور', 'مين يتفاعل معك أكثر، ومتى.'],
      ['⚡', 'أبرز اللحظات', 'أقوى لحظات بثوثك بمكان واحد.'],
      ['📅', 'البث القادم', 'أعلن عن بثك الجاي لمتابعينك.'],
      ['🏆', 'إنجازات الستريمر', 'شارات تنفتح مع نشاطك.']
    ].forEach(function (c) {
      grid.appendChild(h('div', { class: 'pf-soon-card' }, [
        h('div', { class: 'pf-soon-top' }, [h('span', { class: 'pf-soon-ic', 'aria-hidden': 'true', text: c[0] }), h('span', { class: 'pf-tag', text: 'قريباً' })]),
        h('div', { class: 'pf-soon-t', text: c[1] }),
        h('div', { class: 'pf-muted', text: c[2] })
      ]));
    });
    body.appendChild(grid);
  }

  // «لوحة التحكم» للمتحكم: ستريمرات أعطوه صلاحية (GET /api/remote-control/access)
  function renderRemoteAccess(body) {
    var many = S.remoteAccess.length > 1;
    var list = h('div', { class: 'pf-rc-list' });
    S.remoteAccess.forEach(function (st) {
      var av = st.avatar ? h('img', { src: st.avatar, alt: '', class: 'pf-rc-av' }) : h('span', { class: 'pf-rc-av', text: (st.name || '؟').charAt(0) });
      list.appendChild(h('a', { href: 'control.html?s=' + encodeURIComponent(st.id), class: 'pf-rc-item' }, [
        av, h('span', { class: 'pf-rc-name', text: st.name || 'ستريمر' }), h('span', { class: 'pf-btn pf-btn-green pf-btn-sm', text: 'افتح لوحة التحكم' })
      ]));
    });
    body.appendChild(panel(many ? 'اختر البث' : 'لوحة التحكم', null, [
      h('div', { class: 'pf-muted pf-mt', text: 'هذي البثوث أعطتك صلاحية تتحكم بألعابها — تختار اللعبة، تضبط الإعدادات، وتبدأ وتنهي المباراة من جوالك.' }),
      list
    ]));
  }

  function renderSupport(body) {
    body.appendChild(toolRow('🎫', 'تذاكر الدعم',
      S.unread > 0 ? ('عندك ' + S.unread + ' رد جديد من فريق الدعم.') : 'تابع تذاكرك مع فريق الدعم، أو افتح تذكرة جديدة.',
      h('a', { href: 'support-tickets.html?tab=list', class: 'pf-btn pf-btn-primary' }, [
        'تذاكري',
        S.unread > 0 ? h('span', { class: 'pf-side-badge', text: S.unread > 99 ? '99+' : String(S.unread) }) : null
      ])));
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
    return 'تقدر تغيّر اسم المستخدم مرة كل 7 أيام — باقي ' + (parts.join(' و ') || 'أقل من ساعة') + '.';
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
          '<div class="agp-ed-avatar" title="اضغط أو اسحب صورة هنا"><div class="agp-ed-avatar-in"></div><span class="agp-ed-cam">📷</span></div>' +
          '<div class="agp-ed-photo-btns"><button type="button" class="agp-ed-btn" data-pick>تغيير الصورة</button><button type="button" class="agp-ed-btn ghost" data-undo style="display:none">تراجع عن الصورة</button></div>' +
          '<div class="agp-ed-hint">PNG أو JPG أو WEBP — نقصّها ونضغطها تلقائياً</div>' +
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
        showToast('تم حفظ التعديلات ✅');
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
      already_verified: 'إيميلك مؤكد من قبل ✅',
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
        : 'أرسلنا الرمز إلى ' + sentTo + ' — صالح 15 دقيقة. (لو ما لقيته شوف مجلد الرسائل المزعجة)';
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
          if (r && r.success) { busy = false; close(); showToast('تم تأكيد إيميلك ✅'); if (onDone) onDone(r.email); }
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
      success: 'تم ربط حساب تيك توك بنجاح! ✅',
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
        h('div', { class: 'pf-lock-ic', 'aria-hidden': 'true', text: '👤' }),
        h('div', { class: 'pf-lock-t', text: 'سجّل دخولك عشان تشوف بروفايلك' }),
        h('div', { class: 'pf-lock-d', text: 'بروفايلك فيه نقاطك ومقتنياتك وأدوات البث.' }),
        h('a', { href: 'login.html', class: 'pf-btn pf-btn-primary' }, 'تسجيل الدخول')
      ]));
    } else {
      $('#pfName').textContent = 'تعذّر تحميل البروفايل';
      c.appendChild(h('div', { class: 'pf-lock' }, [
        h('div', { class: 'pf-lock-ic', 'aria-hidden': 'true', text: '⚠️' }),
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
      h('div', { class: 'pf-lock-ic', 'aria-hidden': 'true', text: '🔒' }),
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
    if (hash === 'win-codes') setTimeout(function () { $('#pfContent').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);

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
        if (hash === 'remote-access') go('remote-access'); else renderSideNav();
      }
    }).catch(function () {});
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
