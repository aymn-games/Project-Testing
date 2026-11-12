/**
 * سباق الفورمولا — منطق اللعبة (المضمار، السيارات، التكبيس، الدعم، الكاميرا، النقاط).
 *
 * فكرة اللعبة:
 *  - المشاهد يكتب كلمة الدخول بالشات (الافتراضي «سباق») فيأخذ سيارة فورمولا بالشبكة.
 *  - التكبيس (لايكات البث) يرفع دواسة الوقود لسيارة صاحبه ← سرعة أعلى، وتنزل
 *    تدريجياً لو وقف التكبيس.
 *  - كل تأثير (درع، بوابة، مكوك، صاروخ، صاعقة) مربوط بهدية يختارها الاستريمر (EFFECTS تحت)،
 *    وأي دعم غير مربوط = نيترو.
 *  - الاستريمر يغيّر الكاميرا (تلفزيونية / داخل السيارة / هليكوبتر / جانب المضمار /
 *    مخرج تلقائي) ويثبّتها على أي متسابق بالضغط على اسمه ببرج الترتيب.
 *
 * طبقة الثري دي (f1-scene.js) عرض فقط: كل الحسابات هنا، والمشهد يستقبل المواقع
 * كل فريم. لو فشل الثري دي تكمل اللعبة بالخريطة ثنائية الأبعاد (minimap كبيرة).
 *
 * ملاحظة التكبيس: الحدث المنتظر 'stream:likeReceived' ({id, name, count, avatarUrl}).
 */
