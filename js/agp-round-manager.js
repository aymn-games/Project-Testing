/**
 * ==========================================================================
 *  AGP ROUND MANAGER — المسؤول الوحيد عن حالة الجولة (Round State Owner)
 * ==========================================================================
 *
 * هذا الملف يمثّل المصدر الوحيد للحقيقة (Single Source of Truth) بخصوص
 * "حالة الجولة" الحالية على المنصة. لا يحتوي على أي منطق لعبة، ولا أي
 * تعديل على تصميم أو واجهة أي شيء. كل انتقال بين حالاته **يحدث فقط من
 * خلال الاستماع لأحداث AGP Events موجودة أصلاً** — لا يوجد أي دالة
 * عامة مثل `setState()` يستدعيها كود آخر مباشرة لفرض حالة معيّنة.
 *
 * حالات الجولة (State Machine) — عامة تماماً، بدون أي مرحلة خاصة بآلية
 * لعبة بعينها (لا "دوران عجلة" ولا "اختيار فائز" هنا):
 *
 *   Idle
 *     → RegistrationOpen   (عبر lobby:opened، أو مباشرة عبر
 *                            game:roundStarted إن لم تُستخدَم Lobby)
 *       → Ready             (عبر lobby:closed أو game:roundStarted)
 *         → InProgress        (عبر game:roundStarted)
 *           → RoundEnded         (عبر game:roundEnded)
 *             → InProgress          (جولة جديدة عبر game:roundStarted)
 *   (من أي حالة) → Idle عبر game:reset
 *
 * ⚠️ تحديث معماري: كانت النسخة الأولى تحتوي مرحلتين وسيطتين
 *   (`spinning` عبر `game:wheelSpun`، و`winner_selected` عبر
 *   `game:winnerSelected`) — وهما حدثان خاصان فعلياً بآلية "عجلة" لعبة
 *   الروليت تحديداً، وليسا جزءاً من مفردات `game:*` العامة الموثَّقة
 *   لبقية المنصة. أُزيلتا وأُدمِجتا في حالة واحدة عامة (`InProgress`)،
 *   بحيث لا يبقى داخل هذا الملف أي اسم حدث خاص بلعبة بعينها، ويعمل
 *   Round Manager الآن لأي لعبة تُبلِّغ بمفردات `game:roundStarted`/
 *   `game:roundEnded`/`game:reset` العامة فقط، بصرف النظر عن تفاصيل
 *   ما يحدث داخل الجولة نفسها.
 *
 * لماذا هذا التصميم:
 *   لعبة الروليت المتصلة فعلياً حالياً (`games/roulette/agp-roulette.js`
 *   + `agp-integration.js`) لا تمر بالضرورة عبر AGP Lobby (`lobby:*`)
 *   إطلاقاً — هي تُبلِّغ مباشرة بأحداث `game:roundStarted` /
 *   `game:wheelSpun` / `game:winnerSelected` / `game:roundEnded` /
 *   `game:reset`. لذلك يستمع Round Manager لكلا المسارين معاً
 *   (Lobby الرسمي لأي لعبة تستخدمه مستقبلاً، وأحداث اللعبة المباشرة
 *   للروليت اليوم)، دون تفضيل أحدهما أو افتراض استخدام أي لعبة له.
 *
 * الربط مع Session Manager (`agp-session.js`، بدون أي تعديل عليه):
 *   Round Manager لا يعيد تنفيذ أي من منطق Session، فقط يستدعي دواله
 *   العامة الموجودة أصلاً في اللحظات المناسبة، حتى تبقى حالة الجلسة
 *   (`AGP.session`) متزامنة مع حالة الجولة (`AGP.roundManager`) دون أي
 *   ازدواجية:
 *
 *     Round Manager ينتقل إلى  | يستدعي في AGP.session
 *     --------------------------|---------------------------------
 *     RegistrationOpen          | createSession() [إن لم توجد جلسة]
 *                                 ثم openRegistration()
 *     Ready                       | closeRegistration()
 *     InProgress                  | startRound()
 *     RoundEnded                  | finishRound()
 *     Idle (عبر game:reset)       | endSession()
 *
 * الأحداث المُطلَقة عبر AGP.events (Namespace: `round:*`):
 *   - round:stateChanged -> عند أي انتقال ناجح، مع { previousState, state, gameId }
 *
 * اختبار سريع من الـ Console:
 *   AGP.roundManager.getState();       // الحالة الحالية
 *   AGP.events.on('round:stateChanged', console.log);
 *
 * يعتمد هذا الملف على وجود js/agp-core.js, js/agp-events.js,
 * js/agp-session.js قبله. يستمع لأحداث قد تصدر من agp-lobby.js أو أي
 * لعبة متصلة (مثل games/roulette/agp-roulette.js)، لكن لا يحتاج تحميل
 * تلك الملفات قبله تحديداً (يكفي أن يكون AGP.events موجوداً).
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) {
        AGP.log = function () {};
    }
    if (!AGP.events) {
        AGP.events = { emit: function () {}, on: function () { return function () {}; } };
    }

    /* ----------------------------------------------------------------
     * 1) حالات الجولة
     * ---------------------------------------------------------------- */
    var STATES = {
        IDLE: 'idle',
        REGISTRATION_OPEN: 'registration_open',
        READY: 'ready',
        IN_PROGRESS: 'in_progress',
        ROUND_ENDED: 'round_ended'
    };

    // جدول الانتقالات المسموح بها لكل حالة، وأي حدث AGP يُنتج كل انتقال.
    // كل الأحداث هنا من مفردات `lobby:*`/`game:*` العامة الموثَّقة عبر
    // المنصة كلها — لا يوجد أي اسم حدث خاص بلعبة بعينها.
    var TRANSITIONS = {};
    TRANSITIONS[STATES.IDLE] = {
        'lobby:opened': STATES.REGISTRATION_OPEN,
        'game:roundStarted': STATES.IN_PROGRESS
    };
    TRANSITIONS[STATES.REGISTRATION_OPEN] = {
        'lobby:closed': STATES.READY,
        'game:roundStarted': STATES.IN_PROGRESS
    };
    TRANSITIONS[STATES.READY] = {
        'game:roundStarted': STATES.IN_PROGRESS
    };
    TRANSITIONS[STATES.IN_PROGRESS] = {
        'game:roundEnded': STATES.ROUND_ENDED
    };
    TRANSITIONS[STATES.ROUND_ENDED] = {
        'game:roundStarted': STATES.IN_PROGRESS
    };

    // "إعادة الضبط" مسموحة من أي حالة، وتُعيد كل شيء إلى Idle مباشرة —
    // تُفحَص بمعزل عن جدول TRANSITIONS أعلاه لتفادي تكرارها في كل حالة.
    var RESET_EVENT = 'game:reset';

    var _state = STATES.IDLE;
    var _currentGameId = null;

    /**
     * يضمن أن Session في حالة تسمح فعلياً بـ startRound() (أي
     * REGISTRATION_CLOSED أو ROUND_FINISHED فقط، حسب ALLOWED_TRANSITIONS
     * في agp-session.js)، بالمرور عبر أي خطوات وسيطة ضرورية باستخدام
     * دوال Session العامة الموجودة أصلاً فقط (createSession/
     * openRegistration/closeRegistration) — بدون أي منطق أو حالة جديدة.
     *
     * لماذا هذا ضروري: Round Manager يسمح بالانتقال المباشر إلى
     * InProgress من أكثر من حالة لديه (Idle، RegistrationOpen، Ready،
     * RoundEnded — عبر game:roundStarted، لدعم ألعاب مثل الروليت التي
     * لا تمر بـ Lobby إطلاقاً)، لكن Session Manager نفسه **لا يسمح**
     * بتخطي حالاته الوسيطة (مثلاً Idle → RoundRunning مباشرة مرفوض).
     * بدون هذه الدالة، أي دخول لـ InProgress من حالة لا تملك فيها
     * Session بالفعل الحالة الصحيحة (خصوصاً بعد أول تشغيل، أو بعد
     * game:reset) يفشل بصمت (startRound() يُرفَض داخلياً)، بينما Round
     * Manager نفسه يبقى معتقداً أن الجولة بدأت فعلاً — تعارض حالة.
     */
    function ensureSessionReadyForRound(gameId) {
        var state = AGP.session.getState();

        if (!state || state === AGP.session.STATES.SESSION_ENDED) {
            if (AGP.roomsManager && typeof AGP.roomsManager.createRoom === 'function') {
                AGP.roomsManager.createRoom(gameId || null);
            } else if (typeof AGP.session.createSession === 'function') {
                AGP.session.createSession(gameId || null);
            }
            state = AGP.session.getState();
        }

        if (state === AGP.session.STATES.IDLE && typeof AGP.session.openRegistration === 'function') {
            AGP.session.openRegistration();
            state = AGP.session.getState();
        }

        if (state === AGP.session.STATES.REGISTRATION_OPEN && typeof AGP.session.closeRegistration === 'function') {
            AGP.session.closeRegistration();
        }
    }

    /* ----------------------------------------------------------------
     * 2) الربط مع Session Manager — استدعاء دواله العامة الموجودة أصلاً
     *    فقط، بدون أي تعديل على agp-session.js وبدون إعادة تنفيذ منطقه.
     * ---------------------------------------------------------------- */
    function syncSessionOnEnter(newState, gameId) {
        if (!AGP.session) return;

        switch (newState) {
            case STATES.REGISTRATION_OPEN:
                // يُفضَّل الآن المرور عبر AGP.roomsManager (يستدعي هو
                // بدوره AGP.session.createSession داخلياً) بدل استدعاء
                // Session مباشرة، حتى تبقى "الغرفة النشطة" متزامنة مع
                // الجلسة الفعلية — هذا يُغلِق فجوة كانت موثَّقة سابقاً.
                // يبقى الاستدعاء المباشر لـ Session كـ Fallback فقط لو
                // لم يُحمَّل agp-rooms-manager.js (استخدام مستقل/قديم).
                //
                // ⚠️ إصلاح تكامل: getState() تُعيد النص 'session_ended'
                // (قيمة صحيحة/truthy) بعد انتهاء أي جلسة سابقة، وليس
                // null — فالفحص السابق (!getState()) كان لا يعتبر جلسة
                // منتهية بحاجة لإعادة إنشاء أبداً، مما يمنع أي جولة ثانية
                // بعد أول game:reset بشكل دائم. الفحص أدناه يعتبر عدم
                // وجود جلسة أو انتهاءها معاً حالتين تستدعيان إنشاء جلسة/
                // غرفة جديدة.
                var currentSessionState = AGP.session.getState();
                var needsNewSession = !currentSessionState ||
                    currentSessionState === AGP.session.STATES.SESSION_ENDED;
                if (needsNewSession) {
                    if (AGP.roomsManager && typeof AGP.roomsManager.createRoom === 'function') {
                        AGP.roomsManager.createRoom(gameId || null);
                    } else if (typeof AGP.session.createSession === 'function') {
                        AGP.session.createSession(gameId || null);
                    }
                }
                if (typeof AGP.session.openRegistration === 'function') {
                    AGP.session.openRegistration();
                }
                break;

            case STATES.READY:
                if (typeof AGP.session.closeRegistration === 'function') {
                    AGP.session.closeRegistration();
                }
                break;

            case STATES.IN_PROGRESS:
                // ⚠️ إصلاح تكامل: يضمن أن Session في حالة صالحة فعلياً
                // لـ startRound() قبل استدعائها — راجع تعليق الدالة
                // أعلاه لسبب الحاجة لهذا تحديداً هنا (دخول InProgress من
                // أكثر من حالة ممكنة لدى Round Manager).
                ensureSessionReadyForRound(gameId);
                if (typeof AGP.session.startRound === 'function') {
                    AGP.session.startRound();
                }
                break;

            case STATES.ROUND_ENDED:
                if (typeof AGP.session.finishRound === 'function') {
                    AGP.session.finishRound();
                }
                break;

            case STATES.IDLE:
                // نفس منطق REGISTRATION_OPEN أعلاه: تفضيل المرور عبر
                // AGP.roomsManager (يستدعي هو AGP.session.endSession
                // داخلياً) حتى لا تبقى "غرفة نشطة" متيتّمة بعد انتهاء
                // الجلسة فعلياً.
                if (AGP.roomsManager && typeof AGP.roomsManager.hasActiveRoom === 'function' && AGP.roomsManager.hasActiveRoom()) {
                    AGP.roomsManager.closeRoom();
                } else if (typeof AGP.session.endSession === 'function') {
                    AGP.session.endSession();
                }
                break;

            default:
                break;
        }
    }

    /* ----------------------------------------------------------------
     * 3) تنفيذ الانتقال + بث round:stateChanged
     * ---------------------------------------------------------------- */
    function transitionTo(newState, eventName, payload) {
        var previousState = _state;
        if (previousState === newState) return;

        if (payload && payload.id) {
            _currentGameId = payload.id;
        }

        _state = newState;

        AGP.log('Round Manager: state changed "' + previousState + '" -> "' + newState + '" (via ' + eventName + ')');
        syncSessionOnEnter(newState, _currentGameId);

        AGP.events.emit('round:stateChanged', {
            previousState: previousState,
            state: newState,
            gameId: _currentGameId,
            causedBy: eventName
        });
    }

    /**
     * معالج موحّد لكل الأحداث التي قد تُحرِّك حالة الجولة. يُستدعى لكل
     * حدث من الأحداث المذكورة في TRANSITIONS و RESET_EVENT.
     */
    function handleRoundEvent(eventName) {
        return function (payload) {
            if (eventName === RESET_EVENT) {
                transitionTo(STATES.IDLE, eventName, payload);
                return;
            }

            var stateTransitions = TRANSITIONS[_state];
            var nextState = stateTransitions ? stateTransitions[eventName] : null;
            if (!nextState) return; // الحدث لا يمثّل انتقالاً صالحاً من الحالة الحالية، يُتجاهَل بصمت

            transitionTo(nextState, eventName, payload);
        };
    }

    // الاستماع لكل الأحداث الفريدة الظاهرة في TRANSITIONS، بالإضافة
    // لحدث إعادة الضبط العام.
    var _listenedEvents = {};
    Object.keys(TRANSITIONS).forEach(function (state) {
        Object.keys(TRANSITIONS[state]).forEach(function (eventName) {
            _listenedEvents[eventName] = true;
        });
    });
    _listenedEvents[RESET_EVENT] = true;

    Object.keys(_listenedEvents).forEach(function (eventName) {
        AGP.events.on(eventName, handleRoundEvent(eventName));
    });

    /* ----------------------------------------------------------------
     * 4) واجهة AGP.roundManager العامة (قراءة فقط — لا setState هنا)
     * ---------------------------------------------------------------- */
    AGP.roundManager = {
        STATES: STATES,

        /**
         * جلب حالة الجولة الحالية.
         * @returns {string}
         */
        getState: function () {
            return _state;
        },

        /**
         * جلب معرّف اللعبة المرتبطة بآخر انتقال حالة (إن وُجد).
         * @returns {string|null}
         */
        getCurrentGameId: function () {
            return _currentGameId;
        }
    };

    AGP.log('AGP Round Manager loaded — round state driven only by AGP Events (' + Object.keys(_listenedEvents).join(', ') + ').');

}(window.AymanGamesPlatform));
