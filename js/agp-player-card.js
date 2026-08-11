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
 * يعتمد هذا الملف على js/agp-core.js فقط (لـ AGP.log) — لا اعتماد على
 * أي وحدة لعبة أو AGP.gameShell.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }

    var STYLE_ID = 'agp-pcard-styles';

    var CARD_HEIGHT_PX = 72; // ارتفاع البطاقة المعروضة باللوبي (ثابت للكل — العرض يختلف حسب نسبة كل إطار)

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
        'frame-floral.png': {
            canvasW: 1536, canvasH: 1024, contentTop: 160, contentHeight: 615,
            avatarLeftPct: 9.38, avatarTopPct: 21.3, avatarWidthPct: 22.92, avatarHeightPct: 57.72,
            nameLeftPct: 37.96, nameTopPct: 36.91, nameWidthPct: 55.27, nameHeightPct: 34.63
        },
        'frame-ice.png': {
            canvasW: 1536, canvasH: 1024, contentTop: 175, contentHeight: 514,
            avatarLeftPct: 8.07, avatarTopPct: 18.48, avatarWidthPct: 22.59, avatarHeightPct: 64.98,
            nameLeftPct: 34.7, nameTopPct: 37.35, nameWidthPct: 59.24, nameHeightPct: 34.44
        },
        'frame-blacksteel.png': {
            canvasW: 1254, canvasH: 1254, contentTop: 399, contentHeight: 409,
            avatarLeftPct: 7.26, avatarTopPct: 11.74, avatarWidthPct: 24.88, avatarHeightPct: 77.02,
            nameLeftPct: 30.62, nameTopPct: 31.05, nameWidthPct: 64.75, nameHeightPct: 54.77
        },
        'frame-phoenix.png': {
            canvasW: 1254, canvasH: 1254, contentTop: 234, contentHeight: 687,
            avatarLeftPct: 12.44, avatarTopPct: 37.99, avatarWidthPct: 26.16, avatarHeightPct: 48.18,
            nameLeftPct: 47.85, nameTopPct: 54.73, nameWidthPct: 42.26, nameHeightPct: 19.65
        },
        'frame-purple.png': {
            canvasW: 1536, canvasH: 1024, contentTop: 212, contentHeight: 535,
            avatarLeftPct: 8.07, avatarTopPct: 15.89, avatarWidthPct: 23.63, avatarHeightPct: 69.35,
            nameLeftPct: 39.45, nameTopPct: 37.94, nameWidthPct: 55.01, nameHeightPct: 32.71
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

            /* ---- [0.44.8] البطاقة المؤطَّرة (إطار مفعَّل — اللوبي فقط) ----
             * هذا الكلاس يحدد فقط الخصائص الثابتة المشتركة بين كل
             * الإطارات (الموضع/الطبقات/شكل النص). أما القياسات المتغيرة
             * فعلياً بين إطار وآخر (العرض/الارتفاع الحقيقيين، إزاحة
             * القص، موقع/حجم الصورة والاسم) فتُحقَن inline لكل بطاقة
             * حسب FRAME_TEMPLATES[imageFilename] — راجع
             * buildFramedInlineStyles أدناه. */
            '.agp-pcard-tpl{display:inline-block;position:relative;height:' + CARD_HEIGHT_PX + 'px;',
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
    function computeLayout(tpl) {
        var scale = CARD_HEIGHT_PX / tpl.contentHeight;
        var cardWidthPx = Math.round(tpl.canvasW * scale * 100) / 100;
        var frameImgWidthPx = cardWidthPx; // القص أفقي غير مطلوب (المحتوى يمتد شبه حافة-لحافة بكل الملفات المفحوصة)
        var frameImgHeightPx = Math.round(tpl.canvasH * scale * 100) / 100;
        var frameTopOffsetPx = Math.round(-(tpl.contentTop * scale) * 100) / 100;
        return {
            cardWidthPx: cardWidthPx,
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
        var avatarHtml = avatarUrl
            ? '<img class="agp-pcard-avatar-basic" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;agp-pcard-avatar-basic agp-pcard-avatar-basic--fallback&quot;>' + escapeHtml(initials(name)) + '</div>\';">'
            : '<div class="agp-pcard-avatar-basic agp-pcard-avatar-basic--fallback">' + escapeHtml(initials(name)) + '</div>';

        return '<span class="agp-pcard' + (opts && opts.outClass ? ' ' + opts.outClass : '') + '">' +
            avatarHtml +
            '<span class="agp-pcard-name-basic" data-agp-pcard-name="1">' + escapeHtml(name) + '</span>' +
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
        var layout = computeLayout(tpl);

        var wrapStyle = 'width:' + layout.cardWidthPx + 'px';
        var avatarStyle = 'left:' + tpl.avatarLeftPct + '%;top:' + tpl.avatarTopPct + '%;' +
            'width:' + tpl.avatarWidthPct + '%;height:' + tpl.avatarHeightPct + '%;';
        var frameImgStyle = 'top:' + layout.frameTopOffsetPx + 'px;' +
            'width:' + layout.frameImgWidthPx + 'px;height:' + layout.frameImgHeightPx + 'px;' +
            'background-size:' + layout.frameImgWidthPx + 'px ' + layout.frameImgHeightPx + 'px;' +
            'background-image:url(' + escapeHtml(frameSrc) + ')';
        var nameStyle = 'left:' + tpl.nameLeftPct + '%;top:' + tpl.nameTopPct + '%;' +
            'width:' + tpl.nameWidthPct + '%;height:' + tpl.nameHeightPct + '%;';

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
