/**
 * كتالوج هدايا تيك توك — اسم كل هدية (عربي وإنجليزي) وسعرها بالعملات وصورتها، محفوظة بالداتابيس.
 *
 * يتعبّى من ثلاث مصادر:
 *   1) قائمة تيك توك العامة (webcast.tiktok.com/webcast/gift/list/) — السيرفر يجيبها بنفسه
 *      أول ما يشتغل وبعدها مرة باليوم، بالعربي والإنجليزي (startAutoRefresh من server.js).
 *      ما تحتاج بث ولا توقيع. (محقّق 2026-11: 763 هدية، نفس القائمة لكل المناطق، الصور بدون تاريخ انتهاء.)
 *   2) لو (1) فشلت: قائمة البث نفسه (fetchAvailableGifts بالمكتبة) أول ما يتصل أي بث — طلب موقّع
 *      ينحسب من حد التوقيع اليومي، فبرضو مرة باليوم بالكثير (refreshWith من tiktok-connector).
 *   3) كل هدية توصل بأي بث (noteGift) — هدية جديدة ما بالقائمة تنضاف على طول.
 *
 * Veyro يعرضه للستريمر يختار هدية معيّنة لأليرت (GET /api/tiktok/gifts)، وأحداث الهدايا تاخذ
 * اسمها العربي منه ({gift} بنص الأليرت)، و/api/stream/media?k=g&id= يرجع لصورته.
 *
 * الشكل: { id: '5655', name: 'Rose', nameAr: 'وردة', diamonds: 1, image: 'https://…' }
 */

'use strict';

var REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;
var RETRY_AFTER_FAIL_MS = 3 * 60 * 60 * 1000;
var CHECK_EVERY_MS = 60 * 60 * 1000;
var MAX_GIFTS = 3000;
var PUBLIC_LIST_URL = 'https://webcast.tiktok.com/webcast/gift/list/?aid=1988&app_name=tiktok_web&device_platform=web_pc&channel=tiktok_web';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function cleanId(v) {
    var s = v == null ? '' : String(v).trim();
    return /^\d{1,20}$/.test(s) ? s : '';
}

/** الاسم بدون علامات الاتجاه المخفية (تيك توك يحط ‏ قبل الأسماء الإنجليزية بالعربي). */
function cleanName(v) {
    return String(v == null ? '' : v).replace(/[‎‏‪-‮⁦-⁩]/g, '').trim().slice(0, 80);
}

