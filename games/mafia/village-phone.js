/**
 * «المافيا» — نظام القرية: شاشة اللاعب بالجوال (داخل join.html)، على تصميم صاحب المنصة:
 *   - شريط فوق: صورتك واسمك و«رقمك N».
 *   - كرت ذهبي: المطلوب منك الحين (عنوان وسطر تحته) والعداد.
 *   - الكشف: بطاقة الدور الكبيرة بلونه و«المافيا معك» (تنضغط عشان تخفيها عمن بجانبك).
 *   - الليل: شريط الدور، ولوحة الاختيار (شبكة اللاعبين بأرقامهم، وتحت كل لاعب اسم زميلك اللي اختاره)،
 *     وشات المافيا السري (يتصغّر ويتكبّر).
 *   - النهار: تبويب «النقاش» (و«شات المافيا» للمافيا) بشات كامل ومنشن بـ@.
 *   - التصويت: «صوّت» على اللي صوّتوا، و«صوتك» على اختيارك، وخيار «تخطّى». الصوت نهائي.
 *
 * الخادم (backend/mafia/mafia-village.js) هو المرجع: يرسل لكل لاعب دوره، والأهداف المسموحة بالليل
 * (me.allowed)، واختيارات زملائه المافيا (me.teamPicks)، والأصوات.
 *
 * MafiaVillagePhone.mount(el, { act(a, arg), photo(p) ← رابط صورة أو null }) ← { render(G) }
 */
