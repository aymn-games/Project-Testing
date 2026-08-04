/**
 * ==========================================================================
 *  AGP WS FRAME — تشفير/فك رسائل WebSocket (RFC 6455)، بدون أي مكتبة
 * ==========================================================================
 *
 * وحدة منخفضة المستوى تُستخدَم فقط من داخل websocket/ws-server.js. تنفّذ
 * الحد الأدنى المطلوب من إطار WebSocket (Framing) يدوياً باستخدام وحدة
 * Buffer المدمجة في Node فقط — بدون أي مكتبة خارجية (راجع
 * docs/BACKEND_ARCHITECTURE.md §7). تدعم: رسائل نصية (Text)، إغلاق
 * (Close)، Ping/Pong. لا تدعم التجزئة (Fragmented Frames) ولا الرسائل
 * الثنائية (Binary) — غير مطلوبة لبروتوكول AGP (رسائل JSON نصية صغيرة
 * فقط، راجع §3-4 في وثيقة المعمارية).
 * ==========================================================================
 */

'use strict';

var OPCODES = {
    TEXT: 0x1,
    CLOSE: 0x8,
    PING: 0x9,
    PONG: 0xA
};

/**
 * بناء إطار WebSocket صادر من الخادم (غير مُقنَّع/Unmasked — إطارات
 * الخادم لا تُقنَّع أبداً حسب المواصفة، بخلاف إطارات المتصفح).
 * @param {string} textPayload
 * @param {number} [opcode]
 * @returns {Buffer}
 */
function encodeTextFrame(textPayload, opcode) {
    var payload = Buffer.from(textPayload, 'utf8');
    var length = payload.length;
    var header;

    if (length <= 125) {
        header = Buffer.alloc(2);
        header[0] = 0x80 | (opcode || OPCODES.TEXT); // FIN=1 + opcode
        header[1] = length; // MASK=0 (خادم) + الطول
    } else if (length <= 65535) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | (opcode || OPCODES.TEXT);
        header[1] = 126;
        header.writeUInt16BE(length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | (opcode || OPCODES.TEXT);
        header[1] = 127;
        // JSON صغيرة دائماً عملياً هنا؛ نكتب الجزء العالي صفراً بأمان.
        header.writeUInt32BE(0, 2);
        header.writeUInt32BE(length, 6);
    }

    return Buffer.concat([header, payload]);
}

/**
 * إطار تحكّم صغير بلا محتوى (Close/Pong)، غير مُقنَّع (من الخادم).
 * @param {number} opcode
 * @returns {Buffer}
 */
function encodeControlFrame(opcode) {
    return Buffer.from([0x80 | opcode, 0x00]);
}

/**
 * محاولة استخراج إطار واحد كامل من بداية المخزن المؤقّت (Buffer)
 * المتراكم لاتصال معيّن. إطارات المتصفح **مُقنَّعة دائماً** (Masked)
 * حسب المواصفة، فيجب فكّ القناع دائماً هنا.
 * @param {Buffer} buffer - كل البيانات المتراكمة غير المُعالَجة بعد
 * @returns {{ opcode: number, payload: Buffer, bytesConsumed: number }|null}
 *   null إن لم يكتمل إطار كامل بعد (ننتظر بيانات إضافية).
 */
function tryDecodeFrame(buffer) {
    if (buffer.length < 2) return null;

    var firstByte = buffer[0];
    var secondByte = buffer[1];

    var opcode = firstByte & 0x0f;
    var isMasked = (secondByte & 0x80) !== 0;
    var payloadLen = secondByte & 0x7f;

    var offset = 2;

    if (payloadLen === 126) {
        if (buffer.length < offset + 2) return null;
        payloadLen = buffer.readUInt16BE(offset);
        offset += 2;
    } else if (payloadLen === 127) {
        if (buffer.length < offset + 8) return null;
        // نتجاهل الأربع بايتات العليا (رسائل JSON صغيرة عملياً دائماً)
        payloadLen = buffer.readUInt32BE(offset + 4);
        offset += 8;
    }

    var maskKey = null;
    if (isMasked) {
        if (buffer.length < offset + 4) return null;
        maskKey = buffer.slice(offset, offset + 4);
        offset += 4;
    }

    if (buffer.length < offset + payloadLen) return null; // إطار غير مكتمل بعد

    var payload = buffer.slice(offset, offset + payloadLen);

    if (isMasked) {
        var unmasked = Buffer.alloc(payloadLen);
        for (var i = 0; i < payloadLen; i++) {
            unmasked[i] = payload[i] ^ maskKey[i % 4];
        }
        payload = unmasked;
    }

    return {
        opcode: opcode,
        payload: payload,
        bytesConsumed: offset + payloadLen
    };
}

module.exports = {
    OPCODES: OPCODES,
    encodeTextFrame: encodeTextFrame,
    encodeControlFrame: encodeControlFrame,
    tryDecodeFrame: tryDecodeFrame
};
