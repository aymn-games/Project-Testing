/**
 * ==========================================================================
 *  AGP TEAM WAR -- "حرب الفرقين" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 *
 * لعبة أصلية (Native) بنفس نمط games/musical-chairs و games/fruit-roulette:
 * صفحتها الخاصة (games/team-war/index.html) تحمّل AGP Core كاملاً + هذا
 * الملف. لا تعديل على أي ملف موجود بالمشروع -- ملف Plugin مستقل تماماً.
 *
 * ⚠️ قرار معماري مهم: هذي اللعبة **لا تستخدم** js/agp-game-shell.js
 *   المشترك، لأنه مبني لفريق/كلمة مفتاحية واحدة فقط (راجع رأس الملف
 *   نفسه). حرب الفرقين تحتاج فريقين بكلمتين متزامنتين ولوبي بتبويبين --
 *   منطق خاص باللعبة تحديداً وليس مشتركاً بين عدة ألعاب، فبُني هنا حصراً
 *   حسب قاعدة docs/CLAUDE.md القسم 4. الملف الحالي **يعيد استخدام** كل
 *   خدمة عامة موجودة أصلاً بدون أي تعديل عليها:
 *     - AGP.player       (تسجيل/حذف لاعبين، بحقل team مخصّص لكل لاعب)
 *     - AGP.scoreManager (نقاط الفريقين، كـ"لاعبين" وهميين team:A/team:B)
 *     - AGP.timerManager (مؤقت اختيار المربع)
 *     - AGP.streamConnector + adapters/agp-tiktok-adapter.js (اتصال حي)
 *     - AGP.lobby        (فتح/إغلاق التسجيل، تزامن مع Round Manager)
 *     - AGP.gameManager  (تسجيل اللعبة بالمنصة)
 *
 * ⚠️ الدفعة الأولى (هذا الملف): شاشة الإعدادات + الاتصال + اللوبي بتبويبين
 *   + لوحة إدارة المشاركين. شاشة الشبكة/الأدوار/كشف البطاقة = الدفعة
 *   الثانية القادمة (مكانها محجوز بدالة renderMatchScreen أدناه بعلامة
 *   TODO واضحة، حتى لا يحتاج أي جزء من هذا الملف إعادة كتابة لاحقاً).
 *
 * الاعتماديات (بنفس ترتيب index.html القياسي الموثَّق بـdocs/CLAUDE.md):
 *   js/agp-core.js ... js/agp-bootstrap.js (AGP Core كامل)، ثم
 *   js/agp-player-card.js، ثم هذا الملف مباشرة (بدون agp-game-shell.js).
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
    // ⚠️ اسم مؤقت -- غيّره لأي اسم/هوية تفضّلها، سطر واحد فقط هنا. تم
    // تعمّد عدم استخدام اسم "SALMA WAR" لأنه علامة/هوية بصرية لمنصة ثانية.
    var GAME_NAME = 'حرب الفرقين';

    var TEAM_A = 'A';
    var TEAM_B = 'B';
    var SCORE_KEY_A = 'team-war:teamA';
    var SCORE_KEY_B = 'team-war:teamB';
    var SELECTION_TIMER_NAME = 'tw-selection-timer';

    var STARTING_POINTS_OPTIONS = [150, 200, 300];
    var TIMER_OPTIONS = [20, 25, 30]; // ثانية؛ 0 = إيقاف المؤقت

    /* ======================================================================
     *  0) الحالة الداخلية
     * ==================================================================== */
    var _screen = 'settings'; // settings | connecting | lobby | match
    var _overlayEl = null;
    var _matchEl = null;
    var _adminPanelOpen = false;
    var _activeLobbyTab = TEAM_A;
    var _registrationOpen = false;
    var _commentUnsub = null;
    var _playerJoinedUnsub = null;
    var _playerRemovedUnsub = null;

    var _settings = {
        tiktokUsername: '',
        teamAName: 'الفريق الأزرق',
        teamBName: 'الفريق الأحمر',
        teamAKeyword: '',
        teamBKeyword: '',
        startingPoints: 200,
        startingPointsCustom: null,
        usingCustomPoints: false,
        selectionTimerSeconds: 25
    };

    function el(id) { return document.getElementById(id); }

    /* ======================================================================
     *  1) تطبيع نص عربي (لمطابقة الكلمة المفتاحية بدون حساسية للتشكيل/
     *     اختلاف صور الألف والياء والتاء المربوطة) -- دالة محلية مستقلة،
     *     ما فيه أي أداة مشتركة بالمشروع تسوي هذا حالياً (راجع الاستكشاف).
     * ==================================================================== */
    function normalizeArabicText(text) {
        if (typeof text !== 'string') return '';
        return text
            .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // تشكيل + تطويل
            .replace(/[إأآا]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    /* ======================================================================
     *  2) الهيدر الثابت + زر الإعدادات (يشبه هيدر agp-game-shell.js بصرياً
     *     لكن منسوخ محلياً بمعرّفات tw- خاصة -- هذي اللعبة ما تحمّل الشل)
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
            '<button id="tw-gear-btn" class="tw-header-icon-btn" title="المشاركون والإعدادات" style="display:none;">⚙️</button>';
        document.body.appendChild(header);

        el('tw-gear-btn').addEventListener('click', toggleAdminPanel);
    }

    function showGearButton() {
        var btn = el('tw-gear-btn');
        if (btn) btn.style.display = 'flex';
    }

    /* ======================================================================
     *  3) الصندوق العام (إعدادات/اتصال/لوبي) -- overlay واحد يُعاد رسم
     *     محتواه حسب الشاشة الحالية.
     * ==================================================================== */
    function ensureOverlay() {
        if (_overlayEl) return _overlayEl;
        _overlayEl = document.createElement('div');
        _overlayEl.id = 'tw-overlay';
        _overlayEl.innerHTML = '<div id="tw-box"></div>';
        document.body.appendChild(_overlayEl);
        return _overlayEl;
    }

    function hideOverlay() {
        if (_overlayEl) _overlayEl.style.display = 'none';
    }

    function showOverlay() {
        ensureOverlay().style.display = 'flex';
    }

    /* ======================================================================
     *  4) شاشة الإعدادات
     * ==================================================================== */
    function renderSettingsScreen() {
        _screen = 'settings';
        showOverlay();
        var box = el('tw-box');

        var pointsPillsHtml = STARTING_POINTS_OPTIONS.map(function (v) {
            var active = (!_settings.usingCustomPoints && _settings.startingPoints === v) ? ' tw-pill-active' : '';
            return '<button type="button" class="tw-pill-btn tw-points-pill' + active + '" data-value="' + v + '">' + v + '</button>';
        }).join('') +
        '<button type="button" class="tw-pill-btn tw-points-pill-custom' + (_settings.usingCustomPoints ? ' tw-pill-active' : '') + '">أخرى</button>';

        var timerPillsHtml = TIMER_OPTIONS.map(function (v) {
            var active = (_settings.selectionTimerSeconds === v) ? ' tw-pill-active' : '';
            return '<button type="button" class="tw-pill-btn tw-timer-pill" data-value="' + v + '">' + v + ' ث</button>';
        }).join('') +
        '<button type="button" class="tw-pill-btn tw-timer-pill' + (_settings.selectionTimerSeconds === 0 ? ' tw-pill-active' : '') + '" data-value="0">إيقاف المؤقت</button>';

        box.innerHTML =
            '<h2>إعداد المباراة<span class="tw-title-badge">' + GAME_NAME + '</span></h2>' +

            '<div class="tw-field">' +
                '<label>يوزر البث (تيك توك)</label>' +
                '<input type="text" id="tw-input-username" placeholder="مثال: aymn.games" value="' + escapeAttr(_settings.tiktokUsername) + '">' +
            '</div>' +

            '<div class="tw-two-col">' +
                '<div class="tw-team-box tw-team-a">' +
                    '<div class="tw-field"><label>اسم الفريق الأول</label>' +
                        '<input type="text" id="tw-input-teamAName" value="' + escapeAttr(_settings.teamAName) + '"></div>' +
                    '<div class="tw-field"><label>الكلمة المفتاحية للانضمام</label>' +
                        '<input type="text" id="tw-input-teamAKeyword" placeholder="مثال: ازرق" value="' + escapeAttr(_settings.teamAKeyword) + '"></div>' +
                '</div>' +
                '<div class="tw-team-box tw-team-b">' +
                    '<div class="tw-field"><label>اسم الفريق الثاني</label>' +
                        '<input type="text" id="tw-input-teamBName" value="' + escapeAttr(_settings.teamBName) + '"></div>' +
                    '<div class="tw-field"><label>الكلمة المفتاحية للانضمام</label>' +
                        '<input type="text" id="tw-input-teamBKeyword" placeholder="مثال: احمر" value="' + escapeAttr(_settings.teamBKeyword) + '"></div>' +
                '</div>' +
            '</div>' +

            '<div class="tw-field">' +
                '<label>النقاط المبدئية لكل فريق</label>' +
                '<div class="tw-pill-group" id="tw-points-group">' + pointsPillsHtml + '</div>' +
                (_settings.usingCustomPoints ?
                    '<input type="number" id="tw-input-customPoints" placeholder="اكتب رقم النقاط" style="margin-top:8px;" min="1" value="' + (_settings.startingPointsCustom || '') + '">'
                    : '') +
            '</div>' +

            '<div class="tw-field">' +
                '<label>مؤقت اختيار المربع</label>' +
                '<div class="tw-pill-group" id="tw-timer-group">' + timerPillsHtml + '</div>' +
                '<div class="tw-hint">إذا انتهى الوقت، ينتقل الدور تلقائياً للاعب التالي.</div>' +
            '</div>' +

            '<div id="tw-settings-error" class="tw-error-msg" style="display:none;"></div>' +

            '<button type="button" id="tw-connect-btn" class="tw-btn-primary">بدء الاتصال</button>';

        wireSettingsHandlers();
    }

    function escapeAttr(s) {
        return String(s == null ? '' : s).replace(/"/g, '&quot;');
    }

    function wireSettingsHandlers() {
        el('tw-input-username').addEventListener('input', function (e) { _settings.tiktokUsername = e.target.value; });
        el('tw-input-teamAName').addEventListener('input', function (e) { _settings.teamAName = e.target.value; });
        el('tw-input-teamBName').addEventListener('input', function (e) { _settings.teamBName = e.target.value; });
        el('tw-input-teamAKeyword').addEventListener('input', function (e) { _settings.teamAKeyword = e.target.value; });
        el('tw-input-teamBKeyword').addEventListener('input', function (e) { _settings.teamBKeyword = e.target.value; });

        el('tw-points-group').addEventListener('click', function (e) {
            var btn = e.target.closest('.tw-pill-btn');
            if (!btn) return;
            if (btn.classList.contains('tw-points-pill-custom')) {
                _settings.usingCustomPoints = true;
            } else {
                _settings.usingCustomPoints = false;
                _settings.startingPoints = parseInt(btn.getAttribute('data-value'), 10);
            }
            renderSettingsScreen();
        });

        var customPointsInput = el('tw-input-customPoints');
        if (customPointsInput) {
            customPointsInput.addEventListener('input', function (e) {
                _settings.startingPointsCustom = parseInt(e.target.value, 10) || null;
            });
        }

        el('tw-timer-group').addEventListener('click', function (e) {
            var btn = e.target.closest('.tw-pill-btn');
            if (!btn) return;
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
        var kwA = normalizeArabicText(_settings.teamAKeyword);
        var kwB = normalizeArabicText(_settings.teamBKeyword);

        if (!username) return showSettingsError('لازم تكتب يوزر البث أول.');
        if (!kwA || !kwB) return showSettingsError('لازم تحدد كلمة مفتاحية لكل فريق.');
        if (kwA === kwB) return showSettingsError('الكلمتان المفتاحيتان لازم تكونان مختلفتين عن بعض.');
        if (_settings.usingCustomPoints && !_settings.startingPointsCustom) return showSettingsError('اكتب عدد نقاط صحيح بخانة "أخرى".');

        AGP.streamConnector.connect('tiktok', { username: username });
    }

    /* ======================================================================
     *  5) شاشة الاتصال
     * ==================================================================== */
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
     *  6) اللوبي (تبويبان حيّان)
     * ==================================================================== */
    function finalStartingPoints() {
        return _settings.usingCustomPoints ? (_settings.startingPointsCustom || 200) : _settings.startingPoints;
    }

    function getTeamPlayers(team) {
        return AGP.player.getAllPlayers().filter(function (p) { return p.team === team; });
    }

    function renderLobbyScreen() {
        _screen = 'lobby';
        _registrationOpen = true;
        showOverlay();
        showGearButton();
        if (AGP.lobby && typeof AGP.lobby.open === 'function') AGP.lobby.open();
        wireCommentListenerForJoining();

        var box = el('tw-box');
        box.innerHTML =
            '<h2>لوبي المباراة</h2>' +
            '<div class="tw-keyword-hint">علّق بكلمة <b>' + escapeHtml(_settings.teamAKeyword) + '</b> للانضمام لـ' + escapeHtml(_settings.teamAName) +
                '، أو <b>' + escapeHtml(_settings.teamBKeyword) + '</b> للانضمام لـ' + escapeHtml(_settings.teamBName) + '</div>' +
            '<div class="tw-lobby-tabs">' +
                '<div class="tw-lobby-tab tw-tab-a' + (_activeLobbyTab === TEAM_A ? ' tw-tab-active' : '') + '" data-team="' + TEAM_A + '">' + escapeHtml(_settings.teamAName) + '</div>' +
                '<div class="tw-lobby-tab tw-tab-b' + (_activeLobbyTab === TEAM_B ? ' tw-tab-active' : '') + '" data-team="' + TEAM_B + '">' + escapeHtml(_settings.teamBName) + '</div>' +
            '</div>' +
            '<div id="tw-lobby-panel-a" class="tw-lobby-panel' + (_activeLobbyTab === TEAM_A ? ' tw-panel-active' : '') + '"></div>' +
            '<div id="tw-lobby-panel-b" class="tw-lobby-panel' + (_activeLobbyTab === TEAM_B ? ' tw-panel-active' : '') + '"></div>' +
            '<button type="button" id="tw-start-round-btn" class="tw-btn-primary">بدء الجولة</button>';

        box.querySelectorAll('.tw-lobby-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                _activeLobbyTab = tab.getAttribute('data-team');
                renderLobbyPlayerLists();
                box.querySelectorAll('.tw-lobby-tab').forEach(function (t) { t.classList.remove('tw-tab-active'); });
                box.querySelectorAll('.tw-lobby-panel').forEach(function (p) { p.classList.remove('tw-panel-active'); });
                tab.classList.add('tw-tab-active');
                el(tab.getAttribute('data-team') === TEAM_A ? 'tw-lobby-panel-a' : 'tw-lobby-panel-b').classList.add('tw-panel-active');
            });
        });

        el('tw-start-round-btn').addEventListener('click', handleStartRound);

        renderLobbyPlayerLists();
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderPlayerListHtml(players) {
        if (!players.length) return '<div class="tw-player-empty">ما انضم أحد للفريق لسه...</div>';
        return '<div class="tw-player-list">' + players.map(function (p) {
            var avatar = p.avatarUrl ? p.avatarUrl : '';
            return '<div class="tw-player-row">' +
                (avatar ? '<img src="' + escapeAttr(avatar) + '">' : '<img>') +
                '<div class="tw-player-name">' + escapeHtml(p.name || p.id) + '</div>' +
            '</div>';
        }).join('') + '</div>';
    }

    function renderLobbyPlayerLists() {
        var panelA = el('tw-lobby-panel-a');
        var panelB = el('tw-lobby-panel-b');
        if (!panelA || !panelB) return;

        var playersA = getTeamPlayers(TEAM_A);
        var playersB = getTeamPlayers(TEAM_B);

        panelA.innerHTML = '<div class="tw-lobby-count">' + playersA.length + ' لاعب</div>' + renderPlayerListHtml(playersA);
        panelB.innerHTML = '<div class="tw-lobby-count">' + playersB.length + ' لاعب</div>' + renderPlayerListHtml(playersB);
    }

    /* ======================================================================
     *  7) الانضمام عبر الشات (كلمة مفتاحية لكل فريق) -- بنفس أسلوب الاستماع
     *     لـ stream:commentReceived المستخدم بالكراسي الموسيقية بالضبط،
     *     لكن بمطابقة كلمتين بدل كلمة واحدة عبر AGP.keywordManager.
     * ==================================================================== */
    function wireCommentListenerForJoining() {
        if (_commentUnsub) return;
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_registrationOpen || !payload || typeof payload.text !== 'string') return;
            if (!payload.id) return;
            if (AGP.player.hasPlayer(payload.id)) return; // منضم أصلاً بأي فريق

            var text = normalizeArabicText(payload.text);
            var kwA = normalizeArabicText(_settings.teamAKeyword);
            var kwB = normalizeArabicText(_settings.teamBKeyword);
            var team = null;
            if (text === kwA) team = TEAM_A;
            else if (text === kwB) team = TEAM_B;
            if (!team) return;

            AGP.player.addPlayer({
                id: payload.id,
                name: payload.name || payload.id,
                avatarUrl: payload.avatarUrl || null,
                team: team
            });
        });
    }

    function unwireCommentListenerForJoining() {
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = null;
    }

    /* ======================================================================
     *  8) بدء الجولة -- يقفل التسجيل، يضبط النقاط، ينتقل لشاشة المباراة
     * ==================================================================== */
    function handleStartRound() {
        var playersA = getTeamPlayers(TEAM_A);
        var playersB = getTeamPlayers(TEAM_B);
        if (!playersA.length || !playersB.length) {
            window.alert('لازم ينضم لاعب واحد على الأقل بكل فريق قبل بدء الجولة.');
            return;
        }

        _registrationOpen = false;
        if (AGP.lobby && typeof AGP.lobby.close === 'function') AGP.lobby.close();

        var startPoints = finalStartingPoints();
        AGP.scoreManager.reset();
        AGP.scoreManager.setScore(SCORE_KEY_A, startPoints);
        AGP.scoreManager.setScore(SCORE_KEY_B, startPoints);

        AGP.events.emit('game:roundStarted', { gameId: GAME_ID });

        hideOverlay();
        renderMatchScreen();
    }

    /* ======================================================================
     *  9) شاشة المباراة -- لوحة النقاط جاهزة وشغّالة الحين. شاشة الشبكة/
     *     الأدوار/كشف البطاقة = الدفعة الثانية (مكانها محجوز أدناه).
     * ==================================================================== */
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

        root.innerHTML =
            '<div class="tw-scoreboard">' +
                teamPanelHtml(TEAM_A, _settings.teamAName, 'tw-panel-a') +
                '<div class="tw-vs-label">VS</div>' +
                teamPanelHtml(TEAM_B, _settings.teamBName, 'tw-panel-b') +
            '</div>' +
            '<div class="tw-match-placeholder">' +
                '<h3>شبكة المربعات ونظام الأدوار -- الدفعة الثانية 🚧</h3>' +
                '<p>لوحة النقاط شغّالة فعلياً الحين (تقدر تعدّل يدوياً بـ +/- للتجربة).<br>' +
                'الدور القادم: شبكة المربعات المرقّمة، مؤشر الدور الحي، وسحب البطاقة العشوائية عبر كتابة رقم المربع بالشات.</p>' +
            '</div>';

        wireScoreButtons();
        AGP.events.on('score:changed', updateScoreDisplays);
    }

    function teamPanelHtml(team, name, cls) {
        var scoreKey = team === TEAM_A ? SCORE_KEY_A : SCORE_KEY_B;
        return '<div class="tw-team-panel ' + cls + '">' +
            '<div class="tw-team-panel-name">' + escapeHtml(name) + '</div>' +
            '<div class="tw-team-panel-score-row">' +
                '<button type="button" class="tw-score-btn" data-team="' + team + '" data-delta="-10">-</button>' +
                '<div class="tw-score-val" id="tw-score-' + team + '">' + AGP.scoreManager.getScore(scoreKey) + '</div>' +
                '<button type="button" class="tw-score-btn" data-team="' + team + '" data-delta="10">+</button>' +
            '</div>' +
        '</div>';
    }

    function wireScoreButtons() {
        _matchEl.querySelectorAll('.tw-score-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var team = btn.getAttribute('data-team');
                var delta = parseInt(btn.getAttribute('data-delta'), 10);
                var scoreKey = team === TEAM_A ? SCORE_KEY_A : SCORE_KEY_B;
                AGP.scoreManager.addPoints(scoreKey, delta);
            });
        });
    }

    function updateScoreDisplays() {
        var a = el('tw-score-A');
        var b = el('tw-score-B');
        if (a) a.textContent = AGP.scoreManager.getScore(SCORE_KEY_A);
        if (b) b.textContent = AGP.scoreManager.getScore(SCORE_KEY_B);
    }

    /* ======================================================================
     *  10) لوحة إدارة المشاركين (زر الترس ⚙️) -- حذف لاعب بدون تأثير على
     *      النقاط أو سير المباراة، متاحة من اللوبي وشاشة المباراة معاً.
     * ==================================================================== */
    function toggleAdminPanel() {
        _adminPanelOpen = !_adminPanelOpen;
        var existing = el('tw-admin-overlay');
        if (!_adminPanelOpen) {
            if (existing) existing.remove();
            return;
        }
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'tw-admin-overlay';
        overlay.className = '';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(8,4,16,0.6);';
        overlay.innerHTML =
            '<div id="tw-box" style="width:480px;">' +
                '<h2>المشاركون</h2>' +
                '<div id="tw-admin-list"></div>' +
                '<button type="button" id="tw-admin-close" class="tw-btn-secondary" style="width:100%;text-align:center;margin-top:10px;">إغلاق</button>' +
            '</div>';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (e) { if (e.target === overlay) toggleAdminPanel(); });
        overlay.querySelector('#tw-admin-close').addEventListener('click', toggleAdminPanel);

        renderAdminList();
    }

    function renderAdminList() {
        var listEl = document.querySelector('#tw-admin-overlay #tw-admin-list');
        if (!listEl) return;

        var playersA = getTeamPlayers(TEAM_A);
        var playersB = getTeamPlayers(TEAM_B);

        function rowsHtml(players) {
            if (!players.length) return '<div class="tw-player-empty">لا يوجد لاعبون</div>';
            return players.map(function (p) {
                return '<div class="tw-player-row">' +
                    '<div class="tw-player-name">' + escapeHtml(p.name || p.id) + '</div>' +
                    '<button type="button" class="tw-admin-remove-btn" data-id="' + escapeAttr(p.id) + '" title="حذف من المباراة">🗑️</button>' +
                '</div>';
            }).join('');
        }

        listEl.innerHTML =
            '<div class="tw-admin-team-label">' + escapeHtml(_settings.teamAName) + '</div>' + rowsHtml(playersA) +
            '<div class="tw-admin-team-label">' + escapeHtml(_settings.teamBName) + '</div>' + rowsHtml(playersB);

        listEl.querySelectorAll('.tw-admin-remove-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                AGP.player.removePlayer(btn.getAttribute('data-id'));
                renderAdminList();
            });
        });
    }

    /* ======================================================================
     *  11) الاستماع لأحداث المنصة العامة
     * ==================================================================== */
    function wirePlatformListeners() {
        AGP.events.on('stream:statusChanged', function (payload) {
            if (payload.platform !== 'tiktok') return;
            if (payload.status === 'connecting') renderConnectingScreen('جارِ الاتصال بالبث...');
            else if (payload.status === 'connected' && _screen !== 'lobby' && _screen !== 'match') renderLobbyScreen();
            else if (payload.status === 'error') { renderSettingsScreen(); showSettingsError('تعذّر الاتصال -- تحقّق من اليوزرنيم وحاول مرة أخرى.'); }
        });

        _playerJoinedUnsub = AGP.events.on('player:joined', function () {
            renderLobbyPlayerLists();
            if (_adminPanelOpen) renderAdminList();
        });
        _playerRemovedUnsub = AGP.events.on('player:removed', function () {
            renderLobbyPlayerLists();
            if (_adminPanelOpen) renderAdminList();
        });
    }

    /* ======================================================================
     *  12) تسجيل اللعبة بالمنصة (نفس نمط الكراسي الموسيقية بالضبط)
     * ==================================================================== */
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
