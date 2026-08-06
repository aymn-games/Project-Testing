/**
 * ==========================================================================
 *  AGP TIKTOK CONNECTOR — تنفيذ فعلي كامل (يشمل إعادة الاتصال التلقائية)
 * ==========================================================================
 *
 * ⚠️ اتصال حقيقي بخدمة تيك توك الداخلية غير الموثَّقة رسمياً، عبر مكتبة
 *   خارجية واحدة معتمَدة صراحة: `tiktok-live-connector` (الاعتماد
 *   الوحيد في backend/package.json). لا بروتوكول تيك توك مكتوب يدوياً
 *   هنا — هذا الملف طبقة ترجمة فوق المكتبة فقط.
 *
 * يطبّق **نفس شكل الموصِّل بالضبط** الذي يطبّقه
 * platforms/mock/mock-connector.js:
 *
 *   createTikTokConnector() -> { connect(options, callbacks), disconnect(), isConnected() }
 *
 *   callbacks = {
 *     onStatus(status, message?),   // فقط 'connecting'/'connected'/'error'
 *                                    // من هنا (لا 'disconnected' — تلك
 *                                    // مسؤولية ws-server.js عند تلقّي
 *                                    // رسالة disconnect من المتصفح فقط،
 *                                    // بلا تغيير على هذا العقد).
 *     onComment({ id, name, text }),
 *     onGift({ id, name, giftName, giftValue, repeatCount }),
 *     onFollow({ id, name })
 *   }
 *
 * لا تعديل على platforms/connector-router.js (يبقى نقطة التبديل الوحيدة
 * كما هي)، ولا على websocket/ws-server.js، ولا على بروتوكول الرسائل.
 *
 * ⚠️ إعادة الاتصال (Reconnect) — راجع docs/BACKEND_ARCHITECTURE.md §5:
 *   - انقطاع غير متوقَّع (بعد اتصال ناجح فعلاً) -> محاولات إعادة اتصال
 *     تلقائية بتأخير تصاعدي (Exponential Backoff + Jitter)، حتى حد
 *     أقصى من المحاولات، دون أي تدخّل من المتصفح.
 *   - فشل الاتصال الأول (اسم مستخدم خاطئ/غير مباشر الآن) -> لا إعادة
 *     محاولة تلقائية إطلاقاً؛ يُبلَّغ كخطأ فوراً (تجنّباً لقصف خدمة تيك
 *     توك غير الموثَّقة بمحاولات على إعداد خاطئ من الأساس).
 *   - قطع الاتصال المتعمَّد عبر disconnect() -> لا أي محاولة إعادة
 *     اتصال إطلاقاً (يُميَّز صراحة عن الانقطاع غير المتوقَّع).
 *
 * تطبيع الأحداث (محقَّق من الحزمة المثبَّتة فعلياً v2.4.3):
 *   chat   -> data.user.uniqueId, data.user.nickname, data.content (⚠️ مؤكَّد باختبار حقيقي، ليس data.comment)
 *   gift   -> data.user.{uniqueId,nickname}, data.gift.{name,diamondCount,type}, data.repeatCount, data.repeatEnd
 *             (هدايا قابلة للتسلسل type===1: حدث واحد نهائي فقط عند
 *             repeatEnd، تطابقاً مع سلوك موصِّل المحاكاة).
 *   follow -> WebcastEvent.FOLLOW منفصل تماماً عن SOCIAL/SHARE.
 * ==========================================================================
 */

'use strict';

var logger = require('../../utils/logger');

var MAX_RECONNECT_ATTEMPTS = 5;
var BASE_RECONNECT_DELAY_MS = 1000;
var MAX_RECONNECT_DELAY_MS = 30000;

var TikTokLib;
try {
    TikTokLib = require('tiktok-live-connector');
} catch (err) {
    TikTokLib = null;
    logger.error('TikTok Connector: "tiktok-live-connector" is not installed. Run `npm install` in backend/.');
}

/**
 * استخراج {id, name} موحَّد من كائن مستخدم واردٍ من المكتبة، بأمان حتى
 * لو كانت بعض الحقول مفقودة.
 */
function extractUser(data) {
    var user = (data && data.user) || {};
    var uniqueId = user.uniqueId || user.id || 'unknown';
    var nickname = user.nickname || uniqueId;
    return { id: 'tiktok:' + uniqueId, name: nickname };
}

/**
 * ⚠️ استخراج "هل هذا المعلِّق متابع لصاحب البث؟" — عبر
 * `data.user.followInfo.followStatus` (حقل موجود فعلياً بالحزمة
 * المثبَّتة، تأكَّدت منه مباشرة بفحص تعريفات TypeScript الداخلية).
 *
 * ⚠️ **غير مؤكَّد بالكامل**: القيمة بالضبط لـ followStatus (نص، مثل "1"
 * أو "2") **غير موثَّقة رسمياً** من تيك توك، ولم أقدر أختبرها ضد بث
 * حقيقي (لا وصول شبكي لتيك توك من بيئة التطوير هذه). المنطق هنا أفضل
 * تفسير منطقي متاح — يحتاج تأكيداً فعلياً بعد الرفع على بيئتك.
 */
