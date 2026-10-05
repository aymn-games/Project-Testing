/**
 * AGP SNAKES & LADDERS — "السلم والثعبان" (لعبة أصلية داخل المنصة، ملف
 * Plugin مستقل بنفس نمط games/elimination-roulette).
 *
 * شاشة اللعب مبنية حرفياً على ملف التصميم design_handoff_game_screen
 * (Snakes and Ladders GUI.dc.html + README.md): الهيدر، الشريط الجانبي
 * (صاحب الدور/الدور التالي/مؤقت 15 ثانية/النرد ثلاثي الأبعاد)، اللوحة
 * 1.4:1 بترقيم متعرّج يبدأ من أسفل اليمين، السلالم والثعابين، شريط الحالة
 * السفلي، الثيمات الثلاثة، لوحة "إدخال لاعب جديد"، شرح اللعبة، وتأكيد الخروج.
 *
 * الأوامر بالشات: صاحب الدور فقط يكتب "دور" / "دوران" / "ارم النرد" /
 * "roll" خلال 15 ثانية، وإلا يروح عليه الدور. الوصول للمربع 100 بالعدد
 * المطابق = فوز، وتستمر المباراة حتى يكتمل عدد الفائزين (1/2/3).
 *
 * شاشة الإعدادات، اللوبي، طبقة "جاري الاتصال" وبطاقة الفوز — منسوخة من
 * تنسيق روليت الإقصاء (نفس الـCSS، بادئة sl- بدل er-)، بدون أي تعديل على
 * الملفات المشتركة.
 *
 * الاعتماديات (بنفس ترتيب index.html القياسي): js/agp-core.js …
 * js/agp-bootstrap.js، ثم js/agp-player-card.js، ثم js/agp-game-shell.js.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'snakes-ladders';
    var GAME_NAME = 'السلم والثعبان';

    var C_ACCENT = '#7c3aed';
    var C_ACCENT2 = '#00c2ff';
    var C_PINK = '#ff4dff';

    // مدة الدور (طلب صريح + TURN_TIME بملف التصميم)
    var TURN_TIME = 15;
    var MAX_PLAYERS = 25;

    // أوامر رمي النرد بالشات (بعد التطبيع — راجع normalizeCommand)
    var ROLL_COMMANDS = ['دور', 'دوران', 'ارم النرد', 'roll'];

    // من ملف التصميم حرفياً
    var LADDERS = { 4: 14, 22: 56, 28: 84, 29: 53, 36: 44, 50: 67, 80: 100 };
    var SNAKES = { 16: 6, 47: 26, 49: 13, 62: 19, 87: 24, 91: 46, 95: 75, 98: 78 };
    var DICE_ROT = { 1: [0, 0], 2: [90, 0], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [0, 180] };
    var AR = 1.4;
    var THEMES = {
        night: { label: 'ليلي', page: 'radial-gradient(120% 90% at 50% 0%, #101a33 0%, #0a0e1a 55%, #060811 100%)', a: '#141f3d', b: '#101830', top: '#1c2444' },
        emerald: { label: 'زمردي', page: 'radial-gradient(120% 90% at 50% 0%, #0f2a26 0%, #0a1714 55%, #050c0a 100%)', a: '#133530', b: '#0f2a26', top: '#1a3f38' },
        wine: { label: 'عنّابي', page: 'radial-gradient(120% 90% at 50% 0%, #2e1520 0%, #1a0c12 55%, #0d0609 100%)', a: '#351a26', b: '#2a141e', top: '#40202e' }
    };
    var SNAKE_COLORS = [
        ['#3fa9e0', '#1d6fa8'], ['#4fd18a', '#1f9e5c'], ['#c968e0', '#8f2fb8'],
        ['#ff8b4d', '#d85f1d'], ['#ff5f8f', '#d82a5c'], ['#e0c93f', '#b89317']
    ];
    var CLUSTER = [
        [{ dx: 0, dy: 0 }],
        [{ dx: -2.5, dy: 0 }, { dx: 2.5, dy: 0 }],
        [{ dx: 0, dy: -2.1 }, { dx: -2.4, dy: 2.1 }, { dx: 2.4, dy: 2.1 }],
        [{ dx: -2.2, dy: -2.1 }, { dx: 2.2, dy: -2.1 }, { dx: -2.2, dy: 2.1 }, { dx: 2.2, dy: 2.1 }]
    ];
    var PIP_MAP = {
        1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]],
        4: [[1, 1], [1, 3], [3, 1], [3, 3]], 5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
        6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]]
    };
    var ROLL_APPLY_MS = 1150;
    var PAUSE_ON_SQUARE_MS = 1000;   // الوقوف على رأس الثعبان / بداية السلم قبل الانتقال
    var SLIDE_MS = 900;              // مدة الانزلاق/الصعود
    var EVENT_SHOW_MS = 2000;        // مدة ظهور تبويب الحدث
    var EVENT_ANIM_MS = 320;         // مدة أنيميشن الظهور/الاختفاء
    var WIN_END_DELAY_MS = 1800;

    function ballFor(hue) {
        return 'radial-gradient(circle at 32% 26%, oklch(0.72 0.14 ' + hue + ') 0%, oklch(0.52 0.16 ' + hue + ') 55%, oklch(0.34 0.12 ' + hue + ') 100%)';
    }

    /* ======================================================================
     *  0) الصوت — نفس نغمات ملف التصميم (WebAudio)، تتوقف بزر 🔇
     * ==================================================================== */
    var _audioCtx = null;
    var _sound = true;
    function beep(freq, dur, type) {
        if (!_sound) return;
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            _audioCtx = _audioCtx || new Ctx();
            var ac = _audioCtx, o = ac.createOscillator(), g = ac.createGain();
            o.type = type || 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
            o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur + 0.02);
        } catch (e) { /* الصوت طبقة تحسين فقط */ }
    }

    /* ======================================================================
     *  1) حالة المباراة الداخلية
     * ==================================================================== */
    var _settings = null;
    var _startedAt = null;
    var _matchActive = false;
    var _roster = [];            // كل لاعبي المباراة (للوحة ولإعادة المباراة بنفس اللاعبين)
    var _order = [];             // اللاعبون اللي لسا يلعبون (بدون الفائزين)
    var _positions = {};         // playerId -> رقم المربع (يبدأ من 1)
    var _hues = {};              // playerId -> درجة لون الكرة (hue)
    var _winners = [];           // بترتيب الوصول للكأس
    var _turnIdx = 0;
    var _rolling = false;
    var _dice = 4;
    var _spinX = 0;
    var _spinY = 0;
    var _timeLeft = TURN_TIME;
    var _turnInterval = null;
    var _pendingTimeouts = [];
    var _commentUnsub = null;
    var _theme = 'night';        // يبقى بين المباريات (خارج resetMatchState)
    var _joinOpen = false;
    var _queued = [];            // لاعبون جدد بانتظار "حفظ وإغلاق الدخول"
    var _knownIds = {};          // كل من دخل المباراة (لتجاهل تكرار الدخول)

    function resetMatchState() {
        _settings = null;
        _startedAt = null;
        _matchActive = false;
        _roster = [];
        _order = [];
        _positions = {};
        _hues = {};
        _winners = [];
        _turnIdx = 0;
        _rolling = false;
        _timeLeft = TURN_TIME;
        _joinOpen = false;
        _queued = [];
        _knownIds = {};
        stopTurnTimer();
        clearPendingTimeouts();
        unwireCommentListener();
    }

    function later(fn, ms) {
        var id = window.setTimeout(function () {
            _pendingTimeouts = _pendingTimeouts.filter(function (x) { return x !== id; });
            fn();
        }, ms);
        _pendingTimeouts.push(id);
        return id;
    }
    function clearPendingTimeouts() {
        _pendingTimeouts.forEach(function (id) { window.clearTimeout(id); });
        _pendingTimeouts = [];
    }

    function liveSettings() {
        return (AGP.gameShell && typeof AGP.gameShell.getSettings === 'function') ? AGP.gameShell.getSettings() : (_settings || {});
    }
    /* ======================================================================
     *  2) أدوات DOM صغيرة
     * ==================================================================== */
    function el(id) { return document.getElementById(id); }
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }
    function playerLabel(p) { return (p && (p.name || p.id)) || '—'; }

    // نفس دالة روليت الإقصاء — اليوزر الحقيقي (uniqueId) من player.id
    // وليس الاسم المعروض، لمطابقة نظام النقاط الصحيحة.
    function tiktokUsernameFor(player) {
        var id = (player && player.id) || '';
        if (id.indexOf('tiktok:') === 0) return id.slice('tiktok:'.length);
        return (player && (player.name || player.id)) || '';
    }

    // تطبيع أمر الشات: حروف صغيرة، توحيد الألف، حذف التشكيل والتطويل
    // وعلامات الترقيم بالأطراف، ودمج المسافات.
    function normalizeCommand(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/[ً-ْـ]/g, '')
            .replace(/[أإآ]/g, 'ا')
            .replace(/[!?.,،؟…\s]+$/g, '')
            .replace(/^[!?.,،؟…\s]+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    function isRollCommand(text) {
        return ROLL_COMMANDS.indexOf(normalizeCommand(text)) !== -1;
    }

    function ensureZainFont() {
        if (el('sl-zain-font-link')) return;
        var sheet = document.createElement('link');
        sheet.id = 'sl-zain-font-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Zain:ital,wght@0,200;0,300;0,400;0,700;0,800;0,900;1,300;1,400&display=swap';
        document.head.appendChild(sheet);
    }
    function ensureDesignFonts() {
        if (el('sl-design-fonts-link')) return;
        var sheet = document.createElement('link');
        sheet.id = 'sl-design-fonts-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;500;600;700&family=Cairo:wght@600;700;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap';
        document.head.appendChild(sheet);
    }

    /* ======================================================================
     *  3) الأنماط
     * ==================================================================== */
    function injectStageStyles() {
        if (el('sl-stage-styles')) return;
        ensureZainFont();
        ensureDesignFonts();
        var style = document.createElement('style');
        style.id = 'sl-stage-styles';
        style.textContent = [
            ':root{--sl-accent:' + C_ACCENT + ';--sl-accent2:' + C_ACCENT2 + ';--sl-pink:' + C_PINK + ';}',
            'html,body{margin:0 !important;padding:0 !important;}',

            /* لوبي الدخول الإضافي داخل المباراة — نفس بطاقات اللوبي الأساسي (217×57) */
            // عمودين ثابتين (2×217 + 16 = 450px) داخل صندوق عرضه 540px، والقائمة
            // وحدها تتمرّر (شريط تمرير مخفي) فما ياكل من العرض.
            '#sl-join-list{list-style:none;margin:0;padding:12px 0 16px;display:grid;flex:1;min-height:0;overflow-y:auto;',
            'scrollbar-width:none;',
            'grid-template-columns:repeat(2,217px);column-gap:16px;row-gap:20px;justify-content:center;',
            'justify-items:center;align-items:end;align-content:start;}',
            '#sl-join-list li{position:relative;display:flex;align-items:center;padding:0;}',
            '#sl-join-list .agp-player-remove-btn{position:absolute;border:2px solid rgba(10,6,18,0.9);',
            'border-radius:50%;cursor:pointer;font-weight:900;line-height:1;padding:0;}',
            '#sl-join-list .sl-join-empty{grid-column:1 / -1;width:100%;box-sizing:border-box;}',
            '#sl-join-list::-webkit-scrollbar{display:none;}',
            '@media (max-width:560px){#sl-join-list{grid-template-columns:217px;}}',
            '#sl-join-list .agp-pcard{width:217px !important;height:57px !important;',
            'box-sizing:border-box !important;padding:0 3px 0 28px !important;gap:6px !important;',
            'border-radius:24px !important;background:rgba(217,217,217,.3) !important;',
            'border:2px solid #000 !important;}',
            '#sl-join-list .agp-pcard-avatar-basic{width:48px !important;height:48px !important;',
            'background:#D9D9D9 !important;border:none !important;}',
            '#sl-join-list .agp-pcard-name-basic{flex:1 1 auto !important;width:auto !important;',
            'min-width:0 !important;height:auto !important;margin:0 !important;padding:0 !important;',
            'font-size:20px !important;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'font-weight:700 !important;color:#fff !important;background:none !important;border:none !important;}',
            '#sl-join-list .agp-pcard-avatar-basic--fallback{font-size:15px !important;color:#3a2f4a !important;}',
            '#sl-join-list li:has(> .agp-pcard) .agp-player-remove-btn{',
            'top:50% !important;left:7px !important;right:auto !important;transform:translateY(-50%);',
            'width:16px !important;height:16px !important;font-size:9px !important;z-index:5;}',
            '#sl-join-list li:has(> .agp-pcard-tpl){width:217px !important;height:57px !important;',
            'overflow:visible !important;display:flex !important;',
            'flex-direction:row !important;align-items:center !important;justify-content:center !important;}',
            '#sl-join-list .agp-pcard-tpl{zoom:0.7282;flex-shrink:0 !important;}',
            '#sl-join-list li:has(> .agp-pcard-tpl) .agp-player-remove-btn{',
            'top:50% !important;left:7px !important;right:auto !important;transform:translateY(-50%);',
            'width:16px !important;height:16px !important;font-size:9px !important;z-index:5;}',
            '#sl-join-list .agp-player-remove-btn{',
            'background:rgba(224,115,111,.18) !important;border-color:rgba(224,115,111,.55) !important;',
            'color:#e0736f !important;}',
            '#sl-join-list .agp-player-remove-btn:hover{',
            'background:rgba(224,115,111,.3) !important;color:#ff9b96 !important;}',
            /* ---- شاشة اللعب — قيم ملف التصميم حرفياً ---- */
            'body.sl-game-on #agp-persistent-header{display:none !important;}',
            '#sl-stage{position:fixed;inset:0;z-index:10;overflow-y:auto;direction:ltr;display:flex;flex-direction:column;',
            'min-height:100vh;font-family:Cairo,system-ui,sans-serif;color:#e8edf7;}',
            '#sl-stage *{box-sizing:border-box;}',
            '#sl-stage button{font-family:Cairo,sans-serif;}',
            '@keyframes sl-pop{0%{scale:0.85;}60%{scale:1.06;}100%{scale:1;}}',

            /* الهيدر */
            '.sl-header{position:relative;z-index:20;height:64px;flex:none;width:100%;background:#0d1428;',
            'border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;',
            'justify-content:space-between;padding:0 18px;gap:12px;direction:rtl;}',
            '.sl-brand{display:flex;align-items:center;gap:10px;}',
            '.sl-brand-tile{width:34px;height:34px;border-radius:10px;background:#16b3c9;display:flex;',
            'align-items:center;justify-content:center;font-size:16px;}',
            '.sl-brand-title{font-family:"Baloo Bhaijaan 2",Cairo,sans-serif;font-size:20px;font-weight:800;color:#ffffff;}',
            '.sl-tools{display:flex;align-items:center;gap:8px;}',
            '.sl-hbtn{padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:#131c36;',
            'color:#cfe6f0;font-size:13px;font-weight:700;cursor:pointer;}',
            '.sl-hbtn:hover{background:#1a2544;}',
            '.sl-hbtn-round{width:36px;height:36px;padding:0;font-size:14px;}',
            '.sl-hbtn-exit{border-color:rgba(230,57,70,0.45);color:#ffb3b9;}',
            '.sl-hbtn-exit:hover{background:rgba(230,57,70,0.2);}',
            '.sl-theme-wrap{position:relative;}',
            '.sl-theme-menu{position:absolute;top:calc(100% + 8px);left:0;min-width:170px;display:flex;',
            'flex-direction:column;gap:4px;padding:6px;border-radius:14px;background:#10182f;',
            'border:1px solid rgba(255,255,255,0.12);box-shadow:0 16px 36px rgba(0,0,0,0.5);}',
            '.sl-theme-menu[hidden]{display:none;}',
            '.sl-theme-opt{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;',
            'border:1px solid transparent;background:transparent;color:#e8edf7;font-size:13px;font-weight:700;',
            'cursor:pointer;text-align:right;}',
            '.sl-theme-opt:hover{background:rgba(255,255,255,0.06);}',
            '.sl-theme-opt.sl-on{border-color:rgba(255,209,102,0.6);background:rgba(255,209,102,0.08);}',
            '.sl-theme-sw{width:18px;height:18px;flex:none;border-radius:6px;border:1px solid rgba(255,255,255,0.2);}',

            /* المحتوى */
            '#sl-main{flex:1 0 auto;width:100%;display:grid;grid-template-columns:minmax(240px,280px) 1fr;gap:16px;',
            'align-items:start;padding:14px 18px;max-width:1920px;margin:0 auto;direction:ltr;}',
            '.sl-aside{display:flex;flex-direction:column;gap:14px;min-width:0;direction:rtl;}',
            '.sl-card{border-radius:18px;background:#10182f;border:1px solid rgba(255,255,255,0.08);}',
            '.sl-card-turn{padding:14px;display:flex;flex-direction:column;gap:12px;}',
            '.sl-cur{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:#0d1428;',
            'border:2px solid rgba(255,209,102,0.55);}',
            '.sl-av{flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;',
            'font-family:"Baloo Bhaijaan 2",Cairo,sans-serif;font-weight:800;color:#fff;}',
            '.sl-av img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.sl-av-cur{width:58px;height:58px;border:2px solid rgba(255,255,255,0.85);font-size:24px;}',
            '.sl-av-next{width:40px;height:40px;border:2px solid rgba(255,255,255,0.6);font-size:17px;}',
            '.sl-info{flex:1;min-width:0;}',
            '.sl-lbl-gold{font-size:11px;font-weight:800;color:#ffd166;}',
            '.sl-lbl-dim{font-size:11px;font-weight:800;color:#7fa9bd;}',
            '.sl-cur-name{font-size:18px;font-weight:900;color:#ffffff;line-height:1.3;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap;}',
            '.sl-next-name{font-size:15px;font-weight:900;color:#e8edf7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '.sl-sq{font-size:12px;color:#9dc6d9;}',
            '.sl-sq b{font-weight:900;color:#ffd166;}',
            '.sl-timer{width:58px;height:58px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;}',
            '.sl-timer-in{width:48px;height:48px;border-radius:50%;background:#0d1428;display:flex;flex-direction:column;',
            'align-items:center;justify-content:center;line-height:1;}',
            '.sl-timer-num{font-family:"Baloo Bhaijaan 2",Cairo,sans-serif;font-size:20px;font-weight:800;}',
            '.sl-timer-unit{font-size:9px;color:#7fa9bd;}',
            '.sl-next{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:#0d1428;',
            'border:1px solid rgba(255,255,255,0.08);}',

            '.sl-card-dice{padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;}',
            '.sl-dice-title{width:100%;font-size:15px;font-weight:900;color:#ffffff;}',
            '.sl-ready{padding:6px 16px;border-radius:999px;background:#103622;border:1px solid rgba(79,209,138,0.4);',
            'color:#4fd18a;font-size:13px;font-weight:800;}',
            '.sl-dice-stage{width:110px;height:110px;display:flex;align-items:center;justify-content:center;perspective:520px;}',
            '.sl-cube{position:relative;width:72px;height:72px;transform-style:preserve-3d;',
            'transition:transform 1.1s cubic-bezier(.2,.9,.25,1);}',
            '.sl-face{position:absolute;inset:0;border-radius:14px;background:linear-gradient(145deg,#1a2548,#0b1224);',
            'border:1px solid rgba(255,209,102,0.45);box-shadow:inset 0 0 14px rgba(0,0,0,0.5);display:grid;',
            'grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:13%;gap:7%;backface-visibility:hidden;}',
            '.sl-pip{border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe9ac,#ffd166 55%,#c99420 100%);',
            'box-shadow:0 0 5px rgba(255,209,102,0.55);}',
            '.sl-btn-roll{width:100%;padding:13px;border:none;border-radius:14px;cursor:pointer;font-weight:900;font-size:16px;',
            'color:#eaf3ff;background:linear-gradient(180deg,#3f7ee8,#1f4fb0);',
            'box-shadow:0 5px 0 #163a80,0 10px 20px rgba(0,0,0,0.35);}',
            '.sl-btn-roll:hover{background:linear-gradient(180deg,#4c8bf5,#2558c2);}',
            '.sl-btn-roll:active{transform:translateY(4px);box-shadow:0 1px 0 #163a80;}',
            '.sl-btn-roll.sl-btn-paused{background:linear-gradient(180deg,#3fbf7a,#1f8a52);box-shadow:0 5px 0 #166b3f,0 10px 20px rgba(0,0,0,0.35);}',
            '.sl-dlg-rules{width:440px;max-height:calc(100vh - 60px);gap:14px;padding:22px;}',
            '.sl-rules{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;overflow-y:auto;}',
            '.sl-rules li{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.8;color:#cfe6f0;',
            'padding:10px 12px;border-radius:12px;background:#0d1428;border:1px solid rgba(255,255,255,0.08);}',
            '.sl-rules li b{color:#ffd166;font-weight:900;white-space:nowrap;}',
            '.sl-rules .sl-rule-ic{font-size:18px;line-height:1.5;flex:none;}',
            '.sl-rules .sl-cmd-pill{font-size:13px;padding:2px 10px;margin:2px;display:inline-block;}',
            '.sl-btn-reset{width:100%;padding:12px;border:1px solid rgba(255,209,102,0.35);border-radius:14px;cursor:pointer;',
            'font-weight:800;font-size:14px;color:#ffd166;background:#1a1608;}',
            '.sl-btn-reset:hover{background:#241d0c;}',
            '.sl-cmd-grid{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;}',
            '.sl-btn-cmd{padding:10px 6px;border:1px solid rgba(63,126,232,0.4);border-radius:12px;cursor:pointer;',
            'font-size:12px;font-weight:800;color:#9dc0ff;background:#0e1730;text-align:center;line-height:1.5;}',
            '.sl-btn-cmd:hover{background:#14204a;}',
            '.sl-btn-cmd span{font-size:10px;opacity:0.7;}',

            /* اللوحة */
            '#sl-board{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-width:0;}',
            /* شريط أوامر رمي النرد تحت اللوحة (يأخذ ~62px من ارتفاع اللوحة) */
            '.sl-cmds{width:100%;max-width:min(calc((100vh - 214px) * 1.4),100%);box-sizing:border-box;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px;',
            'padding:10px 16px;border-radius:14px;background:#10182f;border:1px solid rgba(255,209,102,0.25);direction:rtl;}',
            '.sl-cmds-lbl{font-size:14px;font-weight:800;color:#cfe6f0;}',
            '.sl-cmd-pill{padding:5px 16px;border-radius:999px;background:rgba(255,209,102,0.1);border:1px solid rgba(255,209,102,0.5);',
            'color:#ffd166;font-size:16px;font-weight:900;line-height:1.4;}',
            '.sl-frame{width:100%;max-width:min(calc((100vh - 214px) * 1.4),100%);aspect-ratio:1.4 / 1;position:relative;',
            'padding:10px;border-radius:22px;background:linear-gradient(180deg,#16224a 0%,#0d152f 100%);',
            'box-shadow:0 26px 60px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.06);border:1px solid rgba(255,209,102,0.2);}',
            '.sl-inner{position:absolute;inset:10px;border-radius:14px;overflow:hidden;background:#0c1226;}',
            '.sl-tiles{position:absolute;inset:0;display:grid;grid-template-columns:repeat(10,1fr);',
            'grid-template-rows:repeat(10,1fr);direction:ltr;}',
            '.sl-tile{position:relative;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.045);}',
            '.sl-tile-n{position:absolute;top:6px;left:8px;font-family:"Baloo Bhaijaan 2",Cairo,sans-serif;font-weight:800;',
            'font-size:clamp(15px,2.6vmin,32px);line-height:1;color:#e8edf7;}',
            '.sl-tile-100 .sl-tile-n{color:#ffd166;}',
            '.sl-crown{position:absolute;top:2px;right:4px;font-size:clamp(12px,2.2vmin,26px);}',
            '.sl-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}',
            '.sl-tokens{position:absolute;inset:0.7%;pointer-events:none;container-type:size;}',
            '.sl-tok{position:absolute;aspect-ratio:1 / 1;border-radius:50%;transform:translate(-50%,-50%);',
            'border:2px solid rgba(255,255,255,0.85);box-shadow:inset 0 -4px 8px rgba(0,0,0,0.3),0 3px 8px rgba(0,0,0,0.4);',
            'display:flex;align-items:center;justify-content:center;overflow:hidden;',
            'font-family:"Baloo Bhaijaan 2",Cairo,sans-serif;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.4);',
            'direction:ltr;transition:left 380ms cubic-bezier(.34,1.4,.64,1),top 380ms cubic-bezier(.34,1.4,.64,1);',
            'animation:sl-pop 320ms ease both;}',
            '.sl-tok img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.sl-tok.sl-tok-slide{z-index:5;transition:left 900ms cubic-bezier(.45,.05,.35,1),top 900ms cubic-bezier(.45,.05,.35,1);',
            'box-shadow:0 0 0 3px rgba(255,209,102,0.9),0 0 22px rgba(255,209,102,0.7);}',
            '.sl-tok.sl-tok-snake.sl-tok-slide{box-shadow:0 0 0 3px rgba(255,107,107,0.9),0 0 22px rgba(255,107,107,0.7);}',

            /* تبويب حدث السلم/الثعبان — 400×400 */
            '#sl-event{position:fixed;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;',
            'pointer-events:none;direction:rtl;}',
            '#sl-event[hidden]{display:none;}',
            '.sl-ev-card{width:400px;height:400px;max-width:92vw;max-height:92vh;box-sizing:border-box;border-radius:22px;',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:22px 24px;text-align:center;',
            'background:linear-gradient(180deg,#16224a 0%,#0b1122 100%);border:2px solid rgba(255,209,102,0.7);',
            'box-shadow:0 30px 70px rgba(0,0,0,0.6),0 0 40px rgba(255,209,102,0.25);',
            'opacity:0;transform:scale(.6) translateY(24px);transition:opacity 320ms ease,transform 320ms cubic-bezier(.34,1.4,.64,1);}',
            '#sl-event.sl-ev-in .sl-ev-card{opacity:1;transform:scale(1) translateY(0);}',
            '#sl-event.sl-ev-out .sl-ev-card{opacity:0;transform:scale(.8) translateY(-20px);transition:opacity 320ms ease,transform 320ms ease;}',
            '#sl-event.sl-ev-snake .sl-ev-card{border-color:rgba(255,107,107,0.75);box-shadow:0 30px 70px rgba(0,0,0,0.6),0 0 40px rgba(255,107,107,0.3);}',
            '.sl-ev-card > *{flex-shrink:0;}',
            '.sl-ev-icon{font-size:34px;line-height:1;}',
            '.sl-ev-title{font-size:24px;font-weight:900;color:#ffd166;}',
            '#sl-event.sl-ev-snake .sl-ev-title{color:#ff6b6b;}',
            '.sl-ev-av{width:100px;height:100px;border:3px solid rgba(255,255,255,0.85);font-size:44px;',
            'box-shadow:0 8px 24px rgba(0,0,0,0.5);}',
            '.sl-ev-name{font-size:22px;font-weight:900;line-height:1.5;color:#ffffff;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '.sl-ev-text{font-size:16px;font-weight:700;line-height:1.7;color:#cfe6f0;}',
            '.sl-ev-text b{font-family:"Baloo Bhaijaan 2",Cairo,sans-serif;font-size:20px;color:#ffd166;}',
            '#sl-event.sl-ev-snake .sl-ev-text b{color:#ff6b6b;}',

            /* شريط الحالة */
            '.sl-status{flex:none;width:100%;padding:12px 18px;display:flex;align-items:center;justify-content:center;gap:8px;',
            'background:#0d1428;border-top:1px solid rgba(255,255,255,0.06);direction:rtl;}',
            '.sl-status-ic{font-size:15px;}',
            '.sl-status-txt{font-size:14px;font-weight:800;color:#cfe6f0;}',

            '@media (max-width:900px){',
            '#sl-main{grid-template-columns:1fr !important;}',
            '#sl-board{order:-1;}}',

            /* النوافذ (إدخال لاعب/شرح/خروج) */
            '.sl-modal-bg{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;}',
            '.sl-modal-bg[hidden]{display:none;}',
            '#sl-join{z-index:50;background:rgba(4,10,20,0.45);}',
            '.sl-join-box{width:540px;max-width:100%;height:600px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;',
            'border-radius:22px;background:rgba(16,24,47,0.3);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
            'border:2px solid rgba(255,209,102,0.55);box-shadow:0 30px 70px rgba(0,0,0,0.45);}',
            '.sl-join-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:18px 20px;',
            'border-bottom:1px solid rgba(255,255,255,0.14);}',
            '.sl-join-title{font-size:20px;font-weight:900;color:#ffffff;}',
            '.sl-x{width:36px;height:36px;display:flex;align-items:center;justify-content:center;',
            'border:1px solid rgba(255,255,255,0.25);border-radius:10px;background:rgba(230,57,70,0.25);color:#ffd0d4;',
            'font-size:16px;font-weight:700;cursor:pointer;}',
            '.sl-x:hover{background:#e63946;color:#fff;}',
            '.sl-join-body{flex:1;min-height:0;padding:18px 20px 0;display:flex;flex-direction:column;gap:14px;}',
            '.sl-join-top{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
            '.sl-join-kw{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px;padding:12px 16px;',
            'border-radius:14px;background:rgba(255,209,102,0.08);border:1px solid rgba(255,209,102,0.35);}',
            '.sl-join-kw span{font-size:15px;font-weight:800;color:#ffffff;}',
            '.sl-join-kw b{font-size:26px;font-weight:900;color:#E2C700;line-height:1.2;}',
            '.sl-open-pill{display:flex;align-items:center;gap:8px;align-self:flex-start;padding:6px 14px;border-radius:999px;',
            'background:rgba(79,209,138,0.18);border:1px solid rgba(79,209,138,0.5);color:#8ff0b8;font-size:13px;font-weight:800;}',
            '.sl-open-dot{width:8px;height:8px;border-radius:50%;background:#4fd18a;}',
            '.sl-join-count{font-size:13px;font-weight:800;color:#ffd166;}',
            '.sl-join-empty{padding:18px;border-radius:14px;border:1px dashed rgba(255,255,255,0.25);text-align:center;',
            'font-size:13px;color:#d6e4f0;}',
            '.sl-q{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:12px;background:rgba(255,255,255,0.08);',
            'border:1px solid rgba(255,255,255,0.14);}',
            '.sl-q-name{flex:1;min-width:0;font-size:14px;font-weight:700;color:#ffffff;}',
            '.sl-q-x{width:24px;height:24px;flex:none;border:1px solid rgba(255,255,255,0.2);border-radius:8px;',
            'background:rgba(230,57,70,0.25);color:#ffd0d4;font-size:12px;font-weight:700;cursor:pointer;}',
            '.sl-q-x:hover{background:#e63946;color:#fff;}',
            '.sl-join-foot{padding:16px 20px;border-top:1px solid rgba(255,255,255,0.14);}',
            '.sl-btn-gold{width:100%;padding:14px;border:none;border-radius:14px;cursor:pointer;font-size:16px;font-weight:900;',
            'color:#4a2000;background:linear-gradient(180deg,#ffdd7a,#f0a91f);box-shadow:0 5px 0 #b9760c;}',
            '.sl-btn-gold:hover{background:linear-gradient(180deg,#ffe79a,#f7b62f);}',
            '.sl-btn-gold:active{transform:translateY(3px);box-shadow:0 2px 0 #b9760c;}',
            '#sl-help{z-index:60;background:rgba(4,10,20,0.8);}',
            '#sl-rules{z-index:65;background:rgba(4,10,20,0.8);}',
            '#sl-players{z-index:55;background:rgba(4,10,20,0.8);}',
            '.sl-dlg-players{width:440px;max-height:calc(100vh - 60px);gap:12px;padding:20px;}',
            '.sl-pl-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;}',
            '.sl-pl-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:12px;',
            'background:#0d1428;border:1px solid rgba(255,255,255,0.08);}',
            '.sl-pl-row.sl-pl-cur{border:2px solid rgba(255,209,102,0.55);}',
            '.sl-av-row{width:36px;height:36px;border:2px solid rgba(255,255,255,0.6);font-size:15px;}',
            '.sl-pl-name{flex:1;min-width:0;font-size:14px;font-weight:800;color:#ffffff;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap;}',
            '.sl-pl-tag{font-size:12px;font-weight:900;color:#ffd166;}',
            '#sl-leave{z-index:70;background:rgba(4,10,20,0.8);}',
            '.sl-dlg{max-width:100%;display:flex;flex-direction:column;border-radius:22px;',
            'background:linear-gradient(180deg,#16224a 0%,#0b1122 100%);border:1px solid rgba(255,255,255,0.12);',
            'box-shadow:0 30px 70px rgba(0,0,0,0.55);}',
            '.sl-dlg-help{width:400px;max-height:calc(100vh - 60px);gap:12px;padding:20px;}',
            '.sl-dlg-leave{width:360px;gap:14px;padding:22px;}',
            '.sl-dlg-head{display:flex;align-items:center;justify-content:space-between;}',
            '.sl-dlg-title{font-size:18px;font-weight:900;color:#ffffff;}',
            '.sl-dlg-x{width:34px;height:34px;border:1px solid rgba(255,255,255,0.16);border-radius:10px;',
            'background:rgba(230,57,70,0.18);color:#ffb3b9;font-size:16px;font-weight:700;cursor:pointer;}',
            '.sl-dlg-x:hover{background:#e63946;color:#fff;}',
            '.sl-dlg-txt{font-size:13.5px;line-height:1.9;color:#cfe6f0;}',
            '.sl-dlg-leave .sl-dlg-txt{line-height:1.8;}',
            '.sl-dlg-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
            '.sl-dlg-cancel{padding:12px;border:1px solid rgba(255,255,255,0.16);border-radius:12px;background:#131c36;',
            'color:#cfe6f0;font-size:14px;font-weight:800;cursor:pointer;}',
            '.sl-dlg-cancel:hover{background:#1a2544;}',
            '.sl-dlg-exit{padding:12px;border:none;border-radius:12px;background:#e63946;color:#fff;font-size:14px;',
            'font-weight:900;cursor:pointer;}',
            '.sl-dlg-exit:hover{background:#f04a57;}',

            /* ---- نافذة بطاقة الفوز (نفس #er-modal-overlay/#er-modal-box) ---- */
            '#sl-modal-overlay{position:fixed;inset:0;z-index:99990;display:none;flex-direction:column;',
            'align-items:center;justify-content:center;gap:18px;padding:16px;background:rgba(8,4,16,0.72);}',
            '#sl-modal-box{width:1300px;max-width:97vw;height:auto;max-height:800px;max-height:min(800px,94vh);overflow-y:auto;box-sizing:border-box;',
            'background:linear-gradient(180deg,#5F3976,#211528);border:2px solid var(--sl-accent);border-radius:20px;',
            'padding:28px 32px;color:#fff;box-shadow:0 0 50px rgba(124,58,237,0.55);}',
            '@keyframes sl-select-fadein{from{opacity:0}to{opacity:1}}',
            '.sl-trophy-third{--agp-trophy-accent:#7de0ff;--agp-trophy-accent-dark:#0e8fb8;',
            '--agp-trophy-border:rgba(125,224,255,.55);--agp-trophy-divider:rgba(125,224,255,.25);',
            '--agp-trophy-label:rgba(125,224,255,.75);--agp-trophy-bg1:rgba(16,28,44,.72);',
            '--agp-trophy-bg2:rgba(10,16,24,.82);}',
            '#sl-home-btn{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.25);color:#f3eefc;}',
            '.agp-field-desc{font-size:11.5px !important;font-weight:400 !important;color:#8f88a3 !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;white-space:normal !important;text-align:right;}',

            '#agp-shell-overlay,#agp-shell-overlay *,',
            '#sl-modal-overlay,#sl-modal-overlay *,#sl-toast-wrap,#sl-toast-wrap *,',
            '#sl-event-log,#sl-event-log *{font-family:"Zain",Cairo,sans-serif !important;}',
            '#sl-toast-wrap{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100020;',
            'display:flex;flex-direction:column;gap:8px;align-items:center;}',
            '.sl-toast{background:rgba(20,8,35,0.92);border:1px solid rgba(124,58,237,0.55);color:#f3eefc;',
            'padding:10px 18px;border-radius:999px;font-size:0.85em;font-weight:700;box-shadow:0 6px 16px rgba(0,0,0,0.35);}',
            '#sl-modal-overlay.sl-winner-backdrop{background:rgba(8,4,16,0.38);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}',
            '#sl-modal-box.sl-winner-panel{background:none;border:none;box-shadow:none;',
            'padding:0;width:auto;max-width:100%;overflow:visible;}',
            '#sl-winner-box{text-align:center;}',
            '#sl-winner-box h2{font-family:Almarai,Cairo,sans-serif;font-size:1.6em;color:#fff;',
            'text-shadow:0 2px 12px rgba(0,0,0,0.65);}',
            '.sl-trophy-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:14px 0 18px;}',
            '.sl-ring-avatar{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#5a2585;display:block;}',
            '.sl-ring-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1.4em;}',
            '.sl-trophy-winner{--agp-trophy-accent:#b28cf5;--agp-trophy-accent-dark:#7c3aed;',
            '--agp-trophy-border:rgba(178,140,245,.55);--agp-trophy-divider:rgba(178,140,245,.25);',
            '--agp-trophy-label:rgba(178,140,245,.75);--agp-trophy-bg1:rgba(28,20,44,.72);',
            '--agp-trophy-bg2:rgba(14,10,24,.82);}',
            '.sl-trophy-most{--agp-trophy-accent:#ff8ef5;--agp-trophy-accent-dark:#a83fa8;',
            '--agp-trophy-border:rgba(255,142,245,.55);--agp-trophy-divider:rgba(255,142,245,.25);',
            '--agp-trophy-label:rgba(255,142,245,.75);--agp-trophy-bg1:rgba(35,18,44,.72);',
            '--agp-trophy-bg2:rgba(18,10,24,.82);}',
            '.sl-winner-actions{display:flex;gap:10px;flex-wrap:wrap;}',
            '.sl-btn-secondary{flex:1;min-width:180px;padding:12px;border-radius:999px;border:none;',
            'font-weight:800;cursor:pointer;font-family:inherit;font-size:0.95em;}',
            '#sl-replay-same-btn{background:linear-gradient(90deg,var(--sl-accent2),var(--sl-accent));color:#0b0616;}',
            '#sl-new-match-btn{background:#fff;border:1px solid var(--sl-accent);color:#5a2585;}',
            '.sl-confetti-piece{position:absolute;top:50%;left:50%;width:8px;height:8px;border-radius:2px;',
            'pointer-events:none;opacity:0;animation:sl-confetti-burst 1.4s ease-out forwards;}',
            '@keyframes sl-confetti-burst{0%{opacity:1;transform:translate(-50%,-50%) translate(0,0) rotate(0deg);}',
            '100%{opacity:0;transform:translate(-50%,-50%) translate(var(--dx),var(--dy)) rotate(540deg);}}',
            '#agp-shell-box:not(.sl-settings-initial-box){background:linear-gradient(180deg,#5F3976,#211528) !important;}',
            '#agp-shell-overlay:has(#agp-shell-box.agp-lobby-box){padding:0 !important;',
            'overflow-y:auto !important;',
            'background:',
            'radial-gradient(60% 45% at 18% 8%,rgba(122,63,212,.22),transparent 70%),',
            'radial-gradient(50% 40% at 88% 40%,rgba(214,168,60,.14),transparent 72%),',
            'radial-gradient(55% 45% at 40% 104%,rgba(48,26,104,.26),transparent 74%),',
            'linear-gradient(180deg,#0d0a14 0%,#08060d 45%,#050508 100%) !important;}',
            '#agp-shell-box.agp-lobby-box{background:none !important;border:none !important;',
            'box-shadow:none !important;position:relative;overflow:hidden;}',
            '#agp-settings-close-btn{color:#ffffff !important;font-weight:900 !important;',
            'text-shadow:0 1px 4px rgba(0,0,0,0.5) !important;}',
            '#agp-shell-box.agp-lobby-box{width:min(94vw,1310px) !important;',
            'max-width:min(94vw,1310px) !important;height:min(94vh,980px) !important;max-height:94vh !important;',
            'height:min(94dvh,980px) !important;max-height:94dvh !important;',
            'display:flex !important;flex-direction:column !important;overflow:hidden !important;}',
            '#agp-shell-box.agp-lobby-box > h2,',
            '#agp-shell-box.agp-lobby-box > .agp-join-hint,',
            '#agp-shell-box.agp-lobby-box > #agp-entrance-stage,',
            '#agp-shell-box.agp-lobby-box > #agp-entrance-settled-list{flex:0 0 auto !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{flex:1 1 auto !important;',
            'min-height:0 !important;overflow-y:auto !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{scrollbar-width:none !important;',
            '-ms-overflow-style:none !important;padding-top:12px !important;',
            'padding-bottom:calc(var(--sl-actions-h,62px) + 16px) !important;',
            'margin-bottom:calc(-1 * var(--sl-actions-h,62px)) !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list::-webkit-scrollbar{display:none !important;}',
            '#sl-lobby-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
            'width:55%;max-width:420px;opacity:0.25;pointer-events:none;z-index:0;}',
            '#agp-shell-box.agp-lobby-box > *:not(#sl-lobby-watermark){position:relative;z-index:1;}',
            '#agp-shell-box.agp-lobby-box h2{text-shadow:none !important;letter-spacing:0 !important;',
            'font-family:"Cairo",sans-serif !important;font-weight:800 !important;font-size:44px !important;',
            'color:#fff !important;line-height:1.3 !important;margin:0 0 6px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint{display:flex !important;flex-wrap:wrap !important;',
            'justify-content:center !important;align-items:center !important;gap:56px !important;',
            'width:100% !important;margin-bottom:22px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint-text{display:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge{order:0;display:inline-flex !important;',
            'align-items:center !important;gap:14px !important;background:none !important;',
            'border:none !important;padding:0 !important;font-family:"Cairo",sans-serif !important;',
            'font-size:44px !important;font-weight:800 !important;line-height:1.2 !important;',
            'color:#E2C700 !important;box-shadow:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge::before{content:"للدخول اكتب في شات البث";',
            'font-family:"Cairo",sans-serif;font-size:22px;font-weight:700;color:#fff;white-space:nowrap;}',
            '#agp-shell-box.agp-lobby-box #agp-lobby-count{position:static !important;order:1 !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge{display:inline-flex !important;',
            'align-items:center !important;justify-content:center !important;width:157px !important;',
            'height:52px !important;box-sizing:border-box !important;padding:0 !important;',
            'background:rgba(217,217,217,.1) !important;border:4px solid #000 !important;',
            'border-radius:26px !important;font-family:"Cairo",sans-serif !important;direction:ltr !important;',
            'font-size:28px !important;font-weight:800 !important;color:#fff !important;',
            'box-shadow:none !important;}',
            '@media (max-width:600px){',
            '#agp-shell-box.agp-lobby-box h2{font-size:26px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint{gap:12px 24px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge{font-size:30px !important;gap:10px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge::before{font-size:16px;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge{width:120px !important;height:44px !important;',
            'font-size:22px !important;border-width:3px !important;}}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{display:grid !important;',
            'grid-template-columns:repeat(auto-fill,217px) !important;column-gap:37px !important;',
            'row-gap:20px !important;justify-content:center !important;',
            'justify-items:center !important;align-items:end !important;align-content:start !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard{width:217px !important;height:57px !important;',
            'box-sizing:border-box !important;padding:0 3px 0 28px !important;gap:6px !important;',
            'border-radius:24px !important;background:rgba(217,217,217,.3) !important;',
            'border:2px solid #000 !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-avatar-basic{width:48px !important;height:48px !important;',
            'background:#D9D9D9 !important;border:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-name-basic{flex:1 1 auto !important;width:auto !important;',
            'min-width:0 !important;height:auto !important;margin:0 !important;padding:0 !important;',
            'font-size:20px !important;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'font-weight:700 !important;color:#fff !important;background:none !important;border:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-avatar-basic--fallback{font-size:15px !important;color:#3a2f4a !important;}',
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard) .agp-player-remove-btn{',
            'top:50% !important;left:7px !important;right:auto !important;transform:translateY(-50%);',
            'width:16px !important;height:16px !important;font-size:9px !important;z-index:5;}',
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard-tpl){width:217px !important;height:57px !important;',
            'overflow:visible !important;display:flex !important;',
            'flex-direction:row !important;align-items:center !important;justify-content:center !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-tpl{zoom:0.7282;flex-shrink:0 !important;}',
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard-tpl) .agp-player-remove-btn{',
            'top:50% !important;left:7px !important;right:auto !important;transform:translateY(-50%);',
            'width:16px !important;height:16px !important;font-size:9px !important;z-index:5;}',
            '#agp-shell-box.agp-lobby-box .agp-player-remove-btn{',
            'background:rgba(224,115,111,.18) !important;border-color:rgba(224,115,111,.55) !important;',
            'color:#e0736f !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-remove-btn:hover{',
            'background:rgba(224,115,111,.3) !important;color:#ff9b96 !important;}',
            '#agp-shell-box.agp-lobby-box .sl-lobby-actions-row{flex:0 0 auto !important;',
            'display:flex;gap:14px;margin-top:14px;justify-content:center;',
            'flex-wrap:wrap;position:relative;z-index:3 !important;}',
            '.sl-lobby-actions-row > *{width:360px !important;height:48px !important;',
            'max-width:360px !important;flex:0 0 360px !important;box-sizing:border-box !important;',
            'display:flex !important;align-items:center !important;justify-content:center !important;',
            'padding:0 14px !important;margin:0 !important;}',
            '#agp-shell-box.agp-lobby-box .sl-lobby-actions-row #agp-start-round-btn{',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;',
            'box-shadow:0 22px 46px -24px rgba(122,63,212,1) !important;transition:background .25s !important;}',
            '#agp-shell-box.agp-lobby-box .sl-lobby-actions-row #agp-start-round-btn:hover{',
            'background:#9a6cf0 !important;}',
            '.sl-back-to-platform-btn{display:block;margin:14px auto 0;padding:10px 22px;',
            'border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.08);',
            'color:#f3eefc;font-family:inherit;font-weight:800;font-size:0.9em;cursor:pointer;',
            'transition:background 0.15s;}',
            '.sl-back-to-platform-btn:hover{background:rgba(255,255,255,0.18);}',
            '#agp-shell-overlay:has(.sl-settings-initial-box){padding:0 !important;',
            'align-items:flex-start !important;justify-content:center !important;overflow-y:auto !important;',
            'background:',
            'radial-gradient(60% 45% at 18% 8%,rgba(122,63,212,.22),transparent 70%),',
            'radial-gradient(50% 40% at 88% 40%,rgba(70,40,150,.22),transparent 72%),',
            'radial-gradient(55% 45% at 40% 104%,rgba(48,26,104,.26),transparent 74%),',
            'linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),',
            'linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px),',
            'linear-gradient(180deg,#0d0a14 0%,#08060d 45%,#050508 100%) !important;',
            'background-size:auto,auto,auto,88px 88px,88px 88px,auto !important;}',
            '.sl-settings-initial-box{width:min(1040px,94vw) !important;',
            'max-width:min(1040px,94vw) !important;height:calc(100vh - 70px) !important;',
            'height:calc(100dvh - 70px) !important;',
            'max-height:calc(100vh - 70px) !important;max-height:calc(100dvh - 70px) !important;',
            'margin:70px 0 0 !important;overflow:visible !important;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;',
            'column-count:auto !important;column-gap:0 !important;',
            'background:none !important;border:none !important;border-radius:0 !important;',
            'box-shadow:none !important;padding:16px 4px 0 !important;box-sizing:border-box !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '.sl-settings-initial-box *{font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '.sl-settings-initial-box > h2{flex:0 0 auto !important;margin:0 0 4px !important;',
            'max-width:none !important;width:100% !important;font-size:clamp(24px,3.6vw,40px) !important;',
            'font-weight:900 !important;line-height:1.4 !important;text-align:center !important;',
            'padding:0 !important;border-bottom:none !important;position:static;',
            'font-family:"Cairo",sans-serif !important;',
            'background:linear-gradient(90deg,#b28cf5,#f0cd6a,#d9a0f0,#b28cf5) !important;',
            'background-size:200% 100% !important;-webkit-background-clip:text !important;',
            'background-clip:text !important;-webkit-text-fill-color:transparent !important;',
            'animation:sl-settings-wave 9s linear infinite !important;}',
            '.sl-settings-initial-box > h2::after{content:none !important;}',
            '@keyframes sl-settings-wave{0%{background-position:0% 50%}100%{background-position:200% 50%}}',
            '.sl-settings-initial-box .agp-shell-btn-connect:disabled{opacity:.45 !important;',
            'cursor:not-allowed !important;transform:none !important;}',
            '.sl-settings-initial-box .sl-settings-scroll{position:relative;',
            'flex:1 1 auto;min-height:0;width:100%;margin-top:18px;}',
            '.sl-settings-initial-box .sl-settings-scroll-inner{box-sizing:border-box;',
            'height:100%;overflow-y:auto;display:flex;flex-direction:column;gap:16px;',
            'padding:0 2px 26px;scrollbar-width:none;}',
            '.sl-settings-initial-box .sl-settings-scroll-inner::-webkit-scrollbar{',
            'display:none;}',
            '.sl-settings-initial-box .sl-settings-fade{position:absolute;inset:auto 0 0;',
            'height:44px;background:linear-gradient(transparent,#08060d);pointer-events:none;}',
            '.sl-settings-initial-box .sl-settings-glowline{position:absolute;inset:auto 0 0;',
            'height:1px;background:linear-gradient(90deg,transparent,rgba(178,140,245,.55),transparent);',
            'pointer-events:none;}',
            '.sl-settings-initial-box .agp-shell-field,',
            '.sl-settings-initial-box .agp-shell-row{border-bottom:none !important;',
            'padding:2px 0 !important;max-width:none !important;margin:0 !important;display:flex !important;',
            'justify-content:space-between !important;align-items:center !important;width:100% !important;',
            'flex-wrap:wrap !important;gap:12px !important;}',
            '.sl-settings-initial-box .agp-shell-field{flex-direction:column !important;',
            'align-items:flex-start !important;}',
            '.sl-settings-initial-box .agp-shell-field label,',
            '.sl-settings-initial-box .agp-shell-row-label{font-size:16px !important;',
            'font-weight:600 !important;color:#f4f2fb !important;text-align:right !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;display:flex !important;',
            'flex-direction:column !important;align-items:flex-end !important;gap:3px !important;}',
            '.sl-settings-initial-box .agp-shell-field input[type=text]{',
            'max-width:none !important;width:100% !important;background:rgba(255,255,255,.04) !important;',
            'border:1px solid rgba(255,255,255,.14) !important;border-radius:999px !important;',
            'padding:13px 18px !important;font-size:15px !important;font-weight:400 !important;',
            'text-align:center !important;transition:border-color .25s !important;color:#f4f2fb !important;',
            'box-sizing:border-box !important;}',
            '.sl-settings-initial-box .agp-shell-field input[type=text]:focus,',
            '.sl-settings-initial-box .agp-shell-field input[type=text]:not(:placeholder-shown){',
            'border-color:rgba(178,140,245,.6) !important;outline:none !important;}',
            '.sl-settings-initial-box .agp-pill-group{gap:8px !important;padding:4px !important;',
            'border-radius:999px !important;',
            'background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02)) !important;',
            'border:1px solid rgba(255,255,255,.12) !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 3px 10px -6px rgba(0,0,0,.6) !important;}',
            '.sl-settings-initial-box .agp-pill-btn{background:transparent !important;',
            'border:none !important;color:#a79fbb !important;padding:10px 16px !important;',
            'border-radius:999px !important;font-size:13.5px !important;font-weight:600 !important;',
            'transition:.25s !important;white-space:nowrap;}',
            '.sl-settings-initial-box .agp-pill-btn.agp-pill-active{',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.3) inset,0 4px 10px -4px rgba(122,63,212,.7) !important;}',
            '.sl-settings-initial-box .agp-shell-counter-row button{display:none !important;}',
            '.sl-settings-initial-box .agp-shell-counter-row{justify-content:flex-end !important;',
            'flex:1;max-width:220px;}',
            '.sl-settings-initial-box .agp-count-input{',
            'background:rgba(255,255,255,.04) !important;border:1px solid rgba(255,255,255,.14) !important;',
            'border-radius:999px !important;padding:13px 18px !important;width:100% !important;',
            'height:auto !important;color:#f4f2fb !important;font-size:15px !important;',
            'font-weight:400 !important;outline:none !important;text-align:center !important;',
            'box-sizing:border-box !important;}',
            '.sl-settings-initial-box .agp-count-input:focus{',
            'border-color:rgba(178,140,245,.55) !important;}',
            '.sl-settings-initial-box .sl-settings-card{width:100%;',
            'padding:16px 18px;border-radius:20px;border:1px solid rgba(255,255,255,.09);',
            'background:rgba(255,255,255,.03);box-sizing:border-box;display:flex;',
            'flex-direction:column;gap:12px;}',
            '.sl-settings-initial-box .sl-settings-card > .agp-shell-row,',
            '.sl-settings-initial-box .sl-settings-card > .agp-shell-field{padding:0 !important;}',
            '.sl-settings-initial-box .sl-conditional-section{display:flex !important;',
            'flex-direction:column !important;gap:14px !important;margin-top:4px !important;',
            'padding-top:16px !important;border-top:1px solid rgba(255,255,255,.07) !important;',
            'border-right:none !important;padding-right:0 !important;}',
            '.sl-settings-initial-box .sl-conditional-section .agp-shell-row{',
            'border-bottom:none !important;padding:0 !important;}',
            '.sl-settings-initial-box .sl-field-note{color:#8f88a3 !important;',
            'text-align:right !important;}',
            '.sl-settings-initial-box .sl-settings-footer{flex:0 0 auto !important;',
            'width:100% !important;display:flex !important;flex-wrap:wrap !important;',
            'align-items:center !important;justify-content:center !important;',
            'gap:clamp(16px,3vw,36px) !important;padding:20px 0 26px !important;}',
            '.sl-settings-initial-box .agp-shell-btn-connect{',
            'order:1;column-span:none !important;display:inline-flex !important;',
            'align-items:center !important;justify-content:center !important;width:auto !important;',
            'max-width:none !important;margin:0 !important;padding:16px 42px !important;',
            'background:#7a3fd4 !important;color:#f3ecff !important;font-weight:700 !important;',
            'font-size:clamp(15px,1.8vw,17px) !important;border-radius:999px !important;',
            'letter-spacing:0.4px;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.25) inset,0 22px 46px -24px rgba(122,63,212,1) !important;',
            'transition:background .25s,transform .25s !important;}',
            '.sl-settings-initial-box .agp-shell-btn-connect:hover{',
            'background:#9a6cf0 !important;transform:translateY(-2px);}',
            '.sl-settings-initial-box .sl-back-to-platform-btn{',
            'order:2;column-span:none !important;display:inline-flex !important;',
            'align-items:center !important;width:auto !important;margin:0 !important;padding:0 !important;',
            'border:none !important;background:transparent !important;font-size:14px !important;',
            'font-weight:400 !important;color:#a79fbb !important;transition:color .25s !important;}',
            '.sl-settings-initial-box .sl-back-to-platform-btn:hover{',
            'color:#d3bcff !important;background:transparent !important;}',
            '#agp-shell-box.agp-connecting-box,#agp-shell-box.agp-conn-error{visibility:hidden !important;}',
            '#sl-conn-layer{position:fixed;inset:0;z-index:100010;display:none;',
            'align-items:center;justify-content:center;}',
            '#sl-conn-layer.show{display:flex;}',
            '#sl-conn-layer .sl-conn-backdrop{position:absolute;inset:0;overflow:hidden;display:flex;justify-content:center;align-items:flex-start;',
            'filter:blur(6px) brightness(0.55);pointer-events:none;}',
            '#sl-conn-layer .sl-conn-backdrop > *{pointer-events:none !important;}',
            '#sl-conn-layer .sl-conn-modal{position:relative;z-index:1;width:min(360px,90vw);',
            'background:linear-gradient(180deg,rgba(30,24,52,.98),rgba(11,10,18,.99));',
            'border:1px solid rgba(178,140,245,.32);border-radius:24px;',
            'padding:32px 26px;text-align:center;box-shadow:0 40px 90px -46px rgba(0,0,0,1);',
            'font-family:"Noto Kufi Arabic",sans-serif;}',
            '#sl-conn-layer .sl-conn-modal.sl-conn-err{border-color:#ef4444;}',
            '#sl-conn-layer::before{content:"";position:absolute;inset:0;background:rgba(5,2,8,0.45);}',
            '#sl-conn-layer .sl-conn-spinner{width:52px;height:52px;margin:0 auto 18px;',
            'border-radius:50%;border:4px solid rgba(178,140,245,.25);border-top-color:#b28cf5;',
            'animation:sl-conn-spin 0.9s linear infinite;}',
            '@keyframes sl-conn-spin{to{transform:rotate(360deg);}}',
            '#sl-conn-layer .sl-conn-err-icon{width:42px;height:42px;margin:0 auto 18px;',
            'border-radius:50%;background:rgba(239,68,68,0.15);color:#ef4444;font-size:22px;',
            'font-weight:900;display:flex;align-items:center;justify-content:center;}',
            '#sl-conn-layer .sl-conn-title{margin:0 0 6px;font-size:16.5px;font-weight:700;color:#f4f2fb;}',
            '#sl-conn-layer .sl-conn-modal.sl-conn-err .sl-conn-title{color:#ef4444;}',
            '#sl-conn-layer .sl-conn-sub{margin:0;font-size:13px;color:#8f88a3;',
            'font-family:"IBM Plex Sans Arabic",sans-serif;}',
            '#agp-shell-overlay:has(#agp-shell-box.sl-inmatch-drawer){align-items:flex-start !important;',
            'justify-content:flex-start !important;padding:74px 14px 14px !important;}',
            '#agp-shell-box.sl-inmatch-drawer{position:relative !important;top:auto !important;',
            'right:auto !important;left:auto !important;width:350px !important;max-width:94vw !important;',
            'height:900px !important;max-height:calc(100vh - 74px) !important;',
            'max-height:calc(100dvh - 74px) !important;border-radius:20px !important;margin:0 !important;',
            'background:rgba(13,11,22,.97) !important;border:1px solid rgba(178,140,245,.3) !important;',
            'display:flex !important;flex-direction:column !important;overflow:hidden !important;',
            'padding:0 !important;box-shadow:0 40px 90px -50px rgba(0,0,0,1) !important;',
            'animation:sl-select-fadein .2s ease both;}',
            '.sl-drawer-header{display:flex;align-items:center;justify-content:space-between;',
            'padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.08);flex:none;}',
            '.sl-drawer-header h2{font-size:15.5px !important;font-weight:700 !important;margin:0 !important;',
            'padding:0 !important;font-family:"Noto Kufi Arabic",sans-serif !important;color:#f4f2fb;}',
            '.sl-drawer-header #agp-settings-close-btn{position:static !important;width:30px;height:30px;',
            'display:flex;align-items:center;justify-content:center;border-radius:9px;',
            'border:1px solid rgba(255,255,255,.14) !important;background:transparent !important;',
            'color:#cfc7e2 !important;font-size:15px !important;text-shadow:none !important;}',
            '.sl-drawer-body,.sl-drawer-players-tab{flex:1;min-height:0;overflow-y:auto;padding:14px 16px;}',
            '.sl-drawer-body .agp-shell-row,.sl-drawer-players-tab .agp-shell-row,',
            '.sl-drawer-body .agp-shell-field,.sl-drawer-players-tab .agp-shell-field{display:flex !important;',
            'align-items:center !important;justify-content:space-between !important;gap:10px;flex-wrap:wrap;',
            'padding:14px 16px !important;margin:0 0 12px !important;border-radius:18px;',
            'border:1px solid rgba(255,255,255,.09) !important;',
            'background:linear-gradient(180deg,rgba(28,24,44,.9),rgba(14,12,22,.9)) !important;}',
            '.sl-drawer-body .agp-shell-field{flex-direction:column !important;align-items:flex-start !important;}',
            '.sl-drawer-body .agp-shell-row-label,.sl-drawer-players-tab .agp-shell-row-label,',
            '.sl-drawer-body .agp-shell-field label,.sl-drawer-players-tab .agp-shell-field label{',
            'font-size:13px !important;color:#f4f2fb !important;font-weight:700 !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;',
            'display:flex !important;flex-direction:column !important;align-items:flex-end !important;gap:3px;}',
            '.sl-field-desc{font-size:11.5px !important;font-weight:400 !important;color:#8f88a3 !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;white-space:normal !important;',
            'text-align:right;}',
            '.sl-drawer-card{border-radius:18px;border:1px solid rgba(255,255,255,.09);',
            'background:linear-gradient(180deg,rgba(28,24,44,.9),rgba(14,12,22,.9));',
            'margin:0 0 12px;padding:14px 16px;box-sizing:border-box;}',
            '.sl-drawer-card > .agp-shell-row{padding:0 !important;margin:0 !important;',
            'border:none !important;background:none !important;}',
            '.sl-drawer-card .sl-conditional-section{display:flex;flex-direction:column;gap:10px;',
            'margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);}',
            '.sl-drawer-card .sl-conditional-section .agp-shell-row{padding:0 !important;',
            'margin:0 !important;border:none !important;background:none !important;}',
            '#agp-shell-box.sl-inmatch-drawer .agp-settings-player-box{display:none !important;}',
            '#agp-shell-box.sl-inmatch-drawer .agp-settings-player-row{display:block !important;width:100% !important;',
            'border:none !important;background:none !important;padding:0 !important;}',
            '#agp-shell-box.sl-inmatch-drawer #agp-settings-player-count{display:none !important;}',
            '#agp-shell-box.sl-inmatch-drawer .agp-shell-field:has(#agp-settings-player-count) > label{display:none !important;}',
            '#agp-shell-box.sl-inmatch-drawer .agp-settings-player-actions{width:100% !important;',
            'max-width:none !important;}',
            '#agp-shell-box.sl-inmatch-drawer #agp-reopen-registration-btn{width:100% !important;',
            'margin:0 !important;display:flex !important;align-items:center;justify-content:center;gap:8px;',
            'padding:13px 14px !important;border-radius:14px !important;',
            'border:1px solid rgba(178,140,245,.4) !important;',
            'background:linear-gradient(135deg,rgba(122,63,212,.28),rgba(178,140,245,.1)) !important;',
            'color:#f0e9ff !important;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'font-weight:700 !important;font-size:13.5px !important;}',
            '.sl-drawer-footer{flex:none;padding:14px 16px;border-top:1px solid rgba(255,255,255,.08);}',
            '.sl-drawer-end-btn{width:100%;padding:13px 18px;border:1px solid transparent;cursor:pointer;',
            'border-radius:14px;background:rgba(224,115,111,.16);color:#ff9b96;',
            'font-family:"Noto Kufi Arabic",sans-serif;font-size:14px;font-weight:700;',
            'transition:background .2s;}',
            '.sl-drawer-end-btn:hover{background:rgba(224,115,111,.28);}',
            '#agp-shell-overlay:has(#agp-shell-box.sl-mini-lobby-active){align-items:center !important;',
            'justify-content:center !important;background:rgba(3,3,6,.72) !important;',
            'padding:20px !important;}',
            '#agp-shell-box.sl-mini-lobby-active{width:600px !important;max-width:94vw !important;',
            'height:900px !important;max-height:90vh !important;margin:0 !important;',
            'padding:16px 18px 18px !important;box-sizing:border-box !important;',
            'display:flex !important;flex-direction:column !important;',
            'background:rgba(20,18,32,.6) !important;backdrop-filter:blur(10px);',
            '-webkit-backdrop-filter:blur(10px);border:2px solid rgba(178,140,245,.5) !important;',
            'border-radius:24px !important;box-shadow:none !important;position:relative;overflow:hidden;}',
            '#agp-shell-box.sl-mini-lobby-active h2{flex:none !important;text-align:center !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;font-size:15.5px !important;',
            'font-weight:700 !important;margin:0 0 12px !important;max-width:none !important;',
            'background:none !important;color:#f4f2fb !important;-webkit-text-fill-color:#f4f2fb !important;}',
            '.sl-mini-lobby-info{flex:none;margin-bottom:14px;padding:16px 18px;border-radius:18px;',
            'background:linear-gradient(135deg,rgba(122,63,212,.22),rgba(178,140,245,.08));',
            'border:1px solid rgba(178,140,245,.35);}',
            '.sl-mini-lobby-info p{margin:0;font-family:"Noto Kufi Arabic",sans-serif;font-size:14px;',
            'font-weight:600;line-height:1.9;color:#f0e9ff;}',
            '.sl-mini-lobby-info p + p{margin-top:8px;font-family:"IBM Plex Sans Arabic",sans-serif;',
            'font-size:12.5px;font-weight:400;line-height:1.85;color:#c6b4f2;}',
            '.sl-mini-lobby-close-btn{position:absolute;top:16px;left:18px;width:30px;height:30px;',
            'border-radius:9px;background:transparent;border:1px solid rgba(255,255,255,0.16);',
            'color:#cfc7e2;display:flex;align-items:center;justify-content:center;font-size:15px;',
            'cursor:pointer;z-index:3;padding:0;font-family:inherit;line-height:1;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-join-hint{flex:none !important;text-align:center;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;gap:8px;',
            'margin-bottom:14px;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-join-keyword-plain{display:inline-flex;',
            'align-items:center;gap:10px;background:rgba(214,168,60,.12) !important;',
            'border:1px solid rgba(240,205,106,.4);color:#f0cd6a !important;font-weight:900;',
            'font-family:"Cairo",sans-serif;padding:12px 20px;border-radius:999px;font-size:19px;}',
            '#agp-mini-lobby-count{display:block;color:#cfc7e2;font-size:0.75em;margin-top:4px;}',
            '#agp-shell-box.sl-mini-lobby-active #agp-mini-lobby-list{',
            'flex:1 1 auto !important;min-height:0 !important;overflow-y:auto !important;',
            'display:grid !important;grid-template-columns:repeat(auto-fill,217px) !important;',
            'column-gap:37px !important;row-gap:20px !important;justify-content:center !important;',
            'justify-items:center !important;align-items:center !important;align-content:start !important;',
            'margin:0 !important;padding:12px 4px 10px !important;list-style:none;',
            'width:100% !important;box-sizing:border-box !important;',
            'scrollbar-width:none !important;-ms-overflow-style:none !important;}',
            '#agp-shell-box.sl-mini-lobby-active #agp-mini-lobby-list::-webkit-scrollbar{display:none !important;}',
            '#agp-shell-box.sl-mini-lobby-active #agp-mini-lobby-list li{position:relative;',
            'display:flex !important;align-items:center;justify-content:center;min-height:57px;padding:0 !important;',
            'border:none !important;background:none !important;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-pcard{width:217px !important;height:57px !important;',
            'box-sizing:border-box !important;padding:0 3px 0 28px !important;gap:6px !important;',
            'border-radius:24px !important;background:rgba(217,217,217,.3) !important;',
            'border:2px solid #000 !important;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-pcard-avatar-basic{width:48px !important;height:48px !important;',
            'background:#D9D9D9 !important;border:none !important;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-pcard-name-basic{flex:1 1 auto !important;width:auto !important;',
            'min-width:0 !important;height:auto !important;margin:0 !important;padding:0 !important;',
            'font-size:20px !important;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'font-weight:700 !important;color:#fff !important;background:none !important;border:none !important;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-pcard-avatar-basic--fallback{font-size:15px !important;color:#3a2f4a !important;}',
            '#agp-shell-box.sl-mini-lobby-active li:has(> .agp-pcard-tpl){width:217px !important;height:57px !important;',
            'overflow:visible !important;flex-direction:row !important;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-pcard-tpl{zoom:0.7282;flex-shrink:0 !important;}',
            '#agp-shell-box.sl-mini-lobby-active #agp-mini-lobby-done-btn{flex:none !important;',
            'display:block !important;width:100% !important;margin:14px 0 0 !important;',
            'padding:13px 20px !important;font-size:14.5px !important;font-weight:700 !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;letter-spacing:0;',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'border:none !important;border-radius:14px !important;',
            'box-shadow:0 16px 34px -20px rgba(122,63,212,1) !important;}',
            ''
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  4) حسابات اللوحة (من ملف التصميم حرفياً)
     *     الترقيم متعرّج: 1 أسفل اليمين، الصف الأول من اليمين لليسار
     *     (1…10)، الثاني من اليسار لليمين (11…20)… و100 أعلى اليمين.
     * ==================================================================== */
    function xy(n) {
        var i = n - 1, rb = Math.floor(i / 10), m = i % 10;
        var c = rb % 2 === 0 ? 9 - m : m;
        return { x: c * 10 + 5, y: (9 - rb) * 10 + 5 };
    }
    function sxy(n) { var p = xy(n); return { x: p.x * AR, y: p.y }; }

    function tilesHtml() {
        var th = THEMES[_theme] || THEMES.night;
        var out = [];
        for (var r = 0; r < 10; r++) {
            for (var c = 0; c < 10; c++) {
                var rb = 9 - r;
                var n = rb % 2 === 0 ? rb * 10 + (10 - c) : rb * 10 + (c + 1);
                var light = (r + c) % 2 === 0;
                var bg = n === 100 ? th.top : (light ? th.a : th.b);
                out.push('<div class="sl-tile' + (n === 100 ? ' sl-tile-100' : '') + '" style="background:' + bg + '">' +
                    '<span class="sl-tile-n">' + n + '</span>' +
                    (n === 100 ? '<span class="sl-crown">👑</span>' : '') + '</div>');
            }
        }
        return out.join('');
    }

    function boardSvgHtml() {
        var body = '';
        Object.keys(LADDERS).forEach(function (k) {
            var a = sxy(+k), b = sxy(LADDERS[k]);
            var dx = b.x - a.x, dy = b.y - a.y;
            var len = Math.sqrt(dx * dx + dy * dy);
            var deg = Math.atan2(dy, dx) * 180 / Math.PI;
            var count = Math.max(3, Math.round(len / 7));
            var step = (len - 4) / (count - 1);
            var g = '<g transform="translate(' + a.x + ',' + a.y + ') rotate(' + deg + ')" opacity="0.98">' +
                '<rect x="0" y="-1.9" width="' + len + '" height="0.8" rx="0.4" fill="url(#sl-rail-wood)"></rect>' +
                '<rect x="0" y="1.1" width="' + len + '" height="0.8" rx="0.4" fill="url(#sl-rail-wood)"></rect>';
            for (var i = 0; i < count; i++) {
                g += '<rect x="' + (2 + i * step) + '" y="-1.5" width="0.65" height="3.1" rx="0.3" fill="#c98a45" stroke="#7d4d1d" stroke-width="0.12"></rect>';
            }
            body += g + '</g>';
        });
        Object.keys(SNAKES).forEach(function (k, i) {
            var h = sxy(+k), t = sxy(SNAKES[k]);
            var dx = t.x - h.x, dy = t.y - h.y;
            var d = Math.sqrt(dx * dx + dy * dy) || 1;
            var nx = -dy / d, ny = dx / d;
            var off = Math.min(11, d * 0.32) * (i % 2 === 0 ? 1 : -1);
            var ux = dx / d, uy = dy / d;
            var col = SNAKE_COLORS[i % SNAKE_COLORS.length];
            var path = 'M ' + h.x + ' ' + h.y + ' C ' + (h.x + dx * 0.3 + nx * off) + ' ' + (h.y + dy * 0.3 + ny * off) + ', ' +
                (h.x + dx * 0.7 - nx * off) + ' ' + (h.y + dy * 0.7 - ny * off) + ', ' + t.x + ' ' + t.y;
            var ex1 = h.x + nx * 0.7, ey1 = h.y + ny * 0.7, ex2 = h.x - nx * 0.7, ey2 = h.y - ny * 0.7;
            body += '<g>' +
                '<path d="' + path + '" fill="none" stroke="' + col[0] + '" stroke-width="1.4" stroke-linecap="round"></path>' +
                '<path d="' + path + '" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="0.42" stroke-linecap="round" stroke-dasharray="0.4 1.5"></path>' +
                '<circle cx="' + h.x + '" cy="' + h.y + '" r="1.7" fill="' + col[0] + '" stroke="' + col[1] + '" stroke-width="0.28"></circle>' +
                '<path d="M ' + h.x + ' ' + h.y + ' l ' + (-ux * 1.1 + nx * 0.6) + ' ' + (-uy * 1.1 + ny * 0.6) +
                ' M ' + h.x + ' ' + h.y + ' l ' + (-ux * 1.1 - nx * 0.6) + ' ' + (-uy * 1.1 - ny * 0.6) + '" stroke="' + col[1] + '" stroke-width="0.22" stroke-linecap="round"></path>' +
                '<circle cx="' + ex1 + '" cy="' + ey1 + '" r="0.42" fill="#fff"></circle>' +
                '<circle cx="' + ex2 + '" cy="' + ey2 + '" r="0.42" fill="#fff"></circle>' +
                '<circle cx="' + ex1 + '" cy="' + ey1 + '" r="0.19" fill="#12212b"></circle>' +
                '<circle cx="' + ex2 + '" cy="' + ey2 + '" r="0.19" fill="#12212b"></circle>' +
                '</g>';
        });
        return '<svg class="sl-svg" viewBox="0 0 140 100" preserveAspectRatio="none">' +
            '<defs><linearGradient id="sl-rail-wood" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#f0bd7e"></stop><stop offset="45%" stop-color="#c98a45"></stop>' +
            '<stop offset="100%" stop-color="#7d4d1d"></stop></linearGradient></defs>' + body + '</svg>';
    }

    function diceFacesHtml() {
        var faces = [
            { n: 1, t: 'rotateY(0deg)' }, { n: 6, t: 'rotateY(180deg)' }, { n: 3, t: 'rotateY(90deg)' },
            { n: 4, t: 'rotateY(-90deg)' }, { n: 5, t: 'rotateX(90deg)' }, { n: 2, t: 'rotateX(-90deg)' }
        ];
        return faces.map(function (f) {
            return '<div class="sl-face" style="transform:' + f.t + ' translateZ(36px)">' +
                PIP_MAP[f.n].map(function (rc) {
                    return '<div class="sl-pip" style="grid-row:' + rc[0] + ';grid-column:' + rc[1] + '"></div>';
                }).join('') + '</div>';
        }).join('');
    }

    /* ======================================================================
     *  5) شاشة اللعب
     * ==================================================================== */
    function ensureGameFonts() {
        if (el('sl-game-fonts-link')) return;
        var sheet = document.createElement('link');
        sheet.id = 'sl-game-fonts-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Baloo+Bhaijaan+2:wght@500;600;700;800&display=swap';
        document.head.appendChild(sheet);
    }

    function ensureScaffolding() {
        injectStageStyles();
        ensureGameFonts();
        if (!el('sl-stage')) {
            var stage = document.createElement('div');
            stage.id = 'sl-stage';
            document.body.appendChild(stage);
        }
        if (!el('sl-modal-overlay')) {
            var overlay = document.createElement('div');
            overlay.id = 'sl-modal-overlay';
            overlay.innerHTML = '<div id="sl-modal-box"></div>';
            document.body.appendChild(overlay);
        }
    }

    function renderStage() {
        ensureScaffolding();
        document.body.classList.add('sl-game-on');
        var stage = el('sl-stage');
        stage.innerHTML =
            '<header class="sl-header">' +
                '<div class="sl-brand"><div class="sl-brand-tile">🎲</div><div class="sl-brand-title">' + escapeHtml(GAME_NAME) + '</div></div>' +
                '<div class="sl-tools">' +
                    '<button type="button" class="sl-hbtn" id="sl-fs-btn"></button>' +
                    '<button type="button" class="sl-hbtn sl-hbtn-round" id="sl-sound-btn" title="الصوت"></button>' +
                    '<button type="button" class="sl-hbtn sl-hbtn-round" id="sl-help-btn" title="شرح اللعبة">؟</button>' +
                    '<button type="button" class="sl-hbtn" id="sl-players-btn"></button>' +
                    '<div class="sl-theme-wrap">' +
                        '<button type="button" class="sl-hbtn" id="sl-theme-btn">☼ المظهر ⌄</button>' +
                        '<div class="sl-theme-menu" id="sl-theme-menu" hidden></div>' +
                    '</div>' +
                    '<button type="button" class="sl-hbtn sl-hbtn-exit" id="sl-exit-btn">خروج ›</button>' +
                '</div>' +
            '</header>' +
            '<div id="sl-main">' +
                '<aside class="sl-aside">' +
                    '<div class="sl-card sl-card-turn">' +
                        '<div class="sl-cur">' +
                            '<div class="sl-av sl-av-cur" id="sl-cur-av"></div>' +
                            '<div class="sl-info">' +
                                '<div class="sl-lbl-gold">صاحب الدور</div>' +
                                '<div class="sl-cur-name" id="sl-cur-name">—</div>' +
                                '<div class="sl-sq">المربع <b id="sl-cur-pos">0</b></div>' +
                            '</div>' +
                            '<div class="sl-timer" id="sl-timer"><div class="sl-timer-in">' +
                                '<span class="sl-timer-num" id="sl-timer-num">' + TURN_TIME + '</span><span class="sl-timer-unit">ثانية</span>' +
                            '</div></div>' +
                        '</div>' +
                        '<div class="sl-next">' +
                            '<div class="sl-av sl-av-next" id="sl-next-av"></div>' +
                            '<div class="sl-info">' +
                                '<div class="sl-lbl-dim">الدور التالي</div>' +
                                '<div class="sl-next-name" id="sl-next-name">—</div>' +
                            '</div>' +
                            '<div class="sl-sq">المربع <b id="sl-next-pos">0</b></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="sl-card sl-card-dice">' +
                        '<div class="sl-dice-title">منطقة النرد والتحكم ⚂</div>' +
                        '<div class="sl-ready" id="sl-ready">جاهز للرمي</div>' +
                        '<div class="sl-dice-stage"><div class="sl-cube" id="sl-cube">' + diceFacesHtml() + '</div></div>' +
                        '<button type="button" class="sl-btn-roll" id="sl-roll-btn">▶ ابدأ</button>' +
                        '<button type="button" class="sl-btn-reset" id="sl-reset-btn">إعادة اللعبة ↻</button>' +
                        '<div class="sl-cmd-grid">' +
                            '<button type="button" class="sl-btn-cmd" id="sl-cmd-roll">roll / ارم النرد<br><span>لرمي النرد</span></button>' +
                            '<button type="button" class="sl-btn-cmd" id="sl-cmd-join">إدخال لاعب جديد<br><span>فتح باب الدخول</span></button>' +
                        '</div>' +
                    '</div>' +
                '</aside>' +
                '<main id="sl-board">' +
                    '<div class="sl-frame"><div class="sl-inner">' +
                        '<div class="sl-tiles" id="sl-tiles">' + tilesHtml() + '</div>' +
                        boardSvgHtml() +
                        '<div class="sl-tokens" id="sl-tokens"></div>' +
                    '</div></div>' +
                    '<div class="sl-cmds"><span class="sl-cmds-lbl">🎲 لرمي النرد يكتب صاحب الدور في شات البث:</span>' +
                        ROLL_COMMANDS.map(function (c) { return '<span class="sl-cmd-pill">' + escapeHtml(c) + '</span>'; }).join('') +
                    '</div>' +
                '</main>' +
            '</div>' +
            '<div class="sl-status"><span class="sl-status-ic">📣</span><span class="sl-status-txt" id="sl-status-txt"></span></div>' +

            '<div id="sl-event" hidden><div class="sl-ev-card">' +
                '<div class="sl-ev-icon" id="sl-ev-icon"></div>' +
                '<div class="sl-ev-title" id="sl-ev-title"></div>' +
                '<div class="sl-av sl-ev-av" id="sl-ev-av"></div>' +
                '<div class="sl-ev-name" id="sl-ev-name"></div>' +
                '<div class="sl-ev-text" id="sl-ev-text"></div>' +
            '</div></div>' +

            '<div class="sl-modal-bg" id="sl-join" hidden><div class="sl-join-box">' +
                '<div class="sl-join-head"><div class="sl-join-title">إدخال لاعب جديد</div>' +
                '<button type="button" class="sl-x" id="sl-join-close" title="إغلاق">✕</button></div>' +
                '<div class="sl-join-body">' +
                    '<div class="sl-join-top"><div class="sl-open-pill"><span class="sl-open-dot"></span>باب الدخول مفتوح</div>' +
                    '<div class="sl-join-count" id="sl-join-count"></div></div>' +
                    '<div class="sl-join-kw"><span>للدخول اكتب في شات البث</span><b id="sl-join-keyword"></b></div>' +
                    '<ul class="agp-shell-player-list" id="sl-join-list"></ul>' +
                '</div>' +
                '<div class="sl-join-foot"><button type="button" class="sl-btn-gold" id="sl-join-save">حفظ وإغلاق الدخول</button></div>' +
            '</div></div>' +

            '<div class="sl-modal-bg" id="sl-players" hidden><div class="sl-dlg sl-dlg-players">' +
                '<div class="sl-dlg-head"><div class="sl-dlg-title" id="sl-players-title">اللاعبون المشاركون</div>' +
                '<button type="button" class="sl-dlg-x" id="sl-players-close">✕</button></div>' +
                '<div class="sl-pl-list" id="sl-players-list"></div>' +
            '</div></div>' +

            '<div class="sl-modal-bg" id="sl-rules" hidden><div class="sl-dlg sl-dlg-rules">' +
                '<div class="sl-dlg-title">🎲 طريقة اللعب</div>' +
                '<ul class="sl-rules" id="sl-rules-list"></ul>' +
                '<button type="button" class="sl-btn-gold" id="sl-rules-ok">فهمت</button>' +
            '</div></div>' +

            '<div class="sl-modal-bg" id="sl-help" hidden><div class="sl-dlg sl-dlg-help">' +
                '<div class="sl-dlg-head"><div class="sl-dlg-title">شرح اللعبة</div>' +
                '<button type="button" class="sl-dlg-x" id="sl-help-close">✕</button></div>' +
                '<div class="sl-dlg-txt">يرمي كل لاعب النرد في دوره ويتحرك بعدد النقاط. من يصل إلى أسفل سلّم يصعد به إلى أعلاه، ومن يقف على رأس ثعبان ينزل إلى ذيله. أول من يصل إلى المربع 100 بالعدد المطابق يفوز بالمباراة.</div>' +
            '</div></div>' +

            '<div class="sl-modal-bg" id="sl-leave" hidden><div class="sl-dlg sl-dlg-leave">' +
                '<div class="sl-dlg-title">الخروج من المباراة؟</div>' +
                '<div class="sl-dlg-txt">سيتم إنهاء المباراة الحالية وفقدان تقدّم اللاعبين.</div>' +
                '<div class="sl-dlg-btns"><button type="button" class="sl-dlg-cancel" id="sl-leave-cancel">إلغاء</button>' +
                '<button type="button" class="sl-dlg-exit" id="sl-leave-ok">خروج</button></div>' +
            '</div></div>' +

            '';

        el('sl-fs-btn').onclick = toggleFullscreen;
        el('sl-sound-btn').onclick = function () { _sound = !_sound; renderHeader(); };
        el('sl-help-btn').onclick = function () { el('sl-help').hidden = false; };
        el('sl-players-btn').onclick = function () { el('sl-theme-menu').hidden = true; el('sl-players').hidden = false; renderPlayersPanel(); };
        el('sl-players-close').onclick = function () { el('sl-players').hidden = true; };
        el('sl-help-close').onclick = function () { el('sl-help').hidden = true; };
        el('sl-theme-btn').onclick = function () { var m = el('sl-theme-menu'); m.hidden = !m.hidden; };
        el('sl-exit-btn').onclick = function () { el('sl-theme-menu').hidden = true; el('sl-leave').hidden = false; };
        el('sl-leave-cancel').onclick = function () { el('sl-leave').hidden = true; };
        el('sl-leave-ok').onclick = confirmLeave;
        el('sl-roll-btn').onclick = handleMainButton;
        el('sl-rules-ok').onclick = function () { el('sl-rules').hidden = true; startGame(); };
        el('sl-cmd-roll').onclick = streamerRoll;
        el('sl-reset-btn').onclick = resetGame;
        el('sl-cmd-join').onclick = openJoin;
        el('sl-join-close').onclick = closeJoin;
        el('sl-join-save').onclick = saveJoin;

        renderHeader();
        applyTheme();
        renderDice();
        renderTurn();
        renderTokens();
        renderJoinPanel();
    }

    function renderHeader() {
        var fs = el('sl-fs-btn');
        if (fs) fs.textContent = document.fullscreenElement ? '⛶ تصغير' : '⛶ تكبير';
        var snd = el('sl-sound-btn');
        if (snd) { snd.textContent = _sound ? '🔊' : '🔇'; snd.style.color = _sound ? '#cfe6f0' : '#7fa9bd'; }
        var menu = el('sl-theme-menu');
        if (menu) {
            menu.innerHTML = Object.keys(THEMES).map(function (k) {
                return '<button type="button" class="sl-theme-opt' + (k === _theme ? ' sl-on' : '') + '" data-theme="' + k + '">' +
                    '<span class="sl-theme-sw" style="background:' + THEMES[k].a + '"></span><span>' + THEMES[k].label + '</span></button>';
            }).join('');
            Array.prototype.forEach.call(menu.querySelectorAll('[data-theme]'), function (b) {
                b.onclick = function () { _theme = b.getAttribute('data-theme'); menu.hidden = true; renderHeader(); applyTheme(); };
            });
        }
    }

    function applyTheme() {
        var th = THEMES[_theme] || THEMES.night;
        var stage = el('sl-stage');
        if (stage) stage.style.background = th.page;
        var tiles = el('sl-tiles');
        if (tiles) tiles.innerHTML = tilesHtml();
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); }
        else if (document.exitFullscreen) document.exitFullscreen();
    }
    document.addEventListener('fullscreenchange', renderHeader);

    function setStatus(text) {
        var s = el('sl-status-txt');
        if (s) s.textContent = text;
    }

    function initialOf(p) { return (playerLabel(p) || '؟').trim().charAt(0) || '؟'; }
    function hueOf(p) { return p && _hues[p.id] != null ? _hues[p.id] : 280; }

    // صورة البث لو متوفرة، وإلا كرة ملونة بالحرف الأول (حسب README التصميم)
    function fillAvatar(node, p) {
        if (!node) return;
        if (!p) { node.style.background = '#16224a'; node.textContent = '—'; return; }
        node.style.background = ballFor(hueOf(p));
        var initial = initialOf(p);
        if (p.avatarUrl) {
            node.innerHTML = '<img src="' + escapeHtml(p.avatarUrl) + '" alt="" referrerpolicy="no-referrer">';
            node.firstChild.onerror = function () { node.textContent = initial; };
        } else {
            node.textContent = initial;
        }
    }

    function currentPlayer() { return _order.length ? _order[_turnIdx % _order.length] : null; }
    function nextPlayer() { return _order.length > 1 ? _order[(_turnIdx + 1) % _order.length] : null; }

    function renderTurn() {
        var cur = currentPlayer(), nxt = nextPlayer();
        var curAv = el('sl-cur-av');
        if (!curAv) return;
        if (curAv.getAttribute('data-pid') !== (cur ? cur.id : '')) {
            fillAvatar(curAv, cur);
            curAv.setAttribute('data-pid', cur ? cur.id : '');
        }
        el('sl-cur-name').textContent = cur ? playerLabel(cur) : '—';
        el('sl-cur-pos').textContent = cur ? (_positions[cur.id] || 1) : 0;
        var nextAv = el('sl-next-av');
        if (nextAv.getAttribute('data-pid') !== (nxt ? nxt.id : '')) {
            fillAvatar(nextAv, nxt);
            nextAv.setAttribute('data-pid', nxt ? nxt.id : '');
        }
        el('sl-next-name').textContent = nxt ? playerLabel(nxt) : '—';
        el('sl-next-pos').textContent = nxt ? (_positions[nxt.id] || 1) : 0;
        renderTimer();
        renderPlayersPanel();
        var ready = el('sl-ready');
        if (ready) ready.textContent = !_started ? 'بانتظار البدء' : (_paused ? 'متوقفة مؤقتاً' : (_rolling ? 'جاري الرمي' : 'جاهز للرمي'));
        var startBtn = el('sl-roll-btn');
        if (startBtn) {
            startBtn.classList.toggle('sl-btn-paused', _started && _paused);
            startBtn.textContent = !_started ? '▶ ابدأ' : (_paused ? '▶ إكمال المباراة' : '⏸ إيقاف مؤقت');
        }
    }

    function renderTimer() {
        var ring = el('sl-timer'), num = el('sl-timer-num');
        if (!ring || !num) return;
        var tl = _timeLeft;
        var color = tl <= 5 ? '#ff6b6b' : '#ffd166';
        ring.style.background = 'conic-gradient(' + color + ' ' + (tl / TURN_TIME * 360) + 'deg, rgba(255,255,255,0.08) 0)';
        num.textContent = tl;
        num.style.color = color;
    }

    function renderDice() {
        var cube = el('sl-cube');
        if (!cube) return;
        var rot = DICE_ROT[_dice] || [0, 0];
        cube.style.transform = 'rotateX(' + (rot[0] + _spinX * 360) + 'deg) rotateY(' + (rot[1] + _spinY * 360) + 'deg)';
    }

    function renderTokens() {
        var layer = el('sl-tokens');
        if (!layer) return;
        var byTile = {};
        _roster.forEach(function (p) {
            var pos = _positions[p.id] || 1;
            (byTile[pos] = byTile[pos] || []).push(p);
        });
        var existing = {};
        Array.prototype.forEach.call(layer.children, function (t) { existing[t.getAttribute('data-key')] = t; });
        Object.keys(byTile).forEach(function (key) {
            var list = byTile[key];
            var c = xy(+key);
            var shown = list.slice(0, list.length > 4 ? 3 : 4);
            var hidden = list.length - shown.length;
            var total = shown.length + (hidden > 0 ? 1 : 0);
            var slots = CLUSTER[Math.min(total, 4) - 1];
            var size = (total > 1 ? 5.6 : 8) / AR;
            var half = size / 2 + 0.6;
            var halfY = half * AR;
            var clamp = function (v) { return Math.max(half, Math.min(v, 100 - half)); };
            var clampY = function (v) { return Math.max(halfY, Math.min(v, 100 - halfY)); };
            var font = 'max(11px, ' + (size * 0.46).toFixed(2) + 'cqw)';
            function place(k, s, make) {
                var node = existing[k];
                delete existing[k];
                if (!node) {
                    node = document.createElement('div');
                    node.className = 'sl-tok';
                    node.setAttribute('data-key', k);
                    make(node);
                    layer.appendChild(node);
                }
                node.style.left = clamp(c.x + s.dx / AR) + '%';
                node.style.top = clampY(c.y + s.dy) + '%';
                node.style.width = size + '%';
                node.style.fontSize = font;
                return node;
            }
            shown.forEach(function (p, i) {
                place('p:' + p.id, slots[i], function (node) { fillAvatar(node, p); });
            });
            if (hidden > 0) {
                var chip = place('more:' + key, slots[total - 1], function (node) {
                    node.style.background = 'linear-gradient(180deg, #16224a, #0b1122)';
                });
                chip.textContent = '+' + hidden;
            }
        });
        Object.keys(existing).forEach(function (k) { layer.removeChild(existing[k]); });
    }

    /* ======================================================================
     *  6) الأدوار + المؤقت (15 ثانية — لو انتهى بدون أمر يروح عليه الدور)
     * ==================================================================== */
    var _left = false;
    // المباراة ما تبدأ (مؤقت/أدوار/أوامر الشات) إلا بعد ضغط زر "ابدأ" —
    // بعد اللوبي، وبعد "إعادة اللعبة"، وبعد إعادة المباراة بنفس اللاعبين.
    var _started = false;

    var _paused = false;

    // زر "ابدأ" ← نافذة التعليمات ← "فهمت" تبدأ المباراة، بعدها نفس الزر
    // يتبدّل بين "إيقاف مؤقت" و"إكمال المباراة" (المؤقت يكمل من مكانه).
    function handleMainButton() {
        if (!_matchActive) return;
        if (!_started) { showRules(); return; }
        _paused = !_paused;
        if (_paused) {
            setStatus('⏸ المباراة متوقفة مؤقتاً — اضغط "إكمال المباراة" للمتابعة');
        } else {
            var cur = currentPlayer();
            setStatus('▶ استُكملت المباراة' + (cur && !_rolling ? ' — دور ' + playerLabel(cur) : ''));
        }
        renderTurn();
    }

    function showRules() {
        el('sl-rules-list').innerHTML =
            '<li><span class="sl-rule-ic">⏱️</span><span>لكل لاعب <b>' + TURN_TIME + ' ثانية</b> في دوره يرمي فيها النرد.</span></li>' +
            '<li><span class="sl-rule-ic">💬</span><span>لرمي النرد يكتب صاحب الدور في شات البث: ' +
                ROLL_COMMANDS.map(function (c) { return '<span class="sl-cmd-pill">' + escapeHtml(c) + '</span>'; }).join('') + '</span></li>' +
            '<li><span class="sl-rule-ic">⏭️</span><span>إذا خلص الوقت بدون أمر يروح الدور للاعب اللي بعده.</span></li>' +
            '<li><span class="sl-rule-ic">🪜</span><span>السلم يطلّعك لأعلاه، و🐍 الثعبان ينزّلك لذيله.</span></li>' +
            '<li><span class="sl-rule-ic">🏆</span><span>كل من يوصل للمربع <b>100</b> بالعدد المطابق يفوز، وتستمر المباراة حتى يكتمل عدد الفائزين اللي حدده الاستريمر.</span></li>';
        el('sl-rules').hidden = false;
    }

    function startGame() {
        if (!_matchActive || _started || !_order.length) return;
        _paused = false;
        _started = true;
        setStatus('اللعبة بدأت! دور ' + playerLabel(currentPlayer()));
        startTurnTimer();
        renderTurn();
    }
    var _ending = false;         // اكتمل عدد الفائزين — بانتظار بطاقة الفوز

    function stopTurnTimer() {
        if (_turnInterval) { window.clearInterval(_turnInterval); _turnInterval = null; }
    }

    // صوت بداية دور كل لاعب
    function playTurnSound() {
        beep(660, 0.12);
        later(function () { beep(990, 0.2); }, 130);
    }
    // صوت المؤقت كل ثانية (أعلى وأوضح بآخر 5 ثوانٍ)
    function playTickSound(t) {
        if (t <= 5) beep(880, 0.09, 'square');
        else beep(1250, 0.04, 'sine');
    }

    function startTurnTimer() {
        stopTurnTimer();
        _timeLeft = TURN_TIME;
        renderTimer();
        if (_matchActive && !_ending && _order.length) playTurnSound();
        _turnInterval = window.setInterval(function () {
            if (!_matchActive || _rolling || _left || _paused) return;
            _timeLeft = Math.max(0, _timeLeft - 1);
            renderTimer();
            if (_timeLeft > 0) playTickSound(_timeLeft);
            if (_timeLeft === 0) handleTurnTimeout();
        }, 1000);
    }

    function handleTurnTimeout() {
        var cur = currentPlayer();
        if (!cur) return;
        _turnIdx = (_turnIdx + 1) % _order.length;
        var nxt = currentPlayer();
        setStatus('انتهى وقت ' + playerLabel(cur) + ' — الدور الآن لـ ' + playerLabel(nxt));
        startTurnTimer();
        renderTurn();
    }

    /* ======================================================================
     *  7) رمي النرد + الحركة (نفس roll() بملف التصميم)
     * ==================================================================== */
    function streamerRoll() {
        var cur = currentPlayer();
        if (cur) roll(cur);
    }

    function roll(player) {
        if (!_matchActive || !_started || _paused || _rolling || _left || _ending || !_order.length) return;
        var cur = currentPlayer();
        if (!cur || cur.id !== player.id) return;
        var v = 1 + Math.floor(Math.random() * 6);
        _rolling = true;
        _dice = v;
        _spinX += 2 + Math.floor(Math.random() * 2);
        _spinY += 2 + Math.floor(Math.random() * 2);
        setStatus(playerLabel(cur) + ' يرمي…');
        renderDice();
        renderTurn();
        beep(520, 0.08, 'square');
        later(function () { beep(660, 0.08, 'square'); }, 120);
        later(function () { beep(440, 0.08, 'square'); }, 240);
        _rollWatchdog = later(function () { recoverStuckRoll(cur); }, ROLL_WATCHDOG_MS);
        later(function () {
            try { applyRoll(cur, v); }
            catch (e) { console.error('[Snakes & Ladders] applyRoll failed', e); recoverStuckRoll(cur); }
        }, ROLL_APPLY_MS);
    }

    // حماية من تعليق اللعبة: أطول تسلسل رمية (نرد + وقوف + انزلاق + تبويب)
    // ≈ 6 ثوانٍ؛ لو ما خلص خلال 10 ثوانٍ لأي سبب (خطأ بمتصفح معيّن مثلاً)
    // نفك حالة "جاري الرمي" وننقل الدور، عشان أوامر الشات ترجع تنقبل.
    var ROLL_WATCHDOG_MS = 10000;
    var _rollWatchdog = null;
    function recoverStuckRoll(me) {
        if (!_matchActive || !_rolling) return;
        console.warn('[Snakes & Ladders] roll sequence did not finish — recovering');
        hideEventCard();
        setTokenSlide(me.id, false, true);
        try { renderTokens(); } catch (e) {}
        finishMove(me, 'تم تجاوز رمية ' + playerLabel(me) + ' بسبب خلل — الدور للي بعده.');
    }

    function applyRoll(me, v) {
        if (!_matchActive) return;
        var from = _positions[me.id] || 1;
        var landing = from + v;
        var name = playerLabel(me);

        if (landing > 100) {
            beep(600, 0.1, 'triangle');
            finishMove(me, name + ' يحتاج ' + (100 - from) + ' بالضبط للفوز.');
            return;
        }

        _positions[me.id] = landing;
        renderTokens();
        renderTurn();

        var isLadder = !!LADDERS[landing];
        var dest = LADDERS[landing] || SNAKES[landing];
        if (!dest) {
            beep(600, 0.1, 'triangle');
            finishMove(me, name + ' تحرك من ' + from + ' إلى ' + landing + '.');
            return;
        }

        // يقف على رأس الثعبان / بداية السلم ثانية كاملة، ثم ينزل/يصعد،
        // ثم يظهر تبويب الحدث ثانيتين — والدور ما ينتقل إلا بعد اختفائه.
        beep(600, 0.1, 'triangle');
        setStatus(isLadder
            ? name + ' وصل إلى بداية السلم في المربع ' + landing + '…'
            : name + ' وقف على رأس الثعبان في المربع ' + landing + '…');
        later(function () {
            if (!_matchActive) return;
            if (isLadder) { beep(520, 0.1); later(function () { beep(780, 0.18); }, 100); }
            else { beep(420, 0.12, 'sawtooth'); later(function () { beep(220, 0.25, 'sawtooth'); }, 110); }
            setTokenSlide(me.id, true, isLadder);
            _positions[me.id] = dest;
            renderTokens();
            renderTurn();
            later(function () {
                setTokenSlide(me.id, false, isLadder);
                if (!_matchActive) return;
                showEventCard(me, isLadder, landing, dest, function () {
                    finishMove(me, isLadder
                        ? name + ' صعد السلم من ' + landing + ' إلى ' + dest + '.'
                        : name + ' أكله الثعبان في ' + landing + ' ورجع إلى ' + dest + '.');
                });
            }, SLIDE_MS + 60);
        }, PAUSE_ON_SQUARE_MS);
    }

    function setTokenSlide(pid, on, isLadder) {
        var layer = el('sl-tokens');
        if (!layer) return;
        var node = null;
        Array.prototype.forEach.call(layer.children, function (t) { if (t.getAttribute('data-key') === 'p:' + pid) node = t; });
        if (!node) return;
        node.classList.toggle('sl-tok-slide', on);
        node.classList.toggle('sl-tok-snake', on && !isLadder);
    }

    // تبويب 400×400 يوضح الحدث (صورة + اسم + من أي مربع لأي مربع)
    function showEventCard(player, isLadder, from, to, onDone) {
        var box = el('sl-event');
        if (!box) { onDone(); return; }
        el('sl-ev-icon').textContent = isLadder ? '🪜' : '🐍';
        el('sl-ev-title').textContent = isLadder ? 'صعد السلم!' : 'أكله الثعبان!';
        fillAvatar(el('sl-ev-av'), player);
        el('sl-ev-name').textContent = playerLabel(player);
        el('sl-ev-text').innerHTML = isLadder
            ? 'وصل لبداية السلم في المربع <b>' + from + '</b><br>وصعد إلى المربع <b>' + to + '</b>'
            : 'أكله الثعبان في المربع <b>' + from + '</b><br>وأعاده إلى المربع <b>' + to + '</b>';
        box.className = isLadder ? 'sl-ev-ladder' : 'sl-ev-snake';
        box.hidden = false;
        void box.offsetWidth;
        box.classList.add('sl-ev-in');
        later(function () {
            box.classList.remove('sl-ev-in');
            box.classList.add('sl-ev-out');
            later(function () {
                box.hidden = true;
                box.className = '';
                onDone();
            }, EVENT_ANIM_MS);
        }, EVENT_ANIM_MS + EVENT_SHOW_MS);
    }

    function hideEventCard() {
        var box = el('sl-event');
        if (box) { box.hidden = true; box.className = ''; }
    }

    // نهاية حركة اللاعب — هنا فقط ينتقل الدور (أو يُحسب الفوز)
    function finishMove(me, note) {
        if (!_matchActive || !_rolling) return; // !_rolling = الرمية انتهت/انفكّت مسبقاً (ما ننقل الدور مرتين)
        if (_rollWatchdog) { window.clearTimeout(_rollWatchdog); _rollWatchdog = null; }
        _rolling = false;
        var i = _order.findIndex(function (p) { return p.id === me.id; });
        if (i === -1) {
            // اللاعب انحذف أثناء الحركة
            _turnIdx = _order.length ? (_turnIdx % _order.length) : 0;
            if (!checkMatchComplete()) startTurnTimer();
        } else if ((_positions[me.id] || 1) === 100) {
            handleWinner(me, i);
        } else {
            _turnIdx = (i + 1) % _order.length;
            setStatus(note);
            startTurnTimer();
        }
        renderTokens();
        renderTurn();
    }

    function requiredWinners() {
        var n = Number(liveSettings().winnersCount) || 1;
        return Math.max(1, Math.min(3, n));
    }

    function handleWinner(me, idx) {
        beep(660, 0.15); later(function () { beep(880, 0.15); }, 150); later(function () { beep(1100, 0.3); }, 300);
        _winners.push(me);
        if (idx !== -1) _order.splice(idx, 1);
        _turnIdx = _order.length ? (idx % _order.length) : 0;
        var names = ['الأول', 'الثاني', 'الثالث'];
        setStatus(playerLabel(me) + ' وصل إلى 100 وفاز! 🏆' + (requiredWinners() > 1 ? ' — المركز ' + (names[_winners.length - 1] || _winners.length) : ''));

        if (checkMatchComplete()) return;
        startTurnTimer();
    }

    // المباراة تنتهي أول ما يكتمل عدد الفائزين المحدَّد بالإعدادات (1/2/3).
    // لو ما بقي إلا لاعب واحد قبل اكتمال العدد، ياخذ المركز المتبقي.
    function checkMatchComplete() {
        if (_winners.length < requiredWinners() && _order.length > 1) return false;
        if (_order.length === 1 && _winners.length < requiredWinners()) {
            _winners.push(_order[0]);
            _order = [];
        }
        _ending = true;
        stopTurnTimer();
        later(endMatch, WIN_END_DELAY_MS);
        return true;
    }

    // "إعادة اللعبة ↻" — كل اللاعبين يرجعون للمربع 1 بنفس الترتيب
    function resetGame() {
        if (!_roster.length) return;
        clearPendingTimeouts();
        hideEventCard();
        _left = false;
        _ending = false;
        _matchActive = true;
        _rolling = false;
        _winners = [];
        _order = _roster.slice();
        _roster.forEach(function (p) { _positions[p.id] = 1; });
        _turnIdx = 0;
        _dice = 4;
        _started = false;
        _paused = false;
        stopTurnTimer();
        _timeLeft = TURN_TIME;
        setStatus('أُعيدت اللعبة — اضغط "ابدأ" لبدء المباراة');
        renderDice();
        renderTokens();
        renderTurn();
    }

    // "خروج" (بعد التأكيد) — يوقف المباراة ويرجع لمكتبة الألعاب
    function confirmLeave() {
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
        el('sl-leave').hidden = true;
        _left = true;
        stopTurnTimer();
        clearPendingTimeouts();
        window.location.href = '../../games.html';
    }

    /* ======================================================================
     *  8) لوحة "إدخال لاعب جديد" — تفتح كلمة الدخول مؤقتاً، والداخلين
     *     الجدد (لم يسبق لهم الدخول لهذه المباراة) ينضافون للقائمة، و"حفظ
     *     وإغلاق الدخول" يضيفهم للوحة على المربع 1 ويقفل الدخول.
     * ==================================================================== */
    function maxPlayersCap() {
        var m = Number(liveSettings().maxPlayers) || MAX_PLAYERS;
        return Math.min(MAX_PLAYERS, m);
    }

    function openJoin() {
        _joinOpen = true;
        if (_roster.length + _queued.length < maxPlayersCap() && AGP.keywordManager) AGP.keywordManager.activate();
        renderJoinPanel();
    }

    function closeJoin() {
        _joinOpen = false;
        if (AGP.keywordManager) AGP.keywordManager.deactivate();
        renderJoinPanel();
    }

    function saveJoin() {
        var start = _roster.length;
        var added = _queued.slice(0, Math.max(0, maxPlayersCap() - start));
        added.forEach(function (p, i) {
            _hues[p.id] = ((start + i) * 47 + 280) % 360;
            _positions[p.id] = 1;
            _knownIds[p.id] = true;
            _roster.push(p);
            _order.push(p);
        });
        _queued = [];
        closeJoin();
        renderTokens();
        renderTurn();
    }

    function renderJoinPanel() {
        var panel = el('sl-join');
        if (!panel) return;
        panel.hidden = !_joinOpen;
        el('sl-join-count').textContent = 'اللاعبون الجدد (' + _queued.length + ')';
        var kw = el('sl-join-keyword');
        if (kw) kw.textContent = (AGP.keywordManager && AGP.keywordManager.getKeyword && AGP.keywordManager.getKeyword()) || '';
        var list = el('sl-join-list');
        if (!_queued.length) {
            list.innerHTML = '<li class="sl-join-empty">بانتظار أوامر الدخول من الشات…</li>';
            return;
        }
        // نفس بطاقة اللوبي الأساسي (AGP.playerCard + إطار اللاعب + زر الحذف)
        list.innerHTML = _queued.map(function (q) {
            var card = AGP.playerCard ? AGP.playerCard.renderHtml(q, { showFrame: true, basePath: '../../' }) : escapeHtml(playerLabel(q));
            return '<li><button type="button" class="agp-player-remove-btn" data-q-id="' + escapeHtml(q.id) + '" title="حذف">🗑️</button>' + card + '</li>';
        }).join('');
        Array.prototype.forEach.call(list.querySelectorAll('[data-q-id]'), function (btn) {
            btn.onclick = function () {
                var id = btn.getAttribute('data-q-id');
                _queued = _queued.filter(function (q) { return q.id !== id; });
                if (AGP.player && typeof AGP.player.removePlayer === 'function') AGP.player.removePlayer(id);
                renderJoinPanel();
            };
        });
        if (AGP.playerCard && typeof AGP.playerCard.fitAllNames === 'function') AGP.playerCard.fitAllNames(list);
        fitFramedCards(list);
    }

    // زر "👥 اللاعبين" بالهيدر — كل المشاركين بالمباراة مع إمكانية حذف أي لاعب
    function renderPlayersPanel() {
        var btn = el('sl-players-btn');
        if (btn) btn.textContent = '👥 اللاعبين (' + _roster.length + ')';
        var list = el('sl-players-list');
        var panel = el('sl-players');
        if (!list || !panel || panel.hidden) return;
        var cur = currentPlayer();
        var medals = ['🥇', '🥈', '🥉'];
        el('sl-players-title').textContent = 'اللاعبون المشاركون (' + _roster.length + ')';
        list.innerHTML = _roster.map(function (p) {
            var w = _winners.indexOf(p);
            var tag = w !== -1 ? (medals[w] || '🏆') : ('المربع ' + (_positions[p.id] || 1));
            return '<div class="sl-pl-row' + (cur && cur.id === p.id ? ' sl-pl-cur' : '') + '">' +
                '<div class="sl-av sl-av-row" data-av="' + escapeHtml(p.id) + '"></div>' +
                '<div class="sl-pl-name">' + escapeHtml(playerLabel(p)) + '</div>' +
                '<div class="sl-pl-tag">' + tag + '</div>' +
                '<button type="button" class="sl-q-x" data-del="' + escapeHtml(p.id) + '" title="حذف من المباراة">✕</button></div>';
        }).join('') || '<div class="sl-join-empty">لا يوجد لاعبون</div>';
        _roster.forEach(function (p) {
            var node = list.querySelector('[data-av="' + (window.CSS && CSS.escape ? CSS.escape(p.id) : p.id) + '"]');
            fillAvatar(node, p);
        });
        Array.prototype.forEach.call(list.querySelectorAll('[data-del]'), function (b) {
            b.onclick = function () {
                var id = b.getAttribute('data-del');
                if (AGP.player && typeof AGP.player.removePlayer === 'function') AGP.player.removePlayer(id);
            };
        });
    }

    /* ======================================================================
     *  9) الاستماع لشات البث + حذف/إضافة لاعب
     * ==================================================================== */
    function wireCommentListener() {
        unwireCommentListener();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_matchActive || _rolling || _left || _ending || !payload || typeof payload.text !== 'string') return;
            var cur = currentPlayer();
            if (!cur || (payload.id !== cur.id && payload.name !== cur.name)) return;
            if (!isRollCommand(payload.text)) return;
            roll(cur);
        });
    }
    function unwireCommentListener() {
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = null;
    }

    function handlePlayerJoinedMidMatch(newPlayer) {
        if (!newPlayer || !newPlayer.id || !_matchActive || !_joinOpen) return;
        if (_knownIds[newPlayer.id] || _queued.some(function (q) { return q.id === newPlayer.id; })) return;
        if (_roster.length + _queued.length >= maxPlayersCap()) return;
        _queued.push(newPlayer);
        if (_roster.length + _queued.length >= maxPlayersCap() && AGP.keywordManager) AGP.keywordManager.deactivate();
        renderJoinPanel();
    }

    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id || !_matchActive) return;
        var id = removedPlayer.id;
        if (!_roster.some(function (p) { return p.id === id; })) return;
        var idx = _order.findIndex(function (p) { return p.id === id; });
        var wasCurrent = idx !== -1 && idx === (_turnIdx % Math.max(1, _order.length));
        _roster = _roster.filter(function (p) { return p.id !== id; });
        _winners = _winners.filter(function (p) { return p.id !== id; });
        delete _positions[id];
        delete _knownIds[id];
        if (idx !== -1) {
            _order.splice(idx, 1);
            if (idx < _turnIdx) _turnIdx--;
            _turnIdx = _order.length ? (_turnIdx % _order.length) : 0;
        }
        setStatus('تم حذف ' + playerLabel(removedPlayer) + ' من المباراة.');
        renderTokens();
        renderTurn();
        if (_ending) return;
        if (checkMatchComplete()) return;
        if (wasCurrent && !_rolling && _started) startTurnTimer();
    }

    function enforceMaxPlayers() {
        var settings = AGP.gameShell.getSettings();
        var max = settings.maxPlayers;
        if (!max) return;
        if (AGP.gameManager.getPlayersCount() >= max) {
            if (AGP.lobby && typeof AGP.lobby.close === 'function') AGP.lobby.close();
            if (AGP.keywordManager && typeof AGP.keywordManager.deactivate === 'function') {
                AGP.keywordManager.deactivate();
            }
        }
    }
    /* ======================================================================
     *  10) نهاية المباراة + بطاقة الفوز (نفس بطاقة روليت الإقصاء)
     * ==================================================================== */
    function endMatch() {
        if (!_matchActive) return;
        _matchActive = false;
        _rolling = false;
        stopTurnTimer();
        clearPendingTimeouts();
        unwireCommentListener();

        var winners = _winners.slice(0, 3);
        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var winnerIds = winners.map(function (w) { return w.id; });
            var participants = AGP.gameManager.getPlayers().map(function (p) {
                return { tiktokUsername: tiktokUsernameFor(p), won: winnerIds.indexOf(p.id) !== -1 };
            }).filter(function (p) { return p.tiktokUsername; });
            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () { return null; });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        pointsPromise.then(function (pointsResult) { renderWinnerScreen(winners, pointsResult); });

        // بطاقة الفوز (js/agp-win-card.js) -- تغطي شاشة الفوز لكل فائز يملك بطاقة مفعّلة (بترتيبه).
        if (AGP.winCard) {
            var RANKS = ['المركز الأول', 'المركز الثاني', 'المركز الثالث'];
            AGP.winCard.announce(winners, function (p, i) {
                return [RANKS[i] || ('المركز ' + (i + 1)), 'من ' + AGP.gameManager.getPlayers().length + ' لاعب', 'السلم والثعبان'];
            });
        }
    }

    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }

    function pointsHtmlFor(pointsResult, player) {
        if (!pointsResult) {
            return '<div class="agp-trophy-points agp-points-noaccount">تعذّر جلب النقاط الآن</div>';
        }
        var awarded = findAwardedFor(pointsResult, player);
        if (awarded) {
            return '<div class="agp-trophy-points agp-points-earned">+' + awarded.added + ' نقطة' +
                '<span class="agp-points-sub">تظهر في بروفايلك</span></div>';
        }
        return '<div class="agp-trophy-points agp-points-noaccount">لازم يسوي حساب عشان تظهر نقاطك بالبروفايل</div>';
    }

    var CONFETTI_COLORS = ['#ffd400', '#ff4dff', '#00c2ff', '#7c3aed', '#4ade80', '#ff6b8a'];
    function spawnConfetti(container, count) {
        if (!container) return;
        count = count || 26;
        for (var i = 0; i < count; i++) {
            var piece = document.createElement('span');
            piece.className = 'sl-confetti-piece';
            var angle = Math.random() * Math.PI * 2;
            var dist = 70 + Math.random() * 90;
            piece.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
            piece.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
            piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            piece.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
            container.appendChild(piece);
            (function (p) {
                window.setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1700);
            })(piece);
        }
    }

    var PLACE_CLASSES = ['sl-trophy-winner', 'sl-trophy-most', 'sl-trophy-third'];
    var PLACE_LABELS = ['المركز الأول', 'المركز الثاني', 'المركز الثالث'];

    function renderWinnerScreen(winners, pointsResult) {
        ensureScaffolding();
        var overlay = el('sl-modal-overlay');
        var box = el('sl-modal-box');
        if (!overlay || !box) return;

        var single = winners.length <= 1;
        var cardsHtml = winners.map(function (w, i) {
            return AGP.playerCard.renderTrophyCard(w, {
                cls: PLACE_CLASSES[i], kind: 'winner', cardId: 'sl-trophy-card-' + i,
                label: single ? undefined : PLACE_LABELS[i],
                showCrown: i === 0,
                pointsHtml: pointsHtmlFor(pointsResult, w)
            });
        }).join('');

        box.className = 'sl-winner-panel';
        box.style.textAlign = 'center';
        overlay.classList.add('sl-winner-backdrop');
        box.innerHTML =
            '<div id="sl-winner-box">' +
            '<h2>🏁 انتهت المباراة .. ' + (single ? 'الشخص الرهيب الي فاز' : 'الأشخاص الرهيبين الي فازوا') +
            ' بلعبة "' + escapeHtml(GAME_NAME) + '"</h2>' +
            '<div class="sl-trophy-cards">' + (cardsHtml || '<p style="color:#fff;font-weight:800;">بدون فائز</p>') + '</div>' +
            '<div class="sl-winner-actions">' +
            '<button class="sl-btn-secondary" id="sl-home-btn">⬅️ رجوع لمنصة الألعاب</button>' +
            '<button class="sl-btn-secondary" id="sl-new-match-btn">🆕 بدء مباراة جديدة</button>' +
            '<button class="sl-btn-secondary" id="sl-replay-same-btn">🔄 إعادة المباراة بنفس اللاعبين</button>' +
            '</div></div>';

        el('sl-replay-same-btn').onclick = handleReplaySamePlayers;
        el('sl-new-match-btn').onclick = function () {
            AGP.gameManager.resetSession();
            window.location.reload();
        };
        el('sl-home-btn').onclick = function () {
            var headerHomeBtn = el('agp-header-home-btn');
            if (headerHomeBtn) headerHomeBtn.click();
        };

        overlay.style.display = 'flex';
        window.setTimeout(function () {
            winners.forEach(function (w, i) { spawnConfetti(el('sl-trophy-card-' + i), i === 0 ? 28 : 20); });
        }, 120);
    }

    function startMatchWith(players, settingsValues) {
        resetMatchState();
        _left = false;
        _ending = false;
        _settings = settingsValues || liveSettings();
        _roster = players.slice(0, MAX_PLAYERS);
        _order = _roster.slice();
        _roster.forEach(function (p, i) {
            _positions[p.id] = 1;
            _hues[p.id] = (i * 47 + 280) % 360;
            _knownIds[p.id] = true;
        });
        _turnIdx = 0;
        _dice = 4;
        _startedAt = Date.now();
        _matchActive = true;
        _started = false;
        _paused = false;
        _timeLeft = TURN_TIME;
        wireCommentListener();
        renderStage();
        setStatus('اضغط "ابدأ" لبدء المباراة');
    }

    function handleReplaySamePlayers() {
        var roster = _roster.slice();
        if (!roster.length) return;
        var overlay = el('sl-modal-overlay');
        if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('sl-winner-backdrop'); }
        startMatchWith(roster, liveSettings());
        AGP.events.emit('game:roundStarted', { id: GAME_ID });
    }

    function handleStartRound(settingsValues) {
        startMatchWith(AGP.gameManager.getPlayers(), settingsValues);
    }

    /* ======================================================================
     *  11) حقول شاشة الإعدادات
     *      (الكلمة المفتاحية حقل أساسي يبنيه js/agp-game-shell.js بنفسه)
     * ==================================================================== */
    function buildSettingsFields() {
        return [
            {
                key: 'maxPlayers', type: 'counter', label: '👥 كم الحد الأقصى لعدد اللاعبين',
                min: 2, default: 10
            },
            {
                key: 'followersOnly', type: 'pill-choice', label: '🔑 السماح بالدخول',
                options: [
                    { label: '👥 الجميع', value: false },
                    { label: '❤️ المتابعين فقط', value: true }
                ],
                default: false
            },
            {
                key: 'winnersCount', type: 'pill-group', label: '🏆 كم فائز بالمباراة',
                description: 'المباراة تنتهي أول ما يوصل هذا العدد من اللاعبين للكأس',
                options: [
                    { label: '1', value: 1 },
                    { label: '2', value: 2 },
                    { label: '3', value: 3 }
                ],
                default: 1
            }
        ];
    }

    /* ======================================================================
     *  12) تحسينات شاشات الإعدادات/اللوبي المشتركة — نفس طريقة روليت
     *      الإقصاء بالضبط (MutationObserver على #agp-shell-overlay)، بدون
     *      أي تعديل على js/agp-game-shell.js.
     * ==================================================================== */
    function homeNavigate() {
        var homeBtn = el('agp-header-home-btn');
        if (homeBtn) { homeBtn.click(); }
        else { window.location.href = '../../games.html'; }
    }

    function makeBackToPlatformBtn() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sl-back-to-platform-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        btn.addEventListener('click', homeNavigate);
        return btn;
    }

    function layoutInitialSettingsFields(box) {
        var connectBtn = el('agp-connect-btn');
        if (!connectBtn) return;
        if (connectBtn.closest('.sl-settings-footer')) return;

        function rowFor(dataKeySelector) {
            var ctl = box.querySelector(dataKeySelector);
            return ctl ? ctl.closest('.agp-shell-row') : null;
        }

        var usernameInput = el('agp-tiktok-username');
        var usernameField = usernameInput ? usernameInput.closest('.agp-shell-field') : null;
        var keywordInput = el('agp-keyword');
        var keywordField = keywordInput ? keywordInput.closest('.agp-shell-field') : null;

        var maxPlayersRow = rowFor('[data-key="maxPlayers"]');
        var followersRow = rowFor('[data-key="followersOnly"]');
        var winnersRow = rowFor('[data-key="winnersCount"]');

        var scroll = document.createElement('div');
        scroll.className = 'sl-settings-scroll';
        var scrollInner = document.createElement('div');
        scrollInner.className = 'sl-settings-scroll-inner';
        scroll.appendChild(scrollInner);

        [usernameField, keywordField, maxPlayersRow, followersRow]
            .filter(Boolean).forEach(function (fieldEl) { scrollInner.appendChild(fieldEl); });

        // "كرت" — عدد الفائزين (نفس كروت روليت الإقصاء)
        if (winnersRow) {
            var card = document.createElement('div');
            card.className = 'sl-settings-card';
            card.appendChild(winnersRow);
            scrollInner.appendChild(card);
        }

        var fade = document.createElement('div');
        fade.className = 'sl-settings-fade';
        var glowline = document.createElement('div');
        glowline.className = 'sl-settings-glowline';
        scroll.appendChild(fade);
        scroll.appendChild(glowline);
        box.appendChild(scroll);

        var footer = document.createElement('div');
        footer.className = 'sl-settings-footer';
        footer.appendChild(connectBtn);
        box.appendChild(footer);
    }

    function enhanceSettingsScreen() {
        var box = el('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box') || box.classList.contains('agp-connecting-box') ||
            el('agp-mini-lobby-list')) return;
        var isInitial = !!el('agp-tiktok-username');
        box.classList.toggle('sl-settings-initial-box', isInitial);
        if (isInitial) layoutInitialSettingsFields(box);
        if (box.querySelector('.sl-back-to-platform-btn')) return;
        if (el('agp-settings-player-list')) return;
        var connectBtn = box.querySelector('.agp-shell-btn-connect');
        if (!connectBtn) return;
        var backBtn = makeBackToPlatformBtn();
        if (isInitial) backBtn.textContent = 'العودة للمنصة ←';
        connectBtn.insertAdjacentElement('afterend', backBtn);
    }

    function enhanceLobbyHeading() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var h2 = box.querySelector('h2');
        if (!h2) return;
        if (h2.getAttribute('data-sl-heading') !== '1') {
            h2.textContent = 'لوبي الدخول للعبة "' + GAME_NAME + '"';
            h2.setAttribute('data-sl-heading', '1');
        }
    }

    var FRAMED_SLOT_W = 217;
    var FRAMED_SLOT_MAX_H = 75;
    var _slFrameBoundsCache = {};

    function getFrameOpaqueRows(src) {
        if (_slFrameBoundsCache[src]) return _slFrameBoundsCache[src];
        _slFrameBoundsCache[src] = new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                try {
                    var w = Math.min(img.naturalWidth, 300);
                    var h = Math.max(1, Math.round(img.naturalHeight * w / img.naturalWidth));
                    var c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    var ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    var data = ctx.getImageData(0, 0, w, h).data;
                    var top = -1, bottom = -1;
                    for (var y = 0; y < h && top < 0; y++) {
                        for (var x = 0; x < w; x++) { if (data[(y * w + x) * 4 + 3] > 16) { top = y; break; } }
                    }
                    for (var y2 = h - 1; y2 >= 0 && bottom < 0; y2--) {
                        for (var x2 = 0; x2 < w; x2++) { if (data[(y2 * w + x2) * 4 + 3] > 16) { bottom = y2 + 1; break; } }
                    }
                    resolve(top < 0 ? null : { top: top / h, bottom: bottom / h });
                } catch (e) { resolve(null); }
            };
            img.onerror = function () { resolve(null); };
            img.src = src;
        });
        return _slFrameBoundsCache[src];
    }

    function enhanceLobbyFramedCards() {
        var box = el('agp-shell-box');
        if (!box || !(box.classList.contains('agp-lobby-box') || el('agp-mini-lobby-list'))) return;
        fitFramedCards(box);
    }

    function fitFramedCards(root) {
        var cards = root.querySelectorAll('.agp-shell-player-list .agp-pcard-tpl:not([data-sl-fit])');
        Array.prototype.forEach.call(cards, function (card) {
            var frameEl = card.querySelector('.agp-pcard-tpl-frame-img');
            var m = frameEl && /url\(["']?(.*?)["']?\)/.exec(frameEl.style.backgroundImage);
            if (!m) return;
            card.setAttribute('data-sl-fit', 'pending');
            getFrameOpaqueRows(m[1]).then(function (rows) {
                if (!rows || !card.isConnected) return;
                var frameTop = parseFloat(frameEl.style.top) || 0;
                var frameH = parseFloat(frameEl.style.height) || 0;
                var bandTop = frameTop + rows.top * frameH;
                var bandBottom = frameTop + rows.bottom * frameH;
                var children = card.querySelectorAll('.agp-pcard-tpl-avatar,.agp-pcard-tpl-name,.agp-pcard-tpl-frame-img');
                Array.prototype.forEach.call(children, function (child) {
                    if (child === frameEl) return;
                    var t = parseFloat(child.style.top) || 0;
                    var ch = parseFloat(child.style.height) || 0;
                    if (t < bandTop) bandTop = t;
                    if (t + ch > bandBottom) bandBottom = t + ch;
                });
                Array.prototype.forEach.call(children, function (child) {
                    child.style.top = ((parseFloat(child.style.top) || 0) - bandTop) + 'px';
                });
                var fullH = bandBottom - bandTop;
                var cardW = parseFloat(card.style.width) || 298;
                card.style.height = fullH + 'px';
                card.style.zoom = String(Math.min(FRAMED_SLOT_W / cardW, FRAMED_SLOT_MAX_H / fullH));
                card.setAttribute('data-sl-fit', '1');
            });
        });
    }

    function enhanceLobbyWatermarkAndActions() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;

        if (!box.querySelector('#sl-lobby-watermark')) {
            var img = document.createElement('img');
            img.id = 'sl-lobby-watermark';
            img.src = '../../logo.png';
            img.alt = '';
            box.insertBefore(img, box.firstChild);
        }

        var startBtn = el('agp-start-round-btn');
        if (!startBtn) return;
        if (startBtn.textContent.indexOf('اغلاق اللوبي') === -1) {
            startBtn.textContent = '🔒 اغلاق اللوبي وبدء المباراة';
        }

        var row = box.querySelector('.sl-lobby-actions-row');
        if (!row) {
            row = document.createElement('div');
            row.className = 'sl-lobby-actions-row';
            startBtn.parentNode.insertBefore(row, startBtn);
            row.appendChild(startBtn);
            var syncActionsHeight = function () {
                box.style.setProperty('--sl-actions-h',
                    (row.offsetHeight + (parseFloat(getComputedStyle(row).marginTop) || 0)) + 'px');
            };
            syncActionsHeight();
            if (window.ResizeObserver) new ResizeObserver(syncActionsHeight).observe(row);
        }

        if (!row.querySelector('.sl-back-to-platform-btn')) {
            var backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.className = 'sl-back-to-platform-btn';
            backBtn.textContent = '🏠 العودة لمكتبة الألعاب';
            backBtn.addEventListener('click', function () {
                window.location.href = '../../games.html';
            });
            row.appendChild(backBtn);
        }
    }

    function applyShellEnhancements() {
        enhanceSettingsScreen();
        enhanceLobbyHeading();
        enhanceLobbyWatermarkAndActions();
        enhanceLobbyFramedCards();
    }

    /* ======================================================================
     *  13) طبقة "جاري الاتصال بالبث" — نفس روليت الإقصاء
     * ==================================================================== */
    var _slConnLayer = null;
    var _slConnKeywordBackup = '';
    var _slConnKeywordPending = false;
    var _slConnErrorShown = false;
    var _slConnErrorTimer = null;

    function ensureConnLayer() {
        if (_slConnLayer) return _slConnLayer;
        var layer = document.createElement('div');
        layer.id = 'sl-conn-layer';
        layer.innerHTML =
            '<div class="sl-conn-backdrop"></div>' +
            '<div class="sl-conn-modal">' +
                '<div class="sl-conn-icon"></div>' +
                '<h3 class="sl-conn-title"></h3>' +
                '<p class="sl-conn-sub"></p>' +
            '</div>';
        document.body.appendChild(layer);
        _slConnLayer = layer;
        return layer;
    }

    function showConnLayer(isError, title, sub) {
        var layer = ensureConnLayer();
        var modal = layer.querySelector('.sl-conn-modal');
        var icon = layer.querySelector('.sl-conn-icon');
        modal.classList.toggle('sl-conn-err', isError);
        icon.className = 'sl-conn-icon ' + (isError ? 'sl-conn-err-icon' : 'sl-conn-spinner');
        icon.textContent = isError ? '✕' : '';
        layer.querySelector('.sl-conn-title').textContent = title;
        layer.querySelector('.sl-conn-sub').textContent = sub || '';
        layer.classList.add('show');
    }

    // تفريغ النسخة الشبحية عند الإخفاء — عشان عناصرها (بنفس ids شاشة
    // الإعدادات مثل #agp-tiktok-username) ما تلخبط getElementById لاحقاً
    // (مثلاً درج الإعدادات وسط المباراة يُعامَل كأنه شاشة الإعدادات الأولى).
    function hideConnLayer() {
        if (!_slConnLayer) return;
        _slConnLayer.classList.remove('show');
        var backdrop = _slConnLayer.querySelector('.sl-conn-backdrop');
        if (backdrop) backdrop.innerHTML = '';
    }

    document.addEventListener('click', function (e) {
        if (!e.target || e.target.id !== 'agp-connect-btn') return;
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('sl-settings-initial-box')) return;
        var kInput = el('agp-keyword');
        var uInput = el('agp-tiktok-username');
        // نفس شروط الملف المشترك (handleConnectClick): بدون يوزر أو كلمة
        // مفتاحية ما يصير اتصال أصلاً — فلا نعرض طبقة "جاري الاتصال"
        // (كانت تعلق على الشاشة بدون أي اتصال فعلي).
        if (!kInput || !kInput.value.trim() || !uInput || !uInput.value.trim()) return;
        _slConnKeywordBackup = kInput.value;
        var ghost = box.cloneNode(true);
        ghost.id = 'agp-shell-box-ghost';
        var layer = ensureConnLayer();
        var backdrop = layer.querySelector('.sl-conn-backdrop');
        backdrop.innerHTML = '';
        backdrop.appendChild(ghost);
        _slConnErrorShown = false;
        showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
    }, true);

    function syncConnLayer() {
        var box = el('agp-shell-box');
        if (!box) return;

        if (box.classList.contains('agp-conn-error')) {
            if (!_slConnErrorShown) {
                _slConnErrorShown = true;
                var subEl = box.querySelector('.agp-shell-status');
                showConnLayer(true, 'تعذّر الاتصال', subEl ? subEl.textContent : 'تحقّق من اليوزرنيم وحاول مرة أخرى.');
                clearTimeout(_slConnErrorTimer);
                _slConnErrorTimer = setTimeout(function () {
                    hideConnLayer();
                    if (AGP.gameShell && typeof AGP.gameShell.setSetting === 'function') {
                        var s = AGP.gameShell.getSettings();
                        var firstKey = Object.keys(s)[0];
                        if (firstKey !== undefined) AGP.gameShell.setSetting(firstKey, s[firstKey]);
                    }
                    _slConnKeywordPending = true;
                }, 2400);
            }
            return;
        }

        if (box.classList.contains('agp-connecting-box')) {
            clearTimeout(_slConnErrorTimer);
            _slConnErrorShown = false;
            if (!_slConnLayer || !_slConnLayer.classList.contains('show')) {
                showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
            }
            return;
        }

        clearTimeout(_slConnErrorTimer);
        _slConnErrorShown = false;
        if (box.classList.contains('agp-lobby-box')) hideConnLayer();
        if (_slConnKeywordPending && box.classList.contains('sl-settings-initial-box')) {
            var kInput = el('agp-keyword');
            if (kInput) kInput.value = _slConnKeywordBackup;
            _slConnKeywordPending = false;
        }
    }

    function wireSharedShellEnhancements() {
        applyShellEnhancements();
        syncConnLayer();
        var overlay = el('agp-shell-overlay');
        if (!overlay) return;
        var observer = new MutationObserver(function () {
            applyShellEnhancements();
            syncConnLayer();
        });
        observer.observe(overlay, { childList: true, subtree: true });
    }

    /* ======================================================================
     *  14) تسجيل اللعبة
     * ==================================================================== */
    function registerGame() {
        if (!AGP.gameManager || !AGP.gameShell) {
            console.error('[AGP Snakes & Ladders] AGP Core/Game Shell غير محمَّل بعد — تأكد من ترتيب تحميل الملفات بـindex.html.');
            return;
        }
        injectStageStyles();
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'board-games',
            onLoad: function () { AGP.log('Snakes & Ladders: onLoad.'); },
            onPlayerJoin: function () { enforceMaxPlayers(); },
            onRoundEnd: function () { AGP.log('Snakes & Ladders: onRoundEnd.'); },
            onDestroy: function () {
                resetMatchState();
                AGP.log('Snakes & Ladders: onDestroy — match state cleared.');
            }
        });

        if (!registered) {
            AGP.log('Snakes & Ladders: registration failed (already registered?).');
            return;
        }

        AGP.gameManager.loadGame(GAME_ID);

        AGP.events.on('player:removed', function (payload) {
            handlePlayerRemoved(payload && payload.player);
        });
        AGP.events.on('player:joined', function (payload) {
            handlePlayerJoinedMidMatch(payload && payload.player);
        });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات لعبة السلم والثعبان',
            gameExplanation: 'لوحة من 1 إلى 100 والكأس 🏆 في المربع 100. كل لاعب يجيه دوره عنده 15 ثانية يكتب فيها بالشات ' +
                '"دور" أو "دوران" أو "ارم النرد" أو "roll" فيدور النرد ويمشي بعدد النقاط — السلم يطلّعه والثعبان ينزّله. ' +
                'لو ما كتب خلال 15 ثانية يروح عليه الدور. أول من يوصل للكأس يفوز، وتنتهي المباراة لما يكتمل عدد الفائزين المحدَّد.',
            connectButtonLabel: 'الاتصال بالبث والانتقال للوبي',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../games.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });

        wireSharedShellEnhancements();
    }

    AGP.events.on('platform:ready', function () {
        registerGame();
    });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
