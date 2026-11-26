/**
 * AGP FOLLOW DEBUG — تشخيص كشف «متابع أو لا» لتعليقات البث (بالذاكرة فقط).
 *
 * خيار «المتابعين فقط» بالألعاب يعتمد على isFollower اللي يحسبه
 * tiktok-connector.js من حقول تيك توك الخام. قيم هذي الحقول ما هي موثّقة
 * رسمياً، فهنا نسجّل لكل تعليق القيم الخام نفسها + قرارنا، عشان نشوفها
 * بلوحة الأدمن («البثوث الشغّالة الآن») ونصحّح الشرط على بيانات حقيقية.
 *
 * «تأكيد حقيقي»: اللي يضغط متابعة وقت البث (حدث FOLLOW) أكيد متابع، فلو
 * علّق بعدها نعرف القيم الصحيحة للمتابع، ولو قرارنا كان «مو متابع» نعدّه
 * خطأ كشف (missedFollowers) — هذا الرقم هو المقياس الأهم.
 */
'use strict';

var MAX_RECENT = 40;
var MAX_FOLLOWED = 2000;

var _since = null;
var _total = 0;
var _combos = new Map();     // مفتاح القيم الخام -> { count, accepted, confirmed, lastUser }
var _recent = [];            // آخر MAX_RECENT تعليق
var _followed = new Map();   // يوزر (صغير) -> وقت المتابعة — لمن تابع وقت البث
var _confirmedSamples = 0;
var _missedFollowers = 0;

function norm(u) { return String(u || '').trim().replace(/^@+/, '').toLowerCase(); }
function show(v) { return v === undefined ? '—' : v === null ? 'null' : String(v); }

/** مشاهد ضغط متابعة وقت البث — تعليقاته الجاية «متابع أكيد». */
function noteFollow(uniqueId) {
    var u = norm(uniqueId);
    if (!u) return;
    _followed.delete(u);
    _followed.set(u, Date.now());
    if (_followed.size > MAX_FOLLOWED) _followed.delete(_followed.keys().next().value);
}

/**
 * @param {string} uniqueId
 * @param {{followStatus:*, isFollowerOfAnchor:*, isMutualFollowingWithAnchor:*}} raw - القيم الخام من تيك توك
 * @param {boolean} accepted - قرارنا (isFollower) بدون استثناء صاحب البث
 */
function record(uniqueId, raw, accepted) {
    var u = norm(uniqueId);
    var confirmed = _followed.has(u);
    var key = 'followStatus=' + show(raw.followStatus) +
        ' · isFollowerOfAnchor=' + show(raw.isFollowerOfAnchor) +
        ' · isMutualFollowingWithAnchor=' + show(raw.isMutualFollowingWithAnchor);

    if (!_since) _since = Date.now();
    _total++;
    var c = _combos.get(key);
    if (!c) { c = { count: 0, accepted: 0, confirmed: 0, lastUser: '' }; _combos.set(key, c); }
    c.count++;
    if (accepted) c.accepted++;
    if (confirmed) c.confirmed++;
    c.lastUser = u;

    if (confirmed) {
        _confirmedSamples++;
        if (!accepted) _missedFollowers++;
    }

    _recent.push({ at: Date.now(), user: u, raw: key, accepted: Boolean(accepted), confirmed: confirmed });
    if (_recent.length > MAX_RECENT) _recent.shift();
}

function getStats() {
    var combos = [];
    _combos.forEach(function (c, key) {
        combos.push({ key: key, count: c.count, accepted: c.accepted, confirmed: c.confirmed, lastUser: c.lastUser });
    });
    combos.sort(function (a, b) { return b.count - a.count; });
    return {
        since: _since,
        total: _total,
        confirmedSamples: _confirmedSamples,
        missedFollowers: _missedFollowers,
        combos: combos.slice(0, 20),
        recent: _recent.slice().reverse()
    };
}

module.exports = { noteFollow: noteFollow, record: record, getStats: getStats };
