/**
 * ==========================================================================
 *  AGP ELIMINATION ROULETTE — "روليت الإقصاء" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 *
 * لعبة جديدة كلياً، أصلية (Native) داخل نفس مستودع agp-platform — بعكس
 * روليت القبائل (مستضافة خارجياً عبر js/agp-game-bridge.js)، هذه اللعبة
 * لا تحتاج نافذة خارجية ولا postMessage إطلاقاً؛ صفحتها الخاصة
 * (games/elimination-roulette/index.html) تحمّل AGP Core كاملاً + هذا
 * الملف مباشرة.
 *
 * الاعتماديات (بنفس ترتيب index.html القياسي، راجع docs/CLAUDE.md):
 *   js/agp-core.js … js/agp-bootstrap.js (AGP Core كامل)، ثم
 *   js/agp-game-shell.js (شاشة الإعدادات + الاتصال بتيك توك + اللوبي —
 *   ملف عام موجود مسبقاً بالمستودع، لم يُعدَّل هنا إطلاقاً)، ثم هذا الملف.
 *
 * ما الذي يفعله هذا الملف (وكله كود جديد خاص باللعبة فقط):
 *   1) يسجّل اللعبة كـ Game Object حقيقي عبر AGP.gameManager (لا اتصال
 *      مباشر بـ AGP.gameAPI/AGP.gameEngine إلا بنفس الطريقة الموثّقة).
 *   2) يبني حقول إعدادات المباراة ويمرّرها لـ AGP.gameShell.init (الحد
 *      الأقصى للاعبين، دخول الكل/المتابعين فقط [يُقرأ تلقائياً من
 *      agp-game-shell.js عبر مفتاح "followersOnly" الجاهز أصلاً]، تفعيل
 *      انعاش صديق، تفعيل الإنعاش بالدعم + نوع الهدية + عدد مرات الإنعاش،
 *      موقّت الإقصاء التلقائي + سلوك انتهاء الوقت).
 *   3) يبني شاشة العجلة ونوافذ الإقصاء/الإرجاع بالكامل (لا يوجد أي جزء
 *      جاهز لها بالمنصة — كود جديد 100%).
 *   4) يقرأ اختيار رقم اللاعب من شات البث عبر حدث `stream:commentReceived`
 *      الموجود أصلاً (لا تعديل على الباك إند أو محوّل تيك توك).
 *   5) الإنعاش بالدعم عبر حدث `stream:giftReceived` الموجود أصلاً.
 *   6) دورة حياة الجولة بالكامل عبر الأحداث العامة الموجودة أصلاً
 *      (`game:roundStarted`/`game:roundEnded`/`game:reset`) — بنفس
 *      الأسلوب المستخدم فعلياً في dashboard-core/js/dashboard-core.js
 *      (NS.components.round)، صفر تعديل على أي ملف agp-*.js أساسي.
 *   7) عند انتهاء المباراة: يبلّغ نقاط اللاعبين عبر
 *      window.AGPAuth.reportRoundCompletion(...) — نفس المسار الحقيقي
 *      الموجود أصلاً بالباك إند (/api/points/round-complete)، بدون أي
 *      نظام نقاط جديد.
 *
 * ⚠️ ملاحظات صادقة عن قرارات تفسيرية اتخذتها لغموض بسيط بالوصف الأصلي:
 *   - "تكرار نفس الاسم مرتين على التوالي" مُطبَّق حرفياً: يقارن نتيجة كل
 *     دورة بنتيجة الدورة السابقة مباشرة فقط؛ لو تكرر الاسم، تلك الدورة
 *     تتحول لدورة "إرجاع" بدل "إقصاء" (لا تُفتح نافذة إقصاء في نفس
 *     الدورة). لو حبيت سلوكاً مختلفاً (مثلاً: تفتح نافذتا الإقصاء
 *     والإرجاع معاً)، قول لي وأعدّلها بسهولة — كل هذا المنطق معزول بدالة
 *     واحدة (`handleWheelLanded`).
 *   - زر "تدوير العجلة" يتحكم فيه الاستريمر يدوياً من نفس الصفحة (هو من
 *     يفتحها أصلاً)، مطابق لوصفك "الاستريمر يقوم بتدوير العجلة".
 *   - أضفت أيضاً إمكانية ضغط الاستريمر مباشرة على اسم لاعب بنافذة
 *     الإقصاء/الإرجاع (بدل انتظار الشات فقط) — طبقة أمان/راحة إضافية لا
 *     تلغي القراءة من الشات، تعمل الاثنتان معاً على نفس الدالة.
 *   - قائمة هدايا تيك توك بخيار "الإنعاش بالدعم" ثابتة (قائمة أسماء
 *     هدايا شائعة يدوية) — لا يوجد أي API فعلي بالمشروع الحالي يجلب
 *     كتالوج هدايا تيك توك الحقيقي، فهذا أقرب حل ممكن بدون بناء تكامل
 *     جديد بالباك إند (خارج نطاق الطلب).
 *
 * يعتمد هذا الملف على AGP.gameManager, AGP.gameShell, AGP.timerManager,
 * AGP.events, AGP.player, AGP.keywordManager (غير مباشر عبر الـ shell)،
 * وwindow.AGPAuth (اختياري — فشل تقرير النقاط لا يوقف اللعبة).
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'elimination-roulette';
    var GAME_NAME = 'روليت الإقصاء';
    var TIMER_NAME = 'elimination-roulette-turn';

    // قائمة هدايا تيك توك شائعة ثابتة (راجع الملاحظة الصادقة أعلى الملف) —
    // القيمة (value) هي بالضبط الاسم المتوقَّع بحقل giftName بحدث
    // stream:giftReceived (نفس أسماء هدايا تيك توك الرسمية بالإنجليزية).
    var COMMON_GIFTS = [
        { label: '🌹 Rose', value: 'Rose' },
        { label: '💖 TikTok', value: 'TikTok' },
        { label: '🤍 Finger Heart', value: 'Finger Heart' },
        { label: '🎤 GG', value: 'GG' },
        { label: '🧴 Perfume', value: 'Perfume' },
        { label: '🦁 Lion', value: 'Lion' },
        { label: '🚗 Sports Car', value: 'Sports Car' }
    ];

    var ELIMINATION_TIMER_OPTIONS = [20, 25, 30, 40].map(function (s) {
        return { label: s + 'ث', value: s };
    });

    /* ======================================================================
     *  1) حالة المباراة الداخلية (محلية بالكامل لهذا الملف — لا تلمس
     *     AGP.player إطلاقاً؛ الإقصاء/الإرجاع مفهوم خاص باللعبة فقط،
     *     متوافق مع "عزل كل لعبة بمنطقها الداخلي" في PLATFORM_RULES.md).
     * ==================================================================== */
    var _alive = [];          // مصفوفة كائنات لاعبين (نفس مرجع AGP.player)، من زالوا لسا بالعجلة
    var _eliminated = [];     // { player, revivedCount }
    var _lastWheelWinnerId = null;
    var _repeatStreak = 0;
    var _settings = null;     // لقطة الإعدادات وقت بدء المباراة
    var _startedAt = null;
    var _matchActive = false;
    var _pendingTurn = null;  // { type: 'eliminate'|'revive', candidates: [...], chooser } أو null
    var _commentUnsub = null;
    var _giftUnsub = null;

    function resetMatchState() {
        _alive = [];
        _eliminated = [];
        _lastWheelWinnerId = null;
        _repeatStreak = 0;
        _settings = null;
        _startedAt = null;
        _matchActive = false;
        _pendingTurn = null;
    }

    /* ======================================================================
     *  2) أدوات DOM صغيرة (نفس أسلوب agp-game-shell.js)
     * ==================================================================== */
    function el(id) { return document.getElementById(id); }
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }
    function playerLabel(p) { return (p && (p.name || p.id)) || '—'; }

    function injectStageStyles() {
        if (el('er-stage-styles')) return;
        var style = document.createElement('style');
        style.id = 'er-stage-styles';
        style.textContent = [
            '#er-stage{position:fixed;inset:0;padding-top:70px;display:flex;flex-direction:column;',
            'align-items:center;justify-content:flex-start;gap:18px;overflow-y:auto;font-family:Cairo,sans-serif;direction:rtl;color:#f3eefc;}',

            '#er-wheel-wrap{position:relative;width:min(420px,86vw);height:min(420px,86vw);margin-top:12px;}',
            '#er-wheel{width:100%;height:100%;border-radius:50%;border:6px solid #f3eefc;position:relative;',
            'transition:transform 3.2s cubic-bezier(0.15,0.85,0.25,1);box-shadow:0 0 40px rgba(155,63,224,0.6);overflow:hidden;}',
            '.er-slice{position:absolute;top:50%;left:50%;width:50%;height:2px;transform-origin:0 0;',
            'display:flex;align-items:center;padding-right:10px;font-size:0.78em;font-weight:800;',
            'color:#2c1240;white-space:nowrap;}',
            '.er-slice span{background:rgba(255,255,255,0.88);padding:3px 8px;border-radius:999px;',
            'max-width:110px;overflow:hidden;text-overflow:ellipsis;}',
            '#er-wheel-pointer{position:absolute;top:-14px;left:50%;transform:translateX(-50%);',
            'width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;',
            'border-top:22px solid #ffd166;z-index:5;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));}',

            '#er-spin-btn{padding:14px 40px;border:none;border-radius:999px;font-weight:800;font-size:1.05em;',
            'cursor:pointer;background:linear-gradient(90deg,#22d3ee,#a855f7);color:#0b0616;font-family:inherit;}',
            '#er-spin-btn:disabled{opacity:0.5;cursor:not-allowed;}',

            '#er-alive-list{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:600px;padding:0 12px 20px;}',
            '.er-chip{background:rgba(255,255,255,0.1);border:1px solid rgba(216,120,255,0.4);border-radius:999px;',
            'padding:6px 14px;font-size:0.85em;}',
            '.er-chip--out{opacity:0.4;text-decoration:line-through;}',

            '#er-modal-overlay{position:fixed;inset:0;z-index:100010;display:none;align-items:center;',
            'justify-content:center;padding:16px;background:rgba(8,4,16,0.72);}',
            '#er-modal-box{width:min(480px,94vw);max-height:84vh;overflow-y:auto;',
            'background:linear-gradient(180deg,#efe0fb,#e2c7f7);border:2px solid #9b3fe0;border-radius:18px;',
            'padding:24px;color:#2c1240;box-shadow:0 0 40px rgba(155,63,224,0.5);}',
            '#er-modal-box h2{margin:0 0 6px;font-size:1.2em;text-align:center;color:#3a1560;font-weight:800;}',
            '#er-modal-sub{text-align:center;color:#5a2585;font-size:0.85em;margin-bottom:14px;}',
            '#er-modal-timer{text-align:center;font-weight:800;font-size:1.4em;color:#9b3fe0;margin-bottom:14px;}',
            '.er-candidate-row{display:flex;align-items:center;justify-content:space-between;gap:10px;',
            'padding:10px 12px;border:1px solid rgba(155,63,224,0.35);border-radius:12px;margin-bottom:8px;',
            'cursor:pointer;background:#fff;}',
            '.er-candidate-row:hover{background:#f3eefc;}',
            '.er-candidate-num{background:#9b3fe0;color:#fff;border-radius:50%;width:26px;height:26px;',
            'display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.8em;flex-shrink:0;}',
            '.er-candidate-name{flex:1;text-align:right;font-weight:700;}',

            '#er-toast-wrap{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100020;',
            'display:flex;flex-direction:column;gap:8px;align-items:center;}',
            '.er-toast{background:rgba(20,8,35,0.92);border:1px solid rgba(216,120,255,0.5);color:#f3eefc;',
            'padding:10px 18px;border-radius:999px;font-size:0.85em;font-weight:700;box-shadow:0 6px 16px rgba(0,0,0,0.35);}',

            '#er-winner-box{text-align:center;}',
            '#er-winner-box .er-winner-name{font-size:1.6em;font-weight:900;color:#3a1560;margin:10px 0;}',
            '.er-btn-secondary{margin-top:10px;width:100%;padding:11px;border-radius:999px;border:1px solid #9b3fe0;',
            'background:#fff;color:#5a2585;font-weight:800;cursor:pointer;font-family:inherit;}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  3) شاشة العجلة الرئيسية
     * ==================================================================== */
    function renderStage() {
        injectStageStyles();
        var stage = el('er-stage');
        if (!stage) {
            stage = document.createElement('div');
            stage.id = 'er-stage';
            document.body.appendChild(stage);
        }
        stage.innerHTML =
            '<div id="er-wheel-wrap"><div id="er-wheel-pointer"></div><div id="er-wheel"></div></div>' +
            '<button id="er-spin-btn">🎡 دوّر العجلة</button>' +
            '<div id="er-alive-list"></div>';

        if (!el('er-modal-overlay')) {
            var overlay = document.createElement('div');
            overlay.id = 'er-modal-overlay';
            overlay.innerHTML = '<div id="er-modal-box"></div>';
            document.body.appendChild(overlay);
        }
        if (!el('er-toast-wrap')) {
            var toastWrap = document.createElement('div');
            toastWrap.id = 'er-toast-wrap';
            document.body.appendChild(toastWrap);
        }

        renderWheelSlices();
        renderAliveList();
        el('er-spin-btn').onclick = handleSpinClick;
    }

    function renderWheelSlices() {
        var wheel = el('er-wheel');
        if (!wheel) return;
        wheel.innerHTML = '';
        var n = _alive.length;
        if (!n) return;
        var anglePer = 360 / n;
        _alive.forEach(function (p, i) {
            var slice = document.createElement('div');
            slice.className = 'er-slice';
            slice.style.transform = 'rotate(' + (anglePer * i) + 'deg)';
            slice.innerHTML = '<span>' + escapeHtml(playerLabel(p)) + '</span>';
            wheel.appendChild(slice);
        });
    }

    function renderAliveList() {
        var list = el('er-alive-list');
        if (!list) return;
        var html = _alive.map(function (p) {
            return '<span class="er-chip">' + escapeHtml(playerLabel(p)) + '</span>';
        }).join('');
        html += _eliminated.map(function (e) {
            return '<span class="er-chip er-chip--out">' + escapeHtml(playerLabel(e.player)) + '</span>';
        }).join('');
        list.innerHTML = html;
    }

    function showToast(message) {
        var wrap = el('er-toast-wrap');
        if (!wrap) return;
        var t = document.createElement('div');
        t.className = 'er-toast';
        t.textContent = message;
        wrap.appendChild(t);
        window.setTimeout(function () {
            if (t.parentNode) t.parentNode.removeChild(t);
        }, 4000);
    }

    /* ======================================================================
     *  4) دوران العجلة
     * ==================================================================== */
    var _wheelRotation = 0;

    function handleSpinClick() {
        if (!_matchActive || _pendingTurn) return;
        if (_alive.length <= 1) return;

        var spinBtn = el('er-spin-btn');
        if (spinBtn) spinBtn.disabled = true;

        var winnerIndex = Math.floor(Math.random() * _alive.length);
        var winner = _alive[winnerIndex];

        var n = _alive.length;
        var anglePer = 360 / n;
        // زاوية توقف المؤشر (أعلى العجلة = 0 درجة) عند شريحة الفائز، مع
        // دورات إضافية كاملة (5 لفات) لإحساس دوران واقعي.
        var targetAngle = 360 * 5 + (360 - (winnerIndex * anglePer + anglePer / 2));
        _wheelRotation += targetAngle;

        var wheel = el('er-wheel');
        if (wheel) wheel.style.transform = 'rotate(' + _wheelRotation + 'deg)';

        window.setTimeout(function () {
            if (spinBtn) spinBtn.disabled = false;
            handleWheelLanded(winner);
        }, 3300);
    }

    function handleWheelLanded(winner) {
        if (!winner) return;

        var isRepeat = (_lastWheelWinnerId !== null && winner.id === _lastWheelWinnerId);
        _repeatStreak = isRepeat ? (_repeatStreak + 1) : 1;
        _lastWheelWinnerId = winner.id;

        if (_repeatStreak === 2 && _settings.friendRevivalEnabled && _eliminated.length > 0) {
            _repeatStreak = 0; // استهلاك التكرار — يحتاج زوجاً جديداً من التكرار ليتفعّل مرة أخرى
            openRevivalWindow(winner);
            return;
        }

        openEliminationWindow(winner);
    }

    /* ======================================================================
     *  5) نافذة الإقصاء
     * ==================================================================== */
    function openEliminationWindow(chooser) {
        var candidates = _alive.filter(function (p) { return p.id !== chooser.id; });
        if (!candidates.length) return; // لا يوجد أحد آخر لإقصائه (لن يحدث عملياً — لو تبقى شخصين فقط، هذا يشملهما)

        _pendingTurn = { type: 'eliminate', candidates: candidates, chooser: chooser };
        renderTurnModal('اختيار الإقصاء', escapeHtml(playerLabel(chooser)) + ' يختار! اكتب رقم اللاعب بشات البث للإقصاء');
        startTurnTimer(function onTimeout() {
            applyEliminationTimeout(chooser);
        });
    }

    function applyEliminationTimeout(chooser) {
        if (!_pendingTurn || _pendingTurn.type !== 'eliminate') return;
        var behavior = _settings.eliminationTimeoutBehavior;
        closeTurnModal();
        if (behavior === 'eliminate_chooser') {
            eliminatePlayer(chooser);
        }
        // 'skip_turn' — لا شيء، فقط تُغلق النافذة وتكمل المباراة بدون إقصاء
    }

    function eliminatePlayer(target) {
        var idx = _alive.findIndex(function (p) { return p.id === target.id; });
        if (idx === -1) return;
        _alive.splice(idx, 1);
        _eliminated.push({ player: target, revivedCount: 0 });

        showToast('❌ تم إقصاء ' + playerLabel(target));
        renderWheelSlices();
        renderAliveList();
        closeTurnModal();

        if (_alive.length <= 1) {
            endMatch(_alive[0] || null);
        }
    }

    /* ======================================================================
     *  6) نافذة الإرجاع (تكرار الاسم مرتين ← "انعاش صديق")
     * ==================================================================== */
    function openRevivalWindow(chooser) {
        var candidates = _eliminated.map(function (e) { return e.player; });
        _pendingTurn = { type: 'revive', candidates: candidates, chooser: chooser };
        renderTurnModal('🎗️ فرصة إرجاع!',
            escapeHtml(playerLabel(chooser)) + ' وقف عليه العجلة مرتين متتاليتين — يقدر يرجّع لاعب مُقصى! اكتب رقم اللاعب بشات البث');
        startTurnTimer(function onTimeout() {
            closeTurnModal(); // انتهاء الوقت بدون اختيار = تفويت فرصة الإرجاع فقط، بدون أي إقصاء
        });
    }

    function revivePlayer(target) {
        var idx = _eliminated.findIndex(function (e) { return e.player.id === target.id; });
        if (idx === -1) return;
        _eliminated.splice(idx, 1);
        _alive.push(target);

        showToast('💚 رجع ' + playerLabel(target) + ' للعبة');
        renderWheelSlices();
        renderAliveList();
        closeTurnModal();
    }

    /* ======================================================================
     *  7) نافذة الدور المشتركة (إقصاء أو إرجاع) — عرض + عدّاد + استماع للشات
     * ==================================================================== */
    function renderTurnModal(title, subtitle) {
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box || !_pendingTurn) return;

        var rows = _pendingTurn.candidates.map(function (p, i) {
            return '<div class="er-candidate-row" data-index="' + i + '">' +
                '<span class="er-candidate-name">' + escapeHtml(playerLabel(p)) + '</span>' +
                '<span class="er-candidate-num">' + (i + 1) + '</span></div>';
        }).join('');

        box.innerHTML =
            '<h2>' + title + '</h2>' +
            '<div id="er-modal-sub">' + subtitle + '</div>' +
            '<div id="er-modal-timer"></div>' +
            rows;

        box.querySelectorAll('.er-candidate-row').forEach(function (row) {
            row.onclick = function () {
                var i = parseInt(row.getAttribute('data-index'), 10);
                resolveTurnSelection(i);
            };
        });

        overlay.style.display = 'flex';
    }

    // مرجع لدوال إلغاء الاشتراك بمستمعي timer:tick/timer:ended الخاصين
    // بالدور الحالي — يُنظَّفان دائماً من closeTurnModal مهما كانت طريقة
    // إغلاق النافذة (اختيار يدوي/شات، أو انتهاء الوقت)، حتى لا تتراكم
    // مستمعات معلَّقة (Leaked Listeners) عبر أدوار كثيرة بنفس المباراة.
    var _turnTickUnsub = null;
    var _turnEndUnsub = null;

    function closeTurnModal() {
        var overlay = el('er-modal-overlay');
        if (overlay) overlay.style.display = 'none';
        AGP.timerManager.stop(TIMER_NAME);
        if (typeof _turnTickUnsub === 'function') _turnTickUnsub();
        if (typeof _turnEndUnsub === 'function') _turnEndUnsub();
        _turnTickUnsub = null;
        _turnEndUnsub = null;
        _pendingTurn = null;
    }

    function startTurnTimer(onTimeout) {
        var seconds = _settings.eliminationTimerSeconds || 30;
        AGP.timerManager.start(TIMER_NAME, seconds);
        updateTimerDisplay(seconds);
        _turnTickUnsub = AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            updateTimerDisplay(payload.remainingSeconds);
        });
        _turnEndUnsub = AGP.events.on('timer:ended', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            onTimeout();
        });
    }

    function updateTimerDisplay(seconds) {
        var t = el('er-modal-timer');
        if (t) t.textContent = '⏱️ ' + seconds + ' ث';
    }

    /**
     * يُستدعى إما من ضغطة الاستريمر على صف بالنافذة، أو من مطابقة رقم
     * صحيح وارد بتعليق شات البث (راجع wireCommentListener أدناه).
     * @param {number} index - فهرس اللاعب ضمن _pendingTurn.candidates (من 0)
     */
    function resolveTurnSelection(index) {
        if (!_pendingTurn) return;
        var target = _pendingTurn.candidates[index];
        if (!target) return;

        var type = _pendingTurn.type;
        AGP.timerManager.stop(TIMER_NAME);

        if (type === 'eliminate') {
            eliminatePlayer(target);
        } else if (type === 'revive') {
            revivePlayer(target);
        }
    }

    /* ======================================================================
     *  8) الاستماع لشات البث (اختيار الإقصاء/الإرجاع بالرقم) — عبر حدث
     *     stream:commentReceived الموجود أصلاً (adapters/agp-tiktok-adapter.js)
     * ==================================================================== */
    function wireCommentListener() {
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_pendingTurn || !payload || typeof payload.text !== 'string') return;
            var n = parseInt(payload.text.trim(), 10);
            if (isNaN(n) || n < 1 || n > _pendingTurn.candidates.length) return;
            resolveTurnSelection(n - 1);
        });
    }

    /* ======================================================================
     *  9) الإنعاش عن طريق الدعم — عبر حدث stream:giftReceived الموجود أصلاً
     * ==================================================================== */
    function wireGiftListener() {
        _giftUnsub = AGP.events.on('stream:giftReceived', function (payload) {
            if (!_matchActive || !_settings || !_settings.giftRevivalEnabled) return;
            if (!payload || !payload.giftName) return;
            if (payload.giftName !== _settings.giftRevivalGiftName) return;

            var entry = _eliminated.filter(function (e) {
                return e.player.id === payload.id || e.player.name === payload.name;
            })[0];
            if (!entry) return; // مو مُقصى حالياً (أو غير موجود أصلاً باللاعبين) — تجاهل بصمت

            var maxCount = _settings.giftRevivalMaxCount || 1;
            if (entry.revivedCount >= maxCount) {
                showToast('⚠️ ' + playerLabel(entry.player) + ' استخدم كل مرات الإنعاش بالدعم المسموحة');
                return;
            }

            entry.revivedCount += 1;
            revivePlayerByEntry(entry);
        });
    }

    function revivePlayerByEntry(entry) {
        var idx = _eliminated.indexOf(entry);
        if (idx === -1) return;
        _eliminated.splice(idx, 1);
        _alive.push(entry.player);

        showToast('🎁 ' + playerLabel(entry.player) + ' رجع للعبة عن طريق الدعم!');
        renderWheelSlices();
        renderAliveList();

        if (_pendingTurn && _pendingTurn.type === 'eliminate') {
            // اللاعب الراجع يدخل ضمن قائمة الإقصاء الحالية أيضاً لو كانت
            // نافذة إقصاء مفتوحة وقتها — إعادة رسم بسيطة تضيفه للقائمة.
            _pendingTurn.candidates.push(entry.player);
            renderTurnModal(
                el('er-modal-box').querySelector('h2').textContent,
                el('er-modal-sub').textContent
            );
        }
    }

    /* ======================================================================
     *  10) الحد الأقصى للاعبين — إغلاق التسجيل تلقائياً عند الوصول للحد
     *      (AGP.lobby.close() الجاهزة أصلاً؛ لا حد أقصى مفروض بأي مكان
     *      آخر بالمنصة، راجع agp-player-manager.js — "لا سعة قصوى مفروضة"
     *      موثّقة كديْن معماري مقبول بـARCHITECTURE.md).
     * ==================================================================== */
    function enforceMaxPlayers() {
        var settings = AGP.gameShell.getSettings();
        var max = settings.maxPlayers;
        if (!max) return;
        if (AGP.gameManager.getPlayersCount() >= max) {
            AGP.lobby.close();
        }
    }

    /* ======================================================================
     *  11) نهاية المباراة + تقرير النقاط (نفس مسار dashboard-core الحقيقي)
     * ==================================================================== */
    function endMatch(winner) {
        _matchActive = false;
        closeTurnModal();
        if (typeof _commentUnsub === 'function') _commentUnsub();
        if (typeof _giftUnsub === 'function') _giftUnsub();

        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var allPlayers = AGP.gameManager.getPlayers();
            var participants = allPlayers.map(function (p) {
                return {
                    tiktokUsername: p.name || p.id,
                    won: Boolean(winner) && p.id === winner.id
                };
            }).filter(function (p) { return p.tiktokUsername; });

            if (participants.length) {
                window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () {
                    // فشل صامت — لا نوقف عرض نتيجة المباراة بسبب هذا (نفس نمط dashboard-core.js).
                });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        renderWinnerScreen(winner);
    }

    function renderWinnerScreen(winner) {
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box) return;

        box.id = 'er-winner-box';
        box.innerHTML =
            '<h2>🏆 انتهت المباراة!</h2>' +
            '<div class="er-winner-name">' + (winner ? escapeHtml(playerLabel(winner)) : 'بدون فائز') + '</div>' +
            '<button class="er-btn-secondary" id="er-new-match-btn">🔄 مباراة جديدة</button>';

        document.getElementById('er-new-match-btn').onclick = function () {
            AGP.gameManager.resetSession(); // يبث game:reset الموجود أصلاً — يستدعي onDestroy() تلقائياً
            window.location.reload();
        };

        overlay.style.display = 'flex';
    }

    /* ======================================================================
     *  12) تسجيل اللعبة + شاشة الإعدادات (agp-game-shell.js — غير مُعدَّل)
     * ==================================================================== */
    function buildSettingsFields() {
        return [
            {
                key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى للاعبين',
                min: 2, default: 20
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
                key: 'friendRevivalEnabled', type: 'toggle', label: '🎗️ ميزة انعاش صديق',
                default: false
            },
            {
                key: 'giftRevivalEnabled', type: 'toggle', label: '🎁 الإنعاش عن طريق الدعم',
                default: false
            },
            {
                key: 'giftRevivalGiftName', type: 'pill-group', label: 'نوع الهدية',
                options: COMMON_GIFTS, default: COMMON_GIFTS[0].value,
                showWhen: { key: 'giftRevivalEnabled', equals: true }
            },
            {
                key: 'giftRevivalMaxCount', type: 'counter', label: 'كم مرة يقدر ينعش نفسه',
                min: 1, default: 1,
                showWhen: { key: 'giftRevivalEnabled', equals: true }
            },
            {
                key: 'eliminationTimerSeconds', type: 'pill-group', label: '⏱️ موقّت الإقصاء',
                options: ELIMINATION_TIMER_OPTIONS, default: 30
            },
            {
                key: 'eliminationTimeoutBehavior', type: 'pill-choice', label: 'عند انتهاء الوقت',
                options: [
                    { label: 'يُقصى صاحب الدور', value: 'eliminate_chooser' },
                    { label: 'يتخطى دوره فقط', value: 'skip_turn' }
                ],
                default: 'eliminate_chooser'
            }
        ];
    }

    function handleStartRound(settingsValues) {
        resetMatchState();
        _settings = settingsValues;
        _alive = AGP.gameManager.getPlayers().slice();
        _startedAt = Date.now();
        _matchActive = true;

        wireCommentListener();
        wireGiftListener();
        renderStage();
    }

    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'elimination-games',

            onLoad: function () {
                AGP.log('Elimination Roulette: onLoad.');
            },
            onPlayerJoin: function () {
                enforceMaxPlayers();
            },
            onRoundEnd: function () {
                AGP.log('Elimination Roulette: onRoundEnd.');
            },
            onDestroy: function () {
                resetMatchState();
                AGP.log('Elimination Roulette: onDestroy — match state cleared.');
            }
        });

        if (!registered) {
            AGP.log('Elimination Roulette: registration failed (already registered?).');
            return;
        }

        AGP.gameManager.loadGame(GAME_ID);

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات مباراة روليت الإقصاء',
            gameExplanation: 'تدور العجلة وتتوقف عند أحد اللاعبين، فيختار رقم لاعب آخر ليقصيه من الشات. ' +
                'لو وقفت العجلة على نفس الشخص مرتين متتاليتين (ولو مفعّلة ميزة انعاش صديق)، يقدر يرجّع مُقصى بدل الإقصاء. ' +
                'المُقصى يقدر يرجع بإرسال هدية معيّنة لو مفعّلة ميزة الإنعاش بالدعم. تستمر المباراة حتى يبقى لاعب واحد.',
            connectButtonLabel: 'اتصال بالبث وبدء الإعدادات',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });
    }

    AGP.events.on('platform:ready', function () {
        // حماية بسيطة: هذه الصفحة تحمّل AGP Core كاملاً بنفسها، فيُفترض
        // بث platform:ready فعلياً عبر agp-bootstrap.js بنفس آلية الصفحة
        // الرئيسية. لو تأخر لأي سبب، التسجيل يتم فور تشغيله بلا حاجة لأي
        // بطاقة .game-card بهذه الصفحة (هذه الصفحة ليست هي الصفحة
        // الرئيسية، ولا يوجد بها بطاقات ألعاب أصلاً).
        registerGame();
    });

    // حالة دفاعية: لو كانت الصفحة جاهزة فعلياً وقت تنفيذ هذا الملف
    // (مثلاً AGP.bootstrap بثّ الحدث قبل وصول هذا السكربت، حالة نادرة).
    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
