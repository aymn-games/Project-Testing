/**
 * ==========================================================================
 *  AGP DASHBOARD (CORE) — أول لوحة تحكم دائمة، تعمل فوق AGP Core فقط
 * ==========================================================================
 *
 * هذا الملف هو منطق الواجهة فقط. لا يحتوي على أي منطق منصة جديد ولا أي
 * State Machine خاصة به — كل قسم (Component) هنا يقرأ حالته حصراً من
 * الـ Manager المالك لها فعلياً في AGP Core، وكل زر يستدعي دالة عامة
 * موجودة أصلاً في ذلك الـ Manager (أو يبث حدث AGP.events موجود أصلاً،
 * بنفس الطريقة التي تستخدمها أي لعبة متصلة فعلياً).
 *
 * التنظيم: كل قسم في الواجهة (Session/Room/Lobby/Queue/Players/Round/
 * Timer/Event Log) له "Component" مستقل هنا (كائن بدالة render() تقرأ
 * وتعرض حالته، ودوال الأفعال إن وُجدت)، حتى يسهل توسيع كل قسم لاحقاً
 * دون التأثير على البقية — هذا الأساس الذي ستُبنى عليه لوحة الـ Streamer
 * النهائية لاحقاً، دون إعادة كتابة أي شيء هنا.
 *
 * لا اتصال شبكي، لا TikTok، لا Manager جديد، لا تعديل على أي ملف Core.
 * ==========================================================================
 */

window.AGPDashboardCore = window.AGPDashboardCore || {};

