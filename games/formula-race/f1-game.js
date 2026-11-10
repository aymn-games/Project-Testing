/**
 * سباق الفورمولا — منطق اللعبة (المضمار، السيارات، التكبيس، الدعم، الكاميرا، النقاط).
 *
 * فكرة اللعبة:
 *  - المشاهد يكتب كلمة الدخول بالشات (الافتراضي «سباق») فيأخذ سيارة فورمولا بالشبكة.
 *  - التكبيس (لايكات البث) يرفع دواسة الوقود لسيارة صاحبه ← سرعة أعلى، وتنزل
 *    تدريجياً لو وقف التكبيس.
 *  - كل دعم (هدية) يعطي ميزة حسب قيمته بالكوينز (جدول PERKS تحت).
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

    // ------------------------------------------------------------------
    // الإعدادات
    // ------------------------------------------------------------------
    var DEFAULTS = { laps: 3, maxDrivers: 12, keyword: 'سباق', autoCam: true };
    function readJSON(key, fb) { try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } }
    function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
    var settings = Object.assign({}, DEFAULTS, readJSON(SETTINGS_KEY, {}));

    // ------------------------------------------------------------------
    // المضمار — نقاط تحكم (متر) لحلبة مغلقة، تُنعَّم بمنحنى Catmull-Rom ثم
    // تُعاد عيّنتها كل STEP متر. نفس البيانات للمشهد ثلاثي الأبعاد وللخريطة.
    // ------------------------------------------------------------------
    var CONTROL = [
        [-260, 0], [-60, 0], [140, 0], [300, 0],             // الخط المستقيم الرئيسي
        [390, -25], [410, -110], [360, -170],                // المنعطف الأول الطويل
        [270, -175], [220, -230], [150, -250],                // الإس
        [60, -215], [-20, -265], [-130, -300],               // الشيكين والمستقيم الخلفي
        [-250, -300], [-330, -250], [-300, -185],            // الهيربين
        [-230, -160], [-260, -100], [-360, -85],
        [-420, -40], [-380, 0]                               // المنعطف الأخير
    ];
    var STEP = 2;
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
    // مزايا الدعم — حسب مجموع الكوينز بالهدية (القيمة × التكرار)
    // ------------------------------------------------------------------
    var PERKS = [
        { id: 'nitro', min: 1, max: 9, name: 'نيترو', desc: 'دفعة سرعة سريعة ثانيتين', icon: '💨', color: '#38bdf8' },
        { id: 'drs', min: 10, max: 99, name: 'DRS', desc: 'فتح الجناح: سرعة قصوى أعلى ٥ ثواني', icon: '🪽', color: '#22c55e' },
        { id: 'turbo', min: 100, max: 499, name: 'توربو', desc: 'انطلاقة نارية ٤ ثواني', icon: '🔥', color: '#f97316' },
        { id: 'jump', min: 500, max: 4999, name: 'تجاوز فوري', desc: 'تقفز قدّام السيارة اللي قبلك', icon: '⚡', color: '#eab308' },
        { id: 'safety', min: 5000, max: Infinity, name: 'سيارة الأمان', desc: 'كل المنافسين يبطّون ٥ ثواني وأنت توربو', icon: '🚨', color: '#e10600' }
    ];
    function perkFor(coins) {
        for (var i = 0; i < PERKS.length; i++) if (coins >= PERKS[i].min && coins <= PERKS[i].max) return PERKS[i];
        return PERKS[0];
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
        reported: false,
        cam: { mode: settings.autoCam ? 'auto' : 'tv', focus: null, locked: false, autoT: 0, autoMode: 'tv' },
        finishTimer: 0
    };
    var scene = null;        // واجهة f1-scene.js (أو null لو فشل الثري دي)

    function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

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
            fx: { nitro: 0, drs: 0, turbo: 0, slow: 0 }, finished: false, finishAt: 0, likes: 0, gifts: 0,
            bot: !!p.bot
        };
        S.cars.push(car); S.byId[car.id] = car;
        if (scene) scene.setCars(S.cars);
        renderLobby();
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
    function onLike(id, count) {
        var c = S.byId[id]; if (!c || c.finished) return;
        count = Math.max(1, Math.min(200, Number(count) || 1));
        c.likes += count;
        // كل تكبيسة ترفع دواسة الوقود، والحد ١
        c.throttle = Math.min(1, c.throttle + count * 0.045);
        if (scene && count >= 15) scene.burst(c.id, 'tap');
    }

    function applyPerk(c, perk) {
        c.gifts++;
        if (perk.id === 'nitro') { c.fx.nitro = 2; c.throttle = 1; }
        else if (perk.id === 'drs') { c.fx.drs = 5; c.throttle = Math.max(c.throttle, 0.8); }
        else if (perk.id === 'turbo') { c.fx.turbo = 4; c.throttle = 1; }
        else if (perk.id === 'jump') {
            var ahead = null;
            S.cars.forEach(function (o) { if (o !== c && !o.finished && o.dist > c.dist && (!ahead || o.dist < ahead.dist)) ahead = o; });
            c.dist = ahead ? ahead.dist + 12 : c.dist + 160;
            c.lane = c.laneT = ahead ? (ahead.lane > 0 ? -3 : 3) : c.lane;
            c.fx.nitro = 2; c.throttle = 1;
        } else if (perk.id === 'safety') {
            S.cars.forEach(function (o) { if (o !== c && !o.finished) o.fx.slow = 5; });
            c.fx.turbo = 5; c.throttle = 1;
        }
        if (scene) scene.burst(c.id, perk.id);
    }

    function onGift(payload) {
        var c = S.byId[payload.id];
        if (!c && S.phase === 'lobby') c = addCar(payload);
        if (!c || c.finished) return;
        var coins = Math.max(1, (Number(payload.giftValue) || 1) * (Number(payload.repeatCount) || 1));
        if (S.phase !== 'race') { toast('🎁 <b>' + esc(c.name) + '</b> دعم — المزايا تشتغل بعد الانطلاق', c.color); return; }
        var perk = perkFor(coins);
        applyPerk(c, perk);
        toast(perk.icon + ' <b>' + esc(c.name) + '</b> ← ' + perk.name + (payload.giftName ? ' <span class="t-sub">(' + esc(payload.giftName) + ')</span>' : ''), perk.color);
        if (!S.cam.locked && S.cam.mode === 'auto') { S.cam.focus = c.id; S.cam.autoT = 0; }
    }

    // ------------------------------------------------------------------
    // المحاكاة
    // ------------------------------------------------------------------
    var BASE_SPEED = 22;       // م/ث (~٨٠ كم/س) بدون تكبيس
    var BOOST_SPEED = 58;      // م/ث إضافية بالدواسة الكاملة (~٢٩٠ كم/س إجمالي)

    function simulate(dt) {
        var L = TRACK.length, goal = settings.laps * L;
        var sorted = S.cars.slice().sort(function (a, b) { return b.dist - a.dist; });
        sorted.forEach(function (c) {
            var fx = c.fx;
            for (var k in fx) if (fx[k] > 0) fx[k] = Math.max(0, fx[k] - dt);
            if (c.finished) { c.speed *= Math.exp(-dt * 0.8); c.dist += c.speed * dt; return; }
            if (c.bot) c.throttle = Math.min(1, c.throttle + (Math.random() < dt * 3 ? 0.25 + Math.random() * 0.3 : 0));
            c.throttle = Math.max(0, c.throttle - dt * 0.28);
            // إبطاء بالمنعطفات الحادة (يعطي إحساس الكبح)
            var idx = Math.floor((((c.dist % L) + L) % L) / TRACK.step) % TRACK.count;
            var corner = Math.min(1, Math.abs(TRACK.curvature[idx]) * 18);
            var target = BASE_SPEED + c.throttle * BOOST_SPEED * (1 - corner * 0.35);
            if (fx.drs > 0) target *= 1.25;
            if (fx.nitro > 0) target *= 1.18;
            if (fx.turbo > 0) target *= 1.55;
            if (fx.slow > 0) target *= 0.45;
            var acc = target > c.speed ? (fx.turbo > 0 || fx.nitro > 0 ? 4 : 1.6) : 2.4;
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
        { id: 'trackside', name: 'جانب المضمار', key: '5' }
    ];
    function setCamMode(id) {
        S.cam.mode = id; S.cam.autoT = 99;
        renderCamBar();
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
            if (S.cam.autoT > 7) {
                S.cam.autoT = 0;
                var seq = ['tv', 'trackside', 'heli', 'tv', 'onboard', 'trackside'];
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
        $('camNow').textContent = camLabel(effective);
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
        } else if (DEMO && S.phase === 'lobby' && S.cars.length === 0) {
            demoFill();
        }
        camTick(dt);
        if (scene) scene.update(S.cars.map(function (c) {
            var p = trackPoint(c.dist, c.lane);
            return { id: c.id, x: p.x, z: p.z, heading: p.heading, speed: c.speed, throttle: c.throttle, fx: c.fx };
        }));
        hudTick(dt);
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
        var n = 0;
        var lit = function () {
            n++;
            setLights(n);
            beep(440, 0.15);
            if (n < 5) setTimeout(lit, 900);
            else setTimeout(go, 900 + Math.random() * 1400);
        };
        setTimeout(lit, 700);
    }
    function setLights(n) {
        var pods = $('lights').querySelectorAll('.pod:not(.dim)');
        for (var i = 0; i < pods.length; i++) pods[i].classList.toggle('on', i < n);
        if (scene) scene.setLights(n);
    }
    function go() {
        setLights(0);
        beep(880, 0.4);
        $('goText').classList.add('show');
        setTimeout(function () { $('goText').classList.remove('show'); $('lights').classList.remove('show'); }, 1400);
        S.phase = 'race'; document.body.dataset.phase = 'race';
        S.startedAt = Date.now(); S.raceClock = 0; S.finishTimer = 0;
        S.cars.forEach(function (c) { c.throttle = Math.max(c.throttle, 0.35); });
        S.cam.autoT = 99;
        renderTower(true);
    }

    function onWinner(c) {
        S.winner = c;
        reportPoints(c);
        if (scene) scene.burst(c.id, 'win');
        if (!S.cam.locked) { S.cam.focus = c.id; }
    }

    // نظام نقاط المنصة — مرة واحدة لكل مباراة (CLAUDE.md)
    function reportPoints(winner) {
        if (S.reported) return; S.reported = true;
        var A = window.AGPAuth;
        if (DEMO || !A || typeof A.reportMatchPoints !== 'function') return;
        A.reportMatchPoints({
            players: S.cars.map(function (c) { return { id: c.id, name: c.name }; }),
            winnerIds: [winner.id],
            teamGame: false,
            durationMs: Date.now() - S.startedAt
        });
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
                '<div class="pod-time">' + (i === 0 ? '<span dir="ltr">' + fmtTime(c.finishAt) + '</span>' : (c.finished ? gapTxt(c.finishAt - st[0].finishAt) : 'لم يكمل')) + '</div>' +
                '<div class="pod-block"><span>' + (i + 1) + '</span></div>';
            pod.appendChild(el);
        });
        var rest = $('podiumRest'); rest.innerHTML = '';
        st.slice(3).forEach(function (c, i) {
            var r = document.createElement('div'); r.className = 'rest-row';
            r.innerHTML = '<b>' + (i + 4) + '</b><span class="dot" style="background:' + c.color + '"></span><span>' + esc(c.name) + '</span><span class="rest-gap">' + (c.finished ? gapTxt(c.finishAt - st[0].finishAt) : 'لم يكمل') + '</span>';
            rest.appendChild(r);
        });
        $('podium').classList.add('show');
        if (scene) { scene.setPhase('finish'); }
    }

    function resetRace() {
        S.phase = 'lobby'; document.body.dataset.phase = 'lobby';
        S.winner = null; S.reported = false; S.raceClock = 0;
        S.cars.forEach(function (c, i) {
            var sl = gridSlot(i);
            c.dist = sl.dist; c.lane = c.laneT = sl.lane; c.speed = 0; c.throttle = 0; c.finished = false; c.finishAt = 0;
            c.fx = { nitro: 0, drs: 0, turbo: 0, slow: 0 }; c.likes = 0; c.gifts = 0;
        });
        $('podium').classList.remove('show');
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
        return c.avatar ? '<img src="' + esc(c.avatar) + '" alt="" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{textContent:\'' + init.replace(/'/g, '') + '\'}))">' : '<span>' + init + '</span>';
    }
    function gapTxt(sec) { return '<span dir="ltr">+' + sec.toFixed(1) + '</span> ث'; }
    function isLight(hex) { var n = parseInt(String(hex).slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 170; }
    function fmtTime(s) { var m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }

    function renderLobby() {
        $('lobbyCount').textContent = S.cars.length + ' / ' + settings.maxDrivers;
        var grid = $('lobbyGrid'); grid.innerHTML = '';
        for (var i = 0; i < settings.maxDrivers; i++) {
            var c = S.cars[i];
            var el = document.createElement('div');
            el.className = 'slot' + (c ? ' filled' : '');
            if (c) {
                el.style.setProperty('--team', c.color);
                el.innerHTML = '<span class="slot-num">' + c.number + '</span><span class="slot-av">' + avatarHtml(c) + '</span><span class="slot-name">' + esc(c.name) + '</span><button class="slot-x" title="إزالة" data-id="' + esc(c.id) + '">×</button>';
            } else {
                el.innerHTML = '<span class="slot-num">' + (i + 1) + '</span><span class="slot-empty">مقعد فاضي</span>';
            }
            grid.appendChild(el);
        }
        $('startBtn').disabled = S.cars.length < 1;
        $('kwShow').textContent = settings.keyword;
        $('kwShow2').textContent = settings.keyword;
        renderTower(true);
    }

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
            if (S.phase === 'lobby' || S.phase === 'countdown') gap = '#' + c.number;
            else if (i === 0) gap = c.finished ? '🏁' : 'القائد';
            else if (c.finished) gap = '+' + (c.finishAt - leader.finishAt).toFixed(1);
            else gap = '+' + ((leader.dist - c.dist) / Math.max(c.speed, 15)).toFixed(1);
            r.querySelector('.tgap').textContent = gap;
            var fx = c.fx, icon = fx.slow > 0 ? '🐢' : fx.turbo > 0 ? '🔥' : fx.drs > 0 ? '🪽' : fx.nitro > 0 ? '💨' : '';
            r.querySelector('.tfx').textContent = icon;
            r.classList.toggle('focus', S.cam.focus === c.id);
            r.classList.toggle('locked', S.cam.focus === c.id && S.cam.locked);
        });
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
            var lap = Math.min(settings.laps, Math.max(1, Math.floor(lead.dist / TRACK.length) + 1));
            $('lapNow').textContent = lap; $('lapTotal').textContent = settings.laps;
            $('raceClock').textContent = fmtTime(S.raceClock);
        } else {
            $('lapNow').textContent = 0; $('lapTotal').textContent = settings.laps; $('raceClock').textContent = '0:00.0';
        }
        // بطاقة المتسابق المركّز عليه
        var f = S.byId[S.cam.focus];
        if (f) {
            $('focusCard').style.setProperty('--team', f.color);
            $('focusCard').style.setProperty('--team-ink', isLight(f.color) ? '#111' : '#fff');
            $('fName').textContent = f.name;
            $('fPos').textContent = 'P' + (st.indexOf(f) + 1);
            $('fNum').textContent = f.number;
            $('fAv').innerHTML = avatarHtml(f);
            $('fSpeed').textContent = Math.round(f.speed * 3.6);
            $('fThrottle').style.transform = 'scaleX(' + f.throttle.toFixed(3) + ')';
            $('fLikes').textContent = f.likes;
            $('fLock').style.display = S.cam.locked ? '' : 'none';
            var fx = f.fx, act = [];
            PERKS.forEach(function (p) { if ((p.id === 'nitro' && fx.nitro > 0) || (p.id === 'drs' && fx.drs > 0) || (p.id === 'turbo' && fx.turbo > 0)) act.push('<span style="--c:' + p.color + '">' + p.icon + ' ' + p.name + '</span>'); });
            if (fx.slow > 0) act.push('<span style="--c:#e10600">🐢 سيارة الأمان</span>');
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
        ctx.fillStyle = '#e10600'; ctx.fillRect(px(s0.x) - 2 * dpr, pz(s0.z) - 6 * dpr, 4 * dpr, 12 * dpr);
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
    }

    function renderPerks() {
        $('perkList').innerHTML = PERKS.map(function (p) {
            var range = p.max === Infinity ? p.min + '+' : p.min + '–' + p.max;
            return '<div class="perk" style="--c:' + p.color + '"><span class="perk-ic">' + p.icon + '</span><span class="perk-txt"><b>' + p.name + '</b><small>' + p.desc + '</small></span><span class="perk-coins">' + range + ' 🪙</span></div>';
        }).join('');
    }

    var toastQ = 0;
    function toast(html, color) {
        var box = $('toasts');
        var t = document.createElement('div');
        t.className = 'toast'; t.style.setProperty('--c', color || '#e10600');
        t.innerHTML = html;
        box.prepend(t);
        while (box.children.length > 5) box.lastChild.remove();
        setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 4200 + (toastQ++ % 3) * 200);
    }

    // أصوات بسيطة (إشارات البداية)
    var actx = null;
    function beep(freq, len) {
        try {
            actx = actx || new (window.AudioContext || window.webkitAudioContext)();
            var o = actx.createOscillator(), g = actx.createGain();
            o.type = 'square'; o.frequency.value = freq; g.gain.value = 0.08;
            g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + len);
            o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + len);
        } catch (e) {}
    }

    // ------------------------------------------------------------------
    // الإعدادات (صف لكل خيار: العنوان يمين والعنصر يسار — قاعدة CLAUDE.md)
    // ------------------------------------------------------------------
    function bindSettings() {
        var laps = $('setLaps');
        var upd = function () {
            $('lapsVal').textContent = settings.laps;
            Array.prototype.forEach.call($('setMax').children, function (b) { b.classList.toggle('on', Number(b.dataset.v) === settings.maxDrivers); });
            $('setAutoCam').checked = !!settings.autoCam;
            $('setKw').value = settings.keyword;
            writeJSON(SETTINGS_KEY, settings);
            renderLobby();
        };
        laps.querySelector('[data-d="-1"]').onclick = function () { settings.laps = Math.max(1, settings.laps - 1); upd(); };
        laps.querySelector('[data-d="1"]').onclick = function () { settings.laps = Math.min(10, settings.laps + 1); upd(); };
        Array.prototype.forEach.call($('setMax').children, function (b) {
            b.onclick = function () {
                var v = Number(b.dataset.v);
                if (v < S.cars.length) return;
                settings.maxDrivers = v; upd();
            };
        });
        $('setAutoCam').onchange = function () { settings.autoCam = this.checked; S.cam.mode = settings.autoCam ? 'auto' : 'tv'; renderCamBar(); upd(); };
        $('setKw').oninput = function () { var v = this.value.trim(); if (v) { settings.keyword = v.slice(0, 20); writeJSON(SETTINGS_KEY, settings); $('kwShow').textContent = settings.keyword; $('kwShow2').textContent = settings.keyword; } };
        upd();
    }

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
            if (S.phase === 'lobby' && norm(p.text) === norm(settings.keyword)) addCar(p);
        });
        AGP.events.on('stream:giftReceived', function (p) { if (p && p.id) onGift(p); });
        AGP.events.on('stream:likeReceived', function (p) { if (p && p.id) onLike(p.id, p.count); });
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

    // وضع التجربة (?demo=1): متسابقين وهميين لمعاينة التصميم بدون بث
    function demoFill() {
        var names = ['أبو فهد', 'نورة', 'سلطان', 'ريم ⚡', 'ماجد', 'Lama', 'خالد ٧', 'جود', 'تركي', 'سارا'];
        names.forEach(function (n, i) { addCar({ id: 'demo:' + i, name: n, bot: true }); });
        $('toasts').innerHTML = '';
        if (/[?&]autostart=1/.test(location.search)) setTimeout(startCountdown, 600);
        if (/[?&]autostart=1/.test(location.search)) setInterval(function () {
            if (S.phase !== 'race') return;
            var c = S.cars[Math.floor(Math.random() * S.cars.length)];
            var coins = [1, 5, 30, 199, 1000, 5000][Math.floor(Math.random() * (Math.random() < 0.85 ? 4 : 6))];
            onGift({ id: c.id, giftValue: coins, repeatCount: 1, giftName: coins >= 5000 ? 'Lion' : coins >= 500 ? 'Money Gun' : coins >= 100 ? 'Perfume' : coins >= 10 ? 'Doughnut' : 'Rose' });
        }, 3500);
    }

    // ------------------------------------------------------------------
    // تشغيل
    // ------------------------------------------------------------------
    function bindUI() {
        $('startBtn').onclick = startCountdown;
        $('clearBtn').onclick = clearDrivers;
        $('againBtn').onclick = resetRace;
        $('exitBtn').onclick = function () { location.href = '../../games.html'; };
        $('lobbyGrid').addEventListener('click', function (e) { var b = e.target.closest('.slot-x'); if (b) removeCar(b.dataset.id); });
        $('hudToggle').onclick = function () { document.body.classList.toggle('clean'); };
        document.addEventListener('keydown', function (e) {
            if (e.target && /input|textarea/i.test(e.target.tagName)) return;
            var m = CAM_MODES.filter(function (x) { return x.key === e.key; })[0];
            if (m) { setCamMode(m.id); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                var st = standings(); if (!st.length) return;
                var i = st.indexOf(S.byId[S.cam.focus]);
                i = (i + (e.key === 'ArrowDown' ? 1 : -1) + st.length) % st.length;
                setFocus(st[i].id, true); e.preventDefault();
            }
            if (e.key === 'Escape') { S.cam.locked = false; renderTower(true); }
            if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
        });
    }

    function mount3D() {
        var host = $('stage');
        import('./f1-scene.js').then(function (mod) {
            scene = mod.mountRace(host, { track: TRACK, trackPoint: trackPoint });
            scene.setCars(S.cars);
            scene.setPhase(S.phase === 'finish' ? 'finish' : 'lobby');
        }).catch(function (e) {
            AGP.log('formula-race: 3D unavailable, using 2D map', e);
            document.body.classList.add('no3d');
            scene = null;
        });
    }

    function init() {
        if (DEMO) window.__f1Demo = { S: S, TRACK: TRACK, settings: settings };
        document.body.dataset.phase = 'lobby';
        bindUI(); bindSettings(); renderPerks(); renderCamBar(); renderLobby();
        bindStream();
        mount3D();
        requestAnimationFrame(frame);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
