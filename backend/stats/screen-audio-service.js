/**
 * AGP SCREEN AUDIO SERVICE — أدوات الصوت بشاشات البث (Veyro): بحث يوتيوب لمشغّل
 * الأغاني، وتحويل نص لصوت (Google Cloud TTS) للقارئ الصوتي.
 *
 * - رابط الشاشة (live.html) يطلبها برمز الشاشة بس، والمفاتيح ما تطلع للواجهة أبداً.
 * - مفتاح يوتيوب: مفتاح الستريمر الخاص (لو حطه) وإلا مفتاح المنصة YOUTUBE_API_KEY.
 *   لو مفتاحه خلص حده أو غلط نرجع لمفتاح المنصة. مفتاح المنصة مشترك (~100 بحث
 *   باليوم للمنصة كلها) فله حد يومي لكل ستريمر (PLATFORM_DAILY_PER_USER).
 * - كاش بالذاكرة: نفس البحث/النص ما يستهلك الحد مرتين.
 * - كاش دائم ومشترك للبحث (music_search_cache، 30 يوم): نفس الأغنية عند أي ستريمر، وبعد
 *   إعادة تشغيل السيرفر، ما تستهلك الحد مرة ثانية. البحث بالاسم = ~101 وحدة من 10,000 باليوم.
 * - طلب برابط يوتيوب (watch?v= / youtu.be / shorts / music.youtube.com): بيانات الفيديو نفسه
 *   (وحدة وحدة بس، وما تنحسب من حد الستريمر اليومي)، ولو المفاتيح خلصت حدها: رابط oEmbed
 *   العام (بدون مفتاح، صفر وحدات) — المدة ما تنعرف منه (durationSec 0 + link)، والشاشة تتأكد منها وقت التشغيل.
 * - الجداول (screen_audio_keys، music_search_cache) تنشأ هنا عشان الخدمة تنختبر بقاعدة بيانات بالذاكرة.
 */

'use strict';

var SEARCH_GAP_MS = 3000;                 // طلب بحث واحد كل 3 ثواني لكل شاشة
var SEARCH_CACHE_TTL_MS = 24 * 3600 * 1000;
var SEARCH_CACHE_MAX = 500;
var DB_CACHE_TTL_MS = 30 * 24 * 3600 * 1000;   // الكاش الدائم: 30 يوم
var OEMBED = 'https://www.youtube.com/oembed?format=json&url=';
var TTS_CACHE_TTL_MS = 3600 * 1000;
var TTS_CACHE_MAX = 200;
var TTS_TEXT_MAX = 200;
var TTS_PER_MINUTE = 30;                  // طلبات صوت جديدة (مو من الكاش) لكل شاشة بالدقيقة — حماية تكلفة Google TTS
var PLATFORM_DAILY_PER_USER = 25;
var KEY_RE = /^[\w-]{20,60}$/;
var YT = 'https://www.googleapis.com/youtube/v3';
var TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize?key=';
var VOICES = { f: 'ar-XA-Standard-A', m: 'ar-XA-Standard-B' };

/** PT1H2M3S → ثواني */
function isoDuration(s) {
    var m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(s || ''));
    if (!m) return 0;
    return (Number(m[1]) || 0) * 86400 + (Number(m[2]) || 0) * 3600 + (Number(m[3]) || 0) * 60 + (Number(m[4]) || 0);
}

function normQuery(q) { return String(q || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120); }

/** معرّف فيديو يوتيوب من رابط (watch?v= / youtu.be / shorts / embed / live / music.youtube.com)، أو null. */
function youtubeId(q) {
    var t = String(q || '').trim();
    var m = /(?:youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([\w-]{11})(?![\w-])/i.exec(t);
    return m ? m[1] : null;
}

/** Map بحد أقصى وانتهاء صلاحية — الأقدم ينشال */
function lru(max, ttl, now) {
    var m = new Map();
    return {
        get: function (k) {
            var e = m.get(k);
            if (!e) return undefined;
            if (now() - e.at > ttl) { m.delete(k); return undefined; }
            return e.v;
        },
        set: function (k, v) {
            m.delete(k);
            m.set(k, { v: v, at: now() });
            if (m.size > max) m.delete(m.keys().next().value);
        }
    };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ fetch: Function, platformYoutubeKey?: string, ttsKey?: string, now?: Function }} opts
 */
