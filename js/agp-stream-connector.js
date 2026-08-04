/**
 * ==========================================================================
 *  AGP STREAM CONNECTOR — الأساس العام لربط منصات البث (بدون اتصال فعلي)
 * ==========================================================================
 * مدير عام فوق خدمات البث الموجودة كـ Stubs في agp-services.js
 * (TikTokService/YouTubeService/TwitchService). يفرض عقداً موحّداً
 * (connectToLiveStream/disconnectFromLiveStream) ويتتبّع حالة كل منصة
 * (disconnected/connecting/connected/error) عبر AGP.events. لا اتصال
 * فعلي بأي منصة، ولا منطق خاص بتيك توك هنا تحديداً — عام تماماً وقابل
 * لتسجيل أي منصة بث مستقبلية بنفس العقد.
 *
 * ⚠️ إصلاح تدقيق (قبل تكامل تيك توك): لم يكن هناك أي طريقة عامة لأي
 *   خدمة حقيقية (TikTokService لاحقاً) لتُبلِّغ الموصِّل بنجاح/فشل
 *   الاتصال الفعلي بعد استدعاء connectToLiveStream() — كانت الحالة
 *   تبقى 'connecting' للأبد بلا تأكيد. أُضيفت الآن reportStatus(key,
 *   status) كنقطة الاتصال العامة الوحيدة لهذا الغرض. لا تغيير على أي
 *   دالة أخرى أو سلوك موجود؛ إضافة فقط.
 *
 * يعتمد على js/agp-core.js, js/agp-events.js, js/agp-services.js قبله.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var STATUS = {
        DISCONNECTED: 'disconnected',
        CONNECTING: 'connecting',
        CONNECTED: 'connected',
        ERROR: 'error'
    };

    var _platforms = {}; // key -> { service, status }

    function registerPlatform(key, service) {
        if (!key || !service) {
            AGP.log('Stream Connector: cannot register platform, missing key or service.');
            return false;
        }
        if (typeof service.connectToLiveStream !== 'function' || typeof service.disconnectFromLiveStream !== 'function') {
            AGP.log('Stream Connector: service for "' + key + '" missing required contract (connectToLiveStream/disconnectFromLiveStream).');
            return false;
        }
        _platforms[key] = { service: service, status: STATUS.DISCONNECTED };
        AGP.log('Stream Connector: platform "' + key + '" registered.');
        return true;
    }

    function getEntry(key) {
        return _platforms[key] || null;
    }

    function isValidStatus(status) {
        var key;
        for (key in STATUS) {
            if (Object.prototype.hasOwnProperty.call(STATUS, key) && STATUS[key] === status) return true;
        }
        return false;
    }

    function setStatus(key, status) {
        var entry = getEntry(key);
        if (!entry) return false;
        entry.status = status;
        AGP.events.emit('stream:statusChanged', { platform: key, status: status });
        return true;
    }

    AGP.streamConnector = {
        STATUS: STATUS,

        registerPlatform: registerPlatform,

        getSupportedPlatforms: function () {
            return Object.keys(_platforms);
        },

        // لا يوجد تأكيد تلقائي لنجاح الاتصال؛ الحالة تبقى "connecting"
        // حتى تستدعي الخدمة الفعلية reportStatus() بنفسها (أدناه) لتؤكد
        // النجاح ('connected') أو الفشل ('error'). استدعاء الخدمة نفسه
        // محميّ بـ try/catch حتى لا يكسر استثناء متزامن داخل تنفيذها
        // بقية المنصة.
        connect: function (key, options) {
            var entry = getEntry(key);
            if (!entry) {
                AGP.log('Stream Connector: unknown platform "' + key + '".');
                return false;
            }
            setStatus(key, STATUS.CONNECTING);
            try {
                entry.service.connectToLiveStream(options);
            } catch (err) {
                console.error('[AGP Stream Connector] "' + key + '".connectToLiveStream() threw:', err);
                setStatus(key, STATUS.ERROR);
                return false;
            }
            return true;
        },

        disconnect: function (key) {
            var entry = getEntry(key);
            if (!entry) {
                AGP.log('Stream Connector: unknown platform "' + key + '".');
                return false;
            }
            try {
                entry.service.disconnectFromLiveStream();
            } catch (err) {
                console.error('[AGP Stream Connector] "' + key + '".disconnectFromLiveStream() threw:', err);
            }
            setStatus(key, STATUS.DISCONNECTED);
            return true;
        },

        /**
         * نقطة الاتصال العامة الوحيدة لأي خدمة منصة حقيقية (مثل
         * TikTokService مستقبلاً) لتُبلِّغ الموصِّل بحالة اتصالها
         * الفعلية بعد connectToLiveStream()/disconnectFromLiveStream()
         * — عادة 'connected' عند النجاح الفعلي، أو 'error' عند الفشل.
         * هذا يُغلِق الفجوة التي كانت تُبقي الحالة 'connecting' للأبد
         * بلا تأكيد حقيقي.
         * @param {string} key - معرّف المنصة (مثل 'tiktok')
         * @param {string} status - إحدى قيم AGP.streamConnector.STATUS
         * @returns {boolean} true إن قُبِل التحديث فعلياً
         */
        reportStatus: function (key, status) {
            if (!getEntry(key)) {
                AGP.log('Stream Connector: cannot report status, unknown platform "' + key + '".');
                return false;
            }
            if (!isValidStatus(status)) {
                AGP.log('Stream Connector: cannot report status, invalid status "' + status + '".');
                return false;
            }
            return setStatus(key, status);
        },

        getStatus: function (key) {
            var entry = getEntry(key);
            return entry ? entry.status : STATUS.DISCONNECTED;
        },

        getConnectedPlatforms: function () {
            return Object.keys(_platforms).filter(function (key) {
                return _platforms[key].status === STATUS.CONNECTED;
            });
        }
    };

    // تسجيل المنصات الثلاث الموجودة فعلياً كـ Stubs — بدون أي اتصال فعلي.
    if (AGP.services) {
        if (AGP.services.TikTokService) registerPlatform('tiktok', AGP.services.TikTokService);
        if (AGP.services.YouTubeService) registerPlatform('youtube', AGP.services.YouTubeService);
        if (AGP.services.TwitchService) registerPlatform('twitch', AGP.services.TwitchService);
    } else {
        AGP.log('Stream Connector: AGP.services not available yet, no platforms registered.');
    }

    AGP.log('AGP Stream Connector loaded (foundation only, no real platform connection).');

}(window.AymanGamesPlatform));