(function () {
    'use strict';
    var V = window.MafiaVillage, L = window.MafiaLooks, NET = window.MafiaNet, R = V.ROLES, T = V.TEAMS, esc = V.esc;
    var REVEAL_AT = 4200;   // نفس شاشة البث: الكشف بعد «هل كان من المافيا؟»

    var CSS = '' +
        'body.vv-on{background:radial-gradient(120% 60% at 50% 0%,#18307a 0%,#0c1846 45%,#070d2b 100%) fixed;color:#eef1ff}' +
        'body.vv-on .brand{display:none}' +
        '#vVillage:not(.hide){flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;padding-top:6px}' +
        // شريط فوق
        '.vv-top{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px 8px 12px;border-radius:22px;background:rgba(20,34,90,.75);border:1px solid rgba(110,140,255,.28)}' +
        '.vv-me{display:flex;align-items:center;gap:10px;min-width:0;font-weight:800;font-size:17px}.vv-me span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.vv-num{flex:none;display:flex;align-items:baseline;gap:6px;padding:6px 14px;border-radius:14px;background:rgba(8,16,52,.8);font-weight:800;font-size:15px;color:#c7d0f5}.vv-num b{font-size:22px;color:#f5c84c}' +
        // الصورة
        '.vv-av{position:relative;flex:none;border-radius:50%;overflow:hidden;background:#1d2a66;box-shadow:0 0 0 2px rgba(255,255,255,.75)}' +
        '.vv-av svg,.vv-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}' +
        // الكرت الذهبي
        '.vv-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 12px 12px;border-radius:22px;border:1.5px solid #e9c46a;' +
        'background:linear-gradient(to left,#1b2659 35%,#6e5520);box-shadow:0 0 24px rgba(233,196,106,.18)}' +
        '.vv-head .t{min-width:0}.vv-head b{display:block;font-size:21px;font-weight:900;line-height:1.3}.vv-head small{display:block;font-size:15px;font-weight:700;color:#f5d27a}' +
        '.vv-clock{flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:rgba(40,30,10,.75);font-size:22px;font-weight:900;font-variant-numeric:tabular-nums}' +
        // المحتوى
        '.vv-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;scrollbar-width:none}.vv-body>*{flex-shrink:0}' +
        '.vv-body.fill>.vv-panel{flex:1 1 auto;min-height:200px;flex-shrink:1}' +
        // بطاقة الدور الكبيرة
        '.vv-role{--rc:#c2363f;display:flex;flex-direction:column;align-items:center;gap:8px;padding:28px 18px 22px;border-radius:30px;text-align:center;cursor:pointer;' +
        'background:linear-gradient(180deg,color-mix(in srgb,var(--rc) 82%,#000),color-mix(in srgb,var(--rc) 45%,#120818));box-shadow:0 20px 50px rgba(0,0,0,.4)}' +
        '.vv-role .k{font-size:16px;font-weight:800;opacity:.75}' +
        '.vv-tile{display:grid;place-items:center;border-radius:28%;background:rgba(0,0,0,.22);color:#fff}' +
        '.vv-role h2{margin:2px 0 0;font-size:64px;font-weight:900;line-height:1.1}' +
        '.vv-role p{margin:0;font-size:17px;font-weight:600;line-height:1.7;max-width:34ch}' +
        '.vv-role .mh{margin-top:8px;font-size:15px;font-weight:800;opacity:.85}' +
        '.vv-role .hint{margin-top:10px;font-size:14px;font-weight:700;opacity:.6}' +
        '.vv-role.hidden h2,.vv-role.hidden p,.vv-role.hidden .vv-chips,.vv-role.hidden .mh{filter:blur(14px)}' +
        '.vv-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}' +
        '.vv-chip{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 4px 0 12px;border-radius:999px;background:rgba(0,0,0,.28);font-weight:800;font-size:15px;white-space:nowrap}' +
        '.vv-chip em{font-style:normal;color:#f5c84c}' +
        // شريط الدور الصغير
        '.vv-band{--rc:#c2363f;display:flex;align-items:center;gap:12px;padding:12px;border-radius:24px;background:linear-gradient(90deg,color-mix(in srgb,var(--rc) 45%,#14183a),color-mix(in srgb,var(--rc) 80%,#000))}' +
        '.vv-band .t{flex:1;min-width:0}.vv-band b{display:block;font-size:24px;font-weight:900}' +
        '.vv-band .vv-chips{justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-top:4px}.vv-band .vv-chips::-webkit-scrollbar{display:none}' +
        '.vv-band .mh{font-size:14px;font-weight:700;opacity:.85;white-space:nowrap}.vv-band .row{display:flex;align-items:center;gap:8px;min-width:0}' +
        // لوحة الاختيار/التصويت
        '.vv-panel{--pc:#e2483d;display:flex;flex-direction:column;gap:10px;padding:14px 12px 12px;border-radius:24px;border:1.5px solid color-mix(in srgb,var(--pc) 70%,transparent);background:rgba(16,28,78,.72);min-height:0}' +
        '.vv-panel.gold{--pc:#e9c46a}' +
        '.vv-ph{display:flex;align-items:flex-start;gap:8px}.vv-ph .ic{flex:none;color:var(--pc);margin-top:3px}.vv-ph .t{flex:1;min-width:0}' +
        '.vv-ph b{display:block;font-size:20px;font-weight:900;line-height:1.35}.vv-ph small{display:block;font-size:14.5px;font-weight:600;color:#c3cbef;line-height:1.6}' +
        '.vv-ph .fin{flex:none;font-size:14px;font-weight:800;color:#f5c84c;text-align:center;line-height:1.3}' +
        '.vv-grid{flex:1;min-height:0;overflow-y:auto;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:116px;gap:16px 10px;align-content:start;padding:12px 2px 2px;scrollbar-width:none}' +
        '.vv-c{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;padding:16px 0 0;height:116px;border-radius:18px;border:1.5px solid rgba(90,130,255,.35);background:rgba(26,46,120,.55);color:#eef1ff;min-width:0;overflow:visible}' +
        '.vv-c .n{position:absolute;top:-9px;right:8px;min-width:40px;height:26px;padding:0 8px;border-radius:9px;display:grid;place-items:center;background:linear-gradient(180deg,#5aa0ff,#2f6fe8);font-size:15px;font-weight:900;color:#fff;box-shadow:0 3px 8px rgba(0,0,0,.35)}' +
        '.vv-c b{font-size:14px;font-weight:800;max-width:100%;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.vv-c .f{align-self:stretch;margin-top:auto;padding:3px 4px;border-radius:0 0 16px 16px;font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.vv-c .f.pick{background:#d9473d;color:#fff}.vv-c .f.done{background:#6fdba1;color:#0b3a22}.vv-c .f.mine{background:#f5c84c;color:#2a1d00}' +
        '.vv-c.sel{border-color:#f5c84c;box-shadow:0 0 0 2px #f5c84c;background:rgba(70,60,40,.6)}' +
        '.vv-c.voted{border-color:#6fdba1}' +
        '.vv-c.dim{opacity:.45}' +
        '.vv-c.skipd{border-color:#f0a040}.vv-c .f.skp{background:#f0a040;color:#2a1600}' +
        '.vv-c.dead{opacity:.55;background:rgba(20,30,80,.5)}.vv-c.dead b{text-decoration:line-through;text-decoration-thickness:2px}.vv-c.dead .n{background:rgba(255,255,255,.16);box-shadow:none}' +
        '.vv-c .f.role{display:flex;align-items:center;justify-content:center;gap:4px;background:rgba(10,18,60,.75);color:#c3cbef;font-size:13px}.vv-c .f.role svg{flex:none}' +
        '.vv-c.mayor .f.role{color:#f5c84c}' +
        '.vv-c.me{border-color:#c9a24a;box-shadow:0 0 0 1px #c9a24a}' +
        '.vv-ph .cnt{flex:none;font-size:16px;font-weight:800;color:#f5c84c}' +
        '.vv-chip.dead{opacity:.5;text-decoration:line-through}' +
        '.vv-dead{flex:none;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:14px;background:rgba(8,16,52,.8);font-weight:800;font-size:15px;color:#f08a96}' +
        '.vv-head.dead{border-color:#e0687a;background:linear-gradient(to left,#1b2659 30%,#6a1b2c);box-shadow:0 0 24px rgba(224,104,122,.2)}.vv-head.dead small{color:#c9cdef}' +
        '.vv-head.dead .vv-clock{background:rgba(60,10,20,.75)}' +
        '.vv-c:disabled{cursor:default}.vv-c.off{opacity:.3}' +
        '.vv-c .ok{position:absolute;top:8px;left:8px;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#16a34a;color:#fff;font-size:15px;font-weight:900;box-shadow:0 0 0 2px #f5c84c}' +
        '.vv-c.skip .vv-tile{width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.08);font-size:22px}' +
        '.vv-go{flex:none;height:46px;border-radius:16px;border:0;font-weight:900;font-size:17px;color:#2a1d00;background:linear-gradient(180deg,#ffe08a,#f0b93a);box-shadow:0 4px 0 #b8861d}' +
        '.vv-go.ghost{color:#dfe5ff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);box-shadow:none}' +
        // حالة (نوم/صبح/قرار/نهاية)
        '.vv-state{display:flex;flex-direction:column;align-items:center;gap:8px;padding:26px 16px;border-radius:24px;background:rgba(16,28,78,.72);border:1px solid rgba(110,140,255,.25);text-align:center}' +
        '.vv-state .e{font-size:48px;line-height:1}.vv-state b{font-size:22px;font-weight:900}.vv-state p{margin:0;font-size:15.5px;font-weight:600;color:#c3cbef;line-height:1.7}' +
        '.vv-note{padding:12px 14px;border-radius:16px;font-size:16px;font-weight:800;line-height:1.6;background:rgba(245,200,76,.1);border:1px solid rgba(245,200,76,.4)}' +
        '.vv-note.bad{background:rgba(226,72,61,.16);border-color:rgba(226,72,61,.55)}.vv-note.good{background:rgba(34,179,107,.16);border-color:rgba(34,179,107,.55)}' +
        '.vv-ev{display:flex;flex-direction:column;gap:6px}.vv-ev div{padding:9px 12px;border-radius:12px;background:rgba(16,28,78,.6);font-size:14.5px;font-weight:700;line-height:1.6}' +
        // الشات
        '.vv-dock{flex:none;display:flex;flex-direction:column;gap:10px;min-height:0}' +
        '#vVillage.vv-full .vv-dock{flex:1}#vVillage.vv-full .vv-body{flex:none;max-height:30%}' +
        '.vv-tabs{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
        '.vv-tabs button{height:52px;border-radius:18px;border:1.5px solid rgba(110,140,255,.28);background:rgba(16,28,78,.6);color:#9fb0ee;font-weight:900;font-size:18px;display:flex;align-items:center;justify-content:center;gap:8px}' +
        '.vv-tabs button.on{color:#fff;border-color:#e9c46a;background:rgba(26,46,120,.8)}' +
        '.vv-bar{display:flex;align-items:center;gap:10px;padding:0 16px;height:56px;border-radius:20px;border:1.5px solid rgba(110,140,255,.28);background:rgba(16,28,78,.7);cursor:pointer;font-weight:800}' +
        '.vv-bar.maf{border-color:rgba(226,72,61,.5);background:rgba(70,16,30,.65)}' +
        '.vv-bar .ttl{display:flex;align-items:center;gap:8px;color:#8fb0ff;font-size:18px;white-space:nowrap}' +
        '.vv-bar .pv{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:16px}.vv-bar .pv b{color:#8fb0ff}' +
        '.vv-bar .tg{flex:none;color:#f5c84c;font-size:16px}' +
        '.vv-msgs{flex:1;min-height:150px;max-height:none;overflow-y:auto;display:flex;flex-direction:column;gap:16px;padding:16px;border-radius:22px;border:1.5px solid rgba(110,140,255,.2);background:rgba(8,14,48,.75);scrollbar-width:none}' +
        '#vVillage:not(.vv-full) .vv-msgs{flex:none;height:min(34vh,300px)}' +
        '.vv-msgs.maf{background:rgba(40,8,20,.7);border-color:rgba(226,72,61,.4)}' +
        '.vv-msgs .empty{margin:auto;text-align:center;font-size:16px;font-weight:600;color:#aab3dc;line-height:1.7}' +
        '.vv-m{display:flex;gap:10px;align-items:flex-start}.vv-m .c{min-width:0}' +
        '.vv-m .h{display:flex;align-items:center;gap:6px;font-size:16px;font-weight:800;color:#8fb0ff}' +
        '.vv-m .h i{font-style:normal;min-width:24px;height:22px;padding:0 6px;border-radius:7px;display:grid;place-items:center;background:#e9c46a;color:#2a1d00;font-size:13px;font-weight:900}' +
        '.vv-m p{margin:2px 0 0;font-size:18px;font-weight:600;line-height:1.5;overflow-wrap:anywhere}.vv-m p .at{color:#f5c84c;font-weight:800}' +
        '.vv-send{position:relative;display:flex;gap:10px;align-items:center}' +
        '.vv-send input{flex:1;min-width:0;height:56px;padding:0 18px;border-radius:20px;border:1.5px solid rgba(110,140,255,.3);background:rgba(8,14,48,.85);color:#fff;font-size:17px;font-family:inherit}' +
        '#vvGo{flex:none;width:58px;height:56px;border-radius:18px;border:0;display:grid;place-items:center;background:linear-gradient(180deg,#ffe08a,#f0b93a);color:#2a1d00}' +
        '.vv-send.maf #vvGo{background:linear-gradient(180deg,#f0776b,#d9473d);color:#fff}' +
        '.vv-at{position:absolute;bottom:64px;right:0;left:68px;max-height:220px;overflow-y:auto;border-radius:16px;background:#101c52;border:1px solid rgba(110,140,255,.4);box-shadow:0 12px 30px rgba(0,0,0,.5);z-index:5}' +
        '.vv-at button{display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:0;background:none;color:#eef1ff;font-weight:800;font-size:16px;text-align:right}' +
        '.vv-at button:hover,.vv-at button:focus{background:rgba(110,140,255,.15)}' +
        '.vv-foot{flex:none;text-align:center;font-size:14px;font-weight:600;color:#97a3d6;padding-bottom:4px}' +
        '.vv-dlg{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:16px;background:rgba(3,6,24,.7);backdrop-filter:blur(6px)}' +
        '.vv-dlg>div{width:min(380px,100%);padding:20px;border-radius:24px;background:#101c52;border:1.5px solid #e9c46a;text-align:center;display:flex;flex-direction:column;gap:12px;color:#eef1ff}' +
        '.vv-dlg b{font-size:21px}.vv-dlg p{margin:0;color:#c3cbef;font-weight:600}.vv-dlg .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}';

    var SEND_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3.5 3.6 10.6c-.9.4-.8 1.6.1 1.9l6.1 1.9 1.9 6.1c.3.9 1.5 1 1.9.1z" transform="rotate(180 12 12) scale(-1 1) translate(-24 0)"/></svg>';
    var ACT_HEAD = {
        mafia: 'اختر ضحية الليلة', doctor: 'اختر مين تحمي الليلة', detective: 'اختر مين تفحص الليلة',
        bodyguard: 'اختر مين تحرس الليلة', sniper: 'تطلق رصاصتك الليلة؟', forger: 'اختر مين تزوّر نتيجته'
    };
    var PANEL_HEAD = {
        mafia: 'من تقتل المافيا الليلة؟', doctor: 'مين تحمي الليلة؟', detective: 'مين تفحص الليلة؟',
        bodyguard: 'مين تحرس الليلة؟', sniper: 'على مين تطلق رصاصتك؟', forger: 'مين تزوّر نتيجته الليلة؟'
    };
    var PANEL_SUB = {
        doctor: 'تحميه من أي قتل الليلة. ما تكرر نفس الشخص ليلتين ورا بعض، ونفسك مرة وحدة بس.',
        detective: 'نتيجته توصلك مع الصبح: مافيا أو بريء.',
        bodyguard: 'لو هجمت عليه المافيا تقتل المهاجم وينجو. ما تحرس نفسك ولا نفس الشخص ليلتين ورا بعض.',
        sniper: 'رصاصة وحدة بالمباراة كلها. لو ما تبي تطلق الليلة اختر «ما أطلق».',
        forger: 'لو فحصه المحقق الليلة تطلع نتيجته بالعكس.'
    };

    function mount(el, api) {
        V.injectCss();
        if (!document.getElementById('vvCss')) { var st = document.createElement('style'); st.id = 'vvCss'; st.textContent = CSS; document.head.appendChild(st); }
        el.innerHTML = '<div class="vv-top" id="vvTop"></div><div class="vv-head" id="vvHead"><div class="t"><b id="vvHT"></b><small id="vvHS"></small></div><span class="vv-clock" id="vvClock"></span></div>' +
            '<div class="vv-body" id="vvBody"></div>' +
            '<div class="vv-dock hide" id="vvDock"><div class="vv-tabs hide" id="vvTabs"></div><div class="vv-bar" id="vvBar"></div><div class="vv-msgs" id="vvMsgs"></div>' +
            '<div class="vv-send" id="vvSend"><div class="vv-at hide" id="vvAt"></div><input id="vvIn" maxlength="140" autocomplete="off"><button type="button" id="vvGo" aria-label="إرسال">' + SEND_SVG + '</button></div></div>' +
            '<div class="vv-foot" id="vvFoot">🔒 أغلق الصفحة متى شئت؛ لن تخرج من اللعبة</div>';
        var $ = function (id) { return document.getElementById(id); };
        var G = null, hideRole = false, bodyKey = '', topKey = '', msgKey = '', tab = 'city', open = { city: true, mafia: false }, lastPhase = '';
        document.body.classList.add('vv-on');

        function P(id) { return G.players.find(function (q) { return q.id === id; }); }
        function av(p, size) {
            var src = api.photo ? api.photo(p) : null;
            return '<span class="vv-av" style="width:' + size + 'px;height:' + size + 'px">' + L.avatarSVG(p.look, size) + (src ? '<img src="' + esc(src) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span>';
        }
        function chip(p) { return '<span class="vv-chip' + (p.alive ? '' : ' dead') + '">' + esc(p.name) + (p.role === 'forger' ? ' (المزوّر)' : '') + ' <em>' + (p.seat + 1) + '</em>' + av(p, 30) + '</span>'; }
        function mates() { return G.players.filter(function (p) { return p.mate; }).sort(function (a, b) { return a.seat - b.seat; }); }

        // ---------------------------------------------------------------- الأحداث
        el.addEventListener('click', function (e) {
            var b;
            if ((b = e.target.closest('[data-pick]')) && !b.disabled) return api.act('pick', b.getAttribute('data-pick'));
            if (e.target.closest('[data-confirm]')) return api.act('confirm');
            if ((b = e.target.closest('[data-vote]')) && !b.disabled) return confirmVote(b.getAttribute('data-vote'));
            if (e.target.closest('[data-hide]')) { hideRole = !hideRole; bodyKey = ''; return render(G); }
            if ((b = e.target.closest('[data-tab]'))) { tab = b.getAttribute('data-tab'); msgKey = ''; return render(G); }
            if (e.target.closest('#vvBar')) { open[chan()] = !open[chan()]; msgKey = ''; return render(G); }
            if ((b = e.target.closest('[data-at]'))) { insertAt(b.getAttribute('data-at')); return; }
        });
        function send() { var i = $('vvIn'), t = i.value.trim(), ch = chan(); if (!t || !ch) return; api.act('chat', ch + '|' + t); i.value = ''; $('vvAt').classList.add('hide'); i.focus(); }
        $('vvGo').onclick = send;
        $('vvIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
        // المنشن: «@» يفتح قائمة الأحياء، واختيار واحد يكتب اسمه
        $('vvIn').addEventListener('input', function () {
            var m = /@([^\s@]*)$/.exec(this.value), box = $('vvAt');
            if (!m || !G) { box.classList.add('hide'); return; }
            var q = m[1].toLowerCase(), list = G.players.filter(function (p) { return p.alive && p.id !== G.me.id && (!q || p.name.toLowerCase().indexOf(q) >= 0 || String(p.seat + 1) === q); }).slice(0, 8);
            if (!list.length) { box.classList.add('hide'); return; }
            box.innerHTML = list.map(function (p) { return '<button type="button" data-at="' + esc(p.name) + '">' + av(p, 28) + esc(p.name) + ' · ' + (p.seat + 1) + '</button>'; }).join('');
            box.classList.remove('hide');
        });
        function insertAt(name) { var i = $('vvIn'); i.value = i.value.replace(/@([^\s@]*)$/, '@' + name + ' '); $('vvAt').classList.add('hide'); i.focus(); }
        function confirmVote(id) {
            var me = G.me, d = document.createElement('div'); d.className = 'vv-dlg';
            var who = id === 'skip' ? 'تتخطّى التصويت؟' : 'تصوّت على ' + esc(P(id).name) + ' (' + (P(id).seat + 1) + ')؟';
            d.innerHTML = '<div><b>' + who + '</b><p>صوتك نهائي ولا يتغيّر بعد ما ترسله' + (me.weight === 2 ? ' — وصوتك بصوتين 👑' : '') + '.</p>' +
                '<div class="two"><button type="button" class="vv-go ghost" data-no>رجوع</button><button type="button" class="vv-go" data-yes>تأكيد</button></div></div>';
            document.body.appendChild(d);
            d.addEventListener('click', function (e) {
                if (e.target.closest('[data-yes]')) { api.act('vote', id); d.remove(); }
                else if (e.target === d || e.target.closest('[data-no]')) d.remove();
            });
        }

        // ---------------------------------------------------------------- الشات
        function isMafia() { return G.me.alive && G.me.team === 'mafia'; }
        /** القناة اللي تنكتب فيها الحين: النهار = تبويبين (للمافيا)، الليل = شات المافيا بس */
        function chan() {
            var ph = G.phase, me = G.me;
            if (!me.alive || ph === 'over' || ph === 'reveal') return null;
            if (ph === 'day') return isMafia() && tab === 'mafia' ? 'mafia' : 'city';
            return isMafia() ? 'mafia' : null;
        }
        function msgHtml(c) {
            var p = P(c.from) || { name: '؟', look: {}, seat: 0 };
            var tx = esc(c.text).replace(/@([^\s@]+)/g, '<span class="at">@$1</span>');
            return '<div class="vv-m">' + av(p, 44) + '<div class="c"><div class="h">' + esc(p.name) + (c.from === G.me.id ? ' (أنت)' : '') + ' <i>' + (p.seat + 1) + '</i></div><p>' + tx + '</p></div></div>';
        }
        function renderDock() {
            var ch = chan(), full = G.phase === 'day' && G.me.alive;
            el.classList.toggle('vv-full', full);
            $('vvDock').classList.toggle('hide', !ch);
            $('vvFoot').classList.toggle('hide', !!ch);
            if (!ch) return;
            var tabs = G.phase === 'day' && isMafia();
            $('vvTabs').classList.toggle('hide', !tabs);
            if (tabs) $('vvTabs').innerHTML = '<button type="button" data-tab="city" class="' + (ch === 'city' ? 'on' : '') + '">◎ النقاش</button><button type="button" data-tab="mafia" class="' + (ch === 'mafia' ? 'on' : '') + '">' + V.icon('mafia', 20) + ' شات المافيا</button>';
            var dayN = 0; G.chat.forEach(function (c) { if (c.sys && /بدأ النقاش/.test(c.text)) dayN = c.n; });
            var list = G.chat.filter(function (c) { return !c.sys && c.ch === ch && (ch !== 'city' || c.n > dayN); }).slice(-60);
            var last = list[list.length - 1], isOpen = open[ch], maf = ch === 'mafia';
            $('vvBar').className = 'vv-bar' + (maf ? ' maf' : '');
            var pv = !isOpen && last ? '<span class="pv"><b>' + esc((P(last.from) || {}).name || '') + ':</b> ' + esc(last.text) + '</span>' : (full && last ? '<span class="pv"><b>' + esc((P(last.from) || {}).name || '') + ':</b> ' + esc(last.text) + '</span>' : '<span class="pv"></span>');
            $('vvBar').innerHTML = '<span class="ttl">' + (maf ? V.icon('mafia', 22) + ' شات المافيا' : '◎') + '</span>' + pv + '<span class="tg">' + (isOpen ? 'تصغير ▾' : 'فتح ▴') + '</span>';
            $('vvMsgs').classList.toggle('hide', !isOpen);
            $('vvMsgs').classList.toggle('maf', maf);
            $('vvSend').classList.toggle('maf', maf);
            $('vvIn').placeholder = maf ? 'رسالة سرية للمافيا… واكتب @ لتمنشن' : 'اكتب للقرية… واكتب @ لتمنشن أحدًا';
            var key = ch + ':' + (last ? last.n : 0) + ':' + isOpen;
            if (key === msgKey) return; msgKey = key;
            $('vvMsgs').innerHTML = list.length ? list.map(msgHtml).join('') : '<div class="empty">' + (maf ? 'شات سري بينك وبين باقي المافيا. لا أحد غيركم يراه.' : 'النقاش بدأ… اكتب للقرية مين تشك فيه.') + '</div>';
            $('vvMsgs').scrollTop = $('vvMsgs').scrollHeight;
        }

        // ---------------------------------------------------------------- الأجزاء
        function bigRole(me) {
            var r = R[me.role] || R.citizen, ms = mates();
            return '<div class="vv-role' + (hideRole ? ' hidden' : '') + '" data-hide style="--rc:' + r.c + '"><span class="k">دورك</span>' +
                '<span class="vv-tile" style="width:96px;height:96px">' + V.icon(me.role, 58) + '</span><h2>' + esc(r.n) + '</h2><p>' + esc(r.desc) + '</p>' +
                (ms.length ? '<div class="mh">المافيا معك:</div><div class="vv-chips">' + ms.map(chip).join('') + '</div>' : '') +
                '<div class="hint">' + (hideRole ? 'اضغط لإظهاره' : 'اضغط لإخفائه عمن بجانبك') + '</div></div>';
        }
        function band(me) {
            var r = R[me.role] || R.citizen, ms = mates();
            return '<div class="vv-band" style="--rc:' + r.c + '"><span class="vv-tile" style="width:58px;height:58px;flex:none">' + V.icon(me.role, 32) + '</span><div class="t"><b>' + esc(r.n) + '</b>' +
                (ms.length ? '<div class="row"><span class="mh">المافيا معك:</span><div class="vv-chips">' + ms.map(chip).join('') + '</div></div>' : '<div class="row"><span class="mh">' + esc(T[r.team].n) + '</span></div>') + '</div></div>';
        }
        function state(e, b, p) { return '<div class="vv-state"><div class="e">' + e + '</div><b>' + b + '</b>' + (p ? '<p>' + p + '</p>' : '') + '</div>'; }
        function card(p, o) {
            return '<button type="button" class="vv-c' + (o.cls || '') + '"' + (o.attr ? ' ' + o.attr : ' disabled') + '><span class="n">' + (p.seat + 1) + '</span>' + (o.ok ? '<span class="ok">✓</span>' : '') +
                av(p, 44) + '<b>' + esc(p.name) + '</b>' + (o.foot ? '<span class="f ' + o.footCls + '">' + o.foot + '</span>' : '') + '</button>';
        }
        function alive() { return G.players.filter(function (p) { return p.alive; }).sort(function (a, b) { return a.seat - b.seat; }); }
        function nightPanel(me) {
            var allowed = me.allowed || [], picks = me.teamPicks || {}, sub = me.role === 'mafia' ? (G.settings.killMode === 'each' ? 'كل واحد منكم يقتل من يختاره، وإن اخترتم الشخص نفسه يموت هو وحده.' : 'اتفقوا على واحد: اللي ياخذ أكثر اختياراتكم يموت.') : PANEL_SUB[me.role] || '';
            var cards = alive().map(function (p) {
                var by = Object.keys(picks).filter(function (k) { return k !== me.id && picks[k] === p.id; }).map(function (k) { return P(k) ? P(k).name : ''; });
                var ok = allowed.indexOf(p.id) >= 0, mine = me.pick === p.id;
                return card(p, { attr: ok && !me.confirmed ? 'data-pick="' + p.id + '"' : '', cls: (mine ? ' sel' : '') + (!ok ? ' off' : ''), ok: mine && me.confirmed, foot: by.length ? esc(by.join('، ')) : mine ? 'اختيارك' : '', footCls: by.length ? 'pick' : 'mine' });
            }).join('');
            var skipTxt = me.role === 'sniper' ? 'ما أطلق الليلة' : 'ما أبي أختار أحد الليلة';
            return '<div class="vv-panel"><div class="vv-ph"><span class="ic">' + (me.role === 'mafia' ? '🔪' : V.icon(me.role, 24)) + '</span><div class="t"><b>' + esc(PANEL_HEAD[me.role] || '') + '</b><small>' + esc(sub) + '</small></div></div>' +
                '<div class="vv-grid">' + cards + '</div>' +
                (me.confirmed ? '<div class="vv-note good">✓ ثبّت اختيارك — انتظر الصبح</div>'
                    : '<button type="button" class="vv-go ghost" data-pick="skip"' + (me.pick === 'skip' ? ' style="border-color:#f5c84c;color:#f5c84c"' : '') + '>⏭️ ' + skipTxt + '</button>' +
                    (me.pick ? '<button type="button" class="vv-go" data-confirm>✔ ثبّت ' + (me.pick === 'skip' ? 'قرارك' : 'اختيارك: ' + esc(P(me.pick).name)) + '</button>' : '')) + '</div>';
        }
        function votePanel(me) {
            var my = me.vote, votes = G.votes || {};
            var skip = '<button type="button" class="vv-c skip' + (my === 'skip' ? ' sel' : my ? ' dim' : '') + '"' + (my ? ' disabled' : ' data-vote="skip"') + '><span class="vv-tile">‹</span><b>تخطّى</b>' + (my === 'skip' ? '<span class="f mine">صوتك</span>' : G.skipVotes ? '<span class="f done">' + G.skipVotes + '</span>' : '') + '</button>';
            var cards = alive().map(function (p) {
                var mine = my === p.id, can = !my && p.id !== me.id;
                // تحت كل لاعب: «صوّت» لو صوّت هو، و«تخطّى» لو تخطّى، واختيارك «صوتك»
                var sk = votes[p.id] === 'skip';
                return card(p, { attr: can ? 'data-vote="' + p.id + '"' : '', cls: (mine ? ' sel' : sk ? ' skipd' : votes[p.id] ? ' voted' : '') + (my && !mine ? ' dim' : '') + (p.id === me.id ? ' off' : ''), ok: mine, foot: mine ? 'صوتك' : sk ? '‹ تخطّى' : votes[p.id] ? '✓ صوّت' : '', footCls: mine ? 'mine' : sk ? 'skp' : 'done' });
            }).join('');
            return '<div class="vv-panel gold"><div class="vv-ph"><span class="ic">◎</span><div class="t"><b>اضغط على من تشك أنه من المافيا</b></div><span class="fin">صوتك<br>نهائي</span></div><div class="vv-grid">' + skip + cards + '</div></div>';
        }
        /** «أهل القرية»: كل اللاعبين — الحي واضح، والميت باهت واسمه مشطوب وتحته دوره، والعمدة دوره ظاهر */
        function villagers(me) {
            var all = G.players.slice().sort(function (a, b) { return a.seat - b.seat; }), n = all.filter(function (p) { return p.alive; }).length;
            var cards = all.map(function (p) {
                var showRole = p.role && (!p.alive || p.role === 'mayor'), r = showRole ? R[p.role] || R.citizen : null;
                return card(p, { cls: (p.alive ? '' : ' dead') + (p.role === 'mayor' && p.alive ? ' mayor' : '') + (p.id === me.id ? ' me' : ''), foot: r ? esc(r.n) + V.icon(p.role, 14) : '', footCls: 'role' });
            }).join('');
            return '<div class="vv-panel" style="--pc:#4a6fd6"><div class="vv-ph"><span class="ic" style="color:#f5c84c">' + V.icon('citizen', 24) + '</span><div class="t"><b>أهل القرية</b></div><span class="cnt">' + n + ' أحياء</span></div><div class="vv-grid">' + cards + '</div></div>';
        }
        function notices(me) {
            return (me.notices || []).filter(function (n) { return n.round === G.round && n.round > 0; }).map(function (n) {
                return '<div class="vv-note ' + (/مافيا 🔪/.test(n.text) ? 'bad' : /بريء|أنقذت|نجا|أصابت/.test(n.text) ? 'good' : '') + '">' + esc(n.text) + '</div>';
            }).join('');
        }
        function events(me) {
            var items = [];
            // نتيجة التصويت ما تطلع هنا قبل لحظة الكشف بشاشة البث
            var hideFrom = G.phase === 'verdict' && NET.now() - G.phaseAt < REVEAL_AT ? G.phaseAt - 1500 : Infinity;
            G.chat.forEach(function (c) { if (c.sys && /قتلت|رصاصة|الحارس|أنقذه|ليلة هادية|خرج من القرية|تعادل|تخطّت|ما أحد صوّت|فاز|فازت/.test(c.text) && c.at < hideFrom) items.push({ at: c.at, t: c.text }); });
            (me.notices || []).forEach(function (n) { items.push({ at: n.at, t: '🔒 ' + n.text }); });
            items.sort(function (a, b) { return b.at - a.at; });
            return items.length ? '<div class="vv-ev">' + items.slice(0, 12).map(function (e) { return '<div>' + esc(e.t) + '</div>'; }).join('') + '</div>' : '';
        }
        function verdict() {
            var Vd = G.verdict || {}, p = Vd.id && P(Vd.id);
            if (!p) return state('⚖️', Vd.skip ? 'الأغلبية تخطّت — ما أحد خرج' : Vd.tie ? 'تعادل — ما أحد خرج' : 'ما أحد صوّت — ما أحد خرج', '');
            if (NET.now() - G.phaseAt < REVEAL_AT) return state('⚖️', esc(p.name) + ' خرج من القرية', 'هل كان من المافيا؟ شوف الشاشة…');
            var r = R[Vd.role] || R.citizen;
            return state(Vd.jester ? '🤡' : Vd.team === 'mafia' ? '🔪' : '😇', esc(p.name) + (Vd.jester ? ': المهرّج فاز!' : Vd.team === 'mafia' ? ': نعم! كان ' + esc(r.n) + ' من المافيا' : ': بريء! كان ' + esc(r.n)), '');
        }

        /** الكرت الذهبي: [عنوان، سطر تحته] */
        function head(me) {
            var ph = G.phase;
            if (ph === 'over') { var won = me.team === G.winner || (G.jesterWins || []).indexOf(me.id) >= 0; return [won ? 'فزت! 🏆' : 'خسرت', G.winner === 'mafia' ? 'فازت المافيا' : 'فاز أهل القرية']; }
            if (ph === 'reveal') return ['هذا دورك، لا تقله لأحد', 'يبدأ الليل بعد قليل'];
            if (!me.alive) return ['أنت ميت', 'تابع بصمت، ولا تكشف شيئًا في شات البث'];
            if (ph === 'night') {
                if (!me.actor) return ['القرية نايمة', 'انتظر الصبح'];
                if (me.confirmed) return ['تم اختيارك', 'انتظر الصبح'];
                return [ACT_HEAD[me.role] || '', 'قبل انتهاء الليل'];
            }
            if (ph === 'dawn') return ['طلع الصبح على القرية', 'شوف الشاشة: مين مات ومين نجا'];
            if (ph === 'day') return ['النقاش: اكتب للقرية', 'التصويت بعد النقاش'];
            if (ph === 'vote') return me.vote ? [me.vote === 'skip' ? 'تخطّيت التصويت' : 'صوّتّ على رقم ' + (P(me.vote).seat + 1), 'صوتك نهائي ولا يتغيّر'] : ['صوّت: من المافيا؟', 'صوتك نهائي ولا يتغيّر'];
            if (ph === 'verdict') return ['قرار القرية', 'شوف الشاشة'];
            return ['', ''];
        }
        function bodyHtml(me) {
            var ph = G.phase;
            if (ph === 'over') return bigRole(me) + events(me);
            if (ph === 'reveal') return bigRole(me);
            if (!me.alive) return band(me) + villagers(me);
            if (ph === 'night') return band(me) + (me.actor ? nightPanel(me) : state(me.role === 'sniper' ? '🎯' : '😴', me.role === 'sniper' ? 'خلصت رصاصتك' : 'نام… القرية نايمة', me.role === 'mayor' ? 'ما عندك شي بالليل. بكرة صوتك بصوتين 👑' : me.role === 'jester' ? 'بكرة خلّهم يشكّون فيك… هدفك يطردونك.' : 'ما عندك شي بالليل. انتظر الصبح.'));
            if (ph === 'dawn') return band(me) + notices(me) + villagers(me);
            if (ph === 'day') return notices(me);
            if (ph === 'vote') return band(me) + votePanel(me);
            if (ph === 'verdict') return band(me) + verdict() + events(me);
            return '';
        }

        function tick() {
            if (!G) return;
            var show = G.endsAt && ['over', 'dawn', 'verdict'].indexOf(G.phase) < 0;
            $('vvClock').classList.toggle('hide', !show);
            if (show) $('vvClock').textContent = Math.max(0, Math.ceil((G.endsAt - NET.now()) / 1000));
            if (G.phase === 'verdict') renderBody();
        }
        setInterval(tick, 400);
        function renderBody() {
            var html = bodyHtml(G.me), b = $('vvBody');
            if (html === bodyKey) return;
            var sc = b.scrollTop, g = b.querySelector('.vv-grid'), gs = g ? g.scrollTop : 0;
            bodyKey = html; b.innerHTML = html; b.scrollTop = sc;
            var g2 = b.querySelector('.vv-grid'); if (g2) g2.scrollTop = gs;
            b.classList.toggle('fill', !!b.querySelector('.vv-panel'));
        }
        function render(g) {
            G = g; if (!G || !G.me) return;
            var me = G.me, mp = P(me.id) || {};
            if (G.phase + G.phaseAt !== lastPhase) {
                lastPhase = G.phase + G.phaseAt;
                if (G.phase !== 'day') open.mafia = false;   // الليل والتصويت: اللوحة أول، وشات المافيا مصغّر
                $('vvAt').classList.add('hide');
                if (G.phase === 'day') { tab = 'city'; open.city = true; }
            }
            var tk = (mp.name || '') + (mp.seat || 0) + (api.photo ? api.photo(mp) || '' : '');
            tk += me.alive ? '' : ':dead';
            if (tk !== topKey) { topKey = tk; $('vvTop').innerHTML = '<div class="vv-me">' + av(mp, 52) + '<span>' + esc(mp.name || '') + '</span></div><div style="display:flex;gap:8px">' + (me.alive ? '' : '<span class="vv-dead">ℹ ميت</span>') + '<span class="vv-num">رقمك <b>' + ((mp.seat || 0) + 1) + '</b></span></div>'; }
            $('vvHead').classList.toggle('dead', !me.alive && G.phase !== 'over');
            $('vvTop').classList.toggle('hide', G.phase === 'day' && me.alive);   // النهار: الشات ياخذ الشاشة
            var h = head(me); $('vvHT').textContent = h[0]; $('vvHS').textContent = h[1];
            tick(); renderBody(); renderDock();
        }
        return { render: render, destroy: function () { document.body.classList.remove('vv-on'); } };
    }

    window.MafiaVillagePhone = { mount: mount };
})();
