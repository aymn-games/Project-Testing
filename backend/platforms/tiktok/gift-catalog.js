/**
 * كتالوج هدايا تيك توك — اسم كل هدية وسعرها بالعملات وصورتها، محفوظة بالداتابيس.
 *
 * يتعبّى من مصدرين:
 *   1) كل هدية توصل بأي بث (noteGift من tiktok-connector) — مجاني وبدون طلب زيادة.
 *   2) قائمة الهدايا الكاملة من تيك توك (fetchAvailableGifts بالمكتبة، مسار gift/list/)
 *      مرة باليوم بالكثير، أول ما يتصل أي بث. الطلب موقّع وينحسب من حد التوقيع اليومي،
 *      عشان كذا مرة وحدة باليوم لكل السيرفر (shouldRefresh / markRefreshing).
 *
 * Veyro يعرضه للستريمر يختار هدية معيّنة لأليرت (GET /api/tiktok/gifts)، ورابط
 * /api/stream/media?k=g&id=<giftId> يرجع لصورة الكتالوج لو الهدية ما وصلت بالبث الحالي.
 *
 * الشكل اللي يرجع: { id: '5655', name: 'Rose', diamonds: 1, image: 'https://…' }
 */

'use strict';

var REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;
var RETRY_AFTER_FAIL_MS = 3 * 60 * 60 * 1000;
var MAX_GIFTS = 3000;

function cleanId(v) {
    var s = v == null ? '' : String(v).trim();
    return /^\d{1,20}$/.test(s) ? s : '';
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
    var name = String(g.name || g.giftName || '').trim().slice(0, 80);
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

    // الصورة ما تنمسح بقيمة فاضية، والسعر 0 من حدث بث ما يغطي سعر معروف
    var upsert = db.prepare(
        'INSERT INTO tiktok_gifts (id, name, diamonds, image, in_list, updated_at) VALUES (@id, @name, @diamonds, @image, @inList, @at) ' +
        'ON CONFLICT(id) DO UPDATE SET name = excluded.name, ' +
        'diamonds = CASE WHEN excluded.diamonds > 0 THEN excluded.diamonds ELSE tiktok_gifts.diamonds END, ' +
        'image = COALESCE(excluded.image, tiktok_gifts.image), ' +
        'in_list = MAX(tiktok_gifts.in_list, excluded.in_list), updated_at = excluded.updated_at'
    );
    var all = db.prepare('SELECT id, name, diamonds, image, in_list FROM tiktok_gifts ORDER BY diamonds ASC, name ASC LIMIT ' + MAX_GIFTS);
    var one = db.prepare('SELECT id, name, diamonds, image FROM tiktok_gifts WHERE id = ?');
    var getMeta = db.prepare('SELECT value FROM tiktok_gifts_meta WHERE key = ?');
    var setMeta = db.prepare('INSERT INTO tiktok_gifts_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

    var seen = new Map(); // id -> "name|diamonds|image" — نتجنب كتابة الداتابيس مع كل هدية متكررة
    var refreshing = false;

    function meta(key) { var r = getMeta.get(key); return r ? Number(r.value) || 0 : 0; }

    /** هدية وصلت ببث: { giftId, giftName, giftValue (سعر الوحدة), giftImage }. */
    function noteGift(data) {
        var g = normalizeGift({ id: data && data.giftId, name: data && data.giftName, diamondCount: data && data.giftValue, image: data && data.giftImage });
        if (!g) return false;
        var sig = g.name + '|' + g.diamonds + '|' + (g.image || '');
        if (seen.get(g.id) === sig) return false;
        seen.set(g.id, sig);
        if (seen.size > MAX_GIFTS) seen.delete(seen.keys().next().value);
        upsert.run({ id: g.id, name: g.name, diamonds: g.diamonds, image: g.image, inList: 0, at: now() });
        return true;
    }

    /** القائمة الكاملة من تيك توك. يرجع عدد الهدايا اللي انحفظت. */
    function saveList(list) {
        var gifts = (Array.isArray(list) ? list : []).map(normalizeGift).filter(Boolean).slice(0, MAX_GIFTS);
        if (!gifts.length) return 0;
        var at = now();
        db.transaction(function () {
            gifts.forEach(function (g) { upsert.run({ id: g.id, name: g.name, diamonds: g.diamonds, image: g.image, inList: 1, at: at }); });
            setMeta.run('list_at', String(at));
        })();
        seen.clear();
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
     * يطلب القائمة لو حان وقتها. fetchList = دالة ترجع Promise بمصفوفة هدايا تيك توك.
     * ما ترمي خطأ أبداً.
     */
    function refreshWith(fetchList) {
        if (!shouldRefresh() || typeof fetchList !== 'function') return Promise.resolve(0);
        refreshing = true;
        return Promise.resolve().then(fetchList).then(function (list) {
            var n = saveList(list);
            if (!n) setMeta.run('fail_at', String(now()));
            return n;
        }).catch(function () {
            setMeta.run('fail_at', String(now()));
            return 0;
        }).then(function (n) { refreshing = false; return n; });
    }

    function list() {
        return all.all().map(function (r) { return { id: r.id, name: r.name, diamonds: r.diamonds, image: r.image || null, official: r.in_list === 1 }; });
    }

    function get(id) {
        var r = one.get(cleanId(id));
        return r ? { id: r.id, name: r.name, diamonds: r.diamonds, image: r.image || null } : null;
    }

    return { noteGift: noteGift, saveList: saveList, shouldRefresh: shouldRefresh, refreshWith: refreshWith, list: list, get: get, listUpdatedAt: function () { return meta('list_at'); } };
}

var instance = null;
function getCatalog() {
    if (!instance) instance = createCatalog(require('../../db/database'));
    return instance;
}

module.exports = { createCatalog: createCatalog, normalizeGift: normalizeGift, get: getCatalog };
