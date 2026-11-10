/**
 * AGP STREAM OVERLAY — أوفرلي شاشة البث: يعرض تصميم المذيع فوق صفحات الموقع
 * (مكتبة الألعاب، اللوبي، الألعاب) ويجيب بياناته. التصميم نفسه يتسوّى من
 * صفحة «استوديو البث» (stream-studio.html + js/agp-stream-studio.js) اللي
 * تستخدم نفس هذا الملف للرسم والبيانات (window.AGPStreamOverlay).
 *
 * موجّه أساساً لمذيعين الآيباد اللي يبثون من تطبيق تيك توك بمشاركة الشاشة:
 * ما عندهم OBS، فالأوفرلي يترسم فوق الصفحة نفسها كطبقة ما تستقبل لمس
 * (pointer-events:none)، ويطلع بالبث مع اللعبة.
 *
 * - التصميم بـlocalStorage (STORE_KEY) — نفس الأصل لكل الصفحات، فيثبت لما
 *   المذيع يغيّر اللعبة، ويتحدّث فوراً لو تعدّل من الاستوديو بتبويب ثاني.
 * - قوالب شاشات (TEMPLATES): المواقع نِسب من إطار القالب (0..1 لمنتصف
 *   العنصر) وتنحفظ لكل قالب+اتجاه لحاله (pos['ipad-air-p'])، والأحجام نسبة
 *   من أصغر ضلع بالإطار. وقت البث الإطار ياخذ اتجاه الجهاز ويتوسّط الشاشة.
 * - الأدوات: نص (خطوط FONTS، تأثيرات TEXT_STYLES، حركة ANIMS)، توب (SECTIONS:
 *   المكبّسين/الداعمين/المتفاعلين/الشير بتصاميم DESIGNS)، هدف (goal) وعدّادات
 *   (counter) من إجماليات البث (METRICS).
 * - «وعاء الهدايا» (jar): صور آخر الهدايا تطيح فيه وتتكدّس، من
 *   GET /api/stream/recent-gifts?since=<seq> كل JAR_POLL_MS (طلب خفيف — الجديد
 *   بس). الهدايا اللي كانت موجودة قبل فتح الصفحة تطلع مستقرة بدون سقوط.
 * - البيانات من GET /api/stream/session-stats (backend/stats/live-session-stats.js)
 *   كل POLL_MS والصفحة ظاهرة، وبس الأقسام اللي التصميم يحتاجها. آخر نتيجة
 *   بـsessionStorage عشان ما تفضى العناصر لحظة الانتقال بين الصفحات.
 * - الحساب نفسه يصير بالسيرفر من اتصال البث. داخل اللعبة اتصال اللعبة يكفي؛
 *   بالصفحات اللي ما فيها لعبة متصلة (مكتبة الألعاب، الاستوديو، أو لعبة قبل
 *   ما تتصل) نفتح اتصال إحصائيات فقط (source 'overlay' بـws-server.js) بنفس
 *   الحساب المحفوظ من زر «اتصل بالبث» بالمكتبة (CONN_KEY)، ونقفله أول ما
 *   تتصل اللعبة — فيه دايماً اتصال واحد يحسب.
 * - طول الشاشة ثابت (100vh) بدل innerHeight عشان العناصر ما تتزحزح لما شريط
 *   Safari يختفي ويرجع مع التمرير.
 *
 * «شاشات البث» (overlay/index.html + overlay/studio.js): المذيع يسوي شاشات
 * لـOBS/TikTok LIVE Studio، ولكل شاشة رابط overlay/live.html?k=<رمز>:
 * - <html data-agp-overlay-link> = صفحة الرابط: التصميم من السيرفر
 *   (/api/public/screen، يتشيّك كل DESIGN_POLL_MS) بدل localStorage، والبيانات
 *   بالرمز بدون تسجيل دخول، وما يفتح اتصال بث — يقرأ اللي يحسبه اتصال الموقع.
 * - <html data-agp-studio data-agp-screens> = محرر الشاشات: زي الاستوديو بس
 *   الحالة من المحرر (setState) وما تنحفظ بـlocalStorage.
 * - أدوات خاصة فيها (تنرسم بأي مكان): «أليرتات» (alert — تنبيه هدية/متابعة/شير/
 *   دخول من /api/public/screen/events)، «أيقونة» (icon — SVG أو إيموجي)، «شكل» (shape).
 *
 * <html data-agp-studio> = صفحة الاستوديو: ما ترسم طبقة البث، بس توفّر الرسم
 * والبيانات للمعاينة. النصوص تنعرض بـtextContent فقط. مستقل عن
 * window.AymanGamesPlatform (زي AGPStreamStats) عشان يشتغل بأي صفحة.
 */
(function () {
    'use strict';

    // ملفات إطارات التوب (Veyro) جنب هذا الملف: js/ → assets/overlay-frames/
    var FRAMES_BASE = (function () {
        try { return new URL('../assets/overlay-frames/', (document.currentScript && document.currentScript.src) || location.href).href; } catch (e) { return '../assets/overlay-frames/'; }
    }());

    if (window.AGPStreamOverlay) return;

    var STORE_KEY = 'agp:stream-overlay';
    var STATS_CACHE_KEY = 'agp:stream-overlay:stats';
    var JAR_CACHE_KEY = 'agp:stream-overlay:jar';
    var JAR_POLL_MS = 3000;
    var JAR_CAP = 54;          // أقصى عدد صور بالوعاء (6 أعمدة × 9 صفوف)
    var JAR_COLS = 6;
    var JAR_G = 1.3;           // حجم صورة الهدية (em)
    var JAR_REPEAT_MAX = 10;   // هدية مكررة ×50 تطلع 10 صور بالكثير
    var CONN_KEY = 'agp:agp-stream-connection'; // نفس مفتاح زر «اتصل بالبث» بمكتبة الألعاب
    var BACKEND_WS_URL = 'wss://project-testing-akds.onrender.com';
    var LINK_CHECK_MS = 5000;
    var GAME_GRACE_MS = 15000; // اللعبة غير متصلة كذا متواصل → الأوفرلي يتصل بداله
    var POLL_MS = 15000;
    var Z = 2147483000;
    var STUDIO = document.documentElement.hasAttribute('data-agp-studio');
    var LINK = document.documentElement.hasAttribute('data-agp-overlay-link');
    var SCREENS = document.documentElement.hasAttribute('data-agp-screens');
    var EVENTS_POLL_MS = 2000;
    // نسخة رابط الشاشة: المحرر يعرف لو التطبيق فاتح نسخة قديمة (يحتاج تحديث المصدر)
    var LIVE_VERSION = '3'; // 3: تفريغ «لون الخلفية» (hue) + أشكال الصورة وستايل النص بأليرت الفيديو
    var LINK_KEY = LINK ? (new URLSearchParams(location.search).get('k') || '') : '';
    var DESIGN_POLL_MS = 5000;
    var FONT = '"IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,-apple-system,sans-serif';
    var COLORS = ['#ffffff', '#ffd54a', '#ff4d6d', '#4dd8ff', '#7cff6b', '#c58bff', '#111111'];
    // b = أثقل وزن متوفر بالخط (للخطوط اللي وزنها واحد = 400)
    var FONTS = [
        { key: 'plex', family: 'IBM Plex Sans Arabic', label: 'بلكس', b: 700 },
        { key: 'cairo', family: 'Cairo', label: 'القاهرة', b: 900 },
        { key: 'tajawal', family: 'Tajawal', label: 'تجوال', b: 900 },
        { key: 'almarai', family: 'Almarai', label: 'المراعي', b: 800 },
        { key: 'changa', family: 'Changa', label: 'تشانجا', b: 800 },
        { key: 'alexandria', family: 'Alexandria', label: 'الإسكندرية', b: 900 },
        { key: 'kufam', family: 'Kufam', label: 'كوفام', b: 900 },
        { key: 'notokufi', family: 'Noto Kufi Arabic', label: 'نوتو كوفي', b: 900 },
        { key: 'readex', family: 'Readex Pro', label: 'ريدكس', b: 700 },
        { key: 'mada', family: 'Mada', label: 'مدى', b: 900 },
        { key: 'baloo', family: 'Baloo Bhaijaan 2', label: 'بالو', b: 800 },
        { key: 'lemonada', family: 'Lemonada', label: 'ليمونادة', b: 700 },
        { key: 'marhey', family: 'Marhey', label: 'مرحي', b: 700 },
        { key: 'elmessiri', family: 'El Messiri', label: 'المسيري', b: 700 },
        { key: 'reemkufi', family: 'Reem Kufi', label: 'ريم كوفي', b: 700 },
        { key: 'lalezar', family: 'Lalezar', label: 'لاله زار', b: 400 },
        { key: 'rakkas', family: 'Rakkas', label: 'رقّاص', b: 400 },
        { key: 'jomhuria', family: 'Jomhuria', label: 'جمهورية', b: 400 },
        { key: 'blaka', family: 'Blaka', label: 'بلاكا', b: 400 },
        { key: 'katibeh', family: 'Katibeh', label: 'كاتبة', b: 400 },
        { key: 'vibes', family: 'Vibes', label: 'فايبز', b: 400 },
        { key: 'mirza', family: 'Mirza', label: 'ميرزا', b: 700 },
        { key: 'harmattan', family: 'Harmattan', label: 'هرمتان', b: 700 },
        { key: 'amiri', family: 'Amiri', label: 'أميري', b: 700 },
        { key: 'arefruqaa', family: 'Aref Ruqaa', label: 'رقعة', b: 700 },
        { key: 'gulzar', family: 'Gulzar', label: 'نستعليق', b: 400 }
    ];
    var TEXT_STYLES = [
        { key: 'outline', label: 'حدود' },
        { key: 'shadow', label: 'ظل' },
        { key: 'pill', label: 'خلفية' },
        { key: 'glass', label: 'زجاجي' },
        { key: 'neon', label: 'نيون' },
        { key: 'fire', label: 'نار' },
        { key: 'gradient', label: 'تدرّج' },
        { key: 'gold', label: 'ذهبي' },
        { key: 'rainbow', label: 'قوس قزح' },
        { key: '3d', label: 'ثلاثي الأبعاد' },
        { key: 'hollow', label: 'مفرّغ' },
        { key: 'plain', label: 'بدون' }
    ];
    // d = مدة الدورة بالسرعة العادية (ثواني)
    var ANIMS = [
        { key: 'none', label: 'بدون', d: 0 },
        { key: 'pulse', label: 'نبض', d: 1.4 },
        { key: 'heartbeat', label: 'نبضة قلب', d: 1.3 },
        { key: 'bounce', label: 'قفز', d: 1.1 },
        { key: 'float', label: 'طفو', d: 3 },
        { key: 'swing', label: 'تمايل', d: 2 },
        { key: 'shake', label: 'اهتزاز', d: 0.8 },
        { key: 'zoom', label: 'زووم', d: 2.4 },
        { key: 'blink', label: 'وميض', d: 1.2 },
        { key: 'glow', label: 'توهّج', d: 1.8 },
        { key: 'hue', label: 'تلوّن', d: 4 }
    ];
    var SPEEDS = [{ label: 'بطيء', value: 1.8 }, { label: 'عادي', value: 1 }, { label: 'سريع', value: 0.55 }];
    var DEFAULT_FONT = 'plex';
    // w×h بالوضع الأفقي (نقاط CSS)؛ العمودي = نفس الأبعاد مقلوبة
    var TEMPLATES = [
        { key: 'auto', label: 'شاشة جهازي', sub: 'يملأ الشاشة الحالية' },
        { key: 'ipad-air', label: 'آيباد Air / Pro 11 / 10.9', w: 1180, h: 820 },
        { key: 'ipad', label: 'آيباد 4:3 (Pro 12.9 والقديم)', w: 1024, h: 768 },
        { key: 'ipad-mini', label: 'آيباد mini', w: 1133, h: 744 },
        { key: 'phone', label: 'جوال', w: 844, h: 390 },
        { key: 'pc', label: 'كمبيوتر / OBS (16:9)', w: 1920, h: 1080 }
    ];
    var TOPS = [1, 3, 5];

    function fmt(n) { return (Number(n) || 0).toLocaleString('en-US'); }
    /** مبلغ دونيشن (دولار): $1,250 أو $12.50 — وعملة ثانية: «50 EUR». */
    function fmtMoney(v, currency) {
        var n = Number(v) || 0;
        var cents = Math.round(n * 100) % 100 !== 0;
        var s = n.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
        var c = String(currency || 'USD').toUpperCase();
        return c === 'USD' ? '$' + s : s + ' ' + c;
    }
    /** رقم قسم/مقياس: الدونيشن بالدولار، والباقي أرقام عادية. */
    function fmtKind(kind, v) { return kind === 'donors' || kind === 'donations' ? fmtMoney(v) : fmt(v); }
    /** رقم مختصر: 950 / 1.4K / 12K / 2.3M (إطار «الفراشات»). */
    function fmtShort(v) {
        var n = Number(v) || 0, a = Math.abs(n);
        var cut = function (x, u) { return (x >= 100 ? Math.floor(x) : Math.floor(x * 10) / 10).toString().replace(/\.0$/, '') + u; };
        if (a >= 1e9) return cut(n / 1e9, 'B');
        if (a >= 1e6) return cut(n / 1e6, 'M');
        if (a >= 1e3) return cut(n / 1e3, 'K');
        return String(Math.round(n));
    }

    // أقسام التوب (نفس أقسام live-session-stats.js)
    var SECTIONS = {
        likers: { label: 'المكبّسين', title: 'توب المكبّسين', icon: 'heart', value: function (r) { return fmt(r.count); } },
        gifters: { label: 'الداعمين', title: 'توب الداعمين', icon: 'diamond', value: function (r) { return fmt(r.diamonds); } },
        commenters: { label: 'المتفاعلين', title: 'أكثر المتفاعلين', icon: 'chat', value: function (r) { return fmt(r.count); } },
        sharers: { label: 'الشير', title: 'توب الشير', icon: 'share', value: function (r) { return fmt(r.count); } },
        // الدونيشن (Streamlabs — كريترز وغيره): من السيرفر بقسم donors، المبلغ بالدولار (r.amount)
        donors: { label: 'الدونيشن', title: 'أعلى الداعمين بالدونيشن', icon: 'dollar', value: function (r) { return fmtMoney(r.amount); } }
    };
    // مقاييس الهدف والعدّادات = totals بملخص البث
    var METRICS = {
        likes: { name: 'التكبيسات', unit: 'تكبيسة', icon: 'heart' },
        diamonds: { name: 'الماس', unit: 'ماسة', icon: 'diamond' },
        gifts: { name: 'الهدايا', unit: 'هدية', icon: 'gift' },
        follows: { name: 'المتابعين الجدد', unit: 'متابع جديد', icon: 'follow' },
        shares: { name: 'الشير', unit: 'شير', icon: 'share' },
        comments: { name: 'التعليقات', unit: 'تعليق', icon: 'chat' },
        peakViewers: { name: 'أعلى مشاهدة', unit: 'أعلى مشاهدة', icon: 'eye' },
        donations: { name: 'الدونيشن', unit: 'دولار', icon: 'dollar' }
    };
    var ICONS = {
        dollar: '<path d="M12 2a10 10 0 110 20 10 10 0 010-20zm.9 4.2h-1.8v1.4c-1.7.3-2.9 1.4-2.9 3 0 1.9 1.5 2.6 3.4 3.1 1.4.4 1.9.7 1.9 1.3 0 .6-.6 1-1.6 1-1.1 0-2.1-.4-2.9-1l-.9 1.6c.8.6 1.9 1 3 1.1v1.4h1.8v-1.4c1.8-.3 3-1.4 3-3.1 0-1.9-1.4-2.6-3.5-3.2-1.3-.4-1.8-.6-1.8-1.2 0-.5.5-.9 1.4-.9.9 0 1.8.3 2.5.8l.9-1.6c-.7-.5-1.6-.8-2.5-.9z"/>',
        heart: '<path d="M12 21s-7.6-4.7-9.7-9.3C.8 8.3 2.9 4.5 6.6 4.5c2.1 0 3.7 1.2 4.4 2.5.7-1.3 2.3-2.5 4.4-2.5 3.7 0 5.8 3.8 4.3 7.2C19.6 16.3 12 21 12 21z"/>',
        diamond: '<path d="M7 3h10l5 6.5L12 21 2 9.5z"/>',
        gift: '<path d="M3 8h18v4H3zM5 12h14v9H5z"/><path d="M12 8v13M12 8c-1.5-3-5-4-5.5-1.8C6 8 9 8 12 8c3 0 6 0 5.5-1.8C17 4 13.5 5 12 8z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
        follow: '<circle cx="9" cy="8" r="4"/><path d="M1.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5z"/><path d="M19 7v6M16 10h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
        share: '<path d="M13 4l9 7.5-9 7.5v-4.5C7 14.5 4 16.5 2 20c.5-6 3.5-10.5 11-11.5z"/>',
        chat: '<path d="M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2H10l-5 4v-4H4a2 2 0 01-2-2V6a2 2 0 012-2z"/>',
        eye: '<path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8z"/>'
    };
    var CROWN = '<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M2 14h20l1.5-11-6 4.5L12 0 6.5 7.5.5 3z" fill="currentColor"/></svg>';
    // «العرش»: تاج ذهبي بجواهر، وأيقونات الأرقام بتدرّج (قلب ينبض، ماسة)
    var THRONE_ICONS = {
        // قلب لامع ثلاثي الأبعاد (لمعة + انعكاس + نجمة صغيرة)
        likers: '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="agp-so-hg" cx="35%" cy="28%" r="85%"><stop offset="0" stop-color="#ffc2d9"/><stop offset=".42" stop-color="#ff4d8d"/><stop offset="1" stop-color="#b80f4a"/></radialGradient>' +
            '<linearGradient id="agp-so-hs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
            '<path d="M12 21.2C6.2 17.3 2 13.7 2 8.9 2 5.9 4.3 3.6 7.2 3.6c1.9 0 3.6 1 4.8 2.6 1.2-1.6 2.9-2.6 4.8-2.6 2.9 0 5.2 2.3 5.2 5.3 0 4.8-4.2 8.4-10 12.3z" fill="url(#agp-so-hg)" stroke="#8f0d3c" stroke-width=".45"/>' +
            '<path d="M12 19.6c4.6-3.2 8-6.2 8.3-9.6" stroke="#7a0632" stroke-opacity=".35" stroke-width="1.2" stroke-linecap="round" fill="none"/>' +
            '<path d="M4.6 7.4c.8-1.6 2.6-2.2 4.1-1.4" stroke="url(#agp-so-hs)" stroke-width="1.5" stroke-linecap="round" fill="none"/>' +
            '<ellipse cx="6.6" cy="10" rx="1.3" ry=".8" fill="#fff" opacity=".5" transform="rotate(-35 6.6 10)"/>' +
            '<path d="M18.9 3.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="#fff"/></svg>',
        // الدونيشن: عملة دولار ذهبية لامعة
        donors: '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="agp-so-ug" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff6c4"/><stop offset=".5" stop-color="#ffcf3a"/><stop offset="1" stop-color="#c98a07"/></radialGradient></defs><circle cx="12" cy="12" r="10.5" fill="url(#agp-so-ug)" stroke="#a86f05" stroke-width=".6"/><circle cx="12" cy="12" r="8.2" fill="none" stroke="#fff3b0" stroke-opacity=".55" stroke-width=".7"/><path d="M12.8 6.4h-1.6v1.2c-1.5.3-2.5 1.2-2.5 2.6 0 1.7 1.3 2.3 3 2.7 1.2.3 1.6.6 1.6 1.1 0 .5-.5.9-1.4.9-1 0-1.8-.4-2.5-.9l-.8 1.4c.7.5 1.6.9 2.6 1v1.2h1.6v-1.2c1.6-.3 2.6-1.2 2.6-2.7 0-1.7-1.2-2.3-3-2.8-1.1-.3-1.6-.5-1.6-1 0-.4.4-.8 1.2-.8.8 0 1.5.3 2.1.7l.8-1.4c-.6-.4-1.3-.7-2.1-.8z" fill="#8a5a00"/></svg>',
        gifters: '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="agp-so-dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9f4ff"/><stop offset="1" stop-color="#2fa6ff"/></linearGradient></defs><path d="M7 3h10l5 6.5L12 21 2 9.5z" fill="url(#agp-so-dg)"/><path d="M2 9.5h20M7 3l3 6.5L12 21l2-11.5L17 3" stroke="#fff" stroke-width="1" fill="none" opacity=".6"/></svg>'
    };
    // فراشة «جناح الملاك»: جناحين يرفرفون (wl/wr)
    var BUTTERFLY = '<svg viewBox="0 0 40 40" aria-hidden="true"><defs><radialGradient id="agp-so-bw" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#a6e6ff"/><stop offset="1" stop-color="#2f8cff"/></radialGradient></defs>' +
        '<g class="wl"><path d="M20 20C14 6 3 5 2 12c-1 6 7 9 18 8z" fill="url(#agp-so-bw)"/><path d="M20 21c-9 0-15 4-13 9 2 5 9 2 13-9z" fill="url(#agp-so-bw)" opacity=".85"/></g>' +
        '<g class="wr"><path d="M20 20c6-14 17-15 18-8 1 6-7 9-18 8z" fill="url(#agp-so-bw)"/><path d="M20 21c9 0 15 4 13 9-2 5-9 2-13-9z" fill="url(#agp-so-bw)" opacity=".85"/></g>' +
        '<rect x="19.2" y="13" width="1.6" height="15" rx=".8" fill="#e9f9ff"/></svg>';
    // بيانات تجريبية للمعاينة بالاستوديو لما ما فيه بث
    var SAMPLE_ROWS = [
        { name: 'الأول', count: 12400, diamonds: 5200, amount: 250 }, { name: 'الثاني', count: 8100, diamonds: 3100, amount: 120 },
        { name: 'الثالث', count: 4600, diamonds: 1450, amount: 75 }, { name: 'الرابع', count: 2100, diamonds: 600 }, { name: 'الخامس', count: 900, diamonds: 210 },
        { name: 'السادس', count: 760, diamonds: 150 }, { name: 'السابع', count: 540, diamonds: 96 }, { name: 'الثامن', count: 410, diamonds: 60 },
        { name: 'التاسع', count: 300, diamonds: 32 }, { name: 'العاشر', count: 180, diamonds: 15 }
    ];
    // صور هدايا تجريبية للمعاينة (مرسومة بالكود)
    var SAMPLE_GIFT_SVGS = [
        '<circle cx="20" cy="15" r="9" fill="#e53950"/><circle cx="15" cy="13" r="5" fill="#ff6b81"/><circle cx="25" cy="13" r="5" fill="#ff6b81"/><path d="M20 24v13" stroke="#3aa556" stroke-width="3"/><path d="M20 31c-5-1-7-4-7-6 4 0 6 2 7 6z" fill="#3aa556"/>',
        '<path d="M20 35S5 26 5 15a8 8 0 0115-4 8 8 0 0115 4c0 11-15 20-15 20z" fill="#ff4d8d"/>',
        '<path d="M20 3l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#ffd54a"/>',
        '<path d="M5 30h30l3-18-10 8-8-14-8 14-10-8z" fill="#ffc83d"/><rect x="5" y="31" width="30" height="5" rx="2" fill="#e0a21b"/>',
        '<path d="M10 6h20l8 10-18 20L2 16z" fill="#4dd8ff"/><path d="M10 6l4 10h12l4-10M2 16h36" stroke="#b8f1ff" stroke-width="1.5" fill="none"/>',
        '<rect x="6" y="16" width="28" height="20" rx="3" fill="#9b5cf6"/><rect x="4" y="11" width="32" height="7" rx="2" fill="#b78bff"/><path d="M20 11v25" stroke="#ffd54a" stroke-width="4"/><path d="M20 11c-4-7-11-6-9-1 1 2 5 1 9 1 4 0 8 1 9-1 2-5-5-6-9 1z" fill="#ffd54a"/>'
    ].map(function (svg) { return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' + svg + '</svg>'); });
    var SAMPLE_TOTALS = { likes: 4320, diamonds: 860, gifts: 57, follows: 23, shares: 12, comments: 340, peakViewers: 185, donations: 340, lastDonation: { name: 'أبو فهد', amount: 25, currency: 'USD', message: 'كفو والله، استمر 💜' } };

    /* ---------------- الحالة والتخزين ---------------- */

    function defaults() { return { v: 3, enabled: true, template: 'auto', editOrient: null, preview: 'grid', items: [] }; }

    function load() {
        if (LINK) return Object.assign(defaults(), { enabled: false }); // يوصل من السيرفر
        if (SCREENS) return Object.assign(defaults(), { template: 'pc', editOrient: 'l' }); // المحرر يحط الشاشة
        try { return migrate(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')) || defaults(); }
        catch (e) { return defaults(); } // تخزين غير متاح أو تالف
    }

    /** تحويل التصاميم القديمة لآخر نسخة — null لو مو تصميم. */
    function migrate(s) {
        if (s && Array.isArray(s.items)) {
            // v1: المواقع كانت لكل اتجاه بس (pos.l / pos.p) = قالب «شاشة جهازي»
            if (!s.v || s.v < 2) {
                s.items.forEach(function (it) {
                    var pos = it.pos || {};
                    it.pos = {};
                    if (pos.l) it.pos['auto-l'] = pos.l;
                    if (pos.p) it.pos['auto-p'] = pos.p;
                });
                if (!s.template && s.items.length) s.template = 'auto';
            }
            // v2: «توب المكبّسين» كان نوع خاص (likers) = توب بقسم المكبّسين
            if (s.v < 3) {
                s.items.forEach(function (it) { if (it.type === 'likers') { it.type = 'top'; it.section = 'likers'; } });
                delete s.launcher;
                s.v = 3;
            }
            if (!s.template) s.template = 'auto';
            return s;
        }
        return null;
    }

    function save() {
        if (LINK || SCREENS) return; // الرابط من السيرفر، والمحرر يحفظ للسيرفر بنفسه
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }

    var state = load();
    var loadedFonts = {};

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    /* طول الشاشة الثابت: بـSafari (آيباد/جوال) شريط العنوان يختفي ويرجع مع
     * التمرير فيتغيّر innerHeight، ولو حسبنا عليه تتزحزح العناصر مع كل
     * تمرير. 100vh هناك = الطول الكامل وما يتغيّر، فنقيسه بعنصر ثابت. */
    var probe = null;
    function viewW() { return window.innerWidth; }
    function viewH() {
        if (!probe && document.body) {
            probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;visibility:hidden;pointer-events:none';
            document.body.appendChild(probe);
        }
        return (probe && probe.offsetHeight) || window.innerHeight;
    }
    function orient() { return viewW() >= viewH() ? 'l' : 'p'; }

    function tpl(key) {
        for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].key === key) return TEMPLATES[i];
        return TEMPLATES[0];
    }

    /** مفتاح مواقع القالب+الاتجاه. */
    function keyFor(templateKey, o) { return tpl(templateKey).key + '-' + o; }

    /** إطار بنسبة القالب داخل مساحة W×H (contain + بالوسط). auto = المساحة كلها. */
    function frameIn(templateKey, o, W, H) {
        var t = tpl(templateKey);
        if (!t.w) return { x: 0, y: 0, w: W, h: H };
        var r = o === 'l' ? t.w / t.h : t.h / t.w;
        var w = W, h = W / r;
        if (h > H) { h = H; w = H * r; }
        return { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h };
    }

    /** موقع العنصر بالقالب — أول مرة ينسخ من نفس القالب بالاتجاه الثاني،
     *  وإلا من أي قالب بنفس الاتجاه، وإلا أي موقع محفوظ. */
    function posOf(it, key) {
        it.pos = it.pos || {};
        if (!it.pos[key]) {
            var keys = Object.keys(it.pos);
            var o = key.slice(-1), base = key.slice(0, -1);
            var src = it.pos[base + (o === 'l' ? 'p' : 'l')] ||
                it.pos[keys.filter(function (k) { return k.slice(-1) === o; })[0]] ||
                it.pos[keys[0]];
            it.pos[key] = src ? { x: src.x, y: src.y } : { x: 0.5, y: 0.5 };
        }
        return it.pos[key];
    }

    /** يحط العنصر بموقعه داخل الإطار F، ويزحزحه بصرياً بس لو طلع جزء منه برّاه. */
    function place(n, p, F) {
        var W = F.w, H = F.h;
        var hw = n.offsetWidth / 2 + 4, hh = n.offsetHeight / 2 + 4;
        n.style.left = (hw * 2 >= W ? W / 2 : clamp(p.x * W, hw, W - hw)) + 'px';
        n.style.top = (hh * 2 >= H ? H / 2 : clamp(p.y * H, hh, H - hh)) + 'px';
    }

    /* ---------------- الخطوط ---------------- */

    function fontOf(key) {
        for (var i = 0; i < FONTS.length; i++) if (FONTS[i].key === key) return FONTS[i];
        return FONTS[0];
    }

    /** يحمّل الخط من Google Fonts مرة وحدة (رابط لكل خط عشان خط غلط ما يكسر الباقي). */
    function loadFont(f) {
        if (loadedFonts[f.key]) return;
        loadedFonts[f.key] = true;
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=' + f.family.replace(/ /g, '+') +
            (f.b > 400 ? ':wght@400;' + f.b : '') + '&display=swap';
        document.head.appendChild(l);
    }

    function fontStack(f) { return '"' + f.family + '",' + FONT; }

    /* ---------------- البيانات ---------------- */

    var stats = loadStatsCache();
    var pollTimer = null;
    var inflight = false;
    var lastNeeds = null;
    var listeners = { stats: [], link: [] };

    function notify(kind) { listeners[kind].forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } }); }

    function loadStatsCache() {
        try {
            var c = JSON.parse(sessionStorage.getItem(STATS_CACHE_KEY) || 'null');
            if (c && c.sections) return { status: 'ok', sections: c.sections, totals: c.totals || null };
        } catch (e) { /* ignore */ }
        return { status: 'idle', sections: {}, totals: null };
    }

    function apiBase() { return (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com'; }
    function token() {
        try { return (window.AGPAuth && window.AGPAuth.getToken && window.AGPAuth.getToken()) || localStorage.getItem('agp_auth_token'); } catch (e) { return null; }
    }

    /** العناصر اللي تنرسم: بالاستوديو كلها، وبالبث غير المخفية. */
    function activeItems() { return state.items.filter(function (it) { return STUDIO || !it.hidden; }); }

    /** الأقسام اللي التصميم يحتاجها كـ"likers:3,gifters:5" — أو null لو ما يحتاج بيانات. */
    function needs() {
        var secs = {}, totals = false;
        activeItems().forEach(function (it) {
            if (isTopLive(it)) throneSecs(it).forEach(function (k) { secs[k] = Math.max(secs[k] || 0, liveCount(it)); });
            else if (it.type === 'top' && SECTIONS[it.section]) secs[it.section] = Math.max(secs[it.section] || 0, Number(it.top) || 3);
            else if (it.type === 'goal' || it.type === 'counter' || it.type === 'lastdonation') totals = true;
        });
        var keys = Object.keys(secs).sort();
        if (!keys.length && !totals) return null;
        // الإجماليات ترجع مع أي طلب؛ likers:0 = بدون قوائم
        return keys.length ? keys.map(function (k) { return k + ':' + secs[k]; }).join(',') : 'likers:0';
    }

    function hasJar() { return activeItems().some(function (it) { return it.type === 'jar'; }); }

    function dataWanted() { return (Boolean(needs()) || hasJar()) && (STUDIO || state.enabled); }

    function fetchStats() {
        var q = needs();
        if (!q || inflight || document.visibilityState === 'hidden') return;
        var t = LINK ? null : token();
        if (!t && !LINK) { stats.status = 'login'; notify('stats'); return; }
        inflight = true;
        lastNeeds = q;
        fetch(LINK ? apiBase() + '/api/public/screen/stats?k=' + encodeURIComponent(LINK_KEY) + '&sections=' + encodeURIComponent(q)
            : apiBase() + '/api/stream/session-stats?sections=' + encodeURIComponent(q), LINK ? undefined : { headers: { 'Authorization': 'Bearer ' + t } })
            .then(function (res) { return res.json(); })
            .then(function (d) {
                if (!d || !d.success) {
                    stats.status = d && d.error === 'tiktok_not_linked' ? 'tiktok' : 'error';
                    return;
                }
                stats.status = 'ok';
                stats.sections = (d.stats && d.stats.sections) || {};
                stats.totals = (d.stats && d.stats.totals) || null;
                try { sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ sections: stats.sections, totals: stats.totals })); } catch (e) { /* ignore */ }
            })
            .catch(function () { stats.status = 'error'; }) // نخلي آخر بيانات ظاهرة
            .then(function () { inflight = false; notify('stats'); });
    }

    function syncPolling() {
        var want = dataWanted();
        if (want && !pollTimer) {
            fetchStats();
            pollTimer = setInterval(fetchStats, POLL_MS);
        } else if (!want && pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        } else if (want && needs() !== lastNeeds) {
            fetchStats(); // أداة جديدة تحتاج قسم ما طلبناه
        }
    }

    /* ---------------- وعاء الهدايا: البيانات ---------------- */

    // icons = صورة لكل هدية (المكررة تتفرّد لين JAR_REPEAT_MAX)، الأقدم أول
    var jar = loadJarCache();
    var jarTimer = null;
    var jarInflight = false;
    var jarDemo = [];       // سقوط تجريبي بالاستوديو فقط (ما ينحفظ)
    var jarNodes = [];      // عناصر الوعاء المرسومة حالياً (طبقة البث أو معاينة الاستوديو)

    function loadJarCache() {
        try {
            var c = JSON.parse(sessionStorage.getItem(JAR_CACHE_KEY) || 'null');
            if (c && Array.isArray(c.icons)) return { sid: c.sid || 0, seq: Number(c.seq) || 0, icons: c.icons, totals: c.totals || null };
        } catch (e) { /* ignore */ }
        return { sid: 0, seq: 0, icons: [], totals: null };
    }

    function https(u) { return typeof u === 'string' && /^https:\/\//.test(u) ? u : null; }

    /** رابط السيرفر لصورة الهدية (مخزّنة عنده) — لو الرابط المباشر من تيك توك ما فتح. */
    function mediaUrl(kind, id) { return id ? apiBase() + '/api/stream/media?k=' + kind + '&id=' + encodeURIComponent(id) : null; }

    /** صورة تحاول الرابط المباشر، وبعده نسخة السيرفر، وبعدها onFail. */
    function img2(direct, backup, cls, onFail) {
        var img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.referrerPolicy = 'no-referrer';
        if (cls) img.className = cls;
        var tried = false;
        img.onerror = function () {
            if (!tried && backup && img.src !== backup) { tried = true; img.src = backup; return; }
            img.onerror = null;
            onFail(img);
        };
        img.src = direct || backup;
        return img;
    }

    function expandGifts(gifts) {
        var out = [];
        gifts.forEach(function (g) {
            var n = Math.min(JAR_REPEAT_MAX, Math.max(1, Number(g.count) || 1));
            for (var j = 0; j < n; j++) {
                out.push({
                    k: g.seq + '-' + j, name: String(g.name || ''),
                    img: https(g.img), giftId: g.giftId || null
                });
            }
        });
        return out;
    }

    function fetchJar() {
        if (jarInflight || document.visibilityState === 'hidden') return;
        var t = LINK ? null : token();
        if (!t && !LINK) return;
        jarInflight = true;
        var since = jar.sid ? jar.seq : 0;
        fetch(LINK ? apiBase() + '/api/public/screen/gifts?k=' + encodeURIComponent(LINK_KEY) + '&since=' + since
            : apiBase() + '/api/stream/recent-gifts?since=' + since, LINK ? undefined : { headers: { 'Authorization': 'Bearer ' + t } })
            .then(function (res) { return res.json(); })
            .then(function (d) {
                if (!d || !d.success) return;
                var fresh = [];
                if (d.sid !== jar.sid) {
                    // أول مرة أو بث جديد: اللي موجود يطلع مستقر بدون سقوط
                    jar.icons = expandGifts(d.gifts || []);
                } else {
                    fresh = expandGifts(d.gifts || []);
                    jar.icons = jar.icons.concat(fresh);
                }
                if (jar.icons.length > JAR_CAP) jar.icons = jar.icons.slice(jar.icons.length - JAR_CAP);
                jar.sid = d.sid;
                jar.seq = Number(d.seq) || 0;
                jar.totals = d.totals || null;
                try { sessionStorage.setItem(JAR_CACHE_KEY, JSON.stringify(jar)); } catch (e) { /* ignore */ }
                paintJars(fresh.map(function (x) { return x.k; }));
            })
            .catch(function () { /* نحاول بالدورة الجاية */ })
            .then(function () { jarInflight = false; });
    }

    function syncJarPolling() {
        var want = hasJar() && (STUDIO || state.enabled);
        if (want && !jarTimer) {
            fetchJar();
            jarTimer = setInterval(fetchJar, JAR_POLL_MS);
        } else if (!want && jarTimer) {
            clearInterval(jarTimer);
            jarTimer = null;
        }
    }

    /* ---------------- اتصال الإحصائيات (بدون لعبة متصلة) ---------------- */

    var link = { ws: null, state: 'off', msg: '', retry: 0, timer: null, username: null, stopFor: null, chat: false };
    var gameDownSince = null;

    function savedConn() {
        try {
            var d = JSON.parse(localStorage.getItem(CONN_KEY) || 'null');
            return d && typeof d.username === 'string' && d.username ? d : null;
        } catch (e) { return null; }
    }

    /** نفس اليوزر لو اتصل من جديد من المكتبة يتغيّر connectedAt — فيرجع يحاول. */
    function connId(c) { return c.username + '|' + (c.connectedAt || ''); }

    function gameConnector() {
        var A = window.AymanGamesPlatform;
        return (A && A.services && A.services.TikTokService && A.streamConnector) ? A.streamConnector : null;
    }

    function gameConnected() {
        var sc = gameConnector();
        return Boolean(sc && sc.getStatus('tiktok') === 'connected');
    }

    // صفحة لعبة (مو صفحة دخول اللاعبين) — /games/<id>/ أو /discord-games/<id>/
    var GAME_PAGE = /\/(?:discord-)?games\/[a-z0-9-]+\//i.test(location.pathname) && !/\/join\.html$/i.test(location.pathname);

    /** صفحة لعبة ما فيها اتصال تيك توك خاص (حفلة الميلاد، محطة سهيل، المافيا،
     * من الأمبوستر…): نفتح الاتصال حتى لو التصميم ما يحتاج بيانات، عشان
     * الستريمر يظهر بـ«البثوث الشغّالة» (الأدمن وبطاقات المكتبة). */
    function presenceWanted() { return GAME_PAGE && !STUDIO && !gameConnector(); }

    /**
     * «التحكم بالشات» بمكتبة الألعاب (js/agp-remote-control.js): المكتبة ما فيها
     * اتصال لعبة، فنفس اتصال الإحصائيات يطلب نصوص التعليقات (payload.chat)
     * ويمررها كحدث 'agp:overlay-comment' عشان أوامر المتحكم توصل.
     */
    function chatWanted() {
        var RC = window.AymanGamesPlatform && window.AymanGamesPlatform.remoteControl;
        return !LINK && !STUDIO && !!(RC && typeof RC.wantsLibraryChat === 'function' && RC.wantsLibraryChat());
    }

    function linkWanted() {
        if (LINK) return false; // رابط OBS يقرأ بس — الحساب من اتصال الموقع
        var c = savedConn();
        if ((!dataWanted() && !presenceWanted() && !chatWanted()) || !token() || !c) return false;
        if (link.stopFor === connId(c)) return false; // رُفض أو انتهى البث — نستنى اتصال جديد من المكتبة
        if (gameConnected()) { gameDownSince = null; return false; }
        if (gameConnector()) {
            // اللعبة تحاول تتصل (أو تعيد المحاولة بعد حد التوقيع): اتصال ثاني من
            // الأوفرلي ينافسها على نفس حد توقيع EulerStream ويأخّر اتصالها هي —
            // واتصال اللعبة نفسه يغذّي إحصائيات البث أول ما يتصل.
            var gs = gameConnector().getStatus('tiktok');
            if (gs === 'connecting' || gs === 'error') { gameDownSince = null; return false; }
            // صفحة لعبة: نعطيها مهلة تتصل (أو ترجع تتصل) قبل ما نفتح اتصال ثاني
            if (!gameDownSince) gameDownSince = Date.now();
            if (Date.now() - gameDownSince < GAME_GRACE_MS) return link.ws !== null;
        }
        return true;
    }

    function closeLink() {
        if (link.timer) { clearTimeout(link.timer); link.timer = null; }
        if (link.ws) { var ws = link.ws; link.ws = null; try { ws.close(); } catch (e) { /* ignore */ } }
        link.state = 'off';
    }

    function scheduleLink() {
        if (link.timer) return;
        var d = Math.min(5000 * Math.pow(2, link.retry), 60000);
        link.retry++;
        link.timer = setTimeout(function () { link.timer = null; syncLink(); }, d);
    }

    function openLink(c) {
        var ws;
        try { ws = new WebSocket(BACKEND_WS_URL); } catch (e) { link.state = 'error'; scheduleLink(); return; }
        link.ws = ws;
        link.username = c.username;
        link.chat = chatWanted();
        link.state = 'connecting';
        ws.onopen = function () {
            ws.send(JSON.stringify({
                type: 'connect',
                payload: { platform: 'tiktok', username: c.username, followersOnly: false, source: 'overlay', chat: link.chat, page: location.pathname, authToken: token() },
                timestamp: Date.now()
            }));
        };
        ws.onmessage = function (e) {
            var env;
            try { env = JSON.parse(e.data); } catch (err) { return; }
            if (env && env.type === 'comment' && env.payload && link.ws === ws) {
                try { window.dispatchEvent(new CustomEvent('agp:overlay-comment', { detail: env.payload })); } catch (err) { /* ignore */ }
                return;
            }
            if (!env || env.type !== 'status' || !env.payload || link.ws !== ws) return;
            var st = env.payload.status, reason = env.payload.reason;
            if (st === 'connected') {
                link.state = 'connected';
                link.retry = 0;
                setTimeout(fetchStats, 2500);
            } else if (st === 'error' || st === 'disconnected') {
                // reason = منع (حساب غير مربوط/مختلف) أو انتهاء البث: ما نعيد المحاولة لنفس الاتصال
                // rate_limited مؤقت (حد التوقيع) — مو منع، نعيد المحاولة عادي
                var denied = reason && reason !== 'rate_limited';
                link.state = reason === 'stream_ended' ? 'ended' : (denied ? 'denied' : 'error');
                link.msg = env.payload.message || '';
                if (denied) link.stopFor = connId(c);
                try { ws.close(); } catch (err) { /* ignore */ }
            } else {
                link.state = 'connecting';
            }
            notify('link');
        };
        ws.onclose = function () {
            if (link.ws !== ws) return;
            link.ws = null;
            if (link.state === 'connected' || link.state === 'connecting') link.state = 'error';
            if (linkWanted()) scheduleLink();
            notify('link');
        };
    }

    function syncLink() {
        var c = savedConn();
        if (c && link.stopFor && link.stopFor !== connId(c)) link.stopFor = null;
        var want = linkWanted();
        if (want && link.ws && (link.username !== c.username || link.chat !== chatWanted())) closeLink();
        if (want && !link.ws && !link.timer) openLink(c);
        else if (!want && (link.ws || link.timer)) closeLink();
        notify('link');
    }

    function linkOk() { return gameConnected() || link.state === 'connected'; }

    /** حالة حساب البيانات بكلمات للمذيع. */
    function linkText() {
        if (!token()) return 'سجّل دخول بحسابك عشان تنحسب البيانات';
        if (stats.status === 'tiktok') return 'اربط حساب تيك توك بحسابك أولاً (من صفحة حسابي)';
        if (!savedConn()) return 'اضغط «اتصل بالبث» بمكتبة الألعاب عشان تنحسب البيانات';
        if (gameConnected()) return 'متصل بالبث من اللعبة — البيانات تنحسب';
        if (link.state === 'connected') return 'متصل بالبث — البيانات تنحسب';
        if (link.state === 'denied') return link.msg || 'الاتصال بالبث مرفوض';
        if (link.state === 'ended') return 'البث انتهى — اتصل من جديد من مكتبة الألعاب';
        if (link.state === 'error') return 'انقطع الاتصال بالبث — نعيد المحاولة…';
        if (!needs() && !hasJar()) return 'أضف أداة بيانات (توب، هدف، عدّاد، وعاء) عشان نتصل بالبث';
        return 'جاري الاتصال بالبث…';
    }

    /* ---------------- رسم الأدوات ---------------- */

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    function icon(name) {
        var s = el('span', 'agp-so-ic');
        s.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
        return s;
    }

    /** صورة الشخص بحلقة لون مركزه (أو أول حرف من اسمه). */
    function avatar(r) {
        var wrap = el('span', 'agp-so-av');
        if (typeof r.avatar === 'string' && /^data:image\//.test(r.avatar)) {
            var img = document.createElement('img');
            img.src = r.avatar;
            img.alt = '';
            img.draggable = false;
            wrap.appendChild(img);
        } else {
            wrap.appendChild(el('span', 'agp-so-av-i', String(r.name || r.username || '?').charAt(0)));
        }
        return wrap;
    }

    function rkClass(i) { return ' rk' + (i < 3 ? i + 1 : 'n'); }
    function nameOf(r) { return r.name || r.username || ''; }

    function makeTop(sec) {
        var meta = SECTIONS[sec] || SECTIONS.likers;
        function countEl(r) {
            var c = el('span', 'agp-so-count');
            c.appendChild(el('span', null, meta.value(r)));
            c.appendChild(icon(meta.icon));
            return c;
        }
        function podium(rows) {
            var box = el('div', 'agp-so-podium');
            // RTL: أول عنصر يمين — الثاني يمين والأول بالوسط والثالث يسار
            [1, 0, 2].forEach(function (i) {
                var r = rows[i];
                if (!r) return;
                var col = el('div', 'agp-so-pcol' + rkClass(i));
                if (i === 0) { var c = el('span', 'agp-so-crown'); c.innerHTML = CROWN; col.appendChild(c); }
                col.appendChild(avatar(r));
                col.appendChild(el('span', 'agp-so-name', nameOf(r)));
                col.appendChild(countEl(r));
                col.appendChild(el('span', 'agp-so-step', String(i + 1)));
                box.appendChild(col);
            });
            var frag = document.createDocumentFragment();
            frag.appendChild(box);
            if (rows.length > 3) frag.appendChild(medals(rows.slice(3), 3));
            return frag;
        }
        function medals(rows, offset) {
            var box = el('div', 'agp-so-medals');
            rows.forEach(function (r, k) {
                var i = k + (offset || 0);
                var row = el('div', 'agp-so-mrow' + rkClass(i));
                row.appendChild(el('span', 'agp-so-medal', String(i + 1)));
                row.appendChild(avatar(r));
                row.appendChild(el('span', 'agp-so-name', nameOf(r)));
                row.appendChild(countEl(r));
                box.appendChild(row);
            });
            return box;
        }
        function cards(rows) {
            var box = el('div', 'agp-so-cards');
            rows.forEach(function (r, i) {
                var c = el('div', 'agp-so-card' + rkClass(i));
                var a = avatar(r);
                a.appendChild(el('span', 'agp-so-badge', String(i + 1)));
                c.appendChild(a);
                c.appendChild(el('span', 'agp-so-name', nameOf(r)));
                c.appendChild(countEl(r));
                box.appendChild(c);
            });
            return box;
        }
        function minimal(rows) {
            var box = el('div', 'agp-so-minimal');
            rows.forEach(function (r, i) {
                var row = el('div', 'agp-so-nrow' + rkClass(i));
                row.appendChild(el('span', 'agp-so-medal', String(i + 1)));
                row.appendChild(el('span', 'agp-so-name', nameOf(r)));
                row.appendChild(countEl(r));
                box.appendChild(row);
            });
            return box;
        }
        return { podium: podium, medals: medals, cards: cards, minimal: minimal };
    }

    /* ---------------- «العرش» (Veyro) ----------------
     * الثلاثة الأوائل: الأول بالوسط أكبر، الثاني يمين، الثالث يسار، وحول كل صورة
     * إطار «جناح الملاك». الحالة على العنصر نفسه (node._throne)، وتحديث البيانات
     * يغيّر الأرقام والأشخاص مكانهم بدون ما يعيد رسم كل شي (الحركة ما تنقطع).
     * it.sections = الأقسام اللي يعرضها (أكثر من قسم = يتبدّل كل it.cycle ثانية)،
     * it.palette = medal (ذهبي/فضي/برونزي) أو single (it.color)،
     * it.frameColor = لون الإطار (FRAME_COLORS). */
    // t = درجة اللون المطلوبة (الإطار يدوّر ألوانه من لونه الأصلي لها)، original = بدون تغيير
    var FRAME_COLORS = [
        { key: 'original', label: 'الأصلي', t: null, sw: '' },
        { key: 'ice', label: 'ثلجي', t: 205, sw: '#7fd0ff' },
        { key: 'purple', label: 'بنفسجي', t: 270, sw: '#b48cff' },
        { key: 'pink', label: 'وردي', t: 330, sw: '#ff8fc8' },
        { key: 'red', label: 'أحمر', t: 365, sw: '#ff6b6b' },
        { key: 'gold', label: 'ذهبي', t: 400, sw: '#ffd36b' },
        { key: 'green', label: 'أخضر', t: 130, sw: '#7cf0a0' }
    ];
    /**
     * إطارات «العرش» (ملفات assets/overlay-frames/): الرسمة أكبر من الصورة —
     * scale/left/top بنسبة من الصورة، base = درجة لون الرسمة الأصلية،
     * ring = نصف قطر حلقة الضوء، spark = بُعد الشرار، fly = اللي يطير حولها، glow = لون التوهّج.
     */
    var THRONE_FRAMES = {
        angel: { label: 'جناح الملاك', file: 'angel.webp', scale: 149, left: -25.25, top: -24.5, base: 205, ring: 53.6, spark: 55, fly: 'butterfly', glow: '#9fe0ff', glow2: '#3aa8ff' },
        pegasus: { label: 'الحصان المجنح', file: 'pegasus.webp', scale: 204, left: -57.6, top: -43.2, base: 45, ring: 56.6, spark: 60, fly: 'feather', glow: '#ffe6a3', glow2: '#ffbf3a' },
        // «الأجنحة الكريستالية» (من صاحب المنصة، الخلفية السوداء انشالت): حلقة قوس قزح بأجنحة ريش وكريستال.
        // القياس من الصورة الأصلية 1200px: مركز الحلقة (598.5، 591.4) وحافتها الداخلية 390px — الصورة تعبّيها بالضبط.
        crystal: { label: 'الأجنحة الكريستالية', file: 'crystal.webp', scale: 153.85, left: -26.73, top: -25.82, base: 275, ring: 52.3, spark: 57, fly: 'featherLav', glow: '#efe2ff', glow2: '#b48cff', shine: true },
        // «الفراشات» (من صورة صاحب المنصة): حلقة بيضاء وقوس ضوء بنفسجي فيه غبار نجوم، وفراشات ترفرف.
        // مرسومة بالكود (butterflyFrame) مو صورة، عشان كل ألوانها تتغيّر: frameColor (القوس والغبار)،
        // flyColor (الفراشات)، ringColor (الحلقة). ورقم المركز داخل فراشة بلون المركز.
        butterfly: { label: 'الفراشات', code: true, base: 270, glow: '#e9d8ff', glow2: '#b47cff' },
        // «الغبار الذهبي» (من صورة صاحب المنصة): مذنّبين ضوء يلفّون حول الصورة ويتركون وراهم غبار لامع.
        // مرسوم بالكود (stardustFrame): frameColor = لون المذنّبين، dustColor = لون الغبار.
        stardust: { label: 'الغبار الذهبي', code: true, base: 45, glow: '#fff1c4', glow2: '#ffcc4d' }
    };
    /** إطار مرسوم بالكود (الفراشات، الغبار الذهبي): للتوب 3 بس، ومعه رقم المركز على الحلقة والعملة المسطّحة. */
    function codeFrame(k) { return !!(THRONE_FRAMES[k] && THRONE_FRAMES[k].code); }
    /** لون قوس الضوء والغبار بإطار «الفراشات» (لون جاهز أو مخصص). */
    function bfAccent(it) {
        if (it.frameColor === 'custom' && /^#[0-9a-f]{6}$/i.test(String(it.frameCustom || ''))) return it.frameCustom;
        var fc = FRAME_COLORS.filter(function (c) { return c.key === it.frameColor; })[0];
        return fc && fc.sw ? fc.sw : (THRONE_FRAMES[frameOf(it)] || THRONE_FRAMES.butterfly).glow2;
    }
    function frameOf(it) {
        // «الفراشات» للتوب 3 (العرش) بس
        if (it && it.design === 'stack') return it.frame === 'none' || (THRONE_FRAMES[it.frame] && !codeFrame(it.frame)) ? it.frame : 'ring';
        return THRONE_FRAMES[it && it.frame] ? it.frame : 'angel';
    }
    // «القائمة» (stack): عدد الأشخاص لين 10، وإطار الصور: حلقة دوّارة / رسمة / بدون
    var STACK_COUNTS = [3, 5, 7, 10];
    function isTopLive(it) { return it && it.type === 'top' && (it.design === 'throne' || it.design === 'stack'); }
    function liveCount(it) { return it.design === 'stack' ? clamp(Math.round(Number(it.top) || 10), 1, 10) : 3; }
    var THRONE_CYCLES = [5, 8, 10, 15, 20, 30];
    // حركة التبديل بين الأقسام (it.transition)
    var THRONE_FX = [
        { key: 'flip', label: 'قلب' }, { key: 'fade', label: 'تلاشي' }, { key: 'slide', label: 'انزلاق' },
        { key: 'zoom', label: 'تكبير' }, { key: 'drop', label: 'سقوط' }, { key: 'spin', label: 'دوران' }, { key: 'flash', label: 'وميض' }
    ];
    function hexHue(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
        if (!m) return 205;
        var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
        if (!d) return 205;
        if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
        return (h * 60 + 360) % 360;
    }
    /** دوران الألوان لإطار العرش: لون جاهز أو مخصص (frameColor = custom + frameCustom). */
    function frameHue(it) {
        var fd = THRONE_FRAMES[frameOf(it)];
        var base = fd ? fd.base : 270;
        if (it.frameColor === 'custom') return Math.round(hexHue(it.frameCustom) - base);
        var fc = FRAME_COLORS.filter(function (c) { return c.key === it.frameColor; })[0];
        return fc && fc.t != null ? fc.t - base : 0;
    }
    var throneNodes = [], throneTimer = null;

    function throneSecs(it) {
        var a = (Array.isArray(it.sections) ? it.sections : []).filter(function (k) { return SECTIONS[k]; });
        return a.length ? a : [SECTIONS[it.section] ? it.section : 'likers'];
    }
    function throneIdx(it) {
        var secs = throneSecs(it);
        if (secs.length < 2) return 0;
        var cyc = clamp(Number(it.cycle) || 10, 3, 300) * 1000;
        return Math.floor(Date.now() / cyc) % secs.length;
    }
    function rowNum(sec, r) { return Number(sec === 'gifters' ? r.diamonds : sec === 'donors' ? r.amount : r.count) || 0; }

    function buildThrone(node, it, preview) {
        title(node, it.title);
        var stack = it.design === 'stack';
        var body = el('div', 'agp-so-lbody');
        var pal = it.palette === 'single' ? ' pal-single' : it.palette === 'custom' ? ' pal-custom' : '';
        var box = el('div', (stack ? 'agp-so-stack' : 'agp-so-throne') + ' agp-so-tbox fk-' + frameOf(it) + (codeFrame(frameOf(it)) ? ' fx-code' : '') + pal);
        box.style.setProperty('--agp-so-fhue', frameHue(it) + 'deg');
        // ألوان يختارها الستريمر (المحرر): المراكز الثلاثة، الاسم، الرقم، خلفية الكبسولة
        var hex = function (v) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : null; };
        if (it.palette === 'custom') (Array.isArray(it.rankColors) ? it.rankColors : []).slice(0, 3).forEach(function (c, k) { if (hex(c)) box.style.setProperty('--agp-so-rk' + (k + 1), c); });
        if (hex(it.nameColor)) box.style.setProperty('--agp-so-namec', it.nameColor);
        if (hex(it.numColor)) box.style.setProperty('--agp-so-numc', it.numColor);
        if (hex(it.pillColor)) box.style.setProperty('--agp-so-pillbg', 'color-mix(in srgb,' + it.pillColor + ' 78%,transparent)');
        if (codeFrame(frameOf(it))) {
            box.style.setProperty('--agp-so-bfc', bfAccent(it));
            box.style.setProperty('--agp-so-bff', hex(it.flyColor) || bfAccent(it));
            box.style.setProperty('--agp-so-sdd', hex(it.dustColor) || bfAccent(it));
            if (hex(it.ringColor)) box.style.setProperty('--agp-so-bfr', it.ringColor);
            if (hex(it.coinColor)) box.style.setProperty('--agp-so-coinc', it.coinColor);
            if (hex(it.rankText)) box.style.setProperty('--agp-so-rkt', it.rankText);
        }
        // التباعد بين الثلاثة (it.spacing بوحدة em، الافتراضي .15)
        // أقل من صفر = يتقاربون أكثر (gap ما يقبل سالب، فنستخدم هامش سالب للأوسط)
        if (it.spacing != null) {
            var sp = clamp(Number(it.spacing) || 0, -1, 6);
            if (stack) box.style.setProperty('--agp-so-sgap', clamp(sp, 0, 4) + 'em');
            else {
                box.style.gap = Math.max(0, sp) + 'em';
                box.style.setProperty('--agp-so-tov', Math.min(0, sp) + 'em');
            }
        }
        var slots = {};
        var order = slotOrder(it);
        order.forEach(function (i, k) {
            var slot = el('div', (stack ? 'agp-so-scard' : 'agp-so-tcol') + rkClass(i));
            slot.style.setProperty('--d', k * (stack ? 0.07 : 0.12) + 's');
            slots[i] = slot;
            box.appendChild(slot);
        });
        var wait = el('div', 'agp-so-empty agp-so-twait');
        body.appendChild(box);
        body.appendChild(wait);
        node.appendChild(body);
        node._throne = { it: it, preview: preview, box: box, slots: slots, wait: wait, idx: -1, n: liveCount(it), stack: stack };
        paintThrone(node, false);
        throneNodes.push(node);
        if (!throneTimer) throneTimer = setInterval(tickThrones, 400);
    }

    /** ترتيب الأماكن: العرش (RTL) الثاني يمين والأول بالوسط والثالث يسار، والقائمة من فوق لتحت. */
    function slotOrder(it) {
        if (it.design !== 'stack') return [1, 0, 2];
        var a = [];
        for (var i = 0; i < liveCount(it); i++) a.push(i);
        return a;
    }

    /** يرسم/يحدّث العرش أو القائمة. animate = تحديث بيانات أو تبديل قسم (حركة للي تغيّر). */
    function paintThrone(node, animate) {
        var t = node._throne, it = t.it;
        var secs = throneSecs(it), idx = throneIdx(it), sec = secs[idx];
        var rows = (stats.sections[sec] || []).slice(0, t.n);
        var ghost = !rows.length && t.preview;
        if (ghost) rows = SAMPLE_ROWS.slice(0, t.n);
        t.box.classList.toggle('agp-so-ghost', ghost);
        t.wait.textContent = rows.length ? '' : 'بانتظار ' + SECTIONS[sec].label + '…';
        t.wait.style.display = rows.length ? 'none' : '';
        var switching = animate && t.idx !== -1 && t.idx !== idx;
        t.idx = idx;
        slotOrder(it).forEach(function (i, order) {
            var slot = t.slots[i], r = rows[i];
            if (!slot) return;
            if (!r) { slot.style.visibility = 'hidden'; if (t.stack) slot.style.display = 'none'; slot._sig = null; return; }
            slot.style.visibility = '';
            slot.style.display = '';
            var sig = sec + '|' + nameOf(r) + '|' + (r.avatar ? String(r.avatar).length : 0);
            if (!slot._sig) {
                fillThroneCol(slot, r, sec, i);
                // حركة الدخول بالبث بس (بالمحرر كل تعديل يعيد الرسم)
                if (!animate && !t.preview) slot.classList.add('t-enter');
            } else if (switching || slot._sig !== sig) {
                flipCol(slot, function () { fillThroneCol(slot, r, sec, i); }, order * (t.stack ? 60 : 90), it.transition);
            } else {
                tweenNum(slot.querySelector('.agp-so-tnum'), rowNum(sec, r));
            }
            slot._sig = sig;
        });
    }

    function fillThroneCol(slot, r, sec, i) {
        slot.textContent = '';
        var host = slot.closest && slot.closest('.agp-so-item');
        var hit = host && host._throne ? host._throne.it : null;
        var stack = hit && hit.design === 'stack';
        var inner = el('div', stack ? 'agp-so-sin' : 'agp-so-tin');
        if (stack) {
            if (i === 0) slot.appendChild(el('span', 'agp-so-ssheen'));
            inner.appendChild(el('span', 'agp-so-snum', String(i + 1)));
            var fk = frameOf(hit);
            if (fk === 'ring') inner.appendChild(ringFrame(r));
            else if (fk === 'none') { var pl = el('span', 'agp-so-fav fr-none'); pl.appendChild(avatar(r)); inner.appendChild(pl); }
            else inner.appendChild(throneFrame(r, fk));
            inner.appendChild(el('span', 'agp-so-sname', nameOf(r)));
        } else {
            var fr = throneFrame(r, frameOf(hit));
            // رقم المركز (1/2/3) ملاصق للإطار الدائري — ماسة بلون المركز،
            // وبإطار «الفراشات» دائرة ناعمة على الحلقة تحت يمين (لونها بين لون المركز ولون القوس)
            if (codeFrame(frameOf(hit))) fr.appendChild(el('span', 'agp-so-bfrk', String(i + 1)));
            else {
                var rk = el('span', 'agp-so-trank');
                rk.appendChild(el('b', null, String(i + 1)));
                fr.appendChild(rk);
            }
            inner.appendChild(fr);
            inner.appendChild(el('span', 'agp-so-tname', nameOf(r)));
        }
        var c = el('span', 'agp-so-tcount');
        var ic = el('span', 'agp-so-tic i-' + sec);
        // «الفراشات»: الرقم مختصر (1.4K) والعملة مسطّحة (BF_COIN)
        var bfly = !stack && codeFrame(frameOf(hit));
        if (sec === 'gifters' && bfly) ic.innerHTML = BF_COIN;
        else if (sec === 'gifters') {
            // الدعم: عملة تيك توك الذهبية (assets/overlay-frames/tiktok-coin.webp، من صاحب المنصة)
            var coin = document.createElement('img');
            coin.src = FRAMES_BASE + 'tiktok-coin.webp';
            coin.alt = '';
            coin.draggable = false;
            ic.appendChild(coin);
        } else if (THRONE_ICONS[sec]) ic.innerHTML = THRONE_ICONS[sec];
        else ic.appendChild(icon((SECTIONS[sec] || SECTIONS.likers).icon));
        c.appendChild(ic);
        var short = bfly && sec !== 'donors';
        var num = el('span', 'agp-so-tnum', short ? fmtShort(rowNum(sec, r)) : fmtKind(sec, rowNum(sec, r)));
        num._kind = sec;
        num._short = short;
        num._v = rowNum(sec, r);
        c.appendChild(num);
        inner.appendChild(c);
        slot.appendChild(inner);
    }

    function flipCol(slot, swap, delay, fx) {
        fx = THRONE_FX.filter(function (f) { return f.key === fx; })[0] ? fx : 'flip';
        setTimeout(function () {
            slot.className = slot.className.replace(/(^|\s)t-(enter|in|out)(-\w+)?/g, '');
            slot.classList.add('t-out', 't-out-' + fx);
            setTimeout(function () {
                swap();
                slot.classList.remove('t-out', 't-out-' + fx);
                void slot.offsetWidth;
                slot.classList.add('t-in', 't-in-' + fx);
            }, 340);
        }, delay || 0);
    }

    /** الرقم يعد لين القيمة الجديدة بدل ما يقفز. */
    function tweenNum(elm, to) {
        if (!elm) return;
        var from = Number(elm._v) || 0;
        elm._v = to;
        if (from === to) return;
        var t0 = performance.now(), dur = 700;
        (function step(now) {
            var k = Math.min(1, (now - t0) / dur);
            var e = 1 - Math.pow(1 - k, 3);
            var v = from + (to - from) * e;
            elm.textContent = elm._kind === 'donors' ? fmtMoney(k < 1 ? Math.round(v) : to) : elm._short ? fmtShort(Math.round(v)) : fmt(Math.round(v));
            if (k < 1 && elm.isConnected) requestAnimationFrame(step);
        }(t0));
    }

    /** «حلقة دوّارة» حول الصورة بلون المركز (إطار القائمة الافتراضي). */
    function ringFrame(r) {
        var f = el('span', 'agp-so-fav fr-ring');
        f.appendChild(avatar(r));
        f.appendChild(el('span', 'agp-so-fring'));
        return f;
    }

    function tickThrones() {
        throneNodes = throneNodes.filter(function (n) { return n.isConnected; });
        if (!throneNodes.length) { clearInterval(throneTimer); throneTimer = null; return; }
        throneNodes.forEach(function (n) {
            var t = n._throne;
            if (t && throneIdx(t.it) !== t.idx) paintThrone(n, true);
        });
    }

    /** المحرر: يعرض حركة التبديل المختارة على العرش (بدون ما يغيّر القسم). */
    function throneDemo(id) {
        throneNodes.forEach(function (n) {
            if (!n.isConnected || n.getAttribute('data-id') !== id || !n._throne) return;
            slotOrder(n._throne.it).forEach(function (i, order) {
                var slot = n._throne.slots[i];
                if (slot && slot._sig) flipCol(slot, function () {}, order * (n._throne.stack ? 60 : 90), n._throne.it.transition);
            });
        });
    }

    /** تحديث عنصر بمكانه بدون إعادة رسم (يرجع true لو تحدّث). */
    function refreshItem(node, it) {
        // «آخر دعم» البسيط: ما نعيد الرسم إلا لو تغيّر الداعم أو الشكل (عشان الحركة ما تنقطع)
        if (node && node._ld && it.type === 'lastdonation') return node._ld.sig === ldSig(curLastDon()) && node._ld.cfg === ldCfg(it);
        // كرة القمر: نحدّث المستوى بس (الموج يكمل) — لو تغيّر شكلها نعيد البناء
        if (node && node._orb && it.type === 'goal' && it.design === 'orb') {
            if (node._orb.sig !== JSON.stringify([it.palette, it.orb, it.speed, it.bubbles, it.title])) return false;
            node._orb.it = it;
            paintOrb(node, true);
            return true;
        }
        if (!node || !node._throne || !isTopLive(it) || it.design !== node._throne.it.design || liveCount(it) !== node._throne.n) return false;
        node._throne.it = it;
        paintThrone(node, true);
        return true;
    }

    // ريشة ذهبية تطير حول إطار «الحصان المجنح»
    var FEATHER = '<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="agp-so-fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".55" stop-color="#ffe7a8"/><stop offset="1" stop-color="#d9a63a"/></linearGradient></defs>' +
        '<path d="M33 4C20 6 9 16 7 31l2 1c3-7 8-13 15-17-6 5-10 10-13 18l2 .8C17 23 26 13 33 4z" fill="url(#agp-so-fg)"/><path d="M33 4C22 12 14 22 9 33" stroke="#c99a35" stroke-width="1" fill="none"/></svg>';

    // ريشة بيضاء لافندر لإطار «الأجنحة الكريستالية» (نفس شكل FEATHER، ألوان ثانية)
    var FEATHER_LAV = FEATHER.replace('id="agp-so-fg"', 'id="agp-so-fgl"').replace('url(#agp-so-fg)', 'url(#agp-so-fgl)')
        .replace('#fffaf0', '#ffffff').replace('#ffe7a8', '#efe2ff').replace('#d9a63a', '#b48cff').replace('#c99a35', '#9b7fd6');

    /**
     * فراشة واقعية (إطار «الفراشات»): جناح أمامي مدبّب وخلفي مموّج، عروق، نقط بيضاء على الحافة،
     * عين على الجناح الخلفي، وجسم بقرون. اللون currentColor (تدرّج أبيض قرب الجسم ← اللون ← غامق بالأطراف).
     * كل نسخة لها id تدرّج خاص (ألوان الفراشات تختلف من أداة لأداة بنفس الصفحة).
     */
    var bfSeq = 0;
    // عملة تيك توك مسطّحة (بدون تدرّج ولا انحناء) لإطار «الفراشات»
    var BF_NOTE = 'M13 5h2.6c.2 1.7 1.4 3 3.2 3.2v2.6c-1.2 0-2.3-.4-3.2-1v5.2a4 4 0 1 1-4-4c.2 0 .5 0 .7.1v2.7a1.4 1.4 0 1 0 .7 1.2z';
    var BF_COIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11.5" style="fill:color-mix(in srgb,var(--agp-so-coinc,#ffd23f) 80%,#a86f00)"/><circle cx="12" cy="12" r="9.6" style="fill:var(--agp-so-coinc,#ffd23f)"/>' +
        '<circle cx="12" cy="12" r="9.6" fill="none" stroke-width=".6" style="stroke:color-mix(in srgb,var(--agp-so-coinc,#ffd23f) 55%,#fff)"/>' +
        '<g transform="translate(-1.2 -.1) scale(.92) translate(1 1)"><path d="' + BF_NOTE + '" fill="#25f4ee" transform="translate(-.7 -.5)"/>' +
        '<path d="' + BF_NOTE + '" fill="#fe2c55" transform="translate(.7 .5)"/><path d="' + BF_NOTE + '" fill="#1a1206"/></g></svg>';
    function bfSvg() {
        var id = 'agp-so-bfg' + (++bfSeq);
        var mir = function (d) { return d.replace(/(-?[\d.]+),(-?[\d.]+)/g, function (m, x, y) { return +(60 - x).toFixed(2) + ',' + y; }); };
        var FW = 'M29,19.5 C24,12 15,6 5.5,4.3 C3.2,3.9 1.8,5.4 2.5,7.2 C4,11.5 6,16.5 8.8,21 C13.5,24 21,24 29,22.2 Z';
        var HW = 'M29,23 C22,23 14.5,24.2 10.3,27.6 C7.3,30.2 7.4,35.6 9.6,38.6 C10.8,40.4 12.6,41.6 14.6,41.2 C16.4,42.8 19,42.6 20.6,40.8 C23.8,37.6 27,32 29,26 Z';
        var FV = 'M28,20.5 C20,13 12,8 5,6 M27.5,20.8 C19,16 10,12.5 3.8,10.5 M27,21.2 C18,19 10.5,17 5.5,15.6 M27,21.6 C19,21.8 12.5,21 8.5,20';
        var HV = 'M28,24 C21,25.5 14.5,27.5 10,30.5 M28,24.5 C21,28 15,32 11,37.5 M28.3,25 C23,30 18.5,35.5 15.5,40.5 M28.6,25.5 C25,31 22,36 19.8,40.5';
        var spots = function (pts, r) { return pts.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '"/>'; }).join(''); };
        var FS = [[4.3, 6.6], [4.1, 9.4], [4.9, 12.3], [6, 15.2], [7.3, 18]], HS = [[9.4, 31.5], [9.3, 35.2], [11, 39.2], [14.6, 40.4], [18.6, 40.2]];
        var wing = function (side) {
            var m = side === 'r' ? mir : function (d) { return d; };
            var sp = function (a) { return side === 'r' ? a.map(function (p) { return [60 - p[0], p[1]]; }) : a; };
            var eye = sp([[16, 33.5]])[0];
            return '<path d="' + m(HW) + '" fill="url(#' + id + ')" fill-opacity=".9"/>' +
                '<path d="' + m(HV) + '" stroke="#fff" stroke-opacity=".28" stroke-width=".35" fill="none"/>' +
                '<circle cx="' + eye[0] + '" cy="' + eye[1] + '" r="2.3" fill="#1a0f26" fill-opacity=".75"/><circle cx="' + eye[0] + '" cy="' + eye[1] + '" r="1.5" fill="currentColor"/><circle cx="' + (eye[0] - .4) + '" cy="' + (eye[1] - .4) + '" r=".5" fill="#fff"/>' +
                '<g fill="#fff" fill-opacity=".75">' + spots(sp(HS), .55) + '</g>' +
                '<path d="' + m(FW) + '" fill="url(#' + id + ')" fill-opacity=".95"/>' +
                '<path d="' + m(FV) + '" stroke="#fff" stroke-opacity=".32" stroke-width=".35" fill="none"/>' +
                '<g fill="#fff" fill-opacity=".85">' + spots(sp(FS), .6) + '</g>';
        };
        return '<svg viewBox="0 0 60 50" aria-hidden="true"><defs><radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="30" cy="22" r="29">' +
            '<stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".22" style="stop-color:color-mix(in srgb,currentColor 55%,#fff)"/>' +
            '<stop offset=".55" stop-color="currentColor"/><stop offset=".86" style="stop-color:color-mix(in srgb,currentColor 55%,#14051f)"/>' +
            '<stop offset="1" style="stop-color:color-mix(in srgb,currentColor 30%,#0a0210)"/></radialGradient></defs>' +
            '<g class="wl">' + wing('l') + '</g><g class="wr">' + wing('r') + '</g>' +
            '<g class="bd"><path d="M29.4,16.4 C28.4,11.5 26.6,8.2 23.8,6.4 M30.6,16.4 C31.6,11.5 33.4,8.2 36.2,6.4" stroke="#2a1d38" stroke-width=".45" fill="none" stroke-linecap="round"/>' +
            '<circle cx="23.7" cy="6.3" r=".65" fill="#2a1d38"/><circle cx="36.3" cy="6.3" r=".65" fill="#2a1d38"/>' +
            '<ellipse cx="30" cy="31" rx="1.25" ry="7.5" fill="#241832"/><path d="M28.9,27 h2.2 M28.8,30 h2.4 M28.9,33 h2.2" stroke="#fff" stroke-opacity=".18" stroke-width=".3"/>' +
            '<ellipse cx="30" cy="21.5" rx="1.75" ry="3.6" fill="#2e2040"/><circle cx="30" cy="17" r="1.45" fill="#2e2040"/>' +
            '<ellipse cx="29.5" cy="20.5" rx=".5" ry="1.8" fill="#fff" fill-opacity=".22"/></g></svg>';
    }
    // ترتيب ثابت (مو Math.random) عشان الغبار ما يتغيّر مكانه مع كل تحديث
    function seeded(n) { var x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

    /** إطار «الفراشات»: حلقة + قوس ضوء بغبار نجوم + فراشتين ترفرف تحت يسار + فراشة صغيرة تطير حول الحلقة. */
    function butterflyFrame(r) {
        var f = el('span', 'agp-so-fav fr-butterfly');
        f.appendChild(avatar(r));
        var glow = el('span', 'agp-so-bfglow');
        f.appendChild(glow);
        // القوس والغبار والنجوم يتمايلون مع بعض (مجموعة وحدة)
        var arc = el('span', 'agp-so-bfarcw');
        arc.appendChild(el('span', 'agp-so-bfarc'));
        arc.appendChild(el('span', 'agp-so-bfarc hot'));
        // زاوية 0 = فوق، مع عقارب الساعة. القوس من 335° لين 150° تقريباً (مثل الصورة)
        for (var k = 0; k < 90; k++) {
            var a = (-28 + seeded(k + 1) * 185) * Math.PI / 180;
            var mid = 1 - Math.abs((a * 180 / Math.PI - 60) / 95); // أكثف بالنص
            var rad = 55 + seeded(k + 51) * (4 + 9 * Math.max(0, mid));
            var dt = el('span', 'agp-so-bfdot');
            var sz = .7 + Math.pow(seeded(k + 101), 2.2) * 2.6;
            dt.style.width = dt.style.height = sz + '%';
            dt.style.left = (50 + Math.sin(a) * rad - sz / 2) + '%';
            dt.style.top = (50 - Math.cos(a) * rad - sz / 2) + '%';
            dt.style.animationDelay = (-seeded(k + 151) * 3).toFixed(2) + 's';
            dt.style.animationDuration = (1.8 + seeded(k + 201) * 2.4).toFixed(2) + 's';
            arc.appendChild(dt);
        }
        [[-20, 0], [42, 1.1], [92, 2.2]].forEach(function (s) {
            var a = s[0] * Math.PI / 180;
            var st = el('span', 'agp-so-bfstar');
            st.style.left = (50 + Math.sin(a) * 55) + '%';
            st.style.top = (50 - Math.cos(a) * 55) + '%';
            st.style.animationDelay = s[1] + 's';
            arc.appendChild(st);
        });
        f.appendChild(arc);
        f.appendChild(el('span', 'agp-so-bfring'));
        // فراشتين تحت يسار الحلقة (ترفرف وتتمايل) + شرار حولها
        ['f1', 'f2'].forEach(function (c) {
            var o = el('span', 'agp-so-bfly ' + c);
            var w = el('span', 'agp-so-bfw');
            w.innerHTML = bfSvg();
            o.appendChild(w);
            f.appendChild(o);
        });
        [[-14, 52, 0], [-4, 64, .8], [-20, 82, 1.5], [4, 104, .4], [-8, 100, 2], [-2, 46, 1.2]].forEach(function (p) {
            var s = el('span', 'agp-so-bfspk');
            s.style.left = p[0] + '%';
            s.style.top = p[1] + '%';
            s.style.animationDelay = p[2] + 's';
            f.appendChild(s);
        });
        // فراشة صغيرة تلف حول الحلقة
        var orb = el('span', 'agp-so-bforb');
        var ob = el('span', 'agp-so-bfly f3');
        var ow = el('span', 'agp-so-bfw');
        ow.innerHTML = bfSvg();
        ob.appendChild(ow);
        orb.appendChild(ob);
        f.appendChild(orb);
        return f;
    }

    /**
     * إطار «الغبار الذهبي»: مذنّبين (رأس ضوء أبيض وذيل يتلاشى) متقابلين يلفّون حول الصورة،
     * وغبار لامع ينتشر برا الذيل ويلمع. الزوايا: 0 = فوق، مع عقارب الساعة.
     */
    function stardustFrame(r) {
        var f = el('span', 'agp-so-fav fr-stardust');
        f.appendChild(avatar(r));
        f.appendChild(el('span', 'agp-so-sdglow'));
        // كل مذنّب بمجموعة لحاله (g0 ثم g1): يطلق ويوقف بمكانه، وبعد ما يوصل يبدأ اللي بعده
        [15, 195].forEach(function (head, n) {
            var w = el('span', 'agp-so-sdw g' + n);
            var dust = el('span', 'agp-so-sddust g' + n);
            var c = el('span', 'agp-so-sdc');
            c.style.setProperty('--h', head + 'deg');
            w.appendChild(c);
            var core = el('span', 'agp-so-sdc core');
            core.style.setProperty('--h', head + 'deg');
            w.appendChild(core);
            var a = head * Math.PI / 180;
            var hd = el('span', 'agp-so-sdhead');
            hd.style.left = (50 + Math.sin(a) * 57) + '%';
            hd.style.top = (50 - Math.cos(a) * 57) + '%';
            hd.style.animationDelay = (n * 1.3) + 's';
            w.appendChild(hd);
            // الغبار: أكثف قرب الرأس، وينتشر أكثر كل ما بعد بالذيل
            for (var k = 0; k < 95; k++) {
                var sd = n * 500 + k;
                var t = Math.pow(seeded(sd + 1), .75);
                var ang = (head - 6 - t * 160) * Math.PI / 180;
                var g = (seeded(sd + 2) + seeded(sd + 3) - 1);
                var rad = 57 + g * (2.5 + 19 * t) + t * 2;
                var dt = el('span', 'agp-so-sddot');
                var sz = .5 + Math.pow(seeded(sd + 4), 2.5) * 2.3;
                dt.style.width = dt.style.height = sz + '%';
                dt.style.left = (50 + Math.sin(ang) * rad - sz / 2) + '%';
                dt.style.top = (50 - Math.cos(ang) * rad - sz / 2) + '%';
                dt.style.opacity = (1 - t * .55).toFixed(2);
                dt.style.animationDelay = (-seeded(sd + 5) * 3).toFixed(2) + 's';
                dt.style.animationDuration = (1.4 + seeded(sd + 6) * 2.2).toFixed(2) + 's';
                dust.appendChild(dt);
            }
            // نجوم صغيرة (أربع رؤوس) بين الغبار
            [.15, .4, .7].forEach(function (t, j) {
                var ang = (head - 10 - t * 150) * Math.PI / 180;
                var rad = 57 + (j % 2 ? 7 : -3);
                var st = el('span', 'agp-so-sdstar');
                st.style.left = (50 + Math.sin(ang) * rad) + '%';
                st.style.top = (50 - Math.cos(ang) * rad) + '%';
                st.style.animationDelay = (j * .9 + n * .5) + 's';
                dust.appendChild(st);
            });
            w.appendChild(dust);
            f.appendChild(w);
        });
        return f;
    }

    /** إطار حول صورة الشخص (THRONE_FRAMES): الرسمة + ضوء يلف + شرار + اللي يطير حولها. */
    function throneFrame(r, kind) {
        if (kind === 'butterfly') return butterflyFrame(r);
        if (kind === 'stardust') return stardustFrame(r);
        var d = THRONE_FRAMES[kind] || THRONE_FRAMES.angel;
        var f = el('span', 'agp-so-fav fr-' + kind);
        f.style.setProperty('--agp-so-fg1', d.glow);
        f.style.setProperty('--agp-so-fg2', d.glow2);
        f.appendChild(avatar(r));
        var comet = el('span', 'agp-so-fcomet');
        comet.style.inset = (50 - d.ring) + '%';
        f.appendChild(comet);
        var art = el('span', 'agp-so-fart');
        art.style.width = art.style.height = d.scale + '%';
        art.style.left = d.left + '%';
        art.style.top = d.top + '%';
        function artImg(cls) {
            var img = document.createElement('img');
            img.src = FRAMES_BASE + d.file;
            img.alt = '';
            img.draggable = false;
            if (cls) img.className = cls;
            return img;
        }
        art.appendChild(artImg('glow'));
        art.appendChild(artImg(''));
        if (d.shine) {
            // لمعة ضوء تمر على الرسمة نفسها (مقصوصة بشكلها) — الإطار ثابت والضوء يتحرك
            var sh = el('span', 'agp-so-fshine');
            var mk = 'url("' + FRAMES_BASE + d.file + '")';
            sh.style.webkitMaskImage = mk;
            sh.style.maskImage = mk;
            art.appendChild(sh);
        }
        f.appendChild(art);
        [[200, 0], [235, 0.7], [300, 1.4], [330, 2.1], [20, 0.35], [60, 1.05], [110, 1.75], [150, 2.45]].forEach(function (sp) {
            var rad = sp[0] * Math.PI / 180;
            var k = el('span', 'agp-so-fspk');
            k.style.left = (50 + Math.cos(rad) * d.spark - 2.5) + '%';
            k.style.top = (50 + Math.sin(rad) * d.spark - 2.5) + '%';
            k.style.animationDelay = sp[1] + 's';
            f.appendChild(k);
        });
        ['b1', 'b2'].forEach(function (b) {
            var o = el('span', 'agp-so-fbfo ' + b);
            var feather = d.fly === 'feather' || d.fly === 'featherLav';
            var bf = el('span', 'agp-so-fbf' + (feather ? ' feather' : ''));
            bf.innerHTML = d.fly === 'featherLav' ? FEATHER_LAV : feather ? FEATHER : BUTTERFLY;
            o.appendChild(bf);
            f.appendChild(o);
        });
        return f;
    }

    var DESIGNS = [
        { key: 'podium', label: 'منصة تتويج' },
        { key: 'medals', label: 'ميداليات' },
        { key: 'cards', label: 'بطاقات' },
        { key: 'minimal', label: 'بسيط' }
    ];
    // تصاميم Veyro (veyro/) — ما تطلع بمحرر overlay/ القديم. max = أكثر عدد أشخاص.
    var VEYRO_DESIGNS = [{ key: 'throne', label: 'العرش', max: 3, multi: true }, { key: 'stack', label: 'القائمة', max: 10, multi: true }];
    var GOAL_DESIGNS = [{ key: 'bar', label: 'شريط' }, { key: 'ring', label: 'دائرة' }];
    // تصاميم أهداف Veyro بس: «كرة القمر» (سائل يتعبّى)
    var VEYRO_GOAL_DESIGNS = [{ key: 'orb', label: 'كرة القمر' }];
    var COUNTER_DESIGNS = [{ key: 'pills', label: 'كبسولات' }, { key: 'big', label: 'أرقام كبيرة' }, { key: 'stack', label: 'قائمة' }];

    // أليرتات «شاشات البث»: msg = النص الافتراضي ({name} {gift} {count} {diamonds})
    var ALERT_EVENTS = {
        gift: { label: 'الهدايا', title: 'هدية جديدة', icon: 'gift', msg: '{name} أرسل {gift} ×{count}' },
        follow: { label: 'المتابعين', title: 'متابع جديد', icon: 'follow', msg: '{name} تابع البث' },
        share: { label: 'الشير', title: 'شير جديد', icon: 'share', msg: '{name} نشر البث' },
        join: { label: 'الدخول', title: 'نوّر البث', icon: 'eye', msg: '{name} دخل البث' }
    };
    // أحداث Veyro بس (المحرر القديم overlay/ يعرض ALERT_EVENTS الأصلية بدونها)
    var ALERT_EVENTS_ALL = Object.assign({}, ALERT_EVENTS, {
        like: { label: 'التكبيس', title: 'تكبيس', icon: 'heart', msg: '{name} وصل {count} تكبيسة' },
        subscribe: { label: 'الاشتراك', title: 'مشترك جديد', icon: 'star', msg: '{name} اشترك بالبث' },
        // الدونيشن من Streamlabs (كريترز وغيره) — {amount} = $25، {message} = رسالة الداعم (لو مفعّلة)
        donation: { label: 'الدونيشن', title: 'دعم جديد', icon: 'dollar', msg: '{name} دعم بـ{amount}' }
    });
    var ALERT_DESIGNS = [{ key: 'card', label: 'بطاقة' }, { key: 'banner', label: 'شريط' }, { key: 'pop', label: 'كبير بالوسط' }];
    var ALERT_ANIMS = [{ key: 'pop', label: 'قفزة' }, { key: 'slide', label: 'انزلاق' }, { key: 'fade', label: 'ظهور' }, { key: 'drop', label: 'سقوط' }];
    // أيقونات «شاشات البث» (viewBox 24، fill-rule evenodd)
    var ICON_SET = {
        heart: { label: 'قلب', p: '<path d="M12 21s-7.6-4.7-9.7-9.3C.8 8.3 2.9 4.5 6.6 4.5c2.1 0 3.7 1.2 4.4 2.5.7-1.3 2.3-2.5 4.4-2.5 3.7 0 5.8 3.8 4.3 7.2C19.6 16.3 12 21 12 21z"/>' },
        star: { label: 'نجمة', p: '<path d="M12 2l3 6.6 7.2.7-5.4 4.9 1.6 7.1L12 17.6l-6.4 3.7 1.6-7.1-5.4-4.9L9 8.6z"/>' },
        crown: { label: 'تاج', p: '<path d="M2 17h20l1.2-11-6.2 4.6L12 3 7 10.6.8 6zM3 18.6h18V21H3z"/>' },
        fire: { label: 'نار', p: '<path d="M12 2c1 4 5.5 5.6 5.5 11.2A5.5 5.5 0 016.5 13.3c0-2.6 1.2-4.2 2.6-5.3.2 2 1 3.2 2.1 3.7C10.6 8.7 10 6 12 2z"/>' },
        diamond: { label: 'ماسة', p: '<path d="M7 3h10l5 6.5L12 21 2 9.5z"/>' },
        gift: { label: 'هدية', p: '<path d="M3 8h18v4H3zM5 13h14v8H5zM11 8h2v13h-2zM12 8C10 4.5 6.5 4 6.5 6.3 6.5 8 9.5 8 12 8zm0 0c2-3.5 5.5-4 5.5-1.7C17.5 8 14.5 8 12 8z"/>' },
        trophy: { label: 'كأس', p: '<path d="M7 3h10v2h4c0 4.2-2 6.6-4.6 7A5 5 0 0113 15.8V19h4v2H7v-2h4v-3.2A5 5 0 017.6 12C5 11.6 3 9.2 3 5h4zm-2 4c.3 1.7 1 2.8 2 3.3V7zm14 0h-2v3.3c1-.5 1.7-1.6 2-3.3z"/>' },
        bolt: { label: 'برق', p: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>' },
        sparkle: { label: 'لمعة', p: '<path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2zM19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z"/>' },
        rocket: { label: 'صاروخ', p: '<path d="M12 2c4 2.2 6 6.2 6 10.3l2 3-3 2.2-1-2H8l-1 2-3-2.2 2-3C6 8.2 8 4.2 12 2zm0 6a2 2 0 100 4 2 2 0 000-4zM10 19h4l-2 3.5z"/>' },
        like: { label: 'لايك', p: '<path d="M2 10h4v11H2zM8 21h9a3 3 0 003-2.4l1.4-6A2.5 2.5 0 0019 10h-5l1-4.5A2 2 0 0011.3 4L8 10z"/>' },
        follow: { label: 'متابعة', p: '<path d="M9 4a4 4 0 110 8 4 4 0 010-8zM1.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5zM18 6h2v3h3v2h-3v3h-2v-3h-3V9h3z"/>' },
        share: { label: 'شير', p: '<path d="M13 4l9 7.5-9 7.5v-4.5C7 14.5 4 16.5 2 20c.5-6 3.5-10.5 11-11.5z"/>' },
        chat: { label: 'تعليق', p: '<path d="M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2H10l-5 4v-4H4a2 2 0 01-2-2V6a2 2 0 012-2z"/>' },
        eye: { label: 'مشاهدة', p: '<path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 3a4 4 0 110 8 4 4 0 010-8z"/>' },
        bell: { label: 'جرس', p: '<path d="M12 2a6 6 0 016 6v5l2 3v1H4v-1l2-3V8a6 6 0 016-6zM9.5 19h5a2.5 2.5 0 01-5 0z"/>' },
        game: { label: 'يد تحكم', p: '<path d="M7 7h10a5 5 0 014.9 6l-.8 4a3 3 0 01-5.3 1.2L14 16h-4l-1.8 2.2A3 3 0 012.9 17l-.8-4A5 5 0 017 7zm0 3v2H5v2h2v2h2v-2h2v-2H9v-2zm9 .5a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4zm2 2.5a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z"/>' },
        mic: { label: 'مايك', p: '<path d="M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3zM5 11h2a5 5 0 0010 0h2a7 7 0 01-6 6.9V20h3v2H8v-2h3v-2.1A7 7 0 015 11z"/>' },
        music: { label: 'موسيقى', p: '<path d="M9 5l11-2.5v13a3 3 0 11-2-2.8V6l-7 1.6v10a3 3 0 11-2-2.8z"/>' },
        clock: { label: 'ساعة', p: '<path d="M12 2a10 10 0 110 20 10 10 0 010-20zm-1 4.5V13l5 3 1-1.7-4-2.4V6.5z"/>' },
        check: { label: 'صح', p: '<path d="M9 16.2l-4.2-4.2-1.4 1.4L9 19 21 7l-1.4-1.4z"/>' },
        smile: { label: 'وجه', p: '<path d="M12 2a10 10 0 110 20 10 10 0 010-20zM8.5 8a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm7 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM7 13.5a5 5 0 0010 0z"/>' },
        down: { label: 'سهم تحت', p: '<path d="M10 3h4v10h5l-7 8-7-8h5z"/>' },
        side: { label: 'سهم جنب', p: '<path d="M21 10v4H11v5l-8-7 8-7v5z"/>' }
    };
    var EMOJIS = ['🔥', '❤️', '😂', '😍', '🥳', '🎉', '👑', '💎', '🎁', '⭐', '🚀', '👏', '🙏', '💯', '⚽', '🏆', '🎮', '🎤', '🌙', '☕', '😎', '🤍', '💜', '🇸🇦'];
    // أشكال: r = border-radius (بوحدة em = 1% من أصغر ضلع)
    var SHAPES = [
        { key: 'rect', label: 'مستطيل', r: '0' },
        { key: 'round', label: 'حواف ناعمة', r: '2.5em' },
        { key: 'pill', label: 'كبسولة', r: '999em' },
        { key: 'circle', label: 'دائرة', r: '50%' }
    ];
    var SHAPE_FILLS = [
        { key: 'glass', label: 'زجاجي' },
        { key: 'solid', label: 'لون' },
        { key: 'gradient', label: 'تدرّج' },
        { key: 'outline', label: 'إطار' },
        { key: 'neon', label: 'نيون' }
    ];

    function title(node, text) { if (text) node.appendChild(el('div', 'agp-so-wtitle', text)); }

    function fillTop(node, it, preview) {
        if (isTopLive(it)) {
            node.className = node.className.replace(/(^|\s)d-\w+/g, '') + ' d-' + it.design;
            buildThrone(node, it, preview);
            return;
        }
        var sec = SECTIONS[it.section] ? it.section : 'likers';
        var builders = makeTop(sec);
        var design = builders[it.design] ? it.design : 'podium';
        node.className = node.className.replace(/(^|\s)d-\w+/g, '') + ' d-' + design;
        title(node, it.title);
        var n = Number(it.top) || 3;
        var rows = (stats.sections[sec] || []).slice(0, n);
        if (!rows.length && !preview) {
            node.appendChild(el('div', 'agp-so-empty', 'بانتظار ' + SECTIONS[sec].label + '…'));
            return;
        }
        // بالمعاينة بدون بيانات: أسماء تجريبية باهتة عشان يشوف التصميم وهو يرتّب
        var ghost = !rows.length;
        var body = el('div', 'agp-so-lbody' + (ghost ? ' agp-so-ghost' : ''));
        body.appendChild(builders[design](ghost ? SAMPLE_ROWS.slice(0, n) : rows));
        node.appendChild(body);
    }

    function totalsFor(preview) {
        if (stats.totals) return { t: stats.totals, ghost: false };
        return preview ? { t: SAMPLE_TOTALS, ghost: true } : { t: {}, ghost: false };
    }

    /* ---------------- «كرة القمر»: هدف بسائل يتموّج ويتعبّى (Veyro) ---------------- */

    // لوحات ألوان جاهزة: سائل (فوق ← تحت)، الحلقة، القمر، الغيوم، التوهّج
    var ORB_PALETTES = {
        lavender: { label: 'بنفسجي', top: '#a68bff', bottom: '#3b2a86', ring: '#c9b8f2', moon: '#f1ecff', cloud: '#2b2156', glow: '#9a7cff' },
        rose: { label: 'وردي', top: '#ff8ac6', bottom: '#7a1e5c', ring: '#ffc2e0', moon: '#fff0f7', cloud: '#3a1530', glow: '#ff6fb5' },
        ocean: { label: 'محيط', top: '#5fd4ff', bottom: '#0f3d86', ring: '#b5e8ff', moon: '#eefaff', cloud: '#10264a', glow: '#3cc3ff' },
        gold: { label: 'ذهبي', top: '#ffd77a', bottom: '#8a5a12', ring: '#ffe7ad', moon: '#fff8e6', cloud: '#3a2a10', glow: '#ffc64a' },
        mint: { label: 'نعناعي', top: '#7cffc8', bottom: '#0f6b5a', ring: '#b8ffe2', moon: '#effff8', cloud: '#103a33', glow: '#45f0b0' },
        fire: { label: 'ناري', top: '#ffb347', bottom: '#b3122e', ring: '#ffd1a1', moon: '#fff3e8', cloud: '#3d1414', glow: '#ff6a3d' }
    };
    var ORB_SPEEDS = { slow: 1.6, normal: 1, fast: 0.6 };
    var orbSeq = 0;

    function orbColors(it) {
        var pal = ORB_PALETTES[it.palette] || ORB_PALETTES.lavender;
        var c = Object.assign({}, pal);
        ['top', 'bottom', 'ring', 'moon', 'cloud', 'glow'].forEach(function (k) {
            var v = it.orb && it.orb[k];
            if (/^#[0-9a-f]{6}$/i.test(v || '')) c[k] = v;
        });
        return c;
    }

    /** موجة: من -200 لين 400 (طولها 600 = 3 دورات قابلة للتكرار)، y = 0 عند القمة. */
    function wavePath(amp) {
        var d = 'M-200 0';
        for (var x = -200; x < 400; x += 100) d += ' q25 ' + (-amp) + ' 50 0 t50 0';
        return d + ' L400 260 L-200 260 Z';
    }

    function buildOrb(node, it, preview) {
        var id = 'agpso' + (++orbSeq);
        var c = orbColors(it);
        var sp = ORB_SPEEDS[it.speed] || 1;
        node.className = node.className.replace(/(^|\s)d-\w+/g, '') + ' d-orb';
        if (it.title) node.appendChild(el('div', 'agp-so-otitle', it.title));
        var wrap = el('div', 'agp-so-orb');
        wrap.style.setProperty('--og', c.glow);
        wrap.style.setProperty('--osp', sp);
        var stars = '';
        [[132, 62, 3.4, 0], [158, 98, 2.6, 1.2], [118, 112, 2.2, 2.1], [150, 128, 2.8, .6], [86, 56, 2, 1.7], [168, 140, 1.8, 2.6], [70, 92, 1.6, .9]].forEach(function (s, i) {
            stars += i === 0
                ? '<path class="agp-so-otw" style="animation-delay:-' + s[3] + 's" d="M' + s[0] + ' ' + (s[1] - 14) + 'q2 12 14 14q-12 2 -14 14q-2 -12 -14 -14q12 -2 14 -14z" fill="#fff"/>'
                : '<circle class="agp-so-otw" style="animation-delay:-' + s[3] + 's" cx="' + s[0] + '" cy="' + s[1] + '" r="' + s[2] / 1.6 + '" fill="#fff"/>';
        });
        stars += '<path class="agp-so-otw" style="animation-delay:-1.4s" d="M126 104q1.2 6 7 7q-5.8 1 -7 7q-1.2 -6 -7 -7q5.8 -1 7 -7z" fill="#fff"/>';
        var bubbles = '';
        if (it.bubbles !== false) {
            [[62, 9, 0], [96, 7, 2.2], [128, 11, 1.1], [146, 8, 3.1], [80, 10, 4.2], [112, 6, 5]].forEach(function (b) {
                bubbles += '<circle class="agp-so-obub" style="animation-delay:-' + b[2] + 's;animation-duration:' + (b[1] * 0.75) + 's" cx="' + b[0] + '" cy="196" r="' + (2 + b[1] / 5) + '"/>';
            });
        }
        wrap.innerHTML =
            '<svg viewBox="0 0 200 200" aria-hidden="true">' +
            '<defs>' +
            '<clipPath id="' + id + 'c"><circle cx="100" cy="100" r="88"/></clipPath>' +
            '<linearGradient id="' + id + 'l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c.top + '"/><stop offset="1" stop-color="' + c.bottom + '"/></linearGradient>' +
            '<linearGradient id="' + id + 'r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c.ring + '"/><stop offset=".5" stop-color="' + c.glow + '"/><stop offset="1" stop-color="' + c.ring + '"/></linearGradient>' +
            '<linearGradient id="' + id + 'm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="' + c.moon + '"/></linearGradient>' +
            '<mask id="' + id + 'k"><rect width="200" height="200" fill="#000"/><circle cx="92" cy="100" r="54" fill="#fff"/><circle cx="116" cy="88" r="46" fill="#000"/></mask>' +
            '<radialGradient id="' + id + 'g" cx=".5" cy=".5" r=".5"><stop offset=".7" stop-color="' + c.glow + '" stop-opacity="0"/><stop offset="1" stop-color="' + c.glow + '" stop-opacity=".55"/></radialGradient>' +
            '</defs>' +
            '<g clip-path="url(#' + id + 'c)">' +
            '<rect width="200" height="200" fill="#07050f"/>' +
            '<circle cx="100" cy="100" r="88" fill="url(#' + id + 'g)"/>' +
            stars +
            '<g class="agp-so-omoon"><rect width="200" height="200" fill="url(#' + id + 'm)" mask="url(#' + id + 'k)"/></g>' +
            '<g class="agp-so-ocloud" fill="' + c.cloud + '" stroke="' + c.ring + '" stroke-opacity=".35" stroke-width="1.2">' +
            '<path d="M8 150c0-14 12-24 26-22 4-12 20-17 30-8 8-8 24-5 27 7 12-2 22 8 20 20 10 1 16 10 14 19H8z"/>' +
            '<path d="M120 172c-1-10 8-17 17-15 5-9 18-10 24-2 9-4 20 3 19 13 7 2 12 8 11 15h-71z"/>' +
            '</g>' +
            // السائل: مجموعة تنزل/تطلع حسب النسبة، وفيها موجتين تتحرك عكس بعض
            '<g class="agp-so-olvl" style="transform:translateY(200px)">' +
            '<g class="agp-so-ow2"><path d="' + wavePath(5) + '" fill="' + c.top + '" opacity=".65"/></g>' +
            '<g class="agp-so-ow1"><path d="' + wavePath(7) + '" fill="url(#' + id + 'l)" opacity=".94"/></g>' +
            '<g class="agp-so-obubs" fill="#fff" fill-opacity=".55">' + bubbles + '</g>' +
            '</g>' +
            // لمعة الزجاج
            '<path d="M38 70a66 66 0 0 1 46-46" stroke="#fff" stroke-opacity=".28" stroke-width="5" stroke-linecap="round" fill="none"/>' +
            '<path d="M34 92a68 68 0 0 1 3-10" stroke="#fff" stroke-opacity=".22" stroke-width="4" stroke-linecap="round" fill="none"/>' +
            '</g>' +
            '<circle class="agp-so-oring" cx="100" cy="100" r="90" fill="none" stroke="url(#' + id + 'r)" stroke-width="3.2"/>' +
            '</svg>';
        node.appendChild(wrap);
        var nums = el('div', 'agp-so-onums');
        node.appendChild(nums);
        node._orb = { it: it, preview: preview, wrap: wrap, lvl: wrap.querySelector('.agp-so-olvl'), nums: nums, pct: -1, sig: JSON.stringify([it.palette, it.orb, it.speed, it.bubbles, it.title]) };
        paintOrb(node, false);
    }

    /** تجربة بالمحرر: السائل يطلع لنسبة p (مع موجة)، ويرجع للحقيقي بعد 4 ثواني. */
    function orbDemo(node, p) {
        var o = node && node._orb;
        if (!o) return;
        clearTimeout(o.demoT);
        o.lvl.style.transform = 'translateY(' + (190 - clamp(p, 0, 1) * 182).toFixed(1) + 'px)';
        o.wrap.classList.remove('bump'); void o.wrap.offsetWidth; o.wrap.classList.add('bump');
        o.wrap.classList.toggle('full', p >= 1);
        o.demoT = setTimeout(function () { o.pct = -1; paintOrb(node, false); }, 4000);
    }

    /** يحدّث مستوى السائل والأرقام (بدون ما يعيد بناء الرسمة — الموج يكمل حركته). */
    function paintOrb(node, animate) {
        var o = node._orb, it = o.it;
        var m = METRICS[it.metric] ? it.metric : 'diamonds';
        var tt = totalsFor(o.preview);
        var cur = Number(tt.t[m]) || 0;
        var target = Math.max(1, Number(it.target) || 1000);
        if (it.autoNext && cur >= target) target = target * (Math.floor(cur / target) + 1);
        var pct = clamp(cur / target, 0, 1);
        // بالمعاينة بدون بيانات: نص الكرة عشان يبان شكل السائل
        if (tt.ghost) pct = 0.55;
        // المستوى: 0٪ = تحت الدائرة (y 190)، 100٪ = فوقها (y 8)
        var y = 190 - pct * 182;
        o.lvl.style.transform = 'translateY(' + y.toFixed(1) + 'px)';
        if (animate && o.pct >= 0 && pct > o.pct) {
            o.wrap.classList.remove('bump'); void o.wrap.offsetWidth; o.wrap.classList.add('bump');
        }
        o.wrap.classList.toggle('full', pct >= 1);
        o.pct = pct;
        o.nums.textContent = '';
        if (it.showNums !== false) {
            var done = cur >= target && !it.autoNext;
            o.nums.appendChild(icon(METRICS[m].icon));
            o.nums.appendChild(el('span', null, done ? 'اكتمل! ' + fmtKind(m, cur) : fmtKind(m, cur) + ' / ' + fmtKind(m, target)));
            if (it.showPct) o.nums.appendChild(el('b', null, Math.floor(pct * 100) + '%'));
        }
        node.classList.toggle('agp-so-ghost', Boolean(tt.ghost));
    }

    function fillGoal(node, it, preview) {
        if (it.design === 'orb') { buildOrb(node, it, preview); return; }
        var m = METRICS[it.metric] ? it.metric : 'likes';
        var tt = totalsFor(preview);
        var cur = Number(tt.t[m]) || 0;
        var target = Math.max(1, Number(it.target) || 1000);
        // «يكمّل تلقائياً»: لما يوصل الهدف ينتقل للهدف اللي بعده بنفس الخطوة
        if (it.autoNext && cur >= target) target = target * (Math.floor(cur / target) + 1);
        var pct = clamp(cur / target, 0, 1);
        var done = cur >= target;
        var design = it.design === 'ring' ? 'ring' : 'bar';
        node.className = node.className.replace(/(^|\s)d-\w+/g, '') + ' d-' + design + (done ? ' agp-so-done' : '') + (tt.ghost ? ' agp-so-ghost' : '');
        title(node, it.title);
        var nums = el('span', 'agp-so-gnums');
        nums.appendChild(icon(METRICS[m].icon));
        nums.appendChild(el('span', null, done && !it.autoNext ? 'اكتمل الهدف! ' + fmtKind(m, cur) : fmtKind(m, cur) + ' / ' + fmtKind(m, target)));
        if (design === 'ring') {
            var ring = el('div', 'agp-so-ring');
            ring.style.setProperty('--p', (pct * 100).toFixed(1));
            ring.appendChild(el('span', 'agp-so-rpct', Math.floor(pct * 100) + '%'));
            node.appendChild(ring);
            node.appendChild(nums);
        } else {
            var bar = el('div', 'agp-so-gbar');
            var fill = el('div', 'agp-so-gfill');
            fill.style.width = (pct * 100).toFixed(1) + '%';
            bar.appendChild(fill);
            bar.appendChild(nums);
            node.appendChild(bar);
        }
    }

    function fillCounter(node, it, preview) {
        var tt = totalsFor(preview);
        var design = it.design === 'big' || it.design === 'stack' ? it.design : 'pills';
        node.className = node.className.replace(/(^|\s)d-\w+/g, '') + ' d-' + design + (tt.ghost ? ' agp-so-ghost' : '');
        title(node, it.title);
        var box = el('div', 'agp-so-cbox');
        (Array.isArray(it.metrics) && it.metrics.length ? it.metrics : ['likes']).forEach(function (m) {
            if (!METRICS[m]) return;
            var c = el('div', 'agp-so-cm');
            c.appendChild(icon(METRICS[m].icon));
            c.appendChild(el('span', 'agp-so-cnum', fmt(tt.t[m])));
            c.appendChild(el('span', 'agp-so-cunit', METRICS[m].unit));
            box.appendChild(c);
        });
        node.appendChild(box);
    }

    /**
     * عنصر جاهز للرسم داخل إطار F. opts.preview = معاينة الاستوديو (بيانات
     * تجريبية باهتة لما ما فيه بث).
     */
    function buildItem(it, F, opts) {
        var preview = Boolean(opts && opts.preview);
        var n = document.createElement('div');
        n.className = 'agp-so-item';
        n.setAttribute('data-id', it.id);
        n.style.fontSize = ((Number(it.size) || 5) * Math.min(F.w, F.h) / 100) + 'px';
        if (it.type === 'text') {
            var f = fontOf(it.font || DEFAULT_FONT);
            loadFont(f);
            n.className += ' agp-so-text';
            var tx = document.createElement('span');
            tx.className = 'agp-so-tx s-' + (it.style || 'outline');
            tx.style.color = it.color || '#fff';
            tx.style.setProperty('--agp-so-c', it.color || '#fff');
            tx.style.fontFamily = fontStack(f);
            tx.style.fontWeight = String(f.b);
            // الحركة على غلاف منفصل عن التأثير، عشان ما تلغي حركة «قوس قزح» ولا فلاتر التأثير
            var mv = document.createElement('span');
            mv.className = 'agp-so-mv';
            mv.style.setProperty('--agp-so-c', it.color || '#fff');
            var an = ANIMS.filter(function (a) { return a.key === it.anim; })[0];
            if (an && an.d) {
                mv.className += ' a-' + an.key;
                mv.style.animationDuration = (an.d * (Number(it.speed) || 1)) + 's';
            }
            tx.textContent = it.text || ' ';
            if (it.banner === 'peek') mv.appendChild(buildBanner(it, tx));
            else mv.appendChild(tx);
            n.appendChild(mv);
        } else {
            n.className += ' agp-so-widget agp-so-' + it.type;
            n.style.setProperty('--agp-so-c', it.color || '#ffd54a');
            if (it.type === 'top') fillTop(n, it, preview);
            else if (it.type === 'goal') fillGoal(n, it, preview);
            else if (it.type === 'counter') fillCounter(n, it, preview);
            else if (it.type === 'jar') buildJar(n, it, preview);
            else if (it.type === 'alert') buildAlert(n, it, preview);
            else if (it.type === 'icon') buildIcon(n, it);
            else if (it.type === 'shape') buildShape(n, it);
            else if (it.type === 'lastdonation') buildLastDonation(n, it, preview);
            else if (it.type === 'tts') buildTts(n, it, preview);
            else if (it.type === 'music') buildMusic(n, it, preview);
        }
        return n;
    }

    /* ---------------- النص داخل «لوحة الأصدقاء» ---------------- */
    /*
     * لوحة بلون فاتح بخطين نقط فوقها وتحتها، وفوقها شخصيتين (أرنب وقطة، رسم أصلي) يطلّون ويرمشون.
     * التخصيص: bnColor (اللوحة)، bnDots (النقط)، bnBunny/bnKitten (لون الشخصيات)، bnChars (الاثنين/أرنب/قطة/بدون)،
     * bnPos (يمين/وسط/يسار)، bnCharAnim (تطل/ثابتة)، bnBg (حركة الخلفية)، bnMotion (حركة النص)، bnWidth، bnRound.
     */
    var BN_BG = ['none', 'shimmer', 'sparkle', 'gradient', 'breathe', 'bubbles'];
    var BN_MOTIONS = ['static', 'marquee', 'type', 'pop', 'float'];
    // خامات اللوحة (شكل حقيقي، مو واجهة إلكترونية) ولونها الأصلي
    var BN_MATS = { velvet: '#a98bcf', linen: '#e6dccb', wood: '#9a6a3e', leather: '#6e4128', paper: '#efe5d3', satin: '#c9b3e0' };
    var BN_TFX = ['deboss', 'emboss', 'foil', 'plain'];
    /** ملمس الخامة: ضجيج SVG كصورة خلفية (نقط غامقة شفافة). f = التردد، a = الكثافة. */
    function BN_NOISE(f, oct, a, w, h) {
        w = w || 180; h = h || 180;
        var svgS = "<svg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='" + h + "'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='" + f + "' numOctaves='" + oct + "' stitchTiles='stitch'/>" +
            "<feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  " + a + " 0 0 0 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>";
        return 'url("data:image/svg+xml,' + encodeURIComponent(svgS).replace(/'/g, '%27') + '")';
    }
    var bnSeq = 0;
    /** فلتر الفرو: يخلي الحواف ناعمة شعرية، ويضيف ملمس خفيف فوق اللون. */
    function bnFur(id, scale) {
        return '<filter id="' + id + 'f" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" result="n"/>' +
            '<feDisplacementMap in="SourceGraphic" in2="n" scale="' + scale + '" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
            '<feTurbulence type="fractalNoise" baseFrequency="1.6 .35" numOctaves="2" seed="7" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -.9 .62" result="ta"/>' +
            '<feComposite in="ta" in2="d" operator="in" result="tx"/><feMerge><feMergeNode in="d"/><feMergeNode in="tx"/></feMerge></filter>';
    }
    /** عين واقعية: قزحية بتدرّج، بؤبؤ، حد غامق، ولمعتين. */
    function bnEye(id, cx, cy, rx, ry, slit) {
        return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rx + 1.2) + '" ry="' + (ry + 1.2) + '" fill="#1d120c" opacity=".85"/>' +
            '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="url(#' + id + 'i)"/>' +
            (slit ? '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rx * .26) + '" ry="' + (ry * .82) + '" fill="#0a0604"/>' : '<circle cx="' + cx + '" cy="' + cy + '" r="' + (rx * .55) + '" fill="#0a0604"/>') +
            '<path d="M' + (cx - rx) + ' ' + (cy - ry * .2) + 'Q' + cx + ' ' + (cy - ry * 1.25) + ' ' + (cx + rx) + ' ' + (cy - ry * .2) + '" fill="#000" opacity=".22"/>' +
            '<ellipse cx="' + (cx + rx * .32) + '" cy="' + (cy - ry * .38) + '" rx="' + (rx * .26) + '" ry="' + (ry * .2) + '" fill="#fff" opacity=".95"/>' +
            '<circle cx="' + (cx - rx * .35) + '" cy="' + (cy + ry * .4) + '" r="' + (rx * .1) + '" fill="#fff" opacity=".7"/>';
    }
    function bnWhisk(cx, cy, dir) {
        var o = '';
        [[-4, -1], [0, 0], [4, 1.5]].forEach(function (w) { o += '<path d="M' + cx + ' ' + (cy + w[0] * .4) + 'q' + (dir * 14) + ' ' + (w[0] - 2) + ' ' + (dir * 26) + ' ' + (w[0] * 1.6 + w[1]) + '"/>'; });
        return '<g stroke="#fff" stroke-width=".55" fill="none" opacity=".85" stroke-linecap="round">' + o + '</g>';
    }
    /** القطة (رأس فقط — يطلّ من ورا اللوحة). اللون --bnk. */
    function bnKittenHead(id) {
        return '<svg viewBox="0 0 120 104" aria-hidden="true"><defs>' + bnFur(id, 2.6) +
            '<radialGradient id="' + id + 'g" cx="50%" cy="62%" r="62%"><stop offset="0" stop-color="#fff6ea"/><stop offset=".42" style="stop-color:color-mix(in srgb,var(--bnk) 70%,#fff)"/><stop offset=".78" style="stop-color:var(--bnk)"/><stop offset="1" style="stop-color:color-mix(in srgb,var(--bnk) 62%,#5a2a0a)"/></radialGradient>' +
            '<radialGradient id="' + id + 'i" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#e8f7a0"/><stop offset=".5" stop-color="#9cc23a"/><stop offset="1" stop-color="#47621a"/></radialGradient>' +
            '<linearGradient id="' + id + 'e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6b8c4"/><stop offset="1" stop-color="#d98896"/></linearGradient></defs>' +
            '<g filter="url(#' + id + 'f)">' +
            '<path d="M22 56 27 10Q30 6 34 9L56 36Z" fill="url(#' + id + 'g)"/><path d="M98 56 93 10Q90 6 86 9L64 36Z" fill="url(#' + id + 'g)"/>' +
            '<path d="M29 46 31 18Q32 16 34 18L48 36Z" fill="url(#' + id + 'e)" opacity=".85"/><path d="M91 46 89 18Q88 16 86 18L72 36Z" fill="url(#' + id + 'e)" opacity=".85"/>' +
            '<path d="M60 26C88 26 104 44 104 66 104 88 86 104 60 104S16 88 16 66C16 44 32 26 60 26Z" fill="url(#' + id + 'g)"/>' +
            '<g style="fill:color-mix(in srgb,var(--bnk) 45%,#5a2a0a)" opacity=".55"><path d="M60 28c-2 6-2 12 0 18 2-6 2-12 0-18z"/><path d="M50 30c-3 5-3 10-1 15 2-5 3-10 1-15z"/><path d="M70 30c3 5 3 10 1 15-2-5-3-10-1-15z"/><path d="M19 64c6-1 11 0 15 2-5 1-10 0-15-2z"/><path d="M101 64c-6-1-11 0-15 2 5 1 10 0 15-2z"/></g>' +
            '<ellipse cx="51" cy="82" rx="12" ry="9" fill="#fffaf3" opacity=".92"/><ellipse cx="69" cy="82" rx="12" ry="9" fill="#fffaf3" opacity=".92"/><ellipse cx="60" cy="90" rx="9" ry="6" fill="#fffaf3" opacity=".8"/></g>' +
            // خياطة الدمية: خط بالنص وحول الخدود
            '<g fill="none" stroke-dasharray="2.2 1.8" stroke-width=".9" stroke-linecap="round" style="stroke:color-mix(in srgb,var(--bnk) 55%,#3a1a08)" opacity=".75"><path d="M60 27v18"/><path d="M37 88q23 14 46 0"/></g>' +
            '<g class="ey">' + bnEye(id, 44, 62, 8.4, 8, true) + bnEye(id, 76, 62, 8.4, 8, true) + '</g>' +
            '<path d="M55 74Q60 71.5 65 74Q63 79 60 80Q57 79 55 74Z" fill="url(#' + id + 'e)"/><g stroke="#b45a6e" stroke-width=".55" opacity=".7"><path d="M56.6 74.4 60 79.2M58 73.6l2 5.6M60 73.4v5.8M62 73.6l-2 5.6M63.4 74.4 60 79.2"/></g>' +
            '<path d="M60 80v3.4M60 83.4q-3.6 3.6-7.4 1M60 83.4q3.6 3.6 7.4 1" stroke="#4a2c1c" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
            bnWhisk(48, 82, -1) + bnWhisk(72, 82, 1) + '</svg>';
    }
    /** الأرنب (رأس وأذنين — يطلّ من ورا اللوحة). اللون --bnr. */
    function bnBunnyHead(id) {
        return '<svg viewBox="0 0 120 150" aria-hidden="true"><defs>' + bnFur(id, 2.4) +
            '<radialGradient id="' + id + 'g" cx="50%" cy="58%" r="60%"><stop offset="0" stop-color="#fff"/><stop offset=".6" style="stop-color:var(--bnr)"/><stop offset="1" style="stop-color:color-mix(in srgb,var(--bnr) 72%,#6a5a70)"/></radialGradient>' +
            '<radialGradient id="' + id + 'i" cx="42%" cy="38%" r="65%"><stop offset="0" stop-color="#7a5040"/><stop offset=".55" stop-color="#3a2218"/><stop offset="1" stop-color="#140a06"/></radialGradient>' +
            '<linearGradient id="' + id + 'e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8c6d2" stop-opacity=".75"/><stop offset=".6" stop-color="#f2a3b8"/><stop offset="1" stop-color="#e48aa2"/></linearGradient></defs>' +
            '<g filter="url(#' + id + 'f)">' +
            '<g class="ear"><path d="M46 78C34 50 32 14 42 5c10-8 18 30 16 70z" fill="url(#' + id + 'g)"/><path d="M47 70C39 48 38 20 44 13c6-5 10 25 9 55z" fill="url(#' + id + 'e)"/></g>' +
            '<g class="ear ear-r"><path d="M74 78c10-28 14-62 6-72-9-9-19 28-18 70z" fill="url(#' + id + 'g)"/><path d="M73 70c7-22 10-48 5-56-6-6-11 23-11 54z" fill="url(#' + id + 'e)"/></g>' +
            '<path d="M60 64C86 64 98 82 98 102 98 124 82 140 60 140S22 124 22 102C22 82 34 64 60 64Z" fill="url(#' + id + 'g)"/>' +
            '<ellipse cx="50" cy="116" rx="13" ry="10" fill="#fff" opacity=".9"/><ellipse cx="70" cy="116" rx="13" ry="10" fill="#fff" opacity=".9"/></g>' +
            '<g stroke="#e8a9bb" stroke-width=".5" opacity=".55" fill="none"><path d="M46 62C42 46 41 30 44 20"/><path d="M75 62c3-16 5-32 3-42"/></g>' +
            '<g fill="none" stroke-dasharray="2.2 1.8" stroke-width=".9" stroke-linecap="round" stroke="#b9a9b8" opacity=".8"><path d="M60 66v20"/><path d="M38 122q22 12 44 0"/></g>' +
            '<g class="ey">' + bnEye(id, 42, 98, 7, 7.6, false) + bnEye(id, 78, 98, 7, 7.6, false) + '</g>' +
            '<path d="M56 110q4-2.6 8 0-1.6 3.4-4 3.6-2.4-.2-4-3.6z" fill="url(#' + id + 'e)"/><g stroke="#c0607a" stroke-width=".5" opacity=".7"><path d="M57 110.2 60 113.4M58.6 109.4l1.4 4M60 109.2v4.4M61.4 109.4l-1.4 4M63 110.2 60 113.4"/></g>' +
            '<path d="M60 113.6v3M60 116.6q-3 3-6.4 1M60 116.6q3 3 6.4 1" stroke="#7a5a62" stroke-width="1" fill="none" stroke-linecap="round"/>' +
            bnWhisk(49, 116, -1) + bnWhisk(71, 116, 1) + '</svg>';
    }
    /** كفّين على حافة اللوحة (فوقها)، مع ظل تلامس. fill = لون الحيوان. */
    function bnPawsSvg(id, fill) {
        var paw = function (x) {
            return '<path d="M' + (x - 11) + ' 22C' + (x - 12) + ' 9 ' + (x - 6) + ' 4 ' + x + ' 4S' + (x + 12) + ' 9 ' + (x + 11) + ' 22Z" fill="url(#' + id + 'p)"/>' +
                '<path d="M' + (x - 3.6) + ' 22v-5M' + (x + 3.6) + ' 22v-5" stroke="#000" stroke-opacity=".18" stroke-width="1.1" stroke-linecap="round"/>';
        };
        return '<svg viewBox="0 0 120 26" aria-hidden="true"><defs>' + bnFur(id, 1.8) +
            '<linearGradient id="' + id + 'p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" style="stop-color:color-mix(in srgb,' + fill + ' 85%,#fff)"/><stop offset="1" style="stop-color:color-mix(in srgb,' + fill + ' 80%,#5a4a50)"/></linearGradient>' +
            '<filter id="' + id + 's" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2"/></filter></defs>' +
            '<ellipse cx="42" cy="23" rx="13" ry="3" fill="#000" opacity=".28" filter="url(#' + id + 's)"/><ellipse cx="78" cy="23" rx="13" ry="3" fill="#000" opacity=".28" filter="url(#' + id + 's)"/>' +
            '<g filter="url(#' + id + 'f)">' + paw(42) + paw(78) + '</g></svg>';
    }

    function buildBanner(it, tx) {
        var hex = function (v) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : null; };
        var bg = it.bnBg === 'dots' ? 'sparkle' : BN_BG.indexOf(it.bnBg) !== -1 ? it.bnBg : 'none';
        var mo = BN_MOTIONS.indexOf(it.bnMotion) !== -1 ? it.bnMotion : 'static';
        var mat = BN_MATS[it.bnMat] ? it.bnMat : 'velvet';
        var tfx = BN_TFX.indexOf(it.bnTextFx) !== -1 ? it.bnTextFx : (mat === 'satin' ? 'plain' : mat === 'linen' || mat === 'paper' ? 'deboss' : mat === 'velvet' ? 'emboss' : 'deboss');
        var b = el('span', 'agp-so-bn bg-' + bg + ' m-' + mo + ' mt-' + mat + ' tf-' + tfx + ' r-' + (['sharp', 'soft', 'round'].indexOf(it.bnRound) !== -1 ? it.bnRound : 'soft'));
        b.style.setProperty('--bnc', BN_MATS[mat]);
        if (hex(it.bnStitch)) b.style.setProperty('--bns', it.bnStitch);
        [['bnColor', '--bnc'], ['bnBunny', '--bnr'], ['bnKitten', '--bnk']].forEach(function (c) {
            if (hex(it[c[0]])) b.style.setProperty(c[1], it[c[0]]);
        });
        if (Number(it.bnWidth) > 0) b.style.setProperty('--bnw', Math.min(40, Number(it.bnWidth)) + 'em');
        var who = ['both', 'bunny', 'kitten', 'none'].indexOf(it.bnChars) !== -1 ? it.bnChars : 'both';
        var pos = ['right', 'center', 'left'].indexOf(it.bnPos) !== -1 ? it.bnPos : 'center';
        var list = who === 'none' ? [] : who === 'bunny' ? ['bunny'] : who === 'kitten' ? ['kitten'] : ['kitten', 'bunny'];
        // الرؤوس ورا اللوحة (تطل من فوقها)، والكفوف فوق حافتها
        var heads = el('span', 'bn-ch bn-heads p-' + pos + (it.bnCharAnim === 'still' ? ' still' : ''));
        var paws = el('span', 'bn-ch bn-paws p-' + pos);
        list.forEach(function (k) {
            var id = 'agp-so-bn' + (++bnSeq);
            var h = el('span', 'bn-c ' + k);
            h.innerHTML = k === 'bunny' ? bnBunnyHead(id) : bnKittenHead(id);
            heads.appendChild(h);
            var pw = el('span', 'bn-pw ' + k);
            pw.innerHTML = bnPawsSvg(id + 'p', k === 'bunny' ? 'var(--bnr)' : 'var(--bnk)');
            paws.appendChild(pw);
        });
        if (list.length) b.appendChild(heads);
        var bar = el('span', 'bn-bar');
        if (bg === 'bubbles' || bg === 'sparkle') {
            var bw = el('span', bg === 'bubbles' ? 'bn-bub' : 'bn-spk');
            for (var k = 0; k < 7; k++) {
                var c = el('i');
                c.style.left = (8 + k * 13 + seeded(k + 3) * 6) + '%';
                c.style.animationDelay = (-seeded(k + 9) * 5).toFixed(2) + 's';
                c.style.animationDuration = (bg === 'bubbles' ? 3.5 + seeded(k + 20) * 2.5 : 1.8 + seeded(k + 20) * 1.6).toFixed(2) + 's';
                if (bg === 'sparkle') c.style.top = (18 + seeded(k + 40) * 64) + '%';
                var z = (bg === 'bubbles' ? .25 + seeded(k + 30) * .35 : .3 + seeded(k + 30) * .25).toFixed(2) + 'em';
                c.style.width = c.style.height = z;
                bw.appendChild(c);
            }
            bar.appendChild(bw);
        }
        // تفاصيل الخامة: خياطة (مخمل/كتان/جلد)، مسامير نحاس (خشب)، إطار ذهبي (ورق)
        if (mat === 'velvet' || mat === 'linen' || mat === 'leather') bar.appendChild(el('span', 'bn-stitch'));
        else if (mat === 'paper') bar.appendChild(el('span', 'bn-foil'));
        else if (mat === 'wood') ['tl', 'tr', 'bl', 'br'].forEach(function (k) { bar.appendChild(el('span', 'bn-nail ' + k)); });
        var tw = el('span', 'bn-tw');
        tx.className = 'agp-so-tx s-plain bn-t';
        if (mo === 'marquee') {
            var tr = el('span', 'bn-track');
            tr.appendChild(tx);
            tr.appendChild(tx.cloneNode(true));
            tw.appendChild(tr);
        } else {
            tw.appendChild(tx);
            if (mo === 'type') tx.appendChild(el('span', 'bn-cur'));
        }
        bar.appendChild(tw);
        b.appendChild(bar);
        if (list.length) b.appendChild(paws);
        return b;
    }

    /* ---------------- وعاء الهدايا: الرسم ---------------- */

    /** رقم شبه عشوائي ثابت لكل صورة (ميلان وإزاحة ما يتغيّرون مع كل رسم). */
    function hash(str) {
        var h = 2166136261;
        for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return ((h >>> 0) % 1000) / 1000;
    }

    function jarIcon(ic) {
        var g = el('span', 'agp-so-gi');
        var r = Math.round((hash(ic.k + 'r') - 0.5) * 50);
        g.style.setProperty('--r', r + 'deg');
        function letter() { g.textContent = ''; g.classList.add('fb'); g.appendChild(el('span', null, (ic.name || '?').charAt(0))); }
        if (ic.img || ic.giftId) g.appendChild(img2(ic.img, mediaUrl('g', ic.giftId), 'agp-so-gimg', letter));
        else letter();
        return g;
    }

    /** يرتّب الصور من تحت لفوق (7 بالصف، صفوف متداخلة شوي) بإزاحة وميلان ثابتين. */
    function layoutJar(pile, list) {
        var W = 8.06, G = JAR_G, STEP = G * 0.82;
        var span = (W - G) / (JAR_COLS - 1);
        list.forEach(function (ic, i) {
            var node = pile._icons[ic.k];
            var row = Math.floor(i / JAR_COLS), col = i % JAR_COLS;
            var x = col * span + (row % 2 ? span / 2 : 0) + (hash(ic.k + 'x') - 0.5) * 0.3;
            node.style.left = clamp(x, 0, W - G) + 'em';
            node.style.bottom = (row * STEP + (hash(ic.k + 'y') - 0.5) * 0.12) + 'em';
        });
    }

    /** يحدّث صور الوعاء: يشيل اللي طلع ويضيف الجديد (fresh = يطيح من فوق). */
    function paintJarNode(node, fresh, preview) {
        var pile = node.querySelector('.agp-so-jpile');
        if (!pile) return;
        var real = jar.icons;
        var ghost = !real.length && !jarDemo.length && preview;
        var list = real.concat(preview ? jarDemo : []);
        if (ghost) {
            list = [];
            for (var i = 0; i < 24; i++) list.push({ k: 'sample-' + i, img: SAMPLE_GIFT_SVGS[i % SAMPLE_GIFT_SVGS.length], name: '' });
        }
        if (list.length > JAR_CAP) list = list.slice(list.length - JAR_CAP);
        pile.classList.toggle('agp-so-ghost', ghost);
        pile._icons = pile._icons || {};
        var keep = {};
        list.forEach(function (ic) { keep[ic.k] = true; });
        Object.keys(pile._icons).forEach(function (k) {
            if (!keep[k]) { pile.removeChild(pile._icons[k]); delete pile._icons[k]; }
        });
        var delay = 0;
        list.forEach(function (ic) {
            if (pile._icons[ic.k]) return;
            var g = jarIcon(ic);
            if (fresh && fresh.indexOf(ic.k) !== -1) {
                g.classList.add('drop');
                g.style.animationDelay = delay + 'ms';
                delay = Math.min(delay + 140, 2000);
            }
            pile._icons[ic.k] = g;
            pile.appendChild(g);
        });
        layoutJar(pile, list);
        var it = node._item;
        var cnt = node.querySelector('.agp-so-jcount');
        if (cnt && it) {
            var tt = jar.totals || (preview ? { diamonds: 860, gifts: 57 } : { diamonds: 0, gifts: 0 });
            cnt.textContent = '';
            if (it.counter === 'gifts') { cnt.appendChild(icon('gift')); cnt.appendChild(el('span', null, fmt(tt.gifts) + ' هدية')); }
            else { cnt.appendChild(icon('diamond')); cnt.appendChild(el('span', null, fmt(tt.diamonds))); }
        }
    }

    function paintJars(fresh) {
        jarNodes = jarNodes.filter(function (j) { return j.node.isConnected; });
        jarNodes.forEach(function (j) { paintJarNode(j.node, fresh, j.preview); });
    }

    function buildJar(n, it, preview) {
        n.className += ' agp-so-jar';
        n._item = it;
        title(n, it.title);
        var wrap = el('div', 'agp-so-jwrap');
        wrap.appendChild(el('div', 'agp-so-jlid'));
        wrap.appendChild(el('div', 'agp-so-jneck'));
        var glass = el('div', 'agp-so-jglass');
        glass.appendChild(el('div', 'agp-so-jpile'));
        wrap.appendChild(glass);
        n.appendChild(wrap);
        if (it.counter !== 'none') n.appendChild(el('div', 'agp-so-jcount'));
        jarNodes = jarNodes.filter(function (j) { return j.node.isConnected; });
        jarNodes.push({ node: n, preview: preview });
        paintJarNode(n, null, preview);
    }

    /* ---------------- أيقونة وشكل ---------------- */

    function animate(mv, it) {
        var an = ANIMS.filter(function (a) { return a.key === it.anim; })[0];
        if (an && an.d) {
            mv.className += ' a-' + an.key;
            mv.style.animationDuration = (an.d * (Number(it.speed) || 1)) + 's';
        }
    }

    function buildIcon(n, it) {
        var mv = el('span', 'agp-so-mv');
        mv.style.setProperty('--agp-so-c', it.color || '#ffd54a');
        animate(mv, it);
        if (it.emoji) {
            mv.appendChild(el('span', 'agp-so-emoji', String(it.emoji).slice(0, 8)));
        } else {
            var g = el('span', 'agp-so-glyph' + (it.glow ? ' glow' : ''));
            g.style.color = it.color || '#ffd54a';
            g.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true">' + (ICON_SET[it.icon] || ICON_SET.star).p + '</svg>';
            mv.appendChild(g);
        }
        n.appendChild(mv);
    }

    function buildShape(n, it) {
        var sh = SHAPES.filter(function (x) { return x.key === it.shape; })[0] || SHAPES[1];
        var fill = SHAPE_FILLS.filter(function (x) { return x.key === it.fill; })[0] || SHAPE_FILLS[0];
        var b = el('div', 'agp-so-sbox f-' + fill.key);
        b.style.width = clamp(Number(it.w) || 40, 1, 200) + 'em';
        b.style.height = (sh.key === 'circle' ? clamp(Number(it.w) || 40, 1, 200) : clamp(Number(it.h) || 20, 0.5, 200)) + 'em';
        b.style.borderRadius = sh.r;
        b.style.opacity = String(clamp(Number(it.opacity) || 0.9, 0.05, 1));
        n.appendChild(b);
    }

    /* ---------------- الأليرتات ---------------- */

    var alertNodes = [];   // { node, preview } — أدوات الأليرتات المرسومة حالياً
    var alertQ = {};       // itemId -> { list: [ev], busy: bool }
    var evState = { init: false, sid: 0, seq: 0, timer: null, inflight: false, tinit: false, tseq: 0, tests: [] };
    var audioCtx = null;

    function sampleEvent(type) {
        var names = ['أبو فهد', 'نوره', 'سلطان', 'ريم'];
        var e = { type: type, user: names[Math.floor(Math.random() * names.length)], avatar: null, at: Date.now(), demo: true };
        if (type === 'gift') {
            var g = Math.floor(Math.random() * SAMPLE_GIFT_SVGS.length);
            e.gift = ['وردة', 'قلب', 'نجمة', 'تاج', 'ماسة', 'صندوق'][g];
            e.img = SAMPLE_GIFT_SVGS[g];
            e.count = [1, 5, 10][Math.floor(Math.random() * 3)];
            e.diamonds = e.count * 5;
        }
        if (type === 'like') { e.count = 100; e.total = 100; e.all = 100; e.allPrev = 0; }
        if (type === 'join' || type === 'subscribe') e.uid = 'demo';
        if (type === 'donation') { e.amount = [5, 25, 100][Math.floor(Math.random() * 3)]; e.currency = 'USD'; e.message = 'كفو والله، استمر 💜'; }
        return e;
    }

    function fillMsg(tpl, e) {
        return String(tpl || '').replace(/\{name\}/g, e.user || '').replace(/\{gift\}/g, e.gift || '').replace(/\{count\}/g, String(e.count || 1)).replace(/\{diamonds\}/g, fmt(e.diamonds))
            .replace(/\{amount\}/g, e.type === 'donation' ? fmtMoney(e.amount, e.currency) : '').replace(/\{message\}/g, e.message || '').replace(/\s+$/, '');
    }

    /** بطاقة التنبيه نفسها. */
    function alertCard(it, e) {
        var meta = ALERT_EVENTS_ALL[e.type] || ALERT_EVENTS.gift;
        var design = ALERT_DESIGNS.filter(function (d) { return d.key === it.design; })[0] ? it.design : 'card';
        var card = el('div', 'agp-so-acard d-' + design + ' t-' + e.type);
        var media = el('div', 'agp-so-amedia');
        if (e.type === 'gift' && (e.img || e.giftId)) {
            media.appendChild(img2(https(e.img) || (/^data:image\/svg/.test(e.img || '') ? e.img : null), mediaUrl('g', e.giftId), 'agp-so-aimg', function (img) { img.replaceWith(icon('gift')); }));
        } else if (e.avatar) {
            media.className += ' av';
            media.appendChild(img2(https(e.avatar), null, 'agp-so-aimg', function (img) { img.replaceWith(el('span', 'agp-so-ainit', (e.user || '?').charAt(0))); }));
        } else {
            media.appendChild(icon(meta.icon));
        }
        card.appendChild(media);
        var txt = el('div', 'agp-so-atxt');
        txt.appendChild(el('div', 'agp-so-atitle', meta.title));
        var msg = (it.msg && it.msg[e.type]) || meta.msg;
        txt.appendChild(el('div', 'agp-so-amsg', fillMsg(msg, e)));
        // رسالة الداعم (لو الأداة مفعّلتها) تحت النص لو القالب ما فيه {message}
        if (e.type === 'donation' && e.message && String(msg).indexOf('{message}') === -1) txt.appendChild(el('div', 'agp-so-amsg agp-so-dmsg', '«' + String(e.message).slice(0, 120) + '»'));
        if (e.type === 'gift' && e.diamonds && design !== 'banner') {
            var d = el('div', 'agp-so-adia');
            d.appendChild(icon('diamond'));
            d.appendChild(el('span', null, fmt(e.diamonds)));
            txt.appendChild(d);
        }
        card.appendChild(txt);
        return card;
    }

    function liveAlertNodes(id) {
        alertNodes = alertNodes.filter(function (a) { return a.node.isConnected; });
        return alertNodes.filter(function (a) { return a.node._item && a.node._item.id === id; });
    }

    function idleAlert(n) {
        var stage = n.querySelector('.agp-so-astage');
        if (!stage) return;
        stage.textContent = '';
        if (isVideoAlert(n._item)) {
            // بالمحرر: إطار فاضي بحجم الأليرت بس (يشوف مكانه ويسحبه) — بدون فيديو ولا اسم ولا رسالة،
            // فأول ما يخلص الأليرت ما يبقى منه شي، وما يشغّل فيديو وتفريغ بالخلفية (أخف)
            if (n._preview) {
                var vw = Number(n._item.video.w) || 16, vh = Number(n._item.video.h) || 9;
                var ph = el('div', 'agp-so-vslot');
                ph.style.width = (18 * Math.min(1, vw / vh)).toFixed(3) + 'em';
                ph.style.height = (18 * Math.min(1, vh / vw)).toFixed(3) + 'em';
                ph.appendChild(el('span', null, 'أليرت فيديو'));
                stage.appendChild(ph);
            }
            prefetchVideo(n._item.video.id);
            if (n._pos) place(n, n._pos, n._F);
            return;
        }
        // بالمحرر: نموذج باهت عشان المذيع يشوف مكانه ويسحبه
        if (n._preview) {
            var c = alertCard(n._item, { type: (n._item.events || ['gift'])[0] || 'gift', user: 'اسم المشاهد', gift: 'وردة', img: SAMPLE_GIFT_SVGS[0], count: 5, diamonds: 5 });
            c.classList.add('agp-so-ghost');
            stage.appendChild(c);
        }
        if (n._pos) place(n, n._pos, n._F);
    }

    function buildAlert(n, it, preview) {
        n.className += ' agp-so-alert';
        n._item = it;
        n._preview = preview;
        n.appendChild(el('div', 'agp-so-astage'));
        alertNodes = alertNodes.filter(function (a) { return a.node.isConnected; });
        alertNodes.push({ node: n, preview: preview });
        var q = alertQ[it.id];
        if (!q || !q.busy) { idleAlert(n); return; }
        // الشاشة انعاد بناؤها (تحدّث التصميم) والأليرت شغّال: ننقله للعنصر الجديد بدل ما ينقطع
        var orphan = (q.roots || []).filter(function (r) { return !r.isConnected; })[0];
        if (orphan) {
            n.querySelector('.agp-so-astage').appendChild(orphan);
            if (n._pos) setTimeout(function () { if (n._pos) place(n, n._pos, n._F); }, 0);
        }
    }

    function chime() {
        try {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            audioCtx = audioCtx || new AC();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            var t = audioCtx.currentTime;
            [[880, 0], [1320, 0.12]].forEach(function (f) {
                var o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'sine';
                o.frequency.value = f[0];
                g.gain.setValueAtTime(0.0001, t + f[1]);
                g.gain.exponentialRampToValueAtTime(0.25, t + f[1] + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + f[1] + 0.45);
                o.connect(g); g.connect(audioCtx.destination);
                o.start(t + f[1]); o.stop(t + f[1] + 0.5);
            });
        } catch (e) { /* ignore */ }
    }

    /* ---------------- أليرت الفيديو + تفريغ الخلفية (Veyro: veyro/) ----------------
     * أداة «alert» فيها it.video = { id, w, h, d, name } (ملف مرفوع:
     * /api/screens/media/file?id=) تشغّل الفيديو بدل البطاقة مع كل حدث.
     * it.key = تفريغ الخلفية لحظياً بـWebGL (مثل Chroma Key بـOBS):
     *   { on, mode: color|black|white, color, sim, smooth, spill }.
     * أي أليرت بدون it.video يشتغل زي ما كان بالضبط. */

    // mode: hue (لون الخلفية — الطريقة الجديدة: زاوية اللون + التشبّع، تمسك الخلفية بدرجاتها الفاتحة
    //   والغامقة وما تلمس البشرة حتى مع خلفية حمراء) | color (كروما قديم — للتفريغات المحفوظة قبل)
    //   | black | white | screen (مؤثرات مضيئة على أسود)
    // protect = يشيل بس الخلفية المتصلة بأطراف الفيديو (الأجزاء الداكنة داخل الشخصية ما تنمسح)
    // choke = يقلّص الحواف (يشيل الهالة)
    // floor = لون خلفية مقاطع المؤثرات (كحلي داكن مثلاً) ينطرح قبل حساب الشفافية (screen)
    // keepBg = كم يبقى من الخلفية (0 = تنشال كامل، 0.5 = نص شفافة، 1 = الخلفية كاملة) — الشخصية ما تتأثر
    // opacity = شفافية الفيديو كله
    var KEY_DEFAULT = { on: false, mode: 'color', color: '#00ff00', sim: 0.4, smooth: 0.08, spill: 0.1, protect: true, choke: 0, floor: '#000000', keepBg: 0, opacity: 1 };
    // الصورة والاسم والرسالة فوق الفيديو: x/y نسبة من الفيديو، s = الحجم (em)، c = اللون (للصورة: لون الإطار)
    // f = الخط، t = يطلع بعد كم ثانية، e = يختفي عند كم ثانية (0 = لين نهاية الأليرت)، a = حركة الدخول
    var PARTS_DEFAULT = {
        avatar: { on: true, x: 50, y: 68, s: 2.6, c: '#ffffff', t: 0, e: 0, a: 'pop' },
        name: { on: true, x: 50, y: 83, s: 1.1, c: '#ffffff', f: 'notokufi', t: 0, e: 0, a: 'up' },
        msg: { on: true, x: 50, y: 92, s: 0.85, c: '#ffd54a', f: 'notokufi', t: 0, e: 0, a: 'up' }
    };
    // أشكال الصورة: br = حواف دائرية (border-radius)، أو cp = قصّ بشكل (clip-path)
    var AVATAR_SHAPES = [
        { key: 'circle', label: 'دائرة', br: '50%' },
        { key: 'rounded', label: 'مربع ناعم', br: '24%' },
        { key: 'square', label: 'مربع', br: '6%' },
        { key: 'hex', label: 'سداسي', cp: 'polygon(25% 3%,75% 3%,99% 50%,75% 97%,25% 97%,1% 50%)' },
        { key: 'diamond', label: 'معيّن', cp: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' },
        { key: 'shield', label: 'درع', cp: 'polygon(50% 0,96% 14%,92% 62%,50% 100%,8% 62%,4% 14%)' },
        { key: 'heart', label: 'قلب', cp: heartPolygon() },
        { key: 'star', label: 'نجمة', cp: starPolygon() }
    ];
    // إطار الصورة: حلقة بلون الإطار، توهّج بنفس اللون، ظل بس، أو بدون
    var AVATAR_FRAMES = [{ key: 'ring', label: 'إطار' }, { key: 'glow', label: 'توهّج' }, { key: 'shadow', label: 'ظل' }, { key: 'none', label: 'بدون' }];
    function heartPolygon() {
        var pts = [];
        for (var i = 0; i < 40; i++) {
            var t = i / 40 * Math.PI * 2;
            var x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
            pts.push((50 + x * 3.05).toFixed(1) + '% ' + (44 - y * 3.05).toFixed(1) + '%');
        }
        return 'polygon(' + pts.join(',') + ')';
    }
    function starPolygon() {
        var pts = [];
        for (var i = 0; i < 10; i++) {
            var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 50;
            pts.push((50 + r * Math.cos(a)).toFixed(1) + '% ' + (53 + r * Math.sin(a)).toFixed(1) + '%');
        }
        return 'polygon(' + pts.join(',') + ')';
    }
    function avatarShape(k) { return AVATAR_SHAPES.filter(function (x) { return x.key === k; })[0] || AVATAR_SHAPES[0]; }
    var PART_ANIMS = [{ key: 'fade', label: 'تلاشي' }, { key: 'pop', label: 'تكبير' }, { key: 'up', label: 'من تحت' }, { key: 'down', label: 'من فوق' }, { key: 'none', label: 'بدون' }];
    /** مدة أليرت الفيديو بالثواني: it.vlen لو محددة، وإلا مدة الفيديو نفسه (تلقائي). */
    function videoAlertLen(it) {
        var own = Number(it && it.vlen) || 0;
        if (own > 0) return clamp(own, 1, 60);
        return clamp(Number(it && it.video && it.video.d) || 0, 0, 60);
    }
    // نصوص الرسالة لما الاسم عنصر لحاله (بدون {name})
    var PART_MSGS = { gift: 'أرسل {gift} ×{count}', follow: 'تابع البث', share: 'نشر البث', join: 'دخل البث', like: 'وصل {count} تكبيسة', subscribe: 'اشترك بالبث', donation: 'دعم بـ{amount} {message}' };
    /**
     * عناصر الأليرت بقيمها. it.partsTime = {t, e}: وقت ظهور واحد للصورة والاسم والرسالة كلها
     * (من خيار واحد بالمحرر) — لو موجود يغلب توقيت كل عنصر لحاله (القديم).
     */
    function partsOf(it) {
        if (!it || !it.parts) return null;
        var out = {};
        var pt = it.partsTime && typeof it.partsTime === 'object' ? it.partsTime : null;
        Object.keys(PARTS_DEFAULT).forEach(function (k) {
            out[k] = Object.assign({}, PARTS_DEFAULT[k], it.parts[k] || {});
            if (pt) { out[k].t = Math.max(0, Number(pt.t) || 0); out[k].e = Math.max(0, Number(pt.e) || 0); }
        });
        return out;
    }
    function keyOf(it) { return Object.assign({}, KEY_DEFAULT, (it && it.key) || {}); }
    function isVideoAlert(it) { return Boolean(it && it.type === 'alert' && it.video && it.video.id); }
    function videoFileUrl(id) { return id ? apiBase() + '/api/screens/media/file?id=' + encodeURIComponent(id) : null; }
    function hexRgb(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
        return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0, 1, 0];
    }

    var KEY_VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
    var KEY_FS = [
        'precision mediump float;',
        'uniform sampler2D tex,msk;uniform vec3 key,flo;uniform float sim,smo,spill,choke,useMask,keepBg,opac;uniform int mode;varying vec2 uv;',
        // المسافة بين الألوان بقناتي اللون (CbCr) — الإضاءة ما تأثر، مثل OBS
        'vec2 cc(vec3 c){return vec2(dot(c,vec3(-.169,-.331,.5)),dot(c,vec3(.5,-.419,-.081)));}',
        'void main(){vec4 c=texture2D(tex,uv);vec4 o=c;float a=1.;',
        ' if(mode==0){float t=sim*.5;float d=distance(cc(c.rgb),cc(key));a=smoothstep(t,t+smo*.5+.0001,d);',
        '  float s=clamp((d-t)/max(spill*.5,.0001),0.,1.);float l=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=mix(vec3(l),c.rgb,s);}',
        // مؤثرات مضيئة على أسود: الشفافية من أقوى قناة، واللون يرجع بدون السواد (زي Screen)
        // نطرح لون الخلفية (flo) أول، وبعدها الشفافية من أقوى قناة واللون يرجع بدون الخلفية
        // «لون الخلفية» (hue): الفرق بزاوية اللون بمستوى CbCr (0..1) + عقوبة لو التشبّع أقل من ربع تشبّع
        // لون الخلفية (الرمادي والأبيض والأسود ما ينحسبون خلفية). الإضاءة ما تأثر: الأحمر الفاتح والغامق نفس الشي
        ' else if(mode==4){vec2 kc=cc(key),pc=cc(c.rgb);float ks=max(length(kc),.0001),ps=length(pc);',
        '  float ang=acos(clamp(dot(pc,kc)/(max(ps,.0001)*ks),-1.,1.))/3.14159;float lo=clamp((.28-ps/ks)/.28,0.,1.);float d=ang+lo*.6;',
        '  float t=sim*.5;a=smoothstep(t,t+smo*.5+.0001,d);',
        '  float s=clamp((d-t)/max(spill*.5,.0001),0.,1.);float l=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=mix(vec3(l),c.rgb,s);}',
        ' else if(mode==3){c.rgb=clamp((c.rgb-flo)/max(vec3(1.)-flo,vec3(.05)),0.,1.);float mx=max(c.r,max(c.g,c.b));float t=sim*.35;a=clamp((mx-t)/max(1.-t,.001),0.,1.);a=pow(a,1./(1.+smo*4.));c.rgb=clamp(c.rgb/max(mx,.001)*min(1.,mx/max(a,.001)),0.,1.);}',
        ' else{float l=dot(c.rgb,vec3(.299,.587,.114));float t=sim*.5;',
        '  if(mode==1)a=smoothstep(t,t+smo+.0001,l);else a=1.-smoothstep(1.-t-smo-.0001,1.-t,l);}',
        // حماية الشخصية: الشفافية بس داخل الخلفية المتصلة بالأطراف
        // داخل الشخصية (بعيد عن الخلفية): الشفافية كاملة واللون الأصلي يرجع (إزالة الانعكاس بس على الحواف)
        ' if(useMask>.5){float bg=texture2D(msk,uv).r;a=mix(1.,a,bg);c.rgb=mix(o.rgb,c.rgb,bg);}',
        ' if(choke>.001)a=clamp((a-choke)/(1.-choke),0.,1.);',
        // درجة التفريغ (keepBg = كم يبقى من الخلفية): الخلفية بس ترجع ورا الشخصية — الشخصية نفسها
        // (c*a) ما يتغيّر لونها ولا شكلها ولا شفافيتها. لون الخلفية: الأصلي، أو لون الخلفية بالمؤثرات
        ' vec3 bgc=mode==3?flo:o.rgb;vec3 pm=c.rgb*a+bgc*(1.-a)*keepBg;float fa=a+(1.-a)*keepBg;',
        ' float k=c.a*opac;gl_FragColor=vec4(pm*k,fa*k);}'
    ].join('\n');

    /**
     * مسافة «لون الخلفية» (نفس اللي بالـshader، mode 4) بين بكسل (0..1) ولون الخلفية kr=[r,g,b] (0..1):
     * فرق زاوية اللون بمستوى CbCr (0..1) + عقوبة لو البكسل باهت (رمادي/أبيض/أسود ما ينحسب خلفية).
     */
    function hueDist(r, g, b, kr) {
        var kcb = -0.169 * kr[0] - 0.331 * kr[1] + 0.5 * kr[2], kcr = 0.5 * kr[0] - 0.419 * kr[1] - 0.081 * kr[2];
        var pcb = -0.169 * r - 0.331 * g + 0.5 * b, pcr = 0.5 * r - 0.419 * g - 0.081 * b;
        var ks = Math.max(Math.sqrt(kcb * kcb + kcr * kcr), 0.0001), ps = Math.sqrt(pcb * pcb + pcr * pcr);
        var cos = (pcb * kcb + pcr * kcr) / (Math.max(ps, 0.0001) * ks);
        var ang = Math.acos(Math.max(-1, Math.min(1, cos))) / Math.PI;
        var lo = clamp((0.28 - ps / ks) / 0.28, 0, 1);
        return ang + lo * 0.6;
    }
    /**
     * معايرة «لون الخلفية» من الفيديو نفسه: bg = بكسلات من أطراف الفيديو (خلفية)، fg = بكسلات من الوسط
     * (فيها الشخصية). يحسب أقل قوة تشيل الخلفية كلها (أعلى 97٪ من مسافات الأطراف) وتبعد عن ألوان
     * الشخصية، ويرجع { sim, smooth } جاهزة. كل بكسل [r,g,b] 0..255.
     */
    function calibrateHue(bg, fg, keyHex) {
        var kr = hexRgb(keyHex);
        function d(px) { return hueDist(px[0] / 255, px[1] / 255, px[2] / 255, kr); }
        function pctl(a, q) { if (!a.length) return 0; var s2 = a.slice().sort(function (x, y) { return x - y; }); return s2[Math.min(s2.length - 1, Math.floor(q * s2.length))]; }
        var bd = bg.map(d), bgT = pctl(bd, 0.97);
        var fd = fg.map(d).filter(function (x) { return x > bgT * 1.4 + 0.02; });
        var fgT = fd.length > 20 ? pctl(fd, 0.04) : bgT + 0.2;
        var t = Math.min(bgT * 1.2 + 0.015, (bgT + fgT) / 2);
        t = clamp(t, 0.03, 0.4);
        var w = clamp((fgT - t) * 0.6, 0.015, 0.1);
        return { sim: Math.round(t * 2 * 1000) / 1000, smooth: Math.round(w * 2 * 1000) / 1000, bgT: bgT, fgT: fgT };
    }

    var keyers = [];
    /** يطفي سياقات WebGL للعناصر اللي انشالت من الصفحة (المتصفح له حد لعددها). */
    function sweepKeyers() {
        keyers = keyers.filter(function (k) { if (k.canvas.isConnected) return true; k.destroy(); return false; });
    }

    /**
     * تفريغ لحظي: canvas يرسم الفيديو بعد شيل الخلفية. getKey() يرجع إعدادات
     * التفريغ (تنقرى كل فريم). يرجع null لو WebGL مو متاح.
     */
    function makeKeyer(video, getKey) {
        sweepKeyers();
        var cv = document.createElement('canvas');
        var gl = null;
        try { gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { gl = null; }
        if (!gl) return null;
        function sh(type, src) { var x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; }
        var prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, KEY_VS));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, KEY_FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
        gl.useProgram(prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        var U = {};
        ['key', 'flo', 'sim', 'smo', 'spill', 'mode', 'choke', 'useMask', 'keepBg', 'opac', 'tex', 'msk'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
        gl.uniform1i(U.tex, 0);
        gl.uniform1i(U.msk, 1);
        var mtex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, mtex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.activeTexture(gl.TEXTURE0);
        var mc = document.createElement('canvas'), mctx = null, maskOk = true;
        /**
         * «حماية الشخصية»: نصغّر الفريم (160 بكسل)، نعلّم البكسلات اللي شكلها خلفية،
         * ونعبّي من أطراف الفيديو بس — أي لون خلفية داخل الشخصية ما يوصله التعبئة
         * فيبقى ظاهر. النتيجة صورة صغيرة (1 = خلفية) تنفرد ناعمة بالـshader.
         */
        function buildMask(key, w, h) {
            var mw = 200, mh = Math.max(2, Math.round(200 * h / w));
            if (mc.width !== mw || mc.height !== mh) { mc.width = mw; mc.height = mh; mctx = mc.getContext('2d', { willReadFrequently: true }); }
            mctx = mctx || mc.getContext('2d', { willReadFrequently: true });
            var d;
            try { mctx.drawImage(video, 0, 0, mw, mh); d = mctx.getImageData(0, 0, mw, mh).data; } catch (e) { maskOk = false; return null; }
            var n = mw * mh, cand = new Uint8Array(n), bg = new Uint8Array(n);
            var t = clamp(Number(key.sim), 0, 1) * 0.5 + clamp(Number(key.smooth), 0, 1) * 0.5;
            var kr = hexRgb(key.color), kcb = -0.169 * kr[0] - 0.331 * kr[1] + 0.5 * kr[2], kcr = 0.5 * kr[0] - 0.419 * kr[1] - 0.081 * kr[2];
            for (var i = 0, j = 0; i < n; i++, j += 4) {
                var r = d[j] / 255, g = d[j + 1] / 255, b = d[j + 2] / 255;
                if (key.mode === 'hue') cand[i] = hueDist(r, g, b, kr) < t ? 1 : 0;
                else if (key.mode === 'black') cand[i] = (0.299 * r + 0.587 * g + 0.114 * b) < t + 0.02 ? 1 : 0;
                else if (key.mode === 'white') cand[i] = (0.299 * r + 0.587 * g + 0.114 * b) > 1 - t - 0.02 ? 1 : 0;
                else {
                    var cb = -0.169 * r - 0.331 * g + 0.5 * b - kcb, cr = 0.5 * r - 0.419 * g - 0.081 * b - kcr;
                    cand[i] = Math.sqrt(cb * cb + cr * cr) < t ? 1 : 0;
                }
            }
            var q = new Int32Array(n), qh = 0, qt = 0;
            function push(x) { if (cand[x] && !bg[x]) { bg[x] = 1; q[qt++] = x; } }
            for (var x0 = 0; x0 < mw; x0++) { push(x0); push((mh - 1) * mw + x0); }
            for (var y0 = 0; y0 < mh; y0++) { push(y0 * mw); push(y0 * mw + mw - 1); }
            while (qh < qt) {
                var p = q[qh++], px = p % mw;
                if (px > 0) push(p - 1);
                if (px < mw - 1) push(p + 1);
                if (p >= mw) push(p - mw);
                if (p < n - mw) push(p + mw);
            }
            // نوسّع الخلفية بكسل عشان الحافة الناعمة يتكفّل فيها التفريغ نفسه
            var out = new Uint8Array(n);
            for (var y = 0; y < mh; y++) for (var x = 0; x < mw; x++) {
                var o = y * mw + x, v = bg[o];
                if (!v) v = (x > 0 && bg[o - 1]) || (x < mw - 1 && bg[o + 1]) || (y > 0 && bg[o - mw]) || (y < mh - 1 && bg[o + mw]);
                out[o] = v ? 255 : 0;
            }
            return { w: mw, h: mh, data: out };
        }
        var k = { canvas: cv, failed: false, onfail: null };
        var raf = 0, vfc = 0, dead = false, frameN = 0, lastMask = null;
        k.draw = function () {
            if (dead || k.failed || video.readyState < 2 || !video.videoWidth) return;
            var w = video.videoWidth, h = video.videoHeight;
            if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
            try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); } catch (e) {
                // فيديو من مصدر ما يسمح بالقراءة (CORS): نعرض الفيديو بدون تفريغ
                k.failed = true;
                if (k.onfail) k.onfail();
                return;
            }
            var key = getKey();
            var rgb = hexRgb(key.color);
            gl.uniform3f(U.key, rgb[0], rgb[1], rgb[2]);
            gl.uniform1f(U.sim, clamp(Number(key.sim), 0, 1));
            gl.uniform1f(U.smo, clamp(Number(key.smooth), 0, 1));
            gl.uniform1f(U.spill, clamp(Number(key.spill), 0, 1));
            gl.uniform1i(U.mode, key.mode === 'black' ? 1 : key.mode === 'white' ? 2 : key.mode === 'screen' ? 3 : key.mode === 'hue' ? 4 : 0);
            gl.uniform1f(U.choke, clamp(Number(key.choke) || 0, 0, 0.9));
            var fl = hexRgb(key.floor || '#000000');
            if (!/^#?[0-9a-f]{6}$/i.test(key.floor || '')) fl = [0, 0, 0];
            gl.uniform3f(U.flo, fl[0], fl[1], fl[2]);
            gl.uniform1f(U.keepBg, clamp(Number(key.keepBg) || 0, 0, 1));
            gl.uniform1f(U.opac, clamp(key.opacity == null ? 1 : Number(key.opacity), 0.05, 1));
            var useMask = key.protect !== false && key.mode !== 'screen' && maskOk;
            // الماسك (قراءة من الكرت) كل فريمين — يكفي للحركة ويخفف الحمل
            var mk = null;
            if (useMask) {
                if (!lastMask || video.paused || (frameN++ & 1) === 0) { mk = buildMask(key, w, h); lastMask = mk; }
            } else lastMask = null;
            if (mk) {
                gl.activeTexture(gl.TEXTURE1);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, mk.w, mk.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, mk.data);
                gl.activeTexture(gl.TEXTURE0);
            }
            gl.uniform1f(U.useMask, (mk || (useMask && lastMask)) ? 1 : 0);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        // نرسم مع كل فريم جديد من الفيديو بس (requestVideoFrameCallback) بدل كل تحديث للشاشة
        var hasVFC = typeof video.requestVideoFrameCallback === 'function';
        function onFrame() { vfc = 0; if (dead) return; k.draw(); if (!video.paused && !video.ended) vfc = video.requestVideoFrameCallback(onFrame); }
        function loop() { if (dead) return; k.draw(); raf = requestAnimationFrame(loop); }
        function start() {
            if (dead) return;
            if (hasVFC) { if (!vfc) vfc = video.requestVideoFrameCallback(onFrame); }
            else if (!raf) loop();
        }
        function stop() {
            cancelAnimationFrame(raf); raf = 0;
            if (vfc && hasVFC) { try { video.cancelVideoFrameCallback(vfc); } catch (e) { /* ignore */ } vfc = 0; }
            k.draw();
        }
        video.addEventListener('play', start);
        video.addEventListener('pause', stop);
        video.addEventListener('ended', stop);
        video.addEventListener('seeked', k.draw);
        video.addEventListener('loadeddata', k.draw);
        k.destroy = function () {
            dead = true;
            cancelAnimationFrame(raf);
            if (vfc && hasVFC) { try { video.cancelVideoFrameCallback(vfc); } catch (e) { /* ignore */ } }
            video.removeEventListener('play', start);
            try { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { /* ignore */ }
        };
        keyers.push(k);
        if (!video.paused) start();
        return k;
    }

    /*
     * الفيديو ينحمّل مرة وحدة ويتخزن بالذاكرة (رابط blob) — كل أليرت بعدها يبدأ
     * على طول بدون ما ينتظر الشبكة أو يقطّع. الحد: آخر 8 فيديوهات.
     */
    var vidBlobs = {}, vidOrder = [];
    function prefetchVideo(id) {
        if (!id || vidBlobs[id] || typeof fetch !== 'function' || !window.URL || !URL.createObjectURL) return;
        var c = vidBlobs[id] = { url: null };
        vidOrder.push(id);
        while (vidOrder.length > 8) {
            var old = vidOrder.shift();
            if (vidBlobs[old] && vidBlobs[old].url) URL.revokeObjectURL(vidBlobs[old].url);
            delete vidBlobs[old];
        }
        fetch(videoFileUrl(id))
            .then(function (r) { return r.ok ? r.blob() : null; })
            .then(function (b) { if (b && b.size && vidBlobs[id] === c) c.url = URL.createObjectURL(b); else if (!b) delete vidBlobs[id]; })
            .catch(function () { if (vidBlobs[id] === c) delete vidBlobs[id]; });
    }
    function videoSrc(id) {
        var c = vidBlobs[id];
        if (c && c.url) return c.url;
        prefetchVideo(id);
        return videoFileUrl(id);
    }

    function makeVideo(it) {
        var v = document.createElement('video');
        v.crossOrigin = 'anonymous'; // لازم عشان التفريغ يقرأ البكسلات
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.preload = 'auto';
        v.src = videoSrc(it.video.id);
        v.volume = clamp(it.volume == null ? 0.8 : Number(it.volume), 0, 1);
        return v;
    }

    /** نص الاسم/الرسالة بستايل من TEXT_STYLES (p.st) — بدون ستايل يبقى الشكل القديم (ظل قوي). */
    function partText(n, text, p) {
        var st = TEXT_STYLES.some(function (x) { return x.key === p.st; }) ? p.st : '';
        if (!st) { n.textContent = text; return; }
        n.classList.add('styled');
        var tx = el('span', 'agp-so-tx s-' + st, text);
        tx.style.color = p.c || '#fff';
        tx.style.setProperty('--agp-so-c', p.c || '#fff');
        n.appendChild(tx);
    }
    function partFont(n, p) {
        var f = fontOf(p.f || 'notokufi');
        loadFont(f);
        n.style.fontFamily = fontStack(f);
        n.style.fontWeight = String(Math.max(700, f.b));
    }
    /** توقيت العنصر: يتخبّى لين وقت ظهوره (playVideoAlert تظهره). بالمعاينة الواقفة يبان دايم. */
    function partTiming(n, p, preview) {
        n._t = Math.max(0, Number(p.t) || 0);
        n._e = Math.max(0, Number(p.e) || 0);
        n._a = PART_ANIMS.some(function (x) { return x.key === p.a; }) ? p.a : 'fade';
        if (!preview) n.classList.add('wait');
    }
    /** يشغّل توقيت عناصر الصندوق من لحظة بداية الفيديو. يرجّع مؤقتاته عشان تنلغى. */
    function runPartTimers(box) {
        var timers = [];
        Array.prototype.forEach.call(box.querySelectorAll('.agp-so-vpart'), function (n) {
            timers.push(setTimeout(function () { n.classList.remove('wait'); n.classList.add('pin-' + n._a); }, n._t * 1000));
            if (n._e > n._t) timers.push(setTimeout(function () { n.classList.add('pout'); }, n._e * 1000));
        });
        return timers;
    }

    /** صندوق الفيديو (مع التفريغ والنص فوقه). preview = نموذج المحرر الواقف. */
    function videoBox(it, e, preview) {
        var vw = Number(it.video.w) || 16, vh = Number(it.video.h) || 9;
        var box = el('div', 'agp-so-vbox');
        box.style.width = (18 * Math.min(1, vw / vh)).toFixed(3) + 'em';
        box.style.height = (18 * Math.min(1, vh / vw)).toFixed(3) + 'em';
        var v = makeVideo(it);
        box.appendChild(v);
        var key = keyOf(it);
        var k = key.on ? makeKeyer(v, function () { return keyOf(it); }) : null;
        if (k) {
            box.className += ' keyed';
            box.appendChild(k.canvas);
            k.onfail = function () { box.classList.remove('keyed'); if (k.canvas.parentNode) k.canvas.remove(); };
        }
        // شفافية الفيديو كله لو التفريغ مطفي (لو شغّال تنطبق داخل التفريغ)
        if (!k && key.opacity != null && Number(key.opacity) < 1) v.style.opacity = String(clamp(Number(key.opacity), 0.05, 1));
        var parts = partsOf(it);
        if (parts && (e || preview)) {
            // بالمحرر (بدون حدث): مثال عشان يشوف أماكنها
            var ev = e || { type: (it.events || ['gift'])[0] || 'gift', user: 'اسم الداعم', gift: 'وردة', count: 5, diamonds: 5 };
            if (parts.avatar.on) {
                // غلاف (الحركة والتوهّج) ← إطار بشكل الصورة (بلون الإطار) ← الصورة نفسها بنفس الشكل
                var shp = avatarShape(parts.avatar.sh), frm = parts.avatar.fr || 'ring';
                var pa = el('div', 'agp-so-vpart agp-so-vav fr-' + frm);
                pa.style.cssText = 'left:' + parts.avatar.x + '%;top:' + parts.avatar.y + '%;width:' + parts.avatar.s + 'em;height:' + parts.avatar.s + 'em;color:' + (parts.avatar.c || '#fff');
                var vf = el('div', 'vav-f'), vi = el('div', 'vav-i');
                [vf, vi].forEach(function (q) { if (shp.cp) q.style.clipPath = q.style.webkitClipPath = shp.cp; else q.style.borderRadius = shp.br; });
                partTiming(pa, parts.avatar, preview);
                if (ev.avatar) vi.appendChild(img2(https(ev.avatar), null, null, function (im) { im.replaceWith(el('span', 'agp-so-vini', (ev.user || '?').charAt(0))); }));
                else vi.appendChild(el('span', 'agp-so-vini', (ev.user || '?').charAt(0)));
                vf.appendChild(vi);
                pa.appendChild(vf);
                box.appendChild(pa);
            }
            if (parts.name.on) {
                var pn = el('div', 'agp-so-vpart agp-so-vname');
                pn.style.cssText = 'left:' + parts.name.x + '%;top:' + parts.name.y + '%;font-size:' + parts.name.s + 'em;color:' + (parts.name.c || '#fff');
                partText(pn, ev.user || '', parts.name);
                partFont(pn, parts.name);
                partTiming(pn, parts.name, preview);
                box.appendChild(pn);
            }
            if (parts.msg.on) {
                var tpl = (it.msg && it.msg[ev.type]) || PART_MSGS[ev.type] || PART_MSGS.gift;
                var pm = el('div', 'agp-so-vpart agp-so-vmsg');
                pm.style.cssText = 'left:' + parts.msg.x + '%;top:' + parts.msg.y + '%;font-size:' + parts.msg.s + 'em;color:' + (parts.msg.c || '#ffd54a');
                partText(pm, fillMsg(tpl, ev), parts.msg);
                partFont(pm, parts.msg);
                partTiming(pm, parts.msg, preview);
                box.appendChild(pm);
            }
        } else if (it.showText !== false && e) {
            var msg = (it.msg && it.msg[e.type]) || (ALERT_EVENTS_ALL[e.type] || ALERT_EVENTS.gift).msg;
            var t = el('div', 'agp-so-vtxt ' + (it.textPos === 'top' ? 'top' : it.textPos === 'middle' ? 'middle' : 'bottom'), fillMsg(msg, e));
            box.appendChild(t);
        }
        if (preview) {
            v.muted = true;
            v.addEventListener('loadedmetadata', function () {
                try { v.currentTime = Math.min(0.6, (v.duration || 1) / 2); } catch (er) { /* ignore */ }
            }, { once: true });
        }
        return { root: box, video: v, keyer: k };
    }

    function stopVideoBox(vb) {
        try { vb.video.pause(); vb.video.removeAttribute('src'); vb.video.load(); } catch (e) { /* ignore */ }
        if (vb.keyer) vb.keyer.destroy();
    }

    function playVideoAlert(id, it, e, targets) {
        var q = alertQ[id];
        // مدة محددة (vlen): الأليرت يخلص عندها بالضبط — لو أطول من الفيديو يعيده أو يوقف على آخر لقطة
        var own = Number(it.vlen) > 0;
        var len = videoAlertLen(it);
        var max = own ? len * 1000 : (clamp(Number(it.video.d) || 30, 1, 60) + 2) * 1000;
        var ended = false, boxes = [], timer = null, outT = null, partT = [], started = false;
        function done() {
            if (ended) return;
            ended = true;
            clearTimeout(timer);
            clearTimeout(outT);
            partT.forEach(clearTimeout);
            q.roots = null;
            boxes.forEach(stopVideoBox);
            q.busy = false;
            liveAlertNodes(id).forEach(function (t) { idleAlert(t.node); });
            setTimeout(function () { pumpAlert(id); }, 250);
        }
        targets.forEach(function (t) {
            var stage = t.node.querySelector('.agp-so-astage');
            if (!stage) return;
            stage.textContent = '';
            var vb = videoBox(it, e, false);
            vb.root.classList.add('in');
            stage.appendChild(vb.root);
            boxes.push(vb);
            if (t.node._pos) place(t.node, t.node._pos, t.node._F);
        });
        if (!boxes.length) { done(); return; }
        q.roots = boxes.map(function (vb) { return vb.root; });
        boxes.forEach(function (vb, i) {
            var v = vb.video;
            if (own && it.vend === 'loop') v.loop = true;
            v.addEventListener('playing', function () {
                if (vb._timed) return;
                vb._timed = true;
                partT = partT.concat(runPartTimers(vb.root));
                if (!started) {
                    started = true;
                    // المدة تبدأ من أول ما يشتغل الفيديو فعلاً (مو من التحميل)
                    clearTimeout(timer);
                    timer = setTimeout(done, max);
                    if (own) outT = setTimeout(function () { boxes.forEach(function (b) { b.root.classList.add('out'); }); }, Math.max(0, max - 350));
                }
            });
            v.muted = i > 0 || Boolean(it.mute);
            if (i === 0) v.addEventListener('playing', function () { diagAlert('played'); }, { once: true });
            var p = v.play();
            // المتصفح منع الصوت التلقائي: نشغّله بدون صوت بدل ما يوقف
            if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(function () { if (!started) { diagAlert('blocked'); noVideo(); } }); });
        });
        /*
         * الفيديو ما اشتغل (تطبيق البث ما يدعم صيغته، أو منع التشغيل): بدل ما يختفي الأليرت
         * بصمت، نعرض الصورة والاسم والرسالة 4 ثواني — ونبلّغ المحرر بالسبب (diag).
         */
        function noVideo() {
            if (ended || started) return;
            started = true;
            boxes.forEach(function (b) {
                b.root.classList.add('novideo');
                partT = partT.concat(runPartTimers(b.root));
            });
            clearTimeout(timer);
            timer = setTimeout(done, 4000);
            outT = setTimeout(function () { boxes.forEach(function (b) { b.root.classList.add('out'); }); }, 3650);
        }
        if (!own) boxes[0].video.addEventListener('ended', function () {
            boxes.forEach(function (b) { b.root.classList.add('out'); });
            clearTimeout(timer);
            timer = setTimeout(done, 340);
        });
        boxes[0].video.addEventListener('error', function () {
            var er = boxes[0].video.error;
            diagAlert('error:' + (er ? er.code : '?'));
            noVideo();
        });
        timer = setTimeout(done, max + 8000); // لو الفيديو ما اشتغل أبداً
    }

    /** يضيف تنبيه لطابور الأداة. force = تجربة المحرر (بدون فلترة). */
    function queueAlert(id, e, force) {
        var q = alertQ[id] = alertQ[id] || { list: [], busy: false };
        var itq = alertNodes.filter(function (a) { return a.node._item && a.node._item.id === id; })[0];
        var picky = itq && Array.isArray(itq.node._item.joinUsers) && itq.node._item.joinUsers.length;
        if (!force && e.type === 'join' && !picky && q.list.length >= 2) return; // الدخول كثير — ما نطوّل الطابور
        if (q.list.length >= 15) q.list.shift();
        q.list.push(e);
        pumpAlert(id);
    }

    function pumpAlert(id) {
        var q = alertQ[id];
        if (!q || q.busy || !q.list.length) return;
        var targets = liveAlertNodes(id);
        if (!targets.length) { q.list = []; return; }
        var e = q.list.shift();
        var it = targets[0].node._item;
        if (isVideoAlert(it)) { q.busy = true; playVideoAlert(id, it, e, targets); return; }
        var dur = clamp(Number(it.duration) || 5, 2, 20) * 1000;
        var anim = ALERT_ANIMS.filter(function (a) { return a.key === it.anim; })[0] ? it.anim : 'pop';
        q.busy = true;
        q.roots = [];
        targets.forEach(function (t) {
            var stage = t.node.querySelector('.agp-so-astage');
            if (!stage) return;
            stage.textContent = '';
            var c = alertCard(it, e);
            c.classList.add('in-' + anim);
            stage.appendChild(c);
            q.roots = (q.roots || []).concat([c]);
            if (t.node._pos) place(t.node, t.node._pos, t.node._F);
        });
        if (it.sound) chime();
        setTimeout(function () {
            liveAlertNodes(id).forEach(function (t) {
                var c = t.node.querySelector('.agp-so-acard');
                if (c) c.classList.add('out');
            });
        }, dur - 450);
        setTimeout(function () {
            q.busy = false;
            q.roots = null;
            liveAlertNodes(id).forEach(function (t) { idleAlert(t.node); });
            setTimeout(function () { pumpAlert(id); }, 250);
        }, dur);
    }

    function cleanUser(u) { return String(u || '').trim().replace(/^@/, '').toLowerCase(); }

    /**
     * هل الحدث يشغّل هذا الأليرت؟
     *  gift: minDiamonds ≤ العملات ≤ maxDiamonds (0 = بدون حد أعلى)
     *  like: كل likeEvery تكبيسة — من نفس الشخص (likeScope 'user') أو مجموع البث ('all')
     *  join/subscribe: joinUsers = يوزرات معيّنة بس (فاضي = الكل)
     */
    function alertMatches(it, e) {
        if (it.hidden || (it.events || []).indexOf(e.type) === -1) return false;
        if (e.type === 'gift') {
            var d = Number(e.diamonds) || 0, mx = Number(it.maxDiamonds) || 0;
            if (d < (Number(it.minDiamonds) || 0)) return false;
            if (mx > 0 && d > mx) return false;
        }
        if (e.type === 'donation') {
            // مدى المبلغ بالدولار (0 = بدون حد أعلى) — عملة غير الدولار تطلع بأي أليرت دونيشن بدون حد
            var a = Number(e.amount) || 0, ma = Number(it.maxAmount) || 0;
            if (String(e.currency || 'USD').toUpperCase() === 'USD') {
                if (it.amountMode === 'exact') { if (Math.abs(a - (Number(it.exactAmount) || 0)) > 0.004) return false; }
                else {
                    if (a < (Number(it.minAmount) || 0)) return false;
                    if (ma > 0 && a > ma) return false;
                }
            }
        }
        if (e.type === 'like') {
            var n = Math.max(1, Math.round(Number(it.likeEvery) || 100));
            var now = it.likeScope === 'all' ? Number(e.all) || 0 : Number(e.total) || 0;
            var before = it.likeScope === 'all' ? Number(e.allPrev) || 0 : now - (Number(e.count) || 0);
            if (Math.floor(now / n) <= Math.floor(before / n)) return false;
        }
        if ((e.type === 'join' || e.type === 'subscribe') && Array.isArray(it.joinUsers) && it.joinUsers.length) {
            if (it.joinUsers.map(cleanUser).indexOf(cleanUser(e.uid)) === -1) return false;
        }
        return true;
    }

    function alertItems() { return activeItems().filter(function (it) { return it.type === 'alert'; }); }

    /** رابط الشاشة: أحداث جديدة → تنبيهات. أول طلب (أو بث جديد) = نقطة بداية بدون تنبيهات. */
    function fetchEvents() {
        if (evState.inflight || !LINK) return;
        evState.inflight = true;
        fetch(apiBase() + '/api/public/screen/events?k=' + encodeURIComponent(LINK_KEY) + '&since=' + (evState.init ? evState.seq : 0) + '&t=' + (evState.tinit ? evState.tseq : 0) + '&c=' + (chatState.init ? chatState.seq : 0) + '&d=' + (donState.init ? donState.seq : 0) + '&lv=' + LIVE_VERSION + diagParam())
            .then(function (res) { return res.json(); })
            .then(function (d) {
                if (!d || !d.success) return;
                if ('cseq' in d) handleChat(d);
                if ('dseq' in d) handleDonations(d);
                // «جرّب» من المحرر: أول طلب = نقطة بداية (التجارب القديمة ما تشتغل)
                if (!evState.tinit || (Number(d.tseq) || 0) < evState.tseq) { evState.tinit = true; evState.tseq = Number(d.tseq) || 0; }
                else {
                    evState.tseq = Number(d.tseq) || 0;
                    (d.tests || []).forEach(function (t) { evState.tests.push({ itemId: t.itemId, type: t.type, at: Date.now() }); });
                }
                runTests();
                if (!evState.init || d.sid !== evState.sid || d.seq < evState.seq) {
                    evState.init = true;
                    evState.sid = d.sid;
                    evState.seq = d.seq;
                    return;
                }
                evState.seq = d.seq;
                (d.events || []).forEach(function (e) {
                    alertItems().forEach(function (it) {
                        if (!alertMatches(it, e)) return;
                        queueAlert(it.id, e);
                    });
                });
            })
            .catch(function () { /* نحاول بالدورة الجاية */ })
            .then(function () { evState.inflight = false; });
    }

    /**
     * تجارب المحرر بانتظار أليرتها: لو الأليرت جديد ولسا ما وصل تصميمه للرابط
     * (يتحدّث كل DESIGN_POLL_MS) نستنى لين 15 ثانية.
     */
    /*
     * تشخيص رابط الشاشة (يوصل للمحرر مع طلب الأحداث): هل تطبيق البث يشغّل MP4 / WebM،
     * هل فيه WebGL (التفريغ)، ووش صار بآخر أليرت (played / error:<رمز> / blocked).
     */
    var diag = null;
    function diagBase() {
        if (diag) return diag;
        var v = document.createElement('video'), gl = false;
        try { var c = document.createElement('canvas'); gl = Boolean(c.getContext('webgl')); } catch (e) { gl = false; }
        diag = {
            mp4: v.canPlayType ? v.canPlayType('video/mp4; codecs="avc1.42E01E"') || 'no' : '?',
            webm: v.canPlayType ? v.canPlayType('video/webm; codecs="vp9"') || 'no' : '?',
            gl: gl ? 1 : 0, last: '', lastAt: 0
        };
        return diag;
    }
    function diagAlert(result) { var d = diagBase(); d.last = result; d.lastAt = Date.now(); }
    function diagParam() {
        var d = diagBase();
        return '&dg=' + encodeURIComponent([d.mp4, d.webm, d.gl, d.last, d.lastAt ? Math.round((Date.now() - d.lastAt) / 1000) : ''].join('|'));
    }

    function runTests() {
        var now = Date.now();
        evState.tests = evState.tests.filter(function (t) {
            if (audioTest(t)) return false;
            var it = alertItems().filter(function (x) { return x.id === t.itemId; })[0];
            if (it) { queueAlert(it.id, forItem(it, sampleEvent(t.type || (it.events || ['gift'])[0])), true); return false; }
            return now - t.at < 15000;
        });
    }

    function syncEventsPolling() {
        var want = LINK && state.enabled && (alertItems().length > 0 || audioItems('tts').length > 0 || audioItems('music').length > 0 || donationTools());
        if (want && !evState.timer) {
            fetchEvents();
            evState.timer = setInterval(fetchEvents, EVENTS_POLL_MS);
        } else if (!want && evState.timer) {
            clearInterval(evState.timer);
            evState.timer = null;
        }
    }

    function isDataItem(it) { return it.type === 'top' || it.type === 'goal' || it.type === 'counter' || it.type === 'lastdonation'; }

    /* ---------------- الدونيشن (Streamlabs — كريترز وغيره) ----------------
     * يوصل مع طلب الأحداث (dseq/donations) لو الشاشة فيها أداة دونيشن. كل دونيشن جديد: أليرت
     * للأليرتات المطابقة (مدى المبلغ)، وتحديث «آخر دعم»، وطلب الإحصائيات فوراً (التوب والهدف). */
    var donState = { init: false, seq: 0 };
    var lastDon = null; // آخر دونيشن وصل بالرابط (أحدث من ملخص الإحصائيات)

    function donationTools() {
        return activeItems().some(function (it) {
            if (it.type === 'alert') return (it.events || []).indexOf('donation') !== -1;
            if (it.type === 'top') return throneSecs(it).indexOf('donors') !== -1;
            if (it.type === 'goal') return it.metric === 'donations';
            return it.type === 'lastdonation';
        });
    }

    /** نسخة الحدث لأداة معيّنة: رسالة الداعم تنشال لو الأداة ما فعّلتها (showMessage). */
    function forItem(it, e) {
        if (e.type !== 'donation' || it.showMessage) return e;
        return Object.assign({}, e, { message: '' });
    }

    function handleDonations(d) {
        var ds = Number(d.dseq) || 0;
        if (!donState.init || ds < donState.seq) { donState.init = true; donState.seq = ds; return; }
        donState.seq = ds;
        var list = d.donations || [];
        if (!list.length) return;
        list.forEach(function (e) {
            alertItems().forEach(function (it) {
                if (alertMatches(it, e)) queueAlert(it.id, forItem(it, e));
            });
            if (!e.isTest && String(e.currency || 'USD').toUpperCase() === 'USD') lastDon = { name: e.user, amount: e.amount, currency: e.currency, message: e.message || '', at: e.at };
        });
        repaintData();
        fetchStats();
    }

    /** آخر دونيشن فعلي (من الرابط أو ملخص الإحصائيات — الأحدث). */
    function curLastDon() {
        var t = (stats.totals && stats.totals.lastDonation) || null;
        return lastDon && (!t || (lastDon.at || 0) >= (t.at || 0)) ? lastDon : t;
    }
    function ldSig(d) { return d ? [d.name, d.amount, d.currency, d.at].join('|') : ''; }
    function ldCfg(it) { return JSON.stringify([it.design, it.motion, it.nameColor, it.amtColor, it.accent1, it.accent2, it.dotColor, it.boxColor, it.size, it.font, it.amtFont, it.ldIcon, it.markIcon, it.iconColor]); }
    // أيقونات «آخر دعم» اللي يختار منها الستريمر (أيقونة المبلغ والعلامة)
    var LD_ICONS = ['dollar', 'heart', 'star', 'crown', 'diamond', 'fire', 'gift', 'sparkle', 'bolt', 'trophy', 'rocket'];
    /** أيقونة «آخر دعم»: dollar = عملة الدولار الذهبية، والباقي من ICON_SET بلون --ldi. */
    function ldIco(name, cls) {
        var s = el('span', cls || 'agp-so-ld2i');
        if (name === 'dollar') s.innerHTML = THRONE_ICONS.donors;
        else if (ICON_SET[name]) s.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + ICON_SET[name].p + '</svg>';
        else return null;
        return s;
    }
    /** الخطوط والألوان المشتركة لكل تصاميم «آخر دعم» (على عنصر الأداة نفسه). */
    function ldFonts(n, it) {
        [['font', '--ldfn', '--ldwn'], ['amtFont', '--ldfa', '--ldwa']].forEach(function (k) {
            if (!it[k[0]]) return;
            var f = fontOf(it[k[0]]);
            loadFont(f);
            n.style.setProperty(k[1], fontStack(f));
            n.style.setProperty(k[2], String(f.b));
        });
        if (/^#[0-9a-f]{6}$/i.test(String(it.iconColor || ''))) n.style.setProperty('--ldi', it.iconColor);
    }
    var LD_MOTIONS = ['static', 'marquee', 'swap', 'type'];

    /**
     * موج الحرير داخل «شريط الموج»: 4 طبقات (شرايط بين منحنيين جيبيين) تتحرك أفقياً بسرعات مختلفة
     * وتتمايل فوق وتحت. كل طبقة SVG عرضه ضعف الشريط ودورته نص العرض (الحركة -50% ترجع لنفس الشكل).
     */
    var ldwSeq = 0;
    function ldWaves() {
        var id = 'agp-so-ldw' + (++ldwSeq);
        var wrap = el('span', 'ldw-waves');
        var LAYERS = [[17, 34, 0, .42], [12, 17, 1.7, .62], [23, 10, 3.1, .42], [14, 2, 4.3, 1]];
        var html = '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="400" y2="0" spreadMethod="repeat">' +
            '<stop offset="0" style="stop-color:color-mix(in srgb,var(--ld1) 55%,#000)"/><stop offset=".5" style="stop-color:color-mix(in srgb,var(--ld1) 60%,#fff)"/>' +
            '<stop offset="1" style="stop-color:color-mix(in srgb,var(--ld1) 55%,#000)"/></linearGradient></defs>';
        LAYERS.forEach(function (L, i) {
            var A = L[0], T = L[1], ph = L[2], top = [], bot = [];
            for (var x = 0; x <= 800; x += 10) {
                var a = 2 * Math.PI * x / 400;
                var y = 50 + A * Math.sin(a + ph);
                var th = T * (.6 + .4 * Math.sin(a + ph * 1.7));
                top.push(x + ' ' + (y - th / 2).toFixed(1));
                bot.unshift(x + ' ' + (y + th / 2).toFixed(1));
            }
            var d = 'M' + top.join(' L') + ' L' + bot.join(' L') + 'Z';
            var line = 'M' + top.join(' L');
            var ly = el('span', 'ldw-ly l' + i);
            ly.innerHTML = '<svg viewBox="0 0 800 100" preserveAspectRatio="none" aria-hidden="true">' + html.replace(/agp-so-ldw\d+/g, id) +
                '<path d="' + d + '" fill="url(#' + id + ')" opacity="' + L[3] + '"/>' +
                '<path d="' + line + '" fill="none" stroke="#fff" stroke-opacity="' + (i === 3 ? .55 : .22) + '" stroke-width="' + (i === 3 ? 1.2 : .8) + '" vector-effect="non-scaling-stroke"/></svg>';
            wrap.appendChild(ly);
        });
        return wrap;
    }
    /**
     * «شريط الفراشات»: نفس «شريط الموج» بس داخله فراشات واقعية (bfSvg) تطير عرض الشريط
     * يمين ويسار بأحجام وسرعات وارتفاعات مختلفة، ترفرف وتطلع وتنزل.
     */
    function ldButterflies() {
        var wrap = el('span', 'ldf');
        // [الارتفاع %, الحجم em, مدة العبور s, تأخير s, اتجاه, مدة الطلوع والنزول s, شفافية]
        [[44, 1.6, 9, 0, 'r', 1.4, .95], [66, 1.2, 11, -6, 'l', 1.1, .8], [36, 1, 13, -3.5, 'r', .95, .65],
         [62, 1.45, 10, -7.5, 'r', 1.6, .9], [40, 1.1, 12, -2, 'l', 1.2, .75], [56, .9, 15, -11, 'l', .9, .6]].forEach(function (b) {
            var o = el('span', 'ldf-b ' + b[4]);
            o.style.top = b[0] + '%';
            o.style.setProperty('--z', b[1] + 'em');
            o.style.animationDuration = b[2] + 's';
            o.style.animationDelay = b[3] + 's';
            o.style.opacity = b[6];
            var bob = el('span', 'ldf-bob');
            bob.style.animationDuration = b[5] + 's';
            var w = el('span', 'agp-so-bfw');
            w.innerHTML = bfSvg();
            bob.appendChild(w);
            o.appendChild(bob);
            wrap.appendChild(o);
        });
        return wrap;
    }
    /** صف الاسم والمبلغ (يرجع عناصر المبلغ عشان العدّ). */
    function ldRow(d, amts) {
        var r = el('span', 'ldw-row');
        r.appendChild(el('span', 'agp-so-ld2n', d.name || ''));
        r.appendChild(el('i', 'ldw-sep'));
        var a = el('span', 'agp-so-ld2a', fmtMoney(d.amount, d.currency));
        amts.push(a);
        r.appendChild(a);
        return r;
    }
    /** «شريط الموج»: الخلفية والتوهّج والموج، والنص حسب it.motion (ثابت/شريط/تبديل/كتابة). */
    function buildLdWave(box, it, d) {
        var amts = [];
        var mo = LD_MOTIONS.indexOf(it.motion) !== -1 ? it.motion : 'static';
        box.classList.add('m-' + mo);
        box.appendChild(el('span', 'ldw-halo'));
        var bar = el('span', 'ldw-bar');
        if (it.design === 'flutter') {
            box.classList.add('ld-wave');
            bar.appendChild(ldButterflies());
        } else bar.appendChild(ldWaves());
        var tx = el('span', 'ldw-tx');
        if (mo === 'marquee') {
            // نسختين ورا بعض: تتحرك من اليسار لليمين وترجع لنفس المكان (بدون قفزة)
            var tr = el('span', 'ldw-track');
            for (var k = 0; k < 2; k++) tr.appendChild(ldRow(d, amts));
            tx.appendChild(tr);
        } else if (mo === 'swap') {
            var a = el('span', 'ldw-sw s1');
            a.appendChild(el('span', 'agp-so-ld2n', d.name || ''));
            var b = el('span', 'ldw-sw s2');
            var am = el('span', 'agp-so-ld2a', fmtMoney(d.amount, d.currency));
            amts.push(am);
            b.appendChild(am);
            tx.appendChild(a);
            tx.appendChild(b);
        } else {
            var row = ldRow(d, amts);
            if (mo === 'type') row.appendChild(el('span', 'ldw-cur'));
            tx.appendChild(row);
        }
        bar.appendChild(tx);
        box.appendChild(bar);
        return amts;
    }
    // آخر دعم رسمته كل أداة (عشان حركة «داعم جديد» تطلع مرة وحدة بس لما يتغيّر)
    var ldSeen = {};

    /**
     * تصاميم «آخر دعم» البسيطة (بدون نصوص ثابتة — الاسم والمبلغ بس):
     * line = الاسم والمبلغ فوق خط ضوء ونجمة تمشي عليه، split = كبسولة نصها للمبلغ بلون ونصها للاسم.
     * الألوان: nameColor، amtColor، accent1/accent2 (الخط أو جزء المبلغ)، dotColor (النجمة/النقطة)، boxColor (خلفية الاسم).
     */
    function buildLdSlim(n, it, d, real, preview) {
        var hex = function (v) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : null; };
        var box = el('div', 'agp-so-ld2 ld-' + it.design);
        [['nameColor', '--ldn'], ['amtColor', '--lda'], ['accent1', '--ld1'], ['accent2', '--ld2'], ['dotColor', '--ldd'], ['boxColor', '--ldb']].forEach(function (c) {
            if (hex(it[c[0]])) box.style.setProperty(c[1], it[c[0]]);
        });
        var sig = ldSig(real);
        var prev = ldSeen[it.id];
        ldSeen[it.id] = sig;
        var isNew = !preview && real && prev !== undefined && prev !== sig;
        if (isNew) box.classList.add('new');
        n._ld = { sig: sig, cfg: ldCfg(it) };
        if (!d) { n.appendChild(box); box.style.display = 'none'; return; }
        var nm = el('span', 'agp-so-ld2n', d.name || '');
        var amt = el('span', 'agp-so-ld2a', fmtMoney(d.amount, d.currency));
        var amts = [amt];
        if (it.design === 'wave' || it.design === 'flutter') amts = buildLdWave(box, it, d);
        else if (it.design === 'line') {
            var top = el('div', 'agp-so-ld2t');
            top.appendChild(nm);
            top.appendChild(amt);
            box.appendChild(top);
            var ln = el('div', 'agp-so-ld2l');
            ln.appendChild(el('i'));
            box.appendChild(ln);
        } else {
            box.appendChild(el('span', 'agp-so-ld2g'));
            box.appendChild(nm);
            var ap = el('span', 'agp-so-ld2p');
            ap.appendChild(el('span', 'agp-so-ld2d'));
            ap.appendChild(amt);
            box.appendChild(ap);
        }
        // أيقونة جنب المبلغ (اختيارية)
        if (it.ldIcon && it.ldIcon !== 'none') amts.forEach(function (a) {
            var ico = ldIco(it.ldIcon);
            if (!ico || !a.parentNode) return;
            var wv = el('span', 'agp-so-ld2av');
            a.parentNode.replaceChild(wv, a);
            wv.appendChild(ico);
            wv.appendChild(a);
        });
        // العلامة (النجمة اللي تمشي / النقطة / الفاصل) بأيقونة بدل الشكل الأصلي
        if (it.markIcon && ICON_SET[it.markIcon]) {
            box.querySelectorAll('.agp-so-ld2l i,.agp-so-ld2d,.ldw-sep').forEach(function (m) {
                m.classList.add('mk');
                m.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + ICON_SET[it.markIcon].p + '</svg>';
            });
        }
        // داعم جديد: المبلغ يعدّ من صفر لين قيمته
        if (isNew && String(d.currency || 'USD').toUpperCase() === 'USD') {
            amts.forEach(function (a) {
                a._kind = 'donors';
                a._v = 0;
                a.textContent = fmtMoney(0);
                // بعد ما تنضاف للصفحة (tweenNum يوقف لو العنصر مو بالصفحة)
                requestAnimationFrame(function () { tweenNum(a, Number(d.amount) || 0); });
            });
        }
        n.appendChild(box);
    }

    /** «آخر دعم»: الاسم والمبلغ (والرسالة لو مفعّلة). */
    function buildLastDonation(n, it, preview) {
        var real = curLastDon();
        var d = real;
        var ghost = !d && preview;
        if (ghost) d = SAMPLE_TOTALS.lastDonation;
        n.classList.toggle('agp-so-ghost', Boolean(ghost));
        ldFonts(n, it);
        if (it.design === 'line' || it.design === 'split' || it.design === 'wave' || it.design === 'flutter') { buildLdSlim(n, it, d, real, preview); return; }
        title(n, it.title);
        var card = el('div', 'agp-so-ldbox');
        var hx = function (v) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : null; };
        if (hx(it.boxColor)) card.style.background = 'linear-gradient(160deg,' + it.boxColor + ',color-mix(in srgb,' + it.boxColor + ' 70%,#000))';
        if (hx(it.nameColor)) card.style.setProperty('--ldn', it.nameColor);
        if (hx(it.amtColor)) card.style.setProperty('--lda', it.amtColor);
        if (it.ldIcon !== 'none') {
            var ic = ldIco(it.ldIcon && it.ldIcon !== 'dollar' ? it.ldIcon : 'dollar', 'agp-so-ldic');
            if (ic) card.appendChild(ic);
        }
        var tx = el('div', 'agp-so-ldtx');
        if (d) {
            var row = el('div', 'agp-so-ldrow');
            row.appendChild(el('b', 'agp-so-ldname', d.name || ''));
            row.appendChild(el('span', 'agp-so-ldamt', fmtMoney(d.amount, d.currency)));
            tx.appendChild(row);
            if (it.showMessage && d.message) tx.appendChild(el('span', 'agp-so-ldmsg', String(d.message).slice(0, 120)));
        } else {
            tx.appendChild(el('span', 'agp-so-ldwait', 'بانتظار أول دعم…'));
        }
        card.appendChild(tx);
        n.appendChild(card);
    }

    /* ---------------- أدوات جديدة ---------------- */

    function uid() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    /** أداة جديدة بقيمها الافتراضية. */
    function newItem(type, opts) {
        opts = opts || {};
        var base = { id: uid(), type: type, pos: {} };
        if (type === 'text') return Object.assign(base, { text: 'اكتب نصك هنا', size: 6, color: '#ffffff', style: 'outline', font: DEFAULT_FONT, anim: 'none', speed: 1 });
        if (type === 'top') {
            var sec = SECTIONS[opts.section] ? opts.section : 'likers';
            return Object.assign(base, { section: sec, design: 'podium', title: SECTIONS[sec].title, top: 3, size: 3, color: sec === 'gifters' ? '#4dd8ff' : sec === 'commenters' ? '#7cff6b' : sec === 'sharers' ? '#c58bff' : '#ffd54a' });
        }
        if (type === 'goal') return Object.assign(base, { metric: 'likes', title: 'هدف التكبيسات', target: 10000, autoNext: true, design: 'bar', size: 3, color: '#ff4d6d' });
        if (type === 'counter') return Object.assign(base, { metrics: ['likes', 'diamonds', 'follows'], title: '', design: 'pills', size: 3, color: '#ffd54a' });
        if (type === 'jar') return Object.assign(base, { title: 'وعاء الهدايا', counter: 'diamonds', size: 2.6, color: '#ff5fa8' });
        if (type === 'alert') {
            var evs = Array.isArray(opts.events) && opts.events.length ? opts.events : ['gift', 'follow', 'share'];
            var msg = {};
            Object.keys(ALERT_EVENTS).forEach(function (k) { msg[k] = ALERT_EVENTS[k].msg; });
            if (opts.video) {
                return Object.assign(base, { events: evs, video: opts.video, key: Object.assign({}, KEY_DEFAULT, opts.key || {}), volume: 0.8, showText: true, textPos: 'bottom', minDiamonds: 0, sound: false, size: 3, color: '#ffffff', msg: Object.assign({}, PART_MSGS), parts: JSON.parse(JSON.stringify(PARTS_DEFAULT)) });
            }
            return Object.assign(base, { events: evs, design: opts.design || 'card', anim: 'pop', duration: 5, minDiamonds: 0, sound: true, size: 3, color: opts.color || '#ff4d6d', msg: msg });
        }
        if (type === 'icon') return Object.assign(base, opts.emoji ? { emoji: opts.emoji } : { icon: opts.icon || 'star' }, { size: 9, color: opts.color || '#ffd54a', anim: 'none', speed: 1, glow: true });
        if (type === 'lastdonation') return Object.assign(base, { title: 'آخر دعم', showMessage: false, size: 3, color: '#ffd54a' });
        if (type === 'tts') return Object.assign(base, { enabled: true, voice: 'f', rate: 1, volume: 0.9, readName: true, minLen: 2, maxLen: 200, skipCommands: true, skipLinks: true, banned: [], bubble: true, size: 3, color: '#cfc3dc' });
        if (type === 'music') return Object.assign(base, { enabled: true, playCmd: '!تشغيل', skipCmd: '!تخطي', volCmd: '!صوت', who: 'all', ctrlWho: 'owner', allow: '', volume: 0.6, maxDurSec: 360, maxQueue: 10, design: 'card', size: 3, color: '#cfc3dc' });
        if (type === 'shape') return Object.assign(base, { shape: opts.shape || 'round', w: opts.w || 46, h: opts.h || 18, fill: opts.fill || 'glass', color: opts.color || '#7a3fd4', opacity: 0.9, size: 1 });
        return base;
    }

    /* ---------------- أدوات الصوت: القارئ الصوتي («سيري») ومشغّل الأغاني ----------------
     * تشتغل برابط الشاشة بس (OBS / TikTok LIVE Studio)، والمحرر صامت دايماً (معاينة).
     * الشات يوصل مع طلب الأحداث (cseq/chat — السيرفر يرسله بس لو بالشاشة أداة صوت).
     * القارئ: كل رسالة → /api/public/screen/tts (صوت Google بالسيرفر) → <audio> بطابور.
     * المشغّل: «!تشغيل <اسم>» → /api/public/screen/music/search → مشغّل يوتيوب مخفي بطابور.
     * حالة الصوت (الطابور والمشغّل) برا عناصر الرسم، لأن الرسم ينعاد مع كل تحديث للتصميم. */

    var AUDIO_ON = LINK && !STUDIO;
    var TTS_Q_MAX = 15;
    var SEARCH_GAP_MS = 3200;
    var chatState = { init: false, sid: 0, seq: 0 };
    var tts = { q: [], busy: false, audio: null, cur: null, timer: null };
    var music = { queue: [], cur: null, player: null, waiters: [], apiLoading: false, searches: [], searching: false, lastSearchAt: 0, endTimer: null, tick: null };
    var audioBlocked = false, unlockBtn = null;
    var WAVE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 3.5v17a1 1 0 01-2 0v-17a1 1 0 012 0zm4 4v9a1 1 0 01-2 0v-9a1 1 0 012 0zm-8 2v5a1 1 0 01-2 0v-5a1 1 0 012 0zm12 0v5a1 1 0 01-2 0v-5a1 1 0 012 0zM3 11v2a1 1 0 01-2 0v-2a1 1 0 012 0zm20 0v2a1 1 0 01-2 0v-2a1 1 0 012 0z"/></svg>';
    var NOTE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 3v12.5a3.5 3.5 0 11-2-3.16V7.3l-9 2.25v8.95A3.5 3.5 0 117 15.34V5.78a1 1 0 01.76-.97l11-2.75A1 1 0 0120 3z"/></svg>';

    function audioItems(type) { return activeItems().filter(function (it) { return it.type === type && it.enabled !== false && !it.hidden; }); }
    function vol(it, def) { var v = Number(it && it.volume); return clamp(isFinite(v) && it.volume !== '' && it.volume != null ? v : def, 0, 1); }

    /** النص اللي القارئ يقرأه لرسالة شات، أو null لو الرسالة تنتجاهل. */
    function ttsFilter(it, m) {
        if (!m || !m.text) return null;
        var t = String(m.text).replace(/\s+/g, ' ').trim();
        if (!t) return null;
        if (it.skipCommands !== false && /^[!！]/.test(t)) return null;
        if (it.skipLinks !== false && /(https?:\/\/|www\.|[\w-]+\.(com|net|org|io|me|ly|gg|tv|sa|app|link)\b)/i.test(t)) return null;
        if (!/[\p{L}\p{N}]/u.test(t)) return null; // كلها رموز أو إيموجي
        if (t.length < clamp(Number(it.minLen) || 2, 1, 50)) return null;
        var banned = (Array.isArray(it.banned) ? it.banned : String(it.banned || '').split(/[,،\n]/))
            .map(function (w) { return String(w).trim().toLowerCase(); }).filter(Boolean);
        var low = t.toLowerCase();
        if (banned.some(function (w) { return low.indexOf(w) !== -1; })) return null;
        t = t.slice(0, clamp(Number(it.maxLen) || 200, 10, 200));
        return it.readName !== false && m.user ? String(m.user).slice(0, 40) + ' يقول: ' + t : t;
    }

    /** قائمة يوزرات تيك توك («أشخاص معيّنين») بشكل موحّد: بدون @ وحروف صغيرة. */
    function musicAllowList(it) {
        return (Array.isArray(it.allow) ? it.allow : String(it.allow || '').split(/[\s,،]+/))
            .map(function (u) { return String(u).trim().replace(/^@+/, '').toLowerCase(); }).filter(Boolean);
    }

    /**
     * هل كاتب الرسالة مسموح له؟ who: 'all' الكل | 'mods' المشرفين | 'list' أشخاص معيّنين
     * | 'mods_list' المشرفين + المعيّنين | 'owner' صاحب البث بس. صاحب البث مسموح له دائماً.
     */
    function musicAllowed(it, who, m) {
        if (m.owner) return true;
        who = who || 'all';
        if (who === 'all') return true;
        if ((who === 'mods' || who === 'mods_list') && m.mod) return true;
        if (who === 'list' || who === 'mods_list') {
            var u = String(m.uid || '').replace(/^@+/, '').toLowerCase();
            return !!u && musicAllowList(it).indexOf(u) !== -1;
        }
        return false;
    }

    /** يطابق «!أمر» أو «!أمر نص» ويرجّع النص بعده، أو null. */
    function cmdRest(t, cmd) {
        cmd = String(cmd || '').trim();
        if (!cmd) return null;
        if (t === cmd) return '';
        return t.indexOf(cmd + ' ') === 0 ? t.slice(cmd.length).trim() : null;
    }

    /**
     * أمر المشغّل برسالة: { kind:'play', q } أو { kind:'skip' } أو { kind:'vol', v:0..100 } أو null.
     * الطلب لـ who، والتخطي والصوت لـ ctrlWho (صاحب البث دائماً). الصوت يقبل «!صوت10» و«!صوت 10» وأرقام عربية.
     */
    function parseMusicCommand(it, m) {
        if (!m || !m.text) return null;
        var t = String(m.text).replace(/\s+/g, ' ').trim();
        var q = cmdRest(t, it.playCmd || '!تشغيل');
        if (q !== null) {
            q = q.slice(0, 100);
            return q && musicAllowed(it, it.who, m) ? { kind: 'play', q: q } : null;
        }
        if (cmdRest(t, it.skipCmd || '!تخطي') !== null) return musicAllowed(it, it.ctrlWho || 'owner', m) ? { kind: 'skip' } : null;
        var vc = String(it.volCmd || '!صوت').trim();
        if (vc && t.indexOf(vc) === 0) {
            var num = t.slice(vc.length).trim().replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
                .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); }).replace(/[%٪]$/, '');
            if (!/^\d{1,3}$/.test(num)) return null;
            return musicAllowed(it, it.ctrlWho || 'owner', m) ? { kind: 'vol', v: Math.min(100, Number(num)) } : null;
        }
        return null;
    }

    function handleChat(d) {
        var cs = Number(d.cseq) || 0;
        if (!chatState.init || d.sid !== chatState.sid || cs < chatState.seq) {
            chatState.init = true; chatState.sid = d.sid; chatState.seq = cs;
            return; // أول طلب / بث جديد / السيرفر رجع: نقطة بداية بدون قراءة القديم
        }
        chatState.seq = cs;
        if (!AUDIO_ON) return;
        (d.chat || []).forEach(onChat);
    }

    function onChat(m) {
        var ti = audioItems('tts')[0];
        if (ti) {
            var text = ttsFilter(ti, m);
            if (text) ttsEnqueue({ text: text, user: m.user, msg: m.text });
        }
        var mi = audioItems('music')[0];
        if (mi) {
            var cmd = parseMusicCommand(mi, m);
            if (cmd && cmd.kind === 'play') musicRequest(mi, m.user, m.uid, cmd.q);
            else if (cmd && cmd.kind === 'skip') musicSkip();
            else if (cmd && cmd.kind === 'vol') musicSetVolume(mi, cmd.v);
        }
    }

    /** «!صوت10» من الشات: يغيّر صوت المشغّل الحين (يبقى لين تتحدّث الصفحة أو يتغيّر الصوت من المحرر). */
    function musicSetVolume(it, v) {
        music.volBase = it.volume;
        music.liveVol = clamp(Number(v) || 0, 0, 100);
        if (music.player && music.player.setVolume) { try { music.player.setVolume(music.liveVol); } catch (e) { /* ignore */ } }
    }

    /** «جرّب» من المحرر (screen-tests): يرجّع true لو التجربة لأداة صوت. */
    function audioTest(t) {
        var it = activeItems().filter(function (x) { return x.id === t.itemId && (x.type === 'tts' || x.type === 'music'); })[0];
        if (!it) return false;
        if (!AUDIO_ON) return true;
        if (t.type === 'tts' && it.type === 'tts') ttsEnqueue({ text: ttsFilter(Object.assign({}, it, { banned: [] }), { user: 'سارة', text: 'هلا والله، هذي تجربة للقارئ الصوتي' }), user: 'سارة', msg: 'هلا والله، هذي تجربة للقارئ الصوتي' });
        else if (t.type === 'music') musicRequest(it, 'تجربة', '__test__', 'محمد عبده الأماكن');
        else if (t.type === 'music-skip') musicSkip();
        else if (t.type === 'music-stop') musicStop();
        return true;
    }

    /* ---- القارئ ---- */

    function ttsEnqueue(job) {
        if (!job.text) return;
        tts.q.push(job);
        if (tts.q.length > TTS_Q_MAX) tts.q.splice(0, tts.q.length - TTS_Q_MAX);
        ttsNext();
    }

    function ttsNext() {
        if (tts.busy || audioBlocked || !tts.q.length) return;
        var it = audioItems('tts')[0];
        if (!it) { tts.q = []; return; }
        var job = tts.q.shift();
        var a = new Audio();
        tts.busy = true; tts.audio = a; tts.cur = job;
        a.volume = vol(it, 0.9);
        a.src = apiBase() + '/api/public/screen/tts?k=' + encodeURIComponent(LINK_KEY) + '&t=' + encodeURIComponent(job.text) +
            '&v=' + (it.voice === 'm' ? 'm' : 'f') + '&r=' + clamp(Number(it.rate) || 1, 0.5, 2);
        paintTts();
        function done() {
            if (tts.audio !== a) return;
            clearTimeout(tts.timer);
            tts.busy = false; tts.audio = null; tts.cur = null;
            paintTts();
            setTimeout(ttsNext, 300);
        }
        a.onended = done;
        a.onerror = done;
        tts.timer = setTimeout(done, 40000);
        var p = a.play();
        if (p && p.catch) p.catch(function (e) {
            if (e && e.name === 'NotAllowedError') {
                clearTimeout(tts.timer);
                tts.q.unshift(job); tts.busy = false; tts.audio = null; tts.cur = null;
                paintTts();
                blockAudio();
            } else done();
        });
    }

    function buildTts(n, it, preview) {
        var ic = el('span', 'agp-so-aic');
        ic.innerHTML = WAVE_SVG;
        var job = preview ? { user: 'أبو فهد', msg: 'السلام عليكم، كيف الحال؟' } : tts.cur;
        if (job) n.className += ' talking';
        n.appendChild(ic);
        if (it.bubble !== false && job) {
            var b = el('span', 'agp-so-tbub');
            b.appendChild(el('b', null, job.user || ''));
            b.appendChild(el('span', null, String(job.msg || '').slice(0, 140)));
            n.appendChild(b);
        }
    }

    function paintTts() { repaintAudio('tts'); }

    /* ---- مشغّل الأغاني ---- */

    function musicRequest(it, user, uid, q) {
        var max = clamp(Number(it.maxQueue) || 10, 1, 50);
        var inLine = music.queue.length + music.searches.length;
        if (inLine >= max) return;
        var mine = function (x) { return x.uid === uid; };
        if (uid !== '__test__' && (music.queue.some(mine) || music.searches.some(mine))) return; // طلب واحد لكل مشاهد
        music.searches.push({ user: user, uid: uid, q: q });
        runSearches();
    }

    function runSearches() {
        if (music.searching || !music.searches.length) return;
        var wait = music.lastSearchAt + SEARCH_GAP_MS - Date.now();
        if (wait > 0) { setTimeout(runSearches, wait); return; }
        var job = music.searches.shift();
        music.searching = true;
        music.lastSearchAt = Date.now();
        fetch(apiBase() + '/api/public/screen/music/search?k=' + encodeURIComponent(LINK_KEY) + '&q=' + encodeURIComponent(job.q))
            .then(function (res) { return res.json(); })
            .then(function (d) {
                var it = audioItems('music')[0];
                if (!it || !d || !d.success) return;
                var maxDur = clamp(Number(it.maxDurSec) || 360, 30, 3600);
                var pick = (d.results || []).filter(function (r) { return r && r.id && r.durationSec > 0 && r.durationSec <= maxDur; })[0];
                if (!pick) return;
                music.queue.push({ id: pick.id, title: pick.title, channel: pick.channel, dur: pick.durationSec, user: job.user, uid: job.uid });
                musicNext();
            })
            .catch(function () { /* نتجاهل الطلب */ })
            .then(function () { music.searching = false; runSearches(); paintMusic(); });
    }

    function ytReady(cb) {
        if (window.YT && window.YT.Player) { cb(); return; }
        music.waiters.push(cb);
        if (music.apiLoading) return;
        music.apiLoading = true;
        // مكتبة يوتيوب تنادي هذي الدالة العامة لما تجهز (شرطها، ما نقدر نغيّر اسمها)
        var prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function () {
            if (typeof prev === 'function') { try { prev(); } catch (e) { /* ignore */ } }
            var w = music.waiters; music.waiters = [];
            w.forEach(function (f) { f(); });
        };
        var sc = document.createElement('script');
        sc.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(sc);
    }

    function musicNext() {
        if (music.cur || !music.queue.length) { paintMusic(); return; }
        var it = audioItems('music')[0];
        if (!it) { music.queue = []; paintMusic(); return; }
        var cur = music.cur = music.queue.shift();
        cur.startedAt = Date.now();
        paintMusic();
        clearTimeout(music.endTimer);
        music.endTimer = setTimeout(function () { if (music.cur === cur) musicEnd(); }, (cur.dur + 20) * 1000);
        if (music.volBase !== it.volume) { music.volBase = it.volume; music.liveVol = null; } // تغيّر من المحرر → يرجع له
        var v = music.liveVol != null ? music.liveVol : Math.round(vol(it, 0.6) * 100);
        ytReady(function () {
            if (music.cur !== cur) return;
            if (!music.player) {
                var host = el('div');
                var wrap = el('div', 'agp-so-ythost');
                wrap.appendChild(host);
                document.body.appendChild(wrap);
                music.player = new window.YT.Player(host, {
                    width: 2, height: 2, videoId: cur.id,
                    playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0 },
                    events: {
                        onReady: function (e) { e.target.setVolume(v); e.target.playVideo(); checkPlaying(cur); },
                        onStateChange: function (e) { if (e.data === window.YT.PlayerState.ENDED && music.cur) musicEnd(); },
                        onError: function () { if (music.cur) musicEnd(); }
                    }
                });
            } else {
                music.player.setVolume(v);
                music.player.loadVideoById(cur.id);
                checkPlaying(cur);
            }
        });
        if (!music.tick) music.tick = setInterval(paintProgress, 1000);
    }

    /** المتصفح العادي يمنع التشغيل بدون ضغطة (OBS يسمح) → زر «تفعيل الصوت». */
    function checkPlaying(cur) {
        setTimeout(function () {
            if (music.cur !== cur || !music.player || !music.player.getPlayerState) return;
            var st = music.player.getPlayerState();
            if (st === window.YT.PlayerState.UNSTARTED || st === window.YT.PlayerState.CUED) blockAudio();
        }, 4000);
    }

    function musicEnd() {
        clearTimeout(music.endTimer);
        music.cur = null;
        if (!music.queue.length) {
            if (music.player && music.player.stopVideo) { try { music.player.stopVideo(); } catch (e) { /* ignore */ } }
            if (music.tick) { clearInterval(music.tick); music.tick = null; }
        }
        musicNext();
    }

    function musicSkip() { if (music.cur) musicEnd(); }

    function musicStop() {
        music.queue = []; music.searches = [];
        if (music.cur) musicEnd(); else paintMusic();
    }

    function buildMusic(n, it, preview) {
        var cur = preview ? { title: 'الأماكن', channel: 'محمد عبده', user: 'أبو فهد' } : music.cur;
        var card = it.design !== 'icon';
        n.className += cur ? ' playing' : ' idle';
        var ic = el('span', 'agp-so-aic');
        ic.innerHTML = NOTE_SVG;
        n.appendChild(ic);
        if (!card || !cur) return;
        var tx = el('span', 'agp-so-mtx');
        tx.appendChild(el('b', null, cur.title || ''));
        tx.appendChild(el('small', null, 'طلب: ' + (cur.user || '')));
        var bar = el('span', 'agp-so-mbar');
        var fill = el('i');
        fill.style.width = preview ? '42%' : progressPct() + '%';
        bar.appendChild(fill);
        tx.appendChild(bar);
        n.appendChild(tx);
    }

    function progressPct() {
        var p = music.player, c = music.cur;
        if (!c) return 0;
        try {
            if (p && p.getCurrentTime && p.getDuration && p.getDuration() > 0) return clamp(p.getCurrentTime() / p.getDuration() * 100, 0, 100);
        } catch (e) { /* ignore */ }
        return clamp((Date.now() - c.startedAt) / 1000 / (c.dur || 1) * 100, 0, 100);
    }

    function paintProgress() {
        if (!music.cur) return;
        Object.keys(nodes).forEach(function (id) {
            var f = nodes[id] && nodes[id].querySelector && nodes[id].querySelector('.agp-so-music .agp-so-mbar i, .agp-so-mbar i');
            if (f) f.style.width = progressPct() + '%';
        });
    }

    function paintMusic() { repaintAudio('music'); }

    /** يعيد رسم أدوات الصوت بس (بدون لمس باقي الشاشة). */
    function repaintAudio(type) {
        if (!layer || !state.enabled || !frameRect) return;
        var key = keyFor(state.template, orient());
        activeItems().forEach(function (it) {
            if (it.type !== type || !nodes[it.id]) return;
            var n = buildItem(it, frameRect);
            stage.replaceChild(n, nodes[it.id]);
            nodes[it.id] = n;
            place(n, posOf(it, key), frameRect);
        });
    }

    function blockAudio() {
        if (audioBlocked) return;
        audioBlocked = true;
        if (unlockBtn || !document.body) return;
        unlockBtn = el('button', 'agp-so-unlock', '🔊 تفعيل الصوت');
        unlockBtn.type = 'button';
        unlockBtn.addEventListener('click', function () {
            audioBlocked = false;
            if (unlockBtn && unlockBtn.parentNode) unlockBtn.parentNode.removeChild(unlockBtn);
            unlockBtn = null;
            if (music.player && music.cur && music.player.playVideo) music.player.playVideo();
            ttsNext();
        });
        document.body.appendChild(unlockBtn);
    }

    /* ---------------- رابط الأوفرلي: التصميم من السيرفر ---------------- */

    var design = { v: null, inflight: false };

    function fetchDesign() {
        if (design.inflight) return;
        design.inflight = true;
        fetch(apiBase() + '/api/public/screen?k=' + encodeURIComponent(LINK_KEY) + (design.v != null ? '&v=' + design.v : '') + '&lv=' + LIVE_VERSION)
            .then(function (res) { return res.json(); })
            .then(function (d) {
                if (!d || !d.success) {
                    // رمز غلط أو تغيّر من الاستوديو: نفضّي الشاشة
                    if (d && d.error === 'invalid_key' && state.enabled) { state = load(); design.v = null; render(); }
                    return;
                }
                if (!('design' in d)) return; // ما تغيّر
                design.v = d.updatedAt;
                state = (d.design && migrate(d.design)) || Object.assign(defaults(), { enabled: false });
                render();
            })
            .catch(function () { /* نحاول بالدورة الجاية */ })
            .then(function () { design.inflight = false; });
    }

    /* ---------------- طبقة البث (غير الاستوديو) ---------------- */

    var layer = null, stage = null, nodes = {}, frameRect = null;

    function render() {
        if (!layer) return;
        var o = orient();
        var F = frameRect = frameIn(state.template, o, viewW(), viewH());
        var key = keyFor(state.template, o);
        stage.textContent = '';
        nodes = {};
        layer.style.display = state.enabled ? '' : 'none';
        stage.style.left = F.x + 'px';
        stage.style.top = F.y + 'px';
        stage.style.width = F.w + 'px';
        stage.style.height = F.h + 'px';
        if (state.enabled) {
            activeItems().forEach(function (it) {
                var n = buildItem(it, F);
                stage.appendChild(n);
                nodes[it.id] = n;
                n._pos = posOf(it, key);
                n._F = F;
                place(n, n._pos, F);
            });
        }
        syncPolling();
        syncJarPolling();
        syncEventsPolling();
        syncLink();
    }

    /** بيانات جديدة: نعيد رسم أدوات البيانات بس (النصوص وحركتها ما تنلمس). */
    function repaintData() {
        if (!layer || !state.enabled || !frameRect) return;
        var key = keyFor(state.template, orient());
        activeItems().forEach(function (it) {
            var old = nodes[it.id];
            if (!old || !isDataItem(it) || it.type === 'jar') return;
            if (refreshItem(old, it)) return;
            var n = buildItem(it, frameRect);
            stage.replaceChild(n, old);
            nodes[it.id] = n;
            place(n, posOf(it, key), frameRect);
        });
    }

    var CSS = [
        '#agp-so-layer{position:fixed;top:0;left:0;right:0;height:100vh;z-index:' + Z + ';pointer-events:none;direction:rtl;font-family:' + FONT + ';overflow:hidden}',
        '#agp-so-stage{position:absolute}',
        '.agp-so-item{position:absolute;transform:translate(-50%,-50%);max-width:96vw;line-height:1.3;user-select:none;-webkit-user-select:none;box-sizing:border-box}',
        '.agp-so-text{white-space:pre-wrap;text-align:center;word-break:break-word;width:max-content}',
        '.agp-so-tx{display:inline-block;padding:.05em .12em}',
        '.agp-so-tx.s-shadow{text-shadow:0 .05em .2em rgba(0,0,0,.9)}',
        '.agp-so-tx.s-outline{text-shadow:-.04em -.04em 0 #000,.04em -.04em 0 #000,-.04em .04em 0 #000,.04em .04em 0 #000,0 .06em .15em rgba(0,0,0,.6)}',
        '.agp-so-tx.s-pill{background:rgba(0,0,0,.6);padding:.15em .6em;border-radius:.6em}',
        '.agp-so-tx.s-glass{background:linear-gradient(160deg,rgba(255,255,255,.18),rgba(255,255,255,.05));box-shadow:inset 0 0 0 .04em rgba(255,255,255,.3);padding:.15em .6em;border-radius:.6em;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);text-shadow:0 .04em .12em rgba(0,0,0,.5)}',
        '.agp-so-tx.s-neon{color:#fff !important;text-shadow:0 0 .04em #fff,0 0 .12em var(--agp-so-c),0 0 .3em var(--agp-so-c),0 0 .6em var(--agp-so-c)}',
        '.agp-so-tx.s-fire{color:#fff6d0 !important;text-shadow:0 0 .06em #fff,0 -.06em .15em #ffd54a,0 -.12em .3em #ff9800,0 -.2em .45em #ff3d00,0 -.3em .7em #b71c1c}',
        '.agp-so-tx.s-gradient{background:linear-gradient(180deg,#fff 10%,var(--agp-so-c) 90%);-webkit-background-clip:text;background-clip:text;color:transparent !important;filter:drop-shadow(0 .05em .08em rgba(0,0,0,.7))}',
        '.agp-so-tx.s-gold{background:linear-gradient(180deg,#fff7c9 0%,#ffd54a 40%,#c9871c 60%,#ffe58a 100%);-webkit-background-clip:text;background-clip:text;color:transparent !important;filter:drop-shadow(0 .05em .06em rgba(60,30,0,.9))}',
        '.agp-so-tx.s-rainbow{background:linear-gradient(90deg,#ff4d6d,#ffd54a,#7cff6b,#4dd8ff,#c58bff,#ff4d6d);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent !important;filter:drop-shadow(0 .05em .06em rgba(0,0,0,.8));animation:agp-so-rainbow 3s linear infinite}',
        '.agp-so-tx.s-3d{text-shadow:.02em .02em 0 rgba(0,0,0,.55),.04em .04em 0 rgba(0,0,0,.5),.06em .06em 0 rgba(0,0,0,.45),.08em .08em 0 rgba(0,0,0,.4),.1em .1em .12em rgba(0,0,0,.6)}',
        '.agp-so-tx.s-hollow{color:transparent !important;-webkit-text-stroke:.035em var(--agp-so-c);filter:drop-shadow(0 .03em .06em rgba(0,0,0,.8))}',
        '.agp-so-mv{display:inline-block}',
        /* «لوحة الأصدقاء» (بريميوم): لوحة ساتان بإضاءة وعمق، وحيوانات تطل من وراها وكفوفها على حافتها */
        '.agp-so-bn{--bnc:#c9b3e0;--bnr:#f4f1f6;--bnk:#e9a96a;position:relative;display:inline-block;margin:1.9em .4em .5em;white-space:nowrap}',
        '.bn-bar{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;min-width:var(--bnw,6em);padding:.46em 1.3em;border-radius:.34em;background:linear-gradient(180deg,color-mix(in srgb,var(--bnc) 62%,#fff) 0%,var(--bnc) 42%,color-mix(in srgb,var(--bnc) 84%,#1a0f24) 100%);border:.03em solid color-mix(in srgb,var(--bnc) 45%,#fff);box-shadow:0 .4em .9em -.25em color-mix(in srgb,var(--bnc) 55%,#000),0 .06em .14em rgba(0,0,0,.28),inset 0 .05em 0 rgba(255,255,255,.75),inset 0 -.1em .2em rgba(0,0,0,.14);overflow:hidden;box-sizing:border-box}',
        '.bn-bar::before{content:"";position:absolute;left:.08em;right:.08em;top:.04em;height:48%;border-radius:.3em .3em .6em .6em;background:linear-gradient(180deg,rgba(255,255,255,.42),rgba(255,255,255,0));pointer-events:none}',
        /* خامات حقيقية: ملمس (ضجيج SVG) + إضاءة. --bnc لون الخامة */
        '.agp-so-bn.mt-velvet .bn-bar,.agp-so-bn.mt-linen .bn-bar,.agp-so-bn.mt-wood .bn-bar,.agp-so-bn.mt-leather .bn-bar,.agp-so-bn.mt-paper .bn-bar{border:0}',
        '.agp-so-bn.mt-velvet .bn-bar,.agp-so-bn.mt-linen .bn-bar,.agp-so-bn.mt-wood .bn-bar,.agp-so-bn.mt-leather .bn-bar,.agp-so-bn.mt-paper .bn-bar{padding:.55em 1.45em}',
        '.agp-so-bn.mt-velvet .bn-bar,.agp-so-bn.mt-linen .bn-bar,.agp-so-bn.mt-wood .bn-bar,.agp-so-bn.mt-leather .bn-bar,.agp-so-bn.mt-paper .bn-bar{box-shadow:0 .45em .9em -.3em rgba(0,0,0,.6),0 .08em .16em rgba(0,0,0,.35)}',
        '.agp-so-bn.mt-velvet .bn-bar::before,.agp-so-bn.mt-linen .bn-bar::before,.agp-so-bn.mt-wood .bn-bar::before,.agp-so-bn.mt-leather .bn-bar::before,.agp-so-bn.mt-paper .bn-bar::before{display:none}',
        '.agp-so-bn.mt-velvet .bn-bar{background:' + BN_NOISE('.95', 2, '.42') + ',radial-gradient(120% 140% at 28% -10%,color-mix(in srgb,var(--bnc) 55%,#fff) 0%,transparent 55%),linear-gradient(180deg,color-mix(in srgb,var(--bnc) 88%,#fff),var(--bnc) 40%,color-mix(in srgb,var(--bnc) 62%,#120818));box-shadow:0 .45em .9em -.3em rgba(0,0,0,.6),0 .08em .16em rgba(0,0,0,.35),inset 0 0 .35em rgba(0,0,0,.45),inset 0 .04em .06em rgba(255,255,255,.25)}',
        '.agp-so-bn.mt-linen .bn-bar{background:repeating-linear-gradient(0deg,rgba(255,255,255,.12) 0 .025em,transparent .025em .06em),repeating-linear-gradient(90deg,rgba(0,0,0,.07) 0 .025em,transparent .025em .06em),' + BN_NOISE('.7', 3, '.22') + ',linear-gradient(180deg,color-mix(in srgb,var(--bnc) 92%,#fff),var(--bnc) 55%,color-mix(in srgb,var(--bnc) 82%,#3a2a1a));box-shadow:0 .45em .9em -.3em rgba(0,0,0,.55),0 .08em .16em rgba(0,0,0,.3),inset 0 0 .25em rgba(80,60,30,.25)}',
        '.agp-so-bn.mt-wood .bn-bar{background:' + BN_NOISE('.012 .42', 3, '.6', 420, 160) + ',linear-gradient(180deg,rgba(255,240,210,.22),transparent 35%,rgba(0,0,0,.18)),linear-gradient(90deg,color-mix(in srgb,var(--bnc) 88%,#000),var(--bnc) 30%,color-mix(in srgb,var(--bnc) 85%,#fff) 55%,var(--bnc) 80%,color-mix(in srgb,var(--bnc) 82%,#000));background-size:100% 100%;box-shadow:0 .45em .9em -.3em rgba(0,0,0,.6),0 .08em .16em rgba(0,0,0,.35),inset 0 .05em .04em rgba(255,235,200,.35),inset 0 -.06em .08em rgba(0,0,0,.35)}',
        '.agp-so-bn.mt-leather .bn-bar{background:' + BN_NOISE('.55', 3, '.55') + ',radial-gradient(130% 160% at 30% -20%,color-mix(in srgb,var(--bnc) 60%,#fff) 0%,transparent 50%),linear-gradient(180deg,color-mix(in srgb,var(--bnc) 90%,#fff),var(--bnc) 45%,color-mix(in srgb,var(--bnc) 60%,#000));box-shadow:0 .45em .9em -.3em rgba(0,0,0,.65),0 .08em .16em rgba(0,0,0,.4),inset 0 0 .3em rgba(0,0,0,.4),inset 0 .04em .05em rgba(255,255,255,.18)}',
        '.agp-so-bn.mt-paper .bn-bar{background:' + BN_NOISE('.85', 3, '.16') + ',radial-gradient(150% 120% at 50% 40%,transparent 55%,rgba(120,90,50,.18)),linear-gradient(180deg,color-mix(in srgb,var(--bnc) 94%,#fff),var(--bnc));box-shadow:0 .4em .8em -.3em rgba(0,0,0,.5),0 .06em .12em rgba(0,0,0,.25)}',
        '.bn-stitch{position:absolute;inset:.16em;border:.05em dashed var(--bns,color-mix(in srgb,var(--bnc) 35%,#fff));border-radius:inherit;pointer-events:none;filter:drop-shadow(0 .025em 0 rgba(0,0,0,.45));opacity:.9}',
        '.agp-so-bn.mt-leather .bn-stitch{border-width:.06em;border-color:var(--bns,#e9cf9a)}',
        '.agp-so-bn.r-soft .bn-stitch{border-radius:.22em}.agp-so-bn.r-round .bn-stitch{border-radius:1em}.agp-so-bn.r-sharp .bn-stitch{border-radius:.04em}',
        '.bn-foil{position:absolute;inset:.14em;border:.04em solid transparent;border-radius:.2em;background:linear-gradient(135deg,#f7e7a8,#c8962e 30%,#fff1c0 50%,#b07a18 70%,#f3d77d) border-box;-webkit-mask:linear-gradient(#000 0 0) padding-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}',
        '.bn-nail{position:absolute;width:.2em;height:.2em;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff6d6,#d4a64a 45%,#6e4a12);box-shadow:0 .03em .04em rgba(0,0,0,.55);pointer-events:none}',
        '.bn-nail.tl{top:.2em;left:.25em}.bn-nail.tr{top:.2em;right:.25em}.bn-nail.bl{bottom:.2em;left:.25em}.bn-nail.br{bottom:.2em;right:.25em}',
        /* لمسة النص: محفور، بارز، ذهب، عادي */
        '.agp-so-bn.tf-deboss .bn-t{text-shadow:0 .03em .01em rgba(255,255,255,.35),0 -.025em .02em rgba(0,0,0,.45)}',
        '.agp-so-bn.tf-emboss .bn-t{text-shadow:0 -.02em 0 rgba(255,255,255,.4),0 .05em .06em rgba(0,0,0,.45)}',
        '.agp-so-bn.tf-foil .bn-t{color:transparent!important;background:linear-gradient(180deg,#fff4c6,#e9c25b 35%,#a8761a 55%,#f6dc8a 75%,#c08a26);-webkit-background-clip:text;background-clip:text;text-shadow:none;filter:drop-shadow(0 .03em .02em rgba(0,0,0,.45))}',
        '.agp-so-bn.r-sharp .bn-bar{border-radius:.08em}.agp-so-bn.r-round .bn-bar{border-radius:1.2em}',
        '.bn-tw{position:relative;z-index:1;display:flex;justify-content:center;max-width:100%}',
        '.bn-t{display:inline-block;position:relative;padding:0;text-shadow:0 .02em 0 rgba(255,255,255,.4),0 .04em .08em rgba(0,0,0,.12)}',
        '.bn-ch{position:absolute;display:flex;align-items:flex-end;gap:.15em;pointer-events:none}',
        '.bn-heads{z-index:0;bottom:calc(100% - .55em)}',
        '.bn-paws{z-index:2;bottom:calc(100% - .32em)}',
        '.bn-ch.p-center{left:50%;transform:translateX(-50%)}.bn-ch.p-right{right:10%}.bn-ch.p-left{left:10%}',
        '.bn-c,.bn-pw{display:block;width:2.2em;flex:none}',
        '.bn-c{transform-origin:50% 100%;animation:agp-so-bnpeek 4.6s ease-in-out infinite}',
        '.bn-c.bunny{margin-bottom:0}.bn-c.kitten{margin-bottom:.34em;animation-delay:-2.3s}',
        '.bn-c svg,.bn-pw svg{width:100%;display:block;overflow:visible}',
        '.bn-c svg{filter:drop-shadow(0 .04em .06em rgba(0,0,0,.25))}',
        '.bn-c .ey{transform-box:fill-box;transform-origin:center;animation:agp-so-bnblink 4.2s infinite}',
        '.bn-c.kitten .ey{animation-delay:-1.5s}',
        '.bn-c .ear-r{transform-box:fill-box;transform-origin:50% 100%;animation:agp-so-bnear 5.5s ease-in-out infinite}',
        '.bn-heads.still .bn-c,.bn-heads.still .ear-r{animation:none}',
        '@keyframes agp-so-bnpeek{0%,50%,100%{transform:translateY(0) rotate(0)}62%{transform:translateY(-7%) rotate(-4deg)}74%{transform:translateY(-4%) rotate(3deg)}86%{transform:translateY(0) rotate(0)}}',
        '@keyframes agp-so-bnblink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}',
        '@keyframes agp-so-bnear{0%,80%,100%{transform:rotate(0)}86%{transform:rotate(-10deg)}92%{transform:rotate(4deg)}}',
        /* حركات الخلفية */
        '.agp-so-bn.bg-shimmer .bn-bar::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 40%,rgba(255,255,255,.5) 50%,transparent 60%);background-size:260% 100%;animation:agp-so-bnsh 3.8s ease-in-out infinite}',
        '.bn-spk{position:absolute;inset:0;pointer-events:none}',
        '.bn-spk i{position:absolute;transform:translate(-50%,-50%) scale(0);background:linear-gradient(90deg,transparent 44%,#fff 50%,transparent 56%),linear-gradient(0deg,transparent 44%,#fff 50%,transparent 56%),radial-gradient(closest-side,#fff,rgba(255,255,255,0) 60%);-webkit-mask:radial-gradient(closest-side,#000 30%,transparent);mask:radial-gradient(closest-side,#000 30%,transparent);animation:agp-so-bnspk 2.4s ease-in-out infinite}',
        '@keyframes agp-so-bnspk{0%,100%{transform:translate(-50%,-50%) scale(0) rotate(0)}50%{transform:translate(-50%,-50%) scale(1) rotate(45deg)}}',
        '.agp-so-bn.bg-gradient .bn-bar{background:linear-gradient(90deg,var(--bnc),color-mix(in srgb,var(--bnc) 62%,#fff),color-mix(in srgb,var(--bnc) 80%,#ff9fd0),var(--bnc));background-size:300% 100%;animation:agp-so-bngr 5s ease-in-out infinite alternate}',
        '.agp-so-bn.bg-breathe .bn-bar{animation:agp-so-bnbr 3s ease-in-out infinite}',
        '.bn-bub{position:absolute;inset:0;pointer-events:none}',
        '.bn-bub i{position:absolute;bottom:-.4em;border-radius:50%;background:rgba(255,255,255,.45);box-shadow:inset -.04em -.04em .06em rgba(255,255,255,.6);animation:agp-so-bnbub 4s ease-in infinite}',
        '@keyframes agp-so-bnsh{0%,40%{background-position:120% 0}100%{background-position:-120% 0}}',
        '@keyframes agp-so-bngr{to{background-position:100% 0}}',
        '@keyframes agp-so-bnbr{0%,100%{transform:scale(1);filter:brightness(1)}50%{transform:scale(1.025);filter:brightness(1.08)}}',
        '@keyframes agp-so-bnbub{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:1}100%{transform:translateY(-3em) scale(1.1);opacity:0}}',
        /* حركات النص */
        '.agp-so-bn.m-marquee .bn-bar{width:var(--bnw,11em);padding-left:0;padding-right:0}',
        '.agp-so-bn.m-marquee .bn-tw{overflow:hidden;width:100%;justify-content:flex-start;-webkit-mask:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent);mask:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)}',
        '.bn-track{display:flex;direction:ltr;width:max-content;animation:agp-so-ldmq 8s linear infinite}',
        '.bn-track .bn-t{direction:rtl;padding:0 1.4em}',
        '.agp-so-bn.m-type .bn-t{animation:agp-so-ldtype 7s ease-in-out infinite}',
        '.bn-cur{position:absolute;top:.05em;bottom:.05em;width:.07em;border-radius:.07em;background:currentColor;animation:agp-so-ldcur 7s ease-in-out infinite}',
        '.agp-so-bn.m-pop .bn-t{animation:agp-so-bnpop 4s cubic-bezier(.2,1.4,.4,1) infinite}',
        '.agp-so-bn.m-float .bn-t{animation:agp-so-bnfl 3s ease-in-out infinite}',
        '@keyframes agp-so-bnpop{0%{transform:scale(.4);opacity:0}12%{transform:scale(1.08);opacity:1}20%,100%{transform:scale(1);opacity:1}}',
        '@keyframes agp-so-bnfl{0%,100%{transform:translateY(.05em) rotate(-1deg)}50%{transform:translateY(-.07em) rotate(1deg)}}',
        '.agp-so-mv[class*=" a-"]{animation-iteration-count:infinite;animation-timing-function:ease-in-out;will-change:transform}',
        '.agp-so-mv.a-pulse{animation-name:agp-so-pulse}',
        '.agp-so-mv.a-heartbeat{animation-name:agp-so-heartbeat}',
        '.agp-so-mv.a-bounce{animation-name:agp-so-bounce}',
        '.agp-so-mv.a-float{animation-name:agp-so-float}',
        '.agp-so-mv.a-swing{animation-name:agp-so-swing;transform-origin:50% 0}',
        '.agp-so-mv.a-shake{animation-name:agp-so-shake;animation-timing-function:linear}',
        '.agp-so-mv.a-zoom{animation-name:agp-so-zoom}',
        '.agp-so-mv.a-blink{animation-name:agp-so-blink;animation-timing-function:steps(1,end)}',
        '.agp-so-mv.a-glow{animation-name:agp-so-glow}',
        '.agp-so-mv.a-hue{animation-name:agp-so-hue;animation-timing-function:linear}',
        '@keyframes agp-so-rainbow{to{background-position:-200% 0}}',
        '@keyframes agp-so-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}',
        '@keyframes agp-so-heartbeat{0%,40%,100%{transform:scale(1)}10%,30%{transform:scale(1.12)}20%{transform:scale(1.02)}}',
        '@keyframes agp-so-bounce{0%,100%{transform:translateY(0)}30%{transform:translateY(-.25em)}50%{transform:translateY(0)}65%{transform:translateY(-.1em)}80%{transform:translateY(0)}}',
        '@keyframes agp-so-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-.15em)}}',
        '@keyframes agp-so-swing{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}',
        '@keyframes agp-so-shake{0%,100%{transform:translate(0,0) rotate(0)}20%{transform:translate(-.03em,.02em) rotate(-2deg)}40%{transform:translate(.03em,-.02em) rotate(2deg)}60%{transform:translate(-.02em,-.02em) rotate(-1deg)}80%{transform:translate(.02em,.02em) rotate(1deg)}}',
        '@keyframes agp-so-zoom{0%,100%{transform:scale(.9)}50%{transform:scale(1.15)}}',
        '@keyframes agp-so-blink{0%,100%{opacity:1}50%{opacity:.15}}',
        '@keyframes agp-so-glow{0%,100%{filter:brightness(1) drop-shadow(0 0 0 transparent)}50%{filter:brightness(1.35) drop-shadow(0 0 .2em var(--agp-so-c))}}',
        '@keyframes agp-so-hue{to{filter:hue-rotate(360deg)}}',
        '.agp-so-top{--agp-so-c:#ffd54a;color:#fff;display:flex;flex-direction:column;align-items:center;gap:.35em;text-shadow:0 .04em .12em rgba(0,0,0,.85)}',
        '.agp-so-widget .rk1{--rk:#ffd54a;--rk2:#e08e0b}',
        '.agp-so-widget .rk2{--rk:#eef2f7;--rk2:#8e9aab}',
        '.agp-so-widget .rk3{--rk:#ffb27a;--rk2:#b25a22}',
        '.agp-so-widget .rkn{--rk:var(--agp-so-c);--rk2:rgba(0,0,0,.4)}',
        '.agp-so-wtitle{font-weight:800;font-size:1.05em;letter-spacing:.02em;padding:0 .8em .1em;color:#fff;background:linear-gradient(90deg,transparent,var(--agp-so-c),transparent) bottom/100% .1em no-repeat}',
        '.agp-so-lbody{display:flex;flex-direction:column;align-items:center;gap:.45em}',
        '.agp-so-ghost{opacity:.5}',
        '.agp-so-empty{text-align:center;font-size:.7em;opacity:.8}',
        '.agp-so-av{position:relative;display:inline-flex;align-items:center;justify-content:center;width:2.2em;height:2.2em;border-radius:50%;flex:none;padding:.12em;box-sizing:border-box;background:linear-gradient(145deg,var(--rk),var(--rk2));box-shadow:0 .1em .35em rgba(0,0,0,.55)}',
        '.agp-so-av img,.agp-so-av-i{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#22243a;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.9em}',
        '.agp-so-name{font-weight:700;max-width:8em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.agp-so-count{font-weight:800;color:var(--agp-so-c);direction:ltr;font-size:.85em;white-space:nowrap}',
        '.agp-so-medal{display:inline-flex;align-items:center;justify-content:center;flex:none;width:1.5em;height:1.5em;border-radius:50%;font-weight:900;font-size:.85em;color:#1a1206;text-shadow:none;background:radial-gradient(circle at 35% 30%,#fff8,transparent 45%),linear-gradient(145deg,var(--rk),var(--rk2));box-shadow:0 .08em .25em rgba(0,0,0,.5)}',
        /* منصة تتويج */
        '.agp-so-podium{display:flex;align-items:flex-end;justify-content:center;gap:.4em}',
        '.agp-so-pcol{display:flex;flex-direction:column;align-items:center;gap:.15em;width:5.4em}',
        '.agp-so-pcol .agp-so-name{max-width:5.4em;font-size:.85em}',
        '.agp-so-pcol.rk1 .agp-so-av{width:3.3em;height:3.3em;box-shadow:0 0 .6em rgba(255,213,74,.55),0 .1em .35em rgba(0,0,0,.55)}',
        '.agp-so-pcol.rk2 .agp-so-av,.agp-so-pcol.rk3 .agp-so-av{width:2.6em;height:2.6em}',
        '.agp-so-crown{width:1.5em;color:#ffd54a;filter:drop-shadow(0 .05em .1em rgba(0,0,0,.6));margin-bottom:-.15em}',
        '.agp-so-crown svg{display:block;width:100%;height:auto}',
        '.agp-so-step{margin-top:.25em;width:100%;display:flex;align-items:flex-start;justify-content:center;padding-top:.15em;font-weight:900;font-size:1.3em;color:rgba(0,0,0,.55);text-shadow:0 .04em 0 rgba(255,255,255,.35);border-radius:.3em .3em .1em .1em;background:linear-gradient(180deg,var(--rk),var(--rk2));box-shadow:inset 0 .08em 0 rgba(255,255,255,.45),0 .15em .4em rgba(0,0,0,.45)}',
        '.agp-so-pcol.rk1 .agp-so-step{height:2.1em}',
        '.agp-so-pcol.rk2 .agp-so-step{height:1.5em}',
        '.agp-so-pcol.rk3 .agp-so-step{height:1.1em}',
        /* العرش (Veyro) */
        '@property --agp-so-ang{syntax:"<angle>";inherits:false;initial-value:0deg}',
        '.agp-so-top.d-throne .agp-so-lbody{gap:0}',
        '.agp-so-throne{display:flex;align-items:flex-end;justify-content:center;gap:.15em;padding-top:1.4em}',
        '.agp-so-tcol{display:flex;flex-direction:column;align-items:center;width:5.4em}',
        '.agp-so-tcol.rk1{width:6.2em;margin-bottom:.55em;margin-inline:var(--agp-so-tov,0em);position:relative;z-index:1}',
        '.agp-so-tname{margin-top:.95em;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:"Noto Kufi Arabic","IBM Plex Sans Arabic",system-ui,sans-serif;font-weight:700;font-size:.78em;line-height:1.5;color:#fff;letter-spacing:.01em;text-shadow:0 .06em .2em rgba(0,0,0,.9),0 0 .6em rgba(0,0,0,.45)}',
        '.agp-so-tcol.rk1 .agp-so-tname{font-size:.92em}',
        /* رقم المركز: ماسة كريستال بلون المركز (ذهبي/فضي/برونزي) ملاصقة للإطار الدائري تحت يمين */
        '.agp-so-trank{position:absolute;z-index:7;left:85.4%;top:85.4%;width:34%;height:34%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;pointer-events:none;animation:agp-so-rpop 3.2s ease-in-out infinite}',
        '.agp-so-trank::before{content:"";position:absolute;inset:8%;transform:rotate(45deg);border-radius:18%;background:linear-gradient(135deg,rgba(255,255,255,.95),var(--rk,#efe2ff) 45%,var(--rk2,#b48cff));box-shadow:0 0 .35em var(--rk,#efe2ff),0 0 .7em rgba(180,140,255,.55),inset 0 0 .12em rgba(255,255,255,.9)}',
        '.agp-so-trank::after{content:"";position:absolute;inset:8%;transform:rotate(45deg);border-radius:18%;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.85) 50%,transparent 65%);background-size:300% 100%;animation:agp-so-rshine 2.8s ease-in-out infinite}',
        '.rk2 .agp-so-trank::after,.rk2 .agp-so-trank{animation-delay:.5s}',
        '.rk3 .agp-so-trank::after,.rk3 .agp-so-trank{animation-delay:1s}',
        '@keyframes agp-so-rpop{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.08)}}',
        '@keyframes agp-so-rshine{0%,55%{background-position:120% 0}100%{background-position:-120% 0}}',
        '.agp-so-trank b{position:relative;z-index:1;font-family:"Noto Kufi Arabic",system-ui,sans-serif;font-weight:800;font-size:calc(var(--s,2.2em) * .2);line-height:1;color:#2a1f3d;text-shadow:0 .03em 0 rgba(255,255,255,.6)}',
        '.agp-so-tcount{display:inline-flex;align-items:center;gap:.28em;margin-top:.15em;padding:.12em .55em .12em .45em;border-radius:999px;direction:ltr;background:rgba(10,8,16,.42);border:.05em solid color-mix(in srgb,var(--rk) 45%,transparent);box-shadow:0 .1em .4em rgba(0,0,0,.35)}',
        '.agp-so-tnum{font-family:"IBM Plex Sans Arabic",system-ui,sans-serif;font-weight:700;font-size:.72em;line-height:1.35;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:.02em;text-shadow:0 .05em .15em rgba(0,0,0,.7)}',
        '.agp-so-tcol.rk1 .agp-so-tnum{font-size:.8em}',
        '.agp-so-tic{display:inline-flex;width:.95em;height:.95em;flex:none;color:var(--rk);filter:drop-shadow(0 0 .18em rgba(255,60,120,.55))}',
        '.agp-so-tic svg,.agp-so-tic img{width:100%;height:100%;display:block}',
        '.agp-so-tic.i-gifters{width:1.15em;height:1.15em;margin:-.08em 0;filter:drop-shadow(0 0 .16em rgba(255,190,60,.6))}',
        '.agp-so-tcol.rk1 .agp-so-tic.i-gifters{animation:agp-so-coin 3.2s ease-in-out infinite}',
        '@keyframes agp-so-coin{0%,70%,100%{transform:perspective(4em) rotateY(0)}85%{transform:perspective(4em) rotateY(360deg)}}',
        '.agp-so-tcol.rk1 .agp-so-tic{animation:agp-so-beat 1.4s ease-in-out infinite}',
        '@keyframes agp-so-beat{0%,100%{transform:scale(1)}15%{transform:scale(1.22)}30%{transform:scale(1)}45%{transform:scale(1.14)}}',
        '.agp-so-throne.pal-single .agp-so-tcol,.agp-so-stack.pal-single .agp-so-scard{--rk:var(--agp-so-c)}',
        '.agp-so-tbox.pal-custom .rk1{--rk:var(--agp-so-rk1,#ffd54a);--rk2:color-mix(in srgb,var(--agp-so-rk1,#ffd54a) 55%,#000)}',
        '.agp-so-tbox.pal-custom .rk2{--rk:var(--agp-so-rk2,#eef2f7);--rk2:color-mix(in srgb,var(--agp-so-rk2,#eef2f7) 55%,#000)}',
        '.agp-so-tbox.pal-custom .rk3{--rk:var(--agp-so-rk3,#ffb27a);--rk2:color-mix(in srgb,var(--agp-so-rk3,#ffb27a) 55%,#000)}',
        '.agp-so-tbox .agp-so-tname,.agp-so-tbox .agp-so-sname{color:var(--agp-so-namec,#fff)}',
        '.agp-so-tbox .agp-so-tnum{color:var(--agp-so-numc,#fff)}',
        '.agp-so-tbox .agp-so-tcount{background:var(--agp-so-pillbg,rgba(10,8,16,.42))}',
        /* «القائمة» (Veyro L1): بطاقات تحت بعض لين 10 */
        '.agp-so-top.d-stack .agp-so-lbody{gap:0}',
        '.agp-so-stack{display:flex;flex-direction:column;gap:var(--agp-so-sgap,.32em);width:14em}',
        '.agp-so-stack:not(.pal-single) .agp-so-scard.rkn{--rk:#cfc3dc}',
        '.agp-so-stack.fk-angel{--agp-so-sgap0:.55em}',
        '.agp-so-stack.fk-pegasus{--agp-so-sgap0:.95em;width:15em}',
        '.agp-so-stack.fk-crystal{--agp-so-sgap0:.6em}',
        '.agp-so-stack.fk-angel,.agp-so-stack.fk-pegasus,.agp-so-stack.fk-crystal{gap:var(--agp-so-sgap,var(--agp-so-sgap0))}',
        '.agp-so-scard{position:relative;border-radius:.75em;background:linear-gradient(270deg,color-mix(in srgb,var(--rk) 30%,rgba(14,12,20,.94)),rgba(14,12,20,.9) 55%,rgba(14,12,20,.84));box-shadow:inset 0 0 0 .05em color-mix(in srgb,var(--rk) 45%,rgba(255,255,255,.1)),inset 0 .04em 0 rgba(255,255,255,.07),0 .3em .7em -.45em rgba(0,0,0,.9)}',
        '.agp-so-scard::before{content:"";position:absolute;top:18%;bottom:18%;right:0;width:.1em;border-radius:.1em 0 0 .1em;background:var(--rk);box-shadow:0 0 .35em var(--rk)}',
        '.agp-so-sin{display:flex;align-items:center;gap:.5em;padding:.3em .6em .3em .55em}',
        '.agp-so-scard.rk1 .agp-so-sin{padding:.42em .65em .42em .6em}',
        '.agp-so-scard.rk1{background:linear-gradient(270deg,color-mix(in srgb,var(--rk) 40%,rgba(14,12,20,.75)),rgba(14,12,20,.55))}',
        '.agp-so-snum{width:1.1em;flex:none;text-align:center;font-family:"Noto Kufi Arabic","IBM Plex Sans Arabic",system-ui,sans-serif;font-weight:800;font-size:.78em;color:var(--rk);text-shadow:0 .06em .25em rgba(0,0,0,.65)}',
        '.agp-so-scard.rk1 .agp-so-snum{font-size:1.05em}',
        '.agp-so-stack .agp-so-fav{--s:1.35em}',
        '.agp-so-stack .agp-so-scard.rk1 .agp-so-fav{--s:1.8em}',
        '.agp-so-stack.fk-pegasus .agp-so-fav{margin-inline:.35em}',
        '.agp-so-sname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:"Noto Kufi Arabic","IBM Plex Sans Arabic",system-ui,sans-serif;font-weight:700;font-size:.6em;color:#fff;text-shadow:0 .06em .2em rgba(0,0,0,.9)}',
        '.agp-so-scard.rk1 .agp-so-sname{font-size:.72em}',
        '.agp-so-stack .agp-so-tcount{margin:0;font-size:.82em}',
        '.agp-so-stack .agp-so-scard.rk1 .agp-so-tcount{font-size:.92em}',
        '.agp-so-ssheen{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none}',
        '.agp-so-ssheen::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.2) 48%,transparent 66%);transform:translateX(120%);animation:agp-so-ssheen 4s ease-in-out 1s infinite}',
        '@keyframes agp-so-ssheen{0%,60%{transform:translateX(120%)}100%{transform:translateX(-120%)}}',
        '.agp-so-scard.t-enter{animation:agp-so-senter .6s cubic-bezier(.2,1,.3,1) both;animation-delay:var(--d)}',
        '@keyframes agp-so-senter{0%{opacity:0;transform:translateX(-1.2em)}100%{opacity:1;transform:none}}',
        '.fr-ring .agp-so-av,.fr-none .agp-so-av{width:100%;height:100%;padding:0;background:none;box-shadow:none}',
        '.agp-so-fring{position:absolute;inset:-12%;border-radius:50%;pointer-events:none;background:conic-gradient(from var(--agp-so-ang,0deg),var(--rk),transparent 30%,color-mix(in srgb,var(--rk) 50%,#fff) 50%,transparent 72%,var(--rk));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - .09em),#000 calc(100% - .08em));mask:radial-gradient(farthest-side,transparent calc(100% - .09em),#000 calc(100% - .08em));filter:drop-shadow(0 0 .12em var(--rk));animation:agp-so-f7spin 2.6s linear infinite}',
        '.agp-so-tin{display:flex;flex-direction:column;align-items:center;animation:agp-so-tbob 4.4s ease-in-out infinite;animation-delay:calc(var(--d) * -6)}',
        '@keyframes agp-so-tbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.12em)}}',
        '.agp-so-tcol.t-enter{animation:agp-so-tenter .8s cubic-bezier(.2,1.3,.4,1) both;animation-delay:var(--d)}',
        '@keyframes agp-so-tenter{0%{opacity:0;transform:translateY(.8em) scale(.6)}100%{opacity:1;transform:none}}',
        '.agp-so-tcol.t-out,.agp-so-scard.t-out{transition:transform .32s ease-in,opacity .32s ease-in,filter .32s ease-in;opacity:0}',
        '.agp-so-tcol.t-out-flip,.agp-so-scard.t-out-flip{transform:perspective(20em) rotateY(90deg) scale(.9)}',
        '.agp-so-tcol.t-out-fade,.agp-so-scard.t-out-fade{filter:blur(.2em)}',
        '.agp-so-tcol.t-out-slide,.agp-so-scard.t-out-slide{transform:translateX(1.4em)}',
        '.agp-so-tcol.t-out-zoom,.agp-so-scard.t-out-zoom{transform:scale(.25)}',
        '.agp-so-tcol.t-out-drop,.agp-so-scard.t-out-drop{transform:translateY(1.2em)}',
        '.agp-so-tcol.t-out-spin,.agp-so-scard.t-out-spin{transform:rotate(200deg) scale(.3)}',
        '.agp-so-tcol.t-out-flash,.agp-so-scard.t-out-flash{transform:scale(1.25);filter:brightness(3) blur(.1em)}',
        '.agp-so-tcol.t-in,.agp-so-scard.t-in{animation:.55s cubic-bezier(.2,1.2,.4,1) both}',
        '.agp-so-tcol.t-in-flip,.agp-so-scard.t-in-flip{animation-name:agp-so-tin-flip}',
        '.agp-so-tcol.t-in-fade,.agp-so-scard.t-in-fade{animation-name:agp-so-tin-fade;animation-timing-function:ease-out}',
        '.agp-so-tcol.t-in-slide,.agp-so-scard.t-in-slide{animation-name:agp-so-tin-slide}',
        '.agp-so-tcol.t-in-zoom,.agp-so-scard.t-in-zoom{animation-name:agp-so-tin-zoom}',
        '.agp-so-tcol.t-in-drop,.agp-so-scard.t-in-drop{animation-name:agp-so-tin-drop;animation-duration:.7s}',
        '.agp-so-tcol.t-in-spin,.agp-so-scard.t-in-spin{animation-name:agp-so-tin-spin;animation-duration:.7s}',
        '.agp-so-tcol.t-in-flash,.agp-so-scard.t-in-flash{animation-name:agp-so-tin-flash;animation-timing-function:ease-out}',
        '@keyframes agp-so-tin-flip{0%{opacity:0;transform:perspective(20em) rotateY(-90deg) scale(.9)}100%{opacity:1;transform:none}}',
        '@keyframes agp-so-tin-fade{0%{opacity:0;filter:blur(.2em)}100%{opacity:1;filter:none}}',
        '@keyframes agp-so-tin-slide{0%{opacity:0;transform:translateX(-1.4em)}100%{opacity:1;transform:none}}',
        '@keyframes agp-so-tin-zoom{0%{opacity:0;transform:scale(.25)}100%{opacity:1;transform:none}}',
        '@keyframes agp-so-tin-drop{0%{opacity:0;transform:translateY(-1.6em)}60%{opacity:1;transform:translateY(.15em)}100%{transform:none}}',
        '@keyframes agp-so-tin-spin{0%{opacity:0;transform:rotate(-200deg) scale(.3)}100%{opacity:1;transform:none}}',
        '@keyframes agp-so-tin-flash{0%{opacity:0;filter:brightness(3) blur(.1em);transform:scale(1.25)}100%{opacity:1;filter:none;transform:none}}',
        '.agp-so-twait{margin-top:.4em}',
        '.agp-so-tbox .agp-so-fart,.agp-so-tbox .agp-so-fspk{filter:hue-rotate(var(--agp-so-fhue,0deg))}',
        '.agp-so-tbox .agp-so-fcomet{filter:hue-rotate(var(--agp-so-fhue,0deg)) drop-shadow(0 0 .12em var(--agp-so-fg1,#9fe0ff))}',
        '.agp-so-tbox .agp-so-fbf{filter:hue-rotate(var(--agp-so-fhue,0deg)) drop-shadow(0 0 .1em var(--agp-so-fg1,#8fd8ff)) drop-shadow(0 0 .22em var(--agp-so-fg2,#3aa8ff))}',
        /* «الحصان المجنح» رسمته أكبر (الأجنحة والحصان برا الدائرة): صورة أصغر وأعمدة أعرض ومسافة للاسم */
        '.agp-so-throne.fk-pegasus{padding-top:2.3em}',
        '.agp-so-throne.fk-pegasus .agp-so-tcol{width:6.6em}',
        '.agp-so-throne.fk-pegasus .agp-so-tcol.rk1{width:7.4em}',
        '.agp-so-throne.fk-pegasus .agp-so-tcol .agp-so-fav{--s:2.35em}',
        '.agp-so-throne.fk-pegasus .agp-so-tcol.rk1 .agp-so-fav{--s:3.15em}',
        '.agp-so-throne.fk-pegasus .agp-so-tname{margin-top:1.3em}',
        '.agp-so-throne.fk-pegasus .agp-so-tcol.rk1 .agp-so-tname{margin-top:1.5em}',
        '.agp-so-fbf.feather svg{animation:agp-so-feather 2.4s ease-in-out infinite;transform-origin:30% 80%}',
        '@keyframes agp-so-feather{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(16deg) translateY(-6%)}}',
        /* «الأجنحة الكريستالية»: الإطار ثابت، والحركة ضوء — لمعة تمر عليه، توهّج يتنفّس، وشرار يلمع. ألوانه أنعم */
        '.agp-so-fshine{position:absolute;inset:0;pointer-events:none;-webkit-mask-size:100% 100%;mask-size:100% 100%;background:linear-gradient(115deg,transparent 38%,rgba(255,255,255,.0) 42%,rgba(255,255,255,.85) 50%,rgba(255,255,255,0) 58%,transparent 62%);background-size:300% 100%;mix-blend-mode:screen;animation:agp-so-fsweep 3.6s cubic-bezier(.4,0,.2,1) infinite}',
        '@keyframes agp-so-fsweep{0%,30%{background-position:130% 0}100%{background-position:-130% 0}}',
        '.fr-crystal .agp-so-fart img:not(.glow){filter:saturate(.8) brightness(1.03)}',
        '.fr-crystal .agp-so-fart img.glow{filter:blur(.18em) saturate(.7) brightness(1.3);animation:agp-so-cbreath 3.6s ease-in-out infinite}',
        '@keyframes agp-so-cbreath{0%,100%{opacity:.18}50%{opacity:.5}}',
        '.fr-crystal .agp-so-fspk{animation-duration:3.2s}',
        '.fr-crystal .agp-so-fspk{background:#fbf6ff;box-shadow:0 0 .2em #efe2ff,0 0 .4em #b48cff}',
        '.fr-crystal .agp-so-fcomet{background:conic-gradient(from var(--agp-so-ang,0deg),transparent 0 78%,rgba(214,190,255,.85) 95%,#fff 99%,transparent 100%)}',
        '.fr-pegasus .agp-so-fspk{background:#fff8e0;box-shadow:0 0 .2em #ffe6a3,0 0 .4em #ffbf3a}',
        '.fr-pegasus .agp-so-fcomet{background:conic-gradient(from var(--agp-so-ang,0deg),transparent 0 78%,rgba(255,230,160,.85) 95%,#fff 99%,transparent 100%)}',
        /* إطار «جناح الملاك» */
        '.agp-so-fav{--s:2.5em;position:relative;width:var(--s);height:var(--s);flex:none}',
        '.agp-so-tcol.rk1 .agp-so-fav{--s:3.8em}',
        '.agp-so-fav .agp-so-av{width:100%;height:100%;padding:0;background:none;box-shadow:none}',
        '.agp-so-fart{position:absolute;z-index:3;width:149%;height:149%;left:-25.25%;top:-24.5%;pointer-events:none;transform-origin:50.5% 50%;animation:agp-so-f7float 4.2s ease-in-out infinite}',
        '.agp-so-fart img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}',
        '.agp-so-fart img.glow{filter:blur(.15em) brightness(1.4);opacity:.35;animation:agp-so-f7glow 2.6s ease-in-out infinite}',
        '.agp-so-fcomet{position:absolute;z-index:4;inset:-3.6%;border-radius:50%;pointer-events:none;background:conic-gradient(from var(--agp-so-ang,0deg),transparent 0 78%,rgba(190,235,255,.85) 95%,#fff 99%,transparent 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - .09em),#000 calc(100% - .07em));mask:radial-gradient(farthest-side,transparent calc(100% - .09em),#000 calc(100% - .07em));filter:drop-shadow(0 0 .12em #9fe0ff);animation:agp-so-f7spin 3.4s linear infinite}',
        '.agp-so-fspk{position:absolute;z-index:5;width:5%;height:5%;min-width:2px;min-height:2px;border-radius:50%;background:#e8f8ff;box-shadow:0 0 .2em #9fe0ff,0 0 .4em #4fb6ff;opacity:0;pointer-events:none;animation:agp-so-f7spark 2.8s ease-in-out infinite}',
        '.agp-so-fbfo{position:absolute;inset:-14%;z-index:5;pointer-events:none;animation:agp-so-spin 11s linear infinite}',
        '.agp-so-fbfo.b2{inset:-6%;animation-duration:15s;animation-direction:reverse}',
        '.agp-so-fbf{position:absolute;top:0;left:50%;width:20%;height:20%;transform:translate(-50%,-50%) rotate(90deg);filter:drop-shadow(0 0 .1em #8fd8ff) drop-shadow(0 0 .22em #3aa8ff)}',
        '.agp-so-fbfo.b2 .agp-so-fbf{transform:translate(-50%,-50%) rotate(-90deg) scale(.8)}',
        '.agp-so-fbf svg{width:100%;height:100%;overflow:visible;display:block}',
        '.agp-so-fbf .wl,.agp-so-fbf .wr{transform-origin:50% 50%;animation:agp-so-flap .32s ease-in-out infinite alternate}',
        '@keyframes agp-so-flap{to{transform:scaleX(.25)}}',
        '@keyframes agp-so-spin{to{transform:rotate(360deg)}}',
        '@keyframes agp-so-f7spin{to{--agp-so-ang:360deg}}',
        '@keyframes agp-so-f7float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-1.5%) rotate(-1.2deg)}}',
        '@keyframes agp-so-f7glow{50%{opacity:.7}}',
        '@keyframes agp-so-f7spark{0%{opacity:0;transform:translateY(0) scale(.4)}30%{opacity:1;transform:translateY(-20%) scale(1)}100%{opacity:0;transform:translateY(-160%) scale(.3)}}',
        /* إطار «الفراشات» — مرسوم بالكود. --agp-so-bfc لون القوس، --agp-so-bff الفراشات، --agp-so-bfr الحلقة */
        '.fr-butterfly{--bfc:var(--agp-so-bfc,#b47cff);--bff:var(--agp-so-bff,var(--bfc));--bfr:var(--agp-so-bfr,#fff)}',
        /* إطار «الغبار الذهبي» — --agp-so-bfc لون المذنّبين، --agp-so-sdd لون الغبار */
        '.fr-stardust{--bfc:var(--agp-so-bfc,#ffcc4d);--sdd:var(--agp-so-sdd,var(--bfc));--bfr:var(--agp-so-bfr,#fff)}',
        '.fr-stardust .agp-so-av{position:relative;z-index:1}',
        '.agp-so-sdglow{position:absolute;inset:-10%;z-index:0;border-radius:50%;pointer-events:none;background:radial-gradient(closest-side,transparent 80%,color-mix(in srgb,var(--bfc) 9%,transparent) 88%,transparent);animation:agp-so-bfbreath 3.6s ease-in-out infinite}',
        /* الحركة بالترتيب (دورة 9 ثواني): المذنّب الأول يطلق ويوقف، يطلع غباره، بعدها الثاني، يلمعون شوي، يختفون، وتعيد */
        '.agp-so-sdw{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:0;animation:agp-so-sdgo0 9s infinite}',
        '.agp-so-sdw.g1{animation-name:agp-so-sdgo1}',
        '.agp-so-sddust{position:absolute;inset:0;opacity:0;animation:agp-so-sddust0 9s infinite}',
        '.agp-so-sddust.g1{animation-name:agp-so-sddust1}',
        '@keyframes agp-so-sdgo0{0%{transform:rotate(-210deg);opacity:0;animation-timing-function:cubic-bezier(.2,.7,.25,1)}3%{opacity:1}16%{transform:rotate(0)}84%{opacity:1;transform:rotate(0)}94%,100%{opacity:0;transform:rotate(0)}}',
        '@keyframes agp-so-sdgo1{0%,17%{transform:rotate(-210deg);opacity:0;animation-timing-function:cubic-bezier(.2,.7,.25,1)}20%{opacity:1}33%{transform:rotate(0)}84%{opacity:1;transform:rotate(0)}94%,100%{opacity:0;transform:rotate(0)}}',
        '@keyframes agp-so-sddust0{0%,13%{opacity:0;transform:scale(.88)}22%{opacity:1;transform:scale(1)}84%{opacity:1;transform:scale(1)}94%,100%{opacity:0;transform:scale(1.04)}}',
        '@keyframes agp-so-sddust1{0%,30%{opacity:0;transform:scale(.88)}39%{opacity:1;transform:scale(1)}84%{opacity:1;transform:scale(1)}94%,100%{opacity:0;transform:scale(1.04)}}',
        /* المذنّب: ذيل طوله 175° يبدأ شفاف ويقوى لين الرأس الأبيض */
        '.agp-so-sdc{position:absolute;inset:-12%;border-radius:50%;background:conic-gradient(from calc(var(--h) - 150deg),transparent 0,color-mix(in srgb,var(--bfc) 4%,transparent) 12%,color-mix(in srgb,var(--bfc) 22%,transparent) 24%,color-mix(in srgb,var(--bfc) 70%,transparent) 33%,var(--bfc) 38%,color-mix(in srgb,var(--bfc) 40%,#fff) 40.5%,#fff 41.4%,transparent 41.7%,transparent 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - calc(var(--s) * .13)),#000 calc(100% - calc(var(--s) * .085)),#000 calc(100% - calc(var(--s) * .07)),transparent calc(100% - calc(var(--s) * .02)));mask:radial-gradient(farthest-side,transparent calc(100% - calc(var(--s) * .13)),#000 calc(100% - calc(var(--s) * .085)),#000 calc(100% - calc(var(--s) * .07)),transparent calc(100% - calc(var(--s) * .02)));filter:blur(calc(var(--s) * .014)) drop-shadow(0 0 .2em var(--bfc));opacity:.85}',
        '.agp-so-sdc.core{background:conic-gradient(from calc(var(--h) - 150deg),transparent 0 22%,color-mix(in srgb,var(--bfc) 60%,transparent) 32%,color-mix(in srgb,var(--bfc) 30%,#fff) 38%,#fff 41.4%,transparent 41.7%,transparent 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - calc(var(--s) * .092)),#000 calc(100% - calc(var(--s) * .082)),#000 calc(100% - calc(var(--s) * .074)),transparent calc(100% - calc(var(--s) * .064)));mask:radial-gradient(farthest-side,transparent calc(100% - calc(var(--s) * .092)),#000 calc(100% - calc(var(--s) * .082)),#000 calc(100% - calc(var(--s) * .074)),transparent calc(100% - calc(var(--s) * .064)));filter:drop-shadow(0 0 .08em #fff);opacity:1}',
        '.agp-so-sdhead{position:absolute;width:20%;height:20%;transform:translate(-50%,-50%);background:radial-gradient(closest-side,#fff,#fff 12%,color-mix(in srgb,var(--bfc) 70%,transparent) 32%,transparent 70%),linear-gradient(90deg,transparent 47%,#fff 50%,transparent 53%),linear-gradient(0deg,transparent 48%,rgba(255,255,255,.8) 50%,transparent 52%);-webkit-mask:radial-gradient(closest-side,#000 35%,transparent);mask:radial-gradient(closest-side,#000 35%,transparent);animation:agp-so-sdflare 2.6s ease-in-out infinite}',
        '.agp-so-sddot{position:absolute;border-radius:50%;background:color-mix(in srgb,var(--sdd) 55%,#fff);box-shadow:0 0 .1em var(--sdd);animation:agp-so-bftw 2.4s ease-in-out infinite}',
        '.agp-so-sdstar{position:absolute;width:9%;height:9%;transform:translate(-50%,-50%);background:linear-gradient(90deg,transparent 45%,#fff 50%,transparent 55%),linear-gradient(0deg,transparent 45%,#fff 50%,transparent 55%),radial-gradient(closest-side,#fff,color-mix(in srgb,var(--sdd) 60%,transparent) 35%,transparent 70%);-webkit-mask:radial-gradient(closest-side,#000 30%,transparent);mask:radial-gradient(closest-side,#000 30%,transparent);animation:agp-so-bfstar 2.8s ease-in-out infinite}',
        '@keyframes agp-so-sdflare{0%,100%{transform:translate(-50%,-50%) scale(.85) rotate(0)}50%{transform:translate(-50%,-50%) scale(1.2) rotate(20deg)}}',
        '.fr-butterfly .agp-so-av{position:relative;z-index:1}',
        '.agp-so-bfglow{position:absolute;inset:-14%;z-index:0;border-radius:50%;pointer-events:none;background:radial-gradient(closest-side,transparent 72%,color-mix(in srgb,var(--bfc) 40%,transparent) 84%,transparent);-webkit-mask:conic-gradient(from 320deg,#000,#000 45%,transparent 60%,transparent 92%,#000);mask:conic-gradient(from 320deg,#000,#000 45%,transparent 60%,transparent 92%,#000);animation:agp-so-bfbreath 3.4s ease-in-out infinite}',
        '.agp-so-bfring{position:absolute;inset:-5%;z-index:3;border-radius:50%;pointer-events:none;border:calc(var(--s) * .022) solid var(--bfr);box-shadow:0 0 .06em var(--bfr),0 0 .18em color-mix(in srgb,var(--bfr) 55%,transparent),inset 0 0 .1em color-mix(in srgb,var(--bfr) 50%,transparent)}',
        '.agp-so-bfarcw{position:absolute;inset:0;z-index:2;pointer-events:none;animation:agp-so-bfsway 7s ease-in-out infinite}',
        '.agp-so-bfarc{position:absolute;inset:-9%;border-radius:50%;background:conic-gradient(from 325deg,transparent 0,color-mix(in srgb,var(--bfc) 70%,#fff) 4%,var(--bfc) 20%,color-mix(in srgb,var(--bfc) 85%,transparent) 36%,transparent 50%,transparent 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - calc(var(--s) * .1)),#000 calc(100% - calc(var(--s) * .065)),#000 calc(100% - calc(var(--s) * .045)),transparent);mask:radial-gradient(farthest-side,transparent calc(100% - calc(var(--s) * .1)),#000 calc(100% - calc(var(--s) * .065)),#000 calc(100% - calc(var(--s) * .045)),transparent);filter:blur(calc(var(--s) * .01)) drop-shadow(0 0 .12em var(--bfc)) drop-shadow(0 0 .3em var(--bfc))}',
        /* ضوء أبيض يجري على القوس */
        '.agp-so-bfarc.hot{background:conic-gradient(from var(--agp-so-ang,0deg),transparent 0 84%,color-mix(in srgb,var(--bfc) 50%,#fff) 95%,#fff 99%,transparent 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - calc(var(--s) * .085)),#000 calc(100% - calc(var(--s) * .065)),transparent calc(100% - calc(var(--s) * .04)));mask:radial-gradient(farthest-side,transparent calc(100% - calc(var(--s) * .085)),#000 calc(100% - calc(var(--s) * .065)),transparent calc(100% - calc(var(--s) * .04)));filter:drop-shadow(0 0 .1em #fff);opacity:1;animation:agp-so-bfrun 4.6s linear infinite}',
        '.agp-so-bfdot{position:absolute;border-radius:50%;background:color-mix(in srgb,var(--bfc) 45%,#fff);box-shadow:0 0 .12em var(--bfc);animation:agp-so-bftw 2.6s ease-in-out infinite}',
        '.agp-so-bfstar{position:absolute;width:16%;height:16%;transform:translate(-50%,-50%) scale(.6);opacity:.4;background:radial-gradient(closest-side,#fff,color-mix(in srgb,var(--bfc) 60%,transparent) 30%,transparent 70%),linear-gradient(90deg,transparent 46%,#fff 50%,transparent 54%),linear-gradient(0deg,transparent 47%,#fff 50%,transparent 53%);-webkit-mask:radial-gradient(closest-side,#000 40%,transparent);mask:radial-gradient(closest-side,#000 40%,transparent);animation:agp-so-bfstar 3.3s ease-in-out infinite}',
        '.agp-so-bfly{position:absolute;z-index:6;pointer-events:none}',
        '.agp-so-bfly.f1{left:-28%;top:42%;width:48%;height:40%;animation:agp-so-bfhover1 9s ease-in-out infinite}',
        '.agp-so-bfly.f2{left:-8%;top:67%;width:40%;height:33%;animation:agp-so-bfhover2 11s ease-in-out infinite}',
        '.agp-so-bfw{display:block;width:100%;height:100%;color:var(--bff);filter:drop-shadow(0 0 .05em color-mix(in srgb,var(--bff) 80%,#fff)) drop-shadow(0 0 .16em color-mix(in srgb,var(--bff) 60%,transparent))}',
        '.agp-so-bfw svg{width:100%;height:100%;overflow:visible;display:block}',
        /* رفرفة مثل الحقيقية: ضربتين سريعة وبعدها تفرد جناحها وتنزلق (f1)، والثانية واقفة تفتح وتسكّر ببطء (f2) */
        '.agp-so-bfw .wl,.agp-so-bfw .wr{transform-origin:50% 44%;animation:agp-so-bfflap 1.9s ease-in-out infinite}',
        '.agp-so-bfw .wr{animation-name:agp-so-bfflapr}',
        '.agp-so-bfly.f1 .agp-so-bfw{animation:agp-so-bflift 1.9s ease-in-out infinite}',
        '.agp-so-bfly.f2 .wl{animation:agp-so-bfrest 4.6s ease-in-out infinite}',
        '.agp-so-bfly.f2 .wr{animation:agp-so-bfrestr 4.6s ease-in-out infinite}',
        '.agp-so-bfly.f1 .agp-so-bfw{--rot:-14deg;transform:rotate(-14deg)}',
        '.agp-so-bfly.f2 .agp-so-bfw{transform:rotate(10deg)}',
        '.agp-so-bfspk{position:absolute;z-index:6;width:3.4%;height:3.4%;border-radius:50%;pointer-events:none;background:#fff;box-shadow:0 0 .1em #fff,0 0 .25em var(--bff);opacity:0;animation:agp-so-f7spark 2.6s ease-in-out infinite}',
        '.agp-so-bforb{position:absolute;inset:-17%;z-index:6;pointer-events:none;animation:agp-so-spin 18s linear infinite}',
        '.agp-so-bfly.f3{left:50%;top:0;width:24%;height:20%;transform:translate(-50%,-50%) rotate(90deg)}',
        '.agp-so-bfly.f3 .agp-so-bfw{animation:agp-so-bfbob 2.3s ease-in-out infinite}',
        '.agp-so-bfly.f3 .wl{animation:agp-so-bfquick .5s ease-in-out infinite}',
        '.agp-so-bfly.f3 .wr{animation:agp-so-bfquickr .5s ease-in-out infinite}',
        /* f1: ثلاث ضربات (ترتفع) وبعدها تفرد جناحها وتنزل بهدوء. f2: واقفة تفتح وتسكّر ببطء، وبعدها رفّة سريعة */
        '@keyframes agp-so-bfflap{0%,48%,100%{transform:scaleX(1) skewY(0)}8%,24%,40%{transform:scaleX(.1) skewY(7deg)}16%,32%{transform:scaleX(.98) skewY(-2deg)}74%{transform:scaleX(.82) skewY(2deg)}}',
        '@keyframes agp-so-bfflapr{0%,48%,100%{transform:scaleX(1) skewY(0)}8%,24%,40%{transform:scaleX(.1) skewY(-7deg)}16%,32%{transform:scaleX(.98) skewY(2deg)}74%{transform:scaleX(.82) skewY(-2deg)}}',
        '@keyframes agp-so-bflift{0%,100%{transform:rotate(-14deg) translateY(0)}45%{transform:rotate(-18deg) translateY(-12%)}}',
        '@keyframes agp-so-bfrest{0%,30%,100%{transform:scaleX(1) skewY(0)}48%,58%{transform:scaleX(.08) skewY(8deg)}72%,88%{transform:scaleX(1) skewY(0)}76%,84%{transform:scaleX(.15) skewY(6deg)}80%{transform:scaleX(.95)}}',
        '@keyframes agp-so-bfrestr{0%,30%,100%{transform:scaleX(1) skewY(0)}48%,58%{transform:scaleX(.08) skewY(-8deg)}72%,88%{transform:scaleX(1) skewY(0)}76%,84%{transform:scaleX(.15) skewY(-6deg)}80%{transform:scaleX(.95)}}',
        '@keyframes agp-so-bfquick{0%,100%{transform:scaleX(1) skewY(0)}50%{transform:scaleX(.12) skewY(7deg)}}',
        '@keyframes agp-so-bfquickr{0%,100%{transform:scaleX(1) skewY(0)}50%{transform:scaleX(.12) skewY(-7deg)}}',
        '@keyframes agp-so-bfhover1{0%,100%{transform:translate(0,0) rotate(0)}18%{transform:translate(6%,-10%) rotate(-6deg)}37%{transform:translate(-4%,-16%) rotate(4deg)}55%{transform:translate(-9%,-4%) rotate(7deg)}74%{transform:translate(3%,6%) rotate(-3deg)}88%{transform:translate(-2%,2%) rotate(2deg)}}',
        '@keyframes agp-so-bfhover2{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(-4%,5%) rotate(3deg)}50%{transform:translate(3%,-3%) rotate(-3deg)}75%{transform:translate(-2%,-6%) rotate(2deg)}}',
        '@keyframes agp-so-bfbob{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-30%) rotate(-8deg)}50%{transform:translateY(-8%) rotate(4deg)}75%{transform:translateY(-38%) rotate(-4deg)}}',
        '@keyframes agp-so-bfsway{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(8deg)}}',
        '@keyframes agp-so-bfrun{0%{--agp-so-ang:330deg;opacity:0}12%,80%{opacity:1}100%{--agp-so-ang:512deg;opacity:0}}',
        '@keyframes agp-so-bftw{0%,100%{opacity:.25;transform:scale(.6)}50%{opacity:1;transform:scale(1.1)}}',
        '@keyframes agp-so-bfstar{0%,100%{opacity:.35;transform:translate(-50%,-50%) scale(.55) rotate(0)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.1) rotate(45deg)}}',
        '@keyframes agp-so-bfbreath{0%,100%{opacity:.55}50%{opacity:1}}',
        /* كبسولة العدد بإطار «الفراشات»: زجاجية بلون المركز، العملة تلف حول نفسها بنعومة (بدون ثري دي)، ورقم المركز بدائرة على اليمين */
        '.agp-so-throne.fx-code .agp-so-tcount{gap:.36em;margin-top:.3em;padding:.2em .5em .2em .32em;border-radius:.24em;background:linear-gradient(90deg,rgba(14,8,24,.82),color-mix(in srgb,var(--rk) 22%,rgba(14,8,24,.82)));border:.05em solid color-mix(in srgb,var(--rk) 65%,transparent);box-shadow:0 .12em .45em rgba(0,0,0,.45),inset 0 .05em .1em rgba(255,255,255,.12),0 0 .35em color-mix(in srgb,var(--rk) 25%,transparent)}',
        '.agp-so-tbox.fx-code .agp-so-tcount{background:var(--agp-so-pillbg,linear-gradient(90deg,rgba(14,8,24,.82),color-mix(in srgb,var(--rk) 22%,rgba(14,8,24,.82))))}',
        /* العملة: لفّة وحدة بالطول (حول محورها العمودي، بدون منظور) وبعدها توقف، وتعيد كل 5 ثواني (الأول ثم الثاني ثم الثالث) */
        '.agp-so-throne.fx-code .agp-so-tic.i-gifters,.agp-so-throne.fx-code .agp-so-tcol.rk1 .agp-so-tic.i-gifters{width:1.2em;height:1.2em;margin:-.1em 0;filter:none;animation:agp-so-bfcoin 5s infinite;animation-delay:calc(var(--d) * 2)}',
        '@keyframes agp-so-bfcoin{0%{transform:rotateY(0);animation-timing-function:cubic-bezier(.55,0,.3,1)}22%,100%{transform:rotateY(360deg)}}',
        '.agp-so-throne.fx-code .agp-so-tic:not(.i-gifters){animation:none}',
        '.agp-so-throne.fx-code .agp-so-tnum{min-width:2.2em;text-align:center;font-weight:800}',
        /* رقم المركز بإطار «الفراشات»: دائرة ناعمة ملاصقة للحلقة تحت يمين (زاوية 155°) */
        '.agp-so-bfrk{--sf:color-mix(in srgb,color-mix(in srgb,var(--rk) 72%,var(--bfc)) 62%,#fff);position:absolute;z-index:7;left:73.2%;top:99.8%;width:27%;height:27%;transform:translate(-50%,-50%);border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none;font-family:"Noto Kufi Arabic",system-ui,sans-serif;font-weight:800;font-size:calc(var(--s) * .15);line-height:1;color:var(--agp-so-rkt,color-mix(in srgb,var(--bfc) 45%,#1c1030));background:radial-gradient(circle at 35% 28%,#fff,var(--sf) 55%,color-mix(in srgb,var(--sf) 80%,var(--bfc)));border:calc(var(--s) * .014) solid color-mix(in srgb,var(--bfr) 85%,transparent);box-shadow:0 0 .1em color-mix(in srgb,var(--bfc) 70%,transparent),0 0 .3em color-mix(in srgb,var(--rk) 35%,transparent);animation:agp-so-bfrkp 3.4s ease-in-out infinite}',
        '@keyframes agp-so-bfrkp{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.06)}}',
        /* ميداليات */
        '.agp-so-medals{display:flex;flex-direction:column;gap:.35em;min-width:12em}',
        '.agp-so-mrow{display:flex;align-items:center;gap:.5em;padding:.25em .9em .25em .3em;border-radius:999px;background:rgba(10,12,24,.4);background:linear-gradient(270deg,color-mix(in srgb,var(--rk) 30%,transparent),rgba(10,12,24,.35) 70%,transparent);border-right:.18em solid var(--rk)}',
        '.agp-so-mrow .agp-so-name{flex:1;text-align:right}',
        /* بطاقات */
        '.agp-so-cards{display:flex;align-items:flex-start;justify-content:center;gap:.7em}',
        '.agp-so-card{display:flex;flex-direction:column;align-items:center;gap:.2em;width:5em}',
        '.agp-so-card .agp-so-av{width:3em;height:3em;margin-bottom:.45em}',
        '.agp-so-card .agp-so-name{max-width:5em;font-size:.85em}',
        '.agp-so-badge{position:absolute;bottom:-.25em;left:50%;transform:translateX(-50%);min-width:1.3em;height:1.3em;padding:0 .2em;box-sizing:border-box;border-radius:999px;font-size:.6em;font-weight:900;display:flex;align-items:center;justify-content:center;color:#1a1206;text-shadow:none;background:linear-gradient(145deg,var(--rk),var(--rk2));border:.12em solid #14162a}',
        /* بسيط */
        '.agp-so-minimal{display:flex;flex-direction:column;gap:.25em}',
        '.agp-so-nrow{display:flex;align-items:center;gap:.45em;text-shadow:-.05em -.05em 0 #000,.05em -.05em 0 #000,-.05em .05em 0 #000,.05em .05em 0 #000}',
        '.agp-so-nrow .agp-so-medal{width:1.35em;height:1.35em}',
        '.agp-so-ic{display:inline-flex;width:.95em;height:.95em;flex:none}',
        '.agp-so-ic svg{width:100%;height:100%;display:block}',
        '.agp-so-count{display:inline-flex;align-items:center;gap:.25em}',
        /* هدف */
        '.agp-so-goal{color:#fff;display:flex;flex-direction:column;align-items:center;gap:.35em;text-shadow:0 .04em .12em rgba(0,0,0,.85)}',
        '.agp-so-gbar{position:relative;width:14em;height:1.7em;border-radius:999px;overflow:hidden;background:rgba(10,12,24,.6);border:.08em solid rgba(255,255,255,.25);box-shadow:0 .15em .5em rgba(0,0,0,.45),inset 0 .1em .3em rgba(0,0,0,.5)}',
        '.agp-so-gfill{position:absolute;top:0;bottom:0;right:0;border-radius:999px;background:linear-gradient(270deg,var(--agp-so-c),color-mix(in srgb,var(--agp-so-c) 55%,#fff));box-shadow:0 0 .6em var(--agp-so-c);transition:width .8s cubic-bezier(.22,1,.36,1)}',
        '.agp-so-gfill::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);background-size:50% 100%;background-repeat:no-repeat;animation:agp-so-sheen 2.4s linear infinite}',
        '.agp-so-gnums{display:inline-flex;align-items:center;gap:.3em;font-weight:800;font-size:.8em;direction:ltr;white-space:nowrap}',
        '.agp-so-gbar .agp-so-gnums{position:absolute;inset:0;justify-content:center}',
        '.agp-so-ring{--p:0;position:relative;width:5em;height:5em;border-radius:50%;background:conic-gradient(var(--agp-so-c) calc(var(--p) * 1%),rgba(255,255,255,.12) 0);box-shadow:0 0 .7em color-mix(in srgb,var(--agp-so-c) 50%,transparent),0 .15em .5em rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}',
        '.agp-so-ring::before{content:"";position:absolute;inset:.45em;border-radius:50%;background:radial-gradient(circle at 50% 30%,#2a2d48,#0d0f1c)}',
        '.agp-so-rpct{position:relative;font-weight:900;font-size:1.2em;color:#fff}',
        '.agp-so-done .agp-so-gfill,.agp-so-done.agp-so-goal .agp-so-ring{animation:agp-so-pulse 1.2s ease-in-out infinite}',
        '@keyframes agp-so-sheen{from{background-position:-100% 0}to{background-position:200% 0}}',
        /* وعاء الهدايا */
        '.agp-so-jar{color:#fff;display:flex;flex-direction:column;align-items:center;gap:.3em;text-shadow:0 .04em .12em rgba(0,0,0,.85)}',
        '.agp-so-jwrap{position:relative;width:9em;filter:drop-shadow(0 .3em .6em rgba(0,0,0,.45))}',
        '.agp-so-jlid{position:relative;z-index:2;width:6.8em;height:1.2em;margin:0 auto -.15em;border-radius:.4em;background:repeating-linear-gradient(90deg,rgba(0,0,0,.16) 0 .1em,transparent .1em .42em),linear-gradient(180deg,color-mix(in srgb,var(--agp-so-c) 55%,#fff),var(--agp-so-c) 50%,color-mix(in srgb,var(--agp-so-c) 65%,#000));box-shadow:inset 0 .08em 0 rgba(255,255,255,.55),0 .08em .25em rgba(0,0,0,.45)}',
        '.agp-so-jneck{width:6.3em;height:.55em;margin:0 auto;border:.1em solid rgba(255,255,255,.7);border-bottom:0;border-radius:.15em .15em 0 0;background:rgba(255,255,255,.07);box-sizing:border-box}',
        '.agp-so-jglass{position:relative;width:9em;height:10.5em;box-sizing:border-box;border:.12em solid rgba(255,255,255,.78);border-radius:1.5em 1.5em 2.1em 2.1em;overflow:hidden;background:linear-gradient(90deg,rgba(255,255,255,.12),rgba(255,255,255,.02) 35%,rgba(255,255,255,.02) 70%,rgba(255,255,255,.1));box-shadow:0 0 .8em color-mix(in srgb,var(--agp-so-c) 55%,transparent),inset 0 0 1em color-mix(in srgb,var(--agp-so-c) 30%,transparent)}',
        '.agp-so-jglass::after{content:"";position:absolute;z-index:3;top:.9em;right:.55em;width:.32em;height:62%;border-radius:999px;background:linear-gradient(180deg,rgba(255,255,255,.8),rgba(255,255,255,0));pointer-events:none}',
        '.agp-so-jglass::before{content:"";position:absolute;z-index:3;left:12%;right:12%;bottom:.25em;height:.9em;border-radius:50%;border-top:.07em solid rgba(255,255,255,.35);pointer-events:none}',
        '.agp-so-jpile{position:absolute;left:.35em;right:.35em;top:.4em;bottom:.35em}',
        '.agp-so-gi{position:absolute;width:1.3em;height:1.3em;transform:rotate(var(--r,0deg));transition:left .5s ease,bottom .5s ease;filter:drop-shadow(0 .05em .08em rgba(0,0,0,.55))}',
        '.agp-so-gimg{width:100%;height:100%;object-fit:contain;display:block}',
        '.agp-so-gi.fb>span:first-child{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%;font-size:.6em;font-weight:900;color:#1a1206;text-shadow:none;background:radial-gradient(circle at 35% 30%,#fff,var(--agp-so-c))}',
        '.agp-so-gi.drop{animation:agp-so-drop .95s cubic-bezier(.35,0,.45,1) both}',
        '@keyframes agp-so-drop{0%{transform:translateY(-13em) rotate(0) scale(1.35);opacity:0}12%{opacity:1}68%{transform:translateY(0) rotate(var(--r,0deg)) scale(1)}80%{transform:translateY(-.4em) rotate(var(--r,0deg))}100%{transform:translateY(0) rotate(var(--r,0deg))}}',
        '.agp-so-jcount{display:inline-flex;align-items:center;gap:.3em;margin-top:.15em;padding:.25em .9em;border-radius:999px;font-weight:900;direction:ltr;background:rgba(10,12,24,.7);border:.07em solid color-mix(in srgb,var(--agp-so-c) 60%,transparent);box-shadow:0 .1em .35em rgba(0,0,0,.45)}',
        '.agp-so-jcount .agp-so-ic{color:var(--agp-so-c)}',
        /* عدّادات */
        '.agp-so-counter{color:#fff;display:flex;flex-direction:column;align-items:center;gap:.35em;text-shadow:0 .04em .12em rgba(0,0,0,.85)}',
        '.agp-so-cbox{display:flex;gap:.45em;align-items:stretch;justify-content:center}',
        '.agp-so-cm{display:flex;align-items:center;gap:.35em;white-space:nowrap}',
        '.agp-so-cm .agp-so-ic{color:var(--agp-so-c)}',
        '.agp-so-cnum{font-weight:900;direction:ltr}',
        '.agp-so-cunit{font-size:.72em;opacity:.8;font-weight:600}',
        '.agp-so-counter.d-pills .agp-so-cm{padding:.3em .75em;border-radius:999px;background:rgba(10,12,24,.55);border:.07em solid color-mix(in srgb,var(--agp-so-c) 55%,transparent);box-shadow:0 .1em .35em rgba(0,0,0,.4)}',
        '.agp-so-counter.d-big .agp-so-cbox{gap:1.1em}',
        '.agp-so-counter.d-big .agp-so-cm{flex-direction:column;gap:.05em}',
        '.agp-so-counter.d-big .agp-so-ic{width:1.3em;height:1.3em}',
        '.agp-so-counter.d-big .agp-so-cnum{font-size:1.7em;line-height:1.1}',
        '.agp-so-counter.d-stack .agp-so-cbox{flex-direction:column;align-items:flex-start;gap:.2em}',
        '.agp-so-counter.d-stack .agp-so-cm{text-shadow:-.05em -.05em 0 #000,.05em -.05em 0 #000,-.05em .05em 0 #000,.05em .05em 0 #000}',
        /* أيقونة */
        '.agp-so-icon{line-height:1}',
        '.agp-so-glyph{display:block;width:1em;height:1em}',
        '.agp-so-glyph svg{display:block;width:100%;height:100%}',
        '.agp-so-glyph.glow{filter:drop-shadow(0 0 .08em currentColor) drop-shadow(0 .04em .06em rgba(0,0,0,.6))}',
        '.agp-so-emoji{display:block;font-size:1em;line-height:1.15;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;filter:drop-shadow(0 .04em .06em rgba(0,0,0,.45))}',
        /* شكل */
        '.agp-so-sbox{box-sizing:border-box;--c:var(--agp-so-c)}',
        '.agp-so-sbox.f-solid{background:var(--c)}',
        '.agp-so-sbox.f-glass{background:linear-gradient(160deg,rgba(255,255,255,.16),rgba(255,255,255,.04)),color-mix(in srgb,var(--c) 22%,rgba(8,8,16,.55));border:.18em solid color-mix(in srgb,var(--c) 55%,rgba(255,255,255,.35));-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 .6em 1.6em rgba(0,0,0,.35)}',
        '.agp-so-sbox.f-gradient{background:linear-gradient(135deg,color-mix(in srgb,var(--c) 70%,#fff),var(--c) 45%,color-mix(in srgb,var(--c) 55%,#000))}',
        '.agp-so-sbox.f-outline{border:.45em solid var(--c)}',
        '.agp-so-sbox.f-neon{border:.3em solid color-mix(in srgb,var(--c) 40%,#fff);box-shadow:0 0 .6em var(--c),0 0 1.6em var(--c),inset 0 0 .8em var(--c)}',
        /* أليرتات */
        '.agp-so-alert{line-height:1.3}',
        '.agp-so-dmsg{font-size:.78em;opacity:.85;font-weight:500}',
        '.agp-so-astage{display:flex;justify-content:center}',
        '.agp-so-vbox{position:relative;flex:none}',
        '.agp-so-vslot{position:relative;flex:none;box-sizing:border-box;border:.1em dashed rgba(255,255,255,.35);border-radius:.4em;display:flex;align-items:center;justify-content:center}',
        '.agp-so-vslot span{font-size:.7em;font-weight:700;color:rgba(255,255,255,.55);text-shadow:0 .05em .2em rgba(0,0,0,.8)}',
        '.agp-so-vbox video,.agp-so-vbox canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}',
        '.agp-so-vbox.keyed video{opacity:0}',
        '.agp-so-vbox.in{animation:agp-so-a-fade .35s ease both}',
        '.agp-so-vtxt{position:absolute;left:0;right:0;padding:0 .4em;text-align:center;direction:rtl;color:var(--agp-so-c,#fff);font-weight:800;font-size:1em;line-height:1.35;text-shadow:0 .06em .2em rgba(0,0,0,.9),0 0 .6em rgba(0,0,0,.55)}',
        '.agp-so-vtxt.top{top:4%}',
        '.agp-so-vpart{position:absolute;z-index:3;transform:translate(-50%,-50%);pointer-events:none;white-space:nowrap;direction:rtl;text-align:center}',
        '.agp-so-vpart.wait{opacity:0}',
        '.agp-so-vpart.pin-fade{animation:agp-so-p-fade .45s ease both}',
        '.agp-so-vpart.pin-pop{animation:agp-so-p-pop .5s cubic-bezier(.2,1.5,.4,1) both}',
        '.agp-so-vpart.pin-up{animation:agp-so-p-up .5s cubic-bezier(.2,.9,.3,1) both}',
        '.agp-so-vpart.pin-down{animation:agp-so-p-down .5s cubic-bezier(.2,.9,.3,1) both}',
        '.agp-so-vpart.pout{animation:agp-so-p-out .35s ease both}',
        '.agp-so-vbox.out{animation:agp-so-a-out .35s ease both}',
        '.agp-so-vbox.novideo video,.agp-so-vbox.novideo canvas{display:none}',
        // كرة القمر
        '.agp-so-goal.d-orb{display:flex;flex-direction:column;align-items:center;gap:.3em}',
        '.agp-so-otitle{font-weight:800;font-size:.9em;color:#fff;text-shadow:0 .05em .2em rgba(0,0,0,.8)}',
        '.agp-so-orb{position:relative;width:9em;height:9em;filter:drop-shadow(0 0 .5em color-mix(in srgb,var(--og) 45%,transparent))}',
        '.agp-so-orb svg{width:100%;height:100%;display:block;overflow:visible}',
        '.agp-so-olvl{transition:transform 1.8s cubic-bezier(.3,.9,.3,1)}',
        '.agp-so-ow1{animation:agp-so-wave calc(5.5s*var(--osp)) linear infinite}',
        '.agp-so-ow2{animation:agp-so-wave2 calc(8s*var(--osp)) linear infinite}',
        '.agp-so-ow1 path,.agp-so-ow2 path{animation:agp-so-swell calc(4s*var(--osp)) ease-in-out infinite alternate;transform-origin:100px 0}',
        '.agp-so-orb.bump .agp-so-ow1 path,.agp-so-orb.bump .agp-so-ow2 path{animation:agp-so-splash .9s ease-out}',
        '.agp-so-obub{animation:agp-so-bub 6s linear infinite}',
        '.agp-so-otw{animation:agp-so-tw 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}',
        '.agp-so-omoon{animation:agp-so-float 7s ease-in-out infinite}',
        '.agp-so-oring{transition:stroke-width .4s}',
        '.agp-so-orb.full{animation:agp-so-ofull 2.2s ease-in-out infinite}',
        '.agp-so-orb.full .agp-so-oring{stroke-width:4.6}',
        '.agp-so-onums{display:inline-flex;align-items:center;gap:.35em;padding:.2em .8em;border-radius:999px;font-weight:800;font-size:.75em;direction:ltr;color:#fff;background:rgba(10,8,20,.6);border:.06em solid color-mix(in srgb,var(--og,#a68bff) 50%,transparent)}',
        '.agp-so-onums:empty{display:none}',
        '.agp-so-onums svg{width:1em;height:1em;color:var(--og,#a68bff)}',
        '.agp-so-onums b{color:var(--og,#a68bff);margin-inline-start:.2em}',
        '@keyframes agp-so-wave{from{transform:translateX(0)}to{transform:translateX(-100px)}}',
        '@keyframes agp-so-wave2{from{transform:translateX(-100px)}to{transform:translateX(0)}}',
        '@keyframes agp-so-swell{from{transform:scaleY(.7)}to{transform:scaleY(1.25)}}',
        '@keyframes agp-so-splash{0%{transform:scaleY(1)}30%{transform:scaleY(2.6)}100%{transform:scaleY(1)}}',
        '@keyframes agp-so-bub{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-150px);opacity:0}}',
        '@keyframes agp-so-tw{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}',
        '@keyframes agp-so-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
        '@keyframes agp-so-ofull{0%,100%{filter:drop-shadow(0 0 .5em var(--og))}50%{filter:drop-shadow(0 0 1.3em var(--og))}}',
        '@keyframes agp-so-p-fade{0%{opacity:0}100%{opacity:1}}',
        '@keyframes agp-so-p-pop{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}',
        '@keyframes agp-so-p-up{0%{opacity:0;transform:translate(-50%,10%)}100%{opacity:1;transform:translate(-50%,-50%)}}',
        '@keyframes agp-so-p-down{0%{opacity:0;transform:translate(-50%,-110%)}100%{opacity:1;transform:translate(-50%,-50%)}}',
        '@keyframes agp-so-p-out{to{opacity:0}}',
        // الصورة: الإطار (vav-f) بلون الإطار وبشكل الصورة، والصورة (vav-i) داخله بنفس الشكل
        '.agp-so-vav .vav-f{position:absolute;inset:0;background:currentColor}',
        '.agp-so-vav .vav-i{position:absolute;inset:.085em;overflow:hidden;background:#2a2338;display:flex;align-items:center;justify-content:center}',
        '.agp-so-vav.fr-glow .vav-f,.agp-so-vav.fr-shadow .vav-f,.agp-so-vav.fr-none .vav-f{background:transparent}',
        '.agp-so-vav.fr-glow .vav-i,.agp-so-vav.fr-shadow .vav-i,.agp-so-vav.fr-none .vav-i{inset:0}',
        '.agp-so-vav.fr-ring{filter:drop-shadow(0 .12em .3em rgba(0,0,0,.6))}',
        '.agp-so-vav.fr-shadow{filter:drop-shadow(0 .14em .35em rgba(0,0,0,.75))}',
        '.agp-so-vav.fr-glow{filter:drop-shadow(0 0 .14em currentColor) drop-shadow(0 0 .4em currentColor)}',
        '.agp-so-vav img{width:100%;height:100%;object-fit:cover;display:block}',
        '.agp-so-vini{font-weight:800;font-size:1.1em;color:#fff}',
        '.agp-so-vname,.agp-so-vmsg{font-family:"Noto Kufi Arabic","IBM Plex Sans Arabic",system-ui,sans-serif;font-weight:800;line-height:1.3;text-shadow:0 .06em .22em rgba(0,0,0,.95),0 0 .6em rgba(0,0,0,.55)}',
        '.agp-so-vmsg{font-weight:700}',
        '.agp-so-vname.styled,.agp-so-vmsg.styled{text-shadow:none}',
        '.agp-so-vtxt.middle{top:50%;transform:translateY(-50%)}',
        '.agp-so-vtxt.bottom{bottom:4%}',
        '.agp-so-acard{display:flex;align-items:center;gap:.7em;color:#fff;direction:rtl;text-shadow:0 .04em .1em rgba(0,0,0,.6);--c:var(--agp-so-c)}',
        '.agp-so-acard.d-card{padding:.6em 1.1em .6em .7em;border-radius:1.2em;min-width:14em;max-width:24em;background:linear-gradient(135deg,color-mix(in srgb,var(--c) 38%,rgba(12,12,22,.92)),rgba(12,12,22,.9) 70%);border:.08em solid color-mix(in srgb,var(--c) 70%,#fff);box-shadow:0 0 1.2em color-mix(in srgb,var(--c) 45%,transparent),0 .4em 1.2em rgba(0,0,0,.5)}',
        '.agp-so-acard.d-banner{padding:.45em 1.6em .45em .6em;min-width:22em;max-width:40em;border-radius:.4em;background:linear-gradient(270deg,var(--c),color-mix(in srgb,var(--c) 55%,#000) 75%,transparent);box-shadow:0 .3em 1em rgba(0,0,0,.4)}',
        '.agp-so-acard.d-pop{flex-direction:column;text-align:center;gap:.3em;min-width:16em;max-width:24em}',
        '.agp-so-acard.d-pop .agp-so-atxt{align-items:center}',
        '.agp-so-amedia{flex:none;width:3.2em;height:3.2em;display:flex;align-items:center;justify-content:center;color:var(--c);filter:drop-shadow(0 .1em .25em rgba(0,0,0,.5))}',
        '.agp-so-amedia.av{border-radius:50%;overflow:hidden;border:.12em solid var(--c);background:#22243a}',
        '.agp-so-amedia .agp-so-ic{width:2.2em;height:2.2em}',
        '.agp-so-acard.d-pop .agp-so-amedia{width:6em;height:6em}',
        '.agp-so-acard.d-pop .agp-so-amedia .agp-so-ic{width:4.5em;height:4.5em}',
        '.agp-so-acard.d-banner .agp-so-amedia{width:2.4em;height:2.4em}',
        '.agp-so-aimg{width:100%;height:100%;object-fit:contain;display:block}',
        '.agp-so-amedia.av .agp-so-aimg{object-fit:cover}',
        '.agp-so-ainit{font-weight:900;font-size:1.4em;color:#fff}',
        '.agp-so-atxt{display:flex;flex-direction:column;gap:.1em;min-width:0}',
        '.agp-so-atitle{font-size:.7em;font-weight:800;letter-spacing:.02em;color:color-mix(in srgb,var(--c) 60%,#fff)}',
        '.agp-so-amsg{font-size:1.05em;font-weight:800;overflow-wrap:anywhere}',
        '.agp-so-acard.d-pop .agp-so-amsg{font-size:1.5em;-webkit-text-stroke:.03em rgba(0,0,0,.5);text-shadow:0 .05em .2em rgba(0,0,0,.85)}',
        '.agp-so-acard.d-pop .agp-so-atitle{font-size:.9em;color:var(--c)}',
        '.agp-so-adia{display:inline-flex;align-items:center;gap:.25em;font-size:.75em;font-weight:800;color:#4dd8ff;direction:ltr}',
        '.agp-so-acard.d-pop .agp-so-adia{align-self:center}',
        '.agp-so-acard.in-pop{animation:agp-so-a-pop .55s cubic-bezier(.2,1.6,.4,1) both}',
        '.agp-so-acard.in-slide{animation:agp-so-a-slide .5s cubic-bezier(.2,1,.3,1) both}',
        '.agp-so-acard.in-fade{animation:agp-so-a-fade .5s ease both}',
        '.agp-so-acard.in-drop{animation:agp-so-a-drop .7s cubic-bezier(.3,1.4,.5,1) both}',
        '.agp-so-acard.out{animation:agp-so-a-out .45s ease both}',
        '.agp-so-acard.in-pop .agp-so-amedia,.agp-so-acard.in-drop .agp-so-amedia{animation:agp-so-heartbeat 1.3s ease-in-out .5s infinite}',
        '@keyframes agp-so-a-pop{0%{opacity:0;transform:scale(.3)}100%{opacity:1;transform:scale(1)}}',
        '@keyframes agp-so-a-slide{0%{opacity:0;transform:translateX(60%)}100%{opacity:1;transform:none}}',
        '@keyframes agp-so-a-fade{0%{opacity:0;filter:blur(.3em)}100%{opacity:1;filter:none}}',
        '@keyframes agp-so-a-drop{0%{opacity:0;transform:translateY(-120%)}100%{opacity:1;transform:none}}',
        '@keyframes agp-so-a-out{to{opacity:0;transform:scale(.85) translateY(.6em)}}',
        /* «آخر دعم» البسيط: خط متوهّج (ld-line) وكبسولة مقسومة (ld-split) */
        '.agp-so-ld2{--ldn:#fff;--ld1:#ff5fa8;--ld2:#7b5cff;--ldd:#fff;--ldb:#1a1426;position:relative;direction:rtl;color:#fff;font-family:"IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,sans-serif}',
        '.agp-so-ld2n{font-family:var(--ldfn,"Noto Kufi Arabic",system-ui,sans-serif);font-weight:var(--ldwn,700);white-space:nowrap;max-width:12em;overflow:hidden;text-overflow:ellipsis;color:var(--ldn)}',
        '.agp-so-ld2av{display:inline-flex;align-items:center;gap:.25em;direction:ltr}',
        '.agp-so-ld2i{display:inline-flex;flex:none;width:1em;height:1em;color:var(--ldi,var(--lda,currentColor));filter:drop-shadow(0 0 .2em color-mix(in srgb,var(--ldi,#ffd36b) 60%,transparent))}',
        '.agp-so-ld2i svg{width:100%;height:100%;display:block}',
        '.ld-line .agp-so-ld2i{font-size:.96em}.ld-split .agp-so-ld2i{position:relative;z-index:1;font-size:.88em}',
        '.mk svg{width:100%;height:100%;display:block}',
        '.ld-line .agp-so-ld2l i.mk{width:.95em;height:.95em;background:none;border-radius:0;box-shadow:none;color:var(--ldd);transform:translate(-50%,-50%);filter:drop-shadow(0 0 .25em var(--ldd)) drop-shadow(0 0 .5em var(--ld1))}',
        '.ld-split .agp-so-ld2d.mk{width:.75em;height:.75em;background:none;box-shadow:none;color:var(--ldd);filter:drop-shadow(0 0 .2em var(--ldd))}',
        '.ldw-sep.mk{width:.7em;height:.7em;background:none;box-shadow:none;border-radius:0;color:color-mix(in srgb,var(--ld1) 50%,#fff);filter:drop-shadow(0 0 .25em var(--ld1))}',
        '.agp-so-ld2a{font-family:var(--ldfa,inherit);direction:ltr;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}',
        '.ld-line{display:flex;flex-direction:column;align-items:stretch;gap:.33em;min-width:10em}',
        '.ld-line .agp-so-ld2t{display:flex;align-items:baseline;justify-content:space-between;gap:1.1em;padding:0 .17em}',
        '.ld-line .agp-so-ld2n{font-size:.92em;text-shadow:0 .08em .4em rgba(0,0,0,.7)}',
        '.ld-line .agp-so-ld2a{font-size:.96em;color:var(--lda,color-mix(in srgb,var(--ld1) 45%,#fff));text-shadow:0 0 .6em color-mix(in srgb,var(--ld1) 55%,transparent);animation:agp-so-ldglow 2.4s ease-in-out infinite}',
        '.ld-line .agp-so-ld2l{position:relative;height:.13em;border-radius:.13em;background:linear-gradient(90deg,transparent,var(--ld1) 30%,var(--ld2) 70%,transparent);box-shadow:0 0 .5em color-mix(in srgb,var(--ld1) 60%,transparent)}',
        '.ld-line .agp-so-ld2l i{position:absolute;top:50%;width:.58em;height:.58em;border-radius:.08em;background:var(--ldd);transform:translate(-50%,-50%) rotate(45deg);box-shadow:0 0 .4em var(--ldd),0 0 .9em var(--ld1);animation:agp-so-ldwalk 4.5s ease-in-out infinite alternate}',
        '.ld-line.new .agp-so-ld2l{animation:agp-so-lddraw .6s ease-out}',
        '.ld-line.new .agp-so-ld2t{animation:agp-so-ldup .5s .15s ease-out both}',
        '.ld-split{display:flex;align-items:stretch;height:2.1em;border-radius:.58em;overflow:hidden;box-shadow:0 .33em 1.1em rgba(0,0,0,.45),0 0 0 .04em rgba(255,255,255,.08)}',
        '.ld-split .agp-so-ld2n{display:flex;align-items:center;padding:0 .92em;font-size:.88em;background:linear-gradient(180deg,color-mix(in srgb,var(--ldb) 92%,#fff),var(--ldb));opacity:.96}',
        '.ld-split .agp-so-ld2p{position:relative;display:flex;align-items:center;gap:.33em;padding:0 .75em 0 .67em;background:linear-gradient(135deg,var(--ld1,#8a63ff),color-mix(in srgb,var(--ld1,#8a63ff) 65%,#000))}',
        '.ld-split{--ld1:#8a63ff}',
        '.ld-split .agp-so-ld2p::after{content:"";position:absolute;top:0;bottom:0;right:-.42em;width:.83em;background:linear-gradient(135deg,var(--ld1),color-mix(in srgb,var(--ld1) 65%,#000));transform:skewX(-14deg)}',
        '.ld-split .agp-so-ld2a{position:relative;z-index:1;font-size:.92em;color:var(--lda,#fff)}',
        '.ld-split .agp-so-ld2d{position:relative;z-index:1;width:.33em;height:.33em;border-radius:50%;background:var(--ldd,#7dffb0);box-shadow:0 0 .33em var(--ldd,#7dffb0);animation:agp-so-ldblink 1.6s ease-in-out infinite}',
        '.ld-split{--ldd:#7dffb0}',
        '.ld-split .agp-so-ld2g{position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(110deg,transparent 40%,rgba(255,255,255,.18) 50%,transparent 60%);background-size:250% 100%;animation:agp-so-ldsh 5s ease-in-out infinite}',
        '.ld-split.new .agp-so-ld2p{animation:agp-so-ldslide .55s cubic-bezier(.2,1,.3,1) both}',
        '.ld-split.new .agp-so-ld2n{animation:agp-so-ldup .45s .2s ease-out both}',
        '.ld-split.new .agp-so-ld2d{animation:agp-so-ldflash .9s ease-out,agp-so-ldblink 1.6s .9s ease-in-out infinite}',
        /* «شريط الموج» (ld-wave): --ld1 لون الموج، --ld2 لون التوهّج، --ldb خلفية الشريط */
        '.ld-wave{--ld1:#9b6bff;--ld2:#3a1aff;--ldb:#000;display:inline-block;padding:1em .4em}',
        '.ld-wave .ldw-halo{position:absolute;left:24%;right:24%;top:.05em;bottom:.05em;border-radius:50%;background:radial-gradient(closest-side,var(--ld2),var(--ld2) 35%,color-mix(in srgb,var(--ld2) 45%,transparent) 62%,transparent 100%);filter:blur(.3em);animation:agp-so-ldhalo 3.2s ease-in-out infinite}',
        '.ld-wave .ldw-halo::after{content:"";position:absolute;left:-30%;right:-30%;top:30%;bottom:30%;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--ld2) 70%,transparent),transparent);filter:blur(.25em)}',
        '.ld-wave .ldw-bar{position:relative;display:flex;align-items:center;justify-content:center;height:2.4em;min-width:13em;padding:0 1.3em;border-radius:.55em;overflow:hidden;background:linear-gradient(100deg,color-mix(in srgb,var(--ld2) 42%,var(--ldb)) 0%,var(--ldb) 50%,color-mix(in srgb,var(--ld2) 28%,var(--ldb)) 100%);box-shadow:inset 0 0 0 .04em rgba(255,255,255,.06),0 .3em 1em rgba(0,0,0,.5)}',
        '.ldw-waves{position:absolute;inset:0;pointer-events:none;-webkit-mask:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);mask:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);filter:drop-shadow(0 0 .2em var(--ld1));mix-blend-mode:screen}',
        '.ldw-ly{position:absolute;left:0;top:0;width:200%;height:100%;animation:agp-so-ldwx 9s linear infinite}',
        '.ldw-ly svg{width:100%;height:100%;display:block;animation:agp-so-ldwy 5s ease-in-out infinite alternate}',
        '.ldw-ly.l1{animation-duration:6.5s;animation-direction:reverse}.ldw-ly.l1 svg{animation-duration:3.8s}',
        '.ldw-ly.l2{animation-duration:12s}.ldw-ly.l2 svg{animation-duration:6.2s;animation-delay:-2s}',
        '.ldw-ly.l3{animation-duration:7.5s}.ldw-ly.l3 svg{animation-duration:4.4s;animation-delay:-1s}',
        '.ldw-tx{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;width:100%;height:100%}',
        '.ldw-row{position:relative;display:inline-flex;align-items:center;gap:.5em;white-space:nowrap}',
        '.ld-wave .agp-so-ld2n{font-size:.95em;text-shadow:0 0 .4em rgba(0,0,0,.9),0 .05em .15em rgba(0,0,0,.9)}',
        '.ld-wave .agp-so-ld2a{font-size:1em;color:var(--lda,color-mix(in srgb,var(--ld1) 35%,#fff));text-shadow:0 0 .5em color-mix(in srgb,var(--ld1) 70%,transparent),0 .05em .15em rgba(0,0,0,.9)}',
        '.ldw-sep{width:.25em;height:.25em;border-radius:50%;background:color-mix(in srgb,var(--ld1) 50%,#fff);box-shadow:0 0 .3em var(--ld1)}',
        /* «شريط الفراشات» (ld-flutter): --ld1 لون الفراشات */
        '.ld-flutter{--ld1:#b98cff}',
        '.ldf{position:absolute;inset:0;pointer-events:none;-webkit-mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}',
        '.ldf-b{position:absolute;left:-12%;width:var(--z);height:calc(var(--z) * .83);margin-top:calc(var(--z) * -.41);animation:agp-so-ldfr 10s linear infinite}',
        '.ldf-b.l{animation-name:agp-so-ldfl}',
        '.ldf-bob{display:block;width:100%;height:100%;--r:18deg;animation:agp-so-ldfbob 1.2s ease-in-out infinite alternate}',
        '.ldf-b.l .ldf-bob{--r:-18deg}',
        '.ld-flutter .agp-so-bfw{--bff:var(--ld1)}',
        '.ldf .agp-so-bfw .wl{animation:agp-so-ldfflap 1.1s ease-in-out infinite}',
        '.ldf .agp-so-bfw .wr{animation:agp-so-ldfflapr 1.1s ease-in-out infinite}',
        '.ldf-b:nth-child(2n) .agp-so-bfw .wl,.ldf-b:nth-child(2n) .agp-so-bfw .wr{animation-duration:.9s;animation-delay:-.3s}',
        /* رفرفة بطيئة: الجناح يسكّر بسرعة ويفتح على راحته (تبان الأجنحة أغلب الوقت) */
        '@keyframes agp-so-ldfflap{0%,55%,100%{transform:scaleX(1) skewY(0)}25%{transform:scaleX(.18) skewY(6deg)}}',
        '@keyframes agp-so-ldfflapr{0%,55%,100%{transform:scaleX(1) skewY(0)}25%{transform:scaleX(.18) skewY(-6deg)}}',
        '@keyframes agp-so-ldfr{from{left:-12%}to{left:104%}}',
        '@keyframes agp-so-ldfl{from{left:104%}to{left:-12%}}',
        '@keyframes agp-so-ldfbob{0%{transform:translateY(-22%) rotate(calc(var(--r) - 8deg))}100%{transform:translateY(22%) rotate(calc(var(--r) + 8deg))}}',
        /* شريط: النص يمشي من اليسار لليمين */
        '.ld-wave.m-marquee .ldw-bar{width:15em;padding:0}',
        '.ld-wave.m-marquee .ldw-tx{overflow:hidden;justify-content:flex-start;-webkit-mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}',
        '.ldw-track{display:flex;direction:ltr;width:max-content;animation:agp-so-ldmq 9s linear infinite}',
        '.ldw-track .ldw-row{direction:rtl;padding:0 1.6em}',
        /* تبديل: الاسم ثم المبلغ */
        '.ldw-sw{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;animation:agp-so-ldsw 6s ease-in-out infinite}',
        '.ldw-sw.s2{animation-delay:3s}',
        '.ld-wave.m-swap .agp-so-ld2a{font-size:1.15em}',
        /* كتابة: النص ينكشف من اليمين لليسار ومعه مؤشر ضوء، يثبت، وبعدين ينمسح ويعيد */
        '.ld-wave.m-type .ldw-row{animation:agp-so-ldtype 7s ease-in-out infinite}',
        '.ldw-cur{position:absolute;top:-.15em;bottom:-.15em;width:.08em;border-radius:.08em;background:#fff;box-shadow:0 0 .3em #fff,0 0 .6em var(--ld1);animation:agp-so-ldcur 7s ease-in-out infinite}',
        /* داعم جديد */
        '.ld-wave.new .ldw-bar{animation:agp-so-ldpop .7s cubic-bezier(.2,1.4,.4,1)}',
        '.ld-wave.new .ldw-halo{animation:agp-so-ldflare 1.2s ease-out,agp-so-ldhalo 3.2s 1.2s ease-in-out infinite}',
        '@keyframes agp-so-ldhalo{0%,100%{opacity:.85;transform:scaleX(.92)}50%{opacity:1;transform:scaleX(1.06)}}',
        '@keyframes agp-so-ldflare{0%{opacity:1;transform:scale(1.6);filter:blur(.2em) brightness(1.8)}100%{opacity:.75;transform:none}}',
        '@keyframes agp-so-ldpop{0%{transform:scale(.88);filter:brightness(1.7)}100%{transform:none;filter:none}}',
        '@keyframes agp-so-ldwx{to{transform:translateX(-50%)}}',
        '@keyframes agp-so-ldwy{0%{transform:translateY(-7%) scaleY(.9)}100%{transform:translateY(7%) scaleY(1.1)}}',
        '@keyframes agp-so-ldmq{from{transform:translateX(-50%)}to{transform:translateX(0)}}',
        '@keyframes agp-so-ldsw{0%{opacity:0;transform:translateY(60%);filter:blur(.08em)}8%,44%{opacity:1;transform:none;filter:none}52%,100%{opacity:0;transform:translateY(-60%);filter:blur(.08em)}}',
        '@keyframes agp-so-ldtype{0%{clip-path:inset(-20% -5% -20% 100%)}28%,82%{clip-path:inset(-20% -5% -20% 0)}96%,100%{clip-path:inset(-20% 100% -20% 0)}}',
        '@keyframes agp-so-ldcur{0%{right:0;opacity:1}28%{right:100%;opacity:1}34%,82%{right:100%;opacity:0}83%{right:100%;opacity:1}96%{right:0;opacity:1}100%{right:0;opacity:0}}',
        '@keyframes agp-so-ldglow{50%{text-shadow:0 0 .9em color-mix(in srgb,var(--ld1) 90%,transparent)}}',
        '@keyframes agp-so-ldwalk{0%{left:12%}100%{left:88%}}',
        '@keyframes agp-so-lddraw{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}',
        '@keyframes agp-so-ldup{0%{opacity:0;transform:translateY(.4em)}100%{opacity:1;transform:none}}',
        '@keyframes agp-so-ldblink{50%{opacity:.35;box-shadow:0 0 .08em var(--ldd)}}',
        '@keyframes agp-so-ldsh{0%,55%{background-position:120% 0}100%{background-position:-120% 0}}',
        '@keyframes agp-so-ldslide{0%{transform:translateX(-110%)}100%{transform:none}}',
        '@keyframes agp-so-ldflash{0%{transform:scale(3);box-shadow:0 0 .75em var(--ldd)}100%{transform:none}}',
        /* «آخر دعم» (الدونيشن) */
        '.agp-so-lastdonation{color:#fff;font-family:"IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,sans-serif}',
        '.agp-so-ldbox{display:flex;align-items:center;gap:.5em;padding:.45em .8em .45em .55em;border-radius:1em;background:linear-gradient(160deg,rgba(36,31,46,.86),rgba(16,14,21,.8));border:.06em solid color-mix(in srgb,var(--agp-so-c,#ffd54a) 55%,transparent);box-shadow:0 .3em 1em rgba(0,0,0,.45),0 0 .8em color-mix(in srgb,var(--agp-so-c,#ffd54a) 25%,transparent)}',
        '.agp-so-ldic{flex:none;width:1.7em;height:1.7em;filter:drop-shadow(0 0 .25em rgba(255,200,60,.6));animation:agp-so-coin 3.2s ease-in-out infinite}',
        '.agp-so-ldic svg{width:100%;height:100%;display:block}',
        '.agp-so-ldic{color:var(--ldi,var(--agp-so-c,#ffd54a))}',
        '.agp-so-ldbox .agp-so-ldname{font-family:var(--ldfn,"Noto Kufi Arabic",system-ui,sans-serif);font-weight:var(--ldwn,700);color:var(--ldn,inherit)}',
        '.agp-so-ldbox .agp-so-ldamt{font-family:var(--ldfa,inherit);color:var(--lda,var(--agp-so-c,#ffd54a))}',
        '.agp-so-ldtx{display:flex;flex-direction:column;gap:.1em;min-width:0}',
        '.agp-so-ldrow{display:flex;align-items:baseline;gap:.45em;white-space:nowrap}',
        '.agp-so-ldname{font-family:"Noto Kufi Arabic",system-ui,sans-serif;font-size:.85em;max-width:9em;overflow:hidden;text-overflow:ellipsis}',
        '.agp-so-ldamt{font-weight:800;font-size:.95em;color:var(--agp-so-c,#ffd54a);direction:ltr;text-shadow:0 0 .4em color-mix(in srgb,var(--agp-so-c,#ffd54a) 50%,transparent)}',
        '.agp-so-ldmsg{font-size:.62em;color:rgba(231,224,240,.85);max-width:16em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.agp-so-ldwait{font-size:.7em;color:rgba(231,224,240,.7)}',
        /* أدوات الصوت: القارئ الصوتي ومشغّل الأغاني */
        '.agp-so-tts,.agp-so-music{display:flex;align-items:center;gap:.45em;direction:rtl;color:#fff;font-family:"IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,sans-serif}',
        '.agp-so-aic{flex:none;width:2.2em;height:2.2em;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.28),transparent 60%),linear-gradient(160deg,var(--agp-so-c,#cfc3dc),#42394f);box-shadow:0 .2em .7em rgba(0,0,0,.45),0 0 0 .08em rgba(255,255,255,.25) inset}',
        '.agp-so-aic svg{width:1.15em;height:1.15em;filter:drop-shadow(0 .05em .1em rgba(0,0,0,.4))}',
        '.agp-so-tts.talking .agp-so-aic,.agp-so-music.playing .agp-so-aic{animation:agp-so-apulse 1.2s ease-in-out infinite}',
        '@keyframes agp-so-apulse{50%{box-shadow:0 .2em .7em rgba(0,0,0,.45),0 0 0 .35em rgba(207,195,220,.25)}}',
        '.agp-so-tbub,.agp-so-mtx{display:flex;flex-direction:column;gap:.12em;max-width:16em;padding:.45em .75em;border-radius:.9em;background:linear-gradient(160deg,rgba(36,31,46,.88),rgba(16,14,21,.82));border:.06em solid rgba(207,195,220,.3);box-shadow:0 .3em 1em rgba(0,0,0,.45);animation:agp-so-a-fade .35s ease both}',
        '.agp-so-tbub b,.agp-so-mtx b{font-size:.8em;font-weight:700;color:var(--agp-so-c,#cfc3dc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.agp-so-tbub span{font-size:.72em;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
        '.agp-so-mtx b{color:#fff;font-size:.78em}',
        '.agp-so-mtx small{font-size:.62em;color:rgba(231,224,240,.75)}',
        '.agp-so-mbar{display:block;height:.22em;border-radius:1em;background:rgba(255,255,255,.15);overflow:hidden;margin-top:.15em}',
        '.agp-so-mbar i{display:block;height:100%;border-radius:inherit;background:var(--agp-so-c,#cfc3dc);transition:width 1s linear}',
        '.agp-so-ythost{position:fixed;left:-10px;top:-10px;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none}',
        '.agp-so-unlock{position:fixed;left:12px;bottom:12px;z-index:99;padding:10px 16px;border-radius:12px;border:0;background:#6e617f;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer}'
    ].join('\n');

    function ensureStyle() {
        if (document.getElementById('agp-so-style')) return;
        var style = document.createElement('style');
        style.id = 'agp-so-style';
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function init() {
        if (!document.body) return;
        ensureStyle();
        if (!STUDIO) {
            layer = document.createElement('div');
            layer.id = 'agp-so-layer';
            stage = document.createElement('div');
            stage.id = 'agp-so-stage';
            layer.appendChild(stage);
            document.body.appendChild(layer);
            listeners.stats.push(repaintData);
            // نعيد الرسم بس لو المقاس الثابت تغيّر فعلاً (تدوير/تغيير حجم النافذة)،
            // مو لما شريط Safari يختفي ويرجع مع التمرير
            var lastSize = viewW() + 'x' + viewH();
            window.addEventListener('resize', function () {
                var size = viewW() + 'x' + viewH();
                if (size === lastSize) return;
                lastSize = size;
                render();
            });
            render();
            if (LINK) {
                fetchDesign();
                setInterval(fetchDesign, DESIGN_POLL_MS);
            }
        } else {
            syncPolling();
            syncJarPolling();
            syncLink();
        }
        // اتصال/قطع من زر المكتبة، واتصال اللعبة نفسها
        setInterval(syncLink, LINK_CHECK_MS);
        // تفعيل/إطفاء التحكم بالشات (js/agp-remote-control.js)
        window.addEventListener('agp:remote-control-changed', function () { setTimeout(syncLink, 0); });
        var A = window.AymanGamesPlatform;
        if (A && A.events && typeof A.events.on === 'function') A.events.on('stream:statusChanged', function () { setTimeout(syncLink, 0); });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible') return;
            if (pollTimer) fetchStats();
            if (jarTimer) fetchJar();
        });
        // تعديل من الاستوديو بتبويب ثاني
        window.addEventListener('storage', function (e) {
            if (LINK || SCREENS) return; // التصميم من السيرفر / من المحرر
            if (e.key === CONN_KEY) { syncLink(); return; }
            if (e.key !== STORE_KEY) return;
            state = load();
            if (layer) render(); else { syncPolling(); syncJarPolling(); syncLink(); }
        });
    }

    window.AGPStreamOverlay = {
        STORE_KEY: STORE_KEY, TEMPLATES: TEMPLATES, FONTS: FONTS, TEXT_STYLES: TEXT_STYLES, ANIMS: ANIMS, SPEEDS: SPEEDS,
        COLORS: COLORS, TOPS: TOPS, DESIGNS: DESIGNS, GOAL_DESIGNS: GOAL_DESIGNS, VEYRO_GOAL_DESIGNS: VEYRO_GOAL_DESIGNS, ORB_PALETTES: ORB_PALETTES, orbColors: orbColors, orbDemo: orbDemo, COUNTER_DESIGNS: COUNTER_DESIGNS,
        SECTIONS: SECTIONS, METRICS: METRICS, DEFAULT_FONT: DEFAULT_FONT,
        getState: function () { return state; },
        /** محرر الشاشات: الشاشة المفتوحة (ما تنحفظ هنا — المحرر يرفعها للسيرفر). */
        setState: function (s) {
            state = migrate(s) || Object.assign(defaults(), { template: 'pc', editOrient: 'l' });
            if (layer) render(); else { syncPolling(); syncJarPolling(); syncLink(); }
            return state;
        },
        VEYRO_DESIGNS: VEYRO_DESIGNS, FRAME_COLORS: FRAME_COLORS, THRONE_CYCLES: THRONE_CYCLES, THRONE_FX: THRONE_FX, THRONE_FRAMES: THRONE_FRAMES, STACK_COUNTS: STACK_COUNTS, LD_ICONS: LD_ICONS, BN_BG: BN_BG, BN_MOTIONS: BN_MOTIONS, BN_MATS: BN_MATS, refreshItem: refreshItem, throneDemo: throneDemo,
        ICON_SET: ICON_SET, EMOJIS: EMOJIS, ALERT_EVENTS: ALERT_EVENTS, ALERT_EVENTS_ALL: ALERT_EVENTS_ALL, alertMatches: alertMatches, ALERT_DESIGNS: ALERT_DESIGNS, ALERT_ANIMS: ALERT_ANIMS,
        SHAPES: SHAPES, SHAPE_FILLS: SHAPE_FILLS,
        /** أليرت الفيديو والتفريغ (Veyro). */
        AVATAR_SHAPES: AVATAR_SHAPES, AVATAR_FRAMES: AVATAR_FRAMES, hueDist: hueDist, calibrateHue: calibrateHue,
        KEY_DEFAULT: KEY_DEFAULT, LIVE_VERSION: LIVE_VERSION, PARTS_DEFAULT: PARTS_DEFAULT, PART_ANIMS: PART_ANIMS, videoAlertLen: videoAlertLen, prefetchVideo: prefetchVideo, videoSrc: videoSrc, PART_MSGS: PART_MSGS, partsOf: partsOf, keyOf: keyOf, isVideoAlert: isVideoAlert, videoFileUrl: videoFileUrl, makeKeyer: makeKeyer,
        /** المحرر: تنبيه تجريبي بأداة الأليرتات (type = gift/follow/share/join). */
        alertDemo: function (itemId, type) { queueAlert(itemId, sampleEvent(type || 'gift'), true); },
        /** بعد أي تعديل على getState(): يحفظ ويحدّث الرسم والبيانات. */
        commit: function () { save(); if (layer) render(); else { syncPolling(); syncJarPolling(); syncLink(); } },
        /** الاستوديو: هدايا تجريبية تطيح بالوعاء (بالمعاينة فقط، ما تنحفظ). */
        jarDemo: function (n) {
            var fresh = [];
            for (var i = 0; i < (n || 6); i++) {
                var k = 'demo-' + Date.now().toString(36) + '-' + i;
                jarDemo.push({ k: k, img: SAMPLE_GIFT_SVGS[Math.floor(Math.random() * SAMPLE_GIFT_SVGS.length)], name: '' });
                fresh.push(k);
            }
            if (jarDemo.length > JAR_CAP) jarDemo = jarDemo.slice(jarDemo.length - JAR_CAP);
            paintJars(fresh);
        },
        jarClearDemo: function () { jarDemo = []; paintJars(null); },
        /** للنافذة العائمة (js/agp-stream-pip.js): صور الوعاء والإجماليات. */
        jarData: function () { return { icons: jar.icons.concat(jarDemo), totals: jar.totals }; },
        mediaUrl: mediaUrl,
        SAMPLE_ROWS: SAMPLE_ROWS, SAMPLE_TOTALS: SAMPLE_TOTALS, SAMPLE_GIFT_SVGS: SAMPLE_GIFT_SVGS,
        tpl: tpl, keyFor: keyFor, frameIn: frameIn, posOf: posOf, place: place, orient: orient,
        fontOf: fontOf, loadFont: loadFont, fontStack: fontStack,
        buildItem: buildItem, newItem: newItem, isDataItem: isDataItem, icon: icon,
        /** أدوات الصوت (Veyro): فلتر القارئ وأوامر المشغّل — للمحرر والاختبارات. */
        ttsFilter: ttsFilter, parseMusicCommand: parseMusicCommand, musicAllowed: musicAllowed,
        /** الدونيشن: تنسيق المبلغ ($25) — للمحرر وصورة الإحصائيات. */
        fmtMoney: fmtMoney,
        stats: function () { return stats; },
        refreshStats: fetchStats,
        linkOk: linkOk, linkText: linkText,
        onStats: function (fn) { listeners.stats.push(fn); },
        onLink: function (fn) { listeners.link.push(fn); }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}());
