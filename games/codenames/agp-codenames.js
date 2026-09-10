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
 * بالبث + شاشة اللوبي + شاشة اللعب (الشكل البصري منسوخ بالحرف من تصاميم
 * Claude Design المعتمدة؛ منطق المباراة نفسه حقيقي وكامل -- كلمات
 * عشوائية 9/8/7/1، بداية عشوائية بدون تكرار الفريق نفسه، ريست قبل أول
 * تلميح، أوامر شات حقيقية للتلميح/التأكيد/التحديد/السحب/التخطي، قواعد
 * فتح الصناديق والفوز/الخسارة، وتعيين السباي ماستر/المؤكّد يدويًا).
 * اللوبي يستخدم بطاقة لاعب مخصصة بالتصميم (دائرة أفاتار + لوحة اسم
 * زجاجية) بدل نظام AGP.playerCard المشترك، بطلب صريح لمطابقة التصميم
 * بالحرف.
 *
 * ⚠️ لسا غير مبني: نظام QR/صفحة الجوال لعرض الخريطة السرية على جوال
 * السباي ماستر (لا سابقة له بأي لعبة أخرى بالمنصة، يحتاج بنية منفصلة)،
 * وشاشة فائز مستقلة مطابقة لمعيار باقي ألعاب المنصة (حاليًا بانر بسيط).
 * نظام "دخول لاعبين أثناء المباراة" و"طلبات السباي ماستر" بقائمة
 * الإعدادات لسا شكل بصري فقط بدون منطق حقيقي خلفه.
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
    var TEAM1 = 'team1';
    var TEAM2 = 'team2';

    /* ======================================================================
     *  0) الحالة الداخلية
     * ==================================================================== */
    var _screen = 'settings'; // settings | connecting | lobby (لاحقاً)
    function setScreen(name) { _screen = name; }

    var _rootEl = null;
    var _lobbyEl = null;
    var _registrationOpen = false;
    var _commentUnsub = null;

    var _settings = {
        tiktokUsername: '',
        followersOnly: false,
        team1Name: 'الفريق الأحمر',
        team1Keyword: '',
        team2Name: 'الفريق الأزرق',
        team2Keyword: '',
        hintSeconds: 150,   // وقت السباي ماستر لإرسال التلميح -- افتراضي 2:30 (خيارات: 2:00/2:30/3:00)
        guessSeconds: 120   // وقت التخمين/التأكيد بعد التلميح -- افتراضي 2:00 (خيارات: 1:30/2:00/2:30)
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

        var hintPills = [
            { value: 120, label: '2:00' },
            { value: 150, label: '2:30' },
            { value: 180, label: '3:00' }
        ].map(function (opt) {
            var active = (_settings.hintSeconds === opt.value) ? ' cn-pill-active' : '';
            return '<button type="button" class="cn-pill-btn' + active + '" data-key="hintSeconds" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');

        var guessPills = [
            { value: 90, label: '1:30' },
            { value: 120, label: '2:00' },
            { value: 150, label: '2:30' }
        ].map(function (opt) {
            var active = (_settings.guessSeconds === opt.value) ? ' cn-pill-active' : '';
            return '<button type="button" class="cn-pill-btn' + active + '" data-key="guessSeconds" data-value="' + opt.value + '">' + opt.label + '</button>';
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

            '<div class="cn-row" id="cn-row-hintSeconds">' +
                '<div class="cn-pill-group">' + hintPills + '</div>' +
                '<span class="cn-row-label">⏳ وقت إرسال التلميح من السباي ماستر</span>' +
            '</div>' +

            '<div class="cn-row" id="cn-row-guessSeconds">' +
                '<div class="cn-pill-group">' + guessPills + '</div>' +
                '<span class="cn-row-label">⏳ وقت اختيار اللاعبين وتأكيد الإجابة</span>' +
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
        el('cn-row-hintSeconds').addEventListener('click', function (e) {
            var btn = e.target.closest('.cn-pill-btn'); if (!btn) return;
            _settings.hintSeconds = Number(btn.getAttribute('data-value'));
            renderSettingsScreen();
        });
        el('cn-row-guessSeconds').addEventListener('click', function (e) {
            var btn = e.target.closest('.cn-pill-btn'); if (!btn) return;
            _settings.guessSeconds = Number(btn.getAttribute('data-value'));
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
     *  5) شاشة اللوبي -- منسوخة بالحرف من تصميم Claude Design المعتمد
     *     (Codenames Lobby.dc.html): هيدر عنوان مركزي + LIVE (مطابق
     *     لهيدر شاشة اللعب)، شارة "في انتظار اللاعبين"، قسمين جنب بعض
     *     بدون فاصل VS، 3 أعمدة ثابتة، بطاقة لاعب مخصصة (دائرة أفاتار +
     *     لوحة اسم زجاجية متراكبة). اللاعب يدخل فريقه بكتابة كلمته
     *     المفتاحية، ويقدر ينتقل لفريق ثاني بمجرد كتابة الكلمة المفتاحية
     *     للفريق الآخر (قبل بدء الجولة فقط) -- بنفس منطق تحدي الصور.
     * ==================================================================== */
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

    function playerInitial(p) {
        var name = (p.name || p.id || '').trim();
        return name ? name.charAt(0) : '؟';
    }

    function playerCardInnerHtml(p, extraPillContent) {
        // ⚠️ إصلاح: كانت كل بطاقات اللوبي تمر ببطاقتنا المخصصة (تصميم
        // Claude Design بالحرف) اللي ما تستدعي AGP.playerCard.renderHtml
        // إطلاقاً -- فنظام الإطارات الحقيقي (js/agp-player-card.js) ما كان
        // يُستدعى أبداً، حتى لو اللاعب يملك إطاراً فعلياً. الآن: لاعب يملك
        // إطار (p.frame) يُعرض بالنظام المشترك الحقيقي (showFrame:true) --
        // نفس منطق الإطارات بكل اللعبة، بدون إعادة تنفيذه هنا يدوياً.
        // لاعب بدون إطار يبقى ببطاقتنا المخصصة كما هي.
        if (p.frame && AGP.playerCard) {
            return AGP.playerCard.renderHtml(p, { showFrame: true, basePath: '../../', size: 50, outClass: 'cn-lobby-framed-inner' });
        }
        return '<div class="cn-lobby-pcard-avatar">' + escapeHtml(playerInitial(p)) + '</div>' +
            '<div class="cn-lobby-pcard-pill">' +
                '<span class="cn-lobby-pcard-name">' + escapeHtml(p.name || p.id) + '</span>' +
                (extraPillContent || '') +
            '</div>';
    }

    function lobbyCardHtml(p) {
        if (p.frame && AGP.playerCard) {
            return '<div class="cn-lobby-pcard cn-lobby-pcard-framed">' +
                '<button type="button" class="cn-lobby-pcard-remove-framed" data-id="' + escapeAttr(p.id) + '" title="حذف اللاعب">✕</button>' +
                playerCardInnerHtml(p) +
            '</div>';
        }
        var removeBtn = '<button type="button" class="cn-lobby-pcard-remove" data-id="' + escapeAttr(p.id) + '" title="حذف اللاعب">✕</button>';
        return '<div class="cn-lobby-pcard">' + playerCardInnerHtml(p, removeBtn) + '</div>';
    }

    function winnerCardHtml(p) {
        var avatarInner = p.avatarUrl
            ? '<img src="' + escapeAttr(p.avatarUrl) + '" alt="">'
            : escapeHtml(playerInitial(p));
        return '<div class="cn-winner-card">' +
            '<div class="cn-winner-card-avatar">' + avatarInner + '</div>' +
            '<div class="cn-winner-card-name">' + escapeHtml(p.name || p.id) + '</div>' +
            '<div class="cn-winner-card-points">+' + WINNER_POINTS_PER_PLAYER + '</div>' +
        '</div>';
    }

    function wireLobbyRemoveButtons(container) {
        if (!container) return;
        container.querySelectorAll('.cn-lobby-pcard-remove, .cn-lobby-pcard-remove-framed').forEach(function (btn) {
            btn.addEventListener('click', function () {
                AGP.player.removePlayer(btn.getAttribute('data-id'));
                renderLobbyPlayerGrids();
            });
        });
    }

    function renderLobbyPlayerGrids() {
        var grid1 = el('cn-lobby-grid-team1');
        var grid2 = el('cn-lobby-grid-team2');
        if (!grid1 || !grid2) return;

        var players1 = getTeamPlayers(TEAM1);
        var players2 = getTeamPlayers(TEAM2);

        el('cn-lobby-count-team1').textContent = players1.length;
        el('cn-lobby-count-team2').textContent = players2.length;

        grid1.innerHTML = players1.map(lobbyCardHtml).join('') || '<div class="cn-lobby-empty-slot"></div>';
        grid2.innerHTML = players2.map(lobbyCardHtml).join('') || '<div class="cn-lobby-empty-slot"></div>';
        wireLobbyRemoveButtons(grid1);
        wireLobbyRemoveButtons(grid2);

        el('cn-start-round-btn').disabled = !(players1.length && players2.length);
    }

    function wireCommentListenerForJoining() {
        if (_commentUnsub) return;
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_registrationOpen || !payload || typeof payload.text !== 'string' || !payload.id) return;
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

            // لو منضم بفريق ثاني، ينتقل بحرية للفريق الجديد بمجرد كتابة كلمته
            if (existing) AGP.player.removePlayer(payload.id);

            AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null, team: team });
            renderLobbyPlayerGrids();
        });
    }

    function ensureLobbyEl() {
        if (_lobbyEl) return _lobbyEl;
        _lobbyEl = document.createElement('div');
        _lobbyEl.id = 'cn-lobby';
        document.body.appendChild(_lobbyEl);
        return _lobbyEl;
    }

    function renderLobbyScreen() {
        setScreen('lobby');
        _registrationOpen = true;
        if (_rootEl) _rootEl.style.display = 'none';
        if (AGP.lobby && typeof AGP.lobby.open === 'function') AGP.lobby.open();
        wireCommentListenerForJoining();

        var root = ensureLobbyEl();
        root.style.display = 'flex';
        root.innerHTML =
            '<div class="cn-lobby-header">' +
                '<div class="cn-lobby-header-title">' + escapeHtml(GAME_NAME) + '</div>' +
                '<div class="cn-lobby-live"><span class="cn-lobby-live-dot"></span><span>LIVE</span></div>' +
            '</div>' +

            '<div class="cn-lobby-waitbar">' +
                '<div class="cn-lobby-wait-pill"><span class="dot"></span><span class="txt">في انتظار اللاعبين</span></div>' +
            '</div>' +

            '<div class="cn-lobby-main">' +
                '<div class="cn-lobby-panels">' +
                    '<div class="cn-lobby-team cn-team1">' +
                        '<div class="cn-lobby-team-head">' +
                            '<span class="cn-lobby-team-name">' + escapeHtml(_settings.team1Name) + '</span>' +
                            '<div class="cn-lobby-keyword-pill"><span class="lbl">كلمة الدخول</span><span class="val">' + escapeHtml(_settings.team1Keyword) + '</span></div>' +
                            '<div class="cn-lobby-count-pill"><span class="lbl">اللاعبون</span><span class="val" id="cn-lobby-count-team1"></span></div>' +
                        '</div>' +
                        '<div class="cn-lobby-grid" id="cn-lobby-grid-team1"></div>' +
                    '</div>' +

                    '<div class="cn-lobby-team cn-team2">' +
                        '<div class="cn-lobby-team-head">' +
                            '<span class="cn-lobby-team-name">' + escapeHtml(_settings.team2Name) + '</span>' +
                            '<div class="cn-lobby-keyword-pill"><span class="lbl">كلمة الدخول</span><span class="val">' + escapeHtml(_settings.team2Keyword) + '</span></div>' +
                            '<div class="cn-lobby-count-pill"><span class="lbl">اللاعبون</span><span class="val" id="cn-lobby-count-team2"></span></div>' +
                        '</div>' +
                        '<div class="cn-lobby-grid" id="cn-lobby-grid-team2"></div>' +
                    '</div>' +
                '</div>' +

                '<div id="cn-lobby-actions">' +
                    '<button type="button" id="cn-lobby-back-platform-btn" class="cn-lobby-btn-platform"><span>→</span><span>العودة للرئيسية</span></button>' +
                    '<button type="button" id="cn-start-round-btn" class="cn-lobby-btn-start" disabled>إنهاء الدخول وبدء المباراة</button>' +
                '</div>' +
            '</div>';

        renderLobbyPlayerGrids();

        el('cn-lobby-back-platform-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('cn-start-round-btn').addEventListener('click', function () {
            _registrationOpen = false;
            startNewMatch();
            renderMatchScreen();
        });
    }

    /* ======================================================================
     *  6) الاستماع لأحداث المنصة العامة (اتصال البث)
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
                    renderLobbyScreen();
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
     *  7) شاشة اللعب (Match Screen) -- التصميم البصري منسوخ بالحرف من
     *     Claude Design (Codenames Stream Overlay.dc.html)؛ المنطق أدناه
     *     هو منطق اللعبة الحقيقي الكامل المتفق عليه (بداية عشوائية بدون
     *     تكرار، ريست قبل أول تلميح، أوامر شات حقيقية للتلميح/التأكيد/
     *     التحديد/التخطي، قواعد فتح الصناديق، الفوز/الخسارة، تعيين
     *     السباي ماستر والمؤكّد يدويًا).
     *
     *     ⚠️ لسا مو موجود (خارج نطاق هذا التنفيذ): نظام QR/صفحة الجوال
     *     الخاصة بعرض الخريطة السرية على جوال السباي ماستر (يحتاج بنية
     *     منفصلة كما اتفقنا)، وشاشة فائز مستقلة مطابقة لمعيار باقي ألعاب
     *     المنصة (حاليًا بانر بسيط داخل نفس الشاشة).
     * ==================================================================== */
    var _matchEl = null;
    var _matchCommentUnsub = null;
    var _matchUI = { settingsOpen: false, modal: null };

    // بنك كلمات موسّع (998 كلمة) -- مزوَّد من صاحب المشروع
    var WORD_POOL = [
        'أب', 'أبجورة', 'أبد', 'أبيض', 'أتلانتيس', 'أثر', 'أحمر', 'أخ',
        'أخت', 'أخدود', 'أخضر', 'أخطبوط', 'أديب', 'أرز', 'أرض', 'أرضية',
        'أرنب', 'أريكة', 'أزرق', 'أزل', 'أسبوع', 'أسد', 'أسطورة', 'أسود',
        'أصفر', 'أصلي', 'أفعى', 'أفق', 'أفوكادو', 'أقحوان', 'أكاديمية', 'ألبوم',
        'ألف', 'ألفية', 'أم', 'أمازون', 'أمام', 'أمل', 'أمير', 'أمين',
        'أناناس', 'أنبوب', 'أوبرا', 'أورانجوتان', 'أورانوس', 'إبرة', 'إبريق', 'إسعاف',
        'إسفنج', 'إسمنت', 'إشارة', 'إطار', 'إطفاء', 'إعصار', 'إقامة', 'إمارة',
        'إمبراطور', 'إيصال', 'ابرة', 'ابن', 'ابن آوى', 'ابنة', 'استراليا', 'امرأة',
        'بئر', 'باب', 'بابايا', 'بابونج', 'باحث', 'باذنجان', 'بارد', 'بارومتر',
        'بارون', 'بازلاء', 'بامية', 'ببغاء', 'بجعة', 'بحث', 'بحر', 'بحيرة',
        'بذرة', 'براد', 'برتقال', 'برتقالي', 'برج', 'برد', 'برق', 'برقوق',
        'برقّية', 'بركان', 'برميل', 'برهة', 'بروش', 'بروفيسور', 'بروكلي', 'بريطانيا',
        'بساط', 'بسكويت', 'بصل', 'بطارية', 'بطاطس', 'بطاقة', 'بطة', 'بطريق',
        'بطل', 'بطيء', 'بطيخ', 'بعوضة', 'بعيد', 'بغل', 'بقدونس', 'بقرة',
        'بقعة', 'بلبل', 'بلشون', 'بلوط', 'بناء', 'بنت', 'بنجر', 'بندق',
        'بندول', 'بنطال', 'بنفسجي', 'بنك', 'بني', 'بهارات', 'بواب', 'بوابة',
        'بوصلة', 'بومة', 'بيت', 'بيداء', 'بيض', 'بيضة', 'بيولوجي', 'تأشيرة',
        'تاج', 'تاجر', 'تبغ', 'تحت', 'تذكرة', 'تراب', 'ترمس', 'ترمومتر',
        'تسونامي', 'تفاحة', 'تقاطع', 'تقرير', 'تقليد', 'تل', 'تلسكوب', 'تلفاز',
        'تمر', 'تمساح', 'تنورة', 'تنين', 'توت', 'تيس', 'تين', 'تين شوكي',
        'ثانية', 'ثرية', 'ثعبان', 'ثعلب', 'ثقب أسود', 'ثقيل', 'ثلاجة', 'ثلج',
        'ثمرة', 'ثوب', 'ثور', 'ثوم', 'جار', 'جاسوس', 'جاف', 'جامعة',
        'جاموس', 'جبل', 'جبن', 'جد', 'جدار', 'جدة', 'جديد', 'جذر',
        'جذع', 'جراح', 'جرادة', 'جرار', 'جرجير', 'جرذ', 'جرس', 'جريب فروت',
        'جزر', 'جزيرة', 'جسر', 'جمعة', 'جمل', 'جميل', 'جندي', 'جنوب',
        'جني', 'جهل', 'جواز', 'جوافة', 'جورب', 'جوز', 'جوز الهند', 'جولة',
        'جيب', 'جيولوجي', 'حاجب', 'حاجز', 'حاد', 'حار', 'حارة', 'حارس',
        'حاسوب', 'حافلة', 'حاكم', 'حاوية', 'حب', 'حبر', 'حبل', 'حبوب',
        'حجلة', 'حداد', 'حديقة', 'حذاء', 'حر', 'حرباء', 'حرور', 'حزام',
        'حزن', 'حزين', 'حساء', 'حشرة', 'حصان', 'حصن', 'حصى', 'حصيرة',
        'حظ', 'حفل', 'حفيت', 'حقبة', 'حقيبة', 'حلاق', 'حلقة', 'حلو',
        'حلوى', 'حليب', 'حمار', 'حمار وحشي', 'حمامة', 'حمص', 'حوت', 'حورية',
        'حوض', 'حول', 'خاتم', 'خادم', 'خارج', 'خال', 'خالة', 'خبز',
        'خبير', 'خرزة', 'خرطوم', 'خروب', 'خروف', 'خريطة', 'خريف', 'خزان',
        'خزانة', 'خس', 'خشبة', 'خطأ', 'خفاش', 'خفيف', 'خل', 'خلاط',
        'خلخال', 'خلف', 'خلية', 'خنزير', 'خوخ', 'خوف', 'خيار', 'خياط',
        'خيط', 'دائرة', 'داخل', 'دب', 'دباسة', 'دبلوم', 'دبور', 'دبوس',
        'دجاج', 'دجاجة', 'دخان', 'دخن', 'دراجة', 'درج', 'درع', 'دفء',
        'دفتر', 'دقيقة', 'دكان', 'دكتور', 'دكتوراه', 'دلاية', 'دلو', 'دهان',
        'دود', 'دورة', 'دوق', 'دولار', 'دولة', 'دولفين', 'دوم', 'ديك',
        'دينار', 'ديناصور', 'ديوان', 'ذئب', 'ذبابة', 'ذرة', 'ذكاء', 'ذهب',
        'ذهبي', 'ذوبابة', 'رئيس', 'رائد', 'رافعة', 'راقص', 'راية', 'ربان',
        'ربع', 'ربيع', 'رجل', 'رحلة', 'رخصة', 'رخيص', 'رسالة', 'رسام',
        'رشاش', 'رصيد', 'رصيف', 'رضيع', 'رطب', 'رطوبة', 'رعد', 'رف',
        'رمادي', 'رمان', 'رمح', 'رمل', 'رواية', 'روبيان', 'روليت', 'رياضياتي',
        'ريال', 'ريح', 'ريحان', 'ريشة', 'زبدة', 'زحل', 'زر', 'زرافة',
        'زعتر', 'زعيم', 'زقاق', 'زلزال', 'زمرد', 'زمن', 'زنجبيل', 'زهر',
        'زهرة', 'زوبعة', 'زيت', 'زيتون', 'سائق', 'ساحة', 'ساحر', 'ساحرة',
        'ساعة', 'سبانخ', 'سبيكة', 'ستارة', 'سترة', 'سجادة', 'سجل', 'سجن',
        'سحاب', 'سحر', 'سحلية', 'سد', 'سدادة', 'سدر', 'سديم', 'سرير',
        'سريع', 'سعيد', 'سفح', 'سفر', 'سفرة', 'سفير', 'سفينة', 'سقف',
        'سكر', 'سكين', 'سلحفاة', 'سلسلة', 'سلطان', 'سلطة', 'سلك', 'سلم',
        'سليم', 'سم', 'سماء', 'سماعة', 'سمانة', 'سمسار', 'سمسم', 'سمك',
        'سمن', 'سموم', 'سنة', 'سنجاب', 'سند', 'سهل', 'سوار', 'سودان',
        'سوسن', 'سوق', 'سياج', 'سيارة', 'سيجارة', 'سيد قشطة', 'سينما', 'شاب',
        'شاحن', 'شاحنة', 'شارع', 'شاشة', 'شاطئ', 'شاعر', 'شامبو', 'شاي',
        'شباك', 'شبت', 'شبح', 'شبكة', 'شبه جزيرة', 'شتاء', 'شجاعة', 'شجرة',
        'شجيرة', 'شرطة', 'شرطي', 'شرفة', 'شرق', 'شرنقة', 'شروق', 'شريط',
        'شريك', 'شعار', 'شعب', 'شعير', 'شفرة', 'شفق', 'شقائق النعمان', 'شقة',
        'شلال', 'شماعة', 'شمال', 'شمام', 'شمبانزي', 'شمس', 'شمعة', 'شهاب',
        'شهادة', 'شهر', 'شوكة', 'شوكولاتة', 'شيخ', 'شيك', 'صابون', 'صاحب',
        'صاروخ', 'صاعقة', 'صافرة', 'صباح', 'صحراء', 'صحفي', 'صحن', 'صحيح',
        'صخر', 'صديق', 'صرصور', 'صعب', 'صغير', 'صقر', 'صقيع', 'صليب',
        'صنبور', 'صندوق', 'صنوبر', 'صوت', 'صورة', 'صولجان', 'صياد', 'صيب',
        'صيدلي', 'صيدلية', 'صيصان', 'صيف', 'صينية', 'ضابط', 'ضب', 'ضباب',
        'ضبع', 'ضحى', 'ضعيف', 'ضفدع', 'ضوء', 'ضيق', 'طائرة', 'طابع',
        'طاقة', 'طالب', 'طاولة', 'طاووس', 'طباخ', 'طباشير', 'طبلة', 'طبيب',
        'طرد', 'طرف', 'طريق', 'طفل', 'طماطم', 'طنجرة', 'طوب', 'طويل',
        'طيار', 'طين', 'ظرف', 'ظلام', 'ظهر', 'عازف', 'عاصف', 'عاصفة',
        'عاصمة', 'عالم', 'عام', 'عامل', 'عباءة', 'عبقري', 'عبور', 'عجل',
        'عجوز', 'عداد', 'عدس', 'عدسة', 'عدو', 'عربة', 'عسل', 'عشب',
        'عصر', 'عصفور', 'عصير', 'عضو', 'عطارد', 'عقد', 'عقرب', 'عكاز',
        'علامة', 'علم', 'عم', 'عمارة', 'عمة', 'عمدة', 'عمل', 'عملاق',
        'عملة', 'عمود', 'عميد', 'عميل', 'عنب', 'عنكبوت', 'عيادة', 'غابة',
        'غاز', 'غالي', 'غبار', 'غراء', 'غراب', 'غرب', 'غروب', 'غزال',
        'غسالة', 'غسق', 'غصن', 'غضب', 'غطاء', 'غلاية', 'غني', 'غواصة',
        'غوريلا', 'غيار', 'غيث', 'غيم', 'فأر', 'فأرة', 'فاتورة', 'فارس',
        'فاصوليا', 'فانوس', 'فجر', 'فراش', 'فراشة', 'فراولة', 'فرجار', 'فرح',
        'فرشاة', 'فرع', 'فرن', 'فرنسا', 'فستان', 'فستق', 'فصل', 'فضاء',
        'فضة', 'فضي', 'فقمة', 'فقير', 'فلة', 'فلتر', 'فلفل', 'فلكي',
        'فم', 'فن', 'فنان', 'فنجان', 'فندق', 'فهد', 'فوق', 'فول',
        'فول سوداني', 'فوهة', 'فيزيائي', 'فيش', 'فيل', 'فيلسوف', 'قائد', 'قارب',
        'قارة', 'قاضي', 'قانون', 'قبعة', 'قبيح', 'قديم', 'قرد', 'قرش',
        'قرص', 'قرط', 'قرفة', 'قرن', 'قرنبيط', 'قرنفل', 'قريب', 'قرية',
        'قزم', 'قشطة', 'قصب', 'قصبة', 'قصة', 'قصر', 'قصيدة', 'قصير',
        'قطار', 'قطب', 'قطة', 'قطن', 'قفاز', 'قفر', 'قفل', 'قلادة',
        'قلعة', 'قلم', 'قماش', 'قمة', 'قمح', 'قمر', 'قمع', 'قميص',
        'قناة', 'قنبلة', 'قنديل البحر', 'قنصل', 'قنفذ', 'قنينة', 'قهوة', 'قوقع',
        'قوي', 'قيصر', 'قيظ', 'كأس', 'كابش', 'كاتب', 'كاجو', 'كازينو',
        'كاميرا', 'كبير', 'كتاب', 'كتان', 'كرة', 'كرز', 'كرسي', 'كرفس',
        'كركم', 'كريم', 'كزبرة', 'كشاف', 'كعك', 'كلب', 'كلية', 'كماشة',
        'كمون', 'كنيسة', 'كهف', 'كوب', 'كوسا', 'كوكب', 'كون', 'كيس',
        'كيلو', 'كيميائي', 'كيوي', 'لؤلؤ', 'لامع', 'لبن', 'لجوء', 'لحاف',
        'لحظة', 'لحم', 'لعبة', 'لفح', 'لقلق', 'لوحة', 'لوز', 'لون',
        'ليزر', 'ليل', 'ليمون', 'مأدبة', 'مؤتمر', 'مؤرخ', 'ماء', 'ماجستير',
        'مارس', 'ماس', 'ماشية', 'ماعز', 'مانجو', 'مبرمج', 'مبشرة', 'متجر',
        'متحف', 'مترو', 'متسخ', 'مثلث', 'مجرة', 'مجمع', 'مجهر', 'مجوهرات',
        'محار', 'محاسب', 'محافظ', 'محام', 'محامي', 'محبس', 'محرر', 'محطة',
        'محفظة', 'محكمة', 'محل', 'محلل', 'محمصة', 'محول', 'محيط', 'مختبر',
        'مخترع', 'مخرج', 'مخزن', 'مخطط', 'مخفر', 'مدرسة', 'مدير', 'مدينة',
        'مذنب', 'مذياع', 'مذيع', 'مرآة', 'مراجع', 'مراسل', 'مراقب', 'مربع',
        'مربى', 'مرجان', 'مرض', 'مركب', 'مركبة', 'مركز', 'مروحية', 'مريخ',
        'مريض', 'مزارع', 'مزلاج', 'مساء', 'مسبح', 'مستثمر', 'مستشار', 'مستشفى',
        'مستودع', 'مسجد', 'مسرح', 'مسطرة', 'مسمار', 'مسير', 'مشبك', 'مشتري',
        'مشرف', 'مشط', 'مشمش', 'مصارع', 'مصباح', 'مصر', 'مصرف', 'مصعد',
        'مصفاة', 'مصمم', 'مصنع', 'مضخة', 'مضرب', 'مضيق', 'مطار', 'مطر',
        'مطرقة', 'مطعم', 'مظلة', 'معجون', 'معدن', 'معرض', 'معطف', 'معلم',
        'معماري', 'معهد', 'مغارة', 'مغني', 'مفتاح', 'مفتش', 'مفصلة', 'مفك',
        'مفكرة', 'مقال', 'مقبس', 'مقبض', 'مقشرة', 'مقص', 'مقعد', 'مقلاة',
        'مقهى', 'مكتب', 'مكتبة', 'مكتشف', 'مكنسة', 'مكواة', 'ملاءة', 'ملاح',
        'ملاك', 'ملح', 'ملحن', 'ملصق', 'ملعب', 'ملعقة', 'ملف', 'ملفوف',
        'ملك', 'ملوخية', 'ممثل', 'ممر', 'ممرض', 'ممسحة', 'مناديل', 'منبه',
        'منتج', 'منتزه', 'منحدر', 'منزل', 'منشار', 'منشفة', 'منصة', 'منطاد',
        'منظار', 'منعطف', 'مها', 'مهرجان', 'مهندس', 'موت', 'موج', 'موز',
        'موسيقى', 'موسيقي', 'موظف', 'موقد', 'ميدالية', 'ميدان', 'ميرمية', 'ميزان',
        'ميناء', 'نائب', 'نادي', 'نارية', 'ناطحة', 'ناظور', 'نافذة', 'ناقد',
        'ناي', 'نبتة', 'نبتون', 'نجار', 'نجم', 'نجم البحر', 'نحات', 'نحلة',
        'نخلة', 'ندوة', 'ندى', 'نرجس', 'نزهة', 'نسر', 'نسيم', 'نظارة',
        'نظيف', 'نعامة', 'نعل', 'نعناع', 'نفق', 'نقود', 'نمر', 'نملة',
        'نهر', 'نورس', 'نيزك', 'نيويورك', 'هاتف', 'هجرة', 'هدهد', 'هرم',
        'هزة', 'هضبة', 'هواء', 'هوليوود', 'هوية', 'واحة', 'وادي', 'واسع',
        'والي', 'وجه', 'وحش', 'وحيد القرن', 'ودق', 'وردة', 'ورشة', 'ورقة',
        'وزة', 'وزير', 'وسادة', 'وشاح', 'وشق', 'وعاء', 'وعل', 'وقت',
        'وكيل', 'ولد', 'وليمة', 'ياسمين', 'ياقة', 'ياقوت', 'يخت', 'يرقة',
        'يسار', 'يمين', 'ينبوع', 'يورو', 'يوسفي', 'يوم'
    ];

    function shuffleArray(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    function otherTeam(team) { return (team === TEAM1) ? TEAM2 : TEAM1; }
    function roleOfTeam(team) { return (team === TEAM1) ? 'red' : 'blue'; }

    var _match = {
        words: [],                          // [[word, role], ...] x25 -- role: red|blue|neutral|assassin
        revealed: {},                        // idx -> true
        turn: null,                          // TEAM1 | TEAM2
        countTeam1: 0,
        countTeam2: 0,
        matchStarted: false,                 // يصير true بعد أول تلميح رسمي -- يعطّل زر الريست
        gameOver: false,
        winnerTeam: null,
        loseReason: null,                    // 'assassin' | 'boxes'
        activeHint: null,                    // { word, number }
        spymaster: {},                       // { team1: playerId, team2: playerId }
        confirmer: {},                       // { team1: playerId, team2: playerId }
        selections: {},                      // idx -> [playerId, ...]
        events: { team1: [], team2: [] },
        lastStartingTeam: null,              // لمنع تكرار نفس الفريق البادئ بمباراة جديدة تالية
        justRevealed: [],                    // [idx, ...] الصناديق المكشوفة بآخر دورة تحديث فقط -- لتشغيل حركة الانبثاق مرة وحدة
        previousWords: null                  // كلمات آخر لوحة -- تُستبعد بالكامل من توليد اللوحة الجديدة (ريست/مباراة جديدة)
    };

    /* ---------------------------------------------------------------------
       الصوت -- نفس نمط games/tribe-roulette (Audio عناصر حقيقية + حماية
       iOS الموثَّقة هناك: عدم استدعاء play() إطلاقاً لو مستوى الصوت صفر،
       لأن مجرد الاستدعاء على iOS يسكت أي صوت خلفية شغّال بجهاز الاستريمر).
       لا إعداد صوت حي هنا (كود نيمز لعبة غير shell، بدون AGP.gameShell) --
       مستوى ثابت معقول بدل ذلك.
    --------------------------------------------------------------------- */
    var SOUND_BASE = 'sounds/';
    var _sounds = {
        correct: new Audio(SOUND_BASE + 'correct.wav'),
        wrong: new Audio(SOUND_BASE + 'wrong.wav'),
        assassin: new Audio(SOUND_BASE + 'assassin.wav')
    };
    var SOUND_VOLUME = 0.7;

    function playSound(name) {
        var a = _sounds[name];
        if (!a || SOUND_VOLUME <= 0) return;
        try {
            a.volume = SOUND_VOLUME;
            a.currentTime = 0;
            var p = a.play();
            if (p && typeof p.catch === 'function') {
                p.catch(function () { /* المتصفح يمنع أحياناً تشغيلاً تلقائياً قبل أول تفاعل مستخدم -- تجاهل صامت */ });
            }
        } catch (err) { /* تجاهل صامت -- الصوت طبقة تحسين، لا يوقف اللعبة */ }
    }

    function pushEvent(team, text) {
        var list = _match.events[team];
        list.push(text);
        if (list.length > 20) list.shift();
    }

    /* ---------------------------------------------------------------------
       نظام QR السباي ماستر -- اتصال بقناة websocket/room-relay-server.js
       المنفصلة تماماً عن بروتوكول التيك توك. بلا أي هوية تيك توك على
       الجوال: اسم يدوي + طلب + موافقة يدوية من الاستريمر فقط. كل سباي
       ماستر (أي فريق) يشوف الصناديق الـ25 كاملة (قاعدة اللعبة الأصلية).
    --------------------------------------------------------------------- */
    var ROOM_RELAY_WS_URL = 'wss://project-testing-akds.onrender.com/ws/room-relay';
    var _relaySocket = null;
    var _relayRoomId = null;
    var _spymasterRequests = []; // { requestId, name, team }

    function ensureRelayRoomId() {
        if (_relayRoomId) return _relayRoomId;
        var room = (AGP.roomsManager && typeof AGP.roomsManager.getCurrentRoom === 'function') ? AGP.roomsManager.getCurrentRoom() : null;
        _relayRoomId = room ? room.id : ('cn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
        return _relayRoomId;
    }

    function relaySend(obj) {
        if (_relaySocket && _relaySocket.readyState === WebSocket.OPEN) {
            try { _relaySocket.send(JSON.stringify(obj)); } catch (err) { AGP.log('[AGP Codenames] relay send failed', err); }
        }
    }

    function connectRelay() {
        if (_relaySocket || typeof WebSocket === 'undefined') return;
        var room = ensureRelayRoomId();
        _relaySocket = new WebSocket(ROOM_RELAY_WS_URL);

        _relaySocket.addEventListener('open', function () { relaySend({ type: 'join', room: room }); });

        _relaySocket.addEventListener('message', function (evt) {
            var msg;
            try { msg = JSON.parse(evt.data); } catch (err) { return; }
            if (!msg || msg.type !== 'spymaster_request') return;
            if (_spymasterRequests.some(function (r) { return r.requestId === msg.requestId; })) return;
            _spymasterRequests.push({ requestId: msg.requestId, name: msg.name, team: msg.team });
            if (_screen === 'match' && _matchUI.modal === 'requests') renderMatchScreen();
        });

        _relaySocket.addEventListener('close', function () { _relaySocket = null; });
    }

    function broadcastBoardToSpymasters() {
        relaySend({ type: 'board_update', board: _match.words });
    }

    function approveSpymasterRequest(requestId) {
        var req = _spymasterRequests.filter(function (r) { return r.requestId === requestId; })[0];
        if (!req) return;
        relaySend({ type: 'spymaster_approve', requestId: requestId, board: _match.words });
        pushEvent(req.team, req.name + ' وافق الاستريمر على طلبه سباي ماستر (جوال)');
        _spymasterRequests = _spymasterRequests.filter(function (r) { return r.requestId !== requestId; });
        renderMatchScreen();
    }

    function rejectSpymasterRequest(requestId) {
        relaySend({ type: 'spymaster_reject', requestId: requestId });
        _spymasterRequests = _spymasterRequests.filter(function (r) { return r.requestId !== requestId; });
        renderMatchScreen();
    }

    function spymasterQrUrl() {
        var room = ensureRelayRoomId();
        return new URL('spymaster.html?room=' + encodeURIComponent(room), window.location.href).href;
    }

    function buildEvenVariants(count) {
        var arr = [];
        for (var i = 0; i < count; i++) arr.push((i % 2) + 1); // توزيع متساوٍ قدر الإمكان بين الصورتين (1/2)
        return shuffleArray(arr);
    }

    function generateBoard(startingTeam) {
        // ⚠️ الكلمات الـ25 الجديدة تُستبعد منها كل كلمات اللوحة السابقة
        // بالكامل (لو موجودة) -- يضمن إن الريست/المباراة الجديدة تجيب
        // كلمات مختلفة 100% عن آخر لوحة، وليس بس عشوائية فيها احتمال
        // تكرار ضئيل. (التفرّد الداخلي بين الـ25 كلمة بنفس اللوحة مضمون
        // أصلاً بما إن WORD_POOL نفسه بلا أي تكرار والاختيار بدون إرجاع.)
        var pool = _match.previousWords
            ? WORD_POOL.filter(function (w) { return _match.previousWords.indexOf(w) === -1; })
            : WORD_POOL;
        if (pool.length < 25) pool = WORD_POOL; // احتياط نظري فقط -- بنك الكلمات كبير جداً ليصل لهذا الحد

        var words = shuffleArray(pool).slice(0, 25);
        var otherT = otherTeam(startingTeam);
        var roles = []
            .concat(Array(9).fill(roleOfTeam(startingTeam)))
            .concat(Array(8).fill(roleOfTeam(otherT)))
            .concat(Array(7).fill('neutral'))
            .concat(['assassin']);
        roles = shuffleArray(roles);

        var redVariants = buildEvenVariants(roles.filter(function (r) { return r === 'red'; }).length);
        var blueVariants = buildEvenVariants(roles.filter(function (r) { return r === 'blue'; }).length);
        var redI = 0, blueI = 0;

        _match.words = words.map(function (w, i) {
            var role = roles[i];
            var variant = 1;
            if (role === 'red') variant = redVariants[redI++];
            else if (role === 'blue') variant = blueVariants[blueI++];
            return [w, role, variant];
        });
        _match.previousWords = words;
        _match.revealed = {};
        _match.selections = {};
        _match.countTeam1 = (startingTeam === TEAM1) ? 9 : 8;
        _match.countTeam2 = (startingTeam === TEAM2) ? 9 : 8;
        _match.turn = startingTeam;
        _match.activeHint = null;
        _match.gameOver = false;
        _match.winnerTeam = null;
        _match.loseReason = null;
        broadcastBoardToSpymasters();
    }

    function pickRandomStartingTeam() {
        if (_match.lastStartingTeam === null) return Math.random() < 0.5 ? TEAM1 : TEAM2;
        return otherTeam(_match.lastStartingTeam);
    }

    function startNewMatch(keepRoles) {
        var starting = pickRandomStartingTeam();
        _match.lastStartingTeam = starting;
        _match.matchStarted = false;
        if (!keepRoles) { _match.spymaster = {}; _match.confirmer = {}; }
        _match.events = { team1: [], team2: [] };
        generateBoard(starting);
        startHintTimer();
    }

    function resetBoard() {
        if (_match.matchStarted || _match.gameOver) return;
        var newStarting = otherTeam(_match.turn);
        generateBoard(newStarting);
        startHintTimer();
        renderMatchScreen();
    }

    function countRemaining(role) {
        var n = 0;
        _match.words.forEach(function (pair, i) { if (pair[1] === role && !_match.revealed[i]) n++; });
        return n;
    }

    /* ---------------------------------------------------------------------
       منطق كشف الصندوق -- يرجع 'continue' لو يقدر يكمل فتح صناديق ثانية
       بنفس رسالة التأكيد، أو 'stop' لو لازم يتوقف فورًا (محايد/فريق ثاني/قاتل)
    --------------------------------------------------------------------- */
    function openBox(idx) {
        if (_match.revealed[idx] || _match.gameOver) return 'stop';
        var pair = _match.words[idx];
        if (!pair) return 'stop';
        var role = pair[1];
        _match.revealed[idx] = true;
        _match.justRevealed.push(idx);
        delete _match.selections[idx];

        if (role === 'assassin') {
            _match.gameOver = true;
            _match.winnerTeam = otherTeam(_match.turn);
            _match.loseReason = 'assassin';
            pushEvent(_match.turn, 'فتح فريقهم الصندوق الأسود -- خسارة فورية 💀');
            playSound('assassin');
            stopMatchTimers();
            awardWinnerPoints();
            return 'stop';
        }

        if (role === roleOfTeam(_match.turn)) {
            if (_match.turn === TEAM1) _match.countTeam1--; else _match.countTeam2--;
            pushEvent(_match.turn, 'كشف «' + pair[0] + '» ✓ (صندوق صحيح)');
            playSound('correct');
            if (countRemaining(roleOfTeam(_match.turn)) === 0) {
                _match.gameOver = true;
                _match.winnerTeam = _match.turn;
                _match.loseReason = 'boxes';
                stopMatchTimers();
                awardWinnerPoints();
            }
            return 'continue';
        }

        if (role === 'neutral') {
            pushEvent(_match.turn, 'كشف «' + pair[0] + '» -- صندوق محايد، انتهى الدور');
            playSound('wrong');
            return 'stop';
        }

        // صندوق الفريق الثاني
        var otherT = otherTeam(_match.turn);
        if (otherT === TEAM1) _match.countTeam1--; else _match.countTeam2--;
        pushEvent(_match.turn, 'كشف «' + pair[0] + '» -- صندوق الفريق الثاني، انتهى الدور');
        playSound('wrong');
        if (countRemaining(roleOfTeam(otherT)) === 0) {
            _match.gameOver = true;
            _match.winnerTeam = otherT;
            _match.loseReason = 'boxes';
            stopMatchTimers();
            awardWinnerPoints();
        }
        return 'stop';
    }

    /* ---------------------------------------------------------------------
       نقاط الفوز -- عبر AGP.scoreManager المشترك (نفس نظام النقاط
       بالمنصة، js/agp-score-manager.js) بدل أي حساب مستقل. كل لاعب
       بالفريق الفائز ياخذ نفس عدد النقاط.
    --------------------------------------------------------------------- */
    var WINNER_POINTS_PER_PLAYER = 3;

    function awardWinnerPoints() {
        if (!_match.winnerTeam || !AGP.scoreManager) return;
        getTeamPlayers(_match.winnerTeam).forEach(function (p) {
            AGP.scoreManager.addPoints(p.id, WINNER_POINTS_PER_PLAYER);
        });
    }

    function switchTurnIfNotOver() {
        if (_match.gameOver) return;
        _match.turn = otherTeam(_match.turn);
        _match.activeHint = null;
        _match.selections = {};
    }

    /* ---------------------------------------------------------------------
       مؤقّتات الدور -- عبر AGP.timerManager المشترك (js/agp-timer-manager.js)
       بدل إدارة setInterval يدوياً. مؤقّتان مسمّيان لا يشتغلان بنفس الوقت
       أبداً: وقت التلميح (قبل ما السباي ماستر يرسل)، ووقت الاختيار/التأكيد
       (بعد إرسال التلميح). انتهاء أي منهم بدون فعل = انتقال فوري للدور.
    --------------------------------------------------------------------- */
    var TIMER_HINT = 'codenames-hint';
    var TIMER_GUESS = 'codenames-guess';
    var _matchTimersWired = false;

    function startHintTimer() {
        AGP.timerManager.stop(TIMER_GUESS);
        AGP.timerManager.start(TIMER_HINT, _settings.hintSeconds);
    }

    function startGuessTimer() {
        AGP.timerManager.stop(TIMER_HINT);
        AGP.timerManager.start(TIMER_GUESS, _settings.guessSeconds);
    }

    function stopMatchTimers() {
        AGP.timerManager.stop(TIMER_HINT);
        AGP.timerManager.stop(TIMER_GUESS);
    }

    function formatSeconds(s) {
        s = Math.max(0, s);
        var m = Math.floor(s / 60), r = s % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    function renderTimerPillGroup(key, options) {
        return options.map(function (opt) {
            var active = (_settings[key] === opt.value) ? ' cn-pill-active' : '';
            return '<button type="button" class="cn-pill-btn' + active + '" data-key="' + key + '" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');
    }

    function updateTimerTickDisplay(remainingSeconds) {
        var valEl = el('cn-match-timer-val');
        if (valEl) valEl.textContent = formatSeconds(remainingSeconds);
    }

    function handleMatchTimerEnded(timerName) {
        if (_screen !== 'match' || _match.gameOver) return;
        if (timerName === TIMER_HINT) {
            pushEvent(_match.turn, 'ما أرسل السباي ماستر التلميح بالوقت المحدد -- انتقل الدور');
        } else if (timerName === TIMER_GUESS) {
            pushEvent(_match.turn, 'انتهى وقت الاختيار قبل التأكيد الكامل -- انتقل الدور');
        } else {
            return;
        }
        switchTurnIfNotOver();
        startHintTimer();
        renderMatchScreen();
    }

    function wireMatchTimerListeners() {
        if (_matchTimersWired) return;
        _matchTimersWired = true;
        AGP.events.on('timer:ended', function (payload) {
            if (payload && payload.name) handleMatchTimerEnded(payload.name);
        });
        AGP.events.on('timer:tick', function (payload) {
            if (!payload || _screen !== 'match') return;
            if (payload.name !== TIMER_HINT && payload.name !== TIMER_GUESS) return;
            updateTimerTickDisplay(payload.remainingSeconds);
        });
    }

    function processConfirmIndices(indices) {
        for (var i = 0; i < indices.length; i++) {
            if (_match.gameOver) break;
            var result = openBox(indices[i] - 1);
            if (result === 'stop') { switchTurnIfNotOver(); if (!_match.gameOver) startHintTimer(); break; }
        }
        renderMatchScreen();
    }

    /* ---------------------------------------------------------------------
       تحليل وأوامر الشات أثناء المباراة
    --------------------------------------------------------------------- */
    function getPlayerTeamById(id) {
        var p = findPlayerById(id);
        return p ? p.team : null;
    }

    function applyHint(word, number) {
        _match.matchStarted = true;
        _match.activeHint = { word: word, number: number };
        pushEvent(_match.turn, 'أعطى التلميح «' + word + ' ' + number + '»');
        startGuessTimer();
        renderMatchScreen();
    }

    function addSelection(idx, playerId) {
        if (!_match.selections[idx]) _match.selections[idx] = [];
        if (_match.selections[idx].indexOf(playerId) === -1) _match.selections[idx].push(playerId);
        renderMatchScreen();
    }

    function removeSelection(idx, playerId) {
        if (!_match.selections[idx]) return;
        _match.selections[idx] = _match.selections[idx].filter(function (id) { return id !== playerId; });
        renderMatchScreen();
    }

    function wireMatchCommentListener() {
        if (_matchCommentUnsub) return;
        _matchCommentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (_screen !== 'match' || _match.gameOver) return;
            if (!payload || typeof payload.text !== 'string' || !payload.id) return;

            var raw = payload.text.trim();
            var norm = normalizeArabicText(raw);
            var turn = _match.turn;
            var senderTeam = getPlayerTeamById(payload.id);
            var isActiveTeam = (senderTeam === turn);

            // تخطي -- المؤكّد فقط، فريق الدور فقط، لازم فيه تلميح نشط
            if (norm === 'تخطي') {
                if (isActiveTeam && _match.activeHint && payload.id === _match.confirmer[turn]) {
                    pushEvent(turn, 'تخطى بقية التخمين');
                    switchTurnIfNotOver();
                    startHintTimer();
                    renderMatchScreen();
                }
                return;
            }

            // تاكيد/تأكيد + أرقام -- المؤكّد فقط، فريق الدور فقط، لازم فيه تلميح نشط
            var confirmMatch = norm.match(/^تاكيد\s+(.+)$/);
            if (confirmMatch) {
                if (isActiveTeam && _match.activeHint && payload.id === _match.confirmer[turn]) {
                    var nums = confirmMatch[1].match(/\d{1,2}/g);
                    if (nums && nums.length) {
                        processConfirmIndices(nums.map(Number).filter(function (n) { return n >= 1 && n <= 25; }));
                    }
                }
                return;
            }

            // سحب + رقم -- أي عضو بالفريق النشط يسحب تحديده هو فقط
            var dropMatch = norm.match(/^سحب\s+(\d{1,2})$/);
            if (dropMatch) {
                if (isActiveTeam && _match.activeHint) {
                    var dIdx = Number(dropMatch[1]) - 1;
                    if (dIdx >= 0 && dIdx < 25 && !_match.revealed[dIdx]) removeSelection(dIdx, payload.id);
                }
                return;
            }

            // رقم صندوق لحاله -- تحديد/تصويت، أي عضو بالفريق النشط (والمؤكّد يقدر أيضًا)
            var pickMatch = norm.match(/^(\d{1,2})$/);
            if (pickMatch) {
                if (isActiveTeam && _match.activeHint) {
                    var sIdx = Number(pickMatch[1]) - 1;
                    if (sIdx >= 0 && sIdx < 25 && !_match.revealed[sIdx]) addSelection(sIdx, payload.id);
                }
                return;
            }

            // تلميح: رقم ثم كلمة (رقم بعد الكلمة أو ملتصق بها لا يُحسب رقمًا) -- السباي ماستر فقط، فريق الدور فقط، ما فيه تلميح نشط حاليًا
            var hintMatch = norm.match(/^(\d{1,2})\s+(\S.*)$/);
            if (hintMatch) {
                if (isActiveTeam && !_match.activeHint && payload.id === _match.spymaster[turn]) {
                    applyHint(hintMatch[2].trim(), Number(hintMatch[1]));
                }
                return;
            }
        });
    }

    /* ---------------------------------------------------------------------
       تعيين السباي ماستر/المؤكّد يدويًا من شاشة التحكم
    --------------------------------------------------------------------- */
    function assignRole(kind, team, playerId) {
        // kind: 'spymaster' | 'confirmer'
        _match[kind][team] = playerId;
        renderMatchScreen();
    }

    function clearRole(kind, team) {
        delete _match[kind][team];
        renderMatchScreen();
    }

    function ensureMatchEl() {
        if (_matchEl) return _matchEl;
        _matchEl = document.createElement('div');
        _matchEl.id = 'cn-match';
        document.body.appendChild(_matchEl);
        return _matchEl;
    }

    function fillForRole(role) {
        if (role === 'red') return 'revealed-t1';
        if (role === 'blue') return 'revealed-t2';
        if (role === 'neutral') return 'revealed-neutral';
        return 'revealed-assassin';
    }

    function tileIconSvg(role) {
        if (role === 'red' || role === 'blue') {
            return '<svg viewBox="0 0 32 32" fill="none" style="color:rgba(255,255,255,0.92)">' +
                '<path d="M16 7.5a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6Z" stroke="currentColor" stroke-width="1.8"></path>' +
                '<path d="M5.6 28.5c0-5.3 4.6-8.9 10.4-8.9s10.4 3.6 10.4 8.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>' +
                '<path d="M9.6 9.4h12.8M14.2 11.6h3.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>' +
            '</svg>';
        }
        if (role === 'neutral') {
            return '<svg viewBox="0 0 32 32" fill="none" style="color:#4d545f">' +
                '<path d="M16 7.5a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6Z" stroke="currentColor" stroke-width="1.8"></path>' +
                '<path d="M6.4 28.5c0-5.1 4.3-8.6 9.6-8.6s9.6 3.5 9.6 8.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>' +
                '<path d="M13.4 12.2c.7.8 4.5.8 5.2 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>' +
            '</svg>';
        }
        return '<svg viewBox="0 0 32 32" fill="none" style="color:#ff5d6c">' +
            '<path d="M16 4.6c5.9 0 9.6 4 9.6 9.2 0 3.3-1.4 5-2.7 6v3.2c0 1.4-1.1 2.5-2.5 2.5h-8.8c-1.4 0-2.5-1.1-2.5-2.5v-3.2c-1.3-1-2.7-2.7-2.7-6 0-5.2 3.7-9.2 9.6-9.2Z" stroke="currentColor" stroke-width="1.8"></path>' +
            '<circle cx="12.4" cy="14.2" r="2" fill="currentColor"></circle><circle cx="19.6" cy="14.2" r="2" fill="currentColor"></circle>' +
            '<path d="M13.4 21.4h5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>' +
        '</svg>';
    }

    function selectionBadgesHtml(idx) {
        var ids = _match.selections[idx];
        if (!ids || !ids.length) return '';
        return '<div class="cn-match-tile-selections">' +
            ids.slice(0, 5).map(function (pid) {
                var p = findPlayerById(pid);
                return '<span class="cn-match-tile-sel-avatar">' + escapeHtml(p ? playerInitial(p) : '؟') + '</span>';
            }).join('') +
        '</div>';
    }

    function renderGridHtml() {
        return _match.words.map(function (pair, i) {
            var word = pair[0], role = pair[1], variant = pair[2] || 1;
            var shown = !!_match.revealed[i];
            if (!shown) {
                return '<div class="cn-match-tile" data-idx="' + i + '">' +
                    '<span class="cn-match-tile-num">' + (i + 1) + '</span>' +
                    '<span class="cn-match-tile-word">' + escapeHtml(word) + '</span>' +
                    selectionBadgesHtml(i) +
                '</div>';
            }
            var popClass = (_match.justRevealed.indexOf(i) !== -1) ? ' cn-tile-pop' : '';
            var imgClass = 'cn-tile-img-' + role + ((role === 'red' || role === 'blue') ? ('-' + variant) : '');
            return '<div class="cn-match-tile ' + fillForRole(role) + popClass + '" data-idx="' + i + '">' +
                '<span class="cn-match-tile-num">' + (i + 1) + '</span>' +
                '<div class="cn-match-tile-icon">' + tileIconSvg(role) + '</div>' +
                '<span class="cn-match-tile-word">' + escapeHtml(word) + '</span>' +
                '<div class="cn-match-tile-image-layer ' + imgClass + '"></div>' +
            '</div>';
        }).join('');
    }

    function renderRosterHtml(team) {
        var list = getTeamPlayers(team);
        var spyFilled = !!_match.spymaster[team];
        var confFilled = !!_match.confirmer[team];
        return list.map(function (p) {
            var isSpy = _match.spymaster[team] === p.id;
            var isConf = _match.confirmer[team] === p.id;
            var spyBtn = isSpy
                ? '<button type="button" class="cn-match-roster-btn spy cn-active-role" data-role="spymaster" data-team="' + team + '" data-id="' + escapeAttr(p.id) + '" title="إلغاء سباي ماستر">🕵</button>'
                : (spyFilled ? '' : '<button type="button" class="cn-match-roster-btn spy" data-role="spymaster" data-team="' + team + '" data-id="' + escapeAttr(p.id) + '" title="تحويل إلى سباي ماستر">🕵</button>');
            var confBtn = isConf
                ? '<button type="button" class="cn-match-roster-btn confirm cn-active-role" data-role="confirmer" data-team="' + team + '" data-id="' + escapeAttr(p.id) + '" title="إلغاء تأكيد الأجوبة">✓</button>'
                : (confFilled ? '' : '<button type="button" class="cn-match-roster-btn confirm" data-role="confirmer" data-team="' + team + '" data-id="' + escapeAttr(p.id) + '" title="تحويل إلى تأكيد الأجوبة">✓</button>');
            return '<div class="cn-match-roster-row">' +
                '<span class="cn-match-roster-avatar">' + escapeHtml(playerInitial(p)) + '</span>' +
                '<span class="cn-match-roster-name">' + escapeHtml(p.name || p.id) + '</span>' +
                spyBtn + confBtn +
            '</div>';
        }).join('');
    }

    function renderEventsHtml(team) {
        var list = _match.events[team];
        if (!list.length) return '<div style="opacity:0.5">لا أحداث بعد</div>';
        return list.slice(-6).reverse().map(function (e) { return '<div>' + escapeHtml(e) + '</div>'; }).join('');
    }

    function roleCardHtml(kind, team, label) {
        var pid = _match[kind][team];
        var p = pid ? findPlayerById(pid) : null;
        var name = p ? (p.name || p.id) : '-- غير معيّن --';
        var xBtn = pid ? '<button type="button" class="cn-match-role-x" data-role="' + kind + '" data-team="' + team + '">✕</button>' : '';
        return '<div class="cn-match-role-card ' + kind + '">' +
            '<span class="role-label">' + label + '</span>' +
            '<div class="role-row"><span class="role-name">' + escapeHtml(name) + '</span>' + xBtn + '</div>' +
        '</div>';
    }

    function renderSideHtml(team) {
        var isT1 = (team === TEAM1);
        var name = isT1 ? _settings.team1Name : _settings.team2Name;
        var countBg = isT1 ? 'var(--cn-team1)' : 'var(--cn-team2)';
        var count = isT1 ? _match.countTeam1 : _match.countTeam2;

        return '<aside class="cn-match-side ' + (isT1 ? 't1' : 't2') + '">' +
            '<div class="cn-match-side-head">' +
                '<span class="name">' + escapeHtml(name) + '</span>' +
                '<span class="count" style="background:' + countBg + '">' + count + '</span>' +
            '</div>' +
            '<div class="cn-match-side-divider"></div>' +
            '<div class="cn-match-roles-row">' +
                roleCardHtml('spymaster', team, 'سباي ماستر') +
                roleCardHtml('confirmer', team, 'تأكيد الأجوبة') +
            '</div>' +
            '<div class="cn-match-roster">' + renderRosterHtml(team) + '</div>' +
            '<div class="cn-match-side-divider"></div>' +
            '<div class="cn-match-events">' +
                '<span class="cn-match-events-label">الأحداث الخاصة بالفريق</span>' +
                '<div class="cn-match-events-box">' + renderEventsHtml(team) + '</div>' +
            '</div>' +
        '</aside>';
    }

    function renderMatchOverlayHtml() {
        var open = _matchUI.modal !== null;
        var html = '<div class="cn-match-overlay' + (open ? ' cn-open' : '') + '" id="cn-match-overlay">';

        if (_matchUI.modal === 'players') {
            var joining = []; // ⚠️ نظام دخول لاعبين أثناء المباراة لسا غير مربوط بمنطق حقيقي
            html += '<div class="cn-match-modal cn-modal-players">' +
                '<div class="cn-match-modal-head"><span>دخول اللاعبين الجدد للمباراة</span>' +
                    '<button type="button" class="cn-match-modal-close" id="cn-match-modal-close">✕</button></div>' +
                '<div class="cn-modal-players-list">' +
                (joining.length ? '' : '<div style="text-align:center;color:rgba(240,228,255,0.4);font-size:14px;padding:20px 0">ما فيه طلبات دخول حالياً</div>') +
                '</div>' +
                '<button type="button" class="cn-modal-players-save" id="cn-match-modal-save">حفظ وإكمال المباراة</button>' +
            '</div>';
        } else if (_matchUI.modal === 'barcode') {
            html += '<div class="cn-match-modal cn-modal-barcode">' +
                '<div class="cn-match-modal-head"><span>باركود السباي ماستر</span>' +
                    '<button type="button" class="cn-match-modal-close" id="cn-match-modal-close">✕</button></div>' +
                '<div class="cn-modal-barcode-box" id="cn-match-qr-box"></div>' +
            '</div>';
        } else if (_matchUI.modal === 'requests') {
            html += '<div class="cn-match-modal cn-modal-requests">' +
                '<div class="cn-match-modal-head"><span>الطلبات</span>' +
                    '<button type="button" class="cn-match-modal-close" id="cn-match-modal-close">✕</button></div>' +
                '<div class="cn-modal-requests-list">' +
                (_spymasterRequests.length
                    ? _spymasterRequests.map(function (r) {
                        var teamLabel = (r.team === TEAM1) ? _settings.team1Name : _settings.team2Name;
                        return '<div class="cn-modal-requests-row">' +
                            '<span class="cn-modal-requests-name">' + escapeHtml(r.name) + ' — ' + escapeHtml(teamLabel) + '</span>' +
                            '<button type="button" class="cn-modal-requests-btn reject" data-req="' + escapeAttr(r.requestId) + '" data-action="reject">✕</button>' +
                            '<button type="button" class="cn-modal-requests-btn accept" data-req="' + escapeAttr(r.requestId) + '" data-action="accept">✓</button>' +
                        '</div>';
                    }).join('')
                    : '<div style="text-align:center;color:rgba(240,228,255,0.4);font-size:14px;padding:20px 0">ما فيه طلبات حالياً</div>') +
                '</div>' +
            '</div>';
        } else if (_matchUI.modal === 'timers') {
            var hintPills = renderTimerPillGroup('hintSeconds', [{ value: 120, label: '2:00' }, { value: 150, label: '2:30' }, { value: 180, label: '3:00' }]);
            var guessPills = renderTimerPillGroup('guessSeconds', [{ value: 90, label: '1:30' }, { value: 120, label: '2:00' }, { value: 150, label: '2:30' }]);
            html += '<div class="cn-match-modal cn-modal-timers">' +
                '<div class="cn-match-modal-head"><span>⏳ تعديل الوقت</span>' +
                    '<button type="button" class="cn-match-modal-close" id="cn-match-modal-close">✕</button></div>' +
                '<div class="cn-row" id="cn-match-row-hintSeconds"><div class="cn-pill-group">' + hintPills + '</div><span class="cn-row-label">وقت إرسال التلميح من السباي ماستر</span></div>' +
                '<div class="cn-row" id="cn-match-row-guessSeconds"><div class="cn-pill-group">' + guessPills + '</div><span class="cn-row-label">وقت اختيار اللاعبين وتأكيد الإجابة</span></div>' +
                '<div style="text-align:center;color:rgba(240,228,255,0.5);font-size:12px">التعديل يطبَّق فورًا على الوقت الحالي إذا كان من نفس نوع المرحلة الشغّالة الآن</div>' +
            '</div>';
        }

        html += '</div>';
        return html;
    }

    function renderWinnerBannerHtml() {
        if (!_match.gameOver) return '';
        var winnerName = (_match.winnerTeam === TEAM1) ? _settings.team1Name : _settings.team2Name;
        var isAssassin = (_match.loseReason === 'assassin');
        var reasonTxt = isAssassin ? 'الفريق الخصم فتح الصندوق الأسود 💀' : 'كشف كل صناديقه ✅';
        var winners = getTeamPlayers(_match.winnerTeam);
        var cardsHtml = winners.length
            ? '<div class="cn-winner-cards">' + winners.map(winnerCardHtml).join('') + '</div>'
            : '';
        return '<div class="cn-match-overlay cn-open' + (isAssassin ? ' cn-assassin-flash' : '') + '">' +
            '<div class="cn-match-modal cn-modal-winner">' +
                '<div class="cn-winner-trophy">🏆</div>' +
                '<div class="cn-match-modal-head" style="justify-content:center"><span>فاز ' + escapeHtml(winnerName) + '</span></div>' +
                '<div style="text-align:center;color:#e6d9ff;font-size:15px">' + reasonTxt + '</div>' +
                cardsHtml +
                '<div class="cn-winner-actions">' +
                    '<button type="button" class="cn-modal-players-save" id="cn-match-new-match-btn">مباراة جديدة</button>' +
                    '<button type="button" class="cn-winner-btn-replay" id="cn-match-replay-btn">إعادة المباراة بنفس اللاعبين</button>' +
                    '<button type="button" class="cn-winner-btn-home" id="cn-match-home-btn">🏠 العودة للرئيسية</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function renderMatchScreen() {
        setScreen('match');
        if (_rootEl) _rootEl.style.display = 'none';
        if (_lobbyEl) _lobbyEl.style.display = 'none';
        wireMatchCommentListener();
        wireMatchTimerListeners();
        connectRelay();

        var root = ensureMatchEl();
        root.style.display = 'flex';

        var isT1Turn = (_match.turn === TEAM1);
        var turnName = isT1Turn ? _settings.team1Name : _settings.team2Name;
        var hintHtml = _match.activeHint
            ? '<div class="cn-match-clue-num">' + _match.activeHint.number + '</div><div class="cn-match-clue-text">' + escapeHtml(_match.activeHint.word) + '</div>'
            : '<div class="cn-match-clue-text" style="opacity:0.55">بانتظار التلميح...</div>';
        var timerLabel = _match.activeHint ? 'وقت الاختيار' : 'وقت التلميح';
        var timerSeconds = _match.activeHint ? AGP.timerManager.getRemainingSeconds(TIMER_GUESS) : AGP.timerManager.getRemainingSeconds(TIMER_HINT);
        var timerHtml = '<div class="cn-match-pick-timer"><span class="lbl">' + timerLabel + '</span><span class="val" id="cn-match-timer-val">' + formatSeconds(timerSeconds) + '</span></div>';

        root.innerHTML =
            '<div class="cn-match-header">' +
                '<div class="cn-match-header-title">' + escapeHtml(GAME_NAME) + '</div>' +
                '<div class="cn-match-live"><span class="cn-match-live-dot"></span><span>LIVE</span></div>' +
            '</div>' +

            '<div class="cn-match-statusbar">' +
                '<div class="cn-match-turn-badge" id="cn-match-turn-badge" style="background:' + (isT1Turn ? 'var(--cn-team1)' : 'var(--cn-team2)') + '">' +
                    '<span class="dot"></span><span class="label">دور ' + escapeHtml(turnName) + '</span>' +
                '</div>' +
                '<div class="cn-match-hint-area">' + hintHtml + timerHtml + '</div>' +
                '<div class="cn-match-settings-wrap">' +
                    '<button type="button" class="cn-match-settings-btn' + (_matchUI.settingsOpen ? ' cn-open' : '') + '" id="cn-match-settings-btn">' +
                        '<span>⚙</span><span>الإعدادات</span>' +
                    '</button>' +
                    '<div class="cn-match-settings-panel' + (_matchUI.settingsOpen ? ' cn-open' : '') + '" id="cn-match-settings-panel">' +
                        '<span class="cn-match-settings-panel-label">أدوات الجلسة</span>' +
                        '<button type="button" class="cn-match-settings-item green" id="cn-match-open-players"><span>＋</span><span>إدخال لاعب جديد</span></button>' +
                        '<button type="button" class="cn-match-settings-item purple" id="cn-match-open-barcode"><span>▦</span><span>باركود السباي ماستر</span></button>' +
                        '<button type="button" class="cn-match-settings-item gold" id="cn-match-open-requests"><span>✉</span><span>طلبات السباي ماستر</span></button>' +
                        '<button type="button" class="cn-match-settings-item purple" id="cn-match-open-timers"><span>⏳</span><span>تعديل الوقت</span></button>' +
                        '<div class="cn-match-settings-divider"></div>' +
                        (!_match.matchStarted && !_match.gameOver
                            ? '<button type="button" class="cn-match-settings-item purple" id="cn-match-reset-btn"><span>🔄</span><span>ريست الكلمات</span></button><div class="cn-match-settings-divider"></div>'
                            : '') +
                        '<button type="button" class="cn-match-settings-item red" id="cn-match-exit-btn"><span>⏻</span><span>خروج</span></button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="cn-match-body">' +
                renderSideHtml(TEAM1) +
                '<main class="cn-match-grid" id="cn-match-grid">' + renderGridHtml() + '</main>' +
                renderSideHtml(TEAM2) +
            '</div>' +

            (_match.gameOver ? renderWinnerBannerHtml() : renderMatchOverlayHtml());

        _match.justRevealed = [];
        wireMatchHandlers();
    }

    function wireMatchHandlers() {
        var grid = el('cn-match-grid');
        if (grid) {
            grid.querySelectorAll('.cn-match-tile').forEach(function (tile) {
                tile.setAttribute('title', 'يُفتح فقط عبر أمر «تاكيد» بالشات من المؤكّد');
            });
        }

        var settingsBtn = el('cn-match-settings-btn');
        var settingsPanel = el('cn-match-settings-panel');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', function () {
                _matchUI.settingsOpen = !_matchUI.settingsOpen;
                settingsBtn.classList.toggle('cn-open', _matchUI.settingsOpen);
                settingsPanel.classList.toggle('cn-open', _matchUI.settingsOpen);
            });
        }

        var openPlayersBtn = el('cn-match-open-players');
        if (openPlayersBtn) openPlayersBtn.addEventListener('click', function () { _matchUI.modal = 'players'; _matchUI.settingsOpen = false; renderMatchScreen(); });
        var openBarcodeBtn = el('cn-match-open-barcode');
        if (openBarcodeBtn) openBarcodeBtn.addEventListener('click', function () { _matchUI.modal = 'barcode'; _matchUI.settingsOpen = false; renderMatchScreen(); });
        var openRequestsBtn = el('cn-match-open-requests');
        if (openRequestsBtn) openRequestsBtn.addEventListener('click', function () { _matchUI.modal = 'requests'; _matchUI.settingsOpen = false; renderMatchScreen(); });
        var openTimersBtn = el('cn-match-open-timers');
        if (openTimersBtn) openTimersBtn.addEventListener('click', function () { _matchUI.modal = 'timers'; _matchUI.settingsOpen = false; renderMatchScreen(); });
        var resetBtn = el('cn-match-reset-btn');
        if (resetBtn) resetBtn.addEventListener('click', function () { _matchUI.settingsOpen = false; resetBoard(); });
        var exitBtn = el('cn-match-exit-btn');
        if (exitBtn) exitBtn.addEventListener('click', function () {
            var ok = window.confirm('بترجع لمنصة ألعاب أيمن. تبي تكمل؟');
            if (ok) { stopMatchTimers(); window.location.href = '../../index.html'; }
        });

        var hintRow = el('cn-match-row-hintSeconds');
        if (hintRow) hintRow.addEventListener('click', function (e) {
            var btn = e.target.closest('.cn-pill-btn'); if (!btn) return;
            _settings.hintSeconds = Number(btn.getAttribute('data-value'));
            // يطبَّق فورًا فقط لو مرحلة انتظار التلميح هي الشغّالة حاليًا
            if (!_match.activeHint && !_match.gameOver) startHintTimer();
            renderMatchScreen();
        });
        var guessRow = el('cn-match-row-guessSeconds');
        if (guessRow) guessRow.addEventListener('click', function (e) {
            var btn = e.target.closest('.cn-pill-btn'); if (!btn) return;
            _settings.guessSeconds = Number(btn.getAttribute('data-value'));
            // يطبَّق فورًا فقط لو مرحلة الاختيار/التأكيد هي الشغّالة حاليًا
            if (_match.activeHint && !_match.gameOver) startGuessTimer();
            renderMatchScreen();
        });

        var closeBtn = el('cn-match-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', function () { _matchUI.modal = null; renderMatchScreen(); });
        var saveBtn = el('cn-match-modal-save');
        if (saveBtn) saveBtn.addEventListener('click', function () { _matchUI.modal = null; renderMatchScreen(); });
        var newMatchBtn = el('cn-match-new-match-btn');
        if (newMatchBtn) newMatchBtn.addEventListener('click', function () { startNewMatch(false); renderMatchScreen(); });
        var replayBtn = el('cn-match-replay-btn');
        if (replayBtn) replayBtn.addEventListener('click', function () { startNewMatch(true); renderMatchScreen(); });
        var homeBtn = el('cn-match-home-btn');
        if (homeBtn) homeBtn.addEventListener('click', function () { stopMatchTimers(); window.location.href = '../../index.html'; });

        var qrBox = el('cn-match-qr-box');
        if (qrBox && window.QRCode) {
            qrBox.innerHTML = '';
            new QRCode(qrBox, { text: spymasterQrUrl(), width: 220, height: 220, colorDark: '#0F1117', colorLight: '#ffffff' });
        }

        document.querySelectorAll('.cn-modal-requests-btn[data-req]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var reqId = btn.getAttribute('data-req');
                if (btn.getAttribute('data-action') === 'accept') approveSpymasterRequest(reqId);
                else rejectSpymasterRequest(reqId);
            });
        });

        document.querySelectorAll('.cn-match-roster-btn[data-role]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var kind = btn.getAttribute('data-role');
                var team = btn.getAttribute('data-team');
                var id = btn.getAttribute('data-id');
                if (btn.classList.contains('cn-active-role')) clearRole(kind, team);
                else assignRole(kind, team, id);
            });
        });
        document.querySelectorAll('.cn-match-role-x[data-role]').forEach(function (btn) {
            btn.addEventListener('click', function () { clearRole(btn.getAttribute('data-role'), btn.getAttribute('data-team')); });
        });
    }
    /* ======================================================================
     *  8) نقطة الدخول
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
