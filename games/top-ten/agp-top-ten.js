/**
 * ==========================================================================
 *  أهم عشرة (Top Ten) — لعبة أصلية (Native) مستقلة بالكامل
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
    var GAME_NAME = 'أهم عشرة';
    var STORAGE_KEY_CUSTOM_QUESTIONS = 'topten:customQuestions';
    var ROUNDS_OPTIONS = [3, 5, 7, 10];

    /* ======================================================================
     *  0) بنك الأسئلة الجاهز — كل سؤال فيه 10 إجابات مرتبة من الأهم
     *     (10 نقاط) للأقل أهمية (نقطة وحدة). aliases اختيارية لتحسين
     *     المطابقة التلقائية مع صيغ مختلفة لنفس الإجابة.
     * ==================================================================== */
    var BUILTIN_QUESTIONS = [
        {
            id: 'b1', builtin: true, prompt: 'اكتب عشر أشياء نسويها قبل السفر',
            answers: [
                { text: 'حجز الفندق والطيران', aliases: ['حجز الطيران', 'حجز الفندق', 'نحجز تذاكر'] },
                { text: 'نجهز جواز السفر والتأشيرة', aliases: ['الجواز', 'الباسبور', 'التأشيرة'] },
                { text: 'نحزم الشنطة', aliases: ['تحضير الشنطة', 'نرتب الشنطة'] },
                { text: 'نسوي تأمين السفر', aliases: ['التأمين', 'تأمين السفر'] },
                { text: 'نجهز الفلوس والعملة', aliases: ['نبدل عملة', 'نجهز الكاش'] },
                { text: 'نتأكد من الطقس بوجهتنا', aliases: ['نشوف الطقس', 'حالة الجو'] },
                { text: 'نشحن الجوال والباور بانك', aliases: ['نشحن الأجهزة', 'باور بانك'] },
                { text: 'نسوي خطة للأماكن اللي بنزورها', aliases: ['نرتب البرنامج', 'خطة الرحلة'] },
                { text: 'نودع الأهل', aliases: ['نسلم على الأهل'] },
                { text: 'نصور ستوري قبل الطيران', aliases: ['بوست السفر', 'نعلن اننا مسافرين'] }
            ]
        },
        {
            id: 'b2', builtin: true, prompt: 'اكتب عشر أشياء تخلي البث المباشر ينجح',
            answers: [
                { text: 'محتوى ممتع وتفاعلي', aliases: ['محتوى حلو', 'تفاعل'] },
                { text: 'جودة الصوت والصورة', aliases: ['جودة البث', 'كاميرا زينة'] },
                { text: 'تفاعل الستريمر مع الشات', aliases: ['يرد على الشات', 'يتفاعل مع المشاهدين'] },
                { text: 'وقت ثابت للبث', aliases: ['توقيت ثابت', 'جدول بث'] },
                { text: 'إضاءة وخلفية مرتبة', aliases: ['الإضاءة', 'الخلفية'] },
                { text: 'ألعاب تفاعلية تشد المشاهد', aliases: ['ألعاب تفاعلية'] },
                { text: 'نت قوي وثابت', aliases: ['انترنت زين', 'سرعة النت'] },
                { text: 'دعوة المتابعين للمشاركة', aliases: ['يدعوهم يشاركون'] },
                { text: 'شكر الداعمين والهدايا', aliases: ['شكر الهدايا'] },
                { text: 'مقدمة حلوة بأول البث', aliases: ['افتتاحية البث'] }
            ]
        },
        {
            id: 'b3', builtin: true, prompt: 'اكتب عشر أشياء نسويها يوم الجمعة',
            answers: [
                { text: 'صلاة الجمعة', aliases: ['نصلي الجمعة'] },
                { text: 'غداء العائلة', aliases: ['غدا مع الاهل', 'وجبة جمعة'] },
                { text: 'نزور الأهل', aliases: ['زيارة الاهل'] },
                { text: 'نرتاح ونتأخر بالنوم', aliases: ['نطول بالنوم', 'ننام متأخر'] },
                { text: 'نطلع مع الأصدقاء', aliases: ['نطلع مع الشلة'] },
                { text: 'نتابع مباراة أو رياضة', aliases: ['نشوف مباراة'] },
                { text: 'نسوي قهوة وفطور فاخر', aliases: ['فطور جمعة'] },
                { text: 'نرتب البيت', aliases: ['تنظيف البيت'] },
                { text: 'نسوي بث لايف', aliases: ['بث الجمعة'] },
                { text: 'نطلع نتمشى بالمول', aliases: ['نروح المول'] }
            ]
        },
        {
            id: 'b4', builtin: true, prompt: 'اكتب عشر أشياء لازم تكون بسيارتك',
            answers: [
                { text: 'إطار احتياطي وعدة تغيير', aliases: ['الإطار الاحتياطي', 'جك السيارة'] },
                { text: 'كابل شحن الجوال', aliases: ['شاحن السيارة'] },
                { text: 'مويه للشرب', aliases: ['مويه', 'ماء'] },
                { text: 'صندوق إسعافات أولية', aliases: ['اسعافات اولية'] },
                { text: 'كبل تشغيل البطارية', aliases: ['كبل بطارية', 'جمبر'] },
                { text: 'مناديل ومعطر', aliases: ['مناديل'] },
                { text: 'خريطة أو جهاز تتبع', aliases: ['تطبيق خرائط'] },
                { text: 'وثائق السيارة والاستمارة', aliases: ['الاستمارة', 'رخصة القيادة'] },
                { text: 'نظارة شمس', aliases: ['نظارة'] },
                { text: 'سماعة أو شاحن سماعات', aliases: ['سماعات'] }
            ]
        },
        {
            id: 'b5', builtin: true, prompt: 'اكتب عشر أشياء نسويها استعداد لرمضان',
            answers: [
                { text: 'نجهز قائمة الأكل والمشتريات', aliases: ['تسوق رمضان', 'قائمة المشتريات'] },
                { text: 'ننظف البيت', aliases: ['تنظيف رمضان'] },
                { text: 'نرتب مواعيد النوم', aliases: ['نظام النوم'] },
                { text: 'نحدد جدول للقرآن', aliases: ['ختمة القران', 'جدول القران'] },
                { text: 'نجهز زينة رمضان', aliases: ['زينة رمضان', 'فوانيس'] },
                { text: 'نخطط للصدقات والخير', aliases: ['صدقة رمضان'] },
                { text: 'نرتب دعوات الإفطار', aliases: ['دعوات افطار'] },
                { text: 'نسوي تسوق ملابس العيد', aliases: ['ملابس العيد'] },
                { text: 'نقلل الكافيين قبلها', aliases: ['نقلل القهوة'] },
                { text: 'نتابع مسلسلات رمضان', aliases: ['مسلسلات رمضان'] }
            ]
        },
        {
            id: 'b6', builtin: true, prompt: 'اكتب عشر أشياء يحبها كل قيمر',
            answers: [
                { text: 'نت سريع بدون لاق', aliases: ['بدون لاق', 'بينق قليل'] },
                { text: 'سماعة وميكروفون زين', aliases: ['هيدسيت'] },
                { text: 'كرسي قيمنق مريح', aliases: ['كرسي قيمنق'] },
                { text: 'شاشة عالية التحديث', aliases: ['شاشة هاي رفرش'] },
                { text: 'فريق أو أصحاب يلعبون وياه', aliases: ['قروب قيمرز'] },
                { text: 'توزيعة أزرار مريحة', aliases: ['كنترول مريح'] },
                { text: 'عروض وخصومات على الألعاب', aliases: ['خصومات الالعاب'] },
                { text: 'بث لايف وهو يلعب', aliases: ['يبث وهو يقيم'] },
                { text: 'تحديثات جديدة للعبة', aliases: ['تحديث اللعبة'] },
                { text: 'إنجازات وتروفيهات', aliases: ['تروفيهات', 'انجازات'] }
            ]
        },
        {
            id: 'b7', builtin: true, prompt: 'اكتب عشر أشياء نسويها بعطلة نهاية الأسبوع',
            answers: [
                { text: 'نرتاح ونعوض النوم', aliases: ['نعوض النوم'] },
                { text: 'نطلع مع العائلة', aliases: ['طلعة عائلية'] },
                { text: 'نسوي رياضة أو مشي', aliases: ['نمشي', 'رياضة'] },
                { text: 'نشوف مسلسل أو فيلم', aliases: ['نتفرج مسلسل'] },
                { text: 'نرتب أغراضنا للأسبوع الجاي', aliases: ['نرتب الأسبوع'] },
                { text: 'نطلع مطعم أو كافيه', aliases: ['نفطر برا', 'كافيه'] },
                { text: 'نلعب قيم مع الأصحاب', aliases: ['قيمنق مع الشلة'] },
                { text: 'نسوي شوبينق', aliases: ['تسوق', 'شوبينق'] },
                { text: 'نزور صديق أو قريب', aliases: ['زيارة صديق'] },
                { text: 'نسوي بث لايف', aliases: ['بث نهاية الاسبوع'] }
            ]
        },
        {
            id: 'b8', builtin: true, prompt: 'اكتب عشر أشياء تخلي الضيافة السعودية مميزة',
            answers: [
                { text: 'القهوة والتمر', aliases: ['قهوة وتمر'] },
                { text: 'كرم الضيف والترحيب', aliases: ['كرم الضيافة', 'ترحيب حار'] },
                { text: 'المجلس المرتب', aliases: ['المجلس'] },
                { text: 'البخور عند الاستقبال', aliases: ['البخور'] },
                { text: 'تقديم العسل والحلا', aliases: ['حلا وعسل'] },
                { text: 'حسن الاستماع للضيف', aliases: ['الاصغاء للضيف'] },
                { text: 'توديع الضيف لباب البيت', aliases: ['توديع الضيف'] },
                { text: 'تنويع الأطباق بالسفرة', aliases: ['تنوع الاكل'] },
                { text: 'الاهتمام بأدق التفاصيل', aliases: ['الاهتمام بالتفاصيل'] },
                { text: 'هدية بسيطة للضيف أحياناً', aliases: ['هدية للضيف'] }
            ]
        },
        {
            id: 'b9', builtin: true, prompt: 'اكتب عشر أسباب تخلينا نحب بث التيك توك لايف',
            answers: [
                { text: 'نتفاعل مباشرة مع المتابعين', aliases: ['تفاعل مباشر'] },
                { text: 'نكسب أصدقاء جدد', aliases: ['صداقات جديدة'] },
                { text: 'نتسلى ونضحك سوا', aliases: ['نضحك سوا'] },
                { text: 'نتعلم أشياء جديدة', aliases: ['نتعلم'] },
                { text: 'نشارك يومنا مع المتابعين', aliases: ['نشارك يومنا'] },
                { text: 'نلعب ألعاب تفاعلية', aliases: ['العاب تفاعلية'] },
                { text: 'ندعم بعض بالهدايا', aliases: ['هدايا الدعم'] },
                { text: 'نكتشف مواهب جديدة', aliases: ['مواهب جديدة'] },
                { text: 'نسوي ذكريات حلوة', aliases: ['ذكريات حلوة'] },
                { text: 'نقضي وقت ممتع', aliases: ['وقت ممتع'] }
            ]
        },
        {
            id: 'b10', builtin: true, prompt: 'اكتب عشر أشياء نسويها أول يوم دوام جديد',
            answers: [
                { text: 'نوصل بدري', aliases: ['نجي بدري', 'الحضور بدري'] },
                { text: 'نتعرف على الزملاء', aliases: ['نتعرف على الفريق'] },
                { text: 'نرتب مكتبنا', aliases: ['ترتيب المكتب'] },
                { text: 'نسمع تعليمات المدير', aliases: ['تعليمات المدير'] },
                { text: 'نلبس لبس رسمي مرتب', aliases: ['لبس مرتب'] },
                { text: 'نجهز أدواتنا ولابتوبنا', aliases: ['نجهز اللابتوب'] },
                { text: 'نتعرف على نظام الشغل', aliases: ['نظام العمل'] },
                { text: 'نسأل عن أهم المهام', aliases: ['أهم المهام'] },
                { text: 'نطلب رقم الواي فاي', aliases: ['الواي فاي'] },
                { text: 'نصور ستوري أول يوم دوام', aliases: ['ستوري اول دوام'] }
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

    /* ======================================================================
     *  2) الحالة العامة
     * ==================================================================== */
    var _screen = 'settings'; // settings | connecting | lobby | match | winner
    var _settings = {
        tiktokUsername: '',
        keyword: '',
        roundsTarget: 5,
        selectedQuestionIds: null // يُبنى لاحقاً = كل الأسئلة الجاهزة + المخصّصة
    };
    var _customQuestions = [];
    var _pool = [];
    var _poolIndex = 0;
    var _currentQuestion = null;
    var _completedRounds = 0;
    var _matchStartedAt = null;
    var _adminPanelOpen = false;
    var _commentUnsub = null;

    var _overlayEl = null, _lobbyEl = null, _matchEl = null, _adminEl = null, _winnerEl = null;

    function allAvailableQuestions() {
        return BUILTIN_QUESTIONS.concat(_customQuestions);
    }

    function loadCustomQuestions() {
        _customQuestions = AGP.storageManager && typeof AGP.storageManager.get === 'function'
            ? (AGP.storageManager.get(STORAGE_KEY_CUSTOM_QUESTIONS, []) || [])
            : [];
    }
    function saveCustomQuestions() {
        if (AGP.storageManager && typeof AGP.storageManager.set === 'function') {
            AGP.storageManager.set(STORAGE_KEY_CUSTOM_QUESTIONS, _customQuestions);
        }
    }

    function ensureSelectedDefaults() {
        if (_settings.selectedQuestionIds) return;
        _settings.selectedQuestionIds = allAvailableQuestions().map(function (q) { return q.id; });
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
        loadCustomQuestions();
        ensureSelectedDefaults();
        var box = el('tt-box');

        var roundsPills = ROUNDS_OPTIONS.map(function (v) {
            var active = (_settings.roundsTarget === v) ? ' tt-pill-active' : '';
            return '<button type="button" class="tt-pill-btn tt-rounds-pill' + active + '" data-value="' + v + '">' + v + '</button>';
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

            '<div class="tt-field-label-center">عدد الجولات (الأسئلة الفعلية المستهدفة)</div>' +
            '<div class="tt-pill-group" id="tt-rounds-group">' + roundsPills + '</div>' +
            '<div class="tt-hint">تخطي أي سؤال ما يُحتسب من هذا العدد.</div>' +

            '<div class="tt-section-header">بنك الأسئلة <span id="tt-q-selected-count"></span></div>' +
            '<div id="tt-questions-list" class="tt-questions-list"></div>' +
            '<button type="button" id="tt-add-question-btn" class="tt-btn-secondary">➕ سؤال جديد من عندي</button>' +
            '<div id="tt-newq-form-holder"></div>' +

            '<div id="tt-settings-error" class="tt-error-msg" style="display:none;"></div>' +
            '<button type="button" id="tt-connect-btn" class="tt-btn-connect">اتصل بالبث وانتقل للوبي</button>';

        el('tt-settings-back-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        wireSettingsHandlers();
        renderQuestionsList();
    }

    function wireSettingsHandlers() {
        el('tt-input-username').addEventListener('input', function (e) { _settings.tiktokUsername = e.target.value; });
        el('tt-input-keyword').addEventListener('input', function (e) { _settings.keyword = e.target.value; });

        el('tt-rounds-group').addEventListener('click', function (e) {
            var btn = e.target.closest('.tt-pill-btn'); if (!btn) return;
            _settings.roundsTarget = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });

        el('tt-add-question-btn').addEventListener('click', function () {
            var holder = el('tt-newq-form-holder');
            holder.innerHTML = holder.innerHTML ? '' : buildNewQuestionFormHtml();
            if (holder.innerHTML) wireNewQuestionForm();
        });

        el('tt-connect-btn').addEventListener('click', handleConnectClick);
    }

    function renderQuestionsList() {
        var listEl = el('tt-questions-list');
        var countEl = el('tt-q-selected-count');
        if (!listEl) return;
        var all = allAvailableQuestions();
        countEl.textContent = '(' + _settings.selectedQuestionIds.length + ' من ' + all.length + ' مفعّل)';

        listEl.innerHTML = all.map(function (q) {
            var checked = _settings.selectedQuestionIds.indexOf(q.id) !== -1 ? ' checked' : '';
            var customBadge = q.builtin ? '' : '<span class="tt-custom-badge">من عندك</span>';
            var delBtn = q.builtin ? '' : '<button type="button" class="tt-q-delete-btn" data-id="' + escapeAttr(q.id) + '" title="حذف السؤال">🗑️</button>';
            return '<label class="tt-q-row">' +
                '<input type="checkbox" class="tt-q-checkbox" data-id="' + escapeAttr(q.id) + '"' + checked + '>' +
                '<span class="tt-q-row-text">' + escapeHtml(q.prompt) + '</span>' +
                customBadge + delBtn +
                '</label>';
        }).join('') || '<div class="tt-hint">لا يوجد أي سؤال مفعّل حالياً.</div>';

        Array.prototype.forEach.call(listEl.querySelectorAll('.tt-q-checkbox'), function (cb) {
            cb.addEventListener('change', function () {
                var id = cb.getAttribute('data-id');
                var idx = _settings.selectedQuestionIds.indexOf(id);
                if (cb.checked && idx === -1) _settings.selectedQuestionIds.push(id);
                else if (!cb.checked && idx !== -1) _settings.selectedQuestionIds.splice(idx, 1);
                countEl.textContent = '(' + _settings.selectedQuestionIds.length + ' من ' + all.length + ' مفعّل)';
            });
        });
        Array.prototype.forEach.call(listEl.querySelectorAll('.tt-q-delete-btn'), function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-id');
                _customQuestions = _customQuestions.filter(function (q) { return q.id !== id; });
                var idx = _settings.selectedQuestionIds.indexOf(id);
                if (idx !== -1) _settings.selectedQuestionIds.splice(idx, 1);
                saveCustomQuestions();
                renderQuestionsList();
            });
        });
    }

    function buildNewQuestionFormHtml() {
        var rows = '';
        for (var i = 0; i < 10; i++) {
            var points = 10 - i;
            rows += '<div class="tt-newq-answer-row">' +
                '<span class="tt-newq-answer-badge">' + (i + 1) + ' <em>(' + points + ' ن)</em></span>' +
                '<input type="text" class="tt-newq-answer-input" data-rank="' + i + '" placeholder="الإجابة رقم ' + (i + 1) + '">' +
                '</div>';
        }
        return '<div class="tt-newq-form">' +
            '<div class="tt-row-field">' +
                '<input type="text" id="tt-newq-prompt" placeholder="مثال: اكتب عشر أشياء نسويها بالسفر">' +
                '<label>نص السؤال</label>' +
            '</div>' +
            '<div class="tt-hint">رتّب الإجابات من الأهم (رقم 1 = 10 نقاط) للأقل أهمية (رقم 10 = نقطة وحدة).</div>' +
            rows +
            '<div id="tt-newq-error" class="tt-error-msg" style="display:none;"></div>' +
            '<button type="button" id="tt-newq-save-btn" class="tt-btn-secondary">💾 حفظ السؤال</button>' +
            '</div>';
    }

    function wireNewQuestionForm() {
        el('tt-newq-save-btn').addEventListener('click', function () {
            var prompt = (el('tt-newq-prompt').value || '').trim();
            var inputs = Array.prototype.slice.call(document.querySelectorAll('.tt-newq-answer-input'));
            var answers = inputs.map(function (inp) { return (inp.value || '').trim(); });
            var errEl = el('tt-newq-error');

            if (!prompt) { errEl.textContent = 'لازم تكتب نص السؤال.'; errEl.style.display = 'block'; return; }
            if (answers.some(function (a) { return !a; })) { errEl.textContent = 'لازم تعبّي كل الإجابات العشر.'; errEl.style.display = 'block'; return; }

            var newQ = {
                id: 'c' + Date.now(),
                builtin: false,
                prompt: prompt,
                answers: answers.map(function (text) { return { text: text, aliases: [] }; })
            };
            _customQuestions.push(newQ);
            _settings.selectedQuestionIds.push(newQ.id);
            saveCustomQuestions();
            el('tt-newq-form-holder').innerHTML = '';
            renderQuestionsList();
        });
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
        if (!_settings.selectedQuestionIds.length) return showSettingsError('فعّل سؤال واحد على الأقل من البنك.');

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
            '</div>';

        el('tt-start-match-btn').addEventListener('click', handleStartMatch);
        el('tt-lobby-back-platform-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('tt-lobby-back-settings-btn').addEventListener('click', function () {
            var ok = window.confirm('بترجع لشاشة الإعدادات وينقطع الاتصال الحالي بالبث. تبي تكمل؟');
            if (ok) window.location.reload();
        });

        renderLobbyPlayerGrid();
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
        buildFreshPool();
        loadNextQuestionIntoCurrent();

        AGP.events.emit('game:roundStarted', { gameId: GAME_ID });
        renderMatchScreen();
    }

    /* ======================================================================
     *  6) استماع الشات (انضمام بالكلمة المفتاحية + مطابقة إجابات) — يبقى
     *     فعّالاً من اللوبي لين نهاية المباراة، عشان أي متأخر يقدر ينضم.
     * ==================================================================== */
    function wireCommentListener() {
        if (_commentUnsub) return;
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!payload || typeof payload.text !== 'string' || !payload.id) return;
            if (_screen !== 'lobby' && _screen !== 'match') return;

            var norm = normalizeArabicText(payload.text);
            var kwNorm = normalizeArabicText(_settings.keyword);

            if (norm && kwNorm && norm === kwNorm) {
                if (!AGP.player.hasPlayer(payload.id)) {
                    AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null });
                }
                return;
            }

            if (_screen !== 'match' || !_currentQuestion) return;
            if (!AGP.player.hasPlayer(payload.id)) return;

            tryMatchAnswer(payload, norm);
        });
    }

    function unwireCommentListener() {
        if (_commentUnsub) { _commentUnsub(); _commentUnsub = null; }
    }

    /* ======================================================================
     *  7) بنك الأسئلة أثناء المباراة (اختيار عشوائي بدون تكرار قدر الإمكان)
     * ==================================================================== */
    function buildFreshPool() {
        var all = allAvailableQuestions();
        var selected = all.filter(function (q) { return _settings.selectedQuestionIds.indexOf(q.id) !== -1; });
        _pool = shuffleArray(selected.length ? selected : all);
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
                renderLeaderboardPanel();
                checkAllRevealed();
                return;
            }
        }
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
                '<div class="tt-round-badge">الجولة ' + (_completedRounds + 1) + ' من ' + _settings.roundsTarget + '</div>' +
                '<div class="tt-question-banner">' + escapeHtml(_currentQuestion.prompt) + '</div>' +
            '</div>' +
            '<div id="tt-all-guessed-banner" class="tt-all-guessed-banner" style="display:none;">🎉 تم تخمين كل الصناديق! اضغط "السؤال التالي" للمتابعة.</div>' +
            '<div class="tt-match-body">' +
                '<div class="tt-leaderboard-panel">' +
                    '<div class="tt-panel-title">🏆 لوحة الصدارة</div>' +
                    '<div id="tt-leaderboard-list" class="tt-leaderboard-list"></div>' +
                '</div>' +
                '<div class="tt-boxes-list" id="tt-boxes-list"></div>' +
            '</div>' +
            '<div class="tt-match-controls">' +
                '<button type="button" id="tt-skip-btn" class="tt-ctrl-btn tt-ctrl-skip">⏭️ تخطي (بدون احتساب)</button>' +
                '<button type="button" id="tt-next-btn" class="tt-ctrl-btn tt-ctrl-next">✅ السؤال التالي</button>' +
            '</div>';

        renderBoxesList();
        renderLeaderboardPanel();

        el('tt-skip-btn').addEventListener('click', handleSkipQuestion);
        el('tt-next-btn').addEventListener('click', handleNextQuestion);
    }

    function boxInnerHtml(a) {
        if (!a.revealed) {
            return '<div class="tt-box-face tt-box-back">' +
                '<span class="tt-box-rank">' + a.rank + '</span>' +
                '<span class="tt-box-points">' + a.points + ' نقطة</span>' +
                '<span class="tt-box-mark">؟</span>' +
                '</div>' +
                '<div class="tt-box-face tt-box-front"></div>';
        }
        var isWinner = !!a.revealedBy;
        var cardHtml = isWinner ? '<div class="tt-box-player">' + playerCardHtml(a.revealedBy, false) + '</div>' : '<div class="tt-box-unclaimed">⏳ ما تم تخمينها</div>';
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

    function renderLeaderboardPanel() {
        var listEl = el('tt-leaderboard-list');
        if (!listEl) return;
        var lb = AGP.scoreManager.getLeaderboard().slice(0, 8);
        var roster = getRoster();
        listEl.innerHTML = lb.map(function (row, i) {
            var p = roster.filter(function (pp) { return pp.id === row.playerId; })[0] || { id: row.playerId, name: row.playerId };
            return '<div class="tt-lb-row">' +
                '<span class="tt-lb-rank">' + (i + 1) + '</span>' +
                playerCardHtml(p, false) +
                '<span class="tt-lb-score">' + row.score + '</span>' +
                '</div>';
        }).join('') || '<div class="tt-hint">ولا حد سجّل نقاط بعد.</div>';
        fitCardNames(listEl);
    }

    function handleSkipQuestion() {
        loadNextQuestionIntoCurrent();
        renderMatchScreen();
    }

    function handleNextQuestion() {
        _currentQuestion.answers.forEach(function (a) { a.revealed = true; });
        renderBoxesList();

        _completedRounds++;
        window.setTimeout(function () {
            if (_completedRounds >= _settings.roundsTarget) {
                finalizeMatchAndShowWinner();
            } else {
                loadNextQuestionIntoCurrent();
                renderMatchScreen();
            }
        }, 900);
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
                wireCommentListener();
                renderLobbyScreen();
            }
            else if (payload.status === 'error') { renderSettingsScreen(); showSettingsError('تعذّر الاتصال -- تحقّق من اليوزرنيم وحاول مرة أخرى.'); }
        });

        AGP.events.on('player:joined', function () {
            if (_screen === 'lobby') renderLobbyPlayerGrid();
            if (_adminPanelOpen) renderAdminPanel();
        });
        AGP.events.on('player:removed', function () {
            if (_screen === 'lobby') renderLobbyPlayerGrid();
            if (_adminPanelOpen) renderAdminPanel();
        });
        AGP.events.on('score:changed', function () {
            if (_screen === 'match') renderLeaderboardPanel();
            if (_adminPanelOpen) renderAdminPanel();
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
        renderSettingsScreen();
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager &&
        !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
