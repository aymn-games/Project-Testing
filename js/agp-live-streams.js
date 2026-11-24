/**
 * ألعاب أيمن — «بثوث شغّالة الآن» بمكتبة الألعاب.
 * منقول كما هو من games.html (المصدر GET /api/public/live-streams + ستريمرز
 * ينتظرون خصم أو فاضين من js/agp-challenge-lobby.js، والدخول المباشر للتحدي).
 * الفرق الوحيد: مكان التركيب صار [data-live-host] بالتصميم الجديد.
 */
(function(){

  // [البثوث الشغّالة الآن] بطاقات للستريمرز اللي متصلين الحين من داخل
  // الألعاب: صورة، اسم، حساب تيك توك، اسم اللعبة، عدد المشاهدين، والآيدي
  // (يفتح البروفايل). المصدر GET /api/public/live-streams ويتحدّث كل 30 ثانية.
  // يُركَّب تحت بطاقة "اتصل بالبث"، ويختفي القسم لو ما فيه أي بث.
  var LIVE_STREAMS_POLL_MS = 15000;

  function ensureLiveStreamsStyles(){
    if (document.getElementById('agp-live-streams-style')) return;
    var st = document.createElement('style');
    st.id = 'agp-live-streams-style';
    st.textContent =
      '.agp-live-streams{margin:0 0 28px;direction:rtl}' +
      '.agp-live-streams[hidden]{display:none}' +
      '.agp-live-head{display:flex;align-items:center;gap:8px;margin-bottom:14px;font-family:"Noto Kufi Arabic",sans-serif;font-size:15px;font-weight:700;color:#f4f2fb}' +
      '.agp-live-head-dot{width:8px;height:8px;border-radius:50%;background:#f43f5e;box-shadow:0 0 0 4px rgba(244,63,94,.16);animation:agpLiveDot 1.6s ease-in-out infinite}' +
      '.agp-live-head-count{font-size:12.5px;font-weight:600;color:#8f88a3}' +
      // الشريط: سكرول أفقي حقيقي (يتحرك تلقائياً بـJS، ويقدر المستخدم يسحبه بإصبعه/الماوس أو يوقفه).
      '.agp-live-head{flex-wrap:wrap}' +
      '.agp-live-ctl{margin-inline-start:auto;display:flex;align-items:center;gap:6px}' +
      '.agp-live-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;min-width:34px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#e9e4f7;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:background .2s,border-color .2s,transform .15s;-webkit-tap-highlight-color:transparent}' +
      '.agp-live-btn:hover{background:rgba(178,140,245,.16);border-color:rgba(178,140,245,.45)}' +
      '.agp-live-btn:active{transform:scale(.95)}' +
      '.agp-live-btn:focus-visible{outline:2px solid #b28cf5;outline-offset:2px}' +
      '.agp-live-btn.icon{padding:0;width:34px}' +
      '.agp-live-btn svg{width:15px;height:15px;flex:none}' +
      '.agp-live-btn[aria-pressed="true"]{background:rgba(178,140,245,.2);border-color:rgba(178,140,245,.6);color:#fff}' +
      '.agp-live-marquee{direction:ltr;overflow-x:auto;overflow-y:hidden;padding:6px 0 10px;scrollbar-width:none;overscroll-behavior-x:contain;cursor:grab;touch-action:pan-x pan-y;-webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}' +
      '.agp-live-marquee::-webkit-scrollbar{display:none}' +
      '.agp-live-marquee.dragging{cursor:grabbing;user-select:none}' +
      '.agp-live-marquee.dragging .agp-live-card{pointer-events:none}' +
      '.agp-live-track{direction:ltr;display:flex;width:max-content}' +
      '.agp-live-track .agp-live-card{direction:rtl;flex:0 0 330px;margin-right:14px;box-sizing:border-box}' +
      '.agp-live-track .agp-live-meta{flex-wrap:nowrap}' +
      // «عرض الكل»: شبكة ثابتة بنسخة وحدة من البطاقات
      '.agp-live-streams.all .agp-live-marquee{overflow:visible;cursor:auto;-webkit-mask-image:none;mask-image:none}' +
      '.agp-live-streams.all .agp-live-track{direction:rtl;width:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}' +
      '.agp-live-streams.all .agp-live-track .agp-live-card{margin:0}' +
      '.agp-live-streams.all .agp-live-track [data-live-dup]{display:none}' +
      '.agp-live-streams.all [data-live-nav]{display:none}' +
      '@media (max-width:640px){.agp-live-track .agp-live-card{flex-basis:290px;margin-right:10px}.agp-live-btn .agp-live-btn-t{display:none}.agp-live-btn{padding:0;width:34px}.agp-live-streams.all .agp-live-track{grid-template-columns:minmax(0,1fr)}}' +
      '.agp-live-card{display:flex;align-items:center;gap:12px;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,rgba(24,21,36,.92),rgba(14,13,22,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 18px 40px -32px rgba(0,0,0,1);color:inherit;text-decoration:none;transition:transform .25s,border-color .25s,box-shadow .25s}' +
      '.agp-live-card:hover{transform:translateY(-3px);border-color:rgba(178,140,245,.32);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 22px 46px -30px rgba(122,63,212,.55)}' +
      '.agp-live-avatar{position:relative;flex:none;width:56px;height:56px}' +
      '.agp-live-avatar-img,.agp-live-avatar-ph{display:block;width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #f43f5e;box-shadow:0 0 0 3px rgba(244,63,94,.14);box-sizing:border-box;background:#1e1a2e}' +
      '.agp-live-avatar-ph{display:flex;align-items:center;justify-content:center;font-weight:700;color:#d9cff2;background:linear-gradient(135deg,#2e2547,#1a1628)}' +
      '.agp-live-tag{position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);padding:1px 7px;border-radius:6px;background:#e11d48;border:2px solid #15131f;color:#fff;font-size:9.5px;font-weight:800;letter-spacing:.8px;line-height:1.5}' +
      '.agp-live-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}' +
      '.agp-live-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}' +
      '.agp-live-name{min-width:0;font-size:15px;font-weight:700;color:#f4f2fb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.agp-live-watch{flex:none;display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:999px;background:linear-gradient(180deg,#f43f5e,#e11d48);color:#fff;font-size:12px;font-weight:700;box-shadow:0 6px 16px -8px rgba(225,29,72,.9),inset 0 1px 0 rgba(255,255,255,.25);transition:filter .2s,transform .2s}' +
      '.agp-live-watch svg{width:11px;height:11px}' +
      '.agp-live-card:hover .agp-live-watch{filter:brightness(1.1);transform:translateX(-2px)}' +
      '.agp-live-acc{font-size:12.5px;color:#a596cf;direction:ltr;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.agp-live-game{display:flex;align-items:center;gap:5px;font-size:12.5px;color:#b9b2c9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.agp-live-game svg,.agp-live-chip svg{flex:none;width:13px;height:13px}' +
      '.agp-live-game svg{color:#9a7fe0}' +
      '.agp-live-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:3px}' +
      '.agp-live-chip{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);font-size:11.5px;color:#8f88a3}' +
      '.agp-live-chip b{font-weight:700;color:#ece8f6}' +
      '.agp-live-chip-viewers svg{color:#f43f5e}' +
      '.agp-live-chip-id{direction:ltr;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}' +
      // بطاقات الستريمرز المتاحين: ينتظر خصم («دخول مباشر») وفاضي بمكتبة الألعاب («تحدّاه»).
      '.agp-live-card.wait .agp-live-avatar-img,.agp-live-card.wait .agp-live-avatar-ph{border-color:#fbbf24;box-shadow:0 0 0 3px rgba(251,191,36,.16)}' +
      '.agp-live-card.wait .agp-live-tag{background:#d97706}' +
      '.agp-live-card.wait .agp-live-watch{background:linear-gradient(180deg,#10b981,#059669);box-shadow:0 6px 16px -8px rgba(5,150,105,.9),inset 0 1px 0 rgba(255,255,255,.25)}' +
      '.agp-live-card.idle .agp-live-avatar-img,.agp-live-card.idle .agp-live-avatar-ph{border-color:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.14)}' +
      '.agp-live-card.idle .agp-live-tag{background:#059669}' +
      '.agp-live-card.idle .agp-live-watch{background:linear-gradient(180deg,#8a4fe8,#7a3fd4);box-shadow:0 6px 16px -8px rgba(122,63,212,.9),inset 0 1px 0 rgba(255,255,255,.25)}' +
      '@keyframes agpLiveDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(1.35)}}' +
      '@media (prefers-reduced-motion:reduce){.agp-live-head-dot{animation:none}}';
    document.head.appendChild(st);
  }

  function arNum(n){ return String(n).replace(/[0-9]/g, function(d){ return '٠١٢٣٤٥٦٧٨٩'[d]; }); }

  var LIVE_ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var LIVE_ICON_GAME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-3.96 3.43l-.7 4.9A2.5 2.5 0 0 0 6.6 15.2L8 13.5h8l1.4 1.7a2.5 2.5 0 0 0 4.56-1.87l-.7-4.9A4 4 0 0 0 17.3 5z"/></svg>';

  // s.kind: 'live' (يلعب الحين) | 'wait' (فاتح شاشة دعوة لعبة بثين وينتظر خصم) | 'idle' (فاضي بمكتبة الألعاب)
  var LIVE_JOIN_PAGES = { 'penalty': 'games/penalty/index.html?mode=versus', 'fastest-answer': 'games/fastest-answer/versus.html' };
  var LIVE_JOIN_ERRORS = { not_waiting: 'الستريمر طلع من شاشة الدعوة — جرّب غيره.', opponent_in_match: 'الستريمر بدأ مباراة مع غيرك.', you_in_match: 'عندك مباراة أو تجهيز جاري — خلّصه أول.', not_eligible: 'لازم حساب ستريمر مربوط بتيك توك.', self: 'هذا أنت 🙂' };
  function joinFromLibrary(s){
    var A = window.AGPAuth;
    if (!A || !A.getToken || !A.getToken()) { location.href = 'login.html'; return; }
    A.challengeJoin(s.customId, s.game).then(function(r){
      if (r && r.success) { location.href = LIVE_JOIN_PAGES[s.game] || 'challenge.html'; return; }
      alert(LIVE_JOIN_ERRORS[r && r.error] || 'تعذّر الدخول، حاول مرة ثانية.');
      fetchLiveStreams();
    }).catch(function(){ alert('تعذّر الاتصال، حاول مرة ثانية.'); });
  }

  function buildLiveCard(s){
    var kind = s.kind || 'live';
    var card = document.createElement('a');
    card.className = 'agp-live-card' + (kind === 'live' ? '' : ' ' + kind);
    if (kind === 'live') {
      // الضغط يفتح بث الستريمر نفسه في تيك توك (تبويب جديد).
      card.href = 'https://www.tiktok.com/@' + encodeURIComponent(s.tiktok) + '/live';
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
    } else if (kind === 'wait') {
      card.href = '#';
      card.addEventListener('click', function(e){ e.preventDefault(); joinFromLibrary(s); });
    } else {
      card.href = 'challenge.html';
    }

    var av = document.createElement('div');
    av.className = 'agp-live-avatar';
    function fallbackAvatar(){
      var ph = document.createElement('span');
      ph.className = 'agp-live-avatar-ph';
      ph.textContent = String(s.name || s.tiktok || '?').charAt(0).toUpperCase();
      return ph;
    }
    // الصورة من السيرفر (المخزَّنة بالحساب) بدل رابط تيك توك اللي تنتهي
    // صلاحيته — ولو ما فيه صورة (404) يظهر أول حرف من الاسم.
    var apiBase = (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com';
    var img = document.createElement('img');
    img.className = 'agp-live-avatar-img';
    img.src = apiBase + '/api/public/streamer-avatar?u=' + encodeURIComponent(s.tiktok);
    img.alt = '';
    img.decoding = 'async';
    img.onerror = function(){ img.replaceWith(fallbackAvatar()); };
    av.appendChild(img);
    var tag = document.createElement('span');
    tag.className = 'agp-live-tag';
    tag.textContent = kind === 'wait' ? 'ينتظر' : kind === 'idle' ? 'فاضي' : 'LIVE';
    av.appendChild(tag);

    var info = document.createElement('div');
    info.className = 'agp-live-info';
    var name = document.createElement('div');
    name.className = 'agp-live-name';
    name.textContent = s.name || s.tiktok;
    var acc = document.createElement('div');
    acc.className = 'agp-live-acc';
    acc.textContent = '@' + s.tiktok;
    var game = document.createElement('div');
    game.className = 'agp-live-game';
    game.innerHTML = LIVE_ICON_GAME;
    game.appendChild(document.createTextNode(kind === 'wait' ? (s.gameName || 'لعبة') + ' · ينتظر خصم' : kind === 'idle' ? 'فاتح مكتبة الألعاب' : (s.gameName || 'لعبة')));
    var meta = document.createElement('div');
    meta.className = 'agp-live-meta';
    var viewers = document.createElement('span');
    viewers.className = 'agp-live-chip agp-live-chip-viewers';
    viewers.innerHTML = LIVE_ICON_EYE;
    var count = document.createElement('b');
    // عدد المشاهدين بالأرقام الإنجليزية.
    count.textContent = typeof s.viewers === 'number' ? Number(s.viewers).toLocaleString('en') : '—';
    viewers.appendChild(count);
    viewers.appendChild(document.createTextNode(' مشاهد'));
    var idChip = document.createElement('span');
    idChip.className = 'agp-live-chip agp-live-chip-id';
    idChip.textContent = 'ID: ' + s.customId;
    if (kind === 'live') meta.appendChild(viewers);
    meta.appendChild(idChip);

    // زر «شاهد» — البطاقة كلها رابط للبث، فالزر عنصر شكلي داخلها (ما نحط رابط داخل رابط).
    var top = document.createElement('div');
    top.className = 'agp-live-top';
    var watch = document.createElement('span');
    watch.className = 'agp-live-watch';
    watch.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>';
    watch.appendChild(document.createTextNode(kind === 'wait' ? 'دخول مباشر' : kind === 'idle' ? 'تحدّاه' : 'شاهد'));
    top.appendChild(name);
    top.appendChild(watch);
    info.appendChild(top);
    info.appendChild(acc);
    info.appendChild(game);
    info.appendChild(meta);
    card.appendChild(av);
    card.appendChild(info);
    return card;
  }

  function buildLiveStreamsSection(){
    var section = document.createElement('div');
    section.className = 'agp-live-streams';
    section.setAttribute('data-live-streams', '1');
    section.hidden = true;
    var head = document.createElement('div');
    head.className = 'agp-live-head';
    head.innerHTML = '<span class="agp-live-head-dot"></span><span>بثوث شغّالة الآن</span><span class="agp-live-head-count" data-live-count></span>' +
      '<div class="agp-live-ctl">' +
        '<button type="button" class="agp-live-btn icon" data-live-nav="prev" aria-label="السابق">' + LIVE_ICON_RIGHT + '</button>' +
        '<button type="button" class="agp-live-btn icon" data-live-nav="next" aria-label="التالي">' + LIVE_ICON_LEFT + '</button>' +
        '<button type="button" class="agp-live-btn" data-live-pause aria-pressed="false"></button>' +
        '<button type="button" class="agp-live-btn" data-live-all aria-expanded="false"></button>' +
      '</div>';
    var grid = document.createElement('div');
    grid.className = 'agp-live-marquee';
    grid.setAttribute('data-live-scroller', '1');
    grid.setAttribute('aria-label', 'بثوث شغّالة الآن — اسحب للتنقّل');
    var track = document.createElement('div');
    track.className = 'agp-live-track';
    track.setAttribute('data-live-track', '1');
    grid.appendChild(track);
    section.appendChild(head);
    section.appendChild(grid);
    initLiveScroller(section);
    return section;
  }

  /* حركة الشريط: تمرير تلقائي ناعم (~٤٠ بكسل/ث) بـrequestAnimationFrame على
     سكرول حقيقي — فالمستخدم يقدر يسحبه بإصبعه أو بالماوس أو عجلة الماوس.
     يوقف مؤقتاً مع اللمس/السحب/المرور بالماوس ويرجع بعد ثواني، و«إيقاف الحركة»
     يثبّته (ويتذكّر الاختيار بالجهاز). «عرض الكل» يحوّله لشبكة بدون حركة. */
  var LIVE_ICON_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  var LIVE_ICON_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';
  var LIVE_ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';
  var LIVE_ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>';
  var LIVE_ICON_GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
  var LIVE_PAUSE_KEY = 'agp_live_strip_paused';
  function livePausedPref(){ try { return localStorage.getItem(LIVE_PAUSE_KEY) === '1'; } catch (e) { return false; } }

  function initLiveScroller(section){
    var sc = section.querySelector('[data-live-scroller]');
    var pauseBtn = section.querySelector('[data-live-pause]');
    var allBtn = section.querySelector('[data-live-all]');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var st = { pinned: livePausedPref() || reduce, hold: 0, hover: false, pos: 0, last: 0, setAt: -1, all: false };
    section.__live = st;
    var SPEED = 40; // بكسل بالثانية

    function paintButtons(){
      pauseBtn.setAttribute('aria-pressed', st.pinned ? 'true' : 'false');
      pauseBtn.innerHTML = (st.pinned ? LIVE_ICON_PLAY : LIVE_ICON_PAUSE) + '<span class="agp-live-btn-t">' + (st.pinned ? 'تشغيل الحركة' : 'إيقاف الحركة') + '</span>';
      pauseBtn.setAttribute('aria-label', st.pinned ? 'تشغيل حركة الشريط' : 'إيقاف حركة الشريط');
      allBtn.setAttribute('aria-expanded', st.all ? 'true' : 'false');
      allBtn.innerHTML = LIVE_ICON_GRID + '<span class="agp-live-btn-t">' + (st.all ? 'عرض أقل' : 'عرض الكل') + '</span>';
      allBtn.setAttribute('aria-label', st.all ? 'رجوع للشريط' : 'عرض كل البثوث');
    }
    paintButtons();
    pauseBtn.addEventListener('click', function(){
      st.pinned = !st.pinned;
      try { localStorage.setItem(LIVE_PAUSE_KEY, st.pinned ? '1' : '0'); } catch (e) {}
      paintButtons();
    });
    allBtn.addEventListener('click', function(){
      st.all = !st.all;
      section.classList.toggle('all', st.all);
      paintButtons();
      if (!st.all) syncPos();
    });
    // يوقف مؤقتاً (اللمس/السحب/الأسهم) ويرجع بعد ٤ ثواني
    function holdFor(ms){ st.hold = Math.max(st.hold, performance.now() + ms); }
    function half(){ return sc.scrollWidth / 2; }
    function syncPos(){ st.pos = sc.scrollLeft; }
    function step(dir){
      var card = sc.querySelector('.agp-live-card');
      var w = card ? card.getBoundingClientRect().width + 14 : 340;
      holdFor(4000);
      sc.scrollBy({ left: dir * w, behavior: 'smooth' });
    }
    section.querySelector('[data-live-nav="prev"]').addEventListener('click', function(){ step(1); });
    section.querySelector('[data-live-nav="next"]').addEventListener('click', function(){ step(-1); });

    sc.addEventListener('mouseenter', function(){ st.hover = true; });
    sc.addEventListener('mouseleave', function(){ st.hover = false; });
    sc.addEventListener('focusin', function(){ holdFor(6000); });
    sc.addEventListener('touchstart', function(){ holdFor(4000); }, { passive: true });
    sc.addEventListener('wheel', function(){ holdFor(4000); }, { passive: true });
    // تمرير من المستخدم (مو من الحركة التلقائية): نحدّث الموضع ونوقف شوي
    sc.addEventListener('scroll', function(){
      if (Math.abs(sc.scrollLeft - st.setAt) > 2) { syncPos(); if (performance.now() > st.hold - 3500) holdFor(4000); }
    }, { passive: true });

    // سحب بالماوس (الجوال يسحب طبيعي بالإصبع)
    var drag = null;
    sc.addEventListener('pointerdown', function(e){
      if (e.pointerType !== 'mouse' || e.button !== 0 || st.all) return;
      drag = { x: e.clientX, left: sc.scrollLeft, moved: false };
    });
    window.addEventListener('pointermove', function(e){
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; sc.classList.add('dragging'); }
      if (drag.moved) { sc.scrollLeft = drag.left - dx; holdFor(4000); }
    });
    window.addEventListener('pointerup', function(){
      if (!drag) return;
      var moved = drag.moved; drag = null;
      // نخلي كلاس السحب لحظة عشان الضغطة ما تفتح البطاقة بعد السحب
      setTimeout(function(){ sc.classList.remove('dragging'); }, moved ? 60 : 0);
    });

    function tick(now){
      if (!section.isConnected) return; // القالب أعاد بناء الصفحة — النسخة الجديدة لها حلقتها
      var dt = st.last ? Math.min(64, now - st.last) : 0;
      st.last = now;
      var moving = !st.pinned && !st.all && !st.hover && now > st.hold && !document.hidden && sc.scrollWidth > sc.clientWidth + 4;
      if (moving) {
        // يتحرك لليمين (نفس اتجاه الشريط القديم)، ولما يوصل البداية يقفز نص المسافة (النسختين متطابقة)
        st.pos -= SPEED * dt / 1000;
        if (st.pos <= 0) st.pos += half();
        sc.scrollLeft = st.pos;
        st.setAt = sc.scrollLeft;
      } else if (!drag) {
        // ما نخلي المستخدم يوصل الطرف: نلف بنفس الطريقة لو قرّب منه
        var h = half();
        if (h > 0 && sc.scrollLeft < 4) { sc.scrollLeft += h; syncPos(); st.setAt = sc.scrollLeft; }
        else if (h > 0 && sc.scrollLeft > h * 2 - sc.clientWidth - 4) { sc.scrollLeft -= h; syncPos(); st.setAt = sc.scrollLeft; }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderLiveStreams(streams){
    var section = document.querySelector('[data-live-streams]');
    if (!section) return;
    // نعيد البناء فقط لو تغيّرت البيانات — عشان الشريط ما يرجع لأوله كل تحديث.
    var sig = JSON.stringify(streams || []);
    if (section.getAttribute('data-live-sig') === sig) return;
    section.setAttribute('data-live-sig', sig);
    var track = section.querySelector('[data-live-track]');
    track.innerHTML = '';
    var list = streams || [];
    // شريط متحرك بلا نهاية: نكرّر البطاقات لين تغطي عرض الشاشة، ثم نسخة
    // ثانية مطابقة، والحركة تزيح نص المسافة (-50%) وترجع بلا قفزة ملحوظة.
    var copies = list.length ? Math.max(1, Math.ceil(Math.max(window.innerWidth, 1600) / (list.length * 344))) : 0;
    for (var half = 0; half < 2; half++) {
      for (var c = 0; c < copies; c++) {
        list.forEach(function(s){
          var card = buildLiveCard(s);
          if (half || c) { card.setAttribute('aria-hidden', 'true'); card.tabIndex = -1; card.setAttribute('data-live-dup', '1'); }
          track.appendChild(card);
        });
      }
    }
    // نبدأ من نص المسافة عشان الحركة (لليمين) والسحب بالاتجاهين يلقون بطاقات
    var sc = section.querySelector('[data-live-scroller]');
    requestAnimationFrame(function(){
      if (!sc) return;
      sc.scrollLeft = sc.scrollWidth / 2;
      if (section.__live) { section.__live.pos = sc.scrollLeft; section.__live.setAt = sc.scrollLeft; }
    });
    section.querySelector('[data-live-count]').textContent = streams && streams.length ? '(' + arNum(streams.length) + ')' : '';
    section.hidden = !(streams && streams.length);
  }

  function fetchLiveStreams(){
    if (document.hidden || !window.fetch) return;
    var base = (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com';
    var lobby = window.AGPChallengeLobby ? window.AGPChallengeLobby.load() : Promise.resolve({ waiting: [], idle: [] });
    Promise.all([
      fetch(base + '/api/public/live-streams').then(function(res){ return res.json(); }).catch(function(){ return null; }),
      lobby
    ]).then(function(all){
      var d = all[0], L = all[1] || {};
      if (!(d && d.success) && !(L.waiting || []).length && !(L.idle || []).length) return;
      // ينتظرون خصم أول، بعدهم اللي يلعبون، وآخر شي الفاضين بالمكتبة (بدون تكرار نفس الستريمر).
      var seen = {}, list = [];
      function add(arr, kind){ (arr || []).forEach(function(x){ var k = String(x.tiktok || '').toLowerCase(); if (!k || seen[k]) return; seen[k] = true; list.push(Object.assign({}, x, { kind: kind })); }); }
      add(L.waiting, 'wait'); add(d && d.streams, 'live'); add(L.idle, 'idle');
      renderLiveStreams(list);
    }).catch(function(){});
  }

  function mountLiveStreams(){
    if (document.querySelector('[data-live-streams]')) return true;
    var host = document.querySelector('[data-live-host]');
    if (!host) return false;
    ensureLiveStreamsStyles();
    host.appendChild(buildLiveStreamsSection());
    fetchLiveStreams();
    return true;
  }

  // القالب يعيد بناء الصفحة بعد التحميل — نعيد التركيب لو انمسح القسم.
  var __liveTries = 0;
  var __liveTimer = setInterval(function(){
    __liveTries++;
    mountLiveStreams();
    if (__liveTries >= 30) clearInterval(__liveTimer);
  }, 300);
  setInterval(function(){ if (mountLiveStreams()) fetchLiveStreams(); }, LIVE_STREAMS_POLL_MS);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) fetchLiveStreams(); });

})();
