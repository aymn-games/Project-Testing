/**
 * «لوحة التحكم» (control.html) — شاشة المتحكم بجواله/آيباده.
 *
 * تتصل بـ '/ws/remote' كـ ctl برقم الستريمر (?s=)، وتعرض:
 *  - شبكة الألعاب (لعبتين بكل صف) — الضغط يفتح اللعبة عند الستريمر.
 *  - اللعبة المفتوحة الحين: حالتها، أزرارها، إعداداتها بقيمها، وأوامر الشات.
 * كل ضغطة ترسل نفس أمر الشات (cmd + arg) وصفحة الستريمر تنفّذه
 * (js/agp-remote-control.js) وترد بالنتيجة.
 *
 * الصلاحية بالخادم: لو الستريمر أوقفها (عن الكل أو عن هالشخص) يوصل
 * err revoked وتتقفل الشاشة على طول.
 */
(function () {
    'use strict';

    var A = window.AGPAuth;
    var GAMES = (window.AymanGamesPlatform && window.AymanGamesPlatform.remoteGames) || [];
    var app = document.getElementById('app');
    var toastsEl = document.getElementById('toasts');

    var S = {
        streamerId: null, streamer: null, me: null,
        online: false, connected: false, state: null,
        view: 'auto',        // auto | games
        fatal: null,         // {title, text, html}
        pending: {}          // cmd → قيمة مؤقتة لين يوصل وصف جديد
    };
    var ws = null, tries = 0, retryT = 0, pingT = 0, seq = 0, stopped = false;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }
    function qs(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } }
    function toast(msg, ok) {
        var el = document.createElement('div');
        el.className = 'toast' + (ok === false ? ' err' : '');
        el.textContent = (ok === false ? '⚠️ ' : '✅ ') + msg;
        toastsEl.appendChild(el);
        while (toastsEl.children.length > 3) toastsEl.removeChild(toastsEl.firstChild);
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3200);
    }
    function wsUrl() {
        var q = qs('rcws');
        if (q) return q;
        var h = location.hostname;
        if (h === 'localhost' || h === '127.0.0.1') return 'ws://' + h + ':8787/ws/remote';
        return (A && A.API_BASE ? A.API_BASE : 'https://project-testing-akds.onrender.com').replace(/^http/, 'ws') + '/ws/remote';
    }
    function fatal(title, text, html) {
        S.fatal = { title: title, text: text, html: html || '' };
        stopped = true;
        if (ws) { try { ws.close(); } catch (e) {} }
        render();
    }

    // ---------- البداية: مين الستريمر؟ ----------

    function boot() {
        if (!A || !A.getToken || !A.getToken()) {
            fatal('سجّل دخولك أولاً', 'لوحة التحكم تفتح من حسابك بالموقع (الموثّق بيوزر تيك توك اللي أعطاه الستريمر الصلاحية).',
                '<a class="btn" style="display:inline-flex;align-items:center" href="login.html?next=' + encodeURIComponent('control.html' + location.search) + '">تسجيل الدخول</a>');
            return;
        }
        var sid = parseInt(qs('s'), 10);
        if (sid) { S.streamerId = sid; connect(); return; }
        // بدون رقم: من أعطاني صلاحية؟
        A.request('/api/remote-control/access').then(function (r) {
            var list = (r && r.streamers) || [];
            if (r && r.tiktokLinked === false) {
                fatal('اربط حساب تيك توك', 'التحكم يعتمد على يوزر تيك توك اللي أضافه الستريمر. اربط حسابك من «حسابي» أولاً.',
                    '<a class="btn" style="display:inline-flex;align-items:center" href="profile.html">حسابي</a>');
                return;
            }
            if (!list.length) { fatal('ما عندك صلاحية تحكم', 'لما يضيفك ستريمر من بروفايله بيطلع لك هنا وبزر «لوحة التحكم» ببروفايلك.'); return; }
            if (list.length === 1) { S.streamerId = list[0].id; history.replaceState(null, '', '?s=' + list[0].id); connect(); return; }
            app.innerHTML = '<div class="center"><h2>اختر الستريمر</h2><div class="pick-streamer">' + list.map(function (x) {
                return '<a href="?s=' + x.id + '"><span class="ava">' + (x.avatar ? '<img src="' + esc(x.avatar) + '" alt="">' : esc((x.name || '؟').charAt(0))) + '</span><b>' + esc(x.name) + '</b></a>';
            }).join('') + '</div></div>';
        }).catch(function () { fatal('تعذّر الاتصال', 'تأكد من الإنترنت وحاول مرة ثانية.'); });
    }

    // ---------- الاتصال ----------

    function connect() {
        if (stopped || ws) return;
        try { ws = new WebSocket(wsUrl()); } catch (e) { retry(); return; }
        var me = ws;
        ws.onopen = function () { me.send(JSON.stringify({ t: 'ctl', auth: A.getToken(), s: S.streamerId })); };
        ws.onmessage = function (ev) {
            var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (!m) return;
            if (m.t === 'welcome') {
                tries = 0; S.connected = true; S.streamer = m.streamer; S.me = m.me; S.online = !!m.online;
                if (m.state) setState(m.state);
                clearInterval(pingT);
                pingT = setInterval(function () { send({ t: 'ping' }); }, 20000);
                render();
            } else if (m.t === 'state') {
                setState(m.s); render();
            } else if (m.t === 'online') {
                S.online = !!m.on; render();
            } else if (m.t === 'res') {
                if (m.msg) toast(m.msg, m.ok !== false);
            } else if (m.t === 'err') {
                if (m.err === 'login') fatal('انتهت جلستك', 'سجّل دخولك مرة ثانية.', '<a class="btn" style="display:inline-flex;align-items:center" href="login.html?next=' + encodeURIComponent('control.html' + location.search) + '">تسجيل الدخول</a>');
                else if (m.err === 'revoked') fatal('تم إيقاف التحكم', 'الستريمر أوقف صلاحية التحكم عنك. لو رجّعها تقدر تفتح لوحة التحكم من بروفايلك.', '<a class="btn ghost" style="display:inline-flex;align-items:center" href="profile.html">بروفايلي</a>');
                else fatal('ما عندك صلاحية', 'هذا الستريمر ما أعطاك صلاحية التحكم، أو أوقفها.', '<a class="btn ghost" style="display:inline-flex;align-items:center" href="profile.html">بروفايلي</a>');
            }
        };
        ws.onclose = function () {
            if (ws === me) ws = null;
            clearInterval(pingT);
            S.connected = false;
            if (!stopped) { render(); retry(); }
        };
        ws.onerror = function () { try { me.close(); } catch (e) {} };
    }
    function retry() {
        if (stopped || retryT) return;
        var d = Math.min(1000 * Math.pow(2, tries), 15000);
        tries++;
        retryT = setTimeout(function () { retryT = 0; connect(); }, d);
    }
    function send(obj) {
        if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); return true; } catch (e) {} }
        return false;
    }
    function sendCmd(cmd, arg) {
        if (!send({ t: 'cmd', id: ++seq, cmd: cmd, arg: arg == null ? '' : String(arg) })) { toast('غير متصل — جارٍ إعادة الاتصال', false); return false; }
        return true;
    }
    function openGame(id) {
        if (!send({ t: 'open', id: ++seq, game: id })) { toast('غير متصل — جارٍ إعادة الاتصال', false); return; }
        S.view = 'auto';
        render();
    }
    function setState(s) {
        var prevGame = S.state && S.state.game;
        S.state = s;
        S.pending = {};
        if (s && s.game !== prevGame) S.view = 'auto';
    }

    // ---------- العرض ----------

    function gameById(id) { for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i]; return null; }

    function header() {
        var st = S.streamer || {};
        var pill = !S.connected ? '<span class="pill"><i></i>جارٍ الاتصال…</span>'
            : S.online ? '<span class="pill on"><i></i>شاشة اللعبة مفتوحة</span>'
            : '<span class="pill off"><i></i>شاشة اللعبة مقفلة</span>';
        return '<div class="top"><div class="top-in"><div class="who"><span class="ava">' +
            (st.avatar ? '<img src="' + esc(st.avatar) + '" alt="">' : esc((st.name || '🎮').charAt(0))) +
            '</span><span class="who-t"><small>تتحكم بألعاب</small><b>' + esc(st.name || '…') + '</b></span></div>' + pill + '</div></div>';
    }

    function gamesGrid() {
        var cur = S.state && S.state.game;
        return '<div class="grid games">' + GAMES.map(function (g) {
            var c = g.id === cur ? ' cur' : g.ready ? '' : ' soon';
            var badge = g.id === cur ? '<em>مفتوحة</em>' : g.ready ? '' : '<em>قريباً</em>';
            return '<button type="button" class="game' + c + '" data-game="' + esc(g.id) + '"' + (g.ready ? '' : ' aria-disabled="true"') + '>' + badge +
                '<span class="ic">' + esc(g.icon || '🎮') + '</span><b>' + esc(g.name) + '</b></button>';
        }).join('') + '</div>';
    }

    function settingRow(it) {
        var v = Object.prototype.hasOwnProperty.call(S.pending, it.cmd) ? S.pending[it.cmd] : it.value;
        var ctl = '';
        if (it.type === 'choice') {
            ctl = '<span class="pills">' + (it.options || []).map(function (o) {
                return '<button type="button" class="opt' + (String(o) === String(v) ? ' on' : '') + '" data-set="' + esc(it.cmd) + '" data-val="' + esc(o) + '">' + esc(o) + '</button>';
            }).join('') + '</span>';
        } else if (it.type === 'toggle') {
            ctl = '<button type="button" class="tg' + (v ? ' on' : '') + '" data-tg="' + esc(it.cmd) + '" data-on="' + (v ? '1' : '0') + '" aria-label="' + esc(it.label) + '"></button>';
        } else if (it.type === 'number') {
            ctl = '<span class="num"><button type="button" data-num="' + esc(it.cmd) + '" data-d="-1" aria-label="أقل">−</button><output>' + esc(v == null ? '—' : v) +
                '</output><button type="button" data-num="' + esc(it.cmd) + '" data-d="1" aria-label="أكثر">+</button></span>';
        } else {
            ctl = '<span class="txt"><input type="text" data-txt="' + esc(it.cmd) + '" value="' + esc(v) + '" placeholder="' + esc(it.placeholder || '') + '" maxlength="40" enterkeyhint="done">' +
                '<button type="button" data-save="' + esc(it.cmd) + '">حفظ</button></span>';
        }
        return '<div class="row"><span class="lbl">' + esc(it.label) + '</span>' + ctl + '</div>';
    }

    function gameView() {
        var s = S.state;
        var g = gameById(s.game);
        var html = '<div class="now"><div class="now-head"><span class="now-name">' + esc(g ? g.icon : '🎮') + ' <span>' + esc(s.gameName || (g && g.name) || '') + '</span></span>' +
            (s.page ? '<span class="chip">' + esc(s.page) + '</span>' : '') + '</div>' +
            (s.status ? '<div class="status">' + esc(s.status) + '</div>' : '') + '</div>';
        if (s.actions && s.actions.length) {
            html += '<div class="h">الإجراءات</div><div class="grid">' + s.actions.map(function (a, i) {
                return '<button type="button" class="act' + (a.tone ? ' ' + a.tone : '') + '" data-act="' + i + '">' + esc(a.label) +
                    (a.desc ? '<small>' + esc(a.desc) + '</small>' : '') + '</button>';
            }).join('') + '</div>';
        }
        (s.sections || []).forEach(function (sec) {
            html += '<div class="h">' + esc(sec.title) + '</div><div class="card">' + sec.items.map(settingRow).join('') + '</div>';
        });
        if (s.help && s.help.length) {
            html += '<details class="cmds"><summary>⌨️ أوامر الشات لهذي الشاشة (' + s.help.length + ')</summary>' + s.help.map(function (l) {
                return '<div class="cmd"><b><bdi dir="rtl">' + esc(l[0]) + '</bdi></b><span>' + esc(l[1]) + '</span></div>';
            }).join('') + '</details>';
        }
        html += '<div class="foot"><button type="button" class="act" data-view="games">🎮 تغيير اللعبة</button>' +
            '<button type="button" class="act" data-game="library">📚 مكتبة الألعاب</button></div>';
        return html;
    }

    function render() {
        if (S.fatal) {
            app.innerHTML = (S.streamer ? header() : '') + '<div class="center"><h2>' + esc(S.fatal.title) + '</h2><p>' + esc(S.fatal.text) + '</p>' + S.fatal.html + '</div>';
            return;
        }
        if (!S.streamerId) return;

        // نحافظ على الكتابة بخانة نص مفتوحة
        var ae = document.activeElement, keep = null;
        if (ae && ae.getAttribute && ae.getAttribute('data-txt')) keep = { cmd: ae.getAttribute('data-txt'), val: ae.value, a: ae.selectionStart, b: ae.selectionEnd };

        var s = S.state;
        var body = '';
        if (S.connected && !S.online) {
            body += '<div class="banner">شاشة اللعبة عند الستريمر مقفلة الحين. أول ما يفتح مكتبة الألعاب أو لعبة بالموقع تقدر تتحكم. ' +
                'الأمر اللي ترسله ينتظر لحظات بس.</div>';
        }
        var showGame = s && s.game && S.view !== 'games';
        if (showGame) {
            body += gameView();
        } else {
            if (s && s.game) body += '<div class="h"><span>اختر لعبة</span><button type="button" class="btn ghost" data-view="auto">↩ رجوع للعبة</button></div>';
            else body += '<div class="h">اختر لعبة — تنفتح إعداداتها عند الستريمر</div>';
            body += gamesGrid();
        }
        app.innerHTML = header() + '<div class="wrap">' + body + '</div>';

        if (keep) {
            var inp = app.querySelector('[data-txt="' + (window.CSS && CSS.escape ? CSS.escape(keep.cmd) : keep.cmd) + '"]');
            if (inp) { inp.value = keep.val; inp.focus(); try { inp.setSelectionRange(keep.a, keep.b); } catch (e) {} }
        }
    }

    // ---------- النافذة السفلية ----------

    var sheetEl = null;
    function closeSheet() { if (sheetEl && sheetEl.parentNode) sheetEl.parentNode.removeChild(sheetEl); sheetEl = null; }
    function openSheet(html, wire) {
        closeSheet();
        sheetEl = document.createElement('div');
        sheetEl.className = 'sheet-bg';
        sheetEl.innerHTML = '<div class="sheet" role="dialog">' + html + '</div>';
        sheetEl.addEventListener('click', function (e) { if (e.target === sheetEl) closeSheet(); });
        document.body.appendChild(sheetEl);
        wire(sheetEl);
    }
    function confirmThen(text, fn) {
        openSheet('<h3>' + esc(text) + '</h3><p>&nbsp;</p><div class="row2"><button type="button" class="btn" style="flex:1;background:linear-gradient(90deg,#dc2626,#ef4444)" data-yes>نعم</button>' +
            '<button type="button" class="btn ghost" style="flex:1" data-no>إلغاء</button></div>', function (el) {
            el.querySelector('[data-yes]').onclick = function () { closeSheet(); fn(); };
            el.querySelector('[data-no]').onclick = closeSheet;
        });
    }
    /** زر إجراء: يحتاج قيمة؟ → قائمة اختيار أو خانة كتابة. */
    function runAction(a) {
        var needs = a.args && a.args.charAt(0) === '<';
        var go = function (arg) {
            var f = function () { sendCmd(a.cmd, arg); };
            if (a.confirm) confirmThen(a.confirm, f); else f();
        };
        if (!needs && !(a.pick && a.pick.length)) { go(''); return; }
        var list = a.pick || [];
        openSheet('<h3>' + esc(a.label) + '</h3><p>' + esc(a.desc || (list.length ? 'اختر من القائمة أو اكتب' : 'اكتب القيمة')) + '</p>' +
            (list.length ? '<div class="list">' + list.map(function (x, i) { return '<button type="button" data-i="' + i + '">' + esc(x) + '</button>'; }).join('') + '</div>' : '') +
            '<div class="row2"><input type="text" placeholder="' + esc(a.args.replace(/[<>\[\]]/g, '')) + '" maxlength="60" enterkeyhint="send"><button type="button" class="btn" data-ok>تنفيذ</button></div>' +
            (!needs ? '<button type="button" class="btn ghost" style="width:100%" data-plain>تنفيذ بدون اختيار</button>' : ''),
        function (el) {
            Array.prototype.forEach.call(el.querySelectorAll('[data-i]'), function (b) {
                b.onclick = function () { closeSheet(); go(list[+b.getAttribute('data-i')]); };
            });
            var inp = el.querySelector('input');
            var ok = function () { var v = inp.value.trim(); if (!v && needs) { inp.focus(); return; } closeSheet(); go(v); };
            el.querySelector('[data-ok]').onclick = ok;
            inp.onkeydown = function (e) { if (e.key === 'Enter') ok(); };
            var plain = el.querySelector('[data-plain]');
            if (plain) plain.onclick = function () { closeSheet(); go(''); };
        });
    }

    function findItem(cmd) {
        var s = S.state; if (!s) return null;
        for (var i = 0; i < (s.sections || []).length; i++) {
            var it = s.sections[i].items.filter(function (x) { return x.cmd === cmd; })[0];
            if (it) return it;
        }
        return null;
    }

    // ---------- الضغطات ----------

    var numT = {};
    app.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('button') : null;
        if (!t) return;
        var v;
        if ((v = t.getAttribute('data-game'))) {
            var g = gameById(v);
            if (v !== 'library' && (!g || !g.ready)) { toast((g ? g.name : 'اللعبة') + ': التحكم فيها قريباً', false); return; }
            if (S.state && S.state.game === v) { S.view = 'auto'; render(); return; }
            openGame(v);
        } else if ((v = t.getAttribute('data-view'))) {
            S.view = v; render(); window.scrollTo(0, 0);
        } else if ((v = t.getAttribute('data-act')) != null) {
            var a = S.state && S.state.actions && S.state.actions[+v];
            if (a) runAction(a);
        } else if ((v = t.getAttribute('data-set'))) {
            var val = t.getAttribute('data-val');
            if (sendCmd(v, val)) { S.pending[v] = val; render(); }
        } else if ((v = t.getAttribute('data-tg'))) {
            var on = t.getAttribute('data-on') !== '1';
            if (sendCmd(v, on ? 'تشغيل' : 'ايقاف')) { S.pending[v] = on; render(); }
        } else if ((v = t.getAttribute('data-num'))) {
            var it = findItem(v); if (!it) return;
            var cur = Object.prototype.hasOwnProperty.call(S.pending, v) ? S.pending[v] : it.value;
            var step = it.step || 1, mn = it.min != null ? it.min : 0, mx = it.max != null ? it.max : 999;
            var n = Math.max(mn, Math.min(mx, (Number(cur) || mn) + step * (+t.getAttribute('data-d'))));
            S.pending[v] = n; render();
            clearTimeout(numT[v]);
            numT[v] = setTimeout(function () { sendCmd(v, n); }, 450); // ضغطات متتالية = أمر واحد
        } else if ((v = t.getAttribute('data-save'))) {
            var inp = app.querySelector('[data-txt="' + (window.CSS && CSS.escape ? CSS.escape(v) : v) + '"]');
            var txt = inp ? inp.value.trim() : '';
            if (!txt) { toast('اكتب القيمة أولاً', false); return; }
            if (inp) inp.blur();
            if (sendCmd(v, txt)) { S.pending[v] = txt; render(); }
        }
    });
    app.addEventListener('keydown', function (e) {
        var c = e.target && e.target.getAttribute && e.target.getAttribute('data-txt');
        if (c && e.key === 'Enter') {
            var b = app.querySelector('[data-save="' + (window.CSS && CSS.escape ? CSS.escape(c) : c) + '"]');
            if (b) b.click();
        }
    });
    // رجوع التطبيق للواجهة (الجوال قفل الشاشة) → اتصال جديد على طول لو انقطع
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && !ws && !stopped && S.streamerId) { clearTimeout(retryT); retryT = 0; tries = 0; connect(); }
    });

    boot();
}());
