/**
 * AGP LETTERS CELL -- "خلية الحروف" (لعبة أصلية داخل المنصة، بنمط
 * games/team-war من ناحية طريقة التحميل والربط الحقيقي بمنصة البث --
 * الهوية البصرية وكل الشاشات (الإعدادات، اللوبي، اللعب، الفوز) بنفس قالب
 * أسرع إجابة games/fastest-answer بنظام الفريقين: خلفية داكنة بتوهج
 * بنفسجي، شريط علوي بلوقو المنصة، كروت زجاجية، والفريقين بالبنفسجي
 * والسماوي. لا اعتماد على js/agp-game-shell.js).
 *
 * قواعد اللعب الفعلية (بعد تحديث المضيف على النسخة الأولى):
 * - رقعة اللعب 25 خلية (مو 23) من أصل أبجدية 28 حرفاً كاملة -- كل جولة/
 *   إعادة توزيع تسحب 25 حرفاً عشوائياً من الـ28 وتوزّعها عشوائياً على
 *   الخلايا. شكل الرقعة شبكة 5×5 بنمط "الطوب" المتعرّج الكلاسيكي (زي
 *   التصميم الأصلي ذي الـ23 خلية بالضبط، فقط الصفوف الخمسة كلها بطول 5
 *   خلايا بدل التبديل بين 5 و4): الصفوف الفردية بالترقيم من واحد (1، 3،
 *   5) متوازية ببعضها بنفس حدود اليمين/اليسار، والصفوف الزوجية (2، 4)
 *   تزحف عنها بمقدار نصف عرض خلية فتتداخل السداسيات بلا فجوات -- بنفس حجم
 *   السداسي الأصلي (122.7×146.67).
 * - بنك الأسئلة (QUESTION_BANK) خريطة حرف -> مصفوفة أسئلة {question,
 *   answer} -- placeholder حالياً بانتظار ملف الأسئلة الحقيقي (28 حرف،
 *   كل حرف له أكثر من سؤال). لا يتكرر أي سؤال داخل نفس المباراة كاملة
 *   (كل جولاتها + إعادة توزيعها) عبر تتبّع _usedQuestions لكل حرف.
 * - تصحيح الإجابة تلقائي بالدرجة الأولى: يقارن أي تعليق وارد بالشات
 *   (بعد تطبيع النص) بنص "الإجابة" المخزّن لسؤال الخلية المفتوحة حالياً؛
 *   أول لاعب (منضم مسبقاً لأحد الفريقين) يكتب الإجابة الصحيحة حرفياً
 *   يُعتمد تلقائياً ويلوَّن الخلية بلون فريقه. يبقى للمضيف زران يدويان
 *   ("تصحيح لفريق 1/2") كاحتياط لو ما حد كتب الجواب حرفياً بالشات.
 * - اللاعب الذي اعتُمدت إجابته آخر مرة (تلقائياً أو يدوياً عبر الزر
 *   الاحتياطي) يظهر اسمه بمكان صندوق السؤال، وله وحده صلاحية اختيار
 *   الحرف التالي بكتابته مباشرة بالشات؛ المضيف يقدر دائماً يتجاوز هذا
 *   ويضغط أي خلية غير مفتوحة يدوياً في أي وقت.
 * - الفوز بالجولة: كل فريق يوصّل جهتيه بسلسلة خلايا متجاورة من لونه
 *   (متعرّجة عادي، ولو لمست جهة الخصم عادي) -- الفريق الأول (البنفسجي) من
 *   فوق لتحت، والفريق الثاني (الأزرق) من اليسار لليمين (isConnected).
 * - المباراة "Best of 3": أول فريق يفوز بجولتين (خط متصل) يحسم المباراة
 *   فوراً بدون ما تُلعب الجولة الثالثة لو صارت غير ضرورية.
 * - لو امتلأت كل خلايا الرقعة بدون أي خط متصل لأي فريق: تُعاد نفس الجولة
 *   تلقائياً (تصفير الرقعة + سحب 25 حرفاً وأسئلة جديدة من جديد) بدون
 *   احتساب أي نقطة لأي فريق. المضيف يقدر يطلب نفس الإعادة يدوياً في أي
 *   وقت من زر الشارة السداسية العلوية ("إعادة توزيع").
 * - بهذا صار حسم الفوز بالمباراة حتمياً دائماً (2 من 3) فما عاد فيه حاجة
 *   لحالة "تعادل النقاط" أو شاشة "ملخص الجولة" اليدوية القديمة -- أُزيلتا
 *   بالكامل من هذا الإصدار.
 * - "الانضمام عبر الكلمة المفتاحية" مفتوح باللوبي، ووسط المباراة فقط وهي
 *   نافذة "دخول لاعبين جدد" مفتوحة (زر بالشريط العلوي أو بدرج الإعدادات،
 *   نفس روليت الإقصاء) -- المنضمين يدخلون فرقهم عند "إكمال المباراة".
 *   ويبقى "رقم الفريق + إجابة صحيحة بنفس الرسالة" شغال طول المباراة.
 * - عند "لعبة جديدة" من شاشة النتيجة النهائية: يبقى الاتصال بالبث كما هو
 *   ويُعاد ضبط اللاعبين/اللوحة والعودة مباشرة للوبي (مو لإعادة كتابة
 *   يوزر البث من الصفر).
 * - زر "إنهاء المباراة" بدرج الإعدادات ينهي الجلسة فعلياً (قطع الاتصال
 *   بالبث + تصفير اللاعبين عبر AGP.gameManager.resetSession() + العودة
 *   لشاشة الإعدادات)، بخلاف "إعادة ضبط اللعبة" اللي يصفّر رقعة الجولة
 *   الحالية فقط (سحب جديد) ويبقي اللاعبين ونتيجة المباراة (عدد الجولات
 *   المكسوبة) كما هي.
 * - تصحيح الفريق التلقائي يشترط أن يكون كاتب التعليق منضمّاً مسبقاً
 *   لأحد الفريقين (عبر الكلمة المفتاحية) -- تعليق صحيح من مشاهد غير
 *   منضم يُتجاهل لأنه ما فيه فريق نلوّن الخلية بلونه.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.gameManager || !AGP.player || !AGP.scoreManager || !AGP.streamConnector) {
        console.error('[AGP Letters Cell] AGP Core غير محمَّل بعد -- تأكد من ترتيب تحميل الملفات بـ index.html.');
        return;
    }

    var GAME_ID = 'letters-cell';
    var GAME_NAME = 'خلية الحروف';

    var TEAM1 = 1;
    var TEAM2 = 2;
    var SCORE_KEY_TEAM1 = 'letters-cell:team1';
    var SCORE_KEY_TEAM2 = 'letters-cell:team2';
    var ROUND_WINS_TO_CLINCH = 2;

    // الأبجدية العربية الكاملة (28 حرفاً) -- كل جولة تسحب 25 منها عشوائياً.
    var ALPHABET_28 = ['ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'];
    // اسم كل حرف مكتوباً بالكامل (طاء، ياء...) -- يقبله اختيار الحرف
    // بالشات كبديل للحرف المجرد نفسه (راجع tryHandleLetterPick).
    var LETTER_NAMES = {
        'ا': 'الف', 'ب': 'باء', 'ت': 'تاء', 'ث': 'ثاء', 'ج': 'جيم', 'ح': 'حاء', 'خ': 'خاء',
        'د': 'دال', 'ذ': 'ذال', 'ر': 'راء', 'ز': 'زاي', 'س': 'سين', 'ش': 'شين', 'ص': 'صاد',
        'ض': 'ضاد', 'ط': 'طاء', 'ظ': 'ظاء', 'ع': 'عين', 'غ': 'غين', 'ف': 'فاء', 'ق': 'قاف',
        'ك': 'كاف', 'ل': 'لام', 'م': 'ميم', 'ن': 'نون', 'ه': 'هاء', 'و': 'واو', 'ي': 'ياء'
    };
    // ألوان الفريقين نفس أسرع إجابة (games/fastest-answer: TC) -- بنفسجي وسماوي.
    var TEAM1_DEFAULT_COLOR = '#a78bfa';
    var TEAM2_DEFAULT_COLOR = '#38bdf8';

    // بنك أسئلة placeholder (عدة أسئلة/إجابات لكل حرف) -- يُستخدم فقط لو
    // تعذّر تحميل questions-bank.json (شبكة، أو الملف غير موجود بعد).
    // المصدر الحقيقي هو games/letters-cell/questions-bank.json، يعدَّل عبر
    // admin-questions.html (نفس نمط games/top-ten/questions-bank.json).
    var QUESTION_BANK = ALPHABET_28.reduce(function (acc, letter) {
        acc[letter] = [1, 2, 3, 4].map(function (n) {
            return { question: 'سؤال ' + n + ' لحرف ' + letter, answer: 'اجابة حرف ' + letter };
        });
        return acc;
    }, {});

    // يستبدل QUESTION_BANK بمحتوى الملف المنشور فعلياً وقت التحميل (قبل ما
    // تبدأ أي مباراة فعلياً -- المضيف لازم يمر بشاشتي الإعدادات واللوبي
    // أول، فيه وقت كافٍ للتحميل قبل أول استخدام حقيقي بـpickQuestionForLetter).
    // إعادة تعيين المتغير (لا تعديل الكائن الأصلي) تكفي: كل الدوال تقرأ
    // QUESTION_BANK عبر الإغلاق (closure) فترى القيمة الجديدة تلقائياً.
    (function loadQuestionBankFromServer() {
        fetch('questions-bank.json', { cache: 'no-store' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data || !data.questions || typeof data.questions !== 'object') return;
                var hasAny = Object.keys(data.questions).some(function (k) { return (data.questions[k] || []).length > 0; });
                if (hasAny) QUESTION_BANK = data.questions;
            })
            .catch(function () { /* يبقى الـ placeholder أعلاه */ });
    }());

    /**
     * فحص واجهة فقط (UX) — يظهر رابط "إدارة بنك الأسئلة" بشاشة الإعدادات
     * فقط لمن مسجّل دخول بالمتصفح كأدمن أو معه صلاحية can_manage_letters_cell
     * (نفس نمط games/top-ten's isCachedAdminUser). هذا مو الحماية الحقيقية
     * — تلك موجودة أصلاً داخل admin-questions.html نفسها عبر
     * requireLettersCellAdmin()، اللي يتحقق من الخادم فعلياً بغض النظر عن
     * هذا الفحص المحلي.
     */
    function isCachedAllowedAdminUser() {
        try {
            if (!window.AGPAuth || typeof window.AGPAuth.getCachedUser !== 'function') return false;
            var user = window.AGPAuth.getCachedUser();
            if (!user) return false;
            return user.role === 'admin' || Boolean(user.permissions && user.permissions.can_manage_letters_cell);
        } catch (e) { return false; }
    }

    // -------- هندسة رقعة الـ25 خلية (نمط "الطوب" المتعرّج الكلاسيكي، 5×5)
    // -- الصفوف الفردية بالترقيم من واحد (1، 3، 5 = الفهارس 0، 2، 4) متوازية
    // ببعضها بنفس حدود اليمين/اليسار (زي ROW_X_A بالتصميم الأصلي)، والصفوف
    // الزوجية (2، 4 = الفهارس 1، 3) تزحف عنها بمقدار نصف عرض خلية فتتداخل
    // بينها بدل ما تصطف بعمود واحد مستقيم.
    var BOARD_CENTER_X = 726.31, BOARD_Y0 = 271.165, BOARD_Y1 = 857.835;
    var BOARD_ROWS = 5, BOARD_COLS = 5;

    function buildBrickGeometry(rows, cols) {
        var hexH = (BOARD_Y1 - BOARD_Y0) / (0.75 * rows + 0.25);
        var hexW = hexH * (122.7 / 146.67); // نفس نسبة عرض/ارتفاع السداسي الأصلي
        var spacingX = hexW; // سداسيات متلامسة بنفس الصف
        var spacingY = hexH * 0.75;
        var halfStep = spacingX / 2; // إزاحة الصفوف الزوجية عن الفردية فقط (تبديل، مو تراكم)

        var totalWidth = (cols - 1) * spacingX + halfStep + hexW;
        var alignedRowStartX = BOARD_CENTER_X - totalWidth / 2 + hexW / 2; // بداية الصفوف الفردية (1،3،5)

        function hexCenter(r, c) {
            var isOffsetRow = (((r % 2) + 2) % 2 === 1); // الصفوف الزوجية بالترقيم من واحد (2، 4)
            return { x: alignedRowStartX + (isOffsetRow ? halfStep : 0) + c * spacingX, y: BOARD_Y0 + hexH / 2 + r * spacingY };
        }

        var boxLeft = alignedRowStartX - hexW / 2;
        var boxRight = boxLeft + totalWidth;
        var boxTop = BOARD_Y0;
        var boxBottom = BOARD_Y1;
        var boxW = boxRight - boxLeft, boxH = boxBottom - boxTop;
        // مواضع الخلايا بالنسب المئوية من صندوق الرقعة نفسه (مو من الشاشة).
        function toLayout(pt) {
            return {
                leftPct: ((pt.x - hexW / 2 - boxLeft) / boxW) * 100,
                topPct: ((pt.y - hexH / 2 - boxTop) / boxH) * 100,
                wPct: (hexW / boxW) * 100,
                hPct: (hexH / boxH) * 100
            };
        }

        var centers = [];
        var layout = [];
        var idx = 0;
        var leftEdge = [], rightEdge = [], topEdge = [], bottomEdge = [];
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var pt = hexCenter(r, c);
                centers.push(pt);
                layout.push(toLayout(pt));
                // أول وآخر خلية بكل صف تلامس جهة اليسار/اليمين (المُزاحة وغير المُزاحة).
                if (c === 0) leftEdge.push(idx);
                if (c === cols - 1) rightEdge.push(idx);
                if (r === 0) topEdge.push(idx);
                if (r === rows - 1) bottomEdge.push(idx);
                idx++;
            }
        }
        var adjacency = centers.map(function () { return []; });
        var threshold = spacingX * 1.15;
        for (var i = 0; i < centers.length; i++) {
            for (var j = i + 1; j < centers.length; j++) {
                var dx = centers[i].x - centers[j].x, dy = centers[i].y - centers[j].y;
                if (Math.sqrt(dx * dx + dy * dy) < threshold) { adjacency[i].push(j); adjacency[j].push(i); }
            }
        }

        return { layout: layout, aspect: boxW / boxH, hexHRatio: hexH / boxH, adjacency: adjacency, leftEdge: leftEdge, rightEdge: rightEdge, topEdge: topEdge, bottomEdge: bottomEdge };
    }

    var BOARD_GEOMETRY = buildBrickGeometry(BOARD_ROWS, BOARD_COLS);
    var CELL_LAYOUT = BOARD_GEOMETRY.layout;
    var BOARD_ASPECT = BOARD_GEOMETRY.aspect;
    var HEX_H_RATIO = BOARD_GEOMETRY.hexHRatio;
    var ADJACENCY = BOARD_GEOMETRY.adjacency;
    var LEFT_EDGE = BOARD_GEOMETRY.leftEdge;
    var RIGHT_EDGE = BOARD_GEOMETRY.rightEdge;
    var TOP_EDGE = BOARD_GEOMETRY.topEdge;
    var BOTTOM_EDGE = BOARD_GEOMETRY.bottomEdge;
    var BOARD_SIZE = CELL_LAYOUT.length; // 25

    function pathExists(cellStates, team, startEdge, endEdge) {
        var start = startEdge.filter(function (i) { return cellStates[i] === team; });
        if (!start.length) return false;
        var targetSet = {}; endEdge.forEach(function (i) { targetSet[i] = true; });
        var visited = {}; start.forEach(function (i) { visited[i] = true; });
        var queue = start.slice();
        while (queue.length) {
            var cur = queue.shift();
            if (targetSet[cur]) return true;
            ADJACENCY[cur].forEach(function (n) {
                if (!visited[n] && cellStates[n] === team) { visited[n] = true; queue.push(n); }
            });
        }
        return false;
    }
    // كل فريق له اتجاه: الفريق الأول (البنفسجي) يوصل من فوق لتحت، والفريق
    // الثاني (الأزرق) من اليسار لليمين. المسار أي سلسلة خلايا متجاورة من
    // لون الفريق -- متعرّج أو يلمس جهة الفريق الثاني عادي.
    function isConnected(cellStates, team) {
        return (team === TEAM2)
            ? pathExists(cellStates, team, LEFT_EDGE, RIGHT_EDGE)
            : pathExists(cellStates, team, TOP_EDGE, BOTTOM_EDGE);
    }

    function shuffleArray(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    /**
     * يقرأ الاتصال بالبث اللي اتحقق منه المضيف مرة وحدة بصفحة مكتبة
     * الألعاب (games.html، ودجت "اتصل بالبث") -- عشان شاشة إعدادات هذي
     * اللعبة ما تحتاج حقل يوزر خاص فيها. games.html يكتب هذا المفتاح
     * مباشرة بـ localStorage (هو نفسه ما يحمّل سكربتات AGP.*)، بنفس بادئة
     * 'agp:' وصيغة JSON.stringify اللي يستخدمها js/agp-storage-manager.js،
     * فالطرفين متفقين على الصيغة بدون ما يعتمد أي وحد على الثاني. نفس
     * النمط المستخدم فعلياً بـ games/elimination-roulette (أول لعبة طبّقته).
     */
    var STREAM_CONNECTION_STORAGE_KEY = 'agp:agp-stream-connection';
    function getSavedStreamConnection() {
        try {
            var raw = window.localStorage.getItem(STREAM_CONNECTION_STORAGE_KEY);
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (!data || typeof data.username !== 'string' || !data.username) return null;
            return data;
        } catch (e) { return null; }
    }

    // -------------------------- حالة عامة --------------------------
    var _screen = 'settings'; // settings | connecting | lobby | game | roundWinner | result
    var _root = null;
    var _registrationOpen = false;
    var _commentUnsub = null;

    var _settings = {
        tiktokUsername: '',
        hostName: 'أيمن', // يطلع بشعار "حروف مع {الاسم}" بشاشة اللعب
        team1Name: 'الفريق الأول',
        team2Name: 'الفريق الثاني',
        team1Color: TEAM1_DEFAULT_COLOR,
        team2Color: TEAM2_DEFAULT_COLOR,
        team1AccessCode: '',
        team2AccessCode: '',
        answerTimerSeconds: 90 // 0 = بدون مؤقت؛ خيارات: 90 (1:30) | 120 (2:00) | 180 (3:00)
    };
    var ANSWER_TIMER_OPTIONS = [
        { value: 90, label: '1:30' },
        { value: 120, label: '2:00' },
        { value: 180, label: '3:00' }
    ];
    var ANSWER_TIMER_NAME = 'lc-answer-timer';

    /** أزرار خيار "وقت الإجابة" -- مشتركة بين شاشة الإعدادات الأولى ودرج
     * إعدادات المباراة (تعديل مباشر بدون رجوع لشاشة منفصلة). */
    function answerTimerPillsHtml() {
        return ANSWER_TIMER_OPTIONS.map(function (opt) {
            var active = (_settings.answerTimerSeconds === opt.value) ? ' lc-seg-on' : '';
            return '<button type="button" class="lc-seg-btn lc-timer-pill' + active + '" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');
    }

    var _round = 1;
    var _roundWins1 = 0, _roundWins2 = 0; // عدد الجولات المكسوبة بكل فريق -- يحسم المباراة عند 2
    var _cellLetters = []; // الحرف المعروض بكل خلية لهذه الجولة (25 عنصر)
    var _cellStates = []; // 0 غير مملوكة | TEAM1 | TEAM2
    var _cellQuestions = []; // { text, answer, questionIndex } | null -- يُملأ فقط لما تُفتح الخلية فعلياً
    var _usedQuestions = {}; // letter -> { [questionIndex]: true } -- طول المباراة كاملة
    var _activeIdx = null; // فهرس الخلية المفتوحة حالياً (سؤال معروض بلا اعتماد بعد)
    var _answerTimerExpired = false; // ينتهي وقت الإجابة على الخلية المفتوحة حالياً -- يوقف التصحيح التلقائي (الأزرار اليدوية تبقى شغالة)
    var _timeUpModalOpen = false; // نافذة "انتهى الوقت" -- تُغلق فقط باختيار المضيف تمديد دقيقة (بنفس السؤال أو سؤال جديد)
    var _currentAnswerTimerSeconds = 0; // مدة العدّاد المعروضة حالياً (تختلف عن answerTimerSeconds الأساسي بعد تمديد الدقيقة الإضافية)
    var _connectionWinner = null;
    var _boardFullNoWinner = false;
    var _answerModal = null; // { question, teamName, teamColor, playerName }
    var _lastAnswererPlayer = null; // { id, name, team } -- له صلاحية اختيار الحرف التالي بالشات
    var _reshuffleNotice = null;
    var _settingsOpen = false;
    var _inviteOpen = false;
    var _joinPending = []; // لاعبين انضموا بنافذة "دخول لاعبين جدد" -- يدخلون فرقهم عند إكمال المباراة
    var _showIntro = false;

    function el(id) { return document.getElementById(id); }
    function escapeAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function normalizeArabicText(text) {
        if (typeof text !== 'string') return '';
        // الأرقام العربية/الفارسية = نفس الإنجليزية
        return text
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .replace(/[ً-ْٰـ]/g, '')
            .replace(/[إأآا]/g, 'ا')
            .replace(/[ىی]/g, 'ي')
            .replace(/[ةه]/g, 'ه')
            .replace(/[ؤئء]/g, 'ء')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase()
            // "أل" التعريف اختيارية بالمطابقة -- إجابة محفوظة "تمر" تقبل
            // "التمر" وبالعكس (إجابة محفوظة "الحرباء" تقبل "حرباء").
            .replace(/^ال/, '');
    }

    /**
     * تطبيع مخصّص لاختيار الحرف بالشات فقط -- نفس توحيد الهمزة/التاء
     * المربوطة/الألف المقصورة، لكن بدون حذف "أل" التعريف (لو استُخدم
     * normalizeArabicText العادي، اسم الحرف "ألف" يتحوّل لـ"الف" ثم
     * تُحذَف "ال" فيتطابق خطأً مع الحرف المستقل "ف"). أيضاً يحذف كل
     * المسافات (الحرف/اسمه كلمة واحدة دائماً).
     */
    function normalizeLetterText(text) {
        if (typeof text !== 'string') return '';
        return text
            .replace(/[ً-ْٰـ]/g, '')
            .replace(/[إأآا]/g, 'ا')
            .replace(/[ىی]/g, 'ي')
            .replace(/[ةه]/g, 'ه')
            .replace(/[ؤئء]/g, 'ء')
            .replace(/\s+/g, '')
            .toLowerCase();
    }

    // -------------------------- أصوات (Web Audio) --------------------------
    var _audioCtx = null;
    function getAudioCtx() {
        if (!_audioCtx) {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            _audioCtx = new Ctx();
        }
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        return _audioCtx;
    }
    // attack: مدة صعود الصوت بالثواني قبل الذروة (قيمة صغيرة = دخول ناعم بلا
    // "طقة" -- 0.001 دخول شبه فوري للأصوات القوية/الحاسمة).
    function playTone(freq, duration, type, delay, gainVal, attack) {
        try {
            var ctx = getAudioCtx();
            if (!ctx) return;
            duration = duration || 0.15; type = type || 'sine'; delay = delay || 0; gainVal = gainVal == null ? 0.12 : gainVal;
            attack = attack == null ? 0.004 : attack;
            var t0 = ctx.currentTime + delay;
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(gainVal, t0 + attack);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + duration + 0.02);
        } catch (e) {}
    }
    // نغمة واحدة هادئة وخفيفة جداً (طلب صريح: أهدأ وأخف من كل صوت ثاني
    // باللعبة) -- تُشغَّل مع كل انضمام لاعب فردي، بصعود ناعم يمنع أي "طقة".
    function playJoinSound() { playTone(660, 0.14, 'sine', 0, 0.035, 0.02); }
    function playMatchStartSound() { [440, 554, 660].forEach(function (f, i) { playTone(f, 0.3, 'triangle', i * 0.05, 0.1); }); }
    function playSelectSound() { playTone(480, 0.07, 'triangle', 0, 0.07, 0.001); }
    function playQuestionSound() { playTone(780, 0.12, 'triangle', 0.1, 0.08); }
    function playCorrectSound() { [523, 659, 784, 1046].forEach(function (f, i) { playTone(f, 0.18, 'sine', i * 0.08, 0.1, 0.002); }); }
    function playRoundWinSound() { [392, 523, 659, 784, 1046, 1318].forEach(function (f, i) { playTone(f, 0.22, 'triangle', i * 0.09, 0.11); }); }
    function playReshuffleSound() { playTone(360, 0.16, 'triangle', 0, 0.09); playTone(240, 0.2, 'triangle', 0.12, 0.09); }
    // نقرة تنبيه خفيفة لآخر ٥ ثوانٍ من مؤقت الإجابة -- تتكرر كل ثانية،
    // بلا نغمة صاخبة (مطابقة لهدوء باقي أصوات اللعبة).
    function playTimerTickSound() { playTone(880, 0.08, 'square', 0, 0.05, 0.002); }

    // -------------------------- أدوات مساعدة --------------------------
    function getTeamPlayers(team) {
        return AGP.player.getAllPlayers().filter(function (p) { return p.team === team; });
    }
    function findPlayerById(id) {
        var players = AGP.player.getAllPlayers();
        for (var i = 0; i < players.length; i++) { if (players[i].id === id) return players[i]; }
        return null;
    }
    function playerLabel(p) { return (p && (p.name || p.id)) || '—'; }
    function playerInitial(p) { var n = playerLabel(p); return n ? n.charAt(0) : '؟'; }

    function ensureBody() { document.body.classList.add('lc-active'); }
    function ensureRoot() {
        if (_root) return _root;
        _root = document.createElement('div');
        _root.id = 'lc-root';
        document.body.appendChild(_root);
        return _root;
    }

    // -------------------------- قالب "أسرع إجابة" المشترك --------------------------
    // كل الشاشات بنفس هوية games/fastest-answer: خلفية داكنة بتوهج بنفسجي
    // ونجوم، شريط علوي ثابت (أزرار + لوقو المنصة بالمنتصف)، كروت زجاجية،
    // أزرار كبسولة بتدرّج بنفسجي، والفريقين بالبنفسجي والسماوي.
    var ICON_EXIT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
    var ICON_ARROW = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    var ICON_GEAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
    var ICON_X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>';
    var ICON_TROPHY = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M17 5h3v2a3 3 0 0 1-3 3"></path><path d="M7 5H4v2a3 3 0 0 0 3 3"></path></svg>';
    var ICON_SHUFFLE = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"></path><path d="M21 3v5h-5"></path></svg>';
    var ICON_USER_ADD = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>';
    var ICON_FULLSCREEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>';
    var ICON_FULLSCREEN_EXIT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg>';
    var ICON_CLOCK = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>';

    // خلفية التوهج والنجوم -- تُبنى مرة وحدة (مواقع النجوم عشوائية) وتُعاد
    // نفسها بكل رسم حتى ما "ترمش" الخلفية مع كل تحديث للشاشة.
    var _fxHtml = null;
    function fxHtml() {
        if (_fxHtml) return _fxHtml;
        var html = '<div class="lc-fx" aria-hidden="true">' +
            '<div class="lc-fx-glow lc-fx-glow1"></div><div class="lc-fx-glow lc-fx-glow2"></div><div class="lc-fx-glow lc-fx-glow3"></div>';
        for (var i = 0; i < 90; i++) {
            var big = (i % 9 === 0);
            html += '<span class="lc-fx-star" style="left:' + (Math.random() * 100).toFixed(2) + '%;top:' + (Math.random() * 100).toFixed(2) + '%;' +
                (big ? 'width:3px;height:3px;' : '') + 'opacity:' + (0.12 + Math.random() * 0.23).toFixed(2) + '"></span>';
        }
        [[88, 14, 14, 1], [73, 82, 18, 0], [16, 66, 10, 1], [42, 8, 12, 0]].forEach(function (q) {
            html += '<span class="lc-fx-sq' + (q[3] ? ' lc-fx-sq-fill' : '') + '" style="left:' + q[0] + '%;top:' + q[1] + '%;width:' + q[2] + 'px;height:' + q[2] + 'px"></span>';
        });
        _fxHtml = html + '</div>';
        return _fxHtml;
    }

    /** الشريط العلوي: startHtml يمين الشاشة (RTL)، اللوقو بالمنتصف، endHtml يسار. */
    function headerHtml(startHtml, endHtml) {
        return '<header class="lc-header">' +
            '<div class="lc-header-side">' + (startHtml || '') + '</div>' +
            '<div class="lc-header-logo"><img src="../../logo.png" alt="ألعاب أيمن" onerror="this.style.visibility=\'hidden\'"></div>' +
            '<div class="lc-header-side lc-header-side-end">' + (endHtml || '') + '</div>' +
        '</header>';
    }
    function headerBtnHtml(id, label, icon, variant) {
        return '<button type="button" id="' + id + '" class="lc-hbtn lc-hbtn-' + variant + '">' + icon + '<span class="lc-hbtn-label">' + label + '</span></button>';
    }

    /** شعار "حروف مع {اسم المقدّم}" -- الاسم من شاشة الإعدادات. */
    function hostLogoHtml() {
        var name = (_settings.hostName || '').trim();
        return '<span class="lc-host-w1">حروف</span> <span class="lc-host-w2">مع</span>' + (name ? ' <span class="lc-host-w3">' + escapeHtml(name) + '</span>' : '');
    }

    function teamName(team) { return (team === TEAM1) ? _settings.team1Name : _settings.team2Name; }
    function teamColor(team) { return (team === TEAM1) ? _settings.team1Color : _settings.team2Color; }
    function teamCode(team) { return (team === TEAM1) ? _settings.team1AccessCode : _settings.team2AccessCode; }

    /** صورة اللاعب الدائرية (أول حرف من اسمه تحت الصورة لو ما تحمّلت). */
    // تدرّج لون كل فريق نفسه اللي بخلايا الرقعة (.lc-hex-t1/.lc-hex-t2 بالـCSS)
    // -- يُستخدم باللوبي والصور عشان ألوان اللوبي تطابق ألوان اللعبة.
    var TEAM_FILLS = {};
    TEAM_FILLS[TEAM1_DEFAULT_COLOR] = 'linear-gradient(165deg,#a78bfa 0%,#8b5cf6 45%,#6d28d9 100%)';
    TEAM_FILLS[TEAM2_DEFAULT_COLOR] = 'linear-gradient(165deg,#38bdf8 0%,#0ea5e9 45%,#0369a1 100%)';
    function teamFill(color) { return TEAM_FILLS[color] || 'linear-gradient(135deg,' + color + ',' + hexToRgba(color, 0.4) + ')'; }

    function avatarHtml(p, color, cls) {
        var name = playerLabel(p);
        var initial = '';
        for (var i = 0; i < name.length; i++) { if (/[^\s_\d@]/.test(name.charAt(i))) { initial = name.charAt(i); break; } }
        return '<span class="lc-av' + (cls ? ' ' + cls : '') + '" style="background:' + teamFill(color) + ';border-color:' + color + '">' +
            escapeHtml(initial) +
            (p && p.avatarUrl ? '<img src="' + escapeAttr(p.avatarUrl) + '" alt="" onerror="this.remove()">' : '') +
        '</span>';
    }

    // تنبيه أعلى الشاشة (نفس توست أسرع إجابة) -- خارج #lc-root حتى ما
    // ينمسح مع إعادة رسم الشاشة.
    var _toastTimer = null;
    function showToast(msg, kind) {
        var t = el('lc-toast');
        if (!t) { t = document.createElement('div'); t.id = 'lc-toast'; document.body.appendChild(t); }
        t.className = 'lc-toast' + (kind === 'info' ? ' lc-toast-info' : '');
        t.textContent = msg;
        t.style.display = 'block';
        t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(function () { t.style.display = 'none'; }, 2600);
    }

    /**
     * نافذة تأكيد بنفس شكل نافذة "الخروج؟" بأسرع إجابة (بدل window.confirm).
     * opts: { title, text, okLabel, danger, onOk }
     */
    function showConfirm(opts) {
        closeConfirm();
        var wrap = document.createElement('div');
        wrap.id = 'lc-confirm';
        wrap.className = 'lc-overlay';
        wrap.innerHTML =
            '<div class="lc-dialog">' +
                '<span class="lc-dialog-icon' + (opts.danger ? ' lc-dialog-icon-danger' : '') + '">' + (opts.danger ? ICON_EXIT : ICON_SHUFFLE) + '</span>' +
                '<span class="lc-dialog-title">' + escapeHtml(opts.title) + '</span>' +
                '<span class="lc-dialog-text">' + escapeHtml(opts.text) + '</span>' +
                '<div class="lc-dialog-btns">' +
                    '<button type="button" class="lc-btn-ghost" data-act="cancel">إلغاء</button>' +
                    '<button type="button" class="' + (opts.danger ? 'lc-btn-danger' : 'lc-btn-primary') + '" data-act="ok">' + escapeHtml(opts.okLabel || 'تأكيد') + '</button>' +
                '</div>' +
            '</div>';
        wrap.addEventListener('click', function (e) {
            var act = e.target.closest('[data-act]');
            if (e.target === wrap || (act && act.getAttribute('data-act') === 'cancel')) { closeConfirm(); return; }
            if (act && act.getAttribute('data-act') === 'ok') { closeConfirm(); opts.onOk(); }
        });
        document.body.appendChild(wrap);
    }
    function closeConfirm() {
        var c = el('lc-confirm');
        if (c && c.parentNode) c.parentNode.removeChild(c);
    }

    function goToLibrary() { window.location.href = '../../games.html'; }
    function confirmExitToLibrary() {
        showConfirm({ title: 'الخروج؟', text: 'بترجع لمكتبة الألعاب وما راح تنحفظ الإعدادات', okLabel: 'خروج', danger: true, onOk: goToLibrary });
    }

    // شاشة اللعب وشاشات الفوز مصممة على مسرح ثابت 1920×1080 (نفس game.html
    // بأسرع إجابة) يتصغّر/يكبر ليناسب الشاشة بدون ما يتشوه.
    function fitStages() {
        var k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        Array.prototype.forEach.call(document.querySelectorAll('.lc-stage'), function (s) {
            s.style.transform = 'translate(-50%,-50%) scale(' + k + ')';
        });
    }
    window.addEventListener('resize', fitStages);

    // ================================================================
    // 1) شاشة الإعدادات
    // ================================================================
    function sectionHtml(num, title, rowsHtml, full) {
        return '<section class="lc-card lc-section' + (full ? ' lc-section-full' : '') + '" style="animation-delay:' + ((num - 1) * 0.07).toFixed(2) + 's">' +
            '<div class="lc-section-head"><span class="lc-section-num">' + num + '</span><span class="lc-section-title">' + escapeHtml(title) + '</span></div>' +
            rowsHtml +
        '</section>';
    }
    // صف إعداد واحد: العنوان يمين وعنصر التحكم يسار (قاعدة CLAUDE.md الثابتة).
    function rowHtml(label, controlHtml, dot) {
        return '<div class="lc-row">' +
            '<div class="lc-row-label">' + (dot ? '<span class="lc-dot" style="background:' + dot + ';box-shadow:0 0 8px ' + dot + '"></span>' : '') + '<span>' + escapeHtml(label) + '</span></div>' +
            controlHtml +
        '</div>';
    }
    function textInputHtml(id, value, placeholder) {
        return '<input type="text" id="' + id + '" class="lc-input" value="' + escapeAttr(value) + '" placeholder="' + escapeAttr(placeholder) + '">';
    }

    function renderSettingsScreen() {
        _screen = 'settings';
        ensureBody();
        var root = ensureRoot();

        var team1Rows =
            rowHtml('اسم الفريق', textInputHtml('lc-input-team1name', _settings.team1Name, 'مثلاً: الصقور'), _settings.team1Color) +
            rowHtml('كلمة الدخول', textInputHtml('lc-input-team1code', _settings.team1AccessCode, 'مثلاً: صقر'), _settings.team1Color);
        var team2Rows =
            rowHtml('اسم الفريق', textInputHtml('lc-input-team2name', _settings.team2Name, 'مثلاً: النمور'), _settings.team2Color) +
            rowHtml('كلمة الدخول', textInputHtml('lc-input-team2code', _settings.team2AccessCode, 'مثلاً: نمر'), _settings.team2Color);
        var matchRows =
            rowHtml('اسمك (حروف مع …)', textInputHtml('lc-input-hostname', _settings.hostName, 'مثلاً: أيمن')) +
            rowHtml('وقت الإجابة (دقيقة)', '<div class="lc-seg" id="lc-timer-group">' + answerTimerPillsHtml() + '</div>') +
            (isCachedAllowedAdminUser()
                ? rowHtml('بنك الأسئلة', '<a href="admin-questions.html" target="_blank" class="lc-btn-chip">إدارة الأسئلة</a>')
                : '');

        root.innerHTML =
            '<div class="lc-app">' +
                fxHtml() +
                headerHtml(headerBtnHtml('lc-exit-btn', 'خروج', ICON_EXIT, 'exit')) +
                '<main class="lc-main"><div class="lc-wrap">' +
                    '<div class="lc-hero">' +
                        '<span class="lc-title">' + GAME_NAME + '</span>' +
                        '<div id="lc-conn-status-wrap">' + connectionBadgeHtml() + '</div>' +
                    '</div>' +
                    '<div class="lc-scroll"><div class="lc-sections">' +
                        sectionHtml(1, 'الفريق 1', team1Rows) +
                        sectionHtml(2, 'الفريق 2', team2Rows) +
                        sectionHtml(3, 'المباراة', matchRows, true) +
                    '</div></div>' +
                    '<div class="lc-actions">' +
                        '<button type="button" id="lc-connect-btn" class="lc-btn-primary lc-btn-wide">الدخول للوبي' + ICON_ARROW + '</button>' +
                    '</div>' +
                '</div></main>' +
            '</div>';

        wireSettingsHandlers();
    }

    /**
     * شارة حالة الاتصال بالبث تحت عنوان اللعبة -- ما فيه حقل كتابة يوزر
     * إطلاقاً؛ تقرأ الاتصال المتحقَّق منه مرة وحدة بصفحة مكتبة الألعاب عبر
     * getSavedStreamConnection() أعلاه (نفس شارة "متصل بالبث" بأسرع إجابة).
     */
    function connectionBadgeHtml() {
        var saved = getSavedStreamConnection();
        if (saved) {
            return '<span class="lc-live lc-live-on"><span class="lc-live-dot"></span>متصل بالبث · @' + escapeHtml(saved.username) + '</span>';
        }
        return '<span class="lc-live lc-live-off"><span class="lc-live-dot"></span>غير متصل بالبث</span>';
    }

    function refreshConnectionBadge() {
        var wrap = el('lc-conn-status-wrap');
        if (!wrap) return; // مو شاشة الإعدادات حالياً
        wrap.innerHTML = connectionBadgeHtml();
    }

    // يحدّث شارة الاتصال فوراً لو المضيف اتصل من تبويب مكتبة الألعاب وهذي
    // شاشة الإعدادات مفتوحة أصلاً بتبويب ثاني -- بدون ما ينتظر تحديث الصفحة.
    window.addEventListener('storage', function (e) {
        if (e.key === STREAM_CONNECTION_STORAGE_KEY) refreshConnectionBadge();
    });

    function wireSettingsHandlers() {
        el('lc-input-hostname').addEventListener('input', function (e) { _settings.hostName = e.target.value; });
        el('lc-input-team1name').addEventListener('input', function (e) { _settings.team1Name = e.target.value; });
        el('lc-input-team2name').addEventListener('input', function (e) { _settings.team2Name = e.target.value; });
        el('lc-input-team1code').addEventListener('input', function (e) { _settings.team1AccessCode = e.target.value; });
        el('lc-input-team2code').addEventListener('input', function (e) { _settings.team2AccessCode = e.target.value; });

        el('lc-timer-group').addEventListener('click', function (e) {
            var btn = e.target.closest('.lc-timer-pill'); if (!btn) return;
            _settings.answerTimerSeconds = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });

        el('lc-exit-btn').addEventListener('click', confirmExitToLibrary);
        el('lc-connect-btn').addEventListener('click', handleConnectClick);

        refreshConnectionBadge();
    }

    function showSettingsError(msg) { showToast(msg); }

    function handleConnectClick() {
        var saved = getSavedStreamConnection();
        var kw1 = normalizeArabicText(_settings.team1AccessCode);
        var kw2 = normalizeArabicText(_settings.team2AccessCode);

        if (!_settings.team1Name.trim() || !_settings.team2Name.trim()) return showSettingsError('اكتب اسم كل فريق');
        if (!kw1 || !kw2) return showSettingsError('اكتب كلمة الدخول لكل فريق');
        if (kw1 === kw2) return showSettingsError('كلمة الدخول لازم تختلف بين الفريقين');
        if (!saved) return showSettingsError('غير متصل بالبث · ابدأ البث على حسابك المربوط ونتصل تلقائياً');

        _settings.tiktokUsername = saved.username;
        AGP.streamConnector.connect('tiktok', { username: saved.username });
    }

    function renderConnectingScreen(message) {
        _screen = 'connecting';
        ensureBody();
        var root = ensureRoot();
        root.innerHTML =
            '<div class="lc-app">' +
                fxHtml() +
                headerHtml() +
                '<main class="lc-main lc-main-center">' +
                    '<div class="lc-card lc-connecting">' +
                        '<div class="lc-spinner"></div>' +
                        '<span class="lc-connecting-title">' + escapeHtml(message || 'جارٍ الاتصال بالبث') + '</span>' +
                        '<span class="lc-connecting-sub">لحظات قليلة</span>' +
                    '</div>' +
                '</main>' +
            '</div>';
    }

    // ================================================================
    // 2) شاشة اللوبي
    // ================================================================
    function renderLobbyScreen() {
        _screen = 'lobby';
        _registrationOpen = true;
        ensureBody();
        wireCommentListener();
        if (AGP.lobby && typeof AGP.lobby.open === 'function') AGP.lobby.open();

        // نفس ترتيب لوبي حرب الفريقين (games/team-war/lobby.html): خط Zain، زر
        // "الإعدادات" بقائمة (الرجوع للإعدادات / مكتبة الألعاب)، كرت لكل فريق،
        // وزر أخضر "الدخول للمباراة" وتحته رابط مكتبة الألعاب.
        var root = ensureRoot();
        root.innerHTML =
            '<div class="lc-app lc-zain">' +
                fxHtml() +
                headerHtml(
                    headerBtnHtml('lc-exit-btn', 'خروج', ICON_EXIT, 'exit') +
                    '<div class="lc-menu-wrap">' +
                        headerBtnHtml('lc-lobby-menu-btn', 'الإعدادات', ICON_GEAR, 'accent') +
                        '<div class="lc-menu" id="lc-lobby-menu" hidden>' +
                            '<button type="button" id="lc-lobby-back-settings-btn" class="lc-menu-item">الرجوع للإعدادات</button>' +
                            '<button type="button" id="lc-lobby-library-btn" class="lc-menu-item lc-menu-item-danger">العودة لمكتبة الألعاب</button>' +
                        '</div>' +
                    '</div>'
                ) +
                '<main class="lc-main"><div class="lc-wrap">' +
                    '<div class="lc-hero lc-hero-lobby">' +
                        '<span class="lc-hero-sub">' + GAME_NAME + '</span>' +
                        '<span class="lc-title">لوبي الدخول</span>' +
                    '</div>' +
                    '<div class="lc-lobby-grid">' +
                        teamPanelHtml(TEAM1) +
                        teamPanelHtml(TEAM2) +
                    '</div>' +
                    '<div class="lc-lobby-actions">' +
                        '<button type="button" id="lc-start-game-btn" class="lc-btn-go">الدخول للمباراة' + ICON_ARROW + '</button>' +
                        '<a href="../../games.html" id="lc-lobby-library-link" class="lc-lobby-link">العودة لمكتبة الألعاب</a>' +
                    '</div>' +
                '</div></main>' +
            '</div>';

        el('lc-start-game-btn').addEventListener('click', handleStartGame);
        el('lc-exit-btn').addEventListener('click', confirmExitToLibrary);
        var menu = el('lc-lobby-menu');
        el('lc-lobby-menu-btn').addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; });
        root.querySelector('.lc-app').addEventListener('click', function (e) { if (!e.target.closest('.lc-menu-wrap')) menu.hidden = true; });
        el('lc-lobby-back-settings-btn').addEventListener('click', function () {
            menu.hidden = true;
            showConfirm({
                title: 'الرجوع للإعدادات؟', text: 'بترجع لشاشة الإعدادات وينقطع الاتصال الحالي بالبث',
                okLabel: 'رجوع', danger: true, onOk: function () { window.location.reload(); }
            });
        });
        el('lc-lobby-library-btn').addEventListener('click', function () { menu.hidden = true; confirmExitToLibrary(); });
        el('lc-lobby-library-link').addEventListener('click', function (e) { e.preventDefault(); confirmExitToLibrary(); });

        refreshLobbyPanels();
    }

    function teamPanelHtml(team) {
        var color = teamColor(team);
        var players = getTeamPlayers(team);
        return '<section class="lc-team-panel" style="--tc:' + color + ';--tc-fill:' + teamFill(color) + ';--tc-soft:' + hexToRgba(color, 0.08) + ';--tc-bd:' + hexToRgba(color, 0.5) + ';--tc-halo:' + hexToRgba(color, 0.18) + '">' +
            '<span class="lc-team-panel-halo"></span>' +
            '<div class="lc-team-panel-head">' +
                '<div class="lc-team-panel-top">' +
                    '<span class="lc-team-panel-name"><span class="lc-dot lc-dot-lg"></span><span class="lc-ellipsis">' + escapeHtml(teamName(team)) + '</span></span>' +
                    '<span class="lc-count-pill"><b id="lc-team-count-' + team + '">' + players.length + '</b><span>لاعب</span></span>' +
                '</div>' +
                '<div class="lc-keyword-wrap">' +
                    '<span class="lc-keyword-label">الكلمة المفتاحية · اكتبها في الشات للانضمام</span>' +
                    '<span class="lc-keyword">' + escapeHtml(teamCode(team)) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="lc-team-panel-body" id="lc-team-body-' + team + '">' + teamPlayerChipsHtml(team, players) + '</div>' +
        '</section>';
    }

    // بطاقة اللاعب باللوبي: كبسولة أسرع إجابة (صورة + اسم + ×) للاعب العادي،
    // واللاعب اللي عنده إطار معتمد من المنصة يعرض إطاره الحقيقي عبر
    // AGP.playerCard المشترك (نفس آلية باقي الألعاب).
    function isFramed(p) { return !!(p && p.frame && p.frame.imageFilename); }
    function playerCardHtml(p, color) {
        var removeBtn = '<button type="button" class="lc-lobby-remove-x" data-id="' + escapeAttr(p.id) + '" aria-label="إقصاء ' + escapeAttr(playerLabel(p)) + '">' + ICON_X + '</button>';
        if (isFramed(p)) {
            return '<div class="lc-pframe">' +
                AGP.playerCard.renderHtml(p, { showFrame: true, basePath: '../../', outClass: 'lc-pcard-wrap' }) +
                removeBtn +
            '</div>';
        }
        return '<div class="lc-pchip">' +
            avatarHtml(p, color) +
            '<span class="lc-pchip-name">' + escapeHtml(playerLabel(p)) + '</span>' +
            removeBtn +
        '</div>';
    }
    function fitLobbyCardNames(rootEl) {
        if (AGP.playerCard && rootEl) AGP.playerCard.fitAllNames(rootEl);
    }

    function teamPlayerChipsHtml(team, players) {
        if (!players.length) return '<div class="lc-team-empty">بانتظار انضمام اللاعبين…</div>';
        var color = teamColor(team);
        return '<div class="lc-pgrid">' + players.map(function (p) { return playerCardHtml(p, color); }).join('') + '</div>';
    }

    function wireLobbyCardRemoveButtons(container) {
        if (!container) return;
        container.querySelectorAll('.lc-lobby-remove-x').forEach(function (btn) {
            btn.addEventListener('click', function () {
                AGP.player.removePlayer(btn.getAttribute('data-id'));
            });
        });
    }

    // Framed lobby cards fill one player slot like Team War's lobby: the
    // shared renderer crops tall frame artwork to its fixed card height, so
    // each framed card is re-expanded to its frame image's full opaque
    // height (measured once per image) and zoomed to fit 215px wide, at
    // most 84px tall.
    var _lcFrameBoundsCache = {};

    function getFrameOpaqueRows(src) {
        if (_lcFrameBoundsCache[src]) return _lcFrameBoundsCache[src];
        _lcFrameBoundsCache[src] = new Promise(function (resolve) {
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
        return _lcFrameBoundsCache[src];
    }

    function fitLobbyFramedCards(container) {
        if (!container) return;
        container.querySelectorAll('.agp-pcard-tpl:not([data-lc-fit])').forEach(function (card) {
            var frameEl = card.querySelector('.agp-pcard-tpl-frame-img');
            var m = frameEl && /url\(["']?(.*?)["']?\)/.exec(frameEl.style.backgroundImage);
            if (!m) return;
            card.setAttribute('data-lc-fit', 'pending');
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
                card.style.zoom = String(Math.min(215 / cardW, 84 / fullH));
                card.setAttribute('data-lc-fit', '1');
            });
        });
    }

    function refreshLobbyPanels() {
        [TEAM1, TEAM2].forEach(function (team) {
            var body = el('lc-team-body-' + team);
            if (!body) return;
            var players = getTeamPlayers(team);
            body.innerHTML = teamPlayerChipsHtml(team, players);
            wireLobbyCardRemoveButtons(body);
            fitLobbyCardNames(body);
            fitLobbyFramedCards(body);
            var countEl = el('lc-team-count-' + team);
            if (countEl) countEl.textContent = players.length;
        });
        refreshLobbyStartButton();
    }
    function refreshLobbyStartButton() {
        var btn = el('lc-start-game-btn');
        if (!btn) return;
        btn.classList.toggle('lc-btn-dim', !(getTeamPlayers(TEAM1).length && getTeamPlayers(TEAM2).length));
    }

    function handleStartGame() {
        if (!getTeamPlayers(TEAM1).length || !getTeamPlayers(TEAM2).length) return showToast('كل فريق يحتاج لاعب واحد على الأقل');
        goToGame();
    }

    // -------------------------- الشات: انضمام + تصحيح تلقائي + اختيار حرف --------------------------
    // مستمع واحد موحّد على كل تعليقات البث (يبقى مفعّلاً طول المباراة)،
    // يتحقق بالترتيب: (1) انضمام بكلمة مفتاحية، (2) تصحيح تلقائي لو فيه
    // سؤال مفتوح ونص التعليق يطابق الإجابة المحفوظة، (3) اختيار الحرف
    // التالي لو كاتب التعليق هو آخر لاعب اعتُمدت إجابته ولا فيه سؤال مفتوح.
    function wireCommentListener() {
        if (_commentUnsub) return;
        _commentUnsub = AGP.events.on('stream:commentReceived', handleIncomingComment);
    }

    // إطار الاسم وبطاقة الفوز (وصورة الحساب) تجي مع كل تعليق -- نحدّثها
    // للاعب المنضم أصلاً، حتى لو ما كانت موجودة لحظة انضمامه (نفس سجل
    // اللاعبين بروليت الإقصاء). اللوبي يتحدّث فوراً لو تغيّر إطار أحد.
    function refreshPlayerCollectibles(payload) {
        var p = findPlayerById(payload.id);
        if (!p) return;
        var frameChanged = false;
        if (payload.frame && JSON.stringify(payload.frame) !== JSON.stringify(p.frame || null)) { p.frame = payload.frame; frameChanged = true; }
        if (payload.winCard !== undefined) p.winCard = payload.winCard || null;
        if (payload.avatarUrl && !p.avatarUrl) { p.avatarUrl = payload.avatarUrl; frameChanged = true; }
        if (p.winCard && AGP.winCard) AGP.winCard.preloadFor(p);
        if (frameChanged && _screen === 'lobby') refreshLobbyPanels();
    }

    function handleIncomingComment(payload) {
        if (!payload || typeof payload.text !== 'string' || !payload.id) return;
        var norm = normalizeArabicText(payload.text);

        refreshPlayerCollectibles(payload);
        if (_registrationOpen && tryHandleJoin(payload, norm)) return;
        if (_screen !== 'game') return;
        if (_inviteOpen && tryHandleInviteJoin(payload, norm)) return;
        if (_activeIdx != null) { tryHandleAutoAnswer(payload, norm); return; }
        tryHandleLetterPick(payload, norm);
    }

    function tryHandleJoin(payload, norm) {
        var kw1 = normalizeArabicText(_settings.team1AccessCode);
        var kw2 = normalizeArabicText(_settings.team2AccessCode);
        var team = null;
        if (norm === kw1) team = TEAM1;
        else if (norm === kw2) team = TEAM2;
        if (!team) return false;

        var existing = findPlayerById(payload.id);
        if (existing && existing.team === team) return true;
        if (existing) AGP.player.removePlayer(payload.id);

        AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null, winCard: payload.winCard || null, team: team });
        return true;
    }

    // نمط "رقم فريق + إجابة مباشرة بنفس الرسالة" لمشاهد ما دخل فريق بعد
    // -- مثلاً "1 التمر" أو "1التمر" أو "1-التمر" أو "١-التمر" (رقم عربي
    // أو إنجليزي، بفاصل أو بدونه). يُوضَّح هذا الخيار بشاشة اللوبي فقط.
    var UNJOINED_TEAM_ANSWER_RE = /^\s*([12١٢])[\s\-–—.,:]*([\s\S]+)$/;

    function tryHandleAutoAnswer(payload, norm) {
        if (_answerTimerExpired) return; // انتهى وقت الإجابة على هذي الخلية -- التصحيح التلقائي متوقف، الأزرار اليدوية تبقى شغالة
        var question = _cellQuestions[_activeIdx];
        if (!question || !question.answer) return;
        // يقبل الإجابة الأساسية أو أي صيغة بديلة (aliases) مسجّلة لنفس
        // السؤال من شاشة الأدمن -- بعض المشاهدين يكتبون نفس الجواب بصيغة
        // مختلفة (مرادف، اختصار، مع/بدون أل التعريف...).
        var accepted = [question.answer].concat(question.aliases || []);
        function isAccepted(text) {
            var n = normalizeArabicText(text);
            return !!n && accepted.some(function (a) { return normalizeArabicText(a) === n; });
        }

        var player = findPlayerById(payload.id);
        if (player) {
            if (isAccepted(payload.text)) resolveCredit(player.team, player);
            return;
        }

        // مو منضم لأي فريق بعد -- يقدر ينضم ويُحتسب جوابه بنفس الرسالة
        // لو كتب رقم فريقه (1/2) ثم إجابته الصحيحة مباشرة.
        var m = UNJOINED_TEAM_ANSWER_RE.exec(payload.text || '');
        if (!m) return;
        var team = (m[1] === '1' || m[1] === '١') ? TEAM1 : TEAM2;
        if (!isAccepted(m[2])) return;

        AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null, winCard: payload.winCard || null, team: team });
        var newPlayer = findPlayerById(payload.id);
        if (newPlayer) resolveCredit(team, newPlayer);
    }

    function tryHandleLetterPick(payload, norm) {
        if (!_lastAnswererPlayer || payload.id !== _lastAnswererPlayer.id) return;
        var typed = normalizeLetterText(payload.text);
        if (!typed) return;
        for (var idx = 0; idx < BOARD_SIZE; idx++) {
            if (_cellStates[idx] !== 0) continue;
            var letter = _cellLetters[idx];
            // يقبل الحرف المجرد ("ط") أو اسمه كاملاً ("طاء").
            if (normalizeLetterText(letter) === typed || normalizeLetterText(LETTER_NAMES[letter] || '') === typed) {
                selectCell(idx);
                return;
            }
        }
    }

    // ================================================================
    // 3) شاشة اللعب
    // ================================================================
    function syncScoreManagerTotals() {
        AGP.scoreManager.setScore(SCORE_KEY_TEAM1, _roundWins1);
        AGP.scoreManager.setScore(SCORE_KEY_TEAM2, _roundWins2);
    }

    function drawBoardLetters() {
        var chosen = shuffleArray(ALPHABET_28).slice(0, BOARD_SIZE);
        _cellLetters = shuffleArray(chosen);
        _cellStates = new Array(BOARD_SIZE).fill(0);
        _cellQuestions = new Array(BOARD_SIZE).fill(null);
    }

    function pickQuestionForLetter(letter) {
        var bank = QUESTION_BANK[letter] || [];
        if (!bank.length) return { text: 'سؤال حرف ' + letter, answer: '', questionIndex: -1 };
        if (!_usedQuestions[letter]) _usedQuestions[letter] = {};
        var used = _usedQuestions[letter];
        var available = [];
        for (var i = 0; i < bank.length; i++) { if (!used[i]) available.push(i); }
        // لو بنك الحرف خلص كله بهذي المباراة (حالة نادرة)، نسمح بالتكرار
        // كحل أخير بدل ما توقف اللعبة.
        var pickIdx = available.length
            ? available[Math.floor(Math.random() * available.length)]
            : Math.floor(Math.random() * bank.length);
        used[pickIdx] = true;
        return { text: bank[pickIdx].question, answer: bank[pickIdx].answer, aliases: bank[pickIdx].aliases || [], questionIndex: pickIdx };
    }

    function goToGame() {
        wireAnswerTimerListeners();
        // إغلاق باب الانضمام/التبديل بكلمة الدخول بمجرد بدء المباراة --
        // يبقى مفتوحاً فقط باللوبي. لا يمس هذا مسار "رقم فريق + إجابة
        // صحيحة بنفس الرسالة" لمشاهد لسا ما انضم أصلاً (tryHandleAutoAnswer)،
        // ذاك يبقى شغالاً طول المباراة كما هو مطلوب.
        _registrationOpen = false;
        _matchStartedAt = Date.now();
        _round = 1;
        _roundWins1 = 0; _roundWins2 = 0;
        _usedQuestions = {};
        drawBoardLetters();
        _activeIdx = null;
        _answerTimerExpired = false;
        _timeUpModalOpen = false;
        _connectionWinner = null;
        _boardFullNoWinner = false;
        _answerModal = null;
        _lastAnswererPlayer = null;
        _reshuffleNotice = null;
        _settingsOpen = false;
        _inviteOpen = false;
        _joinPending = [];

        AGP.scoreManager.reset();
        syncScoreManagerTotals();
        AGP.events.emit('game:roundStarted', { gameId: GAME_ID });

        playMatchStartSound();
        _showIntro = true;
        _screen = 'game';
        renderGameScreen();
        setTimeout(function () { _showIntro = false; if (_screen === 'game') renderGameScreen(); }, 1600);
    }

    function playIntro() {
        _showIntro = true;
        renderGameScreen();
        setTimeout(function () { _showIntro = false; if (_screen === 'game') renderGameScreen(); }, 1600);
    }

    /**
     * يبدأ مؤقت الإجابة للخلية المفتوحة حالياً -- بدون أثر لو answerTimerSeconds
     * = 0 (مؤقت مطفأ). seconds اختياري: يُمرَّر فقط عند تمديد دقيقة إضافية بعد
     * نافذة "انتهى الوقت" (خلاف ذلك تُستخدم مدة الإعدادات answerTimerSeconds).
     */
    function startAnswerTimer(seconds) {
        _answerTimerExpired = false;
        _timeUpModalOpen = false;
        _currentAnswerTimerSeconds = seconds || _settings.answerTimerSeconds;
        AGP.timerManager.stop(ANSWER_TIMER_NAME);
        if (_currentAnswerTimerSeconds) AGP.timerManager.start(ANSWER_TIMER_NAME, _currentAnswerTimerSeconds);
    }
    function stopAnswerTimer() {
        AGP.timerManager.stop(ANSWER_TIMER_NAME);
    }

    // مسجَّلة مرة واحدة فقط طول عمر الصفحة (وليس بكل مباراة) لتفادي
    // تراكم مستمعين مكررين على timer:tick/timer:ended.
    var _answerTimerListenersWired = false;
    function wireAnswerTimerListeners() {
        if (_answerTimerListenersWired) return;
        _answerTimerListenersWired = true;
        AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== ANSWER_TIMER_NAME) return;
            var el2 = el('lc-answer-timer-val');
            if (el2) el2.textContent = formatTimerLabel(payload.remainingSeconds);
            var ring = el('lc-timer-ring');
            if (ring) ring.setAttribute('style', timerRingStyle(payload.remainingSeconds));
            if (payload.remainingSeconds <= 5 && payload.remainingSeconds >= 1) playTimerTickSound();
        });
        AGP.events.on('timer:ended', function (payload) {
            if (payload.name !== ANSWER_TIMER_NAME) return;
            if (_activeIdx == null) return;
            _answerTimerExpired = true;
            _timeUpModalOpen = true;
            if (_screen === 'game') renderGameScreen();
        });
    }

    /** المضيف يختار إكمال بنفس السؤال والجواب بدقيقة إضافية بعد نافذة "انتهى الوقت". */
    function handleTimeUpSameQuestion() {
        _timeUpModalOpen = false;
        startAnswerTimer(60);
        renderGameScreen();
    }

    /** المضيف يختار سؤالاً جديداً لنفس الحرف -- بنفس مدة الإعدادات الأساسية (answerTimerSeconds) لا بدقيقة ثابتة. */
    function handleTimeUpNewQuestion() {
        _timeUpModalOpen = false;
        if (_activeIdx != null) _cellQuestions[_activeIdx] = pickQuestionForLetter(_cellLetters[_activeIdx]);
        startAnswerTimer(_settings.answerTimerSeconds);
        renderGameScreen();
    }

    function formatTimerLabel(totalSeconds) {
        var m = Math.floor(totalSeconds / 60), s = totalSeconds % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function selectCell(idx) {
        if (_timeUpModalOpen) return; // لازم يحسم اختيار نافذة "انتهى الوقت" على الخلية الحالية أول
        if (_cellStates[idx] !== 0) return;
        if (_activeIdx === idx) return;
        playSelectSound();
        setTimeout(playQuestionSound, 120);
        if (!_cellQuestions[idx]) _cellQuestions[idx] = pickQuestionForLetter(_cellLetters[idx]);
        _activeIdx = idx;
        startAnswerTimer();
        renderGameScreen();
        playLetterRevealAnimation(_cellLetters[idx]);
    }

    /**
     * انيميشن بصري بحت (لا يمس منطق اللعبة): الحرف المختار يكبر بمنتصف
     * الشاشة ٣ ثوانٍ ثم يطير لمكان شارة الحرف الحالي فوق صندوق السؤال
     * (نفس موضع .lc-badge-hex نهائياً)، فيتطابق تماماً مع الشارة الحقيقية
     * المعروضة أصلاً هناك عند وصوله. عنصر منفصل يُضاف يدوياً للـDOM (خارج
     * قالب renderGameScreen) حتى يستمر الانيميشن حتى لو حصل rerender بسيط
     * بينهما (نادر) دون قطعه في منتصف الحركة.
     */
    function playLetterRevealAnimation(letter) {
        // على غلاف الشاشة (مو المسرح المصغَّر .lc-stage) حتى يتوسّط الشاشة الفعلية.
        var screen = document.querySelector('.lc-game-app');
        if (!screen) return;

        // خلفية معتمة ومغبشة طول مدة الانيميشن -- تختفي بالضبط لحظة وصول
        // الحرف لمكانه النهائي فتظهر الشاشة كاملة وواضحة من جديد.
        var backdrop = document.createElement('div');
        backdrop.className = 'lc-letter-reveal-backdrop';
        screen.appendChild(backdrop);
        backdrop.addEventListener('animationend', function () {
            if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        });

        var overlay = document.createElement('div');
        overlay.className = 'lc-letter-reveal';
        overlay.textContent = letter;
        screen.appendChild(overlay);
        overlay.addEventListener('animationend', function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        });
    }

    /** تصحيح يدوي احتياطي من المضيف -- يُستخدم لو ما حد كتب الجواب حرفياً بالشات. */
    function creditTeamManual(team) {
        if (_activeIdx == null) return;
        var players = getTeamPlayers(team);
        resolveCredit(team, players.length ? players[0] : null);
    }

    function resolveCredit(team, answererPlayer) {
        if (_activeIdx == null) return;
        var idx = _activeIdx;
        var cellStates = _cellStates.slice();
        cellStates[idx] = team;

        var teamName = (team === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var teamColor = (team === TEAM1) ? _settings.team1Color : _settings.team2Color;
        var playerName = answererPlayer ? playerLabel(answererPlayer) : 'أحد اللاعبين';
        var question = _cellQuestions[idx];

        playCorrectSound();
        var won = isConnected(cellStates, team);
        var full = cellStates.every(function (x) { return x !== 0; });

        stopAnswerTimer();
        _cellStates = cellStates;
        _activeIdx = null;
        _connectionWinner = won ? team : null;
        _boardFullNoWinner = !won && full;
        _lastAnswererPlayer = answererPlayer ? { id: answererPlayer.id, name: playerLabel(answererPlayer), team: team } : null;
        _answerModal = {
            question: question ? question.text : '', answer: question ? question.answer : '', teamName: teamName, teamColor: teamColor, playerName: playerName,
            avatarUrl: answererPlayer ? answererPlayer.avatarUrl : null,
            playerInitial: answererPlayer ? playerInitial(answererPlayer) : '؟'
        };
        renderGameScreen();
    }

    function closeAnswerModal() {
        _answerModal = null;
        if (_connectionWinner) {
            playRoundWinSound();
            _screen = 'roundWinner';
            renderRoundWinnerScreen();
            return;
        }
        if (_boardFullNoWinner) {
            _boardFullNoWinner = false;
            reshuffleRound('full');
            return;
        }
        renderGameScreen();
    }

    /** إعادة توزيع الجولة الحالية بأحرف وأسئلة جديدة، بدون احتساب نقاط --
     * تلقائياً لو امتلأت الرقعة بدون فوز، أو يدوياً من زر الشارة العلوية. */
    function reshuffleRound(reason) {
        stopAnswerTimer();
        playReshuffleSound();
        drawBoardLetters();
        _activeIdx = null;
        _answerTimerExpired = false;
        _timeUpModalOpen = false;
        _lastAnswererPlayer = null;
        _reshuffleNotice = (reason === 'manual')
            ? 'أعاد المضيف توزيع الرقعة -- أحرف وأسئلة جديدة'
            : 'الرقعة امتلأت بدون خط متصل -- تُعاد الجولة بأحرف وأسئلة جديدة';
        renderGameScreen();
        setTimeout(function () { _reshuffleNotice = null; if (_screen === 'game') renderGameScreen(); }, 1800);
    }

    function handleRoundBadgeClick() {
        if (_activeIdx != null) return showToast('خلّص السؤال المفتوح أول');
        showConfirm({
            title: 'إعادة توزيع الرقعة؟', text: 'أحرف وأسئلة جديدة لنفس الجولة بدون احتساب نقاط',
            okLabel: 'إعادة توزيع', onOk: function () { _settingsOpen = false; reshuffleRound('manual'); }
        });
    }

    // بداية المباراة الفعلية -- لحساب مدة اللعب بنظام نقاط المنصة.
    var _matchStartedAt = 0;

    // نظام نقاط المنصة الموحّد (window.AGPAuth.reportMatchPoints): كل
    // لاعبي الفريقين مشاركون، ولاعبو الفريق الفائز فائزون (لعبة فريقين).
    function reportPlatformPoints(winningTeam) {
        if (!window.AGPAuth || typeof window.AGPAuth.reportMatchPoints !== 'function') return;
        window.AGPAuth.reportMatchPoints({
            players: getTeamPlayers(TEAM1).concat(getTeamPlayers(TEAM2)),
            winnerIds: getTeamPlayers(winningTeam).map(function (p) { return p.id; }),
            teamGame: true,
            durationMs: _matchStartedAt ? (Date.now() - _matchStartedAt) : 0
        });
    }

    function continueAfterRoundWin() {
        var winner = _connectionWinner;
        if (winner === TEAM1) _roundWins1++; else if (winner === TEAM2) _roundWins2++;
        syncScoreManagerTotals();
        _connectionWinner = null;

        if (_roundWins1 >= ROUND_WINS_TO_CLINCH || _roundWins2 >= ROUND_WINS_TO_CLINCH) {
            reportPlatformPoints(_roundWins1 >= ROUND_WINS_TO_CLINCH ? TEAM1 : TEAM2);
            _screen = 'result';
            renderResultScreen();
            return;
        }

        stopAnswerTimer();
        _round++;
        drawBoardLetters();
        _activeIdx = null;
        _answerTimerExpired = false;
        _answerModal = null;
        _lastAnswererPlayer = null;
        _screen = 'game';
        renderGameScreen();
        playIntro();
    }

    // زر "ملء الشاشة" بالشريط العلوي لشاشة اللعب (جنب "دخول لاعبين جدد").
    function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    function toggleFullscreen() {
        var d = document, de = d.documentElement;
        try {
            if (isFullscreen()) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
            else (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
        } catch (e) { showToast('المتصفح ما يدعم ملء الشاشة'); }
    }
    function onFullscreenChange() {
        var btn = el('lc-fullscreen-btn');
        if (!btn) return;
        var on = isFullscreen();
        btn.innerHTML = (on ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN) + '<span class="lc-hbtn-label">' + (on ? 'إلغاء ملء الشاشة' : 'ملء الشاشة') + '</span>';
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    function openSettingsDrawer() { _settingsOpen = true; renderGameScreen(); }
    function closeSettingsDrawer() { _settingsOpen = false; renderGameScreen(); }
    // نافذة "دخول لاعبين جدد" (نفس نافذة روليت الإقصاء): وهي مفتوحة، أي
    // مشاهد ما هو بأي فريق يكتب كلمة فريقه بالشات فيظهر بالقائمة (ببطاقته
    // وإطاره لو عنده)، والمضيف يقدر يشيله بـ×. عند "إكمال المباراة" يدخلون
    // فرقهم فعلياً. كلمة الدخول خارج هذي النافذة مقفلة وسط المباراة.
    function openInviteModal() { _settingsOpen = false; _inviteOpen = true; _joinPending = []; renderGameScreen(); }
    function closeInviteModal() {
        _inviteOpen = false;
        _joinPending.forEach(function (j) { if (!findPlayerById(j.id)) AGP.player.addPlayer(j); });
        _joinPending = [];
        renderGameScreen();
    }
    function tryHandleInviteJoin(payload, norm) {
        var team = (norm === normalizeArabicText(_settings.team1AccessCode)) ? TEAM1
            : (norm === normalizeArabicText(_settings.team2AccessCode)) ? TEAM2 : null;
        if (!team) return false;
        if (findPlayerById(payload.id)) return true; // منضم أصلاً لفريق
        var pending = null;
        for (var i = 0; i < _joinPending.length; i++) { if (_joinPending[i].id === payload.id) pending = _joinPending[i]; }
        if (pending && pending.team === team) return true;
        if (pending) pending.team = team; // غيّر فريقه قبل الإكمال
        else _joinPending.push({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null, winCard: payload.winCard || null, team: team });
        playJoinSound();
        renderGameScreen();
        return true;
    }

    function endMatch() {
        showConfirm({
            title: 'إنهاء المباراة؟', text: 'بينقطع الاتصال بالبث وتُصفَّر كل بيانات المباراة',
            okLabel: 'إنهاء', danger: true, onOk: doEndMatch
        });
    }
    function doEndMatch() {
        stopAnswerTimer();
        AGP.streamConnector.disconnect('tiktok');
        AGP.gameManager.resetSession();
        _registrationOpen = false;
        if (_commentUnsub) { _commentUnsub(); _commentUnsub = null; }

        _round = 1; _roundWins1 = 0; _roundWins2 = 0; _usedQuestions = {};
        _cellLetters = []; _cellStates = []; _cellQuestions = [];
        _activeIdx = null; _answerTimerExpired = false; _timeUpModalOpen = false; _connectionWinner = null; _boardFullNoWinner = false;
        _answerModal = null; _lastAnswererPlayer = null; _settingsOpen = false; _inviteOpen = false; _joinPending = [];

        renderSettingsScreen();
    }

    function restartGame() {
        // البقاء متصلاً بنفس البث (لا مبرر لإعادة كتابة يوزر البث من الصفر)
        // وتصفير اللاعبين + رقعة اللعب، ثم الرجوع مباشرة للوبي لبدء مباراة جديدة.
        stopAnswerTimer();
        AGP.player.getAllPlayers().slice().forEach(function (p) { AGP.player.removePlayer(p.id); });
        _round = 1; _roundWins1 = 0; _roundWins2 = 0; _usedQuestions = {};
        _cellLetters = []; _cellStates = []; _cellQuestions = [];
        _activeIdx = null; _answerTimerExpired = false; _timeUpModalOpen = false; _connectionWinner = null; _boardFullNoWinner = false;
        _answerModal = null; _lastAnswererPlayer = null; _settingsOpen = false; _inviteOpen = false; _joinPending = [];
        AGP.scoreManager.reset();
        renderLobbyScreen();
    }

    // حلقة مؤقت الإجابة (نفس عدّاد سؤال أسرع إجابة): تتلوّن بالأحمر آخر 10 ثواني.
    function timerRingStyle(remaining) {
        var total = _currentAnswerTimerSeconds || _settings.answerTimerSeconds || 1;
        var deg = Math.max(0, Math.min(360, (remaining / total) * 360));
        var color = remaining <= 10 ? '#f87171' : '#a78bfa';
        return 'background:conic-gradient(' + color + ' ' + deg.toFixed(1) + 'deg, rgba(255,255,255,.07) 0);color:' + color;
    }

    var BOARD_HEIGHT_PX = 800; // ارتفاع الرقعة داخل مسرح 1920×1080

    function gameTeamCardHtml(team, activeLetter) {
        var color = teamColor(team);
        var cells = _cellStates.filter(function (x) { return x === team; }).length;
        var wins = (team === TEAM1) ? _roundWins1 : _roundWins2;
        var pips = '';
        for (var i = 0; i < ROUND_WINS_TO_CLINCH; i++) pips += '<span class="lc-pip' + (i < wins ? ' lc-pip-on' : '') + '"></span>';
        // زر التصحيح اليدوي الاحتياطي -- يظهر فقط أثناء سؤال مفتوح.
        var creditBtn = activeLetter
            ? '<button type="button" id="lc-credit-team' + team + '" class="lc-credit-btn" title="احتساب الإجابة لهذا الفريق">✓</button>'
            : '';
        return '<div class="lc-card lc-gteam" style="--tc:' + color + ';--tc-halo:' + hexToRgba(color, 0.2) + '">' +
            '<span class="lc-gteam-halo"></span>' +
            '<div class="lc-gteam-row">' +
                '<span class="lc-gteam-name"><span class="lc-dot lc-dot-lg"></span><span class="lc-ellipsis">' + escapeHtml(teamName(team)) + '</span></span>' +
                '<span class="lc-gteam-score">' + cells + '</span>' +
            '</div>' +
            '<div class="lc-gteam-row">' +
                '<span class="lc-gteam-meta">' + (team === TEAM2 ? '↔ يسار ويمين' : '↕ فوق وتحت') + ' <span class="lc-pips">' + pips + '</span></span>' +
                creditBtn +
            '</div>' +
        '</div>';
    }

    function renderGameScreen() {
        ensureBody();
        var root = ensureRoot();

        var cellsHtml = _cellLetters.map(function (letter, idx) {
            var st = _cellStates[idx];
            var layout = CELL_LAYOUT[idx];
            var isActive = _activeIdx === idx;
            var cls = 'lc-hex lc-hex-clip' + (st === 0 ? ' lc-hex-free' : ' lc-hex-owned lc-hex-t' + st) + (isActive ? ' lc-hex-active' : '');
            var style = 'left:' + layout.leftPct + '%;top:' + layout.topPct + '%;width:' + layout.wPct + '%;height:' + layout.hPct + '%;';
            if (st !== 0) style += '--tc:' + teamColor(st) + ';';
            return '<div class="' + cls + '" data-idx="' + idx + '" style="' + style + '">' +
                '<div class="lc-hex-inner lc-hex-clip">' + escapeHtml(letter) + '</div>' +
            '</div>';
        }).join('');

        var activeLetter = (_activeIdx != null) ? _cellLetters[_activeIdx] : null;
        var showAnswerTimer = activeLetter && _settings.answerTimerSeconds && !_answerTimerExpired;
        var timerNow = _currentAnswerTimerSeconds || _settings.answerTimerSeconds;

        var badgeHtml = activeLetter
            ? '<div class="lc-qbadge lc-hex-clip"><div class="lc-qbadge-inner lc-hex-clip"><span class="lc-qbadge-letter">' + escapeHtml(activeLetter) + '</span></div></div>'
            : '<button type="button" id="lc-round-badge-btn" class="lc-qbadge lc-qbadge-btn lc-hex-clip" title="إعادة توزيع الرقعة"><div class="lc-qbadge-inner lc-hex-clip">' + ICON_SHUFFLE + '<span class="lc-qbadge-cap">إعادة توزيع</span></div></button>';

        var qTitle, qSub, questionInnerHtml;
        if (activeLetter) {
            qTitle = 'سؤال حرف ' + activeLetter;
            qSub = 'أول إجابة صحيحة بالشات تاخذ الخلية';
            questionInnerHtml = escapeHtml(_cellQuestions[_activeIdx] ? _cellQuestions[_activeIdx].text : '');
        } else if (_lastAnswererPlayer) {
            qTitle = 'دور ' + _lastAnswererPlayer.name;
            qSub = 'يختار الحرف التالي بالشات';
            questionInnerHtml = '<span class="lc-question-placeholder">اكتب الحرف بالشات يا ' + escapeHtml(_lastAnswererPlayer.name) + '، أو اضغط على أي خلية</span>';
        } else {
            qTitle = 'اختر حرف';
            qSub = 'اضغط على أي خلية لعرض سؤالها';
            questionInnerHtml = '<span class="lc-question-placeholder">اضغط على أي خلية لعرض سؤالها</span>';
        }

        var timerHtml = showAnswerTimer
            ? '<div class="lc-timer-ring" id="lc-timer-ring" style="' + timerRingStyle(timerNow) + '"><div class="lc-timer-core"><span id="lc-answer-timer-val">' + formatTimerLabel(timerNow) + '</span></div></div>'
            : '';

        var introHtml = _showIntro
            ? '<div class="lc-intro"><div class="lc-intro-box"><span class="lc-intro-title">' + hostLogoHtml() + '</span><span class="lc-pill lc-pill-accent lc-intro-pill"><span class="lc-dot"></span>الجولة ' + _round + '</span></div></div>'
            : '';

        var reshuffleToastHtml = _reshuffleNotice
            ? '<div class="lc-reshuffle-toast">' + escapeHtml(_reshuffleNotice) + '</div>'
            : '';

        var answerModalHtml = '';
        if (_answerModal) {
            var m = _answerModal;
            answerModalHtml =
                '<div class="lc-overlay lc-overlay-game">' +
                    '<div class="lc-modal lc-answer-modal" style="--tc:' + m.teamColor + ';--tc-halo:' + hexToRgba(m.teamColor, 0.22) + '">' +
                        '<span class="lc-modal-halo"></span>' +
                        '<div class="lc-answer-block">' +
                            '<span class="lc-answer-label">السؤال</span>' +
                            '<div class="lc-answer-question">' + escapeHtml(m.question) + '</div>' +
                        '</div>' +
                        '<div class="lc-answer-block lc-answer-block-ok">' +
                            '<span class="lc-answer-label">الإجابة الصحيحة</span>' +
                            '<div class="lc-answer-text">' + escapeHtml(m.answer) + '</div>' +
                        '</div>' +
                        // اللاعب اللي جاوب: صورة بحلقة متدرّجة بلون فريقه، واسمه تحتها مع شارة الفريق
                        '<div class="lc-answer-who">' +
                            '<span class="lc-answer-ring">' + avatarHtml({ name: m.playerName, avatarUrl: m.avatarUrl }, m.teamColor, 'lc-av-xl') + '</span>' +
                            '<span class="lc-answer-player">' + escapeHtml(m.playerName) + '</span>' +
                            '<span class="lc-team-tag"><span class="lc-dot"></span>' + escapeHtml(m.teamName) + '</span>' +
                        '</div>' +
                        '<button type="button" id="lc-answer-modal-done" class="lc-answer-done">كمل</button>' +
                    '</div>' +
                '</div>';
        }

        var timeUpModalHtml = '';
        if (_timeUpModalOpen) {
            timeUpModalHtml =
                '<div class="lc-overlay lc-overlay-game">' +
                    '<div class="lc-dialog">' +
                        '<span class="lc-dialog-icon lc-dialog-icon-danger">' + ICON_CLOCK + '</span>' +
                        '<span class="lc-dialog-title">انتهى الوقت!</span>' +
                        '<span class="lc-dialog-text">تبون تكملون دقيقة إضافية؟</span>' +
                        '<div class="lc-dialog-col">' +
                            '<button type="button" id="lc-timeup-same-btn" class="lc-btn-primary">إكمال بنفس السؤال (+دقيقة)</button>' +
                            '<button type="button" id="lc-timeup-new-btn" class="lc-btn-ghost">سؤال جديد لنفس الحرف (' + escapeHtml(formatTimerLabel(_settings.answerTimerSeconds)) + ')</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }

        var drawerHtml = '';
        if (_settingsOpen) {
            drawerHtml =
                '<div class="lc-drawer-backdrop" id="lc-drawer-backdrop"></div>' +
                '<aside class="lc-drawer">' +
                    '<div class="lc-drawer-head"><span class="lc-drawer-title">إعدادات المباراة</span><button type="button" id="lc-drawer-close" class="lc-icon-btn" aria-label="إغلاق">' + ICON_X + '</button></div>' +
                    '<div class="lc-drawer-body">' +
                        '<div class="lc-row lc-row-flat">' +
                            '<div class="lc-row-label"><span>وقت الإجابة</span></div>' +
                            '<div class="lc-seg" id="lc-drawer-timer-group">' + answerTimerPillsHtml() + '</div>' +
                        '</div>' +
                        '<div class="lc-drawer-section-title">اللاعبون المشاركون</div>' +
                        drawerRosterHtml(TEAM1) +
                        drawerRosterHtml(TEAM2) +
                    '</div>' +
                    '<div class="lc-drawer-foot">' +
                        '<button type="button" id="lc-drawer-reset" class="lc-btn-ghost">إعادة توزيع الجولة</button>' +
                    '</div>' +
                '</aside>';
        }

        var inviteHtml = '';
        if (_inviteOpen) {
            var joinKeyHtml = function (team) {
                var color = teamColor(team);
                return '<div class="lc-join-key" style="--tc:' + color + '">' +
                    '<span class="lc-join-key-name"><span class="lc-dot"></span>' + escapeHtml(teamName(team)) + '</span>' +
                    '<span class="lc-join-key-cmd">' + escapeHtml(teamCode(team)) + '</span>' +
                '</div>';
            };
            var joinedHtml = _joinPending.length
                ? '<div class="lc-pgrid">' + _joinPending.map(function (j) { return playerCardHtml(j, teamColor(j.team)); }).join('') + '</div>'
                : '<div class="lc-join-empty">بانتظار انضمام اللاعبين…</div>';
            inviteHtml =
                '<div class="lc-join-overlay" id="lc-invite-overlay">' +
                    '<div class="lc-join">' +
                        '<div class="lc-join-head">' +
                            '<div class="lc-join-titles">' +
                                '<span class="lc-pill lc-pill-accent lc-join-pill"><span class="lc-dot"></span>لاعبين جدد</span>' +
                                '<span class="lc-join-title">دخول لاعبين جدد لم يسبق لهم الدخول</span>' +
                                '<span class="lc-join-sub">اكتب كلمة فريقك بشات البث للانضمام إلى اللعبة</span>' +
                            '</div>' +
                            '<button type="button" id="lc-invite-close-x" class="lc-icon-btn lc-join-x" aria-label="إغلاق">' + ICON_X + '</button>' +
                        '</div>' +
                        '<div class="lc-join-keys">' + joinKeyHtml(TEAM1) + joinKeyHtml(TEAM2) + '</div>' +
                        '<div class="lc-join-body">' +
                            '<div class="lc-join-count"><span>اللاعبون المنضمون</span><b>' + _joinPending.length + '</b></div>' +
                            '<div id="lc-join-list" class="lc-join-list">' + joinedHtml + '</div>' +
                        '</div>' +
                        '<div class="lc-join-foot"><button type="button" id="lc-invite-done" class="lc-btn-primary">إكمال المباراة</button></div>' +
                    '</div>' +
                '</div>';
        }

        root.innerHTML =
            '<div class="lc-app lc-game-app">' +
                fxHtml() +
                headerHtml(
                    headerBtnHtml('lc-end-match-btn', 'إنهاء المباراة', ICON_EXIT, 'exit') +
                    headerBtnHtml('lc-open-settings-btn', 'إعدادات المباراة', ICON_GEAR, 'ghost')
                , headerBtnHtml('lc-fullscreen-btn', isFullscreen() ? 'إلغاء ملء الشاشة' : 'ملء الشاشة', isFullscreen() ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN, 'ghost') +
                  headerBtnHtml('lc-open-join-btn', 'دخول لاعبين جدد', ICON_USER_ADD, 'join')) +
                '<div class="lc-stage lc-game-screen">' +
                    '<div class="lc-pills">' +
                        '<span class="lc-pill lc-pill-accent"><span class="lc-dot"></span>' + GAME_NAME + ' · الجولة ' + _round + '</span>' +
                        '<span class="lc-pill">أول فريق يكسب جولتين يفوز بالمباراة</span>' +
                    '</div>' +
                    '<div class="lc-game-body">' +
                        '<div class="lc-game-side">' +
                            '<div class="lc-host-logo">' + hostLogoHtml() + '</div>' +
                            '<div class="lc-gteams">' + gameTeamCardHtml(TEAM1, activeLetter) + gameTeamCardHtml(TEAM2, activeLetter) + '</div>' +
                            '<div class="lc-card lc-qcard">' +
                                '<div class="lc-qcard-head">' +
                                    badgeHtml +
                                    '<div class="lc-qcard-titles"><span class="lc-qcard-title">' + escapeHtml(qTitle) + '</span><span class="lc-qcard-sub">' + escapeHtml(qSub) + '</span></div>' +
                                    timerHtml +
                                '</div>' +
                                '<div class="lc-question-box"><div class="lc-question-text">' + questionInnerHtml + '</div></div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="lc-card lc-board-card">' +
                            // توهج ناعم على حواف كرت الرقعة نفسه: فوق وتحت بلون الفريق الأول، يمين ويسار بلون الفريق الثاني.
                            '<div class="lc-board-glow" style="--g1:' + teamColor(TEAM1) + ';--g2:' + teamColor(TEAM2) + '" aria-hidden="true">' +
                                '<span class="lc-glow-top"></span><span class="lc-glow-bottom"></span><span class="lc-glow-right"></span><span class="lc-glow-left"></span>' +
                            '</div>' +
                            '<div class="lc-board" style="height:' + BOARD_HEIGHT_PX + 'px;width:' + Math.round(BOARD_HEIGHT_PX * BOARD_ASPECT) + 'px;--lc-hexfont:' + Math.round(BOARD_HEIGHT_PX * HEX_H_RATIO * 0.42) + 'px">' + cellsHtml + '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                introHtml +
                reshuffleToastHtml +
                answerModalHtml +
                timeUpModalHtml +
                drawerHtml +
                inviteHtml +
            '</div>';

        fitStages();
        wireGameScreenHandlers();
        fitQuestionText();
    }

    /**
     * يصغّر خط نص السؤال تدريجياً (خطوة 2px) لو تجاوز ارتفاع صندوقه —
     * أسئلة طويلة استثنائية تبقى مقروءة بالكامل بدل أن تُقصّ، بينما تبقى
     * أغلب الأسئلة (الأقصر) بالحجم الأكبر الافتراضي المحدَّد بـCSS.
     */
    function fitQuestionText() {
        var textEl = document.querySelector('.lc-question-text');
        if (!textEl || !textEl.textContent.trim()) return;
        textEl.style.fontSize = '';
        var minSize = 32;
        var size = parseFloat(getComputedStyle(textEl).fontSize);
        var guard = 0;
        while (textEl.scrollHeight > textEl.clientHeight && size > minSize && guard < 30) {
            size -= 2;
            textEl.style.fontSize = size + 'px';
            guard++;
        }
    }

    function drawerRosterHtml(team) {
        var color = teamColor(team);
        var players = getTeamPlayers(team);
        var body = players.length
            ? players.map(function (p) {
                return '<div class="lc-roster-row">' +
                    avatarHtml(p, color, 'lc-av-sm') +
                    '<span class="lc-roster-name">' + escapeHtml(playerLabel(p)) + '</span>' +
                    '<button type="button" class="lc-drawer-roster-remove" data-id="' + escapeAttr(p.id) + '" aria-label="حذف اللاعب">' + ICON_X + '</button>' +
                '</div>';
            }).join('')
            : '<div class="lc-roster-empty">بانتظار انضمام اللاعبين عبر الشات</div>';
        return '<div class="lc-roster" style="--tc:' + color + '">' +
            '<div class="lc-roster-team"><span class="lc-dot"></span><span class="lc-ellipsis">' + escapeHtml(teamName(team)) + '</span><span class="lc-roster-count">' + players.length + '</span></div>' +
            body +
        '</div>';
    }

    function hexToRgba(hex, a) {
        var h = String(hex || '').replace('#', '');
        var r = parseInt(h.substring(0, 2), 16) || 0, g = parseInt(h.substring(2, 4), 16) || 0, b = parseInt(h.substring(4, 6), 16) || 0;
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function wireGameScreenHandlers() {
        var board = document.querySelector('.lc-board');
        board.addEventListener('click', function (e) {
            var cell = e.target.closest('.lc-hex.lc-hex-free');
            if (cell) selectCell(parseInt(cell.getAttribute('data-idx'), 10));
        });

        var roundBadgeBtn = el('lc-round-badge-btn');
        if (roundBadgeBtn) roundBadgeBtn.addEventListener('click', handleRoundBadgeClick);

        el('lc-open-settings-btn').addEventListener('click', openSettingsDrawer);
        el('lc-end-match-btn').addEventListener('click', endMatch);

        if (_activeIdx != null) {
            el('lc-credit-team1').addEventListener('click', function () { creditTeamManual(TEAM1); });
            el('lc-credit-team2').addEventListener('click', function () { creditTeamManual(TEAM2); });
        }

        if (_answerModal) {
            el('lc-answer-modal-done').addEventListener('click', closeAnswerModal);
        }

        if (_timeUpModalOpen) {
            el('lc-timeup-same-btn').addEventListener('click', handleTimeUpSameQuestion);
            el('lc-timeup-new-btn').addEventListener('click', handleTimeUpNewQuestion);
        }

        if (_settingsOpen) {
            el('lc-drawer-close').addEventListener('click', closeSettingsDrawer);
            el('lc-drawer-backdrop').addEventListener('click', closeSettingsDrawer);
            el('lc-drawer-reset').addEventListener('click', handleRoundBadgeClick);
            el('lc-drawer-timer-group').addEventListener('click', function (e) {
                var btn = e.target.closest('.lc-timer-pill'); if (!btn) return;
                _settings.answerTimerSeconds = parseInt(btn.getAttribute('data-value'), 10);
                renderGameScreen();
            });
            Array.prototype.forEach.call(document.querySelectorAll('.lc-drawer-roster-remove'), function (btn) {
                btn.addEventListener('click', function () {
                    AGP.player.removePlayer(btn.getAttribute('data-id'));
                    renderGameScreen();
                });
            });
        }

        el('lc-open-join-btn').addEventListener('click', openInviteModal);
        el('lc-fullscreen-btn').addEventListener('click', toggleFullscreen);

        if (_inviteOpen) {
            el('lc-invite-close-x').addEventListener('click', closeInviteModal);
            el('lc-invite-done').addEventListener('click', closeInviteModal);
            el('lc-invite-overlay').addEventListener('click', function (e) { if (e.target.id === 'lc-invite-overlay') closeInviteModal(); });
            var joinList = el('lc-join-list');
            Array.prototype.forEach.call(joinList.querySelectorAll('.lc-lobby-remove-x'), function (btn) {
                btn.addEventListener('click', function () {
                    var id = btn.getAttribute('data-id');
                    _joinPending = _joinPending.filter(function (j) { return j.id !== id; });
                    renderGameScreen();
                });
            });
            fitLobbyCardNames(joinList);
            fitLobbyFramedCards(joinList);
        }
    }

    // ================================================================
    // 4) شاشة الفوز بالجولة (خط متصل) + 5) النتيجة النهائية
    // ================================================================
    // نفس شاشة الفائز بروليت الإقصاء (games/elimination-roulette): نافذة فوق
    // شاشة اللعب نفسها والخلفية مغبّشة، وبطاقة "WINNER" لكل لاعب فائز (أو
    // بطاقة الفوز المملوكة من المنصة مكانها). لاعبين الفريق كلهم فائزين،
    // وكل البطاقات تظهر بالشاشة: تتصغّر تلقائياً حسب عددهم (fitWinCards).
    var WIN_CROWN_SVG = '<svg width="60" height="40" viewBox="0 0 60 40" aria-hidden="true"><polygon points="6,36 4,15 15,25 30,5 45,25 56,15 54,36" stroke-width="1.5"></polygon><circle cx="6" cy="13" r="4" stroke-width="1.5"></circle><circle cx="30" cy="4" r="4.5" stroke-width="1.5"></circle><circle cx="54" cy="13" r="4" stroke-width="1.5"></circle><rect x="6" y="32" width="48" height="6" rx="1.5" stroke-width="1.5"></rect></svg>';

    function winPlayerCardHtml(p, color, i, mainLine, subLine) {
        var name = playerLabel(p);
        return '<div class="lc-wcard" style="--wc:' + color + ';--wc-a:' + hexToRgba(color, 0.55) + ';--wc-b:' + hexToRgba(color, 0.25) + ';--wc-c:' + hexToRgba(color, 0.15) + ';animation-delay:' + (i * 0.06).toFixed(2) + 's">' +
            '<div class="lc-wcard-crown">' + WIN_CROWN_SVG + '</div>' +
            '<div class="lc-wcard-body">' +
                '<div class="lc-wcard-shine"></div>' +
                '<div class="lc-wcard-inner">' +
                    '<span class="lc-wcard-title">WINNER</span>' +
                    avatarHtml(p, color, 'lc-wcard-av') +
                    '<span class="lc-wcard-name">' + escapeHtml(name) + '</span>' +
                    '<div class="lc-wcard-foot"><span class="lc-wcard-main">' + escapeHtml(mainLine) + '<span class="lc-wcard-sub">' + escapeHtml(subLine) + '</span></span></div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }
    function winPlayersHtml(players, color, winCardLines) {
        return players.map(function (p, i) {
            // بطاقة الفوز المملوكة (js/agp-win-card.js) تحل محل بطاقة الفائز العادية بنفس المكان
            if (AGP.winCard && AGP.winCard.canShow(p)) {
                return '<div class="lc-win-owned" style="animation-delay:' + (i * 0.06).toFixed(2) + 's">' + AGP.winCard.renderHtml(p, winCardLines, { pop: false }) + '</div>';
            }
            return winPlayerCardHtml(p, color, i, winCardLines[0], winCardLines[1]);
        }).join('');
    }

    /** يرسم شاشة اللعب كما هي ويحط نافذة الفوز فوقها (الخلفية مغبّشة). */
    function showWinOverlay(team, title, lines, buttonsHtml) {
        renderGameScreen();
        var app = document.querySelector('.lc-game-app');
        var wrap = document.createElement('div');
        wrap.className = 'lc-win-overlay';
        wrap.innerHTML =
            '<div class="lc-win-box">' +
                '<h2 class="lc-win-title">' + title + '</h2>' +
                '<div class="lc-win-team" style="--tc:' + teamColor(team) + '"><span class="lc-dot lc-dot-lg"></span>' + escapeHtml(teamName(team)) + '</div>' +
                '<div class="lc-win-scroll"><div class="lc-win-cards">' + winPlayersHtml(getTeamPlayers(team), teamColor(team), lines) + '</div></div>' +
                '<div class="lc-win-btns">' + buttonsHtml + '</div>' +
            '</div>';
        app.appendChild(wrap);
        fitWinCards();
    }

    // يصغّر البطاقات (zoom) لين تدخل كلها بمنطقتها بدون سكرول -- من حجمها
    // الأساسي لين ربعه كحد أدنى.
    function fitWinCards() {
        var area = document.querySelector('.lc-win-scroll');
        var cards = area && area.querySelector('.lc-win-cards');
        if (!cards) return;
        var k = 1;
        cards.style.zoom = k;
        while (k > 0.25 && cards.getBoundingClientRect().height > area.clientHeight + 1) {
            k = Math.round((k - 0.05) * 100) / 100;
            cards.style.zoom = k;
        }
    }
    window.addEventListener('resize', fitWinCards);

    function renderRoundWinnerScreen() {
        var winningTeam = _connectionWinner;
        var prospective1 = _roundWins1 + (winningTeam === TEAM1 ? 1 : 0);
        var prospective2 = _roundWins2 + (winningTeam === TEAM2 ? 1 : 0);
        var final = prospective1 >= ROUND_WINS_TO_CLINCH || prospective2 >= ROUND_WINS_TO_CLINCH;
        var score = Math.max(prospective1, prospective2) + ' - ' + Math.min(prospective1, prospective2) + ' جولات';

        showWinOverlay(
            winningTeam,
            '🏆 خط متصل · فاز بالجولة ' + _round,
            ['فوز بالجولة ' + _round, score, GAME_NAME],
            '<button type="button" id="lc-roundwinner-cta" class="lc-wbtn lc-wbtn-primary">' + (final ? 'عرض النتيجة النهائية' : 'الجولة التالية') + '</button>'
        );
        _screen = 'roundWinner';
        el('lc-roundwinner-cta').addEventListener('click', continueAfterRoundWin);
    }

    function renderResultScreen() {
        var winningTeam = (_roundWins1 >= ROUND_WINS_TO_CLINCH) ? TEAM1 : TEAM2;
        var score = Math.max(_roundWins1, _roundWins2) + ' - ' + Math.min(_roundWins1, _roundWins2) + ' جولات';

        showWinOverlay(
            winningTeam,
            '🏆 الفائز في لعبة "' + GAME_NAME + '"',
            ['فوز ' + teamName(winningTeam), score, GAME_NAME],
            '<button type="button" id="lc-result-exit" class="lc-wbtn">الخروج</button>' +
            '<button type="button" id="lc-result-restart" class="lc-wbtn lc-wbtn-primary">مباراة جديدة</button>' +
            '<button type="button" id="lc-result-replay" class="lc-wbtn lc-wbtn-soft">إعادة بنفس اللاعبين</button>'
        );
        _screen = 'result';
        el('lc-result-restart').addEventListener('click', restartGame);
        el('lc-result-replay').addEventListener('click', goToGame);
        el('lc-result-exit').addEventListener('click', confirmExitToLibrary);
    }

    // ================================================================
    // ربط أحداث المنصة + التسجيل
    // ================================================================
    function wirePlatformListeners() {
        AGP.events.on('stream:statusChanged', function (payload) {
            if (payload.platform !== 'tiktok') return;
            if (_screen === 'settings' || _screen === 'connecting') {
                // انقطاع مؤقت بعد أن دخلنا اللوبي/اللعب فعلاً لا يُفترض أن
                // يصفّر المباراة رجوعاً للإعدادات -- فقط قبل أول اتصال ناجح.
                if (payload.status === 'connecting') {
                    renderConnectingScreen('جارِ الاتصال بالبث...');
                } else if (payload.status === 'connected') {
                    renderLobbyScreen();
                } else if (payload.status === 'error') {
                    renderSettingsScreen();
                    showSettingsError(payload.message || 'تعذّر الاتصال -- تحقّق من اليوزرنيم وحاول مرة أخرى.');
                }
            }
        });

        AGP.events.on('player:joined', function () {
            if (_screen === 'lobby') { refreshLobbyPanels(); playJoinSound(); }
            else if (_screen === 'game' && _settingsOpen) { renderGameScreen(); playJoinSound(); }
        });
        AGP.events.on('player:removed', function () {
            if (_screen === 'lobby') refreshLobbyPanels();
            else if (_screen === 'game' && _settingsOpen) renderGameScreen();
        });
    }

    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'team-games',
            onLoad: function () { AGP.log('Letters Cell: onLoad.'); },
            onRoundEnd: function () { AGP.log('Letters Cell: onRoundEnd.'); },
            onDestroy: function () { AGP.log('Letters Cell: onDestroy.'); }
        });

        if (!registered) { AGP.log('Letters Cell: registration failed (already registered?).'); return; }

        AGP.gameManager.loadGame(GAME_ID);

        wirePlatformListeners();
        renderSettingsScreen();
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