(function () {
    'use strict';

    var AGP = window.AymanGamesPlatform || {};
    if (!AGP.log) { AGP.log = function () {}; }

    var $ = function (id) { return document.getElementById(id); };
    var STREAM_CONNECTION_STORAGE_KEY = 'agp:agp-stream-connection';
    var SETTINGS_KEY = 'formula-race-settings';
    var DEMO = /[?&]demo=1/.test(location.search);
    var GAME_DIR = (function () { var sc = document.currentScript; return sc && sc.src ? sc.src.replace(/f1-game\.js(\?.*)?$/, '') : ''; }());

    // ------------------------------------------------------------------
    // الإعدادات
    // ------------------------------------------------------------------
    var DEFAULT_GIFTS = { shield: 'rose', portal: 'finger-heart', shuttle: 'perfume', rocket: 'hat-and-mustache', lightning: 'corgi' };
    var DEFAULTS = {
        laps: 3, maxDrivers: 12, keyword: 'سباق', autoCam: true,
        joinMode: 'all',            // all | followers
        quality: 'balanced',        // light | balanced | cinematic
        giftsOn: true,              // عند الإيقاف: التكبيس + النيترو فقط
        soundOn: true,              // أصوات اللعبة (مستوى أقل من النص)
        gifts: DEFAULT_GIFTS        // تأثير ← معرّف الهدية
    };
    var MAX_DRIVERS_LIMIT = 30, MAX_LAPS = 20;
    function readJSON(key, fb) { try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } }
    function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
    function loadSettings() {
        var saved = readJSON(SETTINGS_KEY, {}) || {};
        var out = Object.assign({}, DEFAULTS, saved);
        out.gifts = Object.assign({}, DEFAULT_GIFTS, saved.gifts || {});
        out.laps = clampInt(out.laps, 1, MAX_LAPS, DEFAULTS.laps);
        out.maxDrivers = clampInt(out.maxDrivers, 1, MAX_DRIVERS_LIMIT, DEFAULTS.maxDrivers);
        if (['light', 'balanced', 'cinematic'].indexOf(out.quality) === -1) out.quality = DEFAULTS.quality;
        if (['all', 'followers'].indexOf(out.joinMode) === -1) out.joinMode = DEFAULTS.joinMode;
        return out;
    }
    function clampInt(v, a, b, fb) { v = parseInt(v, 10); return isNaN(v) ? fb : Math.max(a, Math.min(b, v)); }
    var settings = loadSettings();

    // ------------------------------------------------------------------
    // المضمار — نقاط تحكم (متر) لحلبة مغلقة، تُنعَّم بمنحنى Catmull-Rom ثم
    // تُعاد عيّنتها كل STEP متر. نفس البيانات للمشهد ثلاثي الأبعاد وللخريطة.
    // ------------------------------------------------------------------
    var CONTROL = [
        [-260, 0], [-60, 0], [140, 0], [320, 0],             // الخط المستقيم الرئيسي
        [420, -20], [465, -100], [425, -175],                // المنعطف الأول الطويل
        [335, -195], [285, -255], [305, -335],               // الإس
        [385, -385], [405, -465], [345, -525],               // الهيربين العلوي
        [245, -515], [165, -455], [80, -480],                // المنحنيات المتتالية
        [0, -545], [-100, -525], [-160, -455],
        [-120, -385], [-180, -320], [-285, -330],            // الشيكين
        [-375, -385], [-465, -345], [-490, -255],
        [-430, -180], [-465, -100], [-425, -30], [-350, 0]   // المنعطف الأخير
    ];
    var STEP = 2;
    var START_AT = [130, 0];   // موقع خط البداية/النهاية
    var ROAD_WIDTH = 14;

    function buildTrack() {
        var dense = [];
        var n = CONTROL.length;
        for (var i = 0; i < n; i++) {
            var p0 = CONTROL[(i - 1 + n) % n], p1 = CONTROL[i], p2 = CONTROL[(i + 1) % n], p3 = CONTROL[(i + 2) % n];
            for (var s = 0; s < 40; s++) {
                var t = s / 40, t2 = t * t, t3 = t2 * t;
                dense.push([
                    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
                ]);
            }
        }
        // طول تراكمي ثم إعادة عيّنة متساوية
        var cum = [0];
        for (var k = 1; k <= dense.length; k++) {
            var a = dense[k - 1], b = dense[k % dense.length];
            cum.push(cum[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
        }
        var total = cum[cum.length - 1];
        var N = Math.floor(total / STEP);
        var X = new Float32Array(N), Z = new Float32Array(N);
        var j = 0;
        for (var q = 0; q < N; q++) {
            var d = q * total / N;
            while (cum[j + 1] < d) j++;
            var f = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
            var A = dense[j], B = dense[(j + 1) % dense.length];
            X[q] = A[0] + (B[0] - A[0]) * f;
            Z[q] = A[1] + (B[1] - A[1]) * f;
        }
        // خط البداية (المسافة 0) بنص الخط المستقيم الرئيسي عشان الشبكة كلها تكون على المستقيم
        var off = 0, best = Infinity;
        for (var b = 0; b < N; b++) { var dd2 = Math.hypot(X[b] - START_AT[0], Z[b] - START_AT[1]); if (dd2 < best) { best = dd2; off = b; } }
        if (off) { var X2 = new Float32Array(N), Z2 = new Float32Array(N); for (var r = 0; r < N; r++) { X2[r] = X[(r + off) % N]; Z2[r] = Z[(r + off) % N]; } X = X2; Z = Z2; }
        var step = total / N;
        // اتجاه وانحناء كل نقطة (للكيربات وللكاميرات الجانبية)
        var H = new Float32Array(N), C = new Float32Array(N);
        for (var m = 0; m < N; m++) {
            var nx = X[(m + 1) % N] - X[(m - 1 + N) % N], nz = Z[(m + 1) % N] - Z[(m - 1 + N) % N];
            H[m] = Math.atan2(nx, nz);
        }
        for (var c = 0; c < N; c++) {
            var w = 6, h1 = H[(c - w + N) % N], h2 = H[(c + w) % N];
            var dh = h2 - h1; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
            C[c] = dh / (2 * w * step);
        }
        return { x: X, z: Z, heading: H, curvature: C, count: N, step: step, length: total, width: ROAD_WIDTH };
    }
    var TRACK = buildTrack();

    /** موقع على المضمار لمسافة d (متر) وإزاحة جانبية lane (متر، موجب = يسار اتجاه السير). */
    function trackPoint(d, lane) {
        var L = TRACK.length, N = TRACK.count;
        var dd = ((d % L) + L) % L;
        var fi = dd / TRACK.step, i = Math.floor(fi) % N, f = fi - Math.floor(fi), i2 = (i + 1) % N;
        var x = TRACK.x[i] + (TRACK.x[i2] - TRACK.x[i]) * f;
        var z = TRACK.z[i] + (TRACK.z[i2] - TRACK.z[i]) * f;
        var h = Math.atan2(TRACK.x[i2] - TRACK.x[i], TRACK.z[i2] - TRACK.z[i]);
        // العمودي على الاتجاه (يسار)
        var lx = Math.cos(h), lz = -Math.sin(h);
        return { x: x + lx * (lane || 0), z: z + lz * (lane || 0), heading: h };
    }

    // ------------------------------------------------------------------
    // هدايا السباق — كل تأثير مربوط بهدية يختارها الاستريمر (الافتراضي DEFAULT_GIFTS).
    // أي دعم غير مربوط بتأثير = نيترو. ولو هدايا السباق مطفأة: كل دعم = نيترو.
    // ------------------------------------------------------------------
    var EFFECTS = [
        { id: 'shield', name: 'درع الحماية', desc: '10 ثوانٍ أو أول ضربة', icon: '🛡️', color: '#38bdf8' },
        { id: 'portal', name: 'البوابة', desc: 'انتقال إلى الأمام', icon: '🌀', color: '#a855f7' },
        { id: 'shuttle', name: 'المكوك', desc: 'سحب سريع إلى الأمام', icon: '🚀', color: '#f97316' },
        { id: 'rocket', name: 'الصاروخ', desc: 'إيقاف منافس 3 ثوانٍ', icon: '🎯', color: '#ef4444' },
        { id: 'lightning', name: 'الصاعقة', desc: 'إيقاف 3 منافسين 5 ثوانٍ', icon: '⚡', color: '#eab308' }
    ];
    var NITRO = { id: 'nitro', name: 'نيترو', desc: 'دفعة سرعة ثانيتين', icon: '💨', color: '#22d3ee' };
    function effectById(id) { for (var i = 0; i < EFFECTS.length; i++) if (EFFECTS[i].id === id) return EFFECTS[i]; return id === 'nitro' ? NITRO : null; }

    // قائمة الهدايا: المشتركة (assets/tiktok-gifts) + العطر (مو موجود بالمشتركة)
    var _gifts = null;
    function giftList() {
        if (_gifts) return _gifts;
        var G = AGP.tiktokGifts, out = [];
        if (G && G.list) G.list.forEach(function (g) { out.push({ id: g.id, name: g.label, coins: g.coins, img: G.iconUrl(g) }); });
        if (!out.some(function (g) { return g.id === 'perfume'; })) out.push({ id: 'perfume', name: 'عطر', coins: 20, img: GAME_DIR + 'gift_icons/perfume.webp' });
        out.sort(function (a, b) { return a.coins - b.coins; });
        return (_gifts = out);
    }
    function giftById(id) { var l = giftList(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
    // أسماء تيك توك الإنجليزية (giftName) لما تختلف عن المعرّف
    var GIFT_NAMES = {
        'ice-cream': ['Ice Cream Cone'], 'donut': ['Doughnut'], 'finger-heart': ['Finger Heart'],
        'heart-in-your-hands-a': ['Heart In Your Hands'], 'heart-in-your-hands-b': ['Heart In Your Hands'],
        'kings-scepter': ["King's Scepter", 'Scepter'], 'hat-and-mustache': ['Hat and Mustache', 'Hat & Mustache'],
        'love-saudi': ['Love Saudi', 'I Love KSA'], 'saudi-in-heart': ['Saudi in Heart', 'KSA in my heart'],
        'diving-with-whales': ['Diving with Whales'], 'cake-slice': ['Cake Slice'], 'paper-crane': ['Paper Crane']
    };
    function gkey(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function giftNameMatches(giftId, name) {
        var k = gkey(name); if (!k) return false;
        if (k === gkey(giftId)) return true;
        return (GIFT_NAMES[giftId] || []).some(function (n) { return gkey(n) === k; });
    }
    /** التأثير المربوط بالهدية القادمة من البث (بالاسم أولاً، ثم بقيمة الكوينز)، أو null. */
    function effectForGift(payload) {
        var ids = Object.keys(settings.gifts), i;
        for (i = 0; i < ids.length; i++) if (giftNameMatches(settings.gifts[ids[i]], payload.giftName)) return ids[i];
        var v = Number(payload.giftValue);
        if (v > 0) for (i = 0; i < ids.length; i++) { var g = giftById(settings.gifts[ids[i]]); if (g && g.coins === v) return ids[i]; }
        return null;
    }

    // ------------------------------------------------------------------
    // الحالة
    // ------------------------------------------------------------------
    var TEAM_COLORS = ['#e10600', '#00d2be', '#ff8700', '#0600ef', '#2b4562', '#006f62', '#f596c8', '#b6babd', '#52e252', '#ffd400', '#9b0000', '#6cd3bf', '#ffffff', '#7c3aed', '#1e5bc6', '#ff4fd8'];
    var S = {
        phase: 'lobby',          // lobby | countdown | race | finish
        cars: [],                // [{id,name,avatar,color,number,dist,speed,throttle,lane,laneT,fx,finished,finishAt,likes,gifts}]
        byId: {},
        startedAt: 0,
        raceClock: 0,
        winner: null,
        run: 0, pts: null, winOpen: false,
        reported: false,
        cam: { mode: settings.autoCam ? 'auto' : 'tv', focus: null, locked: false, autoT: 0, autoMode: 'tv' },
        finishTimer: 0,
        countToken: 0
    };
    var scene = null;        // واجهة f1-scene.js (أو null لو فشل الثري دي)

    function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

    function freshFx() { return { nitro: 0, shield: 0, shuttle: 0, stop: 0, portal: 0 }; }

    function gridSlot(i) {
        // صفّين متداخلين خلف خط البداية (مثل شبكة الفورمولا)
        return { dist: -14 - i * 9, lane: (i % 2 === 0 ? 3 : -3) };
    }

    function addCar(p) {
        if (S.byId[p.id]) return S.byId[p.id];
        if (S.phase !== 'lobby' || S.cars.length >= settings.maxDrivers) return null;
        var used = S.cars.map(function (c) { return c.color; });
        var color = TEAM_COLORS[hashStr(p.id) % TEAM_COLORS.length];
        for (var k = 0; used.indexOf(color) !== -1 && k < TEAM_COLORS.length; k++) color = TEAM_COLORS[(hashStr(p.id) + k + 1) % TEAM_COLORS.length];
        var slot = gridSlot(S.cars.length);
        var car = {
            id: p.id, name: String(p.name || p.id).slice(0, 24), avatar: p.avatarUrl || null,
            color: color, number: S.cars.length + 1,
            dist: slot.dist, lane: slot.lane, laneT: slot.lane, speed: 0, throttle: 0,
            fx: freshFx(), finished: false, finishAt: 0, likes: 0, gifts: 0, tapBank: 0,
            bot: !!p.bot,
            winCard: p.winCard || null,                                   // بطاقة الفوز المملوكة (js/agp-win-card.js)
            winVideo: (p.winVideo && (p.winVideo.url || p.winVideo)) || p.winVideoUrl || null,
            character: p.character || null   // شخصية الأنمي المختارة من البروفايل (girl/boy/any/null) — لمراسم النهاية
        };
        S.cars.push(car); S.byId[car.id] = car;
        if (scene) scene.setCars(S.cars);
        renderLobby();
        if (!car.bot || S.cars.length <= 2) SFX.join();
        toast('🏎️ <b>' + esc(car.name) + '</b> انضم للسباق برقم ' + car.number, car.color);
        return car;
    }

    function removeCar(id) {
        if (S.phase !== 'lobby') return;
        var c = S.byId[id]; if (!c) return;
        S.cars.splice(S.cars.indexOf(c), 1); delete S.byId[id];
        S.cars.forEach(function (car, i) { var sl = gridSlot(i); car.number = i + 1; car.dist = sl.dist; car.lane = car.laneT = sl.lane; });
        if (scene) scene.setCars(S.cars);
        renderLobby();
    }

    // ------------------------------------------------------------------
    // التكبيس والدعم
    // ------------------------------------------------------------------
    var TAPS_PER_NITRO = 50, NITRO_SECS = 2;
    function onLike(id, count) {
        var c = S.byId[id]; if (!c || c.finished || S.phase !== 'race') return;
        count = Math.max(1, Math.min(200, Number(count) || 1));
        c.tapsTotal = (c.tapsTotal || 0) + count;
        c.likes += count;
        // كل تكبيسة ترفع دواسة الوقود، والحد ١
        c.throttle = Math.min(1, c.throttle + count * 0.045);
        // كل 50 تكبيسة = نيترو. وقت النيترو (الشريط يفضى) التكبيس ما يعبّي الشريط،
        // والتكبيسات الزايدة لحظة اكتماله ما تنحسب — يرجع يعبّي من الصفر بعد ما يخلص.
        if (c.fx.nitro > 0) return;
        c.tapBank += count;
        if (c.tapBank >= TAPS_PER_NITRO) {
            c.tapBank = 0;
            applyEffect(c, 'nitro', true);
            // التنبيه للاعب اللي الكاميرا تتابعه بس (لو الكل يكبّس تزحم التنبيهات وتغطي تنبيهات الدعم)
            if (c.id === S.cam.focus) toast(NITRO.icon + ' <b>' + esc(c.name) + '</b> ← نيترو من التكبيس', NITRO.color);
        } else if (scene && count >= 15) scene.burst(c.id, 'tap');
    }

    /** يوقف السيارة (صاروخ/صاعقة) — الدرع يصدّ أول ضربة ويختفي. ترجع true لو أصابت. */
    function hit(o, secs) {
        if (o.finished) return false;
        if (o.fx.shield > 0) { o.fx.shield = 0; SFX.shield(); if (scene) scene.burst(o.id, 'shield'); toast('🛡️ درع <b>' + esc(o.name) + '</b> صدّ الضربة', '#38bdf8'); return false; }
        o.fx.stop = Math.max(o.fx.stop, secs);
        if (scene) scene.burst(o.id, 'hit');
        return true;
    }
    /** أقرب منافسين قدّامك، ولو ما كفوا نكمّل من اللي وراك. */
    function nearestRivals(c, n) {
        var others = S.cars.filter(function (o) { return o !== c && !o.finished; });
        var ahead = others.filter(function (o) { return o.dist > c.dist; }).sort(function (a, b) { return a.dist - b.dist; });
        var behind = others.filter(function (o) { return o.dist <= c.dist; }).sort(function (a, b) { return b.dist - a.dist; });
        return ahead.concat(behind).slice(0, n);
    }

    function applyEffect(c, id, fromTaps) {
        if (!fromTaps) c.gifts++;
        var extra = '';
        if (id === 'nitro') { c.fx.nitro = NITRO_SECS; c.throttle = 1; }
        else if (id === 'shield') { c.fx.shield = 10; }
        else if (id === 'portal') {
            var ahead = null;
            S.cars.forEach(function (o) { if (o !== c && !o.finished && o.dist > c.dist && (!ahead || o.dist < ahead.dist)) ahead = o; });
            c.dist = ahead ? ahead.dist + 12 : c.dist + 160;
            c.lane = c.laneT = ahead ? (ahead.lane > 0 ? -3 : 3) : c.lane;
            c.fx.portal = 1; c.throttle = Math.max(c.throttle, 0.8);
        } else if (id === 'shuttle') { c.fx.shuttle = 3; c.throttle = 1; }
        else if (id === 'rocket') {
            var t = nearestRivals(c, 1);
            if (t[0] && hit(t[0], 3)) extra = ' على <b>' + esc(t[0].name) + '</b>';
        } else if (id === 'lightning') {
            var hitNames = nearestRivals(c, 3).filter(function (o) { return hit(o, 5); }).map(function (o) { return esc(o.name); });
            if (hitNames.length) extra = ' على <b>' + hitNames.join('، ') + '</b>';
        }
        if (scene) scene.burst(c.id, id);
        // الصوت: الدعم دايماً، ونيترو التكبيس بس للاعب اللي الكاميرا تتابعه (ما يزحم)
        if (SFX[id] && (!fromTaps || c.id === S.cam.focus)) SFX[id]();
        return extra;
    }

    /** صورة حساب تيك توك: لو اللاعب دخل بدون صورة، تُكمَّل من أول لايك/دعم/تعليق فيه صورة. */
    function fillAvatar(c, url) {
        if (!c || c.avatar || !url) return;
        c.avatar = url; if (scene) scene.setCars(S.cars); renderTower(true); if (S.phase === 'lobby') renderLobby();
    }

    function onGift(payload) {
        var c = S.byId[payload.id];
        fillAvatar(c, payload.avatarUrl);
        if (!c && S.phase === 'lobby' && (settings.joinMode !== 'followers' || payload.isFollower)) c = addCar(payload);
        if (!c || c.finished) return;
        if (S.phase !== 'race') { toast('🎁 <b>' + esc(c.name) + '</b> دعم — التأثيرات تشتغل بعد الانطلاق', c.color); return; }
        var id = settings.giftsOn ? (effectForGift(payload) || 'nitro') : 'nitro';
        var ef = effectById(id);
        var extra = applyEffect(c, id);
        toast(ef.icon + ' <b>' + esc(c.name) + '</b> ← ' + ef.name + extra, ef.color);
        // المخرج التلقائي يقطع لصاحب الدعم بس لو اللقطة الحالية أخذت وقتها (ما نقفز مع كل هدية)
        if (!S.cam.locked && S.cam.mode === 'auto' && S.cam.autoT >= GIFT_CUT_AFTER) { S.cam.focus = c.id; S.cam.autoT = 0; }
    }

    // ------------------------------------------------------------------
    // المحاكاة
    // ------------------------------------------------------------------
    var BASE_SPEED = 32;       // م/ث (~٨٠ كم/س) بدون تكبيس
    var BOOST_SPEED = 58;      // م/ث إضافية بالدواسة الكاملة (~٢٩٠ كم/س إجمالي)

    function simulate(dt) {
        var L = TRACK.length, goal = settings.laps * L;
        var sorted = S.cars.slice().sort(function (a, b) { return b.dist - a.dist; });
        sorted.forEach(function (c) {
            var fx = c.fx;
            for (var k in fx) if (fx[k] > 0) fx[k] = Math.max(0, fx[k] - dt);
            if (c.finished) { c.speed *= Math.exp(-dt * 0.8); c.dist += c.speed * dt; return; }
            // متسابقين التجربة يكبّسون عشوائياً (نفس مسار التكبيس الحقيقي)
            if (c.bot && fx.stop <= 0 && Math.random() < dt * 4) onLike(c.id, 2 + Math.floor(Math.random() * 7));
            c.throttle = Math.max(0, c.throttle - dt * 0.28);
            // إبطاء بالمنعطفات الحادة (يعطي إحساس الكبح)
            var idx = Math.floor((((c.dist % L) + L) % L) / TRACK.step) % TRACK.count;
            var corner = Math.min(1, Math.abs(TRACK.curvature[idx]) * 18);
            var target = BASE_SPEED + c.throttle * BOOST_SPEED * (1 - corner * 0.35);
            if (fx.nitro > 0) target *= 1.08;   // النيترو دفعة خفيفة (المكوك هو الأقوى)
            if (fx.shuttle > 0) target *= 1.7;
            if (fx.stop > 0) target = 0;
            var acc = fx.stop > 0 ? 5 : target > c.speed ? (fx.shuttle > 0 ? 4.5 : fx.nitro > 0 ? 2.4 : 1.6) : 2.4;
            c.speed += (target - c.speed) * (1 - Math.exp(-dt * acc));
            // تجاوز: لو فيه سيارة قريبة قدامي بنفس المسار أغيّر المسار
            sorted.forEach(function (o) {
                if (o === c || o.finished) return;
                var gap = o.dist - c.dist;
                if (gap > 0 && gap < 14 && Math.abs(o.lane - c.laneT) < 2.6) {
                    if (c.speed > o.speed + 1) c.laneT = o.lane > 0 ? -3.5 : 3.5;
                    else if (gap < 6) c.speed = Math.min(c.speed, o.speed);
                }
            });
            c.lane += (c.laneT - c.lane) * (1 - Math.exp(-dt * 1.6));
            c.dist += c.speed * dt;
            if (c.dist >= goal) {
                c.finished = true; c.finishAt = S.raceClock;
                if (!S.winner) onWinner(c);
                toast('🏁 <b>' + esc(c.name) + '</b> أنهى السباق — المركز ' + finishedCount(), c.color);
            }
        });
    }
    function lapOf(c) { return Math.min(settings.laps, Math.max(1, Math.floor(c.dist / TRACK.length) + 1)); }
    function finishedCount() { return S.cars.filter(function (c) { return c.finished; }).length; }

    function standings() {
        return S.cars.slice().sort(function (a, b) {
            if (a.finished && b.finished) return a.finishAt - b.finishAt;
            if (a.finished !== b.finished) return a.finished ? -1 : 1;
            return b.dist - a.dist;
        });
    }

    // ------------------------------------------------------------------
    // الكاميرا (المخرج التلقائي + تحكم الاستريمر)
    // ------------------------------------------------------------------
    var CAM_MODES = [
        { id: 'auto', name: 'مخرج تلقائي', key: '1' },
        { id: 'tv', name: 'تلفزيونية', key: '2' },
        { id: 'onboard', name: 'داخل السيارة', key: '3' },
        { id: 'heli', name: 'هليكوبتر', key: '4' },
        { id: 'trackside', name: 'جانب المضمار', key: '5' },
        { id: 'track', name: 'المضمار كامل', key: '6' }
    ];
    var SHOT_SECS = 14;        // مدة كل لقطة بالمخرج التلقائي (ثواني)
    var GIFT_CUT_AFTER = 8;    // أقل مدة للقطة قبل ما يقطع لصاحب دعم
    function setCamMode(id) {
        S.cam.mode = id; S.cam.autoT = 99;
        renderCamBar();
    }
    /** الأسهم تحت بطاقة اللاعب: ينتقل للاعب اللي قبله/بعده بالترتيب ويثبّت الكاميرا عليه. */
    function stepFocus(dir) {
        var st = standings(); if (!st.length) return;
        var i = st.indexOf(S.byId[S.cam.focus]);
        i = (i + dir + st.length) % st.length;
        setFocus(st[i].id, true);
    }
    function setFocus(id, lock) {
        if (!S.byId[id]) return;
        S.cam.focus = id;
        if (lock !== undefined) S.cam.locked = lock;
        renderTower(true);
    }
    function camTick(dt) {
        var st = standings();
        if (!st.length) return;
        if (!S.cam.focus || !S.byId[S.cam.focus]) S.cam.focus = st[0].id;
        var effective = S.cam.mode;
        if (S.cam.mode === 'auto') {
            S.cam.autoT += dt;
            if (S.cam.autoT > SHOT_SECS) {
                S.cam.autoT = 0;
                var seq = ['tv', 'tv', 'trackside', 'tv', 'heli', 'tv', 'onboard', 'trackside'];
                S.cam.autoMode = seq[(seq.indexOf(S.cam.autoMode) + 1 + Math.floor(Math.random() * 2)) % seq.length];
                if (!S.cam.locked) {
                    // نختار أقرب معركة على المراكز، وإلا المتصدر
                    var best = st[0], bestGap = Infinity;
                    for (var i = 1; i < st.length; i++) {
                        if (st[i].finished || st[i - 1].finished) continue;
                        var g = st[i - 1].dist - st[i].dist;
                        if (g < bestGap) { bestGap = g; best = st[i]; }
                    }
                    S.cam.focus = (bestGap < 25 && Math.random() < 0.7) ? best.id : st[Math.floor(Math.random() * Math.min(3, st.length))].id;
                }
            }
            effective = S.phase === 'lobby' ? 'orbit' : S.cam.autoMode;
        } else if (S.phase === 'lobby') {
            effective = 'orbit';
        }
        if (scene) scene.setCamera(effective, S.cam.focus);
        $('camNow').textContent = S.cam.mode === 'auto' && S.phase !== 'lobby' ? 'تلقائي' : camLabel(effective);
    }
    function camLabel(id) {
        if (id === 'orbit') return 'الشبكة';
        for (var i = 0; i < CAM_MODES.length; i++) if (CAM_MODES[i].id === id) return CAM_MODES[i].name;
        return '';
    }

    // ------------------------------------------------------------------
    // الحلقة الرئيسية
    // ------------------------------------------------------------------
    var last = performance.now();
    function frame(now) {
        var dt = Math.min((now - last) / 1000, 0.05); last = now;
        if (S.phase === 'race' || S.phase === 'finish') {
            S.raceClock += dt;
            simulate(dt);
            if (S.phase === 'race' && S.winner) {
                S.finishTimer += dt;
                var allDone = S.cars.every(function (c) { return c.finished; });
                if (allDone || S.finishTimer > 12) endRace();
            }
        }
        camTick(dt);
        if (scene) {
            var order = standings();
            scene.update(S.cars.map(function (c) {
                var p = trackPoint(c.dist, c.lane);
                return { id: c.id, x: p.x, z: p.z, heading: p.heading, speed: c.speed, throttle: c.throttle, fx: c.fx, pos: order.indexOf(c) + 1, d: c.dist, lane: c.lane };
            }));
        }
        hudTick(dt);
        if (engine) { var fc = S.byId[S.cam.focus]; engineUpdate(fc ? fc.speed : 0); }
        requestAnimationFrame(frame);
    }

    // ------------------------------------------------------------------
    // الانطلاق، الفائز، النقاط
    // ------------------------------------------------------------------
    function startCountdown() {
        if (S.phase !== 'lobby' || S.cars.length < 1) return;
        S.phase = 'countdown';
        document.body.dataset.phase = 'countdown';
        $('lights').classList.add('show');
        var n = 0, token = ++S.countToken;
        var lit = function () {
            if (token !== S.countToken || S.phase !== 'countdown') return;
            n++;
            setLights(n);
            showCount(6 - n);
            SFX.light();
            if (n < 5) setTimeout(lit, 900);
            else setTimeout(function () { if (token === S.countToken && S.phase === 'countdown') go(); }, 900 + Math.random() * 1400);
        };
        setTimeout(lit, 700);
    }
    function showCount(k) {
        var el = $('countNum');
        el.textContent = k; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
    function setLights(n) {
        var pods = $('lights').querySelectorAll('.pod:not(.dim)');
        for (var i = 0; i < pods.length; i++) pods[i].classList.toggle('on', i < n);
        if (scene) scene.setLights(n);
    }
    function go() {
        setLights(0);
        SFX.go(); engineStart();
        $('goText').classList.add('show');
        setTimeout(function () { $('goText').classList.remove('show'); $('lights').classList.remove('show'); }, 1400);
        S.phase = 'race'; document.body.dataset.phase = 'race';
        if (scene) scene.setPhase('race');
        S.startedAt = Date.now(); S.raceClock = 0; S.finishTimer = 0;
        S.cars.forEach(function (c) { c.throttle = Math.max(c.throttle, 0.35); });
        S.cam.autoT = 99;
        renderTower(true);
    }

    function onWinner(c) {
        S.winner = c; SFX.finish();
        reportPoints(c);
        if (scene) scene.burst(c.id, 'win');
        if (!S.cam.locked) { S.cam.focus = c.id; }
    }

    // نظام نقاط المنصة — مرة واحدة لكل مباراة (CLAUDE.md)
    function reportPoints(winner) {
        if (S.reported) return; S.reported = true;
        var A = window.AGPAuth;
        S.pts = S.demo ? 'demo' : 'pending';
        if (S.demo || !A || typeof A.reportMatchPoints !== 'function') { if (!S.demo) S.pts = null; return; }
        var run = S.run;
        Promise.resolve(A.reportMatchPoints({
            players: S.cars.map(function (c) { return { id: c.id, name: c.name }; }),
            winnerIds: [winner.id],
            teamGame: false,
            durationMs: Date.now() - S.startedAt
        })).then(function (res) {
            if (run !== S.run) return;
            var uname = String(winner.id).indexOf('tiktok:') === 0 ? String(winner.id).slice(7) : winner.name;
            var aw = res && res.success && Array.isArray(res.awarded) ? res.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] : null;
            S.pts = aw ? aw.added : null; renderWin();
        }).catch(function () { if (run === S.run) { S.pts = null; renderWin(); } });
    }

    /** «إنهاء اللعبة»: يوقف السباق ويعرض الترتيب الحالي (النقاط تنرسل فقط لو فيه فائز وصل). */
    function endNow(force) {
        if (S.phase !== 'race' && S.phase !== 'countdown') return false;
        if (!force && !window.confirm('إنهاء السباق الحين وعرض الترتيب؟')) return false;
        S.countToken++;
        setLights(0); $('lights').classList.remove('show');
        endRace();
        return true;
    }

    // ------------------------------------------------------------------
    // شاشة الفوز — نفس شاشة روليت الإقصاء: خلفية مغبّشة فوق المنصة، «🏆 الفائز في لعبة»،
    // تاج فوق بطاقة WINNER (الصورة، الاسم، النقاط) أو بطاقة الفوز المملوكة، وفيديو الفوز
    // لو عنده، وأزرار الخروج / سباق جديد / إعادة بنفس اللاعبين.
    // ------------------------------------------------------------------
    var winTimer = 0;
    function scheduleWin(ms) { clearTimeout(winTimer); var run = S.run; winTimer = setTimeout(function () { if (run === S.run && S.phase === 'finish') showWin(); }, ms); }
    function winnerCar() { return S.winner || standings()[0] || null; }
    function ptsLine() {
        if (!S.winner) return 'السباق انتهى قبل خط النهاية';
        if (S.pts === 'demo') return 'نسخة تجربة — بدون نقاط';
        if (S.pts === 'pending') return 'جارٍ احتساب النقاط';
        return typeof S.pts === 'number' ? '+' + S.pts + ' نقطة' : 'النقاط للحسابات الموثّقة في الموقع';
    }
    function showWin() {
        var w = winnerCar(); if (!w) return;
        S.winOpen = true; renderWin();
        $('winScreen').classList.add('show'); $('podium').classList.remove('show');
        SFX.win();
    }
    function hideWin() { clearTimeout(winTimer); S.winOpen = false; $('winScreen').classList.remove('show'); $('wVideo').innerHTML = ''; }
    function renderWin() {
        if (!S.winOpen) return;
        var w = winnerCar(); if (!w) return;
        var player = { id: w.id, name: w.name, avatarUrl: w.avatar || null, winCard: w.winCard || null };
        var lines = [ptsLine(), 'المركز الأول من ' + S.cars.length + ' لاعب', 'فورمولا ون'];
        var owned = AGP.winCard && typeof AGP.winCard.canShow === 'function' && AGP.winCard.canShow(player);
        $('wCards').innerHTML = owned ? '<div class="w-owned">' + AGP.winCard.renderHtml(player, lines, { pop: true }) + '</div>' :
            '<div class="w-std"><div class="w-crown"><svg width="60" height="40" viewBox="0 0 60 40"><polygon points="6,36 4,15 15,25 30,5 45,25 56,15 54,36" stroke-width="1.5"></polygon><circle cx="6" cy="13" r="4" stroke-width="1.5"></circle><circle cx="30" cy="4" r="4.5" stroke-width="1.5"></circle><circle cx="54" cy="13" r="4" stroke-width="1.5"></circle><rect x="6" y="32" width="48" height="6" rx="1.5" stroke-width="1.5"></rect></svg></div>' +
            '<div class="w-card"><div class="w-shine"></div><div class="w-in"><span class="w-label">WINNER</span>' +
            '<span class="w-av">' + esc(String(w.name).trim().charAt(0) || '؟') + (w.avatar ? '<img src="' + esc(w.avatar) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span>' +
            '<span class="w-name">' + esc(w.name) + '</span>' +
            '<div class="w-pts"><span>' + esc(ptsLine()) + '<small>' + (S.winner ? 'الزمن ' + fmtTime(w.finishAt) : 'المتصدر لحظة الإنهاء') + '</small></span></div></div></div></div>';
        var vb = $('wVideo');
        if (w.winVideo && !vb.firstChild) {
            var v = document.createElement('video'); v.src = w.winVideo; v.loop = true; v.playsInline = true; v.autoplay = true; v.muted = true;
            v.onerror = function () { vb.innerHTML = ''; vb.hidden = true; }; vb.appendChild(v); vb.hidden = false; v.play && v.play().catch(function () {});
        } else if (!w.winVideo) vb.hidden = true;
    }

    function ceremonyBanner(title, sub) {
        var b = $('cerBanner');
        b.classList.add('shown');
        $('cerTitle').textContent = title; $('cerSub').innerHTML = sub || '';
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    }

    function endRace() {
        S.phase = 'finish'; document.body.dataset.phase = 'finish';
        var st = standings();
        var pod = $('podiumSteps'); pod.innerHTML = '';
        [1, 0, 2].forEach(function (i) {
            var c = st[i]; if (!c) return;
            var el = document.createElement('div');
            el.className = 'step p' + (i + 1);
            el.style.setProperty('--team', c.color);
            el.innerHTML = '<div class="pod-av">' + avatarHtml(c) + '</div><div class="pod-name">' + esc(c.name) + '</div>' +
                '<div class="pod-time">' + (!c.finished ? 'لم يكمل' : i === 0 ? '<span dir="ltr">' + fmtTime(c.finishAt) + '</span>' : (c.finished ? gapTxt(c.finishAt - st[0].finishAt) : 'لم يكمل')) + '</div>' +
                '<div class="pod-block"><span>' + (i + 1) + '</span></div>';
            pod.appendChild(el);
        });
        var rest = $('podiumRest'); rest.innerHTML = '';
        st.slice(3).forEach(function (c, i) {
            var r = document.createElement('div'); r.className = 'rest-row';
            r.innerHTML = '<b>' + (i + 4) + '</b><span class="dot" style="background:' + c.color + '"></span><span>' + esc(c.name) + '</span><span class="rest-gap">' + (c.finished ? gapTxt(c.finishAt - st[0].finishAt) : 'لم يكمل') + '</span>';
            rest.appendChild(r);
        });
        if (scene) { scene.setPhase('finish'); }
        // مراسم ثري دي للثلاثة الأوائل (لو الشخصيات جاهزة)، وإلا منصة HTML العادية
        var top3 = st.slice(0, 3).map(function (c) { return { id: c.id, name: c.name, color: c.color, character: c.character }; });
        var started = false;
        try {
            started = !!(scene && scene.ceremony && scene.ceremony(top3, { onStage: function (stg) {
                // كتابة أقل: بدون عناوين على الشاشة (الأسماء فوق الشخصيات، و«منصة التتويج» مكتوبة على لافتة المنصة نفسها)
                if (stg === 'podium') { $('podium').classList.add('show'); SFX.cheer(); scheduleWin(5000); }
            } }));
        } catch (e) { AGP.log('formula-race: ceremony failed', e); started = false; }
        document.body.classList.toggle('ceremony', started);
        if (!started) { $('podium').classList.add('show'); scheduleWin(2500); }
        engineStop();
    }

    function newRace() { resetRace(); stopTest(); clearDrivers(); }
    function resetRace() {
        hideWin(); S.run = (S.run || 0) + 1; engineStop();
        S.phase = 'lobby'; document.body.dataset.phase = 'lobby';
        S.winner = null; S.reported = false; S.raceClock = 0;
        S.cars.forEach(function (c, i) {
            var sl = gridSlot(i);
            c.dist = sl.dist; c.lane = c.laneT = sl.lane; c.speed = 0; c.throttle = 0; c.finished = false; c.finishAt = 0;
            c.fx = freshFx(); c.likes = 0; c.gifts = 0; c.tapBank = 0;
        });
        $('podium').classList.remove('show');
        $('cerBanner').classList.remove('shown');
        document.body.classList.remove('ceremony');
        if (scene && scene.stopCeremony) scene.stopCeremony();
        if (scene) { scene.setPhase('lobby'); scene.setCars(S.cars); }
        renderLobby();
    }
    function clearDrivers() {
        if (S.phase !== 'lobby') return;
        S.cars = []; S.byId = {};
        if (scene) scene.setCars(S.cars);
        renderLobby();
    }

    // ------------------------------------------------------------------
    // الواجهة (HUD)
    // ------------------------------------------------------------------
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
    function avatarHtml(c) {
        var init = esc(String(c.name).trim().charAt(0) || '؟');
        return c.avatar ? '<img src="' + esc(c.avatar) + '" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{textContent:\'' + init.replace(/'/g, '') + '\'}))">' : '<span>' + init + '</span>';
    }
    function gapTxt(sec) { return '<span dir="ltr">+' + sec.toFixed(1) + '</span> ث'; }
    function isLight(hex) { var n = parseInt(String(hex).slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 170; }
    function fmtTime(s) { var m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }

    function renderLobby() {
        $('startBtn').disabled = S.cars.length < 1;
        $('startBtn2').disabled = S.cars.length < 1;
        renderReady();
        $('kwShow').textContent = settings.keyword;
        $('kwShow2').textContent = settings.keyword;
        renderTower(true);
    }

    /** بطاقة اللوبي: بانتظار المتسابقين ← كل شيء جاهز للسباق. */
    function renderReady() {
        var n = S.cars.length, kw = esc(settings.keyword);
        $('rcSub').className = n ? '' : 'wait';
        $('rcSub').textContent = n ? 'السائقون جاهزون (' + n + ' / ' + settings.maxDrivers + ')' : 'بانتظار المتسابقين';
        $('rcTitle').innerHTML = n ? 'كل شيء جاهز للسباق' : 'اكتب «' + kw + '» بالشات للمشاركة';
        $('rcHint').innerHTML = n ? 'للمشاركة اكتب «<b>' + kw + '</b>» بالشات · التكبيس يزيد سرعتك · كل ' + TAPS_PER_NITRO + ' تكبيسة تعطيك نيترو'
            : 'التكبيس يزيد سرعتك · كل ' + TAPS_PER_NITRO + ' تكبيسة تعطيك نيترو';
    }
    function openSettings(on) { document.body.classList.toggle('settings-open', on); }

    var towerRows = {};
    function renderTower(full) {
        var tower = $('towerRows');
        var st = standings();
        if (full) {
            Object.keys(towerRows).forEach(function (id) { if (!S.byId[id]) { towerRows[id].remove(); delete towerRows[id]; } });
            st.forEach(function (c) {
                var r = towerRows[c.id];
                if (!r) {
                    r = document.createElement('button');
                    r.className = 'trow'; r.type = 'button';
                    r.innerHTML = '<span class="tpos"></span><span class="tbar"></span><span class="tav"></span><span class="tname"></span><span class="tgap"></span><span class="tfx"></span>';
                    r.addEventListener('click', function () {
                        if (S.cam.focus === c.id && S.cam.locked) { S.cam.locked = false; }
                        else setFocus(c.id, true);
                        renderTower(true);
                    });
                    tower.appendChild(r); towerRows[c.id] = r;
                }
                r.style.setProperty('--team', c.color);
                r.querySelector('.tav').innerHTML = avatarHtml(c);
                r.querySelector('.tname').textContent = c.name;
            });
        }
        var leader = st[0];
        st.forEach(function (c, i) {
            var r = towerRows[c.id]; if (!r) return;
            r.style.transform = 'translateY(' + (i * 100) + '%)';
            r.querySelector('.tpos').textContent = i + 1;
            var gap;
            if (S.phase === 'lobby' || S.phase === 'countdown') gap = 'جاهز';
            else if (i === 0) gap = c.finished ? '🏁' : 'L' + lapOf(c) + '/' + settings.laps;
            else if (c.finished) gap = '+' + (c.finishAt - leader.finishAt).toFixed(1) + 'ث';
            else gap = '+' + Math.max(0, Math.round(leader.dist - c.dist)) + 'م';
            r.querySelector('.tgap').textContent = gap;
            var fx = c.fx, icon = fx.stop > 0 ? '⛔' : fx.shuttle > 0 ? '🚀' : fx.nitro > 0 ? '💨' : fx.shield > 0 ? '🛡️' : '';
            r.querySelector('.tfx').textContent = icon;
            r.classList.toggle('focus', S.cam.focus === c.id);
            r.classList.toggle('locked', S.cam.focus === c.id && S.cam.locked);
        });
        $('towerCount').textContent = st.length + ' سائق';
        $('towerTitle').textContent = S.phase === 'lobby' || S.phase === 'countdown' ? 'شبكة البداية' : 'لوحة الصدارة';
        var first = tower.firstElementChild;
        tower.style.height = (st.length * (first ? first.offsetHeight : 38)) + 'px';
    }

    var hudAcc = 0;
    function hudTick(dt) {
        hudAcc += dt;
        if (hudAcc < 0.1) return;
        hudAcc = 0;
        renderTower(false);
        var st = standings(), lead = st[0];
        if (lead && (S.phase === 'race' || S.phase === 'finish')) {
            $('lapNow').textContent = lapOf(lead); $('lapTotal').textContent = settings.laps;
            $('raceClock').textContent = fmtTime(S.raceClock);
            $('raceProg').style.transform = 'scaleX(' + Math.max(0, Math.min(1, lead.dist / (settings.laps * TRACK.length))).toFixed(3) + ')';
        } else {
            $('lapNow').textContent = 0; $('lapTotal').textContent = settings.laps; $('raceClock').textContent = '0:00.0';
            $('raceProg').style.transform = 'scaleX(0)';
        }
        // بطاقة المتسابق المركّز عليه
        var f = S.byId[S.cam.focus];
        if (f) {
            $('focusCard').style.setProperty('--team', f.color);
            $('focusCard').style.setProperty('--team-ink', isLight(f.color) ? '#111' : '#fff');
            $('fName').textContent = f.name;
            $('fPos').textContent = 'P' + (st.indexOf(f) + 1);
            $('fAv').innerHTML = avatarHtml(f);
            $('fSpeed').textContent = Math.round(f.speed * 3.6);
            // الشريط = نسبة التكبيس للنيترو الجاي؛ لما يكتمل يتحول لشريط النيترو ويفضى طول مدته
            var nitroOn = f.fx.nitro > 0;
            var gauge = $('fNitroBar');
            gauge.classList.toggle('on', nitroOn);
            $('fNitroLbl').textContent = nitroOn ? 'نيترو شغّال' : 'نيترو';
            $('fTaps').innerHTML = nitroOn ? '<b>' + f.fx.nitro.toFixed(1) + '</b>ث' : '<b>' + f.tapBank + '</b>/' + TAPS_PER_NITRO;
            $('fNitro').style.transform = 'scaleX(' + (nitroOn ? Math.min(1, f.fx.nitro / NITRO_SECS) : f.tapBank / TAPS_PER_NITRO).toFixed(3) + ')';
            $('fLock').style.display = S.cam.locked ? '' : 'none';
            var fx = f.fx, act = [];
            [['shield', 'shield'], ['nitro', 'nitro'], ['shuttle', 'shuttle']].forEach(function (k) {
                if (fx[k[0]] > 0) { var e = effectById(k[1]); act.push('<span style="--c:' + e.color + '">' + e.icon + ' ' + e.name + '</span>'); }
            });
            if (fx.stop > 0) act.push('<span style="--c:#ef4444">⛔ متوقف</span>');
            $('fFx').innerHTML = act.join('');
        }
        drawMinimap();
    }

    // الخريطة المصغرة (وهي نفسها البديل لو فشل الثري دي)
    var mm = null, mmBounds = null;
    function drawMinimap() {
        var cv = $('minimap'); if (!cv) return;
        var big = document.body.classList.contains('no3d');
        var W = cv.clientWidth, Hh = cv.clientHeight; if (!W || !Hh) return;
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
        var ctx = cv.getContext('2d');
        if (!mmBounds) {
            var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (var i = 0; i < TRACK.count; i++) { minX = Math.min(minX, TRACK.x[i]); maxX = Math.max(maxX, TRACK.x[i]); minZ = Math.min(minZ, TRACK.z[i]); maxZ = Math.max(maxZ, TRACK.z[i]); }
            mmBounds = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
        }
        var b = mmBounds, pad = 12 * dpr;
        var sc = Math.min((cv.width - pad * 2) / (b.maxX - b.minX), (cv.height - pad * 2) / (b.maxZ - b.minZ));
        var ox = (cv.width - (b.maxX - b.minX) * sc) / 2, oz = (cv.height - (b.maxZ - b.minZ) * sc) / 2;
        // المحور x يُعكس حتى تطابق الخريطة اتجاه المشهد من فوق
        var px = function (x) { return cv.width - (ox + (x - b.minX) * sc); };
        var pz = function (z) { return oz + (z - b.minZ) * sc; };
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (var k = 0; k <= TRACK.count; k++) { var q = k % TRACK.count; if (k) ctx.lineTo(px(TRACK.x[q]), pz(TRACK.z[q])); else ctx.moveTo(px(TRACK.x[q]), pz(TRACK.z[q])); }
        ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = (big ? 14 : 7) * dpr; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = (big ? 3 : 1.6) * dpr; ctx.stroke();
        // خط البداية
        var s0 = trackPoint(0, 0);
        ctx.fillStyle = '#a855f7'; ctx.fillRect(px(s0.x) - 2 * dpr, pz(s0.z) - 6 * dpr, 4 * dpr, 12 * dpr);
        standings().slice().reverse().forEach(function (c) {
            var p = trackPoint(c.dist, c.lane);
            var focus = S.cam.focus === c.id;
            ctx.beginPath(); ctx.arc(px(p.x), pz(p.z), (focus ? 5.5 : 3.8) * dpr * (big ? 1.6 : 1), 0, Math.PI * 2);
            ctx.fillStyle = c.color; ctx.fill();
            ctx.lineWidth = (focus ? 2 : 1) * dpr; ctx.strokeStyle = focus ? '#fff' : 'rgba(0,0,0,.6)'; ctx.stroke();
            if (big) { ctx.fillStyle = '#fff'; ctx.font = '600 ' + (11 * dpr) + 'px "IBM Plex Sans Arabic"'; ctx.textAlign = 'center'; ctx.fillText(c.name, px(p.x), pz(p.z) - 12 * dpr); }
        });
    }

    function renderCamBar() {
        var bar = $('camBar');
        if (!bar.children.length) {
            CAM_MODES.forEach(function (m) {
                var b = document.createElement('button');
                b.type = 'button'; b.dataset.mode = m.id;
                b.innerHTML = '<kbd>' + m.key + '</kbd>' + m.name;
                b.addEventListener('click', function () { setCamMode(m.id); });
                bar.appendChild(b);
            });
        }
        Array.prototype.forEach.call(bar.children, function (b) { b.classList.toggle('on', b.dataset.mode === S.cam.mode); });
        $('camTrack').classList.toggle('on', S.cam.mode === 'track');
    }

    /** لوحة «طريقة اللعب»: التكبيس، النيترو، ثم كل تأثير بصورة هديته المختارة. */
    function renderPerks() {
        var row = function (cls, c, ic, small, big) {
            return '<div class="perk ' + cls + '" style="--c:' + c + '"><span class="perk-ic">' + ic + '</span><span class="perk-txt"><small>' + small + '</small><b>' + big + '</b></span></div>';
        };
        var rows = [
            row('tap', '#a855f7', '👆', 'كبّس على الشاشة', 'سرعة أعلى'),
            row('', NITRO.color, NITRO.icon, 'كل ' + TAPS_PER_NITRO + ' تكبيسة' + (settings.giftsOn ? '' : ' أو أي دعم'), 'نيترو')
        ];
        if (settings.giftsOn) {
            EFFECTS.forEach(function (e) {
                var g = giftById(settings.gifts[e.id]);
                rows.push(row('', e.color, g ? '<img src="' + esc(g.img) + '" alt="">' : e.icon, g ? esc(g.name) : '', '<i>' + e.icon + '</i> ' + e.name));
            });
            rows.push(row('', NITRO.color, '🎁', 'أي دعم ثاني', 'نيترو'));
        }
        $('perkList').innerHTML = rows.join('');
    }

    var toastQ = 0;
    function toast(html, color) {
        var box = $('toasts');
        var t = document.createElement('div');
        t.className = 'toast'; t.style.setProperty('--c', color || '#7c3aed');
        t.innerHTML = html;
        box.prepend(t);
        while (box.children.length > 5) box.lastChild.remove();
        setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 4200 + (toastQ++ % 3) * 200);
    }

    // أصوات بسيطة (إشارات البداية)
    // ------------------------------------------------------------------
    // الأصوات: مولّدة بالكود (WebAudio) بدون ملفات. المستوى العام 40% (أقل من النص)
    // عشان ما تغطّي على صوت الستريمر. تشتغل بعد أول ضغطة بالصفحة (سياسة المتصفح).
    // ------------------------------------------------------------------
    var MASTER_VOLUME = 0.4;
    var actx = null, master = null, engine = null, noiseBuf = null;
    function ac() {
        if (!settings.soundOn) return null;
        try {
            if (!actx) {
                actx = new (window.AudioContext || window.webkitAudioContext)();
                master = actx.createGain(); master.gain.value = MASTER_VOLUME;
                var comp = actx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
                master.connect(comp); comp.connect(actx.destination);
            }
            if (actx.state === 'suspended') actx.resume();
            return actx;
        } catch (e) { return null; }
    }
    function unlockAudio() { ac(); }
    function tone(freq, len, type, vol, delay, slideTo) {
        var a = ac(); if (!a) return;
        var t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
        o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + len + 0.05);
    }
    function noise(len, vol, fFrom, fTo, delay, q) {
        var a = ac(); if (!a) return;
        if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
        var t = a.currentTime + (delay || 0), src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        src.buffer = noiseBuf; src.loop = true;
        f.type = 'bandpass'; f.Q.value = q || 1.2; f.frequency.setValueAtTime(fFrom, t); f.frequency.exponentialRampToValueAtTime(fTo || fFrom, t + len);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + Math.min(0.06, len / 3));
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + len + 0.05);
    }
    var SFX = {
        light: function () { tone(440, 0.22, 'square', 0.12); },
        go: function () { tone(880, 0.55, 'square', 0.14); noise(0.9, 0.12, 400, 2400); },
        join: function () { tone(660, 0.09, 'triangle', 0.12); tone(990, 0.12, 'triangle', 0.1, 0.07); },
        nitro: function () { noise(0.7, 0.22, 600, 3800, 0, 0.8); tone(220, 0.5, 'sawtooth', 0.05, 0, 660); },
        shield: function () { tone(1046, 0.5, 'sine', 0.12); tone(1568, 0.6, 'sine', 0.08, 0.06); },
        portal: function () { tone(300, 0.5, 'sine', 0.14, 0, 1400); tone(1400, 0.35, 'triangle', 0.08, 0.35, 500); },
        shuttle: function () { noise(1.1, 0.24, 300, 2600, 0, 0.7); tone(110, 0.9, 'sawtooth', 0.06, 0, 330); },
        rocket: function () { noise(0.5, 0.18, 2000, 500); noise(0.6, 0.3, 160, 60, 0.45, 0.6); },
        lightning: function () { noise(0.25, 0.3, 5000, 1200, 0, 0.5); noise(0.9, 0.22, 120, 50, 0.12, 0.5); },
        hit: function () { tone(180, 0.35, 'square', 0.1, 0, 70); },
        finish: function () { [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, 0.35, 'triangle', 0.13, i * 0.12); }); },
        cheer: function () { noise(3.2, 0.16, 900, 1400, 0, 0.6); noise(2.6, 0.1, 2200, 2600, 0.3, 0.8); },
        // نفس نغمة الفوز بروليت الإقصاء
        win: function () { tone(523.25, 0.22, 'sine', 0.2); tone(659.25, 0.22, 'sine', 0.2, 0.16); tone(783.99, 0.5, 'sine', 0.165, 0.32); }
    };
    function beep(freq, len) { tone(freq, len, 'square', 0.12); }
    // صوت المحرك: يتبع سرعة السيارة اللي الكاميرا تتابعها (خافت جداً)
    function engineStart() {
        var a = ac(); if (!a || engine) return;
        var o1 = a.createOscillator(), o2 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
        o1.type = 'sawtooth'; o2.type = 'sawtooth'; o2.detune.value = 12;
        f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 2;
        g.gain.value = 0.0001; g.gain.setTargetAtTime(0.045, a.currentTime, 0.4);
        o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
        engine = { o1: o1, o2: o2, f: f, g: g };
    }
    function engineUpdate(speed) {
        if (!engine || !actx) return;
        var hz = 46 + Math.min(110, speed) * 1.25, t = actx.currentTime;
        engine.o1.frequency.setTargetAtTime(hz, t, 0.12); engine.o2.frequency.setTargetAtTime(hz * 1.5, t, 0.12);
        engine.f.frequency.setTargetAtTime(380 + speed * 9, t, 0.15);
    }
    function engineStop() {
        if (!engine || !actx) return;
        var e = engine; engine = null;
        e.g.gain.setTargetAtTime(0.0001, actx.currentTime, 0.25);
        setTimeout(function () { try { e.o1.stop(); e.o2.stop(); } catch (x) {} }, 1200);
    }
    function setSound(on) {
        settings.soundOn = !!on; saveSettings();
        if (!on) { engineStop(); if (actx) { try { actx.suspend(); } catch (e) {} } }
        else { ac(); if (S.phase === 'race') engineStart(); }
        renderSoundBtn();
    }
    function renderSoundBtn() {
        var b = $('soundBtn'); if (!b) return;
        b.classList.toggle('on', !!settings.soundOn);
        b.textContent = settings.soundOn ? '🔊 الصوت: تشغيل' : '🔇 الصوت: إيقاف';
    }


    // ------------------------------------------------------------------
    // الإعدادات (صف لكل خيار: العنوان يمين والعنصر يسار — قاعدة CLAUDE.md)
    // ------------------------------------------------------------------
    function saveSettings() { writeJSON(SETTINGS_KEY, settings); }
    function syncSettingsUI() {
        $('setLaps').value = settings.laps;
        $('setMax').value = settings.maxDrivers;
        $('setKw').value = settings.keyword;
        $('setAutoCam').checked = !!settings.autoCam;
        $('setGiftsOn').checked = !!settings.giftsOn;
        $('giftsOnTxt').textContent = settings.giftsOn ? 'مفعّل' : 'متوقف';
        $('giftRows').classList.toggle('off', !settings.giftsOn);
        pills('setJoin', settings.joinMode); pills('setQuality', settings.quality);
        $('kwShow').textContent = settings.keyword; $('kwShow2').textContent = settings.keyword;
        pills('ctrlQuality', settings.quality);
        renderGiftRows(); renderPerks();
    }
    function pills(id, v) { Array.prototype.forEach.call($(id).children, function (b) { b.classList.toggle('on', b.dataset.v === v); }); }
    function qualityName(q) { return { light: 'خفيف', balanced: 'متوازن', cinematic: 'سينمائي' }[q] || ''; }
    function setQuality(q) {
        settings.quality = q; saveSettings();
        if (scene) scene.setQuality(q);
        syncSettingsUI();
    }

    function bindSettings() {
        // أزرار − / + بجنب الأرقام (نفس عدّادات روليت الإقصاء)
        Array.prototype.forEach.call(document.querySelectorAll('.er-step button'), function (b) {
            b.onclick = function () { var inp = $(b.dataset.for); inp.value = (parseInt(inp.value, 10) || 0) + Number(b.dataset.d); inp.onchange(); };
        });
        $('setLaps').onchange = function () { settings.laps = clampInt(this.value, 1, MAX_LAPS, settings.laps); saveSettings(); syncSettingsUI(); };
        $('setMax').onchange = function () {
            settings.maxDrivers = clampInt(this.value, Math.max(1, S.cars.length), MAX_DRIVERS_LIMIT, settings.maxDrivers);
            saveSettings(); syncSettingsUI(); renderLobby();
        };
        $('setKw').oninput = function () { var v = this.value.trim(); if (v) { settings.keyword = v.slice(0, 20); saveSettings(); $('kwShow').textContent = settings.keyword; $('kwShow2').textContent = settings.keyword; renderReady(); } };
        $('setAutoCam').onchange = function () { settings.autoCam = this.checked; S.cam.mode = settings.autoCam ? 'auto' : 'tv'; saveSettings(); renderCamBar(); };
        Array.prototype.forEach.call($('setJoin').children, function (b) { b.onclick = function () { settings.joinMode = b.dataset.v; saveSettings(); syncSettingsUI(); }; });
        Array.prototype.forEach.call($('setQuality').children, function (b) { b.onclick = function () { setQuality(b.dataset.v); }; });
        $('setGiftsOn').onchange = function () { settings.giftsOn = this.checked; saveSettings(); syncSettingsUI(); };
        $('resetSettings').onclick = function () {
            settings = Object.assign({}, DEFAULTS, { gifts: Object.assign({}, DEFAULT_GIFTS), maxDrivers: Math.max(DEFAULTS.maxDrivers, S.cars.length) });
            saveSettings(); S.cam.mode = settings.autoCam ? 'auto' : 'tv'; renderCamBar();
            if (scene) scene.setQuality(settings.quality);
            syncSettingsUI(); renderLobby();
        };
        Array.prototype.forEach.call($('ctrlQuality').children, function (b) { b.onclick = function () { setQuality(b.dataset.v); }; });
        $('giftRows').addEventListener('click', function (e) { var b = e.target.closest('[data-pick]'); if (b) openPicker(b.dataset.pick); });
        $('pickerClose').onclick = closePicker;
        $('picker').addEventListener('click', function (e) {
            if (e.target === $('picker')) return closePicker();
            var g = e.target.closest('[data-gift]'); if (!g || !pickFor) return;
            // نفس الهدية ما تنربط بتأثيرين: لو مستخدمة نبدّل بينهم
            var prev = settings.gifts[pickFor], gid = g.dataset.gift;
            Object.keys(settings.gifts).forEach(function (k) { if (k !== pickFor && settings.gifts[k] === gid) settings.gifts[k] = prev; });
            settings.gifts[pickFor] = gid;
            saveSettings(); closePicker(); syncSettingsUI();
        });
        syncSettingsUI();
        renderSoundBtn();
    }

    /** صفوف هدايا السباق: مربع منقّط بصورة الهدية (يفتح الاختيار) + اسم التأثير ووصفه. */
    function renderGiftRows() {
        $('giftRows').innerHTML = EFFECTS.map(function (e) {
            var g = giftById(settings.gifts[e.id]);
            return '<div class="er-gift" style="--c:' + e.color + '">' +
                '<button type="button" class="er-gbox" data-pick="' + e.id + '" aria-label="اختيار هدية ' + e.name + '">' +
                (g ? '<img src="' + esc(g.img) + '" alt=""><span>' + esc(g.name) + '</span>' : '<b style="font-size:30px">+</b><span>اختر هدية</span>') + '</button>' +
                '<div class="er-gtxt"><b><i>' + e.icon + '</i> ' + e.name + '</b><small>' + e.desc + '</small>' +
                (g ? '<em>' + g.coins + ' عملة</em>' : '') + '</div></div>';
        }).join('');
    }
    var pickFor = null;
    function openPicker(effectId) {
        pickFor = effectId;
        var e = effectById(effectId);
        $('pickerTitle').textContent = 'هدية ' + e.name;
        $('pickerGrid').innerHTML = giftList().map(function (g) {
            var usedBy = null;
            Object.keys(settings.gifts).forEach(function (k) { if (settings.gifts[k] === g.id) usedBy = effectById(k); });
            return '<button type="button" class="pk' + (settings.gifts[effectId] === g.id ? ' on' : '') + '" data-gift="' + esc(g.id) + '"><img src="' + esc(g.img) + '" alt=""><b>' + esc(g.name) + '</b><small>' + g.coins + ' عملة</small>' +
                (usedBy && usedBy.id !== effectId ? '<em>' + usedBy.name + '</em>' : '') + '</button>';
        }).join('');
        $('picker').classList.add('show');
    }
    function closePicker() { pickFor = null; $('picker').classList.remove('show'); }

    // ------------------------------------------------------------------
    // ربط البث
    // ------------------------------------------------------------------
    function norm(s) {
        return String(s == null ? '' : s).normalize('NFKC').trim()
            .replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
            .toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    }
    function bindStream() {
        if (!AGP.events || typeof AGP.events.on !== 'function') return;
        AGP.events.on('stream:commentReceived', function (p) {
            if (!p || !p.id || typeof p.text !== 'string') return;
            // لاعب دخل بدون صورة (مثلاً بالدعم) ووصلت صورته بتعليق: نحدّثها بالدبوس واللوحات
            var known = S.byId[p.id];
            fillAvatar(known, p.avatarUrl);
            if (S.phase !== 'lobby' || norm(p.text) !== norm(settings.keyword)) return;
            if (settings.joinMode === 'followers' && !p.isFollower) return;
            addCar(p);
        });
        AGP.events.on('stream:giftReceived', function (p) { if (p && p.id) onGift(p); });
        AGP.events.on('stream:likeReceived', function (p) {
            if (!p || !p.id) return;
            fillAvatar(S.byId[p.id], p.avatarUrl);
            onLike(p.id, p.count);
        });
        AGP.events.on('stream:statusChanged', updateLive);
        window.addEventListener('storage', function (e) { if (e.key === STREAM_CONNECTION_STORAGE_KEY) connect(); });
        window.addEventListener('agp:stream-connected', connect);
        connect();
    }
    var _connected = false;
    function connect() {
        var saved = readJSON(STREAM_CONNECTION_STORAGE_KEY, null);
        if (_connected || !saved || !saved.username || !AGP.streamConnector) { updateLive(); return; }
        _connected = true;
        try { AGP.streamConnector.connect('tiktok', { username: saved.username }); } catch (e) { AGP.log('formula-race: connect failed', e); }
        updateLive();
    }
    function updateLive() {
        var st = null;
        try { st = AGP.streamConnector && AGP.streamConnector.getStatus ? AGP.streamConnector.getStatus('tiktok') : null; } catch (e) {}
        var status = st;
        var on = status === 'connected';
        var el = $('liveBadge');
        el.classList.toggle('on', on);
        el.querySelector('span').textContent = on ? 'متصل بالبث' : (_connected ? 'جاري الاتصال…' : 'غير متصل بالبث');
    }

    // «تجربة اللعبة»: متسابقين وهميين يكمّلون الشبكة، تكبيس ودعم عشوائي، وبدون نقاط.
    // نفس الشي من الرابط: ?demo=1 (و&autostart=1 يبدأ السباق على طول).
    var demoTimer = 0;
    function startTest(autostart) {
        if (S.phase !== 'lobby') return;
        S.demo = true; document.body.classList.add('testing');
        var names = ['أبو فهد', 'نورة', 'سلطان', 'ريم ⚡', 'ماجد', 'Lama', 'خالد ٧', 'جود', 'تركي', 'سارا', 'فيصل', 'هيا', 'بندر', 'دانة', 'عزوز', 'مشاعل'];
        var AV = [GAME_DIR + '../../assets/characters/girl.png', GAME_DIR + '../../assets/characters/boy.png'];
        for (var i = 0; S.cars.length < Math.min(settings.maxDrivers, 10) && i < 60; i++) addCar({ id: 'demo:' + i, name: names[i % names.length] + (i >= names.length ? ' ' + (Math.floor(i / names.length) + 1) : ''), bot: true, avatarUrl: i % 3 === 2 ? null : AV[i % 2] });
        $('toasts').innerHTML = '';
        clearInterval(demoTimer);
        demoTimer = setInterval(function () {
            if (S.phase !== 'race' || !S.cars.length) return;
            var c = S.cars[Math.floor(Math.random() * S.cars.length)];
            var ids = Object.keys(settings.gifts), pick = Math.random() < 0.2 ? null : settings.gifts[ids[Math.floor(Math.random() * ids.length)]];
            var g = pick ? giftById(pick) : { id: 'tiktok', name: 'TikTok', coins: 1 };
            onGift({ id: c.id, giftName: g.id, giftValue: g.coins, repeatCount: 1 });
        }, 3200);
        if (autostart) setTimeout(startCountdown, 600);
    }
    function stopTest() {
        if (!S.demo) return;
        S.demo = false; document.body.classList.remove('testing'); clearInterval(demoTimer);
        S.cars.filter(function (c) { return c.bot; }).forEach(function (c) { delete S.byId[c.id]; });
        S.cars = S.cars.filter(function (c) { return !c.bot; });
        S.cars.forEach(function (car, i) { var sl = gridSlot(i); car.number = i + 1; car.dist = sl.dist; car.lane = car.laneT = sl.lane; });
        if (scene) scene.setCars(S.cars);
        renderLobby();
    }

    // ------------------------------------------------------------------
    // تشغيل
    // ------------------------------------------------------------------
    function bindUI() {
        $('startBtn').onclick = function () { openSettings(false); startCountdown(); };
        $('startBtn2').onclick = startCountdown;
        $('settingsBtn').onclick = function () { openSettings(true); };
        $('settingsClose').onclick = function () { openSettings(false); };
        $('testBtn2').onclick = function () { startTest(true); };
        $('againBtn').onclick = function () { resetRace(); stopTest(); };
        $('wExit').onclick = function () { $('exitBtn').click(); };
        $('wNew').onclick = newRace;
        $('wSame').onclick = function () { resetRace(); stopTest(); };
        $('soundBtn').onclick = function () { setSound(!settings.soundOn); };
        // أول ضغطة/زر بالصفحة يفتح الصوت (المتصفح يمنع الصوت قبل تفاعل)
        ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, unlockAudio, { passive: true }); });
        $('exitBtn').onclick = function () { location.href = '../../games.html'; };
        $('hudToggle').onclick = function () { document.body.classList.toggle('clean'); };
        $('endBtn').onclick = endNow;
        $('ctrlBtn').onclick = function (e) { e.stopPropagation(); $('ctrlMenu').classList.toggle('show'); $('ctrlBtn').classList.toggle('on', $('ctrlMenu').classList.contains('show')); };
        document.addEventListener('click', function (e) {
            if (!$('ctrlMenu').classList.contains('show') || e.target.closest('#ctrlMenu') || e.target.closest('#ctrlBtn')) return;
            $('ctrlMenu').classList.remove('show'); $('ctrlBtn').classList.remove('on');
        });
        $('prevCar').onclick = function () { stepFocus(-1); };
        $('nextCar').onclick = function () { stepFocus(1); };
        // زر اللقطة يتنقل بين اللقطات (بدون «المضمار كامل» — له زر خاص)
        $('camCycle').onclick = function () {
            var ids = CAM_MODES.map(function (m) { return m.id; }).filter(function (id) { return id !== 'track'; });
            setCamMode(ids[(ids.indexOf(S.cam.mode) + 1) % ids.length]);
        };
        $('camTrack').onclick = function () { setCamMode(S.cam.mode === 'track' ? 'auto' : 'track'); };
        document.addEventListener('keydown', function (e) {
            if (e.target && /input|textarea/i.test(e.target.tagName)) return;
            var m = CAM_MODES.filter(function (x) { return x.key === e.key; })[0];
            if (m) { setCamMode(m.id); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { stepFocus(e.key === 'ArrowDown' ? 1 : -1); e.preventDefault(); }
            if (e.key === 'Escape') { openSettings(false); S.cam.locked = false; renderTower(true); }
            if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
        });
    }

    function mount3D() {
        var host = $('stage');
        import('./f1-scene.js').then(function (mod) {
            scene = mod.mountRace(host, { track: TRACK, trackPoint: trackPoint, quality: settings.quality });
            scene.setCars(S.cars);
            scene.setPhase(S.phase === 'finish' ? 'finish' : 'lobby');
        }).catch(function (e) {
            AGP.log('formula-race: 3D unavailable, using 2D map', e);
            document.body.classList.add('no3d');
            scene = null;
        });
    }

    // ------------------------------------------------------------------
    // التحكم عن بعد (js/agp-remote-control.js): المتحكم يشغّل اللعبة من جواله
    // (control.html) أو بأوامر الشات (!ابدأ، !كاميرا هليكوبتر، !تابع 3 …).
    // نفس الأوامر بالضبط بالمكانين، والإعدادات تطلع بالجوال بقيمها.
    // ------------------------------------------------------------------
    function attachRemote() {
        var RC = AGP.remoteControl; if (!RC || typeof RC.attach !== 'function') return;
        var SEC = 'إعدادات السباق';
        var onOff = function (arg, cur) { return String(arg || '').trim() ? RC.parseBool(arg) : !cur; };
        var findCar = function (arg) {
            var a = String(arg || '').trim(); if (!a) return null;
            var k = RC.toInt(a), st = standings();
            if (k != null && /^[\s#0-9٠-٩۰-۹]+$/.test(a)) return S.cars.filter(function (c) { return c.number === k; })[0] || st[k - 1] || null;
            var q = RC.norm(a), u = 'tiktok:' + a.replace(/^@/, '').toLowerCase();
            return S.cars.filter(function (c) { return RC.norm(c.name) === q || c.id.toLowerCase() === u; })[0] ||
                S.cars.filter(function (c) { return RC.norm(c.name).indexOf(q) === 0; })[0] || null;
        };
        // «3 نورة» (من اختيار الجوال) أو «3» → بالرقم؛ غير كذا بالاسم كامل
        var pickCar = function (arg) {
            var a = String(arg || '').trim(), m = a.match(/^([0-9٠-٩۰-۹]+)(\s|$)/);
            return m ? findCar(m[1]) : findCar(a);
        };
        var CAM_NAMES = CAM_MODES.map(function (m) { return m.name; });
        var Q_NAMES = ['خفيف', 'متوازن', 'سينمائي'], Q_IDS = ['light', 'balanced', 'cinematic'];
        var setNum = function (key, lo, hi, arg) {
            var v = RC.toInt(arg); if (v == null || v < lo || v > hi) return { ok: false, msg: 'رقم من ' + lo + ' إلى ' + hi };
            if (key === 'maxDrivers' && v < S.cars.length) return { ok: false, msg: 'فيه ' + S.cars.length + ' لاعب داخلين — ما يصير الحد أقل' };
            settings[key] = v; saveSettings(); syncSettingsUI(); renderLobby(); return null;
        };
        RC.attach({
            game: 'formula-race', page: 'فورمولا ون', connect: connect,
            status: function () {
                if (S.phase === 'lobby') return 'الشبكة: ' + S.cars.length + ' / ' + settings.maxDrivers + ' · كلمة الدخول «' + settings.keyword + '»';
                if (S.phase === 'countdown') return '🚦 العد التنازلي';
                if (S.phase === 'race') { var l = standings()[0]; return '🏎️ السباق شغّال · اللفة ' + (l ? lapOf(l) : 1) + '/' + settings.laps + (l ? ' · المتصدر ' + l.name : ''); }
                return '🏆 السباق انتهى' + (S.winner ? ' · الفائز ' + S.winner.name : '');
            },
            commands: [
                { names: ['ابدأ', 'ابدا', 'انطلاق'], desc: 'يبدأ السباق (العد التنازلي)', label: 'ابدأ السباق 🚦', tone: 'primary', run: function () {
                    if (S.phase !== 'lobby') return { ok: false, msg: 'السباق مو باللوبي' };
                    if (!S.cars.length) return { ok: false, msg: 'ما فيه لاعبين بالشبكة' };
                    openSettings(false); startCountdown(); return 'انطلق العد التنازلي 🚦'; } },
                { names: ['انهاء', 'إنهاء', 'وقف'], desc: 'ينهي السباق الحين ويعرض الترتيب', label: 'إنهاء اللعبة', tone: 'danger', confirm: 'إنهاء السباق الحين؟', run: function () {
                    return endNow(true) ? 'انتهى السباق' : { ok: false, msg: 'ما فيه سباق شغّال' }; } },
                { names: ['جديد', 'سباق جديد', 'اعادة'], desc: 'سباق جديد بنفس اللاعبين', label: 'سباق جديد 🔁', run: function () {
                    if (S.phase !== 'finish') return { ok: false, msg: 'السباق ما خلص' };
                    resetRace(); stopTest(); return 'رجعنا للشبكة'; } },
                { names: ['تجربة'], desc: 'تجربة اللعبة بلاعبين وهميين (بدون نقاط)', label: 'تجربة ▷', run: function () {
                    if (S.phase !== 'lobby') return { ok: false, msg: 'التجربة من اللوبي بس' };
                    startTest(true); return 'بدأت التجربة'; } },
                { names: ['شيل', 'اطرد', 'ازالة'], args: '<رقم أو اسم>', desc: 'يشيل لاعب من الشبكة (قبل الانطلاق)', section: 'الشبكة',
                    pick: function () { return S.cars.map(function (c) { return c.number + ' ' + c.name; }); }, run: function (arg) {
                    if (S.phase !== 'lobby') return { ok: false, msg: 'تقدر تشيل لاعب قبل الانطلاق بس' };
                    var c = pickCar(arg); if (!c) return { ok: false, msg: 'ما لقيت هاللاعب' };
                    removeCar(c.id); return 'انشال ' + c.name; } },
                { names: ['كاميرا', 'لقطة'], args: '<' + CAM_NAMES.join(' / ') + '>', desc: 'تغيير لقطة الكاميرا', section: 'الكاميرا',
                    ui: { type: 'choice', options: CAM_NAMES, get: function () { for (var i = 0; i < CAM_MODES.length; i++) if (CAM_MODES[i].id === S.cam.mode) return i; return 0; } }, run: function (arg) {
                    var k = RC.toInt(arg), idx = k != null && k >= 0 && k < CAM_MODES.length && /^\d+$/.test(String(arg).trim()) ? k : -1;
                    if (idx < 0) { var q = RC.norm(arg); for (var i = 0; i < CAM_MODES.length; i++) if (RC.norm(CAM_MODES[i].name) === q || RC.norm(CAM_MODES[i].name).indexOf(q) === 0) { idx = i; break; } }
                    if (idx < 0) return { ok: false, msg: 'اللقطات: ' + CAM_NAMES.join(' / ') };
                    setCamMode(CAM_MODES[idx].id); return 'الكاميرا: ' + CAM_MODES[idx].name; } },
                { names: ['تابع', 'ثبت'], args: '<رقم أو اسم>', desc: 'تثبيت الكاميرا على لاعب', section: 'الكاميرا',
                    pick: function () { return standings().map(function (c) { return c.number + ' ' + c.name; }); }, run: function (arg) {
                    var c = pickCar(arg); if (!c) return { ok: false, msg: 'ما لقيت هاللاعب' };
                    setFocus(c.id, true); return 'الكاميرا على ' + c.name; } },
                { names: ['الرسوم', 'جودة'], args: '<' + Q_NAMES.join(' / ') + '>', desc: 'وضع الرسوم', section: SEC,
                    ui: { type: 'choice', options: Q_NAMES, get: function () { return Math.max(0, Q_IDS.indexOf(settings.quality)); } }, run: function (arg) {
                    var k = RC.toInt(arg), i = k != null && /^\d+$/.test(String(arg).trim()) ? k : Q_NAMES.map(RC.norm).indexOf(RC.norm(arg));
                    if (i < 0 || i > 2) return { ok: false, msg: 'خفيف / متوازن / سينمائي' };
                    setQuality(Q_IDS[i]); return 'الرسوم: ' + Q_NAMES[i]; } },
                { names: ['لفات', 'اللفات'], args: '<1–20>', desc: 'عدد اللفات', section: SEC, ui: { type: 'number', min: 1, max: 20, step: 1, get: function () { return settings.laps; } }, run: function (arg) {
                    if (S.phase !== 'lobby') return { ok: false, msg: 'تتغير قبل الانطلاق' };
                    return setNum('laps', 1, 20, arg) || 'اللفات: ' + settings.laps; } },
                { names: ['الحد', 'عدد السيارات'], args: '<1–30>', desc: 'الحد الأقصى للمتسابقين', section: SEC, ui: { type: 'number', min: 1, max: 30, step: 1, get: function () { return settings.maxDrivers; } }, run: function (arg) {
                    return setNum('maxDrivers', 1, 30, arg) || 'الحد: ' + settings.maxDrivers; } },
                { names: ['كلمة', 'كلمة الدخول'], args: '<الكلمة>', desc: 'كلمة الدخول بالشات', section: SEC, ui: { type: 'text', get: function () { return settings.keyword; } }, run: function (arg) {
                    var v = String(arg || '').trim().slice(0, 20); if (!v) return { ok: false, msg: 'اكتب الكلمة' };
                    settings.keyword = v; saveSettings(); syncSettingsUI(); renderLobby(); return 'كلمة الدخول: ' + v; } },
                { names: ['المتابعين', 'متابعين فقط'], args: '[تشغيل / ايقاف]', desc: 'الانضمام للمتابعين فقط', section: SEC, ui: { type: 'toggle', get: function () { return settings.joinMode === 'followers'; } }, run: function (arg) {
                    var v = onOff(arg, settings.joinMode === 'followers'); if (v == null) return { ok: false, msg: 'تشغيل أو ايقاف' };
                    settings.joinMode = v ? 'followers' : 'all'; saveSettings(); syncSettingsUI(); return v ? 'المتابعين فقط' : 'الجميع يقدر يدخل'; } },
                { names: ['المخرج', 'المخرج التلقائي'], args: '[تشغيل / ايقاف]', desc: 'المخرج التلقائي للكاميرا', section: SEC, ui: { type: 'toggle', get: function () { return !!settings.autoCam; } }, run: function (arg) {
                    var v = onOff(arg, settings.autoCam); if (v == null) return { ok: false, msg: 'تشغيل أو ايقاف' };
                    settings.autoCam = v; S.cam.mode = v ? 'auto' : 'tv'; saveSettings(); syncSettingsUI(); renderCamBar(); return 'المخرج التلقائي: ' + (v ? 'تشغيل' : 'ايقاف'); } },
                { names: ['هدايا', 'هدايا السباق'], args: '[تشغيل / ايقاف]', desc: 'تأثيرات الدعم (عند الإيقاف: نيترو فقط)', section: SEC, ui: { type: 'toggle', get: function () { return !!settings.giftsOn; } }, run: function (arg) {
                    var v = onOff(arg, settings.giftsOn); if (v == null) return { ok: false, msg: 'تشغيل أو ايقاف' };
                    settings.giftsOn = v; saveSettings(); syncSettingsUI(); return 'هدايا السباق: ' + (v ? 'تشغيل' : 'ايقاف'); } }
            ]
        });
    }

    function init() {
        // واجهة فحص لوضع التجربة فقط (?demo=1) — للاختبارات الآلية
        if (DEMO) window.__f1Demo = { S: S, TRACK: TRACK, get settings() { return settings; }, get scene() { return scene; }, clear: clearDrivers, stopTest: stopTest, perkFor: effectForGift, get volume() { return master ? master.gain.value : null; } };
        document.body.dataset.phase = 'lobby';
        bindUI(); bindSettings(); renderPerks(); renderCamBar(); renderLobby();
        bindStream();
        mount3D();
        requestAnimationFrame(frame);
        attachRemote();
        if (DEMO) startTest(/[?&]autostart=1/.test(location.search));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
