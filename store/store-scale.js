/**
 * تكبير تلقائي للشاشات العريضة جداً (مثل 2560×1440): التصميم مضبوط لين
 * ~1600 بكسل، فعلى الشاشات الأعرض كل شي يطلع صغير. نكبّر الصفحة كاملة بنفس
 * النسبة (مثل Ctrl و+): 1 لين 1920، يتدرّج لـ 1.5 عند 2560، وحده الأقصى 2.
 * يُحمَّل بالـ<head> قبل الرسم عشان ما يصير وميض.
 */
(function () {
    'use strict';
    var root = document.documentElement;
    function apply() {
        // innerWidth = عرض النافذة الحقيقي (ما يتأثر بـ zoom حق CSS)
        var w = window.innerWidth || 0;
        var z = w <= 1920 ? 1 : Math.min(2, 1 + (w - 1920) / 1280);
        z = Math.round(z * 100) / 100;
        root.style.zoom = z === 1 ? '' : String(z);
        root.style.setProperty('--st-zoom', String(z));
    }
    apply();
    window.addEventListener('resize', apply);
})();
