/**
 * ==========================================================================
 *  AGP GAME API — الواجهة الموحّدة للألعاب (Game API Contract)
 * ==========================================================================
 *
 * هذا الملف يمثّل "هيكل" (Skeleton) للعقد الموحّد الذي يجب أن تلتزم به
 * أي لعبة (حالية أو مستقبلية) للعمل داخل المنصة بنفس الأسلوب. لا يوجد
 * هنا أي محرك لعبة (Game Engine) حقيقي، ولا أي منطق جولات أو قواعد لعب،
 * ولا أي ارتباط بتيك توك أو Cloudflare. الهدف فقط هو **تعريف الشكل
 * الموحّد** (Interface) الذي تُسجَّل به الألعاب، مع ربط بسيط جداً بناقل
 * الأحداث لتمرير الأحداث العامة للعبة النشطة الحالية دون أي تفسير أو
 * منطق إضافي من هذا الملف.
 *
 * الفرق بين هذا الملف و agp-registry.js:
 *   - `agp-registry.js` يكتشف **بطاقات العرض** (`.game-card`) الموجودة
 *     في `index.html` تلقائياً (العنوان، الغلاف، الرابط...)، وهو معني
 *     بـ "ماذا يُعرض للمستخدم في الصفحة الرئيسية".
 *   - `agp-game-api.js` (هذا الملف) معني بـ "كيف تتحدّث اللعبة نفسها مع
 *     المنصة برمجياً" عبر كائن لعبة (Game Object) بمنطق ودورة حياة،
 *     بغضّ النظر عن شكل عرضها في الصفحة. الاثنان مستقلان تماماً في هذه
 *     المرحلة، ويمكن ربطهما لاحقاً (بنفس الـ id) عند بناء Game Engine
 *     فعلي.
 *
 * شكل "كائن اللعبة" (Game Object) المتوقَّع عند التسجيل:
 *   {
 *     id: 'roulette-game',        // مطلوب، يُفضَّل مطابقة data-agp-game-id
 *     name: 'روليت القبائل',      // اختياري، اسم وصفي
 *
 *     // كل الدوال التالية اختيارية بالكامل؛ أي دالة غير موجودة يعوّضها
 *     // هذا الملف تلقائياً بدالة فارغة (No-op) حتى يبقى استدعاؤها آمناً
 *     // دائماً من أي كود مستقبلي دون الحاجة للتحقق من وجودها في كل مرة:
 *     onLoad: function () {},          // عند تحميل اللعبة فعلياً عبر AGP.gameEngine.loadGame() (وليس عند التسجيل)
 *     onLobbyOpen: function () {},     // عند فتح التسجيل (lobby:opened)
 *     onLobbyClose: function () {},    // عند إغلاق التسجيل (lobby:closed)
 *     onRoundStart: function () {},    // عند بدء جولة (session:roundStarted)
 *     onRoundEnd: function () {},      // عند انتهاء جولة (session:roundFinished)
 *     onPlayerJoin: function () {},    // عند انضمام لاعب (player:joined)
 *     onPlayerLeave: function () {},   // عند مغادرة/حذف لاعب (player:removed)
 *     onDestroy: function () {}        // عند إلغاء تسجيل اللعبة
 *   }
 *
 * الربط البسيط بناقل الأحداث (بدون أي منطق لعب فعلي):
 *   هذا الملف يستمع فقط لأحداث المنصة الموجودة فعلياً حالياً
 *   (`lobby:opened`, `lobby:closed`, `player:joined`, `player:removed`,
 *   `session:roundStarted`, `session:roundFinished`) ويمرّرها كما هي
 *   إلى الدالة (Hook) المقابلة في **اللعبة الحالية فقط** (عبر
 *   `getCurrentGame()`)، دون أي تعديل أو تفسير أو قرار لعب من عنده.
 *   هذا التمرير هو كل "المنطق" الموجود هنا؛ لا يوجد محرك جولات حقيقي.
 *
 * يعتمد هذا الملف على وجود js/agp-core.js و js/agp-events.js قبله،
 * ويُفضَّل تحميله بعد js/agp-session.js, js/agp-player-manager.js, js/agp-lobby.js
 * (لأن الأحداث التي يستمع لها تصدر من هذه الوحدات) وقبل js/agp-bootstrap.js.
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
     * 1) أسماء دوال دورة الحياة المدعومة (Lifecycle Hooks)
     * ----------------------------------------------------------------
     * قائمة موثَّقة رسمياً بأسماء الدوال الاختيارية التي يمكن لأي لعبة
     * توفيرها. تُستخدم هذه القائمة فقط لتعويض أي دالة غير موجودة بدالة
     * فارغة (No-op)، وليس لأي غرض آخر.
     * ---------------------------------------------------------------- */
    var LIFECYCLE_HOOKS = [
        'onLoad',
        'onLobbyOpen',
        'onLobbyClose',
        'onRoundStart',
        'onRoundEnd',
        'onPlayerJoin',
        'onPlayerLeave',
        'onDestroy'
    ];

    /* ----------------------------------------------------------------
     * 2) التخزين الداخلي للألعاب المسجَّلة
     * ---------------------------------------------------------------- */
    var _games = {};
    var _currentGameId = null;

    /**
     * تجهيز كائن اللعبة قبل التخزين: تعويض أي دالة دورة حياة غير
     * موجودة بدالة فارغة، حتى يبقى استدعاؤها آمناً دائماً من أي كود
     * مستقبلي دون الحاجة للتحقق من وجودها في كل مرة.
     */
    function normalizeGame(game) {
        var normalized = {};

        Object.keys(game).forEach(function (key) {
            normalized[key] = game[key];
        });

        LIFECYCLE_HOOKS.forEach(function (hookName) {
            if (typeof normalized[hookName] !== 'function') {
                normalized[hookName] = function () {};
            }
        });

        return normalized;
    }

    /**
     * استدعاء آمن لدالة دورة حياة في كائن لعبة معيّن (لا يرمي استثناءً
     * يوقف بقية المنصة لو فشلت اللعبة نفسها داخلياً).
     */
    function safeCallHook(game, hookName, payload) {
        if (!game || typeof game[hookName] !== 'function') return;
        try {
            game[hookName](payload);
        } catch (err) {
            console.error('[AGP Game API] Error in "' + game.id + '.' + hookName + '()":', err);
        }
    }

    /**
     * حارس تكرار مشترك (AGP._shouldNotifyRoundHook) يمنع استدعاء
     * onRoundStart()/onRoundEnd() مرتين لنفس اللعبة عبر مسارين مختلفين
     * لنفس الحدث الفعلي (agp-game-engine.js وagp-game-api.js كلاهما).
     * تُعرَّف مرة واحدة فقط هنا (أو في agp-game-engine.js أيهما يُحمَّل
     * أولاً)؛ الملف الآخر يعيد استخدام نفس الدالة بدل نسخها. يعتمد على
     * حالة/معرّف اللعبة فقط (لا وقت)، فلا يُسقِط أي حدث لاحق صحيح.
     */
    if (!AGP._shouldNotifyRoundHook) {
        AGP._roundHookGuard = {};
        AGP._shouldNotifyRoundHook = function (gameId, hookName) {
            if (!gameId) return true;
            if (AGP._roundHookGuard[gameId] === hookName) return false;
            AGP._roundHookGuard[gameId] = hookName;
            return true;
        };
    }

    /* ----------------------------------------------------------------
     * 3) واجهة AGP.gameAPI العامة
     * ---------------------------------------------------------------- */
    AGP.gameAPI = {

        // نعرّض قائمة الدوال المدعومة كي يطّلع عليها أي مطوّر لعبة جديدة
        LIFECYCLE_HOOKS: LIFECYCLE_HOOKS,

        /**
         * تسجيل لعبة جديدة داخل المنصة وفق العقد الموحّد أعلاه.
         * @param {Object} game - كائن اللعبة، يجب أن يحتوي على { id }.
         * @returns {boolean} true عند نجاح التسجيل.
         */
        register: function (game) {
            if (!game || !game.id) {
                AGP.log('Game API: registration rejected, missing game id.', game);
                return false;
            }

            if (_games[game.id]) {
                AGP.log('Game API: a game with id "' + game.id + '" is already registered.');
                return false;
            }

            var normalizedGame = normalizeGame(game);
            _games[game.id] = normalizedGame;

            AGP.log('Game API: game registered', game.id);
            AGP.events.emit('game:registered', { id: game.id, game: normalizedGame });

            // ملاحظة: onLoad() لا تُستدعى هنا. "التسجيل" في السجل شيء،
            // و"التحميل الفعلي للتشغيل" شيء آخر — تلك مسؤولية
            // AGP.gameEngine.loadGame(id) (انظر agp-game-engine.js)،
            // حتى لا تُستدعى onLoad() مرتين لنفس اللعبة.

            return true;
        },

        /**
         * إلغاء تسجيل لعبة موجودة عن طريق الـ id.
         * @param {string} id
         * @returns {boolean} true إذا تم الإلغاء فعلياً.
         */
        unregister: function (id) {
            var game = _games[id];
            if (!game) {
                AGP.log('Game API: cannot unregister, no game found with id', id);
                return false;
            }

            safeCallHook(game, 'onDestroy');

            delete _games[id];
            if (_currentGameId === id) {
                _currentGameId = null;
            }

            AGP.log('Game API: game unregistered', id);
            AGP.events.emit('game:unregistered', { id: id });

            return true;
        },

        /**
         * جلب كائن لعبة مسجَّلة عن طريق الـ id.
         * @param {string} id
         * @returns {Object|null}
         */
        getGame: function (id) {
            return _games[id] || null;
        },

        /**
         * جلب كل الألعاب المسجَّلة حالياً كمصفوفة.
         * @returns {Array<Object>}
         */
        getAllGames: function () {
            return Object.keys(_games).map(function (id) {
                return _games[id];
            });
        },

        /**
         * تعيين اللعبة النشطة الحالية (اللعبة التي ستستقبل أحداث
         * lobby/player/round الممرَّرة من هذا الملف).
         * @param {string} id
         * @returns {boolean} true إذا وُجدت اللعبة وتم التعيين.
         */
        setCurrentGame: function (id) {
            if (!_games[id]) {
                AGP.log('Game API: cannot set current game, no game found with id', id);
                return false;
            }

            var previousId = _currentGameId;
            _currentGameId = id;

            AGP.log('Game API: current game set to', id);
            AGP.events.emit('game:currentChanged', { previousId: previousId, id: id });

            return true;
        },

        /**
         * جلب كائن اللعبة النشطة الحالية، أو null إن لم تُعيَّن أي لعبة.
         * @returns {Object|null}
         */
        getCurrentGame: function () {
            return _currentGameId ? (_games[_currentGameId] || null) : null;
        }
    };

    /* ----------------------------------------------------------------
     * 4) الربط البسيط بناقل الأحداث (تمرير فقط، بدون أي منطق لعب)
     * ----------------------------------------------------------------
     * كل مستمع هنا يكتفي بتمرير الحدث كما هو إلى الدالة (Hook) المقابلة
     * في اللعبة النشطة الحالية فقط. لا يوجد أي قرار أو حساب أو تعديل
     * على البيانات من هذا الملف.
     * ---------------------------------------------------------------- */
    AGP.events.on('lobby:opened', function (payload) {
        safeCallHook(AGP.gameAPI.getCurrentGame(), 'onLobbyOpen', payload);
    });

    AGP.events.on('lobby:closed', function (payload) {
        safeCallHook(AGP.gameAPI.getCurrentGame(), 'onLobbyClose', payload);
    });

    AGP.events.on('player:joined', function (payload) {
        safeCallHook(AGP.gameAPI.getCurrentGame(), 'onPlayerJoin', payload);
    });

    AGP.events.on('player:removed', function (payload) {
        safeCallHook(AGP.gameAPI.getCurrentGame(), 'onPlayerLeave', payload);
    });

    AGP.events.on('session:roundStarted', function (payload) {
        // حارس تكرار مشترك (AGP._shouldNotifyRoundHook، مُعرَّف مرة واحدة
        // فقط — راجع القسم 2.5 أعلاه) — يمنع استدعاء onRoundStart() مرتين
        // لنفس اللعبة إن استُدعي AGP.gameEngine.start() لنفس الجولة تقريباً
        // في نفس اللحظة.
        var currentGame = AGP.gameAPI.getCurrentGame();
        if (currentGame && !AGP._shouldNotifyRoundHook(currentGame.id, 'onRoundStart')) return;
        safeCallHook(currentGame, 'onRoundStart', payload);
    });

    AGP.events.on('session:roundFinished', function (payload) {
        // نفس الحارس المشترك، لنفس السبب مع onRoundEnd().
        var currentGame = AGP.gameAPI.getCurrentGame();
        if (currentGame && !AGP._shouldNotifyRoundHook(currentGame.id, 'onRoundEnd')) return;
        safeCallHook(currentGame, 'onRoundEnd', payload);
    });

    AGP.log('AGP Game API skeleton loaded (unified game contract, no Game Engine/round logic yet).');

}(window.AymanGamesPlatform));
