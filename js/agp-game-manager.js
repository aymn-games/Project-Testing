/**
 * ==========================================================================
 *  AGP GAME MANAGER — نقطة الدخول الموحّدة لإدارة الألعاب (Facade)
 * ==========================================================================
 *
 * هذا الملف **واجهة رقيقة (Facade) فقط** — لا يحتوي على أي منطق جديد
 * ولا ينقل أو يكرر أي كود موجود. كل دالة هنا مجرد تفويض مباشر (١ سطر
 * غالباً) لدالة موجودة أصلاً في واحدة من الوحدات التالية:
 *
 *   - `AGP.gameAPI`      (`agp-game-api.js`)      — التسجيل/العقد الموحّد
 *   - `AGP.gameEngine`   (`agp-game-engine.js`)   — تشغيل لعبة واحدة محمَّلة
 *   - `AGP.lobby`        (`agp-lobby.js`)         — فتح/إغلاق التسجيل
 *   - `AGP.events`       (`agp-events.js`)        — بث حدث "إعادة الضبط"
 *
 * لماذا هذا الملف موجود رغم أن الوحدات أعلاه لم تتغيّر ولم تُنقَل أي
 * دالة منها:
 *   كانت المنصة تملك أنظمة منفصلة لإدارة الألعاب (تسجيل، تشغيل، تحكّم)،
 *   يستدعيها أي كود خارجي مباشرة كل واحد باسمه. هذا الملف يوحّد نقطة
 *   الدخول لأي كود **مستقبلي** في المنصة (وحدات جديدة، ألعاب جديدة،
 *   وتحديداً AGP Dashboard) خلف واجهة واحدة بأسماء دوال واضحة، دون فرض
 *   أي تغيير على الكود الحالي الذي يعمل فعلياً. **تحديث**: عند إنشاء
 *   هذا الملف كانت `games/roulette/agp-roulette.js` لا تزال تستدعي
 *   `AGP.gameAPI`/`AGP.gameEngine` مباشرة؛ لاحقاً (عند استخراج
 *   `agp-game-bridge.js`) أُعيدت كتابتها لتستخدم
 *   `AGP.gameManager.registerGame(...)` للتسجيل — فأصبحت الروليت أول
 *   مستهلك فعلي لهذا الـ Facade، لا استثناءً عنه.
 *
 * خريطة التفويض الكاملة:
 *
 *   AGP.gameManager.registerGame(game)      -> AGP.gameAPI.register(game)
 *   AGP.gameManager.unregisterGame(id)      -> AGP.gameAPI.unregister(id)
 *   AGP.gameManager.loadGame(id)            -> AGP.gameEngine.loadGame(id)
 *   AGP.gameManager.unloadGame()            -> AGP.gameEngine.destroy()
 *   AGP.gameManager.getCurrentGame()        -> AGP.gameEngine.getLoadedGame()
 *   AGP.gameManager.getRegisteredGames()    -> AGP.gameAPI.getAllGames()
 *   AGP.gameManager.openRegistration()      -> AGP.lobby.open()            [جديد]
 *   AGP.gameManager.closeRegistration()     -> AGP.lobby.close()           [جديد]
 *   AGP.gameManager.startGame()             -> AGP.gameEngine.start()     [جديد]
 *   AGP.gameManager.stopGame()              -> AGP.gameEngine.stop()      [جديد]
 *   AGP.gameManager.resetSession()          -> AGP.events.emit('game:reset', ...) [جديد]
 *   AGP.gameManager.getLobbyState()         -> AGP.lobby.getLobbyState()          [جديد]
 *   AGP.gameManager.getRoundState()         -> AGP.roundManager.getState()        [جديد]
 *   AGP.gameManager.getPlayers()            -> AGP.player.getAllPlayers()         [جديد]
 *   AGP.gameManager.getPlayersCount()       -> AGP.player.getPlayersCount()       [جديد]
 *
 * ملاحظة حول دوال القراءة الأربع الأخيرة (getLobbyState/getRoundState/
 * getPlayers/getPlayersCount): أُضيفت خصيصاً حتى يصبح AGP.gameManager
 * **نقطة الاتصال الوحيدة بين Dashboard وAGP، حتى في عمليات القراءة**،
 * لا فقط أفعال التحكّم. كل واحدة تفويض بسطر واحد بلا أي منطق إضافي.
 *
 * ملاحظة حول resetSession(): لا توجد دالة "إعادة ضبط" في أي وحدة أصلية
 * — آلية إعادة الضبط الوحيدة الموجودة أصلاً هي حدث `game:reset` نفسه
 * (الذي تطلقه لعبة الروليت عن نفسها عبر `agp-roulette.js`، ويستمع له
 * كل من `agp-round-manager.js` و `agp-lobby.js` و `agp-game-engine.js`
 * — الأخير يستدعي `destroy()` تلقائياً عليه منذ [0.14.0]). هذه الدالة
 * لا تخترع آلية جديدة؛ فقط تتيح لأي كود خارجي (مثل Dashboard) إطلاق
 * نفس الحدث الموجود أصلاً دون معرفة تفاصيل AGP.events مباشرة.
 *
 * ملاحظة حول unloadGame(): لا توجد دالة اسمها "unload" في أي من
 * الوحدات الأصلية؛ أقرب مكافئ موجود فعلياً هو
 * `AGP.gameEngine.destroy()` (يوقف اللعبة إن كانت تعمل، يستدعي
 * `onDestroy()`، ويُفرِّغ اللعبة المحمَّلة من المحرك) — نفس السلوك
 * تماماً، فقط بالاسم المطلوب هنا.
 *
 * ملاحظة حول getCurrentGame(): كانت هذه الدالة موجودة مسبقاً في
 * الوحدتين معاً (`AGP.gameAPI.getCurrentGame()` و
 * `AGP.gameEngine.getLoadedGame()`)، وهما متزامنتان فعلياً (لأن
 * `AGP.gameEngine.loadGame()` يستدعي داخلياً `AGP.gameAPI.setCurrentGame()`
 * أصلاً). هذا الملف يفوِّض إلى `AGP.gameEngine.getLoadedGame()` تحديداً
 * باعتباره الأقرب دلالياً لمعنى "اللعبة الحالية الجالسة قيد التشغيل".
 *
 * الأحداث: لا يبث هذا الملف أي حدث بنفسه إطلاقاً **إلا** `resetSession()`
 * التي تبث `game:reset` (وهو حدث موجود أصلاً، تستهلكه وحدات أخرى
 * موجودة أصلاً — لا حدث جديد). كل الأحداث الأخرى (`game:registered`,
 * `game:unregistered`, `game:loaded`, `game:started`, `game:ended`,
 * `game:destroyed`, `game:currentChanged`, `lobby:opened`, `lobby:closed`)
 * تُبَث أصلاً من `AGP.gameAPI`/`AGP.gameEngine`/`AGP.lobby` أنفسهم عند
 * استدعاء دوالهم عبر هذا الملف، فتبقى "كل العمليات تمر عبر AGP Events"
 * محقَّقة دون أي ازدواجية.
 *
 * يعتمد هذا الملف على وجود js/agp-core.js (لـ AGP.log و AGP.events) قبله،
 * ويُفضَّل تحميله بعد js/agp-game-api.js, js/agp-game-engine.js,
 * js/agp-lobby.js (رغم أن كل دالة هنا تتحقق من وجودها بأمان بغض النظر
 * عن ترتيب التحميل الفعلي).
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) {
        AGP.log = function () {};
    }

    AGP.gameManager = {

        /**
         * تسجيل لعبة جديدة. تفويض مباشر لـ AGP.gameAPI.register(game).
         * @param {Object} game
         * @returns {boolean}
         */
        registerGame: function (game) {
            if (!AGP.gameAPI || typeof AGP.gameAPI.register !== 'function') {
                AGP.log('Game Manager: Game API not available, cannot register.');
                return false;
            }
            return AGP.gameAPI.register(game);
        },

        /**
         * إلغاء تسجيل لعبة. تفويض مباشر لـ AGP.gameAPI.unregister(id).
         * @param {string} id
         * @returns {boolean}
         */
        unregisterGame: function (id) {
            if (!AGP.gameAPI || typeof AGP.gameAPI.unregister !== 'function') {
                AGP.log('Game Manager: Game API not available, cannot unregister.');
                return false;
            }
            return AGP.gameAPI.unregister(id);
        },

        /**
         * تحميل لعبة مسجَّلة مسبقاً في المحرك. تفويض مباشر لـ
         * AGP.gameEngine.loadGame(id).
         * @param {string} id
         * @returns {boolean}
         */
        loadGame: function (id) {
            if (!AGP.gameEngine || typeof AGP.gameEngine.loadGame !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot load game.');
                return false;
            }
            return AGP.gameEngine.loadGame(id);
        },

        /**
         * إلغاء تحميل اللعبة الحالية من المحرك. تفويض مباشر لـ
         * AGP.gameEngine.destroy() (أقرب مكافئ موجود فعلياً لمفهوم
         * "unload" — راجع الملاحظة أعلى الملف).
         * @returns {boolean}
         */
        unloadGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.destroy !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot unload game.');
                return false;
            }
            return AGP.gameEngine.destroy();
        },

        /**
         * جلب اللعبة المحمَّلة حالياً في المحرك. تفويض مباشر لـ
         * AGP.gameEngine.getLoadedGame().
         * @returns {Object|null}
         */
        getCurrentGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.getLoadedGame !== 'function') {
                return null;
            }
            return AGP.gameEngine.getLoadedGame();
        },

        /**
         * جلب كل الألعاب المسجَّلة. تفويض مباشر لـ
         * AGP.gameAPI.getAllGames().
         * @returns {Array<Object>}
         */
        getRegisteredGames: function () {
            if (!AGP.gameAPI || typeof AGP.gameAPI.getAllGames !== 'function') {
                return [];
            }
            return AGP.gameAPI.getAllGames();
        },

        /**
         * فتح التسجيل لانضمام لاعبين جدد. تفويض مباشر لـ
         * AGP.lobby.open().
         * @returns {boolean}
         */
        openRegistration: function () {
            if (!AGP.lobby || typeof AGP.lobby.open !== 'function') {
                AGP.log('Game Manager: Lobby not available, cannot open registration.');
                return false;
            }
            return AGP.lobby.open();
        },

        /**
         * إغلاق التسجيل. تفويض مباشر لـ AGP.lobby.close().
         * @returns {boolean}
         */
        closeRegistration: function () {
            if (!AGP.lobby || typeof AGP.lobby.close !== 'function') {
                AGP.log('Game Manager: Lobby not available, cannot close registration.');
                return false;
            }
            return AGP.lobby.close();
        },

        /**
         * تشغيل اللعبة المحمَّلة حالياً. تفويض مباشر لـ
         * AGP.gameEngine.start().
         * @returns {boolean}
         */
        startGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.start !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot start game.');
                return false;
            }
            return AGP.gameEngine.start();
        },

        /**
         * إيقاف اللعبة الجارية حالياً. تفويض مباشر لـ
         * AGP.gameEngine.stop().
         * @returns {boolean}
         */
        stopGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.stop !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot stop game.');
                return false;
            }
            return AGP.gameEngine.stop();
        },

        /**
         * إعادة ضبط الجلسة الحالية. لا توجد دالة "إعادة ضبط" في أي وحدة
         * أصلية؛ الآلية الوحيدة الموجودة أصلاً هي حدث `game:reset` نفسه
         * (الذي تطلقه لعبة الروليت عن نفسها، ويستمع له Round Manager
         * وLobby أصلاً). هذه الدالة تُطلِق نفس الحدث الموجود، ولا تخترع
         * أي آلية إعادة ضبط جديدة.
         * @returns {boolean}
         */
        resetSession: function () {
            if (!AGP.events || typeof AGP.events.emit !== 'function') {
                AGP.log('Game Manager: Event Bus not available, cannot reset session.');
                return false;
            }
            var currentGame = this.getCurrentGame();
            AGP.events.emit('game:reset', { id: currentGame ? currentGame.id : null });
            return true;
        },

        /**
         * جلب حالة اللوبي الحالية. تفويض مباشر لـ AGP.lobby.getLobbyState().
         * @returns {string|null}
         */
        getLobbyState: function () {
            if (!AGP.lobby || typeof AGP.lobby.getLobbyState !== 'function') {
                return null;
            }
            return AGP.lobby.getLobbyState();
        },

        /**
         * جلب حالة الجولة الحالية. تفويض مباشر لـ AGP.roundManager.getState().
         * @returns {string|null}
         */
        getRoundState: function () {
            if (!AGP.roundManager || typeof AGP.roundManager.getState !== 'function') {
                return null;
            }
            return AGP.roundManager.getState();
        },

        /**
         * جلب قائمة اللاعبين الحاليين. تفويض مباشر لـ
         * AGP.player.getAllPlayers().
         * @returns {Array<Object>}
         */
        getPlayers: function () {
            if (!AGP.player || typeof AGP.player.getAllPlayers !== 'function') {
                return [];
            }
            return AGP.player.getAllPlayers();
        },

        /**
         * جلب عدد اللاعبين الحاليين. تفويض مباشر لـ
         * AGP.player.getPlayersCount().
         * @returns {number}
         */
        getPlayersCount: function () {
            if (!AGP.player || typeof AGP.player.getPlayersCount !== 'function') {
                return 0;
            }
            return AGP.player.getPlayersCount();
        }
    };

    AGP.log('AGP Game Manager (Facade) ready — delegates to AGP.gameAPI + AGP.gameEngine, no logic duplicated.');

}(window.AymanGamesPlatform));
