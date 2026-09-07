/**
 * ==========================================================================
 *  AGP EMAIL SERVICE — إرسال إيميلات المعاملات عبر Resend
 * ==========================================================================
 *
 * حالياً غرض واحد فقط: رمز إعادة تعيين كلمة المرور. راجع backend/auth/
 * auth-service.js (requestPasswordReset).
 *
 * ⚠️ المفتاح (config.resendApiKey) يُقرَأ حصراً من متغيّر بيئة
 * RESEND_API_KEY — لا يوجد أي مفتاح مكتوب هنا أو بأي ملف بالمستودع.
 * لو المتغيّر غير مضبوط، sendPasswordResetEmail يرجع فشلاً واضحاً
 * بدل رمي استثناء غامض — الخادم يستمر بالعمل طبيعياً لبقية الميزات.
 *
 * الدومين aymngames.online موثَّق فعلياً بـResend (DKIM + SPF عبر DNS
 * بمزوّد Spaceship) — راجع docs/CHANGELOG.md [0.45.11].
 * ==========================================================================
 */

'use strict';

var config = require('../config');
var logger = require('../utils/logger');

var FROM_ADDRESS = 'Ayman Games <noreply@aymngames.online>';

var resendClient = null;
function getClient() {
    if (resendClient) return resendClient;
    if (!config.resendApiKey) return null;
    var Resend = require('resend').Resend;
    resendClient = new Resend(config.resendApiKey);
    return resendClient;
}

/**
 * يرسل إيميل فيه رمز إعادة تعيين كلمة المرور (6 أرقام).
 * @param {string} toEmail
 * @param {string} code
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendPasswordResetEmail(toEmail, code) {
    var client = getClient();
    if (!client) {
        logger.error('Email: RESEND_API_KEY غير مضبوط — تعذّر إرسال إيميل استرجاع كلمة المرور.');
        return { success: false, error: 'email_not_configured' };
    }

    var html =
        '<div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; text-align: right; ' +
        'background:#1A0F1F; color:#FFFFFF; padding:32px; border-radius:12px; max-width:480px; margin:0 auto;">' +
        '<h2 style="color:#FF6EC7; margin-top:0;">إعادة تعيين كلمة المرور</h2>' +
        '<p style="color:#B38BC7;">استلمنا طلباً لإعادة تعيين كلمة مرور حسابك بمنصة ألعاب أيمن. ' +
        'استخدم الرمز التالي لإكمال العملية:</p>' +
        '<p style="font-size:32px; font-weight:bold; letter-spacing:6px; text-align:center; ' +
        'background:#3A1A4D; padding:16px; border-radius:8px; margin:20px 0;">' + code + '</p>' +
        '<p style="color:#B38BC7; font-size:13px;">الرمز صالح لمدة 15 دقيقة فقط من وقت هذه الرسالة. ' +
        'لو ما طلبت إعادة تعيين كلمة المرور، تجاهل هذه الرسالة ببساطة — حسابك بأمان.</p>' +
        '</div>';

    try {
        var result = await client.emails.send({
            from: FROM_ADDRESS,
            to: toEmail,
            subject: 'رمز إعادة تعيين كلمة المرور — ألعاب أيمن',
            html: html
        });
        if (result && result.error) {
            logger.error('Email: خطأ من Resend API:', result.error.message || result.error);
            return { success: false, error: 'send_failed' };
        }
        return { success: true };
    } catch (err) {
        logger.error('Email: فشل إرسال إيميل استرجاع كلمة المرور:', err.message);
        return { success: false, error: 'send_failed' };
    }
}

module.exports = {
    sendPasswordResetEmail: sendPasswordResetEmail
};
