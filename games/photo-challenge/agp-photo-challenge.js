/**
 * ==========================================================================
 *  AGP PHOTO CHALLENGE -- "تحدي الصور" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 * لعبة أصلية (Native) بنفس نمط games/team-war من ناحية طريقة التحميل فقط
 * (كلمتان مفتاحيتان منفصلتان -- وحدة لكل فريق -- شاشة الإعدادات المشتركة
 * js/agp-game-shell.js تدعم كلمة مفتاحية واحدة بس، فما تكفي هذي اللعبة).
 * الهوية البصرية: قالب "settings-no-box" منقول بالحرف من روليت القبائل
 * (بدون صندوق يحيط الحقول، عنوان بتدرّج لوني، حقول بخط سفلي بدل صناديق)
 * + تبويب اتصال بالبث (سبينر / تحذير فشل) يظهر فوق نفس الشاشة تماماً
 * كما هو معتمد بروليت القبائل. خط Zain فقط. لا اعتماد على
 * js/agp-game-shell.js ولا على أي لعبة ثانية، لا تعديل على أي ملف موجود.
 *
 * ⚠️ بناء تدريجي: هذا الملف حالياً يغطي شاشة الإعدادات + تبويب الاتصال
 * فقط. اللوبي/المباراة/شاشة الفائز غير مبنية بعد.
 *
 * الخدمات العامة المُعاد استخدامها بدون أي تعديل عليها:
 *   AGP.player / AGP.scoreManager / AGP.timerManager / AGP.streamConnector
 *   AGP.lobby / AGP.gameManager / AGP.events
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.gameManager || !AGP.player || !AGP.scoreManager || !AGP.timerManager || !AGP.streamConnector) {
        console.error('[AGP Photo Challenge] AGP Core غير محمَّل بعد -- تأكد من ترتيب تحميل الملفات بـ index.html.');
        return;
    }

    var GAME_ID = 'photo-challenge';
    var GAME_NAME = 'تحدي الصور';

    var DURATION_OPTIONS = [
        { value: 60, label: '1 د' },
        { value: 90, label: '1:30 د' },
        { value: 120, label: '2 د' },
        { value: 180, label: '3 د' }
    ];
    var WIN_POINTS_OPTIONS = [15, 20, 25];

    /* ======================================================================
     *  0) الحالة الداخلية
     * ==================================================================== */
    var _screen = 'settings'; // settings | connecting (فوق نفس الشاشة)
    var _rootEl = null;

    var _settings = {
        tiktokUsername: '',
        team1Name: 'الفريق الأول',
        team1Keyword: '',
        team2Name: 'الفريق الثاني',
        team2Keyword: '',
        followersOnly: false,
        answerDurationSeconds: 90,
        winPoints: 20
    };

    function el(id) { return document.getElementById(id); }
    function escapeAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    /* ======================================================================
     *  1) أدوات نصية: تطبيع عربي (لمقارنة الكلمات المفتاحية)
     * ==================================================================== */
    function normalizeArabicText(text) {
        if (typeof text !== 'string') return '';
        return text
            .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
            .replace(/[إأآا]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    /* ======================================================================
     *  2) شاشة الإعدادات -- قالب "settings-no-box" (منقول من روليت القبائل)
     * ==================================================================== */
    function ensureRoot() {
        if (_rootEl) return _rootEl;
        document.body.classList.add('pc-active');
        _rootEl = document.createElement('div');
        _rootEl.id = 'pc-settings';
        document.body.appendChild(_rootEl);
        return _rootEl;
    }

    function renderSettingsScreen() {
        _screen = 'settings';
        var root = ensureRoot();
        root.style.display = 'block';

        var joinPills = [
            { value: false, label: 'الكل' },
            { value: true, label: 'المتابعون فقط' }
        ].map(function (opt) {
            var active = (_settings.followersOnly === opt.value) ? ' pc-pill-active' : '';
            return '<button type="button" class="pc-pill-btn' + active + '" data-key="followersOnly" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');

        var durationPills = DURATION_OPTIONS.map(function (opt) {
            var active = (_settings.answerDurationSeconds === opt.value) ? ' pc-pill-active' : '';
            return '<button type="button" class="pc-pill-btn' + active + '" data-key="answerDurationSeconds" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');

        var pointsPills = WIN_POINTS_OPTIONS.map(function (v) {
            var active = (_settings.winPoints === v) ? ' pc-pill-active' : '';
            return '<button type="button" class="pc-pill-btn' + active + '" data-key="winPoints" data-value="' + v + '">' + v + '</button>';
        }).join('');

        root.innerHTML =
            '<h2>إعدادات مباراة تحدي الصور</h2>' +

            '<div class="pc-field">' +
                '<label>اكتب يوزر البث بالتيك توك</label>' +
                '<input type="text" id="pc-input-username" placeholder="ayman_live" value="' + escapeAttr(_settings.tiktokUsername) + '">' +
            '</div>' +

            '<div class="pc-field pc-team1">' +
                '<label>اسم الفريق الأول</label>' +
                '<input type="text" id="pc-input-team1Name" value="' + escapeAttr(_settings.team1Name) + '">' +
            '</div>' +
            '<div class="pc-field pc-team1">' +
                '<label>الكلمة المفتاحية للفريق الأول</label>' +
                '<input type="text" id="pc-input-team1Keyword" placeholder="اكتب الكلمة المفتاحية" value="' + escapeAttr(_settings.team1Keyword) + '">' +
            '</div>' +

            '<div class="pc-field pc-team2">' +
                '<label>اسم الفريق الثاني</label>' +
                '<input type="text" id="pc-input-team2Name" value="' + escapeAttr(_settings.team2Name) + '">' +
            '</div>' +
            '<div class="pc-field pc-team2">' +
                '<label>الكلمة المفتاحية للفريق الثاني</label>' +
                '<input type="text" id="pc-input-team2Keyword" placeholder="اكتب الكلمة المفتاحية" value="' + escapeAttr(_settings.team2Keyword) + '">' +
            '</div>' +

            '<div class="pc-row" id="pc-row-followersOnly">' +
                '<div class="pc-pill-group">' + joinPills + '</div>' +
                '<span class="pc-row-label">🔑 مين يقدر يدخل؟</span>' +
            '</div>' +

            '<div class="pc-row" id="pc-row-duration" style="flex-direction:column;align-items:stretch;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
                    '<div class="pc-pill-group">' + durationPills + '</div>' +
                    '<span class="pc-row-label">⏱️ مدة الإجابة</span>' +
                '</div>' +
                '<div class="pc-hint">أول 15 ثانية = 3 نقاط · قبل نص الوقت = نقطتان · بعد نص الوقت = نقطة</div>' +
            '</div>' +

            '<div class="pc-row" id="pc-row-winPoints">' +
                '<div class="pc-pill-group">' + pointsPills + '</div>' +
                '<span class="pc-row-label">🏆 نقاط الفوز</span>' +
            '</div>' +

            '<div id="pc-settings-error" class="pc-error-msg" style="display:none;"></div>' +

            '<button type="button" id="pc-connect-btn" class="pc-btn-connect">اتصال بالبث وبدء الإعدادات</button>' +
            '<button type="button" id="pc-back-btn" class="pc-back-btn">🏠 رجوع لمنصة ألعاب أيمن</button>';

        wireSettingsHandlers();
    }

    function wireSettingsHandlers() {
        el('pc-input-username').addEventListener('input', function (e) { _settings.tiktokUsername = e.target.value; });
        el('pc-input-team1Name').addEventListener('input', function (e) { _settings.team1Name = e.target.value; });
        el('pc-input-team1Keyword').addEventListener('input', function (e) { _settings.team1Keyword = e.target.value; });
        el('pc-input-team2Name').addEventListener('input', function (e) { _settings.team2Name = e.target.value; });
        el('pc-input-team2Keyword').addEventListener('input', function (e) { _settings.team2Keyword = e.target.value; });

        el('pc-row-followersOnly').addEventListener('click', function (e) {
            var btn = e.target.closest('.pc-pill-btn'); if (!btn) return;
            _settings.followersOnly = (btn.getAttribute('data-value') === 'true');
            renderSettingsScreen();
        });
        el('pc-row-duration').addEventListener('click', function (e) {
            var btn = e.target.closest('.pc-pill-btn'); if (!btn) return;
            _settings.answerDurationSeconds = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });
        el('pc-row-winPoints').addEventListener('click', function (e) {
            var btn = e.target.closest('.pc-pill-btn'); if (!btn) return;
            _settings.winPoints = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });

        el('pc-back-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('pc-connect-btn').addEventListener('click', handleConnectClick);
    }

    function showSettingsError(msg) {
        var errEl = el('pc-settings-error');
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.style.display = 'block';
    }

    function handleConnectClick() {
        var username = (_settings.tiktokUsername || '').trim();
        var kw1 = normalizeArabicText(_settings.team1Keyword);
        var kw2 = normalizeArabicText(_settings.team2Keyword);

        if (!username) return showSettingsError('لازم تكتب يوزر البث أول.');
        if (!kw1 || !kw2) return showSettingsError('لازم تحدد كلمة مفتاحية لكل فريق.');
        if (kw1 === kw2) return showSettingsError('الكلمتان المفتاحيتان لازم تكونان مختلفتين عن بعض.');

        AGP.streamConnector.connect('tiktok', { username: username });
    }

    /* ======================================================================
     *  3) تبويب الاتصال بالبث -- يظهر فوق شاشة الإعدادات (منقول بالحرف من
     *     قالب روليت القبائل). زر ✕ عند الفشل يُخفي التبويب فقط، شاشة
     *     الإعدادات خلفه تبقى ظاهرة وتفاعلية.
     * ==================================================================== */
    function ensureConnectOverlay() {
        if (!el('pc-connect-dim')) {
            var dim = document.createElement('div');
            dim.id = 'pc-connect-dim';
            document.body.appendChild(dim);
        }
        if (!el('pc-connect-popup')) {
            var popup = document.createElement('div');
            popup.id = 'pc-connect-popup';
            document.body.appendChild(popup);
        }
        return el('pc-connect-popup');
    }

    function showConnectOverlay(isError) {
        var popup = ensureConnectOverlay();
        el('pc-connect-dim').style.display = 'block';
        popup.style.display = 'block';
        popup.classList.toggle('pc-connect-error', Boolean(isError));
        popup.innerHTML =
            (isError ? '<button type="button" id="pc-connect-close-btn">✕</button>' : '') +
            '<div class="' + (isError ? 'pc-connect-error-icon' : 'pc-connect-spinner') + '">' +
            (isError ? '⚠️' : '') + '</div>' +
            '<h3>' + (isError ? 'تعذّر الاتصال' : 'جاري الاتصال بالبث') + '</h3>' +
            '<p>' + (isError ? 'تأكد من اسم المستخدم وحاول مرة ثانية' : 'انتظر قليلاً...') + '</p>';
        if (isError) {
            el('pc-connect-close-btn').onclick = function () {
                hideConnectOverlay();
            };
        }
    }

    function hideConnectOverlay() {
        if (el('pc-connect-dim')) el('pc-connect-dim').style.display = 'none';
        if (el('pc-connect-popup')) el('pc-connect-popup').style.display = 'none';
    }

    /* ======================================================================
     *  4) الاستماع لأحداث المنصة العامة + التسجيل
     * ==================================================================== */
    function wirePlatformListeners() {
        AGP.events.on('stream:statusChanged', function (payload) {
            if (payload.platform !== 'tiktok') return;
            if (payload.status === 'connecting') {
                _screen = 'connecting';
                showConnectOverlay(false);
            } else if (payload.status === 'connected') {
                hideConnectOverlay();
                // ⚠️ اللوبي غير مبني بعد (بناء تدريجي) -- المرحلة التالية.
                AGP.log('Photo Challenge: تم الاتصال بالبث -- بانتظار بناء شاشة اللوبي.');
            } else if (payload.status === 'error') {
                showConnectOverlay(true);
            }
        });
    }

    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'team-games',
            onLoad: function () { AGP.log('Photo Challenge: onLoad.'); },
            onRoundEnd: function () { AGP.log('Photo Challenge: onRoundEnd.'); },
            onDestroy: function () { AGP.log('Photo Challenge: onDestroy.'); }
        });

        if (!registered) { AGP.log('Photo Challenge: registration failed (already registered?).'); return; }

        AGP.gameManager.loadGame(GAME_ID);

        wirePlatformListeners();
        renderSettingsScreen();
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
