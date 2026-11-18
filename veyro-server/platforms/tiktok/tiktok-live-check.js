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

// نفس مفتاح EulerStream اللي يستخدمه tiktok-connector.js — بدونه الفحص
// يستهلك من حد الطبقة المجانية نفسه اللي تحتاجه اتصالات البث.
var EULERSTREAM_API_KEY = process.env.EULERSTREAM_API_KEY || null;

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

/** عدد المشاهدين الحين من بيانات البث (liveRoom.liveRoomStats.userCount) — null لو مو موجود */
function viewersOf(liveRoom) {
    var st = liveRoom && liveRoom.liveRoomStats;
    var n = st && (st.userCount != null ? st.userCount : st.user_count);
    n = Number(n);
    return isFinite(n) && n >= 0 ? n : null;
}

/**
 * الفحص الفعلي: أول شي صفحة البث (نفس أول مصدر بـfetchIsLive) لأنها فيها الحالة وعدد المشاهدين مع بعض،
 * ولو فشلت نرجع لـfetchIsLive (مصادره الثانية) بدون عدد مشاهدين.
 * يرجع Promise بـ{ live: true|false|null, viewers: رقم|null }.
 */
function check(username) {
    var u = normalize(username);
    if (!u || !TikTokLib) return Promise.resolve({ live: null, viewers: null });

    var hit = _cache[u];
    if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve({ live: hit.live, viewers: hit.viewers });
    if (_inflight[u]) return _inflight[u];

    var p = Promise.resolve().then(function () {
        var conn = new TikTokLib.TikTokLiveConnection(u, EULERSTREAM_API_KEY ? { signApiKey: EULERSTREAM_API_KEY } : {});
        var fromHtml = typeof TikTokLib.fetchRoomInfoFromHtmlRoute === 'function'
            ? withTimeout(TikTokLib.fetchRoomInfoFromHtmlRoute({ webClient: conn.webClient, uniqueId: u })).then(function (info) {
                var room = info && info.liveRoom, status = room && room.status;
                if (status === undefined || status === null) throw new Error('no status in live page');
                var live = status !== 4;   // 4 = البث منتهي (نفس fetchIsLive)
                return { live: live, viewers: live ? viewersOf(room) : null };
            })
            : Promise.reject(new Error('html route unavailable'));
        return fromHtml.catch(function () {
            return withTimeout(conn.fetchIsLive()).then(function (live) { return { live: live, viewers: null }; });
        });
    }).then(function (r) {
        var result = { live: r.live === true ? true : r.live === false ? false : null, viewers: r.live === true ? r.viewers : null };
        if (result.live !== null) _cache[u] = { live: result.live, viewers: result.viewers, at: Date.now() };
        return result;
    }).catch(function (err) {
        var name = (err && ((err.constructor && err.constructor.name) || err.name)) || '';
        var msg = (err && err.message) || '';
        // المكتبة ترمي UserOfflineError لما الحساب مو في بث — هذي إجابة صريحة "لا".
        if (name === 'UserOfflineError' || msg.indexOf("isn't online") !== -1) {
            _cache[u] = { live: false, viewers: null, at: Date.now() };
            return { live: false, viewers: null };
        }
        logger.error('TikTok Live Check: could not determine live status for "' + u + '":', msg || err);
        return { live: null, viewers: null };
    }).then(function (result) {
        delete _inflight[u];
        return result;
    });

    _inflight[u] = p;
    return p;
}

/**
 * @param {string} username - يوزر تيك توك (بدون @)
 * @returns {Promise<boolean|null>}
 */
function isLive(username) { return check(username).then(function (r) { return r.live; }); }

/**
 * نفس isLive ومعها عدد المشاهدين (لـ«البثوث الشغّالة» بألعاب الباركود — stats/live-presence.js).
 * @returns {Promise<{live: boolean|null, viewers: number|null}>}
 */
function liveInfo(username) { return check(username); }

module.exports = {
    isLive: isLive,
    liveInfo: liveInfo,
    normalize: normalize,
    _viewersOf: viewersOf,
    _setLib: function (lib) { TikTokLib = lib; },   // للاختبارات
    _clearCache: function () { _cache = {}; _inflight = {}; }
};
