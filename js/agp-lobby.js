/**
 * ==========================================================================
 *  AGP LOBBY — مدير غرفة الانتظار (Lobby Manager)
 * ==========================================================================
 *
 * هذا الملف مسؤول عن مرحلة انتظار اللاعبين قبل بدء الجولة: فتح
 * التسجيل، إغلاقه، بوابة انضمام اللاعبين (Join Gate)، **ودورة حياة
 * حقيقية كاملة للوبي (Lobby Life Cycle)** بخمس حالات رسمية. لا يحتوي
 * على أي منطق جولات (ذلك في Round Manager)، ولا محرك لعبة، ولا أي
 * ارتباط بتيك توك أو WebSocket أو Cloudflare.
 *
 * دورة حياة اللوبي (State Machine — الانتقال فقط عبر AGP Events):
 *
 *   Closed
 *     → RegistrationOpen   (عبر lobby:opened، أو مباشرة عبر
 *                            game:roundStarted إن لم تُستخدَم Lobby)
 *       → ReadyToStart       (عبر lobby:closed)
 *         → InGame             (عبر game:roundStarted)
 *           → Finished           (عبر game:roundEnded)
 *             → RegistrationOpen   (عبر lobby:opened، جولة جديدة)
 *             → InGame              (عبر game:roundStarted، "لعبة جديدة"
 *                                     بنفس اللاعبين بدون إعادة فتح تسجيل)
 *   (من أي حالة) → Closed عبر game:reset
 *
 * لماذا هذا التصميم (نفس منطق agp-round-manager.js تماماً، ولنفس
 * السبب): لعبة الروليت المتصلة فعلياً اليوم لا تستدعي
 * `AGP.lobby.open()`/`close()` إطلاقاً — تُبلِّغ مباشرة بأحداث
 * `game:roundStarted`/`game:roundEnded`/`game:reset` عبر
 * `games/roulette/agp-roulette.js`. لذلك تستمع هذه الحالة أيضاً لتلك
 * الأحداث كمسارات بديلة واقعية، دون افتراض استخدام أي لعبة لـ
 * `open()`/`close()` الرسميتين.
 *
 * العلاقة مع الوحدات الأخرى (Composition لا Duplication):
 *   - **Session Manager** (`agp-session.js`) هو مصدر الحقيقة الوحيد
 *     لحالة التسجيل (`registrationOpen`) وحالة الجلسة العامة
 *     (`STATES`). Lobby Manager **لا يحتفظ بحالة تسجيل مستقلة خاصة به**؛
 *     فتح/إغلاق التسجيل من هنا يستدعي `AGP.session.openRegistration()` /
 *     `AGP.session.closeRegistration()` مباشرة كما كان. حالة اللوبي
 *     الجديدة (Closed/RegistrationOpen/ReadyToStart/InGame/Finished)
 *     مفهوم **إضافي منفصل** يوصف "أين نحن في دورة حياة اللوبي بالذات"،
 *     ولا يستبدل أو يكرر state machine الخاصة بـ Session أو Round Manager.
 *   - **Player Manager** (`agp-player-manager.js`) هو المسؤول الوحيد عن قائمة
 *     اللاعبين فعلياً. Lobby Manager **لا ينشئ أي قائمة لاعبين جديدة**؛
 *     بوابة الانضمام هنا (`requestJoin`) تكتفي بالتحقق من أن التسجيل
 *     مفتوح، ثم تُفوِّض الإضافة الفعلية بالكامل إلى
 *     `AGP.player.addPlayer(...)`.
 *   - **Event Bus** (`agp-events.js` / `agp-core.js`) هو وسيلة التواصل
 *     الوحيدة مع بقية المنصة. كل تغيير مهم يُبث كحدث ضمن Namespace
 *     خاص بهذه الوحدة (`lobby:*`):
 *       - lobby:opened          -> عند فتح التسجيل
 *       - lobby:closed          -> عند إغلاق التسجيل
 *       - lobby:playerAccepted  -> عند قبول انضمام لاعب فعلياً
 *       - lobby:playerRejected  -> عند رفض انضمام لاعب (تسجيل مغلق،
 *                                   بيانات ناقصة، تكرار، إلخ)
 *       - lobby:stateChanged    -> عند أي انتقال في دورة حياة اللوبي
 *                                   (جديد)، مع { previousState, state, causedBy }
 *
 * اختبار سريع من الـ Console (بعد تحميل الصفحة):
 *   AGP.lobby.open();
 *   AGP.lobby.getLobbyState();          // 'registration_open'
 *   AGP.lobby.requestJoin({ id: 'p1', name: 'أحمد' });
 *   AGP.lobby.requestJoin({ id: 'p1', name: 'أحمد' }); // يُرفض (تكرار)
 *   AGP.lobby.getStatus();
 *   AGP.lobby.close();
 *   AGP.lobby.getLobbyState();          // 'ready_to_start'
 *   AGP.lobby.requestJoin({ id: 'p2', name: 'سارة' }); // يُرفض (مغلق)
 *
 * ملاحظة: لا توجد جلسة نشطة تلقائياً؛ يجب إنشاء جلسة أولاً عبر
 *   AGP.session.createSession('roulette-game')
 * قبل تجربة الأوامر أعلاه، وإلا سيتم رفض الفتح/الإغلاق مع رسالة واضحة
 * في الـ Console (دون أي انهيار في الكود).
 *
 * يعتمد هذا الملف على وجود js/agp-core.js و js/agp-events.js (لناقل
 * الأحداث)، و js/agp-session.js (لحالة التسجيل)، و js/agp-player-manager.js
 * (لإدارة اللاعبين) قبله. يُفضَّل تحميله بعد الثلاثة الأخيرة وقبل
 * js/agp-bootstrap.js.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    // حماية بسيطة في حال تم تحميل هذا الملف قبل agp-core.js بالخطأ
    if (!AGP.log) {
        AGP.log = function () {};
    }
    if (!AGP.events) {
        // نسخة بديلة بسيطة جداً (Fallback) حتى لا ينهار الملف لو حُمّل بمفرده،
        // لكن الاستخدام الطبيعي دائماً بعد تحميل agp-core.js/agp-events.js.
        AGP.events = { emit: function () {}, on: function () { return function () {}; } };
    }

    /* ----------------------------------------------------------------
     * دورة حياة اللوبي (Lobby Life Cycle State Machine)
     * ----------------------------------------------------------------
     * الانتقال بين هذه الحالات يحدث فقط عبر الاستماع لأحداث AGP Events
     * موجودة أصلاً (مُصدَرة من هذا الملف نفسه عبر open()/close()، أو من
     * أي لعبة متصلة مثل games/roulette/agp-roulette.js) — لا توجد أي
     * دالة عامة مثل setLobbyState() يستدعيها كود آخر مباشرة.
     * ---------------------------------------------------------------- */
    var LOBBY_STATES = {
        CLOSED: 'closed',
        REGISTRATION_OPEN: 'registration_open',
        READY_TO_START: 'ready_to_start',
        IN_GAME: 'in_game',
        FINISHED: 'finished'
    };

    var LOBBY_TRANSITIONS = {};
    LOBBY_TRANSITIONS[LOBBY_STATES.CLOSED] = {
        'lobby:opened': LOBBY_STATES.REGISTRATION_OPEN,
        'game:roundStarted': LOBBY_STATES.IN_GAME
    };
    LOBBY_TRANSITIONS[LOBBY_STATES.REGISTRATION_OPEN] = {
        'lobby:closed': LOBBY_STATES.READY_TO_START,
        'game:roundStarted': LOBBY_STATES.IN_GAME
    };
    LOBBY_TRANSITIONS[LOBBY_STATES.READY_TO_START] = {
        'game:roundStarted': LOBBY_STATES.IN_GAME
    };
    LOBBY_TRANSITIONS[LOBBY_STATES.IN_GAME] = {
        'game:roundEnded': LOBBY_STATES.FINISHED
    };
    LOBBY_TRANSITIONS[LOBBY_STATES.FINISHED] = {
        'lobby:opened': LOBBY_STATES.REGISTRATION_OPEN,
        'game:roundStarted': LOBBY_STATES.IN_GAME
    };

    // "إعادة الضبط" مسموحة من أي حالة، وتُعيد كل شيء إلى Closed مباشرة.
    var LOBBY_RESET_EVENT = 'game:reset';

    var _lobbyState = LOBBY_STATES.CLOSED;

    function transitionLobbyTo(newState, eventName) {
        var previousState = _lobbyState;
        if (previousState === newState) return;

        _lobbyState = newState;

        AGP.log('Lobby: state changed "' + previousState + '" -> "' + newState + '" (via ' + eventName + ')');
        AGP.events.emit('lobby:stateChanged', {
            previousState: previousState,
            state: newState,
            causedBy: eventName
        });
    }

    function handleLobbyLifecycleEvent(eventName) {
        return function () {
            if (eventName === LOBBY_RESET_EVENT) {
                // إفراغ قائمة اللاعبين بالكامل (عبر Player Manager فقط،
                // بدون أي تعامل مباشر مع مصفوفة اللاعبين من هنا).
                if (AGP.player && typeof AGP.player.reset === 'function') {
                    AGP.player.reset();
                }

                transitionLobbyTo(LOBBY_STATES.CLOSED, eventName);

                // ملاحظة: لا محاولة تلقائية لإعادة فتح التسجيل هنا. كانت
                // موجودة سابقاً لكنها تفشل دائماً بصمت — عند وصول
                // game:reset إلى هذا المستمع، الجلسة (AGP.session) لم
                // تنتهِ بعد فعلياً (ينتهي ذلك لاحقاً عبر مستمع منفصل في
                // agp-round-manager.js)، فيرفض AGP.session.openRegistration()
                // الانتقال دائماً. إعادة فتح التسجيل الفعلية تحدث لاحقاً
                // عبر المسار الصحيح (استدعاء AGP.lobby.open()/
                // AGP.gameManager.openRegistration() من جديد، أو مباشرة
                // عبر Round Manager عند دخول جولة جديدة).
                return;
            }

            var stateTransitions = LOBBY_TRANSITIONS[_lobbyState];
            var nextState = stateTransitions ? stateTransitions[eventName] : null;
            if (!nextState) return; // حدث لا يمثّل انتقالاً صالحاً من الحالة الحالية، يُتجاهَل بصمت

            transitionLobbyTo(nextState, eventName);
        };
    }

    // الاستماع لكل الأحداث الفريدة الظاهرة في LOBBY_TRANSITIONS، بالإضافة
    // لحدث إعادة الضبط العام.
    var _lobbyListenedEvents = {};
    Object.keys(LOBBY_TRANSITIONS).forEach(function (state) {
        Object.keys(LOBBY_TRANSITIONS[state]).forEach(function (eventName) {
            _lobbyListenedEvents[eventName] = true;
        });
    });
    _lobbyListenedEvents[LOBBY_RESET_EVENT] = true;

    Object.keys(_lobbyListenedEvents).forEach(function (eventName) {
        AGP.events.on(eventName, handleLobbyLifecycleEvent(eventName));
    });

    /* ----------------------------------------------------------------
     * واجهة AGP.lobby العامة
     * ---------------------------------------------------------------- */
    AGP.lobby = {

        // نعرّض تعريف حالات اللوبي كي تُستخدم من أي مكان آخر بدل نصوص حرة
        STATES: LOBBY_STATES,

        /**
         * فتح التسجيل لانضمام لاعبين جدد.
         * يُفوَّض بالكامل إلى Session Manager (مصدر الحقيقة الوحيد
         * لحالة التسجيل)؛ Lobby Manager لا يغيّر أي حالة داخلية خاصة به.
         * @returns {boolean} true إذا نجح الفتح فعلياً.
         */
        open: function () {
            if (!AGP.session || typeof AGP.session.openRegistration !== 'function') {
                AGP.log('Lobby: Session Manager not available, cannot open registration.');
                return false;
            }

            // ⚠️ إصلاح تكامل: openRegistration() تتطلب جلسة موجودة أصلاً
            // في حالة Idle، لكن لا شيء كان يُنشئ تلك الجلسة الأولى قبل
            // هذه النقطة (منطق الإنشاء كان موجوداً فقط داخل Round
            // Manager، ولا يُستدعى إلا بعد نجاح lobby:opened — تعارض
            // دائري كان يمنع أي جلسة أولى من الوجود إطلاقاً). نضمن هنا
            // وجود جلسة/غرفة صالحة أولاً، عبر AGP.roomsManager (بنفس
            // مبدأ التفويض المستخدم في agp-round-manager.js)، قبل
            // محاولة فتح التسجيل فعلياً.
            var currentState = AGP.session.getState();
            var needsNewSession = !currentState || currentState === AGP.session.STATES.SESSION_ENDED;
            if (needsNewSession) {
                if (AGP.roomsManager && typeof AGP.roomsManager.createRoom === 'function') {
                    AGP.roomsManager.createRoom();
                } else if (typeof AGP.session.createSession === 'function') {
                    AGP.session.createSession();
                }
            }

            var ok = AGP.session.openRegistration();

            if (ok) {
                AGP.log('Lobby: registration opened.');
                AGP.events.emit('lobby:opened', {
                    joinCode: (typeof AGP.session.getJoinCode === 'function') ? AGP.session.getJoinCode() : null
                });
            } else {
                AGP.log('Lobby: failed to open registration (invalid session state transition).');
            }

            return ok;
        },

        /**
         * إغلاق التسجيل؛ يمنع أي انضمام جديد بعد هذه النقطة عبر
         * requestJoin (اللاعبون المنضمّون مسبقاً لا يتأثرون).
         * @returns {boolean} true إذا نجح الإغلاق فعلياً.
         */
        close: function () {
            if (!AGP.session || typeof AGP.session.closeRegistration !== 'function') {
                AGP.log('Lobby: Session Manager not available, cannot close registration.');
                return false;
            }

            var ok = AGP.session.closeRegistration();

            if (ok) {
                AGP.log('Lobby: registration closed.');
                AGP.events.emit('lobby:closed', {});
            } else {
                AGP.log('Lobby: failed to close registration (invalid session state transition).');
            }

            return ok;
        },

        /**
         * هل التسجيل مفتوح حالياً؟ يُقرأ مباشرة من Session Manager.
         * @returns {boolean}
         */
        isOpen: function () {
            if (!AGP.session || typeof AGP.session.isRegistrationOpen !== 'function') {
                return false;
            }
            return AGP.session.isRegistrationOpen();
        },

        /**
         * جلب حالة دورة حياة اللوبي الحالية (قيمة من STATES أعلاه).
         * @returns {string}
         */
        getLobbyState: function () {
            return _lobbyState;
        },

        /**
         * بوابة انضمام اللاعب الوحيدة في هذه المرحلة: تتحقق أولاً من أن
         * دورة حياة اللوبي في حالة RegistrationOpen بالضبط (وليس مجرد
         * علم "التسجيل مفتوح" في Session)، حتى يُمنَع الانضمام تلقائياً
         * فور انتقال اللوبي إلى ReadyToStart أو InGame، ثم تُفوِّض
         * الإضافة الفعلية بالكامل لـ AGP.player.addPlayer (بما في ذلك
         * تجاهل التكرار، الذي يُدار هناك وليس هنا).
         * @param {Object} playerData - { id, name, ... }
         * @returns {Object|null} كائن اللاعب عند القبول، أو null عند الرفض.
         */
        requestJoin: function (playerData) {
            if (_lobbyState !== LOBBY_STATES.REGISTRATION_OPEN) {
                AGP.log('Lobby: join rejected, lobby state is "' + _lobbyState + '" (not registration_open).', playerData);
                AGP.events.emit('lobby:playerRejected', {
                    reason: 'registration_closed',
                    playerData: playerData
                });
                return null;
            }

            if (!AGP.player || typeof AGP.player.addPlayer !== 'function') {
                AGP.log('Lobby: Player Manager not available.');
                AGP.events.emit('lobby:playerRejected', {
                    reason: 'player_manager_unavailable',
                    playerData: playerData
                });
                return null;
            }

            var player = AGP.player.addPlayer(playerData);

            if (!player) {
                // AGP.player.addPlayer بثّ بالفعل player:joinRejected بسببه
                // الخاص (بيانات ناقصة/تكرار)؛ هنا نعكس الرفض على مستوى
                // Lobby أيضاً حتى تستطيع أي واجهة تستمع لـ lobby:* فقط.
                AGP.log('Lobby: join rejected by Player Manager.', playerData);
                AGP.events.emit('lobby:playerRejected', {
                    reason: 'rejected_by_player_manager',
                    playerData: playerData
                });
                return null;
            }

            AGP.log('Lobby: player accepted.', player.id);
            AGP.events.emit('lobby:playerAccepted', { player: player });

            return player;
        },

        /**
         * لقطة موجزة عن حالة غرفة الانتظار الحالية، مفيدة للاختبار من
         * الـ Console أو لأي لوحة تحكم مؤقتة/مستقبلية دون الحاجة لقراءة
         * حالة كل وحدة على حدة.
         * @returns {Object}
         */
        getStatus: function () {
            return {
                isOpen: this.isOpen(),
                lobbyState: _lobbyState,
                sessionState: (AGP.session && typeof AGP.session.getState === 'function')
                    ? AGP.session.getState() : null,
                joinCode: (AGP.session && typeof AGP.session.getJoinCode === 'function')
                    ? AGP.session.getJoinCode() : null,
                playersCount: (AGP.player && typeof AGP.player.getPlayersCount === 'function')
                    ? AGP.player.getPlayersCount() : 0,
                players: (AGP.player && typeof AGP.player.getAllPlayers === 'function')
                    ? AGP.player.getAllPlayers() : []
            };
        },

        /**
         * دالة مساعدة صغيرة للاختبار السريع من الـ Console فقط: تطبع
         * حالة غرفة الانتظار الحالية بشكل مقروء. لا تُستخدم من أي كود
         * آخر داخل المنصة، وهي غير مرتبطة بأي عنصر واجهة في الصفحة.
         */
        printStatus: function () {
            var status = this.getStatus();
            console.log('[AGP Lobby] Status:', status);
            return status;
        },

        /**
         * دالة مساعدة صغيرة للاختبار السريع من الـ Console فقط: طريقة
         * مختصرة لمحاكاة انضمام لاعب بمعرّف واسم بدل كتابة كائن كامل
         * في كل مرة. توازي requestJoin تماماً.
         * @param {string} id
         * @param {string} [name]
         */
        debugJoin: function (id, name) {
            return this.requestJoin({ id: id, name: name });
        }
    };

    AGP.log('AGP Lobby Manager loaded — real life cycle (' + Object.keys(_lobbyListenedEvents).join(', ') + ').');

}(window.AymanGamesPlatform));
