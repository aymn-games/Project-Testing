/**
 * AGP PLAYER CARD — shared player card (avatar + name [+ frame]) reused
 * across the lobby and any elimination/return-selection modal, instead of
 * each game building its own.
 *
 * Data always comes from the real TikTok account (avatarUrl/name from the
 * incoming comment payload — see tiktok-connector.js), never from the
 * platform profile, even if that account is also logged in.
 *
 * The frame renders only when opts.showFrame === true (lobby only, by
 * design — elimination/return modals always render frameless) and
 * player.frame is set (verified + linked TikTok account with an equipped
 * frame — see backend/collectibles/collectibles-service.js:
 * getEquippedFrameForVerifiedTikTok).
 *
 * FRAME_TEMPLATES below holds one independently pixel-measured entry per
 * frame image file (canvas dimensions differ file to file — square vs.
 * wide), not a shared constant: canvasW/canvasH, the vertical content
 * window (contentTop/contentHeight), and the avatar circle + name plate
 * position/size as percentages of that content window. Each entry's key
 * is the exact filename from DEFAULT_FRAME_CATALOG (backend/db/database.js)
 * — a key that doesn't match a registered filename silently falls back to
 * the founder template. `frame-level-3.png` is registered in the catalog
 * but the image file doesn't exist in the repo yet, so that level
 * currently shows the founder fallback frame.
 *
 * Any new frame file must be pixel-measured the same way before adding an
 * entry (copying another entry's numbers produces a broken layout) and
 * must be a true-alpha transparent PNG with an empty avatar circle and
 * empty name plate. Optional per-entry `textColor` (hex) overrides the
 * default white name text for frames with a light name plate.
 *
 * Requires js/agp-core.js only.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }

    var STYLE_ID = 'agp-pcard-styles';

    var AVATAR_SIZE_PX = 60;

    // Fixed height for lobby cards only (showFrame===true), covering both
    // framed and frameless cards so the two don't visually mismatch. 100px
    // fits 8 of 12 frames uncropped; the rest crop via the same
    // avatar+name-centered logic in computeLayout(). Doesn't affect
    // frameless card usage outside the lobby (e.g. elimination/return
    // modals keep their natural height).
    var LOBBY_CARD_HEIGHT_PX = 100;
    var PILL_WIDTH_RATIO = 210 / 65; // name-plate width ratio per avatar size
    var OVERLAP_RATIO = 0.22; // avatar overlaps the plate by 22% of its diameter
    function basicCardTotalWidth(avatarSize) {
        var pillW = Math.round(avatarSize * PILL_WIDTH_RATIO);
        var overlap = Math.round(avatarSize * OVERLAP_RATIO);
        return avatarSize + pillW - overlap;
    }

    // Key = exact frame image filename (player.frame.imageFilename).
    // avatar*/name* percentages are relative to the content window
    // (canvasW x contentHeight), not the full canvas.
    var FRAME_TEMPLATES = {
        'frame-founder.png': {
            canvasW: 1254, canvasH: 1254, contentTop: 254, contentHeight: 613,
            avatarLeftPct: 9.73, avatarTopPct: 33.12, avatarWidthPct: 24.24, avatarHeightPct: 51.71,
            nameLeftPct: 42.11, nameTopPct: 51.55, nameWidthPct: 47.13, nameHeightPct: 21.86
        },
        'frame-level-5.png': {
            canvasW: 1536, canvasH: 1024, contentTop: 160, contentHeight: 616,
            avatarLeftPct: 9.51, avatarTopPct: 21.75, avatarWidthPct: 22.66, avatarHeightPct: 56.17,
            nameLeftPct: 32.55, nameTopPct: 33.12, nameWidthPct: 65.36, nameHeightPct: 41.56,
            textColor: '#1c1c24' // light name plate — default white isn't legible
        },
        'frame-level-2.png': {
            canvasW: 1536, canvasH: 1024, contentTop: 175, contentHeight: 515,
            avatarLeftPct: 8.20, avatarTopPct: 19.03, avatarWidthPct: 22.33, avatarHeightPct: 61.94,
            nameLeftPct: 31.25, nameTopPct: 34.37, nameWidthPct: 65.17, nameHeightPct: 40.00,
            textColor: '#1c1c24' // light name plate — default white isn't legible
        },
        // [0.45.6] = "frame-level-1.png" (كان مسجَّلاً خطأً باسم "frame-blacksteel.png").
        'frame-level-1.png': {
            canvasW: 1254, canvasH: 1254, contentTop: 399, contentHeight: 410,
            avatarLeftPct: 7.66, avatarTopPct: 12.20, avatarWidthPct: 24.32, avatarHeightPct: 74.88,
            nameLeftPct: 32.70, nameTopPct: 26.83, nameWidthPct: 64.99, nameHeightPct: 58.78
        },
        // [0.45.6] = "frame-supporter.png" (كان مسجَّلاً خطأً باسم "frame-phoenix.png").
        'frame-supporter.png': {
            canvasW: 1254, canvasH: 1254, contentTop: 234, contentHeight: 687,
            avatarLeftPct: 12.68, avatarTopPct: 38.43, avatarWidthPct: 25.76, avatarHeightPct: 46.87,
            nameLeftPct: 46.25, nameTopPct: 53.28, nameWidthPct: 46.65, nameHeightPct: 21.83
        },
        // [0.45.6] = "frame-level-4.png" (كان مسجَّلاً خطأً باسم "frame-purple.png").
        'frame-level-4.png': {
            canvasW: 1536, canvasH: 1024, contentTop: 212, contentHeight: 536,
            avatarLeftPct: 8.33, avatarTopPct: 16.98, avatarWidthPct: 23.18, avatarHeightPct: 67.54,
            nameLeftPct: 31.90, nameTopPct: 34.51, nameWidthPct: 64.91, nameHeightPct: 39.74
        },
        // [0.45.6] = "frame-level-7.png" (كان مسجَّلاً خطأً باسم "frame-celestial.png").
        'frame-level-7.png': {
            canvasW: 1254, canvasH: 1254, contentTop: 391, contentHeight: 452,
            avatarLeftPct: 9.81, avatarTopPct: 23.67, avatarWidthPct: 19.14, avatarHeightPct: 51.99,
            nameLeftPct: 30.70, nameTopPct: 24.12, nameWidthPct: 64.99, nameHeightPct: 54.20,
            textColor: '#1c1c24' // لوحة الاسم فاتحة (سحاب وردي/بنفسجي فاتح) — أبيض افتراضي غير مقروء عليها
        },
        // [0.45.6] = "frame-level-6.png" (كان مسجَّلاً خطأً باسم "frame-crystalline.png").
        'frame-level-6.png': {
            canvasW: 1536, canvasH: 1024, contentTop: 172, contentHeight: 604,
            avatarLeftPct: 6.64, avatarTopPct: 18.87, avatarWidthPct: 22.79, avatarHeightPct: 58.94,
            nameLeftPct: 29.43, nameTopPct: 27.32, nameWidthPct: 65.62, nameHeightPct: 46.85
        },
        // [0.45.6] = "frame-distinguished.png" (كان مسجَّلاً خطأً باسم "frame-frozen.png").
        'frame-distinguished.png': {
            canvasW: 1254, canvasH: 1254, contentTop: 335, contentHeight: 465,
            avatarLeftPct: 9.97, avatarTopPct: 16.13, avatarWidthPct: 24.64, avatarHeightPct: 66.88,
            nameLeftPct: 34.29, nameTopPct: 33.76, nameWidthPct: 61.40, nameHeightPct: 46.24,
            textColor: '#1c1c24' // لوحة الاسم فاتحة (جليدي أبيض/أزرق فاتح جداً) — أبيض افتراضي غير مقروء عليها
        },
        // [0.45.6] إطار "استريمر" — مقاس فعلياً بالبكسل لأول مرة من نسخة PNG
        // شفافة حقيقية حصلت عليها هذا الإصدار (النسخة السابقة كانت JPEG بدون
        // شفافية، رُفضت). لوحة الاسم داكنة (كحلي/بنفسجي) فالأبيض الافتراضي
        // مقروء بدون حاجة textColor.
        'frame-streamer.png': {
            canvasW: 1536, canvasH: 1024, contentTop: 152, contentHeight: 628,
            avatarLeftPct: 8.14, avatarTopPct: 21.97, avatarWidthPct: 25.07, avatarHeightPct: 60.67,
            nameLeftPct: 43.95, nameTopPct: 41.40, nameWidthPct: 41.86, nameHeightPct: 27.39
        },
        // [0.66.1] إطار نادي الهلال "التاج والوشاح" — أول إطار من مجموعة
        // إطارات الأندية الجديدة (متجر خارجي، منح يدوي من admin-grant-frame.html).
        // مقاس فعلياً بالبكسل من ملف PNG شفاف حقيقي (2172×724، تحقّقت من
        // قناة الألفا). لوحة الاسم خلفيتها صورة استاد داكنة عموماً — الأبيض
        // الافتراضي مقروء بدون حاجة textColor (بطلب صريح: كل إطارات الهلال
        // تستخدم الأبيض).
        'frame-club-hilal-crown.png': {
            canvasW: 2172, canvasH: 724, contentTop: 183, contentHeight: 416,
            avatarLeftPct: 10.54, avatarTopPct: 2.40, avatarWidthPct: 18.46, avatarHeightPct: 95.19,
            nameLeftPct: 36.83, nameTopPct: 25.72, nameWidthPct: 55.71, nameHeightPct: 66.11
        },
        // [0.66.1] إطار نادي الهلال "أفق الرياض" (وشاح ونخلة وبرج المملكة) —
        // نفس مجموعة إطارات الأندية أعلاه، نفس منهجية القياس ولون النص
        // الأبيض الافتراضي.
        'frame-club-hilal-city.png': {
            canvasW: 2172, canvasH: 724, contentTop: 184, contentHeight: 422,
            avatarLeftPct: 11.00, avatarTopPct: 2.37, avatarWidthPct: 19.06, avatarHeightPct: 95.26,
            nameLeftPct: 34.30, nameTopPct: 39.34, nameWidthPct: 49.95, nameHeightPct: 55.69
        },
        // [0.66.2] إطار نادي الهلال "الكأس والملعب" — نفس مجموعة إطارات
        // الأندية، قياس من أعلى بكسل فعلي غير شفاف (مو حافة دائرة الصورة)
        // بعد تصحيح المنهجية. أبيض افتراضي (خلفية داكنة).
        'frame-club-hilal-trophy.png': {
            canvasW: 2172, canvasH: 724, contentTop: 10, contentHeight: 595,
            avatarLeftPct: 11.14, avatarTopPct: 25.55, avatarWidthPct: 20.81, avatarHeightPct: 73.45,
            nameLeftPct: 33.15, nameTopPct: 44.54, nameWidthPct: 55.02, nameHeightPct: 54.29
        },
        // [0.66.2] إطار نادي الهلال "النجوم" — نفس المجموعة، أبيض افتراضي.
        'frame-club-hilal-stars.png': {
            canvasW: 2172, canvasH: 724, contentTop: 25, contentHeight: 575,
            avatarLeftPct: 10.04, avatarTopPct: 22.78, avatarWidthPct: 20.17, avatarHeightPct: 75.83,
            nameLeftPct: 37.06, nameTopPct: 38.26, nameWidthPct: 49.72, nameHeightPct: 60.87
        },
        // [0.66.2] إطار نادي النصر "التاج الملكي" — خلفية اللوح صفراء/ذهبية،
        // الاسم أزرق (مو أبيض) بطلب صريح — نفس كل إطارات النصر.
        'frame-club-nassr-crown.png': {
            canvasW: 2172, canvasH: 724, contentTop: 6, contentHeight: 594,
            avatarLeftPct: 9.21, avatarTopPct: 33.50, avatarWidthPct: 18.55, avatarHeightPct: 65.15,
            nameLeftPct: 40.06, nameTopPct: 46.97, nameWidthPct: 51.33, nameHeightPct: 49.66,
            textColor: '#0a1a5c'
        },
        // [0.66.2] إطار نادي النصر "النسر الملكي" — نفس ملاحظة اللون أعلاه.
        'frame-club-nassr-eagle.png': {
            canvasW: 2172, canvasH: 724, contentTop: 5, contentHeight: 585,
            avatarLeftPct: 10.31, avatarTopPct: 34.53, avatarWidthPct: 17.86, avatarHeightPct: 64.10,
            nameLeftPct: 40.52, nameTopPct: 57.26, nameWidthPct: 47.88, nameHeightPct: 41.88,
            textColor: '#0a1a5c'
        },
        // [0.66.2] إطار نادي النصر "أفق الرياض" — ⚠️ مقاس الكانفاس مختلف
        // شوي (2156×729 بدل 2172×724) عن باقي دفعة النصر/الهلال، بيّنت
        // هذا لصاحب المشروع وقت القياس الأول. نفس ملاحظة اللون الأزرق.
        'frame-club-nassr-palm.png': {
            canvasW: 2156, canvasH: 729, contentTop: 12, contentHeight: 578,
            avatarLeftPct: 8.91, avatarTopPct: 29.41, avatarWidthPct: 18.55, avatarHeightPct: 66.27,
            nameLeftPct: 38.50, nameTopPct: 47.23, nameWidthPct: 52.18, nameHeightPct: 51.90,
            textColor: '#0a1a5c'
        },
        // [0.66.3] إطار نادي الاتحاد "التاج والنمر" — قياس من أعلى بكسل
        // فعلي غير شفاف. خلفية اللوح ذهبية/صفراء — الاسم أسود (هوية النادي
        // أسود+ذهبي) بطلب صريح، مو أبيض ولا أزرق.
        'frame-club-ittihad-crown.png': {
            canvasW: 2157, canvasH: 729, contentTop: 12, contentHeight: 601,
            avatarLeftPct: 6.54, avatarTopPct: 32.11, avatarWidthPct: 19.75, avatarHeightPct: 65.72,
            nameLeftPct: 37.55, nameTopPct: 45.42, nameWidthPct: 54.24, nameHeightPct: 53.74,
            textColor: '#161208'
        },
        // [0.66.3] إطار نادي الاتحاد "النمر" — ⚠️ اللوح فيه كلمة "ITTIHAD"
        // مرسومة ثابتة داخل نفس منطقة الاسم (مو زخرفة منفصلة) — بموافقة
        // صريحة من صاحب المشروع، اسم اللاعب يُكتب فوقها كما هي. أبيض
        // (بطلبه، مختلف عن إطار الاتحاد الأول اللي لونه أسود).
        'frame-club-ittihad-tiger.png': {
            canvasW: 2158, canvasH: 729, contentTop: 14, contentHeight: 589,
            avatarLeftPct: 7.41, avatarTopPct: 32.94, avatarWidthPct: 19.79, avatarHeightPct: 64.01,
            nameLeftPct: 39.16, nameTopPct: 44.31, nameWidthPct: 53.99, nameHeightPct: 54.84
        },
        // [0.66.4] إطار "بنات" — القطة الوردية. لوح فاضٍ تماماً من أي نص
        // (سليم). ⚠️ خلفية اللوح زهري فاتح — الأبيض ضعيف التباين عليها،
        // بس أُبقي أبيض بطلب صريح من صاحب المشروع رغم التنبيه.
        'frame-girls-kitty.png': {
            canvasW: 2103, canvasH: 748, contentTop: 14, contentHeight: 556,
            avatarLeftPct: 9.80, avatarTopPct: 22.66, avatarWidthPct: 20.21, avatarHeightPct: 74.46,
            nameLeftPct: 37.09, nameTopPct: 51.44, nameWidthPct: 45.17, nameHeightPct: 47.66
        },
        // [0.66.4] إطار "بنات" — الفراشة الوردية. لوح رخامي فاضٍ من أي نص.
        // ⚠️ خلفية فاتحة (نفس ملاحظة إطار القطة) — أبيض بطلب صريح رغم
        // ضعف التباين النسبي.
        // [0.66.5] إطار "دول خليجية والسعودية" — الصقر والهلال. لوح رخامي
        // فاضٍ من أي نص. خلفية فاتحة (كريمي) — أخضر غامق بطلب صريح (هوية
        // العلم السعودي)، مو أبيض.
        'frame-country-ksa-falcon.png': {
            canvasW: 2089, canvasH: 753, contentTop: 38, contentHeight: 550,
            avatarLeftPct: 10.77, avatarTopPct: 25.27, avatarWidthPct: 20.68, avatarHeightPct: 73.82,
            nameLeftPct: 39.01, nameTopPct: 60.36, nameWidthPct: 47.87, nameHeightPct: 31.82,
            textColor: '#0a3d1f'
        },
        // [0.66.5] إطار "دول خليجية والسعودية" — الدلة والتمر. لوح رخام
        // داكن فاضٍ من أي نص. خلفية داكنة — أبيض افتراضي مقروء بدون تعديل.
        // [0.66.6] إطار "عام" — الاستاد الذهبي (تولّده ChatGPT حسب السكربت
        // المعتمد). لوح فاضٍ من نص، خلفية متدرجة (سماء داكنة فوق/عشب فاتح
        // تحت) — أبيض افتراضي (لم يتأكد لون بديل).
        'frame-general-stadium.png': {
            canvasW: 2172, canvasH: 724, contentTop: 14, contentHeight: 571,
            avatarLeftPct: 10.45, avatarTopPct: 35.73, avatarWidthPct: 15.93, avatarHeightPct: 59.90,
            nameLeftPct: 38.21, nameTopPct: 40.98, nameWidthPct: 53.87, nameHeightPct: 58.15
        },
        // [0.66.6] إطار "نادرة" — تنين النار (ChatGPT). ⚠️ فتحة الصورة
        // أصغر من المعتاد (~310px بدل ~400px). لوح داكن فاضٍ من نص، أبيض
        // مقروء افتراضياً.
        'frame-rare-dragon.png': {
            canvasW: 2076, canvasH: 758, contentTop: 78, contentHeight: 476,
            avatarLeftPct: 6.98, avatarTopPct: 34.24, avatarWidthPct: 15.08, avatarHeightPct: 64.71,
            nameLeftPct: 36.61, nameTopPct: 38.24, nameWidthPct: 52.02, nameHeightPct: 54.62
        },
        // [0.66.6] إطار "بنات" — التاج والورد (ChatGPT). لوح وردي غامق
        // (مو فاتح) فاضٍ من نص — أبيض مقروء بدون تعديل.
        'frame-girls-crown-rose.png': {
            canvasW: 2112, canvasH: 744, contentTop: 0, contentHeight: 597,
            avatarLeftPct: 7.86, avatarTopPct: 36.68, avatarWidthPct: 17.80, avatarHeightPct: 62.48,
            nameLeftPct: 35.51, nameTopPct: 51.09, nameWidthPct: 53.50, nameHeightPct: 41.88
        },
        // [0.66.6] إطار نادي الهلال "العلم والمدينة" (ChatGPT) — ⚠️ التصميم
        // بدون حد معدني واضح يفصل اللوح عن العلم (بخلاف تصاميم الاستوديو
        // الاحترافية)، فحدود اللوح هنا مبنية على تقدير بصري لتفادي كلمة
        // ALHILAL المرسومة على العلم (تقريباً x1830-2000), تأكد بعد الرفع.
        // [0.66.6] إطار نادي الهلال "الذئب الملحمي" (ChatGPT). ⚠️ نفس
        // ملاحظة الإطار قبله — بدون حد معدني واضح، حدود اللوح بتقدير بصري.
        // كلمة ALHILAL موجودة مرتين (العلم يمين، ونسخة صغيرة يسار قرب حافة
        // دائرة الصورة) — برّا لوح الاسم، ما تتعارض مع اسم اللاعب.
        // [0.66.7] إطار نادي الأهلي "جوهرة جدة" — لوح داكن فيه شعار
        // نخلة+سيوف كزخرفة خلفية (مو نص)، فاضٍ من أي حروف. أبيض متمركز
        // افتراضياً بدون أي تعديل (نفس كل الإطارات).
        'frame-club-ahli-jawahara.png': {
            canvasW: 2172, canvasH: 724, contentTop: 12, contentHeight: 583,
            avatarLeftPct: 9.16, avatarTopPct: 24.53, avatarWidthPct: 19.94, avatarHeightPct: 71.70,
            nameLeftPct: 32.92, nameTopPct: 52.83, nameWidthPct: 50.41, nameHeightPct: 46.31
        },
        'frame-club-hilal-wolf.png': {
            canvasW: 2172, canvasH: 724, contentTop: 37, contentHeight: 555,
            avatarLeftPct: 4.88, avatarTopPct: 39.64, avatarWidthPct: 16.39, avatarHeightPct: 59.46,
            nameLeftPct: 32.23, nameTopPct: 49.19, nameWidthPct: 55.25, nameHeightPct: 47.75
        },
        'frame-club-hilal-flag.png': {
            canvasW: 2172, canvasH: 724, contentTop: 36, contentHeight: 549,
            avatarLeftPct: 7.04, avatarTopPct: 33.88, avatarWidthPct: 16.80, avatarHeightPct: 64.12,
            nameLeftPct: 32.23, nameTopPct: 42.62, nameWidthPct: 50.65, nameHeightPct: 56.47
        },
        'frame-country-ksa-dallah.png': {
            canvasW: 2103, canvasH: 748, contentTop: 2, contentHeight: 613,
            avatarLeftPct: 8.37, avatarTopPct: 28.55, avatarWidthPct: 20.78, avatarHeightPct: 70.64,
            nameLeftPct: 36.62, nameTopPct: 71.13, nameWidthPct: 54.21, nameHeightPct: 25.61
        },
        'frame-girls-butterfly.png': {
            canvasW: 2089, canvasH: 753, contentTop: 0, contentHeight: 580,
            avatarLeftPct: 12.59, avatarTopPct: 27.59, avatarWidthPct: 20.20, avatarHeightPct: 71.55,
            nameLeftPct: 38.30, nameTopPct: 56.55, nameWidthPct: 49.31, nameHeightPct: 33.45
        },
        // [0.45.1] إطار "الأهلي" — مقاس فعلياً بالبكسل من الملف المرفوع (1536×1024،
        // فتحة صورة دائرية شفافة حقيقية يسار + بلاطة اسم بيضاء فاضية يمين، نفس
        // منهجية القياس المتبعة لكل الإطارات أعلاه — تحقّق بصري بصندوقين قبل الاعتماد).
        // [0.45.5] لون الاسم: أخضر نادي الأهلي (مسحوب فعلياً بالبكسل من شعار
        // النادي داخل الصورة نفسها = #046D38) بطلب صريح من صاحب المشروع —
        // القياسات الهندسية (المواقع/الأحجام) ما تغيّرت، كانت صحيحة أصلاً.
        // [0.45.7] إطار "من البداية" — إطار حصري (custom_frames، مو كتالوج
        // ثابت) يُمنح تلقائياً لكل حساب جديد يسجّل خلال فترة محدودة، راجع
        // backend/auth/auth-service.js (grantFoundersMonthFrameIfEligible)
        // وdocs/CHANGELOG.md. مقاس فعلياً بالبكسل من ملف PNG شفاف حقيقي
        // (تحقّقت بفحص قناة الألفا مباشرة أن الخلفية الخارجية وفتحة الصورة
        // كلتيهما شفافة فعلياً، لا لطخة بيضاء) — نفس منهجية كل الإطارات
        // أعلاه بالضبط. لوحة الاسم داكنة جداً (سطوع ~24)، الأبيض الافتراضي
        // مقروء بدون حاجة لـtextColor.
        'frame-founders-month.png': {
            canvasW: 1080, canvasH: 1080, contentTop: 364, contentHeight: 345,
            avatarLeftPct: 6.48, avatarTopPct: 17.39, avatarWidthPct: 19.81, avatarHeightPct: 61.45,
            nameLeftPct: 38.89, nameTopPct: 28.41, nameWidthPct: 33.33, nameHeightPct: 37.68
        },
        'frame-al-ahli.png': {
            canvasW: 1536, canvasH: 1024, contentTop: 257, contentHeight: 464,
            avatarLeftPct: 6.05, avatarTopPct: 15.52, avatarWidthPct: 20.64, avatarHeightPct: 65.95,
            nameLeftPct: 33.59, nameTopPct: 28.88, nameWidthPct: 38.35, nameHeightPct: 49.57,
            textColor: '#046D38'
        }
    };
    var DEFAULT_TEMPLATE_KEY = 'frame-founder.png'; // fallback for an unregistered frame filename

    function getTemplate(imageFilename) {
        return FRAME_TEMPLATES[imageFilename] || FRAME_TEMPLATES[DEFAULT_TEMPLATE_KEY];
    }

    function el(id) { return document.getElementById(id); }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function initials(name) {
        var clean = (name || '').trim();
        if (!clean) return '?';
        return clean.slice(0, 2).toUpperCase();
    }

    function injectStyles() {
        if (el(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            /* ---- البطاقة الأساسية (بدون إطار) — لوبي-قياسي-v1 ---- */
            '.agp-pcard{display:inline-flex;align-items:center;',
            'font-family:Cairo,sans-serif;direction:rtl;vertical-align:middle;}',
            '.agp-pcard--out{opacity:0.45;text-decoration:line-through;}',

            '.agp-pcard-avatar-basic{border-radius:50%;flex-shrink:0;position:relative;z-index:2;',
            'object-fit:cover;border:3px solid rgba(255,255,255,0.55);background:#5a2585;}',
            '.agp-pcard-avatar-basic--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#f3eefc;font-weight:800;}',

            '.agp-pcard-name-basic{display:flex;align-items:center;justify-content:flex-start;',
            'box-sizing:border-box;font-weight:700;color:#f3eefc;background:rgba(255,255,255,0.1);',
            'border:1px solid rgba(216,120,255,0.32);border-radius:999px;position:relative;z-index:1;',
            'overflow:hidden;}',
            /* The marquee transform applies only to .agp-pcard-name-inner,
             * never to .agp-pcard-name-basic itself — overflow:hidden on a
             * transformed element doesn't clip its own transform, only its
             * children's, so transforming the plate would move the whole
             * card visually and overlap its neighbors. See fitAllNames(). */
            '.agp-pcard-name-inner{display:inline-block;white-space:nowrap;}',
            '@keyframes agpPcardSlide{0%,15%{transform:translateX(0);}45%,55%{transform:translateX(var(--pcard-slide-dist));}85%,100%{transform:translateX(0);}}',
            '.agp-pcard-name-inner.agp-pcard-marquee{animation:agpPcardSlide 4.5s ease-in-out infinite;}',

            /* Framed card: height is fixed (matches the frameless card's
             * height), width varies per frame's design — see
             * computeLayout/renderFramedHtml below. */
            '.agp-pcard-tpl{display:inline-block;position:relative;',
            'overflow:hidden;flex-shrink:0;vertical-align:middle;}',
            '.agp-pcard-tpl-avatar{position:absolute;border-radius:50%;',
            'object-fit:cover;background:#5a2585;z-index:1;}',
            '.agp-pcard-tpl-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#f3eefc;font-weight:800;font-size:0.75em;}',
            '.agp-pcard-tpl-frame-img{position:absolute;left:0;',
            'background-repeat:no-repeat;background-position:0 0;',
            'z-index:2;pointer-events:none;}',
            '.agp-pcard-tpl-name{position:absolute;z-index:3;',
            'display:flex;align-items:center;justify-content:center;overflow:hidden;',
            'font-weight:800;color:#fff;text-align:center;line-height:1.1;',
            'text-shadow:0 1px 2px rgba(0,0,0,.6);box-sizing:border-box;}',

            /* Shared "winner/trophy" card — see AGP.playerCard.renderTrophyCard
             * below. Design: design_handoff_winner_card (Winner Card.dc.html,
             * gold/dark reference palette) — adopted as the fixed base for
             * every game's end-of-match card(s). Colors are CSS custom
             * properties on .agp-trophy-wrap so a game can retheme to its
             * own identity by scoping a rule at opts.cls, e.g.
             * ".fr-trophy-winner{--agp-trophy-accent:#ff8a3d;...}" —
             * without touching this shared file. No box/panel behind it by
             * design (transparent — the calling game supplies its own dim/
             * blurred backdrop); this is just the card + crown themselves. */
            '.agp-trophy-wrap{position:relative;width:200px;display:flex;flex-direction:column;',
            'align-items:center;',
            '--agp-trophy-accent:#F3C05E;--agp-trophy-accent-dark:#B9821F;',
            '--agp-trophy-border:rgba(243,192,94,.55);',
            '--agp-trophy-divider:rgba(243,192,94,.25);--agp-trophy-label:rgba(243,192,94,.75);',
            '--agp-trophy-bg1:rgba(28,22,14,.72);--agp-trophy-bg2:rgba(18,14,10,.82);',
            '--agp-trophy-text:#FBF6EC;}',

            '.agp-trophy-crown{position:absolute;top:4px;left:50%;transform:translateX(calc(-50% - 12px));',
            'z-index:3;animation:agpTrophyCrownDrop .6s cubic-bezier(.2,1.4,.4,1) .15s both;',
            'filter:drop-shadow(0 3px 4px rgba(0,0,0,.35));}',
            '.agp-trophy-crown svg{display:block;}',
            '@keyframes agpTrophyCrownDrop{0%{opacity:0;transform:translateX(calc(-50% - 12px)) translateY(-14px) rotate(-6deg);}',
            '60%{opacity:1;}100%{opacity:1;transform:translateX(calc(-50% - 12px)) translateY(0) rotate(0deg);}}',

            '.agp-trophy-card{position:relative;width:200px;height:300px;margin-top:36px;',
            'box-sizing:border-box;border-radius:22px;overflow:hidden;',
            'background:linear-gradient(165deg,var(--agp-trophy-bg1) 0%,var(--agp-trophy-bg2) 100%);',
            'border:1.5px solid var(--agp-trophy-border);',
            'box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.04);',
            'backdrop-filter:blur(2px);animation:agpTrophyCardPop .45s cubic-bezier(.2,1,.3,1) both;}',
            '@keyframes agpTrophyCardPop{0%{opacity:0;transform:scale(.85) translateY(10px);}',
            '100%{opacity:1;transform:scale(1) translateY(0);}}',

            '.agp-trophy-shine{position:absolute;top:0;left:0;width:60%;height:100%;',
            'background:linear-gradient(75deg,transparent 40%,rgba(255,255,255,.12) 50%,transparent 60%);',
            'animation:agpTrophyShine 2.6s ease-in-out .6s infinite;pointer-events:none;}',
            '@keyframes agpTrophyShine{0%{transform:translateX(-140%) rotate(20deg);}',
            '100%{transform:translateX(240%) rotate(20deg);}}',

            '.agp-trophy-content{position:relative;z-index:2;display:flex;flex-direction:column;',
            'align-items:center;height:100%;padding:18px 14px 16px;box-sizing:border-box;}',

            '.agp-trophy-label{font-size:15px;letter-spacing:3px;color:var(--agp-trophy-accent);',
            'font-weight:800;margin-bottom:12px;font-family:"Bebas Neue",Cairo,sans-serif;}',

            '.agp-trophy-ring-wrap{width:84px;height:84px;border-radius:50%;overflow:hidden;',
            'border:2.5px solid var(--agp-trophy-accent);box-shadow:0 4px 10px rgba(0,0,0,.4);flex-shrink:0;}',
            '.agp-trophy-ring-avatar{width:100%;height:100%;border-radius:50%;object-fit:cover;',
            'background:#5a2585;display:block;}',
            '.agp-trophy-ring-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1.4em;}',

            '.agp-trophy-name{margin-top:12px;font-size:17px;font-weight:800;color:var(--agp-trophy-text);',
            'text-align:center;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;',
            'white-space:nowrap;}',
            '.agp-trophy-extra{color:var(--agp-trophy-label);font-size:0.8em;margin-top:4px;}',

            '.agp-trophy-points-wrap{margin-top:auto;width:100%;text-align:center;padding-top:10px;',
            'border-top:1px solid var(--agp-trophy-divider);}',
            '.agp-trophy-points{font-size:0.8em;line-height:1.4;text-align:center;color:var(--agp-trophy-label);}',
            '.agp-trophy-points.agp-points-earned{color:var(--agp-trophy-accent);font-weight:800;',
            'font-family:"Bebas Neue",Cairo,sans-serif;font-size:2em;letter-spacing:1px;',
            'text-shadow:0 2px 6px rgba(0,0,0,.4);}',
            '.agp-trophy-points .agp-points-sub{display:block;color:var(--agp-trophy-label);',
            'font-weight:500;font-size:0.4em;letter-spacing:0;margin-top:4px;font-family:Cairo,sans-serif;}',
            '.agp-trophy-points.agp-points-noaccount{color:var(--agp-trophy-label);font-size:0.75em;',
            'font-family:Cairo,sans-serif;}'
        ].join('');
        document.head.appendChild(style);

        if (!el('agp-pcard-fonts')) {
            var fontLink = document.createElement('link');
            fontLink.id = 'agp-pcard-fonts';
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap';
            document.head.appendChild(fontLink);
        }
    }

    /**
     * Computes pixel layout for a given frame template so every card ends
     * up the exact same width AND height (targetWidthPx/targetHeightPx)
     * regardless of the frame's own aspect ratio. Scales the frame image
     * by width, then crops a targetHeightPx-tall window out of the
     * (usually taller) natural result, centered on the avatar+name
     * region specifically — never on the avatar or name themselves, only
     * on the frame's excess decoration. Any new frame added to
     * FRAME_TEMPLATES needs to be checked that its avatar+name region
     * actually fits within targetHeightPx.
     * @param {Object} tpl - a FRAME_TEMPLATES entry
     * @returns {Object} pixel layout ready for inline styles
     */
    function computeLayout(tpl, targetWidthPx, targetHeightPx) {
        var scale = targetWidthPx / tpl.canvasW;
        var naturalContentHeightPx = tpl.contentHeight * scale;
        var frameImgWidthPx = targetWidthPx;
        var frameImgHeightPx = Math.round(tpl.canvasH * scale * 100) / 100;

        // Avatar+name extent (px) within the natural content window, pre-crop
        var avatarTopPx = tpl.avatarTopPct / 100 * naturalContentHeightPx;
        var avatarBottomPx = avatarTopPx + tpl.avatarHeightPct / 100 * naturalContentHeightPx;
        var nameTopPx = tpl.nameTopPct / 100 * naturalContentHeightPx;
        var nameBottomPx = nameTopPx + tpl.nameHeightPct / 100 * naturalContentHeightPx;
        var contentMinY = Math.min(avatarTopPx, nameTopPx);
        var contentMaxY = Math.max(avatarBottomPx, nameBottomPx);
        var contentCenterY = (contentMinY + contentMaxY) / 2;

        // Crop window centered on the avatar+name region, clamped to the
        // natural content window's bounds.
        var maxCropTop = Math.max(0, naturalContentHeightPx - targetHeightPx);
        var cropTop = contentCenterY - targetHeightPx / 2;
        if (cropTop < 0) cropTop = 0;
        if (cropTop > maxCropTop) cropTop = maxCropTop;

        var frameTopOffsetPx = Math.round((-(tpl.contentTop * scale) - cropTop) * 100) / 100;

        return {
            cardWidthPx: targetWidthPx,
            cardHeightPx: targetHeightPx,
            frameImgWidthPx: frameImgWidthPx,
            frameImgHeightPx: frameImgHeightPx,
            frameTopOffsetPx: frameTopOffsetPx,
            // Explicit px (not %) since % would be relative to the pre-crop
            // content window, which no longer matches the cropped wrapper.
            avatarTopPx: Math.round((avatarTopPx - cropTop) * 100) / 100,
            avatarHeightPx: Math.round((tpl.avatarHeightPct / 100 * naturalContentHeightPx) * 100) / 100,
            nameTopPx: Math.round((nameTopPx - cropTop) * 100) / 100,
            nameHeightPx: Math.round((tpl.nameHeightPct / 100 * naturalContentHeightPx) * 100) / 100
        };
    }

    /** Frameless card (avatar + name) — used when showFrame is off or the
     * player has no equipped frame. */
    function renderBasicHtml(player, opts) {
        var name = (player && player.name) || (player && player.id) || '—';
        var avatarUrl = player && player.avatarUrl;
        var h = (opts && opts.size) || AVATAR_SIZE_PX;
        var pillW = Math.round(h * PILL_WIDTH_RATIO);
        var overlap = Math.round(h * OVERLAP_RATIO);
        var padStart = Math.round(h * 0.3) + overlap;
        var padEnd = Math.round(h * 0.3);
        var avStyle = 'width:' + h + 'px;height:' + h + 'px;';
        var fbStyle = avStyle + 'font-size:' + Math.round(h * 0.32) + 'px;';
        var avatarHtml = avatarUrl
            ? '<img class="agp-pcard-avatar-basic" style="' + avStyle + '" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;agp-pcard-avatar-basic agp-pcard-avatar-basic--fallback&quot; style=&quot;' + fbStyle + '&quot;>' + escapeHtml(initials(name)) + '</div>\';">'
            : '<div class="agp-pcard-avatar-basic agp-pcard-avatar-basic--fallback" style="' + fbStyle + '">' + escapeHtml(initials(name)) + '</div>';
        var pillStyle = 'width:' + pillW + 'px;height:' + Math.round(h * 52 / 65) + 'px;' +
            'margin-inline-start:-' + overlap + 'px;padding-inline-start:' + padStart + 'px;' +
            'padding-inline-end:' + padEnd + 'px;font-size:' + Math.max(11, Math.round(h * 30 / 65)) + 'px;';
        // In lobby context (showFrame:true), fix the outer height to match
        // framed cards, relying on .agp-pcard's align-items:center to
        // vertically center the content within it.
        var outerStyle = (opts && opts.showFrame) ? ' style="height:' + LOBBY_CARD_HEIGHT_PX + 'px"' : '';

        return '<span class="agp-pcard' + (opts && opts.outClass ? ' ' + opts.outClass : '') + '"' + outerStyle + '>' +
            avatarHtml +
            '<span class="agp-pcard-name-basic" style="' + pillStyle + '" data-agp-pcard-name="1">' +
            '<span class="agp-pcard-name-inner">' + escapeHtml(name) + '</span>' +
            '</span>' +
            '</span>';
    }

    /** Framed card — a cropped single canvas (frame image behind, name on
     * top), sized per FRAME_TEMPLATES. Used only when showFrame is true
     * and player.frame is set. */
    function renderFramedHtml(player, opts) {
        var name = (player && player.name) || (player && player.id) || '—';
        var avatarUrl = player && player.avatarUrl;
        var basePath = (opts && opts.basePath) || '';
        var imageFilename = player.frame.imageFilename;
        var frameSrc = basePath + imageFilename;

        var tpl = getTemplate(imageFilename);
        var h = (opts && opts.size) || AVATAR_SIZE_PX;
        // Width matches the frameless card's width; height is fixed at
        // LOBBY_CARD_HEIGHT_PX regardless of h, so every card (framed or
        // not, any frame) ends up the same size — see computeLayout().
        var targetWidthPx = basicCardTotalWidth(h);
        var targetHeightPx = LOBBY_CARD_HEIGHT_PX;
        var layout = computeLayout(tpl, targetWidthPx, targetHeightPx);

        var wrapStyle = 'width:' + layout.cardWidthPx + 'px;height:' + layout.cardHeightPx + 'px';
        // top/height are explicit px post-crop (see computeLayout);
        // left/width stay % since width is never cropped.
        var avatarStyle = 'left:' + tpl.avatarLeftPct + '%;top:' + layout.avatarTopPx + 'px;' +
            'width:' + tpl.avatarWidthPct + '%;height:' + layout.avatarHeightPx + 'px;';
        var frameImgStyle = 'top:' + layout.frameTopOffsetPx + 'px;' +
            'width:' + layout.frameImgWidthPx + 'px;height:' + layout.frameImgHeightPx + 'px;' +
            'background-size:' + layout.frameImgWidthPx + 'px ' + layout.frameImgHeightPx + 'px;' +
            'background-image:url(' + escapeHtml(frameSrc) + ')';
        var nameStyle = 'left:' + tpl.nameLeftPct + '%;top:' + layout.nameTopPx + 'px;' +
            'width:' + tpl.nameWidthPct + '%;height:' + layout.nameHeightPx + 'px;' +
            (tpl.textColor ? 'color:' + tpl.textColor + ';' : '');

        var avatarHtml = avatarUrl
            ? '<img class="agp-pcard-tpl-avatar" style="' + avatarStyle + '" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;agp-pcard-tpl-avatar agp-pcard-tpl-avatar--fallback&quot; style=&quot;' + avatarStyle + '&quot;>' + escapeHtml(initials(name)) + '</div>\';">'
            : '<div class="agp-pcard-tpl-avatar agp-pcard-tpl-avatar--fallback" style="' + avatarStyle + '">' + escapeHtml(initials(name)) + '</div>';

        return '<span class="agp-pcard-tpl' + (opts && opts.outClass ? ' ' + opts.outClass : '') + '" style="' + wrapStyle + '">' +
            avatarHtml +
            '<span class="agp-pcard-tpl-frame-img" style="' + frameImgStyle + '"></span>' +
            '<span class="agp-pcard-tpl-name" data-agp-pcard-name="1" style="' + nameStyle + '">' +
            '<span class="agp-pcard-name-inner">' + escapeHtml(name) + '</span>' +
            '</span>' +
            '</span>';
    }

    /** Plain circular avatar (no name) for inside a trophy card's photo
     * circle — deliberately independent of renderBasicHtml/renderFramedHtml
     * above. */
    function trophyRingAvatarHtml(player) {
        var name = (player && (player.name || player.id)) || '—';
        var avatarUrl = player && player.avatarUrl;
        var initialsText = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        return avatarUrl
            ? '<img class="agp-trophy-ring-avatar" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;agp-trophy-ring-avatar agp-trophy-ring-avatar--fallback&quot;>' + escapeHtml(initialsText) + '</div>\';">'
            : '<div class="agp-trophy-ring-avatar agp-trophy-ring-avatar--fallback">' + escapeHtml(initialsText) + '</div>';
    }

    // Inline crown SVG for renderTrophyCard's opts.showCrown — fill/stroke
    // reference the CSS custom properties set on .agp-trophy-wrap, so a
    // game retheming --agp-trophy-accent (via opts.cls) recolors this too
    // without needing its own crown asset. Matches design_handoff_winner_card
    // (Winner Card.dc.html) pixel-for-pixel.
    var TROPHY_CROWN_SVG = '<svg width="60" height="40" viewBox="0 0 60 40" ' +
        'style="fill:var(--agp-trophy-accent);stroke:var(--agp-trophy-accent-dark);stroke-linejoin:round;">' +
        '<polygon points="6,36 4,15 15,25 30,5 45,25 56,15 54,36" stroke-width="1.5"></polygon>' +
        '<circle cx="6" cy="13" r="4" stroke-width="1.5"></circle>' +
        '<circle cx="30" cy="4" r="4.5" stroke-width="1.5"></circle>' +
        '<circle cx="54" cy="13" r="4" stroke-width="1.5"></circle>' +
        '<rect x="6" y="32" width="48" height="6" rx="1.5" stroke-width="1.5"></rect>' +
        '</svg>';

    AGP.playerCard = {

        /**
         * @param {Object} player - { id, name, avatarUrl?, frame? }
         * @param {Object} [opts]
         * @param {boolean} [opts.showFrame=false]
         * @param {string}  [opts.basePath=''] - relative prefix for the frame image path
         * @param {string}  [opts.outClass]
         * @returns {string} HTML for one card
         */
        renderHtml: function (player, opts) {
            injectStyles();
            opts = opts || {};
            if (opts.showFrame && player && player.frame && player.frame.imageFilename) {
                return renderFramedHtml(player, opts);
            }
            return renderBasicHtml(player, opts);
        },

        /**
         * Marquee-scrolls any name that overflows its fixed-width plate.
         * Must be called after the HTML is actually in the DOM (needs
         * layout to measure overflow). The transform is applied only to
         * the inner text span (.agp-pcard-name-inner), never to the
         * plate itself (data-agp-pcard-name="1", which stays fixed and
         * clips via overflow:hidden) — applying it to the plate would
         * visually shift the whole card and overlap its neighbors.
         * @param {HTMLElement} rootEl - container holding the cards
         */
        fitAllNames: function (rootEl) {
            if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return;
            var nodes = rootEl.querySelectorAll('[data-agp-pcard-name="1"]');
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var inner = node.querySelector('.agp-pcard-name-inner');
                if (!inner) continue;
                inner.classList.remove('agp-pcard-marquee');
                inner.style.removeProperty('--pcard-slide-dist');
                var overflow = inner.scrollWidth - node.clientWidth;
                if (overflow > 2) {
                    inner.style.setProperty('--pcard-slide-dist', '-' + overflow + 'px');
                    inner.classList.add('agp-pcard-marquee');
                }
            }
        },

        /**
         * Shared "winner/trophy" card — design_handoff_winner_card (Winner
         * Card.dc.html): a 200x300 gold/dark glass card with a crown above
         * it, no panel/box of its own (the calling game supplies its own
         * dim/blurred full-screen backdrop — see renderWinnerScreen() in
         * games/elimination-roulette/agp-elimination-roulette.js for a real
         * usage example). Fixed top-to-bottom order inside the card: label
         * (WINNER by default) -> photo circle -> name -> extra -> divider ->
         * points, pinned to the card's bottom via margin-top:auto.
         *
         * Retheme per game by scoping a CSS rule at opts.cls that overrides
         * the custom properties set on .agp-trophy-wrap (--agp-trophy-accent,
         * --agp-trophy-accent-dark, --agp-trophy-border, --agp-trophy-divider,
         * --agp-trophy-label, --agp-trophy-bg1, --agp-trophy-bg2,
         * --agp-trophy-text) — the crown SVG and points styling pick up the
         * same accent automatically, no separate crown asset needed.
         *
         * @param {Object} player - { id, name, avatarUrl? }
         * @param {Object} [opts]
         * @param {string} [opts.kind='winner'] - 'winner' or 'most' (only affects the default label text below); any other value needs opts.label
         * @param {string} [opts.label] - overrides the default label text ('WINNER' for kind='winner', 'الأكثر إقصاءً' for kind='most')
         * @param {boolean} [opts.showCrown=false]
         * @param {string} [opts.extra] - extra HTML between name and points (use .agp-trophy-extra)
         * @param {string} [opts.pointsHtml] - game-built points HTML (use .agp-trophy-points/.agp-points-earned/.agp-points-sub/.agp-points-noaccount)
         * @param {string} [opts.cls] - extra class on the wrap element (crown + card), for per-game retheming/positioning
         * @param {string} [opts.cardId] - id on the card element (e.g. for confetti targeting)
         * @returns {string} HTML for one card (crown + card, wrapped together)
         */
        renderTrophyCard: function (player, opts) {
            injectStyles();
            opts = opts || {};
            var kind = opts.kind || 'winner';
            var defaultLabel = kind === 'winner' ? 'WINNER' : (kind === 'most' ? 'الأكثر إقصاءً' : '');
            var label = opts.label != null ? opts.label : defaultLabel;
            var crownHtml = opts.showCrown ? '<div class="agp-trophy-crown">' + TROPHY_CROWN_SVG + '</div>' : '';
            var name = (player && (player.name || player.id)) || '—';
            return '<div class="agp-trophy-wrap' + (opts.cls ? ' ' + opts.cls : '') + '">' +
                crownHtml +
                '<div class="agp-trophy-card"' + (opts.cardId ? ' id="' + opts.cardId + '"' : '') + '>' +
                '<div class="agp-trophy-shine"></div>' +
                '<div class="agp-trophy-content">' +
                (label ? '<div class="agp-trophy-label">' + escapeHtml(label) + '</div>' : '') +
                '<div class="agp-trophy-ring-wrap">' + trophyRingAvatarHtml(player) + '</div>' +
                '<div class="agp-trophy-name">' + escapeHtml(name) + '</div>' +
                (opts.extra || '') +
                (opts.pointsHtml ? '<div class="agp-trophy-points-wrap">' + opts.pointsHtml + '</div>' : '') +
                '</div>' +
                '</div>' +
                '</div>';
        }
    };

    AGP.log('AGP Player Card loaded (shared avatar+name[+frame] card for all games).');

}(window.AymanGamesPlatform));
