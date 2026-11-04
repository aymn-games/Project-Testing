/**
 * «المافيا» — وضع اللعب: تيك توك (البث المباشر، الافتراضي) أو ديسكورد (مشاركة شاشة بروم صوتي).
 * يتحمّل بأول صفحات المذيع (index/lobby/game) قبل حارس الألعاب.
 *
 * - الدخول من مكتبة ألعاب الديسكورد = games/mafia/?mode=discord. الوضع ينحفظ بـsessionStorage
 *   (نفس التبويب) عشان lobby.html وgame.html يعرفونه بدون باراميتر، وأي دخول لصفحة البداية
 *   (index.html) بدون ?mode=discord يرجّعه تيك توك.
 * - وضع ديسكورد: الحارس (auth/game-access-guard.js) يطلب حساب بالموقع بس، بدون ربط تيك توك
 *   (AGP_GUARD_LOGIN_ONLY)، والخروج يرجع لمكتبة الديسكورد، وفيه زر «العب معهم» للمضيف.
 *   اللعبة نفسها (الخادم والقواعد والنقاط وصفحة اللاعبين) نفسها بالوضعين.
 */
(function () {
    'use strict';
    var KEY = 'mafia-mode', q = /[?&]mode=discord\b/.test(location.search);
    var entry = /\/mafia\/(index\.html)?$/.test(location.pathname);
    var mode = 'tiktok';
    try {
        if (q) sessionStorage.setItem(KEY, 'discord');
        else if (entry) sessionStorage.removeItem(KEY);
        if (sessionStorage.getItem(KEY) === 'discord') mode = 'discord';
    } catch (e) { if (q) mode = 'discord'; }
    window.MAFIA_MODE = mode;
    window.MAFIA_HOME = mode === 'discord' ? '../../discord-games.html' : '../../games.html';
    if (mode === 'discord') {
        window.AGP_GUARD_LOGIN_ONLY = true;
        document.documentElement.classList.add('mode-discord');
    }
})();
