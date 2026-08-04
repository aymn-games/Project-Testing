/**
 * ==========================================================================
 *  AGP GAME ENGINE — محرك اللعبة (Minimal Game Engine)
 * ==========================================================================
 *
 * هذا الملف يمثّل نسخة أولية جداً (Minimal) من محرك اللعبة، مسؤولة فقط
 * عن إدارة **دورة حياة اللعبة الحالية الواحدة**: تحميلها، تشغيلها،
 * إيقافها، وتدميرها. لا يحتوي على أي منطق خاص بأي لعبة بعينها، ولا أي
 * منطق جولات متعدد (Round Manager)، ولا أي ارتباط بتيك توك أو WebSocket
 * أو Cloudflare. كل ذلك مؤجَّل لمراحل قادمة.
 *
 * العلاقة مع Game API (`agp-game-api.js`):
 *   - `AGP.gameAPI` هو "السجل" (Registry) الذي تُسجَّل فيه الألعاب
 *     (register/unregister)، وهو الذي يعرّف شكل كائن اللعبة الموحّد.
 *   - `AGP.gameEngine` (هذا الملف) لا يُسجِّل أي لعبة بنفسه؛ هو فقط
 *     "يُحمِّل" لعبة **مسجَّلة مسبقاً** في `AGP.gameAPI` ليديرها، عبر
 *     `AGP.gameAPI.getGame(id)`، ثم يستدعي دوال دورة حياتها عند الحاجة.
 *   - عند تحميل لعبة، يُستدعى أيضاً `AGP.gameAPI.setCurrentGame(id)`
 *     حتى تبقى "اللعبة النشطة الحالية" متسقة بين الوحدتين (Game API
 *     وGame Engine يشيران لنفس اللعبة الحالية دائماً).
 *
 * ملاحظة مهمة حول onLoad():
 *   في النسخة السابقة من `agp-game-api.js` كانت `onLoad()` تُستدعى
 *   تلقائياً عند `register()`. تم نقل هذا الاستدعاء إلى هنا (عند
 *   `loadGame()` في محرك اللعبة)، لأن "التسجيل" في السجل شيء، و"التحميل
 *   الفعلي للتشغيل" شيء آخر تماماً — وهذا بالضبط دور محرك اللعبة. هذا
 *   يمنع استدعاء onLoad() مرتين (مرة عند التسجيل ومرة عند التحميل).
 *
 * ملاحظة حول onRoundStart()/onRoundEnd() والتداخل المحتمل مع Game API:
 *   `agp-game-api.js` يمرّر تلقائياً أحداث `session:roundStarted` /
 *   `session:roundFinished` (الصادرة من Session Manager) إلى
 *   `onRoundStart`/`onRoundEnd` الخاصة باللعبة النشطة. أما محرك اللعبة
 *   هنا فيوفّر بالإضافة إلى ذلك تحكماً **يدوياً وصريحاً** عبر
 *   `start()`/`stop()`، مخصّص أصلاً لاختبار اللعبة المحمَّلة من الـ
 *   Console. **تحديث**: بعد وجود Round Manager فعلياً، أُضيف أدناه ربط
 *   تلقائي (`game:roundEnded` -> `stop()`, `game:reset` -> `destroy()`)
 *   يُشغِّل هذا المسار اليدوي تلقائياً دون تدخل بشري. **الاستدعاء
 *   المزدوج المحتمل لـ `onRoundStart()` و`onRoundEnd()` (مرة هنا عبر
 *   `start()`/`stop()`، ومرة عبر `agp-game-api.js` عند
 *   `session:roundStarted`/`session:roundFinished`) مُغلَق لكلا
 *   الـ Hook معاً** عبر حارس مشترك يعتمد على حالة/معرّف اللعبة
 *   (`AGP._roundHookGuard`، أدناه) — لا وقت — فلا يُستدعى أي منهما إلا
 *   مرة واحدة فعلياً لكل حدث فعلي، ودون إسقاط أي جولة لاحقة صحيحة.
 *
 * الأحداث المُطلَقة عبر AGP.events (Namespace: `game:*`):
 *   - game:loaded      -> بعد تحميل لعبة واستدعاء onLoad() بنجاح
 *   - game:started      -> بعد استدعاء start() بنجاح (ويُستدعى onRoundStart)
 *   - game:ended        -> بعد استدعاء stop() بنجاح (ويُستدعى onRoundEnd)
 *   - game:destroyed    -> بعد استدعاء destroy() بنجاح (ويُستدعى onDestroy)
 *
 * اختبار سريع من الـ Console (بعد تسجيل لعبة تجريبية عبر AGP.gameAPI):
 *   AGP.gameAPI.register({ id: 'demo-game', name: 'لعبة تجريبية' });
 *   AGP.gameEngine.loadGame('demo-game');
 *   AGP.gameEngine.start();
 *   AGP.gameEngine.stop();
 *   AGP.gameEngine.destroy();
 *
 * يعتمد هذا الملف على وجود js/agp-core.js, js/agp-events.js, و
 * js/agp-game-api.js قبله، ويُفضَّل تحميله بعد الأخير وقبل
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

    /**
     * استدعاء آمن لدالة دورة حياة في كائن لعبة معيّن (لا يرمي استثناءً
     * يوقف بقية المنصة لو فشلت اللعبة نفسها داخلياً).
     */
    function safeCallHook(game, hookName, payload) {
        if (!game || typeof game[hookName] !== 'function') return;
        try {
            game[hookName](payload);
        } catch (err) {
            console.error('[AGP Game Engine] Error in "' + game.id + '.' + hookName + '()":', err);
        }
    }

    /**
     * حارس تكرار مشترك (AGP._shouldNotifyRoundHook) يمنع استدعاء
     * onRoundStart()/onRoundEnd() مرتين لنفس اللعبة عبر مسارين مختلفين
     * لنفس الحدث الفعلي (هذا الملف وagp-game-api.js كلاهما). تُعرَّف مرة
     * واحدة فقط (أياً من الملفين يُحمَّل أولاً)؛ الآخر يعيد استخدامها بدل
     * نسخها. يعتمد على حالة/معرّف اللعبة فقط (لا وقت)، فلا يُسقِط أي حدث
     * لاحق صحيح.
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
     * الحالة الداخلية لمحرك اللعبة (لعبة واحدة محمَّلة كحد أقصى حالياً)
     * ---------------------------------------------------------------- */
    var _loadedGame = null;
    var _isRunning = false;

    AGP.gameEngine = {

        /**
         * تحميل لعبة مسجَّلة مسبقاً في AGP.gameAPI ليديرها المحرك.
         * يستدعي onLoad() الخاص باللعبة عند النجاح، ويجعلها اللعبة
         * النشطة الحالية في AGP.gameAPI أيضاً.
         * @param {string} id - معرّف اللعبة كما سُجِّلت في AGP.gameAPI.
         * @returns {boolean} true عند نجاح التحميل.
         */
        loadGame: function (id) {
            if (!AGP.gameAPI || typeof AGP.gameAPI.getGame !== 'function') {
                AGP.log('Game Engine: Game API not available, cannot load game.');
                return false;
            }

            var game = AGP.gameAPI.getGame(id);
            if (!game) {
                AGP.log('Game Engine: cannot load, no registered game found with id', id);
                return false;
            }

            if (_loadedGame && _loadedGame.id !== id) {
                AGP.log('Game Engine: replacing currently loaded game "' + _loadedGame.id + '" with "' + id + '".');
            }

            _loadedGame = game;
            _isRunning = false;

            if (typeof AGP.gameAPI.setCurrentGame === 'function') {
                AGP.gameAPI.setCurrentGame(id);
            }

            AGP.log('Game Engine: game loaded', id);
            safeCallHook(_loadedGame, 'onLoad');
            AGP.events.emit('game:loaded', { id: id, game: _loadedGame });

            return true;
        },

        /**
         * تشغيل اللعبة المحمَّلة حالياً (يستدعي onRoundStart()).
         * @returns {boolean} true عند نجاح التشغيل.
         */
        start: function () {
            if (!_loadedGame) {
                AGP.log('Game Engine: cannot start, no game loaded.');
                return false;
            }
            if (_isRunning) {
                AGP.log('Game Engine: game "' + _loadedGame.id + '" is already running.');
                return false;
            }

            _isRunning = true;

            AGP.log('Game Engine: game started', _loadedGame.id);
            if (AGP._shouldNotifyRoundHook(_loadedGame.id, 'onRoundStart')) {
                safeCallHook(_loadedGame, 'onRoundStart');
            }
            AGP.events.emit('game:started', { id: _loadedGame.id, game: _loadedGame });

            return true;
        },

        /**
         * إيقاف اللعبة المحمَّلة الجارية حالياً (يستدعي onRoundEnd()).
         * @returns {boolean} true عند نجاح الإيقاف.
         */
        stop: function () {
            if (!_loadedGame) {
                AGP.log('Game Engine: cannot stop, no game loaded.');
                return false;
            }
            if (!_isRunning) {
                AGP.log('Game Engine: game "' + _loadedGame.id + '" is not running.');
                return false;
            }

            _isRunning = false;

            AGP.log('Game Engine: game ended', _loadedGame.id);
            if (AGP._shouldNotifyRoundHook(_loadedGame.id, 'onRoundEnd')) {
                safeCallHook(_loadedGame, 'onRoundEnd');
            }
            AGP.events.emit('game:ended', { id: _loadedGame.id, game: _loadedGame });

            return true;
        },

        /**
         * تدمير اللعبة المحمَّلة حالياً (يستدعي onDestroy()) وتفريغ
         * المحرك من أي لعبة محمَّلة. لا يُلغي تسجيل اللعبة من
         * AGP.gameAPI؛ ذلك يبقى مسؤولية AGP.gameAPI.unregister(id)
         * بشكل منفصل ومستقل.
         * @returns {boolean} true عند نجاح التدمير.
         */
        destroy: function () {
            if (!_loadedGame) {
                AGP.log('Game Engine: cannot destroy, no game loaded.');
                return false;
            }

            if (_isRunning) {
                AGP.log('Game Engine: stopping running game before destroy.');
                this.stop();
            }

            var id = _loadedGame.id;
            var game = _loadedGame;

            AGP.log('Game Engine: game destroyed', id);
            safeCallHook(game, 'onDestroy');
            AGP.events.emit('game:destroyed', { id: id, game: game });

            _loadedGame = null;
            _isRunning = false;

            return true;
        },

        /**
         * جلب كائن اللعبة المحمَّلة حالياً في المحرك، أو null إن لم توجد.
         * @returns {Object|null}
         */
        getLoadedGame: function () {
            return _loadedGame;
        },

        /**
         * جلب معرّف اللعبة المحمَّلة حالياً، أو null إن لم توجد.
         * @returns {string|null}
         */
        getLoadedGameId: function () {
            return _loadedGame ? _loadedGame.id : null;
        },

        /**
         * هل اللعبة المحمَّلة حالياً قيد التشغيل؟
         * @returns {boolean}
         */
        isRunning: function () {
            return _isRunning;
        }
    };

    /* ----------------------------------------------------------------
     * مزامنة تلقائية مع أحداث اللعبة المُبلَّغة (game:roundEnded / game:reset)
     * ----------------------------------------------------------------
     * هذه الفجوة كانت موثَّقة صراحة منذ CHANGELOG [0.10.0]: "لا ربط
     * تلقائي بعد بين 'اللعبة أبلغت بانتهاء الجولة' واستدعاء
     * AGP.gameEngine.stop() تلقائياً على المنصة — يبقى قراراً مستقلاً
     * متروكاً لمرحلة Round Manager قادمة". الآن بعد وجود Round Manager
     * فعلياً (agp-round-manager.js)، يُغلَق هذا القيد هنا مباشرة:
     *
     *   game:roundEnded -> stop()     (فقط لو اللعبة المُبلِّغة هي
     *                                   المحمَّلة فعلياً وقيد التشغيل)
     *   game:reset      -> destroy()  (فقط لو اللعبة المُبلِّغة هي
     *                                   المحمَّلة فعلياً)
     *
     * كلا الاستماعين هنا عامان تماماً (لا ذكر لأي لعبة بعينها)، ويعملان
     * لأي لعبة مستقبلية تُبلِّغ بنفس اسمي الحدثين — بما فيها ألعاب تيك
     * توك القادمة، دون أي كود إضافي خاص بها.
     *
     * ✅ تحديث: استدعاء onRoundStart()/onRoundEnd() المزدوج المحتمل (مرة
     * عبر start()/stop() هنا، ومرة عبر agp-game-api.js عند
     * session:roundStarted/session:roundFinished) أُغلِق لكلا الـ Hook
     * عبر حارس مشترك يعتمد على حالة/معرّف اللعبة (AGP._roundHookGuard)
     * لا وقت — كلا المسارين يستخدمانه الآن لكلا الحدثين، فلا يُستدعى أي
     * منهما إلا مرة واحدة فعلياً لكل حدث حقيقي، دون إسقاط أي جولة لاحقة.
     * ---------------------------------------------------------------- */
    AGP.events.on('game:roundEnded', function (payload) {
        if (!_loadedGame || !_isRunning) return;
        if (payload && payload.id && payload.id !== _loadedGame.id) return;

        AGP.log('Game Engine: auto-stopping "' + _loadedGame.id + '" after game:roundEnded.');
        AGP.gameEngine.stop();
    });

    AGP.events.on('game:reset', function (payload) {
        if (!_loadedGame) return;
        if (payload && payload.id && payload.id !== _loadedGame.id) return;

        AGP.log('Game Engine: auto-destroying "' + _loadedGame.id + '" after game:reset.');
        AGP.gameEngine.destroy();
    });

    AGP.log('AGP Game Engine (minimal) loaded — manages a single current game lifecycle only.');

}(window.AymanGamesPlatform));
