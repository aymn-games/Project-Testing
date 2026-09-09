/**
 * ==========================================================================
 *  AGP CODENAMES -- "كود نيمز" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 * لعبة أصلية (Native) بنفس نمط games/khazna و games/team-war و
 * games/photo-challenge من ناحية طريقة التحميل (بدون js/agp-game-shell.js).
 * الهوية البصرية: قالب "settings-no-box" منقول بالحرف من روليت
 * القبائل/تحدي الصور/الخزنة (بدون صندوق يحيط الحقول، عنوان بتدرّج لوني،
 * حقول بخط سفلي بدل صناديق) + تبويب اتصال بالبث (سبينر / تحذير فشل) يظهر
 * فوق نفس الشاشة تماماً. خط Zain فقط. لا تعديل على أي ملف موجود بالمشروع.
 *
 * ⚠️ بناء تدريجي: هذا الملف حالياً يغطي شاشة الإعدادات + تبويب الاتصال
 * بالبث فقط (كما اعتُمد كنقطة بداية). بقية الشاشات (اللوبي، نظام QR/صفحة
 * الجوال الخاصة بالـ Spymaster، شاشة اللعبة الرئيسية 5x5، شاشة الفائز)
 * غير مبنية بعد -- تحتاج تصميم منفصل قبل بنائها (خصوصاً بنية QR/الجوال
 * التي لا سابقة لها بأي لعبة أخرى بالمنصة).
 *
 * الخدمات العامة المُعاد استخدامها بدون أي تعديل عليها:
 *   AGP.player / AGP.playerCard / AGP.timerManager / AGP.streamConnector /
 *   AGP.lobby / AGP.events
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.gameManager || !AGP.player || !AGP.timerManager || !AGP.streamConnector) {
        console.error('[AGP Codenames] AGP Core غير محمَّل بعد -- تأكد من ترتيب تحميل الملفات بـ index.html.');
        return;
    }

    var GAME_ID = 'codenames';
    var GAME_NAME = 'كود نيمز';

    /* ======================================================================
     *  0) الحالة الداخلية
     * ==================================================================== */
    var _screen = 'settings'; // settings | connecting | lobby (لاحقاً)
    function setScreen(name) { _screen = name; }

    var _rootEl = null;

    var _settings = {
        tiktokUsername: '',
        followersOnly: false,
        team1Name: 'الفريق الأحمر',
        team1Keyword: '',
        team2Name: 'الفريق الأزرق',
        team2Keyword: ''
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
     *  2) الهيدر الأساسي الثابت -- بهوية اللعبة (بنفسجي). بدون أيقونتي
     *     "!" و"⚙️" حالياً لأن التعليمات والدرج الجانبي غير مبنيين بعد
     *     بهذه المرحلة (شاشة إعدادات فقط).
     * ==================================================================== */
    function injectHeader() {
        if (el('cn-header')) return;
        var header = document.createElement('div');
        header.id = 'cn-header';
        header.innerHTML =
            '<div class="cn-header-icons">' +
                '<button type="button" class="cn-header-icon-btn" id="cn-header-home-btn" title="العودة للمنصة">🏠</button>' +
            '</div>' +
            '<div id="cn-header-title">' + escapeHtml(GAME_NAME) + '</div>' +
            '<div id="cn-header-brand"><img src="../../logo.png" alt="ألعاب أيمن" onerror="this.style.display=\'none\'"></div>';
        document.body.appendChild(header);

        el('cn-header-home-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
    }

    /* ======================================================================
     *  3) شاشة الإعدادات -- قالب "settings-no-box" (منقول من روليت
     *     القبائل/تحدي الصور/الخزنة)
     * ==================================================================== */
    function ensureRoot() {
        if (_rootEl) return _rootEl;
        document.body.classList.add('cn-active');
        _rootEl = document.createElement('div');
        _rootEl.id = 'cn-settings';
        document.body.appendChild(_rootEl);
        return _rootEl;
    }

    function renderSettingsScreen() {
        setScreen('settings');
        var root = ensureRoot();
        root.style.display = 'block';

        var joinPills = [
            { value: false, label: 'الجميع' },
            { value: true, label: 'المتابعون فقط' }
        ].map(function (opt) {
            var active = (_settings.followersOnly === opt.value) ? ' cn-pill-active' : '';
            return '<button type="button" class="cn-pill-btn' + active + '" data-key="followersOnly" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');

        root.innerHTML =
            '<h2>إعدادات مباراة كود نيمز</h2>' +

            '<div class="cn-field">' +
                '<label>اكتب يوزر البث بالتيك توك</label>' +
                '<input type="text" id="cn-input-username" placeholder="ayman_live" value="' + escapeAttr(_settings.tiktokUsername) + '">' +
            '</div>' +

            '<div class="cn-field cn-team1">' +
                '<label>اسم الفريق الأحمر</label>' +
                '<input type="text" id="cn-input-team1Name" value="' + escapeAttr(_settings.team1Name) + '">' +
            '</div>' +
            '<div class="cn-field cn-team1">' +
                '<label>الكلمة المفتاحية للفريق الأحمر</label>' +
                '<input type="text" id="cn-input-team1Keyword" placeholder="اكتب الكلمة المفتاحية" value="' + escapeAttr(_settings.team1Keyword) + '">' +
            '</div>' +

            '<div class="cn-field cn-team2">' +
                '<label>اسم الفريق الأزرق</label>' +
                '<input type="text" id="cn-input-team2Name" value="' + escapeAttr(_settings.team2Name) + '">' +
            '</div>' +
            '<div class="cn-field cn-team2">' +
                '<label>الكلمة المفتاحية للفريق الأزرق</label>' +
                '<input type="text" id="cn-input-team2Keyword" placeholder="اكتب الكلمة المفتاحية" value="' + escapeAttr(_settings.team2Keyword) + '">' +
            '</div>' +

            '<div class="cn-row" id="cn-row-followersOnly">' +
                '<div class="cn-pill-group">' + joinPills + '</div>' +
                '<span class="cn-row-label">🔑 مين يقدر يدخل؟</span>' +
            '</div>' +

            '<div id="cn-settings-error" class="cn-error-msg" style="display:none;"></div>' +

            '<button type="button" id="cn-connect-btn" class="cn-btn-connect">اتصال بالبث وبدء الإعدادات</button>' +
            '<button type="button" id="cn-back-btn" class="cn-back-btn">🏠 رجوع لمنصة ألعاب أيمن</button>';

        wireSettingsHandlers();
    }

    function wireSettingsHandlers() {
        el('cn-input-username').addEventListener('input', function (e) { _settings.tiktokUsername = e.target.value; });
        el('cn-input-team1Name').addEventListener('input', function (e) { _settings.team1Name = e.target.value; });
        el('cn-input-team1Keyword').addEventListener('input', function (e) { _settings.team1Keyword = e.target.value; });
        el('cn-input-team2Name').addEventListener('input', function (e) { _settings.team2Name = e.target.value; });
        el('cn-input-team2Keyword').addEventListener('input', function (e) { _settings.team2Keyword = e.target.value; });

        el('cn-row-followersOnly').addEventListener('click', function (e) {
            var btn = e.target.closest('.cn-pill-btn'); if (!btn) return;
            _settings.followersOnly = (btn.getAttribute('data-value') === 'true');
            renderSettingsScreen();
        });

        el('cn-back-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('cn-connect-btn').addEventListener('click', handleConnectClick);
    }

    function showSettingsError(msg) {
        var errEl = el('cn-settings-error');
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.style.display = 'block';
    }

    function handleConnectClick() {
        var username = (_settings.tiktokUsername || '').trim();
        var kw1 = normalizeArabicText(_settings.team1Keyword);
        var kw2 = normalizeArabicText(_settings.team2Keyword);

        if (!username) return showSettingsError('لازم تكتب يوزر البث أول.');
        if (!kw1) return showSettingsError('لازم تكتب الكلمة المفتاحية للفريق الأحمر.');
        if (!kw2) return showSettingsError('لازم تكتب الكلمة المفتاحية للفريق الأزرق.');
        if (kw1 === kw2) return showSettingsError('لازم الكلمتين المفتاحيتين تكونان مختلفتين.');

        AGP.streamConnector.connect('tiktok', { username: username });
    }

    /* ======================================================================
     *  4) تبويب الاتصال بالبث -- يظهر فوق شاشة الإعدادات (منقول بالحرف من
     *     قالب روليت القبائل/تحدي الصور/الخزنة). زر ✕ عند الفشل يُخفي
     *     التبويب فقط، شاشة الإعدادات خلفه تبقى ظاهرة وتفاعلية.
     * ==================================================================== */
    function ensureConnectOverlay() {
        if (!el('cn-connect-dim')) {
            var dim = document.createElement('div');
            dim.id = 'cn-connect-dim';
            document.body.appendChild(dim);
        }
        if (!el('cn-connect-popup')) {
            var popup = document.createElement('div');
            popup.id = 'cn-connect-popup';
            document.body.appendChild(popup);
        }
        return el('cn-connect-popup');
    }

    function showConnectOverlay(isError) {
        var popup = ensureConnectOverlay();
        el('cn-connect-dim').style.display = 'block';
        popup.style.display = 'block';
        popup.classList.toggle('cn-connect-error', Boolean(isError));
        popup.innerHTML =
            (isError ? '<button type="button" id="cn-connect-close-btn">✕</button>' : '') +
            '<div class="' + (isError ? 'cn-connect-error-icon' : 'cn-connect-spinner') + '">' +
            (isError ? '⚠️' : '') + '</div>' +
            '<h3>' + (isError ? 'تعذّر الاتصال' : 'جاري الاتصال بالبث') + '</h3>' +
            '<p>' + (isError ? 'تأكد من اسم المستخدم وحاول مرة ثانية' : 'انتظر قليلاً...') + '</p>';
        if (isError) {
            el('cn-connect-close-btn').onclick = function () {
                hideConnectOverlay();
            };
        }
    }

    function hideConnectOverlay() {
        if (el('cn-connect-dim')) el('cn-connect-dim').style.display = 'none';
        if (el('cn-connect-popup')) el('cn-connect-popup').style.display = 'none';
    }

    /* ======================================================================
     *  5) الاستماع لأحداث المنصة العامة (اتصال البث)
     * ==================================================================== */
    function ensureReconnectBadgeEl() {
        if (el('cn-reconnect-badge')) return;
        var badge = document.createElement('div');
        badge.id = 'cn-reconnect-badge';
        badge.innerHTML = '<span class="cn-reconnect-spinner"></span><span id="cn-reconnect-text">🔄 يعيد الاتصال بالبث...</span>';
        document.body.appendChild(badge);
    }

    function wirePlatformListeners() {
        AGP.events.on('stream:statusChanged', function (payload) {
            var status = payload && payload.status;

            if (_screen === 'settings' || _screen === 'connecting') {
                if (status === 'connecting') {
                    setScreen('connecting');
                    showConnectOverlay(false);
                } else if (status === 'connected') {
                    hideConnectOverlay();
                    // اللوبي غير مبني بعد بهذه المرحلة -- سيُستكمل لاحقاً
                    setScreen('lobby-pending');
                } else if (status === 'error' || status === 'disconnected') {
                    setScreen('settings');
                    showConnectOverlay(true);
                }
                return;
            }

            // بعد بدء المباراة (مراحل لاحقة غير مبنية بعد): شارة إعادة اتصال بسيطة فقط
            ensureReconnectBadgeEl();
            var badge = el('cn-reconnect-badge');
            if (status === 'connecting' || status === 'disconnected') {
                badge.style.display = 'flex';
            } else if (status === 'connected') {
                badge.style.display = 'none';
            }
        });
    }

    /* ======================================================================
     *  6) نقطة الدخول
     * ==================================================================== */
    function init() {
        injectHeader();
        renderSettingsScreen();
        wirePlatformListeners();
        AGP.log('[AGP Codenames] تم تحميل شاشة الإعدادات.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    AGP.codenames = {
        GAME_ID: GAME_ID,
        GAME_NAME: GAME_NAME
    };

}(window.AymanGamesPlatform));
