/**
 * AGP ROOM LOOKUP — زر «دخول غرفة» بالهيدر (js/agp-join-room.js) يرسل رقم
 * الغرفة (4 أرقام) هنا، ونرجع أي لعبة/ألعاب فيها روم بهذا الرقم:
 *   - «محطة سهيل»: خادمها داخل هذا الباك اند (station/station-server.js)،
 *     فنقرأ روماتها مباشرة من الذاكرة.
 *   - «حفلة الميلاد»: خادمها داخل هذا الباك اند (party/party-server.js).
 *   - «بلياردو ٨»: خادم منفصل بمستودعه ونطاقه الخاص. نسأله عبر
 *     GET <BILLIARDS_API_BASE_URL>/api/room/<code> ← {exists:true|false}.
 *     الرابط فارغ افتراضياً = الفحص معطّل (السيرفر لسا ما انبنى).
 * كل لعبة تولّد أرقامها من نطاق خاص فيها (rooms/room-code-ranges.js)، فالرقم
 * الجديد يطلع بلعبة وحدة بس. نفحص كل الألعاب رغم كذا عشان الغرف القديمة اللي
 * انفتحت قبل النطاقات تظل توصل.
 * أي خطأ/مهلة بخادم خارجي = "ما لقينا" لتلك اللعبة فقط، بدون رمي خطأ.
 */

'use strict';

var https = require('https');
var http = require('http');

var config = require('../config');
var logger = require('../utils/logger');
var station = require('../station/station-server');
var party = require('../party/party-server');

var REMOTE_TIMEOUT_MS = 2500;

function normalizeCode(code) {
    var s = String(code == null ? '' : code).trim();
    return /^\d{4}$/.test(s) ? s : '';
}

/** GET JSON من خادم لعبة خارجية — يرجع Promise بالكائن أو null (لا يرمي أبداً). */
function fetchJson(url) {
    return new Promise(function (resolve) {
        var lib = url.indexOf('https:') === 0 ? https : http;
        var req;
        try {
            req = lib.get(url, { headers: { Accept: 'application/json' }, timeout: REMOTE_TIMEOUT_MS }, function (res) {
                if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
                var data = '';
                res.setEncoding('utf8');
                res.on('data', function (chunk) { if (data.length < 4096) data += chunk; });
                res.on('end', function () {
                    try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
                });
            });
        } catch (e) { resolve(null); return; }
        req.on('timeout', function () { req.destroy(); });
        req.on('error', function (err) {
            logger.log('Room lookup: ' + url + ' failed: ' + err.message);
            resolve(null);
        });
    });
}

function hasStationRoom(code) {
    return Promise.resolve(Object.prototype.hasOwnProperty.call(station._rooms, code));
}

function hasPartyRoom(code) {
    return Promise.resolve(party.hasRoom(code));
}

function hasBilliardsRoom(code) {
    var base = String(config.billiardsApiBaseUrl || '').replace(/\/+$/, '');
    if (!base) return Promise.resolve(false);
    return fetchJson(base + '/api/room/' + code).then(function (r) { return !!(r && r.exists === true); });
}

// المفتاح يطابق خريطة GAMES بـ js/agp-join-room.js (هي اللي تعرف الاسم والرابط).
var CHECKS = [
    { game: 'intruder', check: hasStationRoom },
    { game: 'party', check: hasPartyRoom },
    { game: 'billiards', check: hasBilliardsRoom }
];

/**
 * @param {string} code
 * @returns {Promise<string[]|null>} مفاتيح الألعاب اللي فيها الروم، أو null لو الرقم غير صالح
 */
function lookup(code) {
    var c = normalizeCode(code);
    if (!c) return Promise.resolve(null);
    return Promise.all(CHECKS.map(function (x) { return x.check(c); })).then(function (found) {
        return CHECKS.filter(function (x, i) { return found[i]; }).map(function (x) { return x.game; });
    });
}

module.exports = { lookup: lookup, normalizeCode: normalizeCode };
