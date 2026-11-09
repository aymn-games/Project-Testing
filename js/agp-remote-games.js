/**
 * قائمة الألعاب لـ«التحكم عن بعد» (AGP.remoteGames) — يقراها جوال المتحكم
 * (control.html) يعرض منها شبكة الألعاب، وصفحة الستريمر
 * (js/agp-remote-control.js) تفتح منها رابط اللعبة اللي اختارها المتحكم.
 *
 * ready:true = اللعبة مربوطة بنظام التحكم (صفحاتها تستدعي
 * AGP.remoteControl.attach بأوامرها وإعداداتها). الباقي يطلع بالجوال
 * «قريباً» لين ينربط. لربط لعبة جديدة: اربط صفحاتها ثم غيّر ready هنا.
 *
 * url نسبي من جذر الموقع.
 */
(function (AGP) {
    'use strict';
    if (!AGP) return;

    AGP.remoteGames = [
        { id: 'elimination-roulette', name: 'روليت الإقصاء', icon: '🎡', url: 'games/elimination-roulette/index.html', ready: true },
        { id: 'tribe-roulette', name: 'روليت مخفي', icon: '🏹', url: 'games/tribe-roulette/index.html' },
        { id: 'russian-roulette', name: 'الروليت الروسي', icon: '🔫', url: 'games/russian-roulette/index.html' },
        { id: 'fruit-roulette', name: 'روليت الفواكه', icon: '🍉', url: 'games/fruit-roulette/index.html' },
        { id: 'musical-chairs', name: 'الكراسي الموسيقية', icon: '🎵', url: 'games/musical-chairs/index.html' },
        { id: 'bomb', name: 'القنبلة', icon: '💣', url: 'games/bomb/index.html' },
        { id: 'greed', name: 'الطمع', icon: '🎰', url: 'games/greed/index.html' },
        { id: 'snakes-ladders', name: 'السلم والثعبان', icon: '🐍', url: 'games/snakes-ladders/index.html' },
        { id: 'memory-challenge', name: 'تحدي الذاكرة', icon: '🧠', url: 'games/memory-challenge/index.html' },
        { id: 'luck-color', name: 'حظ و لون', icon: '🎨', url: 'games/luck-color/index.html' },
        { id: 'survival-ship', name: 'سفينة النجاة', icon: '🚢', url: 'games/survival-ship/index.html' },
        { id: 'rock-paper-scissors', name: 'حجرة ورقة مقص', icon: '✊', url: 'games/rock-paper-scissors/index.html' },
        { id: 'team-war', name: 'حرب الفريقين', icon: '⚔️', url: 'games/team-war/index.html' },
        { id: 'khazna', name: 'الخزنة', icon: '🔐', url: 'games/khazna/index.html' },
        { id: 'xo', name: 'إكس أو', icon: '❌', url: 'games/xo/index.html' },
        { id: 'dots', name: 'توصيل النقاط', icon: '🔵', url: 'games/dots/index.html' },
        { id: 'penalty', name: 'ركلات الترجيح', icon: '⚽', url: 'games/penalty/index.html' },
        { id: 'fastest-answer', name: 'أسرع إجابة', icon: '⚡', url: 'games/fastest-answer/index.html' },
        { id: 'letters-cell', name: 'خلية الحروف', icon: '🐝', url: 'games/letters-cell/index.html' },
        { id: 'word-hive', name: 'كوّن كلمة', icon: '🍯', url: 'games/word-hive/index.html' },
        { id: 'word-chain', name: 'سلسلة الكلمات', icon: '🔗', url: 'games/word-chain/index.html' },
        { id: 'word-categories', name: 'اسم وحيوان ونبات', icon: '🔤', url: 'games/word-categories/index.html' },
        { id: 'vocab', name: 'تحدي المفردات', icon: '📝', url: 'games/vocab/index.html' },
        { id: 'top-ten', name: 'خمّن العشرة', icon: '🏆', url: 'games/top-ten/index.html' },
        { id: 'photo-challenge', name: 'تحدي الصور', icon: '🖼️', url: 'games/photo-challenge/index.html' },
        { id: 'draw', name: 'شخبليطة', icon: '✏️', url: 'games/draw/index.html' },
        { id: 'codenames', name: 'كود نيمز', icon: '🕵️', url: 'games/codenames/index.html' },
        { id: 'mafia', name: 'المافيا', icon: '🔪', url: 'games/mafia/index.html' },
        { id: 'intruder', name: 'محطة سهيل', icon: '🛰️', url: 'games/intruder/index.html' },
        { id: 'birthday-party', name: 'حفلة الميلاد', icon: '🎂', url: 'games/birthday-party/index.html' },
        { id: 'impostor', name: 'من الأمبوستر؟', icon: '🎭', url: 'discord-games/impostor/index.html' }
    ];

    AGP.remoteGames.find = function (id) {
        for (var i = 0; i < AGP.remoteGames.length; i++) if (AGP.remoteGames[i].id === id) return AGP.remoteGames[i];
        return null;
    };

}(window.AymanGamesPlatform));
