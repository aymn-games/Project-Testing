/**
 * AGP DC RAW GUARD — يمنع أخطاء الكونسول من القالب الخام لشاشات الألعاب.
 *
 * شاشات الألعاب (index/lobby/game.html) قالب داخل عنصر x-dc يرسمه
 * support.js. قبل ما يرسمه، المتصفح يقرأ القالب كـ HTML عادي، فالصور اللي
 * فيها onLoad / onError بقيم القالب {{ ... }} (مثل لوقو المنصة
 * onLoad="{{ logoOk }}") تشغّل نص القالب كـ JS وتطلع أخطاء مثل
 * "logoOk is not defined".
 *
 * الحل: أول ما تنقرأ صورة داخل القالب الخام نلغي معالجاتها
 * (img.onload / img.onerror = null). السمة نفسها تبقى بالقالب فـ support.js
 * يقرأه بدون تغيير، وبعد الرسم يُستبدل x-dc بـ #dc-root فالصور الحقيقية
 * ما تتأثر.
 *
 * يُحمَّل بالـ<head> قبل الـ<body> (عشان يلحق الصور وقت قراءتها).
 * تنبيه: لا تكتب وسم x-dc كنص (بين علامتي < >) داخل صفحة اللعبة خارج القالب —
 * support.js يدوّر على أول وسم بنص الصفحة ويعتبره بداية القالب.
 */
(function () {
    'use strict';
    if (typeof MutationObserver === 'undefined') return;

    function clear(node) {
        if (!node || node.nodeType !== 1) return;
        var imgs = node.tagName === 'IMG' ? [node] : node.getElementsByTagName('img');
        for (var i = 0; i < imgs.length; i++) {
            if (imgs[i].closest && imgs[i].closest('x-dc')) {
                imgs[i].onload = null;
                imgs[i].onerror = null;
            }
        }
    }

    var observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
            var added = records[i].addedNodes;
            for (var j = 0; j < added.length; j++) clear(added[j]);
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener('DOMContentLoaded', function () {
        clear(document.querySelector('x-dc'));
        observer.disconnect();
    });
}());
