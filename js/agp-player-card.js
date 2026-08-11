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
 * ⚠️ [0.44.5] قالب صور الإطارات (Frame Template) — **مُعاد قياسه من
 *   الملف الفعلي النهائي** (frame-founder.png كما رُفع فعلياً على
 *   GitHub)، بعد ما تبيّن أنه مختلف عن أول معاينة JPEG أُرسِلت (كانت
 *   1090×843 بخلفية بيضاء صلبة، ودائرة الصورة يمين/بلاطة الاسم يسار).
 *   الملف الفعلي: PNG 1254×1254 بقناة ألفا شفافة حقيقية (تحقّقتُ منه
 *   مباشرة — mode=RGBA، أكثر من 1.19 مليون بكسل alpha=0)، دائرة الصورة
 *   **يسار** وفتحتها شفافة فعلياً (لا شعار نخلة معتم كالمعاينة الأولى)،
 *   وبلاطة الاسم **يمين** وفاضية تماماً من أي نص مرسوم مسبقاً. القياسات
 *   أدناه مقاسة بالبكسل مباشرة من هذا الملف (تحليل قناة الألفا +
 *   Connected-Components عبر Python/PIL/SciPy، تحقّق بصري بعد ذلك عبر
 *   عرض حقيقي بـChromium/Playwright) — راجع ثوابت *_PCT وCARD_ وFRAME_
 *   أدناه.
 *
 *   ⚠️ ملاحظة صادقة: الملف الفعلي فيه هامش شفاف كبير أعلى/أسفل التصميم
 *   نفسه داخل القماشة المربّعة 1254×1254 (المحتوى الفعلي يشغل فقط
 *   الشريط الرأسي من y=254 إلى y=867 تقريباً، أي CONTENT_TOP_PX/
 *   CONTENT_HEIGHT_PX أدناه) — بدل عرض القماشة كاملة (يعطي بطاقة مربّعة
 *   ضخمة فيها فراغ شفاف كبير أعلى/أسفل)، الكود "يقصّ" هذا الهامش بصرياً
 *   عبر CSS فقط (حاوية بارتفاع ثابت + overflow:hidden + صورة خلفية
 *   أكبر من الحاوية بإزاحة سالبة للأعلى) **دون أي تعديل على ملف الصورة
 *   نفسه** — نفس الملف المرفوع فعلياً على GitHub يُستخدَم كما هو تماماً.
 *   هذا القص يفترض أن الإطارات الأربعة عشر الأخرى (المستقبلية) تتّبع
 *   نفس القماشة 1254×1254 ونفس هامش القص هذا بالضبط (بما إنها قالب
 *   موحّد) — لو ملف إطار مستقبلي مختلف بحجم القماشة أو هامشه، هذي
 *   الثوابت تحتاج مراجعة لذلك الملف تحديداً.
 *
 *   - القماشة الأصلية (Canvas): مربّعة CANVAS_SIZE×CANVAS_SIZE بالضبط.
 *   - نافذة القص الرأسي المعروضة: من CONTENT_TOP_PX بارتفاع
 *     CONTENT_HEIGHT_PX (بالبكسل الأصلي)، بدون أي قص أفقي (المحتوى
 *     يمتد أصلاً شبه حافة-لحافة أفقياً، فلا هامش أفقي يُهدَر).
 *   - بلاطة الاسم: مستطيل بموقع/حجم NAME_LEFT_PCT/NAME_TOP_PCT/
 *     NAME_WIDTH_PCT/NAME_HEIGHT_PCT (% من الحاوية المعروضة بعد القص)
 *     — الاسم الحقيقي للاعب يُرسَم هنا كنص عادي (يصغّر تلقائياً لو
 *     طويل، راجع fitAllNames)، **فوق** طبقة القماشة مباشرة.
 *   - دائرة الصورة: بموقع/حجم AVATAR_LEFT_PCT/AVATAR_TOP_PCT/
 *     AVATAR_WIDTH_PCT/AVATAR_HEIGHT_PCT (% من نفس الحاوية) — الصورة
 *     الشخصية الحقيقية تُرسَم هنا **خلف** طبقة القماشة (z-index أقل)،
 *     فيظهر إطارها الذهبي/الزخرفي فوقها تلقائياً من نفس ملف القماشة.
 *
 *   ⚠️ متطلبات الملف الفعلي المرفوع (الثلاثة كلها **مؤكَّدة متوفرة**
 *   بالملف الحالي frame-founder.png بعد فحص مباشر — وثّقتها هنا فقط
 *   كمرجع لأي إطار جديد يُضاف لاحقاً من نفس القالب):
 *   1. PNG بخلفية شفافة حقيقياً (قناة ألفا فعلية، لا JPEG بخلفية بيضاء).
 *   2. منطقة دائرة الصورة شفافة فعلياً (فتحة حقيقية، لا أي رسمة معتمة
 *      داخلها) — حتى تظهر الصورة الشخصية الحقيقية لكل لاعب بدون تراكب.
 *   3. بلاطة الاسم فاضية تماماً من أي نص مرسوم مسبقاً — الكود يرسم اسم
 *      كل لاعب الحقيقي فوق هذي المنطقة تلقائياً.
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

    // ⚠️ [0.44.5] ثوابت القالب — مقاسة فعلياً من الملف الحقيقي المرفوع
    // (frame-founder.png، PNG شفاف 1254×1254px)، راجع تعليق القالب أعلى
    // الملف لتفاصيل كيفية القياس والتحقّق. غيّر هذي الأرقام فقط لو تغيّر
    // الملف الفعلي المرفوع لاحقاً (مكان واحد يُطبَّق على كل الإطارات).
    var CANVAS_SIZE = 1254;          // القماشة الأصلية مربّعة
    var CONTENT_TOP_PX = 254;        // بداية الشريط المحتوي فعلياً (بالبكسل الأصلي)
    var CONTENT_HEIGHT_PX = 613;     // ارتفاع الشريط المحتوي فعلياً (بالبكسل الأصلي)

    var CARD_HEIGHT_PX = 72;         // ارتفاع البطاقة المعروضة باللوبي (بعد القص)
    var _scale = CARD_HEIGHT_PX / CONTENT_HEIGHT_PX;
    var CARD_WIDTH_PX = Math.round(CANVAS_SIZE * _scale * 100) / 100;   // 147.29
    var FRAME_IMG_SIZE_PX = CARD_WIDTH_PX;                              // القماشة كاملة معروضة (مربّعة) قبل القص بـoverflow:hidden
    var FRAME_TOP_OFFSET_PX = Math.round(-(CONTENT_TOP_PX * _scale) * 100) / 100; // -29.83

    // النسب أفقياً محسوبة من عرض القماشة الكاملة (لا قص أفقي)، ورأسياً
    // من ارتفاع الشريط المحتوي فقط (بعد القص) — راجع الشرح أعلى الملف.
    var NAME_LEFT_PCT = 42.11;
    var NAME_TOP_PCT = 51.55;
    var NAME_WIDTH_PCT = 47.13;
    var NAME_HEIGHT_PCT = 21.86;

    var AVATAR_LEFT_PCT = 9.73;
    var AVATAR_TOP_PCT = 33.12;
    var AVATAR_WIDTH_PCT = 24.24;
    var AVATAR_HEIGHT_PCT = 51.71;

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
            /* ---- البطاقة الأساسية (بدون إطار) ---- */
            '.agp-pcard{display:inline-flex;align-items:center;gap:8px;',
            'background:rgba(255,255,255,0.08);border:1px solid rgba(216,120,255,0.3);',
            'border-radius:999px;padding:4px 14px 4px 4px;max-width:220px;box-sizing:border-box;',
            'font-family:Cairo,sans-serif;direction:rtl;vertical-align:middle;}',
            '.agp-pcard--out{opacity:0.45;text-decoration:line-through;}',

            '.agp-pcard-avatar-basic{width:32px;height:32px;border-radius:50%;flex-shrink:0;',
            'object-fit:cover;border:2px solid rgba(255,255,255,0.55);background:#5a2585;}',
            '.agp-pcard-avatar-basic--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#f3eefc;font-size:0.72em;font-weight:800;}',

            '.agp-pcard-name-basic{font-size:0.85em;font-weight:700;color:#f3eefc;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',

            /* ---- [0.44.5] البطاقة المؤطَّرة (إطار مفعَّل — اللوبي فقط) ----
             * حاوية بحجم ثابت (CARD_WIDTH_PX×CARD_HEIGHT_PX) مع
             * overflow:hidden، وطبقة القماشة بالحجم الأصلي الكامل
             * (مربّعة) بإزاحة سالبة للأعلى (FRAME_TOP_OFFSET_PX) — هذا
             * "يقصّ" الهامش الشفاف أعلى/أسفل الملف الأصلي بصرياً بدون أي
             * تعديل على الملف نفسه. الصورة الشخصية تُرسَم خلفها، والاسم
             * فوقها، كلاهما بمواقع مقاسة (% من الحاوية بعد القص). */
            '.agp-pcard-tpl{display:inline-block;position:relative;width:' + CARD_WIDTH_PX + 'px;height:' + CARD_HEIGHT_PX + 'px;',
            'overflow:hidden;flex-shrink:0;vertical-align:middle;}',
            '.agp-pcard-tpl-avatar{position:absolute;left:' + AVATAR_LEFT_PCT + '%;top:' + AVATAR_TOP_PCT + '%;',
            'width:' + AVATAR_WIDTH_PCT + '%;height:' + AVATAR_HEIGHT_PCT + '%;border-radius:50%;',
            'object-fit:cover;background:#5a2585;z-index:1;}',
            '.agp-pcard-tpl-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#f3eefc;font-weight:800;font-size:0.75em;}',
            '.agp-pcard-tpl-frame-img{position:absolute;left:0;top:' + FRAME_TOP_OFFSET_PX + 'px;',
            'width:' + FRAME_IMG_SIZE_PX + 'px;height:' + FRAME_IMG_SIZE_PX + 'px;',
            'background-repeat:no-repeat;background-position:0 0;',
            'background-size:' + FRAME_IMG_SIZE_PX + 'px ' + FRAME_IMG_SIZE_PX + 'px;',
            'z-index:2;pointer-events:none;}',
            '.agp-pcard-tpl-name{position:absolute;left:' + NAME_LEFT_PCT + '%;top:' + NAME_TOP_PCT + '%;',
            'width:' + NAME_WIDTH_PCT + '%;height:' + NAME_HEIGHT_PCT + '%;z-index:3;',
            'display:flex;align-items:center;justify-content:center;overflow:hidden;',
            'font-weight:800;color:#fff;text-align:center;line-height:1.1;white-space:nowrap;',
            'text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.6);box-sizing:border-box;}'
        ].join('');
        document.head.appendChild(style);
    }

    /**
     * بطاقة أساسية (صورة + اسم، بدون إطار) — تُستخدَم دائماً لو
     * showFrame غير مفعَّل، أو اللاعب بدون إطار مفعَّل أصلاً.
     */
    function renderBasicHtml(player, opts) {
        var name = (player && player.name) || (player && player.id) || '—';
        var avatarUrl = player && player.avatarUrl;
        var avatarHtml = avatarUrl
            ? '<img class="agp-pcard-avatar-basic" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;agp-pcard-avatar-basic agp-pcard-avatar-basic--fallback&quot;>' + escapeHtml(initials(name)) + '</div>\';">'
            : '<div class="agp-pcard-avatar-basic agp-pcard-avatar-basic--fallback">' + escapeHtml(initials(name)) + '</div>';

        return '<span class="agp-pcard' + (opts && opts.outClass ? ' ' + opts.outClass : '') + '">' +
            avatarHtml +
            '<span class="agp-pcard-name-basic" data-agp-pcard-name="1">' + escapeHtml(name) + '</span>' +
            '</span>';
    }

    /**
     * ⚠️ [0.44.5] بطاقة مؤطَّرة — قماشة واحدة مقصوصة (صورة خلف + اسم
     * فوق، كلاهما بمواقع مقاسة من الملف الفعلي). راجع تعليق القالب أعلى
     * الملف. تُستخدَم فقط لو showFrame صحيح وplayer.frame موجود.
     */
    function renderFramedHtml(player, opts) {
        var name = (player && player.name) || (player && player.id) || '—';
        var avatarUrl = player && player.avatarUrl;
        var basePath = (opts && opts.basePath) || '';
        var frameSrc = basePath + player.frame.imageFilename;

        var avatarHtml = avatarUrl
            ? '<img class="agp-pcard-tpl-avatar" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;agp-pcard-tpl-avatar agp-pcard-tpl-avatar--fallback&quot; style=&quot;left:' + AVATAR_LEFT_PCT + '%;top:' + AVATAR_TOP_PCT + '%;width:' + AVATAR_WIDTH_PCT + '%;height:' + AVATAR_HEIGHT_PCT + '%;&quot;>' + escapeHtml(initials(name)) + '</div>\';">'
            : '<div class="agp-pcard-tpl-avatar agp-pcard-tpl-avatar--fallback" style="left:' + AVATAR_LEFT_PCT + '%;top:' + AVATAR_TOP_PCT + '%;width:' + AVATAR_WIDTH_PCT + '%;height:' + AVATAR_HEIGHT_PCT + '%;">' + escapeHtml(initials(name)) + '</div>';

        return '<span class="agp-pcard-tpl' + (opts && opts.outClass ? ' ' + opts.outClass : '') + '">' +
            avatarHtml +
            '<span class="agp-pcard-tpl-frame-img" style="background-image:url(' + escapeHtml(frameSrc) + ')"></span>' +
            '<span class="agp-pcard-tpl-name" data-agp-pcard-name="1">' + escapeHtml(name) + '</span>' +
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
            var MAX_FONT = 13, MIN_FONT = 8;
            var nodes = rootEl.querySelectorAll('[data-agp-pcard-name="1"]');
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var fontSize = MAX_FONT;
                node.style.fontSize = fontSize + 'px';
                while (node.scrollWidth > node.clientWidth && fontSize > MIN_FONT) {
                    fontSize -= 1;
                    node.style.fontSize = fontSize + 'px';
                }
                // لسا فايض حتى بأصغر حجم مقروء — القص بـellipsis (CSS
                // موجود أصلاً بالـCSS) يتكفّل بالباقي.
            }
        }
    };

    AGP.log('AGP Player Card loaded (shared avatar+name[+frame] card for all games).');

}(window.AymanGamesPlatform));
