/**
 * VEYRO SERVER — الإعدادات (كلها من متغيرات البيئة بـRender، ولا سر مكتوب هنا).
 * سيرفر فيرو مستقل عن سيرفر الألعاب (backend/): له قرصه وقاعدة بياناته واتصاله
 * بتيك توك، فأي نشر لواحد ما يوقف الثاني. التفاصيل: docs/VEYRO_SERVER.md
 */

'use strict';

function list(v, def) {
    return v ? v.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : def;
}

module.exports = {
    port: process.env.PORT ? Number(process.env.PORT) : 8788,
    debug: process.env.NODE_ENV !== 'production',

    // مجلد البيانات (قاعدة البيانات + الفيديوهات): قرص Render الدائم لو موجود
    dataDir: process.env.VEYRO_DATA_DIR || '',

    // سيرفر الألعاب (الحسابات وتسجيل الدخول) — فيرو يتأكد من الحساب عنده ويحفظ النتيجة مؤقتاً
    coreApiUrl: (process.env.CORE_API_URL || 'https://project-testing-akds.onrender.com').replace(/\/+$/, ''),
    // سر مشترك مع سيرفر الألعاب لنقل بيانات فيرو القديمة (migrate/import-from-core.js)
    coreExportSecret: process.env.VEYRO_EXPORT_SECRET || '',

    // رابط الموقع (رجوع Streamlabs بعد الموافقة)
    frontendBaseUrl: process.env.FRONTEND_BASE_URL || 'https://aymngames.online',
    // رابط سيرفر فيرو نفسه (لرجوع OAuth)
    publicApiBaseUrl: (process.env.PUBLIC_API_BASE_URL || '').replace(/\/+$/, ''),

    // اتصال البث لشاشات فيرو المفتوحة بتطبيق البث (أي أداة بيانات، مو بس الصوت)
    screenAudioConnect: process.env.VEYRO_AUTO_CONNECT !== '0',
    // «الحساب التلقائي» بإحصائيات البث
    streamStatsWatcher: process.env.VEYRO_STATS_WATCHER !== '0',

    youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
    googleTtsApiKey: process.env.GOOGLE_TTS_API_KEY || '',
    streamlabsClientId: process.env.STREAMLABS_CLIENT_ID || '',
    streamlabsClientSecret: process.env.STREAMLABS_CLIENT_SECRET || '',
    // رجوع Streamlabs بعد الموافقة — على سيرفر فيرو نفسه (لازم يطابق اللي بإعدادات تطبيق Streamlabs)
    streamlabsRedirectUri: process.env.STREAMLABS_REDIRECT_URI || (process.env.PUBLIC_API_BASE_URL ? process.env.PUBLIC_API_BASE_URL.replace(/\/+$/, '') + '/api/streamlabs/oauth/callback' : ''),

    corsAllowedOrigins: list(process.env.CORS_ORIGINS, ['*'])
};
