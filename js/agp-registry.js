/**
 * ==========================================================================
 *  AGP REGISTRY — سجل الألعاب الداخلي
 * ==========================================================================
 *
 * هذا الملف يجعل المنصة "تعرف" الألعاب الموجودة حالياً في الصفحة، دون أي
 * تغيير في طريقة عرضها أو طريقة فتحها. كل ما يفعله هو قراءة بطاقات الألعاب
 * (.game-card) الموجودة أصلاً في index.html وتسجيل بياناتها في سجل داخلي
 * بسيط داخل المنصة، ليُستخدم مستقبلاً (مثلاً: فلترة، بحث، إحصائيات،
 * أو لوحة تحكم إدارية) دون المساس بالـ HTML/CSS الحالي إطلاقاً.
 *
 * يعتمد هذا الملف على وجود js/agp-core.js قبله.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) {
        AGP.log = function () {};
    }

    /* ----------------------------------------------------------------
     * Game Registry
     * ----------------------------------------------------------------
     * تخزين داخلي بسيط لكل الألعاب المعروفة لدى المنصة.
     * ---------------------------------------------------------------- */
    var _games = {};

    AGP.registry = {
        /**
         * تسجيل لعبة داخل السجل الداخلي للمنصة.
         * لا يغيّر أي شيء في الصفحة، فقط يحفظ البيانات في الذاكرة.
         * @param {Object} game - بيانات اللعبة { id, title, url, coverEl, status }
         */
        registerGame: function (game) {
            if (!game || !game.id) return;
            _games[game.id] = game;
            AGP.log('Game registered:', game.id);
            AGP.events && AGP.events.emit('registry:gameRegistered', game);
        },

        /**
         * جلب بيانات لعبة معيّنة عن طريق المعرّف (id).
         */
        getGame: function (id) {
            return _games[id] || null;
        },

        /**
         * جلب كل الألعاب المسجّلة لدى المنصة كمصفوفة.
         */
        getAllGames: function () {
            return Object.keys(_games).map(function (id) {
                return _games[id];
            });
        }
    };

    /* ----------------------------------------------------------------
     * Auto-Discovery (اكتشاف تلقائي للألعاب الموجودة في الصفحة)
     * ----------------------------------------------------------------
     * يبحث فقط عن عناصر .game-card الموجودة أصلاً في index.html ويقرأ
     * منها البيانات (العنوان، الرابط) دون أي تعديل عليها. إن وُجدت
     * خاصية data-agp-game-id على البطاقة يتم استخدامها كمعرّف، وإلا
     * يتم توليد معرّف تلقائي من ترتيب البطاقة كحل احتياطي (Fallback)
     * حتى لا تتعطل عملية الاكتشاف على أي بطاقة قديمة لم تُحدَّث بعد.
     * ---------------------------------------------------------------- */
    function discoverGamesFromDOM() {
        var cards = document.querySelectorAll('.game-card');

        cards.forEach(function (card, index) {
            var id = card.getAttribute('data-agp-game-id') || ('game-' + (index + 1));
            var status = card.getAttribute('data-agp-game-status') || 'active';

            var titleEl = card.querySelector('.game-title');
            var linkEl = card.querySelector('.btn-play');
            var coverEl = card.querySelector('.game-cover');

            AGP.registry.registerGame({
                id: id,
                title: titleEl ? titleEl.textContent.trim() : null,
                url: linkEl ? linkEl.getAttribute('href') : null,
                coverSrc: coverEl ? coverEl.getAttribute('src') : null,
                status: status,
                // مرجع مباشر للعنصر في الصفحة، يُستخدم مستقبلاً عند الحاجة
                // (مثلاً لإضافة مؤشرات حالة دون تغيير الوظيفة الحالية)
                domElement: card
            });
        });

        AGP.log('Discovered', cards.length, 'game(s) from the page.');
    }

    // نعرّض دالة الاكتشاف كي تُستدعى من ملف الـ Bootstrap عند جاهزية الصفحة
    AGP.registry._discoverGamesFromDOM = discoverGamesFromDOM;

}(window.AymanGamesPlatform));
