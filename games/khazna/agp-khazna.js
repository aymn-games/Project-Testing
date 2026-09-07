/**
 * ==========================================================================
 *  AGP KHAZNA -- "الخزنة" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 * لعبة أصلية (Native) بنفس نمط games/team-war و games/photo-challenge من
 * ناحية طريقة التحميل (بدون js/agp-game-shell.js). الهوية البصرية: قالب
 * "settings-no-box" منقول بالحرف من روليت القبائل/تحدي الصور (بدون صندوق
 * يحيط الحقول، عنوان بتدرّج لوني، حقول بخط سفلي بدل صناديق) + تبويب اتصال
 * بالبث (سبينر / تحذير فشل) يظهر فوق نفس الشاشة تماماً. خط Zain فقط.
 * لا تعديل على أي ملف موجود بالمشروع.
 *
 * ⚠️ بناء تدريجي: هذا الملف حالياً يغطي شاشة الإعدادات + تبويب الاتصال
 * + شاشة اللوبي (بالضبط كما اعتُمد بالنموذج: بدون صندوق، بطاقات مباشرة
 * على الخلفية، 6 لاعبين بالصف بحجم 46px، شعار خلفية بشفافية 40%).
 * شاشة المباراة/شاشة الفائز غير مبنيتين بعد -- تحتاج تحديد آلية اللعب
 * الفعلية (عدد الخيارات، شكل الاختيار، شرط الإقصاء بعد اختيار خاطئ إن
 * وُجد، إلخ) قبل بنائهما.
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
        console.error('[AGP Khazna] AGP Core غير محمَّل بعد -- تأكد من ترتيب تحميل الملفات بـ index.html.');
        return;
    }

    var GAME_ID = 'khazna';
    var GAME_NAME = 'الخزنة';

    var CHOICE_SECONDS_OPTIONS = [10, 15, 20, 25];
    var LOBBY_CARD_SIZE = 46; // معتمد بالنموذج -- يفتح 6 بطاقات بالصف براحة

    /* ======================================================================
     *  0) الحالة الداخلية
     * ==================================================================== */
    var _screen = 'settings'; // settings | connecting | lobby
    var _rootEl = null;
    var _lobbyEl = null;
    var _registrationOpen = false;
    var _commentUnsub = null;

    var _settings = {
        tiktokUsername: '',
        joinKeyword: '',
        followersOnly: false,
        chooseSeconds: 15
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
     *  2) الهيدر الأساسي الثابت -- بهوية اللعبة (بنفسجي)
     * ==================================================================== */
    function injectHeader() {
        if (el('kz-header')) return;
        var header = document.createElement('div');
        header.id = 'kz-header';
        header.innerHTML =
            '<div class="kz-header-icons">' +
                '<button type="button" class="kz-header-icon-btn" id="kz-header-home-btn" title="العودة للمنصة">🏠</button>' +
                '<button type="button" class="kz-header-icon-btn" id="kz-header-info-btn" title="شرح اللعبة">!</button>' +
                '<button type="button" class="kz-header-icon-btn" id="kz-header-settings-btn" title="الإعدادات">⚙️</button>' +
            '</div>' +
            '<div id="kz-header-title">' + escapeHtml(GAME_NAME) + '</div>' +
            '<div id="kz-header-brand"><img src="../../logo.png" alt="ألعاب أيمن" onerror="this.style.display=\'none\'"></div>';
        document.body.appendChild(header);

        el('kz-header-home-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('kz-header-info-btn').addEventListener('click', function () { showInstructions(); });
        el('kz-header-settings-btn').addEventListener('click', function () { openInMatchDrawer(); });
    }

    /* ======================================================================
     *  2.4) بانر "فكرة اللعبة من الاستريمر" -- ثابت بزاوية الشاشة (position:
     *       fixed، ما يختفي عند أي تمرير)، فوق كل شاشات اللعبة، بحدود
     *       ذهبية متوهجة، يفتح حساب صاحب الفكرة بالتيك توك (zp.oi) بتبويب
     *       جديد عند الضغط.
     * ==================================================================== */
    function injectIdeaBanner() {
        if (el('kz-idea-banner-link')) return;
        var link = document.createElement('a');
        link.id = 'kz-idea-banner-link';
        link.href = 'https://www.tiktok.com/@zp.oi';
        link.target = '_blank';
        link.rel = 'noopener';
        link.innerHTML = '<img id="kz-idea-banner" src="idea-banner.jpg" alt="فكرة اللعبة من الاستريمر -- @zp.oi">';
        document.body.appendChild(link);
    }

    /* ======================================================================
     *  2.5) تعليمات اللعبة -- تظهر تلقائياً أول ما تُفتح شاشة اللعبة (فوق
     *       شاشة الإعدادات)، وتُفتح لاحقاً يدوياً عبر زر "!" بالهيدر.
     *       دخول/خروج بأنيميشن (تكبير + تلاشي)، زر "ابدأ اللعب" بالأسفل
     *       يقفلها ويكشف الشاشة اللي خلفها.
     * ==================================================================== */
    var _instrShown = false;

    function ensureInstructionsEls() {
        if (el('kz-instructions-dim')) return;

        var dim = document.createElement('div');
        dim.id = 'kz-instructions-dim';
        document.body.appendChild(dim);

        var card = document.createElement('div');
        card.id = 'kz-instructions-card';
        card.innerHTML =
            '<div class="kz-instr-icon">🔐</div>' +
            '<h2>تعليمات لعبة الخزنة</h2>' +
            '<div class="kz-instr-sub">اقرأ زين قبل ما تبدأ</div>' +

            '<div class="kz-instr-section">' +
                '<div class="kz-instr-emoji">🕰️</div>' +
                '<div class="kz-instr-text">' +
                    'بتطلع لكم <b>ساعات من داخل الخزنة</b> بتوقيت معيّن — احفظوا <b>توقيت كل ساعة وترتيبها</b>، ' +
                    'وبعدها اختاروا <b>الخيار الصحيح</b> اللي يطابق الترتيب والتواقيت.' +
                '</div>' +
            '</div>' +

            '<div class="kz-instr-section">' +
                '<div class="kz-instr-emoji">⚔️</div>' +
                '<div class="kz-instr-text">' +
                    '<b>الإقصاء:</b>' +
                    '<ul>' +
                        '<li>كل جولة يُقصى <b>آخر لاعبين</b> بالإجابة</li>' +
                        '<li>لما يوصل العدد لـ <b>4 لاعبين</b>، يُقصى <b>لاعب واحد بس</b> كل جولة</li>' +
                        '<li>لازم يكون فيه إجابة على الأقل — لو محد جاوب، ما يُقصى أحد وتستمر اللعبة</li>' +
                    '</ul>' +
                '</div>' +
            '</div>' +

            '<div class="kz-instr-section">' +
                '<div class="kz-instr-emoji">📈</div>' +
                '<div class="kz-instr-text"><b>الصعوبة تزيد تدريجياً:</b> كل جولتين تنضاف ساعة جديدة.</div>' +
            '</div>' +

            '<div class="kz-instr-tip">⚡ احفظوا التواقيت وترتيبها صح، وجاوبوا <b>بأسرع وقت</b> — كل ما ترسلون إجابتكم أبكر، كل ما تضمنون عدم الإقصاء.</div>' +

            '<button type="button" id="kz-instr-start-btn">🚀 ابدأ اللعب</button>';
        document.body.appendChild(card);

        el('kz-instr-start-btn').addEventListener('click', function () { hideInstructions(); });
    }

    function showInstructions() {
        ensureInstructionsEls();
        var dim = el('kz-instructions-dim');
        var card = el('kz-instructions-card');
        dim.style.display = 'block';
        card.style.display = 'block';
        card.classList.remove('kz-hide');
        void card.offsetWidth; // إجبار إعادة رسم عشان الأنيميشن يشتغل من جديد لو تكرر الفتح
        requestAnimationFrame(function () {
            dim.classList.add('kz-show');
            card.classList.add('kz-show');
        });
        _instrShown = true;
    }

    function hideInstructions() {
        var dim = el('kz-instructions-dim');
        var card = el('kz-instructions-card');
        if (!dim || !card) return;
        dim.classList.remove('kz-show');
        card.classList.remove('kz-show');
        card.classList.add('kz-hide');
        setTimeout(function () {
            dim.style.display = 'none';
            card.style.display = 'none';
        }, 380);
    }

    /* ======================================================================
     *  3) شاشة الإعدادات -- قالب "settings-no-box" (منقول من روليت
     *     القبائل/تحدي الصور)
     * ==================================================================== */
    function ensureRoot() {
        if (_rootEl) return _rootEl;
        document.body.classList.add('kz-active');
        _rootEl = document.createElement('div');
        _rootEl.id = 'kz-settings';
        document.body.appendChild(_rootEl);
        return _rootEl;
    }

    function renderSettingsScreen() {
        _screen = 'settings';
        var root = ensureRoot();
        root.style.display = 'block';

        var joinPills = [
            { value: false, label: 'الجميع' },
            { value: true, label: 'المتابعون فقط' }
        ].map(function (opt) {
            var active = (_settings.followersOnly === opt.value) ? ' kz-pill-active' : '';
            return '<button type="button" class="kz-pill-btn' + active + '" data-key="followersOnly" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');

        var choicePills = CHOICE_SECONDS_OPTIONS.map(function (v) {
            var active = (_settings.chooseSeconds === v) ? ' kz-pill-active' : '';
            return '<button type="button" class="kz-pill-btn' + active + '" data-key="chooseSeconds" data-value="' + v + '">' + v + 'ث</button>';
        }).join('');

        root.innerHTML =
            '<h2>إعدادات مباراة الخزنة</h2>' +

            '<div class="kz-field">' +
                '<label>اكتب يوزر البث بالتيك توك</label>' +
                '<input type="text" id="kz-input-username" placeholder="ayman_live" value="' + escapeAttr(_settings.tiktokUsername) + '">' +
            '</div>' +

            '<div class="kz-field">' +
                '<label>الكلمة المفتاحية للدخول</label>' +
                '<input type="text" id="kz-input-keyword" placeholder="اكتب الكلمة المفتاحية" value="' + escapeAttr(_settings.joinKeyword) + '">' +
            '</div>' +

            '<div class="kz-row" id="kz-row-followersOnly">' +
                '<div class="kz-pill-group">' + joinPills + '</div>' +
                '<span class="kz-row-label">🔑 مين يقدر يدخل؟</span>' +
            '</div>' +

            '<div class="kz-row" id="kz-row-chooseSeconds" style="flex-direction:column;align-items:stretch;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
                    '<div class="kz-pill-group">' + choicePills + '</div>' +
                    '<span class="kz-row-label">⏱️ وقت الاختيار</span>' +
                '</div>' +
                '<div class="kz-hint">عند انتهاء الوقت، يُقصى اللاعبون الذين لم يختاروا خياراً</div>' +
            '</div>' +

            '<div id="kz-settings-error" class="kz-error-msg" style="display:none;"></div>' +

            '<button type="button" id="kz-connect-btn" class="kz-btn-connect">اتصال بالبث وبدء الإعدادات</button>' +
            '<button type="button" id="kz-back-btn" class="kz-back-btn">🏠 رجوع لمنصة ألعاب أيمن</button>';

        wireSettingsHandlers();
    }

    function wireSettingsHandlers() {
        el('kz-input-username').addEventListener('input', function (e) { _settings.tiktokUsername = e.target.value; });
        el('kz-input-keyword').addEventListener('input', function (e) { _settings.joinKeyword = e.target.value; });

        el('kz-row-followersOnly').addEventListener('click', function (e) {
            var btn = e.target.closest('.kz-pill-btn'); if (!btn) return;
            _settings.followersOnly = (btn.getAttribute('data-value') === 'true');
            renderSettingsScreen();
        });
        el('kz-row-chooseSeconds').addEventListener('click', function (e) {
            var btn = e.target.closest('.kz-pill-btn'); if (!btn) return;
            _settings.chooseSeconds = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsScreen();
        });

        el('kz-back-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('kz-connect-btn').addEventListener('click', handleConnectClick);
    }

    function showSettingsError(msg) {
        var errEl = el('kz-settings-error');
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
     *  4) تبويب الاتصال بالبث -- يظهر فوق شاشة الإعدادات (منقول بالحرف من
     *     قالب روليت القبائل/تحدي الصور). زر ✕ عند الفشل يُخفي التبويب
     *     فقط، شاشة الإعدادات خلفه تبقى ظاهرة وتفاعلية.
     * ==================================================================== */
    function ensureConnectOverlay() {
        if (!el('kz-connect-dim')) {
            var dim = document.createElement('div');
            dim.id = 'kz-connect-dim';
            document.body.appendChild(dim);
        }
        if (!el('kz-connect-popup')) {
            var popup = document.createElement('div');
            popup.id = 'kz-connect-popup';
            document.body.appendChild(popup);
        }
        return el('kz-connect-popup');
    }

    function showConnectOverlay(isError) {
        var popup = ensureConnectOverlay();
        el('kz-connect-dim').style.display = 'block';
        popup.style.display = 'block';
        popup.classList.toggle('kz-connect-error', Boolean(isError));
        popup.innerHTML =
            (isError ? '<button type="button" id="kz-connect-close-btn">✕</button>' : '') +
            '<div class="' + (isError ? 'kz-connect-error-icon' : 'kz-connect-spinner') + '">' +
            (isError ? '⚠️' : '') + '</div>' +
            '<h3>' + (isError ? 'تعذّر الاتصال' : 'جاري الاتصال بالبث') + '</h3>' +
            '<p>' + (isError ? 'تأكد من اسم المستخدم وحاول مرة ثانية' : 'انتظر قليلاً...') + '</p>';
        if (isError) {
            el('kz-connect-close-btn').onclick = function () {
                hideConnectOverlay();
            };
        }
    }

    function hideConnectOverlay() {
        if (el('kz-connect-dim')) el('kz-connect-dim').style.display = 'none';
        if (el('kz-connect-popup')) el('kz-connect-popup').style.display = 'none';
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

        // ⚠️ إصلاح خلل: بدون هذا، انضمام لاعب عبر الشات (أو حذفه) يصير
        // فعلياً بالخلفية لكن شبكة اللوبي ما تنعرض محدَّثة أبداً.
        AGP.events.on('player:joined', function () { if (_screen === 'lobby') renderLobbyGrid(); });
        AGP.events.on('player:removed', function () { if (_screen === 'lobby') renderLobbyGrid(); });
    }

    /* ======================================================================
     *  5) شاشة اللوبي -- بدون صندوق، بطاقات اللاعبين مباشرة على خلفية
     *     الشاشة (نفس أسلوب لوبي روليت القبائل "lobby-no-box")، شبكة
     *     6 أعمدة بحجم 46px (معتمد بالنموذج)، شعار خلفية بشفافية 40%.
     * ==================================================================== */
    function findPlayerById(id) {
        var players = AGP.player.getAllPlayers();
        for (var i = 0; i < players.length; i++) {
            if (players[i].id === id) return players[i];
        }
        return null;
    }

    function playerCardHtml(p) {
        if (AGP.playerCard) {
            return AGP.playerCard.renderHtml(p, { showFrame: true, basePath: '../../', size: LOBBY_CARD_SIZE, outClass: 'kz-pcard-wrap' });
        }
        var avatar = p.avatarUrl ? escapeAttr(p.avatarUrl) : '';
        return '<span class="kz-pcard-wrap">' + (avatar ? '<img src="' + avatar + '">' : '') + escapeHtml(p.name || p.id) + '</span>';
    }

    function lobbyCardHtml(p) {
        return '<div class="kz-lobby-card-wrap">' +
            '<button type="button" class="kz-lobby-remove-x" data-id="' + escapeAttr(p.id) + '" title="حذف اللاعب">✕</button>' +
            playerCardHtml(p) +
        '</div>';
    }

    function wireLobbyRemoveButtons(container) {
        if (!container) return;
        container.querySelectorAll('.kz-lobby-remove-x').forEach(function (btn) {
            btn.addEventListener('click', function () {
                AGP.player.removePlayer(btn.getAttribute('data-id'));
                renderLobbyGrid();
            });
        });
    }

    function renderLobbyGrid() {
        var grid = el('kz-lobby-grid');
        if (!grid) return;
        var players = AGP.player.getAllPlayers();
        el('kz-lobby-count').textContent = players.length + ' لاعبين';
        grid.innerHTML = players.map(lobbyCardHtml).join('') || '<div class="kz-lobby-empty">بانتظار أول لاعب...</div>';
        if (AGP.playerCard) AGP.playerCard.fitAllNames(grid);
        wireLobbyRemoveButtons(grid);
        el('kz-start-round-btn').disabled = players.length === 0;
    }

    function wireCommentListenerForJoining() {
        if (_commentUnsub) return;
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_registrationOpen || !payload || typeof payload.text !== 'string' || !payload.id) return;
            if (_settings.followersOnly && !payload.isFollower) return;

            var text = normalizeArabicText(payload.text);
            var keyword = normalizeArabicText(_settings.joinKeyword);
            if (!keyword || text !== keyword) return;

            if (findPlayerById(payload.id)) return; // منضم أصلاً

            AGP.player.addPlayer({ id: payload.id, name: payload.name || payload.id, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null });
        });
    }

    function ensureLobbyEl() {
        if (_lobbyEl) return _lobbyEl;
        _lobbyEl = document.createElement('div');
        _lobbyEl.id = 'kz-lobby';
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
            '<img id="kz-lobby-watermark" src="../../logo.png" alt="" onerror="this.style.display=\'none\'">' +
            '<h2><span class="kz-title-plain">لوبي دخول لعبة - </span><span class="kz-title-accent">' + escapeHtml(GAME_NAME) + '</span></h2>' +
            '<div class="kz-join-hint">' +
                '<span class="kz-badge kz-keyword-badge">' + escapeHtml(_settings.joinKeyword) + '</span>' +
                '<span class="kz-badge kz-count-badge" id="kz-lobby-count">0 لاعبين</span>' +
            '</div>' +
            '<div id="kz-lobby-grid"></div>' +
            '<div id="kz-lobby-actions">' +
                '<button type="button" id="kz-lobby-back-settings-btn" class="kz-btn-settings">⚙️ العودة لإعدادات المباراة</button>' +
                '<button type="button" id="kz-start-round-btn" class="kz-btn-start" disabled>ابدأ الجولة</button>' +
                '<button type="button" id="kz-lobby-back-platform-btn" class="kz-btn-platform">🏠 رجوع لمنصة ألعاب أيمن</button>' +
            '</div>';

        renderLobbyGrid();

        el('kz-lobby-back-settings-btn').addEventListener('click', function () {
            var ok = window.confirm('بترجع لشاشة الإعدادات وينقطع الاتصال الحالي بالبث. تبي تكمل؟');
            if (ok) window.location.reload();
        });
        el('kz-lobby-back-platform-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });
        el('kz-start-round-btn').addEventListener('click', function () { startMatch(); });
    }

    /* ======================================================================
     *  6) شاشة المباراة -- تتابع فتح الجولة (الخزنة + الساعات + مؤقت
     *     الحفظ + الخزنة ترجع وتقفل + تبويب الخيارات A/B/C). منقول
     *     بالحرف من النموذج المعتمد.
     *
     *     ⚠️ بناء تدريجي: التتابع البصري كامل وشغّال، لكن جمع إجابات
     *     اللاعبين الفعلية (كيف يرسل اللاعب A/B/C -- عبر كتابتها بالشات
     *     مثلاً؟) ومنطق الإقصاء (آخر لاعبين / لاعب واحد عند 4، بدون
     *     إقصاء لو محد جاوب، زيادة ساعة كل جولتين، تكرار الجولات لين
     *     يفضل لاعب وحد، شاشة الفائز) لسا ما اتربطوا -- محتاجين تأكيد
     *     آلية الإرسال الفعلية قبل ما أبنيهم.
     * ==================================================================== */
    var MEMORIZE_SECONDS = 15;
    var _roundNumber = 1;
    var _matchStartedAt = null;
    var _matchEl = null;

    function pickRandomHours(n) {
        var pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        for (var i = pool.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
        return pool.slice(0, n);
    }

    function clockFaceSvg(h) {
        var hourAngle = (h % 12) * 30; // بدون دقائق -- العقرب يشاور بالضبط على الساعة الكاملة
        var ticks = '';
        for (var hr = 0; hr < 12; hr++) {
            var isMajor = (hr % 3 === 0);
            var len = isMajor ? 12 : 7;
            var width = isMajor ? 3.5 : 2;
            ticks += '<line x1="75" y1="10" x2="75" y2="' + (10 + len) + '" stroke="#e8d9ff" stroke-opacity="' + (isMajor ? 0.85 : 0.5) + '" stroke-width="' + width + '" stroke-linecap="round" transform="rotate(' + (hr * 30) + ' 75 75)"/>';
        }
        return '<svg width="150" height="150" viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg">' +
            '<defs><radialGradient id="kzcf' + h + '" cx="35%" cy="30%" r="75%">' +
                '<stop offset="0%" stop-color="#9a9ea6"/><stop offset="50%" stop-color="#4d5058"/><stop offset="100%" stop-color="#1c1e23"/>' +
            '</radialGradient></defs>' +
            '<circle cx="75" cy="75" r="72" fill="url(#kzcf' + h + ')" stroke="#000" stroke-width="3"/>' +
            '<circle cx="75" cy="75" r="60" fill="#150a20" stroke="#7c3aed" stroke-opacity="0.4" stroke-width="2"/>' +
            '<g>' + ticks + '</g>' +
            '<line x1="75" y1="75" x2="75" y2="42" stroke="#fff" stroke-width="5" stroke-linecap="round" transform="rotate(' + hourAngle + ' 75 75)"/>' +
            '<circle cx="75" cy="75" r="5" fill="var(--gold)"/>' +
        '</svg>';
    }

    function vaultSvgMarkup() {
        return '<svg width="300" height="335" viewBox="0 0 340 380" xmlns="http://www.w3.org/2000/svg">' +
            '<defs>' +
                '<radialGradient id="kzDoorFace" cx="38%" cy="32%" r="75%"><stop offset="0%" stop-color="#8b8f97"/><stop offset="45%" stop-color="#5a5f68"/><stop offset="80%" stop-color="#33363d"/><stop offset="100%" stop-color="#1c1e23"/></radialGradient>' +
                '<linearGradient id="kzFrameMetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#5b5f68"/><stop offset="50%" stop-color="#26282d"/><stop offset="100%" stop-color="#0f1013"/></linearGradient>' +
                '<radialGradient id="kzDialFace" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#f3d78a"/><stop offset="55%" stop-color="#d8ab3f"/><stop offset="100%" stop-color="#8a6a1e"/></radialGradient>' +
                '<linearGradient id="kzHandleBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c94b3f"/><stop offset="50%" stop-color="#7f1f19"/><stop offset="100%" stop-color="#3d0d0a"/></linearGradient>' +
                '<filter id="kzSoftShadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity="0.55"/></filter>' +
            '</defs>' +
            '<rect x="14" y="18" width="312" height="348" rx="20" fill="url(#kzFrameMetal)" filter="url(#kzSoftShadow)"/>' +
            '<rect x="14" y="18" width="312" height="348" rx="20" fill="none" stroke="#000" stroke-opacity="0.4" stroke-width="2"/>' +
            '<g fill="#111318" stroke="#050506" stroke-width="1.5"><rect x="4" y="60" width="20" height="46" rx="6"/><rect x="4" y="270" width="20" height="46" rx="6"/></g>' +
            '<circle cx="170" cy="192" r="128" fill="#050308"/>' +
            '<g class="kz-door">' +
                '<circle cx="170" cy="192" r="150" fill="url(#kzDoorFace)" stroke="#111318" stroke-width="4"/>' +
                '<circle cx="170" cy="192" r="130" fill="none" stroke="#0d0e10" stroke-width="6"/>' +
                '<g fill="#0f1013" opacity="0.85"><circle cx="170" cy="52" r="5"/><circle cx="170" cy="332" r="5"/><circle cx="30" cy="192" r="5"/><circle cx="310" cy="192" r="5"/><circle cx="72" cy="80" r="5"/><circle cx="268" cy="80" r="5"/><circle cx="72" cy="304" r="5"/><circle cx="268" cy="304" r="5"/></g>' +
                '<circle cx="170" cy="192" r="62" fill="#15171b" stroke="#000" stroke-width="3"/>' +
                '<circle cx="170" cy="192" r="54" fill="url(#kzDialFace)" stroke="#5a4416" stroke-width="2"/>' +
                '<g stroke="#5a4416" stroke-width="1.5"><line x1="170" y1="146" x2="170" y2="154"/><line x1="170" y1="230" x2="170" y2="238"/><line x1="124" y1="192" x2="132" y2="192"/><line x1="208" y1="192" x2="216" y2="192"/></g>' +
                '<circle cx="170" cy="192" r="10" fill="#3a2c0d"/><circle cx="170" cy="192" r="5" fill="#e8b64c"/>' +
                '<g><rect x="266" y="160" width="20" height="64" rx="8" fill="url(#kzHandleBar)" stroke="#20090a" stroke-width="2"/><rect x="286" y="182" width="30" height="20" rx="6" fill="#7f1f19" stroke="#20090a" stroke-width="2"/></g>' +
                '<ellipse cx="120" cy="130" rx="60" ry="24" fill="#ffffff" opacity="0.10"/>' +
            '</g>' +
        '</svg>';
    }

    var _audioCtx = null;
    function playMechSound(kind) {
        try {
            _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            var t0 = _audioCtx.currentTime;
            var thud = _audioCtx.createOscillator();
            var thudGain = _audioCtx.createGain();
            thud.type = 'sine';
            thud.frequency.setValueAtTime(kind === 'open' ? 95 : 70, t0);
            thud.frequency.exponentialRampToValueAtTime(40, t0 + 0.25);
            thudGain.gain.setValueAtTime(0.35, t0);
            thudGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
            thud.connect(thudGain).connect(_audioCtx.destination);
            thud.start(t0); thud.stop(t0 + 0.3);

            var bufferSize = _audioCtx.sampleRate * 0.2;
            var noiseBuffer = _audioCtx.createBuffer(1, bufferSize, _audioCtx.sampleRate);
            var data = noiseBuffer.getChannelData(0);
            for (var i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
            var noise = _audioCtx.createBufferSource();
            noise.buffer = noiseBuffer;
            var noiseFilter = _audioCtx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.value = kind === 'open' ? 1400 : 900;
            var noiseGain = _audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.25, t0);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
            noise.connect(noiseFilter).connect(noiseGain).connect(_audioCtx.destination);
            noise.start(t0);
        } catch (e) { /* تجاهل بيئات بدون صوت */ }
    }

    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function ensureMatchEl() {
        if (_matchEl) return _matchEl;
        _matchEl = document.createElement('div');
        _matchEl.id = 'kz-match';
        _matchEl.innerHTML =
            '<div id="kz-picker">' +
                '<h3>🎯 مين عليه الدور؟</h3>' +
                '<div id="kz-reel-window"><div id="kz-reel-highlight-tab"></div><div id="kz-reel-track"></div></div>' +
                '<button type="button" id="kz-picker-btn">🎲 تحريك</button>' +
                '<div id="kz-picker-result"><div class="kz-picked-name" id="kz-picked-name"></div><div class="kz-picked-sub">🔥 الدور عندك -- جاوب قبلهم!</div></div>' +
            '</div>' +
            '<div id="kz-round">' +
                '<div id="kz-turn-badge"><div id="kz-turn-avatar"></div><div class="kz-turn-name" id="kz-turn-name"></div><div class="kz-turn-sub">🔥 الدور عندك -- جاوب قبلهم!</div></div>' +
                '<div id="kz-vault">' + vaultSvgMarkup() + '</div>' +
                '<div id="kz-flying-clocks"></div>' +
                '<div id="kz-memorize-badge"><div class="kz-mem-num" id="kz-mem-num">' + MEMORIZE_SECONDS + '</div><div class="kz-mem-label">ثانية للحفظ</div></div>' +
                '<div id="kz-options">' +
                    '<div id="kz-answer-timer"><div class="kz-ans-num" id="kz-ans-num">' + _settings.chooseSeconds + '</div><div class="kz-ans-label">ثانية لاختيار الإجابة</div></div>' +
                    '<div id="kz-options-panel-holder"></div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(_matchEl);
        return _matchEl;
    }

    /* ---------------- عجلة اختيار اللاعب صاحب الدور ---------------- */
    var REEL_ITEM_H = 60;
    var _answerInterval = null;

    function buildReel(names) {
        var loopNames = [];
        for (var r = 0; r < 8; r++) loopNames = loopNames.concat(names);
        var track = el('kz-reel-track');
        track.innerHTML = loopNames.map(function (n) { return '<div class="kz-reel-name">' + escapeHtml(n) + '</div>'; }).join('');
        track.style.transition = 'none';
        track.style.transform = 'translateY(0)';
        return loopNames;
    }

    function spinPickerAndStart(clockCount) {
        ensureMatchEl();
        el('kz-picker').style.display = 'flex';
        el('kz-picker').classList.remove('kz-hidden');
        el('kz-round').classList.remove('kz-show');
        el('kz-turn-badge').classList.remove('kz-show');
        el('kz-reel-highlight-tab').classList.remove('kz-locked');
        el('kz-picker-result').classList.remove('kz-show');
        el('kz-picked-name').textContent = '';

        var players = AGP.player.getAllPlayers();
        var pickList = players.length ? players : [{ id: 'demo', name: 'لاعب', avatarUrl: null }];
        var names = pickList.map(function (p) { return p.name || p.id; });
        var loopNames = buildReel(names);
        void el('kz-reel-track').offsetWidth;

        el('kz-picker-btn').disabled = true;
        var windowH = el('kz-reel-window').clientHeight;
        var centerOffset = windowH / 2 - REEL_ITEM_H / 2;
        var targetIndex = Math.floor(loopNames.length * 0.6) + Math.floor(Math.random() * names.length);
        var pickedName = loopNames[targetIndex];
        var pickedPlayer = pickList[targetIndex % pickList.length];
        var targetY = -(targetIndex * REEL_ITEM_H) + centerOffset;

        var track = el('kz-reel-track');
        track.style.transition = 'transform 3.2s cubic-bezier(.12,.7,.15,1)';
        requestAnimationFrame(function () { track.style.transform = 'translateY(' + targetY + 'px)'; });

        setTimeout(function () {
            var items = track.querySelectorAll('.kz-reel-name');
            if (items[targetIndex]) items[targetIndex].classList.add('kz-locked-name');
            el('kz-reel-highlight-tab').classList.add('kz-locked');
            el('kz-picked-name').textContent = pickedName;
            el('kz-picker-result').classList.add('kz-show');
            el('kz-picker-btn').disabled = false;
            setTimeout(function () {
                el('kz-picker').classList.add('kz-hidden');
                el('kz-round').classList.add('kz-show');
                runRoundSequence(clockCount, pickedPlayer);
            }, 1400);
        }, 3300);
    }

    function shuffleArr(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    function buildShuffledOptions(correctOrder) {
        var correctIdx = Math.floor(Math.random() * 3);
        var opts = [];
        for (var i = 0; i < 3; i++) opts.push(i === correctIdx ? correctOrder.slice() : shuffleArr(correctOrder));
        for (var k = 0; k < 3; k++) {
            if (k !== correctIdx && opts[k].join() === correctOrder.join()) opts[k] = shuffleArr(correctOrder);
        }
        return { opts: opts, correctIdx: correctIdx };
    }

    async function runRoundSequence(clockCount, turnPlayer) {
        var hours = pickRandomHours(clockCount);
        var vault = el('kz-vault');
        var flyBox = el('kz-flying-clocks');
        vault.classList.remove('kz-in', 'kz-open');
        el('kz-options').classList.remove('kz-show');
        el('kz-options-panel-holder').innerHTML = '';
        el('kz-memorize-badge').classList.remove('kz-show');

        var turnName = (turnPlayer && (turnPlayer.name || turnPlayer.id)) || '';
        el('kz-turn-name').textContent = turnName;
        var avatarEl = el('kz-turn-avatar');
        if (turnPlayer && turnPlayer.avatarUrl) {
            avatarEl.innerHTML = '<img src="' + escapeAttr(turnPlayer.avatarUrl) + '" alt="">';
        } else {
            avatarEl.innerHTML = '';
            avatarEl.textContent = turnName.charAt(0) || '؟';
        }
        // ⚠️ تظهر فوراً وتبقى ظاهرة طول الجولة كاملة (حتى مرحلة الخيارات)
        el('kz-turn-badge').classList.add('kz-show');

        flyBox.innerHTML = hours.map(function (h, i) {
            return '<div class="kz-flying-clock" id="kz-fc-' + i + '">' + clockFaceSvg(h) + '</div>';
        }).join('');

        var n = hours.length;
        // ⭐ متجاوب: نقيس عرض الساعة الفعلي المعروض (يتغيّر حسب clamp() بالـCSS
        // على حجم الشاشة) بدل رقم ثابت، عشان تتوزّع صح على أي مقاس شاشة.
        var clockEl0 = el('kz-fc-0');
        var clockWidth = (clockEl0 && clockEl0.getBoundingClientRect().width) || 150;
        var spacing = clockWidth + 20;
        var positions = hours.map(function (_, i) { return (i - (n - 1) / 2) * spacing; });

        void vault.offsetWidth;
        vault.classList.add('kz-in');
        await wait(1500);
        await wait(300);
        vault.classList.add('kz-open');
        playMechSound('open');
        await wait(700);

        hours.forEach(function (_, i) {
            setTimeout(function () {
                var c = el('kz-fc-' + i);
                c.classList.add('kz-out');
                c.style.transform = 'translate(' + positions[i] + 'px,0) scale(1)';
            }, i * 180);
        });
        await wait(n * 180 + 400);

        vault.classList.remove('kz-in', 'kz-open');
        await wait(1500);

        el('kz-memorize-badge').classList.add('kz-show');
        var secs = MEMORIZE_SECONDS;
        el('kz-mem-num').textContent = secs;
        while (secs > 0) {
            await wait(1000);
            secs -= 1;
            el('kz-mem-num').textContent = Math.max(secs, 0);
        }
        el('kz-memorize-badge').classList.remove('kz-show');

        vault.classList.add('kz-in');
        await wait(1500);
        await wait(300);
        vault.classList.add('kz-open');
        playMechSound('open');
        await wait(700);

        hours.forEach(function (_, i) {
            setTimeout(function () {
                var c = el('kz-fc-' + i);
                c.style.transform = 'translate(0,0) scale(0.2)';
                c.classList.remove('kz-out');
            }, i * 140);
        });
        await wait(n * 140 + 500);

        vault.classList.remove('kz-open');
        playMechSound('close');
        await wait(700);
        vault.classList.remove('kz-in');
        await wait(1500);

        var data = buildShuffledOptions(hours.map(String));
        var letters = ['A', 'B', 'C'];
        var rows = data.opts.map(function (order, i) {
            return '<div class="kz-option-row" data-idx="' + i + '">' +
                '<div class="kz-option-letter">' + letters[i] + '</div>' +
                '<div class="kz-option-times">' + order.map(function (t) { return '<span>' + escapeHtml(t) + '</span>'; }).join('') + '</div>' +
            '</div>';
        }).join('');
        el('kz-options-panel-holder').innerHTML = '<div id="kz-options-panel">' + rows + '</div>';
        el('kz-options').classList.add('kz-show');

        await runAnswerPhase(data, turnPlayer, clockCount);
    }

    /* ======================================================================
     *  7) مرحلة جمع الإجابات + منطق الإقصاء (نظام "المستهدف")
     *
     *     - اللاعبون يجاوبون بكتابة A أو B أو C بالشات (أول إجابة فقط
     *       تُحسب لكل لاعب هالجولة).
     *     - لما "المستهدف" يجاوب صح: يُقصى فوراً كل من لم يجاوب صح لهالحين
     *       -- إلا إذا كان المستهدف هو آخر واحد يجاوب صح (يعني الباقين
     *       كلهم جاوبوا صح قبله)، فحينها يُقصى هو بس.
     *     - لو انتهى الوقت قبل ما المستهدف يجاوب صح: يُقصى كل من لم
     *       يجاوب صح (بما فيهم المستهدف نفسه لو ما جاوب صح).
     *     - بعدها يظهر تبويب بأسماء المُقصَين، ثم تبدأ جولة جديدة تلقائياً
     *       (بلاعبين أقل، وصعوبة أعلى كل جولتين) لين يفضل لاعب واحد.
     * ==================================================================== */
    function normalizeAnswerLetter(text) {
        if (typeof text !== 'string') return null;
        var t = text.trim().toLowerCase();
        if (t === 'a' || t === 'أ' || t === 'ا') return 'a';
        if (t === 'b' || t === 'ب') return 'b';
        if (t === 'c' || t === 'C'.toLowerCase() || t === 'س') return 'c';
        return null;
    }

    function runAnswerPhase(data, turnPlayer, clockCount) {
        return new Promise(function (resolve) {
            var roundEnded = false;
            var answeredIds = {};
            var correctOrder = []; // مصفوفة player id بترتيب الإجابة الصحيحة

            function markRowsResult() {
                el('kz-options').querySelectorAll('.kz-option-row').forEach(function (r2, i2) {
                    r2.classList.toggle('kz-correct', i2 === data.correctIdx);
                    if (i2 !== data.correctIdx) r2.classList.add('kz-wrong');
                });
            }

            function showEliminatedPanel(eliminatedPlayers) {
                var names = eliminatedPlayers.map(function (p) { return p.name || p.id; });
                var html = '<div id="kz-eliminated-panel">' +
                    '<div class="kz-elim-title">❌ تم إقصاء</div>' +
                    (names.length
                        ? '<div class="kz-elim-list">' + names.map(function (n) { return '<div class="kz-elim-name">' + escapeHtml(n) + '</div>'; }).join('') + '</div>'
                        : '<div class="kz-elim-empty">محد انقصى هالجولة</div>') +
                    '</div>';
                var holder = document.createElement('div');
                holder.id = 'kz-eliminated-holder';
                holder.innerHTML = html;
                el('kz-options').appendChild(holder);
                requestAnimationFrame(function () { holder.classList.add('kz-show'); });
            }

            async function endRound(eliminatedIds) {
                if (roundEnded) return;
                roundEnded = true;
                clearInterval(_answerInterval);
                if (chatUnsub) chatUnsub();
                markRowsResult();

                var allPlayers = AGP.player.getAllPlayers();
                var eliminatedPlayers = allPlayers.filter(function (p) { return eliminatedIds.indexOf(p.id) !== -1; });
                showEliminatedPanel(eliminatedPlayers);

                eliminatedIds.forEach(function (id) { AGP.player.removePlayer(id); });
                _eliminatedPlayers = _eliminatedPlayers.concat(eliminatedPlayers); // لتبويب "المشاركون" بدرج الإعدادات

                await wait(3200);

                var remaining = AGP.player.getAllPlayers();
                var holder = el('kz-eliminated-holder');
                if (holder) holder.remove();
                el('kz-options').classList.remove('kz-show');
                el('kz-turn-badge').classList.remove('kz-show');

                if (remaining.length <= 1) {
                    await renderWinnerScreen(remaining[0] || null);
                    resolve();
                    return;
                }

                var nextRound = _roundNumber + 1;
                var nextClockCount = clockCount + (nextRound % 2 === 0 ? 1 : 0);
                _roundNumber = nextRound;
                resolve();
                spinPickerAndStart(nextClockCount);
            }

            function checkTargetTrigger(justAnsweredId) {
                if (!turnPlayer || justAnsweredId !== turnPlayer.id) return;
                var others = AGP.player.getAllPlayers().filter(function (p) { return p.id !== turnPlayer.id; });
                var othersAllCorrect = others.every(function (p) { return correctOrder.indexOf(p.id) !== -1; });
                if (othersAllCorrect) {
                    endRound([turnPlayer.id]); // المستهدف آخر واحد جاوب صح -- يُقصى هو بس
                } else {
                    var toEliminate = others.filter(function (p) { return correctOrder.indexOf(p.id) === -1; }).map(function (p) { return p.id; });
                    endRound(toEliminate);
                }
            }

            var chatUnsub = AGP.events.on('stream:commentReceived', function (payload) {
                if (roundEnded || !payload || !payload.id) return;
                if (answeredIds[payload.id]) return;
                var letter = normalizeAnswerLetter(payload.text);
                if (!letter) return;
                answeredIds[payload.id] = true;
                var chosenIdx = { a: 0, b: 1, c: 2 }[letter];
                if (chosenIdx === data.correctIdx) {
                    correctOrder.push(payload.id);
                    checkTargetTrigger(payload.id);
                }
            });

            var ansSecs = _settings.chooseSeconds;
            el('kz-ans-num').textContent = ansSecs;
            clearInterval(_answerInterval);
            _answerInterval = setInterval(function () {
                ansSecs -= 1;
                el('kz-ans-num').textContent = Math.max(ansSecs, 0);
                if (ansSecs <= 0) {
                    clearInterval(_answerInterval);
                    if (!roundEnded) {
                        var toEliminate = AGP.player.getAllPlayers()
                            .filter(function (p) { return correctOrder.indexOf(p.id) === -1; })
                            .map(function (p) { return p.id; });
                        endRound(toEliminate);
                    }
                }
            }, 1000);
        });
    }

    function startMatch() {
        if (AGP.lobby && typeof AGP.lobby.close === 'function') AGP.lobby.close();
        var lobbyEl = el('kz-lobby');
        if (lobbyEl) lobbyEl.style.display = 'none';
        ensureMatchEl();
        _roundNumber = 1;
        _matchStartedAt = Date.now();
        _eliminatedPlayers = [];
        el('kz-picker-btn').onclick = function () { spinPickerAndStart(3); };
        spinPickerAndStart(3);
    }

    /* ======================================================================
     *  8) الإعدادات داخل المباراة -- درج جانبي (نفس نمط روليت القبائل
     *     المعتمَد): تبويبان (⚙️ الإعدادات بدون يوزر/كلمة مفتاحية / 👥
     *     المشاركون بحث+فلتر+إقصاء يدوي+إرجاع)، وزر "إضافة لاعب جديد"
     *     يفتح لوبي إضافي (700×800، خلفية سوداء 15%، حدود ذهبية، زوايا
     *     17%) بنفس آلية دخول اللوبي الأصلي.
     * ==================================================================== */
    var _eliminatedPlayers = [];
    var _drawerTab = 'settings';
    var _playersTabFilter = 'all';
    var _playersTabSearch = '';

    function ensureDrawerEl() {
        if (el('kz-drawer')) return;

        var dim = document.createElement('div');
        dim.id = 'kz-drawer-dim';
        document.body.appendChild(dim);

        var drawer = document.createElement('div');
        drawer.id = 'kz-drawer';
        drawer.innerHTML =
            '<div class="kz-drawer-header"><h2>⚙️ إعدادات المباراة</h2><button type="button" class="kz-drawer-close-btn" id="kz-drawer-close-btn">✕</button></div>' +
            '<div class="kz-drawer-tabs">' +
                '<button type="button" class="kz-tab-active" data-tab="settings">⚙️ الإعدادات</button>' +
                '<button type="button" data-tab="players">👥 المشاركون</button>' +
            '</div>' +
            '<div class="kz-drawer-body">' +
                '<div id="kz-settings-tab"></div>' +
                '<div id="kz-players-tab">' +
                    '<input type="text" id="kz-players-tab-search" placeholder="🔍 دوّر على لاعب...">' +
                    '<div id="kz-players-tab-filter">' +
                        '<button type="button" class="kz-filter-active" data-filter="all">الكل</button>' +
                        '<button type="button" data-filter="live">🟢 نشطون</button>' +
                        '<button type="button" data-filter="out">🔴 مقصون</button>' +
                    '</div>' +
                    '<div id="kz-players-tab-list"></div>' +
                '</div>' +
            '</div>' +
            '<div class="kz-drawer-footer">' +
                '<button type="button" id="kz-open-mini-lobby-btn">➕ إضافة لاعب جديد</button>' +
                '<button type="button" class="kz-exit-btn" id="kz-exit-btn">🚪 الخروج من اللعبة</button>' +
                '<button type="button" class="kz-drawer-back-link" id="kz-back-platform-btn">↩ رجوع لمنصة ألعاب أيمن</button>' +
            '</div>';
        document.body.appendChild(drawer);

        renderSettingsTabFields();

        el('kz-drawer-close-btn').addEventListener('click', closeInMatchDrawer);
        dim.addEventListener('click', closeInMatchDrawer);
        el('kz-open-mini-lobby-btn').addEventListener('click', openMiniLobby);
        el('kz-exit-btn').addEventListener('click', function () {
            if (window.confirm('بتخرج من اللعبة وترجع لمنصة ألعاب أيمن. تكمل؟')) window.location.href = '../../index.html';
        });
        el('kz-back-platform-btn').addEventListener('click', function () { window.location.href = '../../index.html'; });

        drawer.querySelectorAll('.kz-drawer-tabs button').forEach(function (btn) {
            btn.addEventListener('click', function () {
                _drawerTab = btn.getAttribute('data-tab');
                drawer.querySelectorAll('.kz-drawer-tabs button').forEach(function (b) { b.classList.toggle('kz-tab-active', b === btn); });
                drawer.classList.toggle('kz-tab-players', _drawerTab === 'players');
                if (_drawerTab === 'players') renderPlayersTab();
            });
        });

        el('kz-players-tab-filter').addEventListener('click', function (e) {
            var btn = e.target.closest('button'); if (!btn) return;
            _playersTabFilter = btn.getAttribute('data-filter');
            el('kz-players-tab-filter').querySelectorAll('button').forEach(function (b) { b.classList.remove('kz-filter-active'); });
            btn.classList.add('kz-filter-active');
            renderPlayersTab();
        });
        el('kz-players-tab-search').addEventListener('input', function (e) {
            _playersTabSearch = e.target.value.trim();
            renderPlayersTab();
        });
    }

    function renderSettingsTabFields() {
        var joinPills = [
            { value: false, label: 'الجميع' },
            { value: true, label: 'المتابعون فقط' }
        ].map(function (opt) {
            var active = (_settings.followersOnly === opt.value) ? ' kz-active' : '';
            return '<button type="button" class="kz-pill-btn' + active + '" data-key="followersOnly" data-value="' + opt.value + '">' + opt.label + '</button>';
        }).join('');
        var choicePills = CHOICE_SECONDS_OPTIONS.map(function (v) {
            var active = (_settings.chooseSeconds === v) ? ' kz-active' : '';
            return '<button type="button" class="kz-pill-btn' + active + '" data-key="chooseSeconds" data-value="' + v + '">' + v + 'ث</button>';
        }).join('');

        el('kz-settings-tab').innerHTML =
            '<div class="kz-row" id="kz-drawer-row-followersOnly"><div class="kz-pill-group">' + joinPills + '</div><span class="kz-row-label">🔑 مين يقدر يدخل؟</span></div>' +
            '<div class="kz-row" id="kz-drawer-row-chooseSeconds"><div class="kz-pill-group">' + choicePills + '</div><span class="kz-row-label">⏱️ وقت الاختيار</span></div>' +
            '<button type="button" class="kz-save-btn" id="kz-drawer-save-btn">💾 حفظ التغييرات</button>';

        el('kz-drawer-row-followersOnly').addEventListener('click', function (e) {
            var btn = e.target.closest('.kz-pill-btn'); if (!btn) return;
            _settings.followersOnly = (btn.getAttribute('data-value') === 'true');
            renderSettingsTabFields();
        });
        el('kz-drawer-row-chooseSeconds').addEventListener('click', function (e) {
            var btn = e.target.closest('.kz-pill-btn'); if (!btn) return;
            _settings.chooseSeconds = parseInt(btn.getAttribute('data-value'), 10);
            renderSettingsTabFields();
        });
        el('kz-drawer-save-btn').addEventListener('click', function () {
            el('kz-drawer-save-btn').textContent = '✅ تم الحفظ';
            setTimeout(function () { el('kz-drawer-save-btn').textContent = '💾 حفظ التغييرات'; }, 1400);
        });
    }

    function renderPlayersTab() {
        var alive = AGP.player.getAllPlayers().map(function (p) { return { id: p.id, name: p.name || p.id, out: false }; });
        var out = _eliminatedPlayers.map(function (p) { return { id: p.id, name: p.name || p.id, out: true }; });
        var list = alive.concat(out).filter(function (p) {
            if (_playersTabFilter === 'live' && p.out) return false;
            if (_playersTabFilter === 'out' && !p.out) return false;
            if (_playersTabSearch && p.name.indexOf(_playersTabSearch) === -1) return false;
            return true;
        });

        el('kz-players-tab-list').innerHTML = list.map(function (p) {
            return '<div class="kz-p-row' + (p.out ? ' kz-p-out' : '') + '">' +
                '<div class="kz-p-avatar">' + escapeHtml((p.name || '؟').charAt(0)) + '</div>' +
                '<div class="kz-p-name">' + escapeHtml(p.name) + '</div>' +
                (p.out
                    ? '<button type="button" class="kz-p-revive-btn" data-id="' + escapeAttr(p.id) + '">↩</button>'
                    : '<button type="button" class="kz-p-x-btn" data-id="' + escapeAttr(p.id) + '">✕</button>') +
            '</div>';
        }).join('') || '<div style="text-align:center;color:#8f7ba8;font-size:12px;padding:20px 0;">محد يطابق البحث</div>';

        el('kz-players-tab-list').querySelectorAll('.kz-p-x-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                var id = b.getAttribute('data-id');
                var p = AGP.player.getAllPlayers().filter(function (pp) { return pp.id === id; })[0];
                if (p) { _eliminatedPlayers.push(p); AGP.player.removePlayer(id); }
                renderPlayersTab();
            });
        });
        el('kz-players-tab-list').querySelectorAll('.kz-p-revive-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                var id = b.getAttribute('data-id');
                var idx = -1;
                _eliminatedPlayers.forEach(function (p, i) { if (p.id === id) idx = i; });
                if (idx !== -1) {
                    AGP.player.addPlayer(_eliminatedPlayers[idx]);
                    _eliminatedPlayers.splice(idx, 1);
                }
                renderPlayersTab();
            });
        });
    }

    function openInMatchDrawer() {
        ensureDrawerEl();
        renderSettingsTabFields();
        if (_drawerTab === 'players') renderPlayersTab();
        el('kz-drawer-dim').style.display = 'block';
        el('kz-drawer').style.display = 'flex';
        void el('kz-drawer').offsetWidth;
        requestAnimationFrame(function () {
            el('kz-drawer-dim').classList.add('kz-show');
            el('kz-drawer').classList.add('kz-show');
        });
    }

    function closeInMatchDrawer() {
        var dim = el('kz-drawer-dim'), drawer = el('kz-drawer');
        if (!dim || !drawer) return;
        dim.classList.remove('kz-show');
        drawer.classList.remove('kz-show');
        setTimeout(function () { dim.style.display = 'none'; drawer.style.display = 'none'; }, 350);
    }

    /* ---------------- لوبي إضافة لاعبين جدد (700×800) ---------------- */
    var _miniLobbyUnsub = null;
    var _miniLobbyAccepting = false;

    function ensureMiniLobbyEl() {
        if (el('kz-mini-lobby')) return;

        var dim = document.createElement('div');
        dim.id = 'kz-mini-dim';
        document.body.appendChild(dim);

        var box = document.createElement('div');
        box.id = 'kz-mini-lobby';
        box.innerHTML =
            '<button type="button" id="kz-mini-close-btn">✕</button>' +
            '<div id="kz-mini-body">' +
                '<h2>لوبي إضافة لاعبين جدد</h2>' +
                '<div id="kz-mini-sub">افتح الدخول مؤقتاً لضم لاعبين جدد للمباراة الحالية</div>' +
                '<div class="kz-mini-hint">' +
                    '<span class="kz-mini-badge kz-mini-keyword-badge" id="kz-mini-keyword-badge"></span>' +
                    '<span class="kz-mini-badge kz-mini-count-badge" id="kz-mini-count">0 لاعبين جدد</span>' +
                '</div>' +
                '<div id="kz-mini-grid"></div>' +
            '</div>' +
            '<div id="kz-mini-footer">' +
                '<button type="button" id="kz-mini-complete-btn">✅ اكتمل الدخول</button>' +
                '<button type="button" id="kz-mini-save-btn">💾 حفظ وإكمال المباراة</button>' +
            '</div>';
        document.body.appendChild(box);

        el('kz-mini-close-btn').addEventListener('click', closeMiniLobby);
        dim.addEventListener('click', closeMiniLobby);
        el('kz-mini-complete-btn').addEventListener('click', function () {
            _miniLobbyAccepting = false;
            el('kz-mini-complete-btn').classList.add('kz-done');
            el('kz-mini-complete-btn').textContent = '🔒 الدخول مقفول';
        });
        el('kz-mini-save-btn').addEventListener('click', closeMiniLobby);
    }

    var _miniJoinedIds = [];

    function renderMiniGrid() {
        var newPlayers = AGP.player.getAllPlayers().filter(function (p) { return _miniJoinedIds.indexOf(p.id) !== -1; });
        var grid = el('kz-mini-grid');
        if (!newPlayers.length) {
            grid.innerHTML = '<div class="kz-mini-empty">بانتظار أول لاعب جديد...</div>';
        } else {
            grid.innerHTML = newPlayers.map(lobbyCardHtml).join('');
            if (AGP.playerCard) AGP.playerCard.fitAllNames(grid);
            wireLobbyRemoveButtons(grid); // نفس زر ✕ الأصلي -- يشتغل بنفس منطق AGP.player.removePlayer
        }
        el('kz-mini-count').textContent = newPlayers.length + ' لاعبين جدد';
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
        closeInMatchDrawer();
        ensureMiniLobbyEl();
        _miniJoinedIds = [];
        _miniLobbyAccepting = true;
        wireMiniLobbyJoining();
        el('kz-mini-keyword-badge').textContent = '🔑 ' + (_settings.joinKeyword || '');
        el('kz-mini-complete-btn').classList.remove('kz-done');
        el('kz-mini-complete-btn').textContent = '✅ اكتمل الدخول';
        renderMiniGrid();

        el('kz-mini-dim').style.display = 'block';
        el('kz-mini-lobby').style.display = 'flex';
        void el('kz-mini-lobby').offsetWidth;
        requestAnimationFrame(function () {
            el('kz-mini-dim').classList.add('kz-show');
            el('kz-mini-lobby').classList.add('kz-show');
        });
    }

    function closeMiniLobby() {
        _miniLobbyAccepting = false;
        var dim = el('kz-mini-dim'), box = el('kz-mini-lobby');
        if (!dim || !box) return;
        dim.classList.remove('kz-show');
        box.classList.remove('kz-show');
        setTimeout(function () { dim.style.display = 'none'; box.style.display = 'none'; }, 350);
    }

    /* ======================================================================
     *  9) شاشة الفائز -- بطاقة AGP.playerCard.renderTrophyCard المشتركة
     *     (250×300، تاج + حلقة صورة + اسم + نقاط)، بنفس مسار تقرير
     *     النقاط الحقيقي المعتمَد بروليت الإقصاء (window.AGPAuth.
     *     reportRoundCompletion) -- بدون أي تعديل على قيم النقاط نفسها،
     *     النظام العام الموحَّد فقط.
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
        if (!pointsResult) {
            return '<div class="agp-trophy-points agp-points-noaccount">تعذّر جلب النقاط الآن</div>';
        }
        var awarded = findAwardedFor(pointsResult, player);
        if (awarded) {
            return '<div class="agp-trophy-points agp-points-earned">+' + awarded.added + ' نقطة' +
                '<span class="agp-points-sub">تظهر في بروفايلك</span></div>';
        }
        return '<div class="agp-trophy-points agp-points-noaccount">لازم يسوي حساب عشان تظهر نقاطك بالبروفايل</div>';
    }

    async function renderWinnerScreen(winner) {
        var durationMs = _matchStartedAt ? (Date.now() - _matchStartedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var allParticipants = (winner ? [winner] : []).concat(_eliminatedPlayers);
            var participants = allParticipants.map(function (p) {
                return { tiktokUsername: tiktokUsernameFor(p), won: Boolean(winner) && p.id === winner.id };
            }).filter(function (p) { return p.tiktokUsername; });

            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () { return null; });
            }
        }

        var pointsResult = await pointsPromise;

        el('kz-round').innerHTML =
            '<div id="kz-winner-wrap">' +
                '<div id="kz-winner-label">🏁 انتهت المباراة .. الشخص الرهيب الي فاز بلعبة "الخزنة"</div>' +
                (winner
                    ? AGP.playerCard.renderTrophyCard(winner, { kind: 'winner', showCrown: true, pointsHtml: pointsHtmlFor(pointsResult, winner) })
                    : '<div id="kz-no-winner">ما فيه فائز -- كل اللاعبين انقصوا</div>') +
            '</div>';

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
    }

    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'elimination-games',
            onLoad: function () { AGP.log('Khazna: onLoad.'); },
            onRoundEnd: function () { AGP.log('Khazna: onRoundEnd.'); },
            onDestroy: function () { AGP.log('Khazna: onDestroy.'); }
        });

        if (!registered) { AGP.log('Khazna: registration failed (already registered?).'); return; }

        AGP.gameManager.loadGame(GAME_ID);

        injectHeader();
        injectIdeaBanner();
        wirePlatformListeners();
        renderSettingsScreen();
        showInstructions(); // ⚠️ تظهر تلقائياً أول ما تُفتح شاشة اللعبة
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerGame);
    } else {
        registerGame();
    }

})(window.AymanGamesPlatform);
