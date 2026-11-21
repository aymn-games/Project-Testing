/**
 * AGP SCREEN AUDIO SERVICE — أدوات الصوت بشاشات البث (Veyro): بحث يوتيوب لمشغّل
 * الأغاني، وتحويل نص لصوت للقارئ الصوتي: Google Cloud TTS (عادي وHD) وElevenLabs
 * (مفتاح المنصة ELEVENLABS_API_KEY أو مفتاح الستريمر الخاص).
 *
 * - رابط الشاشة (live.html) يطلبها برمز الشاشة بس، والمفاتيح ما تطلع للواجهة أبداً.
 * - مفتاح يوتيوب: مفتاح الستريمر الخاص (لو حطه) وإلا مفتاح المنصة YOUTUBE_API_KEY.
 *   لو مفتاحه خلص حده أو غلط نرجع لمفتاح المنصة. مفتاح المنصة مشترك (~100 بحث
 *   باليوم للمنصة كلها) فله حد يومي لكل ستريمر (PLATFORM_DAILY_PER_USER).
 * - كاش بالذاكرة: نفس البحث/النص ما يستهلك الحد مرتين.
 * - الجدول (screen_audio_keys) ينشأ هنا عشان الخدمة تنختبر بقاعدة بيانات بالذاكرة.
 */

'use strict';

var SEARCH_GAP_MS = 3000;                 // طلب بحث واحد كل 3 ثواني لكل شاشة
var SEARCH_CACHE_TTL_MS = 24 * 3600 * 1000;
var SEARCH_CACHE_MAX = 500;
var TTS_CACHE_TTL_MS = 3600 * 1000;
var TTS_CACHE_MAX = 200;
var TTS_TEXT_MAX = 200;
var TTS_PER_MINUTE = 30;                  // طلبات صوت جديدة (مو من الكاش) لكل شاشة بالدقيقة — حماية تكلفة Google TTS
var PLATFORM_DAILY_PER_USER = 25;
var KEY_RE = /^[\w-]{20,60}$/;
var YT = 'https://www.googleapis.com/youtube/v3';
var TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize?key=';
var VOICES = { f: 'ar-XA-Standard-A', m: 'ar-XA-Standard-B' };
// أصوات جوجل العربية المسموحة (Standard/Wavenet A..D، وأصوات HD «Chirp3»)
var GOOGLE_VOICE_RE = /^ar-XA-(?:(?:Standard|Wavenet)-[A-D]|Chirp3-HD-[A-Z][a-z]{2,15})$/;
// ElevenLabs: معرّف الصوت (20 حرف/رقم)، النموذج متعدد اللغات يدعم العربي
var EL_VOICE_RE = /^[A-Za-z0-9]{20}$/;
var EL_KEY_RE = /^(?:sk_)?[A-Za-z0-9]{24,80}$/;
var EL_URL = 'https://api.elevenlabs.io/v1/text-to-speech/';
var EL_MODEL = 'eleven_multilingual_v2';
var EL_PLATFORM_DAILY_CHARS = 4000;       // حروف باليوم لكل ستريمر على مفتاح المنصة (ElevenLabs غالي)

/** PT1H2M3S → ثواني */
function isoDuration(s) {
    var m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(s || ''));
    if (!m) return 0;
    return (Number(m[1]) || 0) * 86400 + (Number(m[2]) || 0) * 3600 + (Number(m[3]) || 0) * 60 + (Number(m[4]) || 0);
}

