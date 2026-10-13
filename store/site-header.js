/**
 * هيدر المنصة داخل صفحات المتجر: فتح/إغلاق قائمة الجوال (☰) + مزامنة زر
 * الحساب (تسجيل الدخول ↔ حسابي) عبر auth/auth-client.js.
 */
(function () {
'use strict';
var burger = document.querySelector('.site-burger');
var panel = document.getElementById('site-mobile-panel');
if (burger && panel) {
    burger.addEventListener('click', function () {
        var open = panel.hidden;
        panel.hidden = !open;
        burger.classList.toggle('open', open);
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    panel.addEventListener('click', function (e) {
        if (e.target.closest('a')) { panel.hidden = true; burger.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
    });
}
if (window.AGPAuth && typeof window.AGPAuth.keepHeaderAccountLinkSynced === 'function') window.AGPAuth.keepHeaderAccountLinkSynced();
})();
