/**
 * ==========================================================================
 *  AGP SHAKHBATA -- "شخبطة" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 * لعبة أصلية (Native) بنفس نمط games/khazna من ناحية طريقة التحميل (بدون
 * js/agp-game-shell.js). الهوية البصرية: قالب "settings-no-box" منقول
 * بالحرف من الخزنة. خط Zain فقط. لا تعديل على أي ملف موجود بالمشروع (بما
 * فيها ملفات الخزنة نفسها).
 *
 * الفكرة: الستريمر يرسم شي يختاره (كلمة يكتبها بمربع نص سري -- ما تظهر
 * للمشاهدين)، والمشاهدين يخمنون بكتابة الجواب بالشات. أول تخمين صحيح
 * (تطابق تقريبي يسمح بأخطاء إملائية بسيطة) ياخذ 3 نقاط، الثاني نقطتين،
 * والباقي (لين العدد المحدد بالإعدادات) نقطة وحدة لكل واحد.
 *
 * ⚠️ ملاحظة دمج: هذا الملف مبني بالاعتماد على قراءة فعلية لكود
 * games/khazna/agp-khazna.js (نفس الإصدار المرفوع بالريبو وقت الكتابة).
 * الخدمات العامة المُعاد استخدامها بدون أي تعديل عليها:
 *   AGP.player / AGP.playerCard / AGP.streamConnector / AGP.events /
 *   AGP.gameManager
 *
 * نقطة واحدة غير مؤكدة 100%: ما وصلت لاستخدام فعلي لـ AGP.timerManager
 * بكود الخزنة اللي قريته (المؤقتات هناك كانت setTimeout/setInterval
 * عادية)، فاستخدمت نفس الأسلوب هنا. لو عندكم معيار موحّد لازم يمر عبر
 * AGP.timerManager، سهل تستبدل دالتي startRoundTimer/stopRoundTimer تحت.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.gameManager || !AGP.player || !AGP.streamConnector) {
        console.error('[AGP Shakhbata] AGP Core غير محمَّل بعد -- تأكد من ترتيب تحميل الملفات بـ index.html.');
        return;
    }

    var GAME_ID = 'shakhbata';
    var GAME_NAME = 'شخبطة';

    var SCORERS_OPTIONS = [1, 2, 3, 5, 10];
    var ROUND_SECONDS_OPTIONS = [30, 45, 60, 90, 120];
    var TOTAL_ROUNDS_OPTIONS = [5, 10, 15, 20];
    var LOBBY_CARD_SIZE = 46;
    var PALETTE = ['#f2eefc', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#7c3aed', '#ec4899', '#000000'];

    /* ======================================================================
     *  0) الحالة الداخلية
     * ==================================================================== */
    var _screen = 'settings'; // settings | connecting | lobby | match | winner
    var _rootEl = null;
    var _lobbyEl = null;
    var _matchEl = null;
    var _registrationOpen = false;
    var _joinCommentUnsub = null;
    var _guessCommentUnsub = null;

    var _settings = {
        tiktokUsername: '',
        joinKeyword: '',
        followersOnly: false,
        scorersCount: 1,
        roundSeconds: 60,
        totalRounds: 10
    };

    var _matchStartedAt = null;
    var _currentRound = 0;
    var _secretWord = '';
    var _roundActive = false;
    var _roundTimerHandle = null;
    var _timeLeft = 0;
    var _scoredThisRound = null; // Set of player ids
    var _roundScorers = [];      // [{player, points}]
    var _totalScores = null;     // Map: playerId -> points

    function el(id) { return document.getElementById(id); }
    function escapeAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    /* ======================================================================
     *  1) أدوات نصية: تطبيع عربي + تحقق تقريبي من التخمين
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

    function levenshtein(a, b) {
        var m = a.length, n = b.length;
        var dp = [];
        for (var i = 0; i <= m; i++) { dp.push(new Array(n + 1).fill(0)); dp[i][0] = i; }
        for (var j = 0; j <= n; j++) dp[0][j] = j;
        for (i = 1; i <= m; i++) {
            for (j = 1; j <= n; j++) {
                dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1]
                    : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
        return dp[m][n];
    }

    function isCloseEnoughGuess(guess, target) {
        var g = normalizeArabicText(guess);
        var t = normalizeArabicText(target);
        if (!g || !t) return false;
        if (g === t) return true;
        var allowedErrors = Math.max(1, Math.floor(t.length / 4));
        return levenshtein(g, t) <= allowedErrors;
    }

    /* ======================================================================
     *  2) الهيدر الأساسي الثابت
     * ==================================================================== */
    function injectHeader() {
        if (el('shk-header')) return;
        var header = document.createElement('div');
        header.id = 'shk-header';
        header.innerHTML =
            '<div class="shk-header-icons">' +
                '<button type="button" class="shk-header-icon-btn" id="shk-header-home-btn" title="العودة للمنصة">🏠</button>' +
            '</div>' +
            '<div id="shk-header-title">' + escapeHtml(GAME_NAME) + '</div>' +
            '<div id="shk-header-brand"><img src="../../logo.png" alt="ألعاب أيمن" onerror="this.style.display=\'none\'"></div>';
        document.body.appendChild(header);
        el('shk-header-home-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
    }

    /* ======================================================================
     *  3) شاشة الإعدادات -- قالب "settings-no-box"
     * ==================================================================== */
    function ensureRoot() {
        if (_rootEl) return _rootEl;
        document.body.classList.add('shk-active');
        _rootEl = document.createElement('div');
        _rootEl.id = 'shk-settings';
        document.body.appendChild(_rootEl);
        return _rootEl;
    }

    function pillGroupHtml(key, options, current, suffix) {
        return options.map(function (v) {
            var active = (current === v) ? ' shk-pill-active' : '';
            return '<button type="button" class="shk-pill-btn' + active + '" data-key="' + key + '" data-value="' + v + '">' + v + (suffix || '') + '</button>';
        }).join('');
    }

    function renderSettingsScreen() {
        _screen = 'settings';
        var root = ensureRoot();
        root.style.display = 'block';

        var joinPills = [
            { value: false, label: 'الجميع' },
            { value: true, label: 'المتابعون فقط' }
        ].map(function (opt) {
            var active = (_settings.followersOnly === opt.value) ? ' shk-pill-active' : '';
            return '<button type="button" class="shk-pill-btn' + active + '" data-key="followersOnly" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');

        root.innerHTML =
            '<h2>إعدادات مباراة شخبطة</h2>' +

            '<div class="shk-field">' +
                '<label>اكتب يوزر البث بالتيك توك</label>' +
                '<input type="text" id="shk-input-username" placeholder="ayman_live" value="' + escapeAttr(_settings.tiktokUsername) + '">' +
            '</div>' +

            '<div class="shk-field">' +
                '<label>الكلمة المفتاحية للدخول</label>' +
                '<input type="text" id="shk-input-keyword" placeholder="اكتب الكلمة المفتاحية" value="' + escapeAttr(_settings.joinKeyword) + '">' +
            '</div>' +

            '<div class="shk-row" id="shk-row-followersOnly">' +
                '<div class="shk-pill-group">' + joinPills + '</div>' +
                '<span class="shk-row-label">🔑 مين يقدر يدخل؟</span>' +
            '</div>' +

            '<div class="shk-row" id="shk-row-scorersCount">' +
                '<div class="shk-pill-group">' + pillGroupHtml('scorersCount', SCORERS_OPTIONS, _settings.scorersCount) + '</div>' +
                '<span class="shk-row-label">🏆 عدد اللي ياخذون نقاط بالجولة</span>' +
                '<div class="shk-hint">أول تخمين صح = 3 نقاط، الثاني = نقطتين، والباقي لين العدد المحدد = نقطة لكل واحد</div>' +
            '</div>' +

            '<div class="shk-row" id="shk-row-roundSeconds">' +
                '<div class="shk-pill-group">' + pillGroupHtml('roundSeconds', ROUND_SECONDS_OPTIONS, _settings.roundSeconds, 'ث') + '</div>' +
                '<span class="shk-row-label">⏱️ مدة كل جولة</span>' +
            '</div>' +

            '<div class="shk-row" id="shk-row-totalRounds">' +
                '<div class="shk-pill-group">' + pillGroupHtml('totalRounds', TOTAL_ROUNDS_OPTIONS, _settings.totalRounds) + '</div>' +
                '<span class="shk-row-label">🔢 عدد الجولات</span>' +
            '</div>' +

            '<div id="shk-settings-error" class="shk-error-msg" style="display:none;"></div>' +

            '<button type="button" id="shk-connect-btn" class="shk-btn-connect">اتصال بالبث وبدء الإعدادات</button>' +
            '<button type="button" id="shk-back-btn" class="shk-back-btn">🏠 رجوع لمنصة ألعاب أيمن</button>';

        wireSettingsHandlers();
    }

    function wireSettingsHandlers() {
        el('shk-input-username').addEventListener('input', function (e) { _settings.tiktokUsername = e.target.value; });
        el('shk-input-keyword').addEventListener('input', function (e) { _settings.joinKeyword = e.target.value; });

        el('shk-row-followersOnly').addEventListener('click', function (e) {
            var btn = e.target.closest('.shk-pill-btn'); if (!btn) return;
            _settings.followersOnly = (btn.getAttribute('data-value') === 'true');
            renderSettingsScreen();
        });
        ['scorersCount', 'roundSeconds', 'totalRounds'].forEach(function (key) {
            el('shk-row-' + key).addEventListener('click', function (e) {
                var btn = e.target.closest('.shk-pill-btn'); if (!btn) return;
                _settings[key] = parseInt(btn.getAttribute('data-value'), 10);
                renderSettingsScreen();
            });
        });

        el('shk-back-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('shk-connect-btn').addEventListener('click', handleConnectClick);
    }

    function showSettingsError(msg) {
        var errEl = el('shk-settings-error');
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
     *  4) تبويب الاتصال بالبث
     * ==================================================================== */
    function ensureConnectOverlay() {
        if (!el('shk-connect-dim')) {
            var dim = document.createElement('div');
            dim.id = 'shk-connect-dim';
            document.body.appendChild(dim);
        }
        if (!el('shk-connect-popup')) {
            var popup = document.createElement('div');
            popup.id = 'shk-connect-popup';
            document.body.appendChild(popup);
        }
        return el('shk-connect-popup');
    }

    function showConnectOverlay(isError) {
        var popup = ensureConnectOverlay();
        el('shk-connect-dim').style.display = 'block';
        popup.style.display = 'block';
        popup.classList.toggle('shk-connect-error', Boolean(isError));
        popup.innerHTML =
            (isError ? '<button type="button" id="shk-connect-close-btn">✕</button>' : '') +
            '<div class="' + (isError ? 'shk-connect-error-icon' : 'shk-connect-spinner') + '">' + (isError ? '⚠️' : '') + '</div>' +
            '<h3>' + (isError ? 'تعذّر الاتصال' : 'جاري الاتصال بالبث') + '</h3>' +
            '<p>' + (isError ? 'تأكد من اسم المستخدم وحاول مرة ثانية' : 'انتظر قليلاً...') + '</p>';
        if (isError) {
            el('shk-connect-close-btn').onclick = function () { hideConnectOverlay(); };
        }
    }
    function hideConnectOverlay() {
        if (el('shk-connect-dim')) el('shk-connect-dim').style.display = 'none';
        if (el('shk-connect-popup')) el('shk-connect-popup').style.display = 'none';
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
            } else if (payload.status === 'connected' && _screen !== 'lobby') {
                hideConnectOverlay();
                renderLobbyScreen();
            } else if (payload.status === 'error') {
                showConnectOverlay(true);
            }
        });

        AGP.events.on('player:joined', function () { if (_screen === 'lobby') renderLobbyGrid(); });
        AGP.events.on('player:removed', function () { if (_screen === 'lobby') renderLobbyGrid(); });
    }

    /* ======================================================================
     *  6) شاشة اللوبي (نفس نمط الخزنة: بدون صندوق، شبكة 6 أعمدة 46px)
     * ==================================================================== */
    function findPlayerById(id) {
        var players = AGP.player.getAllPlayers();
        for (var i = 0; i < players.length; i++) if (players[i].id === id) return players[i];
        return null;
    }

    function playerCardHtml(p) {
        if (AGP.playerCard) {
            return AGP.playerCard.renderHtml(p, { showFrame: true, basePath: '../../', size: LOBBY_CARD_SIZE, outClass: 'shk-pcard-wrap' });
        }
        var avatar = p.avatarUrl ? escapeAttr(p.avatarUrl) : '';
        return '<span class="shk-pcard-wrap">' + (avatar ? '<img src="' + avatar + '">' : '') + escapeHtml(p.name || p.id) + '</span>';
    }

    function lobbyCardHtml(p) {
        return '<div class="shk-lobby-card-wrap">' +
            '<button type="button" class="shk-lobby-remove-x" data-id="' + escapeAttr(p.id) + '" title="حذف اللاعب">✕</button>' +
            playerCardHtml(p) +
        '</div>';
    }

    function wireLobbyRemoveButtons(container) {
        if (!container) return;
        container.querySelectorAll('.shk-lobby-remove-x').forEach(function (btn) {
            btn.addEventListener('click', function () {
                AGP.player.removePlayer(btn.getAttribute('data-id'));
                renderLobbyGrid();
            });
        });
    }

    function renderLobbyGrid() {
        var grid = el('shk-lobby-grid');
        if (!grid) return;
        var players = AGP.player.getAllPlayers();
        el('shk-lobby-count').textContent = players.length + ' لاعبين';
        grid.innerHTML = players.map(lobbyCardHtml).join('') || '<div class="shk-lobby-empty">بانتظار أول لاعب...</div>';
        if (AGP.playerCard) AGP.playerCard.fitAllNames(grid);
        wireLobbyRemoveButtons(grid);
        el('shk-start-round-btn').disabled = players.length === 0;
    }

    function wireCommentListenerForJoining() {
        if (_joinCommentUnsub) return;
        _joinCommentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_registrationOpen || !payload || typeof payload.text !== 'string' || !payload.id) return;
            if (_settings.followersOnly && !payload.isFollower) return;
            var text = normalizeArabicText(payload.text);
            var keyword = normalizeArabicText(_settings.joinKeyword);
            if (!keyword || text !== keyword) return;
            if (findPlayerById(payload.id)) return;
            AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null });
        });
    }

    function ensureLobbyEl() {
        if (_lobbyEl) return _lobbyEl;
        _lobbyEl = document.createElement('div');
        _lobbyEl.id = 'shk-lobby';
        document.body.appendChild(_lobbyEl);
        return _lobbyEl;
    }

    function renderLobbyScreen() {
        _screen = 'lobby';
        _registrationOpen = true;
        if (_rootEl) _rootEl.style.display = 'none';
        if (AGP.lobby && typeof AGP.lobby.open === 'function') AGP.lobby.open();
        wireCommentListenerForJoining();

        var root = ensureLobbyEl();
        root.style.display = 'flex';
        root.innerHTML =
            '<img id="shk-lobby-watermark" src="../../logo.png" alt="" onerror="this.style.display=\'none\'">' +
            '<h2><span class="shk-title-plain">لوبي دخول لعبة - </span><span class="shk-title-accent">' + escapeHtml(GAME_NAME) + '</span></h2>' +
            '<div class="shk-join-hint">' +
                '<span class="shk-badge shk-keyword-badge">' + escapeHtml(_settings.joinKeyword) + '</span>' +
                '<span class="shk-badge shk-count-badge" id="shk-lobby-count">0 لاعبين</span>' +
            '</div>' +
            '<div id="shk-lobby-grid"></div>' +
            '<div id="shk-lobby-actions">' +
                '<button type="button" id="shk-lobby-back-settings-btn" class="shk-btn-settings">⚙️ العودة لإعدادات المباراة</button>' +
                '<button type="button" id="shk-start-round-btn" class="shk-btn-start" disabled>ابدأ الجولة</button>' +
                '<button type="button" id="shk-lobby-back-platform-btn" class="shk-btn-platform">🏠 رجوع لمنصة ألعاب أيمن</button>' +
            '</div>';

        renderLobbyGrid();

        el('shk-lobby-back-settings-btn').addEventListener('click', function () {
            var ok = window.confirm('بترجع لشاشة الإعدادات وينقطع الاتصال الحالي بالبث. تبي تكمل؟');
            if (ok) window.location.reload();
        });
        el('shk-lobby-back-platform-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('shk-start-round-btn').addEventListener('click', function () { startMatch(); });
    }

    /* ======================================================================
     *  7) شاشة المباراة (الرسم + التخمين)
     * ==================================================================== */
    function ensureMatchEl() {
        if (_matchEl) return _matchEl;
        _matchEl = document.createElement('div');
        _matchEl.id = 'shk-match';
        _matchEl.innerHTML =
            '<div id="shk-round-bar">' +
                '<button type="button" class="shk-header-icon-btn" id="shk-open-drawer-btn">⚙️</button>' +
                '<span class="shk-round-label" id="shk-round-label">الجولة 1 / ' + _settings.totalRounds + '</span>' +
                '<span class="shk-timer" id="shk-timer">' + _settings.roundSeconds + '</span>' +
            '</div>' +
            '<div id="shk-secret-box">' +
                '<input type="text" id="shk-secret-input" placeholder="اكتب الكلمة اللي بترسمها (سرية، ما تظهر للمشاهدين)..." autocomplete="off">' +
                '<button type="button" id="shk-lock-word-btn">ابدأ الرسم</button>' +
            '</div>' +
            '<div id="shk-canvas-wrap"><canvas id="shk-canvas"></canvas></div>' +
            '<div id="shk-tools-bar">' +
                '<div class="shk-color-swatches" id="shk-color-swatches"></div>' +
                '<input type="range" id="shk-brush-size" min="2" max="30" value="6">' +
                '<button type="button" class="shk-tool-btn" id="shk-eraser-btn" title="ممحاة">🧽</button>' +
                '<button type="button" class="shk-tool-btn" id="shk-clear-btn" title="مسح الكل">🗑️</button>' +
                '<button type="button" class="shk-tool-btn" id="shk-undo-btn" title="تراجع">↩️</button>' +
            '</div>' +
            '<div id="shk-live-scorers"></div>' +
            '<div id="shk-bottom-bar"><button type="button" id="shk-next-round-btn" class="shk-btn-next" disabled>الجولة التالية</button></div>';
        document.body.appendChild(_matchEl);
        wireMatchControls();
        setupCanvas();
        return _matchEl;
    }

    function startMatch() {
        if (_rootEl) _rootEl.style.display = 'none';
        if (_lobbyEl) _lobbyEl.style.display = 'none';
        _screen = 'match';
        _registrationOpen = false; // اللوبي انقفل؛ الانضمام كلاعب جديد يصير بس عبر "افتح الدخول" بالدرج
        ensureMatchEl().style.display = 'flex';
        _matchStartedAt = Date.now();
        _currentRound = 0;
        _totalScores = new Map();
        wireGuessListener();
        nextRound();
    }

    function wireMatchControls() {
        el('shk-lock-word-btn').addEventListener('click', function () {
            var word = el('shk-secret-input').value.trim();
            if (!word) { toast('اكتب الكلمة قبل ما تبدأ', 'error'); return; }
            _secretWord = word;
            _roundActive = true;
            el('shk-secret-input').disabled = true;
            el('shk-lock-word-btn').disabled = true;
            startRoundTimer();
        });
        el('shk-next-round-btn').addEventListener('click', nextRound);
        el('shk-clear-btn').addEventListener('click', clearCanvas);
        el('shk-open-drawer-btn').addEventListener('click', openDrawer);
    }

    function nextRound() {
        _currentRound++;
        if (_currentRound > _settings.totalRounds) { endMatch(); return; }

        _secretWord = '';
        _roundActive = false;
        _scoredThisRound = new Set();
        _roundScorers = [];

        el('shk-round-label').textContent = 'الجولة ' + _currentRound + ' / ' + _settings.totalRounds;
        el('shk-secret-input').value = '';
        el('shk-secret-input').disabled = false;
        el('shk-lock-word-btn').disabled = false;
        el('shk-next-round-btn').disabled = true;
        el('shk-live-scorers').innerHTML = '';
        clearCanvas();
        stopRoundTimer();
        el('shk-timer').textContent = _settings.roundSeconds;
        el('shk-timer').classList.remove('shk-warn');
    }

    function startRoundTimer() {
        _timeLeft = _settings.roundSeconds;
        el('shk-timer').textContent = _timeLeft;
        stopRoundTimer();
        _roundTimerHandle = setInterval(function () {
            _timeLeft--;
            el('shk-timer').textContent = _timeLeft;
            if (_timeLeft <= 10) el('shk-timer').classList.add('shk-warn');
            if (_timeLeft <= 0) finishRound();
        }, 1000);
    }
    function stopRoundTimer() {
        if (_roundTimerHandle) clearInterval(_roundTimerHandle);
        _roundTimerHandle = null;
    }
    function finishRound() {
        stopRoundTimer();
        _roundActive = false;
        el('shk-next-round-btn').disabled = false;
        if (_roundScorers.length === 0) toast('ما حد جاوب صح هالجولة', 'error');
    }

    /* ---------------- الاستماع للشات أثناء الجولة (التخمين) ---------------- */
    function wireGuessListener() {
        if (_guessCommentUnsub) return;
        _guessCommentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_roundActive || !payload || typeof payload.text !== 'string' || !payload.id) return;
            var player = findPlayerById(payload.id);
            if (!player) return; // بس اللاعبين المنضمّين عبر الكلمة المفتاحية يقدرون يسجّلون نقاط
            if (!isCloseEnoughGuess(payload.text, _secretWord)) return;
            registerCorrectGuess(player);
        });
    }

    function registerCorrectGuess(player) {
        if (!_roundActive) return;
        if (_scoredThisRound.has(player.id)) return;
        if (_roundScorers.length >= _settings.scorersCount) return;

        _scoredThisRound.add(player.id);
        var position = _roundScorers.length; // 0-based
        var points = position === 0 ? 3 : position === 1 ? 2 : 1;
        _roundScorers.push({ player: player, points: points });

        var prev = _totalScores.get(player.id) || 0;
        _totalScores.set(player.id, prev + points);

        renderLiveScorers();
        toast((player.name || player.id) + ' جاوب صح! +' + points, 'success');

        if (_roundScorers.length >= _settings.scorersCount) finishRound();
    }

    function renderLiveScorers() {
        var wrap = el('shk-live-scorers');
        wrap.innerHTML = _roundScorers.map(function (s, idx) {
            var cls = idx === 0 ? 'shk-first' : idx === 1 ? 'shk-second' : '';
            var medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🎯';
            return '<div class="shk-scorer-pill ' + cls + '">' + medal + ' ' + escapeHtml(s.player.name || s.player.id) + ' +' + s.points + '</div>';
        }).join('');
    }

    /* ======================================================================
     *  8) لوحة الرسم (Canvas) -- الستريمر فقط يرسم
     * ==================================================================== */
    var _ctx = null, _drawing = false, _currentColor = PALETTE[0], _currentSize = 6, _isEraser = false, _strokes = [];

    function setupCanvas() {
        var canvas = el('shk-canvas');
        _ctx = canvas.getContext('2d');

        function resize() {
            var rect = canvas.parentElement.getBoundingClientRect();
            var prev = canvas.width ? canvas.toDataURL() : null;
            canvas.width = rect.width;
            canvas.height = rect.height;
            _ctx.fillStyle = '#150a20';
            _ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (prev) {
                var img = new Image();
                img.onload = function () { _ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
                img.src = prev;
            }
        }
        window.addEventListener('resize', resize);
        new MutationObserver(function () {
            if (_matchEl && _matchEl.style.display === 'flex') requestAnimationFrame(resize);
        }).observe(document.body, { attributes: false, childList: false });
        // أول عرض للشاشة (لما تنفتح match لأول مرة)
        requestAnimationFrame(resize);

        function getPos(e) {
            var rect = canvas.getBoundingClientRect();
            var point = e.touches ? e.touches[0] : e;
            return { x: point.clientX - rect.left, y: point.clientY - rect.top };
        }
        function startDraw(e) {
            _drawing = true;
            var p = getPos(e);
            _ctx.beginPath();
            _ctx.moveTo(p.x, p.y);
            _strokes.push(canvas.toDataURL());
            if (_strokes.length > 20) _strokes.shift();
        }
        function draw(e) {
            if (!_drawing) return;
            e.preventDefault();
            var p = getPos(e);
            _ctx.lineTo(p.x, p.y);
            _ctx.strokeStyle = _isEraser ? '#150a20' : _currentColor;
            _ctx.lineWidth = _isEraser ? _currentSize * 3 : _currentSize;
            _ctx.lineCap = 'round';
            _ctx.lineJoin = 'round';
            _ctx.stroke();
        }
        function endDraw() { _drawing = false; }

        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', draw);
        window.addEventListener('mouseup', endDraw);
        canvas.addEventListener('touchstart', startDraw, { passive: true });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', endDraw);

        el('shk-undo-btn').addEventListener('click', function () {
            var last = _strokes.pop();
            if (!last) { clearCanvas(); return; }
            var img = new Image();
            img.onload = function () { _ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
            img.src = last;
        });
        el('shk-eraser-btn').addEventListener('click', function () {
            _isEraser = !_isEraser;
            el('shk-eraser-btn').style.background = _isEraser ? 'rgba(124,58,237,0.4)' : '';
        });
        el('shk-brush-size').addEventListener('input', function (e) { _currentSize = parseInt(e.target.value, 10); });

        var swatchWrap = el('shk-color-swatches');
        PALETTE.forEach(function (color, idx) {
            var dot = document.createElement('span');
            dot.style.background = color;
            if (idx === 0) dot.classList.add('shk-active');
            dot.addEventListener('click', function () {
                _currentColor = color;
                _isEraser = false;
                el('shk-eraser-btn').style.background = '';
                swatchWrap.querySelectorAll('span').forEach(function (s) { s.classList.remove('shk-active'); });
                dot.classList.add('shk-active');
            });
            swatchWrap.appendChild(dot);
        });
    }

    function clearCanvas() {
        var canvas = el('shk-canvas');
        if (!_ctx || !canvas) return;
        _ctx.fillStyle = '#150a20';
        _ctx.fillRect(0, 0, canvas.width, canvas.height);
        _strokes.length = 0;
    }

    /* ======================================================================
     *  9) الدرج الجانبي (إعدادات + لاعبين أثناء اللعب)
     * ==================================================================== */
    function ensureDrawerEl() {
        if (el('shk-drawer')) return;
        var dim = document.createElement('div');
        dim.id = 'shk-drawer-dim';
        document.body.appendChild(dim);

        var drawer = document.createElement('div');
        drawer.id = 'shk-drawer';
        drawer.innerHTML =
            '<div class="shk-drawer-header"><h2>الإعدادات واللاعبين</h2><button type="button" class="shk-drawer-close-btn" id="shk-drawer-close-btn">✕</button></div>' +
            '<div class="shk-drawer-body">' +
                '<div class="shk-row" id="shk-drawer-row-scorersCount" style="border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:14px;margin-bottom:14px;">' +
                    '<div class="shk-pill-group">' + pillGroupHtml('scorersCount', SCORERS_OPTIONS, _settings.scorersCount) + '</div>' +
                    '<span class="shk-row-label">🏆 عدد اللي ياخذون نقاط</span>' +
                '</div>' +
                '<div id="shk-drawer-players"></div>' +
            '</div>' +
            '<div class="shk-drawer-footer">' +
                '<button type="button" id="shk-open-mini-lobby-btn">➕ فتح الدخول للاعبين جدد</button>' +
                '<button type="button" class="shk-exit-btn" id="shk-drawer-exit-btn">إنهاء المباراة</button>' +
            '</div>';
        document.body.appendChild(drawer);

        dim.addEventListener('click', closeDrawer);
        el('shk-drawer-close-btn').addEventListener('click', closeDrawer);
        el('shk-drawer-row-scorersCount').addEventListener('click', function (e) {
            var btn = e.target.closest('.shk-pill-btn'); if (!btn) return;
            _settings.scorersCount = parseInt(btn.getAttribute('data-value'), 10);
            ensureDrawerRefresh();
        });
        el('shk-open-mini-lobby-btn').addEventListener('click', openMiniLobby);
        el('shk-drawer-exit-btn').addEventListener('click', function () {
            if (window.confirm('تنهي المباراة الحين؟')) endMatch();
        });
    }

    function ensureDrawerRefresh() {
        // إعادة رسم قسم النقاط بس (بدون فقدان بقية الدرج)
        var wrap = el('shk-drawer-row-scorersCount').querySelector('.shk-pill-group');
        wrap.innerHTML = pillGroupHtml('scorersCount', SCORERS_OPTIONS, _settings.scorersCount);
    }

    function renderDrawerPlayers() {
        var wrap = el('shk-drawer-players');
        if (!wrap) return;
        var players = AGP.player.getAllPlayers();
        if (!players.length) { wrap.innerHTML = '<div class="shk-mini-empty">ما فيه لاعبين بعد</div>'; return; }
        wrap.innerHTML = players.map(function (p) {
            var score = (_totalScores && _totalScores.get(p.id)) || 0;
            return '<div class="shk-p-row">' +
                '<span class="shk-p-name">' + escapeHtml(p.name || p.id) + '</span>' +
                '<span class="shk-p-score">' + score + ' نقطة</span>' +
                '<button type="button" class="shk-p-x-btn" data-id="' + escapeAttr(p.id) + '">✕</button>' +
            '</div>';
        }).join('');
        wrap.querySelectorAll('.shk-p-x-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                AGP.player.removePlayer(btn.getAttribute('data-id'));
                renderDrawerPlayers();
            });
        });
    }

    function openDrawer() {
        ensureDrawerEl();
        renderDrawerPlayers();
        el('shk-drawer-dim').style.display = 'block';
        el('shk-drawer').style.display = 'flex';
        void el('shk-drawer').offsetWidth;
        requestAnimationFrame(function () {
            el('shk-drawer-dim').classList.add('shk-show');
            el('shk-drawer').classList.add('shk-show');
        });
    }
    function closeDrawer() {
        var dim = el('shk-drawer-dim'), box = el('shk-drawer');
        if (!dim || !box) return;
        dim.classList.remove('shk-show');
        box.classList.remove('shk-show');
        setTimeout(function () { dim.style.display = 'none'; box.style.display = 'none'; }, 350);
    }

    /* ---------------- لوبي إضافة لاعبين جدد أثناء المباراة ---------------- */
    var _miniLobbyAccepting = false, _miniLobbyUnsub = null, _miniJoinedIds = [];

    function ensureMiniLobbyEl() {
        if (el('shk-mini-lobby')) return;
        var dim = document.createElement('div');
        dim.id = 'shk-mini-dim';
        document.body.appendChild(dim);

        var box = document.createElement('div');
        box.id = 'shk-mini-lobby';
        box.innerHTML =
            '<button type="button" id="shk-mini-close-btn">✕</button>' +
            '<div id="shk-mini-body">' +
                '<h2>ضم لاعبين جدد</h2>' +
                '<div id="shk-mini-sub">افتح الدخول مؤقتاً لضم لاعبين جدد للمباراة الحالية</div>' +
                '<div class="shk-mini-hint">' +
                    '<span class="shk-mini-badge shk-mini-keyword-badge" id="shk-mini-keyword-badge"></span>' +
                    '<span class="shk-mini-badge" id="shk-mini-count">0 لاعبين جدد</span>' +
                '</div>' +
                '<div id="shk-mini-grid"></div>' +
            '</div>' +
            '<div id="shk-mini-footer">' +
                '<button type="button" id="shk-mini-complete-btn">✅ اكتمل الدخول</button>' +
                '<button type="button" id="shk-mini-save-btn">💾 حفظ وإكمال المباراة</button>' +
            '</div>';
        document.body.appendChild(box);

        el('shk-mini-close-btn').addEventListener('click', closeMiniLobby);
        dim.addEventListener('click', closeMiniLobby);
        el('shk-mini-complete-btn').addEventListener('click', function () {
            _miniLobbyAccepting = false;
            el('shk-mini-complete-btn').classList.add('shk-done');
            el('shk-mini-complete-btn').textContent = '🔒 الدخول مقفول';
        });
        el('shk-mini-save-btn').addEventListener('click', closeMiniLobby);
    }

    function renderMiniGrid() {
        var newPlayers = AGP.player.getAllPlayers().filter(function (p) { return _miniJoinedIds.indexOf(p.id) !== -1; });
        var grid = el('shk-mini-grid');
        if (!newPlayers.length) {
            grid.innerHTML = '<div class="shk-mini-empty">بانتظار أول لاعب جديد...</div>';
        } else {
            grid.innerHTML = newPlayers.map(lobbyCardHtml).join('');
            if (AGP.playerCard) AGP.playerCard.fitAllNames(grid);
            wireLobbyRemoveButtons(grid);
        }
        el('shk-mini-count').textContent = newPlayers.length + ' لاعبين جدد';
    }

    function wireMiniLobbyJoining() {
        if (_miniLobbyUnsub) return;
        _miniLobbyUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_miniLobbyAccepting || !payload || typeof payload.text !== 'string' || !payload.id) return;
            if (_settings.followersOnly && !payload.isFollower) return;
            var text = normalizeArabicText(payload.text);
            var keyword = normalizeArabicText(_settings.joinKeyword);
            if (!keyword || text !== keyword) return;
            if (findPlayerById(payload.id)) return;
            AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null });
            _miniJoinedIds.push(payload.id);
            renderMiniGrid();
        });
    }

    function openMiniLobby() {
        closeDrawer();
        ensureMiniLobbyEl();
        _miniJoinedIds = [];
        _miniLobbyAccepting = true;
        wireMiniLobbyJoining();
        el('shk-mini-keyword-badge').textContent = '🔑 ' + (_settings.joinKeyword || '');
        el('shk-mini-complete-btn').classList.remove('shk-done');
        el('shk-mini-complete-btn').textContent = '✅ اكتمل الدخول';
        renderMiniGrid();

        el('shk-mini-dim').style.display = 'block';
        el('shk-mini-lobby').style.display = 'flex';
        void el('shk-mini-lobby').offsetWidth;
        requestAnimationFrame(function () {
            el('shk-mini-dim').classList.add('shk-show');
            el('shk-mini-lobby').classList.add('shk-show');
        });
    }
    function closeMiniLobby() {
        _miniLobbyAccepting = false;
        var dim = el('shk-mini-dim'), box = el('shk-mini-lobby');
        if (!dim || !box) return;
        dim.classList.remove('shk-show');
        box.classList.remove('shk-show');
        setTimeout(function () { dim.style.display = 'none'; box.style.display = 'none'; }, 350);
    }

    /* ======================================================================
     *  10) شاشة الفائز -- بطاقة AGP.playerCard.renderTrophyCard المشتركة،
     *      بنفس مسار تقرير النقاط الحقيقي المعتمَد (window.AGPAuth.
     *      reportRoundCompletion) -- بدون أي تعديل على قيم النقاط، النظام
     *      العام الموحَّد فقط.
     * ==================================================================== */
    function tiktokUsernameFor(player) {
        var id = (player && player.id) || '';
        if (id.indexOf('tiktok:') === 0) return id.slice('tiktok:'.length);
        return (player && (player.name || player.id)) || '';
    }

    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }

    function pointsHtmlFor(pointsResult, player) {
        if (!pointsResult) return '<div class="agp-trophy-points agp-points-noaccount">تعذّر جلب النقاط الآن</div>';
        var awarded = findAwardedFor(pointsResult, player);
        if (awarded) {
            return '<div class="agp-trophy-points agp-points-earned">+' + awarded.added + ' نقطة' +
                '<span class="agp-points-sub">تظهر في بروفايلك</span></div>';
        }
        return '<div class="agp-trophy-points agp-points-noaccount">لازم يسوي حساب عشان تظهر نقاطك بالبروفايل</div>';
    }

    function ensureWinnerEl() {
        if (el('shk-winner')) return;
        var box = document.createElement('div');
        box.id = 'shk-winner';
        document.body.appendChild(box);
    }

    async function endMatch() {
        stopRoundTimer();
        if (_matchEl) _matchEl.style.display = 'none';
        _screen = 'winner';
        ensureWinnerEl();

        var winnerId = null, winnerScore = -1;
        (_totalScores || new Map()).forEach(function (score, id) {
            if (score > winnerScore) { winnerScore = score; winnerId = id; }
        });
        var winner = winnerId ? findPlayerById(winnerId) : null;

        var durationMs = _matchStartedAt ? (Date.now() - _matchStartedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var allPlayers = AGP.player.getAllPlayers();
            var participants = allPlayers.map(function (p) {
                return { tiktokUsername: tiktokUsernameFor(p), won: Boolean(winner) && p.id === winner.id };
            }).filter(function (p) { return p.tiktokUsername; });
            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () { return null; });
            }
        }
        var pointsResult = await pointsPromise;

        el('shk-winner').innerHTML =
            '<div id="shk-winner-label">🏁 انتهت المباراة .. الشخص الرهيب الي فاز بلعبة "شخبطة"</div>' +
            (winner
                ? AGP.playerCard.renderTrophyCard(winner, { kind: 'winner', showCrown: true, pointsHtml: pointsHtmlFor(pointsResult, winner) })
                : '<div id="shk-no-winner">ما فيه فائز -- محد جاوب صح طول المباراة</div>');
        el('shk-winner').style.display = 'flex';

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
    }

    /* ======================================================================
     *  11) توست بسيط
     * ==================================================================== */
    function ensureToastsEl() {
        if (el('shk-toasts')) return;
        var wrap = document.createElement('div');
        wrap.id = 'shk-toasts';
        document.body.appendChild(wrap);
    }
    function toast(msg, type) {
        ensureToastsEl();
        var t = document.createElement('div');
        t.className = 'shk-toast ' + (type === 'success' ? 'shk-success' : type === 'error' ? 'shk-error' : '');
        t.textContent = msg;
        el('shk-toasts').appendChild(t);
        setTimeout(function () { t.remove(); }, 3000);
    }

    /* ======================================================================
     *  12) التسجيل بالمنصة
     * ==================================================================== */
    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'drawing-guessing-games',
            onLoad: function () { AGP.log('Shakhbata: onLoad.'); },
            onRoundEnd: function () { AGP.log('Shakhbata: onRoundEnd.'); },
            onDestroy: function () { AGP.log('Shakhbata: onDestroy.'); }
        });

        if (!registered) { AGP.log('Shakhbata: registration failed (already registered?).'); return; }

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
