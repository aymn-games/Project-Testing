/**
 * قائمة «البثوث النشطة الآن» بشاشات دعوة ألعاب البثين (بلنتي، أسرع إجابة)
 * + نبضة الحضور اللي تغذّيها. مشترك بين games/penalty/index.html و
 * games/fastest-answer/versus.html (ومكتبة الألعاب للحضور بس).
 *
 * الحضور: كل صفحة تبلّغ الخادم وين الستريمر كل PING_MS (POST /api/challenge/presence):
 *   'library'  = فاضي بمكتبة الألعاب
 *   '<game>'   = فاتح شاشة دعوة اللعبة وينتظر خصم (مع إعداداته — «دخول مباشر» يستخدمها)
 *   ''         = طلع (نبضة أخيرة لما تتسكّر الصفحة)
 *
 * القائمة 3 أقسام: مباريات تنتظر خصم («دخول مباشر»)، فاضين بمكتبة الألعاب
 * («إرسال دعوة»)، ويلعبون الحين (البثوث المتصلة من داخل لعبة).
 *
 * AGPChallengeLobby.startPresence(getWhere, getSettings) → {ping()}
 * AGPChallengeLobby.load() → Promise<{waiting, idle}>
 * AGPChallengeLobby.html({waiting, idle, live, inviteBtn, avatar, esc, myCustomId}) → HTML
 * AGPChallengeLobby.count({waiting, idle, live}) → عدد البثوث بالأقسام كلها
 * AGPChallengeLobby.pageFor(game) → صفحة شاشة دعوة اللعبة (من داخل games/<x>/)
 */
(function () {
    'use strict';

    var PING_MS = 20000;
    var PAGES = { 'penalty': '../penalty/index.html?mode=versus', 'fastest-answer': '../fastest-answer/versus.html' };

    function A() { return window.AGPAuth; }
    function loggedIn() { var a = A(); return Boolean(a && a.getToken && a.getToken()); }

    function startPresence(getWhere, getSettings) {
        var last = null, timer = null;
        function send(force) {
            if (!loggedIn() || !A().challengePresence) return;
            var where = getWhere() || '', settings = where && where !== 'library' && getSettings ? getSettings() : {};
            var key = where + '|' + JSON.stringify(settings);
            if (!force && key === last) return;
            last = key;
            if (!where && !force) return;
            A().challengePresence(where, settings).catch(function () {});
        }
        // نبضة دورية (والصفحة ظاهرة بس)، وفوراً مع أي تغيير بالإعدادات أو الوضع.
        setInterval(function () { if (!document.hidden) { last = null; send(); } }, PING_MS);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = null; send(); } });
        addEventListener('pagehide', function () {
            if (loggedIn() && A().challengePresence) A().challengePresence('', {}, true).catch(function () {});
        });
        setTimeout(function () { send(true); }, 300);
        return {
            ping: function () { clearTimeout(timer); timer = setTimeout(function () { send(); }, 700); }
        };
    }

    function load() {
        if (!loggedIn() || !A().challengeLobby) return Promise.resolve({ waiting: [], idle: [] });
        return A().challengeLobby().then(function (r) {
            return r && r.success ? { waiting: r.waiting || [], idle: r.idle || [] } : { waiting: [], idle: [] };
        }).catch(function () { return { waiting: [], idle: [] }; });
    }

    var CAT_NAMES = { math: 'مسألة رياضية', image: 'صورة واكتب الاسم', reverse: 'اعكس الكلمة', number: 'اكتب الرقم', capital: 'عاصمة الدولة', proverb: 'أكمل المثل', scramble: 'ترتيب الحروف', flag: 'علم الدولة', complete: 'أكمل الكلمة', odd: 'اكتشف المختلف' };
    function summary(w) {
        var s = w.settings || {};
        if (w.game === 'penalty') return 'الجولة ' + (s.roundMinutes || 4) + ' دقائق · الركلة ' + (s.shotSec || 10) + ' ث';
        if (w.game === 'fastest-answer') return (s.target || 15) + ' نقطة للفوز · ' + (s.hostCats || []).map(function (c) { return CAT_NAMES[c] || c; }).join('، ');
        return '';
    }

    function dedupe(o) {
        var seen = {};
        (o.waiting || []).concat(o.idle || []).forEach(function (u) { if (u.tiktok) seen[String(u.tiktok).toLowerCase()] = true; });
        return (o.live || []).filter(function (u) { return u.tiktok && !seen[String(u.tiktok).toLowerCase()]; });
    }

    function count(o) { return (o.waiting || []).length + (o.idle || []).length + dedupe(o).length; }

    function head(title, n, dot) {
        return '<div class="lobby-h" style="display:flex;align-items:center;gap:8px;margin:14px 0 2px;font:700 13.5px \'IBM Plex Sans Arabic\',sans-serif;color:#c4b5fd">' +
            '<span style="width:7px;height:7px;border-radius:50%;background:' + dot + ';box-shadow:0 0 8px ' + dot + '"></span>' + title +
            '<em style="font-style:normal;font-weight:600;font-size:12px;color:#8a8596">(' + n + ')</em></div>';
    }

    function html(o) {
        var esc = o.esc, waiting = o.waiting || [], idle = o.idle || [], live = dedupe(o);
        if (!waiting.length && !idle.length && !live.length) return '';
        var out = '';
        if (waiting.length) {
            out += head('مباريات تنتظر خصم', waiting.length, '#fbbf24') + waiting.map(function (u) {
                return '<div class="person">' + o.avatar(u.tiktok, u.name) +
                    '<div class="pi"><b>' + esc(u.name) + '<span class="live-tag" style="display:inline-block;background:rgba(251,191,36,.14);color:#fde68a">ينتظر خصم</span></b>' +
                    '<span><bdi>@' + esc(u.tiktok) + '</bdi> · ' + esc(u.gameName || '') + '</span><span>' + esc(summary(u)) + '</span></div>' +
                    '<button type="button" class="btn ok" data-join="' + esc(u.customId) + '" data-game="' + esc(u.game) + '"' + (o.disabled ? ' disabled' : '') + '>دخول مباشر</button></div>';
            }).join('');
        }
        if (idle.length) {
            out += head('فاضين بمكتبة الألعاب', idle.length, '#34d399') + idle.map(function (u) {
                return '<div class="person">' + o.avatar(u.tiktok, u.name) +
                    '<div class="pi"><b>' + esc(u.name) + '</b><span><bdi>@' + esc(u.tiktok) + '</bdi> · فاتح مكتبة الألعاب</span></div>' +
                    o.inviteBtn(u.customId, false) + '</div>';
            }).join('');
        }
        if (live.length) {
            out += head('يلعبون الحين', live.length, '#ef4444') + live.map(function (u) {
                return '<div class="person">' + o.avatar(u.tiktok, u.name) +
                    '<div class="pi"><b>' + esc(u.name) + '<span class="live-tag">مباشر</span></b><span><bdi>@' + esc(u.tiktok) + '</bdi>' + (u.gameName ? ' · يلعب ' + esc(u.gameName) : '') + (u.viewers != null ? ' · ' + Number(u.viewers).toLocaleString('en') + ' مشاهد' : '') + '</span></div>' +
                    o.inviteBtn(u.customId, false) + '</div>';
            }).join('');
        }
        return out;
    }

    window.AGPChallengeLobby = { startPresence: startPresence, load: load, html: html, count: count, pageFor: function (game) { return PAGES[game] || '../../challenge.html'; } };
})();
