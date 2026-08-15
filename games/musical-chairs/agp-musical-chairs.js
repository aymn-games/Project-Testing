/**
 * ==========================================================================
 *  AGP MUSICAL CHAIRS — "الكراسي الموسيقية" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 *
 * لعبة أصلية (Native) داخل نفس مستودع Project-Testing، بنفس نمط
 * games/elimination-roulette بالضبط: صفحتها الخاصة
 * (games/musical-chairs/index.html) تحمّل AGP Core كاملاً + js/agp-game-shell.js
 * (عام، غير مُعدَّل هنا) + هذا الملف. لا تعديل على أي ملف موجود بالمشروع —
 * ملف Plugin مستقل تماماً بنفس فلسفة روليت الإقصاء، بقرار صريح من صاحب
 * المشروع (منطق إقصاء خاص باللعبة، لا محرك مشترك).
 *
 * ⚠️ ملاحظة صادقة: مؤثرات الصوت القصيرة الخمسة (reveal/claim/eliminate/
 *   warning/winner) مُولَّدة برمجياً (نغمات بسيطة)، بديل عملي متاح فوراً.
 *   أما مقاطع الموسيقى الطويلة (شيلات/أغاني خليجية) فملفات حقيقية زوَّدنا
 *   بها صاحب المشروع مباشرة (sounds/shailat/1-5.mp3, sounds/khaleeji/1-5.mp3).
 *
 * ملخص الآلية (نسخة معدَّلة — تدوير يدوي بدل التلقائي بالكامل):
 *   - كل دورة: الحلقة تبدأ ثابتة، والاستريمر يضغط زر "تدوير" بنفسه.
 *   - مدة التدوير الطبيعية 12 ثانية (يتوقف تلقائياً بعدها)، أو يقدر
 *     الاستريمر يضغط الزر مرة ثانية أثناء الدوران لإيقافه مبكراً يدوياً.
 *   - وقت الدوران، يشتغل مقطع موسيقى واحد حسب النوع المحدد بزر "تحديد
 *     نوع الموسيقى" (عشوائي من الكل / شيلات فقط / أغاني خليجية فقط).
 *   - لحظة توقف الدوران: يتوقف الصوت فوراً + تظهر أرقام عشوائية (10–99)
 *     على الكراسي + تبدأ مهلة اختيار الكرسي (المدة المحددة بإعدادات
 *     المباراة) — تظهر كعدّاد حي بجانب زر التدوير مباشرة.
 *   - كل لاعب حي يكتب رقم كرسي بالشات؛ أول رقم صحيح يوصل لكرسي فاضي
 *     يثبَّت عليه فوراً (أي محاولة بعدها لنفس الكرسي أو من نفس اللاعب
 *     تُتجاهل تماماً).
 *   - عند انتهاء المهلة، أي لاعب حي بدون كرسي يُقصى بأنيميشن متتابع
 *     (لاعب تلو الآخر) + صوت إقصاء، ثم الاستريمر يضغط "تدوير" مرة ثانية
 *     بنفسه للدورة الجاية (ما تبدأ تلقائياً).
 *   - عدد الكراسي كل دورة: وضعان يحددهما الاستريمر بشاشة الإعدادات —
 *       "تلقائي": دائماً (عدد اللاعبين المتبقين − 1).
 *       "مخصّص": يبدأ بعجز يحدده الاستريمر (مثلاً 5)، وينقص واحد كل
 *       دورة (5 ثم 4 ثم 3...) لين يثبت عند 1.
 *   - يبقى لاعب واحد = الفائز، تظهر شاشة الفائز مع فيديو احتفال + البطاقة.
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

    var SPIN_DURATION_MS = 12000; // ⚠️ مدة التدوير "الطبيعية" — طلب صريح: 12 ثانية بالضبط
    var ROTATION_DEG_PER_SEC = 22;
    var RING_TICK_MS = 90;
    var ELIMINATE_STAGGER_MS = 550;
    var NEXT_ROUND_DELAY_MS = 2200;
    var MUSIC_TRACK_COUNT = 5; // عدد ملفات كل تصنيف (شيلات / خليجية)

    /* ======================================================================
     *  0) الصوت — طبقتان منفصلتان:
     *     أ) مؤثرات قصيرة (reveal/claim/eliminate/warning/winner) — نفس
     *        القديم، مربوطة بحقل soundVolume بشاشة الإعدادات.
     *     ب) موسيقى طويلة (شيلات/خليجية) — تشتغل فقط وقت الدوران الفعلي،
     *        بمستوى صوت حي (سلايدر) + كتم منفصلين تماماً، يتحكم فيهم
     *        الاستريمر لحظياً من شريط الأدوات أثناء اللعب.
     * ==================================================================== */
    var SOUND_BASE = 'sounds/';
    var _sounds = {
        reveal: new Audio(SOUND_BASE + 'reveal.wav'),
        claim: new Audio(SOUND_BASE + 'claim.wav'),
        eliminate: new Audio(SOUND_BASE + 'eliminate.wav'),
        warning: new Audio(SOUND_BASE + 'warning.wav'),
        winner: new Audio(SOUND_BASE + 'winner.wav')
    };

    function currentVolume() {
        var settings = AGP.gameShell.getSettings ? AGP.gameShell.getSettings() : {};
        var v = settings.soundVolume;
        if (v === undefined || v === null || isNaN(v)) v = 7;
        return Math.max(0, Math.min(10, v)) / 10;
    }

    function playSound(name) {
        var a = _sounds[name];
        if (!a) return;
        try {
            a.volume = currentVolume();
            a.currentTime = 0;
            var p = a.play();
            if (p && typeof p.catch === 'function') { p.catch(function () {}); }
        } catch (e) { /* تجاهل صامت — الصوت طبقة تحسين، لا يوقف اللعبة */ }
    }

    // ⚠️ طبقة الموسيقى الطويلة (منفصلة كلياً عن مؤثرات SFX أعلاه)
    var _musicTracks = { shailat: [], khaleeji: [] };
    for (var mi = 1; mi <= MUSIC_TRACK_COUNT; mi++) {
        _musicTracks.shailat.push(SOUND_BASE + 'shailat/' + mi + '.mp3');
        _musicTracks.khaleeji.push(SOUND_BASE + 'khaleeji/' + mi + '.mp3');
    }

    var _musicMode = 'random';   // 'random' | 'shailat' | 'khaleeji' — يتحكم فيه الاستريمر حياً
    var _musicMuted = false;
    var _musicVolume = 0.7;      // 0..1 — سلايدر حي منفصل عن soundVolume (مؤثرات SFX)
    var _currentMusicAudio = null;

    function pickMusicUrl() {
        var pool;
        if (_musicMode === 'shailat') pool = _musicTracks.shailat;
        else if (_musicMode === 'khaleeji') pool = _musicTracks.khaleeji;
        else pool = _musicTracks.shailat.concat(_musicTracks.khaleeji);
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function startMusic() {
        stopMusic();
        var url = pickMusicUrl();
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
    var _seatedThisRound = {};
    var _playerAngle = {};

    var _ringTimer = null;
    var _ringRotation = 0;
    var _ringSpinning = false;   // ⚠️ جديد: هل الحلقة تدور الآن فعلياً (لحساب الزاوية بأي وقت)
    var _spinTimeoutId = null;
    var _spinState = 'idle';     // 'idle' | 'spinning' — حالة زر التدوير اليدوي
    var _selectionOpen = false;

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
        _chairs = [];
        _seatedThisRound = {};
        _playerAngle = {};
        stopRingLoop();
        stopMusic();
        _spinState = 'idle';
        if (_spinTimeoutId) { clearTimeout(_spinTimeoutId); _spinTimeoutId = null; }
        AGP.timerManager.stop(TIMER_NAME);
        _selectionOpen = false;
        unwireCommentListener();
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
            { key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى لعدد اللاعبين بالمباراة', min: 3, default: 24 },
            {
                key: 'followersOnly', type: 'pill-choice', label: '🔑 مين يقدر يدخل؟',
                options: [{ label: 'الكل', value: false }, { label: 'المتابعون فقط', value: true }],
                default: false
            },
            {
                key: 'chairDeficitMode', type: 'pill-choice', label: '🪑 طريقة نقصان الكراسي',
                options: [
                    { label: 'تلقائي (كرسي واحد كل دورة)', value: 'auto' },
                    { label: 'مخصّص (أحدده بنفسي)', value: 'custom' }
                ],
                default: 'auto'
            },
            {
                key: 'customDeficitStart', type: 'counter', label: '➖ عدد الكراسي الناقصة أول دورة',
                min: 1, default: 5, showWhen: { key: 'chairDeficitMode', equals: 'custom' }
            },
            {
                key: 'selectionTimerSeconds', type: 'pill-group', label: '⏱️ مهلة اختيار الكرسي',
                options: SELECTION_TIMER_OPTIONS, default: 15
            },
            { key: 'soundVolume', type: 'slider', label: '🔊 مستوى صوت المؤثرات', min: 0, max: 10, default: 7, onlyMidMatch: true }
        ];
    }

    /* ======================================================================
     *  3) الأنماط
     *     ألوان: بنفسج المنصة الرسمي (--agp-accent)، سماوي المنصة الرسمي
     *     (--agp-accent-2)، وردي المنصة الرسمي (--agp-accent-pink)، ذهبي
     *     خاص بالكراسي (--mc-gold). شريط الأدوات ولوحة "عدد اللاعبين"
     *     مبنيان حرفياً على القيم اللي زوَّدنا بها صاحب المشروع من Figma
     *     (تعبئة #CAB6B6 + حد #9F5FC4 بسماكة 4 من الداخل + استدارة 35) —
     *     نفس القيم انطبقت على بادج "عدد الكراسي" أيضاً لتناسق الشريط، لأن
     *     ما وصلتنا قيم منفصلة له. باقي عناصر الشريط (زر التدوير، السلايدر،
     *     زر نوع الموسيقى) صممتها بذوقي متناسقة مع نفس اللوحة والصورة
     *     المرجعية المرسلة — تُعدَّل يدوياً بسهولة لاحقاً لو الألوان ما
     *     عجبتك بالضبط.
     * ==================================================================== */
    function injectStageStyles() {
        if (el('mc-stage-styles')) return;
        var style = document.createElement('style');
        style.id = 'mc-stage-styles';
        style.textContent = [
            ':root{--mc-gold:#ffb020;--mc-gold-2:#ff7a3d;--mc-danger:#ff4d6a;--mc-badge-fill:#CAB6B6;--mc-badge-stroke:#9F5FC4;--mc-video-glow:#4d0008;}',

            '#mc-stage{position:fixed;inset:0;padding-top:78px;display:flex;flex-direction:column;',
            'align-items:center;z-index:10;font-family:Cairo,sans-serif;direction:rtl;}',

            '#mc-round-banner{margin:6px 0 4px;text-align:center;color:#fff;}',
            '#mc-round-banner .mc-round-num{font-family:"Cairo Play",Cairo,sans-serif;font-weight:900;',
            'font-size:1.35em;background:linear-gradient(90deg,var(--agp-accent-2),var(--mc-gold));',
            '-webkit-background-clip:text;background-clip:text;color:transparent;}',
            '#mc-round-banner .mc-round-sub{font-size:0.85em;color:#d9c3ef;margin-top:2px;}',

            /* ================= شريط الأدوات (تدوير + صوت + نوع الموسيقى + بادجات) =================
             * ⚠️ عرّضته من عرض تلقائي (~680px حسب المحتوى) لعرض أدنى ثابت
             * 760px على الشاشات الواسعة (يرجع يتقلّص تلقائياً على الجوال
             * عبر min(94vw,760px) حتى ما ينكسر التصميم). عدّل الرقم 760
             * لأي رقم تبيه بالضبط. */
            '#mc-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;',
            'margin:8px auto;padding:10px 18px;width:min(94vw,760px);box-sizing:border-box;border-radius:999px;',
            'background:linear-gradient(90deg,#3a1750,#2D1932);border:2px solid var(--mc-badge-stroke);',
            'box-shadow:0 4px 18px rgba(0,0,0,0.35);}',

            '.mc-spin-btn{border:none;border-radius:999px;padding:9px 20px;font-weight:800;font-size:0.95em;',
            'color:#fff;cursor:pointer;background:linear-gradient(90deg,var(--agp-accent-pink),var(--agp-accent));',
            'box-shadow:0 0 10px rgba(255,77,255,0.45);transition:transform .15s;}',
            '.mc-spin-btn:active{transform:scale(0.96);}',
            '.mc-spin-btn.mc-spin-btn-active{background:linear-gradient(90deg,#ff6161,#c81452);}',
            '.mc-spin-btn:disabled{opacity:0.45;cursor:not-allowed;}',

            '#mc-spin-countdown{font-weight:800;font-size:0.85em;color:var(--mc-gold);min-width:34px;text-align:center;}',

            '.mc-volume-group{display:flex;align-items:center;gap:6px;background:rgba(0,0,0,0.25);',
            'border-radius:999px;padding:4px 10px;}',
            '.mc-icon-btn{border:none;background:none;color:#fff;font-size:1.05em;cursor:pointer;line-height:1;padding:2px;}',
            '#mc-volume-slider{width:80px;accent-color:var(--mc-gold);cursor:pointer;}',

            '.mc-music-mode{position:relative;}',
            '.mc-music-mode-btn{border:none;border-radius:999px;padding:9px 16px;font-weight:800;font-size:0.85em;',
            'color:#fff;background:#141018;border:1px solid #3a3040;cursor:pointer;display:flex;align-items:center;gap:6px;}',
            '.mc-music-mode-options{position:absolute;top:110%;right:0;background:#1c1424;border:1px solid var(--mc-badge-stroke);',
            'border-radius:12px;padding:6px;display:flex;flex-direction:column;gap:4px;min-width:150px;z-index:50;',
            'box-shadow:0 6px 18px rgba(0,0,0,0.5);}',
            '.mc-music-mode-options[hidden]{display:none;}',
            '.mc-music-mode-options button{border:none;background:none;color:#f3eefc;text-align:right;padding:7px 10px;',
            'border-radius:8px;font-size:0.85em;cursor:pointer;font-family:Cairo,sans-serif;}',
            '.mc-music-mode-options button:hover,.mc-music-mode-options button.mc-mode-active{background:var(--agp-accent);color:#fff;}',

            '.mc-badge{border:4px solid var(--mc-badge-stroke);background:var(--mc-badge-fill);',
            'border-radius:35px;padding:9px 16px;font-weight:800;font-size:0.85em;color:#2b1240;',
            'box-sizing:border-box;min-height:52px;display:flex;align-items:center;gap:6px;white-space:nowrap;}',

            '#mc-countdown{margin-top:2px;font-weight:800;font-size:1.05em;color:var(--mc-gold);',
            'min-height:1.4em;display:flex;align-items:center;justify-content:center;gap:6px;}',
            '#mc-countdown.mc-countdown-warn{color:var(--mc-danger);}',

            '#mc-circle-wrap{position:relative;width:min(62vw,600px);height:min(62vw,600px);',
            'min-width:320px;min-height:320px;margin:10px auto;}',
            '#mc-circle-glow{position:absolute;inset:8%;border-radius:50%;',
            'background:radial-gradient(circle,rgba(124,58,237,0.28),transparent 70%);pointer-events:none;}',
            /* ⚠️ تصميم جديد لحلقة الإطار — حلقة متوهّجة تلوّن متدرّج (بنفسجي
             * ← سماوي ← ذهبي ← وردي) تدور ببطء حول الحلبة، بدل الخط
             * المتقطع البسيط القديم. مبنية بتقنية conic-gradient + mask
             * (بدون أي صورة خارجية). */
            '#mc-circle-track{position:absolute;inset:-3px;border-radius:50%;pointer-events:none;',
            'background:conic-gradient(from 0deg,var(--agp-accent),var(--agp-accent-2),var(--mc-gold),',
            'var(--agp-accent-pink),var(--agp-accent));',
            '-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 5px));',
            'mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 5px));',
            'opacity:0.9;animation:mcTrackSpin 7s linear infinite;',
            'filter:drop-shadow(0 0 10px rgba(124,58,237,0.55));}',
            '@keyframes mcTrackSpin{to{transform:rotate(360deg);}}',
            '#mc-chairs-ring{position:absolute;inset:0;}',
            '#mc-players-ring{position:absolute;inset:0;}',

            '.mc-chair{position:absolute;width:15%;height:15%;transform:translate(-50%,-50%);',
            'display:flex;align-items:center;justify-content:center;}',
            '.mc-chair-svg{width:100%;height:100%;filter:drop-shadow(0 0 8px rgba(255,176,32,0.55));transition:filter .25s;}',
            '.mc-chair.mc-chair-taken .mc-chair-svg{filter:drop-shadow(0 0 14px rgba(124,58,237,0.9));}',
            '.mc-chair-number{position:absolute;top:6%;left:50%;transform:translateX(-50%) scale(0);',
            'background:linear-gradient(180deg,var(--mc-gold),var(--mc-gold-2));color:#3a1a00;',
            'font-weight:900;font-size:0.95em;border-radius:999px;padding:2px 9px;',
            'box-shadow:0 0 10px rgba(255,176,32,0.8);transition:transform .35s cubic-bezier(.34,1.56,.64,1);}',
            '.mc-chair.mc-chair-revealed .mc-chair-number{transform:translateX(-50%) scale(1);}',
            '.mc-chair.mc-chair-taken .mc-chair-number{background:linear-gradient(180deg,var(--agp-accent-2),var(--agp-accent));color:#fff;}',

            '.mc-avatar{position:absolute;width:11%;height:11%;transform:translate(-50%,-50%);',
            'display:flex;align-items:center;justify-content:center;transition:left .1s linear,top .1s linear;}',
            '.mc-avatar.mc-avatar-seating{transition:left .5s cubic-bezier(.34,1.56,.64,1),top .5s cubic-bezier(.34,1.56,.64,1);}',
            '.mc-avatar-img,.mc-avatar-fallback{width:100%;height:100%;border-radius:50%;object-fit:cover;',
            'border:2px solid var(--agp-accent-2);box-shadow:0 0 10px rgba(0,194,255,0.55);background:#2c1240;}',
            '.mc-avatar-fallback{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:0.85em;}',
            '.mc-avatar-name{position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);',
            'font-size:0.62em;color:#f3eefc;background:rgba(8,4,16,0.65);padding:1px 6px;border-radius:999px;',
            'white-space:nowrap;max-width:70px;overflow:hidden;text-overflow:ellipsis;}',
            '.mc-avatar.mc-avatar-safe .mc-avatar-img,.mc-avatar.mc-avatar-safe .mc-avatar-fallback{',
            'border-color:#2fbf71;box-shadow:0 0 12px rgba(47,191,113,0.85);}',
            '@keyframes mcSeatPop{0%{transform:translate(-50%,-50%) scale(1);}45%{transform:translate(-50%,-50%) scale(1.28);}100%{transform:translate(-50%,-50%) scale(1);}}',
            '.mc-avatar.mc-avatar-safe{animation:mcSeatPop .4s ease;}',
            '@keyframes mcShakeOut{0%{transform:translate(-50%,-50%) rotate(0) scale(1);opacity:1;}',
            '20%{transform:translate(-50%,-50%) rotate(-14deg) scale(1.05);}',
            '40%{transform:translate(-50%,-50%) rotate(12deg) scale(1.05);}',
            '60%{transform:translate(-50%,-50%) rotate(-10deg) scale(0.95);}',
            '100%{transform:translate(-50%,-50%) translateY(40px) rotate(20deg) scale(0.35);opacity:0;}}',
            '.mc-avatar.mc-avatar-out{animation:mcShakeOut .6s ease forwards;filter:grayscale(1) drop-shadow(0 0 14px rgba(255,77,106,0.9));}',
            '@keyframes mcJoinPop{0%{transform:translate(-50%,-50%) scale(0);opacity:0;}100%{transform:translate(-50%,-50%) scale(1);opacity:1;}}',
            '.mc-avatar.mc-avatar-joining{animation:mcJoinPop .35s ease;}',

            '#mc-toast-wrap{position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:99996;',
            'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;}',
            '.mc-toast{background:rgba(20,8,35,0.92);border:1px solid var(--mc-gold);color:#fff;',
            'padding:8px 18px;border-radius:999px;font-size:0.85em;font-weight:700;',
            'box-shadow:0 0 14px rgba(255,176,32,0.4);animation:mcToastIn .25s ease;}',
            '@keyframes mcToastIn{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}',

            /* شاشة الفائز + فيديو الاحتفال */
            '#mc-winner-box h2{background:linear-gradient(90deg,var(--mc-gold),var(--agp-accent-2));',
            '-webkit-background-clip:text;background-clip:text;color:transparent;}',
            '.mc-winner-video-wrap{width:250px;height:250px;margin:6px auto 14px;border-radius:18px;',
            'overflow:hidden;position:relative;border:3px solid var(--mc-video-glow);',
            'box-shadow:0 0 18px var(--mc-video-glow),0 0 38px var(--mc-video-glow);',
            'animation:mcVideoPulse 1.8s ease-in-out infinite;}',
            '@keyframes mcVideoPulse{0%,100%{box-shadow:0 0 14px var(--mc-video-glow),0 0 26px var(--mc-video-glow);}',
            '50%{box-shadow:0 0 22px var(--mc-video-glow),0 0 48px var(--mc-video-glow);}}',
            '.mc-winner-video-wrap video{width:100%;height:100%;object-fit:cover;display:block;}',
            '.mc-winner-video-unmute{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);',
            'background:rgba(0,0,0,0.55);color:#fff;border:none;border-radius:999px;padding:5px 12px;',
            'font-size:0.8em;cursor:pointer;font-family:Cairo,sans-serif;}',
            '.mc-winner-card{display:flex;flex-direction:column;align-items:center;gap:10px;',
            'padding:18px;border-radius:16px;background:rgba(255,255,255,0.06);',
            'border:1px solid var(--mc-gold);margin:0 0 14px;}',
            '.mc-winner-avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;',
            'border:3px solid var(--mc-gold);box-shadow:0 0 22px rgba(255,176,32,0.7);}',
            '.mc-winner-name{font-weight:900;font-size:1.2em;color:#fff;}',
            '.mc-winner-points{color:var(--mc-gold);font-weight:800;font-size:0.9em;}',
            '.mc-winner-video-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;',
            'font-size:3em;background:rgba(0,0,0,0.3);}',

            /* ⚠️ جديد: زرّي نهاية المباراة بجانب بعض، كل وحد عرضه 350px بالضبط — طلب صريح */
            '.mc-winner-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;width:100%;}',
            '.mc-winner-action-btn{width:350px;max-width:90vw;margin-top:0 !important;}',

            /* ⚠️ تحسين وضوح زر إغلاق (✕) لوحة الإعدادات — خاص بصفحة الكراسي
             * الموسيقية فقط عبر override بملفنا، بدون أي لمس لملف
             * js/agp-game-shell.js المشترك (قرار صريح من صاحب المشروع). */
            '#agp-settings-close-btn{color:#fff !important;background:rgba(0,0,0,0.35) !important;',
            'width:32px;height:32px;border-radius:50%;display:flex !important;align-items:center;',
            'justify-content:center;box-shadow:0 0 8px rgba(0,0,0,0.55);}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  4) بناء الحلبة (Scaffolding)
     * ==================================================================== */
    function ensureScaffolding() {
        injectStageStyles();
        if (!el('mc-toast-wrap')) {
            var toastWrap = document.createElement('div');
            toastWrap.id = 'mc-toast-wrap';
            document.body.appendChild(toastWrap);
        }
        if (!el('mc-stage')) {
            var stage = document.createElement('div');
            stage.id = 'mc-stage';
            stage.innerHTML =
                '<div id="mc-round-banner"><div class="mc-round-num" id="mc-round-num"></div>' +
                '<div class="mc-round-sub" id="mc-round-sub"></div></div>' +

                '<div id="mc-toolbar">' +
                '<button type="button" id="mc-spin-btn" class="mc-spin-btn">▶️ تدوير</button>' +
                '<span id="mc-spin-countdown"></span>' +
                '<div class="mc-volume-group">' +
                '<button type="button" id="mc-mute-btn" class="mc-icon-btn" title="كتم/تشغيل صوت الموسيقى">🔊</button>' +
                '<input type="range" id="mc-volume-slider" min="0" max="100" value="70" title="مستوى صوت الموسيقى">' +
                '</div>' +
                '<div class="mc-music-mode">' +
                '<button type="button" id="mc-music-mode-btn" class="mc-music-mode-btn">🔀 التشغيل العشوائي</button>' +
                '<div class="mc-music-mode-options" id="mc-music-mode-options" hidden>' +
                '<button type="button" data-mode="random">🔀 عشوائي</button>' +
                '<button type="button" data-mode="shailat">🎙️ شيلات</button>' +
                '<button type="button" data-mode="khaleeji">🎵 اغاني خليجية</button>' +
                '</div></div>' +
                '<span class="mc-badge" id="mc-chairs-badge">🪑 <span id="mc-chairs-badge-num">0</span></span>' +
                '<span class="mc-badge" id="mc-players-badge">👥 <span id="mc-players-badge-num">0</span></span>' +
                '</div>' +

                '<div id="mc-countdown"></div>' +
                '<div id="mc-circle-wrap">' +
                '<div id="mc-circle-glow"></div>' +
                '<div id="mc-circle-track"></div>' +
                '<div id="mc-chairs-ring"></div>' +
                '<div id="mc-players-ring"></div>' +
                '</div>';
            document.body.appendChild(stage);
            wireToolbarEvents();
        }
    }

    function showToast(text) {
        var wrap = el('mc-toast-wrap');
        if (!wrap) return;
        var t = document.createElement('div');
        t.className = 'mc-toast';
        t.textContent = text;
        wrap.appendChild(t);
        setTimeout(function () {
            t.style.transition = 'opacity .3s';
            t.style.opacity = '0';
            setTimeout(function () { t.remove(); }, 320);
        }, 2600);
    }

    /* ======================================================================
     *  4ب) شريط الأدوات — تدوير يدوي + صوت الموسيقى + نوع الموسيقى + بادجات
     * ==================================================================== */
    function wireToolbarEvents() {
        var spinBtn = el('mc-spin-btn');
        if (spinBtn) spinBtn.onclick = handleSpinButtonClick;

        var muteBtn = el('mc-mute-btn');
        if (muteBtn) muteBtn.onclick = function () {
            _musicMuted = !_musicMuted;
            muteBtn.textContent = _musicMuted ? '🔇' : '🔊';
            applyMusicVolumeLive();
        };

        var volSlider = el('mc-volume-slider');
        if (volSlider) volSlider.oninput = function () {
            _musicVolume = Number(volSlider.value) / 100;
            if (_musicMuted && _musicVolume > 0) {
                _musicMuted = false;
                var mb = el('mc-mute-btn');
                if (mb) mb.textContent = '🔊';
            }
            applyMusicVolumeLive();
        };

        var modeBtn = el('mc-music-mode-btn');
        var modeOptions = el('mc-music-mode-options');
        if (modeBtn && modeOptions) {
            modeBtn.onclick = function () { modeOptions.hidden = !modeOptions.hidden; };
            modeOptions.querySelectorAll('button').forEach(function (btn) {
                btn.onclick = function () {
                    _musicMode = btn.getAttribute('data-mode');
                    var labels = { random: '🔀 التشغيل العشوائي', shailat: '🎙️ شيلات', khaleeji: '🎵 اغاني خليجية' };
                    modeBtn.textContent = labels[_musicMode] || labels.random;
                    modeOptions.querySelectorAll('button').forEach(function (b) { b.classList.remove('mc-mode-active'); });
                    btn.classList.add('mc-mode-active');
                    modeOptions.hidden = true;
                };
            });
        }

        document.addEventListener('click', function (e) {
            if (modeOptions && !modeOptions.hidden && modeBtn && !modeBtn.contains(e.target) && !modeOptions.contains(e.target)) {
                modeOptions.hidden = true;
            }
        });
    }

    function updateBadges() {
        var chairsNum = el('mc-chairs-badge-num');
        var playersNum = el('mc-players-badge-num');
        if (chairsNum) chairsNum.textContent = _chairs.length;
        if (playersNum) playersNum.textContent = _alive.length;
    }

    /* ======================================================================
     *  5) رسم الكراسي واللاعبين على الحلبة
     * ==================================================================== */
    function angleToXY(angleDeg, radiusPct) {
        var rad = (angleDeg - 90) * Math.PI / 180;
        return { x: 50 + radiusPct * Math.cos(rad), y: 50 + radiusPct * Math.sin(rad) };
    }

    // ⚠️ إصلاح باگ حقيقي: كل الكراسي كانت تستخدم نفس معرِّف SVG الحرفي
    // "mcChairGrad" (أول Grad مكرر بكل كرسي بنفس الصفحة) — معرِّفات SVG
    // المكرَّرة بنفس المستند ممكن تسبب فشل رسم التدرّج بمتصفحات حقيقية
    // (خصوصاً بعد استبدال innerHTML كل دورة). الحل: معرِّف فريد لكل كرسي
    // برقم index بالكرسي نفسه.
    function chairSvg(idx) {
        var gradId = 'mcChairGrad' + idx;
        return '<svg class="mc-chair-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
            '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#ffd166"/><stop offset="100%" stop-color="#ffb020"/>' +
            '</linearGradient></defs>' +
            '<rect x="14" y="6" width="30" height="8" rx="3" fill="url(#' + gradId + ')"/>' +
            '<rect x="14" y="14" width="8" height="26" rx="2" fill="url(#' + gradId + ')" opacity="0.9"/>' +
            '<rect x="10" y="26" width="38" height="9" rx="3" fill="url(#' + gradId + ')"/>' +
            '<rect x="12" y="35" width="6" height="20" rx="2" fill="#c97a12"/>' +
            '<rect x="40" y="35" width="6" height="20" rx="2" fill="#c97a12"/>' +
            '<rect x="18" y="35" width="6" height="16" rx="2" fill="#c97a12"/>' +
            '<rect x="34" y="35" width="6" height="16" rx="2" fill="#c97a12"/>' +
            '</svg>';
    }

    function avatarInnerHtml(player) {
        var name = playerLabel(player);
        var avatarUrl = player && player.avatarUrl;
        var initials = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        return (avatarUrl
            ? '<img class="mc-avatar-img" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" ' +
              'onerror="this.outerHTML=\'<div class=&quot;mc-avatar-fallback&quot;>' + escapeHtml(initials) + '</div>\';">'
            : '<div class="mc-avatar-fallback">' + escapeHtml(initials) + '</div>') +
            '<span class="mc-avatar-name">' + escapeHtml(name) + '</span>';
    }

    function usedChairNumbers() {
        var used = {};
        _chairs.forEach(function (c) { used[c.number] = true; });
        return used;
    }

    function randomFreeChairNumber(used) {
        var num;
        do { num = 10 + Math.floor(Math.random() * 90); } while (used[num]);
        used[num] = true;
        return num;
    }

    function buildChairs(count) {
        var used = {};
        var chairs = [];
        for (var i = 0; i < count; i++) {
            var pos = angleToXY((360 / count) * i, 32);
            chairs.push({ number: randomFreeChairNumber(used), x: pos.x, y: pos.y, occupantId: null });
        }
        return chairs;
    }

    function renderChairsRing() {
        var ring = el('mc-chairs-ring');
        if (!ring) return;
        ring.innerHTML = _chairs.map(function (chair, idx) {
            return '<div class="mc-chair" id="mc-chair-' + idx + '" style="left:' + chair.x + '%;top:' + chair.y + '%;">' +
                chairSvg(idx) + '<span class="mc-chair-number">' + chair.number + '</span></div>';
        }).join('');
    }

    // ⚠️ جديد: لاعب جديد ينضم أثناء دورة شغّالة ← يزيد عدد الكراسي تلقائياً
    // (نفس منطق حساب عدد الكراسي بالدورة، بس مطبَّق على العدد الجديد للأحياء)
    // بدون ما نلمس مواقع/أرقام الكراسي الموجودة أصلاً (نضيف بس الكرسي
    // الناقص كعنصر جديد، حتى ما نحرّك كرسي لاعب قاعد عليه فعلاً).
    function addChairsIfNeeded() {
        if (!_matchActive || _chairs.length === 0) return;
        var mode = liveSettings().chairDeficitMode || 'auto';
        var targetCount = (mode === 'custom')
            ? Math.max(1, _alive.length - _roundDeficit)
            : Math.max(1, _alive.length - 1);

        if (targetCount <= _chairs.length) return;

        var used = usedChairNumbers();
        var newTotal = targetCount;
        var ring = el('mc-chairs-ring');
        var showRevealed = _selectionOpen; // لو الاختيار شغّال أصلاً، الكرسي الجديد يطلع مكشوف فوراً

        while (_chairs.length < newTotal) {
            var idx = _chairs.length;
            var pos = angleToXY((360 / newTotal) * idx, 32);
            var chair = { number: randomFreeChairNumber(used), x: pos.x, y: pos.y, occupantId: null };
            _chairs.push(chair);

            if (ring) {
                var div = document.createElement('div');
                div.className = 'mc-chair' + (showRevealed ? ' mc-chair-revealed' : '');
                div.id = 'mc-chair-' + idx;
                div.style.left = chair.x + '%';
                div.style.top = chair.y + '%';
                div.innerHTML = chairSvg(idx) + '<span class="mc-chair-number">' + chair.number + '</span>';
                ring.appendChild(div);
            }
        }
        updateBadges();
    }

    function playerBaseAngle(index, total) { return (360 / total) * index; }

    function renderPlayersRing() {
        var ring = el('mc-players-ring');
        if (!ring) return;
        ring.innerHTML = _alive.map(function (p, idx) {
            var angle = playerBaseAngle(idx, _alive.length);
            _playerAngle[p.id] = angle;
            var pos = angleToXY(angle, 46);
            return '<div class="mc-avatar" id="mc-avatar-' + escapeHtml(p.id) + '" data-player-id="' + escapeHtml(p.id) + '" ' +
                'style="left:' + pos.x + '%;top:' + pos.y + '%;">' + avatarInnerHtml(p) + '</div>';
        }).join('');
    }

    /* ======================================================================
     *  6) الدوران
     * ==================================================================== */
    function startRingLoop() {
        stopRingLoop();
        _ringSpinning = true;
        _ringTimer = setInterval(function () {
            _ringRotation = (_ringRotation + ROTATION_DEG_PER_SEC * (RING_TICK_MS / 1000)) % 360;
            _alive.forEach(function (p, idx) {
                if (_seatedThisRound[p.id]) return;
                var base = playerBaseAngle(idx, _alive.length);
                var angle = (base + _ringRotation) % 360;
                _playerAngle[p.id] = angle;
                var pos = angleToXY(angle, 46);
                var elAvatar = el('mc-avatar-' + p.id);
                if (elAvatar) { elAvatar.style.left = pos.x + '%'; elAvatar.style.top = pos.y + '%'; }
            });
        }, RING_TICK_MS);
    }

    function stopRingLoop() {
        _ringSpinning = false;
        if (_ringTimer) { clearInterval(_ringTimer); _ringTimer = null; }
    }

    /* ======================================================================
     *  6ب) زر التدوير اليدوي — مدة طبيعية 12 ثانية + إمكانية إيقاف مبكر يدوي
     * ==================================================================== */
    function handleSpinButtonClick() {
        if (_spinState === 'idle') startSpinPhase();
        else if (_spinState === 'spinning') stopSpinAndReveal(); // إيقاف مبكر يدوي
    }

    function startSpinPhase() {
        _spinState = 'spinning';
        var btn = el('mc-spin-btn');
        if (btn) { btn.textContent = '⏸️ إيقاف'; btn.classList.add('mc-spin-btn-active'); }

        renderRoundBanner('spinning');
        startRingLoop();
        startMusic();

        _spinTimeoutId = window.setTimeout(stopSpinAndReveal, SPIN_DURATION_MS);
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
            var n = parseInt(payload.text.trim(), 10);
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

    function claimChair(player, chairIdx) {
        var chair = _chairs[chairIdx];
        chair.occupantId = player.id;
        _seatedThisRound[player.id] = true;

        var chairEl = el('mc-chair-' + chairIdx);
        if (chairEl) chairEl.classList.add('mc-chair-taken');

        var avatarEl = el('mc-avatar-' + player.id);
        if (avatarEl) {
            avatarEl.classList.add('mc-avatar-seating');
            avatarEl.style.left = chair.x + '%';
            avatarEl.style.top = chair.y + '%';
            window.setTimeout(function () { avatarEl.classList.add('mc-avatar-safe'); }, 480);
        }

        playSound('claim');

        // ⚠️ إصلاح باگ حقيقي: الشرط القديم كان يتحقق فقط لو "كل اللاعبين
        // الأحياء" لقوا كراسي — شي يكاد يستحيل يصير لأن الكراسي دايماً
        // أقل من اللاعبين بالتصميم (فيه عجز دايماً ≥1)، فكان العدّاد
        // يكمل لآخر وقته دايماً حتى لو خلصت كل الكراسي الفاضية من زمان.
        // الصح: أول ما تنحجز آخر كرسي فاضي (بغض النظر عن عدد اللاعبين
        // المتبقين بدون كرسي)، تنتهي الدورة فوراً وتبدأ الإقصاء مباشرة.
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
            _roundDeficit = deficit; // ⚠️ نحفظ العجز المستخدَم فعلياً بهذي الدورة (يلزم addChairsIfNeeded)
            var count = Math.max(1, aliveCount - deficit);
            _customDeficitCurrent = Math.max(1, deficit - 1);
            return count;
        }
        _roundDeficit = 1;
        return Math.max(1, aliveCount - 1);
    }

    // ⚠️ تعديل جوهري: ما تبدأ الدوران تلقائياً بعد الآن — فقط تجهّز الحلبة
    // (كراسي + لاعبون بوضع ثابت) وتفعّل زر "تدوير" وتنتظر ضغطة الاستريمر.
    function runNextRound() {
        if (!_matchActive) return;
        if (_alive.length <= 1) { endMatch(_alive[0] || null); return; }

        _roundNumber++;
        _seatedThisRound = {};
        var chairCount = computeChairCount();
        _chairs = buildChairs(chairCount);

        renderRoundBanner('ready');
        renderChairsRing();
        renderPlayersRing();
        updateBadges();
        el('mc-countdown').textContent = '';
        el('mc-countdown').className = '';
        el('mc-spin-countdown').textContent = '';

        _spinState = 'idle';
        var btn = el('mc-spin-btn');
        if (btn) { btn.disabled = false; btn.textContent = '▶️ تدوير'; btn.classList.remove('mc-spin-btn-active'); }
    }

    function renderRoundBanner(phase) {
        var numEl = el('mc-round-num');
        var subEl = el('mc-round-sub');
        if (!numEl || !subEl) return;
        numEl.textContent = 'الدورة ' + _roundNumber;
        if (phase === 'ready') subEl.textContent = '🎯 اضغط "تدوير" وقت ما تجهز';
        else if (phase === 'spinning') subEl.textContent = '🎶 الموسيقى شغّالة... استعدوا!';
        else if (phase === 'selecting') subEl.textContent = 'اكتبوا رقم الكرسي بالشات';
        else if (phase === 'eliminating') subEl.textContent = 'جارِ الإقصاء...';
    }

    function stopSpinAndReveal() {
        if (_spinTimeoutId) { clearTimeout(_spinTimeoutId); _spinTimeoutId = null; }
        stopRingLoop();
        stopMusic(); // ⚠️ الصوت يتوقف فوراً لحظة توقف الكراسي — طلب صريح

        _spinState = 'idle';
        var btn = el('mc-spin-btn');
        if (btn) { btn.disabled = true; btn.textContent = '▶️ تدوير'; btn.classList.remove('mc-spin-btn-active'); }

        _chairs.forEach(function (c, idx) {
            var chairEl = el('mc-chair-' + idx);
            if (chairEl) chairEl.classList.add('mc-chair-revealed');
        });
        playSound('reveal');

        var settings = liveSettings();
        var seconds = settings.selectionTimerSeconds || 15;
        renderRoundBanner('selecting');

        _selectionOpen = true;
        wireCommentListener();
        wireTimerListeners();
        AGP.timerManager.start(TIMER_NAME, seconds);
    }

    function wireTimerListeners() {
        unwireTimerListeners();
        _timerTickUnsub = AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            var cd = el('mc-countdown');
            var spinCd = el('mc-spin-countdown'); // ⚠️ نفس العدّاد يظهر بجانب زر التدوير أيضاً — طلب صريح
            if (cd) cd.textContent = '⏱️ ' + payload.remainingSeconds + ' ثانية';
            if (spinCd) spinCd.textContent = '⏱️ ' + payload.remainingSeconds;
            if (payload.remainingSeconds <= 5 && payload.remainingSeconds > 0) {
                if (cd) cd.classList.add('mc-countdown-warn');
                playSound('warning');
            }
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

    function finishSelectionWindow() {
        if (!_selectionOpen) return;
        _selectionOpen = false;
        unwireCommentListener();
        unwireTimerListeners();
        el('mc-countdown').textContent = '';
        el('mc-spin-countdown').textContent = '';

        var losers = _alive.filter(function (p) { return !_seatedThisRound[p.id]; });
        renderRoundBanner('eliminating');

        if (losers.length === 0) {
            window.setTimeout(runNextRound, NEXT_ROUND_DELAY_MS);
            return;
        }
        eliminateSequentially(losers, 0);
    }

    /* ======================================================================
     *  9) الإقصاء بأنيميشن متتابع
     * ==================================================================== */
    function eliminateSequentially(losers, idx) {
        if (idx >= losers.length) {
            window.setTimeout(function () {
                updateBadges();
                if (_alive.length <= 1) endMatch(_alive[0] || null);
                else window.setTimeout(runNextRound, NEXT_ROUND_DELAY_MS - 700);
            }, 300);
            return;
        }
        var player = losers[idx];
        var avatarEl = el('mc-avatar-' + player.id);
        if (avatarEl) avatarEl.classList.add('mc-avatar-out');
        playSound('eliminate');

        window.setTimeout(function () {
            if (avatarEl) avatarEl.remove();
            var aliveIdx = _alive.findIndex(function (p) { return p.id === player.id; });
            if (aliveIdx !== -1) _alive.splice(aliveIdx, 1);
            _eliminated.push({ player: player, round: _roundNumber });
            eliminateSequentially(losers, idx + 1);
        }, ELIMINATE_STAGGER_MS);
    }

    /* ======================================================================
     *  10) حذف/انضمام لاعب أثناء المباراة
     * ==================================================================== */
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;
        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) {
            _alive.splice(aliveIdx, 1);
            var avatarEl = el('mc-avatar-' + removedPlayer.id);
            if (avatarEl) avatarEl.remove();
            updateBadges();
            if (_matchActive && _alive.length <= 1) {
                window.setTimeout(function () { endMatch(_alive[0] || null); }, 400);
            }
        }
        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);
    }

    // ⚠️ تعديل: اللاعب الجديد يظهر بعجلة الكراسي فوراً وقت انضمامه (مو
    // بالدورة الجاية بس) — طلب صريح. نحسب له موقعه الحالي (يراعي دوران
    // الحلقة لو شغّالة وقتها) ونضيف عنصره للـDOM مباشرة بأنيميشن ظهور.
    function handlePlayerJoined(newPlayer) {
        if (!_matchActive || !newPlayer || !newPlayer.id) return;
        var already = _alive.some(function (p) { return p.id === newPlayer.id; }) ||
            _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (already) return;

        _alive.push(newPlayer);
        updateBadges();
        showToast('➕ ' + playerLabel(newPlayer) + ' انضم للمباراة');

        var ring = el('mc-players-ring');
        if (!ring) return;
        var idx = _alive.length - 1;
        var base = playerBaseAngle(idx, _alive.length);
        var angle = (base + (_ringSpinning ? _ringRotation : 0)) % 360;
        _playerAngle[newPlayer.id] = angle;
        var pos = angleToXY(angle, 46);

        var div = document.createElement('div');
        div.className = 'mc-avatar mc-avatar-joining';
        div.id = 'mc-avatar-' + newPlayer.id;
        div.setAttribute('data-player-id', newPlayer.id);
        div.style.left = pos.x + '%';
        div.style.top = pos.y + '%';
        div.innerHTML = avatarInnerHtml(newPlayer);
        ring.appendChild(div);

        addChairsIfNeeded(); // ⚠️ جديد: يزيد عدد الكراسي فوراً لو انضم لاعب أثناء دورة شغّالة
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
     *  11) بدء المباراة (onStartRound من الشل)
     * ==================================================================== */
    function handleStartRound(settingsValues) {
        resetMatchState();
        _settings = settingsValues;
        _alive = AGP.gameManager.getPlayers().slice();
        _customDeficitCurrent = settingsValues.customDeficitStart || 5;
        _startedAt = Date.now();
        _matchActive = true;

        ensureScaffolding();
        runNextRound();
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
        pointsPromise.then(function (pointsResult) { renderWinnerScreen(winner, pointsResult); });
    }

    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }

    // ⚠️ فيديو الاحتفال (250×250، حدود بلون الفيديو #4d0008 + توهج نابض)
    // يشتغل مباشرة مع بطاقة الفائز بنفس الشاشة — طلب صريح.
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
        box.className = '';
        var awarded = winner ? findAwardedFor(pointsResult, winner) : null;
        var pointsHtml = awarded ? '<div class="mc-winner-points">+' + awarded.points + ' نقطة 🎉</div>' : '';

        box.innerHTML =
            '<h2>🏆 انتهت المباراة</h2>' +
            (winner ? winnerVideoHtml() : '') +
            (winner
                ? '<div class="mc-winner-card">' +
                  '<img class="mc-winner-avatar" src="' + escapeHtml(winner.avatarUrl || '') + '" onerror="this.style.display=\'none\';" alt="">' +
                  '<div class="mc-winner-name">' + escapeHtml(playerLabel(winner)) + '</div>' +
                  '<div>👑 آخر لاعب على كرسي!</div>' + pointsHtml +
                  '</div>'
                : '<p class="agp-shell-status" style="text-align:center;">ما فيه فائز واضح لهذي المباراة.</p>') +
            '<div class="mc-winner-actions">' +
            '<button class="agp-shell-btn-connect mc-winner-action-btn" id="mc-new-match-btn">🔄 مباراة جديدة</button>' +
            '<button class="agp-shell-btn-connect mc-winner-action-btn" id="mc-replay-same-btn">🔁 إعادة المباراة (نفس اللاعبين)</button>' +
            '</div>';

        box.id = 'agp-shell-box';
        overlay.style.display = 'flex';

        if (winner) wireWinnerVideo();
        document.getElementById('mc-new-match-btn').onclick = function () { window.location.reload(); };
        // ⚠️ جديد: إعادة المباراة بنفس قائمة اللاعبين المسجَّلين أصلاً
        // (بدون رجوع لشاشة الاتصال/اللوبي — نفس فلسفة "إعادة اللعب بنفس
        // اللاعبين" الموجودة بروليت الإقصاء).
        document.getElementById('mc-replay-same-btn').onclick = function () {
            overlay.style.display = 'none';
            resetMatchState();
            _alive = AGP.gameManager.getPlayers().slice();
            _customDeficitCurrent = (liveSettings().customDeficitStart) || 5;
            _startedAt = Date.now();
            _matchActive = true;
            runNextRound();
        };
    }

    /* ======================================================================
     *  13) تسجيل اللعبة بالمنصة
     * ==================================================================== */
    function registerGame() {
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
            settingsTitle: 'إعدادات مباراة الكراسي الموسيقية',
            gameExplanation: 'تدور الأفاتارات حول حلقة الكراسي وقت ما تضغط "تدوير" (12 ثانية، أو توقفها يدوياً قبل ' +
                'لو تبي)، وفجأة تتوقف وتظهر أرقام على كل كرسي. كل لاعب يكتب رقم الكرسي اللي يبيه بالشات — أول وحد ' +
                'يكتب الرقم الصحيح يفوز فيه. أي لاعب ما يلقى كرسي يُقصى فوراً. عدد الكراسي ينقص كل دورة (تلقائي أو ' +
                'مخصّص حسب اختيار الاستريمر) لين يبقى لاعب واحد فقط — هو الفائز!',
            connectButtonLabel: 'اتصال بالبث وبدء الإعدادات',
            minPlayersToStart: 3,
            logoImage: '../../logo.png',
            homeUrl: '../../index.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
