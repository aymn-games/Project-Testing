/**
 * موصّل «غرفة الجوالات» (اللعب بدون بث) — نفس «شكل الموصِّل» اللي يطبّقه
 * tiktok-connector.js، فصفحة اللعبة والـ ws-server ما يفرّقون بينه وبين بث
 * حقيقي:
 *
 *   connect(options, callbacks) / disconnect() / isConnected()
 *
 * options.username = رقم الغرفة (الاتصال المحفوظ {platform:'phone', username:<رقم>}
 * اللي يكتبه phone-room.html)، options.authToken = جلسة صاحب الغرفة.
 * الصلاحية تنفحص هنا (phone-room-service.attachHost): صاحب الغرفة نفسه
 * وعنده صلاحية 'phone_rooms' (أو أدمن).
 *
 * أحداث جوالات اللاعبين توصل كـ onComment/onGift/onLike/onFollow بنفس
 * الحقول اللي يرسلها موصّل تيك توك.
 */
'use strict';

var DENY_MESSAGES = {
    auth_required: 'لازم تسجّل دخول بحسابك في الموقع عشان تفتح غرفة الجوالات.',
    no_permission: 'اللعب بدون بث (غرفة الجوالات) يحتاج صلاحية من الإدارة.',
    no_room: 'غرفة الجوالات انقفلت أو انتهت — افتح غرفة جديدة من صفحة «غرفة الجوالات».',
    not_owner: 'هذي الغرفة مو لحسابك — افتح غرفتك من صفحة «غرفة الجوالات».'
};

function createPhoneConnector(deps) {
    deps = deps || {};
    var service = deps.service || require('../../phone-room/phone-room-service');
    var auth = deps.auth || require('../../auth/auth-service');
    var _att = null;
    var _connected = false;

    return {
        connect: function (options, callbacks) {
            options = options || {};
            var user = null;
            try { user = options.authToken ? auth.validateSession(String(options.authToken)) : null; } catch (e) { user = null; }
            var code = String(options.username || '').trim();
            var r = user ? service.attachHost(user, code, function (kind, data) {
                if (kind === 'comment') callbacks.onComment(data);
                else if (kind === 'gift') callbacks.onGift(data);
                else if (kind === 'follow') callbacks.onFollow(data);
                else if (kind === 'like' && callbacks.onLike) callbacks.onLike(data);
                else if (kind === 'closed') {
                    _connected = false;
                    _att = null;
                    callbacks.onStatus('ended', DENY_MESSAGES.no_room);
                }
            }) : { ok: false, err: 'auth_required' };
            if (!r.ok) {
                // setImmediate: نفس ترتيب الرسائل مع الموصّلات الحقيقية ('connecting' أول)
                setImmediate(function () { callbacks.onStatus('error', DENY_MESSAGES[r.err] || DENY_MESSAGES.no_room, 'phone_' + r.err); });
                return;
            }
            _att = r;
            _connected = true;
            setImmediate(function () { if (_connected) callbacks.onStatus('connected'); });
        },

        disconnect: function () {
            _connected = false;
            if (_att) { _att.detach(); _att = null; }
        },

        isConnected: function () { return _connected; }
    };
}

module.exports = { createPhoneConnector: createPhoneConnector, DENY_MESSAGES: DENY_MESSAGES };
