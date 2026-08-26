/**
 * ==========================================================================
 *  AGP PLAYER CARD — بطاقة لاعب مشتركة (صورة + اسم [+ إطار])
 * ==========================================================================
 *
 * ⚠️ ملف جذر جديد كلياً — وحدة مشتركة قابلة لإعادة الاستخدام من أي لعبة
 *   (بنفس فلسفة js/agp-game-shell.js: كل لعبة تستدعيها، لا اعتماد
 *   عكسي). الهدف: بطاقة واحدة موحّدة (صورة بروفايل تيك توك + اسم
 *   الحساب) تظهر في كل مكان يُعرض فيه لاعب — اللوبي، نوافذ اختيار
 *   الإقصاء/الإرجاع، أي قائمة لاعبين بأي لعبة حالية أو مستقبلية —
 *   بدل كل لعبة تبني تصميمها الخاص من الصفر.
 *
 * البيانات دايماً من حساب تيك توك الحقيقي (avatarUrl/name من بيانات
 * التعليق الواردة فعلياً من الباك إند — راجع tiktok-connector.js)،
 * وليس من بروفايل المنصة إطلاقاً، حتى لو صاحب الحساب مسجّل دخول.
 *
 * الإطار (frame): يظهر فقط لو opts.showFrame === true (اللوبي حصراً —
 *   قرار صريح: نوافذ اختيار الإقصاء/الإرجاع تستخدم البطاقة الأساسية
 *   بدون إطار، حتى لو اللاعب يملك واحداً) وplayer.frame موجود فعلاً
 *   (يعني حساب مسجّل + موثَّق + رابط يوزرنيمه + مفعِّل إطاراً — راجع
 *   backend/collectibles/collectibles-service.js:
 *   getEquippedFrameForVerifiedTikTok).
 *
 * ⚠️ [0.44.8] قالب صور الإطارات (Frame Template) — **تحوّل من "ثوابت
 *   عامة واحدة لكل الإطارات" إلى جدول FRAME_TEMPLATES (قياس مستقل لكل
 *   ملف إطار)**. السبب: تبيّن عملياً (بفحص أول 5 ملفات فعلية أرسلها
 *   صاحب المشروع، مولَّدة بجلسات منفصلة عبر ChatGPT) أن افتراض "قالب
 *   واحد موحّد بنفس القياسات لكل الإطارات" غير صحيح فعلياً على مستوى
 *   الأبعاد: بعض الملفات 1254×1254 (مربّعة، زي founder)، وبعضها
 *   1536×1024 (مستطيلة، نسبة مختلفة كلياً) — قماشة واحدة بأبعاد ثابتة
 *   ما تنفع للكل. كل إطار له الآن مدخل مستقل بجدول FRAME_TEMPLATES
 *   أدناه، فيه: أبعاد القماشة الحقيقية (canvasW/canvasH)، نافذة القص
 *   الرأسي (contentTop/contentHeight)، وموقع/حجم دائرة الصورة وبلاطة
 *   الاسم (avatar_ وname_ — % من نافذة القص، مو القماشة الكاملة).
 *
 *   كل مدخل بالجدول **مقاس فعلياً بالبكسل من ملف الصورة الحقيقي**
 *   (تحليل قناة الألفا لإيجاد فتحة الصورة الشفافة + Connected-
 *   Components، وflood-fill بالتفاوت اللوني لإيجاد بلاطة الاسم — عبر
 *   Python/PIL/SciPy/scikit-image)، ثم تحقّق بصري بصندوقين (أحمر
 *   للصورة، أخضر للاسم) فوق الملف نفسه قبل اعتمادهما — **لا تخمين ولا
 *   نسخ قياسات ملف على آخر**، بما إنها ملفات مختلفة فعلياً (ألوان/نسب/
 *   سماكة زخرفة مختلفة لكل واحد).
 *
 *   ⚠️ [0.44.7→0.44.8] founder تحديداً: القياس الأول ([0.44.5]) كان على
 *   نسخة أرسلها صاحب المشروع بالمحادثة (صورة يسار/اسم يمين). تبيّن
 *   لاحقاً أن الملف اللي كان منشوراً وقتها على GitHub نسخة معكوسة
 *   أفقياً منها (صورة يمين/اسم يسار) — أُصلح مؤقتاً بـ[0.44.7] بعكس
 *   الثوابت رياضياً لتطابق تلك النسخة المعكوسة. بعدها صاحب المشروع صحّح
 *   الملف نفسه على GitHub (رجّعه لاتجاهه الصحيح: صورة يسار/اسم يمين)
 *   ليطابق باقي الإطارات الجديدة (كلها صورة-يسار حسب الفحص) — فمدخل
 *   `frame-founder.png` بالجدول أدناه رجع لقياسات [0.44.5] الأصلية
 *   (صورة يسار/اسم يمين)، **بشرط أن يكون الملف المرفوع فعلاً على
 *   GitHub الآن هو النسخة المصحَّحة** (لا المعكوسة).
 *
 *   ⚠️ متطلبات أي ملف إطار جديد يُضاف لهذا الجدول (الثلاثة كلها
 *   ضرورية، تأكَّدت منها بالفحص لكل الملفات الحالية):
 *   1. PNG بخلفية شفافة حقيقياً (قناة ألفا فعلية، لا JPEG بخلفية بيضاء).
 *   2. منطقة دائرة الصورة شفافة فعلياً (فتحة حقيقية، لا أي رسمة معتمة
 *      داخلها) — حتى تظهر الصورة الشخصية الحقيقية لكل لاعب بدون تراكب.
 *   3. بلاطة الاسم فاضية تماماً من أي نص مرسوم مسبقاً — الكود يرسم اسم
 *      كل لاعب الحقيقي فوق هذي المنطقة تلقائياً.
 *   ⚠️ أي ملف إطار جديد **لازم يُقاس بنفس الطريقة** (فحص فعلي بالبكسل)
 *   قبل إضافته للجدول — نسخ قياسات ملف موجود على ملف جديد بدون فحص
 *   يعطي نتيجة مكسورة (صورة/اسم بمكان خاطئ)، بالضبط زي ما صار مع
 *   founder المعكوس.
 *
 * ⚠️ [0.45.5] إعادة قياس شاملة لـ8 إطارات (floral/ice/blacksteel/phoenix/
 *   purple/celestial/crystalline/frozen) — صاحب المشروع بلّغ (بلقطات شاشة
 *   فعلية من اللوبي) أن الصورة الشخصية ما تنطبق بالضبط على فتحة بعض
 *   الإطارات (فراغات/تراكب)، ولون بعض أسماء اللاعبين غير مقروء فوق
 *   لوحات فاتحة. أعاد صاحب المشروع رفع نفس ملفات الصور (بنفس الأسماء
 *   أعلاه) فرداً فرداً، قيست كل واحدة من جديد بنفس منهجية [0.44.8]
 *   بالضبط (فحص بكسل فعلي + تحقّق بصري بصندوقين) واستُبدلت قياساتها
 *   القديمة بالجدول. تمت مطابقة كل ملف بقياسه القديم عبر contentTop/
 *   contentHeight (متطابقة تقريباً حرفياً) للتأكد إنه نفس الملف قبل أي
 *   استبدال — **لا حذف ولا إضافة مفاتيح جديدة**، فقط تصحيح أرقام
 *   المفاتيح العشرة الموجودة أصلاً.
 * ⚠️ [0.45.5] خاصية جديدة اختيارية بالجدول: textColor (لون نص الاسم،
 *   hex). لو غير موجودة بمدخل إطار معيّن يبقى الأبيض الافتراضي كما هو
 *   (بدون أي تغيير سلوك على أي إطار ما يحتاجها). أُضيفت للإطارات اللي
 *   لوحة اسمها فاتحة (floral/ice/celestial/frozen — أبيض عليها غير
 *   مقروء)، ولإطار الأهلي (أخضر النادي بطلب صريح).
 * ⚠️ [0.45.5] frame-founder.png لم يُمس إطلاقاً (صاحب المشروع أكّد إنه
 *   سليم ومرجعي). ملفان جديدان اتفحصا بنفس الجلسة (فيه واحد بصيغة JPEG
 *   بدون شفافية حقيقية) لسا ما انضافا للجدول — يحتاجان تأكيد/ملف PNG
 *   شفاف قبل أي إضافة مستقبلية، حسب نفس شرط "PNG شفاف حقيقي" أعلاه.
 *
 * ⚠️⚠️ [0.45.6] تصحيح خطأ جوهري بـ[0.45.5] — المفاتيح الثمانية المعدَّلة
 *   هناك (floral/ice/blacksteel/phoenix/purple/celestial/crystalline/
 *   frozen) **ليست أسماء ملفات مسجَّلة فعلياً بأي مكان بقاعدة البيانات**
 *   (تأكَّدت بقراءة backend/db/database.js → DEFAULT_FRAME_CATALOG
 *   كاملاً). يعني: getTemplate('frame-level-6.png') وأمثالها كانت
 *   ترجع دايماً founder الافتراضي (fallback) — **صفر تأثير فعلي على
 *   الموقع الحي رغم رفع [0.45.5] فعلياً على GitHub**. سبب الخطأ: اعتمدت
 *   وقتها على تطابق contentTop/contentHeight لإثبات "نفس ملف الصورة"
 *   (صحيح) لكن استنتجت منه خطأً إبقاء المفتاح القديم بدل استبداله
 *   بالاسم الحقيقي المسجَّل — والملف الحقيقي المطلوب قراءته
 *   (backend/db/database.js) ما كان بحوزتي وقتها كملف كامل، فقط رأيته
 *   عبر أداة تلخيص لصفحة GitHub، وهذا سبب الالتباس.
 *
 *   **الإصلاح هنا**: نفس القيم المقاسة بالبكسل بـ[0.45.5] (لم تُعَد
 *   قياسها من جديد — كانت صحيحة هندسياً، المشكلة فقط بالمفتاح) أُعيد
 *   تسميتها لأسماء الملفات الحقيقية المسجَّلة بـDEFAULT_FRAME_CATALOG:
 *
 *   | المفتاح القديم (خاطئ، غير مسجَّل) | → المفتاح الصحيح الجديد |
 *   |---|---|
 *   | frame-blacksteel.png  | `frame-level-1.png` |
 *   | frame-ice.png         | `frame-level-2.png` |
 *   | frame-purple.png      | `frame-level-4.png` |
 *   | frame-floral.png      | `frame-level-5.png` |
 *   | frame-crystalline.png | `frame-level-6.png` |
 *   | frame-celestial.png   | `frame-level-7.png` |
 *   | frame-frozen.png      | `frame-distinguished.png` |
 *   | frame-phoenix.png     | `frame-supporter.png` |
 *
 *   كل الملفات الثمانية القديمة كانت أسماء زخرفية من جلسة تجريبية سابقة
 *   ولا تقابلها أي صورة فعلية بجذر المستودع الآن (تحقّقت من قائمة
 *   الملفات) — حذفها من الجدول آمن 100%، ما راح يتأثر أي شيء حي.
 *
 *   **`frame-streamer.png` أُضيف حديثاً للجدول لأول مرة** — النسخة
 *   السابقة كانت JPEG بدون شفافية حقيقية (رُفضت حسب شرط الملف)، وصلتني
 *   الآن نسخة PNG شفافة حقيقية فقُست بنفس المنهجية الكاملة من الصفر
 *   (فحص ألفا + تحقّق بصري بصندوقين).
 *
 *   ⚠️ **`frame-level-3.png` غير موجود إطلاقاً بجذر المستودع** رغم إنه
 *   مسجَّل بـDEFAULT_FRAME_CATALOG (`slug: 'level-3'`) — أي لاعب يفتح
 *   هذا المستوى يشوف حالياً إطار founder الاحتياطي بدل إطاره الحقيقي
 *   (fallback آمن، مو كسر). **يحتاج رفع ملف الصورة نفسه** (بصيغة PNG
 *   شفافة حقيقية) لحل هذا تحديداً — لا يوجد شيء بالكود يُصلحه.
 *
 * يعتمد هذا الملف على js/agp-core.js فقط (لـ AGP.log) — لا اعتماد على
 * أي وحدة لعبة أو AGP.gameShell.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }

    var STYLE_ID = 'agp-pcard-styles';

    var AVATAR_SIZE_PX = 60; // ⭐ حجم البطاقة المعتمد (لوبي-قياسي-v1) — 60 أو 65
    var PILL_WIDTH_RATIO = 210 / 65; // نسبة عرض لوح الاسم الثابت لكل حجم أفاتار
    var OVERLAP_RATIO = 0.22; // تراكب الصورة على اللوح = 22% من قطر الأفاتار
    function basicCardTotalWidth(avatarSize) {
        var pillW = Math.round(avatarSize * PILL_WIDTH_RATIO);
        var overlap = Math.round(avatarSize * OVERLAP_RATIO);
        return avatarSize + pillW - overlap;
    }

    // ⚠️ [0.44.8] جدول قياسات كل إطار — راجع تعليق القالب أعلى الملف.
    // المفتاح = اسم ملف الصورة بالضبط (player.frame.imageFilename).
    // avatar*/name* كلها % من "نافذة القص" (canvasW × contentHeight)، لا
    // من القماشة الكاملة رأسياً (المحتوى الفعلي شريط رأسي داخل القماشة
    // فقط، راجع contentTop/contentHeight لكل مدخل).
    var FRAME_TEMPLATES = {
        'frame-founder.png': {
            canvasW: 1254, canvasH: 1254, contentTop: 254, contentHeight: 613,
            avatarLeftPct: 9.73, avatarTopPct: 33.12, avatarWidthPct: 24.24, avatarHeightPct: 51.71,
            nameLeftPct: 42.11, nameTopPct: 51.55, nameWidthPct: 47.13, nameHeightPct: 21.86
        },
        // [0.45.6] هذا المفتاح = "frame-level-5.png" بتسمية صاحب المشروع
        // أثناء الرفع لي (كان خطأً مسجَّلاً هنا باسم "frame-floral.png" —
        // راجع تعليق [0.45.6] أعلى الملف). القياسات نفسها من [0.45.5] (لم
        // تتغيّر، كانت صحيحة هندسياً)، فقط المفتاح تصحّح.
        'frame-level-5.png': {
            canvasW: 1536, canvasH: 1024, contentTop: 160, contentHeight: 616,
            avatarLeftPct: 9.51, avatarTopPct: 21.75, avatarWidthPct: 22.66, avatarHeightPct: 56.17,
            nameLeftPct: 32.55, nameTopPct: 33.12, nameWidthPct: 65.36, nameHeightPct: 41.56,
            textColor: '#1c1c24' // لوحة الاسم فاتحة (كريمي/عاجي) — أبيض افتراضي غير مقروء عليها
        },
        // [0.45.6] = "frame-level-2.png" (كان مسجَّلاً خطأً باسم "frame-ice.png").
        'frame-level-2.png': {
            canvasW: 1536, canvasH: 1024, contentTop: 175, contentHeight: 515,
            avatarLeftPct: 8.20, avatarTopPct: 19.03, avatarWidthPct: 22.33, avatarHeightPct: 61.94,
            nameLeftPct: 31.25, nameTopPct: 34.37, nameWidthPct: 65.17, nameHeightPct: 40.00,
            textColor: '#1c1c24' // لوحة الاسم فاتحة (أزرق ثلجي فاتح) — أبيض افتراضي غير مقروء عليها
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
    var DEFAULT_TEMPLATE_KEY = 'frame-founder.png'; // احتياط دفاعي فقط — إطار غير موجود بالجدول يظهر بقياسات founder بدل ما ينكسر كلياً

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
        // أول حرفين (يدعم عربي/إنجليزي أساسياً — لا معالجة خاصة لرموز تركيبية نادرة)
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
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '@keyframes agpPcardSlide{0%,15%{transform:translateX(0);}45%,55%{transform:translateX(var(--pcard-slide-dist));}85%,100%{transform:translateX(0);}}',
            '.agp-pcard-name-basic.agp-pcard-marquee{animation:agpPcardSlide 4.5s ease-in-out infinite;}',

            /* ---- البطاقة المؤطَّرة — الخيار أ: عرض ثابت = نفس عرض
             * البطاقة العادية، الارتفاع ناتج ومتغيّر حسب نسبة كل إطار ---- */
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
            'font-weight:800;color:#fff;text-align:center;line-height:1.1;white-space:nowrap;',
            'text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.6);box-sizing:border-box;}'
        ].join('');
        document.head.appendChild(style);
    }

    /**
     * يحسب كل القياسات الفعلية (px/%) لإطار معيّن حسب FRAME_TEMPLATES —
     * نفس منطق القص بصرياً (حاوية بارتفاع CARD_HEIGHT_PX + overflow:
     * hidden + صورة خلفية أكبر منها بإزاحة سالبة للأعلى) لكل الإطارات،
     * لكن بأبعاد/إزاحة خاصة بكل قالب بدل رقم عام واحد.
     * @param {Object} tpl - مدخل من FRAME_TEMPLATES
     * @returns {Object} قياسات جاهزة للحقن inline
     */
    function computeLayout(tpl, targetWidthPx) {
        var scale = targetWidthPx / tpl.canvasW;
        var cardHeightPx = Math.round(tpl.contentHeight * scale * 100) / 100;
        var frameImgWidthPx = targetWidthPx;
        var frameImgHeightPx = Math.round(tpl.canvasH * scale * 100) / 100;
        var frameTopOffsetPx = Math.round(-(tpl.contentTop * scale) * 100) / 100;
        return {
            cardWidthPx: targetWidthPx,
            cardHeightPx: cardHeightPx,
            frameImgWidthPx: frameImgWidthPx,
            frameImgHeightPx: frameImgHeightPx,
            frameTopOffsetPx: frameTopOffsetPx
        };
    }

    /**
     * بطاقة أساسية (صورة + اسم، بدون إطار) — تُستخدَم دائماً لو
     * showFrame غير مفعَّل، أو اللاعب بدون إطار مفعَّل أصلاً.
     */
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

        return '<span class="agp-pcard' + (opts && opts.outClass ? ' ' + opts.outClass : '') + '">' +
            avatarHtml +
            '<span class="agp-pcard-name-basic" style="' + pillStyle + '" data-agp-pcard-name="1">' + escapeHtml(name) + '</span>' +
            '</span>';
    }

    /**
     * ⚠️ [0.44.8] بطاقة مؤطَّرة — قماشة واحدة مقصوصة (صورة خلف + اسم
     * فوق)، بقياسات خاصة بملف هذا الإطار تحديداً (FRAME_TEMPLATES).
     * تُستخدَم فقط لو showFrame صحيح وplayer.frame موجود.
     */
    function renderFramedHtml(player, opts) {
        var name = (player && player.name) || (player && player.id) || '—';
        var avatarUrl = player && player.avatarUrl;
        var basePath = (opts && opts.basePath) || '';
        var imageFilename = player.frame.imageFilename;
        var frameSrc = basePath + imageFilename;

        var tpl = getTemplate(imageFilename);
        var h = (opts && opts.size) || AVATAR_SIZE_PX;
        var layout = computeLayout(tpl, basicCardTotalWidth(h));

        var wrapStyle = 'width:' + layout.cardWidthPx + 'px;height:' + layout.cardHeightPx + 'px';
        var avatarStyle = 'left:' + tpl.avatarLeftPct + '%;top:' + tpl.avatarTopPct + '%;' +
            'width:' + tpl.avatarWidthPct + '%;height:' + tpl.avatarHeightPct + '%;';
        var frameImgStyle = 'top:' + layout.frameTopOffsetPx + 'px;' +
            'width:' + layout.frameImgWidthPx + 'px;height:' + layout.frameImgHeightPx + 'px;' +
            'background-size:' + layout.frameImgWidthPx + 'px ' + layout.frameImgHeightPx + 'px;' +
            'background-image:url(' + escapeHtml(frameSrc) + ')';
        // [0.45.5] tpl.textColor اختياري — لو موجود يطغى على اللون الأبيض
        // الافتراضي بالـCSS (بعض لوحات الأسماء فاتحة واللون الأبيض غير
        // مقروء عليها، أو مطلوب لون هوية محدد زي إطار الأهلي).
        var nameStyle = 'left:' + tpl.nameLeftPct + '%;top:' + tpl.nameTopPct + '%;' +
            'width:' + tpl.nameWidthPct + '%;height:' + tpl.nameHeightPct + '%;' +
            (tpl.textColor ? 'color:' + tpl.textColor + ';' : '');

        var avatarHtml = avatarUrl
            ? '<img class="agp-pcard-tpl-avatar" style="' + avatarStyle + '" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;agp-pcard-tpl-avatar agp-pcard-tpl-avatar--fallback&quot; style=&quot;' + avatarStyle + '&quot;>' + escapeHtml(initials(name)) + '</div>\';">'
            : '<div class="agp-pcard-tpl-avatar agp-pcard-tpl-avatar--fallback" style="' + avatarStyle + '">' + escapeHtml(initials(name)) + '</div>';

        return '<span class="agp-pcard-tpl' + (opts && opts.outClass ? ' ' + opts.outClass : '') + '" style="' + wrapStyle + '">' +
            avatarHtml +
            '<span class="agp-pcard-tpl-frame-img" style="' + frameImgStyle + '"></span>' +
            '<span class="agp-pcard-tpl-name" data-agp-pcard-name="1" style="' + nameStyle + '">' + escapeHtml(name) + '</span>' +
            '</span>';
    }

    AGP.playerCard = {

        /**
         * @param {Object} player - كائن اللاعب (id, name, avatarUrl?, frame?)
         * @param {Object} [opts]
         * @param {boolean} [opts.showFrame=false] - أظهر الإطار لو اللاعب يملك واحداً (اللوبي فقط)
         * @param {string}  [opts.basePath=''] - بادئة نسبية لمسار صورة الإطار (مثلاً '../../')
         * @param {string}  [opts.outClass] - كلاس إضافي (مثلاً لتمييز لاعب مُقصى بالبطاقة الأساسية)
         * @returns {string} HTML لبطاقة واحدة
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
         * يصغّر تلقائياً حجم خط أي اسم يفيض عن صندوقه الثابت (سواء
         * بطاقة أساسية أو مؤطَّرة) — يُستدعى بعد إدراج الـHTML بالـDOM
         * فعلياً (القياس يحتاج العنصر مرسوماً). آمن يُستدعى بأي وقت،
         * حتى لو ما فيه بطاقات جديدة (لا شيء يصير).
         * @param {HTMLElement} rootEl - العنصر الأب اللي فيه البطاقات
         */
        fitAllNames: function (rootEl) {
            if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return;
            var nodes = rootEl.querySelectorAll('[data-agp-pcard-name="1"]');
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                node.classList.remove('agp-pcard-marquee');
                node.style.removeProperty('--pcard-slide-dist');
                var overflow = node.scrollWidth - node.clientWidth;
                if (overflow > 2) {
                    node.style.setProperty('--pcard-slide-dist', '-' + overflow + 'px');
                    node.classList.add('agp-pcard-marquee');
                }
            }
        }
    };

    AGP.log('AGP Player Card loaded (shared avatar+name[+frame] card for all games).');

}(window.AymanGamesPlatform));
