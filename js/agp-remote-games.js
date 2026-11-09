/**
 * قائمة الألعاب لـ«التحكم عن بعد» (AGP.remoteGames) — يقراها جوال المتحكم
 * (control.html) يعرض منها شبكة الألعاب، وصفحة الستريمر
 * (js/agp-remote-control.js) تفتح منها رابط اللعبة اللي اختارها المتحكم.
 *
 * ready:true = اللعبة مربوطة بنظام التحكم: صفحاتها تحمّل js/agp-remote-control.js
 * (إعدادات/لوبي القالب بـ templateSettings/templateLobby، روليت الإقصاء بأوامر
 * خاصة، والباقي «أزرار الشاشة» تلقائياً). لعبة بدون ready تطلع بالجوال «قريباً».
 * لعبة جديدة: حمّل الملف بصفحاتها بعد auth-client.js وضيفها هنا بـ ready:true.
 *
 * url نسبي من جذر الموقع.
 */
(function (AGP) {
    'use strict';
    if (!AGP) return;

    AGP.remoteGames = [
        { id: 'elimination-roulette', name: 'روليت الإقصاء', icon: '🎡', url: 'games/elimination-roulette/index.html', ready: true },
        { id: 'tribe-roulette', name: 'روليت مخفي', icon: '🏹', url: 'games/tribe-roulette/index.html', ready: true },
        { id: 'russian-roulette', name: 'الروليت الروسي', icon: '🔫', url: 'games/russian-roulette/index.html', ready: true },
        { id: 'fruit-roulette', name: 'روليت الفواكه', icon: '🍉', url: 'games/fruit-roulette/index.html', ready: true },
        { id: 'musical-chairs', name: 'الكراسي الموسيقية', icon: '🎵', url: 'games/musical-chairs/index.html', ready: true },
        { id: 'bomb', name: 'القنبلة', icon: '💣', url: 'games/bomb/index.html', ready: true },
        { id: 'greed', name: 'الطمع', icon: '🎰', url: 'games/greed/index.html', ready: true },
        { id: 'snakes-ladders', name: 'السلم والثعبان', icon: '🐍', url: 'games/snakes-ladders/index.html', ready: true },
        { id: 'memory-challenge', name: 'تحدي الذاكرة', icon: '🧠', url: 'games/memory-challenge/index.html', ready: true },
        { id: 'luck-color', name: 'حظ و لون', icon: '🎨', url: 'games/luck-color/index.html', ready: true },
        { id: 'survival-ship', name: 'سفينة النجاة', icon: '🚢', url: 'games/survival-ship/index.html', ready: true },
        { id: 'rock-paper-scissors', name: 'حجرة ورقة مقص', icon: '✊', url: 'games/rock-paper-scissors/index.html', ready: true },
        { id: 'team-war', name: 'حرب الفريقين', icon: '⚔️', url: 'games/team-war/index.html', ready: true },
        { id: 'khazna', name: 'الخزنة', icon: '🔐', url: 'games/khazna/index.html', ready: true },
        { id: 'xo', name: 'إكس أو', icon: '❌', url: 'games/xo/index.html', ready: true },
        { id: 'dots', name: 'توصيل النقاط', icon: '🔵', url: 'games/dots/index.html', ready: true },
        { id: 'penalty', name: 'ركلات الترجيح', icon: '⚽', url: 'games/penalty/index.html', ready: true },
        { id: 'fastest-answer', name: 'أسرع إجابة', icon: '⚡', url: 'games/fastest-answer/index.html', ready: true },
        { id: 'letters-cell', name: 'خلية الحروف', icon: '🐝', url: 'games/letters-cell/index.html', ready: true },
        { id: 'word-hive', name: 'كوّن كلمة', icon: '🍯', url: 'games/word-hive/index.html', ready: true },
        { id: 'word-chain', name: 'سلسلة الكلمات', icon: '🔗', url: 'games/word-chain/index.html', ready: true },
        { id: 'word-categories', name: 'اسم وحيوان ونبات', icon: '🔤', url: 'games/word-categories/index.html', ready: true },
        { id: 'vocab', name: 'تحدي المفردات', icon: '📝', url: 'games/vocab/index.html', ready: true },
        { id: 'top-ten', name: 'خمّن العشرة', icon: '🏆', url: 'games/top-ten/index.html', ready: true },
        { id: 'photo-challenge', name: 'تحدي الصور', icon: '🖼️', url: 'games/photo-challenge/index.html', ready: true },
        { id: 'draw', name: 'شخبليطة', icon: '✏️', url: 'games/draw/index.html', ready: true },
        { id: 'codenames', name: 'كود نيمز', icon: '🕵️', url: 'games/codenames/index.html', ready: true },
        { id: 'mafia', name: 'المافيا', icon: '🔪', url: 'games/mafia/index.html', ready: true },
        { id: 'intruder', name: 'محطة سهيل', icon: '🛰️', url: 'games/intruder/index.html', ready: true },
        { id: 'birthday-party', name: 'حفلة الميلاد', icon: '🎂', url: 'games/birthday-party/index.html', ready: true },
        { id: 'impostor', name: 'من الأمبوستر؟', icon: '🎭', url: 'discord-games/impostor/index.html', ready: true }
    ];

    AGP.remoteGames.find = function (id) {
        for (var i = 0; i < AGP.remoteGames.length; i++) if (AGP.remoteGames[i].id === id) return AGP.remoteGames[i];
        return null;
    };

}(window.AymanGamesPlatform));
