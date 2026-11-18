/**
 * AGP CHAT LATENCY — قياس تأخير وصول تعليقات شات البث (بالذاكرة فقط).
 *
 * لكل تعليق نسجّل:
 *   tiktokMs  — من لحظة إنشاء التعليق بخوادم تيك توك (common.createTime)
 *               إلى لحظة وصوله لخادمنا. يشمل تأخير تيك توك + EulerStream + الشبكة.
 *   serverMs  — من وصوله لخادمنا إلى لحظة إرساله للعبة عبر WebSocket
 *               (معالجتنا: الإطارات/البطاقات/الكتابة على المقبس).
 * تُعرض بصفحة «البثوث الشغّالة الآن» بلوحة الأدمن (آخر MAX_SAMPLES تعليق).
 */

'use strict';

var MAX_SAMPLES = 500;
// عند الاتصال تعيد المكتبة إرسال دفعة تعليقات قديمة (processInitialData)
// — أقدم من هذا ما تُعتبر تأخيراً حقيقياً فتُستبعد من القياس.
var STALE_MS = 30000;
var _samples = [];
var _staleCount = 0;

/** createTime من تيك توك نص بالملّي ثانية (أحياناً ثواني) — غير صالح = null. */
function parseCreateTime(data) {
    var t = Number(data && data.common && data.common.createTime);
    if (!t || !isFinite(t)) return null;
    if (t < 1e12) t *= 1000;
    return t;
}

function record(tiktokCreatedAt, receivedAt, sentAt) {
    if (tiktokCreatedAt && receivedAt - tiktokCreatedAt > STALE_MS) { _staleCount++; return; }
    _samples.push({
        at: sentAt,
        tiktokMs: tiktokCreatedAt ? Math.max(0, receivedAt - tiktokCreatedAt) : null,
        serverMs: Math.max(0, sentAt - receivedAt)
    });
    if (_samples.length > MAX_SAMPLES) _samples.shift();
}

function summarize(values) {
    if (!values.length) return null;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    function pct(p) { return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; }
    var sum = sorted.reduce(function (t, v) { return t + v; }, 0);
    return { avg: Math.round(sum / sorted.length), p50: pct(0.5), p90: pct(0.9), max: sorted[sorted.length - 1] };
}

function getStats() {
    return {
        count: _samples.length,
        since: _samples.length ? _samples[0].at : null,
        tiktok: summarize(_samples.map(function (s) { return s.tiktokMs; }).filter(function (v) { return v !== null; })),
        server: summarize(_samples.map(function (s) { return s.serverMs; })),
        stale: _staleCount,
        signKey: Boolean(process.env.EULERSTREAM_API_KEY)
    };
}

module.exports = { parseCreateTime: parseCreateTime, record: record, getStats: getStats };