function firstHttps(list) {
    if (!Array.isArray(list)) return null;
    for (var i = 0; i < list.length; i++) {
        if (typeof list[i] === 'string' && /^https:\/\//.test(list[i])) return list[i].slice(0, 1000);
    }
    return null;
}

/** صورة الهدية من أي شكل (JSON تيك توك snake_case أو رسالة المكتبة camelCase). */
function pickImage(g) {
    var cands = [g.image, g.icon, g.giftImage, g.preview_image, g.previewImage];
    for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        if (!c) continue;
        if (typeof c === 'string' && /^https:\/\//.test(c)) return c.slice(0, 1000);
        var u = firstHttps(c.url_list) || firstHttps(c.urlList) || firstHttps(c.url);
        if (u) return u;
    }
    return null;
}

/** هدية من قائمة تيك توك → شكلنا، أو null لو ناقصة. */
function normalizeGift(g) {
    if (!g || typeof g !== 'object') return null;
    var id = cleanId(g.id != null ? g.id : g.giftId);
    var name = cleanName(g.name || g.giftName);
    var d = g.diamond_count != null ? g.diamond_count : g.diamondCount;
    var diamonds = Math.max(0, Math.round(Number(d) || 0));
    if (!id || !name) return null;
    return { id: id, name: name, diamonds: diamonds, image: pickImage(g) };
}

function createCatalog(db, opts) {
    opts = opts || {};
    var now = opts.now || Date.now;
    db.exec('CREATE TABLE IF NOT EXISTS tiktok_gifts (id TEXT PRIMARY KEY, name TEXT NOT NULL, diamonds INTEGER NOT NULL DEFAULT 0, image TEXT, in_list INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)');
    db.exec('CREATE TABLE IF NOT EXISTS tiktok_gifts_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    var cols = db.prepare('PRAGMA table_info(tiktok_gifts)').all().map(function (c) { return c.name; });
    if (cols.indexOf('name_ar') === -1) db.exec('ALTER TABLE tiktok_gifts ADD COLUMN name_ar TEXT');

    // الصورة والاسم العربي ما ينمسحون بقيمة فاضية، والسعر 0 من حدث بث ما يغطي سعر معروف
    var upsert = db.prepare(
        'INSERT INTO tiktok_gifts (id, name, name_ar, diamonds, image, in_list, updated_at) VALUES (@id, @name, @nameAr, @diamonds, @image, @inList, @at) ' +
        'ON CONFLICT(id) DO UPDATE SET name = excluded.name, ' +
        'name_ar = COALESCE(excluded.name_ar, tiktok_gifts.name_ar), ' +
        'diamonds = CASE WHEN excluded.diamonds > 0 THEN excluded.diamonds ELSE tiktok_gifts.diamonds END, ' +
        'image = COALESCE(excluded.image, tiktok_gifts.image), ' +
        'in_list = MAX(tiktok_gifts.in_list, excluded.in_list), updated_at = excluded.updated_at'
    );
    var all = db.prepare('SELECT id, name, name_ar, diamonds, image, in_list FROM tiktok_gifts ORDER BY diamonds ASC, name ASC LIMIT ' + MAX_GIFTS);
    var one = db.prepare('SELECT id, name, name_ar, diamonds, image FROM tiktok_gifts WHERE id = ?');
    var getMeta = db.prepare('SELECT value FROM tiktok_gifts_meta WHERE key = ?');
    var setMeta = db.prepare('INSERT INTO tiktok_gifts_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

    var seen = new Map(); // id -> "name|diamonds|image" — نتجنب كتابة الداتابيس مع كل هدية متكررة
    var arCache = new Map(); // id -> الاسم العربي (لأحداث الهدايا، بدون طلب داتابيس كل هدية)
    var refreshing = false;

    function meta(key) { var r = getMeta.get(key); return r ? Number(r.value) || 0 : 0; }
    function row(r) { return { id: r.id, name: r.name, nameAr: r.name_ar || null, diamonds: r.diamonds, image: r.image || null }; }

    /** هدية وصلت ببث: { giftId, giftName, giftValue (سعر الوحدة), giftImage }. */
    function noteGift(data) {
        var g = normalizeGift({ id: data && data.giftId, name: data && data.giftName, diamondCount: data && data.giftValue, image: data && data.giftImage });
        if (!g) return false;
        var sig = g.name + '|' + g.diamonds + '|' + (g.image || '');
        if (seen.get(g.id) === sig) return false;
        seen.set(g.id, sig);
        if (seen.size > MAX_GIFTS) seen.delete(seen.keys().next().value);
        upsert.run({ id: g.id, name: g.name, nameAr: null, diamonds: g.diamonds, image: g.image, inList: 0, at: now() });
        return true;
    }

    /**
     * القائمة الكاملة من تيك توك. arList (اختياري) = نفس القائمة بالعربي (الأسماء بالمعرّف).
     * يرجع عدد الهدايا اللي انحفظت.
     */
    function saveList(list, arList) {
        var gifts = (Array.isArray(list) ? list : []).map(normalizeGift).filter(Boolean).slice(0, MAX_GIFTS);
        if (!gifts.length) return 0;
        var ar = {};
        (Array.isArray(arList) ? arList : []).forEach(function (x) {
            var g = normalizeGift(x);
            if (g && /[؀-ۿ]/.test(g.name)) ar[g.id] = g.name;
        });
        var at = now();
        db.transaction(function () {
            gifts.forEach(function (g) { upsert.run({ id: g.id, name: g.name, nameAr: ar[g.id] || null, diamonds: g.diamonds, image: g.image, inList: 1, at: at }); });
            setMeta.run('list_at', String(at));
        })();
        seen.clear();
        arCache.clear();
        return gifts.length;
    }

    /** هل نطلب القائمة الكاملة الحين؟ مرة باليوم، وبعد فشل نستنى 3 ساعات. */
    function shouldRefresh() {
        if (refreshing) return false;
        var t = now(), at = meta('list_at'), fail = meta('fail_at');
        if (at && t - at < REFRESH_EVERY_MS) return false;
        if (fail && t - fail < RETRY_AFTER_FAIL_MS) return false;
        return true;
    }

    /**
     * يطلب القائمة لو حان وقتها. fetchList = دالة ترجع Promise بمصفوفة هدايا تيك توك،
     * أو { gifts, ar } (الإنجليزي والعربي). ما ترمي خطأ أبداً.
     */
    function refreshWith(fetchList) {
        if (!shouldRefresh() || typeof fetchList !== 'function') return Promise.resolve(0);
        refreshing = true;
        return Promise.resolve().then(fetchList).then(function (res) {
            var n = Array.isArray(res) ? saveList(res) : saveList(res && res.gifts, res && res.ar);
            if (!n) setMeta.run('fail_at', String(now()));
            return n;
        }).catch(function () {
            setMeta.run('fail_at', String(now()));
            return 0;
        }).then(function (n) { refreshing = false; return n; });
    }

    function list() {
        return all.all().map(function (r) { var o = row(r); o.official = r.in_list === 1; return o; });
    }

    function get(id) {
        var r = one.get(cleanId(id));
        return r ? row(r) : null;
    }

    /** الاسم العربي لهدية (لأحداث البث)، أو null. */
    function arabicName(id) {
        var k = cleanId(id);
        if (!k) return null;
        if (arCache.has(k)) return arCache.get(k);
        var r = one.get(k);
        var v = (r && r.name_ar) || null;
        if (arCache.size > MAX_GIFTS) arCache.clear();
        arCache.set(k, v);
        return v;
    }

    return { noteGift: noteGift, saveList: saveList, shouldRefresh: shouldRefresh, refreshWith: refreshWith, list: list, get: get, arabicName: arabicName, listUpdatedAt: function () { return meta('list_at'); } };
}

/** قائمة تيك توك العامة بلغة معيّنة → مصفوفة هدايا خام. */
function fetchPublicList(fetchFn, lang) {
    var url = PUBLIC_LIST_URL + (lang === 'ar'
        ? '&app_language=ar&browser_language=ar&language=ar&locale=ar&webcast_language=ar'
        : '&app_language=en&browser_language=en-US&language=en&locale=en&webcast_language=en');
    return fetchFn(url, { headers: { 'User-Agent': UA, 'Accept-Language': lang === 'ar' ? 'ar' : 'en-US' } }).then(function (res) {
        if (!res.ok) throw new Error('gift list HTTP ' + res.status);
        return res.json();
    }).then(function (j) {
        var gifts = j && j.data && j.data.gifts;
        if (!Array.isArray(gifts) || !gifts.length) throw new Error('gift list empty');
        return gifts;
    });
}

/** الإنجليزي (لازم) + العربي (لو فشل نكمل بدون أسماء عربية). */
function fetchPublicBoth(fetchFn) {
    return fetchPublicList(fetchFn, 'en').then(function (en) {
        return fetchPublicList(fetchFn, 'ar').catch(function () { return []; }).then(function (ar) { return { gifts: en, ar: ar }; });
    });
}

var instance = null;
function getCatalog() {
    if (!instance) instance = createCatalog(require('../../db/database'));
    return instance;
}

/** من server.js: يجيب القائمة أول ما يشتغل السيرفر، وبعدها يشيّك كل ساعة (والطلب مرة باليوم). */
var autoTimer = null;
function startAutoRefresh(logger) {
    if (autoTimer || typeof global.fetch !== 'function') return;
    function tick() {
        var c;
        try { c = getCatalog(); } catch (e) { return; }
        c.refreshWith(function () { return fetchPublicBoth(global.fetch); }).then(function (n) {
            if (n && logger) logger.log('Gift catalog: ' + n + ' TikTok gifts refreshed.');
        });
    }
    setTimeout(tick, 15000);
    autoTimer = setInterval(tick, CHECK_EVERY_MS);
    if (autoTimer.unref) autoTimer.unref();
}

module.exports = {
    createCatalog: createCatalog, normalizeGift: normalizeGift, cleanName: cleanName,
    fetchPublicList: fetchPublicList, fetchPublicBoth: fetchPublicBoth,
    get: getCatalog, startAutoRefresh: startAutoRefresh
};
