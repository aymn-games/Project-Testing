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
    function fatal(title, text, html, icon) {
        S.fatal = { title: title, text: text, html: html || '', icon: icon || '🔒' };
        stopped = true;
        if (ws) { try { ws.close(); } catch (e) {} }
        render();
    }

    // ---------- البداية: مين الستريمر؟ ----------

    function boot() {
        if (!A || !A.getToken || !A.getToken()) {
            fatal('سجّل دخولك أولاً', 'لوحة التحكم تفتح من حسابك بالموقع (الموثّق بيوزر تيك توك اللي أعطاه الستريمر الصلاحية).',
                '<a class="btn" href="login.html?next=' + encodeURIComponent('control.html' + location.search) + '">تسجيل الدخول</a>');
            return;
        }
        var sid = parseInt(qs('s'), 10);
        if (sid) { S.streamerId = sid; connect(); return; }
        // بدون رقم: من أعطاني صلاحية؟
        A.request('/api/remote-control/access').then(function (r) {
            var list = (r && r.streamers) || [];
            if (r && r.tiktokLinked === false) {
                fatal('اربط حساب تيك توك', 'التحكم يعتمد على يوزر تيك توك اللي أضافه الستريمر. اربط حسابك من «حسابي» أولاً.',
                    '<a class="btn" href="profile.html">حسابي</a>', '🔗');
                return;
            }
            if (!list.length) { fatal('ما عندك صلاحية تحكم', 'لما يضيفك ستريمر من بروفايله بيطلع لك هنا وبزر «لوحة التحكم» ببروفايلك.', '', '🎮'); return; }
            if (list.length === 1) { S.streamerId = list[0].id; history.replaceState(null, '', '?s=' + list[0].id); connect(); return; }
            app.innerHTML = '<div class="center"><h2>اختر الستريمر</h2><div class="pick-streamer">' + list.map(function (x) {
                return '<a href="?s=' + x.id + '"><span class="ava">' + (x.avatar ? '<img src="' + esc(x.avatar) + '" alt="">' : esc((x.name || '؟').charAt(0))) + '</span><b>' + esc(x.name) + '</b></a>';
            }).join('') + '</div></div>';
        }).catch(function () { fatal('تعذّر الاتصال', 'تأكد من الإنترنت وحاول مرة ثانية.', '', '📡'); });
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
                if (m.err === 'login') fatal('انتهت جلستك', 'سجّل دخولك مرة ثانية.', '<a class="btn" href="login.html?next=' + encodeURIComponent('control.html' + location.search) + '">تسجيل الدخول</a>');
                else if (m.err === 'revoked') fatal('تم إيقاف التحكم', 'الستريمر أوقف صلاحية التحكم عنك. لو رجّعها تقدر تفتح لوحة التحكم من بروفايلك.', '<a class="btn ghost" href="profile.html">بروفايلي</a>', '⛔');
                else fatal('ما عندك صلاحية', 'هذا الستريمر ما أعطاك صلاحية التحكم، أو أوقفها.', '<a class="btn ghost" href="profile.html">بروفايلي</a>');
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
    /** لون خاص لكل لعبة (درجة لون من ترتيبها) — للبطاقة والأيقونة. */
    function hueOf(id) { var i = GAMES.indexOf(gameById(id)); return i < 0 ? 265 : (255 + i * 47) % 360; }
    function itemId(it) { return it.id || it.cmd; }

    function header() {
        var st = S.streamer || {};
        var pill = !S.connected ? '<span class="pill"><i></i>جارٍ الاتصال…</span>'
            : S.online ? '<span class="pill on"><i></i>متصل بشاشة اللعبة</span>'
            : '<span class="pill off"><i></i>الشاشة مقفلة</span>';
        return '<div class="top"><div class="top-in"><div class="who"><span class="ava">' +
            (st.avatar ? '<img src="' + esc(st.avatar) + '" alt="">' : esc((st.name || '🎮').charAt(0))) +
            '</span><span class="who-t"><small>لوحة التحكم · ألعاب</small><b>' + esc(st.name || '…') + '</b></span></div>' + pill + '</div></div>';
    }

    function tabbar(view) {
        var hasGame = !!(S.state && S.state.game);
        return '<nav class="tabbar"><div class="tabbar-in">' +
            '<button type="button" class="tab' + (view === 'games' ? ' on' : '') + '" data-view="games"><i>🎮</i>الألعاب</button>' +
            '<button type="button" class="tab' + (view === 'game' ? ' on' : '') + '" data-view="auto"' + (hasGame ? '' : ' disabled') + '><i>🕹️</i>التحكم</button>' +
            '<button type="button" class="tab" data-game="library"><i>📚</i>المكتبة</button>' +
            '</div></nav>';
    }

    function gamesGrid() {
        var cur = S.state && S.state.game;
        return '<div class="grid games">' + GAMES.map(function (g, i) {
            var c = g.id === cur ? ' cur' : g.ready ? '' : ' soon';
            var badge = g.id === cur ? '<em>مفتوحة</em>' : g.ready ? '' : '<em>قريباً</em>';
            return '<button type="button" class="game fade' + c + '" style="--h:' + hueOf(g.id) + ';animation-delay:' + Math.min(i * 25, 500) + 'ms" data-game="' + esc(g.id) + '"' + (g.ready ? '' : ' aria-disabled="true"') + '>' + badge +
                '<span class="tile">' + esc(g.icon || '🎮') + '</span><b>' + esc(g.name) + '</b></button>';
        }).join('') + '</div>';
    }

    function settingRow(it) {
        var id = itemId(it);
        var v = Object.prototype.hasOwnProperty.call(S.pending, id) ? S.pending[id] : it.value;
        var ctl = '';
        if (it.type === 'choice' || it.type === 'multi') {
            var multi = it.type === 'multi', sel = multi ? (Array.isArray(v) ? v.map(String) : []) : null;
            ctl = '<span class="seg">' + (it.options || []).map(function (o) {
                var on = multi ? sel.indexOf(String(o)) >= 0 : String(o) === String(v);
                return '<button type="button" class="opt' + (multi ? ' multi' : '') + (on ? ' on' : '') + '" data-set="' + esc(id) + '" data-val="' + esc(o) + '">' + esc(o) + '</button>';
            }).join('') + '</span>';
        } else if (it.type === 'toggle') {
            ctl = '<button type="button" class="tg' + (v ? ' on' : '') + '" data-tg="' + esc(id) + '" data-on="' + (v ? '1' : '0') + '" aria-label="' + esc(it.label) + '"></button>';
        } else if (it.type === 'number') {
            ctl = '<span class="num"><button type="button" data-num="' + esc(id) + '" data-d="-1" aria-label="أقل">−</button><output>' + esc(v == null ? '—' : v) +
                '</output><button type="button" data-num="' + esc(id) + '" data-d="1" aria-label="أكثر">+</button></span>';
        } else {
            ctl = '<span class="txt"><input type="text" data-txt="' + esc(id) + '" value="' + esc(v) + '" placeholder="' + esc(it.placeholder || '') + '" maxlength="40" enterkeyhint="done">' +
                '<button type="button" class="btn" data-save="' + esc(id) + '">حفظ</button></span>';
        }
        return '<div class="row"><span class="lbl"><span>' + esc(it.label) + '</span>' + (it.desc ? '<small>' + esc(it.desc) + '</small>' : '') + '</span>' + ctl + '</div>';
    }

    function actBtn(a, i) {
        return '<button type="button" class="act' + (a.tone ? ' ' + a.tone : '') + (a.screen ? ' screen' : '') + '" data-act="' + i + '">' +
            (a.icon ? '<span class="ai">' + esc(a.icon) + '</span>' : '') + '<span>' + esc(a.label) + (a.desc ? '<small style="display:block">' + esc(a.desc) + '</small>' : '') + '</span></button>';
    }

    function gameView() {
        var s = S.state;
        var g = gameById(s.game);
        var html = '<div class="hero fade" style="--h:' + hueOf(s.game) + '"><div class="hero-head"><span class="tile">' + esc(g ? g.icon : '🎮') + '</span>' +
            '<span class="hero-t"><b>' + esc(s.gameName || (g && g.name) || '') + '</b>' + (s.page ? '<span class="chip">' + esc(s.page) + '</span>' : '') + '</span></div>' +
            (s.status ? '<div class="status">' + esc(s.status) + '</div>' : '') + '</div>';
        var acts = (s.actions || []).map(function (a, i) { return { a: a, i: i }; });
        var main = acts.filter(function (x) { return !x.a.screen; });
        var scr = acts.filter(function (x) { return x.a.screen; });
        // الأساسي أول، بعده العادي، والخطر آخر
        var rank = function (x) { return x.a.tone === 'primary' ? 0 : x.a.tone === 'danger' ? 2 : 1; };
        main.sort(function (x, y) { return rank(x) - rank(y) || x.i - y.i; });
        if (main.length) html += '<div class="h">الإجراءات</div><div class="grid">' + main.map(function (x) { return actBtn(x.a, x.i); }).join('') + '</div>';
        (s.sections || []).forEach(function (sec) {
            if (!sec.items || !sec.items.length) return;
            html += '<div class="h">' + esc(sec.title) + '</div><div class="card">' + sec.items.map(settingRow).join('') + '</div>';
        });
        if (scr.length) {
            // أزرار نفس الإعداد («وقت الإجابة: 15 ث»، «وقت الإجابة: 30 ث») → صف واحد بكبسولات
            var groups = {}, order = [], singles = [];
            scr.forEach(function (x) {
                var m = /^(.{2,40}?): (.+)$/.exec(x.a.label);
                if (m) { if (!groups[m[1]]) { groups[m[1]] = []; order.push(m[1]); } groups[m[1]].push({ x: x, opt: m[2] }); }
                else singles.push(x);
            });
            var rows = '';
            order.forEach(function (k) {
                if (groups[k].length < 2) { singles.push(groups[k][0].x); return; }
                rows += '<div class="row"><span class="lbl"><span>' + esc(k) + '</span></span><span class="seg">' + groups[k].map(function (g) {
                    return '<button type="button" class="opt" data-act="' + g.x.i + '">' + esc(g.opt) + '</button>';
                }).join('') + '</span></div>';
            });
            singles.sort(function (x, y) { return rank(x) - rank(y) || x.i - y.i; });
            html += '<div class="h"><span>أزرار الشاشة</span><small>نفس أزرار شاشة الستريمر</small></div>';
            if (rows) html += '<div class="card" style="margin-bottom:11px">' + rows + '</div>';
            if (singles.length) html += '<div class="grid">' + singles.map(function (x) { var a = Object.assign({}, x.a); if (a.tone === 'primary') a.tone = ''; return actBtn(a, x.i); }).join('') + '</div>';
        }
        if (s.help && s.help.length) {
            html += '<details class="cmds"><summary>⌨️ أوامر الشات لهذي الشاشة (' + s.help.length + ')</summary>' + s.help.map(function (l) {
                return '<div class="cmd"><b><bdi dir="rtl">' + esc(l[0]) + '</bdi></b><span>' + esc(l[1]) + '</span></div>';
            }).join('') + '</details>';
        }
        return html;
    }

    function render() {
        if (S.fatal) {
            app.innerHTML = (S.streamer ? header() : '') + '<div class="center fade"><div class="big">' + (S.fatal.icon || '🔒') + '</div><h2>' + esc(S.fatal.title) + '</h2><p>' + esc(S.fatal.text) + '</p>' + S.fatal.html + '</div>';
            return;
        }
        if (!S.streamerId) return;

        // نحافظ على الكتابة بخانة نص مفتوحة
        var ae = document.activeElement, keep = null;
        if (ae && ae.getAttribute && ae.getAttribute('data-txt')) keep = { id: ae.getAttribute('data-txt'), val: ae.value, a: ae.selectionStart, b: ae.selectionEnd };
        var y = window.scrollY;

        var s = S.state;
        var body = '';
        if (S.connected && !S.online) {
            body += '<div class="banner">شاشة اللعبة عند الستريمر مقفلة الحين. أول ما يفتح مكتبة الألعاب أو لعبة بالموقع تقدر تتحكم، والأمر اللي ترسله ينتظر لحظات بس.</div>';
        }
        var view = s && s.game && S.view !== 'games' ? 'game' : 'games';
        if (view === 'game') body += gameView();
        else body += '<div class="h"><span>اختر لعبة</span><small>تنفتح إعداداتها عند الستريمر</small></div>' + gamesGrid();
        var animate = S._lastView !== view;
        S._lastView = view;
        app.innerHTML = header() + '<div class="wrap">' + body + '</div>' + tabbar(view);
        if (!animate) {
            Array.prototype.forEach.call(app.querySelectorAll('.fade'), function (e) { e.classList.remove('fade'); });
            window.scrollTo(0, y);
        }

        if (keep) {
            var inp = app.querySelector('[data-txt="' + cssEsc(keep.id) + '"]');
            if (inp) { inp.value = keep.val; inp.focus(); try { inp.setSelectionRange(keep.a, keep.b); } catch (e) {} }
        }
    }
    function cssEsc(v) { return window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'); }

    // ---------- النافذة السفلية ----------

    var sheetEl = null;
    function closeSheet() { if (sheetEl && sheetEl.parentNode) sheetEl.parentNode.removeChild(sheetEl); sheetEl = null; }
    function openSheet(html, wire) {
        closeSheet();
        sheetEl = document.createElement('div');
        sheetEl.className = 'sheet-bg';
        sheetEl.innerHTML = '<div class="sheet" role="dialog"><div class="grab"></div>' + html + '</div>';
        sheetEl.addEventListener('click', function (e) { if (e.target === sheetEl) closeSheet(); });
        document.body.appendChild(sheetEl);
        wire(sheetEl);
    }
    function confirmThen(text, fn) {
        openSheet('<h3>' + esc(text) + '</h3><p>تأكد قبل التنفيذ — يتنفذ على شاشة الستريمر مباشرة.</p><div class="row2"><button type="button" class="btn red" style="flex:1" data-yes>نعم، نفّذ</button>' +
            '<button type="button" class="btn ghost" style="flex:1" data-no>إلغاء</button></div>', function (el) {
            el.querySelector('[data-yes]').onclick = function () { closeSheet(); fn(); };
            el.querySelector('[data-no]').onclick = closeSheet;
        });
    }
    /** زر إجراء: زر شاشة يُضغط مباشرة؛ أمر يحتاج قيمة → قائمة اختيار أو خانة كتابة. */
    function runAction(a) {
        if (a.screen) {
            var press = function () { sendCmd('__press', a.key); };
            if (a.confirm) confirmThen(a.confirm, press); else press();
            return;
        }
        var needs = a.args && a.args.charAt(0) === '<';
        var go = function (arg) {
            var f = function () { sendCmd(a.cmd, arg); };
            if (a.confirm) confirmThen(a.confirm, f); else f();
        };
        if (!needs && !(a.pick && a.pick.length)) { go(''); return; }
        var list = a.pick || [];
        openSheet('<h3>' + esc(a.label) + '</h3><p>' + esc(a.desc || (list.length ? 'اختر من القائمة أو اكتب' : 'اكتب القيمة')) + '</p>' +
            (list.length ? '<div class="list">' + list.map(function (x, i) { return '<button type="button" data-i="' + i + '">' + esc(x) + '</button>'; }).join('') + '</div>' : '') +
            '<div class="row2"><input class="field" type="text" placeholder="' + esc(a.args.replace(/[<>\[\]]/g, '')) + '" maxlength="60" enterkeyhint="send"><button type="button" class="btn" data-ok>تنفيذ</button></div>' +
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

    function findItem(id) {
        var s = S.state; if (!s) return null;
        for (var i = 0; i < (s.sections || []).length; i++) {
            var it = (s.sections[i].items || []).filter(function (x) { return itemId(x) === id; })[0];
            if (it) return it;
        }
        return null;
    }
    /** يرسل قيمة إعداد: إعداد مربوط باسمه، أو خانة شاشة بمفتاحها. */
    function sendSetting(it, val) {
        return sendCmd(it.cmd, it.key ? it.key + '|' + val : val);
    }

    // ---------- الضغطات ----------

    var numT = {};
    app.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('button') : null;
        if (!t || t.disabled) return;
        var v, it;
        if ((v = t.getAttribute('data-game'))) {
            var g = gameById(v);
            if (v !== 'library' && (!g || !g.ready)) { toast((g ? g.name : 'اللعبة') + ': التحكم فيها قريباً', false); return; }
            if (S.state && S.state.game === v) { S.view = 'auto'; render(); window.scrollTo(0, 0); return; }
            openGame(v);
        } else if ((v = t.getAttribute('data-view'))) {
            S.view = v; render(); window.scrollTo(0, 0);
        } else if ((v = t.getAttribute('data-act')) != null) {
            var a = S.state && S.state.actions && S.state.actions[+v];
            if (a) runAction(a);
        } else if ((v = t.getAttribute('data-set'))) {
            it = findItem(v); if (!it) return;
            var val = t.getAttribute('data-val');
            if (!sendSetting(it, val)) return;
            if (it.type === 'multi') {
                var cur = (Object.prototype.hasOwnProperty.call(S.pending, v) ? S.pending[v] : it.value || []).map(String);
                S.pending[v] = cur.indexOf(val) >= 0 ? cur.filter(function (x) { return x !== val; }) : cur.concat([val]);
            } else S.pending[v] = val;
            render();
        } else if ((v = t.getAttribute('data-tg'))) {
            it = findItem(v); if (!it) return;
            var on = t.getAttribute('data-on') !== '1';
            if (sendSetting(it, on ? 'تشغيل' : 'ايقاف')) { S.pending[v] = on; render(); }
        } else if ((v = t.getAttribute('data-num'))) {
            it = findItem(v); if (!it) return;
            var curN = Object.prototype.hasOwnProperty.call(S.pending, v) ? S.pending[v] : it.value;
            var step = it.step || 1, mn = it.min != null ? it.min : 0, mx = it.max != null ? it.max : 999;
            var n = Math.max(mn, Math.min(mx, (Number(curN) || mn) + step * (+t.getAttribute('data-d'))));
            S.pending[v] = n; render();
            clearTimeout(numT[v]);
            var item = it;
            numT[v] = setTimeout(function () { sendSetting(item, n); }, 450); // ضغطات متتالية = أمر واحد
        } else if ((v = t.getAttribute('data-save'))) {
            it = findItem(v); if (!it) return;
            var inp = app.querySelector('[data-txt="' + cssEsc(v) + '"]');
            var txt = inp ? inp.value.trim() : '';
            if (!txt && !it.key) { toast('اكتب القيمة أولاً', false); return; }
            if (inp) inp.blur();
            if (sendSetting(it, txt)) { S.pending[v] = txt; render(); }
        }
    });
    app.addEventListener('keydown', function (e) {
        var c = e.target && e.target.getAttribute && e.target.getAttribute('data-txt');
        if (c && e.key === 'Enter') {
            var b = app.querySelector('[data-save="' + cssEsc(c) + '"]');
            if (b) b.click();
        }
    });
    // رجوع التطبيق للواجهة (الجوال قفل الشاشة) → اتصال جديد على طول لو انقطع
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && !ws && !stopped && S.streamerId) { clearTimeout(retryT); retryT = 0; tries = 0; connect(); }
    });

    boot();
}());
