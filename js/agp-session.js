/**
 * ==========================================================================
 *  AGP SESSION — مدير جلسة البث (Session Manager)
 * ==========================================================================
 *
 * هذا الملف يمثّل "هيكل" (Skeleton) لإدارة جلسة اللعب/البث فقط، وهو
 * الأساس الذي ستُبنى عليه لاحقاً إدارة اللاعبين (Player Manager)، الغرفة
 * (Lobby)، ومحرك اللعبة (Game Engine). في هذه المرحلة لا يوجد:
 *   - أي إدارة فعلية للاعبين (إضافة/حذف/تحديث بيانات لاعب).
 *   - أي منطق لعبة فعلي (بدء جولة، حساب نتائج، إلخ).
 *   - أي اتصال حقيقي بتيك توك أو أي منصة بث.
 *   - أي اتصال شبكي (WebSocket) حقيقي.
 *
 * كل ما يفعله هذا الملف هو تمثيل "حالة الجلسة" بشكل واضح ومنظّم
 * (State Machine بسيطة)، بحيث تعتمد عليه المراحل القادمة دون الحاجة
 * لإعادة هيكلته لاحقاً.
 *
 * هذا الملف لا يغيّر أي شيء في تصميم الصفحة أو الألعاب الحالية عند
 * تحميله فقط، ولا يُفعَّل أي شيء منه تلقائياً على المستخدمين.
 *
 * يعتمد هذا الملف على وجود js/agp-core.js قبله (لاستخدام AGP.log
 * وAGP.events)، ويُفضَّل تحميله بعد js/agp-registry.js وقبل
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
        // لكن الاستخدام الطبيعي دائماً بعد تحميل agp-core.js الحقيقي.
        AGP.events = { emit: function () {}, on: function () { return function () {}; } };
    }

    /* ----------------------------------------------------------------
     * 1) حالات الجلسة (Session States)
     * ----------------------------------------------------------------
     * تسلسل الحالات المسموح به للجلسة الواحدة:
     *
     *   Idle
     *     → Registration Open
     *       → Registration Closed
     *         → Round Running
     *           → Round Finished
     *             → Round Running   (جولة جديدة، تكرار محتمل)
     *             → Session Ended
     *         → Session Ended
     *     → Session Ended            (إنهاء مبكر من أي حالة)
     *
     * أي جزء آخر من المنصة يجب أن يتعامل مع هذه القيم عبر
     * AGP.session.STATES بدل كتابة نصوص (Strings) مباشرة في أماكن متفرقة.
     * ---------------------------------------------------------------- */
    var STATES = {
        IDLE: 'idle',
        REGISTRATION_OPEN: 'registration_open',
        REGISTRATION_CLOSED: 'registration_closed',
        ROUND_RUNNING: 'round_running',
        ROUND_FINISHED: 'round_finished',
        SESSION_ENDED: 'session_ended'
    };

    // جدول الانتقالات المسموح بها بين الحالات (State Machine بسيطة).
    // الهدف فقط منع انتقالات غير منطقية بالخطأ (مثل القفز من Idle مباشرة
    // إلى Round Running)، وليس فرض قواعد لعب فعلية.
    var ALLOWED_TRANSITIONS = {};
    ALLOWED_TRANSITIONS[STATES.IDLE] = [STATES.REGISTRATION_OPEN, STATES.SESSION_ENDED];
    ALLOWED_TRANSITIONS[STATES.REGISTRATION_OPEN] = [STATES.REGISTRATION_CLOSED, STATES.SESSION_ENDED];
    ALLOWED_TRANSITIONS[STATES.REGISTRATION_CLOSED] = [STATES.ROUND_RUNNING, STATES.REGISTRATION_OPEN, STATES.SESSION_ENDED];
    ALLOWED_TRANSITIONS[STATES.ROUND_RUNNING] = [STATES.ROUND_FINISHED, STATES.SESSION_ENDED];
    ALLOWED_TRANSITIONS[STATES.ROUND_FINISHED] = [STATES.ROUND_RUNNING, STATES.SESSION_ENDED];
    ALLOWED_TRANSITIONS[STATES.SESSION_ENDED] = [];

    /* ----------------------------------------------------------------
     * 2) الحالة الداخلية للجلسة الحالية
     * ----------------------------------------------------------------
     * جلسة واحدة فقط نشطة في كل مرة في هذه المرحلة (لا تعدد جلسات
     * متوازية بعد). كل الحقول هنا بيانات وصفية بسيطة فقط، بدون أي
     * منطق لعب أو إدارة لاعبين فعلية.
     * ---------------------------------------------------------------- */
    var _session = null;

    function createEmptySession() {
        return {
            // معرّف داخلي بسيط للجلسة (Placeholder فقط، ليس آلية أمان حقيقية)
            id: null,

            // حالة الجلسة الحالية ضمن STATES أعلاه
            state: STATES.IDLE,

            // معرّف اللعبة الحالية المرتبطة بالجلسة (مثل 'roulette-game')
            // يُفترض أن يطابق data-agp-game-id المستخدم في AGP.registry
            currentGameId: null,

            // رقم الجولة الحالية داخل الجلسة (0 = لم تبدأ أي جولة بعد)
            currentRound: 0,

            // كلمة/كود الانضمام الخاص بالجلسة الحالية
            joinCode: null,

            // هل التسجيل مفتوح لانضمام لاعبين جدد الآن؟
            registrationOpen: false,

            // مرجع فقط لقائمة اللاعبين (مصفوفة)، دون أي منطق لإدارتها هنا.
            // إضافة/حذف/تحديث اللاعبين هي مسؤولية Player Manager في مرحلة
            // قادمة؛ Session Manager يحتفظ فقط بمكان واحد موحّد للإشارة
            // إليها حتى لا تتشتت المرجعية بين ملفات مختلفة.
            players: []
        };
    }

    /**
     * توليد كود انضمام بسيط (Placeholder).
     * هذه مجرد آلية أولية غير نهائية؛ لا تُستخدم كحل أمني حقيقي، وقد
     * تُستبدل لاحقاً بمنطق أكثر نضجاً دون التأثير على الواجهة العامة
     * لهذه الدالة (generateJoinCode تبقى بنفس التوقيع).
     */
    function generateJoinCode() {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون حروف/أرقام متشابهة بصرياً
        var code = '';
        for (var i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    function generateSessionId() {
        return 'session-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    }

    /**
     * الانتقال إلى حالة جديدة مع التحقق من جدول الانتقالات المسموح بها.
     * يبث حدث 'session:stateChanged' عند نجاح الانتقال، أو يطبع تحذيراً
     * (دون رمي استثناء) عند محاولة انتقال غير مسموح، حتى لا تتوقف بقية
     * المنصة عن العمل بسبب استخدام خاطئ من كود مستقبلي لم يُختبر بعد.
     */
    function transitionTo(newState) {
        if (!_session) {
            AGP.log('Session: cannot change state, no active session.');
            return false;
        }

        var allowed = ALLOWED_TRANSITIONS[_session.state] || [];
        if (allowed.indexOf(newState) === -1) {
            AGP.log('Session: invalid transition from "' + _session.state + '" to "' + newState + '".');
            return false;
        }

        var previousState = _session.state;
        _session.state = newState;

        AGP.log('Session: state changed "' + previousState + '" -> "' + newState + '"');
        AGP.events.emit('session:stateChanged', {
            sessionId: _session.id,
            previousState: previousState,
            state: newState
        });

        return true;
    }

    /* ----------------------------------------------------------------
     * 3) واجهة AGP.session العامة
     * ---------------------------------------------------------------- */
    AGP.session = {

        // نعرّض تعريف الحالات كي تُستخدم من أي مكان آخر بدل نصوص حرة
        STATES: STATES,

        /**
         * إنشاء جلسة جديدة مرتبطة بلعبة معيّنة.
         * ينهي أي جلسة سابقة ضمنياً (جلسة واحدة نشطة فقط حالياً).
         * @param {string} gameId - معرّف اللعبة (يطابق data-agp-game-id)
         * @returns {Object} نسخة من الجلسة التي أُنشئت
         */
        createSession: function (gameId) {
            if (_session && _session.state !== STATES.SESSION_ENDED) {
                AGP.log('Session: creating a new session will replace the current active one.');
            }

            _session = createEmptySession();
            _session.id = generateSessionId();
            _session.currentGameId = gameId || null;
            _session.joinCode = generateJoinCode();

            AGP.log('Session: created new session', _session.id, 'for game', _session.currentGameId);
            AGP.events.emit('session:created', { sessionId: _session.id, gameId: _session.currentGameId });

            return this.getSession();
        },

        /**
         * إنهاء الجلسة الحالية نهائياً (Session Ended).
         * لا يحذف الجلسة من الذاكرة فوراً؛ فقط يغيّر حالتها، تاركاً
         * الاطلاع على بياناتها ممكناً حتى استبدالها بجلسة جديدة.
         */
        endSession: function () {
            if (!_session) {
                AGP.log('Session: no active session to end.');
                return false;
            }
            var ok = transitionTo(STATES.SESSION_ENDED);
            if (ok) {
                AGP.events.emit('session:ended', { sessionId: _session.id });
            }
            return ok;
        },

        /**
         * فتح التسجيل لانضمام اللاعبين (Idle → Registration Open).
         */
        openRegistration: function () {
            var ok = transitionTo(STATES.REGISTRATION_OPEN);
            if (ok) _session.registrationOpen = true;
            return ok;
        },

        /**
         * إغلاق التسجيل (Registration Open → Registration Closed).
         */
        closeRegistration: function () {
            var ok = transitionTo(STATES.REGISTRATION_CLOSED);
            if (ok) _session.registrationOpen = false;
            return ok;
        },

        /**
         * بدء جولة جديدة (Registration Closed/Round Finished → Round Running).
         * يزيد رقم الجولة الحالية تلقائياً؛ لا يحتوي أي منطق لعب فعلي.
         */
        startRound: function () {
            var ok = transitionTo(STATES.ROUND_RUNNING);
            if (ok) {
                _session.currentRound += 1;
                AGP.events.emit('session:roundStarted', {
                    sessionId: _session.id,
                    round: _session.currentRound
                });
            }
            return ok;
        },

        /**
         * إنهاء الجولة الحالية (Round Running → Round Finished).
         */
        finishRound: function () {
            var ok = transitionTo(STATES.ROUND_FINISHED);
            if (ok) {
                AGP.events.emit('session:roundFinished', {
                    sessionId: _session.id,
                    round: _session.currentRound
                });
            }
            return ok;
        },

        /**
         * جلب حالة الجلسة الحالية (قيمة من STATES)، أو null إن لم توجد جلسة.
         */
        getState: function () {
            return _session ? _session.state : null;
        },

        /**
         * جلب نسخة (Snapshot) بسيطة من بيانات الجلسة الحالية.
         * تُعاد نسخة مسطّحة من الحقول الوصفية، بينما players تبقى
         * بنفس المرجع الأصلي (Reference) عمداً، حتى تتمكن أي وحدة
         * مستقبلية (Player Manager) من العمل على نفس المصفوفة مباشرة.
         */
        getSession: function () {
            if (!_session) return null;
            return {
                id: _session.id,
                state: _session.state,
                currentGameId: _session.currentGameId,
                currentRound: _session.currentRound,
                joinCode: _session.joinCode,
                registrationOpen: _session.registrationOpen,
                players: _session.players
            };
        },

        /**
         * مرجع مباشر لقائمة اللاعبين في الجلسة الحالية (مصفوفة فارغة
         * إن لم توجد جلسة). Session Manager لا يضيف/يحذف لاعبين هنا؛
         * هذا مجرد "مكان" موحّد يشير إليه Player Manager لاحقاً.
         */
        getPlayersRef: function () {
            return _session ? _session.players : [];
        },

        /**
         * جلب معرّف اللعبة الحالية المرتبطة بالجلسة.
         */
        getCurrentGameId: function () {
            return _session ? _session.currentGameId : null;
        },

        /**
         * جلب رقم الجولة الحالية (0 = لا توجد جولة جارية بعد).
         */
        getCurrentRound: function () {
            return _session ? _session.currentRound : 0;
        },

        /**
         * جلب كود الانضمام الخاص بالجلسة الحالية.
         */
        getJoinCode: function () {
            return _session ? _session.joinCode : null;
        },

        /**
         * هل التسجيل مفتوح حالياً؟
         */
        isRegistrationOpen: function () {
            return !!(_session && _session.registrationOpen);
        }
    };

    AGP.log('AGP Session skeleton loaded (state machine only, no game/player logic yet)');

}(window.AymanGamesPlatform));
