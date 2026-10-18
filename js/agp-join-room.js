/**
 * زر «دخول غرفة» بهيدر الرئيسية (index.html) ومكتبة الألعاب (games.html).
 *
 * اللاعب يضغط الزر، يكتب رقم الغرفة (4 أرقام) الظاهر على شاشة البث،
 * وينتقل مباشرة لصفحة دخول اللاعبين — بدون حساب بالموقع.
 * حالياً الغرف للعبة «محطة سهيل» (games/intruder/join.html).
 *
 * القالب يعيد بناء الهيدر وقائمة الجوال على راحته، فنستنسخ زر «الإطارات»
 * الموجود (نفس شكله بالهيدر وبقائمة الجوال) ونعيد إضافته كل ما انبنى من
 * جديد عبر MutationObserver — نفس أسلوب زر الحساب في auth-client.js.
 */
(function () {
    'use strict';

    var LABEL = 'دخول غرفة';
    var JOIN_URL = 'games/intruder/join.html?room=';

    function setLabel(a, text) {
        // نغيّر النص فقط ونخلي أي أيقونة داخل الرابط (قائمة الجوال فيها سهم)
        var walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, null);
        var node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue.trim()) { node.nodeValue = text; return; }
        }
        a.textContent = text;
    }

    function cloneAsJoin(src) {
        var a = src.cloneNode(true);
        setLabel(a, LABEL);
        a.setAttribute('href', '#join-room');
        a.removeAttribute('target');
        a.removeAttribute('data-frames-link');
        a.removeAttribute('data-patched');
        a.setAttribute('data-join-room', '1');
        a.style.whiteSpace = 'nowrap';
        return a;
    }

    function findLink(scope, text) {
        return Array.prototype.slice.call(scope.querySelectorAll('a'))
            .find(function (a) { return a.textContent.trim() === text; }) || null;
    }

    function ensureButtons() {
        // الهيدر (كمبيوتر): قبل زر «دعم المنصة»
        var nav = document.querySelector('header nav');
        if (nav && !nav.querySelector('[data-join-room]')) {
            var support = findLink(nav, 'دعم المنصة');
            if (support) support.parentNode.insertBefore(cloneAsJoin(support), support);
        }
        // زر زيادة بالهيدر: المسافة بين عناصره تصغر تدريجياً مع عرض الشاشة
        // (35px كما هي على الشاشات الواسعة). ستايل مستقل لأن القالب يعيد كتابة
        // style العنصر نفسه كل ما أعاد رسم الهيدر.
        if (!document.getElementById('agp-join-room-css') && document.head) {
            var css = document.createElement('style');
            css.id = 'agp-join-room-css';
            css.textContent = 'header nav{gap:clamp(10px,calc(3.2vw - 18px),35px)!important}';
            document.head.appendChild(css);
        }
        // قائمة الجوال: بعد «الإطارات»
        var panel = document.querySelector('[data-mobile-panel]');
        if (panel && !panel.querySelector('[data-join-room]')) {
            var frames = findLink(panel, 'الإطارات');
            if (frames) frames.parentNode.insertBefore(cloneAsJoin(frames), frames.nextSibling);
        }
    }

    function normDigits(s) {
        return String(s || '')
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .replace(/\D/g, '').slice(0, 4);
    }

    function closeModal() {
        var m = document.getElementById('agp-join-room-modal');
        if (m) m.remove();
    }

    function openModal() {
        closeModal();
        var m = document.createElement('div');
        m.id = 'agp-join-room-modal';
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        m.setAttribute('aria-label', LABEL);
        m.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,5,8,.72);direction:rtl;';
        m.innerHTML =
            '<form style="width:100%;max-width:360px;padding:24px 22px;border-radius:20px;border:1px solid rgba(178,140,245,.35);background:linear-gradient(180deg,#1a1526,#0d0b14);text-align:center;font-family:\'IBM Plex Sans Arabic\',system-ui,sans-serif;box-sizing:border-box;">' +
              '<div style="font-size:30px;line-height:1;">🛰️</div>' +
              '<h2 style="margin:12px 0 6px;font-size:20px;font-weight:700;color:#f3ecff;">' + LABEL + '</h2>' +
              '<p style="margin:0 0 16px;font-size:14px;line-height:1.8;color:#cfc7e2;">اكتب رقم الغرفة الظاهر على شاشة البث</p>' +
              '<input data-join-code inputmode="numeric" autocomplete="off" maxlength="4" placeholder="0000" dir="ltr" aria-label="رقم الغرفة" ' +
                'style="width:100%;box-sizing:border-box;height:64px;border-radius:16px;border:1.5px solid rgba(178,140,245,.4);background:rgba(0,0,0,.35);color:#fff;font:700 34px/1 system-ui,sans-serif;letter-spacing:12px;text-align:center;outline:none;">' +
              '<p data-join-err role="alert" style="min-height:22px;margin:8px 0 6px;font-size:13.5px;color:#fca5a5;"></p>' +
              '<button type="submit" style="width:100%;padding:13px;border:none;border-radius:12px;background:linear-gradient(90deg,#7a3fd4,#b28cf5);color:#fff;font-family:inherit;font-weight:600;font-size:15px;cursor:pointer;">دخول</button>' +
              '<button type="button" data-join-close style="margin-top:10px;width:100%;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:transparent;color:#cfc7e2;font-family:inherit;font-size:13.5px;cursor:pointer;">إغلاق</button>' +
            '</form>';
        var input = m.querySelector('[data-join-code]');
        var err = m.querySelector('[data-join-err]');
        input.addEventListener('input', function () { input.value = normDigits(input.value); err.textContent = ''; });
        m.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            var code = normDigits(input.value);
            if (code.length !== 4) { err.textContent = 'رقم الغرفة 4 أرقام'; input.focus(); return; }
            window.location.href = JOIN_URL + code;
        });
        m.querySelector('[data-join-close]').addEventListener('click', closeModal);
        m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
        document.body.appendChild(m);
        setTimeout(function () { input.focus(); }, 30);
    }

    document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('[data-join-room]') : null;
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        openModal();
    }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

    var scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        (window.requestAnimationFrame || setTimeout)(function () { scheduled = false; ensureButtons(); });
    }
    // نراقب document نفسه: الصفحات المجمّعة تستبدل documentElement كامل لما تنفك
    new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
    schedule();
})();
