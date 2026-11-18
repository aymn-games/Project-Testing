/**
 * AGP HTTP BODY PARSER — قراءة وتحليل جسم طلب JSON، بدون مكتبة خارجية.
 */

'use strict';

var MAX_BODY_BYTES = 1024 * 100; // 100KB — كافٍ لأي طلب Auth/Admin حالي

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<Object>} يُرفَض عند تجاوز الحجم أو JSON غير صالح؛
 *   ينجح بكائن فارغ {} لجسم فارغ.
 */
function readJsonBody(req) {
    return new Promise(function (resolve, reject) {
        var chunks = [];
        var totalBytes = 0;
        var aborted = false;

        req.on('data', function (chunk) {
            if (aborted) return;
            totalBytes += chunk.length;
            if (totalBytes > MAX_BODY_BYTES) {
                aborted = true;
                reject(new Error('body_too_large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', function () {
            if (aborted) return;
            if (chunks.length === 0) {
                resolve({});
                return;
            }
            var raw = Buffer.concat(chunks).toString('utf8').trim();
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (err) {
                reject(new Error('invalid_json'));
            }
        });

        req.on('error', function (err) {
            if (aborted) return;
            reject(err);
        });
    });
}

module.exports = {
    readJsonBody: readJsonBody
};
