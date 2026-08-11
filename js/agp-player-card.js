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
 * ⚠️ [0.44.4] قالب صور الإطارات (Frame Template) — **تغيّر بالكامل**،
 *   بعد ما تأكَّدنا من مصدر حقيقي (فحص فعلي لملف frame-founder.png
 *   المرفوع فعلاً على الإنتاج عبر DevTools: 1254×1254px — صورة مربّعة
 *   1:1) أن القالب القديم (بطاقة عريضة 3.2:1 فيها دائرة صورة + صندوق
 *   اسم جنبها) كان لا يطابق شكل الصور الحقيقية المرفوعة إطلاقاً، فكان
 *   يُمطّها أفقياً بقوة ويشوّه شكلها بالكامل باللوبي. القالب الجديد
 *   (بقرار صريح من صاحب المشروع، بدل إعادة تصميم كل ملفات الإطارات):
 *   - القماشة (Canvas) **مربّعة دائماً (1:1)**، PNG شفاف — نفس شكل
 *     الإطارات الحالية بالضبط (ميدالية/حلقة زخرفية دائرية).
 *   - الصورة الشخصية تظهر **بمنتصف القماشة تماماً**، بقطر = 62% من
 *     عرض/ارتفاع القماشة (توسيط أفقي وعمودي كامل) — الإطار نفسه يُرسَم
 *     **فوق** الصورة الشخصية مباشرة (`background-size:contain`، بدون
 *     أي تمديد/تشويه مهما كانت نسبة الصورة الفعلية).
 *   - الاسم **لم يعد جزءاً من القماشة إطلاقاً** — يظهر كنص عادي بجانب
 *     الدائرة المؤطَّرة (نفس أسلوب البطاقة الأساسية)، بدل صندوق ثابت
 *     داخل الصورة نفسها. هذا أبسط وأكثر أماناً (لا يعتمد على تصميم
 *     الرسّام لصندوق اسم دقيق داخل كل ملف).
 *   ⚠️ نسبة 62% رقم افتراضي معقول (يترك هامش ظاهر للحلقة/الزخرفة حول
 *   الصورة) — قابل للتعديل بسهولة من AVATAR_SIZE_PCT أدناه لو الشكل
 *   الفعلي بعد الرفع يحتاج ضبطاً (أصغر/أكبر) حسب تصميم كل ملف إطار.
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

    // ⚠️ [0.44.4] ثابتة القالب الجديد — راجع تعليق "قالب صور الإطارات"
    // أعلى الملف. غيّر هذا الرقم فقط لو احتجت تكبير/تصغير حجم الصورة
    // الشخصية نسبةً لحجم إطارها (كل الإطارات تستخدم نفس النسبة).
    var RING_BOX_PX = 52;       // حجم مربّع منطقة (الإطار + الصورة) بالبكسل
    var AVATAR_SIZE_PCT = 62;   // % قطر الصورة الشخصية من حجم المربّع، بالمنتصف تماماً

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

            /* ---- [0.44.4] البطاقة المؤطَّرة (إطار مفعَّل — اللوبي فقط) ----
             * قماشة مربّعة 1:1 (raqm RING_BOX_PX) بدون أي تمديد/تشويه —
             * الصورة الشخصية بالمنتصف تماماً، والإطار مرسوم فوقها كاملاً
             * بنفس أبعاد المربّع (contain = لا تمديد حتى لو الصورة مش
             * مربّعة تماماً بالضبط لأي سبب). الاسم نص عادي بجانبها، مو
             * جزءاً من الصورة. */
            '.agp-pcard-ring-wrap{position:relative;width:' + RING_BOX_PX + 'px;height:' + RING_BOX_PX + 'px;flex-shrink:0;}',
            '.agp-pcard-ring-avatar{position:absolute;left:50%;top:50%;width:' + AVATAR_SIZE_PCT + '%;height:' + AVATAR_SIZE_PCT + '%;',
            'transform:translate(-50%,-50%);border-radius:50%;object-fit:cover;background:#5a2585;z-index:1;}',
            '.agp-pcard-ring-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#f3eefc;font-weight:800;font-size:0.75em;}',
            '.agp-pcard-ring-frame-img{position:absolute;left:0;top:0;width:100%;height:100%;',
            'background-repeat:no-repeat;background-position:center center;background-size:contain;',
            'z-index:2;pointer-events:none;}'
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
     * ⚠️ [0.44.4] بطاقة مؤطَّرة — أُعيد بناؤها بالكامل بالقالب المربّع
     * الجديد (راجع تعليق القالب أعلى الملف). تُستخدَم فقط لو showFrame
     * صحيح وplayer.frame موجود.
     */
    function renderFramedHtml(player, opts) {
        var name = (player && player.name) || (player && player.id) || '—';
        var avatarUrl = player && player.avatarUrl;
        var basePath = (opts && opts.basePath) || '';
        var frameSrc = basePath + player.frame.imageFilename;

        var avatarHtml = avatarUrl
            ? '<img class="agp-pcard-ring-avatar" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;agp-pcard-ring-avatar agp-pcard-ring-avatar--fallback&quot;>' + escapeHtml(initials(name)) + '</div>\';">'
            : '<div class="agp-pcard-ring-avatar agp-pcard-ring-avatar--fallback">' + escapeHtml(initials(name)) + '</div>';

        return '<span class="agp-pcard' + (opts && opts.outClass ? ' ' + opts.outClass : '') + '">' +
            '<span class="agp-pcard-ring-wrap">' +
                avatarHtml +
                '<span class="agp-pcard-ring-frame-img" style="background-image:url(' + escapeHtml(frameSrc) + ')"></span>' +
            '</span>' +
            '<span class="agp-pcard-name-basic" data-agp-pcard-name="1">' + escapeHtml(name) + '</span>' +
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
            var MAX_FONT = 13, MIN_FONT = 9;
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
