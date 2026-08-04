/**
 * ==========================================================================
 *  AGP PROTOCOL — أنواع الرسائل السبعة (docs/BACKEND_ARCHITECTURE.md §3-4)
 * ==========================================================================
 *
 * هذا الملف هو "العقد" (Interface) نفسه — سبعة أسماء ثابتة فقط، لا أي
 * منطق تنفيذي. أي كود آخر في backend/ يجب أن يستورد من هنا بدل كتابة
 * النصوص الحرفية ('comment', 'gift'...) في أكثر من مكان.
 *
 *   Browser → Backend (تحكّم فقط):  CONNECT, DISCONNECT
 *   Backend → Browser (بيانات/دورة حياة): STATUS, COMMENT, GIFT, FOLLOW, ERROR
 * ==========================================================================
 */

'use strict';

var MESSAGE_TYPES = {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    STATUS: 'status',
    COMMENT: 'comment',
    GIFT: 'gift',
    FOLLOW: 'follow',
    ERROR: 'error'
};

// قائمة مساعدة (مصفوفة) لكل القيم الصالحة، تُستخدَم للتحقق السريع في
// protocol/message-schema.js دون تكرار القيم يدوياً هناك.
var ALL_TYPES = Object.keys(MESSAGE_TYPES).map(function (key) {
    return MESSAGE_TYPES[key];
});

module.exports = {
    MESSAGE_TYPES: MESSAGE_TYPES,
    ALL_TYPES: ALL_TYPES
};
