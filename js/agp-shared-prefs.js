/**
 * إعدادات الألعاب المشتركة للستريمر — window.AGPSharedPrefs
 *
 * كلمة الدخول اللي يكتبها الستريمر بأول لعبة تنحفظ، وكل لعبة ثانية يفتحها
 * تلقاها مكتوبة تلقائياً. نفس الشي لأسماء الفريقين وكلمات دخولهم بألعاب
 * الفريقين. لو عدّلها بأي لعبة وبدأ، الجديد ينحفظ لكل الألعاب؛ ولو ما عدّل
 * تبقى ثابتة (حتى لو رجع بعد أيام).
 *
 * التخزين: حساب الستريمر بالسيرفر (GET/POST /api/game-prefs —
 * backend/game-prefs/game-prefs-service.js) + نسخة بالمتصفح عشان تنكتب فوراً
 * بدون انتظار. بدون تسجيل دخول تنحفظ بالمتصفح بس.
 *
 * الحقول المشتركة: keyword (كلمة الدخول — الألعاب الفردية أو النمط الفردي)،
 * team1Name / team1Keyword / team2Name / team2Keyword (الفريق الأول = أول
 * فريق بشاشة إعدادات اللعبة).
 *
 * الاستخدام بأي لعبة — map يربط الحقل المشترك بمفتاح اللعبة:
 *   var SP = AGPSharedPrefs.bind({ keyword: 'keyword' });
 *   values = SP.fill(values);                 // عند بناء القيم الأولية
 *   SP.watch(getValues, applyPatch);          // يحدّث الحقول اللي ما لمسها لو وصل الأحدث من الحساب
 *   SP.save(values);                          // عند الضغط على «ابدأ»
 *
 * يُحمَّل بعد auth/auth-client.js (اختياري — بدونه يشتغل على المتصفح بس).
 */
(function () {
    'use strict';

    var FIELDS = ['keyword', 'team1Name', 'team1Keyword', 'team2Name', 'team2Keyword'];
    var KEY_PREFIX = 'agp:shared-game-prefs:';
    var MAX_LEN = 40;
    var _syncPromise = null;

    function auth() { return window.AGPAuth || null; }
    function loggedIn() { var a = auth(); return Boolean(a && a.getToken && a.getToken()); }
    function ownerId() {
        var a = auth();
        if (!loggedIn()) return 'guest';
        var u = a.getCachedUser && a.getCachedUser();
        return u && u.id != null ? 'u' + u.id : 'guest';
    }

    function clean(v) {
        return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_LEN) : '';
    }

    function readLocal(owner) {
        try {
            var d = JSON.parse(localStorage.getItem(KEY_PREFIX + owner) || 'null');
            return d && typeof d === 'object' ? d : {};
        } catch (e) { return {}; }
    }
    function writeLocal(owner, prefs) {
        try { localStorage.setItem(KEY_PREFIX + owner, JSON.stringify(prefs)); } catch (e) {}
    }
    function hasData(p) { return FIELDS.some(function (f) { return !!p[f]; }); }

    /** القيم المحفوظة حالياً (من المتصفح، فوري). لو حساب جديد على هذا المتصفح بدون قيم، نبدأ من قيم الزائر. */
    function get() {
        var owner = ownerId();
        var p = readLocal(owner);
        if (!hasData(p) && owner !== 'guest') p = readLocal('guest');
        var out = {};
        FIELDS.forEach(function (f) { if (clean(p[f])) out[f] = clean(p[f]); });
        if (typeof p.updatedAt === 'number') out.updatedAt = p.updatedAt;
        return out;
    }

    function pushServer(changes) {
        var a = auth();
        if (!loggedIn() || !a.request) return Promise.resolve(null);
        return a.request('/api/game-prefs', { method: 'POST', body: changes })
            .catch(function () { return null; });
    }

    /**
     * يجيب الأحدث من حساب الستريمر (مرة وحدة لكل صفحة). الأحدث يكسب:
     * لو المتصفح أحدث (انحفظ بدون نت مثلاً) نرفعه للحساب.
     * @returns {Promise<object>}
     */
    function sync() {
        if (_syncPromise) return _syncPromise;
        var a = auth();
        if (!loggedIn() || !a.request) { _syncPromise = Promise.resolve(get()); return _syncPromise; }
        var owner = ownerId();
        _syncPromise = a.request('/api/game-prefs').then(function (r) {
            var local = get();
            var server = (r && r.success && r.prefs) || null;
            if (!server) return local;
            if (hasData(server) && (server.updatedAt || 0) >= (local.updatedAt || 0)) {
                writeLocal(owner, server);
                return get();
            }
            if (hasData(local)) {
                writeLocal(owner, local);
                var up = {};
                FIELDS.forEach(function (f) { if (local[f]) up[f] = local[f]; });
                pushServer(up);
            }
            return local;
        }).catch(function () { return get(); });
        return _syncPromise;
    }

    /**
     * يحفظ القيم الجديدة (الفاضي يتجاهله — ما يمسح المحفوظ). يحفظ بس لو فيه تغيير.
     * @param {object} partial {keyword?, team1Name?, ...}
     */
    function save(partial) {
        var cur = get();
        var changes = {};
        FIELDS.forEach(function (f) {
            var v = clean(partial && partial[f]);
            if (v && v !== cur[f]) changes[f] = v;
        });
        if (!Object.keys(changes).length) return;
        var next = Object.assign({}, cur, changes, { updatedAt: Date.now() });
        writeLocal(ownerId(), next);
        pushServer(changes);
    }

    /**
     * يربط حقول لعبة بالحقول المشتركة.
     * @param {object} map مثلاً { keyword: 'keywordSolo', team1Name: 'team1', team1Keyword: 'keyword1', ... }
     */
    function bind(map) {
        var filled = {};   // القيمة اللي حطيناها بكل حقل أول ما فتحت الصفحة

        function fill(values) {
            var p = get();
            var out = Object.assign({}, values);
            Object.keys(map).forEach(function (f) {
                if (p[f]) out[map[f]] = p[f];
                filled[map[f]] = out[map[f]];
            });
            return out;
        }

        /** بعد ما يوصل الأحدث من الحساب: يحدّث الحقول اللي الستريمر ما عدّلها بعد. */
        function watch(getValues, apply) {
            sync().then(function (p) {
                var cur = getValues() || {};
                var patch = {};
                var any = false;
                Object.keys(map).forEach(function (f) {
                    var k = map[f];
                    if (p[f] && p[f] !== cur[k] && cur[k] === filled[k]) { patch[k] = p[f]; filled[k] = p[f]; any = true; }
                });
                if (any) apply(patch);
            });
        }

        function saveValues(values) {
            var partial = {};
            Object.keys(map).forEach(function (f) { partial[f] = values ? values[map[f]] : ''; });
            save(partial);
        }

        return { fill: fill, watch: watch, save: saveValues };
    }

    window.AGPSharedPrefs = { FIELDS: FIELDS, get: get, sync: sync, save: save, bind: bind };
}());
