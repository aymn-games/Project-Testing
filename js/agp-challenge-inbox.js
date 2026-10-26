/**
 * بريد دعوات «العب ضد ستريمر» — زر ✉ عليه عدد الدعوات الواردة، وقائمة
 * منسدلة فيها كل دعوة (الستريمر، فريقه، اللعبة) مع قبول/رفض.
 *
 * مشترك بين مكتبة الألعاب (games.html) وشاشة «العب ضد ستريمر»
 * (challenge.html). يحتاج auth/auth-client.js قبله. الدعوات تُسحب من
 * /api/challenge/inbox كل بضع ثواني (backend/challenge/challenge-service.js).
 *
 * القبول: الدعوة تُقبل هنا مباشرة وتنتقل لصفحة إعدادات لعبتها عشان الخصم
 * يجهّز فريقه (الاسم، المسموح لهم، والفئات بأسرع إجابة) ويضغط «جاهز».
 *
 * الاستخدام: AGPChallengeInbox.mount(parentEl, { root: '', before: el })
 *   root: مسار جذر الموقع من الصفحة ('' أو '../../').
 */
(function () {
    'use strict';

    var POLL_MS = 5000;
    var STYLE_ID = 'agp-cin-styles';
    var GAME_ICON = { 'penalty': '⚽', 'fastest-answer': '⚡' };
    // صفحة إعدادات كل لعبة بين البثين (فيها تجهيز الخصم بعد القبول).
    var GAME_PAGE = { 'penalty': 'games/penalty/index.html', 'fastest-answer': 'games/fastest-answer/versus.html' };

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function initial(name) { return (Array.from(String(name || '').replace(/[\s_.@\d]/g, ''))[0] || '؟').toUpperCase(); }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = [
            '.agp-cin{position:relative;display:inline-flex;direction:rtl;font-family:"IBM Plex Sans Arabic",sans-serif}',
            '.agp-cin-btn{position:relative;height:40px;padding:0 16px;border-radius:999px;display:inline-flex;align-items:center;gap:8px;cursor:pointer;font:600 14px "IBM Plex Sans Arabic",sans-serif;color:#e7e3ef;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.14);transition:all .2s}',
            '.agp-cin-btn:hover{background:rgba(139,92,246,.12);border-color:rgba(167,139,250,.45)}',
            '.agp-cin-btn svg{width:18px;height:18px;flex:0 0 auto}',
            '.agp-cin-bd{position:absolute;top:-7px;right:-4px;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:#ef4444;color:#fff;font:700 11px/20px "IBM Plex Sans Arabic",sans-serif;text-align:center;box-shadow:0 0 0 3px #07060b}',
            '.agp-cin-bd[hidden]{display:none}',
            '.agp-cin-pop{position:absolute;top:calc(100% + 12px);left:50%;transform:translateX(-50%);width:min(380px,calc(100vw - 24px));z-index:200;box-sizing:border-box;padding:14px;border-radius:22px;text-align:right;',
            'background:rgba(18,16,26,.97);border:1px solid rgba(167,139,250,.35);box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 50px -20px #8b5cf6;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}',
            '.agp-cin-pop[hidden]{display:none}',
            '.agp-cin-h{margin:0 0 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;font:700 16px "IBM Plex Sans Arabic",sans-serif;color:#f4f2f8}',
            '.agp-cin-h small{font:500 12px "IBM Plex Sans Arabic",sans-serif;color:#8a8596}',
            '.agp-cin-list{display:flex;flex-direction:column;gap:10px;max-height:min(60vh,440px);overflow-y:auto}',
            '.agp-cin-inv{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:16px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08)}',
            '.agp-cin-tp{display:flex;align-items:center;gap:10px;min-width:0}',
            '.agp-cin-av{position:relative;width:44px;height:44px;border-radius:50%;flex:0 0 auto;overflow:hidden;display:grid;place-items:center;color:#fff;font:700 18px "IBM Plex Sans Arabic",sans-serif;background:linear-gradient(135deg,#7c3aed,#a855f766);border:2px solid rgba(255,255,255,.14)}',
            '.agp-cin-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#1e1638}',
            '.agp-cin-tx{min-width:0}',
            '.agp-cin-tx b{display:block;font:700 14px "IBM Plex Sans Arabic",sans-serif;color:#f4f2f8}',
            '.agp-cin-tx span{display:block;font:500 12px "IBM Plex Sans Arabic",sans-serif;color:#8a8596;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.agp-cin-tx bdi{direction:ltr;unicode-bidi:isolate}',
            '.agp-cin-gm{display:inline-flex !important;align-items:center;gap:6px;width:auto !important;padding:3px 10px;border-radius:999px;background:rgba(251,191,36,.12);color:#fde68a !important;font:600 11.5px "IBM Plex Sans Arabic",sans-serif !important;margin-top:4px !important}',
            '.agp-cin-bs{display:flex;gap:8px}',
            '.agp-cin-bs button{flex:1;height:36px;border-radius:999px;cursor:pointer;font:700 13px "IBM Plex Sans Arabic",sans-serif}',
            '.agp-cin-bs button:disabled{opacity:.5;cursor:default}',
            '.agp-cin-ok{border:none;background:linear-gradient(90deg,#059669,#34d399);color:#fff}',
            '.agp-cin-no{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:#e7e3ef}',
            '.agp-cin-empty{padding:18px 6px;text-align:center;font:500 13px "IBM Plex Sans Arabic",sans-serif;color:#8a8596}',
            '.agp-cin-foot{display:block;margin-top:12px;text-align:center;font:600 12.5px "IBM Plex Sans Arabic",sans-serif;color:#c4b5fd;text-decoration:none}'
        ].join('\n');
        document.head.appendChild(st);
    }

    var MAIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 6L2 7"></path></svg>';

    function settingsLine(inv) {
        var s = inv.settings || {};
        if (inv.game === 'penalty') return 'الجولة ' + (s.roundMinutes || 4) + ' دقائق';
        if (inv.game === 'fastest-answer') return (s.target || 15) + ' نقطة';
        return '';
    }

    function mount(parent, opts) {
        opts = opts || {};
        var A = window.AGPAuth;
        if (!parent || !A || !A.getToken || !A.getToken() || !A.challengeInbox) return null;
        injectStyles();
        var root = opts.root || '';
        var wrap = document.createElement('span');
        wrap.className = 'agp-cin';
        wrap.innerHTML = '<button type="button" class="agp-cin-btn" aria-label="بريد الدعوات" aria-expanded="false">' + MAIL_SVG + 'البريد<span class="agp-cin-bd" hidden></span></button>' +
            '<div class="agp-cin-pop" hidden><div class="agp-cin-h">دعوات وصلتك <small>تنتهي الدعوة بعد دقيقتين</small></div><div class="agp-cin-list"></div>' +
            '<a class="agp-cin-foot" href="' + root + 'challenge.html">العب ضد ستريمر ↙</a></div>';
        if (opts.before && opts.before.parentNode === parent) parent.insertBefore(wrap, opts.before); else parent.appendChild(wrap);

        var btn = wrap.querySelector('.agp-cin-btn'), pop = wrap.querySelector('.agp-cin-pop'), list = wrap.querySelector('.agp-cin-list'), badge = wrap.querySelector('.agp-cin-bd');
        var invites = [], avatars = {}, busy = {}, lastHtml = null;

        function render() {
            badge.hidden = !invites.length;
            badge.textContent = invites.length;
            var html = invites.length ? invites.map(function (inv) {
                var s = inv.settings || {}, av = avatars[inv.id];
                return '<div class="agp-cin-inv"><div class="agp-cin-tp"><span class="agp-cin-av">' + esc(initial(inv.other.name)) + (av ? '<img src="' + esc(av) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span>' +
                    '<div class="agp-cin-tx"><b>' + esc(inv.other.name) + ' يتحداك!</b><span><bdi>@' + esc(inv.other.tiktok) + '</bdi>' + (s.team1 ? ' · فريقه «' + esc(s.team1) + '»' : '') + '</span>' +
                    '<span class="agp-cin-gm">' + (GAME_ICON[inv.game] || '🎮') + ' ' + esc(inv.gameName) + (settingsLine(inv) ? ' · ' + esc(settingsLine(inv)) : '') + '</span></div></div>' +
                    '<div class="agp-cin-bs"><button type="button" class="agp-cin-ok" data-cin-accept="' + esc(inv.id) + '"' + (busy[inv.id] ? ' disabled' : '') + '>قبول</button>' +
                    '<button type="button" class="agp-cin-no" data-cin-decline="' + esc(inv.id) + '"' + (busy[inv.id] ? ' disabled' : '') + '>رفض</button></div></div>';
            }).join('') : '<div class="agp-cin-empty">ما فيه دعوات الحين — لما يتحداك ستريمر توصلك هنا.</div>';
            if (html !== lastHtml) { lastHtml = html; list.innerHTML = html; }
        }

        var polling = false;
        function poll() {
            if (polling) return;
            polling = true;
            A.challengeInbox(Object.keys(avatars).join(',')).then(function (r) {
                polling = false;
                if (!r || !r.success) return;
                invites = r.incoming || [];
                invites.forEach(function (inv) { if (inv.other.avatar) avatars[inv.id] = inv.other.avatar; });
                render();
            }).catch(function () { polling = false; });
        }

        function setOpen(open) { pop.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); if (open) poll(); }
        btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(pop.hidden); });
        document.addEventListener('click', function (e) { if (!pop.hidden && !wrap.contains(e.target)) setOpen(false); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

        list.addEventListener('click', function (e) {
            var ok = e.target.closest('[data-cin-accept]'), no = e.target.closest('[data-cin-decline]');
            var id = ok ? ok.getAttribute('data-cin-accept') : no ? no.getAttribute('data-cin-decline') : null;
            if (!id || busy[id]) return;
            var inv = invites.filter(function (x) { return x.id === id; })[0];
            if (!inv) return;
            busy[id] = true; render();
            A.challengeRespond(id, Boolean(ok)).then(function (r) {
                delete busy[id];
                if (ok && r && r.success) { location.href = root + (GAME_PAGE[inv.game] || 'challenge.html'); return; }
                if (!(r && r.success)) alert('تعذّر الرد على الدعوة — يمكن انتهت مدتها.');
                poll();
            }).catch(function () { delete busy[id]; render(); });
        });

        render();
        poll();
        setInterval(function () { if (!document.hidden) poll(); }, POLL_MS);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
        return wrap;
    }

    window.AGPChallengeInbox = { mount: mount };
})();
