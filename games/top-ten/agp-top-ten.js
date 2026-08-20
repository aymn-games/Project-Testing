/**
 * ==========================================================================
 *  خمّن العشرة (Guess the Ten) — لعبة أصلية (Native) مستقلة بالكامل
 * ==========================================================================
 * سؤال واحد في كل جولة (مثال: "اكتب عشر أشياء نسويها بالسفر")، وعشرة
 * صناديق مرتبة من 1 إلى 10. الصندوق رقم 1 يساوي 10 نقاط، وكل صندوق
 * بعده تنزل نقطته وحدة لين صندوق رقم 10 يساوي نقطة وحدة (يعني ترتيب
 * الصناديق = ترتيب أهمية الإجابة بالسؤال، مو ترتيب اكتشافها).
 *
 * المشاهدون يكتبون الكلمة المفتاحية بالشات عشان ينضمون كمتسابقين (ينفتح
 * الانضمام من اللوبي ويستمر طول المباراة، عشان أي متأخر يقدر يشارك).
 * بعدها أي متسابق منضم يكتب إجابة تطابق أحد الصناديق المتبقية (مطابقة
 * تلقائية بالكامل عبر تطبيع النص العربي) يفوز بالصندوق فوراً — اسمه
 * وصورته يظهرون بالصندوق مع نقاطه.
 *
 * المضيف يتحكم بزرين فقط أثناء كل سؤال:
 *   - "السؤال التالي" -> يقفل السؤال الحالي (يكشف أي صندوق ما تم
 *     تخمينه بدون نقاط)، ويُحتسب كـ"جولة مكتملة" فعلية.
 *   - "تخطي" -> يلغي السؤال الحالي بالكامل بدون احتساب جولة، وينتقل
 *     لسؤال ثاني من نفس البنك.
 * تنتهي المباراة تلقائياً عند الوصول لعدد الجولات المكتملة المستهدف،
 * وتظهر بطاقة الفائز (الأعلى نقاطاً بكل المباراة) بنفس نمط نقاط منصة
 * ألعاب أيمن الحقيقية (window.AGPAuth) المتّبع بلعبة "اسم و حيوان...".
 *
 * ⚠️ بنك الأسئلة خارجي بالكامل — ما فيه أي إدارة أسئلة بشاشة الإعدادات
 *   هنا إطلاقاً. اللعبة تقرأ ملف games/top-ten/questions-bank.json
 *   (نفس المجلد) وقت التحميل فقط، وهذا الملف يُدار حصراً من صفحة
 *   admin-questions.html (محمية بتسجيل دخول الأدمن عبر
 *   window.AGPAuth.requireAdmin — نفس آلية admin.html الموجودة أصلاً،
 *   بدون أي تعديل أو نقطة API جديدة على الباك اند). لو تعذّر تحميل
 *   الملف (أول نشر قبل رفعه، أو خطأ شبكة)، تُستخدَم مجموعة احتياطية
 *   صغيرة مضمّنة هنا (BUILTIN_FALLBACK_QUESTIONS) حتى لا تنهار اللعبة.
 *
 * إعداد "المسموح له بالانضمام": الجميع أو المتابعون فقط — يُطبَّق على
 *   لحظة قبول الكلمة المفتاحية فقط (payload.isFollower من الباك اند)،
 *   ولا يمنع أي لاعب منضم مسبقاً من الإجابة بعدها.
 *
 * هوية بصرية بلونين فقط (أخضر زمردي + ذهبي) بدرجات وشفافيات مختلفة —
 * لا لون ثالث حقيقي بالتصميم (الأبيض/الأسود للنصوص والظلال فقط).
 *
 * لا اعتماد على js/agp-game-shell.js المشترك ولا على أي لعبة ثانية —
 * كل شيء هنا مستقل بالكامل (بنفس فلسفة games/team-war). لا تعديل على
 * أي ملف موجود بالمشروع غير هذا المجلد + بطاقة اللعبة بـ index.html.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'top-ten';
    var GAME_NAME = 'خمّن العشرة';
    var QUESTIONS_BANK_URL = 'questions-bank.json';
    var ROUNDS_OPTIONS = [3, 5, 7, 10];
    var JOIN_ACCESS_OPTIONS = [
        { value: 'everyone', label: 'الجميع' },
        { value: 'followers', label: 'المتابعون فقط' }
    ];

    /* ======================================================================
     *  0) بنك أسئلة احتياطي (Fallback) فقط — يُستخدَم حصراً لو تعذّر تحميل
     *     games/top-ten/questions-bank.json (أول نشر قبل رفعه، أو خطأ
     *     شبكة). المصدر الحقيقي دايماً هو ذاك الملف، يُدار من
     *     admin-questions.html — لا علاقة لهذه القائمة بأي شاشة إعدادات.
     * ==================================================================== */
    var BUILTIN_FALLBACK_QUESTIONS = [
        {
            id: 'b1', builtin: true, prompt: 'اكتب عشر أشياء نسويها قبل السفر',
            answers: [
                { text: 'حجز', aliases: ['الحجز'] },
                { text: 'جواز', aliases: ['الجواز', 'باسبور'] },
                { text: 'شنطة', aliases: ['الشنطة'] },
                { text: 'تأمين', aliases: ['التأمين'] },
                { text: 'فلوس', aliases: ['الفلوس', 'كاش'] },
                { text: 'طقس', aliases: ['الطقس', 'جو'] },
                { text: 'شاحن', aliases: ['الشاحن'] },
                { text: 'برنامج', aliases: ['البرنامج', 'خطة'] },
                { text: 'وداع', aliases: ['الوداع'] },
                { text: 'ستوري', aliases: ['الستوري'] }
            ]
        },
        {
            id: 'b2', builtin: true, prompt: 'اكتب عشر أشياء تخلي البث المباشر ينجح',
            answers: [
                { text: 'محتوى', aliases: ['المحتوى'] },
                { text: 'صوت', aliases: ['الصوت'] },
                { text: 'تفاعل', aliases: ['التفاعل'] },
                { text: 'توقيت', aliases: ['التوقيت', 'جدول'] },
                { text: 'إضاءة', aliases: ['الإضاءة'] },
                { text: 'ألعاب', aliases: ['الألعاب'] },
                { text: 'نت', aliases: ['النت', 'انترنت'] },
                { text: 'دعوة', aliases: ['الدعوة'] },
                { text: 'شكر', aliases: ['الشكر'] },
                { text: 'مقدمة', aliases: ['المقدمة', 'افتتاحية'] }
            ]
        },
        {
            id: 'b3', builtin: true, prompt: 'اكتب عشر أشياء نسويها يوم الجمعة',
            answers: [
                { text: 'صلاة', aliases: ['الصلاة'] },
                { text: 'غداء', aliases: ['الغداء'] },
                { text: 'زيارة', aliases: ['الزيارة'] },
                { text: 'راحة', aliases: ['الراحة', 'نوم'] },
                { text: 'طلعة', aliases: ['الطلعة'] },
                { text: 'مباراة', aliases: ['المباراة'] },
                { text: 'فطور', aliases: ['الفطور'] },
                { text: 'ترتيب', aliases: ['الترتيب', 'تنظيف'] },
                { text: 'بث', aliases: ['البث', 'لايف'] },
                { text: 'مشي', aliases: ['المشي', 'تمشية'] }
            ]
        },
        {
            id: 'b4', builtin: true, prompt: 'اكتب عشر أشياء لازم تكون بسيارتك',
            answers: [
                { text: 'إطار', aliases: ['الإطار'] },
                { text: 'شاحن', aliases: ['الشاحن'] },
                { text: 'ماء', aliases: ['الماء', 'مويه'] },
                { text: 'إسعافات', aliases: ['الإسعافات'] },
                { text: 'كبل', aliases: ['الكبل', 'جمبر'] },
                { text: 'مناديل', aliases: ['المناديل'] },
                { text: 'خريطة', aliases: ['الخريطة'] },
                { text: 'استمارة', aliases: ['الاستمارة', 'رخصة'] },
                { text: 'نظارة', aliases: ['النظارة'] },
                { text: 'سماعات', aliases: ['السماعات'] }
            ]
        },
        {
            id: 'b5', builtin: true, prompt: 'اكتب عشر أشياء نسويها استعداد لرمضان',
            answers: [
                { text: 'تسوق', aliases: ['التسوق'] },
                { text: 'تنظيف', aliases: ['التنظيف'] },
                { text: 'نوم', aliases: ['النوم'] },
                { text: 'قرآن', aliases: ['القرآن'] },
                { text: 'زينة', aliases: ['الزينة', 'فوانيس'] },
                { text: 'صدقة', aliases: ['الصدقة'] },
                { text: 'دعوات', aliases: ['الدعوات'] },
                { text: 'ملابس', aliases: ['الملابس'] },
                { text: 'قهوة', aliases: ['القهوة'] },
                { text: 'مسلسلات', aliases: ['المسلسلات'] }
            ]
        },
        {
            id: 'b6', builtin: true, prompt: 'اكتب عشر أشياء يحبها كل قيمر',
            answers: [
                { text: 'نت', aliases: ['النت'] },
                { text: 'سماعة', aliases: ['السماعة', 'هيدسيت'] },
                { text: 'كرسي', aliases: ['الكرسي'] },
                { text: 'شاشة', aliases: ['الشاشة'] },
                { text: 'فريق', aliases: ['الفريق', 'قروب'] },
                { text: 'كنترول', aliases: ['الكنترول'] },
                { text: 'خصومات', aliases: ['الخصومات'] },
                { text: 'بث', aliases: ['البث'] },
                { text: 'تحديثات', aliases: ['التحديثات'] },
                { text: 'إنجازات', aliases: ['الإنجازات', 'تروفيهات'] }
            ]
        },
        {
            id: 'b7', builtin: true, prompt: 'اكتب عشر أشياء نسويها بعطلة نهاية الأسبوع',
            answers: [
                { text: 'راحة', aliases: ['الراحة'] },
                { text: 'عائلة', aliases: ['العائلة'] },
                { text: 'رياضة', aliases: ['الرياضة', 'مشي'] },
                { text: 'مسلسل', aliases: ['المسلسل'] },
                { text: 'ترتيب', aliases: ['الترتيب'] },
                { text: 'مطعم', aliases: ['المطعم', 'كافيه'] },
                { text: 'قيمنق', aliases: ['القيمنق'] },
                { text: 'تسوق', aliases: ['التسوق', 'شوبينق'] },
                { text: 'زيارة', aliases: ['الزيارة'] },
                { text: 'بث', aliases: ['البث'] }
            ]
        },
        {
            id: 'b8', builtin: true, prompt: 'اكتب عشر أشياء تخلي الضيافة السعودية مميزة',
            answers: [
                { text: 'قهوة', aliases: ['القهوة'] },
                { text: 'كرم', aliases: ['الكرم'] },
                { text: 'مجلس', aliases: ['المجلس'] },
                { text: 'بخور', aliases: ['البخور'] },
                { text: 'عسل', aliases: ['العسل'] },
                { text: 'إصغاء', aliases: ['الإصغاء', 'استماع'] },
                { text: 'توديع', aliases: ['التوديع'] },
                { text: 'تنويع', aliases: ['التنويع'] },
                { text: 'تفاصيل', aliases: ['التفاصيل'] },
                { text: 'هدية', aliases: ['الهدية'] }
            ]
        },
        {
            id: 'b9', builtin: true, prompt: 'اكتب عشر أسباب تخلينا نحب بث التيك توك لايف',
            answers: [
                { text: 'تفاعل', aliases: ['التفاعل'] },
                { text: 'أصدقاء', aliases: ['الأصدقاء', 'صداقات'] },
                { text: 'ضحك', aliases: ['الضحك'] },
                { text: 'تعلم', aliases: ['التعلم'] },
                { text: 'مشاركة', aliases: ['المشاركة'] },
                { text: 'ألعاب', aliases: ['الألعاب'] },
                { text: 'هدايا', aliases: ['الهدايا'] },
                { text: 'مواهب', aliases: ['المواهب'] },
                { text: 'ذكريات', aliases: ['الذكريات'] },
                { text: 'متعة', aliases: ['المتعة'] }
            ]
        },
        {
            id: 'b10', builtin: true, prompt: 'اكتب عشر أشياء نسويها أول يوم دوام جديد',
            answers: [
                { text: 'حضور', aliases: ['الحضور'] },
                { text: 'زملاء', aliases: ['الزملاء', 'فريق'] },
                { text: 'مكتب', aliases: ['المكتب'] },
                { text: 'تعليمات', aliases: ['التعليمات'] },
                { text: 'لبس', aliases: ['اللبس'] },
                { text: 'لابتوب', aliases: ['اللابتوب'] },
                { text: 'نظام', aliases: ['النظام'] },
                { text: 'مهام', aliases: ['المهام'] },
                { text: 'واي فاي', aliases: ['الواي فاي', 'wifi'] },
                { text: 'ستوري', aliases: ['الستوري'] }
            ]
        }
    ];

    /* ======================================================================
     *  1) أدوات عامة
     * ==================================================================== */
    function el(id) { return document.getElementById(id); }
    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function escapeAttr(str) { return escapeHtml(str); }

    function normalizeArabicText(text) {
        if (typeof text !== 'string') return '';
        return text
            .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
            .replace(/[إأآا]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/[^\u0600-\u06FF0-9a-zA-Z ]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function shuffleArray(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    function isAnswerMatch(commentNorm, answerNorm) {
        if (!commentNorm || !answerNorm) return false;
        if (commentNorm === answerNorm) return true;
        if (answerNorm.length >= 3 && commentNorm.indexOf(answerNorm) !== -1) return true;
        if (commentNorm.length >= 3 && commentNorm.length <= 40 && answerNorm.indexOf(commentNorm) !== -1) return true;
        return false;
    }

    /**
     * فحص واجهة فقط (UX) — يخفي رابط "إدارة بنك الأسئلة" عن أي ستريمر
     * ثاني يفتح نفس اللعبة مستقبلاً، حتى ما يتشتت برابط ما يقدر يستخدمه.
     * هذا مو الحماية الحقيقية — تلك موجودة أصلاً داخل admin-questions.html
     * نفسها (window.AGPAuth.requireAdmin يتحقق من الخادم فعلياً). حتى لو
     * ظهر الرابط لشخص ثاني بالخطأ (مثلاً بيانات محلية قديمة بالمتصفح)،
     * الصفحة نفسها ترفضه على أي حال.
     */
    function isCachedAdminUser() {
        try {
            return !!(window.AGPAuth && typeof window.AGPAuth.getCachedUser === 'function' &&
                window.AGPAuth.getCachedUser() && window.AGPAuth.getCachedUser().role === 'admin');
        } catch (err) { return false; }
    }

    /* ======================================================================
     *  2) الحالة العامة
     * ==================================================================== */
    var _screen = 'settings'; // settings | connecting | lobby | match | winner
    var _settings = {
        tiktokUsername: '',
        keyword: '',
        roundsTarget: 5,
        joinAccess: 'everyone' // 'everyone' | 'followers'
    };
    var _questionBank = BUILTIN_FALLBACK_QUESTIONS; // يُستبدَل بمحتوى questions-bank.json لو توفّر
    var _questionBankLoaded = false;
    var _pool = [];
    var _poolIndex = 0;
    var _currentQuestion = null;
    var _completedRounds = 0;
    var _matchStartedAt = null;
    var _adminPanelOpen = false;
    var _commentUnsub = null;
    var _recentComments = []; // آخر تعليقات وصلت — لصندوق التشخيص باللوبي فقط
    var _transitioning = false; // يمنع ضغط مزدوج على "تخطي/السؤال التالي" أثناء انتقال الجولة

    var _overlayEl = null, _lobbyEl = null, _matchEl = null, _adminEl = null, _winnerEl = null;

    /* ======================================================================
     *  0-ب) تحميل بنك الأسئلة الخارجي (questions-bank.json) — مرة وحدة
     *      عند تسجيل اللعبة، بدون أي حظر لباقي الواجهة أثناء الانتظار
     *      (الاتصال باللوبي وبدء المباراة يحتاجان تفاعل المستخدم أصلاً،
     *      يعطي وقت كافٍ للتحميل قبل أول استخدام فعلي للبنك).
     * ==================================================================== */
    function loadQuestionBank() {
        if (typeof fetch !== 'function') { _questionBankLoaded = true; return; }
        fetch(QUESTIONS_BANK_URL, { cache: 'no-store' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (data && Array.isArray(data.questions) && data.questions.length) {
                    _questionBank = data.questions;
                    AGP.log('Top Ten: loaded ' + data.questions.length + ' question(s) from questions-bank.json.');
                } else {
                    AGP.log('Top Ten: questions-bank.json missing/empty, using fallback bank.');
                }
            })
            .catch(function () { AGP.log('Top Ten: failed to fetch questions-bank.json, using fallback bank.'); })
            .then(function () { _questionBankLoaded = true; });
    }

    /* ======================================================================
     *  3) الهيدر + الصندوق العام (إعدادات/اتصال)
     * ==================================================================== */
    function injectHeader() {
        if (el('tt-header')) return;
        document.body.classList.add('tt-active');

        var header = document.createElement('div');
        header.id = 'tt-header';
        header.innerHTML =
            '<div id="tt-header-brand">' +
                '<a href="../../index.html"><img src="../../logo.png" alt="AGP" onerror="this.style.display=\'none\'"></a>' +
            '</div>' +
            '<div id="tt-header-title">🏆 ' + GAME_NAME + '</div>' +
            '<button id="tt-gear-btn" class="tt-header-icon-btn" title="إدارة المباراة" style="display:none;">⚙️</button>';
        document.body.appendChild(header);

        el('tt-gear-btn').addEventListener('click', openAdminPanel);
    }
    function showGearButton() { var btn = el('tt-gear-btn'); if (btn) btn.style.display = 'flex'; }
    function hideGearButton() { var btn = el('tt-gear-btn'); if (btn) btn.style.display = 'none'; }

    function ensureOverlay() {
        if (_overlayEl) return _overlayEl;
        _overlayEl = document.createElement('div');
        _overlayEl.id = 'tt-overlay';
        _overlayEl.innerHTML = '<div id="tt-box"></div>';
        document.body.appendChild(_overlayEl);
        return _overlayEl;
    }
    function hideOverlay() { if (_overlayEl) _overlayEl.style.display = 'none'; }
    function showOverlay() { ensureOverlay().style.display = 'flex'; }

    /* ======================================================================
     *  4) شاشة الإعدادات
     * ==================================================================== */
    function renderSettingsScreen() {
        _screen = 'settings';
        hideGearButton();
        showOverlay();
        var box = el('tt-box');

        var roundsPills = ROUNDS_OPTIONS.map(function (v) {
            var active = (_settings.roundsTarget === v) ? ' tt-pill-active' : '';
            return '<button type="button" class="tt-pill-btn tt-rounds-pill' + active + '" data-value="' + v + '">' + v + '</button>';
        }).join('');

        var accessPills = JOIN_ACCESS_OPTIONS.map(function (opt) {
            var active = (_settings.joinAccess === opt.value) ? ' tt-pill-active' : '';
            return '<button type="button" class="tt-pill-btn tt-access-pill' + active + '" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');

        box.innerHTML =
            '<button type="button" id="tt-settings-back-btn" class="tt-back-to-platform-link">🏠 رجوع للمنصة</button>' +
            '<h2>إعدادات مباراة ' + escapeHtml(GAME_NAME) + '</h2>' +

            '<div class="tt-row-field">' +
                '<input type="text" id="tt-input-username" placeholder="" value="' + escapeAttr(_settings.tiktokUsername) + '">' +
                '<label>اكتب يوزر بث التيك توك</label>' +
            '</div>' +

            '<div class="tt-row-field">' +
                '<input type="text" id="tt-input-keyword" placeholder="مثال: يلا" value="' + escapeAttr(_settings.keyword) + '">' +
                '<label>الكلمة المفتاحية للانضمام كمتسابق</label>' +
            '</div>' +

            '<div class="tt-field-label-center">مين مسموح له ينضم؟</div>' +
            '<div class="tt-pill-group" id="tt-access-group">' + accessPills + '</div>' +

            '<div class="tt-field-label-center">عدد الجولات (الأسئلة الفعلية المستهدفة)</div>' +
            '<div class="tt-pill-group" id="tt-rounds-group">' + roundsPills + '</div>' +
            '<div class="tt-hint">تخطي أي سؤال ما يُحتسب من هذا العدد.</div>' +
            (isCachedAdminUser() ? '<a href="admin-questions.html" target="_blank" class="tt-manage-questions-link">📋 عرض/إدارة بنك الأسئلة (صفحة أدمن منفصلة)</a>' : '') +

            '<div id="tt-settings-error" class="tt-error-msg" style="display:none;"></div>' +
            '<button type="button" id="tt-connect-btn" class="tt-btn-connect">اتصل بالبث وانتقل للوبي</button>';

        el('tt-settings-back-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        wireSettingsHandlers();
    }

    function wireSettingsHandlers() {
        el('tt-input-username').addEventListener('input', function (e) { _settings.tiktokUsername = e.target.value; });
        el('tt-input-keyword').addEventListener('input', function (e) { _settings.keyword = e.target.value; });

        el('tt-rounds-group').addEventListener('click', function (e) {
            var btn = e.target.closest('.tt-pill-btn'); if (!btn) return;
            _settings.roundsTarget = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });

        el('tt-access-group').addEventListener('click', function (e) {
            var btn = e.target.closest('.tt-pill-btn'); if (!btn) return;
            _settings.joinAccess = btn.getAttribute('data-value');
            renderSettingsScreen();
        });

        el('tt-connect-btn').addEventListener('click', handleConnectClick);
    }

    function showSettingsError(msg) {
        var errEl = el('tt-settings-error');
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.style.display = 'block';
    }

    function handleConnectClick() {
        var username = (_settings.tiktokUsername || '').trim();
        var keyword = (_settings.keyword || '').trim();

        if (!username) return showSettingsError('لازم تكتب يوزر البث أول.');
        if (!keyword) return showSettingsError('لازم تحدد كلمة مفتاحية للانضمام.');

        AGP.streamConnector.connect('tiktok', { username: username });
    }

    function renderConnectingScreen(message) {
        _screen = 'connecting';
        showOverlay();
        el('tt-box').innerHTML =
            '<h2>' + escapeHtml(GAME_NAME) + '</h2>' +
            '<div class="tt-connecting-box">' +
                '<div class="tt-spinner"></div>' +
                '<div>' + escapeHtml(message || 'جارِ الاتصال بالبث...') + '</div>' +
            '</div>';
    }

    /* ======================================================================
     *  5) اللوبي
     * ==================================================================== */
    function ensureLobbyEl() {
        if (_lobbyEl) return _lobbyEl;
        _lobbyEl = document.createElement('div');
        _lobbyEl.id = 'tt-lobby-screen';
        document.body.appendChild(_lobbyEl);
        return _lobbyEl;
    }

    function playerCardHtml(p, showFrame) {
        if (AGP.playerCard) {
            return AGP.playerCard.renderHtml(p, { showFrame: !!showFrame, basePath: '../../', outClass: 'tt-pcard-wrap' });
        }
        var avatar = p.avatarUrl ? escapeAttr(p.avatarUrl) : '';
        return '<span class="tt-pcard-wrap">' + (avatar ? '<img src="' + avatar + '">' : '') + escapeHtml(p.name || p.id) + '</span>';
    }
    function fitCardNames(rootEl) { if (AGP.playerCard && rootEl) AGP.playerCard.fitAllNames(rootEl); }

    function getRoster() {
        if (AGP.gameManager && typeof AGP.gameManager.getPlayers === 'function') return AGP.gameManager.getPlayers();
        if (AGP.player && typeof AGP.player.getAllPlayers === 'function') return AGP.player.getAllPlayers();
        return [];
    }

    function renderLobbyScreen() {
        _screen = 'lobby';
        hideOverlay();
        showGearButton();

        var root = ensureLobbyEl();
        root.style.display = 'block';
        root.innerHTML =
            '<h2 class="tt-lobby-heading">اللوبي بانتظار المتسابقين <span class="tt-lobby-heading-accent">' + escapeHtml(GAME_NAME) + '</span></h2>' +
            '<div class="tt-lobby-banner">عشان تدخل المسابقة اكتب بشات البث الكلمة: <b>' + escapeHtml(_settings.keyword) + '</b></div>' +
            '<div class="tt-lobby-count" id="tt-lobby-count"></div>' +
            '<div class="tt-player-grid" id="tt-lobby-grid"></div>' +
            '<div class="tt-lobby-btn-row">' +
                '<button type="button" id="tt-lobby-back-settings-btn" class="tt-lobby-row-btn tt-lobby-btn-settings">⚙️ العودة لإعدادات المباراة</button>' +
                '<button type="button" id="tt-start-match-btn" class="tt-lobby-row-btn tt-lobby-btn-start">ابدأ المباراة</button>' +
                '<button type="button" id="tt-lobby-back-platform-btn" class="tt-lobby-row-btn tt-lobby-btn-platform">🏠 رجوع لمنصة ألعاب أيمن</button>' +
            '</div>' +

            '<details class="tt-debug-feed">' +
                '<summary>🛠️ تشخيص: آخر التعليقات الواردة (لك أنت بس، ما يشوفه المشاهدين)</summary>' +
                '<div id="tt-debug-feed-list" class="tt-debug-feed-list"></div>' +
            '</details>';

        el('tt-start-match-btn').addEventListener('click', handleStartMatch);
        el('tt-lobby-back-platform-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('tt-lobby-back-settings-btn').addEventListener('click', function () {
            var ok = window.confirm('بترجع لشاشة الإعدادات وينقطع الاتصال الحالي بالبث. تبي تكمل؟');
            if (ok) window.location.reload();
        });

        renderLobbyPlayerGrid();
        renderDebugFeed();
    }

    function renderLobbyPlayerGrid() {
        var grid = el('tt-lobby-grid');
        if (!grid) return;
        var roster = getRoster();
        el('tt-lobby-count').textContent = roster.length + ' متسابق منضم';
        grid.innerHTML = roster.map(function (p) { return playerCardHtml(p, true); }).join('') || '<div class="tt-lobby-empty-hint">بانتظار أول متسابق...</div>';
        fitCardNames(grid);
    }

    function handleStartMatch() {
        var roster = getRoster();
        if (!roster.length) { window.alert('لازم متسابق واحد على الأقل ينضم قبل البدء.'); return; }

        AGP.scoreManager.reset();
        _completedRounds = 0;
        _matchStartedAt = Date.now();
        _transitioning = false;
        buildFreshPool();
        loadNextQuestionIntoCurrent();

        AGP.events.emit('game:roundStarted', { gameId: GAME_ID });
        renderMatchScreen();
    }

    /* ======================================================================
     *  6) استماع الشات (انضمام بالكلمة المفتاحية + مطابقة إجابات) — يبقى
     *     فعّالاً من اللوبي لين نهاية المباراة، عشان أي متأخر يقدر ينضم.
     * ==================================================================== */
    function trackRecentComment(payload, status) {
        _recentComments.unshift({ text: payload.text, name: payload.name || payload.id, status: status, t: Date.now() });
        if (_recentComments.length > 6) _recentComments.length = 6;
        renderDebugFeed();
    }

    function wireCommentListener() {
        if (_commentUnsub) return;
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!payload || typeof payload.text !== 'string' || !payload.id) return;
            if (_screen !== 'lobby' && _screen !== 'match') return;

            var norm = normalizeArabicText(payload.text);
            var kwNorm = normalizeArabicText(_settings.keyword);

            if (norm && kwNorm && norm === kwNorm) {
                if (_settings.joinAccess === 'followers' && !payload.isFollower) {
                    trackRecentComment(payload, 'مرفوض (مو متابع)');
                    return;
                }
                if (!AGP.player.hasPlayer(payload.id)) {
                    AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null });
                    trackRecentComment(payload, 'انضم ✅');
                } else {
                    trackRecentComment(payload, 'منضم مسبقاً');
                }
                return;
            }

            if (_screen !== 'match' || !_currentQuestion) { trackRecentComment(payload, '—'); return; }
            if (!AGP.player.hasPlayer(payload.id)) { trackRecentComment(payload, 'مو منضم'); return; }

            var beforeScore = _currentQuestion.answers.filter(function (a) { return a.revealed; }).length;
            tryMatchAnswer(payload, norm);
            var afterScore = _currentQuestion.answers.filter(function (a) { return a.revealed; }).length;
            trackRecentComment(payload, afterScore > beforeScore ? 'إجابة صحيحة ✅' : 'ما طابقت');
        });
    }

    function unwireCommentListener() {
        if (_commentUnsub) { _commentUnsub(); _commentUnsub = null; }
    }

    /* ======================================================================
     *  7) بنك الأسئلة أثناء المباراة (اختيار عشوائي بدون تكرار قدر الإمكان)
     * ==================================================================== */
    function buildFreshPool() {
        _pool = shuffleArray(_questionBank && _questionBank.length ? _questionBank : BUILTIN_FALLBACK_QUESTIONS);
        _poolIndex = 0;
    }

    function loadNextQuestionIntoCurrent() {
        if (!_pool.length) buildFreshPool();
        if (_poolIndex >= _pool.length) { _pool = shuffleArray(_pool); _poolIndex = 0; }
        var qDef = _pool[_poolIndex];
        _poolIndex++;

        _currentQuestion = {
            prompt: qDef.prompt,
            answers: qDef.answers.map(function (a, idx) {
                return {
                    text: a.text,
                    aliases: a.aliases || [],
                    points: 10 - idx,
                    rank: idx + 1,
                    revealed: false,
                    revealedBy: null
                };
            })
        };
    }

    function tryMatchAnswer(payload, commentNorm) {
        if (!commentNorm) return;
        var answers = _currentQuestion.answers;
        for (var i = 0; i < answers.length; i++) {
            var a = answers[i];
            if (a.revealed) continue;
            var candidates = [a.text].concat(a.aliases || []).map(normalizeArabicText);
            var matched = candidates.some(function (candNorm) { return isAnswerMatch(commentNorm, candNorm); });
            if (matched) {
                a.revealed = true;
                a.revealedBy = { id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null };
                AGP.scoreManager.addPoints(payload.id, a.points);
                renderBoxReveal(i);
                refreshLeaderboardIfOpen();
                checkAllRevealed();
                return;
            }
        }
    }

    function renderDebugFeed() {
        var listEl = el('tt-debug-feed-list');
        if (!listEl) return;
        listEl.innerHTML = _recentComments.map(function (c) {
            return '<div class="tt-debug-row"><b>' + escapeHtml(c.name) + ':</b> ' + escapeHtml(c.text) + ' <span class="tt-debug-status">(' + escapeHtml(c.status) + ')</span></div>';
        }).join('') || '<div class="tt-hint">ولا وصل أي تعليق بعد.</div>';
    }

    function checkAllRevealed() {
        var allDone = _currentQuestion.answers.every(function (a) { return a.revealed; });
        var banner = el('tt-all-guessed-banner');
        if (banner) banner.style.display = allDone ? 'block' : 'none';
    }

    /* ======================================================================
     *  8) شاشة المباراة
     * ==================================================================== */
    function ensureMatchEl() {
        if (_matchEl) return _matchEl;
        _matchEl = document.createElement('div');
        _matchEl.id = 'tt-match-screen';
        document.body.appendChild(_matchEl);
        return _matchEl;
    }

    function renderMatchScreen() {
        _screen = 'match';
        hideOverlay();
        if (_lobbyEl) _lobbyEl.style.display = 'none';
        showGearButton();

        var root = ensureMatchEl();
        root.style.display = 'block';
        root.innerHTML =
            '<div class="tt-match-topbar">' +
                '<div class="tt-round-badge-row">' +
                    '<div class="tt-round-badge">الجولة ' + (_completedRounds + 1) + ' من ' + _settings.roundsTarget + '</div>' +
                    '<button type="button" id="tt-leaderboard-toggle-btn" class="tt-leaderboard-toggle-btn">🏆 المتصدرين</button>' +
                '</div>' +
                '<div class="tt-question-banner">' + escapeHtml(_currentQuestion.prompt) + '</div>' +
            '</div>' +
            '<div id="tt-all-guessed-banner" class="tt-all-guessed-banner" style="display:none;">🎉 تم تخمين كل الصناديق! اضغط "السؤال التالي" للمتابعة.</div>' +
            '<div id="tt-round-recap-banner" class="tt-round-recap-banner" style="display:none;"></div>' +
            '<div class="tt-boxes-list" id="tt-boxes-list"></div>' +
            '<div class="tt-match-controls">' +
                '<button type="button" id="tt-skip-btn" class="tt-ctrl-btn tt-ctrl-skip">⏭️ تخطي (بدون احتساب)</button>' +
                '<button type="button" id="tt-next-btn" class="tt-ctrl-btn tt-ctrl-next">✅ السؤال التالي</button>' +
            '</div>';

        renderBoxesList();

        el('tt-skip-btn').addEventListener('click', handleSkipQuestion);
        el('tt-leaderboard-toggle-btn').addEventListener('click', openLeaderboardPanel);
        el('tt-next-btn').addEventListener('click', handleNextQuestion);
    }

    function boxInnerHtml(a) {
        if (!a.revealed) {
            return '<div class="tt-box-face tt-box-back">' +
                '<span class="tt-box-rank">' + a.rank + '</span>' +
                '<span class="tt-box-mark">؟</span>' +
                '<span class="tt-box-points">' + a.points + ' نقطة</span>' +
                '</div>' +
                '<div class="tt-box-face tt-box-front"></div>';
        }
        var isWinner = !!a.revealedBy;
        var cardHtml = isWinner ? '<div class="tt-box-player">' + playerCardHtml(a.revealedBy, false) + '</div>' : '<div class="tt-box-unclaimed">⏳</div>';
        return '<div class="tt-box-face tt-box-back"></div>' +
            '<div class="tt-box-face tt-box-front' + (isWinner ? ' tt-box-front-won' : ' tt-box-front-empty') + '">' +
                '<span class="tt-box-rank">' + a.rank + '</span>' +
                cardHtml +
                '<span class="tt-box-answer-text">' + escapeHtml(a.text) + '</span>' +
                '<span class="tt-box-points">+' + a.points + '</span>' +
            '</div>';
    }

    function renderBoxesList() {
        var listEl = el('tt-boxes-list');
        if (!listEl) return;
        listEl.innerHTML = _currentQuestion.answers.map(function (a, idx) {
            return '<div class="tt-box' + (a.revealed ? ' tt-box-revealed' : '') + '" id="tt-box-' + idx + '">' +
                '<div class="tt-box-inner">' + boxInnerHtml(a) + '</div>' +
                '</div>';
        }).join('');
        fitCardNames(listEl);
    }

    function renderBoxReveal(idx) {
        var boxEl = el('tt-box-' + idx);
        if (!boxEl) return;
        var a = _currentQuestion.answers[idx];
        boxEl.querySelector('.tt-box-inner').innerHTML = boxInnerHtml(a);
        boxEl.classList.add('tt-box-revealed');
        fitCardNames(boxEl);
    }

    var _leaderboardEl = null;
    var _leaderboardPanelOpen = false;

    function ensureLeaderboardOverlayEl() {
        if (_leaderboardEl) return _leaderboardEl;
        _leaderboardEl = document.createElement('div');
        _leaderboardEl.id = 'tt-leaderboard-overlay';
        document.body.appendChild(_leaderboardEl);
        return _leaderboardEl;
    }

    function openLeaderboardPanel() {
        _leaderboardPanelOpen = true;
        var root = ensureLeaderboardOverlayEl();
        root.style.display = 'flex';
        renderLeaderboardOverlayContent();
    }
    function closeLeaderboardPanel() {
        _leaderboardPanelOpen = false;
        if (_leaderboardEl) _leaderboardEl.style.display = 'none';
    }
    function refreshLeaderboardIfOpen() {
        if (_leaderboardPanelOpen) renderLeaderboardOverlayContent();
    }

    function renderLeaderboardOverlayContent() {
        var listEl0 = ensureLeaderboardOverlayEl();
        var roster = getRoster();
        var lb = AGP.scoreManager.getLeaderboard();
        var rows = lb.map(function (row, i) {
            var p = roster.filter(function (pp) { return pp.id === row.playerId; })[0] || { id: row.playerId, name: row.playerId };
            return '<div class="tt-lb-row">' +
                '<span class="tt-lb-rank">' + (i + 1) + '</span>' +
                playerCardHtml(p, false) +
                '<span class="tt-lb-score">' + row.score + '</span>' +
                '</div>';
        }).join('') || '<div class="tt-hint">ولا حد سجّل نقاط بعد.</div>';

        listEl0.innerHTML =
            '<div class="tt-leaderboard-box">' +
                '<button type="button" id="tt-leaderboard-close-btn" class="tt-admin-close">✖</button>' +
                '<h3>🏆 لوحة الصدارة</h3>' +
                '<div class="tt-leaderboard-list">' + rows + '</div>' +
            '</div>';

        el('tt-leaderboard-close-btn').addEventListener('click', closeLeaderboardPanel);
        fitCardNames(listEl0);
    }

    function handleSkipQuestion() {
        if (_transitioning) return;
        loadNextQuestionIntoCurrent();
        renderMatchScreen();
    }

    function handleNextQuestion() {
        if (_transitioning) return;
        _transitioning = true;
        el('tt-skip-btn').disabled = true;
        el('tt-next-btn').disabled = true;

        var missed = _currentQuestion.answers.filter(function (a) { return !a.revealed; }).map(function (a) { return a.text; });
        _currentQuestion.answers.forEach(function (a) { a.revealed = true; });
        renderBoxesList();

        var recapEl = el('tt-round-recap-banner');
        if (recapEl) {
            recapEl.innerHTML = missed.length
                ? '<b>❌ ما تم تخمينه هالجولة:</b> <span class="tt-recap-missed">' + missed.map(function (t) { return escapeHtml(t); }).join('، ') + '</span>'
                : '<b>🎉 تم تخمين كل إجابات هالجولة!</b>';
            recapEl.style.display = 'block';
        }

        _completedRounds++;
        window.setTimeout(function () {
            _transitioning = false;
            if (_completedRounds >= _settings.roundsTarget) {
                finalizeMatchAndShowWinner();
            } else {
                loadNextQuestionIntoCurrent();
                renderMatchScreen();
            }
        }, 1800);
    }

    /* ======================================================================
     *  9) لوحة الإدارة (⚙️ منتصف المباراة)
     * ==================================================================== */
    function ensureAdminEl() {
        if (_adminEl) return _adminEl;
        _adminEl = document.createElement('div');
        _adminEl.id = 'tt-admin-overlay';
        document.body.appendChild(_adminEl);
        return _adminEl;
    }

    function openAdminPanel() {
        _adminPanelOpen = true;
        var root = ensureAdminEl();
        root.style.display = 'flex';
        renderAdminPanel();
    }
    function closeAdminPanel() {
        _adminPanelOpen = false;
        if (_adminEl) _adminEl.style.display = 'none';
    }

    function renderAdminPanel() {
        var roster = getRoster();
        var lb = AGP.scoreManager.getLeaderboard();
        var rows = lb.map(function (row, i) {
            var p = roster.filter(function (pp) { return pp.id === row.playerId; })[0] || { id: row.playerId, name: row.playerId };
            return '<div class="tt-lb-row"><span class="tt-lb-rank">' + (i + 1) + '</span>' + playerCardHtml(p, false) + '<span class="tt-lb-score">' + row.score + '</span></div>';
        }).join('') || '<div class="tt-hint">لا نقاط بعد.</div>';

        ensureAdminEl().innerHTML =
            '<div class="tt-admin-box">' +
                '<button type="button" id="tt-admin-close-btn" class="tt-admin-close">✖</button>' +
                '<h3>إدارة مباراة ' + escapeHtml(GAME_NAME) + '</h3>' +
                '<div class="tt-hint">' + (_screen === 'match' ? ('الجولة ' + (_completedRounds + 1) + ' من ' + _settings.roundsTarget) : 'اللوبي مفتوح بانتظار البدء') + '</div>' +
                '<div class="tt-panel-title">🏆 لوحة الصدارة الكاملة</div>' +
                '<div class="tt-leaderboard-list">' + rows + '</div>' +
                (_screen === 'match' ? '<button type="button" id="tt-admin-end-btn" class="tt-btn-secondary tt-btn-danger">🏁 إنهاء المباراة الآن</button>' : '') +
                '<button type="button" id="tt-admin-platform-btn" class="tt-btn-secondary">🏠 رجوع لمنصة ألعاب أيمن</button>' +
            '</div>';

        el('tt-admin-close-btn').addEventListener('click', closeAdminPanel);
        el('tt-admin-platform-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        var endBtn = el('tt-admin-end-btn');
        if (endBtn) endBtn.addEventListener('click', function () {
            closeAdminPanel();
            finalizeMatchAndShowWinner();
        });
    }

    /* ======================================================================
     *  10) نهاية المباراة — بطاقة الفائز + نقاط منصة ألعاب أيمن الحقيقية
     *      (window.AGPAuth) بنفس نمط لعبة "اسم و حيوان ونبات وجماد وبلاد"
     * ==================================================================== */
    function finalizeMatchAndShowWinner() {
        closeLeaderboardPanel();
        var lb = AGP.scoreManager.getLeaderboard();
        var roster = getRoster();

        if (!lb.length) { renderLobbyAfterMatch(); return; }

        var winnerRow = lb[0];
        var champion = roster.filter(function (p) { return p.id === winnerRow.playerId; })[0] || { id: winnerRow.playerId, name: winnerRow.playerId };

        var durationMs = _matchStartedAt ? (Date.now() - _matchStartedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var participants = roster.map(function (p) {
                var id = (p && p.id) || '';
                var uname = id.indexOf('tiktok:') === 0 ? id.slice('tiktok:'.length) : (p.name || p.id);
                return { tiktokUsername: uname, won: p.id === champion.id };
            }).filter(function (p) { return p.tiktokUsername; });

            if (participants.length) {
                var championUname = (function () {
                    var id = champion.id || '';
                    return id.indexOf('tiktok:') === 0 ? id.slice('tiktok:'.length) : (champion.name || champion.id);
                })();
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs)
                    .then(function (res) {
                        var awarded = (res && Array.isArray(res.awarded)) ? res.awarded : [];
                        var match = awarded.filter(function (a) { return a.tiktokUsername === championUname; })[0];
                        return match || {};
                    })
                    .catch(function () { return null; });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        _screen = 'winner';
        if (_matchEl) _matchEl.style.display = 'none';
        hideGearButton();

        pointsPromise.then(function (pointsResult) {
            openWinnerScreen(champion, winnerRow, lb, roster, pointsResult);
        });
    }

    function ensureWinnerEl() {
        if (_winnerEl) return _winnerEl;
        _winnerEl = document.createElement('div');
        _winnerEl.id = 'tt-winner-overlay';
        document.body.appendChild(_winnerEl);
        return _winnerEl;
    }

    function openWinnerScreen(champion, winnerRow, fullLeaderboard, roster, pointsResult) {
        var root = ensureWinnerEl();
        root.style.display = 'flex';

        var pointsText;
        var pointsClass = '';
        if (pointsResult === null) {
            pointsText = 'تعذّر جلب نقاط المنصة الآن.';
        } else if (pointsResult && typeof pointsResult.added === 'number') {
            pointsClass = ' tt-has-points';
            pointsText = '⭐ +' + pointsResult.added + ' نقطة بمنصة ألعاب أيمن (المجموع: ' + pointsResult.totalPoints + ')';
        } else {
            pointsClass = ' tt-no-account';
            pointsText = 'لا يوجد حساب مرتبط بهذا اللاعب على المنصة بعد.';
        }

        var others = fullLeaderboard.slice(1, 6).map(function (row, i) {
            var p = roster.filter(function (pp) { return pp.id === row.playerId; })[0] || { id: row.playerId, name: row.playerId };
            return '<div class="tt-lb-row"><span class="tt-lb-rank">' + (i + 2) + '</span>' + playerCardHtml(p, false) + '<span class="tt-lb-score">' + row.score + '</span></div>';
        }).join('');

        root.innerHTML =
            '<div class="tt-winner-box">' +
                '<div class="tt-winner-title">🏆 الفائز بمباراة ' + escapeHtml(GAME_NAME) + '</div>' +
                '<div class="tt-winner-avatar-wrap">' + playerCardHtml(champion, true) + '</div>' +
                '<div class="tt-winner-name">' + escapeHtml(champion.name || champion.id) + '</div>' +
                '<div class="tt-winner-score">' + winnerRow.score + ' نقطة بعد ' + _settings.roundsTarget + ' جولة</div>' +
                '<div class="tt-winner-points-text' + pointsClass + '">' + pointsText + '</div>' +
                (others ? '<div class="tt-panel-title">باقي المتصدرين</div><div class="tt-leaderboard-list">' + others + '</div>' : '') +
                '<div class="tt-winner-btn-row">' +
                    '<button type="button" id="tt-rematch-btn" class="tt-lobby-row-btn tt-lobby-btn-start">🔁 مباراة جديدة (نفس المتسابقين)</button>' +
                    '<button type="button" id="tt-winner-platform-btn" class="tt-lobby-row-btn tt-lobby-btn-platform">🏠 رجوع لمنصة ألعاب أيمن</button>' +
                '</div>' +
            '</div>';

        fitCardNames(root);
        el('tt-winner-platform-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('tt-rematch-btn').addEventListener('click', function () {
            root.style.display = 'none';
            AGP.scoreManager.reset();
            _completedRounds = 0;
            _matchStartedAt = Date.now();
            _transitioning = false;
            buildFreshPool();
            loadNextQuestionIntoCurrent();
            AGP.events.emit('game:roundStarted', { gameId: GAME_ID });
            renderMatchScreen();
        });
    }

    function renderLobbyAfterMatch() {
        // حالة نادرة: انتهت المباراة بدون أي نقطة مسجّلة — نرجع للوبي بدل بطاقة فائز فاضية.
        window.alert('ما فيه أي نقاط اتسجلت هالمباراة — نرجعك للوبي.');
        renderLobbyScreen();
    }

    /* ======================================================================
     *  11) الاستماع لأحداث المنصة العامة + التسجيل
     * ==================================================================== */
    function wirePlatformListeners() {
        AGP.events.on('stream:statusChanged', function (payload) {
            if (payload.platform !== 'tiktok') return;
            if (payload.status === 'connecting') renderConnectingScreen('جارِ الاتصال بالبث...');
            else if (payload.status === 'connected' && _screen !== 'lobby' && _screen !== 'match' && _screen !== 'winner') {
                // ⚠️ إصلاح خطأ حقيقي: AGP.player.addPlayer/getAllPlayers يعتمدان
                // على AGP.session.getPlayersRef() الموجودة أصلاً — بدون جلسة
                // نشطة فعلاً (AGP.session.createSession)، ترجع تلك الدالة
                // مصفوفة فاضية جديدة كل مرة (راجع js/agp-session.js)، فيختفي
                // أي لاعب انضم فوراً رغم نجاح addPlayer نفسها ظاهرياً. الحل
                // الرسمي الموجود أصلاً بالمنصة هو AGP.lobby.open() (نفس ما
                // تستخدمه games/team-war بالضبط) — تتكفّل بإنشاء الجلسة/الغرفة
                // بأمان (عبر AGP.roomsManager إن وُجد) قبل فتح التسجيل.
                if (AGP.lobby && typeof AGP.lobby.open === 'function') AGP.lobby.open();
                wireCommentListener();
                renderLobbyScreen();
            }
            else if (payload.status === 'error') { renderSettingsScreen(); showSettingsError('تعذّر الاتصال -- تحقّق من اليوزرنيم وحاول مرة أخرى.'); }
        });

        AGP.events.on('player:joined', function () {
            if (_screen === 'lobby') renderLobbyPlayerGrid();
            if (_adminPanelOpen) renderAdminPanel();
            refreshLeaderboardIfOpen();
        });
        AGP.events.on('player:removed', function () {
            if (_screen === 'lobby') renderLobbyPlayerGrid();
            if (_adminPanelOpen) renderAdminPanel();
            refreshLeaderboardIfOpen();
        });
        AGP.events.on('score:changed', function () {
            if (_adminPanelOpen) renderAdminPanel();
            refreshLeaderboardIfOpen();
        });
    }

    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'trivia-games',
            onLoad: function () { AGP.log('Top Ten: onLoad.'); },
            onRoundEnd: function () { AGP.log('Top Ten: onRoundEnd.'); },
            onDestroy: function () { AGP.log('Top Ten: onDestroy.'); unwireCommentListener(); }
        });

        if (!registered) { AGP.log('Top Ten: registration failed (already registered?).'); return; }

        AGP.gameManager.loadGame(GAME_ID);

        injectHeader();
        wirePlatformListeners();
        loadQuestionBank();
        renderSettingsScreen();
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager &&
        !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
