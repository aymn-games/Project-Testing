/**
 * التحكم بالشات (AGP.remoteControl) — المذيع يعطي لاعب أو أكثر صلاحية
 * تشغيل اللعبة كاملة بأوامر يكتبونها بشات البث: يفتح اللعبة، يكتب كلمة
 * الدخول، يغيّر الإعدادات، يبدأ اللوبي، يدخل شاشة اللعب، ويبدأ الجولات.
 *
 * يشتغل على روليت الإقصاء فقط (الشاشات اللي تستدعي attach).
 *
 * التفعيل يدوي من المذيع فقط، من بروفايله (profile.html → تبويب
 * «معلومات الستريمر» → زر «التحكم بالشات»): نافذة فيها مفتاح التفعيل
 * وقائمة يوزرات المتحكمين. ما فيه أي زر داخل شاشات اللعبة نفسها؛ لما
 * يكون مفعّل يشتغل فيها تلقائياً.
 *
 * الأمان:
 *  - الأمر يُقبل فقط من تعليق معرّفه (payload.id) = 'tiktok:<يوزر>' لأحد
 *    اليوزرات المحفوظة — المعرّف الثابت من الخادم، لا الاسم الظاهر اللي
 *    ينتحل بسهولة.
 *  - الإعداد محفوظ بمتصفح المذيع فقط (localStorage 'agp:remote-control')،
 *    ويبقى مفعّل لين يطفيه المذيع من البروفايل.
 *  - الأوامر تبدأ بـ ! فما تختلط بكلمة الدخول أو أرقام اللاعبين بالشات.
 *
 * الاستخدام من صفحة لعبة (بعد تحميل agp-core + agp-events + الأدابتر):
 *   var rc = AGP.remoteControl.attach({
 *     page: 'الإعدادات',           // اسم الشاشة (يظهر بقائمة الأوامر)
 *     connect: ER.connect,         // اتصال الشات بالبث (اختياري)
 *     commands: [{ names:['ابدأ'], args:'', desc:'...', run: function (arg, ctx) {
 *         return 'تم'  |  { ok:false, msg:'السبب' }  }}]
 *   });
 *   rc.detach();
 *
 * مساعدات للأوامر:
 *   AGP.remoteControl.settingsCommands(rows, {get, set}) — أوامر جاهزة من
 *     تعريف صفوف الإعدادات (text/number/choice/toggle) لأي صف فيه rc:[أسماء].
 *   AGP.remoteControl.captureToast(obj, fn) — يشغّل fn ويرجع أول رسالة
 *     toastMsg طلعت أثناءه (رسائل الخطأ الموجودة باللعبة) أو null.
 */
