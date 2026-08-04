/**
 * ==========================================================================
 *  DASHBOARD PAGES — صفحات الواجهة (متصلة بحالة AGP الحقيقية)
 * ==========================================================================
 *
 * كل دالة عرض هنا تقرأ حالة حقيقية من AGP عند كل استدعاء لها (لا نسخة
 * محفوظة قديمة): قوائم الألعاب/التصنيفات عبر AGP.mockData (بيانات حقيقية
 * فعلياً من AGP.gameManager.getRegisteredGames()، الاسم للتوافق فقط —
 * راجع dashboard-data.js)، وStatus/Players/Controls في صفحة اللعبة عبر
 * AGP.gameManager مباشرة. لا يوجد أي منطق تحديث حي هنا بحد ذاته — إعادة
 * استدعاء دوال renderXxxPage هذه تلقائياً عند أي حدث AGP حقيقي هي مسؤولية
 * dashboard-live.js عبر AGPDashboard.router.refresh() (لا شيء في هذا
 * الملف يستمع لـ AGP.events مباشرة). لا يزال لا يوجد Widgets أو Settings
 * حقيقية للألعاب — تلك تبقى حاويات فارغة مخصَّصة لكل لعبة، حسب المعمارية
 * المعتمَدة، ولا Stream Connector فعلي (حالة البث تبقى عرضاً ثابتاً).
 * ==========================================================================
 */

window.AGPDashboard = window.AGPDashboard || {};

