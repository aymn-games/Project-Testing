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
 * ⚠️ ملاحظة صادقة (بنفس نمط باقي الألعاب): أصوات اللعبة الخمسة
 *   (reveal/claim/eliminate/warning/winner) مُولَّدة برمجياً (نغمات بسيطة
 *   عبر Python/numpy)، وليست مكتبة أصوات احترافية جاهزة — بديل عملي متاح
 *   فوراً، يمكن استبدالها بأي ملفات صوت حقيقية بنفس الأسماء داخل مجلد
 *   sounds/ وقتما تجهز.
 *
 * ملخص الآلية:
 *   - كل "دورة" (Round): حلقة اللاعبين تدور حول حلقة كراسي لمدة عشوائية
 *     قصيرة، ثم تتوقف الموسيقى وتظهر أرقام عشوائية (10–99) على الكراسي.
 *   - كل لاعب حي يكتب رقم كرسي بالشات؛ أول رقم صحيح يوصل لكرسي فاضي
 *     يثبَّت عليه فوراً (أي محاولة بعدها لنفس الكرسي أو من نفس اللاعب
 *     تُتجاهل تماماً).
 *   - عند انتهاء مهلة الاختيار (أو لو الكل لقى كرسي قبلها)، أي لاعب حي
 *     بدون كرسي يُقصى بأنيميشن متتابع (لاعب تلو الآخر) + صوت إقصاء.
 *   - عدد الكراسي كل دورة: وضعان يحددهما الاستريمر —
 *       "تلقائي": دائماً (عدد اللاعبين المتبقين − 1).
 *       "مخصّص": يبدأ بعجز يحدده الاستريمر (مثلاً 5)، وينقص واحد كل
 *       دورة (5 ثم 4 ثم 3...) لين يثبت عند 1.
 *   - تستمر الدورات تلقائياً (بدون أي تدخل يدوي لكل دورة) لين يبقى لاعب
 *     واحد = الفائز.
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

    var MIN_SPIN_MS = 4200;
    var MAX_SPIN_MS = 7800;
    var ROTATION_DEG_PER_SEC = 22;
    var RING_TICK_MS = 90;
    var ELIMINATE_STAGGER_MS = 550;
    var NEXT_ROUND_DELAY_MS = 2600;

    /* ======================================================================
     *  0) الصوت — خمسة مقاطع مولَّدة برمجياً (راجع الملاحظة الصادقة أعلى
     *     الملف) + مستوى صوت قابل للتعديل حياً من الإعدادات (نفس حقل
     *     soundVolume المستخدم بروليت الإقصاء).
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
            if (p && typeof p.catch === 'function') {
                p.catch(function () { /* المتصفح يمنع أحياناً تشغيلاً تلقائياً قبل أول تفاعل مستخدم — تجاهل صامت */ });
            }
        } catch (e) { /* تجاهل صامت — الصوت طبقة تحسين، لا يوقف اللعبة */ }
    }

    /* ======================================================================
     *  1) حالة المباراة الداخلية (محلية بالكامل لهذا الملف — نفس فلسفة
     *     _alive/_eliminated بروليت الإقصاء، اللاعب يبقى مسجَّلاً بالمنصة،
     *     فقط يُحذف من قوائمنا المحلية).
     * ==================================================================== */
    var _settings = {};
    var _matchActive = false;
    var _startedAt = 0;
    var _alive = [];            // [player]
    var _eliminated = [];       // [{player, round}]
    var _roundNumber = 0;
    var _customDeficitCurrent = 1;

    var _chairs = [];           // [{number, x, y, occupantId}]
    var _seatedThisRound = {};  // playerId -> true
    var _playerAngle = {};      // playerId -> آخر زاوية معروفة بالحلقة (درجات)

    var _ringTimer = null;
    var _ringRotation = 0;
    var _spinTimeoutId = null;
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
     *  2) حقول شاشة الإعدادات (نفس عقد js/agp-game-shell.js تماماً)
     * ==================================================================== */
    function buildSettingsFields() {
        return [
            {
                key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى لعدد اللاعبين بالمباراة',
                min: 3, default: 24
            },
            {
                key: 'followersOnly', type: 'pill-choice', label: '🔑 مين يقدر يدخل؟',
                options: [
                    { label: 'الكل', value: false },
                    { label: 'المتابعون فقط', value: true }
                ],
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
                min: 1, default: 5,
                showWhen: { key: 'chairDeficitMode', equals: 'custom' }
            },
            {
                key: 'selectionTimerSeconds', type: 'pill-group', label: '⏱️ مهلة اختيار الكرسي',
                options: SELECTION_TIMER_OPTIONS, default: 15
            },
            {
                key: 'soundVolume', type: 'slider', label: '🔊 مستوى الصوت',
                min: 0, max: 10, default: 7, onlyMidMatch: true
            }
        ];
    }

    /* ======================================================================
     *  3) الأنماط — لون أساسي (بنفسج المنصة الرسمي var(--agp-accent)) +
     *     لونان ثانويان: السماوي الرسمي var(--agp-accent-2) للحلقة/الحركة،
     *     وذهبي/كهرماني جديد (--mc-gold) خاص بتصميم الكراسي نفسها — حتى
     *     تكون هوية اللعبة مميزة بصرياً عن باقي ألعاب الإقصاء، مع بقاء
     *     الأساس مطابقاً تماماً لهوية المنصة (راجع docs/UI_GUIDELINES.md).
     * ==================================================================== */
    function injectStageStyles() {
        if (el('mc-stage-styles')) return;
        var style = document.createElement('style');
        style.id = 'mc-stage-styles';
        style.textContent = [
            ':root{--mc-gold:#ffb020;--mc-gold-2:#ff7a3d;--mc-danger:#ff4d6a;}',

            '#mc-stage{position:fixed;inset:0;padding-top:78px;display:flex;flex-direction:column;',
            'align-items:center;z-index:10;font-family:Cairo,sans-serif;direction:rtl;}',

            '#mc-round-banner{margin:6px 0 4px;text-align:center;color:#fff;}',
            '#mc-round-banner .mc-round-num{font-family:"Cairo Play",Cairo,sans-serif;font-weight:900;',
            'font-size:1.35em;background:linear-gradient(90deg,var(--agp-accent-2),var(--mc-gold));',
            '-webkit-background-clip:text;background-clip:text;color:transparent;}',
            '#mc-round-banner .mc-round-sub{font-size:0.85em;color:#d9c3ef;margin-top:2px;}',

            '#mc-countdown{margin-top:2px;font-weight:800;font-size:1.05em;color:var(--mc-gold);',
            'min-height:1.4em;display:flex;align-items:center;justify-content:center;gap:6px;}',
            '#mc-countdown.mc-countdown-warn{color:var(--mc-danger);}',

            '#mc-circle-wrap{position:relative;width:min(62vw,600px);height:min(62vw,600px);',
            'min-width:320px;min-height:320px;margin:10px auto;}',
            '#mc-circle-glow{position:absolute;inset:8%;border-radius:50%;',
            'background:radial-gradient(circle,rgba(124,58,237,0.28),transparent 70%);pointer-events:none;}',
            '#mc-circle-track{position:absolute;inset:0;border-radius:50%;',
            'border:2px dashed rgba(0,194,255,0.25);pointer-events:none;}',
            '#mc-chairs-ring{position:absolute;inset:0;}',
            '#mc-players-ring{position:absolute;inset:0;}',

            '.mc-chair{position:absolute;width:15%;height:15%;transform:translate(-50%,-50%);',
            'display:flex;align-items:center;justify-content:center;}',
            '.mc-chair-svg{width:100%;height:100%;filter:drop-shadow(0 0 8px rgba(255,176,32,0.55));',
            'transition:filter .25s;}',
            '.mc-chair.mc-chair-taken .mc-chair-svg{filter:drop-shadow(0 0 14px rgba(124,58,237,0.9));}',
            '.mc-chair-number{position:absolute;top:6%;left:50%;transform:translateX(-50%) scale(0);',
            'background:linear-gradient(180deg,var(--mc-gold),var(--mc-gold-2));color:#3a1a00;',
            'font-weight:900;font-size:0.95em;border-radius:999px;padding:2px 9px;',
            'box-shadow:0 0 10px rgba(255,176,32,0.8);transition:transform .35s cubic-bezier(.34,1.56,.64,1);}',
            '.mc-chair.mc-chair-revealed .mc-chair-number{transform:translateX(-50%) scale(1);}',
            '.mc-chair.mc-chair-taken .mc-chair-number{background:linear-gradient(180deg,var(--agp-accent-2),var(--agp-accent));',
            'color:#fff;}',

            '.mc-avatar{position:absolute;width:11%;height:11%;transform:translate(-50%,-50%);',
            'display:flex;align-items:center;justify-content:center;transition:left .1s linear,top .1s linear;}',
            '.mc-avatar.mc-avatar-seating{transition:left .5s cubic-bezier(.34,1.56,.64,1),top .5s cubic-bezier(.34,1.56,.64,1);}',
            '.mc-avatar-img,.mc-avatar-fallback{width:100%;height:100%;border-radius:50%;object-fit:cover;',
            'border:2px solid var(--agp-accent-2);box-shadow:0 0 10px rgba(0,194,255,0.55);background:#2c1240;}',
            '.mc-avatar-fallback{display:flex;align-items:center;justify-content:center;color:#fff;',
            'font-weight:800;font-size:0.85em;}',
            '.mc-avatar-name{position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);',
            'font-size:0.62em;color:#f3eefc;background:rgba(8,4,16,0.65);padding:1px 6px;border-radius:999px;',
            'white-space:nowrap;max-width:70px;overflow:hidden;text-overflow:ellipsis;}',
            '.mc-avatar.mc-avatar-safe .mc-avatar-img,.mc-avatar.mc-avatar-safe .mc-avatar-fallback{',
            'border-color:#2fbf71;box-shadow:0 0 12px rgba(47,191,113,0.85);}',
            '@keyframes mcSeatPop{0%{transform:translate(-50%,-50%) scale(1);}',
            '45%{transform:translate(-50%,-50%) scale(1.28);}100%{transform:translate(-50%,-50%) scale(1);}}',
            '.mc-avatar.mc-avatar-safe{animation:mcSeatPop .4s ease;}',
            '@keyframes mcShakeOut{0%{transform:translate(-50%,-50%) rotate(0) scale(1);opacity:1;}',
            '20%{transform:translate(-50%,-50%) rotate(-14deg) scale(1.05);}',
            '40%{transform:translate(-50%,-50%) rotate(12deg) scale(1.05);}',
            '60%{transform:translate(-50%,-50%) rotate(-10deg) scale(0.95);}',
            '100%{transform:translate(-50%,-50%) translateY(40px) rotate(20deg) scale(0.35);opacity:0;}}',
            '.mc-avatar.mc-avatar-out{animation:mcShakeOut .6s ease forwards;',
            'filter:grayscale(1) drop-shadow(0 0 14px rgba(255,77,106,0.9));}',

            '#mc-toast-wrap{position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:99996;',
            'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;}',
            '.mc-toast{background:rgba(20,8,35,0.92);border:1px solid var(--mc-gold);color:#fff;',
            'padding:8px 18px;border-radius:999px;font-size:0.85em;font-weight:700;',
            'box-shadow:0 0 14px rgba(255,176,32,0.4);animation:mcToastIn .25s ease;}',
            '@keyframes mcToastIn{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}',

            '#mc-event-log{position:fixed;left:0;top:70px;bottom:0;width:230px;max-width:88vw;',
            'box-sizing:border-box;padding:14px 16px;overflow-y:auto;background:rgba(12,6,22,0.55);',
            'border-inline-end:1px solid rgba(156,143,176,0.25);z-index:9;font-family:Cairo,sans-serif;',
            'direction:rtl;}',
            '#mc-event-log h3{margin:0 0 10px;font-size:0.9em;font-weight:800;color:#e9d3ff;}',
            '.mc-event-item{display:flex;align-items:flex-start;gap:8px;font-size:0.78em;color:#f3eefc;',
            'background:rgba(255,255,255,0.05);border-radius:10px;padding:6px 10px;margin-bottom:6px;line-height:1.5;}',

            /* شاشة الفائز */
            '#mc-winner-box h2{background:linear-gradient(90deg,var(--mc-gold),var(--agp-accent-2));',
            '-webkit-background-clip:text;background-clip:text;color:transparent;}',
            '.mc-winner-card{display:flex;flex-direction:column;align-items:center;gap:10px;',
            'padding:18px;border-radius:16px;background:rgba(255,255,255,0.06);',
            'border:1px solid var(--mc-gold);margin:14px 0;}',
            '.mc-winner-avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;',
            'border:3px solid var(--mc-gold);box-shadow:0 0 22px rgba(255,176,32,0.7);}',
            '.mc-winner-name{font-weight:900;font-size:1.2em;color:#fff;}',
            '.mc-winner-points{color:var(--mc-gold);font-weight:800;font-size:0.9em;}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  4) بناء الحلبة (Scaffolding) — نفس فلسفة ensureScaffolding بروليت
     *     الإقصاء: عناصر ثابتة تُبنى مرة واحدة، ثم تُحدَّث محتوياتها فقط.
     * ==================================================================== */
    function ensureScaffolding() {
        injectStageStyles();
        if (!el('mc-toast-wrap')) {
            var toastWrap = document.createElement('div');
            toastWrap.id = 'mc-toast-wrap';
            document.body.appendChild(toastWrap);
        }
        if (!el('mc-event-log')) {
            var log = document.createElement('div');
            log.id = 'mc-event-log';
            log.innerHTML = '<h3>📋 أحداث المباراة</h3><div id="mc-event-log-items"></div>';
            document.body.appendChild(log);
        }
        if (!el('mc-stage')) {
            var stage = document.createElement('div');
            stage.id = 'mc-stage';
            stage.innerHTML =
                '<div id="mc-round-banner"><div class="mc-round-num" id="mc-round-num"></div>' +
                '<div class="mc-round-sub" id="mc-round-sub"></div></div>' +
                '<div id="mc-countdown"></div>' +
                '<div id="mc-circle-wrap">' +
                '<div id="mc-circle-glow"></div>' +
                '<div id="mc-circle-track"></div>' +
                '<div id="mc-chairs-ring"></div>' +
                '<div id="mc-players-ring"></div>' +
                '</div>';
            document.body.appendChild(stage);
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

    function logEvent(icon, text) {
        var wrap = el('mc-event-log-items');
        if (!wrap) return;
        var item = document.createElement('div');
        item.className = 'mc-event-item';
        item.innerHTML = '<span>' + icon + '</span><span>' + escapeHtml(text) + '</span>';
        wrap.insertBefore(item, wrap.firstChild);
        while (wrap.children.length > 40) wrap.removeChild(wrap.lastChild);
    }

    /* ======================================================================
     *  5) رسم الكراسي واللاعبين على الحلبة — كل الحسابات بالنسب المئوية
     *     (لا JS resize يدوي) حتى تتجاوب الحلبة تلقائياً مع حجم الشاشة.
     * ==================================================================== */
    function angleToXY(angleDeg, radiusPct) {
        var rad = (angleDeg - 90) * Math.PI / 180; // 0deg = أعلى الحلبة
        return {
            x: 50 + radiusPct * Math.cos(rad),
            y: 50 + radiusPct * Math.sin(rad)
        };
    }

    function chairSvg() {
        // كرسي مصمَّم بالكامل SVG (لا صور خارجية) — لون ذهبي/كهرماني مميز
        // للعبة، يتوهّج بالـCSS (drop-shadow) بدل تلوين ثابت بالملف نفسه.
        return '<svg class="mc-chair-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
            '<defs><linearGradient id="mcChairGrad" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#ffd166"/><stop offset="100%" stop-color="#ffb020"/>' +
            '</linearGradient></defs>' +
            '<rect x="14" y="6" width="30" height="8" rx="3" fill="url(#mcChairGrad)"/>' +
            '<rect x="14" y="14" width="8" height="26" rx="2" fill="url(#mcChairGrad)" opacity="0.9"/>' +
            '<rect x="10" y="26" width="38" height="9" rx="3" fill="url(#mcChairGrad)"/>' +
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

    function buildChairs(count) {
        var used = {};
        var chairs = [];
        for (var i = 0; i < count; i++) {
            var num;
            do { num = 10 + Math.floor(Math.random() * 90); } while (used[num]);
            used[num] = true;
            var pos = angleToXY((360 / count) * i, 32);
            chairs.push({ number: num, x: pos.x, y: pos.y, occupantId: null });
        }
        return chairs;
    }

    function renderChairsRing() {
        var ring = el('mc-chairs-ring');
        if (!ring) return;
        ring.innerHTML = _chairs.map(function (chair, idx) {
            return '<div class="mc-chair" id="mc-chair-' + idx + '" style="left:' + chair.x + '%;top:' + chair.y + '%;">' +
                chairSvg() +
                '<span class="mc-chair-number">' + chair.number + '</span>' +
                '</div>';
        }).join('');
    }

    function playerBaseAngle(index, total) {
        return (360 / total) * index;
    }

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
     *  6) الدوران — تحديث زوايا اللاعبين دورياً (setInterval خفيف، لا
     *     CSS keyframes) حتى نعرف بالضبط زاوية كل لاعب لحظة توقف الموسيقى،
     *     وحتى يبقى كل أفتار مستقيماً (بدون دوران ذاتي) طول الوقت.
     * ==================================================================== */
    function startRingLoop() {
        stopRingLoop();
        _ringTimer = setInterval(function () {
            _ringRotation = (_ringRotation + ROTATION_DEG_PER_SEC * (RING_TICK_MS / 1000)) % 360;
            _alive.forEach(function (p, idx) {
                if (_seatedThisRound[p.id]) return; // لاعب لقى كرسي فعلاً — يبقى ثابتاً فوق كرسيه
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
        if (_ringTimer) { clearInterval(_ringTimer); _ringTimer = null; }
    }

    /* ======================================================================
     *  7) الاستماع لشات البث — كل اللاعبين الأحياء يكتبون بنفس الوقت
     *     (بعكس روليت الإقصاء/الفواكه اللي فيها صاحب دور واحد فقط)
     * ==================================================================== */
    function wireCommentListener() {
        unwireCommentListener();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_selectionOpen || !payload || typeof payload.text !== 'string') return;

            var player = findAlivePlayer(payload.id, payload.name);
            if (!player) return;
            if (_seatedThisRound[player.id]) return; // لقى كرسي فعلاً هالدورة — يُتجاهل أي رقم ثاني منه

            var n = parseInt(payload.text.trim(), 10);
            if (isNaN(n)) return;

            var chairIdx = _chairs.findIndex(function (c) { return c.number === n && !c.occupantId; });
            if (chairIdx === -1) return; // رقم غير موجود، أو الكرسي محجوز فعلاً من غيره

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
        logEvent('🪑', playerLabel(player) + ' لقى كرسي رقم ' + chair.number);

        // كل اللاعبين لقوا كراسي قبل ما تخلص المهلة؟ نقفل الاختيار فوراً
        // بدل الانتظار — نفس روح "النظام تلقائي ينفذ".
        var unseatedLeft = _alive.filter(function (p) { return !_seatedThisRound[p.id]; }).length;
        if (unseatedLeft === 0) {
            AGP.timerManager.stop(TIMER_NAME);
            window.setTimeout(finishSelectionWindow, 500);
        }
    }

    /* ======================================================================
     *  8) دورة كاملة: دوران → توقف → ظهور أرقام → مهلة اختيار → إقصاء
     * ==================================================================== */
    function computeChairCount() {
        var mode = liveSettings().chairDeficitMode || 'auto';
        var aliveCount = _alive.length;

        if (mode === 'custom') {
            var deficit = _customDeficitCurrent;
            var count = Math.max(1, aliveCount - deficit);
            _customDeficitCurrent = Math.max(1, deficit - 1); // يُستخدَم بالدورة القادمة
            return count;
        }
        return Math.max(1, aliveCount - 1);
    }

    function runNextRound() {
        if (!_matchActive) return;
        if (_alive.length <= 1) { endMatch(_alive[0] || null); return; }

        _roundNumber++;
        _seatedThisRound = {};
        var chairCount = computeChairCount();
        _chairs = buildChairs(chairCount);

        renderRoundBanner('spinning', chairCount);
        renderChairsRing();
        renderPlayersRing();
        el('mc-countdown').textContent = '';
        el('mc-countdown').className = '';

        logEvent('🎵', 'دورة ' + _roundNumber + ' بدأت — ' + chairCount + ' كرسي لـ' + _alive.length + ' لاعبين');

        startRingLoop();
        var spinMs = MIN_SPIN_MS + Math.random() * (MAX_SPIN_MS - MIN_SPIN_MS);
        _spinTimeoutId = window.setTimeout(stopSpinAndReveal, spinMs);
    }

    function renderRoundBanner(phase, chairCount) {
        var numEl = el('mc-round-num');
        var subEl = el('mc-round-sub');
        if (!numEl || !subEl) return;
        numEl.textContent = 'الدورة ' + _roundNumber;
        if (phase === 'spinning') subEl.textContent = '🎶 الموسيقى شغّالة... استعدوا!';
        else if (phase === 'selecting') subEl.textContent = 'اكتبوا رقم الكرسي بالشات — ' + chairCount + ' كرسي متاح';
        else if (phase === 'eliminating') subEl.textContent = 'جارِ الإقصاء...';
    }

    function stopSpinAndReveal() {
        stopRingLoop();
        _spinTimeoutId = null;

        _chairs.forEach(function (c, idx) {
            var chairEl = el('mc-chair-' + idx);
            if (chairEl) chairEl.classList.add('mc-chair-revealed');
        });
        playSound('reveal');

        var settings = liveSettings();
        var seconds = settings.selectionTimerSeconds || 15;
        renderRoundBanner('selecting', _chairs.length);

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
            if (!cd) return;
            cd.textContent = '⏱️ ' + payload.remainingSeconds + ' ثانية';
            if (payload.remainingSeconds <= 5 && payload.remainingSeconds > 0) {
                cd.classList.add('mc-countdown-warn');
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
        if (!_selectionOpen) return; // منع التنفيذ مرتين (تصفير مبكر + انتهاء طبيعي بنفس اللحظة)
        _selectionOpen = false;
        unwireCommentListener();
        unwireTimerListeners();
        el('mc-countdown').textContent = '';

        var losers = _alive.filter(function (p) { return !_seatedThisRound[p.id]; });
        renderRoundBanner('eliminating', 0);

        if (losers.length === 0) {
            // احتياط نظري فقط (عدد الكراسي دائماً أقل من عدد اللاعبين) —
            // لو صار بأي ظرف، نكمل للدورة القادمة مباشرة بدون إقصاء.
            window.setTimeout(runNextRound, NEXT_ROUND_DELAY_MS);
            return;
        }

        eliminateSequentially(losers, 0);
    }

    /* ======================================================================
     *  9) الإقصاء بأنيميشن متتابع — لاعب تلو الآخر + صوت لكل واحد
     * ==================================================================== */
    function eliminateSequentially(losers, idx) {
        if (idx >= losers.length) {
            window.setTimeout(function () {
                if (_alive.length <= 1) endMatch(_alive[0] || null);
                else window.setTimeout(runNextRound, NEXT_ROUND_DELAY_MS - 700);
            }, 300);
            return;
        }

        var player = losers[idx];
        var avatarEl = el('mc-avatar-' + player.id);
        if (avatarEl) avatarEl.classList.add('mc-avatar-out');
        playSound('eliminate');
        logEvent('❌', playerLabel(player) + ' ما لقى كرسي وطلع من المباراة');

        window.setTimeout(function () {
            if (avatarEl) avatarEl.remove();
            var aliveIdx = _alive.findIndex(function (p) { return p.id === player.id; });
            if (aliveIdx !== -1) _alive.splice(aliveIdx, 1);
            _eliminated.push({ player: player, round: _roundNumber });
            eliminateSequentially(losers, idx + 1);
        }, ELIMINATE_STAGGER_MS);
    }

    /* ======================================================================
     *  10) حذف/انضمام لاعب أثناء المباراة (زر 🗑️ وإعادة فتح التسجيل
     *      بشاشة الإعدادات — js/agp-game-shell.js)
     * ==================================================================== */
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;
        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) {
            _alive.splice(aliveIdx, 1);
            var avatarEl = el('mc-avatar-' + removedPlayer.id);
            if (avatarEl) avatarEl.remove();
            if (_matchActive && _alive.length <= 1) {
                window.setTimeout(function () { endMatch(_alive[0] || null); }, 400);
            }
        }
        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);
    }

    function handlePlayerJoined(newPlayer) {
        if (!_matchActive || !newPlayer || !newPlayer.id) return;
        var already = _alive.some(function (p) { return p.id === newPlayer.id; }) ||
            _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (already) return;
        // ينضم للدورة القادمة تلقائياً (ما نقطع الدورة الحالية الشغّالة) —
        // إعادة رسم الحلقة تصير أصلاً مع runNextRound القادمة.
        _alive.push(newPlayer);
        logEvent('➕', playerLabel(newPlayer) + ' انضم للمباراة (بيشارك بالدورة القادمة)');
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
     *  11) بدء المباراة (onStartRound من الشل) — تبدأ الدورة الأولى تلقائياً
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
     *  12) نهاية المباراة + تقرير النقاط (نفس مسار dashboard-core الحقيقي
     *      المستخدَم بروليت الإقصاء/الفواكه — بدون أي تعديل بقيم النقاط)
     * ==================================================================== */
    function endMatch(winner) {
        _matchActive = false;
        stopRingLoop();
        unwireCommentListener();
        unwireTimerListeners();
        AGP.timerManager.stop(TIMER_NAME);

        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var allPlayers = AGP.gameManager.getPlayers();
            var participants = allPlayers.map(function (p) {
                return {
                    tiktokUsername: tiktokUsernameFor(p),
                    won: Boolean(winner) && p.id === winner.id
                };
            }).filter(function (p) { return p.tiktokUsername; });

            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () {
                    return null;
                });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });

        pointsPromise.then(function (pointsResult) {
            renderWinnerScreen(winner, pointsResult);
        });
    }

    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }

    function renderWinnerScreen(winner, pointsResult) {
        playSound('winner');
        logEvent('🏆', winner ? (playerLabel(winner) + ' فاز بالمباراة!') : 'انتهت المباراة بدون فائز واضح');

        var box = document.getElementById('agp-shell-box');
        var overlay = document.getElementById('agp-shell-overlay');
        if (!box || !overlay) return;

        box.id = 'mc-winner-box';
        box.className = '';
        var awarded = winner ? findAwardedFor(pointsResult, winner) : null;
        var pointsHtml = awarded ? '<div class="mc-winner-points">+' + awarded.points + ' نقطة 🎉</div>' : '';

        box.innerHTML =
            '<h2>🏆 انتهت المباراة</h2>' +
            (winner
                ? '<div class="mc-winner-card">' +
                  '<img class="mc-winner-avatar" src="' + escapeHtml(winner.avatarUrl || '') + '" ' +
                  'onerror="this.style.display=\'none\';" alt="">' +
                  '<div class="mc-winner-name">' + escapeHtml(playerLabel(winner)) + '</div>' +
                  '<div>👑 آخر لاعب على كرسي!</div>' + pointsHtml +
                  '</div>'
                : '<p class="agp-shell-status" style="text-align:center;">ما فيه فائز واضح لهذي المباراة.</p>') +
            '<button class="agp-shell-btn-connect" id="mc-new-match-btn">🔄 مباراة جديدة</button>';

        box.id = 'agp-shell-box';
        overlay.style.display = 'flex';

        document.getElementById('mc-new-match-btn').onclick = function () {
            window.location.reload();
        };
    }

    /* ======================================================================
     *  13) تسجيل اللعبة بالمنصة + تشغيل شاشة الإعدادات/الاتصال/اللوبي
     * ==================================================================== */
    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'elimination-games',

            onLoad: function () {
                AGP.log('Musical Chairs: onLoad.');
            },
            onPlayerJoin: function () {
                enforceMaxPlayers();
            },
            onRoundEnd: function () {
                AGP.log('Musical Chairs: onRoundEnd.');
            },
            onDestroy: function () {
                resetMatchState();
                AGP.log('Musical Chairs: onDestroy — match state cleared.');
            }
        });

        if (!registered) {
            AGP.log('Musical Chairs: registration failed (already registered?).');
            return;
        }

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
            gameExplanation: 'تدور الأفاتارات حول حلقة الكراسي، وفجأة تتوقف الموسيقى وتظهر أرقام على كل كرسي. ' +
                'كل لاعب يكتب رقم الكرسي اللي يبيه بالشات — أول وحد يكتب الرقم الصحيح يفوز فيه. ' +
                'أي لاعب ما يلقى كرسي قبل انتهاء المهلة يُقصى فوراً. عدد الكراسي ينقص كل دورة (تلقائي أو مخصّص ' +
                'حسب اختيار الاستريمر) لين يبقى لاعب واحد فقط — هو الفائز!',
            connectButtonLabel: 'اتصال بالبث وبدء الإعدادات',
            minPlayersToStart: 3,
            logoImage: '../../logo.png',
            homeUrl: '../../index.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });
    }

    AGP.events.on('platform:ready', function () {
        registerGame();
    });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
