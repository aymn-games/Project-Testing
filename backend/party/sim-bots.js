/**
 * «حفلة عيد الميلاد» — محاكي لاعبين وهميين لاختبار الضغط (لا يُستخدم بالإنتاج).
 *
 *   node backend/party/sim-bots.js --code 1234 --n 100 --url ws://localhost:8787/ws/party
 *
 * كل بوت يدخل كضيف سريع باسم «ضيف N»، ويمشي عشوائياً داخل القاعة (بعيد عن
 * المنصة) بسرعة 2-5 م/ث، ويرسل موقعه كل 125ms مثل الجوال تماماً. كل 5 ثواني
 * يطبع متوسط اللي يستقبله البوت الواحد بالثانية — هذا تقريباً اللي يستقبله
 * كل جوال حقيقي، وضربه بعدد اللاعبين = اللي يطلع من السيرفر.
 * يحتاج Node 22 (فيه WebSocket مدمج).
 */
'use strict';

function arg(name, def) { var i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }
var CODE = arg('code'), N = Number(arg('n', 100)), URL = arg('url', 'ws://localhost:8787/ws/party');
var DURATION = Number(arg('seconds', 0)); // 0 = بدون نهاية
if (!CODE) { console.error('usage: --code XXXX [--n 100] [--url ws://...] [--seconds 30]'); process.exit(1); }

var HX = 30, ZMIN = -30, ZMAX = 46; // نبعد عن المنصة (مقدمتها عند z = -34)
var bots = [], rxBytes = 0, rxMsgs = 0, startedAt = Date.now();

function rnd(a, b) { return a + Math.random() * (b - a); }

function startBot(i) {
    var ws = new WebSocket(URL), b = { ws: ws, n: null, x: 0, z: 40, tx: 0, tz: 0, speed: rnd(2, 5), ready: false };
    ws.onopen = function () { ws.send(JSON.stringify({ t: 'join', code: CODE, name: 'ضيف ' + (i + 1) })); };
    ws.onmessage = function (e) {
        var s = typeof e.data === 'string' ? e.data : String(e.data);
        rxBytes += Buffer.byteLength(s); rxMsgs++;
        var m; try { m = JSON.parse(s); } catch (err) { return; }
        if (m.t === 'welcome') b.n = m.n;
        else if (m.t === 'all' && !b.ready) {
            for (var k = 0; k + 4 < m.d.length; k += 5) if (m.d[k] === b.n) { b.x = m.d[k + 1] / 100; b.z = m.d[k + 2] / 100; b.ready = true; pickTarget(b); }
        } else if (m.t === 'err') console.error('bot ' + (i + 1) + ' err:', m.err);
    };
    ws.onerror = function () { };
    bots.push(b);
}
function pickTarget(b) { b.tx = rnd(-HX, HX); b.tz = rnd(ZMIN, ZMAX); }

function step() {
    var dt = 0.125;
    bots.forEach(function (b) {
        if (!b.ready || b.ws.readyState !== 1) return;
        var dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz), s = b.speed * dt;
        if (d < s) { b.x = b.tx; b.z = b.tz; pickTarget(b); }
        else { b.x += dx / d * s; b.z += dz / d * s; }
        b.ws.send(JSON.stringify({ t: 'mv', p: [Math.round(b.x * 100) / 100, Math.round(b.z * 100) / 100, Math.round(Math.atan2(dx, dz) * 100) / 100, 1] }));
    });
}

for (var i = 0; i < N; i++) setTimeout(startBot.bind(null, i), i * 20);
setInterval(step, 125);
var last = Date.now();
setInterval(function () {
    var now = Date.now(), secs = (now - last) / 1000, ready = bots.filter(function (b) { return b.ready; }).length;
    var perBot = ready ? rxBytes / ready / secs : 0;
    console.log('[sim] bots ' + ready + '/' + N + ' · per-bot rx ' + (perBot / 1024).toFixed(2) + ' KB/s · room total ≈ ' + (perBot * ready / 1024).toFixed(0) + ' KB/s · msgs/s per bot ' + (ready ? (rxMsgs / ready / secs).toFixed(1) : 0));
    rxBytes = 0; rxMsgs = 0; last = now;
    if (DURATION && now - startedAt > DURATION * 1000) { bots.forEach(function (b) { try { b.ws.close(); } catch (e) { } }); process.exit(0); }
}, 5000);
