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

    // Default crown icon used by renderTrophyCard when a game passes
    // showCrown:true without its own opts.crownIconDataUri (otherwise
    // showCrown would silently render no crown).
    var DEFAULT_CROWN_DATA_URI = 'data:image/png;base64,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';

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

            /* Shared "winner/trophy" glass card — see
             * AGP.playerCard.renderTrophyCard below. */
            '.agp-trophy-card{position:relative;width:250px;height:300px;max-width:88vw;',
            'max-height:min(300px,74vh);box-sizing:border-box;',
            'border-radius:15px;padding:20px 14px;display:flex;flex-direction:column;align-items:center;',
            'justify-content:center;overflow:visible;background:rgba(101,98,98,0.5);',
            'border:3px solid #000;',
            'box-shadow:inset 0 4px 2px rgba(0,0,0,0.25),0 0 55px 14px rgba(255,255,255,0.4),0 0 120px 35px rgba(216,120,255,0.6);',
            'animation:agpTrophyGlowPulse 2.6s ease-in-out infinite;}',
            '@keyframes agpTrophyGlowPulse{0%,100%{box-shadow:inset 0 4px 2px rgba(0,0,0,0.25),',
            '0 0 55px 14px rgba(255,255,255,0.4),0 0 120px 35px rgba(216,120,255,0.6);}',
            '50%{box-shadow:inset 0 4px 2px rgba(0,0,0,0.25),',
            '0 0 75px 22px rgba(255,255,255,0.6),0 0 150px 45px rgba(216,120,255,0.78);}}',
            '.agp-trophy-crown{width:58px;height:58px;object-fit:contain;margin-bottom:6px;',
            'filter:drop-shadow(0 3px 8px rgba(0,0,0,0.5));}',
            '.agp-trophy-ring-wrap{position:relative;width:84px;height:84px;margin:0 auto 10px;border-radius:50%;',
            'padding:5px;box-sizing:border-box;}',
            '.agp-trophy-ring-winner{background:conic-gradient(from 0deg,#ffd400,#fff6cf,#ffd400,#c9960a,#ffd400);',
            'box-shadow:0 0 20px rgba(255,212,0,0.55);}',
            '.agp-trophy-ring-most{background:repeating-conic-gradient(#ff4dff 0deg 18deg,#7f267f 18deg 36deg);',
            'box-shadow:0 0 20px rgba(255,77,255,0.4);}',
            '.agp-trophy-ring-inner{width:100%;height:100%;border-radius:50%;background:#2D1932;overflow:hidden;}',
            '.agp-trophy-ring-avatar{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#5a2585;display:block;}',
            '.agp-trophy-ring-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1.4em;}',
            '.agp-trophy-ring-badge{position:absolute;bottom:-2px;right:-2px;width:28px;height:28px;border-radius:50%;',
            'display:flex;align-items:center;justify-content:center;font-size:0.95em;border:2px solid #2D1932;}',
            '.agp-trophy-ring-badge.agp-trophy-badge-winner{background:#ffd400;}',
            '.agp-trophy-ring-badge.agp-trophy-badge-most{background:#ff4dff;}',
            /* ⚠️ margin-bottom هنا هو "الفراغ البسيط" المطلوب بين الاسم
             * والنقاط (بدل gap عام على البطاقة كلها، حتى ما يفرّق التاج/
             * الحلقة عن بعض بلا داعي). */
            '.agp-trophy-name{font-size:1.1em;font-weight:900;color:#fff;margin-bottom:14px;}',
            '.agp-trophy-extra{color:#e9d3ff;font-size:0.85em;margin-top:-8px;margin-bottom:8px;}',
            '.agp-trophy-points{font-size:0.85em;line-height:1.4;text-align:center;}',
            '.agp-trophy-points.agp-points-earned{color:#ffd400;font-weight:800;}',
            '.agp-trophy-points .agp-points-sub{display:block;color:#e9d3ff;font-weight:500;font-size:0.85em;margin-top:2px;}',
            '.agp-trophy-points.agp-points-noaccount{color:#e9d3ff;font-size:0.8em;}'
        ].join('');
        document.head.appendChild(style);
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

    /** Plain circular avatar (no name) for inside a trophy card's ring —
     * deliberately independent of renderBasicHtml/renderFramedHtml above. */
    function trophyRingAvatarHtml(player) {
        var name = (player && (player.name || player.id)) || '—';
        var avatarUrl = player && player.avatarUrl;
        var initialsText = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        return avatarUrl
            ? '<img class="agp-trophy-ring-avatar" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;agp-trophy-ring-avatar agp-trophy-ring-avatar--fallback&quot;>' + escapeHtml(initialsText) + '</div>\';">'
            : '<div class="agp-trophy-ring-avatar agp-trophy-ring-avatar--fallback">' + escapeHtml(initialsText) + '</div>';
    }

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
         * Shared "winner/trophy" glass card, 250x300, fixed top-to-bottom
         * order: crown (if showCrown) -> avatar ring -> name -> gap ->
         * points. No "Winner"/"Most eliminated" label or game name inside
         * the card itself — the calling game shows that once above the
         * row of cards instead. Originally local to elimination-roulette,
         * now shared; see renderWinnerScreen() in
         * games/elimination-roulette/agp-elimination-roulette.js for a
         * real usage example.
         *
         * @param {Object} player - { id, name, avatarUrl? }
         * @param {Object} [opts]
         * @param {string} [opts.kind='winner'] - 'winner' (gold ring + 👑) or 'most' (pink ring + ⚔️); other values need the game's own CSS for ring/badge color
         * @param {string} [opts.badgeIcon] - overrides the default 👑/⚔️
         * @param {boolean} [opts.showCrown=false]
         * @param {string} [opts.crownIconDataUri] - defaults to DEFAULT_CROWN_DATA_URI if showCrown is true
         * @param {string} [opts.extra] - extra HTML between name and points (use .agp-trophy-extra)
         * @param {string} [opts.pointsHtml] - game-built points HTML (use .agp-trophy-points/.agp-points-earned/.agp-points-sub/.agp-points-noaccount)
         * @param {string} [opts.cls] - extra class on the card element
         * @param {string} [opts.cardId] - id on the card element (e.g. for confetti targeting)
         * @returns {string} HTML for one card
         */
        renderTrophyCard: function (player, opts) {
            injectStyles();
            opts = opts || {};
            var kind = opts.kind || 'winner';
            var badgeIcon = opts.badgeIcon || (kind === 'winner' ? '👑' : '⚔️');
            var crownHtml = opts.showCrown
                ? '<img class="agp-trophy-crown" src="' + (opts.crownIconDataUri || DEFAULT_CROWN_DATA_URI) + '" alt="">'
                : '';
            var ringHtml = '<div class="agp-trophy-ring-wrap agp-trophy-ring-' + kind + '">' +
                '<div class="agp-trophy-ring-inner">' + trophyRingAvatarHtml(player) + '</div>' +
                '<div class="agp-trophy-ring-badge agp-trophy-badge-' + kind + '">' + badgeIcon + '</div>' +
                '</div>';
            var name = (player && (player.name || player.id)) || '—';
            return '<div class="agp-trophy-card' + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.cardId ? ' id="' + opts.cardId + '"' : '') + '>' +
                crownHtml +
                ringHtml +
                '<div class="agp-trophy-name">' + escapeHtml(name) + '</div>' +
                (opts.extra || '') +
                (opts.pointsHtml || '') +
                '</div>';
        }
    };

    AGP.log('AGP Player Card loaded (shared avatar+name[+frame] card for all games).');

}(window.AymanGamesPlatform));
