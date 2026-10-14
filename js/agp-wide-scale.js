/**
 * AGP WIDE SCALE — تكبير تلقائي للشاشات العريضة جداً (مثل 2560×1440).
 * الشاشات مصممة بأحجام لها حد أقصى، فعلى الشاشات الأعرض من 1920 كل شي يطلع
 * صغير. نكبّر الصفحة كاملة بنفس النسبة (مثل Ctrl و+): 1 لين 1920، يتدرّج
 * لـ 1.5 عند 2560، وحده الأقصى 2 (4K). يُحمَّل بالـ<head> قبل الرسم.
 *
 * مفعّل فقط بشاشتي الإعدادات (index.html) واللوبي (lobby.html) للألعاب
 * ذات الصفحات المنفصلة — مو بشاشة اللعب نفسها (game.html). data-min-height
 * لكل صفحة مقاس فعلياً (أقل ارتفاع بدون تمرير إضافي على عرض 1920).
 * ألعاب الصفحة الواحدة تستخدم data-mode="shell" (تكبير نافذة الإعدادات/اللوبي فقط).
 * الألعاب اللي تكبّر نفسها أصلاً (scale:Math.min(innerWidth/...)) ما تحتاجه.
 */
(function () {
    'use strict';
    var root = document.documentElement;
    // شاشات اللعبة ثابتة بملء الشاشة (ما تنزل بالتمرير)، فالتكبير لازم ما يخلي
    // المحتوى أطول من الشاشة: data-min-height = أقل ارتفاع يحتاجه التصميم بدون تكبير.
    var script = document.currentScript;
    var minHeight = Number(script && script.getAttribute('data-min-height')) || 0;
    function apply() {
        var w = window.innerWidth || 0; // عرض النافذة الحقيقي (ما يتأثر بـ zoom حق CSS)
        var z = w <= 1920 ? 1 : Math.min(2, 1 + (w - 1920) / 1280);
        if (minHeight) z = Math.min(z, Math.max(1, (window.innerHeight || 0) / minHeight));
        z = Math.round(z * 100) / 100;
        root.style.setProperty('--agp-wide-zoom', String(z));
        if (shellMode) { applyShell(z); return; }
        root.style.zoom = z === 1 ? '' : String(z);
    }

    // data-mode="shell": ألعاب الصفحة الواحدة (js/agp-game-shell.js) — الإعدادات
    // واللوبي نافذة (#agp-shell-box) فوق اللعبة نفسها، فنكبّر النافذة بس وتبقى
    // اللعبة على حالها. حدود vw/vh حقت النافذة تنقسم على التكبير عشان ما تطلع
    // أكبر من الشاشة. (html ...) = أولوية أعلى من أنماط الشل اللي تنضاف بعدين.
    var shellMode = !!(script && script.getAttribute('data-mode') === 'shell');
    var shellStyle = null;
    function applyShell(z) {
        if (!shellStyle) { shellStyle = document.createElement('style'); shellStyle.id = 'agp-wide-scale-shell'; document.head.appendChild(shellStyle); }
        shellStyle.textContent = z === 1 ? '' :
            'html #agp-shell-box{zoom:' + z + ';max-width:calc(96vw / ' + z + ');max-height:min(800px, calc(92vh / ' + z + '));}' +
            'html #agp-shell-box.agp-lobby-box{max-height:calc(90vh / ' + z + ');}';
    }
    apply();
    window.addEventListener('resize', apply);
})();
