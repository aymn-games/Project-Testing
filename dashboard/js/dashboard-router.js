/**
 * DASHBOARD ROUTER — نظام تنقّل بسيط فوق hash الرابط
 * (#/dashboard, #/games/xyz...)، بدون أي مكتبة خارجية.
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
            window.location.hash = '#/dashboard';
            return;
        }

        document.body.classList.toggle('dashboard-shell--public', matched.route.isPublic);

        if (contentEl) {
            contentEl.innerHTML = '';
            matched.route.renderFn(matched.params, contentEl);
        }

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

        // Lets other modules (e.g. dashboard-live.js) re-render the
        // current page when AGP data changes, without touching the hash.
        refresh: renderCurrentRoute
    };

}(window.AGPDashboard));
