/**
 * ==========================================================================
 *  AGP AL-KHAZNA — "الخزنة" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 *
 * لعبة أصلية (Native) داخل نفس مستودع Project-Testing، بنفس نمط
 * games/musical-chairs بالضبط: صفحتها الخاصة (games/al-khazna/index.html)
 * تحمّل AGP Core كاملاً + js/agp-game-shell.js (عام، مُعدَّل بإضافة سطر
 * واحد فقط لدعم "الحد الأدنى للاعبين" كإعداد حي — راجع تعليقه هناك) +
 * هذا الملف. لا تعديل على منطق أي لعبة أخرى.
 *
 * فكرة اللعبة (مأخوذة من آلية "الخزنة/The Safe Code" المرجعية، بواجهة
 * مختلفة تماماً مبنية على أسلوب الكراسي الموسيقية):
 *   - كل جولة تظهر مجموعة "ساعات" (كل ساعة تمثّل رقماً من 1 إلى 12).
 *   - كل لاعب حي يكتب بالشات ترتيب الأرقام تصاعدياً (مثلاً "3 6 11").
 *   - أول إجابة صحيحة وأسرع = أفضل ترتيب؛ إجابة صحيحة أبطأ = ترتيب أقل؛
 *     إجابة خاطئة = أسوأ من أي إجابة صحيحة؛ عدم الإجابة = أسوأ حالة.
 *   - كل لاعب يرسل إجابة واحدة فقط بالجولة (أي محاولة ثانية تُتجاهل).
 *   - الإقصاء: 10 لاعبين فأكثر ← إقصاء آخر 2 بالترتيب كل جولة. 4 لاعبين
 *     أو أقل ← إقصاء لاعب واحد كل جولة. يستمر حتى يبقى لاعب واحد فائز.
 *   - صعوبة تصاعدية: عدد الساعات يزيد كل جولتين (لا علاقة لذلك بوقت
 *     الإجابة، اللي يبقى ثابتاً طول المباراة حسب الإعداد).
 *
 * الاعتماديات (بنفس ترتيب index.html القياسي، راجع docs/CLAUDE.md):
 *   js/agp-core.js … js/agp-bootstrap.js (AGP Core كامل)، ثم
 *   js/agp-player-card.js، ثم js/agp-game-shell.js، ثم هذا الملف.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.gameManager || !AGP.gameShell || !AGP.timerManager) {
        console.error('[AGP Al-Khazna] AGP Core/Game Shell غير محمَّل بعد — تأكد من ترتيب تحميل الملفات بـindex.html.');
        return;
    }

    var GAME_ID = 'al-khazna';
    var GAME_NAME = 'الخزنة';
    var TIMER_NAME = 'khazna-answer-timer';

    var ANSWER_TIMER_OPTIONS = [
        { label: '10 ثوانٍ', value: 10 },
        { label: '15 ثانية', value: 15 },
        { label: '20 ثانية', value: 20 },
        { label: '30 ثانية', value: 30 },
        { label: '45 ثانية', value: 45 },
        { label: '60 ثانية', value: 60 }
    ];

    var MAX_CLOCKS = 12; // ⚠️ أقصى عدد ساعات ممكن (قيم الساعة فريدة من 1 إلى 12، لا تكرار)
    var ELIMINATE_STAGGER_MS = 550;
    var NEXT_ROUND_DELAY_MS = 1400;

    /* ======================================================================
     *  0) صوت — نغمات قصيرة مولَّدة برمجياً عبر Web Audio API (بدون أي
     *     ملفات صوت خارجية جديدة — لا حاجة لأصول ثنائية إضافية بالمستودع).
     * ==================================================================== */
    var _audioCtx = null;
    function ensureAudioCtx() {
        if (_audioCtx) return _audioCtx;
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try { _audioCtx = new Ctx(); } catch (e) { _audioCtx = null; }
        return _audioCtx;
    }
    var TONE_PRESETS = {
        reveal: [{ freq: 660, dur: 0.12 }, { freq: 880, dur: 0.12 }],
        correct: [{ freq: 880, dur: 0.09 }, { freq: 1180, dur: 0.14 }],
        wrong: [{ freq: 220, dur: 0.22 }],
        eliminate: [{ freq: 300, dur: 0.16 }, { freq: 180, dur: 0.22 }],
        warning: [{ freq: 520, dur: 0.08 }],
        winner: [{ freq: 660, dur: 0.12 }, { freq: 880, dur: 0.12 }, { freq: 1100, dur: 0.22 }]
    };
    function playTone(name) {
        var ctx = ensureAudioCtx();
        if (!ctx) return;
        var steps = TONE_PRESETS[name];
        if (!steps) return;
        var t = ctx.currentTime;
        steps.forEach(function (step) {
            try {
                var osc = ctx.createOscillator();
                var gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(step.freq, t);
                gain.gain.setValueAtTime(0.0001, t);
                gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + step.dur);
                osc.connect(gain).connect(ctx.destination);
                osc.start(t);
                osc.stop(t + step.dur + 0.02);
            } catch (e) { /* تجاهل صامت — الصوت طبقة تحسين فقط */ }
            t += step.dur;
        });
    }

    /* ======================================================================
     *  1) حالة المباراة الداخلية
     * ==================================================================== */
    var _settings = {};
    var _matchActive = false;
    var _startedAt = 0;
    var _alive = [];
    var _eliminated = [];
    var _roundNumber = 0;

    var _roundClocks = [];      // [{hour}] بترتيب العرض العشوائي هالجولة
    var _correctOrder = [];     // ترتيب الأرقام الصحيح تصاعدياً
    var _roundAnswers = {};     // playerId -> { atMs, correct, order }
    var _answerOrderCounter = 0;
    var _windowOpenAt = 0;
    var _answerWindowOpen = false;

    var _commentUnsub = null;
    var _playerRemovedUnsub = null;
    var _playerJoinedUnsub = null;
    var _timerTickUnsub = null;
    var _timerEndedUnsub = null;

    function resetMatchState() {
        _matchActive = false;
        _alive = [];
        _eliminated = [];
        _roundNumber = 0;
        _roundClocks = [];
        _correctOrder = [];
        _roundAnswers = {};
        _answerWindowOpen = false;
        AGP.timerManager.stop(TIMER_NAME);
        unwireCommentListener();
        unwireTimerListeners();
        var elimPanel = el('kz-eliminated-panel');
        if (elimPanel) elimPanel.classList.remove('kz-eliminated-visible');
    }

    function el(id) { return document.getElementById(id); }
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }
    function playerLabel(p) { return (p && (p.name || p.id)) || '—'; }
    function tiktokUsernameFor(player) {
        var id = (player && player.id) || '';
        if (id.indexOf('tiktok:') === 0) return id.slice('tiktok:'.length);
        return (player && (player.name || player.id)) || '';
    }
    function liveSettings() {
        return (AGP.gameShell && typeof AGP.gameShell.getSettings === 'function') ? AGP.gameShell.getSettings() : (_settings || {});
    }

    /* ======================================================================
     *  2) حقول شاشة الإعدادات
     * ==================================================================== */
    function buildSettingsFields() {
        return [
            { key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى لعدد اللاعبين بالمباراة', min: 4, default: 20 },
            {
                key: 'followersOnly', type: 'pill-choice', label: '🔑 مين يقدر يدخل؟',
                options: [{ label: 'الكل', value: false }, { label: 'المتابعون فقط', value: true }],
                default: false
            },
            { key: 'minPlayers', type: 'counter', label: '🎮 الحد الأدنى للاعبين لبدء المباراة', min: 2, default: 4 },
            {
                key: 'answerSeconds', type: 'pill-group', label: '⏱️ مهلة إرسال الإجابة',
                options: ANSWER_TIMER_OPTIONS, default: 20
            },
            { key: 'initialClocks', type: 'counter', label: '🕐 عدد الساعات بالجولة الأولى', min: 2, default: 3 },
            { key: 'clocksIncrement', type: 'counter', label: '➕ زيادة عدد الساعات كل جولتين', min: 0, default: 1 }
        ];
    }

    /* ======================================================================
     *  3) الأنماط — هوية بصرية خاصة بالخزنة (ذهبي/بنفسجي المنصة)، مختلفة
     *     تماماً عن تصميم الصورة المرجعية، لكن بنفس بنية شاشات الشل
     *     المشتركة (لوبي/إعدادات) تماماً كالكراسي الموسيقية.
     * ==================================================================== */
    function injectStageStyles() {
        if (el('kz-stage-styles')) return;
        var style = document.createElement('style');
        style.id = 'kz-stage-styles';
        style.textContent = [
            ':root{--kz-gold:#ffb020;--kz-danger:#ff4d6a;--kz-safe:#2fbf71;}',

            '#kz-stage{position:fixed;inset:0;overflow-y:auto;scrollbar-gutter:stable;',
            'padding-top:78px;padding-bottom:24px;display:flex;flex-direction:column;',
            'align-items:center;z-index:10;font-family:Cairo,sans-serif;direction:rtl;}',

            '#kz-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;',
            'margin:14px auto 8px;padding:12px 20px;width:min(94vw,760px);min-height:64px;box-sizing:border-box;',
            'border-radius:24px;background:linear-gradient(90deg,#3a1750,#2D1932);',
            'border:2px solid var(--agp-accent);box-shadow:0 4px 18px rgba(0,0,0,0.35);}',

            '.kz-badge{border:4px solid var(--agp-accent);background:#CAB6B6;border-radius:35px;',
            'padding:9px 16px;font-weight:800;font-size:0.85em;color:#2b1240;box-sizing:border-box;',
            'min-height:52px;display:flex;align-items:center;gap:6px;white-space:nowrap;}',

            '#kz-round-info{font-size:0.88em;color:#e9d3ff;white-space:nowrap;font-weight:700;}',
            '#kz-round-info .kz-round-num-inline{color:var(--kz-gold);font-weight:900;}',

            '.kz-safe-btn{border:none;border-radius:999px;padding:9px 20px;font-weight:800;font-size:0.95em;',
            'color:#fff;cursor:pointer;background:linear-gradient(90deg,var(--agp-accent-pink),var(--agp-accent));',
            'box-shadow:0 0 10px rgba(255,77,255,0.45);}',
            '.kz-safe-btn:disabled{opacity:0.45;cursor:not-allowed;}',

            '#kz-countdown{margin-top:6px;font-weight:800;font-size:1.15em;color:var(--kz-gold);',
            'min-height:1.4em;display:flex;align-items:center;justify-content:center;gap:6px;}',
            '#kz-countdown.kz-countdown-warn{color:var(--kz-danger);}',

            '#kz-clocks-wrap{display:flex;flex-wrap:wrap;gap:22px;justify-content:center;align-items:flex-start;',
            'max-width:min(92vw,880px);margin:18px auto 6px;}',
            '.kz-clock{width:104px;display:flex;flex-direction:column;align-items:center;gap:8px;}',
            '.kz-clock-face{width:88px;height:88px;border-radius:50%;position:relative;',
            'background:radial-gradient(circle at 35% 30%,#3a1750,#1a0d2e);',
            'border:4px solid var(--kz-gold);box-shadow:0 0 14px rgba(255,176,32,0.45);}',
            '.kz-clock-hand{position:absolute;left:50%;bottom:50%;width:4px;height:30px;',
            'background:#fff;border-radius:3px;transform-origin:bottom center;}',
            '.kz-clock-center{position:absolute;left:50%;top:50%;width:8px;height:8px;border-radius:50%;',
            'background:var(--kz-gold);transform:translate(-50%,-50%);}',
            '.kz-clock-tag{font-weight:900;font-size:0.85em;color:#fff;background:rgba(0,0,0,0.4);',
            'border:1px solid var(--agp-accent-2);border-radius:999px;padding:3px 10px;}',

            '#kz-answer-progress{margin:10px 0 4px;color:#e9d3ff;font-size:0.85em;font-weight:700;}',

            '#kz-players-strip{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;',
            'max-width:min(92vw,880px);margin:10px auto;}',
            '.kz-pstrip-item{display:flex;flex-direction:column;align-items:center;gap:4px;width:64px;',
            'transition:opacity .3s ease,transform .3s ease;}',
            '.kz-pstrip-avatar,.kz-pstrip-fallback{width:48px;height:48px;border-radius:50%;object-fit:cover;',
            'border:2px solid var(--agp-accent-2);box-shadow:0 0 8px rgba(0,194,255,0.5);background:#2c1240;}',
            '.kz-pstrip-fallback{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:0.85em;}',
            '.kz-pstrip-name{font-size:0.62em;color:#f3eefc;max-width:64px;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap;text-align:center;}',
            '.kz-pstrip-item.kz-pstrip-answered .kz-pstrip-avatar,.kz-pstrip-item.kz-pstrip-answered .kz-pstrip-fallback{',
            'border-color:var(--kz-gold);box-shadow:0 0 12px rgba(255,176,32,0.75);}',
            '.kz-pstrip-item.kz-pstrip-correct .kz-pstrip-avatar,.kz-pstrip-item.kz-pstrip-correct .kz-pstrip-fallback{',
            'border-color:var(--kz-safe);box-shadow:0 0 12px rgba(47,191,113,0.85);}',
            '.kz-pstrip-item.kz-pstrip-wrong .kz-pstrip-avatar,.kz-pstrip-item.kz-pstrip-wrong .kz-pstrip-fallback{',
            'border-color:var(--kz-danger);box-shadow:0 0 12px rgba(255,77,106,0.85);filter:grayscale(0.3);}',
            '@keyframes kzShakeOut{0%{transform:scale(1);opacity:1;}',
            '40%{transform:scale(1.08) rotate(6deg);}100%{transform:scale(0.3) translateY(20px);opacity:0;}}',
            '.kz-pstrip-item.kz-pstrip-out{animation:kzShakeOut .55s ease forwards;}',

            /* ⚠️ لوحة النتائج/الترتيب — تظهر مرة واحدة بعد إغلاق نافذة
             * الإجابة، تبقى ظاهرة حتى يقفلها المضيف يدوياً بزر ✕ (نفس
             * فلسفة تبويب المُقصَين بالكراسي الموسيقية — لا اختفاء تلقائي). */
            '#kz-results-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.9);',
            'z-index:9997;width:auto;min-width:320px;max-width:92vw;height:auto;max-height:82vh;box-sizing:border-box;',
            'background:rgba(0,0,0,0.92);border:4px solid var(--agp-accent);border-radius:26px;',
            'padding:26px 30px;display:flex;flex-direction:column;align-items:center;gap:10px;opacity:0;',
            'pointer-events:none;transition:opacity .3s ease,transform .3s ease;',
            'box-shadow:0 0 34px rgba(124,58,237,0.55);}',
            '#kz-results-panel.kz-results-visible{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto;}',
            '.kz-results-title{color:#fff;font-weight:800;font-size:1.2em;}',
            '.kz-results-close-btn{position:absolute;top:14px;left:14px;width:34px;height:34px;',
            'border-radius:50%;background:rgba(255,255,255,0.12);border:2px solid #fff;color:#fff;',
            'font-size:1.05em;font-weight:900;cursor:pointer;display:flex;align-items:center;',
            'justify-content:center;padding:0;line-height:1;}',
            '.kz-results-close-btn:hover{background:rgba(255,255,255,0.28);}',
            '.kz-results-list{list-style:none;margin:8px 0 0;padding:0;max-width:min(560px,86vw);',
            'max-height:52vh;overflow-y:auto;width:100%;}',
            '.kz-results-list li{display:flex;align-items:center;gap:10px;padding:7px 10px;',
            'border-radius:10px;margin-bottom:6px;background:rgba(255,255,255,0.06);color:#fff;',
            'font-size:0.88em;font-weight:700;}',
            '.kz-results-rank{width:26px;text-align:center;color:var(--kz-gold);font-weight:900;}',
            '.kz-results-name{flex:1;text-align:right;}',
            '.kz-results-tag{font-size:0.8em;padding:2px 9px;border-radius:999px;font-weight:800;}',
            '.kz-results-tag.kz-tag-out{background:rgba(255,77,106,0.22);color:#ffb3b3;border:1px solid var(--kz-danger);}',
            '.kz-results-tag.kz-tag-correct{color:var(--kz-safe);}',
            '.kz-results-tag.kz-tag-wrong{color:var(--kz-danger);}',
            '.kz-results-tag.kz-tag-none{color:#aaa;}',
            '#kz-results-continue-btn{margin-top:12px;}',

            /* شاشة الفائز */
            '.kz-winner-title{background:linear-gradient(90deg,var(--kz-gold),var(--agp-accent-2));',
            '-webkit-background-clip:text;background-clip:text;color:transparent;}',
            '.kz-winner-card{display:flex;flex-direction:column;align-items:center;gap:10px;',
            'padding:18px;border-radius:16px;background:rgba(255,255,255,0.06);',
            'border:1px solid var(--kz-gold);margin:0 0 14px;}',
            '.kz-winner-avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;',
            'border:3px solid var(--kz-gold);box-shadow:0 0 22px rgba(255,176,32,0.7);}',
            '.kz-winner-name{font-weight:900;font-size:1.2em;color:#fff;}',
            '.kz-winner-points{color:var(--kz-gold);font-weight:800;font-size:0.9em;}',
            '.kz-winner-final-list{list-style:none;margin:10px 0 0;padding:0;max-width:100%;',
            'max-height:34vh;overflow-y:auto;width:100%;}',
            '.kz-winner-final-list li{display:flex;justify-content:space-between;gap:10px;',
            'padding:6px 10px;color:#f3eefc;font-size:0.85em;border-bottom:1px solid rgba(255,255,255,0.12);}',
            '.kz-winner-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;width:100%;}',
            '.kz-winner-action-btn{width:350px;max-width:90vw;margin-top:0 !important;}',

            '.kz-lobby-game-tag{color:var(--kz-gold);}',

            /* رجوع للمنصة من شاشة الإعدادات (نفس فكرة الكراسي الموسيقية) */
            '.kz-settings-home-btn{display:flex;align-items:center;justify-content:center;gap:6px;',
            'width:100%;max-width:360px;height:44px;margin:18px auto 0;border-radius:10px;',
            'background:linear-gradient(90deg,var(--agp-accent-2),var(--agp-accent));color:#fff;',
            'font-weight:800;font-size:0.9em;text-decoration:none;font-family:Cairo,sans-serif;',
            'box-sizing:border-box;}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  4) بناء الحلبة
     * ==================================================================== */
    function ensureScaffolding() {
        injectStageStyles();
        if (!el('kz-results-panel')) {
            var panel = document.createElement('div');
            panel.id = 'kz-results-panel';
            document.body.appendChild(panel);
        }
        if (!el('kz-stage')) {
            var stage = document.createElement('div');
            stage.id = 'kz-stage';
            stage.innerHTML =
                '<div id="kz-toolbar">' +
                '<span class="kz-badge">🕐 <span id="kz-clocks-badge-num">0</span></span>' +
                '<span class="kz-badge">👥 <span id="kz-players-badge-num">0</span></span>' +
                '<span id="kz-round-info"><span class="kz-round-num-inline" id="kz-round-num"></span> — <span id="kz-round-sub"></span></span>' +
                '</div>' +
                '<div id="kz-countdown"></div>' +
                '<div id="kz-clocks-wrap"></div>' +
                '<div id="kz-answer-progress"></div>' +
                '<div id="kz-players-strip"></div>';
            document.body.appendChild(stage);
        }
    }

    function updateBadges() {
        var clocksNum = el('kz-clocks-badge-num');
        var playersNum = el('kz-players-badge-num');
        if (clocksNum) clocksNum.textContent = _roundClocks.length;
        if (playersNum) playersNum.textContent = _alive.length;
    }

    function renderRoundBanner(phase) {
        var numEl = el('kz-round-num');
        var subEl = el('kz-round-sub');
        if (!numEl || !subEl) return;
        numEl.textContent = 'الجولة ' + _roundNumber;
        if (phase === 'ready') subEl.textContent = '🔓 اضغط "عرض التحدي" وقت ما تجهز';
        else if (phase === 'answering') subEl.textContent = 'اكتبوا ترتيب الأرقام تصاعدياً بالشات';
        else if (phase === 'eliminating') subEl.textContent = 'جارِ حساب الترتيب والإقصاء...';
    }

    function hourAngleDeg(hour) { return (hour % 12) * 30; }

    function renderClocks() {
        var wrap = el('kz-clocks-wrap');
        if (!wrap) return;
        wrap.innerHTML = _roundClocks.map(function (c, idx) {
            return '<div class="kz-clock" id="kz-clock-' + idx + '">' +
                '<div class="kz-clock-face"><div class="kz-clock-hand" style="transform:translateX(-50%) rotate(' + hourAngleDeg(c.hour) + 'deg);"></div>' +
                '<div class="kz-clock-center"></div></div>' +
                '<span class="kz-clock-tag">' + c.hour + '</span></div>';
        }).join('');
    }

    function renderPlayersStrip() {
        var strip = el('kz-players-strip');
        if (!strip) return;
        strip.innerHTML = _alive.map(function (p) {
            var initials = (playerLabel(p) || '').trim().slice(0, 2).toUpperCase() || '؟';
            var avatarHtml = p.avatarUrl
                ? '<img class="kz-pstrip-avatar" src="' + escapeHtml(p.avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;kz-pstrip-fallback&quot;>' + escapeHtml(initials) + '</div>\';">'
                : '<div class="kz-pstrip-fallback">' + escapeHtml(initials) + '</div>';
            return '<div class="kz-pstrip-item" id="kz-pstrip-' + escapeHtml(p.id) + '" data-player-id="' + escapeHtml(p.id) + '">' +
                avatarHtml + '<span class="kz-pstrip-name">' + escapeHtml(playerLabel(p)) + '</span></div>';
        }).join('');
    }

    /* ======================================================================
     *  5) توليد التحدي
     * ==================================================================== */
    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
    }

    function computeClocksCount() {
        var settings = liveSettings();
        var initial = Math.max(2, settings.initialClocks || 3);
        var increment = Math.max(0, settings.clocksIncrement || 0);
        var extraSteps = Math.floor((_roundNumber - 1) / 2);
        return Math.min(MAX_CLOCKS, initial + extraSteps * increment);
    }

    function buildChallenge() {
        var count = computeClocksCount();
        var pool = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).slice(0, count);
        _correctOrder = pool.slice().sort(function (a, b) { return a - b; });
        _roundClocks = shuffle(pool.slice()).map(function (hour) { return { hour: hour }; });
    }

    /* ======================================================================
     *  6) دورة كاملة
     * ==================================================================== */
    function runNextRound() {
        if (!_matchActive) return;
        if (_alive.length <= 1) { endMatch(_alive[0] || null); return; }

        _roundNumber++;
        _roundAnswers = {};
        _answerOrderCounter = 0;
        buildChallenge();

        renderRoundBanner('ready');
        renderClocks();
        renderPlayersStrip();
        updateBadges();
        el('kz-countdown').textContent = '';
        el('kz-countdown').className = '';
        el('kz-answer-progress').textContent = '';

        var toolbar = el('kz-toolbar');
        if (toolbar && !el('kz-reveal-btn')) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'kz-reveal-btn';
            btn.className = 'kz-safe-btn';
            toolbar.appendChild(btn);
        }
        var revealBtn = el('kz-reveal-btn');
        if (revealBtn) {
            revealBtn.disabled = false;
            revealBtn.textContent = '🔓 عرض التحدي';
            revealBtn.onclick = startAnswerWindow;
        }
    }

    function startAnswerWindow() {
        var revealBtn = el('kz-reveal-btn');
        if (revealBtn) { revealBtn.disabled = true; revealBtn.textContent = '⏳ الإجابة جارية'; }

        playTone('reveal');
        renderRoundBanner('answering');

        var seconds = liveSettings().answerSeconds || 20;
        _windowOpenAt = Date.now();
        _answerWindowOpen = true;
        wireCommentListener();
        wireTimerListeners();
        AGP.timerManager.start(TIMER_NAME, seconds);
        updateAnswerProgress();
    }

    function updateAnswerProgress() {
        var el2 = el('kz-answer-progress');
        if (!el2) return;
        var answered = Object.keys(_roundAnswers).length;
        el2.textContent = '✍️ أجاب ' + answered + ' من ' + _alive.length;
    }

    /* ======================================================================
     *  7) الاستماع لشات البث
     * ==================================================================== */
    function parseAnswerText(text) {
        var matches = text.match(/\d+/g);
        if (!matches) return null;
        return matches.map(function (n) { return parseInt(n, 10); });
    }

    function arraysEqual(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    }

    function findAlivePlayer(id, name) {
        for (var i = 0; i < _alive.length; i++) {
            var p = _alive[i];
            if ((id && p.id === id) || (name && p.name === name)) return p;
        }
        return null;
    }

    function wireCommentListener() {
        unwireCommentListener();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_answerWindowOpen || !payload || typeof payload.text !== 'string') return;
            var player = findAlivePlayer(payload.id, payload.name);
            if (!player) return;
            if (_roundAnswers[player.id]) return; // ⚠️ لا يسمح بأكثر من إجابة بنفس الجولة

            var parsed = parseAnswerText(payload.text);
            if (!parsed || !parsed.length) return;

            var correct = arraysEqual(parsed, _correctOrder);
            _roundAnswers[player.id] = {
                atMs: Date.now() - _windowOpenAt,
                correct: correct,
                order: _answerOrderCounter++
            };

            markPlayerAnswered(player.id, correct);
            playTone(correct ? 'correct' : 'wrong');
            updateAnswerProgress();

            if (Object.keys(_roundAnswers).length >= _alive.length) {
                AGP.timerManager.stop(TIMER_NAME);
                window.setTimeout(finishAnswerWindow, 400);
            }
        });
    }

    function unwireCommentListener() {
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = null;
    }

    function markPlayerAnswered(playerId, correct) {
        var item = el('kz-pstrip-' + playerId);
        if (!item) return;
        item.classList.add('kz-pstrip-answered');
        item.classList.add(correct ? 'kz-pstrip-correct' : 'kz-pstrip-wrong');
    }

    function wireTimerListeners() {
        unwireTimerListeners();
        _timerTickUnsub = AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            var cd = el('kz-countdown');
            if (cd) cd.textContent = '⏱️ ' + payload.remainingSeconds + ' ثانية';
            if (payload.remainingSeconds <= 5 && payload.remainingSeconds > 0) {
                if (cd) cd.classList.add('kz-countdown-warn');
                playTone('warning');
            }
        });
        _timerEndedUnsub = AGP.events.on('timer:ended', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            finishAnswerWindow();
        });
    }

    function unwireTimerListeners() {
        if (typeof _timerTickUnsub === 'function') _timerTickUnsub();
        if (typeof _timerEndedUnsub === 'function') _timerEndedUnsub();
        _timerTickUnsub = null;
        _timerEndedUnsub = null;
    }

    /* ======================================================================
     *  8) إغلاق نافذة الإجابة + الترتيب + الإقصاء
     * ==================================================================== */
    function rankAlivePlayers() {
        var correctList = [];
        var wrongList = [];
        var noneList = [];

        _alive.forEach(function (p) {
            var ans = _roundAnswers[p.id];
            if (!ans) { noneList.push(p); return; }
            if (ans.correct) correctList.push(p); else wrongList.push(p);
        });

        correctList.sort(function (a, b) { return _roundAnswers[a.id].atMs - _roundAnswers[b.id].atMs; });
        wrongList.sort(function (a, b) { return _roundAnswers[a.id].atMs - _roundAnswers[b.id].atMs; });

        return correctList.concat(wrongList).concat(noneList);
    }

    function finishAnswerWindow() {
        if (!_answerWindowOpen) return;
        _answerWindowOpen = false;
        unwireCommentListener();
        unwireTimerListeners();
        el('kz-countdown').textContent = '';
        renderRoundBanner('eliminating');

        var ranked = rankAlivePlayers();
        var eliminateCount = (_alive.length > 4) ? 2 : 1;
        eliminateCount = Math.min(eliminateCount, _alive.length - 1);
        var losers = ranked.slice(ranked.length - eliminateCount);
        var loserIds = {};
        losers.forEach(function (p) { loserIds[p.id] = true; });

        showResultsPanel(ranked, loserIds);
    }

    function resultTagHtml(player, isOut) {
        var ans = _roundAnswers[player.id];
        var inner;
        if (!ans) inner = '<span class="kz-results-tag kz-tag-none">بدون إجابة</span>';
        else if (ans.correct) inner = '<span class="kz-results-tag kz-tag-correct">✅ صحيحة (' + (ans.atMs / 1000).toFixed(1) + 'ث)</span>';
        else inner = '<span class="kz-results-tag kz-tag-wrong">❌ خاطئة</span>';
        if (isOut) inner += ' <span class="kz-results-tag kz-tag-out">مُقصى</span>';
        return inner;
    }

    function showResultsPanel(ranked, loserIds) {
        var panel = el('kz-results-panel');
        if (!panel) return;
        var itemsHtml = ranked.map(function (p, idx) {
            return '<li><span class="kz-results-rank">' + (idx + 1) + '</span>' +
                '<span class="kz-results-name">' + escapeHtml(playerLabel(p)) + '</span>' +
                resultTagHtml(p, Boolean(loserIds[p.id])) + '</li>';
        }).join('');

        panel.innerHTML =
            '<button type="button" class="kz-results-close-btn" id="kz-results-close-btn" title="إغلاق">✕</button>' +
            '<div class="kz-results-title">📊 ترتيب الجولة ' + _roundNumber + '</div>' +
            '<ul class="kz-results-list">' + itemsHtml + '</ul>' +
            '<button type="button" class="kz-safe-btn" id="kz-results-continue-btn">التالي ▶</button>';
        panel.classList.add('kz-results-visible');

        var proceed = function () {
            panel.classList.remove('kz-results-visible');
            eliminateSequentially(Object.keys(loserIds));
        };
        document.getElementById('kz-results-close-btn').onclick = proceed;
        document.getElementById('kz-results-continue-btn').onclick = proceed;
    }

    function eliminateSequentially(loserIdList) {
        eliminateOneByOne(loserIdList, 0);
    }

    function eliminateOneByOne(loserIdList, idx) {
        if (idx >= loserIdList.length) {
            updateBadges();
            if (_alive.length <= 1) endMatch(_alive[0] || null);
            else window.setTimeout(runNextRound, NEXT_ROUND_DELAY_MS);
            return;
        }
        var playerId = loserIdList[idx];
        var item = el('kz-pstrip-' + playerId);
        if (item) item.classList.add('kz-pstrip-out');
        playTone('eliminate');

        window.setTimeout(function () {
            if (item) item.remove();
            var aliveIdx = _alive.findIndex(function (p) { return p.id === playerId; });
            if (aliveIdx !== -1) {
                _eliminated.push({ player: _alive[aliveIdx], round: _roundNumber });
                _alive.splice(aliveIdx, 1);
            }
            eliminateOneByOne(loserIdList, idx + 1);
        }, ELIMINATE_STAGGER_MS);
    }

    /* ======================================================================
     *  9) حذف/انضمام لاعب أثناء المباراة
     * ==================================================================== */
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;
        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) {
            _alive.splice(aliveIdx, 1);
            var item = el('kz-pstrip-' + removedPlayer.id);
            if (item) item.remove();
            delete _roundAnswers[removedPlayer.id];
            updateBadges();
            updateAnswerProgress();
            if (_matchActive && _alive.length <= 1) {
                window.setTimeout(function () { endMatch(_alive[0] || null); }, 400);
            }
        }
        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);
    }

    // ⚠️ لاعب ينضم أثناء مباراة شغّالة (حتى أثناء نافذة إجابة مفتوحة) —
    // يُضاف فوراً لقائمة الأحياء وشريط اللاعبين، بدون إعادة رسم الشريط
    // بالكامل (حتى لا تُمسَح علامات "أجاب" الموضوعة على اللاعبين الآخرين).
    function handlePlayerJoined(newPlayer) {
        if (!_matchActive || !newPlayer || !newPlayer.id) return;
        var already = _alive.some(function (p) { return p.id === newPlayer.id; }) ||
            _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (already) return;
        _alive.push(newPlayer);
        updateBadges();

        var strip = el('kz-players-strip');
        if (!strip || el('kz-pstrip-' + newPlayer.id)) return;
        var initials = (playerLabel(newPlayer) || '').trim().slice(0, 2).toUpperCase() || '؟';
        var avatarHtml = newPlayer.avatarUrl
            ? '<img class="kz-pstrip-avatar" src="' + escapeHtml(newPlayer.avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;kz-pstrip-fallback&quot;>' + escapeHtml(initials) + '</div>\';">'
            : '<div class="kz-pstrip-fallback">' + escapeHtml(initials) + '</div>';
        var div = document.createElement('div');
        div.className = 'kz-pstrip-item';
        div.id = 'kz-pstrip-' + newPlayer.id;
        div.setAttribute('data-player-id', newPlayer.id);
        div.innerHTML = avatarHtml + '<span class="kz-pstrip-name">' + escapeHtml(playerLabel(newPlayer)) + '</span>';
        strip.appendChild(div);
        updateAnswerProgress();
    }

    function enforceMaxPlayers() {
        var settings = liveSettings();
        var max = settings.maxPlayers;
        if (!max) return;
        if (AGP.gameManager.getPlayersCount() >= max) {
            AGP.lobby.close();
            if (AGP.keywordManager && typeof AGP.keywordManager.deactivate === 'function') {
                AGP.keywordManager.deactivate();
            }
        }
    }

    /* ======================================================================
     *  10) بدء المباراة (onStartRound من الشل)
     * ==================================================================== */
    function handleStartRound(settingsValues) {
        resetMatchState();
        _settings = settingsValues;
        _alive = AGP.gameManager.getPlayers().slice();
        _eliminated = [];
        _startedAt = Date.now();
        _matchActive = true;

        ensureScaffolding();
        runNextRound();
    }

    /* ======================================================================
     *  11) نهاية المباراة + تقرير النقاط + شاشة الفائز
     * ==================================================================== */
    function endMatch(winner) {
        _matchActive = false;
        unwireCommentListener();
        unwireTimerListeners();
        AGP.timerManager.stop(TIMER_NAME);

        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var allPlayers = AGP.gameManager.getPlayers();
            var participants = allPlayers.map(function (p) {
                return { tiktokUsername: tiktokUsernameFor(p), won: Boolean(winner) && p.id === winner.id };
            }).filter(function (p) { return p.tiktokUsername; });

            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () { return null; });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        pointsPromise.then(function (pointsResult) { renderWinnerScreen(winner, pointsResult); });
    }

    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }

    function finalStandingHtml() {
        // ⚠️ الترتيب النهائي: الفائز أولاً، ثم المُقصَون بترتيب عكسي
        // (آخر واحد اتقصى ظهر أعلى — نجى أطول فترة).
        var order = _eliminated.slice().reverse();
        return order.map(function (entry, idx) {
            return '<li><span>#' + (idx + 2) + ' — ' + escapeHtml(playerLabel(entry.player)) + '</span>' +
                '<span>أُقصي بالجولة ' + entry.round + '</span></li>';
        }).join('');
    }

    function renderWinnerScreen(winner, pointsResult) {
        playTone('winner');

        var box = document.getElementById('agp-shell-box');
        var overlay = document.getElementById('agp-shell-overlay');
        if (!box || !overlay) return;

        box.className = '';
        var awarded = winner ? findAwardedFor(pointsResult, winner) : null;
        var pointsHtml = awarded ? '<div class="kz-winner-points">+' + awarded.points + ' نقطة 🎉</div>' : '';

        box.innerHTML =
            '<h2 class="kz-winner-title">🏆 انتهت المباراة</h2>' +
            (winner
                ? '<div class="kz-winner-card">' +
                  '<img class="kz-winner-avatar" src="' + escapeHtml(winner.avatarUrl || '') + '" onerror="this.style.display=\'none\';" alt="">' +
                  '<div class="kz-winner-name">' + escapeHtml(playerLabel(winner)) + '</div>' +
                  '<div>🔐 آخر من فتح الخزنة!</div>' + pointsHtml +
                  '</div>'
                : '<p class="agp-shell-status" style="text-align:center;">ما فيه فائز واضح لهذي المباراة.</p>') +
            '<div class="agp-shell-field"><label>📋 الترتيب النهائي</label>' +
            '<ul class="kz-winner-final-list">' + finalStandingHtml() + '</ul></div>' +
            '<div class="kz-winner-actions">' +
            '<button class="agp-shell-btn-connect kz-winner-action-btn" id="kz-new-match-btn">🔄 مباراة جديدة</button>' +
            '<button class="agp-shell-btn-connect kz-winner-action-btn" id="kz-replay-same-btn">🔁 إعادة المباراة (نفس اللاعبين)</button>' +
            '</div>';

        overlay.style.display = 'flex';

        document.getElementById('kz-new-match-btn').onclick = function () {
            window.location.reload();
        };
        document.getElementById('kz-replay-same-btn').onclick = function () {
            overlay.style.display = 'none';
            resetMatchState();
            _alive = AGP.gameManager.getPlayers().slice();
            _eliminated = [];
            _startedAt = Date.now();
            _matchActive = true;
            runNextRound();
        };
    }

    /* ======================================================================
     *  12) تسجيل اللعبة بالمنصة
     * ==================================================================== */
    function registerGame() {
        injectStageStyles();

        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'elimination-games',
            onLoad: function () { AGP.log('Al-Khazna: onLoad.'); },
            onPlayerJoin: function () { enforceMaxPlayers(); },
            onRoundEnd: function () { AGP.log('Al-Khazna: onRoundEnd.'); },
            onDestroy: function () { resetMatchState(); AGP.log('Al-Khazna: onDestroy — match state cleared.'); }
        });

        if (!registered) { AGP.log('Al-Khazna: registration failed (already registered?).'); return; }

        AGP.gameManager.loadGame(GAME_ID);

        _playerRemovedUnsub = AGP.events.on('player:removed', function (payload) {
            handlePlayerRemoved(payload && payload.player);
        });
        _playerJoinedUnsub = AGP.events.on('player:joined', function (payload) {
            var p = payload && payload.player;
            if (p) handlePlayerJoined(p);
        });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات مباراة الخزنة',
            gameExplanation: 'كل جولة تظهر مجموعة ساعات، كل ساعة تمثّل رقماً من 1 إلى 12. اكتب بالشات ترتيب ' +
                'الأرقام تصاعدياً (مثلاً "3 6 11") — أول إجابة صحيحة وأسرع تحصل على أفضل ترتيب، والإجابة الخاطئة ' +
                'أو عدم الإجابة أسوأ ترتيب. مع 10 لاعبين فأكثر يُقصى آخر لاعبين كل جولة، وعند الوصول لـ4 لاعبين ' +
                'يُقصى لاعب واحد فقط كل جولة — لين يبقى لاعب واحد هو الفائز! عدد الساعات يزيد كل جولتين (صعوبة ' +
                'أعلى)، بينما وقت الإجابة يبقى ثابتاً طول المباراة.',
            connectButtonLabel: 'اتصال بالبث وبدء الإعدادات',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../index.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });

        startShellOverlayWatcher();
    }

    /* ======================================================================
     *  13) تحسينات بسيطة على شاشات الشل (وسم اسم اللعبة + زر رجوع للمنصة) —
     *      نفس أسلوب الكراسي الموسيقية: مراقبة DOM بدل تعديل الملف المشترك.
     * ==================================================================== */
    function enhanceShellOverlay() {
        var box = document.getElementById('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box')) injectLobbyGameNameLabel();
        if (document.getElementById('agp-settings-close-btn')) enhanceHomeLink('kz-settings-home-btn', box);
        if (document.getElementById('agp-connect-btn')) enhanceHomeLink('kz-connect-home-btn', box);
    }

    function startShellOverlayWatcher() {
        enhanceShellOverlay();
        var target = document.getElementById('agp-shell-overlay') || document.body;
        var observer = new MutationObserver(function () { enhanceShellOverlay(); });
        observer.observe(target, { childList: true, subtree: true });
    }

    function injectLobbyGameNameLabel() {
        var h2 = document.querySelector('#agp-shell-box h2');
        if (!h2 || h2.textContent.indexOf('اللوبي') === -1) return;
        if (h2.querySelector('.kz-lobby-game-tag')) return;
        var tag = document.createElement('span');
        tag.className = 'kz-lobby-game-tag';
        tag.textContent = ' — ' + GAME_NAME;
        h2.appendChild(tag);
    }

    function enhanceHomeLink(id, box) {
        if (document.getElementById(id)) return;
        var btn = document.createElement('a');
        btn.id = id;
        btn.href = '../../index.html';
        btn.className = 'kz-settings-home-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        box.appendChild(btn);
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
