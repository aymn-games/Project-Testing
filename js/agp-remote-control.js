/**
 * «التحكم عن بعد» (AGP.remoteControl) — الستريمر يعطي لاعب أو أكثر صلاحية
 * تشغيل ألعابه كاملة: من شاشة جوالهم/آيبادهم (control.html — أزرار
 * وإعدادات) أو بأوامر يكتبونها بشات البث. الاثنين نفس الأوامر بالضبط.
 *
 * كيف يشتغل:
 *  - الستريمر يدير المتحكمين من بروفايله (profile.html → «معلومات الستريمر»
 *    → «التحكم عن بعد»): مفتاح عام، وحتى 5 يوزرات تيك توك لكل واحد مفتاح
 *    تشغيل/إيقاف. محفوظ بالخادم (backend/remote-control/).
 *  - المتحكم (حساب موثّق بنفس يوزر تيك توك) يطلع له زر «لوحة التحكم»
 *    ببروفايله يفتح control.html.
 *  - كل صفحة لعبة مربوطة تستدعي attach({game, page, commands, status}).
 *    هالملف يفتح اتصال '/ws/remote' (صفحة الستريمر = host)، يرسل للجوال وصف
 *    الشاشة الحالية (الإعدادات بقيمها، الأزرار، الأوامر)، وينفّذ اللي يوصل
 *    من الجوال. وأوامر الشات تنفحص بقائمة المتحكمين اللي يرسلها الخادم.
 *  - الجوال يقدر يختار لعبة: الصفحة تنتقل لإعداداتها (AGP.remoteGames).
 *
 * الأمان:
 *  - أمر الشات يُقبل بس من تعليق معرّفه (payload.id) = 'tiktok:<يوزر>' لأحد
 *    المتحكمين الفعّالين — المعرّف الثابت من الخادم، مو الاسم الظاهر.
 *  - قائمة المتحكمين من الخادم بس (src:'server' بالتخزين المحلي)؛ أي إيقاف
 *    من الستريمر يوصل كل صفحاته المفتوحة فوراً ويقفل جوال المتحكم.
 *  - الأوامر بالشات تبدأ بـ ! فما تختلط بكلمة الدخول أو أرقام اللاعبين.
 *
 * الاستخدام من صفحة لعبة (بعد تحميل agp-core + agp-events + الأدابتر + auth-client):
 *   var rc = AGP.remoteControl.attach({
 *     game: 'elimination-roulette',  // معرّف اللعبة بـ AGP.remoteGames
 *     page: 'الإعدادات',             // اسم الشاشة
 *     connect: ER.connect,           // اتصال الشات بالبث (اختياري)
 *     status: function () { return 'باقي 12 لاعب'; },   // سطر حالة للجوال (اختياري)
 *     commands: [{
 *       names: ['ابدأ'],             // أول اسم = اسم الأمر بالجوال
 *       args: '<اسم>' | '[تشغيل / ايقاف]',  // <> إلزامي، [] اختياري
 *       desc: 'شرح',  label: 'نص الزر بالجوال (اختياري)',
 *       tone: 'primary' | 'danger',  confirm: 'سؤال تأكيد بالجوال (اختياري)',
 *       pick: function () { return ['اسم1', 'اسم2']; },   // خيارات للـ args بالجوال
 *       ui: { type: 'choice'|'toggle'|'number'|'text', options, min, max, step, get },  // يطلع كإعداد بقيمته
 *       section: 'عنوان قسم الإعداد',  phone: false (ما يطلع بالجوال — للشات بس),
 *       run: function (arg, ctx) { return 'تم' | { ok: false, msg: 'السبب' } | null; }
 *     }]
 *   });
 *   rc.detach();  rc.push();  // push = أرسل وصف الشاشة للجوال الحين
 *
 * مساعدات للأوامر:
 *   AGP.remoteControl.settingsCommands(sections, {get, set}) — أوامر جاهزة من
 *     تعريف صفوف الإعدادات (text/number/choice/toggle) لأي صف فيه rc:[أسماء]،
 *     وتطلع بالجوال كإعدادات بقيمها.
 *   AGP.remoteControl.captureToast(obj, fn) — يشغّل fn ويرجع أول رسالة
 *     toastMsg طلعت أثناءه (رسائل الخطأ الموجودة باللعبة) أو null.
 */
