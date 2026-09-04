/**
 * ==========================================================================
 *  AGP PHOTO CHALLENGE -- "تحدي الصور" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 * لعبة أصلية (Native) بنفس نمط games/team-war من ناحية طريقة التحميل فقط
 * (كلمتان مفتاحيتان منفصلتان -- وحدة لكل فريق -- شاشة الإعدادات المشتركة
 * js/agp-game-shell.js تدعم كلمة مفتاحية واحدة بس، فما تكفي هذي اللعبة).
 * الهوية البصرية: قالب "settings-no-box" منقول بالحرف من روليت القبائل
 * (بدون صندوق يحيط الحقول، عنوان بتدرّج لوني، حقول بخط سفلي بدل صناديق)
 * + تبويب اتصال بالبث (سبينر / تحذير فشل) يظهر فوق نفس الشاشة تماماً
 * كما هو معتمد بروليت القبائل. خط Zain فقط. لا اعتماد على
 * js/agp-game-shell.js ولا على أي لعبة ثانية، لا تعديل على أي ملف موجود.
 *
 * ⚠️ بناء تدريجي: هذا الملف حالياً يغطي شاشة الإعدادات + تبويب الاتصال
 * فقط. اللوبي/المباراة/شاشة الفائز غير مبنية بعد.
 *
 * الخدمات العامة المُعاد استخدامها بدون أي تعديل عليها:
 *   AGP.player / AGP.scoreManager / AGP.timerManager / AGP.streamConnector
 *   AGP.lobby / AGP.gameManager / AGP.events
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.gameManager || !AGP.player || !AGP.scoreManager || !AGP.timerManager || !AGP.streamConnector) {
        console.error('[AGP Photo Challenge] AGP Core غير محمَّل بعد -- تأكد من ترتيب تحميل الملفات بـ index.html.');
        return;
    }

    var GAME_ID = 'photo-challenge';
    var GAME_NAME = 'تحدي الصور';

    var DURATION_OPTIONS = [
        { value: 60, label: '1 د' },
        { value: 90, label: '1:30 د' },
        { value: 120, label: '2 د' },
        { value: 180, label: '3 د' }
    ];
    var WIN_POINTS_OPTIONS = [15, 20, 25];

    /* ======================================================================
     *  0) الحالة الداخلية
     * ==================================================================== */
    var _screen = 'settings'; // settings | connecting (فوق نفس الشاشة)
    var _rootEl = null;

    var _settings = {
        tiktokUsername: '',
        team1Name: 'الفريق الأول',
        team1Keyword: '',
        team2Name: 'الفريق الثاني',
        team2Keyword: '',
        followersOnly: false,
        answerDurationSeconds: 90,
        winPoints: 20
    };

    function el(id) { return document.getElementById(id); }
    function escapeAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    /* ======================================================================
     *  1) أدوات نصية: تطبيع عربي (لمقارنة الكلمات المفتاحية)
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
     *  2) الهيدر الأساسي الثابت -- بهوية اللعبة (سماوي/بنفسجي)
     * ==================================================================== */
    function injectHeader() {
        if (el('pc-header')) return;
        var header = document.createElement('div');
        header.id = 'pc-header';
        header.innerHTML =
            '<div class="pc-header-icons">' +
                '<button type="button" class="pc-header-icon-btn" id="pc-header-home-btn" title="العودة للمنصة">🏠</button>' +
                '<button type="button" class="pc-header-icon-btn" id="pc-header-info-btn" title="شرح اللعبة">!</button>' +
                '<button type="button" class="pc-header-icon-btn" id="pc-header-settings-btn" title="الإعدادات">⚙️</button>' +
            '</div>' +
            '<div id="pc-header-title">' + escapeHtml(GAME_NAME) + '</div>' +
            '<div id="pc-header-brand"><img src="../../logo.png" alt="ألعاب أيمن" onerror="this.style.display=\'none\'"></div>';
        document.body.appendChild(header);

        el('pc-header-home-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('pc-header-info-btn').addEventListener('click', function () {
            // ⚠️ بناء تدريجي: شاشة الشرح غير مبنية بعد.
            AGP.log('Photo Challenge: زر الشرح -- الشاشة لسا ما بُنيت.');
        });
        el('pc-header-settings-btn').addEventListener('click', function () {
            // ⚠️ بناء تدريجي: إعادة فتح الإعدادات أثناء المباراة غير مبنية بعد.
            AGP.log('Photo Challenge: زر الإعدادات -- إعادة الفتح أثناء المباراة لسا ما بُنيت.');
        });
    }

    /* ======================================================================
     *  3) شاشة الإعدادات -- قالب "settings-no-box" (منقول من روليت القبائل)
     * ==================================================================== */
    function ensureRoot() {
        if (_rootEl) return _rootEl;
        document.body.classList.add('pc-active');
        _rootEl = document.createElement('div');
        _rootEl.id = 'pc-settings';
        document.body.appendChild(_rootEl);
        return _rootEl;
    }

    function renderSettingsScreen() {
        _screen = 'settings';
        var root = ensureRoot();
        root.style.display = 'block';

        var joinPills = [
            { value: false, label: 'الكل' },
            { value: true, label: 'المتابعون فقط' }
        ].map(function (opt) {
            var active = (_settings.followersOnly === opt.value) ? ' pc-pill-active' : '';
            return '<button type="button" class="pc-pill-btn' + active + '" data-key="followersOnly" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');

        var durationPills = DURATION_OPTIONS.map(function (opt) {
            var active = (_settings.answerDurationSeconds === opt.value) ? ' pc-pill-active' : '';
            return '<button type="button" class="pc-pill-btn' + active + '" data-key="answerDurationSeconds" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');

        var pointsPills = WIN_POINTS_OPTIONS.map(function (v) {
            var active = (_settings.winPoints === v) ? ' pc-pill-active' : '';
            return '<button type="button" class="pc-pill-btn' + active + '" data-key="winPoints" data-value="' + v + '">' + v + '</button>';
        }).join('');

        root.innerHTML =
            '<h2>إعدادات مباراة تحدي الصور</h2>' +

            '<div class="pc-field">' +
                '<label>اكتب يوزر البث بالتيك توك</label>' +
                '<input type="text" id="pc-input-username" placeholder="ayman_live" value="' + escapeAttr(_settings.tiktokUsername) + '">' +
            '</div>' +

            '<div class="pc-field pc-team1">' +
                '<label>اسم الفريق الأول</label>' +
                '<input type="text" id="pc-input-team1Name" value="' + escapeAttr(_settings.team1Name) + '">' +
            '</div>' +
            '<div class="pc-field pc-team1">' +
                '<label>الكلمة المفتاحية للفريق الأول</label>' +
                '<input type="text" id="pc-input-team1Keyword" placeholder="اكتب الكلمة المفتاحية" value="' + escapeAttr(_settings.team1Keyword) + '">' +
            '</div>' +

            '<div class="pc-field pc-team2">' +
                '<label>اسم الفريق الثاني</label>' +
                '<input type="text" id="pc-input-team2Name" value="' + escapeAttr(_settings.team2Name) + '">' +
            '</div>' +
            '<div class="pc-field pc-team2">' +
                '<label>الكلمة المفتاحية للفريق الثاني</label>' +
                '<input type="text" id="pc-input-team2Keyword" placeholder="اكتب الكلمة المفتاحية" value="' + escapeAttr(_settings.team2Keyword) + '">' +
            '</div>' +

            '<div class="pc-row" id="pc-row-followersOnly">' +
                '<div class="pc-pill-group">' + joinPills + '</div>' +
                '<span class="pc-row-label">🔑 مين يقدر يدخل؟</span>' +
            '</div>' +

            '<div class="pc-row" id="pc-row-duration" style="flex-direction:column;align-items:stretch;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
                    '<div class="pc-pill-group">' + durationPills + '</div>' +
                    '<span class="pc-row-label">⏱️ مدة الإجابة</span>' +
                '</div>' +
                '<div class="pc-hint">أول 15 ثانية = 3 نقاط · قبل نص الوقت = نقطتان · بعد نص الوقت = نقطة</div>' +
            '</div>' +

            '<div class="pc-row" id="pc-row-winPoints">' +
                '<div class="pc-pill-group">' + pointsPills + '</div>' +
                '<span class="pc-row-label">🏆 نقاط الفوز</span>' +
            '</div>' +

            '<div id="pc-settings-error" class="pc-error-msg" style="display:none;"></div>' +

            '<button type="button" id="pc-connect-btn" class="pc-btn-connect">اتصال بالبث وبدء الإعدادات</button>' +
            '<button type="button" id="pc-back-btn" class="pc-back-btn">🏠 رجوع لمنصة ألعاب أيمن</button>';

        wireSettingsHandlers();
    }

    function wireSettingsHandlers() {
        el('pc-input-username').addEventListener('input', function (e) { _settings.tiktokUsername = e.target.value; });
        el('pc-input-team1Name').addEventListener('input', function (e) { _settings.team1Name = e.target.value; });
        el('pc-input-team1Keyword').addEventListener('input', function (e) { _settings.team1Keyword = e.target.value; });
        el('pc-input-team2Name').addEventListener('input', function (e) { _settings.team2Name = e.target.value; });
        el('pc-input-team2Keyword').addEventListener('input', function (e) { _settings.team2Keyword = e.target.value; });

        el('pc-row-followersOnly').addEventListener('click', function (e) {
            var btn = e.target.closest('.pc-pill-btn'); if (!btn) return;
            _settings.followersOnly = (btn.getAttribute('data-value') === 'true');
            renderSettingsScreen();
        });
        el('pc-row-duration').addEventListener('click', function (e) {
            var btn = e.target.closest('.pc-pill-btn'); if (!btn) return;
            _settings.answerDurationSeconds = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });
        el('pc-row-winPoints').addEventListener('click', function (e) {
            var btn = e.target.closest('.pc-pill-btn'); if (!btn) return;
            _settings.winPoints = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });

        el('pc-back-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('pc-connect-btn').addEventListener('click', handleConnectClick);
    }

    function showSettingsError(msg) {
        var errEl = el('pc-settings-error');
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.style.display = 'block';
    }

    function handleConnectClick() {
        var username = (_settings.tiktokUsername || '').trim();
        var kw1 = normalizeArabicText(_settings.team1Keyword);
        var kw2 = normalizeArabicText(_settings.team2Keyword);

        if (!username) return showSettingsError('لازم تكتب يوزر البث أول.');
        if (!kw1 || !kw2) return showSettingsError('لازم تحدد كلمة مفتاحية لكل فريق.');
        if (kw1 === kw2) return showSettingsError('الكلمتان المفتاحيتان لازم تكونان مختلفتين عن بعض.');

        AGP.streamConnector.connect('tiktok', { username: username });
    }

    /* ======================================================================
     *  4) شاشة اللوبي -- اسم اللعبة أعلى + الفريقين جنب بعض بفاصل VS، كل
     *     فريق تحته شبكة لاعبيه (بطاقات AGP.playerCard القياسية 60px).
     * ==================================================================== */
    var TEAM1 = 'team1';
    var TEAM2 = 'team2';

    var _lobbyEl = null;
    var _registrationOpen = false;
    var _commentUnsub = null;

    function ensureLobbyEl() {
        if (_lobbyEl) return _lobbyEl;
        _lobbyEl = document.createElement('div');
        _lobbyEl.id = 'pc-lobby';
        document.body.appendChild(_lobbyEl);
        return _lobbyEl;
    }

    function getTeamPlayers(team) {
        return AGP.player.getAllPlayers().filter(function (p) { return p.team === team; });
    }

    function findPlayerById(id) {
        var players = AGP.player.getAllPlayers();
        for (var i = 0; i < players.length; i++) {
            if (players[i].id === id) return players[i];
        }
        return null;
    }

    // بطاقة اللاعب المشتركة (agp-player-card.js) -- الحجم الافتراضي 60px
    // (لوبي-قياسي-v1)، مع الإطار (showFrame:true) بنفس قاعدة المنصة باللوبي.
    function playerCardHtml(p) {
        if (AGP.playerCard) {
            return AGP.playerCard.renderHtml(p, { showFrame: true, basePath: '../../', outClass: 'pc-pcard-wrap' });
        }
        var avatar = p.avatarUrl ? escapeAttr(p.avatarUrl) : '';
        return '<span class="pc-pcard-wrap">' + (avatar ? '<img src="' + avatar + '">' : '') + escapeHtml(p.name || p.id) + '</span>';
    }

    function lobbyCardHtml(p) {
        return '<div class="pc-lobby-card-wrap">' +
            '<button type="button" class="pc-lobby-remove-x" data-id="' + escapeAttr(p.id) + '" title="حذف اللاعب">✕</button>' +
            playerCardHtml(p) +
        '</div>';
    }

    function wireLobbyRemoveButtons(container) {
        if (!container) return;
        container.querySelectorAll('.pc-lobby-remove-x').forEach(function (btn) {
            btn.addEventListener('click', function () {
                AGP.player.removePlayer(btn.getAttribute('data-id'));
                renderLobbyPlayerGrids();
            });
        });
    }

    function renderLobbyPlayerGrids() {
        var grid1 = el('pc-lobby-grid-team1');
        var grid2 = el('pc-lobby-grid-team2');
        if (!grid1 || !grid2) return;

        var players1 = getTeamPlayers(TEAM1);
        var players2 = getTeamPlayers(TEAM2);

        el('pc-lobby-count-team1').textContent = '👥 ' + players1.length + ' لاعبين';
        el('pc-lobby-count-team2').textContent = '👥 ' + players2.length + ' لاعبين';

        grid1.innerHTML = players1.map(lobbyCardHtml).join('') || '<div class="pc-lobby-empty-slot"></div>';
        grid2.innerHTML = players2.map(lobbyCardHtml).join('') || '<div class="pc-lobby-empty-slot"></div>';
        if (AGP.playerCard) { AGP.playerCard.fitAllNames(grid1); AGP.playerCard.fitAllNames(grid2); }
        wireLobbyRemoveButtons(grid1);
        wireLobbyRemoveButtons(grid2);

        el('pc-start-round-btn').disabled = !(players1.length && players2.length);
    }

    function wireCommentListenerForJoining() {
        if (_commentUnsub) return;
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_registrationOpen || !payload || typeof payload.text !== 'string' || !payload.id) return;

            // ⚠️ فلترة "متابعين فقط" محلياً هنا -- الفلتر المشترك
            // (agp-tiktok-adapter.js) يقرأ فقط من AGP.gameShell.getSettings()
            // الخاص بالألعاب المعتمدة على الشِل المشترك، ولعبتنا غير
            // معتمدة عليه (كلمتان مفتاحيتان منفصلتان)، فيتجاهله تماماً.
            // نفس منطق الفلتر بالضبط، منقول هنا بدون أي تعديل على الملف
            // المشترك نفسه.
            if (_settings.followersOnly && !payload.isFollower) return;

            var text = normalizeArabicText(payload.text);
            var kw1 = normalizeArabicText(_settings.team1Keyword);
            var kw2 = normalizeArabicText(_settings.team2Keyword);
            var team = null;
            if (text === kw1) team = TEAM1;
            else if (text === kw2) team = TEAM2;
            if (!team) return;

            var existing = findPlayerById(payload.id);
            if (existing && existing.team === team) return; // منضم بنفس الفريق أصلاً

            // لو منضم بفريق ثاني، يتحوّل بحرية للفريق الجديد (قبل بدء الجولة فقط)
            if (existing) AGP.player.removePlayer(payload.id);

            AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null, team: team });
        });
    }

    function renderLobbyScreen() {
        _screen = 'lobby';
        _registrationOpen = true;
        if (_rootEl) _rootEl.style.display = 'none';
        if (AGP.lobby && typeof AGP.lobby.open === 'function') AGP.lobby.open();
        wireCommentListenerForJoining();

        var root = ensureLobbyEl();
        root.style.display = 'block';
        root.innerHTML =
            '<h2>' + escapeHtml(GAME_NAME) + '</h2>' +
            '<div class="pc-lobby-sub">اللوبي بانتظار اللاعبين</div>' +

            '<div class="pc-lobby-panels">' +
                '<div class="pc-lobby-team pc-team1">' +
                    '<div class="pc-lobby-team-header pc-team1">' +
                        '<div class="pc-lobby-team-name">' + escapeHtml(_settings.team1Name) + '</div>' +
                        '<div class="pc-lobby-team-keyword">🔑 ' + escapeHtml(_settings.team1Keyword) + '</div>' +
                    '</div>' +
                    '<div class="pc-lobby-count" id="pc-lobby-count-team1"></div>' +
                    '<div class="pc-lobby-grid" id="pc-lobby-grid-team1"></div>' +
                '</div>' +

                '<div class="pc-vs-label">VS</div>' +

                '<div class="pc-lobby-team pc-team2">' +
                    '<div class="pc-lobby-team-header pc-team2">' +
                        '<div class="pc-lobby-team-name">' + escapeHtml(_settings.team2Name) + '</div>' +
                        '<div class="pc-lobby-team-keyword">🔑 ' + escapeHtml(_settings.team2Keyword) + '</div>' +
                    '</div>' +
                    '<div class="pc-lobby-count" id="pc-lobby-count-team2"></div>' +
                    '<div class="pc-lobby-grid" id="pc-lobby-grid-team2"></div>' +
                '</div>' +
            '</div>' +

            '<div class="pc-lobby-actions">' +
                '<button type="button" id="pc-lobby-back-settings-btn" class="pc-lobby-btn-settings">⚙️ العودة لإعدادات المباراة</button>' +
                '<button type="button" id="pc-start-round-btn" class="pc-lobby-btn-start" disabled>بدء الجولة</button>' +
                '<button type="button" id="pc-lobby-back-platform-btn" class="pc-lobby-btn-platform">🏠 رجوع لمنصة ألعاب أيمن</button>' +
            '</div>';

        el('pc-lobby-back-settings-btn').addEventListener('click', function () {
            var ok = window.confirm('بترجع لشاشة الإعدادات وينقطع الاتصال الحالي بالبث. تبي تكمل؟');
            if (ok) window.location.reload();
        });
        el('pc-lobby-back-platform-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('pc-start-round-btn').addEventListener('click', function () {
            _registrationOpen = false;
            renderMatchScreen();
        });

        renderLobbyPlayerGrids();
    }

    /* ======================================================================
     *  5) شاشة المباراة -- تبويب العرض 600×400 بحواف متوهجة، الفريقين
     *     يمين/يسار الشاشة (اسم + نقاط + لاعبين)، زر واحد "إظهار الصورة
     *     وبدء الجولة" يبدأ عد تنازلي 3-2-1 ثم يتحوّل لأزرار الجولة
     *     (زيادة الوقت / إنهاء دون احتساب نقاط).
     * ==================================================================== */
    var SCORE_KEY_TEAM1 = 'photo-challenge:team1';
    var SCORE_KEY_TEAM2 = 'photo-challenge:team2';

    var _matchEl = null;
    var _answerInterval = null;
    var _answerRemaining = 0;

    function ensureMatchEl() {
        if (_matchEl) return _matchEl;
        _matchEl = document.createElement('div');
        _matchEl.id = 'pc-match';
        document.body.appendChild(_matchEl);
        return _matchEl;
    }

    function sidePlayerChipHtml(p, team) {
        var avatarStyle = p.avatarUrl ? ' style="background-image:url(\'' + escapeAttr(p.avatarUrl) + '\')"' : '';
        return '<div class="pc-side-player-chip ' + team + '" data-player-id="' + escapeAttr(p.id) + '">' +
            '<div class="pc-side-player-avatar"' + avatarStyle + '></div>' +
            '<span class="pc-side-player-name">' + escapeHtml(p.name || p.id) + '</span>' +
        '</div>';
    }

    function sidePanelHtml(team, teamName) {
        var players = getTeamPlayers(team);
        var score = AGP.scoreManager.getScore(team === TEAM1 ? SCORE_KEY_TEAM1 : SCORE_KEY_TEAM2);
        return '<div class="pc-side-panel ' + team + '">' +
            '<div class="pc-side-team-header ' + team + '">' +
                '<div class="pc-side-team-name">' + escapeHtml(teamName) + '</div>' +
                '<div class="pc-side-team-score" id="pc-side-score-' + team + '">' + score + '</div>' +
            '</div>' +
            '<div class="pc-side-player-list" id="pc-side-players-' + team + '">' +
                players.map(function (p) { return sidePlayerChipHtml(p, team); }).join('') +
            '</div>' +
        '</div>';
    }

    function formatAnswerTime(totalSeconds) {
        var m = Math.floor(totalSeconds / 60);
        var s = totalSeconds % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function startAnswerTimer() {
        _answerRemaining = _settings.answerDurationSeconds;
        var timerEl = el('pc-answer-timer');
        var valEl = el('pc-answer-timer-val');
        timerEl.style.display = 'flex';
        valEl.textContent = formatAnswerTime(_answerRemaining);
        if (_answerInterval) clearInterval(_answerInterval);
        _answerInterval = setInterval(function () {
            _answerRemaining -= 1;
            if (_answerRemaining <= 15) timerEl.classList.add('pc-low');
            if (_answerRemaining <= 0) {
                clearInterval(_answerInterval);
                _answerInterval = null;
                _answerRemaining = 0;
                _activeSilence = null; // انتهى الوقت -- الإسكات ينتهي مع الجولة
            }
            valEl.textContent = formatAnswerTime(_answerRemaining);
        }, 1000);
    }

    function stopAnswerTimer() {
        if (_answerInterval) { clearInterval(_answerInterval); _answerInterval = null; }
        var timerEl = el('pc-answer-timer');
        if (timerEl) { timerEl.style.display = 'none'; timerEl.classList.remove('pc-low'); }
        _activeSilence = null; // انتهت الجولة -- الإسكات ينتهي معها
    }

    function addAnswerTime(seconds) {
        if (_answerInterval == null) return; // الجولة مو نشطة
        _answerRemaining += seconds;
        var valEl = el('pc-answer-timer-val');
        var timerEl = el('pc-answer-timer');
        if (_answerRemaining > 15) timerEl.classList.remove('pc-low');
        valEl.textContent = formatAnswerTime(_answerRemaining);
    }

    function showMatchRoundButtons() {
        var row = el('pc-match-btn-row');
        row.innerHTML =
            '<span class="pc-timer-label">⏱️ زيادة الوقت</span>' +
            '<button type="button" class="pc-btn-add-time" data-add="10">10 ث</button>' +
            '<button type="button" class="pc-btn-add-time" data-add="20">20 ث</button>' +
            '<button type="button" class="pc-btn-add-time" data-add="30">30 ث</button>' +
            '<button type="button" class="pc-btn-end-round" id="pc-end-round-btn">إنهاء الجولة دون احتساب نقاط</button>';

        row.querySelectorAll('.pc-btn-add-time').forEach(function (btn) {
            btn.addEventListener('click', function () { addAnswerTime(parseInt(btn.getAttribute('data-add'), 10)); });
        });
        el('pc-end-round-btn').addEventListener('click', function () {
            stopAnswerTimer();
            // ⚠️ بناء تدريجي: التحقق من صحة الإجابات نفسه (لتحديد الفائز
            // بالجولة قبل انتهاء الوقت) غير مبني بعد -- هذا الزر ينهي
            // الجولة يدوياً بدون احتساب نقاط لأي فريق.
            AGP.log('Photo Challenge: إنهاء الجولة دون احتساب نقاط.');
        });
    }

    function handleShowImageAndStart() {
        var overlay = el('pc-countdown-overlay');
        var numEl = el('pc-countdown-num');
        var stageInner = el('pc-stage-inner');
        var stageBox = stageInner.closest('.pc-stage-box');

        // تصفير التبويب من حالة "إجابة صحيحة" لو راجعين من جولة سابقة
        stageBox.classList.remove('pc-result-mode');
        el('pc-result-panel').style.display = 'none';
        el('pc-stage-image-label').style.display = '';
        var watermarkEl = document.querySelector('#pc-stage-inner .pc-stage-watermark');
        if (watermarkEl) watermarkEl.style.display = '';
        document.querySelectorAll('.pc-side-player-chip.pc-correct').forEach(function (chip) { chip.classList.remove('pc-correct'); });

        overlay.style.display = 'flex';
        var count = 3;
        numEl.textContent = count;

        var interval = setInterval(function () {
            count -= 1;
            if (count <= 0) {
                clearInterval(interval);
                overlay.style.display = 'none';
                stageInner.classList.add('pc-has-image');
                // ⚠️ بناء تدريجي: مصدر صورة التحدي الفعلي غير مبني بعد.
                el('pc-stage-image-label').textContent = '🖼️ صورة التحدي هنا';
                showMatchRoundButtons();
                startAnswerTimer();

                // ⚠️ الإسكات "للجولة الجاية" يصير سارياً الآن بالضبط -- مع
                // بداية هذي الجولة -- وينتهي تلقائياً معها (بالوقت أو
                // بزر الإنهاء).
                if (_pendingSilence) {
                    _activeSilence = { playerId: _pendingSilence.playerId, playerName: _pendingSilence.playerName, bonusTeam: _pendingSilence.bonusTeam, penalized: false };
                    _pendingSilence = null;
                }
                return;
            }
            numEl.textContent = count;
        }, 800);
    }

    function showScoreFloat(team, amount) {
        var scoreEl = el('pc-side-score-' + team);
        if (!scoreEl) return;
        var floatEl = document.createElement('span');
        floatEl.className = 'pc-score-float';
        floatEl.textContent = '+' + amount;
        scoreEl.appendChild(floatEl);
        setTimeout(function () { floatEl.remove(); }, 1600);
    }

    /* ---- ظهور "الإجابة الصحيحة" -- تُستدعى مع: مين جاوب، فريقه، نص
     *      الإجابة الصحيحة نفسها، والنقاط المستحقة (3/2/1 حسب التوقيت).
     *      ⚠️ بناء تدريجي: ما فيه لسا محرك يتحقق من الإجابات الواردة
     *      بالشات ويستدعي هذي الدالة تلقائياً -- محتاجين نحدد أول كيف
     *      بيُدخَل نص الإجابة الصحيحة لكل جولة قبل ربط الاستدعاء التلقائي. */
    function revealCorrectAnswer(playerId, playerTeam, answerText, pointsAwarded) {
        stopAnswerTimer();

        var player = findPlayerById(playerId);
        var playerName = player ? (player.name || player.id) : playerId;
        var teamName = (playerTeam === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var timeLabel = pointsAwarded >= 3 ? 'جاوب بأول 15 ثانية' : (pointsAwarded === 2 ? 'جاوب قبل نص الوقت' : 'جاوب بعد نص الوقت');

        var stageInner = el('pc-stage-inner');
        var stageBox = stageInner.closest('.pc-stage-box');
        stageBox.classList.add('pc-result-mode');
        el('pc-stage-image-label').style.display = 'none';
        var watermarkEl = document.querySelector('#pc-stage-inner .pc-stage-watermark');
        if (watermarkEl) watermarkEl.style.display = 'none';

        var avatarStyle = (player && player.avatarUrl) ? ' style="background-image:url(\'' + escapeAttr(player.avatarUrl) + '\')"' : '';
        var panel = el('pc-result-panel');
        panel.innerHTML =
            '<div class="pc-result-check">✅</div>' +
            '<div class="pc-result-title">إجابة صحيحة!</div>' +
            '<div class="pc-result-player-row">' +
                '<div class="pc-result-avatar"' + avatarStyle + '></div>' +
                '<div>' +
                    '<div class="pc-result-player-name">' + escapeHtml(playerName) + '</div>' +
                    '<span class="pc-result-team-badge ' + playerTeam + '">' + escapeHtml(teamName) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="pc-result-answer-row">الإجابة الصحيحة: <b>' + escapeHtml(answerText) + '</b></div>' +
            '<div class="pc-result-points">+' + pointsAwarded + ' نقاط</div>' +
            '<div class="pc-result-points-sub">' + timeLabel + '</div>';
        panel.style.display = 'flex';

        var chip = document.querySelector('.pc-side-player-chip[data-player-id="' + playerId + '"]');
        if (chip) chip.classList.add('pc-correct');

        var key = (playerTeam === TEAM1) ? SCORE_KEY_TEAM1 : SCORE_KEY_TEAM2;
        AGP.scoreManager.addPoints(key, pointsAwarded);
        updateSideScoreDisplay(playerTeam);
        showScoreFloat(playerTeam, pointsAwarded);
        checkForWinner();

        el('pc-match-btn-row').innerHTML = '<button type="button" class="pc-btn-next-round" id="pc-next-round-btn">⏭ الجولة التالية</button>';
        el('pc-next-round-btn').addEventListener('click', handleShowImageAndStart);
    }

    function renderMatchScreen() {
        _screen = 'match';
        if (_lobbyEl) _lobbyEl.style.display = 'none';
        if (AGP.lobby && typeof AGP.lobby.close === 'function') AGP.lobby.close();

        var root = ensureMatchEl();
        root.style.display = 'flex';
        root.innerHTML =
            sidePanelHtml(TEAM1, _settings.team1Name) +

            '<div class="pc-stage-col">' +
                '<div class="pc-stage-box">' +
                    '<div class="pc-stage-hint-row">' +
                        '<div class="pc-stage-hint">اقرأ الصورة من اليمين لليسار</div>' +
                        '<div class="pc-answer-timer" id="pc-answer-timer">⏱️ <span id="pc-answer-timer-val">' + formatAnswerTime(_settings.answerDurationSeconds) + '</span></div>' +
                    '</div>' +
                    '<div class="pc-stage-inner" id="pc-stage-inner">' +
                        '<div class="pc-stage-watermark"><img src="../../logo.png" alt="" onerror="this.style.display=\'none\'"></div>' +
                        '<span class="pc-stage-image-label" id="pc-stage-image-label">هنا تُعرض صورة التحدي</span>' +
                        '<div class="pc-result-panel" id="pc-result-panel"></div>' +
                    '</div>' +
                    '<div class="pc-countdown-overlay" id="pc-countdown-overlay">' +
                        '<div class="pc-countdown-num" id="pc-countdown-num">3</div>' +
                    '</div>' +
                '</div>' +
                '<div class="pc-match-btn-row" id="pc-match-btn-row">' +
                    '<button type="button" class="pc-btn-show-start" id="pc-show-start-btn">إظهار الصورة وبدء الجولة</button>' +
                '</div>' +
            '</div>' +

            sidePanelHtml(TEAM2, _settings.team2Name);

        el('pc-show-start-btn').addEventListener('click', handleShowImageAndStart);
    }

    /* ======================================================================
     *  6) تبويب نهاية المباراة -- يظهر فوق شاشة المباراة نفسها (خلفيتها
     *     تبين مغبّشة/معتّمة خلفه). بطاقات لاعبي الفريق الفائز + 3 أزرار.
     * ==================================================================== */
    var _winnerDeclared = false;
    var _winnerDim = null;
    var _winnerCard = null;

    function ensureWinnerOverlay() {
        if (!_winnerDim) {
            _winnerDim = document.createElement('div');
            _winnerDim.id = 'pc-winner-dim';
            _winnerCard = document.createElement('div');
            _winnerCard.id = 'pc-winner-card';
            _winnerDim.appendChild(_winnerCard);
            document.body.appendChild(_winnerDim);
        }
        return _winnerCard;
    }

    function winnerCardHtml(p) {
        var avatarStyle = p.avatarUrl ? ' style="background-image:url(\'' + escapeAttr(p.avatarUrl) + '\')"' : '';
        return '<div class="pc-winner-card-item">' +
            '<div class="pc-winner-avatar-wrap">' +
                '<div class="pc-winner-ring"></div>' +
                '<div class="pc-winner-avatar"' + avatarStyle + '></div>' +
                '<div class="pc-winner-crown">👑</div>' +
            '</div>' +
            '<div class="pc-winner-name">' + escapeHtml(p.name || p.id) + '</div>' +
        '</div>';
    }

    function renderWinnerScreen(winningTeam) {
        if (_winnerDeclared) return;
        _winnerDeclared = true;

        stopAnswerTimer();
        var overlay = el('pc-countdown-overlay');
        if (overlay) overlay.style.display = 'none';

        var losingTeam = (winningTeam === TEAM1) ? TEAM2 : TEAM1;
        var winningTeamName = (winningTeam === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var winScore = AGP.scoreManager.getScore(winningTeam === TEAM1 ? SCORE_KEY_TEAM1 : SCORE_KEY_TEAM2);
        var loseScore = AGP.scoreManager.getScore(losingTeam === TEAM1 ? SCORE_KEY_TEAM1 : SCORE_KEY_TEAM2);
        var winningPlayers = getTeamPlayers(winningTeam);

        var card = ensureWinnerOverlay();
        card.innerHTML =
            '<div class="pc-winner-trophy">🏆</div>' +
            '<h2 class="pc-winner-title">فريق ' + escapeHtml(winningTeamName) + ' فاز بالمباراة!</h2>' +
            '<div class="pc-winner-score">بنتيجة ' +
                '<b class="' + winningTeam + '">' + winScore + '</b> مقابل ' +
                '<b class="' + losingTeam + '">' + loseScore + '</b>' +
            '</div>' +
            '<div class="pc-winner-cards">' + winningPlayers.map(winnerCardHtml).join('') + '</div>' +
            '<div class="pc-winner-actions">' +
                '<button type="button" class="pc-winner-btn pc-winner-btn-replay" id="pc-winner-replay-btn">🔁 إعادة المباراة بنفس اللاعبين</button>' +
                '<button type="button" class="pc-winner-btn pc-winner-btn-newmatch" id="pc-winner-newmatch-btn">✨ مباراة جديدة</button>' +
                '<button type="button" class="pc-winner-btn pc-winner-btn-home" id="pc-winner-home-btn">🏠 العودة للصفحة الرئيسية</button>' +
            '</div>';

        _winnerDim.style.display = 'flex';

        el('pc-winner-replay-btn').addEventListener('click', function () {
            AGP.scoreManager.reset(SCORE_KEY_TEAM1);
            AGP.scoreManager.reset(SCORE_KEY_TEAM2);
            updateSideScoreDisplay(TEAM1);
            updateSideScoreDisplay(TEAM2);
            _winnerDim.style.display = 'none';
            _winnerDeclared = false;
            renderMatchScreen(); // يرجع لشاشة المباراة بنفس الفريقين واللاعبين، جاهزة لجولة جديدة
        });
        el('pc-winner-newmatch-btn').addEventListener('click', function () { window.location.reload(); });
        el('pc-winner-home-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
    }

    function checkForWinner() {
        if (_screen !== 'match' || _winnerDeclared) return;
        var score1 = AGP.scoreManager.getScore(SCORE_KEY_TEAM1);
        var score2 = AGP.scoreManager.getScore(SCORE_KEY_TEAM2);
        if (score1 >= _settings.winPoints) renderWinnerScreen(TEAM1);
        else if (score2 >= _settings.winPoints) renderWinnerScreen(TEAM2);
    }

    /* ======================================================================
     *  7) تبويب "الأفضلية" -- إجابتين صح متتاليتين. يعرض لاعبي الفريق
     *     الآخر بأرقام؛ اللاعب صاحب الأفضلية يكتب الرقم بالشات فيُسكَت
     *     ذاك اللاعب تلقائياً للجولة الجاية. لو جاوب رغم الإسكات، تُحتسب
     *     نقطة إضافية لفريق صاحب الأفضلية. لا يُغلق التبويب إلا يدوياً
     *     بزر ✕ (منطق ربطه بشرط "إجابتين صح متتاليتين" الفعلي -- بعد
     *     بناء محرك التحقق من الإجابات، لسا ما بُني -- بناء تدريجي).
     * ==================================================================== */
    var _pendingSilence = null; // {playerId, playerName, bonusTeam} -- يُطبَّق أول ما تبدأ الجولة الجاية
    var _activeSilence = null;  // {playerId, playerName, bonusTeam, penalized} -- ساري بالجولة الحالية فقط
    var _advantageOpponentTeam = null;
    var _advantageOpponentTeamName = '';
    var _advantageAdvantagedPlayerId = null;
    var _advantageCommentUnsub = null;
    var _silenceEnforceUnsub = null;

    function ensureAdvantagePopup() {
        if (!el('pc-advantage-dim')) {
            var dim = document.createElement('div');
            dim.id = 'pc-advantage-dim';
            document.body.appendChild(dim);
        }
        if (!el('pc-advantage-popup')) {
            var popup = document.createElement('div');
            popup.id = 'pc-advantage-popup';
            document.body.appendChild(popup);
        }
        return el('pc-advantage-popup');
    }

    function wireAdvantageChatListener() {
        if (_advantageCommentUnsub) return;
        _advantageCommentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_advantageAdvantagedPlayerId || !payload || typeof payload.text !== 'string' || !payload.id) return;
            if (payload.id !== _advantageAdvantagedPlayerId) return; // غير صاحب الأفضلية -- تجاهل

            var num = parseInt(normalizeArabicText(payload.text), 10);
            var row = el('pc-advantage-popup') && el('pc-advantage-popup').querySelector('.pc-adv-numbered-row[data-num="' + num + '"]');
            if (!row) return;

            applySilence(row.getAttribute('data-player-id'), row.querySelector('.pc-adv-p-name').textContent);
        });
    }

    function applySilence(playerId, playerName) {
        var bonusTeam = (_advantageOpponentTeam === TEAM1) ? TEAM2 : TEAM1;
        _pendingSilence = { playerId: playerId, playerName: playerName, bonusTeam: bonusTeam };

        var popup = el('pc-advantage-popup');
        popup.querySelectorAll('.pc-adv-numbered-row').forEach(function (row) {
            row.classList.toggle('pc-adv-picked', row.getAttribute('data-player-id') === playerId);
        });
        var note = el('pc-advantage-confirm-note');
        note.textContent = '🔇 تم إسكات "' + playerName + '" للجولة الجاية';
        note.style.display = 'block';
    }

    function hideAdvantagePopup() {
        if (el('pc-advantage-dim')) el('pc-advantage-dim').style.display = 'none';
        if (el('pc-advantage-popup')) el('pc-advantage-popup').style.display = 'none';
        _advantageAdvantagedPlayerId = null;
        _advantageOpponentTeam = null;
    }

    // يُستدعى مع لاعب جاوب صح مرتين متتاليتين -- الربط الفعلي بمحرك
    // التحقق من الإجابات يصير بمرحلة لاحقة (بناء تدريجي).
    function showAdvantagePopup(advantagedPlayerId, advantagedPlayerName, advantagedTeam) {
        wireAdvantageChatListener();

        _advantageAdvantagedPlayerId = advantagedPlayerId;
        _advantageOpponentTeam = (advantagedTeam === TEAM1) ? TEAM2 : TEAM1;
        _advantageOpponentTeamName = (_advantageOpponentTeam === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var advantagedTeamName = (advantagedTeam === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var opponentPlayers = getTeamPlayers(_advantageOpponentTeam);

        var numberedRows = opponentPlayers.map(function (p, i) {
            return '<div class="pc-adv-numbered-row" data-num="' + (i + 1) + '" data-player-id="' + escapeAttr(p.id) + '">' +
                '<span class="pc-adv-num-badge">' + (i + 1) + '</span>' +
                '<span class="pc-adv-p-name">' + escapeHtml(p.name || p.id) + '</span>' +
            '</div>';
        }).join('');

        var popup = ensureAdvantagePopup();
        el('pc-advantage-dim').style.display = 'block';
        popup.style.display = 'block';
        popup.innerHTML =
            '<button type="button" id="pc-advantage-close-btn">✕</button>' +
            '<div class="pc-adv-icon">⚡</div>' +
            '<h3>أفضلية إجابتين متتاليتين!</h3>' +
            '<p>' +
                '<b style="color:#ffb648;">' + escapeHtml(advantagedPlayerName) + '</b> من فريق ' +
                '<b>' + escapeHtml(advantagedTeamName) + '</b> جاوبت صح مرتين على التوالي. ' +
                'اكتب رقم اللاعب من فريق <b>' + escapeHtml(_advantageOpponentTeamName) + '</b> اللي تبي تسكته الجولة الجاية. ' +
                'لو جاوب رغم الإسكات، تُحتسب نقطة إضافية لفريق ' + escapeHtml(advantagedTeamName) + '.' +
            '</p>' +
            '<div class="pc-adv-section-label">لاعبو فريق ' + escapeHtml(_advantageOpponentTeamName) + ':</div>' +
            '<div class="pc-adv-numbered-list">' + numberedRows + '</div>' +
            '<div class="pc-adv-chat-hint">💬 يكتب رقم اللاعب بشات البث</div>' +
            '<div class="pc-adv-confirm-note" id="pc-advantage-confirm-note"></div>';

        el('pc-advantage-close-btn').addEventListener('click', hideAdvantagePopup);
    }

    /* ---- إنفاذ الإسكات: أي رسالة من اللاعب المُسكَت أثناء الجولة الجاية
     *      تحسب نقطة فورية لصالح الفريق الآخر، والجولة تستمر عادي (ما
     *      تنتهي) لحد ما توصل إجابة صحيحة أو ينتهي الوقت. ---- */
    function updateSideScoreDisplay(team) {
        var scoreEl = el('pc-side-score-' + team);
        if (!scoreEl) return;
        var key = (team === TEAM1) ? SCORE_KEY_TEAM1 : SCORE_KEY_TEAM2;
        scoreEl.textContent = AGP.scoreManager.getScore(key);
    }

    function showToast(message) {
        var container = el('pc-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'pc-toast-container';
            document.body.appendChild(container);
        }
        var toast = document.createElement('div');
        toast.className = 'pc-toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(function () { toast.remove(); }, 3000);
    }

    function wireSilenceEnforcementListener() {
        if (_silenceEnforceUnsub) return;
        _silenceEnforceUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_activeSilence || _activeSilence.penalized) return;
            if (!payload || !payload.id || payload.id !== _activeSilence.playerId) return;
            if (_answerInterval == null) return; // الجولة مو نشطة حالياً

            _activeSilence.penalized = true;
            var key = (_activeSilence.bonusTeam === TEAM1) ? SCORE_KEY_TEAM1 : SCORE_KEY_TEAM2;
            AGP.scoreManager.addPoints(key, 1);
            updateSideScoreDisplay(_activeSilence.bonusTeam);
            checkForWinner();

            var bonusTeamName = (_activeSilence.bonusTeam === TEAM1) ? _settings.team1Name : _settings.team2Name;
            showToast('🔇 ' + _activeSilence.playerName + ' جاوب رغم الإسكات! نقطة إضافية لفريق ' + bonusTeamName);
        });
    }

    /* ======================================================================
     *  8) تبويب الاتصال بالبث -- يظهر فوق شاشة الإعدادات (منقول بالحرف من
     *     قالب روليت القبائل). زر ✕ عند الفشل يُخفي التبويب فقط، شاشة
     *     الإعدادات خلفه تبقى ظاهرة وتفاعلية.
     * ==================================================================== */
    function ensureConnectOverlay() {
        if (!el('pc-connect-dim')) {
            var dim = document.createElement('div');
            dim.id = 'pc-connect-dim';
            document.body.appendChild(dim);
        }
        if (!el('pc-connect-popup')) {
            var popup = document.createElement('div');
            popup.id = 'pc-connect-popup';
            document.body.appendChild(popup);
        }
        return el('pc-connect-popup');
    }

    function showConnectOverlay(isError) {
        var popup = ensureConnectOverlay();
        el('pc-connect-dim').style.display = 'block';
        popup.style.display = 'block';
        popup.classList.toggle('pc-connect-error', Boolean(isError));
        popup.innerHTML =
            (isError ? '<button type="button" id="pc-connect-close-btn">✕</button>' : '') +
            '<div class="' + (isError ? 'pc-connect-error-icon' : 'pc-connect-spinner') + '">' +
            (isError ? '⚠️' : '') + '</div>' +
            '<h3>' + (isError ? 'تعذّر الاتصال' : 'جاري الاتصال بالبث') + '</h3>' +
            '<p>' + (isError ? 'تأكد من اسم المستخدم وحاول مرة ثانية' : 'انتظر قليلاً...') + '</p>';
        if (isError) {
            el('pc-connect-close-btn').onclick = function () {
                hideConnectOverlay();
            };
        }
    }

    function hideConnectOverlay() {
        if (el('pc-connect-dim')) el('pc-connect-dim').style.display = 'none';
        if (el('pc-connect-popup')) el('pc-connect-popup').style.display = 'none';
    }

    /* ======================================================================
     *  9) الاستماع لأحداث المنصة العامة + التسجيل
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

        // شبكة أمان: أي مصدر نقاط مستقبلي (مثل محرك التحقق من الإجابات
        // اللي بيُبنى بمرحلة لاحقة) يُفحص تلقائياً بعد كل تغيير نقاط.
        AGP.events.on('score:changed', function () { checkForWinner(); });

        // ⚠️ إصلاح خلل: بدون هذا، انضمام لاعب عبر الشات (أو حذفه، أو
        // تبديله لفريق ثاني) يصير فعلياً بالخلفية لكن شبكة اللوبي ما
        // تنعرض محدَّثة أبداً -- يبين وكأن الكتابة بالشات "ما تشتغل".
        AGP.events.on('player:joined', function () { if (_screen === 'lobby') renderLobbyPlayerGrids(); });
        AGP.events.on('player:removed', function () { if (_screen === 'lobby') renderLobbyPlayerGrids(); });
    }

    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'team-games',
            onLoad: function () { AGP.log('Photo Challenge: onLoad.'); },
            onRoundEnd: function () { AGP.log('Photo Challenge: onRoundEnd.'); },
            onDestroy: function () { AGP.log('Photo Challenge: onDestroy.'); }
        });

        if (!registered) { AGP.log('Photo Challenge: registration failed (already registered?).'); return; }

        AGP.gameManager.loadGame(GAME_ID);

        injectHeader();
        wirePlatformListeners();
        wireSilenceEnforcementListener();
        renderSettingsScreen();
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
