/**
 * AGP LETTERS CELL -- "خلية الحروف" / "حروف مع أيمن" (لعبة أصلية داخل
 * المنصة، بنمط games/team-war من ناحية طريقة التحميل والربط الحقيقي
 * بمنصة البث فقط -- الهوية البصرية والشاشات مستقلة تماماً حسب تصميم
 * التسليم (design handoff)، لا اعتماد على js/agp-game-shell.js).
 *
 * ملاحظات تنفيذ مهمة (قرارات اتُّخذت أثناء البناء، موثّقة هنا بدل تركها
 * ضمنية):
 * - بنك الأسئلة (QUESTION_BANK) عبارة عن نص placeholder لكل حرف، بانتظار
 *   ملف الأسئلة/الأحرف الحقيقي الذي سيُرفع لاحقاً -- استبدله بالمحتوى
 *   الحقيقي متى وصل، بنفس الشكل (خريطة حرف -> نص السؤال).
 * - نص السؤال أثناء اللعب للقراءة فقط (مو textarea قابل للتعديل مباشرة
 *   فوق اللعب المباشر) واسم الفريق في شريط الفريق أثناء اللعب للقراءة
 *   فقط أيضاً (مصدره إعدادات الفريق) -- بناءً على توصية ملف التسليم نفسه.
 * - الانضمام عبر الكلمة المفتاحية يبقى مفعّلاً طول المباراة (لوبي + لعب
 *   حي) وليس فقط أثناء اللوبي، لأن نافذة "دعوة لاعبين جدد" داخل اللعب
 *   تفترض ذلك صراحة (شاشة اللعب لا تملك نظام أدوار يتأثر بانضمام لاعب
 *   جديد أثناء الجولة).
 * - عند "لعبة جديدة" من شاشة النتيجة النهائية: يبقى الاتصال بالبث كما هو
 *   ويُعاد ضبط اللاعبين/اللوحة والعودة مباشرة للوبي (مو لإعادة كتابة
 *   يوزر البث من الصفر) -- الاتصال الحقيقي بالبث مفهوم غير موجود أصلاً في
 *   نموذج التصميم التجريبي (Prototype state فقط)، فهذا تكييف واقعي له.
 * - زر "إنهاء المباراة" في درج الإعدادات ينهي الجلسة فعلياً (قطع الاتصال
 *   بالبث + تصفير اللاعبين عبر AGP.gameManager.resetSession() + العودة
 *   لشاشة الإعدادات)، بخلاف "إعادة ضبط اللعبة" اللي يصفّر رقعة اللعب فقط
 *   ويبقي اللاعبين والنقاط -- في تصميم المرجع الأصلي كان "إنهاء المباراة"
 *   مجرد إغلاق للدرج بلا أي أثر فعلي (فجوة واضحة بنموذج التصميم التجريبي).
 * - عند الفوز بخط متصل: نقطة واحدة تُضاف لإجمالي الفريق الفائز لكل جولة.
 *   عند إنهاء الجولة يدوياً (تعادل/بدون خط متصل) يُضاف عدد الخلايا
 *   المملوكة فعلياً لكل فريق لإجماليه -- هذا (وحدتا قياس مختلفتان تصبّان
 *   بنفس الإجمالي) موروث حرفياً من منطق ملف التصميم المرجعي نفسه ولم
 *   يُصحَّح هنا، لأنه أحد الحالات الحدّية التي ينبّه عليها ملف التسليم
 *   صراحة (README) على أنها تحتاج قراراً من المنتج قبل تغييرها.
 * - "اسم اللاعب المجيب" في نافذة تأكيد الإجابة يبقى دائماً أول لاعب في
 *   قائمة الفريق (بدل استخراج مين فعلياً أجاب من الشات) -- محدودية موثّقة
 *   وموروثة من ملف التسليم نفسه (يحتاج ربط تحليل شات حقيقي لاحقاً).
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

    var LETTERS = ['ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل'];
    var DEFAULT_BG = '#E2C8A8';
    var TEAM1_DEFAULT_COLOR = '#5B0E1A';
    var TEAM2_DEFAULT_COLOR = '#513222';
    var TEAM1_SWATCHES = ['#5B0E1A', '#1d4ed8', '#0d7a4a'];
    var TEAM2_SWATCHES = ['#513222', '#b45309', '#7a1524'];
    var CLIP_PATH = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

    // بنك أسئلة placeholder -- بانتظار ملف الأسئلة/الأحرف الحقيقي.
    var QUESTION_BANK = LETTERS.reduce(function (acc, l) { acc[l] = 'سؤال حرف ' + l; return acc; }, {});

    // -------- هندسة رقعة الخلايا السداسية (23 خلية) + خوارزمية الاتصال --------
    var ROW_Y = [344.5, 454.5, 566, 673.5, 784.5];
    var ROW_X_A = [477.81, 601.81, 725.81, 850.81, 974.81];
    var ROW_X_B = [540.81, 663.81, 787.81, 911.81];
    var HEX_W = 122.7, HEX_H = 146.67, VIEW_W = 1974, VIEW_H = 1128;

    function buildCellLayout() {
        var layout = [];
        ROW_Y.forEach(function (cy, r) {
            var xs = (r % 2 === 0) ? ROW_X_A : ROW_X_B;
            xs.forEach(function (cx) {
                layout.push({
                    leftPct: ((cx - HEX_W / 2) / VIEW_W) * 100,
                    topPct: ((cy - HEX_H / 2) / VIEW_H) * 100,
                    wPct: (HEX_W / VIEW_W) * 100,
                    hPct: (HEX_H / VIEW_H) * 100
                });
            });
        });
        return layout;
    }
    var CELL_LAYOUT = buildCellLayout();

    function buildAdjacency() {
        var centers = [];
        ROW_Y.forEach(function (cy, r) {
            var xs = (r % 2 === 0) ? ROW_X_A : ROW_X_B;
            xs.forEach(function (cx) { centers.push({ x: cx, y: cy }); });
        });
        var adj = centers.map(function () { return []; });
        for (var i = 0; i < centers.length; i++) {
            for (var j = i + 1; j < centers.length; j++) {
                var dx = centers[i].x - centers[j].x, dy = centers[i].y - centers[j].y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 140) { adj[i].push(j); adj[j].push(i); }
            }
        }
        return adj;
    }
    var ADJACENCY = buildAdjacency();
    var LEFT_EDGE = [0, 9, 18];
    var RIGHT_EDGE = [4, 13, 22];
    var TOP_EDGE = [0, 1, 2, 3, 4];
    var BOTTOM_EDGE = [18, 19, 20, 21, 22];

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

    // -------------------------- حالة عامة --------------------------
    var _screen = 'settings'; // settings | connecting | lobby | game | roundWinner | roundSummary | result
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
    var _cellStates = new Array(23).fill(0);
    var _activeLetter = null;
    var _connectionWinner = null;
    var _answerModal = null; // { letter, question, teamName, teamColor, playerName }
    var _settingsOpen = false;
    var _inviteOpen = false;
    var _showIntro = false;
    var _totalScore1 = 0, _totalScore2 = 0;
    var _roundScore1 = 0, _roundScore2 = 0;

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
    function playTone(freq, duration, type, delay, gainVal) {
        try {
            var ctx = getAudioCtx();
            if (!ctx) return;
            duration = duration || 0.15; type = type || 'sine'; delay = delay || 0; gainVal = gainVal == null ? 0.12 : gainVal;
            var t0 = ctx.currentTime + delay;
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(gainVal, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + duration + 0.02);
        } catch (e) {}
    }
    function playJoinSound() { playTone(700, 0.09, 'sine'); playTone(950, 0.09, 'sine', 0.07); }
    function playMatchStartSound() { [440, 554, 660].forEach(function (f, i) { playTone(f, 0.3, 'triangle', i * 0.05, 0.1); }); }
    function playSelectSound() { playTone(500, 0.08, 'square', 0, 0.08); }
    function playQuestionSound() { playTone(780, 0.12, 'triangle', 0.1, 0.08); }
    function playCorrectSound() { [523, 659, 784, 1046].forEach(function (f, i) { playTone(f, 0.18, 'sine', i * 0.08, 0.1); }); }
    function playRoundWinSound() { [392, 523, 659, 784, 1046, 1318].forEach(function (f, i) { playTone(f, 0.22, 'triangle', i * 0.09, 0.11); }); }

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
                html += '<div class="lc-decor-hex lc-hex-clip" style="left:' + left + 'px; top:' + top + 'px; width:' + size + 'px; height:' + size + 'px;">' + escapeHtml(LETTERS[li % LETTERS.length]) + '</div>';
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
        wireCommentListenerForJoining();
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

    // -------------------------- الانضمام عبر الشات (يبقى مفعّلاً طوال المباراة) --------------------------
    function wireCommentListenerForJoining() {
        if (_commentUnsub) return;
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_registrationOpen || !payload || typeof payload.text !== 'string' || !payload.id) return;

            var text = normalizeArabicText(payload.text);
            var kw1 = normalizeArabicText(_settings.team1AccessCode);
            var kw2 = normalizeArabicText(_settings.team2AccessCode);
            var team = null;
            if (text === kw1) team = TEAM1;
            else if (text === kw2) team = TEAM2;
            if (!team) return;

            var existing = findPlayerById(payload.id);
            if (existing && existing.team === team) return;
            if (existing) AGP.player.removePlayer(payload.id);

            AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null, team: team });
        });
    }

    // ================================================================
    // 3) شاشة اللعب
    // ================================================================
    function syncScoreManagerTotals() {
        AGP.scoreManager.setScore(SCORE_KEY_TEAM1, _totalScore1);
        AGP.scoreManager.setScore(SCORE_KEY_TEAM2, _totalScore2);
    }

    function goToGame() {
        _round = 1;
        _cellStates = new Array(23).fill(0);
        _activeLetter = null;
        _connectionWinner = null;
        _answerModal = null;
        _settingsOpen = false;
        _inviteOpen = false;
        _totalScore1 = 0; _totalScore2 = 0; _roundScore1 = 0; _roundScore2 = 0;

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
        playSelectSound();
        setTimeout(playQuestionSound, 120);
        _activeLetter = LETTERS[idx];
        renderGameScreen();
    }

    function creditTeam(team) {
        if (!_activeLetter) return;
        var idx = LETTERS.indexOf(_activeLetter);
        var cellStates = _cellStates.slice();
        cellStates[idx] = team;

        var teamName = (team === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var teamColor = (team === TEAM1) ? _settings.team1Color : _settings.team2Color;
        var players = getTeamPlayers(team);
        var playerName = players.length ? playerLabel(players[0]) : 'أحد اللاعبين';
        var question = QUESTION_BANK[_activeLetter] || '';

        playCorrectSound();
        var won = isConnected(cellStates, team);

        _cellStates = cellStates;
        _activeLetter = null;
        _connectionWinner = won ? team : null;
        _answerModal = { letter: idx, question: question, teamName: teamName, teamColor: teamColor, playerName: playerName };
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
        renderGameScreen();
    }

    function openRoundSummary() {
        _roundScore1 = _cellStates.filter(function (x) { return x === TEAM1; }).length;
        _roundScore2 = _cellStates.filter(function (x) { return x === TEAM2; }).length;
        _screen = 'roundSummary';
        renderRoundSummaryScreen();
    }

    function advanceRoundOrFinish() {
        if (_round >= 3) {
            _screen = 'result';
            renderResultScreen();
            return;
        }
        _round++;
        _cellStates = new Array(23).fill(0);
        _activeLetter = null;
        _answerModal = null;
        _connectionWinner = null;
        _screen = 'game';
        renderGameScreen();
        playIntro();
    }

    function confirmNextRound() {
        _totalScore1 += _roundScore1;
        _totalScore2 += _roundScore2;
        syncScoreManagerTotals();
        advanceRoundOrFinish();
    }

    function continueAfterRoundWin() {
        var winner = _connectionWinner;
        _totalScore1 += (winner === TEAM1) ? 1 : 0;
        _totalScore2 += (winner === TEAM2) ? 1 : 0;
        syncScoreManagerTotals();
        _connectionWinner = null;
        advanceRoundOrFinish();
    }

    function openSettingsDrawer() { _settingsOpen = true; renderGameScreen(); }
    function closeSettingsDrawer() { _settingsOpen = false; renderGameScreen(); }
    function openInviteModal() { _inviteOpen = true; renderGameScreen(); }
    function closeInviteModal() { _inviteOpen = false; renderGameScreen(); }

    function resetBoard() {
        _cellStates = new Array(23).fill(0);
        _activeLetter = null;
        _settingsOpen = false;
        renderGameScreen();
    }

    function endMatch() {
        var ok = window.confirm('بينتهي البث الحالي وتُصفَّر كل بيانات المباراة. تبي تكمل؟');
        if (!ok) return;
        AGP.streamConnector.disconnect('tiktok');
        AGP.gameManager.resetSession();
        _registrationOpen = false;
        if (_commentUnsub) { _commentUnsub(); _commentUnsub = null; }

        _round = 1; _cellStates = new Array(23).fill(0); _activeLetter = null; _connectionWinner = null;
        _answerModal = null; _settingsOpen = false; _inviteOpen = false; _totalScore1 = 0; _totalScore2 = 0; _roundScore1 = 0; _roundScore2 = 0;

        renderSettingsScreen();
    }

    function restartGame() {
        // البقاء متصلاً بنفس البث (لا مبرر لإعادة كتابة يوزر البث من الصفر)
        // وتصفير اللاعبين + رقعة اللعب، ثم الرجوع مباشرة للوبي لبدء مباراة جديدة.
        AGP.player.getAllPlayers().slice().forEach(function (p) { AGP.player.removePlayer(p.id); });
        _round = 1; _cellStates = new Array(23).fill(0); _activeLetter = null; _connectionWinner = null;
        _answerModal = null; _settingsOpen = false; _inviteOpen = false; _totalScore1 = 0; _totalScore2 = 0; _roundScore1 = 0; _roundScore2 = 0;
        AGP.scoreManager.reset();
        renderLobbyScreen();
    }

    function renderGameScreen() {
        ensureBody();
        var root = ensureRoot();

        var score1 = _cellStates.filter(function (x) { return x === TEAM1; }).length;
        var score2 = _cellStates.filter(function (x) { return x === TEAM2; }).length;

        var cellsHtml = LETTERS.map(function (letter, idx) {
            var st = _cellStates[idx];
            var layout = CELL_LAYOUT[idx];
            var bg = (st === TEAM1) ? _settings.team1Color : (st === TEAM2) ? _settings.team2Color : DEFAULT_BG;
            var color = (st === 0) ? '#1b0d0d' : '#fef4f4';
            var borderColor = (st === 0) ? '#ffffff' : bg;
            var isActive = _activeLetter === letter;
            var clickable = (st === 0);
            return '<div class="lc-hex-cell-wrap lc-hex-clip' + (clickable ? ' lc-hex-clickable' : '') + (isActive ? ' lc-hex-active' : '') + '" ' +
                'data-idx="' + idx + '" ' +
                'style="left:' + layout.leftPct + '%; top:' + layout.topPct + '%; width:' + layout.wPct + '%; height:' + layout.hPct + '%; background:' + borderColor + ';">' +
                '<div class="lc-hex-cell-inner lc-hex-clip" style="background:' + bg + '; color:' + color + ';">' + escapeHtml(letter) + '</div>' +
            '</div>';
        }).join('');

        var badgeHexHtml;
        if (_activeLetter) {
            badgeHexHtml = '<div class="lc-badge-hex-inner"><div class="lc-badge-hex-letter">' + escapeHtml(_activeLetter) + '</div><div class="lc-badge-hex-caption">الحرف</div></div>';
        } else {
            badgeHexHtml = '<div class="lc-badge-hex-inner"><button type="button" id="lc-round-badge-btn" class="lc-badge-hex-btn"><div class="lc-badge-hex-round">' + _round + '</div><div class="lc-badge-hex-caption">جولة جديدة</div></button></div>';
        }

        var questionInnerHtml = _activeLetter
            ? escapeHtml(QUESTION_BANK[_activeLetter] || '')
            : '<span class="lc-question-placeholder">اضغط على أي خلية لعرض سؤالها</span>';

        var creditRowHtml = _activeLetter
            ? '<div class="lc-credit-row">' +
                '<button type="button" id="lc-credit-team1" class="lc-credit-btn" style="background:' + _settings.team1Color + ';">' + escapeHtml(_settings.team1Name) + '</button>' +
                '<button type="button" id="lc-credit-team2" class="lc-credit-btn" style="background:' + _settings.team2Color + ';">' + escapeHtml(_settings.team2Name) + '</button>' +
              '</div>'
            : '';

        var introHtml = _showIntro
            ? '<div class="lc-intro-dim"></div><div class="lc-intro-logo">' + logo3dHtml() + '</div>'
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
                    '<button type="button" id="lc-drawer-reset" class="lc-drawer-btn-reset">إعادة ضبط اللعبة</button>' +
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
        if (roundBadgeBtn) roundBadgeBtn.addEventListener('click', openRoundSummary);

        el('lc-open-settings-btn').addEventListener('click', openSettingsDrawer);

        if (_activeLetter) {
            el('lc-credit-team1').addEventListener('click', function () { creditTeam(TEAM1); });
            el('lc-credit-team2').addEventListener('click', function () { creditTeam(TEAM2); });
        }

        if (_answerModal) {
            el('lc-answer-modal-done').addEventListener('click', closeAnswerModal);
        }

        if (_settingsOpen) {
            el('lc-drawer-close').addEventListener('click', closeSettingsDrawer);
            el('lc-drawer-end-match').addEventListener('click', endMatch);
            el('lc-drawer-invite').addEventListener('click', openInviteModal);
            el('lc-drawer-reset').addEventListener('click', resetBoard);
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

        var winner = _connectionWinner;
        var name = (winner === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var color = (winner === TEAM1) ? _settings.team1Color : _settings.team2Color;
        var players = getTeamPlayers(winner);
        var ctaLabel = (_round >= 3) ? 'عرض النتيجة النهائية' : 'انتقل للجولة التالية';

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
    // 5) شاشة ملخص الجولة (بدون فوز بخط متصل)
    // ================================================================
    function renderRoundSummaryScreen() {
        _screen = 'roundSummary';
        ensureBody();
        var root = ensureRoot();
        var ctaLabel = (_round >= 3) ? 'عرض النتيجة النهائية' : 'انتقل للجولة التالية';

        root.innerHTML =
            '<div class="lc-roundsummary-screen">' +
                logo3dHtml('lc-logo-small') +
                '<div class="lc-round-end-caption">انتهت الجولة ' + _round + '</div>' +
                '<div class="lc-score-compare">' +
                    '<div class="lc-score-compare-item"><div class="lc-score-compare-val" style="color:' + _settings.team1Color + ';">' + _roundScore1 + '</div><div class="lc-score-compare-name">' + escapeHtml(_settings.team1Name) + '</div></div>' +
                    '<div class="lc-score-compare-divider"></div>' +
                    '<div class="lc-score-compare-item"><div class="lc-score-compare-val" style="color:' + _settings.team2Color + ';">' + _roundScore2 + '</div><div class="lc-score-compare-name">' + escapeHtml(_settings.team2Name) + '</div></div>' +
                '</div>' +
                '<button type="button" id="lc-roundsummary-cta" class="lc-roundsummary-cta" style="background:linear-gradient(90deg,' + _settings.team1Color + ',' + _settings.team2Color + ');">' + ctaLabel + '</button>' +
            '</div>';

        el('lc-roundsummary-cta').addEventListener('click', confirmNextRound);
    }

    // ================================================================
    // 6) شاشة النتيجة النهائية
    // ================================================================
    function renderResultScreen() {
        _screen = 'result';
        ensureBody();
        var root = ensureRoot();

        var team1Wins = _totalScore1 >= _totalScore2;
        var winningTeam = team1Wins ? TEAM1 : TEAM2;
        var winningName = team1Wins ? _settings.team1Name : _settings.team2Name;
        var winningColor = team1Wins ? _settings.team1Color : _settings.team2Color;
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
                    '<div class="lc-score-compare-item"><div class="lc-score-compare-val lc-result-score-val" style="color:' + _settings.team1Color + ';">' + _totalScore1 + '</div><div class="lc-score-compare-name">' + escapeHtml(_settings.team1Name) + '</div></div>' +
                    '<div class="lc-score-compare-divider"></div>' +
                    '<div class="lc-score-compare-item"><div class="lc-score-compare-val lc-result-score-val" style="color:' + _settings.team2Color + ';">' + _totalScore2 + '</div><div class="lc-score-compare-name">' + escapeHtml(_settings.team2Name) + '</div></div>' +
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
