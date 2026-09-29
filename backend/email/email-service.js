/**
 * AGP EMAIL SERVICE — إرسال إيميلات المعاملات عبر Resend: رمز إعادة تعيين
 * كلمة المرور (راجع auth-service.js requestPasswordReset)، وإشعارات تذاكر
 * الدعم (راجع backend/support/support-service.js).
 *
 * ⚠️ المفتاح (config.resendApiKey) يُقرَأ حصراً من RESEND_API_KEY. لو غير
 * مضبوط، sendPasswordResetEmail يرجع فشلاً واضحاً بدل رمي استثناء غامض.
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

/* -----------------------------------------------------------------------
 * إشعارات "الدعم والاقتراحات" — نفس العميل والمرسِل أعلاه. كل النصوص
 * القادمة من المستخدم تُهرَّب (escapeHtml) قبل إدراجها بالـHTML.
 * ----------------------------------------------------------------------- */

var SUPPORT_TYPE_LABELS = { suggestion: 'اقتراح', question: 'سؤال', bug: 'مشكلة تقنية' };

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function excerpt(text, maxLen) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

function supportEmailLayout(heading, rowsHtml, bodyExcerpt, linkUrl, linkLabel) {
    return '<div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; text-align: right; ' +
        'background:#120a1f; color:#FFFFFF; padding:28px; border-radius:12px; max-width:560px; margin:0 auto;">' +
        '<h2 style="color:#d878ff; margin-top:0;">' + heading + '</h2>' +
        rowsHtml +
        (bodyExcerpt ? '<p style="background:#241438; padding:14px; border-radius:8px; color:#e5dcf5; ' +
            'white-space:pre-wrap; line-height:1.8;">' + escapeHtml(bodyExcerpt) + '</p>' : '') +
        '<p style="margin:24px 0 0;"><a href="' + escapeHtml(linkUrl) + '" style="display:inline-block; ' +
        'background:#7c3aed; color:#fff; padding:12px 24px; border-radius:999px; text-decoration:none; font-weight:bold;">' +
        linkLabel + '</a></p>' +
        '</div>';
}

function supportRow(label, value) {
    return '<p style="margin:6px 0; color:#b9aed1;">' + label + ': <strong style="color:#fff;">' +
        escapeHtml(value) + '</strong></p>';
}

/** إرسال عام — لا يرمي أبداً، يرجع {success} ويسجّل أي فشل. */
async function sendSupportEmail(toEmail, subject, html) {
    var client = getClient();
    if (!client) {
        logger.error('Email: RESEND_API_KEY غير مضبوط — تعذّر إرسال إشعار الدعم.');
        return { success: false, error: 'email_not_configured' };
    }
    if (!toEmail) return { success: false, error: 'no_recipient' };
    try {
        var result = await client.emails.send({ from: FROM_ADDRESS, to: toEmail, subject: subject, html: html });
        if (result && result.error) {
            logger.error('Email: خطأ من Resend API (دعم):', result.error.message || result.error);
            return { success: false, error: 'send_failed' };
        }
        return { success: true };
    } catch (err) {
        logger.error('Email: فشل إرسال إشعار الدعم:', err.message);
        return { success: false, error: 'send_failed' };
    }
}

/**
 * إشعار الأدمن بتذكرة جديدة أو برد جديد من المستخدم.
 * @param {{kind: 'new_ticket'|'user_reply', toEmail: string, ticketId: number, type: string,
 *          title: string, userName: string, body: string, link: string}} p
 */
function sendSupportAdminNotification(p) {
    var isNew = p.kind === 'new_ticket';
    var typeLabel = SUPPORT_TYPE_LABELS[p.type] || p.type;
    var subject = (isNew ? '🎫 تذكرة جديدة #' : '💬 رد جديد على التذكرة #') + p.ticketId + ' — ' + excerpt(p.title, 60);
    var html = supportEmailLayout(
        isNew ? 'تذكرة دعم جديدة' : 'رد جديد من المستخدم',
        supportRow('رقم التذكرة', '#' + p.ticketId) +
        supportRow('النوع', typeLabel) +
        supportRow('العنوان', p.title) +
        supportRow('المستخدم', p.userName),
        excerpt(p.body, 400),
        p.link,
        'فتح التذكرة في لوحة الإدارة'
    );
    return sendSupportEmail(p.toEmail, subject, html);
}

/**
 * إشعار المستخدم برد الأدمن على تذكرته.
 * @param {{toEmail: string, ticketId: number, title: string, body: string, link: string}} p
 */
function sendSupportUserNotification(p) {
    var subject = 'رد جديد على تذكرتك #' + p.ticketId + ' — ألعاب أيمن';
    var html = supportEmailLayout(
        'رد فريق الدعم على تذكرتك',
        supportRow('رقم التذكرة', '#' + p.ticketId) +
        supportRow('العنوان', p.title),
        excerpt(p.body, 400),
        p.link,
        'عرض التذكرة'
    );
    return sendSupportEmail(p.toEmail, subject, html);
}

module.exports = {
    sendPasswordResetEmail: sendPasswordResetEmail,
    sendSupportAdminNotification: sendSupportAdminNotification,
    sendSupportUserNotification: sendSupportUserNotification
};