function normQuery(q) { return String(q || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120); }

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
        ');'
    );
    // مفتاح ElevenLabs الخاص بالستريمر (اختياري) — نفس الجدول
    try { db.exec('ALTER TABLE screen_audio_keys ADD COLUMN eleven_key TEXT'); } catch (e) { /* موجود */ }

    var searchCache = lru(SEARCH_CACHE_MAX, SEARCH_CACHE_TTL_MS, now);
    var ttsCache = lru(TTS_CACHE_MAX, TTS_CACHE_TTL_MS, now);
    var lastSearch = new Map();   // screenKey -> وقت آخر طلب بحث
    var ttsHits = new Map();      // screenKey -> [أوقات طلبات الصوت خلال آخر دقيقة]
    var daily = { day: '', counts: new Map() }; // userId -> عدد بحوث مفتاح المنصة اليوم

    function userKey(userId) {
        var r = db.prepare('SELECT youtube_key FROM screen_audio_keys WHERE user_id = ?').get(userId);
        return r && r.youtube_key ? r.youtube_key : null;
    }

    function elevenKey(userId) {
        if (userId == null) return null;
        var r = db.prepare('SELECT eleven_key FROM screen_audio_keys WHERE user_id = ?').get(userId);
        return r && r.eleven_key ? r.eleven_key : null;
    }

    function setColumn(userId, col, value) {
        db.prepare('INSERT INTO screen_audio_keys (user_id, ' + col + ', updated_at) VALUES (?, ?, ?) ' +
            'ON CONFLICT(user_id) DO UPDATE SET ' + col + ' = excluded.' + col + ', updated_at = excluded.updated_at').run(userId, value, now());
    }

    function setUserYoutubeKey(userId, key) {
        if (key == null || key === '') {
            setColumn(userId, 'youtube_key', null);
            return { success: true, hasKey: false };
        }
        key = String(key).trim();
        if (!KEY_RE.test(key)) return { success: false, error: 'invalid_key' };
        setColumn(userId, 'youtube_key', key);
        return { success: true, hasKey: true };
    }

    function setUserElevenKey(userId, key) {
        if (key == null || key === '') {
            setColumn(userId, 'eleven_key', null);
            return { success: true, hasKey: false };
        }
        key = String(key).trim();
        if (!EL_KEY_RE.test(key)) return { success: false, error: 'invalid_key' };
        setColumn(userId, 'eleven_key', key);
        return { success: true, hasKey: true };
    }

    function hasUserYoutubeKey(userId) { return Boolean(userKey(userId)); }
    function hasUserElevenKey(userId) { return Boolean(elevenKey(userId)); }
    /** وش متاح من أنواع الأصوات (للمحرر) */
    function voiceProviders(userId) {
        return { google: Boolean(opts.ttsKey), eleven: Boolean(opts.elevenKey || elevenKey(userId)), ownEleven: hasUserElevenKey(userId) };
    }

    var elDaily = { day: '', counts: new Map() }; // userId -> حروف ElevenLabs على مفتاح المنصة اليوم
    function elPlatformChars(userId, add) {
        var day = new Date(now()).toISOString().slice(0, 10);
        if (elDaily.day !== day) { elDaily.day = day; elDaily.counts = new Map(); }
        var n = (elDaily.counts.get(userId) || 0) + (add || 0);
        if (add) elDaily.counts.set(userId, n);
        return n;
    }

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
        var cached = searchCache.get(nq);
        if (cached) return Promise.resolve({ success: true, results: cached });

        var own = userKey(userId);
        var platform = opts.platformYoutubeKey || null;
        if (!own && !platform) return Promise.resolve({ success: false, error: 'disabled' });

        var t = now();
        var last = lastSearch.get(screenKey);
        if (last != null && t - last < SEARCH_GAP_MS) return Promise.resolve({ success: false, error: 'rate_limited' });
        lastSearch.set(screenKey, t);
        if (lastSearch.size > 5000) lastSearch.delete(lastSearch.keys().next().value);

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
                    searchCache.set(nq, r.results);
                    return { success: true, results: r.results };
                }
                if (r.keyProblem) sawKeyProblem = true;
                return attempt(i + 1);
            });
        }
        return Promise.resolve().then(function () { return attempt(0); }).catch(function () { return { success: false, error: 'failed' }; });
    }

    function num(v, lo, hi, def) {
        var n = Number(v);
        if (v === '' || v == null || !isFinite(n)) n = def;
        return Math.max(lo, Math.min(hi, n));
    }

    /** حد الطلبات الجديدة لكل شاشة بالدقيقة — true = مسموح (ويسجّل الطلب) */
    function takeSlot(screenKey) {
        var t0 = now();
        var hits = (ttsHits.get(screenKey) || []).filter(function (x) { return t0 - x < 60000; });
        if (hits.length >= TTS_PER_MINUTE) { ttsHits.set(screenKey, hits); return false; }
        hits.push(t0);
        ttsHits.delete(screenKey);
        ttsHits.set(screenKey, hits);
        if (ttsHits.size > 5000) ttsHits.delete(ttsHits.keys().next().value);
        return true;
    }

    function googleTts(screenKey, t, name, r) {
        if (!opts.ttsKey) return Promise.resolve({ success: false, error: 'disabled' });
        var ck = name + '|' + r + '|' + t;
        var hit = ttsCache.get(ck);
        if (hit) return Promise.resolve({ success: true, audio: hit });
        if (!takeSlot(screenKey)) return Promise.resolve({ success: false, error: 'rate_limited' });
        function call(withRate) {
            var cfg = { audioEncoding: 'MP3' };
            if (withRate) cfg.speakingRate = r;
            return doFetch(TTS_URL + encodeURIComponent(opts.ttsKey), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input: { text: t }, voice: { languageCode: 'ar-XA', name: name }, audioConfig: cfg })
            }).then(function (resp) {
                return resp.json().catch(function () { return {}; }).then(function (body) { return { resp: resp, body: body }; });
            });
        }
        return call(true).then(function (x) {
            // أصوات HD القديمة ممكن ترفض السرعة — نعيد بدونها
            if (x.resp.status === 400 && /Chirp3/.test(name) && r !== 1) return call(false);
            return x;
        }).then(function (x) {
            if (!x.resp.ok || !x.body.audioContent) return { success: false, error: x.resp.status === 429 ? 'quota' : 'failed' };
            var buf = Buffer.from(x.body.audioContent, 'base64');
            ttsCache.set(ck, buf);
            return { success: true, audio: buf };
        }).catch(function () { return { success: false, error: 'failed' }; });
    }

    function elevenTts(screenKey, t, voiceId, r, extra) {
        var own = elevenKey(extra.userId);
        var key = own || opts.elevenKey || null;
        if (!key) return Promise.resolve({ success: false, error: 'disabled' });
        var vs = {
            stability: num(extra.st, 0, 1, 0.5),
            similarity_boost: num(extra.sim, 0, 1, 0.75),
            style: num(extra.sty, 0, 1, 0),
            use_speaker_boost: extra.boost !== false && extra.boost !== '0' && extra.boost !== 0,
            speed: num(r, 0.7, 1.2, 1)
        };
        var ck = 'el|' + voiceId + '|' + JSON.stringify(vs) + '|' + t;
        var hit = ttsCache.get(ck);
        if (hit) return Promise.resolve({ success: true, audio: hit });
        if (!own && extra.userId != null && elPlatformChars(extra.userId) + t.length > EL_PLATFORM_DAILY_CHARS) return Promise.resolve({ success: false, error: 'quota' });
        if (!takeSlot(screenKey)) return Promise.resolve({ success: false, error: 'rate_limited' });
        if (!own && extra.userId != null) elPlatformChars(extra.userId, t.length);
        return doFetch(EL_URL + encodeURIComponent(voiceId) + '?output_format=mp3_44100_64', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'audio/mpeg', 'xi-api-key': key },
            body: JSON.stringify({ text: t, model_id: EL_MODEL, voice_settings: vs })
        }).then(function (resp) {
            if (!resp.ok) return { success: false, error: resp.status === 429 || resp.status === 401 ? 'quota' : 'failed' };
            return resp.arrayBuffer().then(function (ab) {
                var buf = Buffer.from(ab);
                if (!buf.length) return { success: false, error: 'failed' };
                ttsCache.set(ck, buf);
                return { success: true, audio: buf };
            });
        }).catch(function () { return { success: false, error: 'failed' }; });
    }

    /**
     * voice: 'f' | 'm' (القديم) | اسم صوت جوجل عربي | 'el:<voiceId>' (ElevenLabs).
     * extra (اختياري): { userId, st, sim, sty, boost } — إعدادات ElevenLabs.
     */
    function tts(screenKey, text, voice, rate, extra) {
        extra = extra || {};
        var t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, TTS_TEXT_MAX);
        if (!t) return Promise.resolve({ success: false, error: 'empty_text' });
        var v = String(voice || '');
        if (v.indexOf('el:') === 0) {
            var id = v.slice(3);
            if (!EL_VOICE_RE.test(id)) return Promise.resolve({ success: false, error: 'bad_voice' });
            return elevenTts(screenKey, t, id, rate, extra);
        }
        var name = VOICES[v] || (GOOGLE_VOICE_RE.test(v) ? v : VOICES.f);
        return googleTts(screenKey, t, name, Math.max(0.5, Math.min(2, Number(rate) || 1)));
    }

    return { searchMusic: searchMusic, tts: tts, setUserYoutubeKey: setUserYoutubeKey, hasUserYoutubeKey: hasUserYoutubeKey, setUserElevenKey: setUserElevenKey, hasUserElevenKey: hasUserElevenKey, voiceProviders: voiceProviders };
}

var instance = null;
function get() {
    if (!instance) {
        var config = require('../config');
        instance = createService(require('../db/database'), {
            fetch: function (u, o) { return global.fetch(u, o); },
            platformYoutubeKey: config.youtubeApiKey,
            ttsKey: config.googleTtsApiKey,
            elevenKey: config.elevenLabsApiKey
        });
    }
    return instance;
}

module.exports = {
    PLATFORM_DAILY_PER_USER: PLATFORM_DAILY_PER_USER,
    TTS_PER_MINUTE: TTS_PER_MINUTE,
    EL_PLATFORM_DAILY_CHARS: EL_PLATFORM_DAILY_CHARS,
    createService: createService,
    get: get
};
