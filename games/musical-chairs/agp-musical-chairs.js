/**
 * AGP MUSICAL CHAIRS — "الكراسي الموسيقية" (لعبة أصلية داخل المنصة، بنمط
 * games/elimination-roulette، ملف Plugin مستقل بمنطق إقصاء خاص باللعبة).
 *
 * الآلية: كل دورة الاستريمر يضغط "تدوير" يدوياً (يتوقف تلقائياً بعد مدة
 * الإعداد، أو يدوياً بضغطة ثانية). وقت الدوران تشتغل موسيقى؛ لحظة التوقف
 * تظهر أرقام عشوائية على الكراسي وتبدأ مهلة اختيار (اللاعبون يكتبون رقم
 * الكرسي بالشات، أول رقم صحيح لكرسي فاضي يثبَّت فوراً). عند انتهاء
 * المهلة، كل لاعب بدون كرسي يُقصى. عدد الكراسي: "تلقائي" (لاعبين−1) أو
 * "مخصّص" (عجز يبدأ برقم محدد وينقص واحد كل دورة حتى يثبت عند 1).
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
        console.error('[AGP Musical Chairs] AGP Core/Game Shell غير محمَّل بعد — تأكد من ترتيب تحميل الملفات بـindex.html.');
        return;
    }

    var GAME_ID = 'musical-chairs';
    var GAME_NAME = 'الكراسي الموسيقية';
    var TIMER_NAME = 'mc-selection-timer';

    var SELECTION_TIMER_OPTIONS = [
        { label: '10 ثوانٍ', value: 10 },
        { label: '15 ثانية', value: 15 },
        { label: '20 ثانية', value: 20 },
        { label: '30 ثانية', value: 30 }
    ];

    // ⚠️ مدة تدوير الموسيقى (قابلة للتحكم من الاستريمر) — أقصى شي 35
    // ثانية بالضبط (طلب صريح)
    var SPIN_DURATION_OPTIONS = [
        { label: '10 ثوانٍ', value: 10 },
        { label: '15 ثانية', value: 15 },
        { label: '20 ثانية', value: 20 },
        { label: '25 ثانية', value: 25 },
        { label: '30 ثانية', value: 30 },
        { label: '35 ثانية', value: 35 }
    ];

    // ⚠️ جاهزة تستقبل 10 لكل تصنيف (5 حالية + 5 إضافية قادمة) — بس خليتها
    // 5 فعلياً حالياً حتى ما تصير محاولات تشغيل ملفات غير مرفوعة بعد (صمت
    // صوتي نصف الوقت). أول ما ترفع 6.mp3...10.mp3 بنفس مسار shailat/
    // وkhaleeji/، غيّر الرقم تحت لـ10 وخلاص — بدون أي تعديل ثاني بالكود.
    var MUSIC_TRACK_COUNT = 5;
    var IRAQI_TRACK_COUNT = 10; // ⚠️ 10 مقاطع مرفوعة فعلياً بمجلد sounds/iraqi/ (5 + 5 إضافية) — شغّالة الآن
    // مدة تشغيل الأغنية: نفس خيارات السابق (10–35 ثانية بخطوة 5)
    var SPIN_DURATION_MIN_S = 10;
    var SPIN_DURATION_MAX_S = 35; // ⚠️ الحد الأقصى لمدة تدوير الموسيقى (طلب صريح)

    /* ======================================================================
     *  0) الصوت — مستوى صوت واحد موحَّد لكل شي (مؤثرات قصيرة + موسيقى
     *     طويلة) يُتحكَّم فيه حياً من تبويب الأصوات باللعبة فقط — لا يوجد
     *     أي حقل صوت منفصل بشاشة الإعدادات (حُذف بالكامل بطلب صريح).
     * ==================================================================== */
    var SOUND_BASE = 'sounds/';
    var _sounds = {
        reveal: new Audio(SOUND_BASE + 'reveal.wav'),
        claim: new Audio(SOUND_BASE + 'claim.wav'),
        eliminate: new Audio(SOUND_BASE + 'eliminate.wav'),
        warning: new Audio(SOUND_BASE + 'warning.wav'),
        winner: new Audio(SOUND_BASE + 'winner.wav')
    };

    function playSound(name) {
        var a = _sounds[name];
        if (!a) return;
        try {
            a.volume = _musicMuted ? 0 : _musicVolume; // ⚠️ نفس مستوى/كتم الموسيقى الحي — مصدر واحد موحَّد
            a.currentTime = 0;
            var p = a.play();
            if (p && typeof p.catch === 'function') { p.catch(function () {}); }
        } catch (e) { /* تجاهل صامت — الصوت طبقة تحسين، لا يوقف اللعبة */ }
    }

    // طبقة الموسيقى الطويلة — ثلاث تصنيفات (شيلات/خليجية جاهزتين، عراقية
    // مجهَّزة الآن بالكود بانتظار الملفات الفعلية منك — راجع الملاحظة
    // بآخر الرسالة).
    var _musicTracks = { shailat: [], khaleeji: [], iraqi: [] };
    for (var mi = 1; mi <= MUSIC_TRACK_COUNT; mi++) {
        _musicTracks.shailat.push(SOUND_BASE + 'shailat/' + mi + '.mp3');
        _musicTracks.khaleeji.push(SOUND_BASE + 'khaleeji/' + mi + '.mp3');
    }
    for (var mj = 1; mj <= IRAQI_TRACK_COUNT; mj++) {
        _musicTracks.iraqi.push(SOUND_BASE + 'iraqi/' + mj + '.mp3');
    }

    var _musicMode = 'random';   // 'random' | 'shailat' | 'khaleeji' | 'iraqi' — يتحكم فيه الاستريمر حياً
    var _musicMuted = false;
    var _musicVolume = 0.4;      // 0..1 — المصدر الوحيد للصوت بكل اللعبة (مؤثرات + موسيقى)
    var _currentMusicAudio = null;
    var _playedMusic = {};       // كل مقطع اشتغل بهذي الجلسة (url → true)
    var _musicHistory = [];      // ترتيب المقاطع اللي اشتغلت (الأحدث بالآخر)

    // ⚠️ عشوائي بدون تكرار أبداً بنفس الجلسة: كل دورة تختار مقطع ما
    // اشتغل قبل (من القسم المختار — "عشوائي" = كل الأقسام سوا). لما
    // تخلص كل مقاطع القسم، تتصفّر قائمة المشغَّل لهذا القسم ويرجع يختار
    // عشوائياً من البداية — مع استبعاد آخر نص مقاطع القسم اللي اشتغلت
    // (حتى ما يرجع مقطع سمعناه قبل دورتين أو ثلاث بس).
    function pickMusicUrl() {
        var pool;
        if (_musicMode === 'shailat') pool = _musicTracks.shailat;
        else if (_musicMode === 'khaleeji') pool = _musicTracks.khaleeji;
        else if (_musicMode === 'iraqi') pool = _musicTracks.iraqi;
        // ⚠️ العراقية صارت جزء من الخلط "عشوائي" العام كمان (نفس مستوى
        // شيلات/خليجية) — بطلب صريح. بما إن IRAQI_TRACK_COUNT لسه 0
        // (ما رفعت الملفات بعد)، هالسطر ما يأثر على شي حالياً — أول ما
        // ترفع الملفات وترفع العدد لـ10، تدخل تلقائياً بكل الأوضاع
        // (خاصتها + الخلط العام) بدون أي تعديل ثاني.
        else pool = _musicTracks.shailat.concat(_musicTracks.khaleeji).concat(_musicTracks.iraqi);

        if (!pool || !pool.length) return null;
        var candidates = pool.filter(function (u) { return !_playedMusic[u]; });
        if (!candidates.length) {
            pool.forEach(function (u) { delete _playedMusic[u]; });
            candidates = pool.slice();
        }
        var inPool = {};
        pool.forEach(function (u) { inPool[u] = true; });
        var recent = _musicHistory.filter(function (u) { return inPool[u]; })
            .slice(-Math.floor(pool.length / 2));
        var fresh = candidates.filter(function (u) { return recent.indexOf(u) === -1; });
        if (fresh.length) candidates = fresh;
        var url = candidates[Math.floor(Math.random() * candidates.length)];
        _playedMusic[url] = true;
        _musicHistory.push(url);
        return url;
    }

    function startMusic() {
        stopMusic();
        var url = pickMusicUrl();
        if (!url) return; // ⚠️ قسم بدون ملفات مرفوعة بعد (مثل "عراقية" حالياً) — صمت آمن، بدون خطأ
        var audio = new Audio(url);
        audio.loop = true; // لو انتهى المقطع قبل توقف الدوران، يعيد تلقائياً
        audio.volume = _musicMuted ? 0 : _musicVolume;
        _currentMusicAudio = audio;
        try {
            var p = audio.play();
            if (p && typeof p.catch === 'function') { p.catch(function () {}); }
        } catch (e) { /* تجاهل صامت */ }
    }

    function stopMusic() {
        if (_currentMusicAudio) {
            try { _currentMusicAudio.pause(); _currentMusicAudio.currentTime = 0; } catch (e) {}
            _currentMusicAudio = null;
        }
    }

    function applyMusicVolumeLive() {
        if (_currentMusicAudio) _currentMusicAudio.volume = _musicMuted ? 0 : _musicVolume;
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
    var _customDeficitCurrent = 1;
    var _roundDeficit = 1; // ⚠️ جديد: العجز المستخدَم فعلياً بالدورة الحالية (يلزم addChairsIfNeeded)

    var _chairs = [];
    var _chairSize = 16;         // c — حجم الكرسي (% من عرض الدائرة)
    var _seatedThisRound = {};
    var _roundLosers = [];

    // 'idle' | 'playing' | 'claiming' | 'out' | 'champion' | 'ended'
    var _phase = 'idle';
    var _angle = 0;
    var _raf = null;
    var _spinSpeedIdx = 1;       // سرعة دوران اللاعبين: 0 بطيء، 1 عادي، 2 سريع
    var _spinTimeoutId = null;
    var _outTimeoutId = null;
    var _selectionOpen = false;
    var _pEls = {};
    var _ac = null;

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
        _customDeficitCurrent = 1;
        _seatedThisRound = {};
        _roundLosers = [];
        _angle = 0;
        stopRingLoop();
        stopMusic();
        if (_spinTimeoutId) { clearTimeout(_spinTimeoutId); _spinTimeoutId = null; }
        if (_outTimeoutId) { clearTimeout(_outTimeoutId); _outTimeoutId = null; }
        AGP.timerManager.stop(TIMER_NAME);
        _selectionOpen = false;
        unwireCommentListener();
        unwireTimerListeners();
        closeModal('mc-out-modal');
        clearCircle();
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
            { key: 'maxPlayers', type: 'counter', label: 'الحد الأقصى للاعبين', min: 3, default: 24 },
            {
                key: 'followersOnly', type: 'pill-choice', label: 'المسموح لهم',
                options: [{ label: 'الجميع', value: false }, { label: 'المتابعين فقط', value: true }],
                default: false
            },
            {
                key: 'chairDeficitMode', type: 'pill-choice', label: 'نقصان الكراسي',
                description: 'تلقائي: كرسي واحد أقل كل دورة · مخصّص: تحدد العدد بنفسك',
                options: [
                    { label: 'تلقائي', value: 'auto' },
                    { label: 'مخصّص', value: 'custom' }
                ],
                default: 'auto'
            },
            {
                key: 'customDeficitStart', type: 'counter', label: 'الكراسي الناقصة أول دورة',
                min: 1, default: 5, showWhen: { key: 'chairDeficitMode', equals: 'custom' }
            },
            {
                key: 'selectionTimerSeconds', type: 'pill-group', label: 'مهلة اختيار الكرسي',
                options: SELECTION_TIMER_OPTIONS, default: 15
            },
            {
                key: 'spinDurationSeconds', type: 'pill-group', label: 'مدة تدوير الموسيقى',
                options: SPIN_DURATION_OPTIONS, default: 15
            }
        ];
    }

    /* ======================================================================
     *  3) الأنماط — ثيم روليت الإقصاء بالكامل (ألوان، خط IBM Plex Sans
     *     Arabic، كروت زجاجية، أزرار كبسولة). كل الألوان بمتغيرات --mc-*
     *     بأول الستايل، فتعديلها لاحقاً من مكان واحد.
     * ==================================================================== */
    // خط روليت الإقصاء (IBM Plex Sans Arabic) لكل شاشات اللعبة
    function ensureDesignFonts() {
        if (el('mc-design-fonts-link')) return;
        var sheet = document.createElement('link');
        sheet.id = 'mc-design-fonts-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';
        document.head.appendChild(sheet);
    }

    function injectStageStyles() {
        if (el('mc-stage-styles')) return;
        ensureDesignFonts();
        var style = document.createElement('style');
        style.id = 'mc-stage-styles';
        style.textContent = [
            /* ألوان وتنسيق روليت الإقصاء (games/elimination-roulette): خلفية
             * #07060b، كروت زجاجية داكنة، بنفسجي #7c3aed→#a855f7، نص #f4f2f8،
             * رمادي #8a8596، أخضر #34d399 للنجاح وأحمر #f87171 للإقصاء. */
            ':root{--agp-accent:#7c3aed;--agp-accent-2:#c4b5fd;--agp-accent-pink:#a855f7;',
            '--mc-bg:#07060b;--mc-glass:linear-gradient(180deg,rgba(30,26,44,.86),rgba(18,16,26,.86));--mc-line:rgba(255,255,255,.11);',
            '--mc-depth:inset 0 1px 0 rgba(255,255,255,.07),0 24px 60px rgba(0,0,0,.45);',
            '--mc-ctl-bg:rgba(255,255,255,.05);--mc-ctl-line:rgba(255,255,255,.12);',
            '--mc-text:#f7f5fb;--mc-label:#f1eef7;--mc-muted:#9a95a6;--mc-muted-2:#b9b4c6;',
            '--mc-grad:linear-gradient(90deg,#7c3aed,#a855f7);--mc-ok:#34d399;--mc-bad:#f87171;--mc-bad-soft:#fca5a5;',
            '--mc-backdrop:radial-gradient(55% 45% at 85% 0%,rgba(124,58,237,.16),transparent 70%),',
            'radial-gradient(50% 45% at 8% 100%,rgba(91,33,182,.14),transparent 72%),#07060b;}',
            'html,body.agp-shell-active{background:#07060b !important;}',
            '@keyframes mc-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
            '@keyframes mc-pop{0%{opacity:0;transform:scale(.85)}100%{opacity:1;transform:none}}',

            /* ==================================================================
             * شاشة اللعب: هيدر (أزرار/شعار/عنوان) ← قائمة الإجراءات + دائرة
             * اللعب، ونوافذ الإقصاء/الإعدادات/إضافة لاعب.
             * ==================================================================== */
            'body.mc-game-on #agp-persistent-header{display:none !important;}',
            '#mc-stage{position:fixed;inset:0;z-index:10;height:100vh;height:100dvh;overflow:hidden;',
            'display:flex;flex-direction:column;direction:rtl;color:var(--mc-text);',
            'font-family:"IBM Plex Sans Arabic",sans-serif;background:var(--mc-backdrop);}',
            '#mc-stage *{box-sizing:border-box;}',
            '#mc-stage button{font-family:inherit;}',

            /* 1) الهيدر */
            '.mc-header{min-height:clamp(60px,8vh,80px);flex-shrink:0;display:grid;grid-template-columns:1fr auto 1fr;',
            'gap:clamp(8px,1.2vw,24px);align-items:center;padding:clamp(6px,1vh,10px) clamp(12px,1.25vw,24px);',
            'background:rgba(12,10,18,.86);border-bottom:1.5px solid rgba(167,139,250,.18);box-shadow:0 10px 30px rgba(0,0,0,.4);',
            'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}',
            '.mc-header-btns{display:flex;flex-wrap:wrap;align-items:center;gap:clamp(6px,0.5vw,10px);min-width:0;}',
            '.mc-hbtn{flex-shrink:0;display:flex;align-items:center;gap:6px;white-space:nowrap;height:clamp(38px,2.6vw,46px);',
            'padding:0 clamp(12px,1.1vw,18px);border-radius:999px;border:1.5px solid rgba(167,139,250,.4);',
            'background:rgba(139,92,246,.12);color:#ede9fe;cursor:pointer;font-size:clamp(13px,0.9vw,16px);',
            'font-weight:700;box-shadow:inset 0 1px 0 rgba(255,255,255,.08);transition:all .2s;}',
            '.mc-hbtn:hover{background:rgba(139,92,246,.16);border-color:rgba(167,139,250,.55);}',
            '.mc-hbtn:active,.mc-spin-btn:active{transform:scale(.97);}',
            '.mc-spin-btn{flex-shrink:0;display:flex;align-items:center;gap:6px;white-space:nowrap;height:clamp(38px,2.6vw,46px);',
            'padding:0 clamp(16px,1.4vw,24px);border-radius:999px;border:none;cursor:pointer;font-size:clamp(14px,1vw,17px);',
            'font-weight:800;color:#fff;background:var(--mc-grad);',
            'box-shadow:0 6px 20px rgba(139,92,246,.4),inset 0 1px 0 rgba(255,255,255,.2);transition:filter .2s,transform .2s;}',
            '.mc-spin-btn:hover{filter:brightness(1.1);}',
            '.mc-spin-btn:disabled{opacity:0.5;cursor:default;filter:none;}',
            /* وقت الجلوس (مهلة اختيار الكرسي) — يظهر بالهيدر وقت الجلوس بس */
            '.mc-seat-timer{flex-shrink:0;display:flex;align-items:center;gap:6px;white-space:nowrap;height:clamp(38px,2.6vw,46px);',
            'padding:0 clamp(14px,1.3vw,20px);border-radius:999px;font-size:clamp(13px,0.95vw,16px);font-weight:800;',
            'color:#a7f3d0;background:rgba(52,211,153,.14);border:1.5px solid rgba(52,211,153,.55);',
            'box-shadow:0 0 18px rgba(52,211,153,.18);}',
            '.mc-seat-timer[hidden]{display:none;}',
            '.mc-seat-timer b{font-size:1.2em;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;}',
            '.mc-seat-timer.mc-warn{color:var(--mc-bad-soft);background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.5);',
            'box-shadow:0 0 18px rgba(248,113,113,.3);}',
            '.mc-header-logo{justify-self:center;height:clamp(36px,5.6vh,60px);max-width:100%;width:auto;display:block;',
            'filter:drop-shadow(0 0 14px rgba(139,92,246,.45));}',
            '.mc-header-end{justify-self:end;display:flex;align-items:center;gap:clamp(6px,0.5vw,10px);min-width:0;}',
            '.mc-header-title{justify-self:end;white-space:nowrap;display:flex;align-items:center;gap:8px;font-weight:700;',
            'font-size:clamp(14px,1.15vw,18px);font-weight:800;height:clamp(38px,2.6vw,46px);padding:0 clamp(14px,1.3vw,22px);border-radius:999px;',
            'background:rgba(139,92,246,.18);border:1.5px solid rgba(167,139,250,.45);color:#ede9fe;',
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.08);}',

            /* 2) المحتوى */
            '.mc-main{flex:1;display:flex;flex-direction:row;gap:clamp(14px,2vw,28px);padding:clamp(14px,2vw,28px);min-height:0;}',
            '#mc-stage.mc-panel-closed .mc-main{gap:0;}',

            /* 2أ) قائمة الإجراءات */
            '.mc-panel{flex:0 0 auto;width:clamp(280px,24vw,360px);max-height:100%;opacity:1;overflow:hidden;',
            'transition:width .35s ease,max-height .35s ease,opacity .25s ease;display:flex;min-height:0;}',
            '#mc-stage.mc-panel-closed .mc-panel{width:0;opacity:0;}',
            '.mc-panel-inner{width:clamp(280px,24vw,360px);flex-shrink:0;min-height:0;overflow-y:auto;display:flex;',
            'flex-direction:column;gap:clamp(8px,1.4vh,14px);scrollbar-width:none;}',
            '.mc-panel-inner::-webkit-scrollbar{display:none;}',
            '.mc-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 18px;',
            'border-radius:999px;border:1.5px solid var(--mc-line);background:var(--mc-glass);color:var(--mc-text);box-shadow:var(--mc-depth);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
            'cursor:pointer;font-size:16px;font-weight:800;flex-shrink:0;height:clamp(44px,5.4vh,52px);transition:border-color .2s;}',
            '.mc-panel-head:hover{border-color:rgba(167,139,250,.4);}',
            '.mc-panel-head span:last-child{font-size:13px;font-weight:600;color:var(--mc-muted);}',
            '.mc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}',
            '.mc-stat{padding:clamp(8px,1.4vh,16px) 10px;border-radius:22px;background:var(--mc-glass);box-shadow:var(--mc-depth);',
            'border:1.5px solid var(--mc-line);text-align:center;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}',
            '.mc-stat-lbl{font-size:13px;font-weight:700;color:var(--mc-muted);}',
            '.mc-stat-val{font-size:clamp(24px,3.3vh,32px);font-weight:800;line-height:1.25;color:#ddd6fe;font-variant-numeric:tabular-nums;}',
            '.mc-stat-val.mc-gold{background:linear-gradient(180deg,#f4f2f8,#a78bfa);-webkit-background-clip:text;',
            'background-clip:text;color:transparent;}',
            '.mc-game-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:clamp(10px,1.8vh,18px);',
            'padding:clamp(16px,2vh,22px) clamp(18px,1.5vw,22px);border-radius:26px;background:var(--mc-glass);',
            'border:1.5px solid var(--mc-line);box-shadow:var(--mc-depth);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}',
            '.mc-gs-title{grid-column:1/-1;font-size:17px;font-weight:800;color:var(--mc-text);',
            'padding-bottom:12px;border-bottom:1.5px solid rgba(255,255,255,.08);}',
            '.mc-gs-row{display:flex;flex-direction:column;gap:8px;}',
            '.mc-gs-lbl{font-size:15px;font-weight:700;color:var(--mc-label);}',
            '.mc-gs-lbl-row{display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:var(--mc-label);}',
            '.mc-gs-lbl-row span{color:#ddd6fe;font-variant-numeric:tabular-nums;}',
            '.mc-seg{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:4px;padding:4px;border-radius:999px;',
            'background:var(--mc-ctl-bg);border:1.5px solid var(--mc-ctl-line);box-shadow:inset 0 2px 6px rgba(0,0,0,.25);}',
            '.mc-seg-4{grid-template-columns:repeat(4,1fr);}',
            '.mc-seg button{height:38px;border-radius:999px;border:none;cursor:pointer;font-size:14px;font-weight:700;',
            'background:transparent;color:var(--mc-muted-2);transition:all .25s;}',
            '.mc-seg button:hover{color:#fff;}',
            '.mc-seg button.mc-on{background:var(--mc-grad);color:#fff;font-weight:800;',
            'box-shadow:0 6px 20px rgba(139,92,246,.45),inset 0 1px 0 rgba(255,255,255,.25);}',
            '#mc-seat-times button{white-space:nowrap;font-size:13px;padding:0 2px;}',
            '.mc-modal .mc-seg button{height:42px;}',
            '.mc-stepper{display:flex;align-items:center;justify-content:space-between;padding:4px;border-radius:999px;',
            'background:var(--mc-ctl-bg);border:1.5px solid var(--mc-ctl-line);box-shadow:inset 0 2px 6px rgba(0,0,0,.25);}',
            '.mc-stepper button{width:38px;height:38px;border-radius:999px;border:none;background:rgba(255,255,255,.06);',
            'color:#fff;font-size:22px;font-weight:700;cursor:pointer;transition:all .2s;}',
            '.mc-stepper button:hover{background:rgba(139,92,246,.3);}',
            '.mc-stepper div{font-size:16px;font-weight:800;color:#ede9fe;}',
            '.mc-vol{display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:999px;',
            'background:var(--mc-ctl-bg);border:1.5px solid var(--mc-ctl-line);box-shadow:inset 0 2px 6px rgba(0,0,0,.25);}',
            '.mc-vol input{flex:1;accent-color:#a855f7;}',
            '.mc-mute-btn{border:none;background:none;color:#fff;font-size:16px;cursor:pointer;padding:0;line-height:1;}',

            /* 2ب) دائرة اللعب — إطار العجلة نفسه بروليت الإقصاء */
            '.mc-arena{position:relative;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:10px;}',
            '.mc-cq{flex:1;min-height:0;container-type:size;display:flex;align-items:center;justify-content:center;}',
            '.mc-circle{position:relative;width:min(100cqw - 50px,100cqh - 50px);aspect-ratio:1;container-type:inline-size;}',
            /* هالة ناعمة حول الحلبة */
            '.mc-circle::before{content:"";position:absolute;inset:-7%;border-radius:50%;pointer-events:none;',
            'background:radial-gradient(circle,rgba(139,92,246,.22) 40%,rgba(139,92,246,.06) 58%,transparent 70%);}',
            /* الإطار: تدرّج بنفسجي ناعم بدل الحلقة المعدنية، مع لمعة خفيفة فوق */
            '.mc-ring{position:absolute;inset:0;border-radius:50%;padding:max(6px,.9cqw);',
            'background:linear-gradient(160deg,#c4b5fd 0%,#8b5cf6 30%,#5b21b6 65%,#7c3aed 100%);',
            'box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 50px rgba(139,92,246,.3),inset 0 2px 3px rgba(255,255,255,.35);}',
            /* أرضية الدائرة «مسرح بنفسجي»: مخمل بنفسجي غامق بنسيج مايل خفيف،
             * إضاءة ناعمة نازلة من فوق، وأطراف تغمق بلطف، وحولها خط لافندر رفيع */
            '.mc-ring div{position:relative;width:100%;height:100%;border-radius:50%;',
            'background:',
            'radial-gradient(ellipse 60% 45% at 50% 18%,rgba(221,214,254,.22),transparent 70%),',
            'radial-gradient(circle at 50% 50%,rgba(139,92,246,.18),transparent 60%),',
            'radial-gradient(circle,transparent 60%,rgba(5,3,12,.55) 100%),',
            'repeating-linear-gradient(45deg,rgba(255,255,255,.018) 0 2px,transparent 2px 6px),',
            'linear-gradient(170deg,#2a1d4d,#1b1336 55%,#130d27);',
            'box-shadow:inset 0 0 0 2px rgba(20,14,40,.8),inset 0 0 0 3.5px rgba(196,181,253,.45),',
            'inset 0 0 0 5px rgba(20,14,40,.5),inset 0 10px 40px rgba(0,0,0,.4);}',
            /* لمعات صغيرة متفرّقة مثل النجوم + حلقتين لافندر خفيفة بالنص */
            '.mc-ring div::before,.mc-ring div::after{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none;}',
            '.mc-ring div::before{background:',
            'radial-gradient(1.5px 1.5px at 22% 30%,rgba(255,255,255,.7),transparent 60%),',
            'radial-gradient(1.5px 1.5px at 70% 22%,rgba(255,255,255,.6),transparent 60%),',
            'radial-gradient(1px 1px at 40% 70%,rgba(255,255,255,.6),transparent 60%),',
            'radial-gradient(1.5px 1.5px at 80% 60%,rgba(221,214,254,.7),transparent 60%),',
            'radial-gradient(1px 1px at 30% 82%,rgba(255,255,255,.5),transparent 60%),',
            'radial-gradient(1px 1px at 58% 45%,rgba(255,255,255,.45),transparent 60%),',
            'radial-gradient(1.5px 1.5px at 15% 55%,rgba(221,214,254,.55),transparent 60%),',
            'radial-gradient(1px 1px at 86% 38%,rgba(255,255,255,.5),transparent 60%),',
            'radial-gradient(1px 1px at 62% 85%,rgba(255,255,255,.45),transparent 60%);}',
            '.mc-ring div::after{background:',
            'radial-gradient(circle,transparent 0 15.6%,rgba(196,181,253,.22) 15.8% 16.2%,transparent 16.4%),',
            'radial-gradient(circle,transparent 0 31.6%,rgba(196,181,253,.10) 31.8% 32.1%,transparent 32.3%);}',
            '.mc-watermark{position:absolute;left:50%;top:50%;width:62%;height:auto;transform:translate(-50%,-50%);opacity:0.06;pointer-events:none;}',
            '.mc-ch{position:absolute;aspect-ratio:1;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;}',
            /* ظل ناعم تحت الكرسي على الأرضية */
            '.mc-ch::before{content:"";position:absolute;left:18%;right:18%;bottom:2%;height:12%;border-radius:50%;',
            'background:radial-gradient(ellipse,rgba(0,0,0,.55),transparent 70%);filter:blur(2px);}',
            '.mc-ch-glyph{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;line-height:1;',
            'filter:drop-shadow(0 4px 6px rgba(0,0,0,.45));',
            'transition:transform .45s cubic-bezier(.34,1.4,.64,1);}',
            '.mc-chair-img{height:100%;width:auto;max-width:100%;object-fit:contain;display:block;pointer-events:none;user-select:none;',
            'filter:saturate(.62) sepia(.15) brightness(.8) contrast(.92);}',
            '.mc-ch.mc-numbered .mc-ch-glyph{transform:scale(1.04);}',
            /* رقم الكرسي: مربع بحواف مدوّرة شوي، خلفية بنفسجي داكن وحد فاتح،
             * والرقم كبير بخط عريض واضح */
            '.mc-ch-num{position:absolute;left:50%;top:33%;transform:translate(-50%,-50%);padding:0.1em 0.26em;border-radius:0.22em;',
            'display:none;align-items:center;justify-content:center;color:#fff;font-weight:900;line-height:1;',
            'background:linear-gradient(180deg,#4c2f8f,#33206a);',
            'letter-spacing:-0.02em;font-variant-numeric:tabular-nums;border:2px solid rgba(221,214,254,.7);',
            'text-shadow:0 2px 3px rgba(0,0,0,.5);',
            'box-shadow:0 6px 14px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.18);}',
            '.mc-ch.mc-numbered .mc-ch-num{display:flex;animation:mc-pop .45s cubic-bezier(.2,1.25,.35,1);}',
            '.mc-ch.mc-taken .mc-ch-glyph,.mc-ch.mc-taken .mc-ch-num,.mc-ch.mc-taken::before{display:none;}',
            '.mc-p{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;z-index:2;}',
            '.mc-p.mc-moving{transition:left .7s cubic-bezier(.34,1.25,.64,1),top .7s cubic-bezier(.34,1.25,.64,1);}',
            '.mc-p.mc-seated{z-index:3;}',
            /* صورة اللاعب: حد رفيع فاتح وهالة ناعمة بدل الحد السميك */
            '.mc-p-av{aspect-ratio:1;transition:width .5s ease,border-color .4s,box-shadow .4s,filter .4s;border-radius:50%;display:flex;',
            'align-items:center;justify-content:center;background:linear-gradient(160deg,#3b2a6b,#241a40);border:2px solid #c4b5fd;',
            'box-shadow:0 4px 12px rgba(0,0,0,.4),0 0 0 3px rgba(167,139,250,.18),0 0 16px rgba(167,139,250,.3);',
            'font-weight:700;color:#fff;overflow:hidden;}',
            '.mc-p-av img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.mc-p.mc-seated .mc-p-av{border-color:#6ee7b7;box-shadow:0 4px 12px rgba(0,0,0,.4),0 0 0 3px rgba(52,211,153,.2),0 0 18px rgba(52,211,153,.45);}',
            '.mc-p.mc-out .mc-p-av{border-color:#fca5a5;box-shadow:0 4px 12px rgba(0,0,0,.4),0 0 14px rgba(248,113,113,.45);filter:grayscale(.45) brightness(.9);}',
            '.mc-p-name{font-size:clamp(11px,2cqw,14px);font-weight:700;padding:2px 10px;border-radius:999px;color:#f4f2f8;',
            'background:rgba(20,16,32,.78);border:1px solid rgba(196,181,253,.28);box-shadow:0 2px 8px rgba(0,0,0,.3);',
            'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);white-space:nowrap;}',
            '.mc-p.mc-seated .mc-p-name,.mc-circle.mc-no-names .mc-p-name{display:none;}',
            '.mc-center{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;',
            'gap:10px;text-align:center;}',
            '.mc-center.mc-show{display:flex;}',
            '.mc-ended-title{font-size:6.4cqw;font-weight:800;background:linear-gradient(180deg,#f4f2f8,#c4b5fd);',
            '-webkit-background-clip:text;background-clip:text;color:transparent;}',
            '.mc-ended-sub{font-size:2.6cqw;color:var(--mc-muted-2);}',

            /* النوافذ — نفس نوافذ روليت الإقصاء */
            '.mc-modal{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;padding:20px;',
            'background:rgba(0,0,0,.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}',
            '.mc-modal.mc-show{display:flex;}',
            '.mc-card{position:relative;max-height:calc(100dvh - 40px);min-height:0;overflow-y:auto;display:flex;flex-direction:column;',
            'gap:18px;padding:24px 26px;border-radius:30px;background:linear-gradient(180deg,#171326,#0d0b14);scrollbar-width:none;',
            'border:1.5px solid rgba(167,139,250,.45);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 30px 90px rgba(0,0,0,.65),0 0 60px rgba(124,58,237,.25);',
            'animation:mc-pop .4s cubic-bezier(.2,1.25,.35,1);}',
            '.mc-card::-webkit-scrollbar{display:none;}',
            '.mc-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;}',
            '.mc-card-title{font-size:22px;font-weight:800;}',
            '.mc-x{width:42px;height:42px;flex-shrink:0;border-radius:999px;border:1.5px solid rgba(255,255,255,.14);font-weight:700;',
            'background:rgba(255,255,255,.04);color:var(--mc-label);cursor:pointer;font-size:16px;line-height:1;transition:background .2s;}',
            '.mc-x:hover{background:rgba(255,255,255,.09);}',
            '.mc-btn-primary{border:none;cursor:pointer;font-weight:800;color:#fff;border-radius:999px;',
            'background:var(--mc-grad);box-shadow:0 10px 34px rgba(139,92,246,.45),inset 0 1px 0 rgba(255,255,255,.2);',
            'transition:filter .2s,transform .2s;}',
            '.mc-btn-primary:hover{filter:brightness(1.1);}',
            '.mc-btn-primary:active{transform:scale(.97);}',
            // نافذة الإقصاء
            '#mc-out-modal{transition:opacity .35s ease;opacity:0;}',
            '#mc-out-modal.mc-in{opacity:1;}',
            '#mc-out-modal .mc-card{width:min(820px,100%);transform:scale(0.85) translateY(20px);animation:none;',
            'border-color:rgba(248,113,113,.35);box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 60px rgba(248,113,113,.15);',
            'transition:transform .55s cubic-bezier(.34,1.56,.64,1);}',
            '#mc-out-modal.mc-in .mc-card{transform:scale(1);}',
            '#mc-out-modal .mc-x{position:absolute;top:16px;left:16px;}',
            '.mc-out-head{display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:4px;}',
            '.mc-out-head img{height:clamp(44px,8vh,64px);width:auto;max-width:70%;filter:drop-shadow(0 0 14px rgba(139,92,246,.45));}',
            '.mc-out-title{font-size:24px;font-weight:800;color:var(--mc-bad-soft);}',
            '.mc-out-sub{font-size:13px;color:var(--mc-muted);}',
            '.mc-out-list{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;}',
            '.mc-out-item{width:clamp(104px,14vw,132px);display:flex;flex-direction:column;align-items:center;gap:8px;',
            'padding:16px 8px;border-radius:22px;background:rgba(248,113,113,.1);border:1.5px solid rgba(248,113,113,.45);',
            'opacity:0;transform:scale(0.6);transition:opacity .4s ease,transform .5s cubic-bezier(.34,1.56,.64,1);}',
            '#mc-out-modal.mc-in .mc-out-item{opacity:1;transform:scale(1);}',
            '.mc-out-av{width:clamp(68px,9vw,88px);height:clamp(68px,9vw,88px);border-radius:50%;display:flex;align-items:center;',
            'justify-content:center;background:rgba(248,113,113,.12);border:3px solid var(--mc-bad);box-shadow:0 0 18px rgba(248,113,113,.4);',
            'font-weight:700;font-size:clamp(20px,2.6vw,26px);overflow:hidden;filter:grayscale(.35);}',
            '.mc-out-av img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.mc-out-name{font-size:clamp(15px,1.5vw,18px);font-weight:800;text-align:center;overflow-wrap:anywhere;}',
            '.mc-out-tag{font-size:13px;font-weight:700;color:var(--mc-bad-soft);}',
            '.mc-out-next{align-self:center;height:52px;padding:0 40px;font-size:17px;}',
            // نافذة الإعدادات
            '#mc-settings-modal .mc-card{width:min(460px,100%);}',
            '.mc-end-btn{height:52px;border-radius:999px;border:none;cursor:pointer;font-size:16px;font-weight:800;color:#fff;',
            'background:linear-gradient(90deg,#dc2626,#f87171);box-shadow:0 10px 30px rgba(248,113,113,.3);transition:filter .2s;}',
            '.mc-end-btn:hover{filter:brightness(1.1);}',
            '.mc-reset-btn{height:52px;border-radius:999px;border:1.5px solid rgba(248,113,113,.45);background:rgba(248,113,113,.06);',
            'color:var(--mc-bad-soft);cursor:pointer;font-size:16px;font-weight:700;transition:all .2s;}',
            '.mc-reset-btn:hover{background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.5);}',
            // نافذة إضافة لاعب
            '#mc-add-modal{z-index:60;}',
            '#mc-add-modal .mc-card{width:520px;height:700px;max-width:100%;gap:16px;overflow:hidden;}',
            '.mc-add-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:14px;font-size:15px;line-height:1.8;color:var(--mc-label);}',
            '.mc-add-done{flex-shrink:0;height:56px;font-size:18px;}',
            '.mc-join-status{align-self:flex-start;display:flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:999px;',
            'font-size:13px;font-weight:700;background:rgba(52,211,153,.12);border:1.5px solid rgba(52,211,153,.45);color:var(--mc-ok);}',
            '.mc-join-status::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--mc-ok);box-shadow:0 0 8px var(--mc-ok);}',
            '.mc-join-status.mc-closed{background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.3);color:var(--mc-bad-soft);}',
            '.mc-join-status.mc-closed::before{background:var(--mc-bad);box-shadow:0 0 8px var(--mc-bad);}',
            '.mc-join-kw{display:flex;flex-direction:column;align-items:stretch;gap:8px;text-align:center;}',
            '.mc-join-kw span{font-size:14px;font-weight:600;color:var(--mc-muted);text-align:right;}',
            '.mc-join-kw b{padding:12px 24px;border-radius:999px;background:rgba(139,92,246,.16);border:2px dashed #a78bfa;',
            'font-size:clamp(26px,3.2vw,36px);font-weight:800;line-height:1.2;color:#a78bfa;word-break:break-word;}',
            '.mc-join-notes{margin:0;padding:0 18px 0 0;font-size:13px;line-height:1.9;color:var(--mc-muted);}',
            '.mc-join-count{font-size:15px;font-weight:800;color:var(--mc-text);}',
            '.mc-join-count span{color:#a78bfa;}',
            '#mc-join-list{list-style:none;margin:0;padding:4px 0 12px;flex:1;min-height:0;overflow-y:auto;',
            'scrollbar-width:none;-ms-overflow-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));',
            'gap:10px;align-content:start;}',
            '#mc-join-list::-webkit-scrollbar{display:none;}',
            '@media (max-width:520px){#mc-join-list{grid-template-columns:minmax(0,1fr);}}',
            '#mc-join-list .mc-join-empty{grid-column:1 / -1;display:grid;place-items:center;min-height:120px;padding:20px;',
            'border-radius:18px;border:1.5px dashed rgba(255,255,255,.1);text-align:center;font-size:14px;font-weight:500;color:var(--mc-muted);}',

            /* بطاقات اللاعبين (اللوبي + إضافة لاعب) — كبسولة روليت الإقصاء:
             * صورة دائرية بحد بنفسجي، اسم، و✕ للحذف على الطرف. */
            '.mc-er-players{justify-items:stretch !important;}',
            '.mc-er-players > li{position:relative;width:100%;min-width:0;display:flex;align-items:center;padding:0;',
            'animation:mc-rise .4s cubic-bezier(.2,1.3,.4,1) both;}',
            '.mc-er-players .agp-pcard{width:100% !important;max-width:none !important;height:60px !important;',
            'box-sizing:border-box !important;padding:0 7px 0 40px !important;gap:10px !important;border-radius:999px !important;',
            'justify-content:flex-start !important;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03)) !important;',
            'border:1.5px solid rgba(255,255,255,.12) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 6px 16px rgba(0,0,0,.25) !important;}',
            '.mc-er-players .agp-pcard-avatar-basic{width:46px !important;height:46px !important;box-sizing:border-box !important;',
            'background:#2a1f45 !important;border:2.5px solid #a78bfa !important;box-shadow:0 0 12px rgba(167,139,250,.35) !important;}',
            '.mc-er-players .agp-pcard-avatar-basic--fallback{font-size:16px !important;font-weight:800 !important;color:#fff !important;}',
            '.mc-er-players .agp-pcard-name-basic{flex:1 1 auto !important;width:auto !important;min-width:0 !important;',
            'height:auto !important;margin:0 !important;padding:0 !important;justify-content:flex-start !important;',
            'font-size:16px !important;font-family:"IBM Plex Sans Arabic",sans-serif !important;font-weight:700 !important;',
            'color:var(--mc-text) !important;background:none !important;border:none !important;box-shadow:none !important;}',
            '.mc-er-players li:has(> .agp-pcard-tpl){height:75px;overflow:visible;justify-content:center;}',
            '.mc-er-players .agp-pcard-tpl{zoom:0.7282;flex-shrink:0 !important;}',
            '.mc-er-players .agp-player-remove-btn{position:absolute !important;top:50% !important;left:10px !important;right:auto !important;',
            'transform:translateY(-50%);width:24px !important;height:24px !important;padding:0 !important;margin:0 !important;',
            'z-index:5;border:none !important;border-radius:50% !important;background:transparent !important;',
            'color:var(--mc-bad-soft) !important;font-size:13px !important;font-weight:700;line-height:1;cursor:pointer;',
            'opacity:.75;transition:opacity .2s,transform .2s;}',
            '.mc-er-players .agp-player-remove-btn:hover{opacity:1;transform:translateY(-50%) scale(1.15);}',
            // زر الحذف بالشل فيه 🗑️ — نعرض ✕ بداله مثل روليت الإقصاء
            '.mc-er-players .agp-player-remove-btn{font-size:0 !important;}',
            '.mc-er-players .agp-player-remove-btn > *{display:none !important;}',
            '.mc-er-players .agp-player-remove-btn::before{content:"✕";font-size:15px;font-weight:800;}',

            /* الوضع العمودي / الشاشات الأضيق من 900px */
            '@media (max-width:899px),(max-aspect-ratio:9/10){',
            '.mc-header{grid-template-columns:1fr auto;}',
            '.mc-header-btns{grid-area:2 / 1 / 3 / 3;}',
            '.mc-main{flex-direction:column;}',
            '.mc-panel,.mc-panel-inner{width:100%;}',
            '#mc-stage.mc-panel-closed .mc-panel{width:100%;max-height:0;}}',

            /* شاشة الفائز — نفس شاشة الفوز بروليت الإقصاء */
            '#agp-shell-overlay:has(.mc-winner-screen){padding:0 !important;background:rgba(8,4,16,.38) !important;',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);overflow:hidden !important;}',
            '#agp-shell-box.mc-winner-screen{position:static !important;width:100% !important;max-width:none !important;',
            'height:100% !important;max-height:none !important;margin:0 !important;padding:16px !important;box-sizing:border-box;',
            'overflow-y:auto !important;display:flex;flex-direction:column;align-items:center;',
            'background:none !important;border:none !important;border-radius:0 !important;box-shadow:none !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;font-size:18px;color:#f4f2f8;animation:mc-fade .3s ease;}',
            '@keyframes mc-fade{from{opacity:0}to{opacity:1}}',
            '@keyframes mc-crown{0%{opacity:0;transform:translateX(-50%) translateY(-14px) rotate(-6deg)}60%{opacity:1}',
            '100%{opacity:1;transform:translateX(-50%) translateY(0) rotate(0)}}',
            '@keyframes mc-shine{0%{transform:translateX(-140%) rotate(20deg)}100%{transform:translateX(240%) rotate(20deg)}}',
            '.mc-win-owned{width:240px;max-width:100%;line-height:0;animation:mc-pop .55s cubic-bezier(.2,1.3,.4,1) both;}',
            '.mc-win-inner{position:relative;margin:auto 0;max-width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;}',
            '.mc-winner-screen h2{margin:0 0 6px !important;padding:0 !important;font-size:1.6em !important;font-weight:800 !important;',
            'color:#fff !important;background:none !important;border:none !important;',
            'text-shadow:0 2px 12px rgba(0,0,0,.65) !important;text-wrap:balance;}',
            '.mc-winner-video-wrap{position:relative;overflow:hidden;width:160px;height:160px;margin-bottom:18px;border-radius:24px;',
            'box-sizing:border-box;border:1px dashed rgba(167,139,250,.4);background:rgba(255,255,255,.03);',
            'animation:mc-pop .45s cubic-bezier(.2,1,.3,1) both;}',
            '.mc-winner-video-wrap video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;}',
            '.mc-winner-video-unmute{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);z-index:2;white-space:nowrap;',
            'background:rgba(0,0,0,0.55);color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:4px 10px;',
            'font-size:12px;cursor:pointer;font-family:inherit;}',
            '.mc-winner-video-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:3em;}',
            '.mc-win-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:40px 0 34px;}',
            '.mc-win-none{margin:30px 0;color:#a8a3b5;font-size:16px;}',
            '.mc-win-card-wrap{position:relative;width:200px;display:flex;flex-direction:column;align-items:center;}',
            '.mc-win-crown{position:absolute;top:4px;left:50%;z-index:3;display:block;fill:#a78bfa;stroke:#6d28d9;stroke-linejoin:round;',
            'filter:drop-shadow(0 3px 4px rgba(0,0,0,.35));animation:mc-crown .6s cubic-bezier(.2,1.4,.4,1) .15s both;}',
            '.mc-win-card{position:relative;width:200px;height:300px;margin-top:36px;box-sizing:border-box;border-radius:22px;overflow:hidden;',
            'background:linear-gradient(165deg,rgba(30,20,52,.74) 0%,rgba(13,10,24,.84) 100%);border:1.5px solid #a78bfa8c;',
            'box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.04),0 0 40px #a78bfa26;',
            'animation:mc-pop .45s cubic-bezier(.2,1,.3,1) both;}',
            '.mc-win-shine{position:absolute;top:0;left:0;width:60%;height:100%;pointer-events:none;',
            'background:linear-gradient(75deg,transparent 40%,rgba(255,255,255,.12) 50%,transparent 60%);',
            'animation:mc-shine 2.6s ease-in-out .6s infinite;}',
            '.mc-win-card-in{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;height:100%;',
            'padding:18px 14px 16px;box-sizing:border-box;}',
            '.mc-win-label{font-size:15px;letter-spacing:3px;font-weight:800;color:#a78bfa;margin-bottom:12px;}',
            '.mc-win-av{flex-shrink:0;width:84px;height:84px;border-radius:50%;box-sizing:border-box;border:2.5px solid #a78bfa;',
            'box-shadow:0 4px 10px rgba(0,0,0,.4);background:#5b21b6;display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1.4em;overflow:hidden;}',
            '.mc-win-av img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.mc-win-name{margin-top:12px;font-size:17px;font-weight:800;color:#FBF6EC;line-height:1.2;max-width:100%;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '.mc-win-pts{margin-top:auto;width:100%;padding-top:10px;border-top:1px solid #a78bfa40;text-align:center;}',
            '.mc-win-pts b{display:block;font-size:1.4em;font-weight:800;letter-spacing:1px;color:#a78bfa;line-height:1.1;',
            'text-shadow:0 2px 6px rgba(0,0,0,.4);}',
            '.mc-win-pts b.mc-win-pts-num{font-size:2em;}',
            '.mc-win-pts span{display:block;margin-top:4px;font-size:.5em;font-weight:500;color:rgba(167,139,250,.8);text-wrap:balance;}',
            '.mc-winner-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;width:min(600px,100%);margin:0 auto;}',
            '.mc-win-btn{flex:1 0 auto;min-width:150px;height:46px;padding:0 20px;border-radius:999px;font-family:inherit;font-weight:700;white-space:nowrap;',
            'font-size:15px;cursor:pointer;transition:filter .2s,transform .15s;}',
            '.mc-win-btn:active{transform:scale(.97);}',
            '.mc-win-btn-exit{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#f4f2f8;}',
            '.mc-win-btn-exit:hover{filter:brightness(1.25);}',
            '.mc-win-btn-new{border:none;background:linear-gradient(90deg,#7c3aed,#a855f7);color:#fff;box-shadow:0 8px 22px rgba(124,58,237,.4);}',
            '.mc-win-btn-new:hover{filter:brightness(1.1);}',
            '.mc-win-btn-replay{border:1px solid rgba(167,139,250,.55);background:rgba(139,92,246,.16);color:#ddd6fe;}',
            '.mc-win-btn-replay:hover{filter:brightness(1.2);}',

            /* ==================================================================
             * شاشة الإعدادات الأولى + اللوبي + طبقة "جاري الاتصال" — نفس
             * صفحتي index.html وlobby.html بروليت الإقصاء: هيدر ثابت (خروج +
             * شعار)، عنوان متدرّج، أقسام مرقّمة بكروت زجاجية، وزر بنفسجي.
             * ==================================================================== */
            '.agp-field-desc{font-size:13px !important;font-weight:500 !important;line-height:1.55 !important;',
            'color:var(--mc-muted) !important;font-family:"IBM Plex Sans Arabic",sans-serif !important;',
            'white-space:normal !important;text-align:right;}',
            '#agp-shell-overlay:has(.mc-settings-initial-box),#agp-shell-overlay:has(.agp-lobby-box){padding:0 !important;',
            'align-items:flex-start !important;justify-content:center !important;overflow:hidden !important;',
            'background:var(--mc-backdrop) !important;color:var(--mc-text) !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '#mc-er-header{display:none;}',
            '#agp-shell-overlay:has(.mc-settings-initial-box) #mc-er-header,',
            '#agp-shell-overlay:has(.agp-lobby-box) #mc-er-header{position:fixed;top:0;left:0;right:0;z-index:5;height:80px;',
            'display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:clamp(10px,1.2vw,24px);',
            'padding:0 clamp(12px,1.25vw,24px);box-sizing:border-box;direction:rtl;',
            'background:rgba(12,10,18,.86);border-bottom:1.5px solid rgba(167,139,250,.18);box-shadow:0 10px 30px rgba(0,0,0,.4);',
            'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}',
            '#mc-er-header img{height:60px;width:auto;display:block;filter:drop-shadow(0 0 14px rgba(139,92,246,.45));}',
            '.mc-er-exit{justify-self:start;height:clamp(38px,2.6vw,46px);padding:0 clamp(14px,1.1vw,18px);border-radius:999px;',
            'display:flex;align-items:center;gap:8px;font:700 clamp(13px,0.9vw,16px) "IBM Plex Sans Arabic",sans-serif;',
            'white-space:nowrap;cursor:pointer;transition:all .2s;border:1.5px solid rgba(248,113,113,.4);',
            'background:rgba(248,113,113,.06);color:var(--mc-bad-soft);}',
            '.mc-er-exit:hover{background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.45);}',
            '.mc-er-exit:active{transform:scale(.97);}',
            '.mc-er-cta{width:100% !important;max-width:420px !important;height:clamp(56px,7vh,66px) !important;',
            'margin:0 !important;padding:0 24px !important;border:none !important;border-radius:999px !important;cursor:pointer;',
            'display:flex !important;align-items:center !important;justify-content:center !important;gap:10px;',
            'background:var(--mc-grad) !important;color:#fff !important;',
            'font:800 clamp(18px,1.7vw,22px) "IBM Plex Sans Arabic",sans-serif !important;',
            'box-shadow:0 12px 36px rgba(139,92,246,.5),inset 0 1px 0 rgba(255,255,255,.3),inset 0 -3px 0 rgba(46,16,101,.35) !important;',
            'transition:filter .2s,transform .2s !important;}',
            '.mc-er-cta:hover{filter:brightness(1.1);}',
            '.mc-er-cta:active{transform:scale(.97);}',
            '.mc-er-cta:disabled{opacity:.45 !important;cursor:not-allowed !important;filter:none;transform:none;}',

            /* — الإعدادات — */
            '.mc-settings-initial-box{width:min(1080px,100vw) !important;max-width:min(1080px,100vw) !important;',
            'height:calc(100vh - 80px) !important;height:calc(100dvh - 80px) !important;',
            'max-height:none !important;margin:80px 0 0 !important;overflow:visible !important;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;',
            'column-count:auto !important;column-gap:0 !important;background:none !important;border:none !important;',
            'border-radius:0 !important;box-shadow:none !important;padding:0 clamp(12px,2.5vw,32px) !important;',
            'box-sizing:border-box !important;color:var(--mc-text);}',
            '.mc-settings-initial-box,.mc-settings-initial-box *{font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '.mc-settings-initial-box > h2{flex:0 0 auto !important;margin:clamp(16px,3.2vh,34px) 0 12px !important;',
            'max-width:none !important;width:100% !important;font-size:clamp(32px,4.2vw,56px) !important;',
            'font-weight:800 !important;line-height:1.15 !important;text-align:center !important;',
            'padding:0 !important;border-bottom:none !important;position:static;',
            'background:linear-gradient(180deg,#f4f2f8,#c4b5fd) !important;-webkit-background-clip:text !important;',
            'background-clip:text !important;-webkit-text-fill-color:transparent !important;}',
            '.mc-settings-initial-box > h2::after{content:none !important;}',
            '.mc-settings-initial-box .agp-shell-conn-badge{flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;',
            'justify-content:center;gap:8px;margin:0 0 clamp(14px,2.6vh,26px);padding:0;background:none;border:none;}',
            '.mc-er-live{display:flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:999px;',
            'font-size:13px;font-weight:700;background:rgba(248,113,113,.12);border:1.5px solid rgba(248,113,113,.45);',
            'color:var(--mc-bad-soft);}',
            '.mc-er-live b{color:#fff;font-weight:700;}',
            '.agp-shell-conn-yes .mc-er-live{background:rgba(52,211,153,.08);border-color:rgba(52,211,153,.3);color:var(--mc-ok);}',
            '.mc-settings-initial-box .agp-shell-conn-dot{width:7px;height:7px;background:var(--mc-bad);box-shadow:0 0 8px var(--mc-bad);}',
            '.mc-settings-initial-box .agp-shell-conn-yes .agp-shell-conn-dot{background:var(--mc-ok);box-shadow:0 0 8px var(--mc-ok);}',
            '.mc-settings-initial-box .agp-shell-conn-link{height:34px;padding:0 16px;display:flex;align-items:center;',
            'border-radius:999px;text-decoration:none;background:var(--mc-grad);color:#fff;font-size:13px;font-weight:700;',
            'box-shadow:0 4px 14px rgba(139,92,246,.35);}',
            '.mc-settings-initial-box .agp-shell-conn-link:hover{filter:brightness(1.1);}',
            '.mc-settings-initial-box .mc-settings-scroll{position:relative;flex:1 1 auto;min-height:0;width:100%;}',
            '.mc-settings-initial-box .mc-settings-scroll-inner{box-sizing:border-box;height:100%;overflow-y:auto;',
            'overscroll-behavior:contain;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));',
            'gap:clamp(12px,1.4vw,18px);align-content:start;padding:0 0 16px;scrollbar-width:none;}',
            '.mc-settings-initial-box .mc-settings-scroll-inner::-webkit-scrollbar{display:none;}',
            '.mc-er-section{position:relative;min-width:0;display:flex;flex-direction:column;padding:clamp(18px,1.8vw,24px) clamp(20px,2vw,28px);',
            'border-radius:26px;background:var(--mc-glass);border:1.5px solid var(--mc-line);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:var(--mc-depth);',
            'animation:mc-rise .45s ease both;}',
            '.mc-er-section:nth-child(2){animation-delay:.06s;}',
            '.mc-er-section:nth-child(3){animation-delay:.12s;}',
            '.mc-er-section.mc-er-full{grid-column:1 / -1;}',
            '.mc-er-sec-head{display:flex;align-items:center;gap:12px;padding-bottom:12px;margin-bottom:4px;',
            'border-bottom:1.5px solid rgba(255,255,255,.08);}',
            '.mc-er-sec-num{width:36px;height:36px;border-radius:999px;display:grid;place-items:center;',
            'background:var(--mc-grad);color:#fff;font-size:15px;font-weight:800;',
            'box-shadow:0 4px 14px rgba(139,92,246,.45),inset 0 1px 0 rgba(255,255,255,.3);}',
            '.mc-er-sec-title{font-size:clamp(18px,1.45vw,21px);font-weight:800;color:var(--mc-text);}',
            '.mc-er-section > .agp-shell-row,.mc-er-section > .agp-shell-field{display:flex !important;',
            'flex-direction:row !important;flex-wrap:nowrap !important;justify-content:space-between !important;',
            'align-items:center !important;gap:12px !important;min-height:62px;width:auto !important;max-width:none !important;',
            'margin:0 !important;padding:8px 0 !important;border:none !important;border-radius:0 !important;',
            'background:none !important;box-shadow:none !important;}',
            // لو الخيار ما يكفي جنب عنوانه ينزل تحته ويبقى على اليسار
            '.mc-er-section > .agp-shell-row,.mc-er-section > .agp-shell-field{flex-wrap:wrap !important;}',
            '.mc-er-section > .agp-shell-row > .agp-pill-group,.mc-er-section > .agp-shell-row > .agp-shell-counter-row,',
            '.mc-er-section > .agp-shell-field > input[type=text]{margin-inline-start:auto !important;}',
            '.mc-er-section > .agp-shell-row + .agp-shell-row,.mc-er-section > .agp-shell-field + .agp-shell-row{',
            'border-top:1.5px solid rgba(255,255,255,.07) !important;}',
            '.mc-er-section .agp-shell-row-label,.mc-er-section > .agp-shell-field > label{display:flex !important;',
            'flex-direction:column !important;align-items:flex-start !important;gap:3px !important;min-width:0;flex:1 1 auto;',
            'font-size:clamp(15px,1.2vw,17px) !important;font-weight:700 !important;color:var(--mc-label) !important;',
            'text-align:right !important;margin:0 !important;}',
            '.mc-er-section > .agp-shell-field > input[type=text]{flex:0 0 auto;width:min(210px,50%) !important;',
            'max-width:none !important;height:46px !important;box-sizing:border-box !important;margin:0 !important;',
            'border-radius:999px !important;border:1.5px solid var(--mc-ctl-line) !important;',
            'background:var(--mc-ctl-bg) !important;color:var(--mc-text) !important;box-shadow:inset 0 2px 6px rgba(0,0,0,.25) !important;',
            'font-size:16px !important;font-weight:700 !important;padding:0 16px !important;text-align:center !important;',
            'outline:none !important;transition:border-color .2s !important;}',
            '.mc-er-section > .agp-shell-field > input[type=text]::placeholder{color:#6f6a7c;}',
            '.mc-er-section > .agp-shell-field > input[type=text]:focus{border-color:#a78bfa !important;}',
            '.mc-er-section .agp-pill-group{flex:0 0 auto;display:flex !important;flex-wrap:nowrap !important;gap:4px !important;',
            'padding:4px !important;margin:0 !important;border-radius:999px !important;background:var(--mc-ctl-bg) !important;',
            'border:1.5px solid var(--mc-ctl-line) !important;box-shadow:inset 0 2px 6px rgba(0,0,0,.25) !important;}',
            '.mc-er-section .agp-pill-btn{height:40px !important;padding:0 16px !important;border:none !important;',
            'border-radius:999px !important;background:transparent !important;color:var(--mc-muted-2) !important;',
            'font-size:14px !important;font-weight:700 !important;white-space:nowrap;transition:all .25s !important;box-shadow:none !important;}',
            '.mc-er-section .agp-pill-btn:hover{color:#fff !important;}',
            '.mc-er-section .agp-pill-btn.agp-pill-active{background:var(--mc-grad) !important;color:#fff !important;font-weight:800 !important;',
            'box-shadow:0 6px 20px rgba(139,92,246,.45),inset 0 1px 0 rgba(255,255,255,.25) !important;}',
            '.mc-er-section .agp-shell-counter-row{flex:0 0 auto;display:flex !important;align-items:center !important;gap:4px !important;',
            'padding:4px !important;margin:0 !important;border-radius:999px !important;background:var(--mc-ctl-bg) !important;',
            'border:1.5px solid var(--mc-ctl-line) !important;box-shadow:inset 0 2px 6px rgba(0,0,0,.25) !important;}',
            '.mc-er-section .agp-shell-counter-row button{display:block !important;width:40px !important;height:40px !important;',
            'padding:0 !important;border-radius:999px !important;border:none !important;background:rgba(255,255,255,.07) !important;',
            'color:#fff !important;font-size:22px !important;font-weight:700 !important;line-height:1 !important;',
            'cursor:pointer;transition:all .2s !important;}',
            '.mc-er-section .agp-shell-counter-row button:hover{background:rgba(139,92,246,.35) !important;}',
            '.mc-er-section .agp-count-input{width:56px !important;height:40px !important;box-sizing:border-box !important;',
            'padding:0 !important;border:none !important;border-radius:999px !important;background:transparent !important;',
            'text-align:center !important;font-size:19px !important;font-weight:800 !important;color:#fff !important;',
            'font-variant-numeric:tabular-nums;outline:none !important;-moz-appearance:textfield;appearance:textfield;}',
            '.mc-er-section .agp-count-input::-webkit-outer-spin-button,.mc-er-section .agp-count-input::-webkit-inner-spin-button{',
            '-webkit-appearance:none;margin:0;}',
            // الشاشات الضيقة (جوال): لو الخيارات ما تكفي جنب العنوان تنزل
            // تحته وتبقى على اليسار، وتتمرّر أفقياً بدل ما تطلع برا الكرت
            '@media (max-width:640px){',
            '.mc-er-section .agp-pill-group{max-width:100%;overflow-x:auto;scrollbar-width:none;}',
            '.mc-er-section .agp-pill-group::-webkit-scrollbar{display:none;}',
            '.mc-er-section .agp-pill-btn{padding:0 11px !important;}}',
            '.mc-settings-initial-box .mc-settings-footer{flex:0 0 auto !important;width:100% !important;display:flex !important;',
            'justify-content:center !important;padding:clamp(10px,2vh,18px) 0 clamp(16px,3vh,28px) !important;}',

            /* — اللوبي — */
            '#agp-shell-box.agp-lobby-box{width:min(1080px,100vw) !important;max-width:min(1080px,100vw) !important;',
            'height:calc(100vh - 80px) !important;height:calc(100dvh - 80px) !important;max-height:none !important;',
            'margin:80px 0 0 !important;padding:0 clamp(12px,2.5vw,32px) !important;box-sizing:border-box !important;',
            'display:flex !important;flex-direction:column !important;overflow:hidden !important;',
            'background:none !important;border:none !important;border-radius:0 !important;box-shadow:none !important;',
            'color:var(--mc-text);}',
            '#agp-shell-box.agp-lobby-box,#agp-shell-box.agp-lobby-box *{font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '#agp-shell-box.agp-lobby-box > h2{flex:0 0 auto !important;display:flex;flex-direction:column;align-items:center;gap:10px;',
            'margin:0 !important;padding:clamp(6px,1.2vh,12px) 0 clamp(14px,2.6vh,26px) !important;text-align:center;',
            'text-shadow:none !important;letter-spacing:0 !important;font-size:clamp(32px,4.2vw,56px) !important;',
            'font-weight:800 !important;line-height:1.15 !important;color:var(--mc-text) !important;}',
            '.mc-er-kicker{font-size:clamp(15px,1.5vw,19px);font-weight:700;line-height:1.4;color:var(--mc-muted-2);letter-spacing:.5px;}',
            '.mc-er-grad{background:linear-gradient(180deg,#f4f2f8,#c4b5fd);-webkit-background-clip:text;background-clip:text;',
            'color:transparent;-webkit-text-fill-color:transparent;}',
            '.mc-er-lobby-card{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden;',
            'border-radius:28px;background:var(--mc-glass);border:2px solid rgba(167,139,250,.45);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
            'box-shadow:var(--mc-depth),0 0 50px rgba(139,92,246,.16);}',
            '.mc-er-lobby-card::before{content:"";position:absolute;top:-100px;left:50%;width:460px;height:200px;margin-left:-230px;',
            'border-radius:50%;background:rgba(139,92,246,.12);filter:blur(44px);pointer-events:none;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint{position:relative;flex:0 0 auto;display:grid !important;',
            'grid-template-columns:1fr auto;grid-template-areas:"title count" "label label" "kw kw";',
            'align-items:center;gap:14px 12px;width:auto !important;margin:0 !important;',
            'padding:clamp(18px,2.2vw,26px) clamp(20px,2.4vw,30px) !important;border-bottom:1.5px solid rgba(255,255,255,.08);}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint::before{content:"اللاعبين";grid-area:title;justify-self:start;',
            'padding-right:22px;font-size:clamp(20px,1.9vw,24px);font-weight:800;color:#c4b5fd;',
            'background:radial-gradient(circle,#a78bfa 0 5px,transparent 6px) right center / 12px 12px no-repeat;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint-text{grid-area:label;justify-self:start;margin-bottom:-6px;',
            'font-size:14px !important;font-weight:600 !important;color:var(--mc-muted) !important;}',
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
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge::after{content:"لاعب";font-size:14px;font-weight:600;color:var(--mc-muted-2);}',
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
            'border-radius:18px;border:1.5px dashed rgba(255,255,255,.1);color:var(--mc-muted);font-size:14px;font-weight:500;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list > li:not(:has(.agp-pcard,.agp-pcard-tpl)){grid-column:1 / -1;',
            'text-align:center;font-size:14px;color:var(--mc-bad-soft) !important;}',
            '#agp-shell-box.agp-lobby-box .mc-lobby-actions-row{flex:0 0 auto !important;display:flex;justify-content:center;',
            'padding:clamp(10px,2vh,18px) 0 clamp(16px,3vh,28px);margin:0;}',

            /* — طبقة "جاري الاتصال" — نفس نافذة الاتصال بروليت الإقصاء — */
            '#agp-shell-box.agp-connecting-box,#agp-shell-box.agp-conn-error{visibility:hidden !important;}',
            '#mc-conn-layer{position:fixed;inset:0;z-index:100010;display:none;',
            'align-items:center;justify-content:center;font-family:"IBM Plex Sans Arabic",sans-serif;}',
            '#mc-conn-layer.show{display:flex;}',
            '#mc-conn-layer .mc-conn-backdrop{position:absolute;inset:0;overflow:hidden;display:flex;justify-content:center;align-items:flex-start;',
            'background:var(--mc-backdrop);filter:blur(6px) brightness(0.55);pointer-events:none;}',
            '#mc-conn-layer .mc-conn-backdrop > *{pointer-events:none !important;}',
            '#mc-conn-layer .mc-conn-modal{position:relative;z-index:1;width:min(360px,calc(100vw - 24px));box-sizing:border-box;',
            'display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;',
            'background:linear-gradient(180deg,#171326,#0d0b14);border:1.5px solid rgba(167,139,250,.45);border-radius:28px;padding:34px 30px;',
            'box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 60px rgba(124,58,237,.2);animation:mc-pop .4s cubic-bezier(.2,1.25,.35,1);}',
            '#mc-conn-layer .mc-conn-modal.mc-conn-err{border-color:rgba(248,113,113,.5);',
            'box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 60px rgba(248,113,113,.18);}',
            '#mc-conn-layer::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.55);',
            'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}',
            '#mc-conn-layer .mc-conn-spinner{width:64px;height:64px;box-sizing:border-box;',
            'border-radius:50%;border:5px solid rgba(167,139,250,.18);border-top-color:#a78bfa;',
            'animation:mc-conn-spin 0.9s linear infinite;}',
            '@keyframes mc-conn-spin{to{transform:rotate(360deg);}}',
            '#mc-conn-layer .mc-conn-err-icon{width:64px;height:64px;border-radius:50%;background:rgba(248,113,113,.14);',
            'border:2px solid var(--mc-bad);color:var(--mc-bad);font-size:26px;font-weight:900;',
            'display:flex;align-items:center;justify-content:center;}',
            '#mc-conn-layer .mc-conn-title{margin:0;font-size:22px;font-weight:800;color:var(--mc-text);}',
            '#mc-conn-layer .mc-conn-modal.mc-conn-err .mc-conn-title{color:var(--mc-bad-soft);}',
            '#mc-conn-layer .mc-conn-sub{margin:0;font-size:14px;font-weight:500;color:var(--mc-muted-2);}',
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  4) بناء شاشة اللعب — حرفياً من ملف التصميم
     *     design_handoff_musical_chairs (هيدر ← قائمة الإجراءات + الدائرة،
     *     ونوافذ الإقصاء/الإعدادات/إضافة لاعب).
     * ==================================================================== */
    var GENRES = [
        { label: 'عشوائي', mode: 'random' },
        { label: 'خليجي', mode: 'khaleeji' },
        { label: 'عراقي', mode: 'iraqi' },
        { label: 'شيلات', mode: 'shailat' }
    ];
    var SPIN_SPEEDS = [{ label: 'بطيء', factor: 0.55 }, { label: 'عادي', factor: 1 }, { label: 'سريع', factor: 1.8 }];
    var SPIN_BTN_LABELS = {
        idle: '▶ تدوير', playing: '⏸ إيقاف', claiming: '⏳ جاري الجلوس',
        out: '▶ الدورة التالية', champion: '↺ لعبة جديدة', ended: '↺ مباراة جديدة'
    };

    function ensureScaffolding() {
        injectStageStyles();
        document.body.classList.add('mc-game-on');
        if (el('mc-stage')) return;
        var stage = document.createElement('div');
        stage.id = 'mc-stage';
        stage.setAttribute('dir', 'rtl');
        stage.innerHTML =
            '<header class="mc-header">' +
                '<div class="mc-header-btns">' +
                    '<button type="button" class="mc-hbtn" id="mc-add-btn" title="إضافة لاعب جديد">➕ إضافة لاعب</button>' +
                    '<button type="button" class="mc-hbtn" id="mc-settings-btn" title="الإعدادات">⚙️ الإعدادات</button>' +
                    '<button type="button" class="mc-hbtn" id="mc-panel-btn" title="قائمة الإجراءات">☰ الإجراءات</button>' +
                    '<button type="button" class="mc-spin-btn" id="mc-spin-btn">▶ تدوير</button>' +
                '</div>' +
                '<img class="mc-header-logo" src="../../logo.png" alt="ألعاب أيمن">' +
                '<div class="mc-header-end">' +
                    '<div class="mc-seat-timer" id="mc-seat-timer" hidden>⏱ وقت الجلوس <b id="mc-seat-timer-val">15</b> ثانية</div>' +
                    '<div class="mc-header-title">🎵 الكراسي الموسيقية</div>' +
                '</div>' +
            '</header>' +
            '<main class="mc-main">' +
                '<aside class="mc-panel"><div class="mc-panel-inner">' +
                    '<button type="button" class="mc-panel-head" id="mc-panel-head"><span>☰ قائمة الإجراءات</span><span>طي ←</span></button>' +
                    '<section class="mc-stats">' +
                        '<div class="mc-stat"><div class="mc-stat-lbl">الدورة</div><div class="mc-stat-val mc-gold" id="mc-stat-round">1</div></div>' +
                        '<div class="mc-stat"><div class="mc-stat-lbl">👥 اللاعبون</div><div class="mc-stat-val" id="mc-stat-players">0</div></div>' +
                        '<div class="mc-stat"><div class="mc-stat-lbl">🪑 الكراسي</div><div class="mc-stat-val" id="mc-stat-chairs">0</div></div>' +
                    '</section>' +
                    '<section class="mc-game-settings">' +
                        '<div class="mc-gs-title">إعدادات اللعبة</div>' +
                        '<div class="mc-gs-row"><label class="mc-gs-lbl">نوع الأغاني</label>' +
                            '<div class="mc-seg mc-seg-4" id="mc-genres"></div></div>' +
                        '<div class="mc-gs-row"><label class="mc-gs-lbl">مدة تشغيل الأغنية</label>' +
                            '<div class="mc-stepper">' +
                                '<button type="button" id="mc-dur-up">+</button>' +
                                '<div>⏱ <span id="mc-dur-val">15</span> ثانية</div>' +
                                '<button type="button" id="mc-dur-down">−</button>' +
                            '</div></div>' +
                        '<div class="mc-gs-row"><label class="mc-gs-lbl">مهلة اختيار الكرسي</label>' +
                            '<div class="mc-seg mc-seg-4" id="mc-seat-times"></div></div>' +
                        '<div class="mc-gs-row"><div class="mc-gs-lbl-row"><label>مستوى الصوت</label><span id="mc-vol-val">40%</span></div>' +
                            '<div class="mc-vol"><button type="button" class="mc-mute-btn" id="mc-mute-btn" title="كتم/تشغيل الصوت">🔊</button><input type="range" id="mc-volume-slider" min="0" max="100" value="40"></div></div>' +
                    '</section>' +
                '</div></aside>' +
                '<section class="mc-arena"><div class="mc-cq"><div class="mc-circle" id="mc-circle">' +
                    '<div class="mc-ring"><div></div></div>' +
                    '<img class="mc-watermark" src="../../logo.png" alt="">' +
                    '<div id="mc-chairs"></div>' +
                    '<div class="mc-center" id="mc-center"></div>' +
                    '<div id="mc-players"></div>' +
                '</div></div></section>' +
            '</main>' +

            '<div class="mc-modal" id="mc-add-modal"><div class="mc-card">' +
                '<div class="mc-card-head"><div class="mc-card-title">➕ إضافة لاعب جديد</div>' +
                '<button type="button" class="mc-x" id="mc-add-x" title="إغلاق">✕</button></div>' +
                '<div class="mc-add-body">' +
                    '<div class="mc-join-status" id="mc-join-status"></div>' +
                    '<div class="mc-join-kw"><span>للدخول اكتب في شات البث</span><b id="mc-join-keyword"></b></div>' +
                    '<ul class="mc-join-notes">' +
                        '<li>الدخول مفتوح الآن للاعبين الجدد اللي ما سبق لهم الدخول بهذي المباراة.</li>' +
                        '<li>الكلمة المفتاحية هي نفسها اللي حددتها قبل بداية المباراة.</li>' +
                        '<li>كل لاعب جديد يدخل تظهر بطاقته هنا، وينضم للدائرة مباشرة.</li>' +
                    '</ul>' +
                    '<div class="mc-join-count">اللاعبون الجدد (<span id="mc-join-count">0</span>)</div>' +
                    '<ul id="mc-join-list" class="mc-er-players"></ul>' +
                '</div>' +
                '<button type="button" class="mc-btn-primary mc-add-done" id="mc-add-done">أكمل المباراة</button>' +
            '</div></div>' +

            '<div class="mc-modal" id="mc-out-modal"><div class="mc-card">' +
                '<button type="button" class="mc-x" id="mc-out-x" title="إغلاق">✕</button>' +
                '<div class="mc-out-head"><img src="../../logo.png" alt="ألعاب أيمن">' +
                '<div class="mc-out-title">اللاعبون المُقصَون</div><div class="mc-out-sub" id="mc-out-sub"></div></div>' +
                '<div class="mc-out-list" id="mc-out-list"></div>' +
                '<button type="button" class="mc-btn-primary mc-out-next" id="mc-out-next">متابعة</button>' +
            '</div></div>' +

            '<div class="mc-modal" id="mc-settings-modal"><div class="mc-card">' +
                '<div class="mc-card-head"><div class="mc-card-title">⚙️ الإعدادات</div>' +
                '<button type="button" class="mc-x" data-close="mc-settings-modal" title="إغلاق">✕</button></div>' +
                '<div class="mc-gs-row"><div class="mc-gs-lbl">سرعة دوران اللاعبين</div><div class="mc-seg" id="mc-spin-speeds"></div></div>' +
                '<button type="button" class="mc-end-btn" id="mc-end-btn">⏹ إنهاء المباراة</button>' +
                '<button type="button" class="mc-reset-btn" id="mc-reset-btn">↺ إعادة اللعبة من البداية</button>' +
            '</div></div>';
        document.body.appendChild(stage);
        wireStageEvents();
    }

    function openModal(id) { var m = el(id); if (m) m.classList.add('mc-show'); }
    function closeModal(id) { var m = el(id); if (m) m.classList.remove('mc-show', 'mc-in'); }

    function wireStageEvents() {
        el('mc-spin-btn').onclick = handleSpinButtonClick;
        // ⚙️ = تبويب الإعدادات الجديد (بدل لوحة الإعدادات القديمة المشتركة)
        el('mc-settings-btn').onclick = function () { renderSpinSpeeds(); openModal('mc-settings-modal'); };
        // ➕ = تبويب إضافة لاعب جديد (يفتح الدخول بالكلمة المفتاحية)
        el('mc-add-btn').onclick = openJoin;
        el('mc-add-x').onclick = closeJoin;
        el('mc-add-done').onclick = closeJoin;
        el('mc-panel-btn').onclick = togglePanel;
        el('mc-panel-head').onclick = togglePanel;

        Array.prototype.forEach.call(el('mc-stage').querySelectorAll('[data-close]'), function (b) {
            b.onclick = function () { closeModal(b.getAttribute('data-close')); };
        });
        // النقر على الخلفية يقفل النافذة (نافذة الإقصاء تكمل للدورة الجاية)
        el('mc-settings-modal').addEventListener('click', function (e) { if (e.target.id === 'mc-settings-modal') closeModal('mc-settings-modal'); });
        el('mc-add-modal').addEventListener('click', function (e) { if (e.target.id === 'mc-add-modal') closeJoin(); });
        el('mc-out-modal').addEventListener('click', function (e) { if (e.target.id === 'mc-out-modal') closeOutModal(); });
        el('mc-out-x').onclick = closeOutModal;
        el('mc-out-next').onclick = closeOutModal;

        el('mc-end-btn').onclick = function () { closeModal('mc-settings-modal'); endMatchEarly(); };
        el('mc-reset-btn').onclick = function () { closeModal('mc-settings-modal'); restartMatch(); };

        el('mc-dur-up').onclick = function () { setSpinDuration(spinDuration() + 5); };
        el('mc-dur-down').onclick = function () { setSpinDuration(spinDuration() - 5); };

        // 🔊 = زر الكتم القديم
        var muteBtn = el('mc-mute-btn');
        muteBtn.onclick = function () {
            _musicMuted = !_musicMuted;
            muteBtn.textContent = _musicMuted ? '🔇' : '🔊';
            applyMusicVolumeLive();
        };

        var vol = el('mc-volume-slider');
        vol.value = Math.round(_musicVolume * 100);
        vol.oninput = function () {
            _musicVolume = Number(vol.value) / 100;
            if (_musicMuted && _musicVolume > 0) { _musicMuted = false; muteBtn.textContent = '🔊'; }
            el('mc-vol-val').textContent = vol.value + '%';
            applyMusicVolumeLive();
        };
        el('mc-vol-val').textContent = vol.value + '%';

        renderGenres();
        renderSeatTimes();
        el('mc-dur-val').textContent = spinDuration();
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
        openModal('mc-add-modal');
    }

    function closeJoin() {
        _joinKnownIds = null;
        if (AGP.keywordManager) AGP.keywordManager.deactivate();
        closeModal('mc-add-modal');
    }

    function renderJoinPanel() {
        if (!_joinKnownIds || !el('mc-join-list')) return;
        var open = AGP.keywordManager && AGP.keywordManager.isActive();
        var status = el('mc-join-status');
        status.classList.toggle('mc-closed', !open);
        status.textContent = open ? 'الدخول مفتوح الآن' :
            'الدخول مقفل — وصلنا الحد الأقصى للاعبين (' + liveSettings().maxPlayers + ')';
        el('mc-join-keyword').textContent = (AGP.keywordManager && AGP.keywordManager.getKeyword()) || '';

        var newPlayers = AGP.gameManager.getPlayers().filter(function (p) { return !_joinKnownIds[p.id]; });
        el('mc-join-count').textContent = newPlayers.length;
        var list = el('mc-join-list');
        if (!newPlayers.length) {
            list.innerHTML = '<li class="mc-join-empty">بانتظار دخول لاعبين جدد من الشات…</li>';
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
        el('mc-stage').classList.toggle('mc-panel-closed');
    }

    // مهلة اختيار الكرسي — نفس إعداد selectionTimerSeconds بشاشة الإعدادات
    // الأساسية، وتنطبق من الدورة الجاية.
    function seatTime() { return Number(liveSettings().selectionTimerSeconds) || 15; }
    function renderSeatTimes() {
        var wrap = el('mc-seat-times');
        if (!wrap) return;
        var cur = seatTime();
        wrap.innerHTML = SELECTION_TIMER_OPTIONS.map(function (o) {
            return '<button type="button" data-secs="' + o.value + '"' + (o.value === cur ? ' class="mc-on"' : '') + '>' + o.label + '</button>';
        }).join('');
        Array.prototype.forEach.call(wrap.children, function (b) {
            b.onclick = function () {
                if (AGP.gameShell.setSetting) AGP.gameShell.setSetting('selectionTimerSeconds', Number(b.getAttribute('data-secs')));
                renderSeatTimes();
            };
        });
    }

    function showSeatTimer(secs) {
        var t = el('mc-seat-timer');
        if (!t) return;
        if (secs == null) { t.hidden = true; return; }
        el('mc-seat-timer-val').textContent = secs;
        t.classList.toggle('mc-warn', secs <= 5);
        t.hidden = false;
    }

    function renderGenres() {
        var wrap = el('mc-genres');
        wrap.innerHTML = GENRES.map(function (g) {
            return '<button type="button" data-mode="' + g.mode + '"' + (g.mode === _musicMode ? ' class="mc-on"' : '') + '>' + g.label + '</button>';
        }).join('');
        Array.prototype.forEach.call(wrap.children, function (b) {
            b.onclick = function () { _musicMode = b.getAttribute('data-mode'); renderGenres(); };
        });
    }

    function renderSpinSpeeds() {
        var wrap = el('mc-spin-speeds');
        wrap.innerHTML = SPIN_SPEEDS.map(function (s, i) {
            return '<button type="button" data-i="' + i + '"' + (i === _spinSpeedIdx ? ' class="mc-on"' : '') + '>' + s.label + '</button>';
        }).join('');
        Array.prototype.forEach.call(wrap.children, function (b) {
            b.onclick = function () { _spinSpeedIdx = Number(b.getAttribute('data-i')); renderSpinSpeeds(); };
        });
    }

    // مدة تشغيل الأغنية — نفس إعداد spinDurationSeconds بشاشة الإعدادات
    // الأولى، يُعدَّل هنا بخطوة 5 ثوانٍ بين 5 و60 (حسب ملف التصميم).
    function spinDuration() {
        var s = Number(liveSettings().spinDurationSeconds) || 15;
        return Math.max(SPIN_DURATION_MIN_S, Math.min(SPIN_DURATION_MAX_S, s));
    }
    function setSpinDuration(secs) {
        secs = Math.max(SPIN_DURATION_MIN_S, Math.min(SPIN_DURATION_MAX_S, secs));
        if (AGP.gameShell.setSetting) AGP.gameShell.setSetting('spinDurationSeconds', secs);
        el('mc-dur-val').textContent = secs;
    }

    function setPhase(phase) {
        _phase = phase;
        if (phase !== 'claiming') showSeatTimer(null);
        var btn = el('mc-spin-btn');
        if (btn) {
            btn.textContent = SPIN_BTN_LABELS[phase] || SPIN_BTN_LABELS.idle;
            btn.disabled = phase === 'claiming';
        }
    }

    function updateBadges() {
        if (!el('mc-stat-round')) return;
        el('mc-stat-round').textContent = Math.max(1, _roundNumber);
        el('mc-stat-players').textContent = _alive.length;
        el('mc-stat-chairs').textContent = _chairs.length;
    }

    /* ======================================================================
     *  5) رسم الكراسي واللاعبين على الدائرة
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

    // حجم صورة اللاعب (% من عرض الدائرة) — pA = min(11, 314/N × 0.78)
    function playerAvatarPct() {
        return Math.min(8, 314 / Math.max(_alive.length, 1) * 0.62);
    }

    // الكراسي بحلقات متحدة المركز داخل الدائرة (كرسي واحد = بالمنتصف).
    // الحلقة k تتسع حتى floor(6.28·k) كرسي، التوزيع نسبي، والحلقات
    // الفردية تنزاح نص خطوة. c = min(18, R0 / (1.08·rings + 0.5)).
    function layoutChairs(count) {
        var pA = playerAvatarPct();
        var R0 = 50 - pA / 2 - 1.5;
        var positions = [];
        var c = 16;
        if (count === 1) positions.push([50, 50]);
        else if (count > 1) {
            var caps = [], cum = 0;
            for (var k = 1; cum < count; k++) { var cap = Math.floor(6.28 * k); caps.push(cap); cum += cap; }
            c = Math.min(18, R0 / (1.08 * caps.length + 0.5));
            var counts = caps.map(function (cp) { return Math.min(cp, Math.round(count * cp / cum)); });
            var diff = count - counts.reduce(function (a, b) { return a + b; }, 0);
            for (var i = counts.length - 1; diff !== 0; i = (i - 1 + counts.length) % counts.length) {
                if (diff > 0 && counts[i] < caps[i]) { counts[i]++; diff--; }
                else if (diff < 0 && counts[i] > 0) { counts[i]--; diff++; }
            }
            counts.forEach(function (cnt, ri) {
                var r = 1.08 * c * (ri + 1);
                for (var j = 0; j < cnt; j++) {
                    var a = (j + (ri % 2) * 0.5) / cnt * 2 * Math.PI;
                    positions.push([50 + r * Math.sin(a), 50 - r * Math.cos(a)]);
                }
            });
        }
        _chairSize = c;
        return positions;
    }

    // أرقام فريدة عشوائية 1–99 لكل كرسي
    function randomFreeChairNumber(used) {
        var num;
        do { num = 1 + Math.floor(Math.random() * 99); } while (used[num]);
        used[num] = true;
        return num;
    }

    function buildChairs(count) {
        var used = {};
        return layoutChairs(count).map(function (pos) {
            return { number: randomFreeChairNumber(used), x: pos[0], y: pos[1], occupantId: null };
        });
    }

    // الكرسي: صورة كرسي خشب بظهر أعمدة — images/chair-wood.png بخلفية شفافة.
    var CHAIR_IMG = '<img class="mc-chair-img" src="images/chair-wood.png" alt="" draggable="false">';

    function renderChairs() {
        var wrap = el('mc-chairs');
        if (!wrap) return;
        var c = _chairSize;
        var numbered = _phase === 'claiming' || _phase === 'out';
        wrap.innerHTML = _chairs.map(function (chair, idx) {
            var cls = 'mc-ch' + (numbered ? ' mc-numbered' : '') + (chair.occupantId && chair.arrived ? ' mc-taken' : '');
            return '<div class="' + cls + '" id="mc-chair-' + idx + '" style="left:' + chair.x + '%;top:' + chair.y + '%;width:' + c + '%;">' +
                '<div class="mc-ch-glyph">' + CHAIR_IMG + '</div>' +
                '<div class="mc-ch-num" style="font-size:' + (c * 0.42) + 'cqw">' + chair.number + '</div></div>';
        }).join('');
    }

    function renderPlayers() {
        var wrap = el('mc-players');
        if (!wrap) return;
        _pEls = {};
        wrap.innerHTML = '';
        var circle = el('mc-circle');
        if (circle) circle.classList.toggle('mc-no-names', _alive.length > 12);
        _alive.forEach(function (p) {
            var node = document.createElement('div');
            node.className = 'mc-p';
            node.title = playerLabel(p);
            node.innerHTML = '<div class="mc-p-av">' + avatarHtml(p) + '</div>' +
                '<div class="mc-p-name">' + escapeHtml(playerLabel(p)) + '</div>';
            wrap.appendChild(node);
            _pEls[p.id] = node;
        });
        layoutPlayers();
    }

    // مواقع اللاعبين: على حافة الدائرة (موزّعين بالتساوي + زاوية الدوران)،
    // أو بمنتصف الكرسي للي جلس (بحجم 0.85c).
    function layoutPlayers() {
        var N = _alive.length;
        var pA = playerAvatarPct();
        var seatOf = {};
        _chairs.forEach(function (ch, i) { if (ch.occupantId) seatOf[ch.occupantId] = i; });
        _alive.forEach(function (p, j) {
            var node = _pEls[p.id];
            if (!node) return;
            var ci = seatOf[p.id];
            var sat = ci != null;
            var x, y;
            if (sat) { x = _chairs[ci].x; y = _chairs[ci].y; }
            else {
                var a = (j / N * 360 + _angle) * Math.PI / 180;
                x = 50 + 50 * Math.sin(a);
                y = 50 - 50 * Math.cos(a);
            }
            var sz = sat ? _chairSize * 0.85 : pA;
            node.style.left = x + '%';
            node.style.top = y + '%';
            node.classList.toggle('mc-seated', sat);
            var av = node.firstChild;
            av.style.width = sz + 'cqw';
            av.style.fontSize = (sz * 0.36) + 'cqw';
        });
    }

    function renderCenter() {
        var center = el('mc-center');
        if (!center) return;
        if (_phase === 'ended') {
            center.innerHTML = '<div class="mc-ended-title">انتهت المباراة</div>' +
                '<div class="mc-ended-sub">اضغط "مباراة جديدة" للبدء من جديد</div>';
            center.classList.add('mc-show');
        } else {
            center.innerHTML = '';
            center.classList.remove('mc-show');
        }
    }

    function clearCircle() {
        _chairs = [];
        var cw = el('mc-chairs'); if (cw) cw.innerHTML = '';
        var pw = el('mc-players'); if (pw) pw.innerHTML = '';
        _pEls = {};
    }

    // لاعب جديد ينضم أثناء الدورة ← يعاد توزيع الكراسي حسب العدد الجديد
    // (نفس الأرقام وحالة الإشغال للكراسي الموجودة).
    function addChairsIfNeeded() {
        if (!_matchActive || _chairs.length === 0) return;
        var mode = liveSettings().chairDeficitMode || 'auto';
        var targetCount = (mode === 'custom')
            ? Math.max(1, _alive.length - _roundDeficit)
            : Math.max(1, _alive.length - 1);
        if (targetCount <= _chairs.length) return;
        var positions = layoutChairs(targetCount);
        var used = {};
        _chairs.forEach(function (c) { used[c.number] = true; });
        positions.forEach(function (pos, i) {
            if (_chairs[i]) { _chairs[i].x = pos[0]; _chairs[i].y = pos[1]; }
            else _chairs.push({ number: randomFreeChairNumber(used), x: pos[0], y: pos[1], occupantId: null });
        });
        renderChairs();
        layoutPlayers();
        updateBadges();
    }

    /* ======================================================================
     *  6) الدوران — 0.03°/ms × معامل السرعة (بطيء/عادي/سريع)
     * ==================================================================== */
    function startRingLoop() {
        stopRingLoop();
        var last = performance.now();
        var loop = function (t) {
            var d = t - last; last = t;
            _angle = (_angle + d * 0.03 * SPIN_SPEEDS[_spinSpeedIdx].factor) % 360;
            layoutPlayers();
            _raf = window.requestAnimationFrame(loop);
        };
        _raf = window.requestAnimationFrame(loop);
    }

    function stopRingLoop() {
        if (_raf) { window.cancelAnimationFrame(_raf); _raf = null; }
    }

    function handleSpinButtonClick() {
        if (_phase === 'idle') startSpinPhase();
        else if (_phase === 'playing') stopSpinAndReveal();
        else if (_phase === 'out') closeOutModal();
        else if (_phase === 'champion' || _phase === 'ended') restartMatch();
    }

    function unlockAudio() {
        var ac = audioCtx();
        if (ac && ac.state === 'suspended' && typeof ac.resume === 'function') ac.resume().catch(function () {});
    }

    function startSpinPhase() {
        unlockAudio();
        setPhase('playing');
        startRingLoop();
        startMusic();
        _spinTimeoutId = window.setTimeout(stopSpinAndReveal, spinDuration() * 1000);
    }

    /* ======================================================================
     *  7) الاستماع لشات البث
     * ==================================================================== */
    function wireCommentListener() {
        unwireCommentListener();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_selectionOpen || !payload || typeof payload.text !== 'string') return;
            var player = findAlivePlayer(payload.id, payload.name);
            if (!player) return;
            if (_seatedThisRound[player.id]) return;
            var n = parseInt(toLatinDigits(payload.text.trim()), 10);
            if (isNaN(n)) return;
            var chairIdx = _chairs.findIndex(function (c) { return c.number === n && !c.occupantId; });
            if (chairIdx === -1) return;
            claimChair(player, chairIdx);
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

    // صوت الجلوس: مذبذب مثلثي 520→140Hz خلال 0.18s
    function audioCtx() {
        try { return _ac || (_ac = new (window.AudioContext || window.webkitAudioContext)()); } catch (e) { return null; }
    }
    function playSeatSound() {
        var ac = audioCtx(); var v = _musicMuted ? 0 : _musicVolume;
        if (!ac || !v) return;
        try {
            var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.18);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
            o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.25);
        } catch (e) {}
    }
    // صوت فتح نافذة الإقصاء: 4 نغمات هابطة 784/587/440/330Hz
    function playOutSound() {
        var ac = audioCtx(); var v = _musicMuted ? 0 : _musicVolume;
        if (!ac || !v) return;
        try {
            [784, 587, 440, 330].forEach(function (f, i) {
                var t = ac.currentTime + i * 0.11, o = ac.createOscillator(), g = ac.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(f, t);
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
                o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.32);
            });
        } catch (e) {}
    }

    function claimChair(player, chairIdx) {
        var chair = _chairs[chairIdx];
        chair.occupantId = player.id;
        _seatedThisRound[player.id] = true;
        layoutPlayers();

        // عند وصول الصورة للكرسي يختفي الكرسي والرقم وتبقى صورة اللاعب
        window.setTimeout(function () {
            chair.arrived = true;
            var chEl = el('mc-chair-' + chairIdx);
            if (chEl && chair.occupantId === player.id) chEl.classList.add('mc-taken');
        }, 600);
        window.setTimeout(playSeatSound, 620);

        var chairsStillEmpty = _chairs.filter(function (c) { return !c.occupantId; }).length;
        if (chairsStillEmpty === 0) {
            AGP.timerManager.stop(TIMER_NAME);
            window.setTimeout(finishSelectionWindow, 500);
        }
    }

    /* ======================================================================
     *  8) دورة كاملة
     * ==================================================================== */
    function computeChairCount() {
        var mode = liveSettings().chairDeficitMode || 'auto';
        var aliveCount = _alive.length;
        if (mode === 'custom') {
            var deficit = _customDeficitCurrent;
            _roundDeficit = deficit;
            var count = Math.max(1, aliveCount - deficit);
            _customDeficitCurrent = Math.max(1, deficit - 1);
            return count;
        }
        _roundDeficit = 1;
        return Math.max(1, aliveCount - 1);
    }

    // تجهيز الدورة: اللاعبون على الحافة والكراسي فاضية، بانتظار "تدوير"
    function runNextRound() {
        if (!_matchActive) return;
        if (_alive.length <= 1) { showChampion(_alive[0] || null); return; }

        _roundNumber++;
        _seatedThisRound = {};
        _roundLosers = [];
        setPhase('idle');
        _chairs = buildChairs(computeChairCount());
        renderCenter();
        renderChairs();
        renderPlayers();
        updateBadges();
    }

    function stopSpinAndReveal() {
        if (_phase !== 'playing') return;
        if (_spinTimeoutId) { clearTimeout(_spinTimeoutId); _spinTimeoutId = null; }
        stopRingLoop();
        stopMusic();

        setPhase('claiming');
        Array.prototype.forEach.call(el('mc-players').children, function (n) { n.classList.add('mc-moving'); });
        renderChairs();
        playSound('reveal');

        _selectionOpen = true;
        wireCommentListener();
        wireTimerListeners();
        showSeatTimer(seatTime());
        AGP.timerManager.start(TIMER_NAME, seatTime());
    }

    function wireTimerListeners() {
        unwireTimerListeners();
        _timerTickUnsub = AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            if (_phase === 'claiming') showSeatTimer(payload.remainingSeconds);
            if (payload.remainingSeconds <= 5 && payload.remainingSeconds > 0) playSound('warning');
        });
        _timerEndedUnsub = AGP.events.on('timer:ended', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            finishSelectionWindow();
        });
    }

    function unwireTimerListeners() {
        if (typeof _timerTickUnsub === 'function') _timerTickUnsub();
        if (typeof _timerEndedUnsub === 'function') _timerEndedUnsub();
        _timerTickUnsub = null;
        _timerEndedUnsub = null;
    }

    // انتهاء الجلوس (كل الكراسي انحجزت أو خلصت مهلة الاختيار): اللي بدون
    // كرسي يتلوّن أحمر، وبعد ~1.1 ثانية تفتح نافذة الإقصاء تلقائياً.
    function finishSelectionWindow() {
        if (!_selectionOpen) return;
        _selectionOpen = false;
        unwireCommentListener();
        unwireTimerListeners();

        _roundLosers = _alive.filter(function (p) { return !_seatedThisRound[p.id]; });
        if (_roundLosers.length === 0) { runNextRound(); return; }

        setPhase('out');
        _roundLosers.forEach(function (p) { if (_pEls[p.id]) _pEls[p.id].classList.add('mc-out'); });
        _outTimeoutId = window.setTimeout(showOutModal, 1100);
    }

    function showOutModal() {
        _outTimeoutId = null;
        if (_phase !== 'out') return;
        var remaining = _alive.length - _roundLosers.length;
        el('mc-out-sub').textContent = 'نهاية الدورة ' + _roundNumber + ' · متبقي ' + Math.max(0, remaining) + ' لاعب';
        el('mc-out-list').innerHTML = _roundLosers.map(function (p, i) {
            return '<div class="mc-out-item" style="transition-delay:' + (0.15 + Math.min(i, 12) * 0.05) + 's">' +
                '<div class="mc-out-av">' + avatarHtml(p) + '</div>' +
                '<div class="mc-out-name">' + escapeHtml(playerLabel(p)) + '</div>' +
                '<div class="mc-out-tag">خرج الآن</div></div>';
        }).join('');
        var modal = el('mc-out-modal');
        modal.classList.remove('mc-in');
        modal.classList.add('mc-show');
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () { modal.classList.add('mc-in'); });
        });
        playSound('eliminate');
        playOutSound();
    }

    // إغلاق نافذة الإقصاء (✕ / متابعة / الخلفية) يبدأ الدورة الجاية فوراً
    function closeOutModal() {
        closeModal('mc-out-modal');
        if (_phase !== 'out') return;
        if (_outTimeoutId) { clearTimeout(_outTimeoutId); _outTimeoutId = null; }
        _roundLosers.forEach(function (player) {
            var idx = _alive.findIndex(function (p) { return p.id === player.id; });
            if (idx !== -1) _alive.splice(idx, 1);
            _eliminated.push({ player: player, round: _roundNumber });
        });
        _roundLosers = [];
        if (_alive.length <= 1) showChampion(_alive[0] || null);
        else runNextRound();
    }

    // لما يتبقى لاعب واحد تظهر بطاقة الفائز مباشرة (النقاط + الفيديو + البطاقة)
    function showChampion(winner) {
        setPhase('champion');
        clearCircle();
        updateBadges();
        endMatch(winner);
    }

    // ⏹ إنهاء المباراة من نافذة الإعدادات — بدون فائز ولا نقاط
    function endMatchEarly() {
        _matchActive = false;
        if (_spinTimeoutId) { clearTimeout(_spinTimeoutId); _spinTimeoutId = null; }
        if (_outTimeoutId) { clearTimeout(_outTimeoutId); _outTimeoutId = null; }
        stopRingLoop();
        stopMusic();
        _selectionOpen = false;
        unwireCommentListener();
        unwireTimerListeners();
        AGP.timerManager.stop(TIMER_NAME);
        closeModal('mc-out-modal');
        setPhase('ended');
        clearCircle();
        renderCenter();
    }

    // ↺ إعادة اللعبة من البداية / لعبة جديدة — بكل اللاعبين المسجَّلين
    function restartMatch() {
        var overlay = el('agp-shell-overlay');
        var box = el('agp-shell-box');
        if (box && box.classList.contains('mc-winner-screen')) {
            stopWinnerVideo();
            if (overlay) overlay.style.display = 'none';
            box.className = '';
        }
        startMatch(liveSettings());
    }

    /* ======================================================================
     *  10) حذف/انضمام لاعب أثناء المباراة
     * ==================================================================== */
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;
        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) {
            _alive.splice(aliveIdx, 1);
            _chairs.forEach(function (c) { if (c.occupantId === removedPlayer.id) c.occupantId = null; });
            _roundLosers = _roundLosers.filter(function (p) { return p.id !== removedPlayer.id; });
            if (_pEls[removedPlayer.id]) { _pEls[removedPlayer.id].remove(); delete _pEls[removedPlayer.id]; }
            layoutPlayers();
            updateBadges();
            if (_matchActive && _alive.length <= 1) {
                window.setTimeout(function () { showChampion(_alive[0] || null); }, 400);
            }
        }
        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);
        renderJoinPanel();
    }

    // لاعب جديد يظهر على حافة الدائرة فوراً وقت انضمامه
    function handlePlayerJoined(newPlayer) {
        if (!_matchActive || !newPlayer || !newPlayer.id) return;
        var already = _alive.some(function (p) { return p.id === newPlayer.id; }) ||
            _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (already) return;
        _alive.push(newPlayer);
        renderPlayers();
        if (_phase === 'claiming' || _phase === 'out') {
            Array.prototype.forEach.call(el('mc-players').children, function (n) { n.classList.add('mc-moving'); });
        }
        addChairsIfNeeded();
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
     *  11) بدء المباراة (onStartRound من الشل)
     * ==================================================================== */
    function startMatch(settingsValues) {
        resetMatchState();
        _settings = settingsValues;
        _alive = AGP.gameManager.getPlayers().slice();
        _customDeficitCurrent = settingsValues.customDeficitStart || 5;
        _startedAt = Date.now();
        _matchActive = true;

        ensureScaffolding();
        runNextRound();
    }

    function handleStartRound(settingsValues) {
        startMatch(settingsValues);
    }

    /* ======================================================================
     *  12) نهاية المباراة + تقرير النقاط + شاشة الفائز (فيديو + بطاقة)
     * ==================================================================== */
    function endMatch(winner) {
        _matchActive = false;
        stopRingLoop();
        stopMusic();
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

    // فيديو الاحتفال (160×160 مثل روليت الإقصاء) يشتغل مع بطاقة الفائز.
    function winnerVideoHtml() {
        // ⚠️ onerror جديد: لو ملف الفيديو مو موجود على السيرفر (404) أو
        // فشل تحميله لأي سبب، نستبدل الصندوق برسالة واضحة بدل ما يطلع
        // فاضي بصمت (بالضبط الأعراض اللي وصفتها بالصورة الثانية — على
        // الأغلب لأن videos/winning-video.mp4 لسه ما انرفع فعلياً على
        // GitHub وقتها).
        return '<div class="mc-winner-video-wrap" id="mc-winner-video-wrap">' +
            '<video id="mc-winner-video" src="videos/winning-video.mp4" autoplay loop playsinline ' +
            'onerror="document.getElementById(&quot;mc-winner-video-wrap&quot;).innerHTML=' +
            '&quot;&lt;div class=\'mc-winner-video-fallback\'&gt;🎬&lt;/div&gt;&quot;;"></video>' +
            '<button type="button" class="mc-winner-video-unmute" id="mc-winner-video-unmute" hidden>🔇 اضغط للصوت</button>' +
            '</div>';
    }

    // ⚠️ إصلاح باگ حقيقي: لما تضغط "إعادة المباراة" الفيديو ما كان يتوقف
    // (كانت تختفي بصرياً بس عبر display:none، بدون إيقاف التشغيل فعلياً)
    // — فيتراكم صوته فوق الدورة الجديدة. الحل: إيقاف صريح للفيديو قبل أي
    // إجراء نهاية مباراة (سواء "مباراة جديدة" أو "إعادة المباراة").
    function stopWinnerVideo() {
        var video = el('mc-winner-video');
        if (!video) return;
        try { video.pause(); video.currentTime = 0; video.muted = true; } catch (e) {}
    }

    function wireWinnerVideo() {
        var video = el('mc-winner-video');
        var unmuteBtn = el('mc-winner-video-unmute');
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

        box.id = 'mc-winner-box';
        // ⚠️ إصلاح: كنت أرجّع box.id لـ"agp-shell-box" بعد الرسم مباشرة (تحت)،
        // فأي تنسيق CSS يستهدف #mc-winner-box ما كان يشتغل أبداً وقت
        // العرض الفعلي. الحل: كلاس ثابت يبقى، بدل الاعتماد على الآيدي
        // المؤقت وحده.
        box.className = 'mc-winner-screen';
        var awarded = winner ? findAwardedFor(pointsResult, winner) : null;

        // نفس شاشة الفوز بروليت الإقصاء: فيديو الفوز فوق، العنوان، بطاقة
        // WINNER بنفسجية — أو بطاقة الفوز المملوكة (js/agp-win-card.js) بدالها
        // لو الفائز يملك وحدة، بنفس أسطر الروليت — وثلاث أزرار.
        var cardHtml = '';
        if (winner) {
            if (AGP.winCard && AGP.winCard.canShow(winner)) {
                cardHtml = '<div class="mc-win-owned">' + AGP.winCard.renderHtml(winner, [
                    awarded ? '+' + awarded.added + ' نقطة' : 'النقاط للحسابات الموثّقة في الموقع',
                    'المركز الأول من ' + AGP.gameManager.getPlayers().length + ' لاعب',
                    GAME_NAME
                ], { pop: false }) + '</div>';
            } else {
                cardHtml =
                    '<div class="mc-win-card-wrap">' +
                        '<svg class="mc-win-crown" width="60" height="40" viewBox="0 0 60 40" aria-hidden="true">' +
                            '<polygon points="6,36 4,15 15,25 30,5 45,25 56,15 54,36" stroke-width="1.5"/>' +
                            '<circle cx="6" cy="13" r="4" stroke-width="1.5"/><circle cx="30" cy="4" r="4.5" stroke-width="1.5"/>' +
                            '<circle cx="54" cy="13" r="4" stroke-width="1.5"/><rect x="6" y="32" width="48" height="6" rx="1.5" stroke-width="1.5"/></svg>' +
                        '<div class="mc-win-card"><div class="mc-win-shine"></div><div class="mc-win-card-in">' +
                            '<span class="mc-win-label">WINNER</span>' +
                            '<span class="mc-win-av">' + avatarHtml(winner) + '</span>' +
                            '<span class="mc-win-name">' + escapeHtml(playerLabel(winner)) + '</span>' +
                            '<div class="mc-win-pts">' + (awarded
                                ? '<b class="mc-win-pts-num">+' + awarded.added + ' نقطة</b><span>تظهر في بروفايلك</span>'
                                : '<b>—</b><span>النقاط للحسابات الموثّقة في الموقع</span>') + '</div>' +
                        '</div></div></div>';
            }
        }

        box.innerHTML =
            '<div class="mc-win-inner">' +
                (winner ? winnerVideoHtml() : '') +
                '<h2>🏆 الفائز في لعبة "' + GAME_NAME + '"</h2>' +
                (winner
                    ? '<div class="mc-win-cards">' + cardHtml + '</div>'
                    : '<p class="mc-win-none">ما فيه فائز واضح لهذي المباراة.</p>') +
                '<div class="mc-winner-actions">' +
                    '<button type="button" class="mc-win-btn mc-win-btn-exit" id="mc-exit-btn">الخروج</button>' +
                    '<button type="button" class="mc-win-btn mc-win-btn-new" id="mc-new-match-btn">مباراة جديدة</button>' +
                    '<button type="button" class="mc-win-btn mc-win-btn-replay" id="mc-replay-same-btn">إعادة بنفس اللاعبين</button>' +
                '</div>' +
            '</div>';

        box.id = 'agp-shell-box';
        overlay.style.display = 'flex';

        if (winner) wireWinnerVideo();
        document.getElementById('mc-exit-btn').onclick = function () {
            stopWinnerVideo();
            homeNavigate();
        };
        document.getElementById('mc-new-match-btn').onclick = function () {
            stopWinnerVideo();
            window.location.reload();
        };
        // ⚠️ جديد: إعادة المباراة بنفس قائمة اللاعبين المسجَّلين أصلاً
        // (بدون رجوع لشاشة الاتصال/اللوبي — نفس فلسفة "إعادة اللعب بنفس
        // اللاعبين" الموجودة بروليت الإقصاء).
        document.getElementById('mc-replay-same-btn').onclick = function () {
            stopWinnerVideo(); // ⚠️ إصلاح: يمنع تراكم صوت الفيديو فوق الدورة الجديدة
            overlay.style.display = 'none';
            box.className = ''; // ⚠️ إصلاح: يمنع بقاء كلاس "mc-winner-screen" عالق لو فُتحت لوحة الإعدادات لاحقاً
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
            onLoad: function () { AGP.log('Musical Chairs: onLoad.'); },
            onPlayerJoin: function () { enforceMaxPlayers(); },
            onRoundEnd: function () { AGP.log('Musical Chairs: onRoundEnd.'); },
            onDestroy: function () { resetMatchState(); AGP.log('Musical Chairs: onDestroy — match state cleared.'); }
        });

        if (!registered) { AGP.log('Musical Chairs: registration failed (already registered?).'); return; }

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
            gameExplanation: 'تدور الأفاتارات حول حلقة الكراسي وقت ما تضغط "تدوير" (12 ثانية، أو توقفها يدوياً قبل ' +
                'لو تبي)، وفجأة تتوقف وتظهر أرقام على كل كرسي. كل لاعب يكتب رقم الكرسي اللي يبيه بالشات — أول وحد ' +
                'يكتب الرقم الصحيح يفوز فيه. أي لاعب ما يلقى كرسي يُقصى فوراً. عدد الكراسي ينقص كل دورة (تلقائي أو ' +
                'مخصّص حسب اختيار الاستريمر) لين يبقى لاعب واحد فقط — هو الفائز!',
            connectButtonLabel: 'الدخول للوبي',
            minPlayersToStart: 3,
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
        if (!overlay || el('mc-er-header')) return;
        var header = document.createElement('header');
        header.id = 'mc-er-header';
        header.innerHTML =
            '<button type="button" class="mc-er-exit">' + EXIT_ICON + '<span>خروج</span></button>' +
            '<img src="../../logo.png" alt="ألعاب أيمن"><div></div>';
        header.querySelector('.mc-er-exit').addEventListener('click', homeNavigate);
        overlay.insertBefore(header, overlay.firstChild);
    }

    function setCtaLabel(btn, label) {
        if (btn.getAttribute('data-mc-cta') === label) return;
        btn.innerHTML = escapeHtml(label) + CTA_ARROW;
        btn.setAttribute('data-mc-cta', label);
        btn.classList.add('mc-er-cta');
    }

    function layoutInitialSettingsFields(box) {
        var connectBtn = el('agp-connect-btn');
        if (!connectBtn) return;
        if (connectBtn.closest('.mc-settings-footer')) return;

        function rowFor(dataKeySelector) {
            var ctl = box.querySelector(dataKeySelector);
            return ctl ? ctl.closest('.agp-shell-row') : null;
        }
        function section(num, title, rows, full) {
            var sec = document.createElement('section');
            sec.className = 'mc-er-section' + (full ? ' mc-er-full' : '');
            sec.innerHTML = '<div class="mc-er-sec-head"><span class="mc-er-sec-num">' + num + '</span>' +
                '<span class="mc-er-sec-title">' + title + '</span></div>';
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
        scroll.className = 'mc-settings-scroll';
        var scrollInner = document.createElement('div');
        scrollInner.className = 'mc-settings-scroll-inner';
        scroll.appendChild(scrollInner);
        if (usernameField) scrollInner.appendChild(usernameField);

        scrollInner.appendChild(section(1, 'الدخول', [
            keywordField, rowFor('[data-key="maxPlayers"]'), rowFor('[data-key="followersOnly"]')
        ]));
        // عدد الكراسي الناقصة يظهر بس مع "مخصّص" (الشل يرسمه حسب الاختيار)
        scrollInner.appendChild(section(2, 'الكراسي', [
            rowFor('[data-key="chairDeficitMode"]'), rowFor('[data-key="customDeficitStart"]')
        ]));
        scrollInner.appendChild(section(3, 'الوقت', [
            rowFor('[data-key="selectionTimerSeconds"]'), rowFor('[data-key="spinDurationSeconds"]')
        ], true));
        box.appendChild(scroll);

        var footer = document.createElement('div');
        footer.className = 'mc-settings-footer';
        footer.appendChild(connectBtn);
        box.appendChild(footer);
    }

    // شارة الاتصال: نص الحالة بكبسولة حمراء/خضراء، والرابط كبسولة بنفسجية جنبها
    function enhanceConnBadge(box) {
        var badge = box.querySelector('.agp-shell-conn-badge');
        if (!badge || badge.querySelector('.mc-er-live')) return;
        var live = document.createElement('span');
        live.className = 'mc-er-live';
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
        box.classList.toggle('mc-settings-initial-box', isInitial);
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
        if (h2.getAttribute('data-mc-heading') !== '1') {
            h2.innerHTML = '<span class="mc-er-kicker">' + GAME_NAME + '</span><span class="mc-er-grad">لوبي الدخول</span>';
            h2.setAttribute('data-mc-heading', '1');
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
    var _mcFrameBoundsCache = {};

    function getFrameOpaqueRows(src) {
        if (_mcFrameBoundsCache[src]) return _mcFrameBoundsCache[src];
        _mcFrameBoundsCache[src] = new Promise(function (resolve) {
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
        return _mcFrameBoundsCache[src];
    }

    function enhanceLobbyFramedCards() {
        var box = el('agp-shell-box');
        if (!box || !(box.classList.contains('agp-lobby-box') || el('agp-mini-lobby-list'))) return;
        fitFramedCards(box);
    }

    function fitFramedCards(root) {
        var cards = root.querySelectorAll('.agp-shell-player-list .agp-pcard-tpl:not([data-mc-fit]),#mc-join-list .agp-pcard-tpl:not([data-mc-fit])');
        Array.prototype.forEach.call(cards, function (card) {
            var frameEl = card.querySelector('.agp-pcard-tpl-frame-img');
            var m = frameEl && /url\(["']?(.*?)["']?\)/.exec(frameEl.style.backgroundImage);
            if (!m) return;
            card.setAttribute('data-mc-fit', 'pending');
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
                card.setAttribute('data-mc-fit', '1');
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
        if (list) list.classList.add('mc-er-players');
        var card = box.querySelector('.mc-er-lobby-card');
        if (!card && list) {
            card = document.createElement('section');
            card.className = 'mc-er-lobby-card';
            var hint = box.querySelector('.agp-join-hint');
            (hint || list).parentNode.insertBefore(card, hint || list);
            [hint, el('agp-entrance-stage'), el('agp-entrance-settled-list'), list].forEach(function (n) {
                if (n) card.appendChild(n);
            });
        }

        var startBtn = el('agp-start-round-btn');
        if (!startBtn) return;
        setCtaLabel(startBtn, 'ابدأ المباراة');
        if (!startBtn.parentNode.classList.contains('mc-lobby-actions-row')) {
            var row = document.createElement('div');
            row.className = 'mc-lobby-actions-row';
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
    var _mcConnLayer = null;
    var _mcConnKeywordBackup = '';
    var _mcConnKeywordPending = false;
    var _mcConnErrorShown = false;
    var _mcConnErrorTimer = null;

    function ensureConnLayer() {
        if (_mcConnLayer) return _mcConnLayer;
        var layer = document.createElement('div');
        layer.id = 'mc-conn-layer';
        layer.innerHTML =
            '<div class="mc-conn-backdrop"></div>' +
            '<div class="mc-conn-modal">' +
                '<div class="mc-conn-icon"></div>' +
                '<h3 class="mc-conn-title"></h3>' +
                '<p class="mc-conn-sub"></p>' +
            '</div>';
        document.body.appendChild(layer);
        _mcConnLayer = layer;
        return layer;
    }

    function showConnLayer(isError, title, sub) {
        var layer = ensureConnLayer();
        var modal = layer.querySelector('.mc-conn-modal');
        var icon = layer.querySelector('.mc-conn-icon');
        modal.classList.toggle('mc-conn-err', isError);
        icon.className = 'mc-conn-icon ' + (isError ? 'mc-conn-err-icon' : 'mc-conn-spinner');
        icon.textContent = isError ? '✕' : '';
        layer.querySelector('.mc-conn-title').textContent = title;
        layer.querySelector('.mc-conn-sub').textContent = sub || '';
        layer.classList.add('show');
    }

    // تفريغ النسخة الشبحية عند الإخفاء — عشان عناصرها (بنفس ids شاشة
    // الإعدادات مثل #agp-tiktok-username) ما تلخبط getElementById لاحقاً.
    function hideConnLayer() {
        if (!_mcConnLayer) return;
        _mcConnLayer.classList.remove('show');
        var backdrop = _mcConnLayer.querySelector('.mc-conn-backdrop');
        if (backdrop) backdrop.innerHTML = '';
    }

    document.addEventListener('click', function (e) {
        if (!e.target || e.target.id !== 'agp-connect-btn') return;
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('mc-settings-initial-box')) return;
        var kInput = el('agp-keyword');
        var uInput = el('agp-tiktok-username');
        // نفس شروط الملف المشترك (handleConnectClick): بدون يوزر أو كلمة
        // مفتاحية ما يصير اتصال أصلاً — فلا نعرض طبقة "جاري الاتصال".
        if (!kInput || !kInput.value.trim() || !uInput || !uInput.value.trim()) return;
        _mcConnKeywordBackup = kInput.value;
        var ghost = box.cloneNode(true);
        ghost.id = 'agp-shell-box-ghost';
        var layer = ensureConnLayer();
        var backdrop = layer.querySelector('.mc-conn-backdrop');
        backdrop.innerHTML = '';
        backdrop.appendChild(ghost);
        _mcConnErrorShown = false;
        showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
    }, true);

    function syncConnLayer() {
        var box = el('agp-shell-box');
        if (!box) return;

        if (box.classList.contains('agp-conn-error')) {
            if (!_mcConnErrorShown) {
                _mcConnErrorShown = true;
                var subEl = box.querySelector('.agp-shell-status');
                showConnLayer(true, 'تعذّر الاتصال', subEl ? subEl.textContent : 'تحقّق من اليوزرنيم وحاول مرة أخرى.');
                clearTimeout(_mcConnErrorTimer);
                _mcConnErrorTimer = setTimeout(function () {
                    hideConnLayer();
                    if (AGP.gameShell && typeof AGP.gameShell.setSetting === 'function') {
                        var s = AGP.gameShell.getSettings();
                        var firstKey = Object.keys(s)[0];
                        if (firstKey !== undefined) AGP.gameShell.setSetting(firstKey, s[firstKey]);
                    }
                    _mcConnKeywordPending = true;
                }, 2400);
            }
            return;
        }

        if (box.classList.contains('agp-connecting-box')) {
            clearTimeout(_mcConnErrorTimer);
            _mcConnErrorShown = false;
            if (!_mcConnLayer || !_mcConnLayer.classList.contains('show')) {
                showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
            }
            return;
        }

        clearTimeout(_mcConnErrorTimer);
        _mcConnErrorShown = false;
        if (box.classList.contains('agp-lobby-box')) hideConnLayer();
        if (_mcConnKeywordPending && box.classList.contains('mc-settings-initial-box')) {
            var kInput = el('agp-keyword');
            if (kInput) kInput.value = _mcConnKeywordBackup;
            _mcConnKeywordPending = false;
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
