/**
 * «المافيا» — نظام القرية: شاشة اللاعب بالجوال (داخل join.html).
 *
 * join.html يستلم الحالة من الخادم، ولو كانت المباراة بنظام القرية (G.system === 'village') يعطيها هنا
 * بدل شاشة النظام الحالي. الخادم (backend/mafia/mafia-village.js) هو المرجع: يرسل لكل لاعب دوره،
 * والأهداف المسموحة له بالليل (me.allowed)، وصوته.
 *
 * MafiaVillagePhone.mount(el, { act(a, arg), me() }) ← { render(G) }
 */
(function () {
    'use strict';
    var V = window.MafiaVillage, L = window.MafiaLooks, NET = window.MafiaNet, R = V.ROLES, T = V.TEAMS, esc = V.esc;
    var REVEAL_AT = 4200;   // نفس شاشة البث: الكشف بعد «هل كان من المافيا؟»

    var CSS = '' +
        '#vVillage:not(.hide){flex:1;min-height:0;display:flex;flex-direction:column;gap:10px}' +
        '.vv-top{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:18px;background:#13111b;border:1px solid rgba(255,255,255,.09)}' +
        '.vv-me{display:flex;align-items:center;gap:8px;min-width:0;font-weight:800;font-size:15px}.vv-me span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.vv-me svg{flex:none;border-radius:50%;background:rgba(255,255,255,.06)}' +
        '.vv-role{flex:none;height:34px;padding:0 12px;border-radius:999px;border:0;color:#fff;font-weight:800;font-size:14px}' +
        '.vv-ph{flex:none;display:flex;justify-content:space-between;align-items:center;padding:0 4px;font-weight:800}.vv-ph b{font-size:17px}.vv-ph span{font-size:20px;color:#f5c84c;font-variant-numeric:tabular-nums}' +
        '.vv-main{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;scrollbar-width:none}' +
        '.vv-main>*{flex-shrink:0}' +
        '.vv-card{--rc:#a78bfa;padding:18px 16px;border-radius:22px;text-align:center;background:radial-gradient(120% 80% at 50% 0%,color-mix(in srgb,var(--rc) 28%,transparent),transparent 70%),#13111b;border:1.5px solid color-mix(in srgb,var(--rc) 45%,transparent)}' +
        '.vv-card .ic{font-size:54px;line-height:1.1}.vv-card h2{margin:6px 0 2px;font-size:26px;font-weight:900}.vv-card .tm{display:inline-block;margin-bottom:8px;padding:2px 12px;border-radius:999px;font-size:13px;font-weight:800;color:#fff;background:var(--tc)}' +
        '.vv-card p{margin:6px 0 0;font-size:15px;line-height:1.75;color:#d9d4e6;font-weight:600}.vv-card .warn{margin-top:10px;font-size:14px;color:#f5c84c;font-weight:800}' +
        '.vv-h{display:flex;justify-content:space-between;align-items:center;gap:8px}.vv-h b{font-size:18px;font-weight:900}.vv-h small{color:#a8a3b5;font-weight:700;font-size:13px}' +
        '.vv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}' +
        '.vv-p{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px 8px;border-radius:16px;border:1.5px solid rgba(255,255,255,.09);background:#1c1828;color:#f4f2f8;min-width:0}' +
        '.vv-p b{font-size:13.5px;font-weight:800;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.vv-p .n{position:absolute;top:6px;right:6px;min-width:22px;height:22px;border-radius:999px;display:grid;place-items:center;background:rgba(255,255,255,.12);font-size:12px;font-weight:800}' +
        '.vv-p em{font-style:normal;font-size:11.5px;font-weight:800;color:#f5c84c}' +
        '.vv-p.sel{border-color:var(--sc,#f5c84c);background:color-mix(in srgb,var(--sc,#f5c84c) 18%,#1c1828);box-shadow:0 0 0 2px var(--sc,#f5c84c)}' +
        '.vv-p:disabled{opacity:.35}.vv-p.vv-mate{border-color:rgba(239,75,75,.6)}' +
        '.vv-btn{width:100%;height:54px;border-radius:16px;border:0;font-weight:900;font-size:18px;color:#2a1d00;background:linear-gradient(180deg,#ffe08a,#f0b93a);box-shadow:0 4px 0 #b8861d}' +
        '.vv-btn.ghost{color:#e7e3ef;background:#1c1828;border:1px solid rgba(255,255,255,.12);box-shadow:none}.vv-btn:disabled{filter:grayscale(1) brightness(.6)}' +
        '.vv-state{display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 14px;border-radius:22px;background:#13111b;border:1px solid rgba(255,255,255,.09);text-align:center}' +
        '.vv-state .ic{font-size:46px}.vv-state b{font-size:21px;font-weight:900}.vv-state p{margin:0;color:#c9c3d8;font-size:15px;font-weight:600;line-height:1.7}' +
        '.vv-res{padding:12px 14px;border-radius:16px;font-size:16px;font-weight:800;line-height:1.6;background:#1c1828;border:1px solid rgba(255,255,255,.1)}' +
        '.vv-res.good{background:rgba(34,179,107,.14);border-color:rgba(34,179,107,.45)}.vv-res.bad{background:rgba(239,75,75,.14);border-color:rgba(239,75,75,.45)}.vv-res.info{background:rgba(245,200,76,.1);border-color:rgba(245,200,76,.4)}' +
        '.vv-ev{display:flex;flex-direction:column;gap:6px}.vv-ev div{padding:8px 12px;border-radius:12px;background:rgba(255,255,255,.04);font-size:14px;font-weight:700;color:#e9e6ff;line-height:1.6}.vv-ev .mine{background:rgba(167,139,250,.12)}' +
        '.vv-chat{flex:none;display:flex;flex-direction:column;gap:6px;max-height:42%;min-height:150px;padding:10px;border-radius:18px;background:#13111b;border:1px solid rgba(255,255,255,.09)}' +
        '.vv-chat.mafia{border-color:rgba(239,75,75,.45)}' +
        '.vv-msgs{flex:1;min-height:60px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}.vv-msgs div{font-size:15px;line-height:1.5;font-weight:600}.vv-msgs b{color:#f5c84c}' +
        '.vv-send{display:flex;gap:6px}.vv-send input{flex:1;min-width:0;height:44px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:#0c0b12;color:#fff;font-size:16px}' +
        '.vv-send button{height:44px;padding:0 16px;border-radius:12px;border:0;background:#7c3aed;color:#fff;font-weight:800}' +
        '.vv-dlg{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.65);backdrop-filter:blur(6px)}' +
        '.vv-dlg>div{width:min(380px,100%);padding:20px;border-radius:22px;background:#13111b;border:1px solid rgba(245,200,76,.35);text-align:center;display:flex;flex-direction:column;gap:12px}' +
        '.vv-dlg b{font-size:21px}.vv-dlg p{margin:0;color:#c9c3d8;font-weight:600}.vv-dlg .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}';

    function avatar(p, s) { return L.avatarSVG(p.look, s || 40); }
    function nameOf(G, id) { var p = G.players.find(function (q) { return q.id === id; }); return p ? p.name : '؟'; }

    function mount(el, api) {
        V.injectCss();
        if (!document.getElementById('vvCss')) { var st = document.createElement('style'); st.id = 'vvCss'; st.textContent = CSS; document.head.appendChild(st); }
        el.innerHTML = '<div class="vv-top"><div class="vv-me" id="vvMe"></div><button type="button" class="vv-role" id="vvRole"></button></div>' +
            '<div class="vv-ph"><b id="vvPh"></b><span id="vvT"></span></div>' +
            '<div class="vv-main" id="vvMain"></div>' +
            '<div class="vv-chat hide" id="vvChat"><div class="vv-h"><b id="vvChatT"></b><small id="vvChatS"></small></div><div class="vv-msgs" id="vvMsgs"></div>' +
            '<div class="vv-send"><input id="vvIn" maxlength="140" placeholder="اكتب…" autocomplete="off"><button type="button" id="vvSend">إرسال</button></div></div>';
        var $ = function (id) { return document.getElementById(id); };
        var G = null, hideRole = false, mainKey = '', chatKey = '', chan = null;

        $('vvRole').onclick = function () { hideRole = !hideRole; mainKey = ''; render(G); };
        function send() { var i = $('vvIn'), t = i.value.trim(); if (!t || !chan) return; api.act('chat', chan + '|' + t); i.value = ''; i.focus(); }
        $('vvSend').onclick = send;
        $('vvIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
        el.addEventListener('click', function (e) {
            var b = e.target.closest('[data-pick]');
            if (b && !b.disabled) { api.act('pick', b.getAttribute('data-pick')); return; }
            if (e.target.closest('[data-confirm]')) { api.act('confirm'); return; }
            b = e.target.closest('[data-vote]');
            if (b && !b.disabled) confirmVote(b.getAttribute('data-vote'));
        });
        function confirmVote(id) {
            var me = G.me, d = document.createElement('div'); d.className = 'vv-dlg';
            d.innerHTML = '<div><b>تصوّت على ' + esc(nameOf(G, id)) + '؟</b><p>صوت واحد ولا يتغيّر بعد ما ترسله' + (me.weight === 2 ? ' — وصوتك بصوتين 👑' : '') + '.</p>' +
                '<div class="two"><button type="button" class="vv-btn ghost" data-no>رجوع</button><button type="button" class="vv-btn" data-yes>صوّت</button></div></div>';
            document.body.appendChild(d);
            d.addEventListener('click', function (e) {
                if (e.target.closest('[data-yes]')) { api.act('vote', id); d.remove(); }
                else if (e.target === d || e.target.closest('[data-no]')) d.remove();
            });
        }

        // ---------------------------------------------------------------- الأجزاء
        function roleCard(me, G) {
            var r = R[me.role] || R.citizen, t = T[r.team];
            var mates = G.players.filter(function (p) { return p.mate; });
            return '<div class="vv-card" style="--rc:' + r.c + ';--tc:' + t.c + '"><div class="ic">' + r.i + '</div><h2>أنت ' + esc(r.n) + '</h2><span class="tm">' + t.n + '</span>' +
                '<p>' + esc(r.desc) + '</p>' +
                (mates.length ? '<p><b>فريقك:</b> ' + mates.map(function (p) { return esc(p.name) + ' (' + esc((R[p.role] || R.mafia).n) + ')'; }).join('، ') + '</p>' : '') +
                '<div class="warn">🤫 لا تقول دورك لأحد</div></div>';
        }
        function state(ic, title, p) { return '<div class="vv-state"><div class="ic">' + ic + '</div><b>' + title + '</b>' + (p ? '<p>' + p + '</p>' : '') + '</div>'; }
        function roundNotices(me, G) {
            var list = (me.notices || []).filter(function (n) { return n.round === G.round && n.round > 0; });
            return list.map(function (n) { return '<div class="vv-res ' + (/مافيا 🔪/.test(n.text) ? 'bad' : /بريء|أنقذت|نجا|أصابت/.test(n.text) ? 'good' : 'info') + '">' + esc(n.text) + '</div>'; }).join('');
        }
        function eventsHtml(G, me) {
            var items = [];
            G.chat.forEach(function (c) { if (c.sys && /قتلت|رصاصة|الحارس|أنقذه|ليلة هادية|خرج من القرية|تعادل|ما أحد صوّت|فاز|فازت/.test(c.text)) items.push({ at: c.at, t: c.text }); });
            (me.notices || []).forEach(function (n) { items.push({ at: n.at, t: n.text, mine: true }); });
            items.sort(function (a, b) { return b.at - a.at; });
            if (!items.length) return '';
            return '<div class="vv-h" style="margin-top:4px"><b>📜 الأحداث</b><small>' + (me.notices || []).length + ' خاص فيك</small></div><div class="vv-ev">' +
                items.slice(0, 14).map(function (e) { return '<div class="' + (e.mine ? 'mine' : '') + '">' + (e.mine ? '🔒 ' : '') + esc(e.t) + '</div>'; }).join('') + '</div>';
        }
        function grid(G, opts) {
            var list = G.players.filter(function (p) { return p.alive; }).sort(function (a, b) { return a.seat - b.seat; });
            return '<div class="vv-grid">' + list.map(function (p) {
                var ok = opts.can(p), sel = opts.sel(p), tag = opts.tag ? opts.tag(p) : '';
                return '<button type="button" class="vv-p' + (sel ? ' sel' : '') + (p.mate ? ' vv-mate' : '') + '" style="--sc:' + (opts.color || '#f5c84c') + '"' + (ok ? ' ' + opts.attr + '="' + p.id + '"' : ' disabled') + '>' +
                    '<span class="n">' + (p.seat + 1) + '</span>' + avatar(p, 46) + '<b>' + esc(p.name) + '</b>' + (tag ? '<em>' + tag + '</em>' : '') + '</button>';
            }).join('') + '</div>';
        }

        function nightHtml(G, me) {
            var r = R[me.role] || R.citizen;
            if (!me.actor) {
                if (me.role === 'sniper') return state('🎯', 'خلصت رصاصتك', 'نام وانتظر الصبح… وصوّت بذكاء بالنهار.');
                if (me.role === 'mayor') return state('👑', 'نام يا عمدة', 'ما عندك شي بالليل. بكرة صوتك بصوتين.');
                if (me.role === 'jester') return state('🤡', 'نام يا مهرّج', 'بكرة خلّهم يشكّون فيك… هدفك يطردونك.');
                return state('😴', 'القرية نايمة…', 'ما عندك شي بالليل. انتظر الصبح.');
            }
            if (me.confirmed) {
                var t = me.pick === 'skip' ? 'ما اخترت أحد الليلة' : (me.role === 'mafia' ? 'اخترت ' : me.role === 'doctor' ? 'تحمي ' : me.role === 'detective' ? 'تفحص ' : me.role === 'bodyguard' ? 'تحرس ' : me.role === 'sniper' ? 'أطلقت على ' : 'زوّرت ') + nameOf(G, me.pick);
                return state('✅', esc(t), me.role === 'detective' ? 'النتيجة توصلك مع الصبح.' : 'انتظر الصبح…') + teamPicksHtml(G, me);
            }
            var allowed = me.allowed || [], picks = me.teamPicks || {};
            var count = function (id) { return Object.keys(picks).filter(function (k) { return picks[k] === id; }).length; };
            var h = '<div class="vv-h"><b>' + r.i + ' ' + esc(r.act || '') + '</b><small>' + (me.role === 'mafia' ? (G.settings.killMode === 'each' ? 'كل واحد يقتل لاعب' : 'اتفقوا على واحد') : 'اضغط ثم أكّد') + '</small></div>';
            h += grid(G, {
                attr: 'data-pick', color: r.c,
                can: function (p) { return allowed.indexOf(p.id) >= 0; },
                sel: function (p) { return me.pick === p.id; },
                tag: function (p) {
                    if (p.mate) return (R[p.role] || R.mafia).i + ' زميلك';
                    if (me.role === 'mafia') { var n = count(p.id); return n ? '🎯 ' + n : ''; }
                    if (p.id === me.doctorPrev && me.role === 'doctor') return 'أمس';
                    if (p.id === me.guardPrev && me.role === 'bodyguard') return 'أمس';
                    return '';
                }
            });
            h += '<button type="button" class="vv-btn ghost" data-pick="skip"' + (me.pick === 'skip' ? ' style="border-color:#f5c84c"' : '') + '>⏭️ ما أبي أختار أحد الليلة</button>';
            h += '<button type="button" class="vv-btn" data-confirm' + (me.pick ? '' : ' disabled') + '>' + (me.pick ? '✔ تأكيد' + (me.pick !== 'skip' ? ': ' + esc(nameOf(G, me.pick)) : '') : 'اختر لاعب أول') + '</button>';
            return h;
        }
        function teamPicksHtml(G, me) {
            var picks = me.teamPicks; if (!picks) return '';
            var rows = Object.keys(picks).filter(function (k) { return k !== me.id; }).map(function (k) { return esc(nameOf(G, k)) + ' ← ' + (picks[k] === 'skip' ? 'ولا أحد' : esc(nameOf(G, picks[k]))); });
            return rows.length ? '<div class="vv-res info">🔪 فريقك: ' + rows.join(' · ') + '</div>' : '';
        }
        function voteHtml(G, me) {
            if (me.vote) return state('🗳️', 'صوّتت على ' + esc(nameOf(G, me.vote)), 'صوتك وصل ولا يتغيّر. تابع الشاشة.');
            return '<div class="vv-h"><b>🗳️ من المافيا؟</b><small>' + (me.weight === 2 ? '👑 صوتك بصوتين' : 'صوت واحد ولا يتغيّر') + '</small></div>' +
                grid(G, { attr: 'data-vote', color: '#ef4b4b', can: function (p) { return p.id !== me.id; }, sel: function () { return false; },
                    tag: function (p) { var n = (G.tally || {})[p.id] || 0; return (p.role === 'mayor' ? '👑 ' : '') + (n ? n + ' صوت' : ''); } });
        }
        function verdictHtml(G) {
            var Vd = G.verdict || {}, p = Vd.id && G.players.find(function (q) { return q.id === Vd.id; });
            if (!p) return state('⚖️', Vd.tie ? 'تعادل — ما أحد خرج' : 'ما أحد صوّت — ما أحد خرج', '');
            if (NET.now() - G.phaseAt < REVEAL_AT) return state('⚖️', esc(p.name) + ' خرج من القرية', 'هل كان من المافيا؟ شوف الشاشة…');
            var r = R[Vd.role] || R.citizen;
            return state(Vd.jester ? '🤡' : Vd.team === 'mafia' ? '🔪' : '😇', esc(p.name) + (Vd.jester ? ': المهرّج فاز!' : Vd.team === 'mafia' ? ': نعم! كان ' + esc(r.n) + ' من المافيا' : ': بريء! كان ' + esc(r.n)), '');
        }
        function overHtml(G, me) {
            var won = me.team === G.winner || (G.jesterWins || []).indexOf(me.id) >= 0;
            return state(won ? '🏆' : '💀', won ? 'فزت!' : 'خسرت', (G.winner === 'mafia' ? 'فازت المافيا' : 'فاز أهل القرية') + ' — وكنت ' + esc((R[me.role] || R.citizen).n) + '.') + roleCard(me, G);
        }

        function mainHtml(G, me) {
            var ph = G.phase;
            if (ph === 'over') return overHtml(G, me);
            if (ph === 'reveal') return hideRole ? state('🙈', 'دورك مخفي', 'اضغط على الزر فوق عشان تشوفه') : roleCard(me, G);
            if (!me.alive) return state('💀', 'خرجت من القرية', 'تقدر تتابع اللعبة على البث. لا تكشف شي للأحياء!') + eventsHtml(G, me);
            if (ph === 'night') return nightHtml(G, me);
            if (ph === 'dawn') return state('☀️', 'طلع الصبح على القرية', 'شوف الشاشة: مين مات ومين نجا.') + roundNotices(me, G) + eventsHtml(G, me);
            if (ph === 'day') return roundNotices(me, G) + state('💬', 'النقاش', 'ناقشوا مين المافيا، وبعدها التصويت من جوالاتكم.') + eventsHtml(G, me);
            if (ph === 'vote') return voteHtml(G, me);
            if (ph === 'verdict') return verdictHtml(G) + eventsHtml(G, me);
            return '';
        }

        var PH = { reveal: '🎭 أدوار القرية', night: '🌙 الليلة ', dawn: '☀️ الصبح', day: '💬 النهار ', vote: '🗳️ التصويت', verdict: '⚖️ قرار القرية', over: '🏁 انتهت اللعبة' };
        function tick() {
            if (!G) return;
            var left = G.endsAt ? Math.max(0, Math.ceil((G.endsAt - NET.now()) / 1000)) : 0;
            $('vvT').textContent = G.endsAt && G.phase !== 'over' && G.phase !== 'dawn' && G.phase !== 'verdict' ? left + 'ث' : '';
            if (G.phase === 'verdict') renderMain();
        }
        setInterval(tick, 500);

        function renderMain() {
            var me = G.me, html = mainHtml(G, me);
            if (html === mainKey) return;
            var m = $('vvMain'), sc = m.scrollTop; mainKey = html; m.innerHTML = html; m.scrollTop = sc;
        }
        function renderChat() {
            var me = G.me, ph = G.phase, mafia = me.alive && me.team === 'mafia' && ph !== 'over' && ph !== 'reveal';
            // النهار: الشات العام · الليل: شات المافيا السري (للمافيا والمزوّر)
            chan = me.alive && (ph === 'day' || ph === 'vote') ? 'city' : mafia && (ph === 'night' || ph === 'dawn' || ph === 'verdict') ? 'mafia' : null;
            var box = $('vvChat'); box.classList.toggle('hide', !chan); box.classList.toggle('mafia', chan === 'mafia');
            if (!chan) return;
            $('vvChatT').textContent = chan === 'mafia' ? '🔪 شات المافيا السري' : '💬 الشات العام';
            $('vvChatS').textContent = chan === 'mafia' ? 'فريقك بس يشوفه' : 'يطلع على البث';
            var list = G.chat.filter(function (c) { return !c.sys && c.ch === chan; }).slice(-50);
            var key = chan + ':' + (list.length ? list[list.length - 1].n : 0);
            if (key === chatKey) return; chatKey = key;
            $('vvMsgs').innerHTML = list.length ? list.map(function (c) { return '<div><b>' + esc(nameOf(G, c.from)) + (c.from === me.id ? ' (أنت)' : '') + ':</b> ' + esc(c.text) + '</div>'; }).join('') : '<div style="color:#a8a3b5">ما فيه رسائل بعد…</div>';
            $('vvMsgs').scrollTop = $('vvMsgs').scrollHeight;
        }
        function render(g) {
            G = g; if (!G || !G.me) return;
            var me = G.me, mp = G.players.find(function (p) { return p.id === me.id; }) || {}, r = R[me.role] || R.citizen;
            var mb = avatar(mp, 34) + '<span>' + esc(mp.name || '') + ' · #' + ((mp.seat || 0) + 1) + '</span>';
            if ($('vvMe')._h !== mb) { $('vvMe').innerHTML = mb; $('vvMe')._h = mb; }
            $('vvRole').style.background = hideRole ? '#2a2438' : r.c;
            $('vvRole').textContent = hideRole ? '👁 دورك' : r.i + ' ' + r.n;
            $('vvPh').textContent = (PH[G.phase] || '') + (G.phase === 'night' || G.phase === 'day' ? G.round : '');
            tick(); renderMain(); renderChat();
        }
        return { render: render };
    }

    window.MafiaVillagePhone = { mount: mount };
})();
