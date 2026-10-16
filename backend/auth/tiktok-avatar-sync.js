/**
 * صورة تيك توك كصورة بروفايل تلقائية — لأي حساب موثَّق ما عنده صورة خاصة
 * (avatar_image_base64 فاضية). الصورة تُحمَّل وتُخزَّن Base64 بدل الرابط لأن
 * روابط صور تيك توك موقّعة وتنتهي صلاحيتها بعد أيام. صورة رفعها المستخدم
 * بنفسه ما تُلمَس أبداً (كل كتابة مشروطة بـ avatar_image_base64 IS NULL).
 *
 * ثلاث مصادر:
 *  1. لحظة الربط عبر OAuth (saveAvatarIfMissing من auth-router).
 *  2. تعليقات البث المباشر (noteCommentAvatar من tiktok-connector) — رابط
 *     الصورة فيها جديد وشغّال دائماً.
 *  3. تعبئة لمرة وحدة للحسابات القديمة عند تشغيل السيرفر
 *     (startBackfill) — الرابط المخزَّن، وإلا og:image من صفحة البروفايل.
 */
'use strict';

var db = require('../db/database');
var logger = require('../utils/logger');

// نفس حد updateAvatarImage بـ auth-service.js.
var MAX_AVATAR_BASE64_LENGTH = 85 * 1024;
var AVATAR_FETCH_TIMEOUT_MS = 8000;
var BACKFILL_START_DELAY_MS = 30 * 1000;
var BACKFILL_STEP_DELAY_MS = 3000;

function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

function sniffImageMime(buf) {
    if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
    if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
    if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}

/**
 * يحمّل صورة ويرجعها Data URL جاهز للتخزين، أو null لو فشل/النوع غير
 * مدعوم/الحجم أكبر من الحد. لا يرمي أبداً.
 */
async function downloadAvatarDataUrl(url) {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
    try {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, AVATAR_FETCH_TIMEOUT_MS);
        var res;
        try { res = await fetch(url, { signal: controller.signal }); } finally { clearTimeout(timer); }
        if (!res.ok) return null;

        var buf = Buffer.from(await res.arrayBuffer());
        // نعتمد على أول بايتات الملف نفسه — سيرفرات تيك توك أحياناً ترجع
        // content-type عام (octet-stream) أو ناقص.
        var mime = sniffImageMime(buf);
        if (!mime) return null;
        var dataUrl = 'data:' + mime + ';base64,' + buf.toString('base64');
        if (dataUrl.length > MAX_AVATAR_BASE64_LENGTH) return null;
        return dataUrl;
    } catch (err) {
        return null;
    }
}

/**
 * يحفظ الصورة كصورة بروفايل فقط لو المستخدم ما عنده صورة.
 * @returns {Promise<boolean>} true لو انحفظت
 */
async function saveAvatarIfMissing(userId, url) {
    try {
        if (!userId || !url) return false;
        var row = db.prepare('SELECT avatar_image_base64 FROM users WHERE id = ?').get(userId);
        if (!row || row.avatar_image_base64) return false;

        var dataUrl = await downloadAvatarDataUrl(url);
        if (!dataUrl) return false;

        // الشرط "IS NULL" يحمي من الكتابة فوق صورة رفعها المستخدم بنفس اللحظة.
        var result = db.prepare('UPDATE users SET avatar_image_base64 = ? WHERE id = ? AND avatar_image_base64 IS NULL').run(dataUrl, userId);
        if (result.changes > 0) logger.log('TikTok avatar: saved profile photo for user ' + userId);
        return result.changes > 0;
    } catch (err) {
        logger.error('TikTok avatar: save failed:', err.message);
        return false;
    }
}

/* ---- (2) من تعليقات البث ----
 * يُستدعى مع كل تعليق، فلازم يكون رخيص: كل يوزرنيم يُفحَص مرة وحدة بس
 * لكل تشغيل للسيرفر (نجح أو لا)، والتحميل نفسه بالخلفية بدون انتظار. */
var _commentChecked = new Set();
var MAX_COMMENT_CHECKED = 50000;

function noteCommentAvatar(tiktokUsername, avatarUrl) {
    try {
        tiktokUsername = (tiktokUsername || '').trim();
        if (!tiktokUsername || !avatarUrl) return;
        var key = tiktokUsername.toLowerCase();
        if (_commentChecked.has(key)) return;
        if (_commentChecked.size >= MAX_COMMENT_CHECKED) _commentChecked.clear();
        _commentChecked.add(key);

        var user = db.prepare(
            'SELECT id FROM users WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE AND avatar_image_base64 IS NULL'
        ).get(tiktokUsername);
        if (!user) return;
        saveAvatarIfMissing(user.id, avatarUrl);
    } catch (err) {
        logger.error('TikTok avatar: comment check failed:', err.message);
    }
}

/* ---- (3) تعبئة الحسابات القديمة — مرة وحدة عند تشغيل السيرفر ----
 * بالتسلسل مع فاصل بين كل حساب، عشان ما نضغط على تيك توك ونتحجب. */
var _backfillStarted = false;

async function runBackfill() {
    var users = db.prepare(
        'SELECT id, tiktok_username, tiktok_avatar_url FROM users WHERE tiktok_verified = 1 AND avatar_image_base64 IS NULL AND tiktok_username IS NOT NULL'
    ).all();
    if (!users.length) return;
    logger.log('TikTok avatar backfill: ' + users.length + ' verified account(s) without a profile photo.');

    // تحميل كسول لتفادي اعتمادية دائرية مع auth-service.
    var authService = require('./auth-service');
    var saved = 0;
    for (var i = 0; i < users.length; i++) {
        var u = users[i];
        var ok = await saveAvatarIfMissing(u.id, u.tiktok_avatar_url);
        if (!ok && typeof authService.fetchPublicProfileHtml === 'function') {
            try {
                var html = await authService.fetchPublicProfileHtml(u.tiktok_username);
                var freshUrl = authService.extractProfileAvatarFromHtml(html);
                if (freshUrl) ok = await saveAvatarIfMissing(u.id, freshUrl);
            } catch (err) { /* صفحة تيك توك ما انجلبت — نكمل للحساب اللي بعده */ }
        }
        if (ok) saved++;
        await delay(BACKFILL_STEP_DELAY_MS);
    }
    logger.log('TikTok avatar backfill: done — saved ' + saved + ' of ' + users.length + '.');
}

function startBackfill() {
    if (_backfillStarted) return;
    _backfillStarted = true;
    setTimeout(function () {
        runBackfill().catch(function (err) { logger.error('TikTok avatar backfill failed:', err.message); });
    }, BACKFILL_START_DELAY_MS);
}

module.exports = {
    downloadAvatarDataUrl: downloadAvatarDataUrl,
    saveAvatarIfMissing: saveAvatarIfMissing,
    noteCommentAvatar: noteCommentAvatar,
    runBackfill: runBackfill,
    startBackfill: startBackfill
};