(function (NS) {
    'use strict';

    function renderPlaceholder(contentEl, title, note) {
        contentEl.innerHTML =
            '<div class="page-placeholder">' +
                '<h1>' + title + '</h1>' +
                '<p class="page-placeholder-note">' + note + '</p>' +
            '</div>';
    }

    /**
     * جلب اسم التصنيف من معرّفه (مستخرجة كدالة مشتركة لتفادي تكرار نفس
     * البحث في أكثر من مكان — نفس المنطق الموجود أصلاً، بدون أي إضافة).
     */
    function getCategoryNameById(categoryId) {
        var categories = NS.mockData.getCategories();
        var name = '';
        categories.forEach(function (c) {
            if (c.id === categoryId) name = c.name;
        });
        return name;
    }

    /**
     * بطاقة لعبة بسيطة (تُستخدَم في أكثر من قسم بالصفحة الرئيسية).
     * تعتمد فقط على بيانات AGP.mockData الموجودة أصلاً — لا منطق جديد.
     */
    function buildGameCardHtml(game) {
        var categoryName = getCategoryNameById(game.category);

        return (
            '<a class="game-card" href="#/games/' + game.id + '" data-category="' + game.category + '">' +
                '<div class="game-card-cover" aria-hidden="true">' +
                    '<span class="game-card-cover-icon">🎮</span>' +
                    '<span class="game-card-category-pill">' + categoryName + '</span>' +
                '</div>' +
                '<div class="game-card-body">' +
                    '<div class="game-card-name">' + game.name + '</div>' +
                    '<div class="game-card-cta">فتح اللعبة ←</div>' +
                '</div>' +
            '</a>'
        );
    }

    /**
     * صف قسم أفقي (عنوان + بطاقات، أو رسالة حالة فارغة لو ما فيه بيانات).
     */
    function buildSectionHtml(title, games, emptyMessage) {
        var innerHtml;
        var countBadge = games.length > 0
            ? '<span class="dashboard-section-count">' + games.length + '</span>'
            : '';

        if (games.length === 0) {
            innerHtml = '<p class="dashboard-section-empty">' + emptyMessage + '</p>';
        } else {
            innerHtml = '<div class="dashboard-section-row">' +
                games.map(buildGameCardHtml).join('') +
                '</div>';
        }

        return (
            '<section class="dashboard-section">' +
                '<h2 class="dashboard-section-title">' + title + countBadge + '</h2>' +
                innerHtml +
            '</section>'
        );
    }

    /**
     * بانر "مميّز" أعلى الصفحة الرئيسية — يبرز أول لعبة متاحة في بيانات
     * AGP.mockData (لا يوجد بعد أي منطق "آخر لعبة فُتحت فعلياً"، فهذا
     * أقرب تمثيل صادق متاح حالياً من البيانات الوهمية الموجودة).
     */
    function buildHeroBannerHtml(game) {
        var categoryName = getCategoryNameById(game.category);
        return (
            '<a class="dashboard-hero" href="#/games/' + game.id + '" data-category="' + game.category + '">' +
                '<div class="dashboard-hero-icon" aria-hidden="true">🎮</div>' +
                '<div class="dashboard-hero-body">' +
                    '<span class="dashboard-hero-eyebrow">استمر من حيث توقفت</span>' +
                    '<h2 class="dashboard-hero-name">' + game.name + '</h2>' +
                    '<span class="dashboard-hero-category">' + categoryName + '</span>' +
                '</div>' +
                '<span class="dashboard-hero-cta">فتح اللعبة ←</span>' +
            '</a>'
        );
    }

    // ---- 1) Dashboard (الصفحة الرئيسية) ----
    function renderDashboardPage(params, contentEl) {
        var allGames = NS.mockData.getGames();

        var statsStripHtml =
            '<div class="dashboard-stats-strip">' +
                '<span class="dashboard-stats-item"><span class="dashboard-stats-dot"></span>حالة البث: غير متصل</span>' +
                '<span class="dashboard-stats-divider">•</span>' +
                '<span class="dashboard-stats-item">' + allGames.length + ' لعبة مسجَّلة</span>' +
            '</div>';

        var heroHtml = allGames.length > 0 ? buildHeroBannerHtml(allGames[0]) : '';

        // ملاحظة: لا يوجد بعد أي منطق تتبّع فعلي لـ"الأخيرة/الجديد"، ولا
        // بيانات وهمية لـ"المفضلة" — لذلك تُعرَض القوائم المتاحة فقط من
        // AGP.mockData.getGames() كما هي، وتظهر حالة فارغة صادقة لما لا
        // توجد بيانات، بدل اختلاق محتوى.
        var sectionsHtml =
            buildSectionHtml('آخر الألعاب', allGames, '🔍 لا توجد ألعاب مفتوحة مؤخراً بعد.') +
            buildSectionHtml('المفضلة ⭐', [], '⭐ لم تُضِف أي لعبة للمفضلة بعد.') +
            buildSectionHtml('الجديد 🆕', allGames, '🆕 لا توجد ألعاب جديدة حالياً.') +
            buildSectionHtml('آخر التحديثات 📰', [], '📰 لا توجد تحديثات لعرضها بعد.');

        contentEl.innerHTML =
            '<div class="dashboard-home">' +
                '<h1 class="dashboard-home-title">مرحباً 👋</h1>' +
                '<p class="dashboard-home-subtitle">هذا مركز تحكّمك بكل الألعاب المسجَّلة على المنصة.</p>' +
                statsStripHtml +
                heroHtml +
                sectionsHtml +
            '</div>';
    }

    // ---- 2) Categories (صفحة تصنيف) ----
    function renderCategoriesPage(params, contentEl) {
        var categories = NS.mockData.getCategories();
        var category = null;
        categories.forEach(function (c) {
            if (c.id === params.categoryId) category = c;
        });

        if (!category) {
            renderPlaceholder(
                contentEl,
                'تصنيف غير معروف',
                'لا يوجد تصنيف بالمعرّف: ' + params.categoryId
            );
            return;
        }

        var games = NS.mockData.getGamesByCategory(category.id);

        var gamesHtml;
        if (games.length === 0) {
            gamesHtml = '<p class="dashboard-section-empty">لا توجد ألعاب في هذا التصنيف بعد.</p>';
        } else {
            gamesHtml = '<div class="category-games-grid">' +
                games.map(buildGameCardHtml).join('') +
                '</div>';
        }

        contentEl.innerHTML =
            '<div class="category-page" data-category="' + category.id + '">' +
                '<div class="category-page-header page-header">' +
                    '<span class="category-page-icon page-header-icon">📁</span>' +
                    '<div>' +
                        '<h1 class="dashboard-home-title category-page-title">' + category.name + '</h1>' +
                        '<p class="category-page-count">' + games.length + ' لعبة</p>' +
                    '</div>' +
                '</div>' +
                gamesHtml +
            '</div>';
    }

    /**
     * قسم فارغ موحَّد الشكل (تُستخدَم للأقسام الستة كلها). لا فرق حقيقي
     * في المنطق بين الأقسام — فقط عنوان/أيقونة/رسالة مختلفة لكل واحد.
     * @param {string} icon - إيموجي الأيقونة
     * @param {string} name - اسم القسم (Status, Players...)
     * @param {string} message - نص الحالة الفارغة
     * @param {boolean} [ownedByGame] - true لو القسم مخصَّص للعبة نفسها
     *   (Widgets/Settings)، فتظهر شارة توضيحية مختلفة بدل الرسالة العادية.
     */
    function buildGamePageSectionHtml(icon, name, message, ownedByGame) {
        var emptyHtml = ownedByGame
            ? '<p class="game-page-section-empty game-page-section-empty--owned">🔌 ' + message + '</p>'
            : '<p class="game-page-section-empty">' + message + '</p>';

        return (
            '<section class="game-page-section">' +
                '<h2 class="game-page-section-title">' +
                    '<span class="game-page-section-icon">' + icon + '</span>' + name +
                '</h2>' +
                emptyHtml +
            '</section>'
        );
    }

    /**
     * قسم Status — معاينة الشكل النهائي فقط بقيم ثابتة محايدة ("—")، بلا
     * أي اتصال بـ AGP.roundManager/AGP.lobby الحقيقيَّين.
     */
    // خرائط عرض عربية لقيم حالات AGP.lobby / AGP.roundManager (نفس القيم
    // الرسمية الموثَّقة في agp-lobby.js / agp-round-manager.js أنفسهما).
    var LOBBY_STATE_LABELS = {
        'closed': 'مغلق',
        'registration_open': 'التسجيل مفتوح',
        'ready_to_start': 'جاهز للبدء',
        'in_game': 'داخل اللعبة',
        'finished': 'انتهت'
    };
    var ROUND_STATE_LABELS = {
        'idle': 'خامل',
        'registration_open': 'التسجيل مفتوح',
        'ready_to_spin': 'جاهز',
        'spinning': 'جارية',
        'winner_selected': 'تم اختيار الفائز',
        'round_ended': 'انتهت'
    };

    /**
     * قسم Status — قراءة لقطة (Snapshot) من الحالة الحقيقية عند كل رسم
     * لصفحة اللعبة، من AGP.lobby / AGP.roundManager / AGP.gameManager
     * (كلها موجودة أصلاً بدون أي تعديل). الآن حية فعلياً: عندما تكون
     * صفحة اللعبة هذه هي المسار الحالي، dashboard-live.js يستدعي
     * renderGamePage من جديد تلقائياً عند أي حدث AGP ذي صلة (لا شيء هنا
     * يستمع لـ AGP.events مباشرة). لو AGP غير محمَّلة، تظهر "—" بأمان.
     */
    function buildStatusSectionHtml(gameId) {
        var agp = window.AymanGamesPlatform || null;

        var lobbyValue = '—';
        if (agp && agp.gameManager && typeof agp.gameManager.getLobbyState === 'function') {
            var lobbyState = agp.gameManager.getLobbyState();
            lobbyValue = LOBBY_STATE_LABELS[lobbyState] || lobbyState || '—';
        }

        var roundValue = '—';
        if (agp && agp.gameManager && typeof agp.gameManager.getRoundState === 'function') {
            var roundState = agp.gameManager.getRoundState();
            roundValue = ROUND_STATE_LABELS[roundState] || roundState || '—';
        }

        var engineValue = 'غير محمَّلة';
        if (agp && agp.gameManager && typeof agp.gameManager.getCurrentGame === 'function') {
            var currentGame = agp.gameManager.getCurrentGame();
            if (currentGame && currentGame.id === gameId) {
                engineValue = 'محمَّلة';
            }
        }

        var rows = [
            { label: 'حالة اللوبي', value: lobbyValue },
            { label: 'حالة الجولة', value: roundValue },
            { label: 'حالة اللعبة', value: engineValue }
        ];

        var rowsHtml = rows.map(function (row) {
            return (
                '<div class="status-row">' +
                    '<span class="status-row-label">' + row.label + '</span>' +
                    '<span class="status-row-badge">' + row.value + '</span>' +
                '</div>'
            );
        }).join('');

        return (
            '<section class="game-page-section">' +
                '<h2 class="game-page-section-title"><span class="game-page-section-icon">📊</span>Status</h2>' +
                rowsHtml +
            '</section>'
        );
    }

    /**
     * قسم Players — قراءة لقطة من AGP.player الحقيقي (عبر
     * AGP.gameManager.getPlayers، موجودة أصلاً بدون أي تعديل)، تتحدث حياً
     * بنفس آلية قسم Status أعلاه (إعادة رسم كامل للصفحة عبر
     * dashboard-live.js عند أي حدث AGP ذي صلة). لو AGP غير محمَّلة أو لا
     * يوجد لاعبون فعلاً، تظهر حالة فارغة صادقة كما كانت.
     */
    function buildPlayersSectionHtml() {
        var agp = window.AymanGamesPlatform || null;
        var players = [];

        if (agp && agp.gameManager && typeof agp.gameManager.getPlayers === 'function') {
            players = agp.gameManager.getPlayers();
        }

        var bodyHtml;
        if (players.length === 0) {
            bodyHtml = '<p class="game-page-section-empty">لا يوجد لاعبون في هذه الجلسة بعد.</p>';
        } else {
            bodyHtml = '<ul class="players-list">' +
                players.map(function (player) {
                    return '<li class="players-list-item">' + (player.name || player.id) + '</li>';
                }).join('') +
                '</ul>';
        }

        return (
            '<section class="game-page-section">' +
                '<h2 class="game-page-section-title">' +
                    '<span class="game-page-section-icon">👥</span>Players' +
                    '<span class="dashboard-section-count players-count-badge">' + players.length + '</span>' +
                '</h2>' +
                bodyHtml +
            '</section>'
        );
    }

    /**
     * قسم Controls — معاينة الأزرار النهائية بشكلها الفعلي، لكنها غير
     * فعّالة تماماً (بدون أي مستمع نقر أو استدعاء AGP.lobby/AGP.gameEngine).
     */
    function buildControlsSectionHtml() {
        var buttons = [
            { action: 'open-registration', label: 'فتح التسجيل' },
            { action: 'close-registration', label: 'إغلاق التسجيل' },
            { action: 'start', label: 'بدء' },
            { action: 'stop', label: 'إيقاف' },
            { action: 'reset', label: 'إعادة ضبط' }
        ];

        var buttonsHtml = buttons.map(function (btn) {
            return '<button type="button" class="control-btn" data-action="' + btn.action + '">' + btn.label + '</button>';
        }).join('');

        return (
            '<section class="game-page-section">' +
                '<h2 class="game-page-section-title"><span class="game-page-section-icon">🎛️</span>Controls</h2>' +
                '<div class="controls-button-row">' + buttonsHtml + '</div>' +
            '</section>'
        );
    }

    // خريطة اسم الفعل (data-action) <-> دالة AGP.gameManager المقابلة.
    // Dashboard لا يستدعي AGP.gameEngine أو AGP.lobby مباشرة إطلاقاً —
    // فقط عبر AGP.gameManager (الواجهة الموحّدة الموصى بها).
    var CONTROL_ACTIONS = {
        'open-registration': 'openRegistration',
        'close-registration': 'closeRegistration',
        'start': 'startGame',
        'stop': 'stopGame',
        'reset': 'resetSession'
    };

    // ---- 3) Game (لوحة تحكم اللعبة) ----
    function renderGamePage(params, contentEl) {
        var game = NS.mockData.getGameById(params.gameId);
        var title = game ? game.name : ('لعبة: ' + params.gameId);
        var categoryName = game ? getCategoryNameById(game.category) : '';
        var categoryAttr = game ? game.category : '';

        // ملاحظة: Status وPlayers يقرآن لقطة حقيقية من AGP (Round
        // Manager/Lobby/Player Manager). Controls أصبح فعّالاً الآن،
        // يستدعي AGP.gameManager فقط (لا AGP.gameEngine/AGP.lobby
        // مباشرة). Widgets وSettings يبقيان حاويتين فارغتين مخصَّصتين
        // للعبة نفسها — لا ربط بهما بعد.
        contentEl.innerHTML =
            '<div class="game-page" data-category="' + categoryAttr + '">' +
                '<div class="game-page-header page-header">' +
                    '<span class="game-page-header-icon page-header-icon" aria-hidden="true">🎮</span>' +
                    '<div>' +
                        '<h1 class="dashboard-home-title category-page-title">' + title + '</h1>' +
                        (categoryName ? '<span class="category-page-count">' + categoryName + '</span>' : '') +
                    '</div>' +
                '</div>' +

                '<div class="game-page-row">' +
                    buildStatusSectionHtml(params.gameId) +
                    buildPlayersSectionHtml() +
                '</div>' +

                buildControlsSectionHtml() +
                buildGamePageSectionHtml('🧩', 'Widgets', 'مكان مخصَّص للعبة نفسها — لا محتوى من Dashboard هنا.', true) +
                buildGamePageSectionHtml('⚙️', 'Settings', 'مكان مخصَّص للعبة نفسها — لا محتوى من Dashboard هنا.', true) +
                buildGamePageSectionHtml('📜', 'Logs', 'لا يوجد نشاط مسجَّل بعد.') +
            '</div>';

        // تفويض نقرات Controls عبر حدث واحد (Event Delegation) بدل
        // مستمع لكل زر. كل فعل يمرّ حصراً عبر AGP.gameManager، ثم تُعاد
        // معاينة الصفحة لتعكس الحالة الجديدة فوراً.
        var controlsRow = contentEl.querySelector('.controls-button-row');
        if (controlsRow) {
            controlsRow.addEventListener('click', function (event) {
                var button = event.target.closest('[data-action]');
                if (!button) return;

                var methodName = CONTROL_ACTIONS[button.getAttribute('data-action')];
                var agp = window.AymanGamesPlatform || null;

                if (!methodName || !agp || !agp.gameManager || typeof agp.gameManager[methodName] !== 'function') {
                    return;
                }

                agp.gameManager[methodName]();
                renderGamePage(params, contentEl);
            });
        }
    }

    // ---- 4) Account ----
    function renderAccountPage(params, contentEl) {
        contentEl.innerHTML =
            '<div class="static-page">' +
                '<div class="static-page-header page-header">' +
                    '<span class="static-page-icon page-header-icon" aria-hidden="true">👤</span>' +
                    '<div>' +
                        '<h1 class="dashboard-home-title category-page-title">الحساب</h1>' +
                        '<p class="dashboard-home-subtitle">إدارة ملفك الشخصي واتصال البث الخاص بحسابك.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="static-page-grid">' +
                    '<section class="game-page-section static-page-card">' +
                        '<h2 class="game-page-section-title"><span class="game-page-section-icon">🧾</span>الملف الشخصي</h2>' +
                        '<div class="account-profile-row">' +
                            '<span class="account-avatar" aria-hidden="true">؟</span>' +
                            '<div class="account-profile-fields">' +
                                '<div class="account-field-row">' +
                                    '<span class="account-field-label">الاسم</span>' +
                                    '<span class="account-field-value">— قيد الإنشاء —</span>' +
                                '</div>' +
                                '<div class="account-field-row">' +
                                    '<span class="account-field-label">البريد الإلكتروني</span>' +
                                    '<span class="account-field-value">— قيد الإنشاء —</span>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</section>' +

                    '<section class="game-page-section static-page-card">' +
                        '<h2 class="game-page-section-title"><span class="game-page-section-icon">🔌</span>الاتصال بالبث</h2>' +
                        '<p class="account-stream-status"><span class="dashboard-stats-dot"></span>الحالة الحالية: غير متصل</p>' +
                        '<div class="account-stream-buttons">' +
                            '<span class="account-stream-btn" title="قريباً">🎵 ربط تيك توك</span>' +
                            '<span class="account-stream-btn" title="قريباً">▶️ ربط يوتيوب</span>' +
                            '<span class="account-stream-btn" title="قريباً">🟣 ربط تويتش</span>' +
                        '</div>' +
                        '<p class="account-stream-note">هذا الاتصال يخص الحساب بالكامل، ويُستخدَم تلقائياً من أي لعبة تفتحها.</p>' +
                    '</section>' +
                '</div>' +
            '</div>';
    }

    // ---- 5) Settings ----
    function renderSettingsPage(params, contentEl) {
        var settingGroups = [
            { icon: '👤', name: 'الحساب' },
            { icon: '🔔', name: 'الإشعارات' },
            { icon: '🌐', name: 'اللغة والمنطقة' },
            { icon: '🔒', name: 'الخصوصية' }
        ];

        var groupsHtml = settingGroups.map(function (group) {
            return (
                '<div class="settings-group-card">' +
                    '<span class="settings-group-icon">' + group.icon + '</span>' +
                    '<span class="settings-group-name">' + group.name + '</span>' +
                    '<span class="settings-group-badge">قريباً</span>' +
                '</div>'
            );
        }).join('');

        contentEl.innerHTML =
            '<div class="static-page">' +
                '<div class="static-page-header page-header">' +
                    '<span class="static-page-icon page-header-icon" aria-hidden="true">⚙️</span>' +
                    '<div>' +
                        '<h1 class="dashboard-home-title category-page-title">الإعدادات</h1>' +
                        '<p class="dashboard-home-subtitle">إعدادات عامة للمنصة.</p>' +
                    '</div>' +
                '</div>' +
                '<div class="settings-groups-grid">' + groupsHtml + '</div>' +
            '</div>';
    }

    // ---- 6) Marketplace (محجوز للمستقبل) ----
    function renderMarketplacePage(params, contentEl) {
        var ghostCardsHtml = '';
        var i;
        for (i = 0; i < 3; i++) {
            ghostCardsHtml += '<div class="marketplace-ghost-card"><span class="marketplace-ghost-lock">🔒</span></div>';
        }

        contentEl.innerHTML =
            '<div class="static-page">' +
                '<div class="marketplace-hero">' +
                    '<span class="marketplace-hero-icon" aria-hidden="true">🛒</span>' +
                    '<h1 class="marketplace-hero-title">المتجر</h1>' +
                    '<span class="marketplace-hero-badge">قريباً</span>' +
                    '<p class="marketplace-hero-desc">' +
                        'ستتمكّن قريباً من تصفّح ألعاب وتصنيفات جديدة وإضافتها لحسابك مباشرة من هنا.' +
                    '</p>' +
                '</div>' +
                '<div class="marketplace-ghost-row">' + ghostCardsHtml + '</div>' +
            '</div>';
    }

    // ---- 7) Login ----
    function renderLoginPage(params, contentEl) {
        contentEl.innerHTML =
            '<div class="auth-page">' +
                '<span class="auth-page-icon" aria-hidden="true">🔒</span>' +
                '<span class="auth-brand">AGP Dashboard</span>' +
                '<h1 class="auth-page-title">تسجيل الدخول</h1>' +
                '<p class="auth-page-subtitle">نموذج تسجيل الدخول الفعلي قيد الإنشاء — معاينة الشكل النهائي فقط.</p>' +

                '<div class="auth-field">' +
                    '<label class="auth-field-label">البريد الإلكتروني</label>' +
                    '<input class="auth-field-input" type="email" placeholder="you@example.com" disabled>' +
                '</div>' +
                '<div class="auth-field">' +
                    '<label class="auth-field-label">كلمة المرور</label>' +
                    '<input class="auth-field-input" type="password" placeholder="••••••••" disabled>' +
                '</div>' +

                '<span class="auth-submit-btn" title="معاينة فقط — غير فعّال بعد">تسجيل الدخول</span>' +
                '<a class="auth-switch-link" href="#/signup">ليس عندك حساب؟ أنشئ حساباً جديداً</a>' +
            '</div>';
    }

    // ---- 8) Signup ----
    function renderSignupPage(params, contentEl) {
        contentEl.innerHTML =
            '<div class="auth-page">' +
                '<span class="auth-page-icon" aria-hidden="true">✨</span>' +
                '<span class="auth-brand">AGP Dashboard</span>' +
                '<h1 class="auth-page-title">إنشاء حساب</h1>' +
                '<p class="auth-page-subtitle">نموذج إنشاء الحساب الفعلي قيد الإنشاء — معاينة الشكل النهائي فقط.</p>' +

                '<div class="auth-field">' +
                    '<label class="auth-field-label">الاسم</label>' +
                    '<input class="auth-field-input" type="text" placeholder="اسمك الكامل" disabled>' +
                '</div>' +
                '<div class="auth-field">' +
                    '<label class="auth-field-label">البريد الإلكتروني</label>' +
                    '<input class="auth-field-input" type="email" placeholder="you@example.com" disabled>' +
                '</div>' +
                '<div class="auth-field">' +
                    '<label class="auth-field-label">كلمة المرور</label>' +
                    '<input class="auth-field-input" type="password" placeholder="••••••••" disabled>' +
                '</div>' +

                '<span class="auth-submit-btn" title="معاينة فقط — غير فعّال بعد">إنشاء حساب</span>' +
                '<a class="auth-switch-link" href="#/login">عندك حساب بالفعل؟ سجّل الدخول</a>' +
            '</div>';
    }

    // ---- تسجيل كل المسارات ----
    NS.router.registerRoute('/dashboard', renderDashboardPage);
    NS.router.registerRoute('/categories/:categoryId', renderCategoriesPage);
    NS.router.registerRoute('/games/:gameId', renderGamePage);
    NS.router.registerRoute('/account', renderAccountPage);
    NS.router.registerRoute('/settings', renderSettingsPage);
    NS.router.registerRoute('/marketplace', renderMarketplacePage);
    NS.router.registerRoute('/login', renderLoginPage, { isPublic: true });
    NS.router.registerRoute('/signup', renderSignupPage, { isPublic: true });

}(window.AGPDashboard));
