/**
 * DASHBOARD LAYOUT — Top Bar + Sidebar (Shell ثابت). قائمة التصنيفات
 * تُقرَأ من NS.mockData.getCategories() (بيانات حقيقية من
 * AGP.gameManager.getRegisteredGames() — الاسم "mockData" للتوافق فقط).
 * الـ Sidebar وحدها تشترك في AGPDashboard.live.subscribe لإعادة الرسم
 * تلقائياً عند أي حدث AGP حقيقي.
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

        // Re-rendering the sidebar loses the active-link highlight, so
        // reapply it immediately from the router's current path.
        if (NS.router && typeof NS.router.getCurrentPath === 'function') {
            highlightActiveRoute(NS.router.getCurrentPath());
        }
    }

    // تظليل رابط Sidebar المطابق للمسار الحالي.
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

    if (NS.live && typeof NS.live.subscribe === 'function') {
        NS.live.subscribe(renderSidebar);
    }

    NS.layout = {
        highlightActiveRoute: highlightActiveRoute
    };

}(window.AGPDashboard));
