/**
 * ==========================================================================
 *  AGP HTTP BODY PARSER — قراءة وتحليل جسم طلب JSON (بدون مكتبة خارجية)
 * ==========================================================================
 *
 * مسؤولية واحدة: تجميع بيانات الطلب الواردة، مع حد أقصى لحجمها (حماية
 * بسيطة من طلبات ضخمة عن قصد أو خطأ)، ثم تحليلها كـ JSON. لا يفترض أي
 * شكل معيّن للمحتوى — تلك مسؤولية كل مسار على حدة في auth-router.js.
 * ==========================================================================
 */

'use strict';

var MAX_BODY_BYTES = 1024 * 100; // 100KB — كافٍ جداً لأي طلب Auth/Admin حالي

/**
 * قراءة جسم الطلب وتحليله كـ JSON.
 * @param {http.IncomingMessage} req
 * @returns {Promise<Object>} يُرفَض (reject) بخطأ واضح عند تجاوز الحجم
 *   أو عند JSON غير صالح؛ ينجح بكائن فارغ {} لجسم فارغ (طلبات GET مثلاً).
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