(function (NS) {
    'use strict';

    var AGP = window.AymanGamesPlatform;

    /**
     * ⚠️ قرار منتج (وليس تقني): معظم الألعاب الحالية (الروليت وغيرها)
     * ألعاب فردية، لا تعتمد فرقاً. مكوّنا الفرق أدناه (teamSettings،
     * playersByTeam) **لم يُحذفا ولم يتغيّر منطقهما إطلاقاً** — فقط
     * تعطيل عرضهما التلقائي هنا عبر هذا العلم الواحد، حتى تبقى الآلية
     * جاهزة فوراً لأي لعبة مستقبلية تحتاج فرقاً فعلياً (بتفعيل هذا العلم
     * فقط، دون أي إعادة كتابة). عناصر الواجهة المقابلة مخفاة في
     * index.html (لا محذوفة) لنفس السبب.
     */
    var TEAM_FEATURES_ENABLED = false;

    /* ----------------------------------------------------------------
     * أدوات مساعدة صغيرة للواجهة فقط (DOM)، لا علاقة لها بـ AGP Core.
     * ---------------------------------------------------------------- */
    function el(id) {
        return document.getElementById(id);
    }

    function setText(id, value) {
        var target = el(id);
        if (!target) return;
        target.textContent = (value === null || value === undefined || value === '') ? '—' : String(value);
    }

    function setList(id, items, renderItem) {
        var target = el(id);
        if (!target) return;
        target.innerHTML = '';
        items.forEach(function (item) {
            var li = document.createElement('li');
            li.textContent = renderItem(item);
            target.appendChild(li);
        });
    }

    function setTableRows(id, items, renderCells, emptyColSpan) {
        var target = el(id);
        if (!target) return;
        target.innerHTML = '';
        if (!items.length) {
            var emptyRow = document.createElement('tr');
            var emptyCell = document.createElement('td');
            emptyCell.colSpan = emptyColSpan || 1;
            emptyCell.className = 'table-empty';
            emptyCell.textContent = 'No players yet.';
            emptyRow.appendChild(emptyCell);
            target.appendChild(emptyRow);
            return;
        }
        items.forEach(function (item) {
            var tr = document.createElement('tr');
            renderCells(item).forEach(function (cellText) {
                var td = document.createElement('td');
                td.textContent = cellText;
                tr.appendChild(td);
            });
            target.appendChild(tr);
        });
    }

    function gameId() {
        var input = el('gameIdInput');
        var value = input ? input.value.trim() : '';
        return value || undefined;
    }

    function setDisabled(id, disabled) {
        var target = el(id);
        if (target) target.disabled = !!disabled;
    }

    /* ==================================================================
     *  Guided Workflow — عرضي بحت، لا حالة جديدة. كل شيء يُشتق من قراءات
     *  AGP الموجودة أصلاً (getCurrentGame/hasActiveRoom/getRoundState/
     *  keywordManager.isActive)، ويستدعي نفس دوال الأزرار الموجودة أصلاً.
     * ================================================================== */
    var WORKFLOW_STEPS = [
        { key: 'select-game', label: 'Select Game' },
        { key: 'create-room', label: 'Create Room' },
        { key: 'open-registration', label: 'Open Registration' },
        { key: 'game-settings', label: 'Game Settings' },
        { key: 'join-keyword', label: 'Join Keyword' },
        { key: 'start-round', label: 'Start Round' },
        { key: 'end-round', label: 'End Round' },
        { key: 'reset', label: 'Reset / New Round' }
    ];

    function computeWorkflow() {
        var currentGame = AGP.gameManager.getCurrentGame();
        var hasRoom = AGP.roomsManager.hasActiveRoom();
        var roundState = AGP.gameManager.getRoundState();
        var keywordActive = AGP.keywordManager.isActive();

        var ALL_BEFORE_ROUND = ['select-game', 'create-room', 'open-registration', 'game-settings', 'join-keyword'];

        if (!currentGame) {
            return { completed: [], activeKey: 'select-game', text: 'Select a registered game above.', action: null };
        }
        if (!hasRoom) {
            return { completed: ['select-game'], activeKey: 'create-room', text: 'Create a room to start a session.', action: function () { NS.components.room.createRoom(); } };
        }
        if (!roundState || roundState === 'idle') {
            return { completed: ['select-game', 'create-room'], activeKey: 'open-registration', text: 'Open registration for players to join.', action: function () { NS.components.lobby.open(); } };
        }
        if (roundState === 'registration_open') {
            var c1 = ['select-game', 'create-room', 'open-registration'];
            if (keywordActive) c1.push('join-keyword');
            return { completed: c1, activeKey: 'game-settings', text: 'Optional: settings/keyword, then start the round.', action: function () { NS.components.round.start(); } };
        }
        if (roundState === 'ready') {
            return { completed: ALL_BEFORE_ROUND, activeKey: 'start-round', text: 'Start the round.', action: function () { NS.components.round.start(); } };
        }
        if (roundState === 'in_progress') {
            return { completed: ALL_BEFORE_ROUND.concat(['start-round']), activeKey: 'end-round', text: 'End the round when ready.', action: function () { NS.components.round.end(); } };
        }
        if (roundState === 'round_ended') {
            return { completed: ALL_BEFORE_ROUND.concat(['start-round', 'end-round']), activeKey: 'reset', text: 'Reset to start a new round.', action: function () { NS.components.controls.reset(); } };
        }
        return { completed: [], activeKey: 'select-game', text: '—', action: null };
    }

    NS.workflow = {
        _nextAction: null,

        render: function () {
            var state = computeWorkflow();
            this._nextAction = state.action;

            var stepsEl = el('workflow-steps');
            if (stepsEl) {
                stepsEl.innerHTML = '';
                WORKFLOW_STEPS.forEach(function (step) {
                    var span = document.createElement('span');
                    var status = state.completed.indexOf(step.key) !== -1 ? 'done'
                        : (step.key === state.activeKey ? 'active' : 'upcoming');
                    span.className = 'workflow-step workflow-step--' + status;
                    span.textContent = step.label;
                    stepsEl.appendChild(span);
                });
            }

            setText('workflow-next-text', state.text);

            // تفعيل/تعطيل الأزرار الأربعة الأساسية فقط، حسب نفس القراءات
            // أعلاه (لا حالة جديدة).
            var hasRoom = AGP.roomsManager.hasActiveRoom();
            var roundState = AGP.gameManager.getRoundState();

            setDisabled('btn-create-room', hasRoom);
            setDisabled('btn-open-registration', !hasRoom || roundState === 'in_progress' || roundState === 'round_ended');
            setDisabled('btn-start-round', !(roundState === 'registration_open' || roundState === 'ready'));
            setDisabled('btn-end-round', roundState !== 'in_progress');
        },

        runNext: function () {
            if (typeof this._nextAction === 'function') {
                this._nextAction();
            }
        }
    };

    /* ==================================================================
     *  Modal — أداة عرض عامة (تأكيد/تفاصيل)، لا علاقة لها بـ AGP إطلاقاً.
     *  أي Component يحتاج تأكيداً أو نافذة تفاصيل يستخدم هذا بدل بناء
     *  نافذته الخاصة، حتى يبقى شكل وسلوك كل النوافذ موحّداً.
     * ================================================================== */
    /* ==================================================================
     *  Toast — إشعارات عابرة عامة (نجاح/خطأ/معلومة). لا علاقة لها بـ AGP
     *  إطلاقاً؛ أي كود يستدعيها بنص جاهز فقط.
     * ================================================================== */
    NS.toast = {
        show: function (message, type) {
            var container = el('toast-container');
            if (!container) return;

            var toast = document.createElement('div');
            toast.className = 'toast toast--' + (type || 'info');
            toast.setAttribute('role', 'status');
            toast.textContent = message;
            container.appendChild(toast);

            // إعادة تدفق قسري (Reflow) قبل إضافة صنف الظهور، حتى يعمل
            // الانتقال (Transition) بدل القفز المباشر للحالة النهائية.
            void toast.offsetWidth;
            toast.classList.add('toast--visible');

            setTimeout(function () {
                toast.classList.remove('toast--visible');
                setTimeout(function () {
                    if (toast.parentNode) toast.parentNode.removeChild(toast);
                }, 250);
            }, 3200);
        },
        success: function (message) { this.show(message, 'success'); },
        error: function (message) { this.show(message, 'error'); },
        info: function (message) { this.show(message, 'info'); }
    };

    NS.modal = {
        _onConfirm: null,

        show: function (options) {
            setText('modal-title', options.title || '');
            var body = el('modal-body');
            if (body) body.innerHTML = options.body || '';

            var confirmBtn = el('modal-confirm-btn');
            if (confirmBtn) {
                confirmBtn.textContent = options.confirmLabel || 'OK';
                confirmBtn.className = 'btn ' + (options.confirmClass || 'btn-primary');
            }

            this._onConfirm = typeof options.onConfirm === 'function' ? options.onConfirm : null;

            var overlay = el('modal-overlay');
            if (overlay) {
                overlay.style.display = 'flex';
                overlay.classList.add('modal-overlay--visible');
            }
            if (confirmBtn) confirmBtn.focus();
        },

        confirm: function () {
            var fn = this._onConfirm;
            this.hide();
            if (fn) fn();
        },

        hide: function () {
            var overlay = el('modal-overlay');
            if (overlay) {
                overlay.classList.remove('modal-overlay--visible');
                overlay.style.display = 'none';
            }
            this._onConfirm = null;
        }
    };

    // إغلاق النافذة المنبثقة بمفتاح Escape، أو بالنقر خارج صندوقها —
    // تحسين إتاحة/استخدام بحت، لا يغيّر أي سلوك موجود.
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') NS.modal.hide();
    });
    document.addEventListener('click', function (event) {
        if (event.target && event.target.id === 'modal-overlay') NS.modal.hide();
    });

    /* ==================================================================
     *  Components — كل قسم مسؤول عن Manager واحد فقط
     * ================================================================== */
    NS.components = {};

    /**
     * Game — يقرأ اللعبة النشطة الحالية عبر AGP.gameManager.getCurrentGame()
     * (تفويض لـ AGP.gameEngine.getLoadedGame())، ويحمّل أي لعبة مسجَّلة
     * بمعرّفها عبر AGP.gameManager.loadGame(id). عام تماماً: لا يعرف شيئاً
     * عن الروليت أو أي لعبة بعينها — أي لعبة مستقبلية (تيك توك مستقبلاً)
     * تُسجَّل بنفس الطريقة (AGP.gameManager.registerGame) ستظهر هنا فور
     * تحميلها بنفس هذا الكود، دون أي تعديل.
     */
    NS.components.game = {
        render: function () {
            var current = AGP.gameManager.getCurrentGame();
            setText('current-game-name', current ? (current.name || current.id) : null);
            setText('current-game-id', current ? current.id : null);
        },
        loadGame: function () {
            var id = gameId();
            if (!id) {
                NS.components.eventLog.log('dashboard:error', { message: 'Enter a Game ID first.' });
                NS.toast.error('Enter a Game ID first.');
                return;
            }
            AGP.gameManager.loadGame(id);
        }
    };

    /**
     * Game Selector — يقرأ كل الألعاب المسجَّلة عبر
     * AGP.gameManager.getRegisteredGames() (تفويض لـ AGP.gameAPI.getAllGames)
     * ويعرضها كقائمة قابلة للاختيار، بدل كتابة المعرّف يدوياً. الاختيار
     * يملأ حقل gameIdInput الموجود أصلاً ثم يستدعي Load Game بنفس الآلية.
     * عام تماماً: لا يعرف شيئاً عن الروليت أو أي لعبة بعينها؛ أي لعبة
     * تُسجَّل مستقبلاً (بما فيها ألعاب تيك توك) تظهر هنا تلقائياً.
     */
    NS.components.gameSelector = {
        render: function () {
            var games = AGP.gameManager.getRegisteredGames();
            var current = AGP.gameManager.getCurrentGame();
            var container = el('game-selector-list');
            if (!container) return;
            container.innerHTML = '';

            if (!games.length) {
                var empty = document.createElement('div');
                empty.className = 'empty-note';
                empty.textContent = 'No games registered yet.';
                container.appendChild(empty);
                return;
            }

            games.forEach(function (game) {
                var item = document.createElement('button');
                item.type = 'button';
                item.className = 'game-select-item' + (current && current.id === game.id ? ' active' : '');
                item.textContent = game.name || game.id;
                item.onclick = function () { NS.components.gameSelector.select(game.id); };
                container.appendChild(item);
            });
        },
        select: function (id) {
            var input = el('gameIdInput');
            if (input) input.value = id;
            AGP.gameManager.loadGame(id);
        }
    };

    /**
     * Stream Status — قراءة فقط، عبر AGP.streamConnector الموجود أصلاً
     * (منصات مسجَّلة كـ Stubs فقط: tiktok/youtube/twitch). لا اتصال فعلي
     * هنا ولا في Core نفسه؛ الحالة الحقيقية اليوم "disconnected" دائماً،
     * وتُعرَض كما هي بصدق دون أي محاكاة.
     */
    /**
     * Stream Status — قراءة عبر AGP.streamConnector الموجود أصلاً (منصات
     * مسجَّلة كـ Stubs: tiktok/youtube/twitch)، وأزرار Connect/Disconnect
     * (Phase 2: Stream control) تستدعي AGP.streamConnector.connect()/
     * disconnect() مباشرة — موجودتان أصلاً في Core ولم تُستخدَما من قبل.
     * لا اتصال فعلي هنا ولا في Core نفسه (لا TikTok بعد)؛ الضغط على
     * Connect ينقل الحالة إلى "connecting" بصدق فقط (الخدمة الأساسية
     * TikTokService/YouTubeService/TwitchService لا تزال Stub فارغة).
     */
    NS.components.streamStatus = {
        render: function () {
            if (!AGP.streamConnector) return;
            var platforms = AGP.streamConnector.getSupportedPlatforms();
            var container = el('stream-status-list');
            if (!container) return;
            container.innerHTML = '';

            platforms.forEach(function (platform) {
                var row = document.createElement('li');
                row.className = 'stream-row';

                var label = document.createElement('span');
                label.textContent = platform + ': ' + AGP.streamConnector.getStatus(platform);
                row.appendChild(label);

                var connectBtn = document.createElement('button');
                connectBtn.type = 'button';
                connectBtn.className = 'btn btn-xs';
                connectBtn.textContent = 'Connect';
                connectBtn.onclick = function () { NS.components.streamStatus.connect(platform); };
                row.appendChild(connectBtn);

                var disconnectBtn = document.createElement('button');
                disconnectBtn.type = 'button';
                disconnectBtn.className = 'btn btn-xs';
                disconnectBtn.textContent = 'Disconnect';
                disconnectBtn.onclick = function () { NS.components.streamStatus.disconnect(platform); };
                row.appendChild(disconnectBtn);

                container.appendChild(row);
            });
        },
        connect: function (platform) {
            AGP.streamConnector.connect(platform);
            refreshAll();
        },
        disconnect: function (platform) {
            AGP.streamConnector.disconnect(platform);
            refreshAll();
        }
    };

    /* ==================================================================
     *  Roulette Controls — لوحة خاصة بالروليت تحديداً (وليست عامة)، لكن
     *  كل آلية استخدمتها هنا موجودة أصلاً في AGP Core بالفعل. أي لعبة
     *  مستقبلية تحتاج لوحة إعدادات مشابهة تبني نفس النمط (بمفتاح تخزين
     *  خاص بها، وطابعَي مؤقّت خاصَّين بها)، دون أي تعديل على هذا الملف.
     * ================================================================== */

    var TEAM_SETTINGS_KEY = 'roulette:teamSettings';
    var DEFAULT_TEAM_SETTINGS = { teamCount: 2, playersPerTeam: 5, teamNames: ['Team A', 'Team B'] };

    /**
     * Team Settings — تخزين/قراءة إعدادات الفرق حصراً عبر
     * AGP.storageManager (تخزين عام namespaced موجود أصلاً). لا يفرض
     * أي قاعدة لعب (لا يمنع تجاوز عدد اللاعبين لكل فريق مثلاً)؛ مجرد
     * تفضيلات معروضة، لأن لا وحدة Core تفرض قواعد كهذه اليوم.
     */
    NS.components.teamSettings = {
        getSettings: function () {
            return AGP.storageManager.get(TEAM_SETTINGS_KEY, DEFAULT_TEAM_SETTINGS);
        },
        render: function () {
            var settings = this.getSettings();
            setText('current-team-count', settings.teamCount);
            setText('current-players-per-team', settings.playersPerTeam);
            setText('current-team-names', settings.teamNames.join(', '));

            var teamCountInput = el('teamCountInput');
            var playersPerTeamInput = el('playersPerTeamInput');
            var teamNamesInput = el('teamNamesInput');
            if (teamCountInput && document.activeElement !== teamCountInput) teamCountInput.value = settings.teamCount;
            if (playersPerTeamInput && document.activeElement !== playersPerTeamInput) playersPerTeamInput.value = settings.playersPerTeam;
            if (teamNamesInput && document.activeElement !== teamNamesInput) teamNamesInput.value = settings.teamNames.join(', ');
        },
        save: function () {
            var teamCount = parseInt(el('teamCountInput').value, 10) || DEFAULT_TEAM_SETTINGS.teamCount;
            var playersPerTeam = parseInt(el('playersPerTeamInput').value, 10) || DEFAULT_TEAM_SETTINGS.playersPerTeam;
            var teamNames = el('teamNamesInput').value.split(',')
                .map(function (name) { return name.trim(); })
                .filter(function (name) { return name.length > 0; });
            if (!teamNames.length) teamNames = DEFAULT_TEAM_SETTINGS.teamNames;

            var settings = { teamCount: teamCount, playersPerTeam: playersPerTeam, teamNames: teamNames };
            AGP.storageManager.set(TEAM_SETTINGS_KEY, settings);
            NS.components.eventLog.log('dashboard:teamSettingsSaved', settings);
            refreshAll();
        }
    };

    /**
     * Join Keyword — تفويض كامل لـ AGP.keywordManager الموجود أصلاً.
     */
    NS.components.keyword = {
        render: function () {
            setText('keyword-current', AGP.keywordManager.getKeyword());
            setText('keyword-status', AGP.keywordManager.isActive() ? 'active' : 'inactive');
        },
        setKeyword: function () {
            var value = el('keywordInput').value.trim();
            if (!value) return;
            AGP.keywordManager.setKeyword(value);
            refreshAll();
        },
        activate: function () {
            AGP.keywordManager.activate();
            refreshAll();
        },
        deactivate: function () {
            AGP.keywordManager.deactivate();
            refreshAll();
        }
    };

    /**
     * Registration Timer / Round Timer — كلاهما فوق AGP.timerManager
     * الموجود أصلاً، بأسماء مؤقّتات ثابتة ('registration'/'round').
     * عند انتهاء أيّهما (timer:ended)، تُستدعى نفس دالة اللوحة الموجودة
     * أصلاً (closeRegistration/إطلاق game:roundEnded) تلقائياً — هذا
     * الربط التلقائي موجود في هذا الملف (لوحة)، وليس داخل AGP Core نفسه.
     */
    NS.components.timers = {
        render: function () {
            setText('registration-timer-remaining',
                AGP.timerManager.isRunning('registration') ? AGP.timerManager.getRemainingSeconds('registration') + 's' : '—');
            setText('round-timer-remaining',
                AGP.timerManager.isRunning('round') ? AGP.timerManager.getRemainingSeconds('round') + 's' : '—');
        },
        startRegistration: function () {
            var seconds = parseInt(el('registrationTimerInput').value, 10);
            if (!seconds || seconds <= 0) return;
            AGP.timerManager.start('registration', seconds);
        },
        stopRegistration: function () {
            AGP.timerManager.stop('registration');
            refreshAll();
        },
        startRound: function () {
            var seconds = parseInt(el('roundTimerInput').value, 10);
            if (!seconds || seconds <= 0) return;
            AGP.timerManager.start('round', seconds);
        },
        stopRound: function () {
            AGP.timerManager.stop('round');
            refreshAll();
        }
    };

    /**
     * Winner Display — لا يوجد Manager يخزّن "آخر فائز" في Core اليوم؛
     * هذا المكوّن يستمع فقط لحدث game:winnerSelected (تُبلِّغه الروليت
     * فعلياً عبر Game Bridge) ويحتفظ بآخر قيمة محلياً للعرض. لا يُنشئ
     * أي حالة جديدة في AGP نفسها، ولا يخزّنها بشكل دائم (تُفرَّغ عند
     * game:reset، ولا تنجو من إعادة تحميل الصفحة).
     */
    NS.components.winner = {
        _last: null,
        render: function () {
            setText('winner-display', this._last ? JSON.stringify(this._last) : 'No winner yet.');
        },
        setWinner: function (payload) {
            this._last = payload || null;
            this.render();
        },
        clear: function () {
            this._last = null;
            this.render();
        }
    };

    /**
     * Players by Team — يقرأ فقط عبر AGP.gameManager.getPlayers() (نفس
     * مصدر جدول اللاعبين العام)، ويجمعهم حسب حقل player.team إن وُجد
     * (Player Manager يحفظ أي حقل إضافي كما هو دون تفسير — راجع
     * agp-player-manager.js). لا توجد اليوم أي آلية Core تُسنِد فريقاً
     * للاعب تلقائياً؛ هذا العرض صادق مع الواقع (الكل "Unassigned" حتى
     * يُمرَّر حقل team فعلياً عند الانضمام من مصدر ما).
     */
    NS.components.playersByTeam = {
        render: function () {
            var players = AGP.gameManager.getPlayers();
            var settings = NS.components.teamSettings.getSettings();
            var groups = {};
            settings.teamNames.forEach(function (name) { groups[name] = []; });
            groups.Unassigned = [];

            players.forEach(function (player) {
                var team = (player.team && Object.prototype.hasOwnProperty.call(groups, player.team))
                    ? player.team : 'Unassigned';
                groups[team].push(player);
            });

            var container = el('players-by-team');
            if (!container) return;
            container.innerHTML = '';

            Object.keys(groups).forEach(function (team) {
                var block = document.createElement('div');
                block.className = 'team-block';

                var title = document.createElement('div');
                title.className = 'team-block-title';
                title.textContent = team + ' (' + groups[team].length + ')';
                block.appendChild(title);

                var list = document.createElement('ul');
                list.className = 'list';
                groups[team].forEach(function (player) {
                    var li = document.createElement('li');
                    li.textContent = player.id + (player.name ? ' — ' + player.name : '');
                    list.appendChild(li);
                });
                block.appendChild(list);

                container.appendChild(block);
            });
        }
    };

    /**
     * Game Settings Placeholder — عام تماماً، لا يعرف شيئاً عن الفرق أو
     * أي منطق لعبة بعينها. مكان مؤقت لحين بناء إطار "إعدادات لكل لعبة"
     * عام (موثَّق كعمل مستقبلي في ARCHITECTURE.md، لم يُبنَ بعد).
     */
    NS.components.gameSettingsPlaceholder = {
        render: function () {
            var current = AGP.gameManager.getCurrentGame();
            var name = current ? (current.name || current.id) : null;
            setText('game-settings-placeholder-text',
                name
                    ? name + ' has no custom settings yet.'
                    : 'Load a game to see its settings here.');
        }
    };

    /**
     * Session — يقرأ حصراً من AGP.session. لا زر خاص به (لا توجد دالة
     * عامة لإنشاء جلسة مباشرة من هنا؛ ذلك يحدث تلقائياً عبر Create Room).
     */
    NS.components.session = {
        render: function () {
            setText('session-state', AGP.session.getState());
        }
    };

    /**
     * Room — يقرأ ويكتب حصراً عبر AGP.roomsManager.
     */
    NS.components.room = {
        render: function () {
            setText('room-state', AGP.roomsManager.getRoomState());
            var current = AGP.roomsManager.getCurrentRoom();
            setText('room-id', current ? current.id : '—');
        },
        createRoom: function () {
            AGP.roomsManager.createRoom(gameId());
        }
    };

    /**
     * Lobby — يقرأ عبر AGP.gameManager.getLobbyState() (تفويض لـ
     * AGP.lobby.getLobbyState())، ويكتب عبر AGP.gameManager
     * .openRegistration()/closeRegistration() (تفويض لـ AGP.lobby.open()/
     * close()) — نقطة الاتصال الموصى بها من أي Dashboard، كما هو موثَّق
     * في agp-game-manager.js نفسه.
     */
    NS.components.lobby = {
        render: function () {
            setText('lobby-state', AGP.gameManager.getLobbyState());
            setText('lobby-joincode', (typeof AGP.session.getJoinCode === 'function') ? AGP.session.getJoinCode() : null);
        },
        open: function () {
            AGP.gameManager.openRegistration();
        },
        close: function () {
            AGP.gameManager.closeRegistration();
        }
    };

    /**
     * Queue — يقرأ ويكتب حصراً عبر AGP.queueManager. لا واجهة إضافة هنا
     * (Enqueue ليست من الأزرار المطلوبة لهذه المرحلة)؛ Admit Next/All
     * تقبلان أي لاعبين موجودين بالفعل في الطابور من أي مصدر آخر (مثل
     * AGP.keywordManager أو استدعاء مباشر من الـ Console).
     */
    NS.components.queue = {
        render: function () {
            var queue = AGP.queueManager.getQueue();
            setText('queue-count', queue.length);
            setList('queue-list', queue, function (item) {
                return (item.playerData && item.playerData.id) + ' (' + item.sourceKey + ')';
            });
        },
        admitNext: function () {
            AGP.queueManager.admitNext();
        },
        admitAll: function () {
            AGP.queueManager.admitAll();
        }
    };

    /**
     * Players — قراءة فقط، عبر AGP.gameManager.getPlayersCount()/
     * getPlayers() (تفويض لـ AGP.player). لا زر إضافة هنا؛ الانضمام
     * يحدث عبر Lobby.requestJoin أو أي مصدر آخر متصل بـ AGP.playerSource.
     */
    /**
     * Players — يقرأ عبر AGP.gameManager.getPlayers() (تفويض لـ
     * AGP.player.getAllPlayers). زر الحذف (Phase 2: Player management)
     * يستدعي AGP.player.removePlayer(id) مباشرة — موجودة أصلاً في Core
     * ولم تُستخدَم من قبل في أي لوحة.
     */
    /**
     * Players — يقرأ عبر AGP.gameManager.getPlayers()، يحذف عبر
     * AGP.player.removePlayer(id) (نفس المصدر الوحيد كما كان). كل ما
     * أُضيف هنا (بحث/فلترة/تحديد جماعي/تأكيد/تفاصيل) منطق عرض بحت فوق
     * نفس البيانات — لا قراءة أو كتابة جديدة على AGP.
     *
     * ⚠️ قيد منصّة حقيقي: مصدر الانضمام (`player.source`) يُضبَط فقط
     * عند الانضمام عبر AGP.playerSource (كلمة المرور/الطابور/أي مصدر
     * مسجَّل). الانضمام المباشر عبر AGP.lobby.requestJoin() **لا يضبط
     * هذا الحقل إطلاقاً** (Lobby يستدعي AGP.player.addPlayer() مباشرة،
     * بدون المرور بـ PlayerSource — فجوة معمارية موثَّقة سابقاً في
     * ARCHITECTURE.md، لم تُصلَح). لذلك أي لاعب بلا `source` يُعرَض هنا
     * بصدق كـ"Lobby / Direct" بدل افتراض قيمة قد تكون خاطئة.
     */
    NS.components.players = {
        _search: '',
        _sourceFilter: 'all',
        _selected: {},

        getFiltered: function () {
            var players = AGP.gameManager.getPlayers();
            var q = this._search.trim().toLowerCase();
            var sourceFilter = this._sourceFilter;

            return players.filter(function (player) {
                var source = player.source || 'lobby';
                if (sourceFilter !== 'all' && source !== sourceFilter) return false;
                if (!q) return true;
                var id = (player.id || '').toLowerCase();
                var name = (player.name || '').toLowerCase();
                return id.indexOf(q) !== -1 || name.indexOf(q) !== -1;
            });
        },

        render: function () {
            var allPlayers = AGP.gameManager.getPlayers();
            setText('players-count', allPlayers.length);

            // خيارات الفلتر تُبنى ديناميكياً من المصادر الموجودة فعلياً
            // في اللاعبين الحاليين + 'lobby' كقيمة افتراضية صريحة — عام
            // تماماً، يعمل لأي مصدر مستقبلي (تيك توك مثلاً) دون تعديل.
            var sources = {};
            allPlayers.forEach(function (p) { sources[p.source || 'lobby'] = true; });
            var filterEl = el('playersSourceFilter');
            if (filterEl) {
                var current = filterEl.value || this._sourceFilter;
                filterEl.innerHTML = '<option value="all">All sources</option>';
                Object.keys(sources).sort().forEach(function (s) {
                    var opt = document.createElement('option');
                    opt.value = s;
                    opt.textContent = s;
                    filterEl.appendChild(opt);
                });
                filterEl.value = Object.prototype.hasOwnProperty.call(sources, current) || current === 'all' ? current : 'all';
                this._sourceFilter = filterEl.value;
            }

            var filtered = this.getFiltered();
            var selected = this._selected;

            var target = el('players-table-body');
            if (!target) return;
            target.innerHTML = '';

            if (!filtered.length) {
                var emptyRow = document.createElement('tr');
                var emptyCell = document.createElement('td');
                emptyCell.colSpan = 6;
                emptyCell.className = 'table-empty';
                emptyCell.textContent = allPlayers.length ? 'No players match your search/filter.' : 'No players yet.';
                emptyRow.appendChild(emptyCell);
                target.appendChild(emptyRow);
            } else {
                filtered.forEach(function (player) {
                    var tr = document.createElement('tr');

                    var checkCell = document.createElement('td');
                    var checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = !!selected[player.id];
                    checkbox.onchange = function () { NS.components.players.toggleSelect(player.id, checkbox.checked); };
                    checkCell.appendChild(checkbox);
                    tr.appendChild(checkCell);

                    [player.id, player.name || '—',
                     player.joinedAt ? new Date(player.joinedAt).toLocaleTimeString() : '—'
                    ].forEach(function (text) {
                        var td = document.createElement('td');
                        td.textContent = text;
                        tr.appendChild(td);
                    });

                    var sourceCell = document.createElement('td');
                    var sourceBadge = document.createElement('span');
                    sourceBadge.className = 'badge badge-source';
                    sourceBadge.textContent = player.source || 'lobby';
                    sourceCell.appendChild(sourceBadge);
                    tr.appendChild(sourceCell);

                    var actionCell = document.createElement('td');
                    var viewBtn = document.createElement('button');
                    viewBtn.type = 'button';
                    viewBtn.className = 'btn btn-xs';
                    viewBtn.textContent = 'View';
                    viewBtn.onclick = function () { NS.components.players.viewDetails(player.id); };
                    actionCell.appendChild(viewBtn);

                    var removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'btn btn-xs btn-danger';
                    removeBtn.textContent = 'Remove';
                    removeBtn.onclick = function () { NS.components.players.confirmRemove(player.id); };
                    actionCell.appendChild(removeBtn);

                    tr.appendChild(actionCell);
                    target.appendChild(tr);
                });
            }

            this.renderBulkBar();
        },

        setSearch: function (value) {
            this._search = value;
            this.render();
        },

        setSourceFilter: function (value) {
            this._sourceFilter = value;
            this.render();
        },

        toggleSelect: function (playerId, checked) {
            if (checked) this._selected[playerId] = true;
            else delete this._selected[playerId];
            this.renderBulkBar();
        },

        toggleSelectAll: function (checked) {
            var self = this;
            this._selected = {};
            if (checked) {
                this.getFiltered().forEach(function (p) { self._selected[p.id] = true; });
            }
            this.render();
        },

        renderBulkBar: function () {
            var count = Object.keys(this._selected).length;
            var bar = el('players-bulk-bar');
            var countEl = el('players-bulk-count');
            if (countEl) countEl.textContent = count;
            if (bar) bar.style.display = count > 0 ? 'flex' : 'none';
        },

        /* ---- Remove (single + bulk), always behind confirmation ---- */

        confirmRemove: function (playerId) {
            var player = AGP.player.findPlayer(playerId);
            var label = player ? (player.name || player.id) : playerId;
            NS.modal.show({
                title: 'Remove player?',
                body: 'Remove <strong>' + label + '</strong> from the current session? This cannot be undone.',
                confirmLabel: 'Remove',
                confirmClass: 'btn-danger',
                onConfirm: function () {
                    AGP.player.removePlayer(playerId);
                    delete NS.components.players._selected[playerId];
                    refreshAll();
                }
            });
        },

        confirmRemoveSelected: function () {
            var ids = Object.keys(this._selected);
            if (!ids.length) return;
            NS.modal.show({
                title: 'Remove ' + ids.length + ' player(s)?',
                body: 'This removes all selected players from the current session. This cannot be undone.',
                confirmLabel: 'Remove All',
                confirmClass: 'btn-danger',
                onConfirm: function () {
                    ids.forEach(function (id) { AGP.player.removePlayer(id); });
                    NS.components.players._selected = {};
                    refreshAll();
                }
            });
        },

        /* ---- Details panel — generic, lists every field on the player object ---- */

        viewDetails: function (playerId) {
            var player = AGP.player.findPlayer(playerId);
            if (!player) return;

            var rows = Object.keys(player).map(function (key) {
                var value = player[key];
                if (key === 'joinedAt' && typeof value === 'number') {
                    value = new Date(value).toLocaleString();
                }
                return '<div class="stat"><span class="stat-label">' + key + '</span><span class="stat-value">' + value + '</span></div>';
            }).join('');

            NS.modal.show({
                title: 'Player Details',
                body: rows,
                confirmLabel: 'Close',
                confirmClass: 'btn-primary',
                onConfirm: null
            });
        }
    };

    /**
     * Round — يقرأ عبر AGP.gameManager.getRoundState() (تفويض لـ
     * AGP.roundManager.getState()). لا توجد دالة عامة لفرض حالة الجولة
     * (Round Manager يُصمَّم عمداً بلا setState())، لذا Start/End هنا
     * يبثّان بالضبط نفس حدثي AGP.events اللذين ترسلهما أي لعبة متصلة
     * فعلياً (`game:roundStarted`/`game:roundEnded`)، فتمر عبر Round
     * Manager وSession وGame API بنفس المسار الحقيقي تماماً.
     */
    NS.components.round = {
        render: function () {
            setText('round-state', AGP.gameManager.getRoundState());
        },
        start: function () {
            AGP.events.emit('game:roundStarted', { id: gameId() });
        },
        end: function () {
            AGP.events.emit('game:roundEnded', { id: gameId() });
        }
    };

    /**
     * Timer — قراءة فقط، عبر AGP.timerManager. لا مؤقّت يبدأ تلقائياً
     * من هذه اللوحة (لم يُطلَب زر لذلك)؛ يعرض أي مؤقّتات نشطة فعلياً
     * بدأتها وحدة أخرى (لعبة، أو مستقبلاً Round Manager).
     */
    NS.components.timer = {
        render: function () {
            var names = AGP.timerManager.getActiveTimers();
            setList('timer-list', names, function (name) {
                return name + ' — ' + AGP.timerManager.getRemainingSeconds(name) + 's';
            });
            var emptyNote = el('timer-empty');
            if (emptyNote) emptyNote.style.display = names.length ? 'none' : 'block';
        }
    };

    /**
     * Event Log — يعرض فقط أحداث AGP.events القادمة فعلياً من Core (لا
     * يُنشئ أي حدث بنفسه، ولا يفسّرها).
     */
    NS.components.eventLog = {
        log: function (eventName, payload) {
            var logEl = el('event-log');
            if (!logEl) return;
            var line = document.createElement('div');
            var time = new Date().toLocaleTimeString();
            line.innerHTML = '<span class="ev-time">[' + time + ']</span> ' +
                '<span class="ev-name">' + eventName + '</span> ' +
                (payload ? JSON.stringify(payload) : '');
            logEl.appendChild(line);
            logEl.scrollTop = logEl.scrollHeight;
        }
    };

    /**
     * Controls — Reset العام. يستخدم دالة Facade الموثَّقة خصيصاً لهذا
     * الغرض (AGP.gameManager.resetSession())، التي تبث game:reset —
     * نفس الحدث الذي تبثّه أي لعبة متصلة فعلياً عن نفسها.
     */
    NS.components.controls = {
        reset: function () {
            AGP.gameManager.resetSession();
        }
    };

    /* ==================================================================
     *  التحديث + الاستماع لأحداث AGP Core (قائمة صريحة، بدون Wildcard)
     * ================================================================== */
    /* ==================================================================
     *  Tabs — تنظيم عرضي بحت (Phase 2: Dashboard UX)، لا علاقة له بـ AGP.
     *  يُخفي/يُظهر أقسام الصفحة فقط؛ كل Component أعلاه يستمر في القراءة
     *  والتحديث بشكل طبيعي بغضّ النظر عن أي تبويب ظاهر حالياً.
     * ================================================================== */
    NS.tabs = {
        show: function (tabName) {
            document.querySelectorAll('.tab-panel').forEach(function (panel) {
                var isActive = panel.getAttribute('data-tab') === tabName;
                panel.style.display = isActive ? '' : 'none';
                if (isActive) {
                    // إعادة تشغيل انتقال الظهور البسيط عند كل تبديل تبويب.
                    panel.classList.remove('tab-panel--enter');
                    void panel.offsetWidth;
                    panel.classList.add('tab-panel--enter');
                }
            });
            document.querySelectorAll('.tab-btn').forEach(function (btn) {
                var isActive = btn.getAttribute('data-tab-target') === tabName;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
        }
    };

    function refreshAll() {
        NS.workflow.render();
        NS.components.game.render();
        NS.components.gameSelector.render();
        NS.components.gameSettingsPlaceholder.render();
        NS.components.streamStatus.render();
        if (TEAM_FEATURES_ENABLED) {
            NS.components.teamSettings.render();
        }
        NS.components.keyword.render();
        NS.components.timers.render();
        NS.components.winner.render();
        if (TEAM_FEATURES_ENABLED) {
            NS.components.playersByTeam.render();
        }
        NS.components.session.render();
        NS.components.room.render();
        NS.components.lobby.render();
        NS.components.queue.render();
        NS.components.players.render();
        NS.components.round.render();
        NS.components.timer.render();
    }

    var WATCHED_EVENTS = [
        'game:registered', 'game:unregistered', 'game:currentChanged', 'game:loaded',
        'game:wheelSpun', 'game:winnerSelected',
        'keyword:changed', 'keyword:activated', 'keyword:deactivated',
        'stream:statusChanged', 'stream:giftReceived', 'stream:followReceived',
        'session:created', 'session:stateChanged', 'session:ended',
        'session:roundStarted', 'session:roundFinished',
        'room:created', 'room:closed',
        'lobby:opened', 'lobby:closed', 'lobby:stateChanged',
        'lobby:playerAccepted', 'lobby:playerRejected',
        'player:joined', 'player:removed', 'player:listReset',
        'queue:enqueued', 'queue:dequeued', 'queue:admitted',
        'queue:admitRejected', 'queue:cleared', 'queue:removed',
        'round:stateChanged',
        'game:roundStarted', 'game:roundEnded', 'game:reset',
        'game:started', 'game:ended',
        'timer:started', 'timer:tick', 'timer:stopped', 'timer:ended'
    ];

    // استماعات ذات غرض محدد (بالإضافة للتسجيل العام أعلاه): التقاط
    // الفائز، وربط انتهاء المؤقّتات المسمّاة تلقائياً بنفس أفعال اللوحة
    // الموجودة أصلاً (بدل انتظار ضغطة يدوية). هذا الربط منطق لوحة، وليس
    // تعديلاً على AGP.timerManager أو Game Bridge أو الروليت نفسها.
    function attachRouletteAutoActions() {
        AGP.events.on('game:winnerSelected', function (payload) {
            NS.components.winner.setWinner(payload);
        });
        AGP.events.on('game:reset', function () {
            NS.components.winner.clear();

            // ⚠️ إصلاح تدقيق: AGP.timerManager لا يعرف شيئاً عن دورة حياة
            // الجلسة/الجولة (لا يستمع لأي حدث بنفسه). أي مؤقّت مسمّى بدأ
            // قبل إعادة الضبط كان يستمر يعمل في الخلفية بصمت، ثم يُطلِق
            // timer:ended لاحقاً فيؤدي لاستدعاء closeRegistration()/
            // game:roundEnded على جولة مستقبلية غير متعلقة به إطلاقاً.
            // إيقافه هنا صريحاً يمنع ذلك تماماً. لا تعديل على
            // AGP.timerManager نفسه؛ فقط استدعاء stop() الموجودة أصلاً.
            AGP.timerManager.stop('registration');
            AGP.timerManager.stop('round');
        });
        AGP.events.on('timer:ended', function (payload) {
            if (!payload) return;
            if (payload.name === 'registration') {
                AGP.gameManager.closeRegistration();
            } else if (payload.name === 'round') {
                AGP.events.emit('game:roundEnded', { id: gameId() });
            }
        });
    }

    // خريطة أحداث "ملحوظة" فقط (مجموعة فرعية مختارة من WATCHED_EVENTS
    // أعلاه) تُطلِق إشعاراً عابراً (Toast) بالإضافة للتسجيل في Event Log
    // — لا حدث جديد، ولا قراءة AGP إضافية، فقط نص عرضي أوضح للأحداث
    // المهمة للمذيع تحديداً.
    var TOAST_EVENTS = {
        'room:created': function () { return { message: 'Room created.', type: 'success' }; },
        'room:closed': function () { return { message: 'Room closed.', type: 'info' }; },
        'lobby:opened': function () { return { message: 'Registration opened.', type: 'success' }; },
        'lobby:closed': function () { return { message: 'Registration closed.', type: 'info' }; },
        'game:loaded': function (p) { return { message: (p && p.game && (p.game.name || p.id)) + ' loaded.', type: 'success' }; },
        'game:roundStarted': function () { return { message: 'Round started.', type: 'success' }; },
        'game:roundEnded': function () { return { message: 'Round ended.', type: 'info' }; },
        'game:reset': function () { return { message: 'Session reset.', type: 'info' }; },
        'player:removed': function (p) { return { message: (p && p.player && (p.player.name || p.player.id)) + ' removed.', type: 'info' }; },
        'queue:admitted': function () { return { message: 'Player admitted from queue.', type: 'success' }; },
        'keyword:activated': function () { return { message: 'Join keyword activated.', type: 'success' }; },
        'keyword:deactivated': function () { return { message: 'Join keyword deactivated.', type: 'info' }; },
        'stream:statusChanged': function (p) { return { message: (p && p.platform) + ': ' + (p && p.status), type: 'info' }; },
        'stream:giftReceived': function (p) { return { message: (p && p.name) + ' sent ' + (p && p.giftName) + '!', type: 'success' }; },
        'stream:followReceived': function (p) { return { message: (p && p.name) + ' followed!', type: 'info' }; },
        'timer:ended': function (p) { return { message: (p && p.name) + ' timer ended.', type: 'info' }; }
    };

    window.addEventListener('load', function () {
        WATCHED_EVENTS.forEach(function (eventName) {
            AGP.events.on(eventName, function (payload) {
                NS.components.eventLog.log(eventName, payload);
                if (TOAST_EVENTS[eventName]) {
                    var t = TOAST_EVENTS[eventName](payload);
                    if (t) NS.toast.show(t.message, t.type);
                }
                refreshAll();
            });
        });
        attachRouletteAutoActions();
        NS.tabs.show('game');
        refreshAll();

        // إخفاء طبقة التحميل الأولية بعد أول رسم فعلي للوحة (تحسين حالة
        // تحميل بحت، لا علاقة له بمنطق AGP).
        var loadingOverlay = el('loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.add('loading-overlay--hidden');
    });

}(window.AGPDashboardCore));
