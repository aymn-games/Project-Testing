/**
 * زر «دخول غرفة» بهيدر الرئيسية (index.html) ومكتبة الألعاب (games.html)
 * ومكتبة ألعاب الدسكورد (discord-games.html — الزر مكتوب بهيدرها مباشرة).
 *
 * اللاعب يضغط الزر، يكتب رقم الغرفة (4 أرقام)، ونسأل الباك اند
 * (/api/rooms/lookup ← backend/rooms/room-lookup-service.js) أي لعبة فيها
 * روم بهذا الرقم، وننقله لصفحة دخولها — بدون حساب بالموقع. «من الأمبوستر؟»
 * غرفها بـ Firebase مو بالباك اند، فنسألها من المتصفح مباشرة (lookupImpostor)
 * بنفس الوقت وندمج النتيجتين. لو الرقم موجود
 * بأكثر من لعبة يختار اللاعب. لو الباك اند ما رد نرجع للسلوك القديم
 * («محطة سهيل») عشان الزر ما يتعطل.
 *
 * بالرئيسية (index.html) فيه كمان خانة «عندك رقم غرفة؟» ظاهرة بقسم البداية
 * (ensureHomeField) — نفس البحث ونفس النتيجة بدون فتح نافذة.
 *
 * كل لعبة لها نطاق أرقام خاص (backend/rooms/room-code-ranges.js) فالرقم
 * يطلع بلعبة وحدة؛ اختيار اللعبة يظهر بس لغرف قديمة قبل النطاقات.
 *
 * القالب يعيد بناء الهيدر وقائمة الجوال على راحته، فنستنسخ زر «الإطارات»
 * الموجود (نفس شكله بالهيدر وبقائمة الجوال) ونعيد إضافته كل ما انبنى من
 * جديد عبر MutationObserver — نفس أسلوب زر الحساب في auth-client.js.
 */
