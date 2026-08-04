/**
 * ==========================================================================
 *  AGP EVENTS — ناقل الأحداث العام للمنصة (Platform Event Bus)
 * ==========================================================================
 *
 * هذا الملف هو المرجع الرسمي لناقل الأحداث (`AGP.events`) الذي تتواصل
 * عبره كل مكوّنات المنصة مع بعضها البعض بنمط Publish/Subscribe، بدل
 * الاستدعاء المباشر بين الملفات (مثل استدعاء دالة من ملف آخر مباشرة).
 *
 * ملاحظة مهمة حول العلاقة مع agp-core.js:
 *   `agp-core.js` ينشئ بالفعل نسخة أساسية من ناقل الأحداث
 *   (`AGP.events`) تدعم `on` / `off` / `emit`، وتُستخدم اليوم فعلياً من
 *   `agp-registry.js` و`agp-session.js` و`agp-bootstrap.js`. هذا الملف
 *   **لا يستبدل** تلك النسخة ولا يعيد كتابتها، بل:
 *     1) يضمن دعم `once()` أيضاً فوق نفس النسخة الموجودة (إن وُجدت)،
 *        دون كسر أي كود يستخدم `on/off/emit` حالياً.
 *     2) يوثّق رسمياً العقد العام (Contract) الذي يجب أن تلتزم به كل
 *        الوحدات (Managers) القادمة عند استخدام ناقل الأحداث.
 *     3) يوفّر نسخة احتياطية كاملة (Fallback) في حال تحميل هذا الملف
 *        بمفرده أو قبل `agp-core.js` بالخطأ، حتى لا ينهار أي كود يعتمد
 *        على `AGP.events`.
 *
 * هذا الملف لا يحتوي على أي منطق خاص بلعبة معيّنة، ولا بتيك توك، ولا
 * بأي اتصال شبكي حقيقي. هو فقط البنية العامة (Skeleton) لناقل الأحداث.
 *
 * ترتيب التحميل المقترح: بعد js/agp-core.js مباشرة، وقبل أي ملف آخر
 * يعتمد على AGP.events (agp-services.js, agp-registry.js,
 * agp-session.js, agp-bootstrap.js).
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) {
        AGP.log = function () {};
    }

    /* ----------------------------------------------------------------
     * 1) نسخة احتياطية كاملة (Fallback EventBus)
     * ----------------------------------------------------------------
     * تُستخدم فقط إذا لم يوجد AGP.events مسبقاً (مثلاً لو حُمّل هذا
     * الملف قبل agp-core.js بالخطأ، أو استُخدم بشكل مستقل). إن كان
     * AGP.events موجوداً بالفعل (الحالة الطبيعية)، لا يتم إنشاء أي شيء
     * جديد هنا إطلاقاً، ونكتفي بالتوسعة في القسم التالي.
     * ---------------------------------------------------------------- */
    if (!AGP.events) {
        (function () {
            function EventBus() {
                this._listeners = {};
            }

            EventBus.prototype.on = function (eventName, handler) {
                if (typeof handler !== 'function') return function () {};
                if (!this._listeners[eventName]) {
                    this._listeners[eventName] = [];
                }
                this._listeners[eventName].push(handler);

                var listeners = this._listeners[eventName];
                return function unsubscribe() {
                    var index = listeners.indexOf(handler);
                    if (index !== -1) listeners.splice(index, 1);
                };
            };

            EventBus.prototype.off = function (eventName, handler) {
                if (!this._listeners[eventName]) return;
                var index = this._listeners[eventName].indexOf(handler);
                if (index !== -1) this._listeners[eventName].splice(index, 1);
            };

            EventBus.prototype.emit = function (eventName, payload) {
                AGP.log('Event emitted:', eventName, payload);
                var handlers = this._listeners[eventName];
                if (!handlers || handlers.length === 0) return;

                handlers.slice().forEach(function (handler) {
                    try {
                        handler(payload);
                    } catch (err) {
                        console.error('[AGP] Event handler error for "' + eventName + '":', err);
                    }
                });
            };

            AGP.events = new EventBus();
            AGP.log('AGP Events: fallback event bus created (agp-core.js was not loaded first).');
        }());
    }

    /* ----------------------------------------------------------------
     * 2) توسعة once() فوق ناقل الأحداث الحالي (أياً كان مصدره)
     * ----------------------------------------------------------------
     * once(eventName, handler) تسجّل مستمعاً يُستدعى **مرة واحدة فقط**
     * ثم يُلغى تسجيله تلقائياً. تُبنى فوق on/off الموجودتين أصلاً، دون
     * الحاجة للوصول إلى تفاصيل التنفيذ الداخلي لناقل الأحداث.
     * ---------------------------------------------------------------- */
    if (typeof AGP.events.once !== 'function') {
        AGP.events.once = function (eventName, handler) {
            if (typeof handler !== 'function') return function () {};

            var bus = this;
            var unsubscribe = null;

            function wrappedHandler(payload) {
                if (typeof unsubscribe === 'function') unsubscribe();
                handler(payload);
            }

            unsubscribe = bus.on(eventName, wrappedHandler);
            return unsubscribe;
        };

        AGP.log('AGP Events: once() support added.');
    }

    /* ----------------------------------------------------------------
     * 3) عقد الاستخدام العام (Usage Contract) — توثيق فقط
     * ----------------------------------------------------------------
     * لا يوجد هنا أي كود تنفيذي لهذا القسم؛ هو توثيق داخل الملف نفسه
     * يوضّح كيف يُفترض أن تستخدم كل وحدة (Manager) قادمة ناقل الأحداث،
     * حتى تبقى الأسماء والاصطلاحات موحّدة بين كل الوحدات:
     *
     *   AGP.events.on(eventName, handler)   -> Function (unsubscribe)
     *   AGP.events.off(eventName, handler)  -> void
     *   AGP.events.once(eventName, handler) -> Function (unsubscribe)
     *   AGP.events.emit(eventName, payload) -> void
     *
     * اصطلاح تسمية الأحداث: "namespace:action" (مثل 'session:created'،
     * 'registry:gameRegistered'، 'platform:ready' المستخدمة حالياً).
     * كل وحدة قادمة تحجز Namespace خاصاً بها لأحداثها، ولا تُصدر أحداثاً
     * باسم Namespace تخص وحدة أخرى:
     *
     *   session:*    -> Session Manager (مُستخدم حالياً في agp-session.js)
     *   player:*     -> Player Manager (مُستخدم حالياً في agp-player-manager.js)
     *   lobby:*      -> Lobby Manager (مُستخدم حالياً في agp-lobby.js)
     *   round:*      -> Round Manager (مُستخدم حالياً في agp-round-manager.js)
     *   game:*       -> Game API / Game Engine (مُستخدم حالياً في
     *                    agp-game-api.js و agp-game-engine.js)، وأيضاً
     *                    أحداث مُبلَّغة من لعبة متصلة فعلياً (مثل
     *                    game:roundStarted/roundEnded/reset/wheelSpun/
     *                    winnerSelected من games/roulette/agp-roulette.js)
     *   tiktok:*     -> TikTok Service/Adapter (مرحلة قادمة)
     *   cloudflare:* -> Cloudflare Workers/Durable Objects (مرحلة قادمة)
     *   network:*    -> WebSocket / NetworkService (مرحلة قادمة)
     *   registry:*   -> Game Registry (مُستخدم حالياً في agp-registry.js)
     *   platform:*   -> أحداث عامة للمنصة (مُستخدم حالياً في agp-bootstrap.js)
     *
     * أي وحدة جديدة يجب أن "تشترك" (on/once) في أحداث الوحدات الأخرى
     * بدل استدعاء دوالها مباشرة، وأن "تبث" (emit) أحداثها الخاصة بدل
     * تعديل حالة وحدة أخرى مباشرة من الخارج. هذا يحافظ على استقلالية
     * كل وحدة (Loose Coupling) ويسمح بإضافة/إزالة وحدات دون التأثير على
     * البقية.
     * ---------------------------------------------------------------- */

    AGP.log('AGP Events module ready (on/off/emit/once).');

}(window.AymanGamesPlatform));
