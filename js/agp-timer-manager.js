/**
 * ==========================================================================
 *  AGP TIMER MANAGER — مؤقّتات عامة قابلة لإعادة الاستخدام (بدون منطق لعبة)
 * ==========================================================================
 * أداة عامة لإدارة عدّادات تنازلية مسمّاة (تسجيل، مدة جولة، إلخ)، بدون
 * أي منطق خاص بلعبة أو واجهة. أي لعبة/وحدة مستقبلية تطلب مؤقّتاً باسم
 * فريد، وتستمع لأحداث `timer:*` عبر AGP.events بدل إدارة setInterval
 * بنفسها. لا اتصال فعلي، لا واجهة.
 * يعتمد على js/agp-core.js, js/agp-events.js قبله فقط.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var DEFAULT_TICK_MS = 1000;

    var _timers = {}; // name -> { remainingMs, tickMs, intervalId, running }

    function clearTick(entry) {
        if (entry.intervalId !== null) {
            clearInterval(entry.intervalId);
            entry.intervalId = null;
        }
    }

    function tick(name) {
        var entry = _timers[name];
        if (!entry || !entry.running) return;

        entry.remainingMs -= entry.tickMs;

        if (entry.remainingMs <= 0) {
            entry.remainingMs = 0;
            entry.running = false;
            clearTick(entry);
            AGP.events.emit('timer:tick', { name: name, remainingMs: 0, remainingSeconds: 0 });
            AGP.events.emit('timer:ended', { name: name });
            AGP.log('Timer Manager: "' + name + '" ended.');
            return;
        }

        AGP.events.emit('timer:tick', {
            name: name,
            remainingMs: entry.remainingMs,
            remainingSeconds: Math.ceil(entry.remainingMs / 1000)
        });
    }

    AGP.timerManager = {

        /**
         * بدء (أو استبدال) مؤقّت مسمّى.
         * @param {string} name - معرّف فريد للمؤقّت
         * @param {number} durationSeconds - المدة بالثواني
         * @param {number} [tickIntervalMs] - فاصل النبض (افتراضياً 1000)
         * @returns {boolean}
         */
        start: function (name, durationSeconds, tickIntervalMs) {
            if (!name || !durationSeconds || durationSeconds <= 0) {
                AGP.log('Timer Manager: cannot start, invalid name/duration.');
                return false;
            }

            this.stop(name);

            var tickMs = tickIntervalMs || DEFAULT_TICK_MS;
            var entry = {
                remainingMs: durationSeconds * 1000,
                tickMs: tickMs,
                intervalId: null,
                running: true
            };
            _timers[name] = entry;
            entry.intervalId = setInterval(function () { tick(name); }, tickMs);

            AGP.log('Timer Manager: "' + name + '" started (' + durationSeconds + 's).');
            AGP.events.emit('timer:started', { name: name, durationSeconds: durationSeconds });
            return true;
        },

        pause: function (name) {
            var entry = _timers[name];
            if (!entry || !entry.running) return false;
            entry.running = false;
            clearTick(entry);
            AGP.events.emit('timer:paused', { name: name, remainingMs: entry.remainingMs });
            return true;
        },

        resume: function (name) {
            var entry = _timers[name];
            if (!entry || entry.running || entry.remainingMs <= 0) return false;
            entry.running = true;
            entry.intervalId = setInterval(function () { tick(name); }, entry.tickMs);
            AGP.events.emit('timer:resumed', { name: name, remainingMs: entry.remainingMs });
            return true;
        },

        stop: function (name) {
            var entry = _timers[name];
            if (!entry) return false;
            clearTick(entry);
            delete _timers[name];
            AGP.events.emit('timer:stopped', { name: name });
            return true;
        },

        reset: function (name, durationSeconds, tickIntervalMs) {
            return this.start(name, durationSeconds, tickIntervalMs);
        },

        getRemainingSeconds: function (name) {
            var entry = _timers[name];
            return entry ? Math.ceil(entry.remainingMs / 1000) : 0;
        },

        isRunning: function (name) {
            var entry = _timers[name];
            return !!(entry && entry.running);
        },

        getActiveTimers: function () {
            return Object.keys(_timers);
        }
    };

    AGP.log('AGP Timer Manager loaded (generic countdowns, no game logic).');

}(window.AymanGamesPlatform));