/**
 * ⚠️ استخراج "هل هذا المعلِّق متابع لصاحب البث؟" — عبر
 * `data.user.followInfo.followStatus`.
 *
 * ⚠️ **تخميني الأول (status === '1' || '2') ثبت أنه غير صحيح باختبار
 * حقيقي** — شخص غير متابع دخل رغم تفعيل "متابعين فقط". بدل تخمين قيمة
 * ثانية بلا دليل، هذي النسخة تُرجِع بيانات تشخيصية خام مع كل تعليق (عبر
 * _debugFollowStatus) لنشوف القيمة الحقيقية مباشرة بمتصفحك (بنفس طريقة
 * ?agpDebug=1 المعتادة)، ثم نصحّح الشرط بدقة بدل التخمين.
 */
function extractIsFollower(data) {
    var followInfo = data && data.user && data.user.followInfo;
    if (!followInfo || !followInfo.followStatus) return false;
    var status = String(followInfo.followStatus);
    return status === '1' || status === '2'; // ⚠️ لا يزال تخميناً — بانتظار القيم الحقيقية من _debugFollowStatus
}

function extractFollowDebugInfo(data) {
    var followInfo = data && data.user && data.user.followInfo;
    var userIdentity = data && data.user && data.user.userIdentity;
    return {
        followStatus: followInfo ? followInfo.followStatus : '(no followInfo)',
        isFollowerOfAnchor: userIdentity ? userIdentity.isFollowerOfAnchor : '(no userIdentity)'
    };
}

/**
 * استخراج بيانات الهدية بأمان من أي من المسارين المحتملين حسب إعدادات
 * الاتصال (gift الأساسي دائماً متاح، giftDetails فقط إن فُعِّل
 * enableExtendedGiftInfo — لم نفعّله هنا لإبقاء الاتصال بسيطاً).
 */
function extractGiftInfo(data) {
    var gift = (data && data.gift) || {};
    var details = (data && data.giftDetails) || {};
    return {
        name: gift.name || details.giftName || 'Gift',
        value: (typeof gift.diamondCount === 'number') ? gift.diamondCount : (details.diamondCount || 0),
        type: (typeof gift.type === 'number') ? gift.type : details.giftType
    };
}

/**
 * إنشاء نسخة موصِّل تيك توك جديدة ومستقلة (اتصال واحد = نسخة واحدة)،
 * بنفس نمط platforms/mock/mock-connector.js بالضبط.
 * @returns {{connect: function, disconnect: function, isConnected: function}}
 */
