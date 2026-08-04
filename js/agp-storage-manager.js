/**
 * ==========================================================================
 *  AGP STORAGE MANAGER — تخزين محلي عام (namespaced، بدون منطق لعبة)
 * ==========================================================================
 * غلاف عام فوق localStorage بمساحة اسم موحّدة (`agp:`)، مع تسلسل/فك
 * تسلسل JSON تلقائي، حتى لا تتعامل أي وحدة مستقبلية مع localStorage
 * مباشرة أو تتصادم المفاتيح بين الوحدات. لا اتصال شبكي، لا منطق لعبة.
 * إن لم يتوفر localStorage (مثلاً وضع خاص)، يعمل فوق ذاكرة مؤقتة داخل
 * الصفحة (In-Memory Fallback) حتى لا ينهار أي كود يعتمد عليه.
 * يعتمد على js/agp-core.js فقط.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }

    var NAMESPACE = 'agp:';
    var _memoryFallback = {};

    function isLocalStorageAvailable() {
        try {
            var testKey = '__agp_storage_test__';
            window.localStorage.setItem(testKey, '1');
            window.localStorage.removeItem(testKey);
            return true;
        } catch (err) {
            return false;
        }
    }

    var _hasLocalStorage = isLocalStorageAvailable();
    if (!_hasLocalStorage) {
        AGP.log('Storage Manager: localStorage unavailable, using in-memory fallback.');
    }

    function fullKey(key) {
        return NAMESPACE + key;
    }

    AGP.storageManager = {

        /**
         * حفظ قيمة (أي نوع قابل لتسلسل JSON) تحت مفتاح.
         * @param {string} key
         * @param {*} value
         * @returns {boolean}
         */
        set: function (key, value) {
            if (!key) return false;
            var serialized;
            try {
                serialized = JSON.stringify(value);
            } catch (err) {
                AGP.log('Storage Manager: failed to serialize value for "' + key + '".', err);
                return false;
            }

            if (_hasLocalStorage) {
                try {
                    window.localStorage.setItem(fullKey(key), serialized);
                } catch (err) {
                    AGP.log('Storage Manager: localStorage.setItem failed for "' + key + '".', err);
                    return false;
                }
            } else {
                _memoryFallback[key] = serialized;
            }
            return true;
        },

        /**
         * جلب قيمة محفوظة، أو defaultValue إن لم توجد/تعذّر فكّها.
         * @param {string} key
         * @param {*} [defaultValue]
         * @returns {*}
         */
        get: function (key, defaultValue) {
            if (!key) return defaultValue !== undefined ? defaultValue : null;

            var raw = _hasLocalStorage
                ? window.localStorage.getItem(fullKey(key))
                : (Object.prototype.hasOwnProperty.call(_memoryFallback, key) ? _memoryFallback[key] : null);

            if (raw === null || raw === undefined) {
                return defaultValue !== undefined ? defaultValue : null;
            }

            try {
                return JSON.parse(raw);
            } catch (err) {
                AGP.log('Storage Manager: failed to parse stored value for "' + key + '".', err);
                return defaultValue !== undefined ? defaultValue : null;
            }
        },

        remove: function (key) {
            if (!key) return false;
            if (_hasLocalStorage) {
                window.localStorage.removeItem(fullKey(key));
            } else {
                delete _memoryFallback[key];
            }
            return true;
        },

        has: function (key) {
            if (!key) return false;
            return _hasLocalStorage
                ? window.localStorage.getItem(fullKey(key)) !== null
                : Object.prototype.hasOwnProperty.call(_memoryFallback, key);
        }
    };

    AGP.log('AGP Storage Manager loaded (namespaced localStorage wrapper, no game logic).');

}(window.AymanGamesPlatform));