(function (AGP) {
    'use strict';

    if (!AGP) return;
    if (!AGP.log) { AGP.log = function () {}; }

    var STORAGE_KEY = 'agp:remote-control';
    var MAX_USERS = 5;
    var PREFIXES = ['!', '！', '¡'];

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
    var ON_WORDS = ['تشغيل', 'شغل', 'شغله', 'فعل', 'تفعيل', 'نعم', 'اي', 'ايه', 'on', '1'];
    var OFF_WORDS = ['ايقاف', 'وقف', 'اوقف', 'طفي', 'اطفي', 'قفل', 'الغاء', 'لا', 'off', '0'];
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

    // ---------- الإعداد المحفوظ ----------

    function readConfig() {
        var c = null;
        try { c = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { c = null; }
        c = c && typeof c === 'object' ? c : {};
        var users = Array.isArray(c.users) ? c.users.map(cleanUser).filter(Boolean).slice(0, MAX_USERS) : [];
        return { enabled: !!c.enabled && users.length > 0, users: users };
    }
    function writeConfig(c) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent('agp:remote-control-changed', { detail: readConfig() })); } catch (e) {}
    }
    function setEnabled(on) {
        var c = readConfig();
        if (on && !c.users.length) return false;
        c.enabled = !!on;
        writeConfig(c);
        refreshUi();
        if (on) ensureConnected();
        return true;
    }
    function addUser(u) {
        var c = readConfig(), x = cleanUser(u);
        if (!x || c.users.indexOf(x) >= 0 || c.users.length >= MAX_USERS) return false;
        c.users.push(x);
        writeConfig(c);
        refreshUi();
        return true;
    }
    function removeUser(u) {
        var c = readConfig(), x = cleanUser(u);
        c.users = c.users.filter(function (y) { return y !== x; });
        if (!c.users.length) c.enabled = false;
        writeConfig(c);
        refreshUi();
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

    var _page = null; // {page, connect, commands}
    var _unsub = null;

    function globalCommands() {
        return [
            { names: ['اوامر', 'الاوامر', 'مساعده', 'help'], desc: 'يعرض أوامر هذه الشاشة', run: function () { showHelp(); return null; } }
        ];
    }
    function allCommands() {
        return ((_page && _page.commands) || []).concat(globalCommands());
    }
    function findCommand(word) {
        var w = norm(word), list = allCommands();
        for (var i = 0; i < list.length; i++) {
            if ((list[i].names || []).some(function (n) { return norm(n) === w; })) return list[i];
        }
        return null;
    }

    /** "!كلمة صقر" → {cmd:'كلمة', arg:'صقر'} أو null لو ما هو أمر. */
    function parse(text) {
        var t = String(text == null ? '' : text).trim();
        var p = PREFIXES.filter(function (x) { return t.indexOf(x) === 0; })[0];
        if (!p) return null;
        t = t.slice(p.length).trim();
        if (!t) return null;
        var m = t.match(/^(\S+)\s*([\s\S]*)$/);
        return m ? { cmd: m[1], arg: (m[2] || '').trim() } : null;
    }

    function onComment(payload) {
        if (!_page || !payload || typeof payload.text !== 'string') return;
        var user = isController(payload);
        if (!user) return;
        var p = parse(payload.text);
        if (!p) return;
        var c = findCommand(p.cmd);
        if (!c) { feedback(user, { ok: false, msg: 'أمر غير معروف — اكتب !اوامر' }); return; }
        var res;
        try { res = c.run(p.arg, { user: user, payload: payload }); } catch (e) {
            AGP.log('Remote control: command failed', e);
            res = { ok: false, msg: 'تعذّر تنفيذ الأمر' };
        }
        if (res == null) return;
        feedback(user, typeof res === 'string' ? { ok: true, msg: res } : res);
    }

    function ensureConnected() {
        if (!_page || !readConfig().enabled || typeof _page.connect !== 'function') return;
        try { _page.connect(); } catch (e) {}
    }

    function attach(opts) {
        detach();
        _page = {
            page: (opts && opts.page) || '',
            connect: opts && opts.connect,
            commands: (opts && opts.commands) || []
        };
        if (AGP.events && typeof AGP.events.on === 'function') {
            _unsub = AGP.events.on('stream:commentReceived', onComment);
        }
        ensureConnected();
        return { detach: detach, setCommands: function (list) { if (_page) _page.commands = list || []; } };
    }
    function detach() {
        if (typeof _unsub === 'function') { try { _unsub(); } catch (e) {} }
        _unsub = null;
        _page = null;
    }

    // ---------- مساعدات للألعاب ----------

    /**
     * أوامر من صفوف الإعدادات (نفس شكل SETTINGS بالألعاب): أي صف فيه
     * rc:['اسم','اسم ثاني'] يصير أمر يغيّر قيمته. للصف choice القيمة
     * المحفوظة رقم الخيار، وللـ toggle true/false، وللـ number رقم ضمن
     * min/max، وللـ text النص كما هو.
     */
    function settingsCommands(sections, api) {
        var rows = [];
        (sections || []).forEach(function (s) { (s.rows || [s]).forEach(function (r) { if (r && r.rc && r.key) rows.push(r); }); });
        return rows.map(function (r) {
            var hint = r.type === 'choice' ? r.options.join(' / ') : r.type === 'toggle' ? 'تشغيل / ايقاف'
                : r.type === 'number' ? ((r.min != null ? r.min : 0) + '–' + (r.max != null ? r.max : 999)) : 'نص';
            return {
                names: r.rc, args: '<' + hint + '>', desc: r.label,
                run: function (arg) {
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
                    } else {
                        return { ok: false, msg: 'هذا الإعداد ما يتغير من الشات' };
                    }
                    api.set(r.key, v);
                    return r.label + ': ' + describe(r, v);
                }
            };
        });
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

    // ---------- الواجهة ----------

    var CSS = '' +
        '.agp-rc-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(5,3,10,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
        'display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;direction:rtl}' +
        '.agp-rc-box{width:min(440px,100%);max-height:90vh;overflow:auto;box-sizing:border-box;padding:22px;border-radius:22px;' +
        'background:linear-gradient(180deg,#171225,#0e0b17);border:1px solid rgba(167,139,250,.25);color:#f4f2f8;' +
        'font:500 14px "IBM Plex Sans Arabic",system-ui,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.6)}' +
        '.agp-rc-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}' +
        '.agp-rc-title{font-weight:700;font-size:18px;text-align:right}' +
        '.agp-rc-x{width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#c9c4d6;cursor:pointer;font-size:16px}' +
        '.agp-rc-sub{color:#9a95a8;font-size:13px;line-height:1.7;text-align:right;margin:0 0 14px}' +
        '.agp-rc-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;margin-bottom:10px;border-radius:16px;' +
        'border:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.015))}' +
        '.agp-rc-label{text-align:right;display:flex;flex-direction:column;gap:2px;min-width:0}' +
        '.agp-rc-desc{color:#8a8596;font-size:12px;font-weight:400}' +
        '.agp-rc-tg{flex-shrink:0;width:48px;height:28px;border-radius:999px;border:none;cursor:pointer;position:relative;background:rgba(255,255,255,.12);transition:background .2s}' +
        '.agp-rc-tg::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left .2s}' +
        '.agp-rc-tg.is-on{background:linear-gradient(90deg,#7c3aed,#a855f7)}.agp-rc-tg.is-on::after{left:23px}' +
        '.agp-rc-tg:disabled{opacity:.4;cursor:not-allowed}' +
        '.agp-rc-add{display:flex;gap:8px;flex-shrink:0;direction:ltr}' +
        '.agp-rc-in{width:150px;height:38px;box-sizing:border-box;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);' +
        'color:#f4f2f8;padding:0 14px;font:600 14px "IBM Plex Sans Arabic",system-ui,sans-serif;outline:none}' +
        '.agp-rc-in:focus{border-color:rgba(167,139,250,.55)}' +
        '.agp-rc-btn{height:38px;padding:0 16px;border-radius:999px;border:none;cursor:pointer;background:linear-gradient(90deg,#7c3aed,#a855f7);color:#fff;font:700 13px "IBM Plex Sans Arabic",system-ui,sans-serif}' +
        '.agp-rc-users{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}' +
        '.agp-rc-user{display:flex;align-items:center;gap:6px;padding:6px 8px 6px 12px;border-radius:999px;background:rgba(139,92,246,.14);border:1px solid rgba(167,139,250,.35);color:#ddd6fe;font-size:13px;direction:ltr}' +
        '.agp-rc-user button{width:22px;height:22px;border-radius:50%;border:none;background:rgba(255,255,255,.08);color:#fca5a5;cursor:pointer;font-size:12px;line-height:1}' +
        '.agp-rc-empty{color:#6f6a7c;font-size:13px;text-align:right;margin:0 0 12px}' +
        '.agp-rc-cmds{margin:0;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);color:#b9b3c7;font-size:13px;line-height:1.9;text-align:right}' +
        '.agp-rc-cmds b{color:#e9e5f3;font-weight:700;direction:rtl}' +
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
    function refreshUi() {
        if (_ov) renderPanel();
    }

    function openPanel() {
        if (_ov || !document.body) return;
        injectCss();
        _ov = document.createElement('div');
        _ov.className = 'agp-rc-ov';
        _ov.addEventListener('click', function (e) { if (e.target === _ov) closePanel(); });
        document.body.appendChild(_ov);
        renderPanel();
        var inp = _ov.querySelector('.agp-rc-in');
        if (inp) inp.focus();
    }
    function closePanel() {
        if (_ov && _ov.parentNode) _ov.parentNode.removeChild(_ov);
        _ov = null;
    }
    function renderPanel() {
        var c = readConfig();
        var users = c.users.map(function (u) {
            return '<span class="agp-rc-user">@' + esc(u) + '<button type="button" data-rm="' + esc(u) + '" aria-label="حذف ' + esc(u) + '">✕</button></span>';
        }).join('');
        _ov.innerHTML = '<div class="agp-rc-box" role="dialog" aria-label="التحكم بالشات">' +
            '<div class="agp-rc-head"><span class="agp-rc-title">🎮 التحكم بالشات</span><button type="button" class="agp-rc-x" data-close aria-label="إغلاق">✕</button></div>' +
            '<p class="agp-rc-sub">يشتغل على <b>روليت الإقصاء</b>. اللاعبين اللي تضيفهم هنا يقدرون يشغّلون اللعبة كاملة بأوامر يكتبونها بشات البث: يغيّرون الإعدادات، يبدؤون المباراة، ويلفّون العجلة. ' +
            'نتحقق من يوزر تيك توك نفسه (مو الاسم الظاهر)، ويبقى مفعّل لين تطفيه من هنا.</p>' +
            '<div class="agp-rc-row"><span class="agp-rc-label"><span>تفعيل التحكم بالشات</span><span class="agp-rc-desc">' +
            (c.enabled ? 'مفعّل' : c.users.length ? 'متوقف' : 'أضف يوزر لاعب أولاً') + '</span></span>' +
            '<button type="button" class="agp-rc-tg' + (c.enabled ? ' is-on' : '') + '" data-toggle aria-label="تفعيل التحكم بالشات"' + (c.users.length ? '' : ' disabled') + '></button></div>' +
            '<div class="agp-rc-row"><span class="agp-rc-label"><span>يوزر اللاعب</span><span class="agp-rc-desc">يوزر تيك توك بدون @ (حتى ' + MAX_USERS + ')</span></span>' +
            '<span class="agp-rc-add"><input class="agp-rc-in" type="text" placeholder="username" autocomplete="off" spellcheck="false" dir="ltr">' +
            '<button type="button" class="agp-rc-btn" data-add>إضافة</button></span></div>' +
            (users ? '<div class="agp-rc-users">' + users + '</div>' : '<p class="agp-rc-empty">ما فيه متحكمين بعد.</p>') +
            '<div class="agp-rc-cmds">الأوامر تبدأ بعلامة <b>!</b> — اللاعب يكتب <b>!اوامر</b> بالشات ويطلع له على الشاشة كل الأوامر المتاحة.' +
            HELP_LINES.map(function (l) { return '<br><b>' + esc(l[0]) + '</b> ' + l[1].map(function (c) { return '<bdi dir="rtl" style="white-space:nowrap">' + esc(c) + '</bdi>'; }).join(' · '); }).join('') + '</div>' +
            '</div>';
        _ov.querySelector('[data-close]').onclick = closePanel;
        _ov.querySelector('[data-toggle]').onclick = function () { setEnabled(!readConfig().enabled); };
        var inp = _ov.querySelector('.agp-rc-in');
        var add = function () { if (addUser(inp.value)) { renderPanel(); var n = _ov && _ov.querySelector('.agp-rc-in'); if (n) n.focus(); } };
        _ov.querySelector('[data-add]').onclick = add;
        inp.onkeydown = function (e) { if (e.key === 'Enter') add(); };
        Array.prototype.forEach.call(_ov.querySelectorAll('[data-rm]'), function (b) {
            b.onclick = function () { removeUser(b.getAttribute('data-rm')); };
        });
    }

    // ملخص أوامر روليت الإقصاء بنافذة البروفايل
    var HELP_LINES = [
        ['الإعدادات:', ['!كلمة صقر', '!الحد 30', '!الشكل سكرول', '!الوقت 25', '!الدعم وردة 2', '!ابدأ']],
        ['اللوبي:', ['!ابدأ', '!اللاعبين', '!طرد اسم', '!رجوع']],
        ['اللعب:', ['!لف', '!تلقائي', '!اقصاء 3', '!ارجاع 2', '!دخول', '!اعادة', '!جديدة', '!الحالة']]
    ];
    function cmdLines() {
        return allCommands().map(function (c) {
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

    // اتصال البث جاء بعد فتح الصفحة (agp-auto-connect.js) → نفعّل الشات
    window.addEventListener('agp:stream-connected', ensureConnected);
    window.addEventListener('storage', function (e) {
        if (!e.key || e.key === 'agp:agp-stream-connection') ensureConnected();
        if (!e.key || e.key === STORAGE_KEY) refreshUi();
    });

    AGP.remoteControl = {
        attach: attach,
        detach: detach,
        settingsCommands: settingsCommands,
        describe: describe,
        captureToast: captureToast,
        matchOption: matchOption,
        parseBool: parseBool,
        toInt: toInt,
        norm: norm,
        isEnabled: function () { return readConfig().enabled; },
        openPanel: openPanel,
        _parse: parse,
        _onComment: onComment
    };

    AGP.log('AGP Remote Control loaded.');

}(window.AymanGamesPlatform));
