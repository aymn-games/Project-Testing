/**
 * ==========================================================================
 *  AGP DASHBOARD AUTH — بوابة دخول للوحة الستريمر + قسم "Account"
 * ==========================================================================
 *
 * ملف جديد، منفصل تماماً عن dashboard-core.js (لم يُلمَس إطلاقاً) ومن
 * AGP.* (لا علاقة له بـ window.AymanGamesPlatform — يستخدم فقط
 * window.AGPAuth من auth/auth-client.js). مسؤوليتان فقط:
 *
 *   1) بوابة دخول: يتحقق من جلسة صالحة فعلياً (AGPAuth.requireAuth)
 *      فور تحميل الصفحة، ويحوّل لصفحة الدخول لو غير صالحة — قبل أن
 *      يُتاح لأي كود AGP.* آخر (dashboard-core.js أو أي agp-*.js) رؤية
 *      أي بيانات. راجع auth/auth.css (.auth-checking) لمنع "ومضة"
 *      ظهور اللوحة قبل التحويل.
 *   2) قسم "Account" داخل تبويب Stream & Room الموجود فعلاً: عرض اسم
 *      المستخدم/الدور في الشريط العلوي + زر Logout، وربط عناصر ربط/
 *      تحقق تيك توك + Custom ID (كلها مُضافة في index.html بجانب حقل
 *      TikTok username الحالي، دون لمسه).
 * ==========================================================================
 */

'use strict';

(function () {

    /**
     * يُنفَّذ فوراً (لا ينتظر DOMContentLoaded) — أول شيء يحدث في الصفحة
     * فعلياً، حتى يكون التحويل لصفحة الدخول (لو لزم) أسرع ما يمكن.
     */
    window.AGPAuth.requireAuth('../login.html').then(function (user) {
        if (!user) return; // تحويل قيد التنفيذ فعلاً داخل requireAuth

        document.body.classList.remove('auth-checking');

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { wireDashboard(user); });
        } else {
            wireDashboard(user);
        }
    });

    /**
     * كل ما يحتاج DOM جاهزاً: عرض بيانات الحساب في الشريط العلوي، وربط
     * أزرار قسم Account. يُستدعى مرة واحدة فقط بعد تأكيد جلسة صالحة.
     * @param {Object} user
     */
    function wireDashboard(user) {
        renderAccountBar(user);
        wireLogout();
        wireAccountPanel(user);
    }

    function renderAccountBar(user) {
        var nameEl = document.getElementById('account-username');
        var roleEl = document.getElementById('account-role');
        var adminLink = document.getElementById('account-admin-link');

        if (nameEl) nameEl.textContent = user.username;
        if (roleEl) roleEl.textContent = user.role;
        if (adminLink) adminLink.style.display = (user.role === 'admin') ? '' : 'none';
    }

    function wireLogout() {
        var btn = document.getElementById('btn-account-logout');
        if (!btn) return;
        btn.addEventListener('click', function () {
            window.AGPAuth.logout().then(function () {
                window.location.href = '../login.html';
            });
        });
    }

    /**
     * قسم Account: ربط تيك توك (بايو)، وCustom ID. أخطاء الشبكة/الخادم
     * تُعرَض كنص حالة بسيط بجانب كل زر (نفس فلسفة `.empty-note` في
     * dashboard-core.js) — لا نافذة Toast جديدة، تفادياً لأي اعتماد على
     * داخليات dashboard-core.js.
     */
    function wireAccountPanel(user) {
        var tiktokUsernameInput = document.getElementById('account-tiktok-username');
        var tiktokStatusEl = document.getElementById('account-tiktok-status');
        var codeDisplayEl = document.getElementById('account-tiktok-code');
        var customIdInput = document.getElementById('account-custom-id');
        var customIdStatusEl = document.getElementById('account-custom-id-status');

        if (user.tiktok_username && tiktokUsernameInput) {
            tiktokUsernameInput.value = user.tiktok_username;
        }

        function setStatus(el, text, isError) {
            if (!el) return;
            el.textContent = text;
            el.style.color = isError ? 'var(--danger)' : 'var(--success)';
        }

        var linkBtn = document.getElementById('btn-account-tiktok-link');
        if (linkBtn) {
            linkBtn.addEventListener('click', function () {
                var username = (tiktokUsernameInput.value || '').trim();
                if (!username) { setStatus(tiktokStatusEl, 'اكتب يوزرنيم تيك توك أولاً.', true); return; }
                window.AGPAuth.linkTikTok(username).then(function (result) {
                    setStatus(tiktokStatusEl, result.success ? 'تم الربط.' : 'تعذّر الربط.', !result.success);
                });
            });
        }

        var codeBtn = document.getElementById('btn-account-tiktok-code');
        if (codeBtn) {
            codeBtn.addEventListener('click', function () {
                window.AGPAuth.requestTikTokVerificationCode().then(function (result) {
                    if (result.success && codeDisplayEl) {
                        codeDisplayEl.textContent = result.code;
                        setStatus(tiktokStatusEl, 'أضف الكود لبايو حسابك بتيك توك، ثم اضغط "تحقق".', false);
                    } else {
                        setStatus(tiktokStatusEl, 'تعذّر توليد كود التحقق.', true);
                    }
                });
            });
        }

        var verifyBtn = document.getElementById('btn-account-tiktok-verify');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', function () {
                var username = (tiktokUsernameInput.value || '').trim();
                if (!username) { setStatus(tiktokStatusEl, 'اكتب يوزرنيم تيك توك أولاً.', true); return; }
                setStatus(tiktokStatusEl, 'جارٍ التحقق…', false);
                window.AGPAuth.verifyTikTok(username).then(function (result) {
                    setStatus(tiktokStatusEl, result.success ? 'تم التحقق من ملكية الحساب ✅' : ('تعذّر التحقق: ' + (result.error || 'unknown')), !result.success);
                });
            });
        }

        var customIdBtn = document.getElementById('btn-account-custom-id');
        if (customIdBtn) {
            customIdBtn.addEventListener('click', function () {
                var customId = (customIdInput.value || '').trim();
                window.AGPAuth.setCustomId(customId).then(function (result) {
                    setStatus(customIdStatusEl, result.success ? 'تم الحفظ.' : ('تعذّر الحفظ: ' + (result.error || 'unknown')), !result.success);
                });
            });
        }
    }

}());