function createService(db, opts) {
    opts = opts || {};
    var now = opts.now || Date.now;
    var doFetch = opts.fetch;
    db.exec(
        'CREATE TABLE IF NOT EXISTS screen_audio_keys (' +
        '    user_id INTEGER PRIMARY KEY,' +
        '    youtube_key TEXT,' +
        '    updated_at INTEGER NOT NULL' +
        ');' +
        'CREATE TABLE IF NOT EXISTS music_search_cache (q TEXT PRIMARY KEY, results TEXT NOT NULL, at INTEGER NOT NULL);'
    );
    var dbGet = db.prepare('SELECT results, at FROM music_search_cache WHERE q = ?');
    var dbPut = db.prepare('INSERT INTO music_search_cache (q, results, at) VALUES (?, ?, ?) ON CONFLICT(q) DO UPDATE SET results = excluded.results, at = excluded.at');
    var dbOld = db.prepare('DELETE FROM music_search_cache WHERE at < ?');
    var lastPrune = 0;
    /** الكاش: بالذاكرة أول، وبعدها الداتابيس (ويرجع للذاكرة). نتيجة فاضية ما تنحفظ بالداتابيس. */
    function cacheGet(k) {
        var v = searchCache.get(k);
        if (v) return v;
        var r = dbGet.get(k);
        if (!r || now() - r.at > DB_CACHE_TTL_MS) return null;
        try { v = JSON.parse(r.results); } catch (e) { return null; }
        if (!Array.isArray(v)) return null;
        searchCache.set(k, v);
        return v;
    }
    function cacheSet(k, v) {
        searchCache.set(k, v);
        if (!v.length) return;
        var t = now();
        try {
            dbPut.run(k, JSON.stringify(v), t);
            if (t - lastPrune > 24 * 3600 * 1000) { lastPrune = t; dbOld.run(t - DB_CACHE_TTL_MS); }
        } catch (e) { /* الكاش الدائم اختياري */ }
    }

    var searchCache = lru(SEARCH_CACHE_MAX, SEARCH_CACHE_TTL_MS, now);
    var ttsCache = lru(TTS_CACHE_MAX, TTS_CACHE_TTL_MS, now);
    var lastSearch = new Map();   // screenKey -> وقت آخر طلب بحث
    var ttsHits = new Map();      // screenKey -> [أوقات طلبات الصوت خلال آخر دقيقة]
    var daily = { day: '', counts: new Map() }; // userId -> عدد بحوث مفتاح المنصة اليوم

    function userKey(userId) {
        var r = db.prepare('SELECT youtube_key FROM screen_audio_keys WHERE user_id = ?').get(userId);
        return r && r.youtube_key ? r.youtube_key : null;
    }

    function setUserYoutubeKey(userId, key) {
        if (key == null || key === '') {
            db.prepare('DELETE FROM screen_audio_keys WHERE user_id = ?').run(userId);
            return { success: true, hasKey: false };
        }
        key = String(key).trim();
        if (!KEY_RE.test(key)) return { success: false, error: 'invalid_key' };
        db.prepare('INSERT INTO screen_audio_keys (user_id, youtube_key, updated_at) VALUES (?, ?, ?) ' +
            'ON CONFLICT(user_id) DO UPDATE SET youtube_key = excluded.youtube_key, updated_at = excluded.updated_at').run(userId, key, now());
        return { success: true, hasKey: true };
    }

    function hasUserYoutubeKey(userId) { return Boolean(userKey(userId)); }

    function platformCount(userId, add) {
        var day = new Date(now()).toISOString().slice(0, 10);
        if (daily.day !== day) { daily.day = day; daily.counts = new Map(); }
        var n = (daily.counts.get(userId) || 0) + (add || 0);
        if (add) daily.counts.set(userId, n);
        return n;
    }

    function getJson(url) {
        return doFetch(url).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (body) { return { status: r.status, ok: r.ok, body: body }; });
        });
    }

    /** خطأ حد/مفتاح من يوتيوب (ننتقل للمفتاح اللي بعده) */
    function isKeyProblem(resp) {
        if (resp.status !== 403 && resp.status !== 400) return false;
        var errs = (resp.body && resp.body.error && resp.body.error.errors) || [];
        return errs.some(function (e) { return /quota|limit|keyinvalid|keyexpired|forbidden|accessnotconfigured/i.test(String(e.reason || '')); }) || resp.status === 403;
    }

    /** فيديو واحد بمعرّفه: العنوان والقناة والمدة، ولازم يسمح بالتضمين — وحدة وحدة من الحد. */
    function videoWith(key, id) {
        return getJson(YT + '/videos?part=snippet,contentDetails,status&id=' + id + '&key=' + encodeURIComponent(key)).then(function (resp) {
            if (!resp.ok) return { keyProblem: isKeyProblem(resp) };
            var v = ((resp.body && resp.body.items) || [])[0];
            if (!v || (v.status && v.status.embeddable === false)) return { results: [] };
            return { results: [{ id: v.id, title: String((v.snippet && v.snippet.title) || '').slice(0, 120), channel: String((v.snippet && v.snippet.channelTitle) || '').slice(0, 80), durationSec: isoDuration(v.contentDetails && v.contentDetails.duration) }] };
        });
    }

    /** رابط oEmbed العام (بدون مفتاح ولا حد): العنوان والقناة بس — المدة تنعرف بالشاشة. 401/403 = ممنوع تضمينه. */
    function videoOembed(id) {
        return getJson(OEMBED + encodeURIComponent('https://www.youtube.com/watch?v=' + id)).then(function (resp) {
            if (!resp.ok || !resp.body || !resp.body.title) return { results: [] };
            return { results: [{ id: id, title: String(resp.body.title).slice(0, 120), channel: String(resp.body.author_name || '').slice(0, 80), durationSec: 0, link: true }] };
        });
    }

    function searchWith(key, q) {
        var url = YT + '/search?part=snippet&type=video&videoEmbeddable=true&maxResults=5&q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(key);
        return getJson(url).then(function (resp) {
            if (!resp.ok) return { keyProblem: isKeyProblem(resp) };
            var items = ((resp.body && resp.body.items) || []).filter(function (it) { return it && it.id && it.id.videoId; });
            if (!items.length) return { results: [] };
            var ids = items.map(function (it) { return it.id.videoId; });
            return getJson(YT + '/videos?part=contentDetails&id=' + ids.join(',') + '&key=' + encodeURIComponent(key)).then(function (vr) {
                var dur = {};
                ((vr.ok && vr.body && vr.body.items) || []).forEach(function (v) { dur[v.id] = isoDuration(v.contentDetails && v.contentDetails.duration); });
                return { results: items.map(function (it) {
                    return { id: it.id.videoId, title: String((it.snippet && it.snippet.title) || '').slice(0, 120), channel: String((it.snippet && it.snippet.channelTitle) || '').slice(0, 80), durationSec: dur[it.id.videoId] || 0 };
                }) };
            });
        });
    }

    function searchMusic(screenKey, userId, q) {
        var nq = normQuery(q);
        if (!nq) return Promise.resolve({ success: false, error: 'empty_query' });
        var vid = youtubeId(q);
        var ck = vid ? 'v:' + vid : nq;
        var cached = cacheGet(ck);
        if (cached) return Promise.resolve({ success: true, results: cached });

        var own = userKey(userId);
        var platform = opts.platformYoutubeKey || null;
        if (!own && !platform && !vid) return Promise.resolve({ success: false, error: 'disabled' });

        var t = now();
        var last = lastSearch.get(screenKey);
        if (last != null && t - last < SEARCH_GAP_MS) return Promise.resolve({ success: false, error: 'rate_limited' });
        lastSearch.set(screenKey, t);
        if (lastSearch.size > 5000) lastSearch.delete(lastSearch.keys().next().value);

        if (vid) {
            // رابط: وحدة وحدة بأي مفتاح (ما تنحسب من حد الستريمر)، وإذا المفاتيح خلصت: oEmbed المجاني
            var lkeys = [own, platform].filter(Boolean);
            var tryLink = function (i) {
                if (i >= lkeys.length) return videoOembed(vid).then(function (r) { if (r.results.length) cacheSet(ck, r.results); return { success: true, results: r.results }; });
                return videoWith(lkeys[i], vid).then(function (r) {
                    if (r.results) { cacheSet(ck, r.results); return { success: true, results: r.results }; }
                    return tryLink(i + 1);
                });
            };
            return Promise.resolve().then(function () { return tryLink(0); }).catch(function () { return { success: false, error: 'failed' }; });
        }

        var keys = [];
        if (own) keys.push({ key: own, platform: false });
        if (platform && platformCount(userId) < PLATFORM_DAILY_PER_USER) keys.push({ key: platform, platform: true });
        if (!keys.length) return Promise.resolve({ success: false, error: 'quota' });

        var sawKeyProblem = false;
        function attempt(i) {
            if (i >= keys.length) return { success: false, error: sawKeyProblem || !platform ? 'quota' : 'failed' };
            if (keys[i].platform) platformCount(userId, 1);
            return searchWith(keys[i].key, nq).then(function (r) {
                if (r.results) {
                    cacheSet(nq, r.results);
                    return { success: true, results: r.results };
                }
                if (r.keyProblem) sawKeyProblem = true;
                return attempt(i + 1);
            });
        }
        return Promise.resolve().then(function () { return attempt(0); }).catch(function () { return { success: false, error: 'failed' }; });
    }

    function tts(screenKey, text, voice, rate) {
        var t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, TTS_TEXT_MAX);
        if (!t) return Promise.resolve({ success: false, error: 'empty_text' });
        if (!opts.ttsKey) return Promise.resolve({ success: false, error: 'disabled' });
        var name = VOICES[voice] || VOICES.f;
        var r = Math.max(0.5, Math.min(2, Number(rate) || 1));
        var ck = name + '|' + r + '|' + t;
        var hit = ttsCache.get(ck);
        if (hit) return Promise.resolve({ success: true, audio: hit });
        var t0 = now();
        var hits = (ttsHits.get(screenKey) || []).filter(function (x) { return t0 - x < 60000; });
        if (hits.length >= TTS_PER_MINUTE) { ttsHits.set(screenKey, hits); return Promise.resolve({ success: false, error: 'rate_limited' }); }
        hits.push(t0);
        ttsHits.delete(screenKey);
        ttsHits.set(screenKey, hits);
        if (ttsHits.size > 5000) ttsHits.delete(ttsHits.keys().next().value);
        return doFetch(TTS_URL + encodeURIComponent(opts.ttsKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: { text: t }, voice: { languageCode: 'ar-XA', name: name }, audioConfig: { audioEncoding: 'MP3', speakingRate: r } })
        }).then(function (resp) {
            return resp.json().catch(function () { return {}; }).then(function (body) {
                if (!resp.ok || !body.audioContent) return { success: false, error: resp.status === 429 ? 'quota' : 'failed' };
                var buf = Buffer.from(body.audioContent, 'base64');
                ttsCache.set(ck, buf);
                return { success: true, audio: buf };
            });
        }).catch(function () { return { success: false, error: 'failed' }; });
    }

    return { searchMusic: searchMusic, tts: tts, setUserYoutubeKey: setUserYoutubeKey, hasUserYoutubeKey: hasUserYoutubeKey };
}

var instance = null;
function get() {
    if (!instance) {
        var config = require('../config');
        instance = createService(require('../db/database'), {
            fetch: function (u, o) { return global.fetch(u, o); },
            platformYoutubeKey: config.youtubeApiKey,
            ttsKey: config.googleTtsApiKey
        });
    }
    return instance;
}

module.exports = {
    PLATFORM_DAILY_PER_USER: PLATFORM_DAILY_PER_USER,
    youtubeId: youtubeId,
    TTS_PER_MINUTE: TTS_PER_MINUTE,
    createService: createService,
    get: get
};
