/**
 * AGP CUPS — "لعبة الأكواب" (لعبة أصلية داخل المنصة، بنمط
 * games/elimination-roulette، ملف Plugin مستقل بمنطق إقصاء خاص باللعبة).
 *
 * الآلية: كل جولة الاستريمر يضغط "ابدأ الخلط": ترتفع الكوب اللي تحته
 * الكورة لثواني (عشان الكل يشوفها)، ينزل، وتتحرك الأكواب وتتبادل أماكنها
 * عشوائياً لمدة الخلط ثم تتوقف وتظهر أرقام فوق الأكواب. كل لاعب يكتب رقم
 * الكوب اللي يظن الكورة تحته بالشات (إجابة وحدة فقط لكل لاعب): الإجابة
 * الغلط تقصيه فوراً، واللي ما يجاوب قبل نهاية المهلة يُقصى كمان. لو الكل
 * غلط بنفس الجولة تُعاد بدون إقصاء (حتى ما تنتهي المباراة بدون فائز).
 *
 * التدرّج: كل جولتين ينضاف كوب (حتى 10)، وكل 3 أكواب مضافة تزيد سرعة
 * الخلط شوي (10%). آخر لاعب يبقى هو الفائز.
 *
 * الاعتماديات (بنفس ترتيب index.html القياسي): js/agp-core.js …
 * js/agp-bootstrap.js، ثم js/agp-player-card.js، ثم js/agp-game-shell.js.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    // الأرقام العربية (١٢٣) والفارسية (۱۲۳) والعريضة (１２３) ← إنجليزية (123)
    function toLatinDigits(text) {
        return String(text == null ? '' : text).normalize('NFKC')
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
    }

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.gameManager || !AGP.gameShell || !AGP.timerManager) {
        console.error('[AGP Cups] AGP Core/Game Shell غير محمَّل بعد — تأكد من ترتيب تحميل الملفات بـindex.html.');
        return;
    }

    var GAME_ID = 'cups';
    var GAME_NAME = 'لعبة الأكواب';
    var TIMER_NAME = 'cp-answer-timer';

    var ANSWER_TIMER_OPTIONS = [
        { label: '10 ثوانٍ', value: 10 },
        { label: '15 ثانية', value: 15 },
        { label: '20 ثانية', value: 20 },
        { label: '30 ثانية', value: 30 }
    ];
    var SHUFFLE_DURATION_OPTIONS = [
        { label: '5 ثوانٍ', value: 5 },
        { label: '8 ثوانٍ', value: 8 },
        { label: '10 ثوانٍ', value: 10 },
        { label: '15 ثانية', value: 15 }
    ];
    var SHUFFLE_DURATION_MIN_S = 4;
    var SHUFFLE_DURATION_MAX_S = 20;

    // سرعة الخلط: مدة تبديل كوبين (ms) لكل مستوى بداية
    var SHUFFLE_SPEEDS = [
        { label: 'بطيء', value: 'slow', swapMs: 900 },
        { label: 'عادي', value: 'normal', swapMs: 650 },
        { label: 'سريع', value: 'fast', swapMs: 460 }
    ];
    var MAX_CUPS = 10;
    var ROUNDS_PER_EXTRA_CUP = 2;   // كوب زيادة كل جولتين
    var CUPS_PER_SPEED_STEP = 3;    // كل 3 أكواب مضافة تزيد السرعة
    var SPEED_STEP_FACTOR = 0.9;    // كل زيادة = التبديل أسرع 10% (شي بسيط)
    var MIN_SWAP_MS = 260;
    var BALL_PEEK_MS = 1600;        // مدة ظهور الكورة قبل الخلط

    /* ======================================================================
     *  0) الصوت — مستوى صوت واحد موحَّد لكل شي يُتحكَّم فيه حياً من قائمة
     *     الإجراءات. المؤثرات القصيرة نفس ملفات الكراسي الموسيقية (بدون
     *     تكرارها بالمستودع)، وصوت التبديل/الإقصاء الفوري مولَّد بـWebAudio.
     * ==================================================================== */
    var SOUND_BASE = '../musical-chairs/sounds/';
    var _sounds = {
        reveal: new Audio(SOUND_BASE + 'reveal.wav'),
        claim: new Audio(SOUND_BASE + 'claim.wav'),
        eliminate: new Audio(SOUND_BASE + 'eliminate.wav'),
        warning: new Audio(SOUND_BASE + 'warning.wav'),
        winner: new Audio(SOUND_BASE + 'winner.wav')
    };
    var _muted = false;
    var _volume = 0.4;   // 0..1

    function playSound(name) {
        var a = _sounds[name];
        if (!a) return;
        try {
            a.volume = _muted ? 0 : _volume;
            a.currentTime = 0;
            var p = a.play();
            if (p && typeof p.catch === 'function') { p.catch(function () {}); }
        } catch (e) { /* تجاهل صامت — الصوت طبقة تحسين، لا يوقف اللعبة */ }
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

    var _cups = [];              // [{ id, slot }] — slot = مكان الكوب الحالي (0 = أقصى اليمين)
    var _ballCupId = 0;          // الكوب اللي تحته الكورة
    var _answers = {};           // playerId → رقم الإجابة
    var _roundLosers = [];       // [{ player, reason: 'wrong'|'none', answer }]
    var _speedLevel = 0;
    var _shuffleSpeed = 'normal';

    // 'idle' | 'peek' | 'shuffling' | 'answering' | 'reveal' | 'out' | 'champion' | 'ended'
    var _phase = 'idle';
    var _shuffleTimer = null;
    var _phaseTimer = null;
    var _answerOpen = false;
    var _pEls = {};
    var _ac = null;

    var _commentUnsub = null;
    var _playerRemovedUnsub = null;
    var _playerJoinedUnsub = null;
    var _timerTickUnsub = null;
    var _timerEndedUnsub = null;

    function clearPhaseTimers() {
        if (_shuffleTimer) { clearTimeout(_shuffleTimer); _shuffleTimer = null; }
        if (_phaseTimer) { clearTimeout(_phaseTimer); _phaseTimer = null; }
    }

    function resetMatchState() {
        _matchActive = false;
        _alive = [];
        _eliminated = [];
        _roundNumber = 0;
        _answers = {};
        _roundLosers = [];
        _speedLevel = 0;
        clearPhaseTimers();
        AGP.timerManager.stop(TIMER_NAME);
        _answerOpen = false;
        unwireCommentListener();
        unwireTimerListeners();
        closeModal('cp-out-modal');
        clearTable();
        setPhase('idle');
        renderCenter();
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
            { key: 'maxPlayers', type: 'counter', label: 'الحد الأقصى للاعبين', min: 2, default: 24 },
            {
                key: 'followersOnly', type: 'pill-choice', label: 'المسموح لهم',
                options: [{ label: 'الجميع', value: false }, { label: 'المتابعين فقط', value: true }],
                default: false
            },
            {
                key: 'startCups', type: 'pill-group', label: 'عدد الأكواب بالبداية',
                description: 'ينضاف كوب كل جولتين (حتى ' + MAX_CUPS + ' أكواب)',
                options: [{ label: '3', value: 3 }, { label: '4', value: 4 }, { label: '5', value: 5 }],
                default: 3
            },
            {
                key: 'shuffleSpeed', type: 'pill-choice', label: 'سرعة الخلط',
                description: 'تزيد شوي تلقائياً كل 3 أكواب مضافة',
                options: SHUFFLE_SPEEDS.map(function (s) { return { label: s.label, value: s.value }; }),
                default: 'normal'
            },
            {
                key: 'answerTimerSeconds', type: 'pill-group', label: 'مهلة الإجابة',
                options: ANSWER_TIMER_OPTIONS, default: 15
            },
            {
                key: 'shuffleDurationSeconds', type: 'pill-group', label: 'مدة الخلط',
                options: SHUFFLE_DURATION_OPTIONS, default: 8
            }
        ];
    }

    /* ======================================================================
     *  3) الأنماط — ثيم روليت الإقصاء بالكامل (ألوان، خط IBM Plex Sans
     *     Arabic، كروت زجاجية، أزرار كبسولة). كل الألوان بمتغيرات --cp-*
     *     بأول الستايل، فتعديلها لاحقاً من مكان واحد.
     * ==================================================================== */
    // خط روليت الإقصاء (IBM Plex Sans Arabic) لكل شاشات اللعبة
    function ensureDesignFonts() {
        if (el('cp-design-fonts-link')) return;
        var sheet = document.createElement('link');
        sheet.id = 'cp-design-fonts-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';
        document.head.appendChild(sheet);
    }
    function injectStageStyles() {
        if (el('cp-stage-styles')) return;
        ensureDesignFonts();
        var style = document.createElement('style');
        style.id = 'cp-stage-styles';
        style.textContent = [
            /* ألوان وتنسيق روليت الإقصاء (games/elimination-roulette): خلفية
             * #07060b، كروت زجاجية داكنة، بنفسجي #7c3aed→#a855f7، نص #f4f2f8،
             * رمادي #8a8596، أخضر #34d399 للنجاح وأحمر #f87171 للإقصاء. */
            ':root{--agp-accent:#7c3aed;--agp-accent-2:#c4b5fd;--agp-accent-pink:#a855f7;',
            '--cp-bg:#07060b;--cp-glass:linear-gradient(180deg,rgba(30,26,44,.86),rgba(18,16,26,.86));--cp-line:rgba(255,255,255,.11);',
            '--cp-depth:inset 0 1px 0 rgba(255,255,255,.07),0 24px 60px rgba(0,0,0,.45);',
            '--cp-ctl-bg:rgba(255,255,255,.05);--cp-ctl-line:rgba(255,255,255,.12);',
            '--cp-text:#f7f5fb;--cp-label:#f1eef7;--cp-muted:#9a95a6;--cp-muted-2:#b9b4c6;',
            '--cp-grad:linear-gradient(90deg,#7c3aed,#a855f7);--cp-ok:#34d399;--cp-bad:#f87171;--cp-bad-soft:#fca5a5;',
            '--cp-backdrop:radial-gradient(55% 45% at 85% 0%,rgba(124,58,237,.16),transparent 70%),',
            'radial-gradient(50% 45% at 8% 100%,rgba(91,33,182,.14),transparent 72%),#07060b;}',
            'html,body.agp-shell-active{background:#07060b !important;}',
            '@keyframes cp-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
            '@keyframes cp-pop{0%{opacity:0;transform:scale(.85)}100%{opacity:1;transform:none}}',

            /* ==================================================================
             * شاشة اللعب: هيدر (أزرار/شعار/عنوان) ← قائمة الإجراءات + دائرة
             * اللعب، ونوافذ الإقصاء/الإعدادات/إضافة لاعب.
             * ==================================================================== */
            'body.cp-game-on #agp-persistent-header{display:none !important;}',
            '#cp-stage{position:fixed;inset:0;z-index:10;height:100vh;height:100dvh;overflow:hidden;',
            'display:flex;flex-direction:column;direction:rtl;color:var(--cp-text);',
            'font-family:"IBM Plex Sans Arabic",sans-serif;background:var(--cp-backdrop);}',
            '#cp-stage *{box-sizing:border-box;}',
            '#cp-stage button{font-family:inherit;}',

            /* 1) الهيدر */
            '.cp-header{min-height:clamp(60px,8vh,80px);flex-shrink:0;display:grid;grid-template-columns:1fr auto 1fr;',
            'gap:clamp(8px,1.2vw,24px);align-items:center;padding:clamp(6px,1vh,10px) clamp(12px,1.25vw,24px);',
            'background:rgba(12,10,18,.86);border-bottom:1.5px solid rgba(167,139,250,.18);box-shadow:0 10px 30px rgba(0,0,0,.4);',
            'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}',
            '.cp-header-btns{display:flex;flex-wrap:wrap;align-items:center;gap:clamp(6px,0.5vw,10px);min-width:0;}',
            '.cp-hbtn{flex-shrink:0;display:flex;align-items:center;gap:6px;white-space:nowrap;height:clamp(38px,2.6vw,46px);',
            'padding:0 clamp(12px,1.1vw,18px);border-radius:999px;border:1.5px solid rgba(167,139,250,.4);',
            'background:rgba(139,92,246,.12);color:#ede9fe;cursor:pointer;font-size:clamp(13px,0.9vw,16px);',
            'font-weight:700;box-shadow:inset 0 1px 0 rgba(255,255,255,.08);transition:all .2s;}',
            '.cp-hbtn:hover{background:rgba(139,92,246,.16);border-color:rgba(167,139,250,.55);}',
            '.cp-hbtn:active,.cp-spin-btn:active{transform:scale(.97);}',
            '.cp-spin-btn{flex-shrink:0;display:flex;align-items:center;gap:6px;white-space:nowrap;height:clamp(38px,2.6vw,46px);',
            'padding:0 clamp(16px,1.4vw,24px);border-radius:999px;border:none;cursor:pointer;font-size:clamp(14px,1vw,17px);',
            'font-weight:800;color:#fff;background:var(--cp-grad);',
            'box-shadow:0 6px 20px rgba(139,92,246,.4),inset 0 1px 0 rgba(255,255,255,.2);transition:filter .2s,transform .2s;}',
            '.cp-spin-btn:hover{filter:brightness(1.1);}',
            '.cp-spin-btn:disabled{opacity:0.5;cursor:default;filter:none;}',
            /* وقت الإجابة — يظهر بالهيدر وقت الإجابة بس */
            '.cp-seat-timer{flex-shrink:0;display:flex;align-items:center;gap:6px;white-space:nowrap;height:clamp(38px,2.6vw,46px);',
            'padding:0 clamp(14px,1.3vw,20px);border-radius:999px;font-size:clamp(13px,0.95vw,16px);font-weight:800;',
            'color:#a7f3d0;background:rgba(52,211,153,.14);border:1.5px solid rgba(52,211,153,.55);',
            'box-shadow:0 0 18px rgba(52,211,153,.18);}',
            '.cp-seat-timer[hidden]{display:none;}',
            '.cp-seat-timer b{font-size:1.2em;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;}',
            '.cp-seat-timer.cp-warn{color:var(--cp-bad-soft);background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.5);',
            'box-shadow:0 0 18px rgba(248,113,113,.3);}',
            '.cp-header-logo{justify-self:center;height:clamp(36px,5.6vh,60px);max-width:100%;width:auto;display:block;',
            'filter:drop-shadow(0 0 14px rgba(139,92,246,.45));}',
            '.cp-header-end{justify-self:end;display:flex;align-items:center;gap:clamp(6px,0.5vw,10px);min-width:0;}',
            '.cp-header-title{justify-self:end;white-space:nowrap;display:flex;align-items:center;gap:8px;font-weight:700;',
            'font-size:clamp(14px,1.15vw,18px);font-weight:800;height:clamp(38px,2.6vw,46px);padding:0 clamp(14px,1.3vw,22px);border-radius:999px;',
            'background:rgba(139,92,246,.18);border:1.5px solid rgba(167,139,250,.45);color:#ede9fe;',
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.08);}',

            /* 2) المحتوى */
            '.cp-main{flex:1;display:flex;flex-direction:row;gap:clamp(14px,2vw,28px);padding:clamp(14px,2vw,28px);min-height:0;}',
            '#cp-stage.cp-panel-closed .cp-main{gap:0;}',

            /* 2أ) قائمة الإجراءات */
            '.cp-panel{flex:0 0 auto;width:clamp(280px,24vw,360px);max-height:100%;opacity:1;overflow:hidden;',
            'transition:width .35s ease,max-height .35s ease,opacity .25s ease;display:flex;min-height:0;}',
            '#cp-stage.cp-panel-closed .cp-panel{width:0;opacity:0;}',
            '.cp-panel-inner{width:clamp(280px,24vw,360px);flex-shrink:0;min-height:0;overflow-y:auto;display:flex;',
            'flex-direction:column;gap:clamp(8px,1.4vh,14px);scrollbar-width:none;}',
            '.cp-panel-inner::-webkit-scrollbar{display:none;}',
            '.cp-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 18px;',
            'border-radius:999px;border:1.5px solid var(--cp-line);background:var(--cp-glass);color:var(--cp-text);box-shadow:var(--cp-depth);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
            'cursor:pointer;font-size:16px;font-weight:800;flex-shrink:0;height:clamp(44px,5.4vh,52px);transition:border-color .2s;}',
            '.cp-panel-head:hover{border-color:rgba(167,139,250,.4);}',
            '.cp-panel-head span:last-child{font-size:13px;font-weight:600;color:var(--cp-muted);}',
            '.cp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}',
            '.cp-stat{padding:clamp(8px,1.4vh,16px) 10px;border-radius:22px;background:var(--cp-glass);box-shadow:var(--cp-depth);',
            'border:1.5px solid var(--cp-line);text-align:center;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}',
            '.cp-stat-lbl{font-size:13px;font-weight:700;color:var(--cp-muted);}',
            '.cp-stat-val{font-size:clamp(24px,3.3vh,32px);font-weight:800;line-height:1.25;color:#ddd6fe;font-variant-numeric:tabular-nums;}',
            '.cp-stat-val.cp-gold{background:linear-gradient(180deg,#f4f2f8,#a78bfa);-webkit-background-clip:text;',
            'background-clip:text;color:transparent;}',
            '.cp-game-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:clamp(10px,1.8vh,18px);',
            'padding:clamp(16px,2vh,22px) clamp(18px,1.5vw,22px);border-radius:26px;background:var(--cp-glass);',
            'border:1.5px solid var(--cp-line);box-shadow:var(--cp-depth);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}',
            '.cp-gs-title{grid-column:1/-1;font-size:17px;font-weight:800;color:var(--cp-text);',
            'padding-bottom:12px;border-bottom:1.5px solid rgba(255,255,255,.08);}',
            '.cp-gs-row{display:flex;flex-direction:column;gap:8px;}',
            '.cp-gs-lbl{font-size:15px;font-weight:700;color:var(--cp-label);}',
            '.cp-gs-lbl-row{display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:var(--cp-label);}',
            '.cp-gs-lbl-row span{color:#ddd6fe;font-variant-numeric:tabular-nums;}',
            '.cp-seg{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:4px;padding:4px;border-radius:999px;',
            'background:var(--cp-ctl-bg);border:1.5px solid var(--cp-ctl-line);box-shadow:inset 0 2px 6px rgba(0,0,0,.25);}',
            '.cp-seg-4{grid-template-columns:repeat(4,1fr);}',
            '.cp-seg button{height:38px;border-radius:999px;border:none;cursor:pointer;font-size:14px;font-weight:700;',
            'background:transparent;color:var(--cp-muted-2);transition:all .25s;}',
            '.cp-seg button:hover{color:#fff;}',
            '.cp-seg button.cp-on{background:var(--cp-grad);color:#fff;font-weight:800;',
            'box-shadow:0 6px 20px rgba(139,92,246,.45),inset 0 1px 0 rgba(255,255,255,.25);}',
            '#cp-answer-times button{white-space:nowrap;font-size:13px;padding:0 2px;}',
            '.cp-modal .cp-seg button{height:42px;}',
            '.cp-stepper{display:flex;align-items:center;justify-content:space-between;padding:4px;border-radius:999px;',
            'background:var(--cp-ctl-bg);border:1.5px solid var(--cp-ctl-line);box-shadow:inset 0 2px 6px rgba(0,0,0,.25);}',
            '.cp-stepper button{width:38px;height:38px;border-radius:999px;border:none;background:rgba(255,255,255,.06);',
            'color:#fff;font-size:22px;font-weight:700;cursor:pointer;transition:all .2s;}',
            '.cp-stepper button:hover{background:rgba(139,92,246,.3);}',
            '.cp-stepper div{font-size:16px;font-weight:800;color:#ede9fe;}',
            '.cp-vol{display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:999px;',
            'background:var(--cp-ctl-bg);border:1.5px solid var(--cp-ctl-line);box-shadow:inset 0 2px 6px rgba(0,0,0,.25);}',
            '.cp-vol input{flex:1;accent-color:#a855f7;}',
            '.cp-mute-btn{border:none;background:none;color:#fff;font-size:16px;cursor:pointer;padding:0;line-height:1;}',

            /* 2ب) طاولة الأكواب — نفس إطار عجلة الروليت (تدرّج بنفسجي ناعم)
             * وأرضية «مسرح بنفسجي» المخملية، بشكل مستطيل مستدير الحواف،
             * وتحتها شريط اللاعبين. */
            '.cp-arena{position:relative;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:clamp(10px,1.6vh,16px);}',
            '.cp-status{flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;text-align:center;',
            'min-height:clamp(44px,5.4vh,52px);padding:6px 22px;border-radius:999px;border:1.5px solid var(--cp-line);',
            'background:var(--cp-glass);box-shadow:var(--cp-depth);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
            'font-size:clamp(15px,1.15vw,19px);font-weight:800;color:var(--cp-text);}',
            '.cp-status b{color:#ddd6fe;}',
            '.cp-status .cp-tag{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 12px;border-radius:999px;',
            'font-size:13px;font-weight:800;background:rgba(139,92,246,.18);border:1.5px solid rgba(167,139,250,.45);color:#ede9fe;',
            'animation:cp-pop .45s cubic-bezier(.2,1.25,.35,1);}',
            '.cp-status .cp-tag-speed{background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.45);color:#fde68a;}',
            '.cp-cq{flex:1;min-height:0;display:flex;align-items:stretch;justify-content:center;}',
            '.cp-table{position:relative;width:100%;max-width:1400px;min-height:220px;border-radius:40px;padding:max(6px,.5vw);',
            'background:linear-gradient(160deg,#c4b5fd 0%,#8b5cf6 30%,#5b21b6 65%,#7c3aed 100%);',
            'box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 50px rgba(139,92,246,.3),inset 0 2px 3px rgba(255,255,255,.35);}',
            '.cp-table::before{content:"";position:absolute;inset:-4%;border-radius:60px;pointer-events:none;z-index:-1;',
            'background:radial-gradient(closest-side,rgba(139,92,246,.2),transparent);}',
            '.cp-floor{position:relative;width:100%;height:100%;border-radius:34px;overflow:hidden;container-type:size;',
            'background:',
            'radial-gradient(ellipse 60% 45% at 50% 12%,rgba(221,214,254,.22),transparent 70%),',
            'radial-gradient(ellipse 55% 50% at 50% 60%,rgba(139,92,246,.18),transparent 70%),',
            'radial-gradient(ellipse 80% 80% at 50% 50%,transparent 60%,rgba(5,3,12,.55) 100%),',
            'repeating-linear-gradient(45deg,rgba(255,255,255,.018) 0 2px,transparent 2px 6px),',
            'linear-gradient(170deg,#2a1d4d,#1b1336 55%,#130d27);',
            'box-shadow:inset 0 0 0 2px rgba(20,14,40,.8),inset 0 0 0 3.5px rgba(196,181,253,.45),',
            'inset 0 0 0 5px rgba(20,14,40,.5),inset 0 10px 40px rgba(0,0,0,.4);}',
            /* لمعات صغيرة متفرّقة مثل النجوم */
            '.cp-floor::before{content:"";position:absolute;inset:0;pointer-events:none;background:',
            'radial-gradient(1.5px 1.5px at 12% 22%,rgba(255,255,255,.7),transparent 60%),',
            'radial-gradient(1.5px 1.5px at 78% 16%,rgba(255,255,255,.6),transparent 60%),',
            'radial-gradient(1px 1px at 36% 84%,rgba(255,255,255,.6),transparent 60%),',
            'radial-gradient(1.5px 1.5px at 90% 70%,rgba(221,214,254,.7),transparent 60%),',
            'radial-gradient(1px 1px at 22% 62%,rgba(255,255,255,.5),transparent 60%),',
            'radial-gradient(1px 1px at 58% 30%,rgba(255,255,255,.45),transparent 60%),',
            'radial-gradient(1.5px 1.5px at 6% 88%,rgba(221,214,254,.55),transparent 60%),',
            'radial-gradient(1px 1px at 66% 90%,rgba(255,255,255,.45),transparent 60%);}',
            /* خط الطاولة اللي تقف عليه الأكواب */
            '.cp-floor::after{content:"";position:absolute;left:6%;right:6%;top:calc(var(--cp-row,64%) + var(--cw,10cqw) * .56);height:2px;',
            'border-radius:2px;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(196,181,253,.35),transparent);}',
            '.cp-watermark{position:absolute;left:50%;top:50%;width:min(46cqw,70cqh);height:auto;transform:translate(-50%,-50%);',
            'opacity:0.06;pointer-events:none;}',
            /* الكوب: غلاف يتحرك أفقياً (left) + قوس وقت التبديل + جزء يرتفع */
            '.cp-cup{position:absolute;top:var(--cp-row,64%);width:var(--cw,10cqw);aspect-ratio:100/112;',
            'transform:translate(-50%,-50%);z-index:2;',
            'transition:left var(--sw,650ms) cubic-bezier(.45,.05,.55,.95);}',
            '.cp-cup.cp-front{z-index:4;}',
            '.cp-cup-shadow{position:absolute;left:8%;right:8%;bottom:-6%;height:14%;border-radius:50%;pointer-events:none;',
            'background:radial-gradient(ellipse,rgba(0,0,0,.6),transparent 70%);filter:blur(2px);}',
            '.cp-cup-arc{position:absolute;inset:0;}',
            '.cp-cup-arc.cp-arc-up{animation:cp-arc-up var(--sw,650ms) cubic-bezier(.45,.05,.55,.95) both;}',
            '.cp-cup-arc.cp-arc-down{animation:cp-arc-down var(--sw,650ms) cubic-bezier(.45,.05,.55,.95) both;}',
            '@keyframes cp-arc-up{0%{transform:none}50%{transform:translateY(-24%) scale(.94)}100%{transform:none}}',
            '@keyframes cp-arc-down{0%{transform:none}50%{transform:translateY(9%) scale(1.06)}100%{transform:none}}',
            /* الكورة: ذهبية ناعمة بلمعة، تحت الكوب */
            '.cp-ball{position:absolute;left:50%;bottom:2%;width:40%;aspect-ratio:1;border-radius:50%;transform:translateX(-50%);',
            'background:radial-gradient(circle at 34% 30%,#fffbeb 0%,#fde68a 22%,#f6c453 52%,#d9962b 100%);',
            'box-shadow:0 0 18px rgba(253,230,138,.55),0 0 40px rgba(251,191,36,.25),inset -3px -5px 8px rgba(146,84,10,.35);}',
            '.cp-cup:not(.cp-has-ball) .cp-ball{display:none;}',
            // الكورة (ولمعتها) ما تبان إلا والكوب مرفوع — وتختفي بعد ما ينزل
            '.cp-ball{opacity:0;transition:opacity .2s ease .3s;}',
            '.cp-cup.cp-lifted .cp-ball{opacity:1;transition-delay:0s;}',
            '.cp-cup-lift{position:absolute;inset:0;transition:transform .5s cubic-bezier(.34,1.3,.64,1);}',
            '.cp-cup.cp-lifted .cp-cup-lift{transform:translateY(-64%);}',
            '.cp-cup-svg{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible;',
            'filter:drop-shadow(0 8px 10px rgba(0,0,0,.45));}',
            /* رقم الكوب: نفس مربع أرقام الكراسي — بنفسجي داكن وحد لافندر */
            '.cp-cup-num{position:absolute;left:50%;bottom:calc(100% + .14em);transform:translateX(-50%);padding:0.1em 0.3em;',
            'min-width:1.3em;border-radius:0.22em;display:none;align-items:center;justify-content:center;color:#fff;font-weight:900;',
            'line-height:1;background:linear-gradient(180deg,#4c2f8f,#33206a);letter-spacing:-0.02em;font-variant-numeric:tabular-nums;',
            'border:2px solid rgba(221,214,254,.7);text-shadow:0 2px 3px rgba(0,0,0,.5);',
            'box-shadow:0 6px 14px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.18);}',
            '.cp-table.cp-numbered .cp-cup-num{display:flex;animation:cp-pop .45s cubic-bezier(.2,1.25,.35,1) both;}',
            '.cp-cup.cp-win .cp-cup-num{background:linear-gradient(180deg,#0f766e,#065f46);border-color:#6ee7b7;',
            'box-shadow:0 6px 14px rgba(0,0,0,.45),0 0 18px rgba(52,211,153,.5);}',
            '.cp-cup.cp-win .cp-cup-svg{filter:drop-shadow(0 8px 10px rgba(0,0,0,.45)) drop-shadow(0 0 14px rgba(110,231,183,.55));}',
            '.cp-table.cp-revealed .cp-cup:not(.cp-win){opacity:.55;transition:opacity .4s, left var(--sw,650ms);}',

            /* شريط اللاعبين تحت الطاولة */
            '.cp-players{flex-shrink:0;max-height:34%;overflow-y:auto;scrollbar-width:none;display:flex;flex-wrap:wrap;',
            'justify-content:center;align-content:flex-start;gap:10px;padding:2px;}',
            '.cp-players::-webkit-scrollbar{display:none;}',
            '.cp-pl{position:relative;display:flex;align-items:center;gap:8px;height:50px;padding:0 14px 0 5px;border-radius:999px;',
            'background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03));border:1.5px solid rgba(255,255,255,.12);',
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 6px 16px rgba(0,0,0,.25);animation:cp-rise .4s cubic-bezier(.2,1.3,.4,1) both;',
            'transition:border-color .3s,background .3s,opacity .3s,filter .3s;}',
            '.cp-pl-av{flex-shrink:0;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
            'background:#2a1f45;border:2.5px solid #a78bfa;box-shadow:0 0 12px rgba(167,139,250,.35);overflow:hidden;',
            'font-size:13px;font-weight:800;color:#fff;}',
            '.cp-pl-av img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.cp-pl-name{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:700;color:var(--cp-text);}',
            '.cp-pl-st{flex-shrink:0;display:none;align-items:center;justify-content:center;height:22px;padding:0 8px;border-radius:999px;',
            'font-size:12px;font-weight:800;}',
            '.cp-pl.cp-answered .cp-pl-st{display:flex;background:rgba(139,92,246,.2);color:#ddd6fe;border:1px solid rgba(167,139,250,.45);}',
            '.cp-pl.cp-right{border-color:rgba(52,211,153,.6);background:rgba(52,211,153,.08);}',
            '.cp-pl.cp-right .cp-pl-av{border-color:#6ee7b7;box-shadow:0 0 12px rgba(52,211,153,.45);}',
            '.cp-pl.cp-right .cp-pl-st{display:flex;background:rgba(52,211,153,.16);color:#a7f3d0;border:1px solid rgba(52,211,153,.5);}',
            '.cp-pl.cp-wrong{border-color:rgba(248,113,113,.55);background:rgba(248,113,113,.08);filter:grayscale(.45);opacity:.8;',
            'animation:cp-shake .45s ease both;}',
            '.cp-pl.cp-wrong .cp-pl-av{border-color:#fca5a5;box-shadow:0 0 12px rgba(248,113,113,.45);}',
            '.cp-pl.cp-wrong .cp-pl-st{display:flex;background:rgba(248,113,113,.14);color:var(--cp-bad-soft);border:1px solid rgba(248,113,113,.5);}',
            '@keyframes cp-shake{0%,100%{transform:none}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}',
            '.cp-players.cp-compact .cp-pl{height:42px;padding:0 10px 0 4px;gap:6px;}',
            '.cp-players.cp-compact .cp-pl-av{width:32px;height:32px;}',
            '.cp-players.cp-compact .cp-pl-name{max-width:96px;font-size:13px;}',

            '.cp-center{position:absolute;inset:0;z-index:6;display:none;flex-direction:column;align-items:center;justify-content:center;',
            'gap:10px;text-align:center;padding:20px;}',
            '.cp-center.cp-show{display:flex;animation:cp-pop .4s cubic-bezier(.2,1.25,.35,1);}',
            '.cp-center.cp-dim{background:rgba(10,7,20,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);}',
            '.cp-ended-title{font-size:clamp(28px,6cqmin,64px);font-weight:800;background:linear-gradient(180deg,#f4f2f8,#c4b5fd);',
            '-webkit-background-clip:text;background-clip:text;color:transparent;}',
            '.cp-ended-sub{font-size:clamp(14px,2.6cqmin,22px);font-weight:600;color:var(--cp-muted-2);}',
            '.cp-gs-hint{font-size:13px;font-weight:600;line-height:1.6;color:var(--cp-muted);}',
            // الشاشات الضيقة/العمودية: المحتوى يتمرّر والطاولة تاخذ ارتفاع ثابت بدل ما تنضغط
            '@media (max-width:899px),(max-aspect-ratio:9/10){.cp-main{overflow-y:auto;}',
            '.cp-arena{flex:0 0 auto;}.cp-cq{flex:0 0 auto;height:max(300px,52dvh);}.cp-players{max-height:none;overflow:visible;}}',

            /* النوافذ — نفس نوافذ روليت الإقصاء */
            '.cp-modal{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;padding:20px;',
            'background:rgba(0,0,0,.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}',
            '.cp-modal.cp-show{display:flex;}',
            '.cp-card{position:relative;max-height:calc(100dvh - 40px);min-height:0;overflow-y:auto;display:flex;flex-direction:column;',
            'gap:18px;padding:24px 26px;border-radius:30px;background:linear-gradient(180deg,#171326,#0d0b14);scrollbar-width:none;',
            'border:1.5px solid rgba(167,139,250,.45);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 30px 90px rgba(0,0,0,.65),0 0 60px rgba(124,58,237,.25);',
            'animation:cp-pop .4s cubic-bezier(.2,1.25,.35,1);}',
            '.cp-card::-webkit-scrollbar{display:none;}',
            '.cp-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;}',
            '.cp-card-title{font-size:22px;font-weight:800;}',
            '.cp-x{width:42px;height:42px;flex-shrink:0;border-radius:999px;border:1.5px solid rgba(255,255,255,.14);font-weight:700;',
            'background:rgba(255,255,255,.04);color:var(--cp-label);cursor:pointer;font-size:16px;line-height:1;transition:background .2s;}',
            '.cp-x:hover{background:rgba(255,255,255,.09);}',
            '.cp-btn-primary{border:none;cursor:pointer;font-weight:800;color:#fff;border-radius:999px;',
            'background:var(--cp-grad);box-shadow:0 10px 34px rgba(139,92,246,.45),inset 0 1px 0 rgba(255,255,255,.2);',
            'transition:filter .2s,transform .2s;}',
            '.cp-btn-primary:hover{filter:brightness(1.1);}',
            '.cp-btn-primary:active{transform:scale(.97);}',
            // نافذة الإقصاء
            '#cp-out-modal{transition:opacity .35s ease;opacity:0;}',
            '#cp-out-modal.cp-in{opacity:1;}',
            '#cp-out-modal .cp-card{width:min(820px,100%);transform:scale(0.85) translateY(20px);animation:none;',
            'border-color:rgba(248,113,113,.35);box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 60px rgba(248,113,113,.15);',
            'transition:transform .55s cubic-bezier(.34,1.56,.64,1);}',
            '#cp-out-modal.cp-in .cp-card{transform:scale(1);}',
            '#cp-out-modal .cp-x{position:absolute;top:16px;left:16px;}',
            '.cp-out-head{display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:4px;}',
            '.cp-out-head img{height:clamp(44px,8vh,64px);width:auto;max-width:70%;filter:drop-shadow(0 0 14px rgba(139,92,246,.45));}',
            '.cp-out-title{font-size:24px;font-weight:800;color:var(--cp-bad-soft);}',
            '.cp-out-sub{font-size:13px;color:var(--cp-muted);}',
            '.cp-out-list{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;}',
            '.cp-out-item{width:clamp(104px,14vw,132px);display:flex;flex-direction:column;align-items:center;gap:8px;',
            'padding:16px 8px;border-radius:22px;background:rgba(248,113,113,.1);border:1.5px solid rgba(248,113,113,.45);',
            'opacity:0;transform:scale(0.6);transition:opacity .4s ease,transform .5s cubic-bezier(.34,1.56,.64,1);}',
            '#cp-out-modal.cp-in .cp-out-item{opacity:1;transform:scale(1);}',
            '.cp-out-av{width:clamp(68px,9vw,88px);height:clamp(68px,9vw,88px);border-radius:50%;display:flex;align-items:center;',
            'justify-content:center;background:rgba(248,113,113,.12);border:3px solid var(--cp-bad);box-shadow:0 0 18px rgba(248,113,113,.4);',
            'font-weight:700;font-size:clamp(20px,2.6vw,26px);overflow:hidden;filter:grayscale(.35);}',
            '.cp-out-av img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.cp-out-name{font-size:clamp(15px,1.5vw,18px);font-weight:800;text-align:center;overflow-wrap:anywhere;}',
            '.cp-out-tag{font-size:13px;font-weight:700;color:var(--cp-bad-soft);}',
            '.cp-out-next{align-self:center;height:52px;padding:0 40px;font-size:17px;}',
            // نافذة الإعدادات
            '#cp-settings-modal .cp-card{width:min(460px,100%);}',
            '.cp-end-btn{height:52px;border-radius:999px;border:none;cursor:pointer;font-size:16px;font-weight:800;color:#fff;',
            'background:linear-gradient(90deg,#dc2626,#f87171);box-shadow:0 10px 30px rgba(248,113,113,.3);transition:filter .2s;}',
            '.cp-end-btn:hover{filter:brightness(1.1);}',
            '.cp-reset-btn{height:52px;border-radius:999px;border:1.5px solid rgba(248,113,113,.45);background:rgba(248,113,113,.06);',
            'color:var(--cp-bad-soft);cursor:pointer;font-size:16px;font-weight:700;transition:all .2s;}',
            '.cp-reset-btn:hover{background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.5);}',
            // نافذة إضافة لاعب
            '#cp-add-modal{z-index:60;}',
            '#cp-add-modal .cp-card{width:520px;height:700px;max-width:100%;gap:16px;overflow:hidden;}',
            '.cp-add-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:14px;font-size:15px;line-height:1.8;color:var(--cp-label);}',
            '.cp-add-done{flex-shrink:0;height:56px;font-size:18px;}',
            '.cp-join-status{align-self:flex-start;display:flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:999px;',
            'font-size:13px;font-weight:700;background:rgba(52,211,153,.12);border:1.5px solid rgba(52,211,153,.45);color:var(--cp-ok);}',
            '.cp-join-status::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--cp-ok);box-shadow:0 0 8px var(--cp-ok);}',
            '.cp-join-status.cp-closed{background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.3);color:var(--cp-bad-soft);}',
            '.cp-join-status.cp-closed::before{background:var(--cp-bad);box-shadow:0 0 8px var(--cp-bad);}',
            '.cp-join-kw{display:flex;flex-direction:column;align-items:stretch;gap:8px;text-align:center;}',
            '.cp-join-kw span{font-size:14px;font-weight:600;color:var(--cp-muted);text-align:right;}',
            '.cp-join-kw b{padding:12px 24px;border-radius:999px;background:rgba(139,92,246,.16);border:2px dashed #a78bfa;',
            'font-size:clamp(26px,3.2vw,36px);font-weight:800;line-height:1.2;color:#a78bfa;word-break:break-word;}',
            '.cp-join-notes{margin:0;padding:0 18px 0 0;font-size:13px;line-height:1.9;color:var(--cp-muted);}',
            '.cp-join-count{font-size:15px;font-weight:800;color:var(--cp-text);}',
            '.cp-join-count span{color:#a78bfa;}',
            '#cp-join-list{list-style:none;margin:0;padding:4px 0 12px;flex:1;min-height:0;overflow-y:auto;',
            'scrollbar-width:none;-ms-overflow-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));',
            'gap:10px;align-content:start;}',
            '#cp-join-list::-webkit-scrollbar{display:none;}',
            '@media (max-width:520px){#cp-join-list{grid-template-columns:minmax(0,1fr);}}',
            '#cp-join-list .cp-join-empty{grid-column:1 / -1;display:grid;place-items:center;min-height:120px;padding:20px;',
            'border-radius:18px;border:1.5px dashed rgba(255,255,255,.1);text-align:center;font-size:14px;font-weight:500;color:var(--cp-muted);}',

            /* بطاقات اللاعبين (اللوبي + إضافة لاعب) — كبسولة روليت الإقصاء:
             * صورة دائرية بحد بنفسجي، اسم، و✕ للحذف على الطرف. */
            '.cp-er-players{justify-items:stretch !important;}',
            '.cp-er-players > li{position:relative;width:100%;min-width:0;display:flex;align-items:center;padding:0;',
            'animation:cp-rise .4s cubic-bezier(.2,1.3,.4,1) both;}',
            '.cp-er-players .agp-pcard{width:100% !important;max-width:none !important;height:60px !important;',
            'box-sizing:border-box !important;padding:0 7px 0 40px !important;gap:10px !important;border-radius:999px !important;',
            'justify-content:flex-start !important;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03)) !important;',
            'border:1.5px solid rgba(255,255,255,.12) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 6px 16px rgba(0,0,0,.25) !important;}',
            '.cp-er-players .agp-pcard-avatar-basic{width:46px !important;height:46px !important;box-sizing:border-box !important;',
            'background:#2a1f45 !important;border:2.5px solid #a78bfa !important;box-shadow:0 0 12px rgba(167,139,250,.35) !important;}',
            '.cp-er-players .agp-pcard-avatar-basic--fallback{font-size:16px !important;font-weight:800 !important;color:#fff !important;}',
            '.cp-er-players .agp-pcard-name-basic{flex:1 1 auto !important;width:auto !important;min-width:0 !important;',
            'height:auto !important;margin:0 !important;padding:0 !important;justify-content:flex-start !important;',
            'font-size:16px !important;font-family:"IBM Plex Sans Arabic",sans-serif !important;font-weight:700 !important;',
            'color:var(--cp-text) !important;background:none !important;border:none !important;box-shadow:none !important;}',
            '.cp-er-players li:has(> .agp-pcard-tpl){height:75px;overflow:visible;justify-content:center;}',
            '.cp-er-players .agp-pcard-tpl{zoom:0.7282;flex-shrink:0 !important;}',
            '.cp-er-players .agp-player-remove-btn{position:absolute !important;top:50% !important;left:10px !important;right:auto !important;',
            'transform:translateY(-50%);width:24px !important;height:24px !important;padding:0 !important;margin:0 !important;',
            'z-index:5;border:none !important;border-radius:50% !important;background:transparent !important;',
            'color:var(--cp-bad-soft) !important;font-size:13px !important;font-weight:700;line-height:1;cursor:pointer;',
            'opacity:.75;transition:opacity .2s,transform .2s;}',
            '.cp-er-players .agp-player-remove-btn:hover{opacity:1;transform:translateY(-50%) scale(1.15);}',
            // زر الحذف بالشل فيه 🗑️ — نعرض ✕ بداله مثل روليت الإقصاء
            '.cp-er-players .agp-player-remove-btn{font-size:0 !important;}',
            '.cp-er-players .agp-player-remove-btn > *{display:none !important;}',
            '.cp-er-players .agp-player-remove-btn::before{content:"✕";font-size:15px;font-weight:800;}',

            /* الوضع العمودي / الشاشات الأضيق من 900px */
            '@media (max-width:899px),(max-aspect-ratio:9/10){',
            '.cp-header{grid-template-columns:1fr auto;}',
            '.cp-header-btns{grid-area:2 / 1 / 3 / 3;}',
            '.cp-main{flex-direction:column;}',
            '.cp-panel,.cp-panel-inner{width:100%;}',
            '#cp-stage.cp-panel-closed .cp-panel{width:100%;max-height:0;}}',

            /* شاشة الفائز — نفس شاشة الفوز بروليت الإقصاء */
            '#agp-shell-overlay:has(.cp-winner-screen){padding:0 !important;background:rgba(8,4,16,.38) !important;',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);overflow:hidden !important;}',
            '#agp-shell-box.cp-winner-screen{position:static !important;width:100% !important;max-width:none !important;',
            'height:100% !important;max-height:none !important;margin:0 !important;padding:16px !important;box-sizing:border-box;',
            'overflow-y:auto !important;display:flex;flex-direction:column;align-items:center;',
            'background:none !important;border:none !important;border-radius:0 !important;box-shadow:none !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;font-size:18px;color:#f4f2f8;animation:cp-fade .3s ease;}',
            '@keyframes cp-fade{from{opacity:0}to{opacity:1}}',
            '@keyframes cp-crown{0%{opacity:0;transform:translateX(-50%) translateY(-14px) rotate(-6deg)}60%{opacity:1}',
            '100%{opacity:1;transform:translateX(-50%) translateY(0) rotate(0)}}',
            '@keyframes cp-shine{0%{transform:translateX(-140%) rotate(20deg)}100%{transform:translateX(240%) rotate(20deg)}}',
            '.cp-win-owned{width:240px;max-width:100%;line-height:0;animation:cp-pop .55s cubic-bezier(.2,1.3,.4,1) both;}',
            '.cp-win-inner{position:relative;margin:auto 0;max-width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;}',
            '.cp-winner-screen h2{margin:0 0 6px !important;padding:0 !important;font-size:1.6em !important;font-weight:800 !important;',
            'color:#fff !important;background:none !important;border:none !important;',
            'text-shadow:0 2px 12px rgba(0,0,0,.65) !important;text-wrap:balance;}',
            '.cp-winner-video-wrap{position:relative;overflow:hidden;width:160px;height:160px;margin-bottom:18px;border-radius:24px;',
            'box-sizing:border-box;border:1px dashed rgba(167,139,250,.4);background:rgba(255,255,255,.03);',
            'animation:cp-pop .45s cubic-bezier(.2,1,.3,1) both;}',
            '.cp-winner-video-wrap video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;}',
            '.cp-winner-video-unmute{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);z-index:2;white-space:nowrap;',
            'background:rgba(0,0,0,0.55);color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:4px 10px;',
            'font-size:12px;cursor:pointer;font-family:inherit;}',
            '.cp-winner-video-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:3em;}',
            '.cp-win-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:40px 0 34px;}',
            '.cp-win-none{margin:30px 0;color:#a8a3b5;font-size:16px;}',
            '.cp-win-card-wrap{position:relative;width:200px;display:flex;flex-direction:column;align-items:center;}',
            '.cp-win-crown{position:absolute;top:4px;left:50%;z-index:3;display:block;fill:#a78bfa;stroke:#6d28d9;stroke-linejoin:round;',
            'filter:drop-shadow(0 3px 4px rgba(0,0,0,.35));animation:cp-crown .6s cubic-bezier(.2,1.4,.4,1) .15s both;}',
            '.cp-win-card{position:relative;width:200px;height:300px;margin-top:36px;box-sizing:border-box;border-radius:22px;overflow:hidden;',
            'background:linear-gradient(165deg,rgba(30,20,52,.74) 0%,rgba(13,10,24,.84) 100%);border:1.5px solid #a78bfa8c;',
            'box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.04),0 0 40px #a78bfa26;',
            'animation:cp-pop .45s cubic-bezier(.2,1,.3,1) both;}',
            '.cp-win-shine{position:absolute;top:0;left:0;width:60%;height:100%;pointer-events:none;',
            'background:linear-gradient(75deg,transparent 40%,rgba(255,255,255,.12) 50%,transparent 60%);',
            'animation:cp-shine 2.6s ease-in-out .6s infinite;}',
            '.cp-win-card-in{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;height:100%;',
            'padding:18px 14px 16px;box-sizing:border-box;}',
            '.cp-win-label{font-size:15px;letter-spacing:3px;font-weight:800;color:#a78bfa;margin-bottom:12px;}',
            '.cp-win-av{flex-shrink:0;width:84px;height:84px;border-radius:50%;box-sizing:border-box;border:2.5px solid #a78bfa;',
            'box-shadow:0 4px 10px rgba(0,0,0,.4);background:#5b21b6;display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1.4em;overflow:hidden;}',
            '.cp-win-av img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.cp-win-name{margin-top:12px;font-size:17px;font-weight:800;color:#FBF6EC;line-height:1.2;max-width:100%;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '.cp-win-pts{margin-top:auto;width:100%;padding-top:10px;border-top:1px solid #a78bfa40;text-align:center;}',
            '.cp-win-pts b{display:block;font-size:1.4em;font-weight:800;letter-spacing:1px;color:#a78bfa;line-height:1.1;',
            'text-shadow:0 2px 6px rgba(0,0,0,.4);}',
            '.cp-win-pts b.cp-win-pts-num{font-size:2em;}',
            '.cp-win-pts span{display:block;margin-top:4px;font-size:.5em;font-weight:500;color:rgba(167,139,250,.8);text-wrap:balance;}',
            '.cp-winner-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;width:min(600px,100%);margin:0 auto;}',
            '.cp-win-btn{flex:1 0 auto;min-width:150px;height:46px;padding:0 20px;border-radius:999px;font-family:inherit;font-weight:700;white-space:nowrap;',
            'font-size:15px;cursor:pointer;transition:filter .2s,transform .15s;}',
            '.cp-win-btn:active{transform:scale(.97);}',
            '.cp-win-btn-exit{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#f4f2f8;}',
            '.cp-win-btn-exit:hover{filter:brightness(1.25);}',
            '.cp-win-btn-new{border:none;background:linear-gradient(90deg,#7c3aed,#a855f7);color:#fff;box-shadow:0 8px 22px rgba(124,58,237,.4);}',
            '.cp-win-btn-new:hover{filter:brightness(1.1);}',
            '.cp-win-btn-replay{border:1px solid rgba(167,139,250,.55);background:rgba(139,92,246,.16);color:#ddd6fe;}',
            '.cp-win-btn-replay:hover{filter:brightness(1.2);}',

            /* ==================================================================
             * شاشة الإعدادات الأولى + اللوبي + طبقة "جاري الاتصال" — نفس
             * صفحتي index.html وlobby.html بروليت الإقصاء: هيدر ثابت (خروج +
             * شعار)، عنوان متدرّج، أقسام مرقّمة بكروت زجاجية، وزر بنفسجي.
             * ==================================================================== */
            '.agp-field-desc{font-size:13px !important;font-weight:500 !important;line-height:1.55 !important;',
            'color:var(--cp-muted) !important;font-family:"IBM Plex Sans Arabic",sans-serif !important;',
            'white-space:normal !important;text-align:right;}',
            '#agp-shell-overlay:has(.cp-settings-initial-box),#agp-shell-overlay:has(.agp-lobby-box){padding:0 !important;',
            'align-items:flex-start !important;justify-content:center !important;overflow:hidden !important;',
            'background:var(--cp-backdrop) !important;color:var(--cp-text) !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '#cp-er-header{display:none;}',
            '#agp-shell-overlay:has(.cp-settings-initial-box) #cp-er-header,',
            '#agp-shell-overlay:has(.agp-lobby-box) #cp-er-header{position:fixed;top:0;left:0;right:0;z-index:5;height:80px;',
            'display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:clamp(10px,1.2vw,24px);',
            'padding:0 clamp(12px,1.25vw,24px);box-sizing:border-box;direction:rtl;',
            'background:rgba(12,10,18,.86);border-bottom:1.5px solid rgba(167,139,250,.18);box-shadow:0 10px 30px rgba(0,0,0,.4);',
            'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}',
            '#cp-er-header img{height:60px;width:auto;display:block;filter:drop-shadow(0 0 14px rgba(139,92,246,.45));}',
            '.cp-er-exit{justify-self:start;height:clamp(38px,2.6vw,46px);padding:0 clamp(14px,1.1vw,18px);border-radius:999px;',
            'display:flex;align-items:center;gap:8px;font:700 clamp(13px,0.9vw,16px) "IBM Plex Sans Arabic",sans-serif;',
            'white-space:nowrap;cursor:pointer;transition:all .2s;border:1.5px solid rgba(248,113,113,.4);',
            'background:rgba(248,113,113,.06);color:var(--cp-bad-soft);}',
            '.cp-er-exit:hover{background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.45);}',
            '.cp-er-exit:active{transform:scale(.97);}',
            '.cp-er-cta{width:100% !important;max-width:420px !important;height:clamp(56px,7vh,66px) !important;',
            'margin:0 !important;padding:0 24px !important;border:none !important;border-radius:999px !important;cursor:pointer;',
            'display:flex !important;align-items:center !important;justify-content:center !important;gap:10px;',
            'background:var(--cp-grad) !important;color:#fff !important;',
            'font:800 clamp(18px,1.7vw,22px) "IBM Plex Sans Arabic",sans-serif !important;',
            'box-shadow:0 12px 36px rgba(139,92,246,.5),inset 0 1px 0 rgba(255,255,255,.3),inset 0 -3px 0 rgba(46,16,101,.35) !important;',
            'transition:filter .2s,transform .2s !important;}',
            '.cp-er-cta:hover{filter:brightness(1.1);}',
            '.cp-er-cta:active{transform:scale(.97);}',
            '.cp-er-cta:disabled{opacity:.45 !important;cursor:not-allowed !important;filter:none;transform:none;}',

            /* — الإعدادات — */
            '.cp-settings-initial-box{width:min(1080px,100vw) !important;max-width:min(1080px,100vw) !important;',
            'height:calc(100vh - 80px) !important;height:calc(100dvh - 80px) !important;',
            'max-height:none !important;margin:80px 0 0 !important;overflow:visible !important;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;',
            'column-count:auto !important;column-gap:0 !important;background:none !important;border:none !important;',
            'border-radius:0 !important;box-shadow:none !important;padding:0 clamp(12px,2.5vw,32px) !important;',
            'box-sizing:border-box !important;color:var(--cp-text);}',
            '.cp-settings-initial-box,.cp-settings-initial-box *{font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '.cp-settings-initial-box > h2{flex:0 0 auto !important;margin:clamp(16px,3.2vh,34px) 0 12px !important;',
            'max-width:none !important;width:100% !important;font-size:clamp(32px,4.2vw,56px) !important;',
            'font-weight:800 !important;line-height:1.15 !important;text-align:center !important;',
            'padding:0 !important;border-bottom:none !important;position:static;',
            'background:linear-gradient(180deg,#f4f2f8,#c4b5fd) !important;-webkit-background-clip:text !important;',
            'background-clip:text !important;-webkit-text-fill-color:transparent !important;}',
            '.cp-settings-initial-box > h2::after{content:none !important;}',
            '.cp-settings-initial-box .agp-shell-conn-badge{flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;',
            'justify-content:center;gap:8px;margin:0 0 clamp(14px,2.6vh,26px);padding:0;background:none;border:none;}',
            '.cp-er-live{display:flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:999px;',
            'font-size:13px;font-weight:700;background:rgba(248,113,113,.12);border:1.5px solid rgba(248,113,113,.45);',
            'color:var(--cp-bad-soft);}',
            '.cp-er-live b{color:#fff;font-weight:700;}',
            '.agp-shell-conn-yes .cp-er-live{background:rgba(52,211,153,.08);border-color:rgba(52,211,153,.3);color:var(--cp-ok);}',
            '.cp-settings-initial-box .agp-shell-conn-dot{width:7px;height:7px;background:var(--cp-bad);box-shadow:0 0 8px var(--cp-bad);}',
            '.cp-settings-initial-box .agp-shell-conn-yes .agp-shell-conn-dot{background:var(--cp-ok);box-shadow:0 0 8px var(--cp-ok);}',
            '.cp-settings-initial-box .agp-shell-conn-link{height:34px;padding:0 16px;display:flex;align-items:center;',
            'border-radius:999px;text-decoration:none;background:var(--cp-grad);color:#fff;font-size:13px;font-weight:700;',
            'box-shadow:0 4px 14px rgba(139,92,246,.35);}',
            '.cp-settings-initial-box .agp-shell-conn-link:hover{filter:brightness(1.1);}',
            '.cp-settings-initial-box .cp-settings-scroll{position:relative;flex:1 1 auto;min-height:0;width:100%;}',
            '.cp-settings-initial-box .cp-settings-scroll-inner{box-sizing:border-box;height:100%;overflow-y:auto;',
            'overscroll-behavior:contain;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));',
            'gap:clamp(12px,1.4vw,18px);align-content:start;padding:0 0 16px;scrollbar-width:none;}',
            '.cp-settings-initial-box .cp-settings-scroll-inner::-webkit-scrollbar{display:none;}',
            '.cp-er-section{position:relative;min-width:0;display:flex;flex-direction:column;padding:clamp(18px,1.8vw,24px) clamp(20px,2vw,28px);',
            'border-radius:26px;background:var(--cp-glass);border:1.5px solid var(--cp-line);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:var(--cp-depth);',
            'animation:cp-rise .45s ease both;}',
            '.cp-er-section:nth-child(2){animation-delay:.06s;}',
            '.cp-er-section:nth-child(3){animation-delay:.12s;}',
            '.cp-er-section.cp-er-full{grid-column:1 / -1;}',
            '.cp-er-sec-head{display:flex;align-items:center;gap:12px;padding-bottom:12px;margin-bottom:4px;',
            'border-bottom:1.5px solid rgba(255,255,255,.08);}',
            '.cp-er-sec-num{width:36px;height:36px;border-radius:999px;display:grid;place-items:center;',
            'background:var(--cp-grad);color:#fff;font-size:15px;font-weight:800;',
            'box-shadow:0 4px 14px rgba(139,92,246,.45),inset 0 1px 0 rgba(255,255,255,.3);}',
            '.cp-er-sec-title{font-size:clamp(18px,1.45vw,21px);font-weight:800;color:var(--cp-text);}',
            '.cp-er-section > .agp-shell-row,.cp-er-section > .agp-shell-field{display:flex !important;',
            'flex-direction:row !important;flex-wrap:nowrap !important;justify-content:space-between !important;',
            'align-items:center !important;gap:12px !important;min-height:62px;width:auto !important;max-width:none !important;',
            'margin:0 !important;padding:8px 0 !important;border:none !important;border-radius:0 !important;',
            'background:none !important;box-shadow:none !important;}',
            // لو الخيار ما يكفي جنب عنوانه ينزل تحته ويبقى على اليسار
            '.cp-er-section > .agp-shell-row,.cp-er-section > .agp-shell-field{flex-wrap:wrap !important;}',
            '.cp-er-section > .agp-shell-row > .agp-pill-group,.cp-er-section > .agp-shell-row > .agp-shell-counter-row,',
            '.cp-er-section > .agp-shell-field > input[type=text]{margin-inline-start:auto !important;}',
            '.cp-er-section > .agp-shell-row + .agp-shell-row,.cp-er-section > .agp-shell-field + .agp-shell-row{',
            'border-top:1.5px solid rgba(255,255,255,.07) !important;}',
            '.cp-er-section .agp-shell-row-label,.cp-er-section > .agp-shell-field > label{display:flex !important;',
            'flex-direction:column !important;align-items:flex-start !important;gap:3px !important;min-width:0;flex:1 1 auto;',
            'font-size:clamp(15px,1.2vw,17px) !important;font-weight:700 !important;color:var(--cp-label) !important;',
            'text-align:right !important;margin:0 !important;}',
            '.cp-er-section > .agp-shell-field > input[type=text]{flex:0 0 auto;width:min(210px,50%) !important;',
            'max-width:none !important;height:46px !important;box-sizing:border-box !important;margin:0 !important;',
            'border-radius:999px !important;border:1.5px solid var(--cp-ctl-line) !important;',
            'background:var(--cp-ctl-bg) !important;color:var(--cp-text) !important;box-shadow:inset 0 2px 6px rgba(0,0,0,.25) !important;',
            'font-size:16px !important;font-weight:700 !important;padding:0 16px !important;text-align:center !important;',
            'outline:none !important;transition:border-color .2s !important;}',
            '.cp-er-section > .agp-shell-field > input[type=text]::placeholder{color:#6f6a7c;}',
            '.cp-er-section > .agp-shell-field > input[type=text]:focus{border-color:#a78bfa !important;}',
            '.cp-er-section .agp-pill-group{flex:0 0 auto;display:flex !important;flex-wrap:nowrap !important;gap:4px !important;',
            'padding:4px !important;margin:0 !important;border-radius:999px !important;background:var(--cp-ctl-bg) !important;',
            'border:1.5px solid var(--cp-ctl-line) !important;box-shadow:inset 0 2px 6px rgba(0,0,0,.25) !important;}',
            '.cp-er-section .agp-pill-btn{height:40px !important;padding:0 16px !important;border:none !important;',
            'border-radius:999px !important;background:transparent !important;color:var(--cp-muted-2) !important;',
            'font-size:14px !important;font-weight:700 !important;white-space:nowrap;transition:all .25s !important;box-shadow:none !important;}',
            '.cp-er-section .agp-pill-btn:hover{color:#fff !important;}',
            '.cp-er-section .agp-pill-btn.agp-pill-active{background:var(--cp-grad) !important;color:#fff !important;font-weight:800 !important;',
            'box-shadow:0 6px 20px rgba(139,92,246,.45),inset 0 1px 0 rgba(255,255,255,.25) !important;}',
            '.cp-er-section .agp-shell-counter-row{flex:0 0 auto;display:flex !important;align-items:center !important;gap:4px !important;',
            'padding:4px !important;margin:0 !important;border-radius:999px !important;background:var(--cp-ctl-bg) !important;',
            'border:1.5px solid var(--cp-ctl-line) !important;box-shadow:inset 0 2px 6px rgba(0,0,0,.25) !important;}',
            '.cp-er-section .agp-shell-counter-row button{display:block !important;width:40px !important;height:40px !important;',
            'padding:0 !important;border-radius:999px !important;border:none !important;background:rgba(255,255,255,.07) !important;',
            'color:#fff !important;font-size:22px !important;font-weight:700 !important;line-height:1 !important;',
            'cursor:pointer;transition:all .2s !important;}',
            '.cp-er-section .agp-shell-counter-row button:hover{background:rgba(139,92,246,.35) !important;}',
            '.cp-er-section .agp-count-input{width:56px !important;height:40px !important;box-sizing:border-box !important;',
            'padding:0 !important;border:none !important;border-radius:999px !important;background:transparent !important;',
            'text-align:center !important;font-size:19px !important;font-weight:800 !important;color:#fff !important;',
            'font-variant-numeric:tabular-nums;outline:none !important;-moz-appearance:textfield;appearance:textfield;}',
            '.cp-er-section .agp-count-input::-webkit-outer-spin-button,.cp-er-section .agp-count-input::-webkit-inner-spin-button{',
            '-webkit-appearance:none;margin:0;}',
            // الشاشات الضيقة (جوال): لو الخيارات ما تكفي جنب العنوان تنزل
            // تحته وتبقى على اليسار، وتتمرّر أفقياً بدل ما تطلع برا الكرت
            '@media (max-width:640px){',
            '.cp-er-section .agp-pill-group{max-width:100%;overflow-x:auto;scrollbar-width:none;}',
            '.cp-er-section .agp-pill-group::-webkit-scrollbar{display:none;}',
            '.cp-er-section .agp-pill-btn{padding:0 11px !important;}}',
            '.cp-settings-initial-box .cp-settings-footer{flex:0 0 auto !important;width:100% !important;display:flex !important;',
            'justify-content:center !important;padding:clamp(10px,2vh,18px) 0 clamp(16px,3vh,28px) !important;}',

            /* — اللوبي — */
            '#agp-shell-box.agp-lobby-box{width:min(1080px,100vw) !important;max-width:min(1080px,100vw) !important;',
            'height:calc(100vh - 80px) !important;height:calc(100dvh - 80px) !important;max-height:none !important;',
            'margin:80px 0 0 !important;padding:0 clamp(12px,2.5vw,32px) !important;box-sizing:border-box !important;',
            'display:flex !important;flex-direction:column !important;overflow:hidden !important;',
            'background:none !important;border:none !important;border-radius:0 !important;box-shadow:none !important;',
            'color:var(--cp-text);}',
            '#agp-shell-box.agp-lobby-box,#agp-shell-box.agp-lobby-box *{font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '#agp-shell-box.agp-lobby-box > h2{flex:0 0 auto !important;display:flex;flex-direction:column;align-items:center;gap:10px;',
            'margin:0 !important;padding:clamp(6px,1.2vh,12px) 0 clamp(14px,2.6vh,26px) !important;text-align:center;',
            'text-shadow:none !important;letter-spacing:0 !important;font-size:clamp(32px,4.2vw,56px) !important;',
            'font-weight:800 !important;line-height:1.15 !important;color:var(--cp-text) !important;}',
            '.cp-er-kicker{font-size:clamp(15px,1.5vw,19px);font-weight:700;line-height:1.4;color:var(--cp-muted-2);letter-spacing:.5px;}',
            '.cp-er-grad{background:linear-gradient(180deg,#f4f2f8,#c4b5fd);-webkit-background-clip:text;background-clip:text;',
            'color:transparent;-webkit-text-fill-color:transparent;}',
            '.cp-er-lobby-card{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden;',
            'border-radius:28px;background:var(--cp-glass);border:2px solid rgba(167,139,250,.45);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
            'box-shadow:var(--cp-depth),0 0 50px rgba(139,92,246,.16);}',
            '.cp-er-lobby-card::before{content:"";position:absolute;top:-100px;left:50%;width:460px;height:200px;margin-left:-230px;',
            'border-radius:50%;background:rgba(139,92,246,.12);filter:blur(44px);pointer-events:none;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint{position:relative;flex:0 0 auto;display:grid !important;',
            'grid-template-columns:1fr auto;grid-template-areas:"title count" "label label" "kw kw";',
            'align-items:center;gap:14px 12px;width:auto !important;margin:0 !important;',
            'padding:clamp(18px,2.2vw,26px) clamp(20px,2.4vw,30px) !important;border-bottom:1.5px solid rgba(255,255,255,.08);}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint::before{content:"اللاعبين";grid-area:title;justify-self:start;',
            'padding-right:22px;font-size:clamp(20px,1.9vw,24px);font-weight:800;color:#c4b5fd;',
            'background:radial-gradient(circle,#a78bfa 0 5px,transparent 6px) right center / 12px 12px no-repeat;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint-text{grid-area:label;justify-self:start;margin-bottom:-6px;',
            'font-size:14px !important;font-weight:600 !important;color:var(--cp-muted) !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge{grid-area:kw;display:block !important;margin:0 !important;',
            'box-sizing:border-box;padding:10px 22px !important;border-radius:999px !important;text-align:center;',
            'background:rgba(139,92,246,.16) !important;border:2px dashed #a78bfa !important;box-shadow:none !important;',
            'font-size:clamp(28px,3.4vw,40px) !important;font-weight:800 !important;line-height:1.2 !important;color:#a78bfa !important;',
            'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '#agp-shell-box.agp-lobby-box #agp-lobby-count{grid-area:count;position:static !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge{display:flex !important;align-items:baseline;gap:4px;',
            'margin:0 !important;padding:6px 14px !important;border-radius:999px !important;direction:ltr;',
            'background:rgba(139,92,246,.16) !important;border:1.5px solid rgba(167,139,250,.5) !important;box-shadow:none !important;',
            'font-size:22px !important;font-weight:800 !important;color:#c4b5fd !important;font-variant-numeric:tabular-nums;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge::after{content:"لاعب";font-size:14px;font-weight:600;color:var(--cp-muted-2);}',
            '#agp-shell-box.agp-lobby-box #agp-entrance-stage,#agp-shell-box.agp-lobby-box #agp-entrance-settled-list{',
            'flex:0 0 auto !important;position:relative;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{flex:1 1 auto !important;min-height:0 !important;',
            'overflow-y:auto !important;overscroll-behavior:contain;scrollbar-width:none !important;position:relative;',
            'margin:0 !important;padding:clamp(12px,1.6vw,20px) !important;max-height:none !important;',
            'display:grid !important;grid-template-columns:repeat(auto-fill,minmax(200px,1fr)) !important;',
            'grid-auto-rows:minmax(60px,auto);gap:12px !important;align-content:start !important;align-items:center !important;',
            'background:none !important;border:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list::-webkit-scrollbar{display:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list:not(:has(.agp-pcard,.agp-pcard-tpl))::before{',
            'content:"بانتظار انضمام اللاعبين…";grid-column:1 / -1;display:grid;place-items:center;min-height:140px;padding:20px;',
            'border-radius:18px;border:1.5px dashed rgba(255,255,255,.1);color:var(--cp-muted);font-size:14px;font-weight:500;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list > li:not(:has(.agp-pcard,.agp-pcard-tpl)){grid-column:1 / -1;',
            'text-align:center;font-size:14px;color:var(--cp-bad-soft) !important;}',
            '#agp-shell-box.agp-lobby-box .cp-lobby-actions-row{flex:0 0 auto !important;display:flex;justify-content:center;',
            'padding:clamp(10px,2vh,18px) 0 clamp(16px,3vh,28px);margin:0;}',

            /* — طبقة "جاري الاتصال" — نفس نافذة الاتصال بروليت الإقصاء — */
            '#agp-shell-box.agp-connecting-box,#agp-shell-box.agp-conn-error{visibility:hidden !important;}',
            '#cp-conn-layer{position:fixed;inset:0;z-index:100010;display:none;',
            'align-items:center;justify-content:center;font-family:"IBM Plex Sans Arabic",sans-serif;}',
            '#cp-conn-layer.show{display:flex;}',
            '#cp-conn-layer .cp-conn-backdrop{position:absolute;inset:0;overflow:hidden;display:flex;justify-content:center;align-items:flex-start;',
            'background:var(--cp-backdrop);filter:blur(6px) brightness(0.55);pointer-events:none;}',
            '#cp-conn-layer .cp-conn-backdrop > *{pointer-events:none !important;}',
            '#cp-conn-layer .cp-conn-modal{position:relative;z-index:1;width:min(360px,calc(100vw - 24px));box-sizing:border-box;',
            'display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;',
            'background:linear-gradient(180deg,#171326,#0d0b14);border:1.5px solid rgba(167,139,250,.45);border-radius:28px;padding:34px 30px;',
            'box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 60px rgba(124,58,237,.2);animation:cp-pop .4s cubic-bezier(.2,1.25,.35,1);}',
            '#cp-conn-layer .cp-conn-modal.cp-conn-err{border-color:rgba(248,113,113,.5);',
            'box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 60px rgba(248,113,113,.18);}',
            '#cp-conn-layer::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.55);',
            'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}',
            '#cp-conn-layer .cp-conn-spinner{width:64px;height:64px;box-sizing:border-box;',
            'border-radius:50%;border:5px solid rgba(167,139,250,.18);border-top-color:#a78bfa;',
            'animation:cp-conn-spin 0.9s linear infinite;}',
            '@keyframes cp-conn-spin{to{transform:rotate(360deg);}}',
            '#cp-conn-layer .cp-conn-err-icon{width:64px;height:64px;border-radius:50%;background:rgba(248,113,113,.14);',
            'border:2px solid var(--cp-bad);color:var(--cp-bad);font-size:26px;font-weight:900;',
            'display:flex;align-items:center;justify-content:center;}',
            '#cp-conn-layer .cp-conn-title{margin:0;font-size:22px;font-weight:800;color:var(--cp-text);}',
            '#cp-conn-layer .cp-conn-modal.cp-conn-err .cp-conn-title{color:var(--cp-bad-soft);}',
            '#cp-conn-layer .cp-conn-sub{margin:0;font-size:14px;font-weight:500;color:var(--cp-muted-2);}',
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  4) بناء شاشة اللعب — نفس قالب الكراسي الموسيقية/روليت الإقصاء:
     *     هيدر ← قائمة الإجراءات + طاولة الأكواب وشريط اللاعبين، ونوافذ
     *     الإقصاء/الإعدادات/إضافة لاعب.
     * ==================================================================== */
    var MAIN_BTN_LABELS = {
        idle: '▶ ابدأ الخلط', peek: '👀 راقب الكورة', shuffling: '🔀 جاري الخلط',
        answering: '⏹ أنهِ الإجابات', reveal: '⏳ كشف الكورة',
        out: '▶ الجولة التالية', champion: '↺ لعبة جديدة', ended: '↺ مباراة جديدة'
    };

    function ensureScaffolding() {
        injectStageStyles();
        document.body.classList.add('cp-game-on');
        if (el('cp-stage')) return;
        var stage = document.createElement('div');
        stage.id = 'cp-stage';
        stage.setAttribute('dir', 'rtl');
        stage.innerHTML =
            '<header class="cp-header">' +
                '<div class="cp-header-btns">' +
                    '<button type="button" class="cp-hbtn" id="cp-add-btn" title="إضافة لاعب جديد">➕ إضافة لاعب</button>' +
                    '<button type="button" class="cp-hbtn" id="cp-settings-btn" title="الإعدادات">⚙️ الإعدادات</button>' +
                    '<button type="button" class="cp-hbtn" id="cp-panel-btn" title="قائمة الإجراءات">☰ الإجراءات</button>' +
                    '<button type="button" class="cp-spin-btn" id="cp-main-btn">▶ ابدأ الخلط</button>' +
                '</div>' +
                '<img class="cp-header-logo" src="../../logo.png" alt="ألعاب أيمن">' +
                '<div class="cp-header-end">' +
                    '<div class="cp-seat-timer" id="cp-answer-timer" hidden>⏱ وقت الإجابة <b id="cp-answer-timer-val">15</b> ثانية</div>' +
                    '<div class="cp-header-title">🥤 لعبة الأكواب</div>' +
                '</div>' +
            '</header>' +
            '<main class="cp-main">' +
                '<aside class="cp-panel"><div class="cp-panel-inner">' +
                    '<button type="button" class="cp-panel-head" id="cp-panel-head"><span>☰ قائمة الإجراءات</span><span>طي ←</span></button>' +
                    '<section class="cp-stats">' +
                        '<div class="cp-stat"><div class="cp-stat-lbl">الجولة</div><div class="cp-stat-val cp-gold" id="cp-stat-round">1</div></div>' +
                        '<div class="cp-stat"><div class="cp-stat-lbl">👥 اللاعبون</div><div class="cp-stat-val" id="cp-stat-players">0</div></div>' +
                        '<div class="cp-stat"><div class="cp-stat-lbl">🥤 الأكواب</div><div class="cp-stat-val" id="cp-stat-cups">0</div></div>' +
                    '</section>' +
                    '<section class="cp-game-settings">' +
                        '<div class="cp-gs-title">إعدادات اللعبة</div>' +
                        '<div class="cp-gs-row"><div class="cp-gs-lbl-row"><label>مستوى السرعة</label><span id="cp-speed-level">1</span></div>' +
                            '<div class="cp-gs-hint" id="cp-progress-hint"></div></div>' +
                        '<div class="cp-gs-row"><label class="cp-gs-lbl">مدة الخلط</label>' +
                            '<div class="cp-stepper">' +
                                '<button type="button" id="cp-dur-up">+</button>' +
                                '<div>⏱ <span id="cp-dur-val">8</span> ثوانٍ</div>' +
                                '<button type="button" id="cp-dur-down">−</button>' +
                            '</div></div>' +
                        '<div class="cp-gs-row"><label class="cp-gs-lbl">مهلة الإجابة</label>' +
                            '<div class="cp-seg cp-seg-4" id="cp-answer-times"></div></div>' +
                        '<div class="cp-gs-row"><div class="cp-gs-lbl-row"><label>مستوى الصوت</label><span id="cp-vol-val">40%</span></div>' +
                            '<div class="cp-vol"><button type="button" class="cp-mute-btn" id="cp-mute-btn" title="كتم/تشغيل الصوت">🔊</button><input type="range" id="cp-volume-slider" min="0" max="100" value="40"></div></div>' +
                    '</section>' +
                '</div></aside>' +
                '<section class="cp-arena">' +
                    '<div class="cp-status" id="cp-status"></div>' +
                    '<div class="cp-cq"><div class="cp-table" id="cp-table"><div class="cp-floor" id="cp-floor">' +
                        '<img class="cp-watermark" src="../../logo.png" alt="">' +
                        '<div id="cp-cups"></div>' +
                        '<div class="cp-center" id="cp-center"></div>' +
                    '</div></div></div>' +
                    '<div class="cp-players" id="cp-players"></div>' +
                '</section>' +
            '</main>' +

            '<div class="cp-modal" id="cp-add-modal"><div class="cp-card">' +
                '<div class="cp-card-head"><div class="cp-card-title">➕ إضافة لاعب جديد</div>' +
                '<button type="button" class="cp-x" id="cp-add-x" title="إغلاق">✕</button></div>' +
                '<div class="cp-add-body">' +
                    '<div class="cp-join-status" id="cp-join-status"></div>' +
                    '<div class="cp-join-kw"><span>للدخول اكتب في شات البث</span><b id="cp-join-keyword"></b></div>' +
                    '<ul class="cp-join-notes">' +
                        '<li>الدخول مفتوح الآن للاعبين الجدد اللي ما سبق لهم الدخول بهذي المباراة.</li>' +
                        '<li>الكلمة المفتاحية هي نفسها اللي حددتها قبل بداية المباراة.</li>' +
                        '<li>كل لاعب جديد يدخل تظهر بطاقته هنا، وينضم للعب من الجولة الحالية.</li>' +
                    '</ul>' +
                    '<div class="cp-join-count">اللاعبون الجدد (<span id="cp-join-count">0</span>)</div>' +
                    '<ul id="cp-join-list" class="cp-er-players"></ul>' +
                '</div>' +
                '<button type="button" class="cp-btn-primary cp-add-done" id="cp-add-done">أكمل المباراة</button>' +
            '</div></div>' +

            '<div class="cp-modal" id="cp-out-modal"><div class="cp-card">' +
                '<button type="button" class="cp-x" id="cp-out-x" title="إغلاق">✕</button>' +
                '<div class="cp-out-head"><img src="../../logo.png" alt="ألعاب أيمن">' +
                '<div class="cp-out-title">اللاعبون المُقصَون</div><div class="cp-out-sub" id="cp-out-sub"></div></div>' +
                '<div class="cp-out-list" id="cp-out-list"></div>' +
                '<button type="button" class="cp-btn-primary cp-out-next" id="cp-out-next">متابعة</button>' +
            '</div></div>' +

            '<div class="cp-modal" id="cp-settings-modal"><div class="cp-card">' +
                '<div class="cp-card-head"><div class="cp-card-title">⚙️ الإعدادات</div>' +
                '<button type="button" class="cp-x" data-close="cp-settings-modal" title="إغلاق">✕</button></div>' +
                '<div class="cp-gs-row"><div class="cp-gs-lbl">سرعة الخلط (البداية)</div><div class="cp-seg" id="cp-speeds"></div></div>' +
                '<button type="button" class="cp-end-btn" id="cp-end-btn">⏹ إنهاء المباراة</button>' +
                '<button type="button" class="cp-reset-btn" id="cp-reset-btn">↺ إعادة اللعبة من البداية</button>' +
            '</div></div>';
        document.body.appendChild(stage);
        wireStageEvents();
    }

    function openModal(id) { var m = el(id); if (m) m.classList.add('cp-show'); }
    function closeModal(id) { var m = el(id); if (m) m.classList.remove('cp-show', 'cp-in'); }

    function wireStageEvents() {
        el('cp-main-btn').onclick = handleMainButtonClick;
        el('cp-settings-btn').onclick = function () { renderSpeeds(); openModal('cp-settings-modal'); };
        el('cp-add-btn').onclick = openJoin;
        el('cp-add-x').onclick = closeJoin;
        el('cp-add-done').onclick = closeJoin;
        el('cp-panel-btn').onclick = togglePanel;
        el('cp-panel-head').onclick = togglePanel;

        Array.prototype.forEach.call(el('cp-stage').querySelectorAll('[data-close]'), function (b) {
            b.onclick = function () { closeModal(b.getAttribute('data-close')); };
        });
        // النقر على الخلفية يقفل النافذة (نافذة الإقصاء تكمل للجولة الجاية)
        el('cp-settings-modal').addEventListener('click', function (e) { if (e.target.id === 'cp-settings-modal') closeModal('cp-settings-modal'); });
        el('cp-add-modal').addEventListener('click', function (e) { if (e.target.id === 'cp-add-modal') closeJoin(); });
        el('cp-out-modal').addEventListener('click', function (e) { if (e.target.id === 'cp-out-modal') closeOutModal(); });
        el('cp-out-x').onclick = closeOutModal;
        el('cp-out-next').onclick = closeOutModal;

        el('cp-end-btn').onclick = function () { closeModal('cp-settings-modal'); endMatchEarly(); };
        el('cp-reset-btn').onclick = function () { closeModal('cp-settings-modal'); restartMatch(); };

        el('cp-dur-up').onclick = function () { setShuffleDuration(shuffleDuration() + 1); };
        el('cp-dur-down').onclick = function () { setShuffleDuration(shuffleDuration() - 1); };

        var muteBtn = el('cp-mute-btn');
        muteBtn.onclick = function () {
            _muted = !_muted;
            muteBtn.textContent = _muted ? '🔇' : '🔊';
        };

        var vol = el('cp-volume-slider');
        vol.value = Math.round(_volume * 100);
        vol.oninput = function () {
            _volume = Number(vol.value) / 100;
            if (_muted && _volume > 0) { _muted = false; muteBtn.textContent = '🔊'; }
            el('cp-vol-val').textContent = vol.value + '%';
        };
        el('cp-vol-val').textContent = vol.value + '%';

        renderAnswerTimes();
        el('cp-dur-val').textContent = shuffleDuration();
    }

    /* -------- تبويب إضافة لاعب جديد --------
     * يفتح الدخول بنفس الكلمة المفتاحية المحددة قبل المباراة. اللاعب
     * الجديد ينضم للدائرة مباشرة (handlePlayerJoined)، واللي سبق له
     * الدخول (حتى لو انقصى) ما يقدر يدخل مرة ثانية. "أكمل المباراة"
     * (أو ✕ أو النقر على الخلفية) يقفل الدخول. */
    var _joinKnownIds = null;

    function joinMaxReached() {
        var max = liveSettings().maxPlayers;
        return Boolean(max) && AGP.gameManager.getPlayers().length >= max;
    }

    function openJoin() {
        _joinKnownIds = {};
        AGP.gameManager.getPlayers().forEach(function (p) { _joinKnownIds[p.id] = true; });
        if (!joinMaxReached() && AGP.keywordManager) AGP.keywordManager.activate();
        renderJoinPanel();
        openModal('cp-add-modal');
    }

    function closeJoin() {
        _joinKnownIds = null;
        if (AGP.keywordManager) AGP.keywordManager.deactivate();
        closeModal('cp-add-modal');
    }

    function renderJoinPanel() {
        if (!_joinKnownIds || !el('cp-join-list')) return;
        var open = AGP.keywordManager && AGP.keywordManager.isActive();
        var status = el('cp-join-status');
        status.classList.toggle('cp-closed', !open);
        status.textContent = open ? 'الدخول مفتوح الآن' :
            'الدخول مقفل — وصلنا الحد الأقصى للاعبين (' + liveSettings().maxPlayers + ')';
        el('cp-join-keyword').textContent = (AGP.keywordManager && AGP.keywordManager.getKeyword()) || '';

        var newPlayers = AGP.gameManager.getPlayers().filter(function (p) { return !_joinKnownIds[p.id]; });
        el('cp-join-count').textContent = newPlayers.length;
        var list = el('cp-join-list');
        if (!newPlayers.length) {
            list.innerHTML = '<li class="cp-join-empty">بانتظار دخول لاعبين جدد من الشات…</li>';
            return;
        }
        list.innerHTML = newPlayers.map(function (p) {
            var card = AGP.playerCard ? AGP.playerCard.renderHtml(p, { showFrame: true, basePath: '../../' }) : escapeHtml(playerLabel(p));
            return '<li><button type="button" class="agp-player-remove-btn" data-remove-id="' + escapeHtml(p.id) + '" title="حذف">✕</button>' + card + '</li>';
        }).join('');
        Array.prototype.forEach.call(list.querySelectorAll('[data-remove-id]'), function (btn) {
            btn.onclick = function () {
                if (AGP.player && typeof AGP.player.removePlayer === 'function') AGP.player.removePlayer(btn.getAttribute('data-remove-id'));
            };
        });
        if (AGP.playerCard && typeof AGP.playerCard.fitAllNames === 'function') AGP.playerCard.fitAllNames(list);
        fitFramedCards(list);
    }

    function togglePanel() {
        el('cp-stage').classList.toggle('cp-panel-closed');
    }

    // مهلة الإجابة — نفس إعداد answerTimerSeconds بشاشة الإعدادات الأولى،
    // وتنطبق من الجولة الجاية.
    function answerTime() { return Number(liveSettings().answerTimerSeconds) || 15; }
    function renderAnswerTimes() {
        var wrap = el('cp-answer-times');
        if (!wrap) return;
        var cur = answerTime();
        wrap.innerHTML = ANSWER_TIMER_OPTIONS.map(function (o) {
            return '<button type="button" data-secs="' + o.value + '"' + (o.value === cur ? ' class="cp-on"' : '') + '>' + o.label + '</button>';
        }).join('');
        Array.prototype.forEach.call(wrap.children, function (b) {
            b.onclick = function () {
                if (AGP.gameShell.setSetting) AGP.gameShell.setSetting('answerTimerSeconds', Number(b.getAttribute('data-secs')));
                renderAnswerTimes();
            };
        });
    }

    function showAnswerTimer(secs) {
        var t = el('cp-answer-timer');
        if (!t) return;
        if (secs == null) { t.hidden = true; return; }
        el('cp-answer-timer-val').textContent = secs;
        t.classList.toggle('cp-warn', secs <= 5);
        t.hidden = false;
    }

    // سرعة الخلط بالبداية (من الإعدادات أو نافذة ⚙️ أثناء اللعب)
    function baseSwapMs() {
        for (var i = 0; i < SHUFFLE_SPEEDS.length; i++) {
            if (SHUFFLE_SPEEDS[i].value === _shuffleSpeed) return SHUFFLE_SPEEDS[i].swapMs;
        }
        return SHUFFLE_SPEEDS[1].swapMs;
    }
    function swapMs() {
        return Math.max(MIN_SWAP_MS, Math.round(baseSwapMs() * Math.pow(SPEED_STEP_FACTOR, _speedLevel)));
    }
    function renderSpeeds() {
        var wrap = el('cp-speeds');
        wrap.innerHTML = SHUFFLE_SPEEDS.map(function (s) {
            return '<button type="button" data-v="' + s.value + '"' + (s.value === _shuffleSpeed ? ' class="cp-on"' : '') + '>' + s.label + '</button>';
        }).join('');
        Array.prototype.forEach.call(wrap.children, function (b) {
            b.onclick = function () {
                _shuffleSpeed = b.getAttribute('data-v');
                if (AGP.gameShell.setSetting) AGP.gameShell.setSetting('shuffleSpeed', _shuffleSpeed);
                renderSpeeds();
            };
        });
    }

    function shuffleDuration() {
        var s = Number(liveSettings().shuffleDurationSeconds) || 8;
        return Math.max(SHUFFLE_DURATION_MIN_S, Math.min(SHUFFLE_DURATION_MAX_S, s));
    }
    function setShuffleDuration(secs) {
        secs = Math.max(SHUFFLE_DURATION_MIN_S, Math.min(SHUFFLE_DURATION_MAX_S, secs));
        if (AGP.gameShell.setSetting) AGP.gameShell.setSetting('shuffleDurationSeconds', secs);
        el('cp-dur-val').textContent = secs;
    }

    function setPhase(phase) {
        _phase = phase;
        if (phase !== 'answering') showAnswerTimer(null);
        var btn = el('cp-main-btn');
        if (btn) {
            btn.textContent = MAIN_BTN_LABELS[phase] || MAIN_BTN_LABELS.idle;
            btn.disabled = phase === 'peek' || phase === 'shuffling' || phase === 'reveal';
        }
        renderStatus();
    }

    /* ======================================================================
     *  5) التدرّج: كوب زيادة كل جولتين، وسرعة أعلى كل 3 أكواب مضافة
     * ==================================================================== */
    function startCups() {
        var n = Number(liveSettings().startCups) || 3;
        return Math.max(2, Math.min(MAX_CUPS, n));
    }
    function cupsForRound(round) {
        return Math.min(MAX_CUPS, startCups() + Math.floor((Math.max(1, round) - 1) / ROUNDS_PER_EXTRA_CUP));
    }
    function speedLevelForRound(round) {
        return Math.floor((cupsForRound(round) - startCups()) / CUPS_PER_SPEED_STEP);
    }

    function updateBadges() {
        if (!el('cp-stat-round')) return;
        el('cp-stat-round').textContent = Math.max(1, _roundNumber);
        el('cp-stat-players').textContent = _alive.length;
        el('cp-stat-cups').textContent = _cups.length;
        el('cp-speed-level').textContent = _speedLevel + 1;
        var hint = el('cp-progress-hint');
        if (!hint) return;
        var r = Math.max(1, _roundNumber);
        var nextCupRound = r + 1;
        while (cupsForRound(nextCupRound) === cupsForRound(r) && nextCupRound - r <= ROUNDS_PER_EXTRA_CUP) nextCupRound++;
        if (cupsForRound(nextCupRound) === cupsForRound(r)) {
            hint.textContent = 'وصلت الأكواب للحد الأقصى (' + MAX_CUPS + ')';
        } else {
            hint.textContent = (nextCupRound - r === 1 ? 'كوب جديد من الجولة الجاية' : 'كوب جديد بعد ' + (nextCupRound - r) + ' جولات') +
                ' · السرعة تزيد كل 3 أكواب مضافة';
        }
    }

    function renderStatus(extraHtml) {
        var s = el('cp-status');
        if (!s) return;
        var html;
        if (_phase === 'idle') html = 'اضغط <b>«ابدأ الخلط»</b> — وراقب الكورة زين! 👀';
        else if (_phase === 'peek') html = '👀 الكورة تحت هذا الكوب… ركّز!';
        else if (_phase === 'shuffling') html = '🔀 جاري الخلط…';
        else if (_phase === 'answering') html = 'اكتب <b>رقم الكوب</b> اللي تحته الكورة بالشات — الإجابة الغلط تطلّعك فوراً';
        else if (_phase === 'reveal' || _phase === 'out') html = 'الكورة كانت تحت الكوب رقم <b>' + ballNumber() + '</b>';
        else if (_phase === 'ended') html = 'انتهت المباراة';
        else html = '🏆';
        s.innerHTML = html + (extraHtml || '');
    }

    /* ======================================================================
     *  6) رسم الأكواب واللاعبين
     * ==================================================================== */
    function initialsOf(player) {
        var name = playerLabel(player).trim();
        return name.replace('ال', '').slice(0, 2) || '؟';
    }

    function avatarHtml(player) {
        var initials = escapeHtml(initialsOf(player));
        if (player && player.avatarUrl) {
            return '<img src="' + escapeHtml(player.avatarUrl) + '" alt="" referrerpolicy="no-referrer" ' +
                'onerror="this.parentNode.textContent=\'' + initials.replace(/'/g, '') + '\';">';
        }
        return initials;
    }

    // الكوب: SVG بتدرّج لافندر ← بنفسجي، حافة سفلية ولمعة ناعمة
    var CUP_SVG =
        '<svg class="cp-cup-svg" viewBox="0 0 100 112" aria-hidden="true">' +
            '<defs>' +
                '<linearGradient id="cp-cup-g" x1="0" y1="0" x2="1" y2="0">' +
                    '<stop offset="0" stop-color="#5b21b6"/><stop offset=".28" stop-color="#8b5cf6"/>' +
                    '<stop offset=".5" stop-color="#a78bfa"/><stop offset=".78" stop-color="#7c3aed"/>' +
                    '<stop offset="1" stop-color="#4c1d95"/></linearGradient>' +
                '<linearGradient id="cp-rim-g" x1="0" y1="0" x2="1" y2="0">' +
                    '<stop offset="0" stop-color="#4c1d95"/><stop offset=".5" stop-color="#c4b5fd"/>' +
                    '<stop offset="1" stop-color="#4c1d95"/></linearGradient>' +
            '</defs>' +
            '<path d="M30 6 Q50 0 70 6 L86 94 L14 94 Z" fill="url(#cp-cup-g)" stroke="rgba(221,214,254,.55)" stroke-width="1.5" stroke-linejoin="round"/>' +
            '<path d="M24 40 L76 40" stroke="rgba(221,214,254,.35)" stroke-width="3" stroke-linecap="round"/>' +
            '<path d="M21 58 L79 58" stroke="rgba(221,214,254,.22)" stroke-width="2" stroke-linecap="round"/>' +
            '<path d="M36 12 L28 84" stroke="rgba(255,255,255,.28)" stroke-width="5" stroke-linecap="round"/>' +
            '<rect x="9" y="90" width="82" height="16" rx="7" fill="url(#cp-rim-g)" stroke="rgba(221,214,254,.6)" stroke-width="1.5"/>' +
        '</svg>';

    function cupById(id) {
        for (var i = 0; i < _cups.length; i++) if (_cups[i].id === id) return _cups[i];
        return null;
    }
    // رقم الكوب = مكانه بعد التوقف (1 = أقصى اليمين)
    function ballNumber() {
        var c = cupById(_ballCupId);
        return c ? c.slot + 1 : '—';
    }

    // توزيع الأكواب بصف واحد بالنص؛ العرض حسب العدد وارتفاع الطاولة
    function slotSpacing() { return Math.min(24, 88 / Math.max(_cups.length, 1)); }
    function slotLeft(slot) {
        var n = _cups.length;
        return 50 + ((n - 1) / 2 - slot) * slotSpacing();
    }

    function renderCups() {
        var wrap = el('cp-cups');
        var table = el('cp-table');
        if (!wrap || !table) return;
        var spacing = slotSpacing();
        table.style.setProperty('--sw', swapMs() + 'ms');
        var floor = el('cp-floor');
        floor.style.setProperty('--cw', 'min(' + (spacing * 0.72) + 'cqw, 40cqh)');
        wrap.innerHTML = _cups.map(function (cup) {
            return '<div class="cp-cup' + (cup.id === _ballCupId ? ' cp-has-ball' : '') + '" id="cp-cup-' + cup.id + '" ' +
                'style="left:' + slotLeft(cup.slot) + '%">' +
                '<div class="cp-cup-shadow"></div>' +
                '<div class="cp-cup-arc"><div class="cp-ball"></div>' +
                '<div class="cp-cup-lift"><div class="cp-cup-num" style="font-size:calc(var(--cw) * .4)">' + (cup.slot + 1) + '</div>' +
                CUP_SVG + '</div></div></div>';
        }).join('');
    }

    function refreshCupNumbers() {
        _cups.forEach(function (cup) {
            var node = el('cp-cup-' + cup.id);
            if (!node) return;
            var num = node.querySelector('.cp-cup-num');
            if (num) num.textContent = cup.slot + 1;
        });
    }

    function setTableState(numbered, revealed) {
        var table = el('cp-table');
        if (!table) return;
        table.classList.toggle('cp-numbered', Boolean(numbered));
        table.classList.toggle('cp-revealed', Boolean(revealed));
    }

    function liftCup(id, lifted) {
        var node = el('cp-cup-' + id);
        if (node) node.classList.toggle('cp-lifted', lifted);
    }

    function renderPlayers() {
        var wrap = el('cp-players');
        if (!wrap) return;
        _pEls = {};
        wrap.innerHTML = '';
        wrap.classList.toggle('cp-compact', _alive.length > 12);
        _alive.forEach(function (p) {
            var node = document.createElement('div');
            node.className = 'cp-pl';
            node.title = playerLabel(p);
            node.innerHTML = '<div class="cp-pl-av">' + avatarHtml(p) + '</div>' +
                '<div class="cp-pl-name">' + escapeHtml(playerLabel(p)) + '</div>' +
                '<div class="cp-pl-st"></div>';
            wrap.appendChild(node);
            _pEls[p.id] = node;
            applyPlayerState(p);
        });
    }

    // حالة اللاعب بالشريط: جاوب (بدون كشف الرقم) / غلط وطلع / صح بعد الكشف
    function applyPlayerState(p) {
        var node = _pEls[p.id];
        if (!node) return;
        var st = node.querySelector('.cp-pl-st');
        var loser = loserEntry(p.id);
        node.classList.remove('cp-answered', 'cp-wrong', 'cp-right');
        if (loser) {
            node.classList.add('cp-wrong');
            st.textContent = loser.reason === 'wrong' ? '✕ ' + loser.answer : 'ما جاوب';
        } else if (_answers[p.id] != null) {
            var revealed = _phase === 'reveal' || _phase === 'out';
            node.classList.add(revealed ? 'cp-right' : 'cp-answered');
            st.textContent = revealed ? '✓ ' + _answers[p.id] : '✓ جاوب';
        } else {
            st.textContent = '';
        }
    }

    function loserEntry(id) {
        for (var i = 0; i < _roundLosers.length; i++) if (_roundLosers[i].player.id === id) return _roundLosers[i];
        return null;
    }

    function renderCenter(html, dim) {
        var center = el('cp-center');
        if (!center) return;
        if (_phase === 'ended' && !html) {
            html = '<div class="cp-ended-title">انتهت المباراة</div>' +
                '<div class="cp-ended-sub">اضغط "مباراة جديدة" للبدء من جديد</div>';
        }
        center.innerHTML = html || '';
        center.classList.toggle('cp-show', Boolean(html));
        center.classList.toggle('cp-dim', Boolean(html && dim));
    }

    function clearTable() {
        _cups = [];
        var cw = el('cp-cups'); if (cw) cw.innerHTML = '';
        var pw = el('cp-players'); if (pw) pw.innerHTML = '';
        setTableState(false, false);
        _pEls = {};
    }

    /* ======================================================================
     *  7) الأصوات القصيرة المولَّدة (WebAudio)
     * ==================================================================== */
    function audioCtx() {
        try { return _ac || (_ac = new (window.AudioContext || window.webkitAudioContext)()); } catch (e) { return null; }
    }
    function unlockAudio() {
        var ac = audioCtx();
        if (ac && ac.state === 'suspended' && typeof ac.resume === 'function') ac.resume().catch(function () {});
    }
    function tone(freqFrom, freqTo, dur, type, gain, delay) {
        var ac = audioCtx(); var v = _muted ? 0 : _volume;
        if (!ac || !v) return;
        try {
            var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freqFrom, t);
            o.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * v, t + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
            o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.06);
        } catch (e) {}
    }
    // تبديل كوبين: نقرة ناعمة قصيرة
    function playSwapSound() { tone(340, 220, 0.09, 'triangle', 0.22); }
    // إجابة غلط: نغمتين هابطة
    function playWrongSound() { tone(420, 260, 0.14, 'sine', 0.35); tone(300, 160, 0.18, 'sine', 0.3, 0.13); }
    // فتح نافذة الإقصاء: 4 نغمات هابطة 784/587/440/330Hz
    function playOutSound() {
        [784, 587, 440, 330].forEach(function (f, i) { tone(f, f, 0.28, 'sine', 0.35, i * 0.11); });
    }

    /* ======================================================================
     *  8) الجولة: ظهور الكورة ← الخلط ← الأرقام والإجابة ← الكشف ← الإقصاء
     * ==================================================================== */
    function handleMainButtonClick() {
        if (_phase === 'idle') startPeek();
        else if (_phase === 'answering') finishAnswerWindow();
        else if (_phase === 'out') closeOutModal();
        else if (_phase === 'champion' || _phase === 'ended') restartMatch();
    }

    // تجهيز الجولة: أكواب جديدة بعدد الجولة، والكورة تحت كوب عشوائي
    function runNextRound() {
        if (!_matchActive) return;
        if (_alive.length <= 1) { showChampion(_alive[0] || null); return; }

        var prevCups = _roundNumber ? cupsForRound(_roundNumber) : 0;
        var prevLevel = _speedLevel;
        _roundNumber++;
        _answers = {};
        _roundLosers = [];
        _speedLevel = speedLevelForRound(_roundNumber);

        var count = cupsForRound(_roundNumber);
        _cups = [];
        for (var i = 0; i < count; i++) _cups.push({ id: i + 1, slot: i });
        _ballCupId = 1 + Math.floor(Math.random() * count);

        setPhase('idle');
        renderCenter();
        setTableState(false, false);
        renderCups();
        renderPlayers();
        updateBadges();

        var tags = '';
        if (prevCups && count > prevCups) tags += ' <span class="cp-tag">🥤 +1 كوب</span>';
        if (_roundNumber > 1 && _speedLevel > prevLevel) tags += ' <span class="cp-tag cp-tag-speed">⚡ السرعة زادت</span>';
        if (tags) renderStatus(tags);
    }

    function startPeek() {
        unlockAudio();
        setPhase('peek');
        liftCup(_ballCupId, true);
        _phaseTimer = window.setTimeout(function () {
            liftCup(_ballCupId, false);
            _phaseTimer = window.setTimeout(startShuffle, 650);
        }, BALL_PEEK_MS);
    }

    function startShuffle() {
        _phaseTimer = null;
        if (!_matchActive) return;
        setPhase('shuffling');
        var sw = swapMs();
        el('cp-table').style.setProperty('--sw', sw + 'ms');
        var endAt = Date.now() + shuffleDuration() * 1000;
        var lastPair = '';

        function step() {
            _shuffleTimer = null;
            if (_phase !== 'shuffling') return;
            if (Date.now() >= endAt) { stopShuffle(); return; }
            var n = _cups.length;
            var a, b, key, tries = 0;
            do {
                a = Math.floor(Math.random() * n);
                // غالباً كوبين جنب بعض، وأحياناً بعيدين — يصعّبها بدون ما تصير فوضى
                b = Math.random() < 0.65 ? (a + (Math.random() < 0.5 ? 1 : n - 1)) % n : Math.floor(Math.random() * n);
                key = Math.min(a, b) + '-' + Math.max(a, b);
                tries++;
            } while ((a === b || key === lastPair) && tries < 20);
            if (a === b) b = (a + 1) % n;
            lastPair = key;
            swapSlots(a, b);
            playSwapSound();
            _shuffleTimer = window.setTimeout(step, sw + 50);
        }
        step();
    }

    function swapSlots(slotA, slotB) {
        var cupA = null, cupB = null;
        _cups.forEach(function (c) { if (c.slot === slotA) cupA = c; else if (c.slot === slotB) cupB = c; });
        if (!cupA || !cupB) return;
        cupA.slot = slotB; cupB.slot = slotA;
        [[cupA, 'cp-arc-up', false], [cupB, 'cp-arc-down', true]].forEach(function (it) {
            var node = el('cp-cup-' + it[0].id);
            if (!node) return;
            node.classList.toggle('cp-front', it[2]);
            node.style.left = slotLeft(it[0].slot) + '%';
            var arc = node.querySelector('.cp-cup-arc');
            arc.classList.remove('cp-arc-up', 'cp-arc-down');
            void arc.offsetWidth; // يعيد تشغيل الأنيميشن
            arc.classList.add(it[1]);
        });
    }

    function stopShuffle() {
        if (_shuffleTimer) { clearTimeout(_shuffleTimer); _shuffleTimer = null; }
        _phaseTimer = window.setTimeout(openAnswers, Math.min(400, swapMs()));
    }

    function openAnswers() {
        _phaseTimer = null;
        if (!_matchActive) return;
        Array.prototype.forEach.call(el('cp-cups').children, function (n) {
            n.classList.remove('cp-front');
            var arc = n.querySelector('.cp-cup-arc');
            if (arc) arc.classList.remove('cp-arc-up', 'cp-arc-down');
        });
        refreshCupNumbers();
        setTableState(true, false);
        setPhase('answering');
        playSound('reveal');

        _answerOpen = true;
        wireCommentListener();
        wireTimerListeners();
        showAnswerTimer(answerTime());
        AGP.timerManager.start(TIMER_NAME, answerTime());
    }

    /* -------- الاستماع لشات البث -------- */
    function wireCommentListener() {
        unwireCommentListener();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_answerOpen || !payload || typeof payload.text !== 'string') return;
            var player = findAlivePlayer(payload.id, payload.name);
            if (!player || _answers[player.id] != null) return;
            var m = /^\s*(\d{1,2})\s*$/.exec(toLatinDigits(payload.text));
            if (!m) return;
            var n = parseInt(m[1], 10);
            if (n < 1 || n > _cups.length) return;
            submitAnswer(player, n);
        });
    }

    function unwireCommentListener() {
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = null;
    }

    function findAlivePlayer(id, name) {
        for (var i = 0; i < _alive.length; i++) {
            var p = _alive[i];
            if ((id && p.id === id) || (name && p.name === name)) return p;
        }
        return null;
    }

    // إجابة وحدة لكل لاعب: الغلط يُقصى فوراً (يتلوّن أحمر بالشريط)
    function submitAnswer(player, n) {
        _answers[player.id] = n;
        if (n !== ballNumber()) {
            _roundLosers.push({ player: player, reason: 'wrong', answer: n });
            playWrongSound();
        }
        applyPlayerState(player);
        var allAnswered = _alive.every(function (p) { return _answers[p.id] != null; });
        if (allAnswered) {
            AGP.timerManager.stop(TIMER_NAME);
            _phaseTimer = window.setTimeout(finishAnswerWindow, 500);
        }
    }

    function wireTimerListeners() {
        unwireTimerListeners();
        _timerTickUnsub = AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            if (_phase === 'answering') showAnswerTimer(payload.remainingSeconds);
            if (payload.remainingSeconds <= 5 && payload.remainingSeconds > 0) playSound('warning');
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

    // نهاية الإجابة (الكل جاوب / خلص الوقت / الاستريمر أنهاها): اللي ما
    // جاوب يُقصى، وترتفع كل الأكواب وتبان الكورة بالكوب الصحيح.
    function finishAnswerWindow() {
        if (!_answerOpen) return;
        _answerOpen = false;
        if (_phaseTimer) { clearTimeout(_phaseTimer); _phaseTimer = null; }
        AGP.timerManager.stop(TIMER_NAME);
        unwireCommentListener();
        unwireTimerListeners();

        _alive.forEach(function (p) {
            if (_answers[p.id] == null) _roundLosers.push({ player: p, reason: 'none', answer: null });
        });

        setPhase('reveal');
        setTableState(true, true);
        _cups.forEach(function (c) { liftCup(c.id, true); });
        var winCup = el('cp-cup-' + _ballCupId);
        if (winCup) winCup.classList.add('cp-win');
        _alive.forEach(applyPlayerState);
        playSound('claim');

        _phaseTimer = window.setTimeout(afterReveal, 1900);
    }

    function afterReveal() {
        _phaseTimer = null;
        if (!_matchActive) return;
        if (_roundLosers.length === 0) { runNextRound(); return; }
        // الكل غلط ← تُعاد الجولة بدون إقصاء (حتى تنتهي المباراة بفائز)
        if (_roundLosers.length >= _alive.length) {
            _roundLosers = [];
            renderCenter('<div class="cp-ended-title">الكل أخطأ!</div>' +
                '<div class="cp-ended-sub">ما فيه إقصاء بهذي الجولة — نعيدها من جديد</div>', true);
            _phaseTimer = window.setTimeout(function () { _phaseTimer = null; runNextRound(); }, 2600);
            return;
        }
        setPhase('out');
        showOutModal();
    }

    function showOutModal() {
        if (_phase !== 'out') return;
        var remaining = _alive.length - _roundLosers.length;
        el('cp-out-sub').textContent = 'نهاية الجولة ' + _roundNumber + ' · متبقي ' + Math.max(0, remaining) + ' لاعب';
        el('cp-out-list').innerHTML = _roundLosers.map(function (l, i) {
            return '<div class="cp-out-item" style="transition-delay:' + (0.15 + Math.min(i, 12) * 0.05) + 's">' +
                '<div class="cp-out-av">' + avatarHtml(l.player) + '</div>' +
                '<div class="cp-out-name">' + escapeHtml(playerLabel(l.player)) + '</div>' +
                '<div class="cp-out-tag">' + (l.reason === 'wrong' ? 'اختار الكوب ' + l.answer : 'ما جاوب') + '</div></div>';
        }).join('');
        var modal = el('cp-out-modal');
        modal.classList.remove('cp-in');
        modal.classList.add('cp-show');
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () { modal.classList.add('cp-in'); });
        });
        playSound('eliminate');
        playOutSound();
    }

    // إغلاق نافذة الإقصاء (✕ / متابعة / الخلفية) يجهّز الجولة الجاية
    function closeOutModal() {
        closeModal('cp-out-modal');
        if (_phase !== 'out') return;
        _roundLosers.forEach(function (l) {
            var idx = _alive.findIndex(function (p) { return p.id === l.player.id; });
            if (idx !== -1) _alive.splice(idx, 1);
            _eliminated.push({ player: l.player, round: _roundNumber });
        });
        _roundLosers = [];
        if (_alive.length <= 1) showChampion(_alive[0] || null);
        else runNextRound();
    }

    // لما يتبقى لاعب واحد تظهر بطاقة الفائز مباشرة (النقاط + الفيديو + البطاقة)
    function showChampion(winner) {
        clearPhaseTimers();
        setPhase('champion');
        clearTable();
        updateBadges();
        endMatch(winner);
    }

    // ⏹ إنهاء المباراة من نافذة الإعدادات — بدون فائز ولا نقاط
    function endMatchEarly() {
        _matchActive = false;
        clearPhaseTimers();
        _answerOpen = false;
        unwireCommentListener();
        unwireTimerListeners();
        AGP.timerManager.stop(TIMER_NAME);
        closeModal('cp-out-modal');
        setPhase('ended');
        clearTable();
        renderCenter();
    }

    // ↺ إعادة اللعبة من البداية / لعبة جديدة — بكل اللاعبين المسجَّلين
    function restartMatch() {
        var overlay = el('agp-shell-overlay');
        var box = el('agp-shell-box');
        if (box && box.classList.contains('cp-winner-screen')) {
            stopWinnerVideo();
            if (overlay) overlay.style.display = 'none';
            box.className = '';
        }
        startMatch(liveSettings());
    }

    /* ======================================================================
     *  9) حذف/انضمام لاعب أثناء المباراة
     * ==================================================================== */
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;
        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) {
            _alive.splice(aliveIdx, 1);
            delete _answers[removedPlayer.id];
            _roundLosers = _roundLosers.filter(function (l) { return l.player.id !== removedPlayer.id; });
            if (_pEls[removedPlayer.id]) { _pEls[removedPlayer.id].remove(); delete _pEls[removedPlayer.id]; }
            updateBadges();
            if (_matchActive && _alive.length <= 1) {
                window.setTimeout(function () { if (_matchActive) showChampion(_alive[0] || null); }, 400);
            }
        }
        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);
        renderJoinPanel();
    }

    // لاعب جديد ينضم لشريط اللاعبين فوراً ويقدر يجاوب بالجولة الحالية
    function handlePlayerJoined(newPlayer) {
        if (!_matchActive || !newPlayer || !newPlayer.id) return;
        var already = _alive.some(function (p) { return p.id === newPlayer.id; }) ||
            _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (already) return;
        _alive.push(newPlayer);
        renderPlayers();
        updateBadges();
        renderJoinPanel();
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
        renderJoinPanel();
    }

    /* ======================================================================
     *  10) بدء المباراة (onStartRound من الشل)
     * ==================================================================== */
    function startMatch(settingsValues) {
        resetMatchState();
        _settings = settingsValues;
        _alive = AGP.gameManager.getPlayers().slice();
        _shuffleSpeed = settingsValues.shuffleSpeed || 'normal';
        _startedAt = Date.now();
        _matchActive = true;

        ensureScaffolding();
        runNextRound();
    }

    function handleStartRound(settingsValues) {
        startMatch(settingsValues);
    }

    /* ======================================================================
     *  11) نهاية المباراة + تقرير النقاط + شاشة الفائز (فيديو + بطاقة)
     * ==================================================================== */
    function endMatch(winner) {
        _matchActive = false;
        unwireCommentListener();
        unwireTimerListeners();
        AGP.timerManager.stop(TIMER_NAME);

        var pointsPromise = Promise.resolve(null);
        if (window.AGPAuth && typeof window.AGPAuth.reportMatchPoints === 'function') {
            pointsPromise = window.AGPAuth.reportMatchPoints({
                players: AGP.gameManager.getPlayers(),
                winnerIds: winner ? [winner.id] : [],
                teamGame: false,
                durationMs: _startedAt ? (Date.now() - _startedAt) : 0
            });
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        pointsPromise.then(function (pointsResult) {
            if (_phase === 'champion') renderWinnerScreen(winner, pointsResult);
        });
    }
    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }

    // فيديو الاحتفال (160×160 مثل روليت الإقصاء) يشتغل مع بطاقة الفائز —
    // نفس ملف الكراسي الموسيقية (بدون نسخة ثانية بالمستودع). لو فشل
    // تحميله، يتبدّل الصندوق بأيقونة بدل ما يطلع فاضي.
    function winnerVideoHtml() {
        return '<div class="cp-winner-video-wrap" id="cp-winner-video-wrap">' +
            '<video id="cp-winner-video" src="../musical-chairs/videos/winning-video.mp4" autoplay loop playsinline ' +
            'onerror="document.getElementById(&quot;cp-winner-video-wrap&quot;).innerHTML=' +
            '&quot;&lt;div class=\'cp-winner-video-fallback\'&gt;🎬&lt;/div&gt;&quot;;"></video>' +
            '<button type="button" class="cp-winner-video-unmute" id="cp-winner-video-unmute" hidden>🔇 اضغط للصوت</button>' +
            '</div>';
    }

    // ⚠️ إصلاح باگ حقيقي: لما تضغط "إعادة المباراة" الفيديو ما كان يتوقف
    // (كانت تختفي بصرياً بس عبر display:none، بدون إيقاف التشغيل فعلياً)
    // — فيتراكم صوته فوق الدورة الجديدة. الحل: إيقاف صريح للفيديو قبل أي
    // إجراء نهاية مباراة (سواء "مباراة جديدة" أو "إعادة المباراة").
    function stopWinnerVideo() {
        var video = el('cp-winner-video');
        if (!video) return;
        try { video.pause(); video.currentTime = 0; video.muted = true; } catch (e) {}
    }

    function wireWinnerVideo() {
        var video = el('cp-winner-video');
        var unmuteBtn = el('cp-winner-video-unmute');
        if (!video) return;
        var p = video.play();
        if (p && typeof p.catch === 'function') {
            p.catch(function () {
                // المتصفح منع التشغيل بالصوت — نجرب مكتوماً كبديل، ونعرض
                // زر صغير يفعّل الصوت بضغطة واحدة من الاستريمر.
                video.muted = true;
                video.play().catch(function () {});
                if (unmuteBtn) {
                    unmuteBtn.hidden = false;
                    unmuteBtn.onclick = function () { video.muted = false; unmuteBtn.hidden = true; };
                }
            });
        }
    }

    function renderWinnerScreen(winner, pointsResult) {
        playSound('winner');

        var box = document.getElementById('agp-shell-box');
        var overlay = document.getElementById('agp-shell-overlay');
        if (!box || !overlay) return;

        box.id = 'cp-winner-box';
        // ⚠️ إصلاح: كنت أرجّع box.id لـ"agp-shell-box" بعد الرسم مباشرة (تحت)،
        // فأي تنسيق CSS يستهدف #cp-winner-box ما كان يشتغل أبداً وقت
        // العرض الفعلي. الحل: كلاس ثابت يبقى، بدل الاعتماد على الآيدي
        // المؤقت وحده.
        box.className = 'cp-winner-screen';
        var awarded = winner ? findAwardedFor(pointsResult, winner) : null;

        // نفس شاشة الفوز بروليت الإقصاء: فيديو الفوز فوق، العنوان، بطاقة
        // WINNER بنفسجية — أو بطاقة الفوز المملوكة (js/agp-win-card.js) بدالها
        // لو الفائز يملك وحدة، بنفس أسطر الروليت — وثلاث أزرار.
        var cardHtml = '';
        if (winner) {
            if (AGP.winCard && AGP.winCard.canShow(winner)) {
                cardHtml = '<div class="cp-win-owned">' + AGP.winCard.renderHtml(winner, [
                    awarded ? '+' + awarded.added + ' نقطة' : 'النقاط للحسابات الموثّقة في الموقع',
                    'المركز الأول من ' + AGP.gameManager.getPlayers().length + ' لاعب',
                    GAME_NAME
                ], { pop: false }) + '</div>';
            } else {
                cardHtml =
                    '<div class="cp-win-card-wrap">' +
                        '<svg class="cp-win-crown" width="60" height="40" viewBox="0 0 60 40" aria-hidden="true">' +
                            '<polygon points="6,36 4,15 15,25 30,5 45,25 56,15 54,36" stroke-width="1.5"/>' +
                            '<circle cx="6" cy="13" r="4" stroke-width="1.5"/><circle cx="30" cy="4" r="4.5" stroke-width="1.5"/>' +
                            '<circle cx="54" cy="13" r="4" stroke-width="1.5"/><rect x="6" y="32" width="48" height="6" rx="1.5" stroke-width="1.5"/></svg>' +
                        '<div class="cp-win-card"><div class="cp-win-shine"></div><div class="cp-win-card-in">' +
                            '<span class="cp-win-label">WINNER</span>' +
                            '<span class="cp-win-av">' + avatarHtml(winner) + '</span>' +
                            '<span class="cp-win-name">' + escapeHtml(playerLabel(winner)) + '</span>' +
                            '<div class="cp-win-pts">' + (awarded
                                ? '<b class="cp-win-pts-num">+' + awarded.added + ' نقطة</b><span>تظهر في بروفايلك</span>'
                                : '<b>—</b><span>النقاط للحسابات الموثّقة في الموقع</span>') + '</div>' +
                        '</div></div></div>';
            }
        }

        box.innerHTML =
            '<div class="cp-win-inner">' +
                (winner ? winnerVideoHtml() : '') +
                '<h2>🏆 الفائز في لعبة "' + GAME_NAME + '"</h2>' +
                (winner
                    ? '<div class="cp-win-cards">' + cardHtml + '</div>'
                    : '<p class="cp-win-none">ما فيه فائز واضح لهذي المباراة.</p>') +
                '<div class="cp-winner-actions">' +
                    '<button type="button" class="cp-win-btn cp-win-btn-exit" id="cp-exit-btn">الخروج</button>' +
                    '<button type="button" class="cp-win-btn cp-win-btn-new" id="cp-new-match-btn">مباراة جديدة</button>' +
                    '<button type="button" class="cp-win-btn cp-win-btn-replay" id="cp-replay-same-btn">إعادة بنفس اللاعبين</button>' +
                '</div>' +
            '</div>';

        box.id = 'agp-shell-box';
        overlay.style.display = 'flex';

        if (winner) wireWinnerVideo();
        document.getElementById('cp-exit-btn').onclick = function () {
            stopWinnerVideo();
            homeNavigate();
        };
        document.getElementById('cp-new-match-btn').onclick = function () {
            stopWinnerVideo();
            window.location.reload();
        };
        // ⚠️ جديد: إعادة المباراة بنفس قائمة اللاعبين المسجَّلين أصلاً
        // (بدون رجوع لشاشة الاتصال/اللوبي — نفس فلسفة "إعادة اللعب بنفس
        // اللاعبين" الموجودة بروليت الإقصاء).
        document.getElementById('cp-replay-same-btn').onclick = function () {
            stopWinnerVideo(); // ⚠️ إصلاح: يمنع تراكم صوت الفيديو فوق الدورة الجديدة
            overlay.style.display = 'none';
            box.className = ''; // ⚠️ إصلاح: يمنع بقاء كلاس "cp-winner-screen" عالق لو فُتحت لوحة الإعدادات لاحقاً
            startMatch(liveSettings());
        };
    }

    /* ======================================================================
     *  13) تسجيل اللعبة بالمنصة
     * ==================================================================== */
    function registerGame() {
        // ⚠️ إصلاح باگ حقيقي لقطته بالاختبار: كانت أنماط اللوبي (الشبكة،
        // أزرار الحذف، صف الأزرار...) ما تنحقن بالصفحة إلا بعد "بدء
        // الجولة" (عبر ensureScaffolding)، يعني ما تشتغل إطلاقاً وقت
        // الاستريمر لسه بشاشة اللوبي نفسها! لازم تنحقن من أول لحظة.
        injectStageStyles();

        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'elimination-games',
            onLoad: function () { AGP.log('Cups: onLoad.'); },
            onPlayerJoin: function () { enforceMaxPlayers(); },
            onRoundEnd: function () { AGP.log('Cups: onRoundEnd.'); },
            onDestroy: function () { resetMatchState(); AGP.log('Cups: onDestroy — match state cleared.'); }
        });

        if (!registered) { AGP.log('Cups: registration failed (already registered?).'); return; }

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
            settingsTitle: GAME_NAME,
            gameExplanation: 'تظهر الكورة تحت أحد الأكواب لثواني، وبعدها تتحرك الأكواب وتتبادل أماكنها عشوائياً ' +
                'وتتوقف وتظهر أرقام فوقها. كل لاعب يكتب رقم الكوب اللي يظن الكورة تحته بالشات (إجابة وحدة بس) — ' +
                'الإجابة الغلط تطلّعه فوراً، واللي ما يجاوب قبل نهاية الوقت يطلع كمان. كل جولتين ينضاف كوب، وكل 3 ' +
                'أكواب مضافة تزيد سرعة الخلط شوي. آخر لاعب يبقى هو الفائز!',
            connectButtonLabel: 'الدخول للوبي',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../games.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });

        startShellOverlayWatcher();
    }

    /* ======================================================================
     *  14) شاشة الإعدادات الأولى + اللوبي + طبقة "جاري الاتصال" — بنفس
     *      صفحات روليت الإقصاء (index.html/lobby.html): هيدر ثابت فيه خروج
     *      وشعار، عنوان متدرّج، أقسام مرقّمة، وزر بنفسجي واحد. يعيد ترتيب
     *      عناصر الشل بـMutationObserver على #agp-shell-overlay، بدون أي
     *      تعديل على js/agp-game-shell.js.
     * ==================================================================== */
    function homeNavigate() {
        var homeBtn = el('agp-header-home-btn');
        if (homeBtn) { homeBtn.click(); }
        else { window.location.href = '../../games.html'; }
    }

    var EXIT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>' +
        '<polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
    var CTA_ARROW = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>';

    // هيدر الإعدادات واللوبي (يظهر بـCSS بس لما الشل يعرض وحدة منهم)
    function ensureErHeader() {
        var overlay = el('agp-shell-overlay');
        if (!overlay || el('cp-er-header')) return;
        var header = document.createElement('header');
        header.id = 'cp-er-header';
        header.innerHTML =
            '<button type="button" class="cp-er-exit">' + EXIT_ICON + '<span>خروج</span></button>' +
            '<img src="../../logo.png" alt="ألعاب أيمن"><div></div>';
        header.querySelector('.cp-er-exit').addEventListener('click', homeNavigate);
        overlay.insertBefore(header, overlay.firstChild);
    }

    function setCtaLabel(btn, label) {
        if (btn.getAttribute('data-cp-cta') === label) return;
        btn.innerHTML = escapeHtml(label) + CTA_ARROW;
        btn.setAttribute('data-cp-cta', label);
        btn.classList.add('cp-er-cta');
    }

    function layoutInitialSettingsFields(box) {
        var connectBtn = el('agp-connect-btn');
        if (!connectBtn) return;
        if (connectBtn.closest('.cp-settings-footer')) return;

        function rowFor(dataKeySelector) {
            var ctl = box.querySelector(dataKeySelector);
            return ctl ? ctl.closest('.agp-shell-row') : null;
        }
        function section(num, title, rows, full) {
            var sec = document.createElement('section');
            sec.className = 'cp-er-section' + (full ? ' cp-er-full' : '');
            sec.innerHTML = '<div class="cp-er-sec-head"><span class="cp-er-sec-num">' + num + '</span>' +
                '<span class="cp-er-sec-title">' + title + '</span></div>';
            rows.filter(Boolean).forEach(function (r) { sec.appendChild(r); });
            return sec;
        }

        var usernameInput = el('agp-tiktok-username');
        var usernameField = usernameInput ? usernameInput.closest('.agp-shell-field') : null;
        var keywordInput = el('agp-keyword');
        var keywordField = keywordInput ? keywordInput.closest('.agp-shell-field') : null;
        if (keywordField) {
            var kwLabel = keywordField.querySelector('label');
            if (kwLabel) kwLabel.textContent = 'كلمة الدخول';
            keywordInput.placeholder = 'اكتب كلمة الدخول';
        }

        var scroll = document.createElement('div');
        scroll.className = 'cp-settings-scroll';
        var scrollInner = document.createElement('div');
        scrollInner.className = 'cp-settings-scroll-inner';
        scroll.appendChild(scrollInner);
        if (usernameField) scrollInner.appendChild(usernameField);

        scrollInner.appendChild(section(1, 'الدخول', [
            keywordField, rowFor('[data-key="maxPlayers"]'), rowFor('[data-key="followersOnly"]')
        ]));
        scrollInner.appendChild(section(2, 'الأكواب', [
            rowFor('[data-key="startCups"]'), rowFor('[data-key="shuffleSpeed"]')
        ]));
        scrollInner.appendChild(section(3, 'الوقت', [
            rowFor('[data-key="answerTimerSeconds"]'), rowFor('[data-key="shuffleDurationSeconds"]')
        ], true));
        box.appendChild(scroll);

        var footer = document.createElement('div');
        footer.className = 'cp-settings-footer';
        footer.appendChild(connectBtn);
        box.appendChild(footer);
    }

    // شارة الاتصال: نص الحالة بكبسولة حمراء/خضراء، والرابط كبسولة بنفسجية جنبها
    function enhanceConnBadge(box) {
        var badge = box.querySelector('.agp-shell-conn-badge');
        if (!badge || badge.querySelector('.cp-er-live')) return;
        var live = document.createElement('span');
        live.className = 'cp-er-live';
        Array.prototype.slice.call(badge.childNodes).forEach(function (n) {
            if (!(n.classList && n.classList.contains('agp-shell-conn-link'))) live.appendChild(n);
        });
        badge.insertBefore(live, badge.firstChild);
        var link = badge.querySelector('.agp-shell-conn-link');
        if (link) link.textContent = 'ابدأ البث ونتصل تلقائياً';
    }

    function enhanceSettingsScreen() {
        var box = el('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box') || box.classList.contains('agp-connecting-box') ||
            el('agp-mini-lobby-list')) return;
        var isInitial = !!el('agp-tiktok-username');
        box.classList.toggle('cp-settings-initial-box', isInitial);
        if (!isInitial) return;
        ensureErHeader();
        enhanceConnBadge(box);
        layoutInitialSettingsFields(box);
        var connectBtn = el('agp-connect-btn');
        if (connectBtn) setCtaLabel(connectBtn, 'الدخول للوبي');
    }

    function enhanceLobbyHeading() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var h2 = box.querySelector('h2');
        if (!h2) return;
        if (h2.getAttribute('data-cp-heading') !== '1') {
            h2.innerHTML = '<span class="cp-er-kicker">' + GAME_NAME + '</span><span class="cp-er-grad">لوبي الدخول</span>';
            h2.setAttribute('data-cp-heading', '1');
        }
    }

    // Framed lobby cards, shown whole: the shared renderer draws every
    // framed card 298x100 and crops tall frame artwork to that height.
    // For each framed card this measures the frame image's opaque (alpha)
    // rows once per image, re-expands the card to cover the full artwork
    // plus the avatar/name, then zooms it to fit the 217px-wide slot, at
    // most 75px tall. DOM/style-only — js/agp-player-card.js untouched.
    var FRAMED_SLOT_W = 217;
    var FRAMED_SLOT_MAX_H = 75;
    var _cpFrameBoundsCache = {};

    function getFrameOpaqueRows(src) {
        if (_cpFrameBoundsCache[src]) return _cpFrameBoundsCache[src];
        _cpFrameBoundsCache[src] = new Promise(function (resolve) {
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
        return _cpFrameBoundsCache[src];
    }

    function enhanceLobbyFramedCards() {
        var box = el('agp-shell-box');
        if (!box || !(box.classList.contains('agp-lobby-box') || el('agp-mini-lobby-list'))) return;
        fitFramedCards(box);
    }

    function fitFramedCards(root) {
        var cards = root.querySelectorAll('.agp-shell-player-list .agp-pcard-tpl:not([data-cp-fit]),#cp-join-list .agp-pcard-tpl:not([data-cp-fit])');
        Array.prototype.forEach.call(cards, function (card) {
            var frameEl = card.querySelector('.agp-pcard-tpl-frame-img');
            var m = frameEl && /url\(["']?(.*?)["']?\)/.exec(frameEl.style.backgroundImage);
            if (!m) return;
            card.setAttribute('data-cp-fit', 'pending');
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
                card.setAttribute('data-cp-fit', '1');
            });
        });
    }

    // كرت "اللاعبين" (كلمة الدخول + العدد + القائمة) وزر بدء واحد، مثل
    // lobby.html بروليت الإقصاء. الشل يعيد رسم الصندوق كامل أحياناً،
    // فالتغليف يتكرر بأمان كل مرة.
    function enhanceLobbyLayout() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        ensureErHeader();

        var hintText = box.querySelector('.agp-join-hint-text');
        if (hintText && hintText.textContent !== 'كلمة الدخول · اكتبها في الشات') {
            hintText.textContent = 'كلمة الدخول · اكتبها في الشات';
        }

        var list = el('agp-lobby-list');
        if (list) list.classList.add('cp-er-players');
        var card = box.querySelector('.cp-er-lobby-card');
        if (!card && list) {
            card = document.createElement('section');
            card.className = 'cp-er-lobby-card';
            var hint = box.querySelector('.agp-join-hint');
            (hint || list).parentNode.insertBefore(card, hint || list);
            [hint, el('agp-entrance-stage'), el('agp-entrance-settled-list'), list].forEach(function (n) {
                if (n) card.appendChild(n);
            });
        }

        var startBtn = el('agp-start-round-btn');
        if (!startBtn) return;
        setCtaLabel(startBtn, 'ابدأ المباراة');
        if (!startBtn.parentNode.classList.contains('cp-lobby-actions-row')) {
            var row = document.createElement('div');
            row.className = 'cp-lobby-actions-row';
            startBtn.parentNode.insertBefore(row, startBtn);
            row.appendChild(startBtn);
        }
    }

    function applyShellEnhancements() {
        enhanceSettingsScreen();
        enhanceLobbyHeading();
        enhanceLobbyLayout();
        enhanceLobbyFramedCards();
    }

    /* -------- 14أ) طبقة "جاري الاتصال بالبث" — نفس السلم والثعبان -------- */
    var _cpConnLayer = null;
    var _cpConnKeywordBackup = '';
    var _cpConnKeywordPending = false;
    var _cpConnErrorShown = false;
    var _cpConnErrorTimer = null;

    function ensureConnLayer() {
        if (_cpConnLayer) return _cpConnLayer;
        var layer = document.createElement('div');
        layer.id = 'cp-conn-layer';
        layer.innerHTML =
            '<div class="cp-conn-backdrop"></div>' +
            '<div class="cp-conn-modal">' +
                '<div class="cp-conn-icon"></div>' +
                '<h3 class="cp-conn-title"></h3>' +
                '<p class="cp-conn-sub"></p>' +
            '</div>';
        document.body.appendChild(layer);
        _cpConnLayer = layer;
        return layer;
    }

    function showConnLayer(isError, title, sub) {
        var layer = ensureConnLayer();
        var modal = layer.querySelector('.cp-conn-modal');
        var icon = layer.querySelector('.cp-conn-icon');
        modal.classList.toggle('cp-conn-err', isError);
        icon.className = 'cp-conn-icon ' + (isError ? 'cp-conn-err-icon' : 'cp-conn-spinner');
        icon.textContent = isError ? '✕' : '';
        layer.querySelector('.cp-conn-title').textContent = title;
        layer.querySelector('.cp-conn-sub').textContent = sub || '';
        layer.classList.add('show');
    }

    // تفريغ النسخة الشبحية عند الإخفاء — عشان عناصرها (بنفس ids شاشة
    // الإعدادات مثل #agp-tiktok-username) ما تلخبط getElementById لاحقاً.
    function hideConnLayer() {
        if (!_cpConnLayer) return;
        _cpConnLayer.classList.remove('show');
        var backdrop = _cpConnLayer.querySelector('.cp-conn-backdrop');
        if (backdrop) backdrop.innerHTML = '';
    }

    document.addEventListener('click', function (e) {
        if (!e.target || e.target.id !== 'agp-connect-btn') return;
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('cp-settings-initial-box')) return;
        var kInput = el('agp-keyword');
        var uInput = el('agp-tiktok-username');
        // نفس شروط الملف المشترك (handleConnectClick): بدون يوزر أو كلمة
        // مفتاحية ما يصير اتصال أصلاً — فلا نعرض طبقة "جاري الاتصال".
        if (!kInput || !kInput.value.trim() || !uInput || !uInput.value.trim()) return;
        _cpConnKeywordBackup = kInput.value;
        var ghost = box.cloneNode(true);
        ghost.id = 'agp-shell-box-ghost';
        var layer = ensureConnLayer();
        var backdrop = layer.querySelector('.cp-conn-backdrop');
        backdrop.innerHTML = '';
        backdrop.appendChild(ghost);
        _cpConnErrorShown = false;
        showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
    }, true);

    function syncConnLayer() {
        var box = el('agp-shell-box');
        if (!box) return;

        if (box.classList.contains('agp-conn-error')) {
            if (!_cpConnErrorShown) {
                _cpConnErrorShown = true;
                var subEl = box.querySelector('.agp-shell-status');
                showConnLayer(true, 'تعذّر الاتصال', subEl ? subEl.textContent : 'تحقّق من اليوزرنيم وحاول مرة أخرى.');
                clearTimeout(_cpConnErrorTimer);
                _cpConnErrorTimer = setTimeout(function () {
                    hideConnLayer();
                    if (AGP.gameShell && typeof AGP.gameShell.setSetting === 'function') {
                        var s = AGP.gameShell.getSettings();
                        var firstKey = Object.keys(s)[0];
                        if (firstKey !== undefined) AGP.gameShell.setSetting(firstKey, s[firstKey]);
                    }
                    _cpConnKeywordPending = true;
                }, 2400);
            }
            return;
        }

        if (box.classList.contains('agp-connecting-box')) {
            clearTimeout(_cpConnErrorTimer);
            _cpConnErrorShown = false;
            if (!_cpConnLayer || !_cpConnLayer.classList.contains('show')) {
                showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
            }
            return;
        }

        clearTimeout(_cpConnErrorTimer);
        _cpConnErrorShown = false;
        if (box.classList.contains('agp-lobby-box')) hideConnLayer();
        if (_cpConnKeywordPending && box.classList.contains('cp-settings-initial-box')) {
            var kInput = el('agp-keyword');
            if (kInput) kInput.value = _cpConnKeywordBackup;
            _cpConnKeywordPending = false;
        }
    }

    function startShellOverlayWatcher() {
        applyShellEnhancements();
        syncConnLayer();
        var target = document.getElementById('agp-shell-overlay') || document.body;
        var observer = new MutationObserver(function () {
            applyShellEnhancements();
            syncConnLayer();
        });
        observer.observe(target, { childList: true, subtree: true });
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
