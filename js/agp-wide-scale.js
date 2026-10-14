/**
 * AGP WIDE SCALE — تكبير تلقائي للشاشات العريضة جداً (مثل 2560×1440).
 * الشاشات مصممة بأحجام لها حد أقصى، فعلى الشاشات الأعرض من 1920 كل شي يطلع
 * صغير. نكبّر الصفحة كاملة بنفس النسبة (مثل Ctrl و+): 1 لين 1920، يتدرّج
 * لـ 1.5 عند 2560، وحده الأقصى 2 (4K). يُحمَّل بالـ<head> قبل الرسم.
 *
 * مفعّل حالياً فقط بشاشتي "أسرع إجابة": الإعدادات (index.html) واللوبي
 * (lobby.html) — مو بشاشة اللعب نفسها.
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
        root.style.zoom = z === 1 ? '' : String(z);
        root.style.setProperty('--agp-wide-zoom', String(z));
    }
    apply();
    window.addEventListener('resize', apply);
})();
