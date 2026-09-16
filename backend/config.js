/**
 * AGP BACKEND CONFIG — إعدادات عامة فقط، بدون أي أسرار مكتوبة مباشرة.
 * لا بيانات اعتماد لأي منصة هنا؛ كل قيمة افتراضية آمنة للتطوير المحلي.
 */

'use strict';

module.exports = {
    port: process.env.PORT ? Number(process.env.PORT) : 8787,

    // نطاقات WebSocket المسموحة — فارغة/محلية الآن، تُملأ بنطاق الإنتاج لاحقاً.
    allowedOrigins: [
        'http://localhost',
        'http://127.0.0.1'
    ],

    debug: process.env.NODE_ENV !== 'production',

    // ⚠️ لازم يُنشأ من Google Cloud Console — راجع README.md.
    googleClientId: process.env.GOOGLE_CLIENT_ID || '777683353907-hkemaaft5t7mktgtjvlf47ptuqk93qbg.apps.googleusercontent.com',

    // مفتاح Resend API لإيميل استرجاع كلمة المرور. فارغ = الميزة معطّلة بأمان.
    resendApiKey: process.env.RESEND_API_KEY || '',

    // بيانات اعتماد TikTok Login Kit (OAuth 2.0). Client Secret سري تماماً، بلا قيمة افتراضية.
    tiktokClientKey: process.env.TIKTOK_CLIENT_KEY || '',
    tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    tiktokRedirectUri: process.env.TIKTOK_REDIRECT_URI || 'https://project-testing-akds.onrender.com/api/auth/tiktok/oauth/callback',

    // ⚠️ دومين الموقع الفعلي (منفصل عن دومين هذا السيرفر) — لازم يكون مطلقاً
    // لبناء رابط إعادة التوجيه بنهاية تسجيل دخول تيك توك، وإلا يرجّع المستخدم لدومين السيرفر (404).
    frontendBaseUrl: process.env.FRONTEND_BASE_URL || 'https://aymngames.online',

    // ⚠️ مفتاح توقيع HMAC لحماية CSRF بحالة TikTok OAuth. القيمة الافتراضية
    // للتطوير المحلي فقط — يجب ضبط TIKTOK_STATE_SECRET بالإنتاج.
    tiktokStateSecret: process.env.TIKTOK_STATE_SECRET || 'dev-only-insecure-state-secret-change-me',

    // قيم مبدئية فقط، لا منطق تطبيق فعلي بعد (راجع utils/rate-limiter.js).
    rateLimits: {
        maxMessagesPerSecondPerConnection: 20
    },

    // ⚠️ الجلسات تُمرَّر عبر Authorization Bearer فقط (لا كوكيز)، فلا خطر
    // CSRF من قبول أي أصل — لذلك الافتراضي '*'. يمكن تضييقه عبر CORS_ORIGINS.
    corsAllowedOrigins: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
        : ['*']
};
