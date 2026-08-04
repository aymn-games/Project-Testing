/**
 * ==========================================================================
 *  DASHBOARD ROUTER — نظام تنقّل بسيط بين الصفحات (Hash-Based Routing)
 * ==========================================================================
 *
 * نظام تنقّل صغير جداً، مبني فوق hash الرابط (#/dashboard, #/games/xyz...)،
 * بدون أي مكتبة خارجية. مسؤول فقط عن: تسجيل المسارات، مطابقة الرابط
 * الحالي، واستدعاء دالة العرض (render) المناسبة داخل حاوية المحتوى.
 *
 * لا علاقة له بـ AGP Platform إطلاقاً في هذه المرحلة.
 * ==========================================================================
 */

window.AGPDashboard = window.AGPDashboard || {};

(function (NS) {
    'use strict';

    var routes = [];

    /**
     * تسجيل مسار جديد.
     * @param {string} pattern - مثل '/games/:gameId' أو '/dashboard'
     * @param {Function} renderFn - تُستدعى بـ (params, contentEl)
     * @param {Object} [options] - { isPublic: boolean } — المسارات العامة
     *   (تسجيل الدخول/إنشاء حساب) لا تُظهر Top Bar/Sidebar.
     */
    function registerRoute(pattern, renderFn, options) {
        var paramNames = [];
        var regexPattern = pattern.replace(/:[a-zA-Z]+/g, function (match) {
            paramNames.push(match.slice(1));
            return '([^/]+)';
        });
        var regex = new RegExp('^' + regexPattern + '$');

        routes.push({
            pattern: pattern,
            regex: regex,
            paramNames: paramNames,
            renderFn: renderFn,
            isPublic: !!(options && options.isPublic)
        });
    }

    function getCurrentPath() {
        var hash = window.location.hash || '';
        // إزالة الـ '#' من البداية، والتأكد من وجود '/' في البداية
        var path = hash.replace(/^#/, '');
        if (path === '') path = '/dashboard';
        if (path.charAt(0) !== '/') path = '/' + path;
        return path;
    }

    function matchRoute(path) {
        for (var i = 0; i < routes.length; i++) {
            var route = routes[i];
            var match = path.match(route.regex);
            if (match) {
                var params = {};
                route.paramNames.forEach(function (name, index) {
                    params[name] = match[index + 1];
                });
                return { route: route, params: params };
            }
        }
        return null;
    }

    function renderCurrentRoute() {
        var path = getCurrentPath();
        var matched = matchRoute(path);
        var contentEl = document.getElementById('dashboard-content');

        if (!matched) {
            // مسار غير معروف: رجوع افتراضي لصفحة Dashboard
            window.location.hash = '#/dashboard';
            return;
        }

        // إظهار/إخفاء الـ Shell (Top Bar + Sidebar) حسب نوع المسار
        document.body.classList.toggle('dashboard-shell--public', matched.route.isPublic);

        if (contentEl) {
            contentEl.innerHTML = '';
            matched.route.renderFn(matched.params, contentEl);
        }

        // تحديث تظليل العنصر النشط في Sidebar (إن كانت الوحدة محمَّلة)
        if (NS.layout && typeof NS.layout.highlightActiveRoute === 'function') {
            NS.layout.highlightActiveRoute(path);
        }
    }

    function navigate(path) {
        window.location.hash = '#' + path;
    }

    window.addEventListener('hashchange', renderCurrentRoute);
    window.addEventListener('load', renderCurrentRoute);

    NS.router = {
        registerRoute: registerRoute,
        navigate: navigate,
        getCurrentPath: getCurrentPath,

        // يعيد رسم المسار الحالي كما هو (نفس renderCurrentRoute الداخلية)،
        // بدون أي تغيير في الـ hash أو منطق المطابقة. أُضيف خصيصاً حتى
        // تستطيع وحدات أخرى (مثل dashboard-live.js) طلب إعادة رسم الصفحة
        // الحالية عند تغيّر بيانات AGP، دون تكرار منطق renderCurrentRoute.
        refresh: renderCurrentRoute
    };

}(window.AGPDashboard));
