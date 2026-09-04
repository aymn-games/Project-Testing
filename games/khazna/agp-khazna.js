/**
 * ==========================================================================
 *  AGP KHAZNA -- "الخزنة" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 * لعبة أصلية (Native) بنفس نمط games/team-war و games/photo-challenge من
 * ناحية طريقة التحميل (بدون js/agp-game-shell.js). الهوية البصرية: قالب
 * "settings-no-box" منقول بالحرف من روليت القبائل/تحدي الصور (بدون صندوق
 * يحيط الحقول، عنوان بتدرّج لوني، حقول بخط سفلي بدل صناديق) + تبويب اتصال
 * بالبث (سبينر / تحذير فشل) يظهر فوق نفس الشاشة تماماً. خط Zain فقط.
 * لا تعديل على أي ملف موجود بالمشروع.
 *
 * ⚠️ بناء تدريجي: هذا الملف حالياً يغطي شاشة الإعدادات + تبويب الاتصال
 * فقط (بالضبط كما اعتُمد بالنموذج). اللوبي/المباراة/شاشة الفائز غير
 * مبنية بعد -- تحتاج تحديد آلية اللعب الفعلية (عدد الخيارات، شكل
 * الاختيار، شرط الإقصاء بعد اختيار خاطئ إن وُجد، إلخ) قبل بنائها.
 *
 * الخدمات العامة المُعاد استخدامها بدون أي تعديل عليها:
 *   AGP.player / AGP.timerManager / AGP.streamConnector / AGP.events
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.gameManager || !AGP.player || !AGP.timerManager || !AGP.streamConnector) {
        console.error('[AGP Khazna] AGP Core غير محمَّل بعد -- تأكد من ترتيب تحميل الملفات بـ index.html.');
        return;
    }

    var GAME_ID = 'khazna';
    var GAME_NAME = 'الخزنة';

    var CHOICE_SECONDS_OPTIONS = [10, 15, 20, 25];

    /* ======================================================================
     *  0) الحالة الداخلية
     * ==================================================================== */
    var _screen = 'settings'; // settings | connecting (فوق نفس الشاشة)
    var _rootEl = null;

    var _settings = {
        tiktokUsername: '',
        joinKeyword: '',
        followersOnly: false,
        chooseSeconds: 15
    };

    function el(id) { return document.getElementById(id); }
    function escapeAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    /* ======================================================================
     *  1) أدوات نصية: تطبيع عربي (لمقارنة الكلمة المفتاحية)
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
     *  2) الهيدر الأساسي الثابت -- بهوية اللعبة (بنفسجي)
     * ==================================================================== */
    function injectHeader() {
        if (el('kz-header')) return;
        var header = document.createElement('div');
        header.id = 'kz-header';
        header.innerHTML =
            '<div class="kz-header-icons">' +
                '<button type="button" class="kz-header-icon-btn" id="kz-header-home-btn" title="العودة للمنصة">🏠</button>' +
                '<button type="button" class="kz-header-icon-btn" id="kz-header-info-btn" title="شرح اللعبة">!</button>' +
                '<button type="button" class="kz-header-icon-btn" id="kz-header-settings-btn" title="الإعدادات">⚙️</button>' +
            '</div>' +
            '<div id="kz-header-title">' + escapeHtml(GAME_NAME) + '</div>' +
            '<div id="kz-header-brand"><img src="../../logo.png" alt="ألعاب أيمن" onerror="this.style.display=\'none\'"></div>';
        document.body.appendChild(header);

        el('kz-header-home-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('kz-header-info-btn').addEventListener('click', function () {
            // ⚠️ بناء تدريجي: شاشة الشرح غير مبنية بعد.
            AGP.log('Khazna: زر الشرح -- الشاشة لسا ما بُنيت.');
        });
        el('kz-header-settings-btn').addEventListener('click', function () {
            // ⚠️ بناء تدريجي: إعادة فتح الإعدادات أثناء المباراة غير مبنية بعد.
            AGP.log('Khazna: زر الإعدادات -- إعادة الفتح أثناء المباراة لسا ما بُنيت.');
        });
    }

    /* ======================================================================
     *  3) شاشة الإعدادات -- قالب "settings-no-box" (منقول من روليت
     *     القبائل/تحدي الصور)
     * ==================================================================== */
    function ensureRoot() {
        if (_rootEl) return _rootEl;
        document.body.classList.add('kz-active');
        _rootEl = document.createElement('div');
        _rootEl.id = 'kz-settings';
        document.body.appendChild(_rootEl);
        return _rootEl;
    }

    function renderSettingsScreen() {
        _screen = 'settings';
        var root = ensureRoot();
        root.style.display = 'block';

        var joinPills = [
            { value: false, label: 'الجميع' },
            { value: true, label: 'المتابعون فقط' }
        ].map(function (opt) {
            var active = (_settings.followersOnly === opt.value) ? ' kz-pill-active' : '';
            return '<button type="button" class="kz-pill-btn' + active + '" data-key="followersOnly" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');

        var choicePills = CHOICE_SECONDS_OPTIONS.map(function (v) {
            var active = (_settings.chooseSeconds === v) ? ' kz-pill-active' : '';
            return '<button type="button" class="kz-pill-btn' + active + '" data-key="chooseSeconds" data-value="' + v + '">' + v + 'ث</button>';
        }).join('');

        root.innerHTML =
            '<h2>إعدادات مباراة الخزنة</h2>' +

            '<div class="kz-field">' +
                '<label>اكتب يوزر البث بالتيك توك</label>' +
                '<input type="text" id="kz-input-username" placeholder="ayman_live" value="' + escapeAttr(_settings.tiktokUsername) + '">' +
            '</div>' +

            '<div class="kz-field">' +
                '<label>الكلمة المفتاحية للدخول</label>' +
                '<input type="text" id="kz-input-keyword" placeholder="اكتب الكلمة المفتاحية" value="' + escapeAttr(_settings.joinKeyword) + '">' +
            '</div>' +

            '<div class="kz-row" id="kz-row-followersOnly">' +
                '<div class="kz-pill-group">' + joinPills + '</div>' +
                '<span class="kz-row-label">🔑 مين يقدر يدخل؟</span>' +
            '</div>' +

            '<div class="kz-row" id="kz-row-chooseSeconds" style="flex-direction:column;align-items:stretch;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
                    '<div class="kz-pill-group">' + choicePills + '</div>' +
                    '<span class="kz-row-label">⏱️ وقت الاختيار</span>' +
                '</div>' +
                '<div class="kz-hint">عند انتهاء الوقت، يُقصى اللاعبون الذين لم يختاروا خياراً</div>' +
            '</div>' +

            '<div id="kz-settings-error" class="kz-error-msg" style="display:none;"></div>' +

            '<button type="button" id="kz-connect-btn" class="kz-btn-connect">اتصال بالبث وبدء الإعدادات</button>' +
            '<button type="button" id="kz-back-btn" class="kz-back-btn">🏠 رجوع لمنصة ألعاب أيمن</button>';

        wireSettingsHandlers();
    }

    function wireSettingsHandlers() {
        el('kz-input-username').addEventListener('input', function (e) { _settings.tiktokUsername = e.target.value; });
        el('kz-input-keyword').addEventListener('input', function (e) { _settings.joinKeyword = e.target.value; });

        el('kz-row-followersOnly').addEventListener('click', function (e) {
            var btn = e.target.closest('.kz-pill-btn'); if (!btn) return;
            _settings.followersOnly = (btn.getAttribute('data-value') === 'true');
            renderSettingsScreen();
        });
        el('kz-row-chooseSeconds').addEventListener('click', function (e) {
            var btn = e.target.closest('.kz-pill-btn'); if (!btn) return;
            _settings.chooseSeconds = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });

        el('kz-back-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('kz-connect-btn').addEventListener('click', handleConnectClick);
    }

    function showSettingsError(msg) {
        var errEl = el('kz-settings-error');
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.style.display = 'block';
    }

    function handleConnectClick() {
        var username = (_settings.tiktokUsername || '').trim();
        var keyword = normalizeArabicText(_settings.joinKeyword);

        if (!username) return showSettingsError('لازم تكتب يوزر البث أول.');
        if (!keyword) return showSettingsError('لازم تكتب الكلمة المفتاحية للدخول.');

        AGP.streamConnector.connect('tiktok', { username: username });
    }

    /* ======================================================================
     *  4) تبويب الاتصال بالبث -- يظهر فوق شاشة الإعدادات (منقول بالحرف من
     *     قالب روليت القبائل/تحدي الصور). زر ✕ عند الفشل يُخفي التبويب
     *     فقط، شاشة الإعدادات خلفه تبقى ظاهرة وتفاعلية.
     * ==================================================================== */
    function ensureConnectOverlay() {
        if (!el('kz-connect-dim')) {
            var dim = document.createElement('div');
            dim.id = 'kz-connect-dim';
            document.body.appendChild(dim);
        }
        if (!el('kz-connect-popup')) {
            var popup = document.createElement('div');
            popup.id = 'kz-connect-popup';
            document.body.appendChild(popup);
        }
        return el('kz-connect-popup');
    }

    function showConnectOverlay(isError) {
        var popup = ensureConnectOverlay();
        el('kz-connect-dim').style.display = 'block';
        popup.style.display = 'block';
        popup.classList.toggle('kz-connect-error', Boolean(isError));
        popup.innerHTML =
            (isError ? '<button type="button" id="kz-connect-close-btn">✕</button>' : '') +
            '<div class="' + (isError ? 'kz-connect-error-icon' : 'kz-connect-spinner') + '">' +
            (isError ? '⚠️' : '') + '</div>' +
            '<h3>' + (isError ? 'تعذّر الاتصال' : 'جاري الاتصال بالبث') + '</h3>' +
            '<p>' + (isError ? 'تأكد من اسم المستخدم وحاول مرة ثانية' : 'انتظر قليلاً...') + '</p>';
        if (isError) {
            el('kz-connect-close-btn').onclick = function () {
                hideConnectOverlay();
            };
        }
    }

    function hideConnectOverlay() {
        if (el('kz-connect-dim')) el('kz-connect-dim').style.display = 'none';
        if (el('kz-connect-popup')) el('kz-connect-popup').style.display = 'none';
    }

    /* ======================================================================
     *  5) الاستماع لأحداث المنصة العامة
     * ==================================================================== */
    function wirePlatformListeners() {
        AGP.events.on('stream:statusChanged', function (payload) {
            if (payload.platform !== 'tiktok') return;
            if (payload.status === 'connecting') {
                _screen = 'connecting';
                showConnectOverlay(false);
            } else if (payload.status === 'connected') {
                hideConnectOverlay();
                // ⚠️ بناء تدريجي: شاشة اللوبي غير مبنية بعد -- تحتاج تحديد
                // آلية اللعب الفعلية أولاً.
                AGP.log('Khazna: تم الاتصال بالبث -- شاشة اللوبي لسا ما بُنيت.');
            } else if (payload.status === 'error') {
                showConnectOverlay(true);
            }
        });
    }

    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'elimination-games',
            onLoad: function () { AGP.log('Khazna: onLoad.'); },
            onRoundEnd: function () { AGP.log('Khazna: onRoundEnd.'); },
            onDestroy: function () { AGP.log('Khazna: onDestroy.'); }
        });

        if (!registered) { AGP.log('Khazna: registration failed (already registered?).'); return; }

        AGP.gameManager.loadGame(GAME_ID);

        injectHeader();
        wirePlatformListeners();
        renderSettingsScreen();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerGame);
    } else {
        registerGame();
    }

})(window.AymanGamesPlatform);
