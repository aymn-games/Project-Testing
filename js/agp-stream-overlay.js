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

    // أقسام التوب (نفس أقسام live-session-stats.js)
    var SECTIONS = {
        likers: { label: 'المكبّسين', title: 'توب المكبّسين', icon: 'heart', value: function (r) { return fmt(r.count); } },
        gifters: { label: 'الداعمين', title: 'توب الداعمين', icon: 'diamond', value: function (r) { return fmt(r.diamonds); } },
        commenters: { label: 'المتفاعلين', title: 'أكثر المتفاعلين', icon: 'chat', value: function (r) { return fmt(r.count); } },
        sharers: { label: 'الشير', title: 'توب الشير', icon: 'share', value: function (r) { return fmt(r.count); } }
    };
    // مقاييس الهدف والعدّادات = totals بملخص البث
    var METRICS = {
        likes: { name: 'التكبيسات', unit: 'تكبيسة', icon: 'heart' },
        diamonds: { name: 'الماس', unit: 'ماسة', icon: 'diamond' },
        gifts: { name: 'الهدايا', unit: 'هدية', icon: 'gift' },
        follows: { name: 'المتابعين الجدد', unit: 'متابع جديد', icon: 'follow' },
        shares: { name: 'الشير', unit: 'شير', icon: 'share' },
        comments: { name: 'التعليقات', unit: 'تعليق', icon: 'chat' },
        peakViewers: { name: 'أعلى مشاهدة', unit: 'أعلى مشاهدة', icon: 'eye' }
    };
    var ICONS = {
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
        likers: '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="agp-so-hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8db3"/><stop offset="1" stop-color="#ff2d6f"/></linearGradient></defs><path d="M12 21.3s-8.3-5-10.3-10C.4 7.6 2.6 3.6 6.6 3.6c2.3 0 4.2 1.3 5.4 3 1.2-1.7 3.1-3 5.4-3 4 0 6.2 4 4.9 7.7-2 5-10.3 10-10.3 10z" fill="url(#agp-so-hg)"/><path d="M6.4 6.4c-1.6.3-2.5 1.7-2.3 3.3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".75"/></svg>',
        gifters: '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="agp-so-dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9f4ff"/><stop offset="1" stop-color="#2fa6ff"/></linearGradient></defs><path d="M7 3h10l5 6.5L12 21 2 9.5z" fill="url(#agp-so-dg)"/><path d="M2 9.5h20M7 3l3 6.5L12 21l2-11.5L17 3" stroke="#fff" stroke-width="1" fill="none" opacity=".6"/></svg>'
    };
    // فراشة «جناح الملاك»: جناحين يرفرفون (wl/wr)
    var BUTTERFLY = '<svg viewBox="0 0 40 40" aria-hidden="true"><defs><radialGradient id="agp-so-bw" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#a6e6ff"/><stop offset="1" stop-color="#2f8cff"/></radialGradient></defs>' +
        '<g class="wl"><path d="M20 20C14 6 3 5 2 12c-1 6 7 9 18 8z" fill="url(#agp-so-bw)"/><path d="M20 21c-9 0-15 4-13 9 2 5 9 2 13-9z" fill="url(#agp-so-bw)" opacity=".85"/></g>' +
        '<g class="wr"><path d="M20 20c6-14 17-15 18-8 1 6-7 9-18 8z" fill="url(#agp-so-bw)"/><path d="M20 21c9 0 15 4 13 9-2 5-9 2-13-9z" fill="url(#agp-so-bw)" opacity=".85"/></g>' +
        '<rect x="19.2" y="13" width="1.6" height="15" rx=".8" fill="#e9f9ff"/></svg>';
    // بيانات تجريبية للمعاينة بالاستوديو لما ما فيه بث
    var SAMPLE_ROWS = [
        { name: 'الأول', count: 12400, diamonds: 5200 }, { name: 'الثاني', count: 8100, diamonds: 3100 },
        { name: 'الثالث', count: 4600, diamonds: 1450 }, { name: 'الرابع', count: 2100, diamonds: 600 }, { name: 'الخامس', count: 900, diamonds: 210 }
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
    var SAMPLE_TOTALS = { likes: 4320, diamonds: 860, gifts: 57, follows: 23, shares: 12, comments: 340, peakViewers: 185 };

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
            if (it.type === 'top' && it.design === 'throne') throneSecs(it).forEach(function (k) { secs[k] = Math.max(secs[k] || 0, 3); });
            else if (it.type === 'top' && SECTIONS[it.section]) secs[it.section] = Math.max(secs[it.section] || 0, Number(it.top) || 3);
            else if (it.type === 'goal' || it.type === 'counter') totals = true;
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

    var link = { ws: null, state: 'off', msg: '', retry: 0, timer: null, username: null, stopFor: null };
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

    function linkWanted() {
        if (LINK) return false; // رابط OBS يقرأ بس — الحساب من اتصال الموقع
        var c = savedConn();
        if ((!dataWanted() && !presenceWanted()) || !token() || !c) return false;
        if (link.stopFor === connId(c)) return false; // رُفض أو انتهى البث — نستنى اتصال جديد من المكتبة
        if (gameConnected()) { gameDownSince = null; return false; }
        if (gameConnector()) {
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
        link.state = 'connecting';
        ws.onopen = function () {
            ws.send(JSON.stringify({
                type: 'connect',
                payload: { platform: 'tiktok', username: c.username, followersOnly: false, source: 'overlay', page: location.pathname, authToken: token() },
                timestamp: Date.now()
            }));
        };
        ws.onmessage = function (e) {
            var env;
            try { env = JSON.parse(e.data); } catch (err) { return; }
            if (!env || env.type !== 'status' || !env.payload || link.ws !== ws) return;
            var st = env.payload.status, reason = env.payload.reason;
            if (st === 'connected') {
                link.state = 'connected';
                link.retry = 0;
                setTimeout(fetchStats, 2500);
            } else if (st === 'error' || st === 'disconnected') {
                // reason = منع (حساب غير مربوط/مختلف) أو انتهاء البث: ما نعيد المحاولة لنفس الاتصال
                link.state = reason === 'stream_ended' ? 'ended' : (reason ? 'denied' : 'error');
                link.msg = env.payload.message || '';
                if (reason) link.stopFor = connId(c);
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
        if (want && link.ws && link.username !== c.username) closeLink();
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
    var FRAME_COLORS = [
        { key: 'ice', label: 'ثلجي', hue: 0, sw: '#7fd0ff' },
        { key: 'purple', label: 'بنفسجي', hue: 65, sw: '#b48cff' },
        { key: 'pink', label: 'وردي', hue: 125, sw: '#ff8fc8' },
        { key: 'red', label: 'أحمر', hue: 160, sw: '#ff6b6b' },
        { key: 'gold', label: 'ذهبي', hue: 195, sw: '#ffd36b' },
        { key: 'green', label: 'أخضر', hue: -75, sw: '#7cf0a0' }
    ];
    var THRONE_CYCLES = [5, 8, 10, 15, 20, 30];
    // حركة التبديل بين الأقسام (it.transition)
    var THRONE_FX = [
        { key: 'flip', label: 'قلب' }, { key: 'fade', label: 'تلاشي' }, { key: 'slide', label: 'انزلاق' },
        { key: 'zoom', label: 'تكبير' }, { key: 'drop', label: 'سقوط' }, { key: 'spin', label: 'دوران' }, { key: 'flash', label: 'وميض' }
    ];
    var FRAME_BASE_HUE = 205; // لون إطار «جناح الملاك» الأصلي (أزرق ثلجي)
    function hexHue(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
        if (!m) return FRAME_BASE_HUE;
        var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
        if (!d) return FRAME_BASE_HUE;
        if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
        return (h * 60 + 360) % 360;
    }
    /** دوران الألوان لإطار العرش: لون جاهز أو مخصص (frameColor = custom + frameCustom). */
    function frameHue(it) {
        if (it.frameColor === 'custom') return Math.round(hexHue(it.frameCustom) - FRAME_BASE_HUE);
        var fc = FRAME_COLORS.filter(function (c) { return c.key === it.frameColor; })[0] || FRAME_COLORS[0];
        return fc.hue;
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
    function rowNum(sec, r) { return Number(sec === 'gifters' ? r.diamonds : r.count) || 0; }

    function buildThrone(node, it, preview) {
        title(node, it.title);
        var body = el('div', 'agp-so-lbody');
        var box = el('div', 'agp-so-throne' + (it.palette === 'single' ? ' pal-single' : ''));
        box.style.setProperty('--agp-so-fhue', frameHue(it) + 'deg');
        var slots = {};
        // RTL: أول عنصر يمين — الثاني يمين والأول بالوسط والثالث يسار
        [1, 0, 2].forEach(function (i) {
            var slot = el('div', 'agp-so-tcol' + rkClass(i));
            slot.style.setProperty('--d', [1, 0, 2].indexOf(i) * 0.12 + 's');
            slots[i] = slot;
            box.appendChild(slot);
        });
        var wait = el('div', 'agp-so-empty agp-so-twait');
        body.appendChild(box);
        body.appendChild(wait);
        node.appendChild(body);
        node._throne = { it: it, preview: preview, box: box, slots: slots, wait: wait, idx: -1 };
        paintThrone(node, false);
        throneNodes.push(node);
        if (!throneTimer) throneTimer = setInterval(tickThrones, 400);
    }

    /** يرسم/يحدّث العرش. animate = تحديث بيانات أو تبديل قسم (حركة قلب للي تغيّر). */
    function paintThrone(node, animate) {
        var t = node._throne, it = t.it;
        var secs = throneSecs(it), idx = throneIdx(it), sec = secs[idx];
        var rows = (stats.sections[sec] || []).slice(0, 3);
        var ghost = !rows.length && t.preview;
        if (ghost) rows = SAMPLE_ROWS.slice(0, 3);
        t.box.classList.toggle('agp-so-ghost', ghost);
        t.wait.textContent = rows.length ? '' : 'بانتظار ' + SECTIONS[sec].label + '…';
        t.wait.style.display = rows.length ? 'none' : '';
        var switching = animate && t.idx !== -1 && t.idx !== idx;
        t.idx = idx;
        [1, 0, 2].forEach(function (i, order) {
            var slot = t.slots[i], r = rows[i];
            if (!r) { slot.style.visibility = 'hidden'; slot._sig = null; return; }
            slot.style.visibility = '';
            var sig = sec + '|' + nameOf(r) + '|' + (r.avatar ? String(r.avatar).length : 0);
            if (!slot._sig) {
                fillThroneCol(slot, r, sec, i);
                // حركة الدخول بالبث بس (بالمحرر كل تعديل يعيد الرسم)
                if (!animate && !t.preview) slot.classList.add('t-enter');
            } else if (switching || slot._sig !== sig) {
                flipCol(slot, function () { fillThroneCol(slot, r, sec, i); }, order * 90, it.transition);
            } else {
                tweenNum(slot.querySelector('.agp-so-tnum'), rowNum(sec, r));
            }
            slot._sig = sig;
        });
    }

    function fillThroneCol(slot, r, sec, i) {
        slot.textContent = '';
        var inner = el('div', 'agp-so-tin');
        inner.appendChild(angelFrame(r));
        inner.appendChild(el('span', 'agp-so-tname', nameOf(r)));
        var c = el('span', 'agp-so-tcount');
        var ic = el('span', 'agp-so-tic i-' + sec);
        if (sec === 'gifters') {
            // الدعم: عملة ذهبية (assets/overlay-frames/coin.webp)
            var coin = document.createElement('img');
            coin.src = FRAMES_BASE + 'coin.webp';
            coin.alt = '';
            coin.draggable = false;
            ic.appendChild(coin);
        } else if (THRONE_ICONS[sec]) ic.innerHTML = THRONE_ICONS[sec];
        else ic.appendChild(icon((SECTIONS[sec] || SECTIONS.likers).icon));
        c.appendChild(ic);
        var num = el('span', 'agp-so-tnum', fmt(rowNum(sec, r)));
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
            elm.textContent = fmt(Math.round(from + (to - from) * e));
            if (k < 1 && elm.isConnected) requestAnimationFrame(step);
        }(t0));
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
            [1, 0, 2].forEach(function (i, order) {
                var slot = n._throne.slots[i];
                if (slot && slot._sig) flipCol(slot, function () {}, order * 90, n._throne.it.transition);
            });
        });
    }

    /** تحديث عنصر بمكانه بدون إعادة رسم (يرجع true لو تحدّث). */
    function refreshItem(node, it) {
        if (!node || !node._throne || !it || it.design !== 'throne') return false;
        node._throne.it = it;
        paintThrone(node, true);
        return true;
    }

    /** إطار «جناح الملاك» حول صورة الشخص: الرسمة + ضوء يلف + شرار + فراشات. */
    function angelFrame(r) {
        var f = el('span', 'agp-so-fav fr-angel');
        f.appendChild(avatar(r));
        f.appendChild(el('span', 'agp-so-fcomet'));
        var art = el('span', 'agp-so-fart');
        ['glow', ''].forEach(function (c) {
            var img = document.createElement('img');
            img.src = FRAMES_BASE + 'angel.webp';
            img.alt = '';
            img.draggable = false;
            if (c) img.className = c;
            art.appendChild(img);
        });
        f.appendChild(art);
        [[200, 0], [235, 0.7], [300, 1.4], [330, 2.1], [20, 0.35], [60, 1.05], [110, 1.75], [150, 2.45]].forEach(function (sp) {
            var rad = sp[0] * Math.PI / 180;
            var k = el('span', 'agp-so-fspk');
            k.style.left = (50 + Math.cos(rad) * 55 - 2.5) + '%';
            k.style.top = (50 + Math.sin(rad) * 55 - 2.5) + '%';
            k.style.animationDelay = sp[1] + 's';
            f.appendChild(k);
        });
        ['b1', 'b2'].forEach(function (b) {
            var o = el('span', 'agp-so-fbfo ' + b);
            var bf = el('span', 'agp-so-fbf');
            bf.innerHTML = BUTTERFLY;
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
    var VEYRO_DESIGNS = [{ key: 'throne', label: 'العرش', max: 3, multi: true }];
    var GOAL_DESIGNS = [{ key: 'bar', label: 'شريط' }, { key: 'ring', label: 'دائرة' }];
    var COUNTER_DESIGNS = [{ key: 'pills', label: 'كبسولات' }, { key: 'big', label: 'أرقام كبيرة' }, { key: 'stack', label: 'قائمة' }];

    // أليرتات «شاشات البث»: msg = النص الافتراضي ({name} {gift} {count} {diamonds})
    var ALERT_EVENTS = {
        gift: { label: 'الهدايا', title: 'هدية جديدة', icon: 'gift', msg: '{name} أرسل {gift} ×{count}' },
        follow: { label: 'المتابعين', title: 'متابع جديد', icon: 'follow', msg: '{name} تابع البث' },
        share: { label: 'الشير', title: 'شير جديد', icon: 'share', msg: '{name} نشر البث' },
        join: { label: 'الدخول', title: 'نوّر البث', icon: 'eye', msg: '{name} دخل البث' }
    };
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
        if (it.design === 'throne') {
            node.className = node.className.replace(/(^|\s)d-\w+/g, '') + ' d-throne';
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

    function fillGoal(node, it, preview) {
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
        nums.appendChild(el('span', null, done && !it.autoNext ? 'اكتمل الهدف! ' + fmt(cur) : fmt(cur) + ' / ' + fmt(target)));
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
            mv.appendChild(tx);
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
        }
        return n;
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
    var evState = { init: false, sid: 0, seq: 0, timer: null, inflight: false };
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
        return e;
    }

    function fillMsg(tpl, e) {
        return String(tpl || '').replace(/\{name\}/g, e.user || '').replace(/\{gift\}/g, e.gift || '').replace(/\{count\}/g, String(e.count || 1)).replace(/\{diamonds\}/g, fmt(e.diamonds));
    }

    /** بطاقة التنبيه نفسها. */
    function alertCard(it, e) {
        var meta = ALERT_EVENTS[e.type] || ALERT_EVENTS.gift;
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
            // بالمحرر: أول فريم من الفيديو باهت (بنفس التفريغ) عشان يشوف مكانه وحجمه
            if (n._preview) {
                var vb = videoBox(n._item, null, true);
                vb.root.classList.add('agp-so-ghost');
                stage.appendChild(vb.root);
            }
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
        if (!q || !q.busy) idleAlert(n);
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

    var KEY_DEFAULT = { on: false, mode: 'color', color: '#00ff00', sim: 0.4, smooth: 0.08, spill: 0.1 };
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
        'uniform sampler2D tex;uniform vec3 key;uniform float sim,smo,spill;uniform int mode;varying vec2 uv;',
        // المسافة بين الألوان بقناتي اللون (CbCr) — الإضاءة ما تأثر، مثل OBS
        'vec2 cc(vec3 c){return vec2(dot(c,vec3(-.169,-.331,.5)),dot(c,vec3(.5,-.419,-.081)));}',
        'void main(){vec4 c=texture2D(tex,uv);float a=1.;',
        ' if(mode==0){float t=sim*.5;float d=distance(cc(c.rgb),cc(key));a=smoothstep(t,t+smo*.5+.0001,d);',
        '  float s=clamp((d-t)/max(spill*.5,.0001),0.,1.);float l=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=mix(vec3(l),c.rgb,s);}',
        ' else{float l=dot(c.rgb,vec3(.299,.587,.114));float t=sim*.5;',
        '  if(mode==1)a=smoothstep(t,t+smo+.0001,l);else a=1.-smoothstep(1.-t-smo-.0001,1.-t,l);}',
        ' a*=c.a;gl_FragColor=vec4(c.rgb*a,a);}'
    ].join('\n');

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
        ['key', 'sim', 'smo', 'spill', 'mode'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
        var k = { canvas: cv, failed: false, onfail: null };
        var raf = 0, dead = false;
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
            gl.uniform1i(U.mode, key.mode === 'black' ? 1 : key.mode === 'white' ? 2 : 0);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        function loop() { if (dead) return; k.draw(); raf = requestAnimationFrame(loop); }
        function start() { if (!raf && !dead) loop(); }
        function stop() { cancelAnimationFrame(raf); raf = 0; k.draw(); }
        video.addEventListener('play', start);
        video.addEventListener('pause', stop);
        video.addEventListener('ended', stop);
        video.addEventListener('seeked', k.draw);
        video.addEventListener('loadeddata', k.draw);
        k.destroy = function () {
            dead = true;
            cancelAnimationFrame(raf);
            video.removeEventListener('play', start);
            try { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { /* ignore */ }
        };
        keyers.push(k);
        if (!video.paused) start();
        return k;
    }

    function makeVideo(it) {
        var v = document.createElement('video');
        v.crossOrigin = 'anonymous'; // لازم عشان التفريغ يقرأ البكسلات
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.preload = 'auto';
        v.src = videoFileUrl(it.video.id);
        v.volume = clamp(it.volume == null ? 0.8 : Number(it.volume), 0, 1);
        return v;
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
        if (it.showText !== false && e) {
            var msg = (it.msg && it.msg[e.type]) || (ALERT_EVENTS[e.type] || ALERT_EVENTS.gift).msg;
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
        var max = (clamp(Number(it.video.d) || 30, 1, 60) + 2) * 1000;
        var ended = false, boxes = [], timer = null;
        function done() {
            if (ended) return;
            ended = true;
            clearTimeout(timer);
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
        boxes.forEach(function (vb, i) {
            var v = vb.video;
            v.muted = i > 0 || Boolean(it.mute);
            var p = v.play();
            // المتصفح منع الصوت التلقائي: نشغّله بدون صوت بدل ما يوقف
            if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(done); });
        });
        boxes[0].video.addEventListener('ended', done);
        boxes[0].video.addEventListener('error', done);
        timer = setTimeout(done, max);
    }

    /** يضيف تنبيه لطابور الأداة. force = تجربة المحرر (بدون فلترة). */
    function queueAlert(id, e, force) {
        var q = alertQ[id] = alertQ[id] || { list: [], busy: false };
        if (!force && e.type === 'join' && q.list.length >= 2) return; // الدخول كثير — ما نطوّل الطابور
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
        targets.forEach(function (t) {
            var stage = t.node.querySelector('.agp-so-astage');
            if (!stage) return;
            stage.textContent = '';
            var c = alertCard(it, e);
            c.classList.add('in-' + anim);
            stage.appendChild(c);
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
            liveAlertNodes(id).forEach(function (t) { idleAlert(t.node); });
            setTimeout(function () { pumpAlert(id); }, 250);
        }, dur);
    }

    function alertItems() { return activeItems().filter(function (it) { return it.type === 'alert'; }); }

    /** رابط الشاشة: أحداث جديدة → تنبيهات. أول طلب (أو بث جديد) = نقطة بداية بدون تنبيهات. */
    function fetchEvents() {
        if (evState.inflight || !LINK) return;
        evState.inflight = true;
        fetch(apiBase() + '/api/public/screen/events?k=' + encodeURIComponent(LINK_KEY) + '&since=' + (evState.init ? evState.seq : 0))
            .then(function (res) { return res.json(); })
            .then(function (d) {
                if (!d || !d.success) return;
                if (!evState.init || d.sid !== evState.sid || d.seq < evState.seq) {
                    evState.init = true;
                    evState.sid = d.sid;
                    evState.seq = d.seq;
                    return;
                }
                evState.seq = d.seq;
                (d.events || []).forEach(function (e) {
                    alertItems().forEach(function (it) {
                        if ((it.events || []).indexOf(e.type) === -1) return;
                        if (e.type === 'gift' && (Number(e.diamonds) || 0) < (Number(it.minDiamonds) || 0)) return;
                        queueAlert(it.id, e);
                    });
                });
            })
            .catch(function () { /* نحاول بالدورة الجاية */ })
            .then(function () { evState.inflight = false; });
    }

    function syncEventsPolling() {
        var want = LINK && state.enabled && alertItems().length > 0;
        if (want && !evState.timer) {
            fetchEvents();
            evState.timer = setInterval(fetchEvents, EVENTS_POLL_MS);
        } else if (!want && evState.timer) {
            clearInterval(evState.timer);
            evState.timer = null;
        }
    }

    function isDataItem(it) { return it.type === 'top' || it.type === 'goal' || it.type === 'counter'; }

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
                return Object.assign(base, { events: evs, video: opts.video, key: Object.assign({}, KEY_DEFAULT), volume: 0.8, showText: true, textPos: 'bottom', minDiamonds: 0, sound: false, size: 3, color: '#ffffff', msg: msg });
            }
            return Object.assign(base, { events: evs, design: opts.design || 'card', anim: 'pop', duration: 5, minDiamonds: 0, sound: true, size: 3, color: opts.color || '#ff4d6d', msg: msg });
        }
        if (type === 'icon') return Object.assign(base, opts.emoji ? { emoji: opts.emoji } : { icon: opts.icon || 'star' }, { size: 9, color: opts.color || '#ffd54a', anim: 'none', speed: 1, glow: true });
        if (type === 'shape') return Object.assign(base, { shape: opts.shape || 'round', w: opts.w || 46, h: opts.h || 18, fill: opts.fill || 'glass', color: opts.color || '#7a3fd4', opacity: 0.9, size: 1 });
        return base;
    }

    /* ---------------- رابط الأوفرلي: التصميم من السيرفر ---------------- */

    var design = { v: null, inflight: false };

    function fetchDesign() {
        if (design.inflight) return;
        design.inflight = true;
        fetch(apiBase() + '/api/public/screen?k=' + encodeURIComponent(LINK_KEY) + (design.v != null ? '&v=' + design.v : ''))
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
        '.agp-so-tx.s-glass{background:linear-gradient(160deg,rgba(255,255,255,.18),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.3);padding:.15em .6em;border-radius:.6em;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);text-shadow:0 .04em .12em rgba(0,0,0,.5)}',
        '.agp-so-tx.s-neon{color:#fff !important;text-shadow:0 0 .04em #fff,0 0 .12em var(--agp-so-c),0 0 .3em var(--agp-so-c),0 0 .6em var(--agp-so-c)}',
        '.agp-so-tx.s-fire{color:#fff6d0 !important;text-shadow:0 0 .06em #fff,0 -.06em .15em #ffd54a,0 -.12em .3em #ff9800,0 -.2em .45em #ff3d00,0 -.3em .7em #b71c1c}',
        '.agp-so-tx.s-gradient{background:linear-gradient(180deg,#fff 10%,var(--agp-so-c) 90%);-webkit-background-clip:text;background-clip:text;color:transparent !important;filter:drop-shadow(0 .05em .08em rgba(0,0,0,.7))}',
        '.agp-so-tx.s-gold{background:linear-gradient(180deg,#fff7c9 0%,#ffd54a 40%,#c9871c 60%,#ffe58a 100%);-webkit-background-clip:text;background-clip:text;color:transparent !important;filter:drop-shadow(0 .05em .06em rgba(60,30,0,.9))}',
        '.agp-so-tx.s-rainbow{background:linear-gradient(90deg,#ff4d6d,#ffd54a,#7cff6b,#4dd8ff,#c58bff,#ff4d6d);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent !important;filter:drop-shadow(0 .05em .06em rgba(0,0,0,.8));animation:agp-so-rainbow 3s linear infinite}',
        '.agp-so-tx.s-3d{text-shadow:.02em .02em 0 rgba(0,0,0,.55),.04em .04em 0 rgba(0,0,0,.5),.06em .06em 0 rgba(0,0,0,.45),.08em .08em 0 rgba(0,0,0,.4),.1em .1em .12em rgba(0,0,0,.6)}',
        '.agp-so-tx.s-hollow{color:transparent !important;-webkit-text-stroke:.035em var(--agp-so-c);filter:drop-shadow(0 .03em .06em rgba(0,0,0,.8))}',
        '.agp-so-mv{display:inline-block}',
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
        '.agp-so-tcol.rk1{width:6.2em;margin-bottom:.55em}',
        '.agp-so-tname{margin-top:.95em;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:"Noto Kufi Arabic","IBM Plex Sans Arabic",system-ui,sans-serif;font-weight:700;font-size:.78em;line-height:1.5;color:#fff;letter-spacing:.01em;text-shadow:0 .06em .2em rgba(0,0,0,.9),0 0 .6em rgba(0,0,0,.45)}',
        '.agp-so-tcol.rk1 .agp-so-tname{font-size:.92em}',
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
        '.agp-so-throne.pal-single .agp-so-tcol{--rk:var(--agp-so-c)}',
        '.agp-so-tin{display:flex;flex-direction:column;align-items:center;animation:agp-so-tbob 4.4s ease-in-out infinite;animation-delay:calc(var(--d) * -6)}',
        '@keyframes agp-so-tbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.12em)}}',
        '.agp-so-tcol.t-enter{animation:agp-so-tenter .8s cubic-bezier(.2,1.3,.4,1) both;animation-delay:var(--d)}',
        '@keyframes agp-so-tenter{0%{opacity:0;transform:translateY(.8em) scale(.6)}100%{opacity:1;transform:none}}',
        '.agp-so-tcol.t-out{transition:transform .32s ease-in,opacity .32s ease-in,filter .32s ease-in;opacity:0}',
        '.agp-so-tcol.t-out-flip{transform:perspective(20em) rotateY(90deg) scale(.9)}',
        '.agp-so-tcol.t-out-fade{filter:blur(.2em)}',
        '.agp-so-tcol.t-out-slide{transform:translateX(1.4em)}',
        '.agp-so-tcol.t-out-zoom{transform:scale(.25)}',
        '.agp-so-tcol.t-out-drop{transform:translateY(1.2em)}',
        '.agp-so-tcol.t-out-spin{transform:rotate(200deg) scale(.3)}',
        '.agp-so-tcol.t-out-flash{transform:scale(1.25);filter:brightness(3) blur(.1em)}',
        '.agp-so-tcol.t-in{animation:.55s cubic-bezier(.2,1.2,.4,1) both}',
        '.agp-so-tcol.t-in-flip{animation-name:agp-so-tin-flip}',
        '.agp-so-tcol.t-in-fade{animation-name:agp-so-tin-fade;animation-timing-function:ease-out}',
        '.agp-so-tcol.t-in-slide{animation-name:agp-so-tin-slide}',
        '.agp-so-tcol.t-in-zoom{animation-name:agp-so-tin-zoom}',
        '.agp-so-tcol.t-in-drop{animation-name:agp-so-tin-drop;animation-duration:.7s}',
        '.agp-so-tcol.t-in-spin{animation-name:agp-so-tin-spin;animation-duration:.7s}',
        '.agp-so-tcol.t-in-flash{animation-name:agp-so-tin-flash;animation-timing-function:ease-out}',
        '@keyframes agp-so-tin-flip{0%{opacity:0;transform:perspective(20em) rotateY(-90deg) scale(.9)}100%{opacity:1;transform:none}}',
        '@keyframes agp-so-tin-fade{0%{opacity:0;filter:blur(.2em)}100%{opacity:1;filter:none}}',
        '@keyframes agp-so-tin-slide{0%{opacity:0;transform:translateX(-1.4em)}100%{opacity:1;transform:none}}',
        '@keyframes agp-so-tin-zoom{0%{opacity:0;transform:scale(.25)}100%{opacity:1;transform:none}}',
        '@keyframes agp-so-tin-drop{0%{opacity:0;transform:translateY(-1.6em)}60%{opacity:1;transform:translateY(.15em)}100%{transform:none}}',
        '@keyframes agp-so-tin-spin{0%{opacity:0;transform:rotate(-200deg) scale(.3)}100%{opacity:1;transform:none}}',
        '@keyframes agp-so-tin-flash{0%{opacity:0;filter:brightness(3) blur(.1em);transform:scale(1.25)}100%{opacity:1;filter:none;transform:none}}',
        '.agp-so-twait{margin-top:.4em}',
        '.agp-so-throne .agp-so-fart,.agp-so-throne .agp-so-fspk{filter:hue-rotate(var(--agp-so-fhue,0deg))}',
        '.agp-so-throne .agp-so-fcomet{filter:hue-rotate(var(--agp-so-fhue,0deg)) drop-shadow(0 0 .12em #9fe0ff)}',
        '.agp-so-throne .agp-so-fbf{filter:hue-rotate(var(--agp-so-fhue,0deg)) drop-shadow(0 0 .1em #8fd8ff) drop-shadow(0 0 .22em #3aa8ff)}',
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
        '.agp-so-astage{display:flex;justify-content:center}',
        '.agp-so-vbox{position:relative;flex:none}',
        '.agp-so-vbox video,.agp-so-vbox canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}',
        '.agp-so-vbox.keyed video{opacity:0}',
        '.agp-so-vbox.in{animation:agp-so-a-fade .35s ease both}',
        '.agp-so-vtxt{position:absolute;left:0;right:0;padding:0 .4em;text-align:center;direction:rtl;color:var(--agp-so-c,#fff);font-weight:800;font-size:1em;line-height:1.35;text-shadow:0 .06em .2em rgba(0,0,0,.9),0 0 .6em rgba(0,0,0,.55)}',
        '.agp-so-vtxt.top{top:4%}',
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
        '@keyframes agp-so-a-out{to{opacity:0;transform:scale(.85) translateY(.6em)}}'
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
        COLORS: COLORS, TOPS: TOPS, DESIGNS: DESIGNS, GOAL_DESIGNS: GOAL_DESIGNS, COUNTER_DESIGNS: COUNTER_DESIGNS,
        SECTIONS: SECTIONS, METRICS: METRICS, DEFAULT_FONT: DEFAULT_FONT,
        getState: function () { return state; },
        /** محرر الشاشات: الشاشة المفتوحة (ما تنحفظ هنا — المحرر يرفعها للسيرفر). */
        setState: function (s) {
            state = migrate(s) || Object.assign(defaults(), { template: 'pc', editOrient: 'l' });
            if (layer) render(); else { syncPolling(); syncJarPolling(); syncLink(); }
            return state;
        },
        VEYRO_DESIGNS: VEYRO_DESIGNS, FRAME_COLORS: FRAME_COLORS, THRONE_CYCLES: THRONE_CYCLES, THRONE_FX: THRONE_FX, refreshItem: refreshItem, throneDemo: throneDemo,
        ICON_SET: ICON_SET, EMOJIS: EMOJIS, ALERT_EVENTS: ALERT_EVENTS, ALERT_DESIGNS: ALERT_DESIGNS, ALERT_ANIMS: ALERT_ANIMS,
        SHAPES: SHAPES, SHAPE_FILLS: SHAPE_FILLS,
        /** أليرت الفيديو والتفريغ (Veyro). */
        KEY_DEFAULT: KEY_DEFAULT, keyOf: keyOf, isVideoAlert: isVideoAlert, videoFileUrl: videoFileUrl, makeKeyer: makeKeyer,
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
        stats: function () { return stats; },
        refreshStats: fetchStats,
        linkOk: linkOk, linkText: linkText,
        onStats: function (fn) { listeners.stats.push(fn); },
        onLink: function (fn) { listeners.link.push(fn); }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}());