(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }

    var STORAGE_KEY = 'agp:remote-control';
    var MAX_USERS = 5;
    var PREFIXES = ['!', '！', '¡'];
    var PUSH_EVERY_MS = 1000;

    // جذر الموقع من مكان هالملف (js/ ← ../)
    var SITE_ROOT = (function () {
        try { return new URL('../', (document.currentScript && document.currentScript.src) || location.href).href; } catch (e) { return '/'; }
    }());

    // ---------- أدوات ----------

    /** تطبيع للمقارنة: التشكيل، أشكال الألف/التاء/الياء، الأرقام العربية، "ال" أول كل كلمة. */
    function norm(s) {
        return String(s == null ? '' : s).normalize('NFKC').trim()
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .replace(/[ً-ٰٟـ]/g, '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
            .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
            .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '')
            .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/).filter(Boolean).map(function (w) { return w.length > 3 ? w.replace(/^ال/, '') : w; }).join(' ');
    }
    function cleanUser(u) {
        return String(u == null ? '' : u).trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9._]/g, '');
    }
    function toInt(s) {
        var t = String(s == null ? '' : s)
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .replace(/[^\d-]/g, '');
        if (!t || t === '-') return null;
        var n = parseInt(t, 10);
        return isNaN(n) ? null : n;
    }
    var ON_WORDS = ['تشغيل', 'شغل', 'شغله', 'فعل', 'تفعيل', 'فتح', 'افتح', 'نعم', 'اي', 'ايه', 'on', '1'];
    var OFF_WORDS = ['ايقاف', 'وقف', 'اوقف', 'طفي', 'اطفي', 'قفل', 'اقفل', 'الغاء', 'لا', 'off', '0'];
    /** تشغيل/إيقاف من نص → true/false، أو null لو غير واضح. */
    function parseBool(s) {
        var n = norm(s);
        if (!n) return null;
        if (ON_WORDS.map(norm).indexOf(n) >= 0) return true;
        if (OFF_WORDS.map(norm).indexOf(n) >= 0) return false;
        return null;
    }
    /** أقرب خيار لنص المتحكم: مطابق ← يبدأ به ← يحتويه. يرجع رقم الخيار أو -1. */
    function matchOption(options, s) {
        var q = norm(s);
        if (!q) return -1;
        var N = options.map(norm), i;
        for (i = 0; i < N.length; i++) if (N[i] === q) return i;
        for (i = 0; i < N.length; i++) if (N[i].indexOf(q) === 0) return i;
        for (i = 0; i < N.length; i++) if (N[i].indexOf(q) >= 0) return i;
        return -1;
    }
    function auth() { return window.AGPAuth || null; }

    // ---------- قائمة المتحكمين (من الخادم) ----------

    /** آخر قائمة وصلت من الخادم. نسخة قديمة بدون src:'server' (النظام القديم) ما تُعتمد. */
    function readConfig() {
        var c = null;
        try { c = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { c = null; }
        if (!c || typeof c !== 'object' || c.src !== 'server') return { enabled: false, users: [] };
        var users = Array.isArray(c.users) ? c.users.map(cleanUser).filter(Boolean) : [];
        return { enabled: users.length > 0, users: users };
    }
    /** قائمة النظام القديم (محفوظة بالمتصفح بس) — تنتقل للخادم مرة وحدة من نافذة البروفايل. */
    function readLegacyUsers() {
        var c = null;
        try { c = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { c = null; }
        if (!c || c.src === 'server' || !Array.isArray(c.users)) return [];
        return c.users.map(cleanUser).filter(Boolean).slice(0, MAX_USERS);
    }
    function writeActive(users) {
        var before = JSON.stringify(readConfig());
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ src: 'server', users: users || [], at: Date.now() })); } catch (e) {}
        if (JSON.stringify(readConfig()) !== before) notifyChanged();
        if (readConfig().enabled) ensureConnected();
    }
    function isController(payload) {
        if (!payload || typeof payload.id !== 'string') return null;
        var c = readConfig();
        if (!c.enabled) return null;
        var id = payload.id.toLowerCase();
        if (id.indexOf('tiktok:') !== 0) return null;
        var u = cleanUser(id.slice(7));
        return c.users.indexOf(u) >= 0 ? u : null;
    }

    // ---------- الصفحة الحالية وأوامرها ----------

    var _page = null; // {game, page, connect, overlayChat, status, commands, mirror}
    var _unsub = null;
    var _explicit = false; // الصفحة ربطت نفسها (attach) — ما نسوي ربط تلقائي فوقها

    function notifyChanged() {
        try { window.dispatchEvent(new CustomEvent('agp:remote-control-changed', { detail: readConfig() })); } catch (e) {}
    }

    function games() { return AGP.remoteGames || []; }
    function readyGames() { return games().filter(function (g) { return g.ready; }); }

    function globalCommands() {
        return [
            { names: ['اوامر', 'الاوامر', 'مساعده', 'help'], desc: 'يعرض أوامر هذه الشاشة', phone: false, run: function () { showHelp(); return null; } },
            { names: ['لعبه', 'العاب', 'افتح'], args: '<اسم اللعبة>', desc: 'يفتح إعدادات لعبة', phone: false, run: function (arg) {
                var list = readyGames();
                if (!String(arg || '').trim()) return { ok: false, msg: 'الألعاب: ' + list.map(function (g) { return g.name; }).join(' / ') };
                var k = matchOption(list.map(function (g) { return g.name; }), arg);
                if (k < 0) return { ok: false, msg: 'ما لقيت لعبة بهذا الاسم — الألعاب: ' + list.map(function (g) { return g.name; }).join(' / ') };
                return openGame(list[k].id);
            } },
            { names: ['المكتبه', 'مكتبه'], desc: 'يرجع لمكتبة الألعاب', phone: false, run: function () { return openGame('library'); } }
        ];
    }
    function allCommands() {
        var list = ((_page && _page.commands) || []).concat(globalCommands());
        if (_page && _page.mirror) list = list.concat(mirrorCommands());
        return list;
    }
    function findCommand(word) {
        var w = norm(word), list = allCommands();
        for (var i = 0; i < list.length; i++) {
            if ((list[i].names || []).some(function (n) { return norm(n) === w; })) return list[i];
        }
        return null;
    }

    /**
     * "!كلمة صقر" → {cmd:'كلمة', arg:'صقر'} أو null لو ما هو أمر. اسم الأمر
     * ممكن يكون أكثر من كلمة ("!كلمة الدخول صقر"): نجرب أطول بداية تطابق أمر.
     */
    function parse(text) {
        var t = String(text == null ? '' : text).trim();
        var p = PREFIXES.filter(function (x) { return t.indexOf(x) === 0; })[0];
        if (!p) return null;
        t = t.slice(p.length).trim();
        if (!t) return null;
        var words = t.split(/\s+/);
        for (var k = Math.min(4, words.length); k > 1; k--) {
            var name = words.slice(0, k).join(' ');
            if (findCommand(name)) return { cmd: name, arg: words.slice(k).join(' ') };
        }
        var m = t.match(/^(\S+)\s*([\s\S]*)$/);
        return m ? { cmd: m[1], arg: (m[2] || '').trim() } : null;
    }

    /** ينفّذ أمر (من الشات أو الجوال) ويرجع {ok, msg} أو null (ما يحتاج رد). */
    function execute(cmdWord, arg, user, payload) {
        var c = findCommand(cmdWord);
        if (!c) return { ok: false, msg: 'أمر غير معروف — اكتب !اوامر' };
        var res;
        try { res = c.run(arg, { user: user, payload: payload || null }); } catch (e) {
            AGP.log('Remote control: command failed', e);
            res = { ok: false, msg: 'تعذّر تنفيذ الأمر' };
        }
        schedulePush(200);
        if (res == null) return null;
        return typeof res === 'string' ? { ok: true, msg: res } : res;
    }

    function onComment(payload) {
        if (!_page || !payload || typeof payload.text !== 'string') return;
        var user = isController(payload);
        if (!user) return;
        var p = parse(payload.text);
        if (!p) return;
        var res = execute(p.cmd, p.arg, user, payload);
        if (res) feedback(user, res);
    }

    function ensureConnected() {
        if (!_page || !readConfig().enabled || typeof _page.connect !== 'function') return;
        try { _page.connect(); } catch (e) {}
    }

    /** يفتح لعبة (أو المكتبة) بنفس التبويب. */
    function openGame(id) {
        if (id === 'library') {
            if (!_page || !_page.game) return { ok: true, msg: 'أنت بمكتبة الألعاب' };
            setTimeout(function () { location.href = SITE_ROOT + 'games.html'; }, 700);
            return { ok: true, msg: 'رجوع لمكتبة الألعاب' };
        }
        var g = AGP.remoteGames && AGP.remoteGames.find ? AGP.remoteGames.find(id) : null;
        if (!g) return { ok: false, msg: 'لعبة غير معروفة' };
        if (!g.ready) return { ok: false, msg: g.name + ': التحكم فيها قريباً' };
        if (_page && _page.game === g.id) return { ok: true, msg: g.name + ' مفتوحة الحين' };
        setTimeout(function () { location.href = SITE_ROOT + g.url; }, 700);
        return { ok: true, msg: 'جارٍ فتح ' + g.name };
    }

    function attach(opts) {
        detach();
        _page = {
            game: (opts && opts.game) || null,
            page: (opts && opts.page) || '',
            overlayChat: !!(opts && opts.overlayChat),
            connect: opts && opts.connect,
            status: opts && opts.status,
            commands: (opts && opts.commands) || [],
            mirror: !!(opts && opts.mirror),
            mirrorExclude: (opts && opts.mirrorExclude) || '',
            auto: !!(opts && opts._auto)
        };
        if (!_page.auto) _explicit = true;
        if (AGP.events && typeof AGP.events.on === 'function') {
            _unsub = AGP.events.on('stream:commentReceived', onComment);
        }
        loadGames();
        ensureConnected();
        notifyChanged();
        hostStart();
        schedulePush(300);
        return {
            detach: detach,
            push: function () { schedulePush(50); },
            setCommands: function (list) { if (_page) { _page.commands = list || []; schedulePush(100); } }
        };
    }
    function detach() {
        if (typeof _unsub === 'function') { try { _unsub(); } catch (e) {} }
        _unsub = null;
        _page = null;
        notifyChanged();
    }

    /** قائمة الألعاب (js/agp-remote-games.js) لو الصفحة ما حمّلتها. */
    function loadGames() {
        if (AGP.remoteGames || document.getElementById('agp-remote-games-js')) return;
        var s = document.createElement('script');
        s.id = 'agp-remote-games-js';
        s.src = SITE_ROOT + 'js/agp-remote-games.js';
        s.onload = function () { schedulePush(50); };
        (document.head || document.documentElement).appendChild(s);
    }

    // ---------- اتصال صفحة الستريمر بالخادم (/ws/remote) ----------

    var _ws = null, _wsTries = 0, _wsRetryT = 0, _wsPingT = 0, _wsStop = false, _wsReady = false;
    var _lastSent = '', _pushT = 0, _pushLoop = 0;

    function wsUrl() {
        try { var q = new URLSearchParams(location.search).get('rcws'); if (q) return q; } catch (e) {}
        var h = location.hostname;
        if (h === 'localhost' || h === '127.0.0.1') return 'ws://' + h + ':8787/ws/remote';
        var base = (auth() && auth().API_BASE) || 'https://project-testing-akds.onrender.com';
        return base.replace(/^http/, 'ws') + '/ws/remote';
    }
    function canHost() {
        var A = auth();
        if (!A || !A.getToken || !A.getToken()) return false;
        var u = A.getCachedUser ? A.getCachedUser() : null;
        return !u || (A.isStreamerAccount ? A.isStreamerAccount(u) : true);
    }
    function wsSend(obj) {
        if (_ws && _ws.readyState === 1 && _wsReady) { try { _ws.send(JSON.stringify(obj)); return true; } catch (e) {} }
        return false;
    }
    function hostStart() {
        if (_wsStop || _ws || !canHost() || typeof WebSocket !== 'function') return;
        var ws;
        try { ws = new WebSocket(wsUrl()); } catch (e) { hostRetry(); return; }
        _ws = ws; _wsReady = false;
        ws.onopen = function () {
            try { ws.send(JSON.stringify({ t: 'host', auth: auth().getToken() })); } catch (e) {}
        };
        ws.onmessage = function (ev) {
            var m;
            try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (!m) return;
            if (m.t === 'hosted') {
                _wsReady = true; _wsTries = 0; _lastSent = '';
                writeActive(m.controllers);
                schedulePush(50);
                clearInterval(_wsPingT);
                _wsPingT = setInterval(function () { wsSend({ t: 'ping' }); }, 20000);
            } else if (m.t === 'controllers') {
                writeActive(m.list);
            } else if (m.t === 'cmd') {
                var res = _page ? execute(m.cmd, m.arg, m.from, null) : { ok: false, msg: 'الشاشة تنتقل — جرّب بعد لحظة' };
                wsSend({ t: 'res', c: m.c, id: m.id, ok: !res || res.ok !== false, msg: res ? res.msg : 'تم' });
                if (res && m.from) feedback(m.from, res);
            } else if (m.t === 'open') {
                var r = openGame(m.game);
                wsSend({ t: 'res', c: m.c, id: m.id, ok: r.ok !== false, msg: r.msg });
                if (m.from) feedback(m.from, r);
            } else if (m.t === 'err') {
                // ما هو حساب ستريمر/جلسة منتهية — ما نعيد المحاولة بهالصفحة
                if (m.err === 'login' || m.err === 'not_streamer') _wsStop = true;
            }
        };
        ws.onclose = function () {
            if (_ws === ws) { _ws = null; _wsReady = false; }
            clearInterval(_wsPingT);
            hostRetry();
        };
        ws.onerror = function () { try { ws.close(); } catch (e) {} };
    }
    function hostRetry() {
        if (_wsStop || _wsRetryT || !_page) return;
        var d = Math.min(1000 * Math.pow(2, _wsTries), 30000);
        _wsTries++;
        _wsRetryT = setTimeout(function () { _wsRetryT = 0; hostStart(); }, d);
    }

    /** قيمة إعداد للجوال: للاختيار نص الخيار، للتبديل true/false. */
    function uiValue(ui, raw) {
        if (ui.type === 'choice') {
            if (typeof raw === 'number') return ui.options && ui.options[raw] != null ? ui.options[raw] : null;
            return raw == null ? null : String(raw);
        }
        if (ui.type === 'toggle') return !!raw;
        if (ui.type === 'multi') return (Array.isArray(raw) ? raw : []).map(function (k) { return typeof k === 'number' && ui.options ? ui.options[k] : k; }).filter(function (x) { return x != null; });
        if (ui.type === 'number') return raw === '' || raw == null ? null : Number(raw);
        return raw == null ? '' : String(raw);
    }

    /** وصف الشاشة الحالية للجوال: الإعدادات بقيمها، الأزرار، الأوامر. */
    function snapshot() {
        if (!_page) return null;
        var sections = [], bySec = {}, actions = [];
        (_page.commands || []).forEach(function (c) {
            if (!c || !c.names || !c.names.length || c.phone === false) return;
            if (typeof c.when === 'function') { try { if (!c.when()) return; } catch (e) { return; } }
            var name = c.names[0];
            if (c.ui) {
                var raw = null;
                try { raw = typeof c.ui.get === 'function' ? c.ui.get() : null; } catch (e) { raw = null; }
                var sec = c.section || 'الإعدادات';
                if (!bySec[sec]) { bySec[sec] = { title: sec, items: [] }; sections.push(bySec[sec]); }
                bySec[sec].items.push({
                    id: name, cmd: name, label: c.label || c.desc || name, type: c.ui.type, desc: c.ui.desc || '',
                    options: c.ui.options || null, min: c.ui.min, max: c.ui.max, step: c.ui.step,
                    placeholder: c.ui.placeholder || '', value: uiValue(c.ui, raw)
                });
                return;
            }
            var a = { cmd: name, label: c.label || c.desc || name, desc: c.label ? (c.desc || '') : '', args: c.args || '', tone: c.tone || '', confirm: c.confirm || '', icon: c.icon || '' };
            if (typeof c.pick === 'function') { try { a.pick = (c.pick() || []).slice(0, 200).map(String); } catch (e) {} }
            actions.push(a);
        });
        if (_page.mirror) {
            var scr = scanScreen(_page.mirrorExclude);
            scr.actions.forEach(function (a) { actions.push(a); });
            if (scr.items.length) sections.push({ title: 'خانات الشاشة', items: scr.items });
        }
        var status = '';
        if (typeof _page.status === 'function') { try { status = String(_page.status() || ''); } catch (e) { status = ''; } }
        var g = _page.game && AGP.remoteGames && AGP.remoteGames.find ? AGP.remoteGames.find(_page.game) : null;
        return {
            v: 1,
            game: _page.game,
            gameName: g ? g.name : (_page.game ? _page.game : 'مكتبة الألعاب'),
            page: _page.page,
            status: status.slice(0, 300),
            sections: sections,
            actions: actions,
            help: cmdLines().filter(function (l) { return l[0] !== '!اوامر'; })
        };
    }
    function push() {
        // أكثر من تبويب مفتوح عند الستريمر: التبويب الظاهر هو اللي يستلم التحكم (الخادم يوجّه للي أرسل آخر وصف)
        if (!_wsReady || document.hidden) return;
        var s = snapshot();
        if (!s) return;
        var j = JSON.stringify(s);
        if (j === _lastSent) return;
        if (wsSend({ t: 'state', s: s })) _lastSent = j;
    }
    function schedulePush(ms) {
        clearTimeout(_pushT);
        _pushT = setTimeout(push, ms || 0);
        if (!_pushLoop) _pushLoop = setInterval(push, PUSH_EVERY_MS); // تغييرات الستريمر نفسه من الشاشة
    }


    // ---------- قالب الألعاب (إعدادات ← لوبي) ----------

    var SETTING_TYPES = ['text', 'number', 'choice', 'toggle', 'multi'];
    function labelName(l) { return String(l || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(); }
    function settingHint(r) {
        return r.type === 'choice' || r.type === 'multi' ? r.options.join(' / ') : r.type === 'toggle' ? 'تشغيل / ايقاف'
            : r.type === 'number' ? ((r.min != null ? r.min : 0) + '–' + (r.max != null ? r.max : 999)) : 'نص';
    }

    /**
     * شاشة إعدادات القالب (games/<id>/index.html — SETTINGS + class Component
     * فيها state.values و set(k,v) و renderVals().start()): كل صف يطلع بالجوال
     * بقيمته، وكل صف أمر شات باسمه ("!الحد الأقصى للاعبين 30")، وزر «ابدأ».
     * الاستخدام بـ componentDidMount: AGP.remoteControl.templateSettings(this, SETTINGS, {game:'bomb'})
     */
    function templateSettings(comp, SETTINGS, opts) {
        opts = opts || {};
        var api = { get: function (k) { return comp.state.values[k]; }, set: function (k, v) { comp.set(k, v); } };
        var cmds = [];
        (SETTINGS || []).forEach(function (sec) {
            (sec.rows || []).forEach(function (r) {
                if (!r || !r.key || SETTING_TYPES.indexOf(r.type) < 0) return;
                var nm = labelName(r.label);
                cmds.push({
                    names: (r.rc || []).concat([nm]), args: '<' + settingHint(r) + '>', desc: r.label, section: sec.title || 'الإعدادات',
                    when: r.showIf ? function () { return !!comp.state.values[r.showIf]; } : null,
                    ui: { type: r.type, options: r.options || null, min: r.min, max: r.max, step: r.step, placeholder: r.placeholder || '', desc: r.hint || '', get: function () { return comp.state.values[r.key]; } },
                    run: function (arg) { return settingRun(r, arg, api); }
                });
            });
        });
        cmds.push({ names: ['ابدأ', 'ابدا', 'بدء'], label: opts.startLabel || 'ابدأ — افتح اللوبي', desc: 'يحفظ الإعدادات ويكمل', tone: 'primary', icon: '▶', run: function () {
            if (comp.state.connOpen) return null;
            var vals = typeof comp.renderVals === 'function' ? comp.renderVals() : null;
            if (!vals || typeof vals.start !== 'function') return { ok: false, msg: 'ابدأ من الشاشة' };
            var err = typeof comp.toastMsg === 'function' ? captureToast(comp, function () { vals.start(); }) : (vals.start(), null);
            return err ? { ok: false, msg: err } : 'تم — جارٍ الانتقال';
        } });
        return attach({
            game: opts.game, page: opts.page || 'الإعدادات', connect: opts.connect,
            commands: cmds.concat(opts.commands || []),
            status: opts.status || function () { return 'live' in comp.state ? (comp.state.live ? '🟢 متصل بالبث' : '🔴 غير متصل بالبث — الستريمر يبدأ البث ونتصل تلقائياً') : ''; }
        });
    }

    /**
     * لوبي القالب (games/<id>/lobby.html — TEAMS + state.roster:[[أسماء], …]
     * و renderVals().start()): الحالة (العدد وكلمة الدخول لكل فريق)، «ابدأ
     * المباراة»، «طرد لاعب» من قائمة الأسماء، و«رجوع للإعدادات».
     */
    function templateLobby(comp, TEAMS, opts) {
        opts = opts || {};
        var roster = function () { return Array.isArray(comp.state.roster) ? comp.state.roster : []; };
        var all = function () { var out = []; roster().forEach(function (l) { (l || []).forEach(function (n) { out.push(n); }); }); return out; };
        var teams = TEAMS || [];
        return attach({
            game: opts.game, page: opts.page || 'اللوبي', connect: opts.connect,
            status: function () {
                return teams.map(function (t, i) {
                    var n = (roster()[i] || []).length;
                    return (teams.length > 1 ? (t.name || t.label || ('فريق ' + (i + 1))) + ': ' : 'باللوبي ') + n + (t.max ? ' من ' + t.max : '') + (t.keyword ? ' · كلمة الدخول «' + t.keyword + '»' : '');
                }).join(' — ');
            },
            commands: [
                { names: ['ابدأ', 'ابدا', 'بدء', 'العب'], label: 'ابدأ المباراة', desc: 'بلاعبين اللوبي', tone: 'primary', icon: '▶', run: function () {
                    if (comp._rcGo) return null;
                    var vals = comp.renderVals(), err = typeof comp.toastMsg === 'function' ? captureToast(comp, function () { vals.start(); }) : (vals.start(), null);
                    if (err) return { ok: false, msg: err };
                    comp._rcGo = true;
                    return 'بدأت المباراة بـ ' + all().length + ' لاعب';
                } },
                { names: ['طرد', 'اطرد', 'شيل'], args: '<اسم اللاعب>', label: 'طرد لاعب', desc: 'يشيله من اللوبي', tone: 'danger', icon: '✕', pick: all, run: function (arg) {
                    var q = norm(arg); if (!q) return { ok: false, msg: 'اكتب اسم اللاعب' };
                    var list = all(), n = list.filter(function (x) { return norm(x) === q; })[0] || list.filter(function (x) { return norm(x).indexOf(q) === 0; })[0];
                    if (!n) return { ok: false, msg: 'ما لقيت لاعب بهذا الاسم' };
                    comp.setState(function (st) { return { roster: st.roster.map(function (l) { return (l || []).filter(function (x) { return x !== n; }); }) }; });
                    return 'تم طرد ' + n;
                } },
                { names: ['رجوع', 'الاعدادات'], label: 'رجوع للإعدادات', icon: '↩', run: function () { setTimeout(function () { location.href = 'index.html'; }, 700); return 'رجوع للإعدادات'; } }
            ].concat(opts.commands || [])
        });
    }

    // ---------- ألعاب agp-game-shell.js (settingsFields) ----------

    function shellCommands() {
        var GS = AGP.gameShell, cfg = GS && GS.getConfig ? GS.getConfig() : null;
        if (!cfg) return [];
        return (cfg.settingsFields || []).map(function (f) {
            if (!f || !f.key) return null;
            var get = function () { return GS.getSettings()[f.key]; };
            var when = f.showWhen ? function () { return GS.getSettings()[f.showWhen.key] === f.showWhen.equals; } : null;
            var base = { names: [labelName(f.label)], desc: f.label, section: 'الإعدادات', when: when };
            if (f.type === 'pill-choice' || f.type === 'pill-group') {
                var labels = (f.options || []).map(function (o) { return String(o.label); });
                return Object.assign(base, { args: '<' + labels.join(' / ') + '>', ui: { type: 'choice', options: labels, desc: f.description || '', get: function () {
                    var v = get(), o = (f.options || []).filter(function (x) { return x.value === v; })[0]; return o ? String(o.label) : null; } },
                    run: function (arg) { var k = matchOption(labels, arg); if (k < 0) return { ok: false, msg: f.label + ': ' + labels.join(' / ') };
                        GS.setSetting(f.key, f.options[k].value); return f.label + ': ' + labels[k]; } });
            }
            if (f.type === 'counter' || f.type === 'slider') {
                var mn = typeof f.min === 'number' ? f.min : 0, mx = typeof f.max === 'number' ? f.max : (f.type === 'slider' ? 10 : 999);
                return Object.assign(base, { args: '<' + mn + '–' + mx + '>', ui: { type: 'number', min: mn, max: mx, step: f.step || 1, desc: f.description || '', get: get },
                    run: function (arg) { var n = toInt(arg); if (n == null || n < mn || n > mx) return { ok: false, msg: f.label + ' من ' + mn + ' إلى ' + mx };
                        GS.setSetting(f.key, n); return f.label + ': ' + n; } });
            }
            if (f.type === 'toggle') {
                return Object.assign(base, { args: '[تشغيل / ايقاف]', ui: { type: 'toggle', desc: f.description || '', get: get },
                    run: function (arg) { var v = String(arg || '').trim() ? parseBool(arg) : !get(); if (v == null) return { ok: false, msg: f.label + ': تشغيل أو ايقاف' };
                        GS.setSetting(f.key, v); return f.label + ': ' + (v ? 'تشغيل' : 'ايقاف'); } });
            }
            return null;
        }).filter(Boolean);
    }

    // ---------- «أزرار الشاشة»: كل زر وخانة ظاهرة عند الستريمر تطلع بالجوال ----------

    var MIRROR_SKIP = '.agp-rc-ov,.agp-rc-toasts,.agp-rc-help,[data-rc-skip]';
    var _mirrorMap = {}, _mirrorSeq = 0;

    function txt(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
    function shown(el) {
        if (!el.getClientRects().length) return false;
        var r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return false;
        for (var n = el, i = 0; n && n.nodeType === 1 && i < 8; n = n.parentElement, i++) {
            var cs = getComputedStyle(n);
            if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.08) return false;
            if (i === 0 && cs.pointerEvents === 'none') return false;
        }
        return true;
    }
    function labelOf(el) {
        var t = txt(el.getAttribute('aria-label')) || txt(el.getAttribute('title')) || txt(el.innerText || el.textContent);
        if (!t && el.labels && el.labels[0]) t = txt(el.labels[0].innerText);
        if (!t) t = txt(el.getAttribute('placeholder')) || txt(el.getAttribute('name'));
        if (t.length > 42) t = t.slice(0, 40) + '…';
        return /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(t) ? t : '';
    }
    var FIELD_SEL = 'button,input,select,textarea,[role="button"]';
    /** عنوان الصف اللي فيه العنصر: أول نص قصير بجانبه (مو داخل زر أو خانة) — «وقت الإجابة» لزر «15 ث». */
    function rowLabel(el) {
        for (var n = el, p = el.parentElement, i = 0; p && i < 4 && p !== document.body; n = p, p = p.parentElement, i++) {
            for (var k = 0; k < p.children.length; k++) {
                var ch = p.children[k];
                if (ch === n || ch.matches(FIELD_SEL) || ch.querySelector(FIELD_SEL)) continue;
                var t = shortText(ch);
                if (t) return t;
            }
        }
        return '';
    }
    /** نص قصير لعنصر: كله لو قصير، وإلا أول سطر فيه (العنوان بدون الوصف). */
    function shortText(node) {
        for (var i = 0; node && i < 4; i++, node = node.firstElementChild) {
            var t = txt(node.textContent);
            if (t && t.length <= 40) return t;
        }
        return '';
    }
    /** زر ضمن مجموعة خيارات (زرين أو أكثر إخوان، مو بهيدر الشاشة)؟ */
    function inGroup(el) {
        var p = el.parentElement, c = 0;
        if (!p || el.closest('header,nav') || el.getBoundingClientRect().top < 90) return false;
        for (var k = 0; k < p.children.length; k++) if (p.children[k].matches(FIELD_SEL)) c++;
        return c >= 2 && c <= 8 && p.children.length === c;
    }
    function toneOf(l) {
        if (/حذف|خروج|انه|إنه|إقصاء|اقصاء|طرد|إلغاء|الغاء|إغلاق|اغلاق|إيقاف|ايقاف/.test(l)) return 'danger';
        if (/ابدأ|ابدا|بدء|تأكيد|تاكيد|التالي|اللوبي|العب|لف|دور|جولة/.test(l)) return 'primary';
        return '';
    }
    /** يقرأ الشاشة: أزرار (actions) وخانات (items) — مع مفتاح ثابت لكل عنصر. */
    function scanScreen(exclude) {
        var actions = [], items = [], count = {}, map = {};
        var els = document.querySelectorAll('button, [role="button"], a[href], input, select, textarea');
        for (var i = 0; i < els.length && (actions.length < 48 || items.length < 16); i++) {
            var el = els[i];
            if (el.closest(MIRROR_SKIP) || (exclude && el.closest(exclude))) continue;
            if (el.disabled || el.getAttribute('aria-disabled') === 'true' || !shown(el)) continue;
            var tag = el.tagName, type = (el.getAttribute('type') || '').toLowerCase();
            if (tag === 'INPUT' && (type === 'hidden' || type === 'file' || type === 'password' || type === 'color')) continue;
            if (tag === 'A') {
                var href = el.getAttribute('href') || '';
                if (href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href) || el.target === '_blank') continue;
                try { if (new URL(href, location.href).origin !== location.origin) continue; } catch (e) { continue; }
            }
            var label = labelOf(el);
            var isField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
            if (isField && !txt(el.getAttribute('aria-label')) && !(el.labels && el.labels[0])) label = rowLabel(el) || label;
            else if (!isField && inGroup(el)) { var ctx = rowLabel(el); if (ctx && ctx !== label) label = ctx + ': ' + label; }
            if (!label) continue;
            var key = el.__agpRcKey || (el.__agpRcKey = 'm' + (++_mirrorSeq).toString(36));
            map[key] = el;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
                if (items.length >= 16) continue;
                var it = { id: key, key: key, cmd: '__set', label: label };
                if (type === 'checkbox' || type === 'radio') { it.type = 'toggle'; it.value = !!el.checked; }
                else if (tag === 'SELECT') { it.type = 'choice'; it.options = Array.prototype.map.call(el.options, function (o) { return txt(o.text); }); it.value = el.selectedIndex >= 0 ? txt(el.options[el.selectedIndex].text) : null; }
                else if (type === 'number' || type === 'range') {
                    it.type = 'number'; it.value = el.value === '' ? null : Number(el.value);
                    it.min = el.min !== '' ? Number(el.min) : undefined; it.max = el.max !== '' ? Number(el.max) : undefined; it.step = el.step && el.step !== 'any' ? Number(el.step) : 1;
                } else { it.type = 'text'; it.value = el.value || ''; it.placeholder = el.getAttribute('placeholder') || ''; }
                items.push(it);
                continue;
            }
            if (actions.length >= 48) continue;
            count[label] = (count[label] || 0) + 1;
            actions.push({ cmd: '__press', key: key, label: label, desc: '', args: '', tone: toneOf(label), confirm: /خروج|إنهاء|انهاء|حذف/.test(label) ? label + '؟' : '', screen: true });
        }
        // أسماء مكررة (زر لكل لاعب مثلاً) → نرقّمها
        var seen = {};
        actions.forEach(function (a) { if (count[a.label] > 1) { seen[a.label] = (seen[a.label] || 0) + 1; a.label = a.label + ' (' + seen[a.label] + ')'; } });
        _mirrorMap = map;
        return { actions: actions, items: items };
    }
    function nativeSet(el, v) {
        var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        var d = Object.getOwnPropertyDescriptor(proto, 'value');
        if (d && d.set) d.set.call(el, v); else el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function liveEl(key) {
        var el = _mirrorMap[key];
        return el && document.contains(el) && shown(el) && !el.disabled ? el : null;
    }
    function pressKey(key) {
        var el = liveEl(String(key || '').trim());
        if (!el) { schedulePush(50); return { ok: false, msg: 'الشاشة تغيّرت — جرّب مرة ثانية' }; }
        var l = labelOf(el);
        el.click();
        return 'تم: ' + l;
    }
    function setKey(arg) {
        var a = String(arg || ''), i = a.indexOf('|');
        var el = liveEl(i < 0 ? a : a.slice(0, i)), v = i < 0 ? '' : a.slice(i + 1);
        if (!el) { schedulePush(50); return { ok: false, msg: 'الشاشة تغيّرت — جرّب مرة ثانية' }; }
        var l = labelOf(el), type = (el.getAttribute('type') || '').toLowerCase();
        if (type === 'checkbox' || type === 'radio') {
            var want = parseBool(v); if (want == null) want = !el.checked;
            if (el.checked !== want) el.click();
            return l + ': ' + (want ? 'تشغيل' : 'ايقاف');
        }
        if (el.tagName === 'SELECT') {
            var k = matchOption(Array.prototype.map.call(el.options, function (o) { return txt(o.text); }), v);
            if (k < 0) return { ok: false, msg: 'خيار غير موجود' };
            nativeSet(el, el.options[k].value);
            return l + ': ' + txt(el.options[k].text);
        }
        nativeSet(el, v);
        return l + ': ' + (v || '—');
    }
    function mirrorCommands() {
        return [
            { names: ['__press'], phone: false, run: pressKey },
            { names: ['__set'], phone: false, run: setKey },
            { names: ['اضغط', 'زر'], args: '<اسم الزر>', desc: 'يضغط زر من أزرار الشاشة', phone: false, run: function (arg) {
                var scr = scanScreen(_page && _page.mirrorExclude);
                var k = matchOption(scr.actions.map(function (a) { return a.label; }), arg);
                if (k < 0) return { ok: false, msg: 'ما لقيت زر بهذا الاسم — الأزرار: ' + scr.actions.slice(0, 12).map(function (a) { return a.label; }).join(' / ') };
                return pressKey(scr.actions[k].key);
            } }
        ];
    }

    // ---------- ربط تلقائي لأي صفحة لعبة ما ربطت نفسها ----------

    /** صفحة لعبة (games/<id>/…) حمّلت هالملف وما استدعت attach → «أزرار الشاشة» (+ إعدادات game-shell). */
    function autoAttach() {
        if (_explicit || _page) return;
        var m = location.pathname.match(/\/(?:discord-)?games\/([a-z0-9-]+)\/([^\/]*)$/i);
        if (!m) return;
        var id = m[1].toLowerCase(), file = (m[2] || 'index.html').toLowerCase();
        if (/^(join|spymaster|admin)/.test(file)) return;
        var page = /^lobby/.test(file) ? 'اللوبي' : /^(game|play)/.test(file) ? 'شاشة اللعب' : /^(index|$)/.test(file) ? 'الشاشة الرئيسية'
            : (txt(document.title).split(/[—-]/)[1] || txt(document.title)).trim();
        var shell = AGP.gameShell && AGP.gameShell.getConfig && AGP.gameShell.getConfig();
        attach({ game: id, page: shell ? 'اللعبة' : page, commands: shell ? shellCommands() : [], mirror: true, mirrorExclude: shell ? '.agp-shell-row' : '', _auto: true });
        if (_page) _page.shell = !!shell;
    }
    /** بعد ما تجهز الصفحة: ربط تلقائي، وإذا game-shell جهز بعده نعيد الربط بإعداداته. */
    function autoLoop() {
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            if (_explicit || tries > 12) { clearInterval(t); return; }
            var shellNow = !!(AGP.gameShell && AGP.gameShell.getConfig && AGP.gameShell.getConfig());
            if (!_page) autoAttach();
            else if (_page.auto && shellNow && !_page.shell) { detach(); autoAttach(); }
            if (_page && (_page.shell || tries > 6)) clearInterval(t);
        }, 1200);
    }
    if (document.readyState !== 'loading') setTimeout(autoLoop, 1200);
    else document.addEventListener('DOMContentLoaded', function () { setTimeout(autoLoop, 1200); });

    // ---------- مساعدات للألعاب ----------

    /**
     * أوامر من صفوف الإعدادات (نفس شكل SETTINGS بالألعاب): أي صف فيه
     * rc:['اسم','اسم ثاني'] يصير أمر يغيّر قيمته، ويطلع بالجوال كإعداد
     * بقيمته الحالية. للصف choice القيمة المحفوظة رقم الخيار، وللـ toggle
     * true/false، وللـ number رقم ضمن min/max، وللـ text النص كما هو.
     */
    function settingsCommands(sections, api) {
        var rows = [];
        (sections || []).forEach(function (s) {
            (s.rows || [s]).forEach(function (r) { if (r && r.rc && r.key) rows.push({ r: r, section: s.rows ? s.title : '' }); });
        });
        return rows.map(function (x) {
            var r = x.r;
            var hint = r.type === 'choice' ? r.options.join(' / ') : r.type === 'toggle' ? 'تشغيل / ايقاف'
                : r.type === 'number' ? ((r.min != null ? r.min : 0) + '–' + (r.max != null ? r.max : 999)) : 'نص';
            var ui = (r.type === 'choice' || r.type === 'toggle' || r.type === 'number' || r.type === 'text') ? {
                type: r.type, options: r.options || null, min: r.min, max: r.max, step: r.step,
                placeholder: r.placeholder || '', get: function () { return api.get(r.key); }
            } : null;
            return {
                names: r.rc, args: '<' + hint + '>', desc: r.label, section: x.section || 'الإعدادات', ui: ui,
                run: function (arg) { return settingRun(r, arg, api); }
            };
        });
    }
    /**
     * تغيير صف إعداد من نص الأمر. للـ choice القيمة رقم الخيار، للـ toggle
     * true/false، للـ number رقم ضمن min/max، للـ multi يقلب الخيار المذكور.
     */
    function settingRun(r, arg, api) {
        var v;
        if (r.type === 'text') {
            v = String(arg || '').trim().slice(0, 40);
            if (!v) return { ok: false, msg: 'اكتب ' + r.label + ' بعد الأمر' };
        } else if (r.type === 'number') {
            v = toInt(arg);
            var mn = r.min != null ? r.min : 0, mx = r.max != null ? r.max : 999;
            if (v == null || v < mn || v > mx) return { ok: false, msg: r.label + ' من ' + mn + ' إلى ' + mx };
        } else if (r.type === 'choice') {
            v = matchOption(r.options, arg);
            if (v < 0) return { ok: false, msg: r.label + ': ' + r.options.join(' / ') };
        } else if (r.type === 'toggle') {
            v = String(arg || '').trim() ? parseBool(arg) : !api.get(r.key);
            if (v == null) return { ok: false, msg: r.label + ': تشغيل أو ايقاف' };
        } else if (r.type === 'multi') {
            var k = matchOption(r.options, arg);
            if (k < 0) return { ok: false, msg: r.label + ': ' + r.options.join(' / ') };
            var cur = (api.get(r.key) || []).slice();
            if (cur.indexOf(k) >= 0) {
                if (cur.length <= (r.minPick || 0)) return { ok: false, msg: r.label + ': لازم يبقى ' + (r.minPick || 1) + ' على الأقل' };
                cur = cur.filter(function (x) { return x !== k; });
            } else cur.push(k);
            v = cur;
        } else {
            return { ok: false, msg: 'هذا الإعداد ما يتغير من الشات' };
        }
        api.set(r.key, v);
        return r.label + ': ' + describe(r, v);
    }
    /** قيمة صف إعداد كنص مقروء. */
    function describe(r, v) {
        if (r.type === 'choice') return r.options[v] != null ? r.options[v] : '—';
        if (r.type === 'toggle') return v ? 'تشغيل' : 'ايقاف';
        if (r.type === 'multi') return (v || []).map(function (k) { return r.options[k]; }).join('، ');
        return v === '' || v == null ? '—' : String(v);
    }
    /** يشغّل fn ويرجع أول رسالة toastMsg طلعت أثناءه (رسالة خطأ اللعبة) أو null. */
    function captureToast(obj, fn) {
        var first = null, orig = obj.toastMsg;
        obj.toastMsg = function (t) { if (first == null) first = t; return orig.apply(obj, arguments); };
        try { fn(); } finally { obj.toastMsg = orig; }
        return first;
    }

    // ---------- الواجهة (نافذة الإدارة بالبروفايل + رسائل الشاشة) ----------

    var CSS = '' +
        '.agp-rc-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(5,3,10,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
        'display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;direction:rtl}' +
        '.agp-rc-box{width:min(460px,100%);max-height:90vh;overflow:auto;box-sizing:border-box;padding:22px;border-radius:22px;' +
        'background:linear-gradient(180deg,#171225,#0e0b17);border:1px solid rgba(167,139,250,.25);color:#f4f2f8;' +
        'font:500 14px "IBM Plex Sans Arabic",system-ui,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.6)}' +
        '.agp-rc-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}' +
        '.agp-rc-title{font-weight:700;font-size:18px;text-align:right}' +
        '.agp-rc-x{width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#c9c4d6;cursor:pointer;font-size:16px}' +
        '.agp-rc-sub{color:#9a95a8;font-size:13px;line-height:1.7;text-align:right;margin:0 0 14px}' +
        '.agp-rc-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;margin-bottom:10px;border-radius:16px;' +
        'border:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.015))}' +
        '.agp-rc-row.is-off{opacity:.6}' +
        '.agp-rc-label{text-align:right;display:flex;flex-direction:column;gap:2px;min-width:0}' +
        '.agp-rc-label b{direction:ltr;unicode-bidi:isolate;text-align:right;overflow:hidden;text-overflow:ellipsis}' +
        '.agp-rc-desc{color:#8a8596;font-size:12px;font-weight:400}' +
        '.agp-rc-desc.ok{color:#6ee7b7}.agp-rc-desc.warn{color:#fbbf24}' +
        '.agp-rc-ctl{display:flex;align-items:center;gap:8px;flex-shrink:0}' +
        '.agp-rc-tg{flex-shrink:0;width:48px;height:28px;border-radius:999px;border:none;cursor:pointer;position:relative;background:rgba(255,255,255,.12);transition:background .2s}' +
        '.agp-rc-tg::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left .2s}' +
        '.agp-rc-tg.is-on{background:linear-gradient(90deg,#7c3aed,#a855f7)}.agp-rc-tg.is-on::after{left:23px}' +
        '.agp-rc-tg:disabled{opacity:.4;cursor:not-allowed}' +
        '.agp-rc-del{width:30px;height:30px;border-radius:50%;border:1px solid rgba(248,113,113,.3);background:rgba(248,113,113,.08);color:#fca5a5;cursor:pointer;font-size:13px}' +
        '.agp-rc-add{display:flex;gap:8px;flex-shrink:0;direction:ltr}' +
        '.agp-rc-in{width:150px;height:38px;box-sizing:border-box;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);' +
        'color:#f4f2f8;padding:0 14px;font:600 14px "IBM Plex Sans Arabic",system-ui,sans-serif;outline:none}' +
        '.agp-rc-in:focus{border-color:rgba(167,139,250,.55)}' +
        '.agp-rc-btn{height:38px;padding:0 16px;border-radius:999px;border:none;cursor:pointer;background:linear-gradient(90deg,#7c3aed,#a855f7);color:#fff;font:700 13px "IBM Plex Sans Arabic",system-ui,sans-serif}' +
        '.agp-rc-btn:disabled{opacity:.5;cursor:default}' +
        '.agp-rc-h{margin:16px 0 8px;font-size:13px;color:#a8a3b5;text-align:right;font-weight:700}' +
        '.agp-rc-empty{color:#6f6a7c;font-size:13px;text-align:right;margin:0 0 12px}' +
        '.agp-rc-err{color:#fca5a5;font-size:13px;text-align:right;margin:0 0 10px;min-height:1px}' +
        '.agp-rc-cmds{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);color:#b9b3c7;font-size:13px;line-height:1.9;text-align:right}' +
        '.agp-rc-cmds b{color:#e9e5f3;font-weight:700}' +
        '.agp-rc-toasts{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483002;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;direction:rtl;width:min(560px,calc(100% - 32px))}' +
        '.agp-rc-toast{max-width:100%;box-sizing:border-box;padding:10px 18px;border-radius:18px;background:rgba(15,12,24,.92);border:1px solid rgba(52,211,153,.45);' +
        'color:#f4f2f8;font:600 14px "IBM Plex Sans Arabic",system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);animation:agpRcIn .3s ease both;text-align:center}' +
        '.agp-rc-toast.is-err{border-color:rgba(248,113,113,.5)}' +
        '.agp-rc-toast small{color:#a78bfa;font-weight:700;margin-inline-end:6px;direction:ltr;unicode-bidi:isolate}' +
        '.agp-rc-help{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-height:80vh;overflow:hidden;z-index:2147483002;width:min(520px,calc(100% - 32px));box-sizing:border-box;direction:rtl;' +
        'padding:16px 18px;border-radius:18px;background:rgba(15,12,24,.94);border:1px solid rgba(167,139,250,.35);color:#d6d1e2;' +
        'font:500 14px "IBM Plex Sans Arabic",system-ui,sans-serif;line-height:1.9;box-shadow:0 20px 60px rgba(0,0,0,.5);animation:agpRcFade .3s ease both;pointer-events:none}' +
        '.agp-rc-help h4{margin:0 0 6px;font-size:15px;color:#f4f2f8;text-align:right}' +
        '.agp-rc-help div{display:flex;justify-content:space-between;gap:12px}.agp-rc-help b{color:#c4b5fd;white-space:nowrap}' +
        '@keyframes agpRcIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}' +
        '@keyframes agpRcFade{from{opacity:0}to{opacity:1}}';

    var _ov = null, _toasts = null, _help = null, _helpT = null;
    var _cfg = null, _cfgErr = '', _busy = false;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }
    function injectCss() {
        if (document.getElementById('agp-rc-css')) return;
        var st = document.createElement('style');
        st.id = 'agp-rc-css';
        st.textContent = CSS;
        (document.head || document.documentElement).appendChild(st);
    }

    var ERRORS = {
        invalid: 'اليوزر غير صحيح — حروف إنجليزية وأرقام ونقطة وشرطة سفلية بس',
        self: 'هذا يوزرك أنت',
        exists: 'اليوزر مضاف أصلاً',
        limit: 'الحد ' + MAX_USERS + ' متحكمين',
        not_found: 'ما لقيت اليوزر',
        not_streamer: 'هذي الميزة لحسابات الستريمر',
        unauthorized: 'سجّل دخولك أولاً'
    };

    /** يحفظ آخر إعدادات من الخادم، ويحدّث القائمة الفعّالة لصفحات هالمتصفح. */
    function applyConfig(r) {
        if (!r || !Array.isArray(r.controllers)) return;
        _cfg = { enabled: !!r.enabled, controllers: r.controllers, max: r.max || MAX_USERS };
        writeActive(_cfg.enabled ? _cfg.controllers.filter(function (c) { return c.enabled; }).map(function (c) { return c.username; }) : []);
    }
    function api(method, body) {
        var A = auth();
        if (!A || !A.request) return Promise.resolve({ success: false, error: 'unauthorized' });
        return A.request('/api/remote-control/config', method === 'POST' ? { method: 'POST', body: body } : {})
            .catch(function () { return { success: false, error: 'network' }; });
    }
    function loadConfig() {
        return api('GET').then(function (r) {
            if (r && r.success) {
                applyConfig(r);
                return migrateLegacy();
            }
            _cfgErr = ERRORS[r && r.error] || 'تعذّر تحميل الإعدادات';
        });
    }
    /** النظام القديم كان يحفظ اليوزرات بالمتصفح بس — ننقلها للخادم مرة وحدة. */
    function migrateLegacy() {
        var old = readLegacyUsers();
        if (!old.length || !_cfg || _cfg.controllers.length) return Promise.resolve();
        return old.reduce(function (p, u) {
            return p.then(function () { return api('POST', { action: 'add', username: u }).then(function (r) { if (r && r.controllers) applyConfig(r); }); });
        }, Promise.resolve());
    }
    function act(body) {
        if (_busy) return;
        _busy = true; _cfgErr = '';
        renderPanel();
        api('POST', body).then(function (r) {
            _busy = false;
            if (r && r.controllers) applyConfig(r);
            if (!r || !r.success) _cfgErr = ERRORS[r && r.error] || 'ما تم — حاول مرة ثانية';
            renderPanel();
            var inp = _ov && _ov.querySelector('.agp-rc-in');
            if (inp && body.action === 'add' && r && r.success) inp.focus();
        });
    }

    function openPanel() {
        if (_ov || !document.body) return;
        injectCss();
        _ov = document.createElement('div');
        _ov.className = 'agp-rc-ov';
        _ov.addEventListener('click', function (e) { if (e.target === _ov) closePanel(); });
        document.body.appendChild(_ov);
        _cfg = null; _cfgErr = '';
        renderPanel();
        loadConfig().then(function () { if (_ov) renderPanel(); });
    }
    function closePanel() {
        if (_ov && _ov.parentNode) _ov.parentNode.removeChild(_ov);
        _ov = null;
    }
    function renderPanel() {
        if (!_ov) return;
        var c = _cfg;
        var body;
        if (!c) {
            body = _cfgErr ? '<p class="agp-rc-err">' + esc(_cfgErr) + '</p>' : '<p class="agp-rc-empty">جارٍ التحميل…</p>';
        } else {
            var list = c.controllers.map(function (x) {
                var acc = x.account
                    ? '<span class="agp-rc-desc ok">حسابه بالموقع: ' + esc(x.account.name) + ' — تطلع له «لوحة التحكم» ببروفايله</span>'
                    : '<span class="agp-rc-desc warn">ما عنده حساب موثّق بهذا اليوزر بالموقع — يتحكم بالشات بس لين يسجّل</span>';
                return '<div class="agp-rc-row' + (x.enabled ? '' : ' is-off') + '"><span class="agp-rc-label"><b>@' + esc(x.username) + '</b>' + acc + '</span>' +
                    '<span class="agp-rc-ctl"><button type="button" class="agp-rc-tg' + (x.enabled ? ' is-on' : '') + '" data-tg="' + esc(x.username) + '" aria-label="تفعيل @' + esc(x.username) + '"' + (_busy ? ' disabled' : '') + '></button>' +
                    '<button type="button" class="agp-rc-del" data-rm="' + esc(x.username) + '" aria-label="حذف @' + esc(x.username) + '"' + (_busy ? ' disabled' : '') + '>✕</button></span></div>';
            }).join('');
            body = '<div class="agp-rc-row"><span class="agp-rc-label"><span>تفعيل التحكم عن بعد</span><span class="agp-rc-desc">' +
                (c.enabled ? 'مفعّل — المتحكمين المفعّلين تحت يقدرون يتحكمون' : 'متوقف عن الكل') + '</span></span>' +
                '<button type="button" class="agp-rc-tg' + (c.enabled ? ' is-on' : '') + '" data-master aria-label="تفعيل التحكم عن بعد"' + (_busy ? ' disabled' : '') + '></button></div>' +
                '<div class="agp-rc-row"><span class="agp-rc-label"><span>إضافة متحكم</span><span class="agp-rc-desc">يوزر تيك توك بدون @ (حتى ' + c.max + ')</span></span>' +
                '<span class="agp-rc-add"><input class="agp-rc-in" type="text" placeholder="username" autocomplete="off" spellcheck="false" dir="ltr">' +
                '<button type="button" class="agp-rc-btn" data-add' + (_busy || c.controllers.length >= c.max ? ' disabled' : '') + '>إضافة</button></span></div>' +
                '<p class="agp-rc-err">' + esc(_cfgErr) + '</p>' +
                '<div class="agp-rc-h">المتحكمين (' + c.controllers.length + '/' + c.max + ')</div>' +
                (list || '<p class="agp-rc-empty">ما فيه متحكمين بعد.</p>');
        }
        _ov.innerHTML = '<div class="agp-rc-box" role="dialog" aria-label="التحكم عن بعد">' +
            '<div class="agp-rc-head"><span class="agp-rc-title">🎮 التحكم عن بعد</span><button type="button" class="agp-rc-x" data-close aria-label="إغلاق">✕</button></div>' +
            '<p class="agp-rc-sub">المتحكم يشغّل ألعابك كاملة: يختار اللعبة، يضبط الإعدادات والدخول، يبدأ وينهي المباراة. ' +
            'من «لوحة التحكم» ببروفايله على جواله أو آيباده، أو بأوامر يكتبها بشات البث. ' +
            'تقدر توقفه عن الكل بالمفتاح العام، أو عن شخص واحد بمفتاحه، ويتقفل عنه فوراً.</p>' +
            body +
            '<div class="agp-rc-cmds">شاشة اللعبة لازم تكون مفتوحة عندك عشان التحكم يوصلها. الأوامر بالشات تبدأ بعلامة <b>!</b>، ' +
            'والمتحكم يكتب <b>!اوامر</b> ويطلع على الشاشة كل أوامر الشاشة الحالية، و<b>!لعبه</b> واسم اللعبة يفتحها.</div>' +
            '</div>';
        _ov.querySelector('[data-close]').onclick = closePanel;
        if (!c) return;
        _ov.querySelector('[data-master]').onclick = function () { act({ action: 'enable', on: !c.enabled }); };
        var inp = _ov.querySelector('.agp-rc-in');
        var add = function () { var v = cleanUser(inp.value); if (!v) { _cfgErr = ERRORS.invalid; renderPanel(); return; } act({ action: 'add', username: v }); };
        _ov.querySelector('[data-add]').onclick = add;
        inp.onkeydown = function (e) { if (e.key === 'Enter') add(); };
        Array.prototype.forEach.call(_ov.querySelectorAll('[data-tg]'), function (b) {
            b.onclick = function () {
                var u = b.getAttribute('data-tg'), x = c.controllers.filter(function (y) { return y.username === u; })[0];
                act({ action: 'toggle', username: u, on: !(x && x.enabled) });
            };
        });
        Array.prototype.forEach.call(_ov.querySelectorAll('[data-rm]'), function (b) {
            b.onclick = function () { act({ action: 'remove', username: b.getAttribute('data-rm') }); };
        });
    }

    function cmdLines() {
        return allCommands().filter(function (c) { return c.names[0].indexOf('__') !== 0; }).map(function (c) {
            return ['!' + c.names[0] + (c.args ? ' ' + c.args : ''), c.desc || ''];
        });
    }
    function showHelp() {
        injectCss();
        if (_help && _help.parentNode) _help.parentNode.removeChild(_help);
        _help = document.createElement('div');
        _help.className = 'agp-rc-help';
        _help.innerHTML = '<h4>🎮 أوامر التحكم' + (_page && _page.page ? ' — ' + esc(_page.page) : '') + '</h4>' +
            cmdLines().map(function (l) { return '<div><b><bdi dir="rtl">' + esc(l[0]) + '</bdi></b><span>' + esc(l[1]) + '</span></div>'; }).join('');
        document.body.appendChild(_help);
        clearTimeout(_helpT);
        _helpT = setTimeout(function () { if (_help && _help.parentNode) _help.parentNode.removeChild(_help); _help = null; }, 12000);
    }
    function feedback(user, res) {
        if (!document.body) return;
        injectCss();
        if (!_toasts) {
            _toasts = document.createElement('div');
            _toasts.className = 'agp-rc-toasts';
            document.body.appendChild(_toasts);
        }
        var el = document.createElement('div');
        el.className = 'agp-rc-toast' + (res.ok === false ? ' is-err' : '');
        el.innerHTML = '<small>@' + esc(user) + '</small>' + (res.ok === false ? '⚠️ ' : '✅ ') + esc(res.msg || '');
        _toasts.appendChild(el);
        while (_toasts.children.length > 3) _toasts.removeChild(_toasts.firstChild);
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
    }

    document.addEventListener('visibilitychange', function () { if (!document.hidden) { _lastSent = ''; schedulePush(50); } });

    // اتصال البث جاء بعد فتح الصفحة (agp-auto-connect.js) → نفعّل الشات
    window.addEventListener('agp:stream-connected', ensureConnected);
    window.addEventListener('storage', function (e) {
        if (!e.key || e.key === 'agp:agp-stream-connection') ensureConnected();
        if (!e.key || e.key === STORAGE_KEY) { notifyChanged(); ensureConnected(); }
    });
    // مكتبة الألعاب: التعليقات من اتصال الإحصائيات (js/agp-stream-overlay.js)
    window.addEventListener('agp:overlay-comment', function (e) {
        if (_page && _page.overlayChat && e && e.detail) onComment(e.detail);
    });

    AGP.remoteControl = {
        attach: attach,
        detach: detach,
        settingsCommands: settingsCommands,
        templateSettings: templateSettings,
        templateLobby: templateLobby,
        describe: describe,
        captureToast: captureToast,
        matchOption: matchOption,
        parseBool: parseBool,
        toInt: toInt,
        norm: norm,
        isEnabled: function () { return readConfig().enabled; },
        /** هل الصفحة الحالية (المكتبة) تحتاج نصوص التعليقات من اتصال الإحصائيات؟ */
        wantsLibraryChat: function () { return !!(_page && _page.overlayChat && readConfig().enabled); },
        /** إعدادات الستريمر من الخادم (لزر البروفايل) — Promise بـ {enabled, controllers} أو null. */
        loadConfig: function () { return loadConfig().then(function () { return _cfg; }); },
        openPanel: openPanel,
        _parse: parse,
        _onComment: onComment,
        _snapshot: snapshot,
        _execute: execute
    };

    AGP.log('AGP Remote Control loaded.');

}(window.AymanGamesPlatform = window.AymanGamesPlatform || {}));
