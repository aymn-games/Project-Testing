/**
 * AGP ROOM CODE RANGES — سجل نطاقات أرقام الغرف (4 أرقام) لكل لعبة.
 *
 * كل لعبة لها نطاق 100 رقم خاص فيها، فما يمكن لعبتين يطلع لهم نفس رقم
 * الغرفة بنفس الوقت، وزر «دخول غرفة» (js/agp-join-room.js) يوصل اللاعب
 * للعبة الصح مباشرة. داخل اللعبة نفسها الرقم ما يتكرر لأن كل خادم يتأكد
 * إن الرقم مو مستخدم قبل ما يعطيه (allocate تحت).
 *
 * لعبة جديدة تحتاج دخول برقم غرفة/باركود: خذ أول نطاق فاضي (1500–1599 ثم
 * 1600–1699 ...) وأضفه هنا، واستخدم allocate() بخادمها، وأضف فحصها لـ
 * CHECKS بـ room-lookup-service.js ورابطها لـ GAMES بـ js/agp-join-room.js.
 *
 * ألعاب خارج هذا الباك اند تلتزم بنطاقها يدوياً:
 *   - «من الأمبوستر؟» (Firebase، الرقم يتولد بالمتصفح) ← randomRoomCode
 *     بـ discord-games/impostor/script.js.
 *   - «بلياردو ٨» (خادم منفصل بمستودعه الخاص) ← لازم خادمها يولّد أرقامه
 *     من نطاقها هنا لما ينبني.
 */

'use strict';

var RANGES = {
    intruder:  { name: 'محطة سهيل',     from: 1000, to: 1099 },
    party:     { name: 'حفلة الميلاد',  from: 1100, to: 1199 },
    impostor:  { name: 'من الأمبوستر؟', from: 1200, to: 1299 },
    billiards: { name: 'بلياردو ٨',     from: 1300, to: 1399 },
    mafia:     { name: 'المافيا',       from: 1400, to: 1499 }
    // 1500–9999 محجوزة لألعاب قادمة
};

/**
 * يختار رقم غرفة عشوائي غير مستخدم من نطاق اللعبة.
 * @param {string} game مفتاح من RANGES
 * @param {function(string):boolean} isTaken يرجع true لو الرقم مستخدم
 * @returns {string|null} الرقم، أو null لو النطاق كله مستخدم
 */
function allocate(game, isTaken) {
    var r = RANGES[game];
    if (!r) throw new Error('room-code-ranges: unknown game ' + game);
    var size = r.to - r.from + 1;
    // نبدأ من مكان عشوائي ونلف على النطاق كامل — ما يعلق لو النطاق امتلأ
    var start = Math.floor(Math.random() * size);
    for (var i = 0; i < size; i++) {
        var code = String(r.from + (start + i) % size);
        if (!isTaken(code)) return code;
    }
    return null;
}

module.exports = { RANGES: RANGES, allocate: allocate };
