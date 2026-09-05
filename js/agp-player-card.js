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

    // ⚠️ [0.60.0] ارتفاع موحَّد للوبي فقط — بطاقة بإطار أو بدون إطار، كلاهما
    // بهذا الارتفاع بالضبط لو opts.showFrame===true (يعني سياق اللوبي حصراً،
    // راجع js/agp-game-shell.js:535 اللي يمرّر showFrame:true دايماً لكل
    // لاعبي اللوبي بصرف النظر لو عنده إطار فعلاً أو لا). السبب: بعد توحيد
    // ارتفاع كل الإطارات الـ12 مع بعض ([0.59.0])، تبيّن إنه لازم يتوحّد
    // أيضاً مع بطاقة اللاعب اللي بدون إطار أصلاً (كانت لسا 66px) — وإلا
    // يرجع نفس نوع التفاوت (بس بين "بإطار" و"بدون" بدل "إطار وإطار").
    // القيمة 100 اختيار وسط بموافقة صريحة من صاحب المشروع: تكفي عشان
    // تستوعب 8 من 12 إطار بدون أي قصّ إطلاقاً، والـ4 الباقية تُقصّ بنفس
    // منطق القص المتمركز على الصورة+الاسم في computeLayout() (لا قصّ على
    // الصورة أو الاسم نفسه، فقط الزخرفة الزائدة). البطاقة بدون إطار ما
    // عندها محتوى إضافي يملأ الفراغ (زي زخرفة الإطارات)، فبيصير عندها
    // فراغ فارغ فوق/تحت الصورة+الاسم — مقبول بموافقة صاحب المشروع، ويُحل
    // بمحاذاة المحتوى للمنتصف رأسياً (.agp-pcard already align-items:center).
    // ⚠️ هذا الثابت ما يؤثر إطلاقاً على استخدامات البطاقة الأساسية خارج
    // اللوبي (مثلاً قوائم اختيار الإقصاء/الإرجاع بروليت الإقصاء — تستدعي
    // renderHtml بـshowFrame:false عمداً، فتبقى بارتفاعها الطبيعي كما هي).
    var LOBBY_CARD_HEIGHT_PX = 100;
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
    var DEFAULT_TEMPLATE_KEY = 'frame-founder.png'; // احتياط دفاعي فقط — إطار غير موجود بالجدول يظهر بقياسات founder بدل ما ينكسر كلياً

    // ⚠️ [تثبيت بطاقة الفائز — تكتمل تلقائياً لأي لعبة] تاج افتراضي مشترك
    // (نفس أيقونة CROWN_ICON_DATA_URI المنسوخة سابقاً محلياً بروليت
    // الإقصاء فقط). قبل هذا كانت كل لعبة تحتاج تجيب أيقونة التاج بنفسها
    // وتمررها عبر opts.crownIconDataUri — لو نسيتها، showCrown:true ما
    // يطلع تاجاً (فشل صامت). الآن renderTrophyCard تستخدم هذا الافتراضي
    // تلقائياً لو اللعبة ما مرّرت أيقونة خاصة بها، فأي لعبة تستدعي
    // showCrown:true تضمن بطاقة كاملة دايماً بدون أي إعداد إضافي.
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
            'overflow:hidden;}',
            /* ⚠️ [إصلاح جذري — "تحرّك الأسماء"] السلايد ما عاد يُطبَّق على
             * .agp-pcard-name-basic نفسها (اللوح/الصندوق بخلفيته وحدوده) —
             * ذاك كان يحرّك الصندوق كاملاً بصرياً (transform لا يتقيّد
             * بـoverflow:hidden لعنصره هو نفسه، فقط يقصّ أبناءه)، فيتحرّك
             * اللوح فعلياً يمين/يسار ويتراكب مع الأفاتار/البطاقة المجاورة
             * له بالصف (بالضبط الخلل اللي ظهر بالفيديو). الحل: نغلّف النص
             * بعنصر داخلي (.agp-pcard-name-inner) والسلايد يتحرّك هو فقط،
             * محصوراً داخل صندوق اللوح الثابت (overflow:hidden) اللي ما
             * يتحرّك أبداً — نفس الأسلوب المطبَّق محلياً مسبقاً بلعبتي
             * الكراسي الموسيقية (mc-name-inner) والروليت الروسي
             * (rr-name-inner)، الآن معمَّم بالملف المشترك لكل الألعاب. */
            '.agp-pcard-name-inner{display:inline-block;white-space:nowrap;}',
            '@keyframes agpPcardSlide{0%,15%{transform:translateX(0);}45%,55%{transform:translateX(var(--pcard-slide-dist));}85%,100%{transform:translateX(0);}}',
            '.agp-pcard-name-inner.agp-pcard-marquee{animation:agpPcardSlide 4.5s ease-in-out infinite;}',

            /* ---- البطاقة المؤطَّرة — ⚠️ [إصلاح جذري لتفاوت الارتفاع]
             * كانت أصلاً: عرض ثابت = نفس عرض البطاقة العادية، والارتفاع
             * ناتج ومتغيّر حسب نسبة كل إطار (بعض الإطارات كانت تنتج
             * بطاقات أطول بـ66px من إطارات أخرى بنفس العرض تماماً — هذا
             * كان السبب الجذري الفعلي لمشكلة "البطاقات تتحرك/تتفاوت"
             * باللوبي اللي بلّغ عنها صاحب المشروع، خصوصاً مع
             * align-items:end بشبكة اللوبي في js/agp-game-shell.js).
             * الحل: عكس المعادلة — الآن الارتفاع ثابت (يطابق ارتفاع
             * البطاقة الأساسية بدون إطار)، والعرض هو المتغيّر حسب تصميم
             * كل إطار (راجع computeLayout/renderFramedHtml أدناه). النتيجة:
             * كل البطاقات (بإطار أو بدون) بنفس الارتفاع بالضبط بأي صف،
             * فرق العرض بينها غير ملحوظ بصرياً مع justify-items:center. ---- */
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

            /* ==================================================================
             * ⚠️ [منقول من games/elimination-roulette/agp-elimination-roulette.js]
             * بطاقة "فائز/تتويج" زجاجية مشتركة — كانت محلية بالكامل بلعبة
             * روليت الإقصاء ([0.52.0]/[0.53.0])، نُقلت هنا بطلب صريح من
             * صاحب المشروع عشان أي لعبة تقدر تستخدم نفس التصميم بدون
             * إعادة بنائه من الصفر. القيم (الأبعاد/الألوان/التوهّج) منسوخة
             * حرفياً كما هي بالملف الأصلي — لا تغيير تصميمي، فقط تسمية
             * الكلاسات تغيّرت من بادئة er- إلى agp-trophy- (اتساقاً مع بقية
             * هذا الملف المشترك، وتجنّباً لأي تعارض مع كلاسات أي لعبة).
             * راجع AGP.playerCard.renderTrophyCard أدناه للاستخدام.
             * ================================================================== */
            /* ⚠️ [تثبيت الشكل النهائي — طلب صريح] مقاس البطاقة 250×300 (كان
             * 300×400)، وترتيب المحتوى صار: تاج → صورة اللاعب (الحلقة) →
             * الاسم → فراغ بسيط → النقاط. "التسمية" النصية (🏆 الفائز/
             * ⚔️ الأكثر إقصاءً) واسم اللعبة داخل البطاقة أُلغيا كلياً —
             * نفس المعلومة صارت بسطر واحد فوق كل بطاقات الفائزين (تبنيه كل
             * لعبة بنفسها فوق .agp-trophy-cards، مثل "🏁 انتهت المباراة ..
             * الشخص الرهيب الي فاز بلعبة "اسم اللعبة""), فما عاد يحتاج
             * تكرارها داخل كل بطاقة. */
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
     * يحسب كل القياسات الفعلية (px) لإطار معيّن حسب FRAME_TEMPLATES.
     *
     * ⚠️ [توحيد كامل — عرض وارتفاع ثابتان معاً] تاريخ هذي الدالة:
     * 1) الأصل: تثبّت العرض، الارتفاع ناتج حسب نسبة كل إطار → فرق
     *    ارتفاع وصل 66px بين إطار وآخر (سبب مشكلة "تحرّك" البطاقات).
     * 2) إصلاح أول: عكس المعادلة (تثبّت الارتفاع، العرض هو المتغيّر) —
     *    حلّ مشكلة الحركة لكن خلّى عرض البطاقات يتفاوت بوضوح بين إطار
     *    وآخر (طلب توضيح من صاحب المشروع لاحقاً "ليش فيه تفاوت بالحجم؟").
     * 3) هذا الإصلاح (توحيد كامل، بموافقة صريحة رغم مخاطرة القص):
     *    العرض **و** الارتفاع كلاهما ثابتان الآن (targetWidthPx/
     *    targetHeightPx، بنفس قيم البطاقة الأساسية بدون إطار) لكل
     *    البطاقات بصرف النظر عن الإطار. لتحقيق هذا: نحسب الصورة
     *    بالمقياس المبني على العرض (نفس منطق الإصلاح الأصلي [1] —
     *    الارتفاع الناتج غالباً أطول من targetHeightPx)، ثم "نقصّ"
     *    رأسياً نافذة بحجم targetHeightPx بالضبط من داخل هذا الارتفاع
     *    الطبيعي — **متمركزة على منطقة الصورة+الاسم تحديداً** (وليس
     *    قصّاً أعمى من الأسفل أو الأعلى)، حتى لا يُقتَطع أي جزء من
     *    الصورة الشخصية أو لوحة الاسم، فقط الزخرفة الزائدة على الأطراف.
     *    تحقّقت حسابياً (سكربت Python منفصل قبل التطبيق) أن منطقة
     *    الصورة+الاسم تتّسع فعلياً ضمن targetHeightPx بكل الإطارات الـ12
     *    المسجَّلة حالياً بهامش لا بأس به — أي إطار جديد يُضاف مستقبلاً
     *    يحتاج نفس التحقّق قبل اعتماده.
     * @param {Object} tpl - مدخل من FRAME_TEMPLATES
     * @param {number} targetWidthPx - العرض الثابت المطلوب لكل البطاقات
     * @param {number} targetHeightPx - الارتفاع الثابت المطلوب لكل البطاقات
     * @returns {Object} قياسات جاهزة للحقن inline (px فقط، حتى للعناصر الداخلية الرأسية — راجع avatarTopPx/nameTopPx أدناه)
     */
    function computeLayout(tpl, targetWidthPx, targetHeightPx) {
        var scale = targetWidthPx / tpl.canvasW;
        var naturalContentHeightPx = tpl.contentHeight * scale;
        var frameImgWidthPx = targetWidthPx;
        var frameImgHeightPx = Math.round(tpl.canvasH * scale * 100) / 100;

        // نطاق الصورة+الاسم الفعلي (px) داخل نافذة المحتوى الطبيعية (قبل أي قص)
        var avatarTopPx = tpl.avatarTopPct / 100 * naturalContentHeightPx;
        var avatarBottomPx = avatarTopPx + tpl.avatarHeightPct / 100 * naturalContentHeightPx;
        var nameTopPx = tpl.nameTopPct / 100 * naturalContentHeightPx;
        var nameBottomPx = nameTopPx + tpl.nameHeightPct / 100 * naturalContentHeightPx;
        var contentMinY = Math.min(avatarTopPx, nameTopPx);
        var contentMaxY = Math.max(avatarBottomPx, nameBottomPx);
        var contentCenterY = (contentMinY + contentMaxY) / 2;

        // نافذة القص الرأسي (targetHeightPx) مُتمركزة على منتصف منطقة
        // الصورة+الاسم، مثبَّتة ضمن حدود نافذة المحتوى الطبيعية (لا نعرض
        // فراغاً خارج الصورة نفسها لو الإطار كان أقصر أصلاً من الهدف).
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
            // ⚠️ px صريحة (وليست % كالسابق) لأن % كانت تُحسَب بالأصل على
            // نافذة المحتوى الطبيعية الكاملة — بعد القص صار الغلاف نفسه
            // (targetHeightPx) أقصر من تلك النافذة، فلازم إحداثيات مطلقة.
            avatarTopPx: Math.round((avatarTopPx - cropTop) * 100) / 100,
            avatarHeightPx: Math.round((tpl.avatarHeightPct / 100 * naturalContentHeightPx) * 100) / 100,
            nameTopPx: Math.round((nameTopPx - cropTop) * 100) / 100,
            nameHeightPx: Math.round((tpl.nameHeightPct / 100 * naturalContentHeightPx) * 100) / 100
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
        // ⚠️ [0.60.0] لو الاستدعاء من سياق اللوبي (opts.showFrame===true —
        // راجع تعليق LOBBY_CARD_HEIGHT_PX أعلاه) نثبّت ارتفاع الغلاف
        // الخارجي بنفس ارتفاع البطاقات المؤطَّرة، ونعتمد على
        // align-items:center الموجودة أصلاً بـ.agp-pcard لتوسيط الصورة+
        // الاسم رأسياً داخل هذا الارتفاع (بدل ما يبقيان ملتصقين بارتفاعهما
        // الطبيعي الأصغر). خارج اللوبي (showFrame:false) لا تغيير إطلاقاً.
        var outerStyle = (opts && opts.showFrame) ? ' style="height:' + LOBBY_CARD_HEIGHT_PX + 'px"' : '';

        return '<span class="agp-pcard' + (opts && opts.outClass ? ' ' + opts.outClass : '') + '"' + outerStyle + '>' +
            avatarHtml +
            '<span class="agp-pcard-name-basic" style="' + pillStyle + '" data-agp-pcard-name="1">' +
            '<span class="agp-pcard-name-inner">' + escapeHtml(name) + '</span>' +
            '</span>' +
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
        // ⚠️ [توحيد كامل — عرض وارتفاع ثابتان معاً] العرض ثابت بنفس عرض
        // البطاقة الأساسية بدون إطار (basicCardTotalWidth(h)). الارتفاع
        // ⚠️ [0.60.0] بقى ثابتاً مستقلاً عن h — LOBBY_CARD_HEIGHT_PX (100،
        // راجع تعليقها أعلاه) بدل h+6 (كان يساوي فقط بالصدفة ارتفاع
        // البطاقة الأساسية بحجمها الافتراضي). بهذا كل البطاقات (بإطار أو
        // بدون، بأي إطار) نفس المقاس تماماً — راجع تعليق computeLayout()
        // أعلاه لتفاصيل منطق القصّ المتمركز على الصورة+الاسم الذي يحقّق
        // هذا بدون تشويه أو قصّ خاطئ.
        var targetWidthPx = basicCardTotalWidth(h);
        var targetHeightPx = LOBBY_CARD_HEIGHT_PX;
        var layout = computeLayout(tpl, targetWidthPx, targetHeightPx);

        var wrapStyle = 'width:' + layout.cardWidthPx + 'px;height:' + layout.cardHeightPx + 'px';
        // ⚠️ top/height بالبكسل الصريح (layout.avatarTopPx/avatarHeightPx)
        // وليس % — لازم بعد القص لأن % كانت محسوبة أصلاً على نافذة
        // المحتوى الطبيعية غير المقصوصة (راجع computeLayout). left/width
        // تبقى % بأمان لأن العرض لم يُقصّ أفقياً إطلاقاً.
        var avatarStyle = 'left:' + tpl.avatarLeftPct + '%;top:' + layout.avatarTopPx + 'px;' +
            'width:' + tpl.avatarWidthPct + '%;height:' + layout.avatarHeightPx + 'px;';
        var frameImgStyle = 'top:' + layout.frameTopOffsetPx + 'px;' +
            'width:' + layout.frameImgWidthPx + 'px;height:' + layout.frameImgHeightPx + 'px;' +
            'background-size:' + layout.frameImgWidthPx + 'px ' + layout.frameImgHeightPx + 'px;' +
            'background-image:url(' + escapeHtml(frameSrc) + ')';
        // [0.45.5] tpl.textColor اختياري — لو موجود يطغى على اللون الأبيض
        // الافتراضي بالـCSS (بعض لوحات الأسماء فاتحة واللون الأبيض غير
        // مقروء عليها، أو مطلوب لون هوية محدد زي إطار الأهلي).
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

    /**
     * ⚠️ [منقول من games/elimination-roulette/agp-elimination-roulette.js]
     * صورة دائرية بسيطة (بدون اسم) داخل حلقة بطاقة الفائز — منقولة حرفياً
     * من دالة ringAvatarHtml() المحلية هناك (نفسها لا تزال موجودة محلياً
     * بذاك الملف، تُستخدَم لأغراض أخرى غير بطاقة الفائز — لم تُحذَف).
     * لا تعتمد على renderBasicHtml/renderFramedHtml أعلاه عمداً — تصميم
     * مختلف كلياً (صورة دائرية مستقلة داخل حلقة ملوَّنة + شارة أيقونة).
     */
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
            // ⚠️ [إصلاح جذري — "تحرّك الأسماء" باللوبي وبقوائم اللاعبين]
            // node هنا هو صندوق اللوح الثابت (الخلفية/الحدود/الحجم —
            // data-agp-pcard-name="1")، ما يتحرّك أبداً ويبقى overflow:hidden
            // (قصّاص/إطار ثابت). inner هو الامتداد الفعلي للنص بداخله —
            // هو فقط من يتحرّك (transform) لو فاض النص عن عرض الصندوق،
            // بالضبط زي شريط الأخبار (marquee) الحقيقي. قبل هذا الإصلاح
            // كان الـtransform يُطبَّق على node نفسه (الصندوق)، فيتحرّك
            // اللوح كاملاً بصرياً ويتراكب مع العناصر المجاورة له بالصف —
            // هذا كان السبب الجذري الفعلي لمشكلة "تحرّك أسماء اللاعبين"
            // (تكرّرت بأكثر من لعبة لأن الكل يستخدم نفس هذا الملف المشترك).
            var nodes = rootEl.querySelectorAll('[data-agp-pcard-name="1"]');
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var inner = node.querySelector('.agp-pcard-name-inner');
                if (!inner) continue; // بطاقة بتركيب قديم غير متوقَّع — تجاهل بأمان
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
         * ⚠️ [تثبيت الشكل النهائي — طلب صريح 2026] بطاقة "فائز/تتويج"
         * زجاجية مشتركة، 250×300، بترتيب ثابت من فوق لتحت: تاج (لو
         * showCrown) ← صورة اللاعب (حلقة ملوَّنة) ← الاسم ← فراغ بسيط ←
         * النقاط. النص التوضيحي ("🏆 الفائز"/"⚔️ الأكثر إقصاءً" واسم
         * اللعبة) أُلغي من داخل البطاقة نفسها — صار مسؤولية اللعبة
         * المستدعية تعرضه بسطر واحد فوق صف البطاقات كلها (مثال:
         * "🏁 انتهت المباراة .. الشخص الرهيب الي فاز بلعبة "اسم اللعبة"")
         * بدل تكراره داخل كل بطاقة على حدة. أصل التصميم كان محلياً بلعبة
         * روليت الإقصاء، نُقل هنا ليصبح مشتركاً لكل الألعاب — أي لعبة
         * تستدعيه مباشرة بدون أي بناء إضافي، راجع مثال حقيقي بـ
         * renderWinnerScreen() في games/elimination-roulette/agp-elimination-roulette.js.
         *
         * @param {Object} player - كائن اللاعب (id, name, avatarUrl?)
         * @param {Object} [opts]
         * @param {string} [opts.kind='winner'] - 'winner' (حلقة ذهبية دوّارة + شارة 👑) أو 'most' (حلقة وردية متقطّعة + شارة ⚔️ افتراضياً) — أي قيمة أخرى تحتاج CSS إضافي محلي من اللعبة نفسها لتلوين الحلقة/الشارة
         * @param {string} [opts.badgeIcon] - استبدال أيقونة الشارة الافتراضية (👑/⚔️)
         * @param {boolean} [opts.showCrown=false] - أظهر تاجاً أعلى البطاقة (عادة لبطاقة الفائز الرئيسية فقط)
         * @param {string} [opts.crownIconDataUri] - data URI لصورة تاج مخصَّصة (اختياري) — لو ما مُرِّرت وshowCrown=true، تُستخدَم أيقونة تاج افتراضية مشتركة (DEFAULT_CROWN_DATA_URI) تلقائياً، فأي لعبة تضمن بطاقة كاملة بدون إعداد إضافي
         * @param {string} [opts.extra] - HTML إضافي حر (اختياري) يُعرض بين الاسم والنقاط — استخدم كلاس agp-trophy-extra للتنسيق الموحَّد
         * @param {string} [opts.pointsHtml] - HTML جاهز لعرض النقاط (كل لعبة تبنيه بنفسها حسب منطق نقاطها/حسابها الخاص) — استخدم كلاسات agp-trophy-points/agp-points-earned/agp-points-sub/agp-points-noaccount للتنسيق الموحَّد
         * @param {string} [opts.cls] - كلاس إضافي على عنصر البطاقة نفسه
         * @param {string} [opts.cardId] - id على عنصر البطاقة (مفيد لاستهداف تأثير احتفالي مثل confetti)
         * @returns {string} HTML لبطاقة واحدة
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
