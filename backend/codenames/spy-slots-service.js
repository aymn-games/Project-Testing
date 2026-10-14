/**
 * كود نيمز — باركود خاص لكل سباي ماستر مرتبط بحسابه بالمنصة.
 *
 * شاشة اللعب (حساب الستريمر) تسجّل لكل فريق "خانة" (slot): رقم عشوائي +
 * يوزر تيك توك السباي ماستر اللي عيّنه المذيع + مفتاح تشفير اللوحة لهذي
 * الخانة. جوال السباي ماستر لما يمسح باركوده يطلب المفتاح بجلسته بالموقع،
 * والخادم يعطيه المفتاح فقط لو حسابه موثَّق بنفس يوزر تيك توك الخانة —
 * غير كذا يرجع اسم صاحب الباركود (للتنبيه) والجوال يرسل طلب عادي للمذيع.
 *
 * التخزين بالذاكرة فقط (مؤقت لكل جلسة لعب، ينتهي بعد SLOT_TTL_MS من آخر
 * تحديث) — ما يلمس قاعدة البيانات.
 */

'use strict';

var SLOT_TTL_MS = 12 * 60 * 60 * 1000;
var MAX_ROOMS = 5000;

var _rooms = {}; // room -> { ownerId, updatedAt, slots: { id: {team, tiktok, name, key} } }

function now() { return Date.now(); }

function bareTikTok(s) {
    return String(s == null ? '' : s).trim().replace(/^@/, '').toLowerCase();
}

function isValidId(s, max) {
    return typeof s === 'string' && s.length > 0 && s.length <= max && /^[A-Za-z0-9_-]+$/.test(s);
}

function sweep() {
    var t = now();
    Object.keys(_rooms).forEach(function (room) {
        if (t - _rooms[room].updatedAt > SLOT_TTL_MS) delete _rooms[room];
    });
}

/** الحسابات اللي تشغّل الألعاب (نفس شرط فتح الألعاب: ستريمر/صلاحية تشغيل/أدمن). */
function canHostGames(user) {
    if (!user) return false;
    var p = user.permissions || {};
    return user.role === 'admin' || Boolean(user.is_streamer) || Boolean(p.can_run_games) || Boolean(p.full_game_access);
}

/**
 * تسجيل/استبدال خانات غرفة. ترجع {ok:true} أو {ok:false, error}.
 * slots: [{id, team:1|2, tiktok, name, key}] (حد أقصى 2 — خانة لكل فريق).
 */
function setSlots(user, room, slots) {
    if (!canHostGames(user)) return { ok: false, error: 'forbidden' };
    if (!isValidId(room, 40) || !Array.isArray(slots) || slots.length > 2) return { ok: false, error: 'invalid_request' };
    var clean = {};
    for (var i = 0; i < slots.length; i++) {
        var s = slots[i] || {};
        var team = Number(s.team);
        var tiktok = bareTikTok(s.tiktok);
        if (!isValidId(s.id, 40) || (team !== 1 && team !== 2) || !tiktok || tiktok.length > 64 ||
            typeof s.key !== 'string' || !/^[A-Za-z0-9+/=]{16,64}$/.test(s.key)) {
            return { ok: false, error: 'invalid_request' };
        }
        clean[s.id] = { team: team, tiktok: tiktok, name: String(s.name || tiktok).slice(0, 40), key: s.key };
    }
    sweep();
    var existing = _rooms[room];
    if (existing && existing.ownerId !== user.id) return { ok: false, error: 'forbidden' };
    if (!existing && Object.keys(_rooms).length >= MAX_ROOMS) return { ok: false, error: 'busy' };
    _rooms[room] = { ownerId: user.id, updatedAt: now(), slots: clean };
    return { ok: true };
}

/**
 * جوال يطلب مفتاح خانته. ترجع:
 *  {ok:true, team, name, key}            — الحساب هو صاحب الخانة
 *  {ok:false, error:'not_owner', name, team} — حساب ثاني (أو بدون تيك توك موثَّق)
 *  {ok:false, error:'slot_not_found'}    — الخانة انتهت أو تغيّر السباي ماستر
 */
function claimSlot(user, room, slotId) {
    var r = _rooms[room];
    if (!r || now() - r.updatedAt > SLOT_TTL_MS) return { ok: false, error: 'slot_not_found' };
    var s = r.slots[slotId];
    if (!s) return { ok: false, error: 'slot_not_found' };
    var mine = user && user.tiktok_verified && bareTikTok(user.tiktok_username) === s.tiktok;
    if (!mine) return { ok: false, error: 'not_owner', name: s.name, team: s.team };
    return { ok: true, team: s.team, name: s.name, key: s.key };
}

module.exports = {
    setSlots: setSlots,
    claimSlot: claimSlot,
    // للاختبار
    _reset: function () { _rooms = {}; }
};
