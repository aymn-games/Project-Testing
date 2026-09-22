/**
 * AGP LETTERS CELL -- "خلية الحروف" / "حروف مع أيمن" (لعبة أصلية داخل
 * المنصة، بنمط games/team-war من ناحية طريقة التحميل والربط الحقيقي
 * بمنصة البث فقط -- الهوية البصرية والشاشات مستقلة تماماً حسب تصميم
 * التسليم (design handoff)، لا اعتماد على js/agp-game-shell.js).
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
 * - المباراة "Best of 3": أول فريق يفوز بجولتين (خط متصل) يحسم المباراة
 *   فوراً بدون ما تُلعب الجولة الثالثة لو صارت غير ضرورية.
 * - لو امتلأت كل خلايا الرقعة بدون أي خط متصل لأي فريق: تُعاد نفس الجولة
 *   تلقائياً (تصفير الرقعة + سحب 25 حرفاً وأسئلة جديدة من جديد) بدون
 *   احتساب أي نقطة لأي فريق. المضيف يقدر يطلب نفس الإعادة يدوياً في أي
 *   وقت من زر الشارة السداسية العلوية ("إعادة توزيع").
 * - بهذا صار حسم الفوز بالمباراة حتمياً دائماً (2 من 3) فما عاد فيه حاجة
 *   لحالة "تعادل النقاط" أو شاشة "ملخص الجولة" اليدوية القديمة -- أُزيلتا
 *   بالكامل من هذا الإصدار.
 * - "الانضمام عبر الكلمة المفتاحية" يبقى مفعّلاً طول المباراة (لوبي + لعب
 *   حي)، ليس فقط أثناء اللوبي، لأن نافذة "دعوة لاعبين جدد" داخل اللعب
 *   تفترض ذلك صراحة.
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
    var DEFAULT_BG = '#E2C8A8';
    var TEAM1_DEFAULT_COLOR = '#5B0E1A';
    var TEAM2_DEFAULT_COLOR = '#513222';
    var TEAM1_SWATCHES = ['#5B0E1A', '#1d4ed8', '#0d7a4a'];
    var TEAM2_SWATCHES = ['#513222', '#b45309', '#7a1524'];
    var CLIP_PATH = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

    // بنك أسئلة placeholder (عدة أسئلة/إجابات لكل حرف) -- بانتظار ملف
    // الأسئلة الحقيقي (28 حرف). نفس الشكل بالضبط: خريطة حرف -> مصفوفة
    // { question, answer }.
    var QUESTION_BANK = ALPHABET_28.reduce(function (acc, letter) {
        acc[letter] = [1, 2, 3, 4].map(function (n) {
            return { question: 'سؤال ' + n + ' لحرف ' + letter, answer: 'اجابة حرف ' + letter };
        });
        return acc;
    }, {});

    // -------- هندسة رقعة الـ25 خلية (نمط "الطوب" المتعرّج الكلاسيكي، 5×5)
    // -- الصفوف الفردية بالترقيم من واحد (1، 3، 5 = الفهارس 0، 2، 4) متوازية
    // ببعضها بنفس حدود اليمين/اليسار (زي ROW_X_A بالتصميم الأصلي)، والصفوف
    // الزوجية (2، 4 = الفهارس 1، 3) تزحف عنها بمقدار نصف عرض خلية فتتداخل
    // بينها بدل ما تصطف بعمود واحد مستقيم.
    var VIEW_W = 1974, VIEW_H = 1128;
    var BOARD_CENTER_X = 726.31, BOARD_Y0 = 271.165, BOARD_Y1 = 857.835;
    var BOARD_ROWS = 5, BOARD_COLS = 5;

    function buildBrickGeometry(rows, cols) {
        var boardH = BOARD_Y1 - BOARD_Y0;
        var hexH = boardH / (0.75 * rows + 0.25);
        var hexW = hexH * (122.7 / 146.67); // نفس نسبة عرض/ارتفاع السداسي الأصلي
        var spacingX = hexW; // سداسيات متلامسة بنفس الصف
        var spacingY = hexH * 0.75;
        var halfStep = spacingX / 2; // إزاحة الصفوف الزوجية عن الفردية فقط (تبديل، مو تراكم)

        var rowSpan = (cols - 1) * spacingX;
        var totalWidth = rowSpan + halfStep + hexW;
        var alignedRowStartX = BOARD_CENTER_X - totalWidth / 2 + hexW / 2; // بداية الصفوف الفردية (1،3،5)

        var centers = [];
        var layout = [];
        var idx = 0;
        var leftEdge = [], rightEdge = [], topEdge = [], bottomEdge = [];
        for (var r = 0; r < rows; r++) {
            var cy = BOARD_Y0 + hexH / 2 + r * spacingY;
            var isOffsetRow = (r % 2 === 1); // الصفوف الزوجية بالترقيم من واحد (2، 4)
            var rowStartX = alignedRowStartX + (isOffsetRow ? halfStep : 0);
            for (var c = 0; c < cols; c++) {
                var cx = rowStartX + c * spacingX;
                centers.push({ x: cx, y: cy });
                layout.push({
                    leftPct: ((cx - hexW / 2) / VIEW_W) * 100,
                    topPct: ((cy - hexH / 2) / VIEW_H) * 100,
                    wPct: (hexW / VIEW_W) * 100,
                    hPct: (hexH / VIEW_H) * 100
                });
                // حدود اليمين/اليسار تقتصر على الصفوف المتوازية (غير المُزاحة)،
                // لأن الصفوف المُزاحة لا تصل فعلياً للحد الخارجي الحقيقي.
                if (!isOffsetRow && c === 0) leftEdge.push(idx);
                if (!isOffsetRow && c === cols - 1) rightEdge.push(idx);
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

        return { layout: layout, adjacency: adjacency, leftEdge: leftEdge, rightEdge: rightEdge, topEdge: topEdge, bottomEdge: bottomEdge };
    }

    var BOARD_GEOMETRY = buildBrickGeometry(BOARD_ROWS, BOARD_COLS);
    var CELL_LAYOUT = BOARD_GEOMETRY.layout;
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
    function isConnected(cellStates, team) {
        return pathExists(cellStates, team, LEFT_EDGE, RIGHT_EDGE) || pathExists(cellStates, team, TOP_EDGE, BOTTOM_EDGE);
    }

    function shuffleArray(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    // -------------------------- حالة عامة --------------------------
    var _screen = 'settings'; // settings | connecting | lobby | game | roundWinner | result
    var _root = null;
    var _registrationOpen = false;
    var _commentUnsub = null;

    var _settings = {
        tiktokUsername: '',
        hostName: 'أيمن',
        team1Name: 'الفريق الأول',
        team2Name: 'الفريق الثاني',
        team1Color: TEAM1_DEFAULT_COLOR,
        team2Color: TEAM2_DEFAULT_COLOR,
        team1AccessCode: '',
        team2AccessCode: ''
    };

    var _round = 1;
    var _roundWins1 = 0, _roundWins2 = 0; // عدد الجولات المكسوبة بكل فريق -- يحسم المباراة عند 2
    var _cellLetters = []; // الحرف المعروض بكل خلية لهذه الجولة (25 عنصر)
    var _cellStates = []; // 0 غير مملوكة | TEAM1 | TEAM2
    var _cellQuestions = []; // { text, answer, questionIndex } | null -- يُملأ فقط لما تُفتح الخلية فعلياً
    var _usedQuestions = {}; // letter -> { [questionIndex]: true } -- طول المباراة كاملة
    var _activeIdx = null; // فهرس الخلية المفتوحة حالياً (سؤال معروض بلا اعتماد بعد)
    var _connectionWinner = null;
    var _boardFullNoWinner = false;
    var _answerModal = null; // { question, teamName, teamColor, playerName }
    var _lastAnswererPlayer = null; // { id, name, team } -- له صلاحية اختيار الحرف التالي بالشات
    var _reshuffleNotice = null;
    var _settingsOpen = false;
    var _inviteOpen = false;
    var _showIntro = false;

    function el(id) { return document.getElementById(id); }
    function escapeAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function normalizeArabicText(text) {
        if (typeof text !== 'string') return '';
        return text
            .replace(/[ً-ْٰـ]/g, '')
            .replace(/[إأآا]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/\s+/g, ' ')
            .trim()
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

    // -------------------------- زخرفة الأحرف السداسية (خلفية) --------------------------
    function decorHexesHtml() {
        var size = 70, xStep = size * 0.87, yStep = size * 0.76, cols = 4, rows = 8, li = 0;
        var html = '';
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var left = c * xStep + (r % 2 === 1 ? xStep / 2 : 0) - size * 0.6;
                var top = r * yStep - size * 0.6;
                html += '<div class="lc-decor-hex lc-hex-clip" style="left:' + left + 'px; top:' + top + 'px; width:' + size + 'px; height:' + size + 'px;">' + escapeHtml(ALPHABET_28[li % ALPHABET_28.length]) + '</div>';
                li++;
            }
        }
        return html;
    }

    function logoLockupHtml(sizeClass) {
        return '<div class="lc-logo ' + sizeClass + '">' +
            '<span class="lc-logo-word1">حروف</span> <span class="lc-logo-word2">مع</span> <span class="lc-logo-name">' + escapeHtml(_settings.hostName) + '</span>' +
            '</div>';
    }
    function logo3dHtml(extraClass) {
        return '<div class="lc-logo3d' + (extraClass ? ' ' + extraClass : '') + '">' +
            '<div class="lc-logo3d-underline"></div>' +
            '<div class="lc-logo3d-line1">حروف</div>' +
            '<div class="lc-logo3d-line2">مع</div>' +
            '<div class="lc-logo3d-line3">' + escapeHtml(_settings.hostName) + '</div>' +
            '</div>';
    }

    // ================================================================
    // 1) شاشة الإعدادات
    // ================================================================
    function renderSettingsScreen() {
        _screen = 'settings';
        ensureBody();
        var root = ensureRoot();

        var team1Swatches = TEAM1_SWATCHES.map(function (c) {
            var active = (_settings.team1Color === c) ? ' lc-swatch-active' : '';
            return '<button type="button" class="lc-swatch-btn lc-team1-swatch' + active + '" data-color="' + escapeAttr(c) + '" style="background:' + c + ';"></button>';
        }).join('');
        var team2Swatches = TEAM2_SWATCHES.map(function (c) {
            var active = (_settings.team2Color === c) ? ' lc-swatch-active' : '';
            return '<button type="button" class="lc-swatch-btn lc-team2-swatch' + active + '" data-color="' + escapeAttr(c) + '" style="background:' + c + ';"></button>';
        }).join('');

        root.innerHTML =
            '<div class="lc-settings-screen">' +
                '<div class="lc-decor-wrap lc-decor-wide"><div class="lc-decor-inner">' + decorHexesHtml() + '</div></div>' +
                '<div class="lc-settings-inner">' +
                    '<div class="lc-connected-badge-wrap"><span class="lc-connected-badge">متصل بالبث <span class="lc-connected-dot"></span></span></div>' +

                    '<div class="lc-logo lc-logo-settings"><span class="lc-logo-word1">حروف</span> <span class="lc-logo-word2">مع</span> <span id="lc-logo-name-settings" class="lc-logo-name">' + escapeHtml(_settings.hostName) + '</span></div>' +

                    '<div class="lc-row-card">' +
                        '<div class="lc-row-card-label">اكتب اسمك</div>' +
                        '<input type="text" id="lc-input-hostname" class="lc-row-card-input" value="' + escapeAttr(_settings.hostName) + '" placeholder="اكتب اسمك">' +
                    '</div>' +

                    '<div class="lc-row-card">' +
                        '<div class="lc-row-card-label">يوزر بث التيك توك</div>' +
                        '<input type="text" id="lc-input-tiktok" class="lc-row-card-input" value="' + escapeAttr(_settings.tiktokUsername) + '" placeholder="tiktok_username">' +
                    '</div>' +

                    '<div class="lc-team-card">' +
                        '<div class="lc-team-card-head"><span class="lc-team-card-swatch" style="background:' + _settings.team1Color + ';"></span><span class="lc-team-card-title">إعدادات الفريق الأول</span></div>' +
                        '<div class="lc-field-col">' +
                            '<label class="lc-field-label">اسم الفريق</label>' +
                            '<div class="lc-field-row"><input type="text" id="lc-input-team1name" class="lc-field-input" value="' + escapeAttr(_settings.team1Name) + '">' + team1Swatches + '</div>' +
                        '</div>' +
                        '<div class="lc-field-col">' +
                            '<label class="lc-field-label">الكلمة المفتاحية للدخول عبر البث</label>' +
                            '<input type="text" id="lc-input-team1code" class="lc-field-input lc-field-input-block" value="' + escapeAttr(_settings.team1AccessCode) + '" placeholder="مثال: فوز">' +
                        '</div>' +
                    '</div>' +

                    '<div class="lc-team-card">' +
                        '<div class="lc-team-card-head"><span class="lc-team-card-swatch" style="background:' + _settings.team2Color + ';"></span><span class="lc-team-card-title">إعدادات الفريق الثاني</span></div>' +
                        '<div class="lc-field-col">' +
                            '<label class="lc-field-label">اسم الفريق</label>' +
                            '<div class="lc-field-row"><input type="text" id="lc-input-team2name" class="lc-field-input" value="' + escapeAttr(_settings.team2Name) + '">' + team2Swatches + '</div>' +
                        '</div>' +
                        '<div class="lc-field-col">' +
                            '<label class="lc-field-label">الكلمة المفتاحية للدخول عبر البث</label>' +
                            '<input type="text" id="lc-input-team2code" class="lc-field-input lc-field-input-block" value="' + escapeAttr(_settings.team2AccessCode) + '" placeholder="مثال: خسارة">' +
                        '</div>' +
                    '</div>' +

                    '<div id="lc-settings-error" class="lc-error-msg" style="display:none;"></div>' +

                    '<div class="lc-settings-btn-row">' +
                        '<button type="button" id="lc-back-library-btn" class="lc-btn-outline">→ العودة للمكتبة</button>' +
                        '<button type="button" id="lc-connect-btn" class="lc-btn-primary">الاتصال بالبث والدخول للوبي</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        wireSettingsHandlers();
    }

    function wireSettingsHandlers() {
        el('lc-input-hostname').addEventListener('input', function (e) {
            _settings.hostName = e.target.value;
            var logoName = el('lc-logo-name-settings');
            if (logoName) logoName.textContent = _settings.hostName;
        });
        el('lc-input-tiktok').addEventListener('input', function (e) { _settings.tiktokUsername = e.target.value; });
        el('lc-input-team1name').addEventListener('input', function (e) { _settings.team1Name = e.target.value; });
        el('lc-input-team2name').addEventListener('input', function (e) { _settings.team2Name = e.target.value; });
        el('lc-input-team1code').addEventListener('input', function (e) { _settings.team1AccessCode = e.target.value; });
        el('lc-input-team2code').addEventListener('input', function (e) { _settings.team2AccessCode = e.target.value; });

        document.querySelectorAll('.lc-team1-swatch').forEach(function (btn) {
            btn.addEventListener('click', function () { _settings.team1Color = btn.getAttribute('data-color'); renderSettingsScreen(); });
        });
        document.querySelectorAll('.lc-team2-swatch').forEach(function (btn) {
            btn.addEventListener('click', function () { _settings.team2Color = btn.getAttribute('data-color'); renderSettingsScreen(); });
        });

        el('lc-back-library-btn').addEventListener('click', function () { window.location.href = '../../games.html'; });
        el('lc-connect-btn').addEventListener('click', handleConnectClick);
    }

    function showSettingsError(msg) {
        var errEl = el('lc-settings-error');
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.style.display = 'block';
    }

    function handleConnectClick() {
        var username = (_settings.tiktokUsername || '').trim();
        var kw1 = normalizeArabicText(_settings.team1AccessCode);
        var kw2 = normalizeArabicText(_settings.team2AccessCode);

        if (!username) return showSettingsError('لازم تكتب يوزر بث التيك توك أول.');
        if (!kw1 || !kw2) return showSettingsError('لازم تحدد كلمة مفتاحية لكل فريق.');
        if (kw1 === kw2) return showSettingsError('الكلمتان المفتاحيتان لازم تكونان مختلفتين عن بعض.');

        AGP.streamConnector.connect('tiktok', { username: username });
    }

    function renderConnectingScreen(message) {
        _screen = 'connecting';
        ensureBody();
        var root = ensureRoot();
        root.innerHTML =
            '<div class="lc-settings-screen">' +
                '<div class="lc-settings-inner" style="align-items:center; text-align:center;">' +
                    logoLockupHtml('lc-logo-settings') +
                    '<div class="lc-connecting-box">' +
                        '<div class="lc-spinner"></div>' +
                        '<div>' + escapeHtml(message || 'جارِ الاتصال بالبث...') + '</div>' +
                    '</div>' +
                '</div>' +
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

        var root = ensureRoot();
        root.innerHTML =
            '<div class="lc-lobby-screen">' +
                '<div class="lc-decor-wrap lc-decor-narrow"><div class="lc-decor-inner lc-decor-inner-narrow">' + decorHexesHtml() + '</div></div>' +
                '<div class="lc-logo lc-logo-lobby">دخول لعبة <span class="lc-logo-word1">حروف</span> <span class="lc-logo-word2">مع</span> <span class="lc-logo-name">' + escapeHtml(_settings.hostName) + '</span></div>' +
                '<div class="lc-lobby-panels">' +
                    teamPanelHtml(TEAM1) +
                    teamPanelHtml(TEAM2) +
                '</div>' +
                '<div class="lc-lobby-btn-row">' +
                    '<button type="button" id="lc-lobby-back-settings-btn" class="lc-btn-outline">→ العودة للإعدادات</button>' +
                    '<button type="button" id="lc-start-game-btn" class="lc-btn-primary">بدء اللعبة</button>' +
                '</div>' +
            '</div>';

        el('lc-start-game-btn').addEventListener('click', handleStartGame);
        el('lc-lobby-back-settings-btn').addEventListener('click', function () {
            var ok = window.confirm('بترجع لشاشة الإعدادات وينقطع الاتصال الحالي بالبث. تبي تكمل؟');
            if (ok) window.location.reload();
        });

        refreshLobbyStartButton();
    }

    function teamPanelHtml(team) {
        var name = (team === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var color = (team === TEAM1) ? _settings.team1Color : _settings.team2Color;
        var code = (team === TEAM1) ? _settings.team1AccessCode : _settings.team2AccessCode;
        var players = getTeamPlayers(team);
        return '<div class="lc-team-panel" data-team="' + team + '">' +
            '<div class="lc-team-panel-header" style="background:color-mix(in srgb, ' + color + ' 70%, white 30%);">' +
                '<div class="lc-team-panel-name">' + escapeHtml(name) + '</div>' +
                '<div class="lc-team-panel-badges">' +
                    '<span class="lc-badge-pill lc-badge-count"><span id="lc-team-count-' + team + '">' + players.length + '</span> <span>عدد اللاعبين</span></span>' +
                    '<span class="lc-badge-pill lc-badge-code">' + escapeHtml(code) + ' <span>كلمة الدخول</span></span>' +
                '</div>' +
            '</div>' +
            '<div class="lc-team-panel-body" id="lc-team-body-' + team + '">' + teamPlayerChipsHtml(team, players) + '</div>' +
        '</div>';
    }

    function teamPlayerChipsHtml(team, players) {
        if (!players.length) return '<div class="lc-team-empty">بانتظار انضمام اللاعبين</div>';
        return players.map(function (p) {
            var avatar = p.avatarUrl
                ? '<img class="lc-player-chip-avatar" src="' + escapeAttr(p.avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<span class=&quot;lc-player-chip-avatar&quot;></span>\';">'
                : '<span class="lc-player-chip-avatar"></span>';
            return '<div class="lc-player-chip">' + avatar +
                '<span class="lc-player-chip-name">' + escapeHtml(playerLabel(p)) + '</span>' +
                '<button type="button" class="lc-player-chip-remove" data-id="' + escapeAttr(p.id) + '" title="حذف اللاعب">×</button>' +
            '</div>';
        }).join('');
    }

    function refreshLobbyPanels() {
        [TEAM1, TEAM2].forEach(function (team) {
            var body = el('lc-team-body-' + team);
            if (!body) return;
            var players = getTeamPlayers(team);
            body.innerHTML = teamPlayerChipsHtml(team, players);
            body.querySelectorAll('.lc-player-chip-remove').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    AGP.player.removePlayer(btn.getAttribute('data-id'));
                });
            });
            var countEl = el('lc-team-count-' + team);
            if (countEl) countEl.textContent = players.length;
        });
        refreshLobbyStartButton();
    }
    function refreshLobbyStartButton() {
        var btn = el('lc-start-game-btn');
        if (!btn) return;
        btn.disabled = !(getTeamPlayers(TEAM1).length && getTeamPlayers(TEAM2).length);
    }

    function handleStartGame() {
        if (!getTeamPlayers(TEAM1).length || !getTeamPlayers(TEAM2).length) return;
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

    function handleIncomingComment(payload) {
        if (!payload || typeof payload.text !== 'string' || !payload.id) return;
        var norm = normalizeArabicText(payload.text);

        if (_registrationOpen && tryHandleJoin(payload, norm)) return;
        if (_screen !== 'game') return;
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

        AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null, team: team });
        return true;
    }

    function tryHandleAutoAnswer(payload, norm) {
        var question = _cellQuestions[_activeIdx];
        if (!question || !question.answer) return;
        var answerNorm = normalizeArabicText(question.answer);
        if (!answerNorm || norm !== answerNorm) return;

        var player = findPlayerById(payload.id);
        if (!player) return; // مو منضم لأي فريق -- ما فيه فريق نلوّن الخلية بلونه

        resolveCredit(player.team, player);
    }

    function tryHandleLetterPick(payload, norm) {
        if (!_lastAnswererPlayer || payload.id !== _lastAnswererPlayer.id) return;
        for (var idx = 0; idx < BOARD_SIZE; idx++) {
            if (_cellStates[idx] !== 0) continue;
            if (normalizeArabicText(_cellLetters[idx]) === norm) { selectCell(idx); return; }
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
        return { text: bank[pickIdx].question, answer: bank[pickIdx].answer, questionIndex: pickIdx };
    }

    function goToGame() {
        _round = 1;
        _roundWins1 = 0; _roundWins2 = 0;
        _usedQuestions = {};
        drawBoardLetters();
        _activeIdx = null;
        _connectionWinner = null;
        _boardFullNoWinner = false;
        _answerModal = null;
        _lastAnswererPlayer = null;
        _reshuffleNotice = null;
        _settingsOpen = false;
        _inviteOpen = false;

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

    function selectCell(idx) {
        if (_cellStates[idx] !== 0) return;
        if (_activeIdx === idx) return;
        playSelectSound();
        setTimeout(playQuestionSound, 120);
        if (!_cellQuestions[idx]) _cellQuestions[idx] = pickQuestionForLetter(_cellLetters[idx]);
        _activeIdx = idx;
        renderGameScreen();
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

        _cellStates = cellStates;
        _activeIdx = null;
        _connectionWinner = won ? team : null;
        _boardFullNoWinner = !won && full;
        _lastAnswererPlayer = answererPlayer ? { id: answererPlayer.id, name: playerLabel(answererPlayer), team: team } : null;
        _answerModal = { question: question ? question.text : '', teamName: teamName, teamColor: teamColor, playerName: playerName };
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
        playReshuffleSound();
        drawBoardLetters();
        _activeIdx = null;
        _lastAnswererPlayer = null;
        _reshuffleNotice = (reason === 'manual')
            ? 'أعاد المضيف توزيع الرقعة -- أحرف وأسئلة جديدة'
            : 'الرقعة امتلأت بدون خط متصل -- تُعاد الجولة بأحرف وأسئلة جديدة';
        renderGameScreen();
        setTimeout(function () { _reshuffleNotice = null; if (_screen === 'game') renderGameScreen(); }, 1800);
    }

    function handleRoundBadgeClick() {
        if (_activeIdx != null) return;
        var ok = window.confirm('بيُعاد توزيع الرقعة بأحرف وأسئلة جديدة بدون احتساب نقاط. تبي تكمل؟');
        if (!ok) return;
        reshuffleRound('manual');
    }

    function continueAfterRoundWin() {
        var winner = _connectionWinner;
        if (winner === TEAM1) _roundWins1++; else if (winner === TEAM2) _roundWins2++;
        syncScoreManagerTotals();
        _connectionWinner = null;

        if (_roundWins1 >= ROUND_WINS_TO_CLINCH || _roundWins2 >= ROUND_WINS_TO_CLINCH) {
            _screen = 'result';
            renderResultScreen();
            return;
        }

        _round++;
        drawBoardLetters();
        _activeIdx = null;
        _answerModal = null;
        _lastAnswererPlayer = null;
        _screen = 'game';
        renderGameScreen();
        playIntro();
    }

    function openSettingsDrawer() { _settingsOpen = true; renderGameScreen(); }
    function closeSettingsDrawer() { _settingsOpen = false; renderGameScreen(); }
    function openInviteModal() { _inviteOpen = true; renderGameScreen(); }
    function closeInviteModal() { _inviteOpen = false; renderGameScreen(); }

    function endMatch() {
        var ok = window.confirm('بينتهي البث الحالي وتُصفَّر كل بيانات المباراة. تبي تكمل؟');
        if (!ok) return;
        AGP.streamConnector.disconnect('tiktok');
        AGP.gameManager.resetSession();
        _registrationOpen = false;
        if (_commentUnsub) { _commentUnsub(); _commentUnsub = null; }

        _round = 1; _roundWins1 = 0; _roundWins2 = 0; _usedQuestions = {};
        _cellLetters = []; _cellStates = []; _cellQuestions = [];
        _activeIdx = null; _connectionWinner = null; _boardFullNoWinner = false;
        _answerModal = null; _lastAnswererPlayer = null; _settingsOpen = false; _inviteOpen = false;

        renderSettingsScreen();
    }

    function restartGame() {
        // البقاء متصلاً بنفس البث (لا مبرر لإعادة كتابة يوزر البث من الصفر)
        // وتصفير اللاعبين + رقعة اللعب، ثم الرجوع مباشرة للوبي لبدء مباراة جديدة.
        AGP.player.getAllPlayers().slice().forEach(function (p) { AGP.player.removePlayer(p.id); });
        _round = 1; _roundWins1 = 0; _roundWins2 = 0; _usedQuestions = {};
        _cellLetters = []; _cellStates = []; _cellQuestions = [];
        _activeIdx = null; _connectionWinner = null; _boardFullNoWinner = false;
        _answerModal = null; _lastAnswererPlayer = null; _settingsOpen = false; _inviteOpen = false;
        AGP.scoreManager.reset();
        renderLobbyScreen();
    }

    function renderGameScreen() {
        ensureBody();
        var root = ensureRoot();

        var score1 = _cellStates.filter(function (x) { return x === TEAM1; }).length;
        var score2 = _cellStates.filter(function (x) { return x === TEAM2; }).length;

        var cellsHtml = _cellLetters.map(function (letter, idx) {
            var st = _cellStates[idx];
            var layout = CELL_LAYOUT[idx];
            var bg = (st === TEAM1) ? _settings.team1Color : (st === TEAM2) ? _settings.team2Color : DEFAULT_BG;
            var color = (st === 0) ? '#1b0d0d' : '#fef4f4';
            var borderColor = (st === 0) ? '#ffffff' : bg;
            var isActive = _activeIdx === idx;
            var clickable = (st === 0);
            return '<div class="lc-hex-cell-wrap lc-hex-clip' + (clickable ? ' lc-hex-clickable' : '') + (isActive ? ' lc-hex-active' : '') + '" ' +
                'data-idx="' + idx + '" ' +
                'style="left:' + layout.leftPct + '%; top:' + layout.topPct + '%; width:' + layout.wPct + '%; height:' + layout.hPct + '%; background:' + borderColor + ';">' +
                '<div class="lc-hex-cell-inner lc-hex-clip" style="background:' + bg + '; color:' + color + ';">' + escapeHtml(letter) + '</div>' +
            '</div>';
        }).join('');

        var activeLetter = (_activeIdx != null) ? _cellLetters[_activeIdx] : null;

        var badgeHexHtml;
        if (activeLetter) {
            badgeHexHtml = '<div class="lc-badge-hex-inner"><div class="lc-badge-hex-letter">' + escapeHtml(activeLetter) + '</div><div class="lc-badge-hex-caption">الحرف</div></div>';
        } else {
            badgeHexHtml = '<div class="lc-badge-hex-inner"><button type="button" id="lc-round-badge-btn" class="lc-badge-hex-btn"><div class="lc-badge-hex-round">' + _round + '</div><div class="lc-badge-hex-caption">إعادة توزيع</div></button></div>';
        }

        var questionInnerHtml;
        if (activeLetter) {
            questionInnerHtml = escapeHtml(_cellQuestions[_activeIdx] ? _cellQuestions[_activeIdx].text : '');
        } else if (_lastAnswererPlayer) {
            questionInnerHtml = '<span class="lc-question-placeholder">دور ' + escapeHtml(_lastAnswererPlayer.name) + ' -- يقدر يختار حرف بالشات، أو اضغط على أي خلية</span>';
        } else {
            questionInnerHtml = '<span class="lc-question-placeholder">اضغط على أي خلية لعرض سؤالها</span>';
        }

        var creditRowHtml = activeLetter
            ? '<div class="lc-credit-row">' +
                '<button type="button" id="lc-credit-team1" class="lc-credit-btn" style="background:' + _settings.team1Color + ';">' + escapeHtml(_settings.team1Name) + '</button>' +
                '<button type="button" id="lc-credit-team2" class="lc-credit-btn" style="background:' + _settings.team2Color + ';">' + escapeHtml(_settings.team2Name) + '</button>' +
              '</div>'
            : '';

        var introHtml = _showIntro
            ? '<div class="lc-intro-dim"></div><div class="lc-intro-logo">' + logo3dHtml() + '</div>'
            : '';

        var reshuffleToastHtml = _reshuffleNotice
            ? '<div class="lc-reshuffle-toast"><div class="lc-reshuffle-toast-box">' + escapeHtml(_reshuffleNotice) + '</div></div>'
            : '';

        var answerModalHtml = '';
        if (_answerModal) {
            answerModalHtml =
                '<div class="lc-answer-modal-overlay">' +
                    '<div class="lc-answer-modal" style="border-color:' + _answerModal.teamColor + ';">' +
                        '<div class="lc-answer-modal-label">الإجابة الصحيحة</div>' +
                        '<div class="lc-answer-modal-question">' + escapeHtml(_answerModal.question) + '</div>' +
                        '<div class="lc-answer-modal-divider"></div>' +
                        '<div class="lc-answer-modal-player">' + escapeHtml(_answerModal.playerName) + '</div>' +
                        '<div class="lc-answer-modal-team" style="color:' + _answerModal.teamColor + ';">' + escapeHtml(_answerModal.teamName) + '</div>' +
                        '<button type="button" id="lc-answer-modal-done" class="lc-answer-modal-done" style="background:' + _answerModal.teamColor + ';">إكمال</button>' +
                    '</div>' +
                '</div>';
        }

        var drawerHtml = '';
        if (_settingsOpen) {
            drawerHtml =
                '<div class="lc-ingame-drawer">' +
                    '<div class="lc-drawer-head"><div class="lc-drawer-title">الإعدادات</div><button type="button" id="lc-drawer-close" class="lc-drawer-close">×</button></div>' +
                    '<button type="button" id="lc-drawer-end-match" class="lc-drawer-btn lc-drawer-btn-end">إنهاء المباراة</button>' +
                    '<div class="lc-drawer-section">' +
                        '<div class="lc-drawer-section-title">اللاعبون المشاركون</div>' +
                        drawerRosterHtml(TEAM1) +
                        drawerRosterHtml(TEAM2) +
                    '</div>' +
                    '<button type="button" id="lc-drawer-invite" class="lc-drawer-btn lc-drawer-btn-invite">طريقة انضمام لاعبين جدد</button>' +
                    '<button type="button" id="lc-drawer-reset" class="lc-drawer-btn-reset">إعادة توزيع الجولة</button>' +
                '</div>';
        }

        var inviteHtml = '';
        if (_inviteOpen) {
            inviteHtml =
                '<div class="lc-invite-modal-overlay">' +
                    '<div class="lc-invite-modal">' +
                        '<div class="lc-invite-head"><div class="lc-invite-title">دخول لاعبين جدد لم يسبق لهم الدخول</div><button type="button" id="lc-invite-close-x" class="lc-invite-close">×</button></div>' +
                        '<div class="lc-invite-team-block" style="background:' + hexToRgba(_settings.team1Color, 0.35) + ';">' +
                            '<div class="lc-invite-team-name">للدخول للفريق &quot;' + escapeHtml(_settings.team1Name) + '&quot;</div>' +
                            '<div class="lc-invite-team-code">كلمة الدخول: ' + escapeHtml(_settings.team1AccessCode) + '</div>' +
                        '</div>' +
                        '<div class="lc-invite-team-block" style="background:' + hexToRgba(_settings.team2Color, 0.4) + ';">' +
                            '<div class="lc-invite-team-name">للدخول للفريق &quot;' + escapeHtml(_settings.team2Name) + '&quot;</div>' +
                            '<div class="lc-invite-team-code">كلمة الدخول: ' + escapeHtml(_settings.team2AccessCode) + '</div>' +
                        '</div>' +
                        '<div class="lc-invite-hint">يرسل اللاعبون كلمة الدخول الخاصة بفريقهم عبر شات البث للانضمام</div>' +
                        '<button type="button" id="lc-invite-done" class="lc-invite-done">تم</button>' +
                    '</div>' +
                '</div>';
        }

        root.innerHTML =
            '<div class="lc-game-screen">' +
                introHtml +
                gameBackgroundSvg() +
                cellsHtml +

                '<div class="lc-badge-hex">' + badgeHexHtml + '</div>' +

                '<button type="button" id="lc-open-settings-btn" class="lc-side-panel-btn-settings">الإعدادات</button>' +

                '<div class="lc-side-logo">' + logo3dHtml() + '</div>' +

                '<div class="lc-cell-question-label"><span>سؤال الخلية</span></div>' +
                '<div class="lc-question-box"><div class="lc-question-text">' + questionInnerHtml + '</div></div>' +

                answerModalHtml +
                creditRowHtml +
                reshuffleToastHtml +

                '<div class="lc-team-row lc-team-row-1"><span class="lc-team-row-badge">1</span><span class="lc-team-row-name">' + escapeHtml(_settings.team1Name) + '</span><span class="lc-team-row-score">' + score1 + '</span></div>' +
                '<div class="lc-team-row lc-team-row-2"><span class="lc-team-row-badge">2</span><span class="lc-team-row-name">' + escapeHtml(_settings.team2Name) + '</span><span class="lc-team-row-score">' + score2 + '</span></div>' +

                '<div class="lc-footer-logo">' +
                    '<div class="lc-footer-mark"><span class="lc-footer-mark-dot lc-footer-mark-dot-1"></span><span class="lc-footer-mark-dot lc-footer-mark-dot-2"></span><span class="lc-footer-mark-dot lc-footer-mark-dot-3"></span></div>' +
                    '<div class="lc-footer-text"><div class="lc-footer-title">ألعاب أيمن</div><div class="lc-footer-tagline">ألعاب تفاعلية لصناع المحتوى والجمهور</div></div>' +
                '</div>' +

                drawerHtml +
                inviteHtml +
            '</div>';

        wireGameScreenHandlers();
    }

    function drawerRosterHtml(team) {
        var name = (team === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var players = getTeamPlayers(team);
        var body = players.length
            ? players.map(function (p) { return '<div class="lc-drawer-roster-player">' + escapeHtml(playerLabel(p)) + '</div>'; }).join('')
            : '<div class="lc-drawer-roster-empty">بانتظار انضمام اللاعبين عبر الشات</div>';
        return '<div class="lc-drawer-roster"><div class="lc-drawer-roster-team">' + escapeHtml(name) + '</div>' + body + '</div>';
    }

    function hexToRgba(hex, a) {
        var h = String(hex || '').replace('#', '');
        var r = parseInt(h.substring(0, 2), 16) || 0, g = parseInt(h.substring(2, 4), 16) || 0, b = parseInt(h.substring(4, 6), 16) || 0;
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function gameBackgroundSvg() {
        return '<svg class="lc-game-bg-svg" viewBox="0 0 1974 1128" preserveAspectRatio="none">' +
            '<path d="M555.812 592.5L1522.81 26L1522.81 1125L999.312 875L555.812 592.5Z" fill="#5B0E1A"></path>' +
            '<path d="M24.7859 19.9999L987.76 567.92L17.8116 1127.92L24.7859 19.9999Z" fill="#5B0E1A"></path>' +
            '<path d="M694.928 626.751L1554 1107.31L35.1206 1115.5L694.928 626.751Z" fill="#513222"></path>' +
            '<path d="M723.856 496.244L1535.29 11.5H0L723.856 496.244Z" fill="#513222"></path>' +
            '<rect x="1522.81" y="12" width="451" height="1094" fill="#E2C8A8"></rect>' +
            '<rect x="22.3115" y="7.5" width="1493" height="1101" rx="7.5" fill="none" stroke="#E2C8A8" stroke-width="15"></rect>' +
            '<rect x="1544.31" y="470.5" width="399" height="373" rx="10.5" fill="#1B0D0D" fill-opacity="0.85" stroke="#513222" stroke-width="9"></rect>' +
            '<path d="M1806.17 392.951V464.048L1746.81 499.506L1687.46 464.048V392.951L1746.81 357.493L1806.17 392.951Z" fill="#E2C8A8" fill-opacity="0.7" stroke="#FEF4F4" stroke-width="6"></path>' +
            '<rect x="1567.81" y="885" width="351" height="63" rx="15" fill="#5B0E1A"></rect>' +
            '<rect x="1567.81" y="970" width="351" height="63" rx="15" fill="#513222"></rect>' +
        '</svg>';
    }

    function wireGameScreenHandlers() {
        var board = document.querySelector('.lc-game-screen');
        board.addEventListener('click', function (e) {
            var cell = e.target.closest('.lc-hex-cell-wrap.lc-hex-clickable');
            if (cell) selectCell(parseInt(cell.getAttribute('data-idx'), 10));
        });

        var roundBadgeBtn = el('lc-round-badge-btn');
        if (roundBadgeBtn) roundBadgeBtn.addEventListener('click', handleRoundBadgeClick);

        el('lc-open-settings-btn').addEventListener('click', openSettingsDrawer);

        if (_activeIdx != null) {
            el('lc-credit-team1').addEventListener('click', function () { creditTeamManual(TEAM1); });
            el('lc-credit-team2').addEventListener('click', function () { creditTeamManual(TEAM2); });
        }

        if (_answerModal) {
            el('lc-answer-modal-done').addEventListener('click', closeAnswerModal);
        }

        if (_settingsOpen) {
            el('lc-drawer-close').addEventListener('click', closeSettingsDrawer);
            el('lc-drawer-end-match').addEventListener('click', endMatch);
            el('lc-drawer-invite').addEventListener('click', openInviteModal);
            el('lc-drawer-reset').addEventListener('click', handleRoundBadgeClick);
        }

        if (_inviteOpen) {
            el('lc-invite-close-x').addEventListener('click', closeInviteModal);
            el('lc-invite-done').addEventListener('click', closeInviteModal);
        }
    }

    // ================================================================
    // 4) شاشة الفوز بالجولة (خط متصل)
    // ================================================================
    function renderRoundWinnerScreen() {
        _screen = 'roundWinner';
        ensureBody();
        var root = ensureRoot();

        var winningTeam = _connectionWinner;
        var name = (winningTeam === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var color = (winningTeam === TEAM1) ? _settings.team1Color : _settings.team2Color;
        var players = getTeamPlayers(winningTeam);

        var prospective1 = _roundWins1 + (winningTeam === TEAM1 ? 1 : 0);
        var prospective2 = _roundWins2 + (winningTeam === TEAM2 ? 1 : 0);
        var ctaLabel = (prospective1 >= ROUND_WINS_TO_CLINCH || prospective2 >= ROUND_WINS_TO_CLINCH) ? 'عرض النتيجة النهائية' : 'انتقل للجولة التالية';

        var avatarsHtml = players.map(function (p) {
            var hasAvatar = !!(p && p.avatarUrl);
            var circleStyle = hasAvatar
                ? 'background-image:url(' + escapeAttr(p.avatarUrl) + ');background-size:cover;background-position:center;'
                : 'background:' + color + ';';
            return '<div class="lc-avatar-item lc-avatar-item-lg">' +
                '<div class="lc-avatar-circle lc-avatar-lg" style="' + circleStyle + '">' + (hasAvatar ? '' : escapeHtml(playerInitial(p))) + '</div>' +
                '<div class="lc-avatar-name">' + escapeHtml(playerLabel(p)) + '</div>' +
            '</div>';
        }).join('');

        root.innerHTML =
            '<div class="lc-roundwinner-screen">' +
                '<div class="lc-roundwinner-pulse-wrap"><div class="lc-roundwinner-pulse" style="background:' + color + ';"></div></div>' +
                '<div class="lc-roundwinner-head lc-hxpop">' +
                    '<div class="lc-roundwinner-caption">خط متصل! 🎉</div>' +
                    '<div class="lc-roundwinner-name" style="color:' + color + ';">' + escapeHtml(name) + '</div>' +
                    '<div class="lc-roundwinner-sub">يفوز بالجولة ' + _round + '</div>' +
                '</div>' +
                '<div class="lc-avatar-row lc-hxpop-delay">' + avatarsHtml + '</div>' +
                '<button type="button" id="lc-roundwinner-cta" class="lc-roundwinner-cta" style="background:' + color + ';">' + ctaLabel + '</button>' +
            '</div>';

        el('lc-roundwinner-cta').addEventListener('click', continueAfterRoundWin);
    }

    // ================================================================
    // 5) شاشة النتيجة النهائية
    // ================================================================
    function renderResultScreen() {
        _screen = 'result';
        ensureBody();
        var root = ensureRoot();

        var winningTeam = (_roundWins1 >= ROUND_WINS_TO_CLINCH) ? TEAM1 : TEAM2;
        var winningName = (winningTeam === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var winningColor = (winningTeam === TEAM1) ? _settings.team1Color : _settings.team2Color;
        var winningPlayers = getTeamPlayers(winningTeam);

        var winnersHtml = winningPlayers.map(function (p) {
            var hasAvatar = !!(p && p.avatarUrl);
            var circleStyle = hasAvatar
                ? 'background-image:url(' + escapeAttr(p.avatarUrl) + ');background-size:cover;background-position:center;'
                : 'background:' + winningColor + ';';
            return '<div class="lc-avatar-item lc-avatar-item-sm">' +
                '<div class="lc-avatar-circle lc-avatar-sm" style="' + circleStyle + '">' + (hasAvatar ? '' : escapeHtml(playerInitial(p))) + '</div>' +
                '<div class="lc-avatar-name">' + escapeHtml(playerLabel(p)) + '</div>' +
            '</div>';
        }).join('');

        root.innerHTML =
            '<div class="lc-result-screen">' +
                '<div class="lc-decor-wrap lc-decor-narrow"><div class="lc-decor-inner lc-decor-inner-result">' + decorHexesHtml() + '</div></div>' +
                logo3dHtml('lc-logo-small') +
                '<div class="lc-round-end-caption">انتهت المباراة</div>' +
                '<div class="lc-result-headline" style="color:' + winningColor + ';">' + escapeHtml(winningName) + ' فاز! 🏆</div>' +
                '<div class="lc-score-compare">' +
                    '<div class="lc-score-compare-item"><div class="lc-score-compare-val lc-result-score-val" style="color:' + _settings.team1Color + ';">' + _roundWins1 + '</div><div class="lc-score-compare-name">' + escapeHtml(_settings.team1Name) + '</div></div>' +
                    '<div class="lc-score-compare-divider"></div>' +
                    '<div class="lc-score-compare-item"><div class="lc-score-compare-val lc-result-score-val" style="color:' + _settings.team2Color + ';">' + _roundWins2 + '</div><div class="lc-score-compare-name">' + escapeHtml(_settings.team2Name) + '</div></div>' +
                '</div>' +
                '<div class="lc-result-winners-card" style="border-color:' + winningColor + ';">' +
                    '<div class="lc-result-winners-title">اللاعبون الفائزون</div>' +
                    '<div class="lc-result-winners-row">' + winnersHtml + '</div>' +
                '</div>' +
                '<button type="button" id="lc-result-restart" class="lc-result-cta" style="background:linear-gradient(90deg,' + _settings.team1Color + ',' + _settings.team2Color + ');">لعبة جديدة</button>' +
            '</div>';

        el('lc-result-restart').addEventListener('click', restartGame);
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
                    showSettingsError('تعذّر الاتصال -- تحقّق من اليوزرنيم وحاول مرة أخرى.');
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
