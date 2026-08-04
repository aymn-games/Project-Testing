/**
 * ==========================================================================
 *  AGP DASHBOARD — إعدادات روليت القبائل + حالة اللعبة الحيّة (للعرض فقط)
 * ==========================================================================
 *
 * ⚠️ تحديث: لوحات الإقصاء/الإنعاش/إقصاء القبيلة اللي كانت هنا سابقاً
 *   أُزيلت تماماً — تبيّن (بعد مراجعة ملفات اللعبة الحقيقية) أن اللعبة
 *   عندها نوافذها الخاصة الكاملة لهذا (اختيار/فوز/تأثيرات)، فكان هذا
 *   تكراراً حقيقياً لوظيفة موجودة أصلاً، لا وظيفة ناقصة.
 *
 * الباقي هنا الآن:
 *   1) إعدادات اللعبة (تخزين محلي فقط عبر AGP.storageManager — راجع
 *      ملاحظة صادقة أدناه: اللعبة الحالية لا تقرأ هذي القيم بعد).
 *   2) عرض حالة حيّة للجولة (مين فاز، هل العجلة تدور الآن...) مبني على
 *      الأحداث الحقيقية التي ترسلها اللعبة فعلياً عبر الجسر
 *      (game:wheelSpun/roundStarted/roundEnded) — عرض فقط، بدون تكرار
 *      أي واجهة تحكّم موجودة أصلاً داخل اللعبة نفسها.
 *
 * ⚠️ ملاحظة صادقة: حقول الإعدادات أدناه (الانعاش، الإقصاء المؤقت،
 *   التذاكر) **غير مقروءة فعلياً من اللعبة الحالية** — اللعبة الحقيقية
 *   (script.js) ما فيها أي منطق يقرأ هذي القيم بعد. تبقى محفوظة هنا
 *   جاهزة لليوم اللي تُضاف فيه هذي الميزات فعلياً داخل اللعبة، دون أي
 *   حاجة لإعادة بناء واجهة الإعدادات وقتها.
 * ==========================================================================
 */

window.AGPDashboardCore = window.AGPDashboardCore || {};

(function (NS) {
    'use strict';

    var AGP = window.AymanGamesPlatform;
    if (!AGP) return;

    var STORAGE_KEY = 'roulette_settings_v1';

    function el(id) { return document.getElementById(id); }
    function setText(id, value) { var t = el(id); if (t) t.textContent = String(value); }
    function setChecked(id, value) { var t = el(id); if (t) t.checked = Boolean(value); }

    function defaultSettings() {
        return {
            revivalFriendEnabled: false,
            revivalFriendReturnCount: 1,
            revivalSupportEnabled: false,
            revivalSupportCoinCount: 100,
            revivalSupportReturnCount: 1,
            tempEliminationEnabled: false,
            lateEntryMode: 'winners_only',
            ticketsTotal: 6,
            ticketsFilled: 0
        };
    }

    function loadSettings() {
        var saved = AGP.storageManager.get(STORAGE_KEY, null);
        return saved ? Object.assign(defaultSettings(), saved) : defaultSettings();
    }

    function saveSettings(settings) { AGP.storageManager.set(STORAGE_KEY, settings); }

    NS.rouletteSettings = {
        render: function () {
            var s = loadSettings();
            setChecked('rl-revival-friend-toggle', s.revivalFriendEnabled);
            setText('rl-revival-friend-count', s.revivalFriendReturnCount);
            setChecked('rl-revival-support-toggle', s.revivalSupportEnabled);
            setText('rl-revival-support-coins', s.revivalSupportCoinCount);
            setText('rl-revival-support-count', s.revivalSupportReturnCount);
            setChecked('rl-temp-elim-toggle', s.tempEliminationEnabled);
            var w = el('rl-late-entry-winners'), e = el('rl-late-entry-everyone');
            if (w) w.checked = (s.lateEntryMode === 'winners_only');
            if (e) e.checked = (s.lateEntryMode === 'everyone');
            setText('rl-tickets-total', s.ticketsTotal);
            setText('rl-tickets-filled', s.ticketsFilled);
        },
        toggle: function (key) {
            var s = loadSettings(); s[key] = !s[key]; saveSettings(s); this.render();
        },
        adjustCount: function (key, delta, min) {
            var s = loadSettings();
            var next = (Number(s[key]) || 0) + delta;
            if (typeof min === 'number' && next < min) next = min;
            s[key] = next; saveSettings(s); this.render();
        },
        setLateEntryMode: function (mode) {
            var s = loadSettings(); s.lateEntryMode = mode; saveSettings(s);
        }
    };

    /* ==================================================================
     *  حالة حيّة للجولة — عرض فقط، مبنية على أحداث اللعبة الحقيقية.
     * ================================================================== */
    function setStatus(text) { setText('rl-live-status', text); }

    AGP.events.on('game:roundStarted', function () { setStatus('الجولة بدأت'); });
    AGP.events.on('game:wheelSpun', function () { setStatus('العجلة تدور...'); });
    AGP.events.on('game:winnerSelected', function (p) {
        setStatus('الفائز: ' + ((p && p.winnerName) || '—'));
    });
    AGP.events.on('game:reset', function () { setStatus('بانتظار بدء جولة جديدة'); });

}(window.AGPDashboardCore));