function createTikTokConnector() {
    var _connection = null;
    var _connected = false;
    var _intentionalDisconnect = false;
    var _reconnectAttempts = 0;
    var _reconnectTimer = null;
    var _username = null;
    var _followersOnly = false; // ⚠️ لم تعد تُستخدَم للفلترة هنا — الفلترة انتقلت للواجهة الأمامية لتشخيص أسهل (راجع agp-shell-config.js)
    var _callbacks = null;

    function clearReconnectTimer() {
        if (_reconnectTimer !== null) {
            clearTimeout(_reconnectTimer);
            _reconnectTimer = null;
        }
    }

    function attemptReconnect() {
        if (_intentionalDisconnect) return;

        if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            logger.error('TikTok Connector: giving up after ' + _reconnectAttempts + ' reconnect attempt(s).');
            _callbacks.onStatus('error', 'Lost connection to TikTok LIVE and could not reconnect after ' + _reconnectAttempts + ' attempts.');
            return;
        }

        var delay = Math.min(BASE_RECONNECT_DELAY_MS * Math.pow(2, _reconnectAttempts), MAX_RECONNECT_DELAY_MS);
        delay += Math.floor(Math.random() * 500); // jitter بسيط لتفادي محاولات متزامنة
        _reconnectAttempts++;

        logger.log('TikTok Connector: reconnecting (attempt ' + _reconnectAttempts + '/' + MAX_RECONNECT_ATTEMPTS + ') in ' + delay + 'ms…');
        _callbacks.onStatus('connecting');

        _reconnectTimer = setTimeout(function () {
            _reconnectTimer = null;
            startConnection(true);
        }, delay);
    }

    /**
     * بناء اتصال جديد وربط كل المستمعين — تُستدعى عند أول اتصال وعند
     * كل محاولة إعادة اتصال، بنفس المنطق تماماً.
     * @param {boolean} isReconnectAttempt
     */
    function startConnection(isReconnectAttempt) {
        try {
            _connection = new TikTokLib.TikTokLiveConnection(_username, {});
        } catch (err) {
            logger.error('TikTok Connector: failed to construct connection:', err);
            if (isReconnectAttempt) {
                attemptReconnect();
            } else {
                _callbacks.onStatus('error', err && err.message);
            }
            return;
        }

        _connection.on(TikTokLib.WebcastEvent.CHAT, function (data) {
            var user = extractUser(data);

            // ⚠️ إصلاح خطأ حقيقي: الحقل الفعلي بالرسالة المفكوكة هو
            // "content"، وليس "comment" كما أوحى مثال README نفسه (توثيق
            // مضلِّل مقارنة بالحقل الخام الفعلي). أُكِّد هذا مباشرة عبر
            // اختبار حقيقي على بث فعلي (كان النص يصل فارغاً دائماً قبل
            // هذا الإصلاح). نُبقي data.comment كاحتياط دفاعي فقط.
            var commentText = (data && (data.content || data.comment)) || '';
            var followDebug = extractFollowDebugInfo(data);
            _callbacks.onComment({
                id: user.id,
                name: user.name,
                text: commentText,
                isFollower: extractIsFollower(data), // ⚠️ لا يزال تخميناً، راجع _debugFollowStatus أدناه
                _debugFollowStatus: followDebug.followStatus,
                _debugIsFollowerOfAnchor: followDebug.isFollowerOfAnchor
            });
        });

        _connection.on(TikTokLib.WebcastEvent.GIFT, function (data) {
            var user = extractUser(data);
            var giftInfo = extractGiftInfo(data);
            var repeatEnd = !!(data && data.repeatEnd);

            // هدايا قابلة للتسلسل (type === 1): تجاهل الأحداث الوسيطة،
            // أرسل فقط عند اكتمال التسلسل — حدث واحد نهائي فقط.
            if (giftInfo.type === 1 && !repeatEnd) return;

            _callbacks.onGift({
                id: user.id,
                name: user.name,
                giftName: giftInfo.name,
                giftValue: giftInfo.value,
                repeatCount: (data && data.repeatCount) || 1
            });
        });

        _connection.on(TikTokLib.WebcastEvent.FOLLOW, function (data) {
            var user = extractUser(data);
            _callbacks.onFollow({ id: user.id, name: user.name });
        });

        _connection.on(TikTokLib.ControlEvent.DISCONNECTED, function (info) {
            _connected = false;
            if (_intentionalDisconnect) return; // متوقَّع، لا شيء إضافي مطلوب هنا
            logger.log('TikTok Connector: disconnected unexpectedly.', info);
            attemptReconnect();
        });

        _connection.on(TikTokLib.ControlEvent.ERROR, function (err) {
            logger.error('TikTok Connector: connection error:', err);
            // لا نُبلِّغ status هنا مباشرة؛ الفشل الفعلي يُعالَج عبر
            // connect().catch() أدناه أو حدث DISCONNECTED — تجنّباً
            // لإرسال حالة مكرِّرة لنفس اللحظة.
        });

        _connection.connect()
            .then(function () {
                if (_intentionalDisconnect) return; // انقطاع فُصل يدوياً قبل اكتمال هذا الاتصال — تجاهل تماماً
                _connected = true;
                _reconnectAttempts = 0; // نجاح فعلي يعيد ضبط عدّاد المحاولات
                logger.log('TikTok Connector: connected to real TikTok LIVE for "' + _username + '".');
                _callbacks.onStatus('connected');
            })
            .catch(function (err) {
                if (_intentionalDisconnect) return; // نفس المنطق — لا تأثير لأي وعد متأخر بعد فصل متعمَّد
                _connected = false;
                logger.error('TikTok Connector: connect() failed:', err);
                if (isReconnectAttempt) {
                    attemptReconnect();
                } else {
                    // فشل الاتصال الأول (غالباً اسم مستخدم غير صحيح أو
                    // المستخدم غير مباشر الآن) — لا إعادة محاولة تلقائية.
                    _callbacks.onStatus('error', (err && err.message) || 'Failed to connect to TikTok LIVE.');
                }
            });
    }

    return {
        /**
         * @param {{username: string}} options
         * @param {Object} callbacks
         */
        connect: function (options, callbacks) {
            _username = options && options.username;
            _followersOnly = Boolean(options && options.followersOnly);
            _callbacks = callbacks;
            _intentionalDisconnect = false;
            _reconnectAttempts = 0;

            if (!TikTokLib) {
                callbacks.onStatus('error', 'tiktok-live-connector is not installed.');
                return;
            }
            if (!_username) {
                callbacks.onStatus('error', 'Missing TikTok username.');
                return;
            }

            logger.log('TikTok Connector: connecting to real TikTok LIVE for "' + _username + '"…');
            startConnection(false);
        },

        disconnect: function () {
            _intentionalDisconnect = true;
            clearReconnectTimer();
            _connected = false;

            if (_connection) {
                try {
                    _connection.disconnect();
                } catch (err) {
                    logger.error('TikTok Connector: error during disconnect:', err);
                }
                _connection = null;
            }
            logger.log('TikTok Connector: disconnected.');
        },

        isConnected: function () {
            return _connected;
        }
    };
}

module.exports = {
    createTikTokConnector: createTikTokConnector
};
