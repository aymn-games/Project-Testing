/**
 * فحص "هل الحساب يبث الحين في تيك توك؟" بدون فتح اتصال بث كامل —
 * يستخدم fetchIsLive() من tiktok-live-connector (طلب HTTP فقط، بدون
 * WebSocket ولا توقيع). تستخدمه مكتبة الألعاب والألعاب عبر
 * GET /api/stream/is-live لقطع الاتصال المحفوظ لما ينتهي البث فعلياً.
 *
 * النتيجة: true (يبث) / false (مو في بث) / null (تعذّر التأكد — خطأ مؤقت
 * من تيك توك). الواجهة تقطع الاتصال فقط على false الصريحة، عشان خطأ
 * شبكة مؤقت ما يفصل استريمر بثّه شغّال.
 *
 * كل يوزر يُفحص مرة وحدة كل CACHE_MS مهما كثرت الصفحات المفتوحة، والطلبات
 * المتزامنة لنفس اليوزر تشترك بنفس الطلب — تفادياً لحظر تيك توك.
 */

'use strict';

var logger = require('../../utils/logger');

var TikTokLib;
try {
    TikTokLib = require('tiktok-live-connector');
} catch (err) {
    TikTokLib = null;
}

var CACHE_MS = 30000;
var TIMEOUT_MS = 15000;
var _cache = {}; // username -> { live, at }
var _inflight = {}; // username -> Promise

function normalize(username) {
    var u = String(username || '').trim().replace(/^@+/, '').toLowerCase();
    return /^[a-z0-9._]{2,24}$/.test(u) ? u : null;
}

function withTimeout(promise) {
    return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('timeout')); }, TIMEOUT_MS);
        promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
}

/**
 * @param {string} username - يوزر تيك توك (بدون @)
 * @returns {Promise<boolean|null>}
 */
function isLive(username) {
    var u = normalize(username);
    if (!u || !TikTokLib) return Promise.resolve(null);

    var hit = _cache[u];
    if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.live);
    if (_inflight[u]) return _inflight[u];

    var p = Promise.resolve().then(function () {
        var conn = new TikTokLib.TikTokLiveConnection(u);
        return withTimeout(conn.fetchIsLive());
    }).then(function (live) {
        var result = live === true ? true : live === false ? false : null;
        if (result !== null) _cache[u] = { live: result, at: Date.now() };
        return result;
    }).catch(function (err) {
        var name = (err && ((err.constructor && err.constructor.name) || err.name)) || '';
        var msg = (err && err.message) || '';
        // المكتبة ترمي UserOfflineError لما الحساب مو في بث — هذي إجابة صريحة "لا".
        if (name === 'UserOfflineError' || msg.indexOf("isn't online") !== -1) {
            _cache[u] = { live: false, at: Date.now() };
            return false;
        }
        logger.error('TikTok Live Check: could not determine live status for "' + u + '":', msg || err);
        return null;
    }).then(function (result) {
        delete _inflight[u];
        return result;
    });

    _inflight[u] = p;
    return p;
}

module.exports = {
    isLive: isLive,
    normalize: normalize
};
