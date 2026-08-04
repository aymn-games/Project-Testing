/**
 * ==========================================================================
 *  DASHBOARD LAYOUT — Top Bar + Sidebar (Shell ثابت)
 * ==========================================================================
 *
 * يبني هيكل الـ Shell الثابت مرة واحدة عند تحميل الصفحة: شريط علوي بسيط
 * وقائمة جانبية. قائمة التصنيفات في الـ Sidebar تُقرَأ من
 * AGP.mockData.getCategories() (بيانات حقيقية فعلياً من
 * AGP.gameManager.getRegisteredGames()، راجع dashboard-data.js — الاسم
 * "mockData" للتوافق فقط). أزرار حالة البث/الحساب في الـ Top Bar تبقى
 * عناصر بصرية ثابتة (لا Stream Connector في هذه المرحلة).
 *
 * تحديث حي (جديد): الـ Sidebar وحدها (لا الـ Top Bar) تشترك في نبضة
 * AGP Dashboard Live Updates (`AGPDashboard.live.subscribe`، من
 * dashboard-live.js) لإعادة رسم نفسها تلقائياً عند أي حدث AGP حقيقي
 * (مثل تسجيل لعبة جديدة بتصنيف جديد)، دون أي علاقة بمحتوى الصفحة
 * الحالية (ذلك مسؤولية AGPDashboard.router.refresh() بشكل منفصل تماماً).
 * ==========================================================================
 */

window.AGPDashboard = window.AGPDashboard || {};

(function (NS) {
    'use strict';

    function renderTopBar() {
        var topBarEl = document.getElementById('dashboard-topbar');
        if (!topBarEl) return;

        topBarEl.innerHTML =
            '<div class="topbar-brand">AGP Dashboard</div>' +
            '<div class="topbar-context" id="topbar-context">لوحة التحكم</div>' +
            '<div class="topbar-actions">' +
                '<span class="topbar-stream-status" title="حالة البث (عرض فقط، غير مفعَّل بعد)">⚪ غير متصل</span>' +
                '<span class="topbar-account">👤 الحساب</span>' +
            '</div>';
    }

    function renderSidebar() {
        var sidebarEl = document.getElementById('dashboard-sidebar');
        if (!sidebarEl) return;

        var categories = NS.mockData.getCategories();

        var html = '<nav class="sidebar-nav">';
        html += '<a href="#/dashboard" class="sidebar-link" data-path="/dashboard">🏠 الرئيسية</a>';

        html += '<div class="sidebar-section-title">📁 التصنيفات</div>';
        categories.forEach(function (category) {
            html += '<a href="#/categories/' + category.id + '" class="sidebar-link sidebar-link--category" ' +
                'data-path="/categories/' + category.id + '">' + category.name + '</a>';
        });

        html += '<a href="#/marketplace" class="sidebar-link sidebar-link--disabled" title="قريباً">🛒 المتجر (قريباً)</a>';
        html += '<a href="#/account" class="sidebar-link" data-path="/account">👤 الحساب</a>';
        html += '<a href="#/settings" class="sidebar-link" data-path="/settings">⚙️ الإعدادات</a>';
        html += '</nav>';

        sidebarEl.innerHTML = html;

        // إعادة رسم الـ Sidebar (عبر التحديث الحي أو التحميل الأول) تفقد
        // تظليل الرابط النشط الحالي، لذلك نعيد تطبيقه فوراً هنا بدل
        // الانتظار لتنقّل يدوي لاحق. نقرأ المسار الحالي من الراوتر نفسه
        // (موجود أصلاً)، بدون أي منطق توجيه جديد.
        if (NS.router && typeof NS.router.getCurrentPath === 'function') {
            highlightActiveRoute(NS.router.getCurrentPath());
        }
    }

    /**
     * تظليل رابط Sidebar المطابق للمسار الحالي.
     * @param {string} currentPath
     */
    function highlightActiveRoute(currentPath) {
        var links = document.querySelectorAll('.sidebar-link[data-path]');
        links.forEach(function (link) {
            var linkPath = link.getAttribute('data-path');
            var isActive = currentPath.indexOf(linkPath) === 0;
            link.classList.toggle('sidebar-link--active', isActive);
        });
    }

    function renderShell() {
        renderTopBar();
        renderSidebar();
    }

    window.addEventListener('load', renderShell);

    // تحديث حي: الـ Sidebar تشترك في النظام العام (AGPDashboard.live) بدل
    // الاستماع لـ AGP.events مباشرة، فتُعاد رسمها تلقائياً كلما تغيّرت
    // تصنيفات/ألعاب المنصة الحقيقية (تسجيل لعبة جديدة، إلخ)، دون أي
    // منطق AGP.events جديد هنا — dashboard-live.js هو المصدر الوحيد.
    if (NS.live && typeof NS.live.subscribe === 'function') {
        NS.live.subscribe(renderSidebar);
    }

    NS.layout = {
        highlightActiveRoute: highlightActiveRoute
    };

}(window.AGPDashboard));