(function () {
    'use strict';

    var LABEL = 'دخول غرفة';
    // المفاتيح تطابق CHECKS بـ backend/rooms/room-lookup-service.js
    var GAMES = {
        intruder: { name: 'محطة سهيل', url: 'games/intruder/join.html?room=' },
        party: { name: 'حفلة الميلاد', url: 'games/birthday-party/join.html?code=' },
        billiards: { name: 'بلياردو ٨', url: 'https://billiards.aymngames.online/?room=' },
        impostor: { name: 'من الأمبوستر؟', url: 'discord-games/impostor/?room=' }
    };
    // نفس databaseURL بـ discord-games/impostor/script.js
    var IMPOSTOR_DB = 'https://who-is-the-impostor-816c8-default-rtdb.firebaseio.com';
    var FALLBACK_GAME = 'intruder';

    function apiBase() {
        return (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com';
    }

    function goTo(game, code) {
        window.location.href = GAMES[game].url + code;
    }

    /** يرجع Promise بمصفوفة مفاتيح الألعاب، أو null لو الباك اند ما رد. */
    function lookupRoom(code) {
        return fetch(apiBase() + '/api/rooms/lookup?code=' + code)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                return d && d.success && Array.isArray(d.games)
                    ? d.games.filter(function (g) { return GAMES[g]; })
                    : null;
            })
            .catch(function () { return null; });
    }

    /** يرجع Promise بـ true لو فيه غرفة أمبوستر شغّالة (لاعب متصل) بهذا الرقم.
     *  الغرف ما تنحذف بعد انتهائها، فوجود الرقم وحده ما يكفي — نفس isRoomActive باللعبة. */
    function lookupImpostor(code) {
        return fetch(IMPOSTOR_DB + '/rooms/' + code + '/players.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (players) {
                return !!players && Object.keys(players).some(function (id) {
                    return players[id] && players[id].connected === true;
                });
            })
            .catch(function () { return false; });
    }

    /** يبحث عن الرقم بكل الألعاب ويرجع Promise بـ {go:game} أو {choose:[games]} أو {none:true}. */
    function findRoom(code) {
        return Promise.all([lookupRoom(code), lookupImpostor(code)]).then(function (res) {
            var games = res[0];
            if (res[1]) games = (games || []).concat('impostor');
            if (games === null) return { go: FALLBACK_GAME };
            if (games.length === 1) return { go: games[0] };
            if (games.length > 1) return { choose: games };
            return { none: true };
        });
    }

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
              '<p style="margin:0 0 16px;font-size:14px;line-height:1.8;color:#cfc7e2;">اكتب رقم الغرفة</p>' +
              '<input data-join-code inputmode="numeric" autocomplete="off" maxlength="4" placeholder="0000" dir="ltr" aria-label="رقم الغرفة" ' +
                'style="width:100%;box-sizing:border-box;height:64px;border-radius:16px;border:1.5px solid rgba(178,140,245,.4);background:rgba(0,0,0,.35);color:#fff;font:700 34px/1 system-ui,sans-serif;letter-spacing:12px;text-align:center;outline:none;">' +
              '<p data-join-err role="alert" style="min-height:22px;margin:8px 0 6px;font-size:13.5px;color:#fca5a5;"></p>' +
              '<div data-join-choices style="display:none;flex-direction:column;gap:8px;margin-bottom:10px;"></div>' +
              '<button type="submit" style="width:100%;padding:13px;border:none;border-radius:12px;background:linear-gradient(90deg,#7a3fd4,#b28cf5);color:#fff;font-family:inherit;font-weight:600;font-size:15px;cursor:pointer;">دخول</button>' +
              '<button type="button" data-join-close style="margin-top:10px;width:100%;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:transparent;color:#cfc7e2;font-family:inherit;font-size:13.5px;cursor:pointer;">إغلاق</button>' +
            '</form>';
        var input = m.querySelector('[data-join-code]');
        var err = m.querySelector('[data-join-err]');
        var choices = m.querySelector('[data-join-choices]');
        var submit = m.querySelector('button[type="submit"]');
        var busy = false;
        function hideChoices() { choices.style.display = 'none'; choices.innerHTML = ''; }
        function showChoices(games, code) {
            err.textContent = 'الرقم موجود بأكثر من لعبة، اختر لعبتك';
            choices.innerHTML = '';
            games.forEach(function (g) {
                var b = document.createElement('button');
                b.type = 'button';
                b.textContent = GAMES[g].name;
                b.style.cssText = 'width:100%;padding:12px;border-radius:12px;border:1px solid rgba(178,140,245,.45);background:rgba(178,140,245,.12);color:#f3ecff;font-family:inherit;font-weight:600;font-size:15px;cursor:pointer;';
                b.addEventListener('click', function () { goTo(g, code); });
                choices.appendChild(b);
            });
            choices.style.display = 'flex';
        }
        input.addEventListener('input', function () { input.value = normDigits(input.value); err.textContent = ''; hideChoices(); });
        m.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            if (busy) return;
            var code = normDigits(input.value);
            hideChoices();
            if (code.length !== 4) { err.textContent = 'رقم الغرفة 4 أرقام'; input.focus(); return; }
            busy = true;
            submit.disabled = true;
            submit.textContent = 'جاري البحث…';
            err.textContent = '';
            findRoom(code).then(function (r) {
                busy = false;
                submit.disabled = false;
                submit.textContent = 'دخول';
                if (r.go) { goTo(r.go, code); return; }
                if (r.choose) { showChoices(r.choose, code); return; }
                err.textContent = 'الغرفة غير موجودة، تأكد من الرقم';
                input.focus();
            });
        });
        m.querySelector('[data-join-close]').addEventListener('click', closeModal);
        m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
        document.body.appendChild(m);
        setTimeout(function () { input.focus(); }, 30);
    }

    function isHome() {
        return /(^\/$|\/index\.html$)/.test(window.location.pathname);
    }

    /** خانة «عندك رقم غرفة؟» بقسم البداية بالرئيسية، تحت سطر «صنعت بالسعودية». */
    function ensureHomeField() {
        if (!isHome() || document.getElementById('agp-home-join')) return;
        var anchor = Array.prototype.slice.call(document.querySelectorAll('section p, section div, section span'))
            .find(function (el) { return el.children.length === 0 && el.textContent.trim() === 'صنعت بالسعودية وبايدي سعودية'; });
        if (!anchor) return;
        if (!document.getElementById('agp-home-join-css')) {
            var css = document.createElement('style');
            css.id = 'agp-home-join-css';
            css.textContent =
                '#agp-home-join{position:relative;z-index:2;direction:rtl;margin:26px auto 0;width:100%;max-width:440px;padding:0 16px;box-sizing:border-box;font-family:\'IBM Plex Sans Arabic\',system-ui,sans-serif;text-align:center}' +
                '#agp-home-join .hj-title{margin:0 0 10px;font-size:15px;font-weight:600;color:#e6dcff}' +
                '#agp-home-join .hj-row{display:flex;gap:8px;padding:6px;border-radius:999px;border:1px solid rgba(178,140,245,.4);background:rgba(20,14,34,.72);box-shadow:0 10px 30px rgba(122,63,212,.18)}' +
                '#agp-home-join input{flex:1;min-width:0;height:48px;border:none;border-radius:999px;background:rgba(0,0,0,.35);color:#fff;font:700 24px/1 system-ui,sans-serif;letter-spacing:10px;text-align:center;outline:none}' +
                '#agp-home-join input:focus-visible{box-shadow:0 0 0 2px #b28cf5}' +
                '#agp-home-join button{flex:none;height:48px;padding:0 26px;border:none;border-radius:999px;background:linear-gradient(90deg,#7a3fd4,#b28cf5);color:#fff;font-family:inherit;font-weight:700;font-size:16px;cursor:pointer}' +
                '#agp-home-join button:disabled{opacity:.7;cursor:default}' +
                '#agp-home-join .hj-err{min-height:20px;margin:8px 0 0;font-size:13.5px;color:#fca5a5}' +
                '#agp-home-join .hj-choices{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:6px}' +
                '#agp-home-join .hj-choices button{height:40px;padding:0 18px;background:rgba(178,140,245,.14);border:1px solid rgba(178,140,245,.45);color:#f3ecff}';
            document.head.appendChild(css);
        }
        var f = document.createElement('form');
        f.id = 'agp-home-join';
        f.setAttribute('aria-label', LABEL);
        f.innerHTML =
            '<p class="hj-title">عندك رقم غرفة؟ ادخل اللعبة مباشرة</p>' +
            '<div class="hj-row">' +
              '<input inputmode="numeric" autocomplete="off" maxlength="4" placeholder="0000" dir="ltr" aria-label="رقم الغرفة">' +
              '<button type="submit">دخول</button>' +
            '</div>' +
            '<p class="hj-err" role="alert"></p>' +
            '<div class="hj-choices" hidden></div>';
        anchor.parentNode.insertBefore(f, anchor.nextSibling);
    }

    // أحداث خانة الرئيسية على document نفسه: القالب ممكن ينسخ عناصر الصفحة
    // بدون مستمعيها لما يعيد رسمها، فالمستمع على العنصر نفسه يضيع.
    function homeParts(f) {
        return {
            input: f.querySelector('input'),
            submit: f.querySelector('button[type="submit"]'),
            err: f.querySelector('.hj-err'),
            choices: f.querySelector('.hj-choices')
        };
    }
    function hideHomeChoices(h) { h.choices.hidden = true; h.choices.innerHTML = ''; }
    document.addEventListener('input', function (e) {
        var f = e.target && e.target.closest ? e.target.closest('#agp-home-join') : null;
        if (!f) return;
        var h = homeParts(f);
        h.input.value = normDigits(h.input.value);
        h.err.textContent = '';
        hideHomeChoices(h);
    }, true);
    document.addEventListener('submit', function (e) {
        var f = e.target;
        if (!f || f.id !== 'agp-home-join') return;
        e.preventDefault();
        e.stopPropagation();
        if (f.getAttribute('data-busy')) return;
        var h = homeParts(f);
        var code = normDigits(h.input.value);
        hideHomeChoices(h);
        if (code.length !== 4) { h.err.textContent = 'رقم الغرفة 4 أرقام'; h.input.focus(); return; }
        f.setAttribute('data-busy', '1');
        h.submit.disabled = true;
        h.submit.textContent = 'جاري البحث…';
        h.err.textContent = '';
        findRoom(code).then(function (r) {
            f.removeAttribute('data-busy');
            h.submit.disabled = false;
            h.submit.textContent = 'دخول';
            if (r.go) { goTo(r.go, code); return; }
            if (r.choose) {
                h.err.textContent = 'الرقم موجود بأكثر من لعبة، اختر لعبتك';
                r.choose.forEach(function (g) {
                    var b = document.createElement('button');
                    b.type = 'button';
                    b.textContent = GAMES[g].name;
                    b.setAttribute('data-join-go', g);
                    b.setAttribute('data-join-room-code', code);
                    h.choices.appendChild(b);
                });
                h.choices.hidden = false;
                return;
            }
            h.err.textContent = 'الغرفة غير موجودة، تأكد من الرقم';
            h.input.focus();
        });
    }, true);

    document.addEventListener('click', function (e) {
        var go = e.target && e.target.closest ? e.target.closest('#agp-home-join [data-join-go]') : null;
        if (go) { e.preventDefault(); goTo(go.getAttribute('data-join-go'), go.getAttribute('data-join-room-code')); return; }
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
        (window.requestAnimationFrame || setTimeout)(function () { scheduled = false; ensureButtons(); ensureHomeField(); });
    }
    // نراقب document نفسه: الصفحات المجمّعة تستبدل documentElement كامل لما تنفك
    new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
    schedule();
})();
