/**
 * AGP SCREEN TESTS — «جرّب» من المحرر يطلع على شاشة البث نفسها (OBS / TikTok LIVE Studio).
 *
 * بالذاكرة بس: لكل رابط شاشة (screen_key) آخر TESTS_MAX تجربة خلال TTL_MS.
 * رابط الشاشة يسحبها مع أحداث الأليرتات (GET /api/public/screen/events?t=<tseq>)
 * ويشغّل الأليرت بأسماء وأرقام مثال (sampleEvent بـjs/agp-stream-overlay.js).
 */

'use strict';

var TESTS_MAX = 20;
var TTL_MS = 60 * 1000;
var _byKey = new Map(); // key -> { seq, list: [{seq, itemId, type, at}] }

var TYPES = ['gift', 'follow', 'share', 'join', 'like', 'subscribe'];

function prune(q, now) {
    q.list = q.list.filter(function (t) { return now - t.at < TTL_MS; });
}

/** يضيف تجربة لأليرت itemId بنوع type. يرجّع التجربة أو null لو المدخلات غلط. */
function push(key, itemId, type) {
    key = String(key || '');
    itemId = String(itemId || '').slice(0, 40);
    if (!key || !/^[\w-]{1,40}$/.test(itemId)) return null;
    if (TYPES.indexOf(type) === -1) type = 'gift';
    var now = Date.now();
    var q = _byKey.get(key);
    if (!q) { q = { seq: 0, list: [] }; _byKey.set(key, q); }
    prune(q, now);
    q.seq++;
    var t = { seq: q.seq, itemId: itemId, type: type, at: now };
    q.list.push(t);
    if (q.list.length > TESTS_MAX) q.list.splice(0, q.list.length - TESTS_MAX);
    if (_byKey.size > 5000) _byKey.delete(_byKey.keys().next().value);
    return t;
}

/** التجارب بعد since → { tseq, tests }. */
function since(key, after) {
    var q = _byKey.get(String(key || ''));
    if (!q) return { tseq: 0, tests: [] };
    prune(q, Date.now());
    var a = Number(after) || 0;
    if (a > q.seq) a = 0;
    return { tseq: q.seq, tests: q.list.filter(function (t) { return t.seq > a; }) };
}

/*
 * آخر مرة رابط الشاشة سأل السيرفر (كل ثانيتين لما يكون مفتوح بتطبيق البث) ونسخته —
 * المحرر يعرض «متصلة بتطبيق البث» أو لا، عشان يعرف إن الرابط اللي بالتطبيق هو نفس الشاشة.
 */
var _seen = new Map(); // key -> { at, ver }
function touch(key, ver) {
    key = String(key || '');
    if (!key) return;
    _seen.delete(key);
    _seen.set(key, { at: Date.now(), ver: String(ver || '').slice(0, 20) });
    if (_seen.size > 5000) _seen.delete(_seen.keys().next().value);
}
/** { agoMs, ver } أو null لو ما انفتح من تشغيل السيرفر. */
function seen(key) {
    var s = _seen.get(String(key || ''));
    return s ? { agoMs: Date.now() - s.at, ver: s.ver } : null;
}

/** لما يتغيّر رابط الشاشة (new-key) تنحذف تجاربه. */
function drop(key) { _byKey.delete(String(key || '')); }

module.exports = { push: push, since: since, drop: drop, touch: touch, seen: seen, TYPES: TYPES };
