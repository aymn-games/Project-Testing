/**
 * ==========================================================================
 *  AGP TEAM WAR -- "حرب الفرقين" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 * لعبة أصلية (Native) بنفس نمط games/musical-chairs من ناحية طريقة التحميل
 * فقط -- الهوية البصرية والشاشات كلها مستقلة تماماً (خط Zain، ألوان خاصة،
 * لا اعتماد على js/agp-game-shell.js إطلاقاً). راجع رأس index.html لتفاصيل
 * القرار المعماري الكامل.
 *
 * الخدمات العامة المُعاد استخدامها بدون أي تعديل عليها:
 *   AGP.player / AGP.scoreManager / AGP.timerManager / AGP.streamConnector
 *   AGP.lobby / AGP.gameManager
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.gameManager || !AGP.player || !AGP.scoreManager || !AGP.timerManager || !AGP.streamConnector) {
        console.error('[AGP Team War] AGP Core غير محمَّل بعد -- تأكد من ترتيب تحميل الملفات بـ index.html.');
        return;
    }

    var GAME_ID = 'team-war';
    var GAME_NAME = 'حرب الفرقين';

    var TEAM_BLUE = 'blue';
    var TEAM_RED = 'red';
    var SCORE_KEY_BLUE = 'team-war:blue';
    var SCORE_KEY_RED = 'team-war:red';
    var SELECTION_TIMER_NAME = 'tw-selection-timer';

    var STARTING_POINTS_OPTIONS = [150, 200, 250];
    var TIMER_OPTIONS = [20, 25, 30]; // ثانية؛ 0 = إيقاف المؤقت
    var TEAM_SIZE_OPTIONS = [2, 4, 8];

    var GRID_COLS = 8;
    var GRID_ROWS = 6;
    var GRID_TOTAL = GRID_COLS * GRID_ROWS; // 48 مربع مرقّم

    var CARD_EMOJI_BANK = ['🎁','💎','🔥','⚡','🎯','🍀','🎲','⭐','💣','🐉','👑','🍉','🚀','🎃','🦁','🍩','⚔️','🛡️','🎈','🍕'];

    /* ======================================================================
     *  0) الحالة الداخلية
     * ==================================================================== */
    var _screen = 'settings'; // settings | connecting | lobby | match | winner
    var _overlayEl = null;
    var _lobbyEl = null;
    var _matchEl = null;
    var _winnerEl = null;
    var _adminPanelEl = null;
    var _adminPanelOpen = false;
    var _subLobbyEl = null;
    var _subLobbyTeam = null;
    var _subLobbyCandidate = null;
    var _subLobbyUnsub = null;
    var _activeLobbyTab = TEAM_BLUE;
    var _registrationOpen = false;
    var _commentUnsub = null;
    var _turnCommentUnsub = null;

    var _settings = {
        tiktokUsername: '',
        teamBlueName: 'الفريق الأزرق',
        teamRedName: 'الفريق الأحمر',
        teamBlueKeyword: '',
        teamRedKeyword: '',
        maxTeamSize: 8,
        startingPoints: 200,
        selectionTimerSeconds: 25
    };

    // حالة المباراة الحيّة
    var _tiles = []; // { num, used }
    var _turnQueue = []; // [{id, team}]
    var _turnPointer = 0;
    var _matchActive = false;

    function el(id) { return document.getElementById(id); }
    function escapeAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    /* ======================================================================
     *  1) أدوات نصية: تطبيع عربي + تحويل أرقام عربية-هندية لإنجليزية
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

    function normalizeDigits(text) {
        if (typeof text !== 'string') return '';
        var arabicIndic = '٠١٢٣٤٥٦٧٨٩';
        var persian = '۰۱۲۳۴۵۶۷۸۹';
        return text.replace(/[٠-٩۰-۹]/g, function (ch) {
            var i = arabicIndic.indexOf(ch);
            if (i > -1) return String(i);
            i = persian.indexOf(ch);
            return i > -1 ? String(i) : ch;
        });
    }

    function extractTileNumber(text) {
        var normalized = normalizeDigits((text || '').trim());
        var match = normalized.match(/^\s*(\d{1,3})\s*$/);
        return match ? parseInt(match[1], 10) : null;
    }

    /* ======================================================================
     *  2) الهيدر الثابت
     * ==================================================================== */
    function injectHeader() {
        if (el('tw-header')) return;
        document.body.classList.add('tw-active');

        var header = document.createElement('div');
        header.id = 'tw-header';
        header.innerHTML =
            '<div id="tw-header-brand">' +
                '<a href="../../index.html"><img src="../../logo.png" alt="AGP" onerror="this.style.display=\'none\'"></a>' +
            '</div>' +
            '<div id="tw-header-title">' + GAME_NAME + '</div>' +
            '<button id="tw-gear-btn" class="tw-header-icon-btn" title="إدارة المباراة" style="display:none;">⚙️</button>';
        document.body.appendChild(header);

        el('tw-gear-btn').addEventListener('click', openAdminPanel);
    }

    function showGearButton() {
        var btn = el('tw-gear-btn');
        if (btn) btn.style.display = 'flex';
    }

    /* ======================================================================
     *  3) الصندوق العام (إعدادات/اتصال)
     * ==================================================================== */
    function ensureOverlay() {
        if (_overlayEl) return _overlayEl;
        _overlayEl = document.createElement('div');
        _overlayEl.id = 'tw-overlay';
        _overlayEl.innerHTML = '<div id="tw-box"></div>';
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
        showOverlay();
        var box = el('tw-box');

        var teamSizePills = TEAM_SIZE_OPTIONS.map(function (v) {
            var active = (_settings.maxTeamSize === v) ? ' tw-pill-active' : '';
            return '<button type="button" class="tw-pill-btn tw-teamsize-pill' + active + '" data-value="' + v + '">' + v + ' ضد ' + v + '</button>';
        }).join('');

        var pointsPills = STARTING_POINTS_OPTIONS.map(function (v) {
            var active = (_settings.startingPoints === v) ? ' tw-pill-active' : '';
            return '<button type="button" class="tw-pill-btn tw-points-pill' + active + '" data-value="' + v + '">' + v + '</button>';
        }).join('');

        var timerPills = TIMER_OPTIONS.map(function (v) {
            var active = (_settings.selectionTimerSeconds === v) ? ' tw-pill-active' : '';
            return '<button type="button" class="tw-pill-btn tw-timer-pill' + active + '" data-value="' + v + '">' + v + ' ث</button>';
        }).join('') +
        '<button type="button" class="tw-pill-btn tw-timer-pill' + (_settings.selectionTimerSeconds === 0 ? ' tw-pill-active' : '') + '" data-value="0">إيقاف</button>';

        box.innerHTML =
            '<h2>إعدادات مباراة حرب الفريقين</h2>' +

            '<div class="tw-row-field" style="margin-bottom:16px;">' +
                '<input type="text" id="tw-input-username" placeholder="" value="' + escapeAttr(_settings.tiktokUsername) + '">' +
                '<label>اكتب يوزر بث التيك توك</label>' +
            '</div>' +

            '<div class="tw-section-header">الكلمة المفتاحية لكل فريق</div>' +

            '<div class="tw-two-col">' +
                '<div class="tw-team-box tw-team-red">' +
                    '<input type="text" class="tw-team-name-input" id="tw-input-redName" value="' + escapeAttr(_settings.teamRedName) + '">' +
                    '<input type="text" class="tw-keyword-input" id="tw-input-redKeyword" placeholder="هنا الكلمة المفتاحية للفريق ذا" value="' + escapeAttr(_settings.teamRedKeyword) + '">' +
                '</div>' +
                '<div class="tw-team-box tw-team-blue">' +
                    '<input type="text" class="tw-team-name-input" id="tw-input-blueName" value="' + escapeAttr(_settings.teamBlueName) + '">' +
                    '<input type="text" class="tw-keyword-input" id="tw-input-blueKeyword" placeholder="هنا الكلمة المفتاحية للفريق ذا" value="' + escapeAttr(_settings.teamBlueKeyword) + '">' +
                '</div>' +
            '</div>' +

            '<div class="tw-field-label-center">أقصى حد لكل فريق: اختار كم عدد لاعبين الفرق</div>' +
            '<div class="tw-pill-group" id="tw-teamsize-group" style="margin-bottom:18px;">' + teamSizePills + '</div>' +

            '<div class="tw-field-label-center">عدد نقاط البداية لكل فريق</div>' +
            '<div class="tw-pill-group" id="tw-points-group" style="margin-bottom:18px;">' + pointsPills + '</div>' +

            '<div class="tw-field-label-center">مؤقت اختيار المربع</div>' +
            '<div class="tw-pill-group" id="tw-timer-group" style="margin-bottom:6px;">' + timerPills + '</div>' +
            '<div class="tw-hint">إذا انتهى الوقت، ينتقل الدور تلقائياً للاعب التالي.</div>' +

            '<div id="tw-settings-error" class="tw-error-msg" style="display:none;"></div>' +

            '<button type="button" id="tw-connect-btn" class="tw-btn-connect">اتصل بالبث و انتقل للوبي</button>';

        wireSettingsHandlers();
    }

    function wireSettingsHandlers() {
        el('tw-input-username').addEventListener('input', function (e) { _settings.tiktokUsername = e.target.value; });
        el('tw-input-redName').addEventListener('input', function (e) { _settings.teamRedName = e.target.value; });
        el('tw-input-blueName').addEventListener('input', function (e) { _settings.teamBlueName = e.target.value; });
        el('tw-input-redKeyword').addEventListener('input', function (e) { _settings.teamRedKeyword = e.target.value; });
        el('tw-input-blueKeyword').addEventListener('input', function (e) { _settings.teamBlueKeyword = e.target.value; });

        el('tw-teamsize-group').addEventListener('click', function (e) {
            var btn = e.target.closest('.tw-pill-btn'); if (!btn) return;
            _settings.maxTeamSize = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });
        el('tw-points-group').addEventListener('click', function (e) {
            var btn = e.target.closest('.tw-pill-btn'); if (!btn) return;
            _settings.startingPoints = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });
        el('tw-timer-group').addEventListener('click', function (e) {
            var btn = e.target.closest('.tw-pill-btn'); if (!btn) return;
            _settings.selectionTimerSeconds = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });

        el('tw-connect-btn').addEventListener('click', handleConnectClick);
    }

    function showSettingsError(msg) {
        var errEl = el('tw-settings-error');
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.style.display = 'block';
    }

    function handleConnectClick() {
        var username = (_settings.tiktokUsername || '').trim();
        var kwBlue = normalizeArabicText(_settings.teamBlueKeyword);
        var kwRed = normalizeArabicText(_settings.teamRedKeyword);

        if (!username) return showSettingsError('لازم تكتب يوزر البث أول.');
        if (!kwBlue || !kwRed) return showSettingsError('لازم تحدد كلمة مفتاحية لكل فريق.');
        if (kwBlue === kwRed) return showSettingsError('الكلمتان المفتاحيتان لازم تكونان مختلفتين عن بعض.');

        AGP.streamConnector.connect('tiktok', { username: username });
    }

    function renderConnectingScreen(message) {
        _screen = 'connecting';
        showOverlay();
        el('tw-box').innerHTML =
            '<h2>' + GAME_NAME + '</h2>' +
            '<div class="tw-connecting-box">' +
                '<div class="tw-spinner"></div>' +
                '<div>' + (message || 'جارِ الاتصال بالبث...') + '</div>' +
            '</div>';
    }

    /* ======================================================================
     *  5) اللوبي
     * ==================================================================== */
    function getTeamPlayers(team) {
        return AGP.player.getAllPlayers().filter(function (p) { return p.team === team; });
    }

    function ensureLobbyEl() {
        if (_lobbyEl) return _lobbyEl;
        _lobbyEl = document.createElement('div');
        _lobbyEl.id = 'tw-lobby-screen';
        document.body.appendChild(_lobbyEl);
        return _lobbyEl;
    }

    function renderLobbyScreen() {
        _screen = 'lobby';
        _registrationOpen = true;
        hideOverlay();
        showGearButton();
        if (AGP.lobby && typeof AGP.lobby.open === 'function') AGP.lobby.open();
        wireCommentListenerForJoining();

        var root = ensureLobbyEl();
        root.style.display = 'block';
        root.innerHTML =
            '<div class="tw-lobby-banner">عشان تدخل لعبة حرب الفريقين اكتب بشات البث كلمة الدخول</div>' +
            '<div class="tw-lobby-headers">' +
                '<div class="tw-team-header-box tw-team-red"><div class="tw-team-header-name" id="tw-lh-red-name"></div><div class="tw-team-header-keyword" id="tw-lh-red-kw"></div></div>' +
                '<div class="tw-team-header-box tw-team-blue"><div class="tw-team-header-name" id="tw-lh-blue-name"></div><div class="tw-team-header-keyword" id="tw-lh-blue-kw"></div></div>' +
            '</div>' +
            '<div class="tw-lobby-panels">' +
                '<div class="tw-lobby-team-panel tw-team-red"><div class="tw-lobby-count" id="tw-lobby-count-red"></div><div class="tw-player-grid" id="tw-lobby-grid-red"></div></div>' +
                '<div class="tw-vs-label">VS</div>' +
                '<div class="tw-lobby-team-panel tw-team-blue"><div class="tw-lobby-count" id="tw-lobby-count-blue"></div><div class="tw-player-grid" id="tw-lobby-grid-blue"></div></div>' +
            '</div>' +
            '<div class="tw-start-round-wrap"><button type="button" id="tw-start-round-btn" class="tw-btn-start-round">بدء الجولة</button></div>';

        el('tw-lh-red-name').textContent = _settings.teamRedName;
        el('tw-lh-red-kw').textContent = 'الكلمة: ' + _settings.teamRedKeyword;
        el('tw-lh-blue-name').textContent = _settings.teamBlueName;
        el('tw-lh-blue-kw').textContent = 'الكلمة: ' + _settings.teamBlueKeyword;

        el('tw-start-round-btn').addEventListener('click', handleStartRound);

        renderLobbyPlayerGrids();
    }

    function playerCardHtml(p) {
        var avatar = p.avatarUrl ? escapeAttr(p.avatarUrl) : '';
        return '<div class="tw-player-card">' +
            '<div class="tw-player-card-name">' + escapeHtml(p.name || p.id) + '</div>' +
            (avatar ? '<img class="tw-player-card-avatar" src="' + avatar + '">' : '<div class="tw-player-card-avatar"></div>') +
        '</div>';
    }

    function renderLobbyPlayerGrids() {
        var gridRed = el('tw-lobby-grid-red');
        var gridBlue = el('tw-lobby-grid-blue');
        if (!gridRed || !gridBlue) return;

        var playersRed = getTeamPlayers(TEAM_RED);
        var playersBlue = getTeamPlayers(TEAM_BLUE);

        el('tw-lobby-count-red').textContent = playersRed.length + ' / ' + _settings.maxTeamSize;
        el('tw-lobby-count-blue').textContent = playersBlue.length + ' / ' + _settings.maxTeamSize;

        gridRed.innerHTML = playersRed.map(playerCardHtml).join('') || '<div class="tw-lobby-empty-slot"></div>';
        gridBlue.innerHTML = playersBlue.map(playerCardHtml).join('') || '<div class="tw-lobby-empty-slot"></div>';

        var startBtn = el('tw-start-round-btn');
        if (startBtn) startBtn.disabled = !(playersRed.length && playersBlue.length);
    }

    function wireCommentListenerForJoining() {
        if (_commentUnsub) return;
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_registrationOpen || !payload || typeof payload.text !== 'string' || !payload.id) return;
            if (AGP.player.hasPlayer(payload.id)) return;

            var text = normalizeArabicText(payload.text);
            var kwBlue = normalizeArabicText(_settings.teamBlueKeyword);
            var kwRed = normalizeArabicText(_settings.teamRedKeyword);
            var team = null;
            if (text === kwBlue) team = TEAM_BLUE;
            else if (text === kwRed) team = TEAM_RED;
            if (!team) return;

            if (getTeamPlayers(team).length >= _settings.maxTeamSize) return; // الفريق مكتمل

            AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, team: team });
        });
    }

    /* ======================================================================
     *  6) بدء الجولة
     * ==================================================================== */
    function handleStartRound() {
        var playersRed = getTeamPlayers(TEAM_RED);
        var playersBlue = getTeamPlayers(TEAM_BLUE);
        if (!playersRed.length || !playersBlue.length) return;

        _registrationOpen = false;
        if (AGP.lobby && typeof AGP.lobby.close === 'function') AGP.lobby.close();

        startFreshMatch();
    }

    function startFreshMatch() {
        AGP.scoreManager.reset();
        AGP.scoreManager.setScore(SCORE_KEY_BLUE, _settings.startingPoints);
        AGP.scoreManager.setScore(SCORE_KEY_RED, _settings.startingPoints);

        buildTiles();
        buildTurnQueue();
        _matchActive = true;

        AGP.events.emit('game:roundStarted', { gameId: GAME_ID });

        if (_lobbyEl) _lobbyEl.style.display = 'none';
        hideOverlay();
        renderMatchScreen();
        wireTurnCommentListener();
        startSelectionTimer();
    }

    /* ======================================================================
     *  7) شاشة اللعب -- الشبكة، الأدوار، كشف البطاقة (تصميم خاص)
     * ==================================================================== */
    function buildTiles() {
        _tiles = [];
        for (var i = 1; i <= GRID_TOTAL; i++) _tiles.push({ num: i, used: false });
    }

    function buildTurnQueue() {
        var playersRed = getTeamPlayers(TEAM_RED);
        var playersBlue = getTeamPlayers(TEAM_BLUE);
        var maxLen = Math.max(playersRed.length, playersBlue.length);
        _turnQueue = [];
        for (var i = 0; i < maxLen; i++) {
            if (playersBlue[i]) _turnQueue.push({ id: playersBlue[i].id, team: TEAM_BLUE });
            if (playersRed[i]) _turnQueue.push({ id: playersRed[i].id, team: TEAM_RED });
        }
        _turnPointer = 0;
    }

    function currentTurnEntry() {
        if (!_turnQueue.length) return null;
        return _turnQueue[_turnPointer % _turnQueue.length];
    }

    function currentTurnPlayer() {
        var entry = currentTurnEntry();
        if (!entry) return null;
        var players = AGP.player.getAllPlayers();
        for (var i = 0; i < players.length; i++) {
            if (players[i].id === entry.id) return players[i];
        }
        return null;
    }

    function advanceTurn() {
        if (!_turnQueue.length) return;
        _turnPointer = (_turnPointer + 1) % _turnQueue.length;
    }

    function removeFromTurnQueue(playerId) {
        var currentEntry = currentTurnEntry();
        var wasCurrentPlayer = currentEntry && currentEntry.id === playerId;
        _turnQueue = _turnQueue.filter(function (e) { return e.id !== playerId; });
        if (!_turnQueue.length) { _turnPointer = 0; return; }
        _turnPointer = _turnPointer % _turnQueue.length;
        if (wasCurrentPlayer) { renderTurnIndicator(); startSelectionTimer(); }
    }

    function ensureMatchEl() {
        if (_matchEl) return _matchEl;
        _matchEl = document.createElement('div');
        _matchEl.id = 'tw-match-screen';
        document.body.appendChild(_matchEl);
        return _matchEl;
    }

    function renderMatchScreen() {
        _screen = 'match';
        var root = ensureMatchEl();
        root.style.display = 'block';

        var tilesHtml = _tiles.map(function (t) {
            return '<div class="tw-tile' + (t.used ? ' tw-tile-used' : '') + '" data-num="' + t.num + '">' + t.num + '</div>';
        }).join('');

        root.innerHTML =
            '<div class="tw-scoreboard">' +
                '<div class="tw-team-panel tw-team-red"><div class="tw-team-panel-name">' + escapeHtml(_settings.teamRedName) + '</div><div class="tw-score-val" id="tw-score-red"></div></div>' +
                '<div class="tw-vs-label">VS</div>' +
                '<div class="tw-team-panel tw-team-blue"><div class="tw-team-panel-name">' + escapeHtml(_settings.teamBlueName) + '</div><div class="tw-score-val" id="tw-score-blue"></div></div>' +
            '</div>' +
            '<div class="tw-turn-indicator" id="tw-turn-indicator"></div>' +
            '<div class="tw-grid">' + tilesHtml + '</div>';

        updateScoreDisplays();
        renderTurnIndicator();
        AGP.events.on('score:changed', updateScoreDisplays);
    }

    function updateScoreDisplays() {
        var r = el('tw-score-red'); var b = el('tw-score-blue');
        if (r) r.textContent = AGP.scoreManager.getScore(SCORE_KEY_RED);
        if (b) b.textContent = AGP.scoreManager.getScore(SCORE_KEY_BLUE);
    }

    function renderTurnIndicator() {
        var indicator = el('tw-turn-indicator');
        if (!indicator) return;
        var player = currentTurnPlayer();
        var entry = currentTurnEntry();
        if (!player || !entry) { indicator.textContent = 'لا يوجد لاعبون نشطون.'; return; }
        var avatar = player.avatarUrl ? '<img class="tw-turn-avatar" src="' + escapeAttr(player.avatarUrl) + '">' : '';
        indicator.innerHTML = 'الدور الآن: ' + avatar + '<b>' + escapeHtml(player.name || player.id) + '</b>' +
            ' (' + (entry.team === TEAM_BLUE ? escapeHtml(_settings.teamBlueName) : escapeHtml(_settings.teamRedName)) + ')' +
            ' -- اكتب رقم المربع بالشات' +
            '<span class="tw-turn-timer" id="tw-turn-timer-val"></span>';
    }

    function startSelectionTimer() {
        if (!_matchActive || !_settings.selectionTimerSeconds) return;
        AGP.timerManager.stop(SELECTION_TIMER_NAME);
        AGP.timerManager.start(SELECTION_TIMER_NAME, _settings.selectionTimerSeconds);
    }

    function wireTurnCommentListener() {
        if (_turnCommentUnsub) return;
        _turnCommentUnsub = AGP.events.on('stream:commentReceived', handleTurnComment);

        AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== SELECTION_TIMER_NAME) return;
            var t = el('tw-turn-timer-val');
            if (t) t.textContent = ' | ' + payload.remainingSeconds + 'ث';
        });
        AGP.events.on('timer:ended', function (payload) {
            if (payload.name !== SELECTION_TIMER_NAME || !_matchActive) return;
            advanceTurn();
            renderTurnIndicator();
            startSelectionTimer();
        });
    }

    function handleTurnComment(payload) {
        if (!_matchActive || !payload || typeof payload.text !== 'string' || !payload.id) return;
        var entry = currentTurnEntry();
        if (!entry || entry.id !== payload.id) return;

        var num = extractTileNumber(payload.text);
        if (num === null) return;
        var tile = _tiles[num - 1];
        if (!tile || tile.used) return;

        tile.used = true;
        AGP.timerManager.stop(SELECTION_TIMER_NAME);
        revealCard(entry, tile);
    }

    function revealCard(entry, tile) {
        var emoji = CARD_EMOJI_BANK[Math.floor(Math.random() * CARD_EMOJI_BANK.length)];
        var isPositive = Math.random() < 0.7;
        var magnitude = 5 + Math.floor(Math.random() * 46); // 5..50
        var value = isPositive ? magnitude : -magnitude;

        var tileEl = el('tw-match-screen').querySelector('.tw-tile[data-num="' + tile.num + '"]');
        if (tileEl) tileEl.classList.add('tw-tile-used');

        var overlay = document.createElement('div');
        overlay.className = 'tw-card-reveal-overlay';
        var opponentTeam = entry.team === TEAM_BLUE ? TEAM_RED : TEAM_BLUE;
        var effectText = isPositive
            ? 'خصم ' + magnitude + ' نقطة من ' + (opponentTeam === TEAM_BLUE ? _settings.teamBlueName : _settings.teamRedName)
            : 'خصم ' + magnitude + ' نقطة من فريقه نفسه';

        overlay.innerHTML =
            '<div class="tw-card-reveal-box">' +
                '<div class="tw-card-emoji">' + emoji + '</div>' +
                '<div class="tw-card-value ' + (isPositive ? 'tw-value-positive' : 'tw-value-negative') + '">' + (isPositive ? '+' : '') + value + '</div>' +
                '<div class="tw-card-effect-text">' + escapeHtml(effectText) + '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        setTimeout(function () {
            var targetScoreKey = isPositive
                ? (opponentTeam === TEAM_BLUE ? SCORE_KEY_BLUE : SCORE_KEY_RED)
                : (entry.team === TEAM_BLUE ? SCORE_KEY_BLUE : SCORE_KEY_RED);
            AGP.scoreManager.addPoints(targetScoreKey, -magnitude);
            overlay.remove();
            checkForWinner();
            if (_matchActive) {
                advanceTurn();
                renderTurnIndicator();
                startSelectionTimer();
            }
        }, 2400);
    }

    function checkForWinner() {
        var scoreBlue = AGP.scoreManager.getScore(SCORE_KEY_BLUE);
        var scoreRed = AGP.scoreManager.getScore(SCORE_KEY_RED);
        if (scoreBlue > 0 && scoreRed > 0) return;

        _matchActive = false;
        AGP.timerManager.stop(SELECTION_TIMER_NAME);
        var winningTeam = scoreBlue <= 0 ? TEAM_RED : TEAM_BLUE;
        renderWinnerScreen(winningTeam);
    }

    /* ======================================================================
     *  8) لوحة إدارة المباراة (زر ⚙️) -- صندوق عائم ينزلق من الجهة
     * ==================================================================== */
    function ensureAdminPanelEl() {
        if (_adminPanelEl) return _adminPanelEl;
        _adminPanelEl = document.createElement('div');
        _adminPanelEl.id = 'tw-admin-panel';
        document.body.appendChild(_adminPanelEl);
        return _adminPanelEl;
    }

    function openAdminPanel() {
        var panel = ensureAdminPanelEl();
        renderAdminPanelContent();
        _adminPanelOpen = true;
        requestAnimationFrame(function () { panel.classList.add('tw-panel-open'); });
    }

    function closeAdminPanel() {
        if (!_adminPanelEl) return;
        _adminPanelEl.classList.remove('tw-panel-open');
        _adminPanelOpen = false;
        closeSubLobby();
    }

    function renderAdminPanelContent() {
        var panel = _adminPanelEl;
        var playersRed = getTeamPlayers(TEAM_RED);
        var playersBlue = getTeamPlayers(TEAM_BLUE);
        var blueHasVacancy = playersBlue.length < _settings.maxTeamSize;
        var redHasVacancy = playersRed.length < _settings.maxTeamSize;

        panel.innerHTML =
            '<button type="button" class="tw-admin-close-btn" id="tw-admin-close-x">✕</button>' +
            '<div class="tw-admin-body">' +
                '<div class="tw-admin-buttons">' +
                    '<button type="button" class="tw-admin-btn tw-btn-team-blue" id="tw-admin-add-blue" ' + (blueHasVacancy ? '' : 'disabled') + '>إدخال لاعب جديد لهذا الفريق</button>' +
                    '<button type="button" class="tw-admin-btn tw-btn-end-match" id="tw-admin-end-match">إنهاء المباراة و العودة للمنصة</button>' +
                    '<button type="button" class="tw-admin-btn tw-btn-team-red" id="tw-admin-add-red" ' + (redHasVacancy ? '' : 'disabled') + '>إدخال لاعب جديد لهذا الفريق</button>' +
                '</div>' +
                '<div class="tw-admin-lists">' +
                    '<div class="tw-admin-team-list tw-team-blue"><div class="tw-admin-team-list-title">اللاعبين المسجّلين -- ' + escapeHtml(_settings.teamBlueName) + '</div><div class="tw-admin-team-list-body" id="tw-admin-list-blue"></div></div>' +
                    '<div class="tw-admin-team-list tw-team-red"><div class="tw-admin-team-list-title">اللاعبين المسجّلين -- ' + escapeHtml(_settings.teamRedName) + '</div><div class="tw-admin-team-list-body" id="tw-admin-list-red"></div></div>' +
                '</div>' +
            '</div>';

        renderAdminLists();

        el('tw-admin-close-x').addEventListener('click', closeAdminPanel);
        el('tw-admin-end-match').addEventListener('click', handleEndMatch);
        el('tw-admin-add-blue').addEventListener('click', function () { openSubLobby(TEAM_BLUE); });
        el('tw-admin-add-red').addEventListener('click', function () { openSubLobby(TEAM_RED); });
    }

    function adminRowHtml(p) {
        var avatar = p.avatarUrl ? escapeAttr(p.avatarUrl) : '';
        return '<div class="tw-admin-player-row">' +
            '<button type="button" class="tw-admin-remove-x" data-id="' + escapeAttr(p.id) + '">✕</button>' +
            (avatar ? '<img class="tw-player-card-avatar" src="' + avatar + '">' : '<div class="tw-player-card-avatar"></div>') +
            '<div class="tw-player-card-name">' + escapeHtml(p.name || p.id) + '</div>' +
        '</div>';
    }

    function renderAdminLists() {
        var listBlue = el('tw-admin-list-blue');
        var listRed = el('tw-admin-list-red');
        if (!listBlue || !listRed) return;

        var playersBlue = getTeamPlayers(TEAM_BLUE);
        var playersRed = getTeamPlayers(TEAM_RED);

        listBlue.innerHTML = playersBlue.length ? playersBlue.map(adminRowHtml).join('') : '<div class="tw-admin-empty">لا يوجد لاعبون</div>';
        listRed.innerHTML = playersRed.length ? playersRed.map(adminRowHtml).join('') : '<div class="tw-admin-empty">لا يوجد لاعبون</div>';

        panelQuerySelectorAll('.tw-admin-remove-x').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-id');
                AGP.player.removePlayer(id);
                if (_matchActive) removeFromTurnQueue(id);
                renderAdminPanelContent();
                if (_screen === 'lobby') renderLobbyPlayerGrids();
            });
        });
    }

    function panelQuerySelectorAll(sel) {
        return _adminPanelEl ? Array.prototype.slice.call(_adminPanelEl.querySelectorAll(sel)) : [];
    }

    function handleEndMatch() {
        _matchActive = false;
        AGP.timerManager.stop(SELECTION_TIMER_NAME);
        if (_turnCommentUnsub) { _turnCommentUnsub(); _turnCommentUnsub = null; }
        window.location.href = '../../index.html';
    }

    /* ======================================================================
     *  9) اللوبي الفرعي (إضافة لاعب لمقعد فاضي وسط المباراة)
     * ==================================================================== */
    function ensureSubLobbyEl() {
        if (_subLobbyEl) return _subLobbyEl;
        _subLobbyEl = document.createElement('div');
        _subLobbyEl.id = 'tw-sub-lobby-overlay';
        document.body.appendChild(_subLobbyEl);
        return _subLobbyEl;
    }

    function openSubLobby(team) {
        _subLobbyTeam = team;
        _subLobbyCandidate = null;
        var overlay = ensureSubLobbyEl();
        var teamName = team === TEAM_BLUE ? _settings.teamBlueName : _settings.teamRedName;
        var keyword = team === TEAM_BLUE ? _settings.teamBlueKeyword : _settings.teamRedKeyword;

        overlay.innerHTML =
            '<div id="tw-sub-lobby-box">' +
                '<button type="button" class="tw-sub-lobby-close" id="tw-sub-lobby-close-x">✕</button>' +
                '<div class="tw-sub-lobby-text">دخول لاعب جديد لفريق "' + escapeHtml(teamName) + '" -- الكلمة: "' + escapeHtml(keyword) + '"</div>' +
                '<div class="tw-sub-lobby-candidate" id="tw-sub-lobby-candidate"><div class="tw-sub-lobby-waiting">بانتظار تعليق بالكلمة المفتاحية...</div></div>' +
                '<button type="button" class="tw-sub-lobby-btn" id="tw-sub-lobby-confirm-btn" disabled>إدخال اللاعب</button>' +
            '</div>';

        requestAnimationFrame(function () { overlay.classList.add('tw-sub-open'); });

        el('tw-sub-lobby-close-x').addEventListener('click', closeSubLobby);
        el('tw-sub-lobby-confirm-btn').addEventListener('click', confirmSubLobbyPlayer);

        if (_subLobbyUnsub) _subLobbyUnsub();
        _subLobbyUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!payload || typeof payload.text !== 'string' || !payload.id) return;
            if (AGP.player.hasPlayer(payload.id)) return;
            var text = normalizeArabicText(payload.text);
            if (text !== normalizeArabicText(keyword)) return;

            _subLobbyCandidate = { id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null };
            var candBox = el('tw-sub-lobby-candidate');
            if (candBox) candBox.innerHTML = '<div class="tw-player-grid" style="max-width:260px;margin:0 auto;">' + playerCardHtml(_subLobbyCandidate) + '</div>';
            var confirmBtn = el('tw-sub-lobby-confirm-btn');
            if (confirmBtn) confirmBtn.disabled = false;
        });
    }

    function confirmSubLobbyPlayer() {
        if (!_subLobbyCandidate || !_subLobbyTeam) return;
        AGP.player.addPlayer({ id: _subLobbyCandidate.id, name: _subLobbyCandidate.name, avatarUrl: _subLobbyCandidate.avatarUrl, team: _subLobbyTeam });

        if (_matchActive) {
            _turnQueue.push({ id: _subLobbyCandidate.id, team: _subLobbyTeam });
        }

        closeSubLobby();
        renderAdminPanelContent();
    }

    function closeSubLobby() {
        if (_subLobbyUnsub) { _subLobbyUnsub(); _subLobbyUnsub = null; }
        if (!_subLobbyEl) return;
        _subLobbyEl.classList.remove('tw-sub-open');
        _subLobbyTeam = null;
        _subLobbyCandidate = null;
    }

    /* ======================================================================
     *  10) شاشة الفوز
     * ==================================================================== */
    function ensureWinnerEl() {
        if (_winnerEl) return _winnerEl;
        _winnerEl = document.createElement('div');
        _winnerEl.id = 'tw-winner-screen';
        document.body.appendChild(_winnerEl);
        return _winnerEl;
    }

    function renderWinnerScreen(winningTeam) {
        _screen = 'winner';
        if (_adminPanelEl) closeAdminPanel();
        if (_matchEl) _matchEl.style.display = 'none';

        var root = ensureWinnerEl();
        root.style.display = 'flex';

        var teamName = winningTeam === TEAM_BLUE ? _settings.teamBlueName : _settings.teamRedName;
        var winners = getTeamPlayers(winningTeam);
        var count = winners.length || 1;
        var cardScale = count <= 2 ? 1.5 : (count <= 4 ? 1.2 : 1);

        var cardsHtml = winners.map(function (p) {
            var avatar = p.avatarUrl ? escapeAttr(p.avatarUrl) : '';
            return '<div class="tw-winner-card" style="transform:scale(' + cardScale + ');">' +
                '<img class="tw-winner-card-crown" src="images/crown.webp" alt="">' +
                '<div class="tw-winner-card-body">' +
                    (avatar ? '<img class="tw-winner-card-avatar" src="' + avatar + '">' : '<div class="tw-winner-card-avatar"></div>') +
                    '<div class="tw-winner-card-name">' + escapeHtml(p.name || p.id) + '</div>' +
                    '<div class="tw-winner-card-points-label">النقاط</div>' +
                    '<div class="tw-winner-card-points-val">' + AGP.scoreManager.getScore(winningTeam === TEAM_BLUE ? SCORE_KEY_BLUE : SCORE_KEY_RED) + '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        root.innerHTML =
            '<div id="tw-winner-box">' +
                '<img class="tw-winner-crown-big" src="images/crown.webp" alt="">' +
                '<div class="tw-winner-title">' + escapeHtml(teamName) + ' -- الفريق الأسطوري الي فاز في المباراة هذي</div>' +
                '<div class="tw-winner-cards">' + cardsHtml + '</div>' +
                '<div class="tw-winner-buttons">' +
                    '<button type="button" class="tw-winner-btn tw-btn-restart" id="tw-winner-restart">إعادة مباراة بنفس اللاعبين</button>' +
                    '<button type="button" class="tw-winner-btn tw-btn-end" id="tw-winner-end">إنهاء و العودة للمنصة</button>' +
                    '<button type="button" class="tw-winner-btn tw-btn-newmatch" id="tw-winner-newmatch">بدء مباراة جديدة (بلاعبين جدد)</button>' +
                '</div>' +
            '</div>';

        el('tw-winner-restart').addEventListener('click', handleRestartSamePlayers);
        el('tw-winner-end').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('tw-winner-newmatch').addEventListener('click', handleNewMatchNewPlayers);
    }

    function handleRestartSamePlayers() {
        _winnerEl.style.display = 'none';
        if (_matchEl) _matchEl.style.display = 'block';
        startFreshMatch();
    }

    function handleNewMatchNewPlayers() {
        var allPlayers = AGP.player.getAllPlayers().slice();
        allPlayers.forEach(function (p) { AGP.player.removePlayer(p.id); });

        _winnerEl.style.display = 'none';
        if (_matchEl) { _matchEl.remove(); _matchEl = null; }
        if (_lobbyEl) { _lobbyEl.remove(); _lobbyEl = null; }
        if (_turnCommentUnsub) { _turnCommentUnsub(); _turnCommentUnsub = null; }
        if (_commentUnsub) { _commentUnsub(); _commentUnsub = null; }

        renderSettingsScreen();
    }

    /* ======================================================================
     *  11) الاستماع لأحداث المنصة العامة + التسجيل
     * ==================================================================== */
    function wirePlatformListeners() {
        AGP.events.on('stream:statusChanged', function (payload) {
            if (payload.platform !== 'tiktok') return;
            if (payload.status === 'connecting') renderConnectingScreen('جارِ الاتصال بالبث...');
            else if (payload.status === 'connected' && _screen !== 'lobby' && _screen !== 'match' && _screen !== 'winner') renderLobbyScreen();
            else if (payload.status === 'error') { renderSettingsScreen(); showSettingsError('تعذّر الاتصال -- تحقّق من اليوزرنيم وحاول مرة أخرى.'); }
        });

        AGP.events.on('player:joined', function () {
            if (_screen === 'lobby') renderLobbyPlayerGrids();
            if (_adminPanelOpen) renderAdminLists();
        });
        AGP.events.on('player:removed', function () {
            if (_screen === 'lobby') renderLobbyPlayerGrids();
            if (_adminPanelOpen) renderAdminLists();
        });
    }

    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'team-games',
            onLoad: function () { AGP.log('Team War: onLoad.'); },
            onRoundEnd: function () { AGP.log('Team War: onRoundEnd.'); },
            onDestroy: function () { AGP.log('Team War: onDestroy.'); }
        });

        if (!registered) { AGP.log('Team War: registration failed (already registered?).'); return; }

        AGP.gameManager.loadGame(GAME_ID);

        injectHeader();
        wirePlatformListeners();
        renderSettingsScreen();
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
