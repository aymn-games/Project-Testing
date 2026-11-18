/**
 * VEYRO — صور تيك توك: تحميل صورة كـData URL (صورة صاحب البث بإحصائيات البث وصور المراكز).
 * منسوخ من backend/auth/tiktok-avatar-sync.js بدون حفظ صور الحسابات (هذا شغل سيرفر الألعاب).
 */

'use strict';

var MAX_AVATAR_BASE64_LENGTH = 85 * 1024;
var AVATAR_FETCH_TIMEOUT_MS = 8000;

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

/** سيرفر الألعاب هو اللي يحفظ صور الحسابات — هنا ما نسوي شي. */
function noteCommentAvatar() {}

module.exports = { downloadAvatarDataUrl: downloadAvatarDataUrl, noteCommentAvatar: noteCommentAvatar };
