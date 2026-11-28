/**
 * AGP PLATFORM STREAMLABS — يربط Streamlabs حساب المنصة نفسه بقائمة «داعمي المنصة».
 *
 * كل دونيشن يوصل لحساب المنصة على Streamlabs (كريترز وغيره) ينضاف تلقائياً لجدول supporters
 * (supporters-service.addStreamlabsDonation)، فيظهر أول القائمة بالرئيسية وبـtop-supporters.html.
 *
 * - الرمز: PLATFORM_STREAMLABS_SOCKET_TOKEN (Streamlabs ← Settings ← API Settings ← API Tokens ←
 *   Your Socket API Token). فارغ = الميزة مطفية والإدخال اليدوي من الأدمن يكمل عادي.
 * - مستقل عن ربط Streamlabs الخاص بكل ستريمر بفيرو (streamlabs/streamlabs-manager.js): يشتغل هنا
 *   بسيرفر الألعاب دائماً، حتى بوضع التحويل لسيرفر فيرو، لأن جدول الداعمين هنا.
 * - دونيشن التجربة (Test Donation من Streamlabs) ما ينحفظ.
 * - Streamlabs ما يعيد إرسال اللي فات وقت انقطاع السيرفر — ينضاف يدوياً من الأدمن لو صار.
 */

'use strict';

var SOCKET_URL = 'https://sockets.streamlabs.com?token=';

function isUnauthorized(err) {
    var m = String((err && (err.message || err.description)) || err || '');
    return /unauthori[sz]ed|invalid token|401/i.test(m);
}

/**
 * @param {{ token: string, io: Function, addDonation: Function, logger? }} deps
 */
function createPlatformStreamlabs(deps) {
    var log = deps.logger || { log: function () {}, error: function () {} };
    var state = { status: 'off', lastError: null, lastDonationAt: null };
    var socket = null;

    function handleEvent(payload) {
        if (!payload || payload.type !== 'donation') return;
        var msgs = Array.isArray(payload.message) ? payload.message : (payload.message ? [payload.message] : []);
        msgs.forEach(function (m) {
            if (!m) return;
            if (m.isTest || m.is_test || payload.for === 'test') return;
            var saved = null;
            try {
                saved = deps.addDonation({
                    slId: m._id != null ? m._id : m.id,
                    name: m.name || m.from,
                    amount: m.amount,
                    currency: m.currency,
                    message: m.message
                });
            } catch (err) { log.error('Platform Streamlabs: failed to save donation:', err); }
            if (saved) state.lastDonationAt = saved.created_at || Date.now();
        });
    }

    function start() {
        var token = String(deps.token || '').trim();
        if (!token) { state.status = 'off'; return false; }
        if (socket) return true;
        state.status = 'connecting';
        socket = deps.io(SOCKET_URL + token, { transports: ['websocket'], reconnection: true, reconnectionDelay: 2000, reconnectionDelayMax: 60000 });
        socket.on('connect', function () { state.status = 'connected'; state.lastError = null; log.log('Platform Streamlabs: connected — donations go to platform supporters.'); });
        socket.on('disconnect', function () { if (state.status !== 'invalid_token') state.status = 'connecting'; });
        function onError(err) {
            state.lastError = String((err && err.message) || err || '').slice(0, 120);
            if (!isUnauthorized(err)) return;
            state.status = 'invalid_token';
            log.error('Platform Streamlabs: token rejected — check PLATFORM_STREAMLABS_SOCKET_TOKEN.');
            stop('invalid_token');
        }
        socket.on('connect_error', onError);
        socket.on('error', onError);
        socket.on('event', handleEvent);
        return true;
    }

    function stop(status) {
        if (socket) { try { socket.close(); } catch (e) { /* ignore */ } }
        socket = null;
        state.status = status || 'off';
    }

    /** off | connecting | connected | invalid_token */
    function getState() { return { status: state.status, lastError: state.lastError, lastDonationAt: state.lastDonationAt }; }

    return { start: start, stop: stop, handleEvent: handleEvent, getState: getState };
}

var instance = null;
function get() {
    if (!instance) {
        instance = createPlatformStreamlabs({
            token: require('../config').platformStreamlabsSocketToken,
            io: require('socket.io-client'),
            addDonation: require('./supporters-service').addStreamlabsDonation,
            logger: require('../utils/logger')
        });
    }
    return instance;
}

function startPlatformStreamlabs() {
    try { get().start(); } catch (err) { require('../utils/logger').error('Platform Streamlabs: failed to start:', err); }
}

module.exports = { createPlatformStreamlabs: createPlatformStreamlabs, get: get, startPlatformStreamlabs: startPlatformStreamlabs };
