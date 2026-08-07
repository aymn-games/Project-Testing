/**
 * ==========================================================================
 *  AGP AUTH CLIENT — طبقة عميل مشتركة لصفحات الحسابات (خارج AGP.* تماماً)
 * ==========================================================================
 *
 * يوصّل صفحات login.html / signup.html / admin.html وقسم "Account" في
 * dashboard-core بواجهة backend/http/auth-router.js (راجع
 * docs/BACKEND_ARCHITECTURE.md §10). لا علاقة له بـ window.AymanGamesPlatform
 * (AGP) — تلك namespace خاصة بمنطق المنصة/الألعاب المجمّد، وهذا نظام
 * حسابات/إدارة منفصل تماماً، لذا يُعرَّف تحت اسم مستقل: window.AGPAuth.
 *
 * الجلسة تُخزَّن في localStorage (مفتاح واحد ثابت)، وتُرفَق تلقائياً في
 * كل طلب محمي عبر ترويسة Authorization: Bearer <token>.
 * ==========================================================================
 */

(function (global) {
    'use strict';

    var API_BASE = 'https://project-testing-akds.onrender.com';
    var TOKEN_KEY = 'agp_auth_token';
    var USER_KEY = 'agp_auth_user';

    /* ----------------------------------------------------------------------
     * تخزين محلي — Token + آخر بيانات مستخدم معروفة (للعرض الفوري قبل
     * تأكيد /api/auth/me، لا تُعتمَد كمصدر حقيقة وحيد).
     * ---------------------------------------------------------------------- */

    function getToken() {
        try { return localStorage.getItem(TOKEN_KEY) || null; } catch (err) { return null; }
    }

    function setSession(token, user) {
        try {
            localStorage.setItem(TOKEN_KEY, token);
            localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
        } catch (err) { /* localStorage غير متاح — لا كسر للصفحة */ }
    }

    function clearSession() {
        try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
        } catch (err) { /* لا شيء */ }
    }

    function getCachedUser() {
        try {
            var raw = localStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (err) { return null; }
    }

    /**
     * طلب عام لأي مسار API. يُرفِق Authorization تلقائياً لو كان هناك
     * Token مخزَّن. يرجع دائماً كائن الاستجابة المُحلَّل (JSON)، حتى في
     * حالات الفشل (شكله دائماً {success: boolean, ...}) — الاستثناء
     * الوحيد هو فشل الشبكة نفسه (لا اتصال بالخادم إطلاقاً).
     * @param {string} path - مثل '/api/auth/login'
     * @param {Object} [options] - {method, body}
     * @returns {Promise<Object>}
     */
    function request(path, options) {
        options = options || {};
        var headers = { 'Content-Type': 'application/json' };
        var token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;

        return fetch(API_BASE + path, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                data.__httpStatus = res.status;
                return data;
            });
        });
    }

    /* ----------------------------------------------------------------------
     * دوال Auth — تطابق مسارات http/auth-router.js واحداً لواحد
     * ---------------------------------------------------------------------- */

    function signup(username, email, password, wantsToBeStreamer) {
        return request('/api/auth/signup', {
            method: 'POST',
            body: { username: username, email: email, password: password, wantsToBeStreamer: Boolean(wantsToBeStreamer) }
        });
    }

    function login(email, password) {
        return request('/api/auth/login', { method: 'POST', body: { email: email, password: password } })
            .then(function (result) {
                if (result.success) setSession(result.token, result.user);
                return result;
            });
    }

    function loginWithGoogle(idToken) {
        return request('/api/auth/google', { method: 'POST', body: { idToken: idToken } })
            .then(function (result) {
                if (result.success) setSession(result.token, result.user);
                return result;
            });
    }

    function logout() {
        return request('/api/auth/logout', { method: 'POST' }).then(function (result) {
            clearSession();
            return result;
        }).catch(function () {
            clearSession(); // حتى لو فشل الطلب (لا اتصال)، لا داعي لإبقاء المستخدم "مسجَّل دخول" محلياً
            return { success: true };
        });
    }

    function me() {
        return request('/api/auth/me', { method: 'GET' });
    }

    function linkTikTok(tiktokUsername) {
        return request('/api/auth/tiktok/link', { method: 'POST', body: { tiktokUsername: tiktokUsername } });
    }

    function requestTikTokVerificationCode() {
        return request('/api/auth/tiktok/verification-code', { method: 'POST' });
    }

    function verifyTikTok(tiktokUsername) {
        return request('/api/auth/tiktok/verify', { method: 'POST', body: { tiktokUsername: tiktokUsername } });
    }

    function setCustomId(customId) {
        return request('/api/auth/custom-id', { method: 'POST', body: { customId: customId } });
    }

    function adminListUsers() {
        return request('/api/admin/users', { method: 'GET' });
    }

    function adminSetPermission(userId, permissionKey, value) {
        return request('/api/admin/permissions', {
            method: 'POST',
            body: { userId: userId, permissionKey: permissionKey, value: Boolean(value) }
        });
    }

    /**
     * الأدمن فقط — يعدّل الـID العام (custom_id) لأي مستخدم بمعرفة id
     * حسابه الداخلي (userId)، خلافاً لـ setCustomId أعلاه اللي يقتصر
     * دائماً على حساب الجلسة الحالية نفسها.
     */
    function adminSetCustomId(userId, customId) {
        return request('/api/admin/custom-id', {
            method: 'POST',
            body: { userId: userId, customId: customId }
        });
    }

    /**
     * بروفايل عام لأي مستخدم عبر الـID العام (custom_id) — بدون تسجيل
     * دخول، يصلح للاستدعاء من صفحة profile.html العامة مباشرة.
     * @param {string} customId
     * @returns {Promise<Object>}
     */
    function getPublicProfile(customId) {
        return request('/api/profile?id=' + encodeURIComponent(customId), { method: 'GET' });
    }

    /* ----------------------------------------------------------------------
     * حرّاس صفحات — تُستدعى في أول سطر من أي صفحة محمية
     * ---------------------------------------------------------------------- */

    /**
     * يتأكد أن هناك جلسة صالحة فعلياً (يستدعي /api/auth/me، لا يكتفي
     * بوجود Token محلي). لو غير صالحة يمسح الجلسة ويحوّل لصفحة الدخول.
     * @param {string} [redirectTo] - رابط صفحة الدخول (افتراضي: login.html)
     * @returns {Promise<Object|null>} بيانات المستخدم عند النجاح فقط
     */
    function requireAuth(redirectTo) {
        if (!getToken()) {
            global.location.href = redirectTo || 'login.html';
            return Promise.resolve(null);
        }
        return me().then(function (result) {
            if (!result.success) {
                clearSession();
                global.location.href = redirectTo || 'login.html';
                return null;
            }
            setSession(getToken(), result.user);
            return result.user;
        });
    }

    /**
     * مثل requireAuth، لكن يرفض أيضاً أي مستخدم دوره ليس 'admin'.
     *
     * مستخدم مسجَّل دخول فعلياً لكن دوره ليس admin يُحوَّل لـ
     * `nonAdminRedirectTo` (افتراضياً لوحته الخاصة) بدل `redirectTo`
     * (صفحة الدخول) — لو حوَّلناه لصفحة الدخول، ستكتشف تلك الصفحة نفسها
     * أن جلسته صالحة وتُعيد تحويله لِلوحته تلقائياً على أي حال (راجع
     * login.html)، فتحويله مباشرة أوضح وأقصر.
     * @param {string} [redirectTo] - لغير المسجَّلين دخولهم إطلاقاً
     * @param {string} [nonAdminRedirectTo] - للمسجَّلين دخولهم بدور غير admin
     * @returns {Promise<Object|null>}
     */
    function requireAdmin(redirectTo, nonAdminRedirectTo) {
        return requireAuth(redirectTo).then(function (user) {
            if (user && user.role !== 'admin') {
                global.location.href = nonAdminRedirectTo || 'dashboard-core/index.html';
                return null;
            }
            return user;
        });
    }

    global.AGPAuth = {
        API_BASE: API_BASE,
        getToken: getToken,
        getCachedUser: getCachedUser,
        clearSession: clearSession,
        signup: signup,
        login: login,
        loginWithGoogle: loginWithGoogle,
        logout: logout,
        me: me,
        linkTikTok: linkTikTok,
        requestTikTokVerificationCode: requestTikTokVerificationCode,
        verifyTikTok: verifyTikTok,
        setCustomId: setCustomId,
        adminListUsers: adminListUsers,
        adminSetPermission: adminSetPermission,
        adminSetCustomId: adminSetCustomId,
        getPublicProfile: getPublicProfile,
        requireAuth: requireAuth,
        requireAdmin: requireAdmin
    };

}(window));
