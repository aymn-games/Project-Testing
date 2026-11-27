/**
 * VEYRO USAGE TRACKER — «الساعات الفعلية» لكل ستريمر بلوحة تحكم فيرو.
 *
 * رابط الشاشة المفتوح بـOBS / TikTok LIVE Studio يسأل /api/public/screen/events كل ثانيتين تقريباً،
 * وكل سؤال = نبضة (beat) لصاحب الشاشة:
 * - الوقت بين نبضتين (لو أقل من GAP_MS) ينحسب «استخدام فعلي» (open)، وينحسب «على الهواء» (live) لو البث شغّال.
 * - أكثر من شاشة مفتوحة لنفس الستريمر ما تنحسب مرتين (الوقت من آخر نبضة لأي شاشة).
 * - انقطاع أطول من SESSION_GAP_MS = بث جديد (sessions).
 * - المجاميع تتجمّع بالذاكرة وتنكتب بالقاعدة كل FLUSH_MS (وعند الإيقاف).
 *
 * presence(uid) → { online, last, since, live } لـ«شغّالين الحين» باللوحة.
 */

'use strict';

var GAP_MS = 90 * 1000;
var SESSION_GAP_MS = 10 * 60 * 1000;
var ONLINE_MS = 45 * 1000;
var FLUSH_MS = 60 * 1000;

/**
 * @param {{addUsage:function, dayKey:function}} store — admin/veyro-admin-service.js
 * @param {{now?:function}} [opts]
 */
function createTracker(store, opts) {
    opts = opts || {};
    var now = opts.now || Date.now;
    var last = new Map();    // uid -> { at, since, live }
    var pending = new Map(); // uid|day -> { uid, day, open, live, sessions }

    function bucket(uid, t) {
        var day = store.dayKey(t), k = uid + '|' + day, b = pending.get(k);
        if (!b) { b = { uid: uid, day: day, open: 0, live: 0, sessions: 0 }; pending.set(k, b); }
        return b;
    }

    function beat(uid, live) {
        uid = Number(uid);
        if (!uid) return;
        var t = now(), p = last.get(uid);
        if (p && t - p.at <= GAP_MS) {
            var dt = Math.max(0, t - p.at) / 1000;
            if (dt > 0) {
                var b = bucket(uid, t);
                b.open += dt;
                if (live && p.live) b.live += dt;
            }
            p.at = t; p.live = Boolean(live);
            return;
        }
        if (!p || t - p.at > SESSION_GAP_MS) bucket(uid, t).sessions += 1;
        last.set(uid, { at: t, since: p && t - p.at <= SESSION_GAP_MS ? p.since : t, live: Boolean(live) });
    }

    function flush() {
        if (!pending.size) return;
        var rows = Array.from(pending.values()).filter(function (r) { return r.open >= 1 || r.sessions; });
        pending.clear();
        if (rows.length) store.addUsage(rows.map(function (r) { return { uid: r.uid, day: r.day, open: Math.floor(r.open), live: Math.floor(r.live), sessions: r.sessions }; }));
    }

    function presence(uid) {
        var p = last.get(Number(uid));
        if (!p) return null;
        var on = now() - p.at < ONLINE_MS;
        return { online: on, last: p.at, since: on ? p.since : null, live: on && p.live };
    }

    var timer = null;
    function start() {
        if (timer) return;
        timer = setInterval(function () { try { flush(); } catch (e) { /* ignore */ } }, FLUSH_MS);
        if (timer.unref) timer.unref();
        process.once('SIGTERM', function () { try { flush(); } catch (e) { /* ignore */ } });
    }

    return { beat: beat, flush: flush, presence: presence, start: start };
}

var instance = null;
function get() {
    if (!instance) { instance = createTracker(require('./veyro-admin-service').get()); instance.start(); }
    return instance;
}

module.exports = { createTracker: createTracker, get: get, GAP_MS: GAP_MS, SESSION_GAP_MS: SESSION_GAP_MS };
