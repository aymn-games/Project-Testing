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
 * ⚠️ قالب صور الإطارات (Frame Template) — ثابت، كل إطار (كتالوج أو
 *   مخصّص يرفعه الأدمن) *يجب* يلتزم به بالضبط:
 *   - نسبة القماشة (Canvas) width:height = 3.2 : 1 بالضبط (PNG شفاف).
 *   - فتحة الصورة (دائرية): القطر = 90% من ارتفاع القماشة، بمنتصف
 *     القماشة عمودياً، وهامش 5% من عرض القماشة من الحافة اليسرى.
 *   - فتحة الاسم (مستطيلة): تبدأ بعد حافة الدائرة اليمنى + هامش 4% من
 *     عرض القماشة، وتمتد لين 96% من عرض القماشة. الارتفاع 65% من
 *     ارتفاع القماشة، بمنتصف القماشة عمودياً. **حجم هذا الصندوق ثابت
 *     دائماً** — الاسم الطويل يصغّر حجم خطه تلقائياً (راجع fitAllNames
 *     أدناه)، ما يتمدد الصندوق نفسه.
 *   الأرقام المشتقة أدناه بالكود (37.125%، 58.875%...) محسوبة من هذي
 *   النسب مباشرة — لو تغيّرت النسب لازم تُحدَّث هنا فقط (مكان واحد).
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

    // ⚠️ ثابتة من قالب الإطار الموثَّق أعلى الملف — لا تُغيَّر إلا لو
    // تغيّرت مواصفات القالب نفسها (وقتها حدّثها هنا فقط).
    var FRAME_RATIO = 3.2; // width:height
    var AVATAR_HEIGHT_PCT = 90; // % من ارتفاع القماشة
    var AVATAR_LEFT_PCT = 5;    // % من عرض القماشة
    var AVATAR_TOP_PCT = (100 - AVATAR_HEIGHT_PCT) / 2; // = 5% (توسيط عمودي)
    var AVATAR_WIDTH_PCT = AVATAR_HEIGHT_PCT / FRAME_RATIO; // = 28.125% من عرض القماشة
    var NAME_GAP_PCT = 4;   // % من عرض القماشة، بعد حافة الدائرة اليمنى
    var NAME_RIGHT_MARGIN_PCT = 4; // % من عرض القماشة (يمتد لين 96%)
    var NAME_LEFT_PCT = AVATAR_LEFT_PCT + AVATAR_WIDTH_PCT + NAME_GAP_PCT; // = 37.125%
    var NAME_WIDTH_PCT = (100 - NAME_RIGHT_MARGIN_PCT) - NAME_LEFT_PCT;   // = 58.875%
    var NAME_HEIGHT_PCT = 65;
    var NAME_TOP_PCT = (100 - NAME_HEIGHT_PCT) / 2; // = 17.5%

    var CARD_HEIGHT_PX = 56; // مقاس البطاقة المؤطَّرة (الأساسية بتصميم مختلف، راجع CSS)

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
            /* ---- البطاقة الأساسية (بدون إطار) ----
             * ⚠️ [0.47.0] الخلفية البيضاوية الشفافة + الحدود البنفسجية
             * حول الصورة+الاسم أُلغيتا بالكامل بطلب صريح.
             * ⚠️ [0.48.0] رجع حدّ (border) رفيع شفاف فقط حول البطاقة —
             * بدون أي تعبئة/خلفية خلفه (مو نفس الخلفية القديمة قبل
             * [0.47.0]) — بطلب صريح لاحق. هذا مكوّن مشترك (AGP.playerCard)،
             * فالتأثير يشمل تلقائياً كل الأماكن اللي تستخدمه: اللوبي
             * الرئيسي، اللوبي الفرعي (منتصف المباراة)، قائمة لاعبين شاشة
             * الإعدادات، وقائمة مرشّحي نافذة الإقصاء/الإرجاع.
             */
            '.agp-pcard{display:inline-flex;align-items:center;gap:8px;',
            'max-width:220px;box-sizing:border-box;padding:4px 12px;',
            'border:1px solid rgba(255,255,255,0.28);border-radius:999px;background:transparent;',
            'font-family:Cairo,sans-serif;direction:rtl;vertical-align:middle;}',
            '.agp-pcard--out{opacity:0.45;text-decoration:line-through;}',

            '.agp-pcard-avatar-basic{width:32px;height:32px;border-radius:50%;flex-shrink:0;',
            'object-fit:cover;border:2px solid rgba(255,255,255,0.55);background:#5a2585;}',
            '.agp-pcard-avatar-basic--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#f3eefc;font-size:0.72em;font-weight:800;}',

            '.agp-pcard-name-basic{font-size:0.85em;font-weight:700;color:#f3eefc;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',

            /* ---- البطاقة المؤطَّرة (إطار مفعَّل — اللوبي فقط) ---- */
            '.agp-pcard-framed{position:relative;display:inline-block;height:' + CARD_HEIGHT_PX + 'px;',
            'aspect-ratio:' + FRAME_RATIO + '/1;background-repeat:no-repeat;background-size:100% 100%;',
            'vertical-align:middle;}',
            '.agp-pcard-framed .agp-pcard-avatar-framed{position:absolute;',
            'left:' + AVATAR_LEFT_PCT + '%;top:' + AVATAR_TOP_PCT + '%;height:' + AVATAR_HEIGHT_PCT + '%;',
            'aspect-ratio:1/1;border-radius:50%;object-fit:cover;background:#5a2585;}',
            '.agp-pcard-framed .agp-pcard-avatar-framed--fallback{display:flex;align-items:center;',
            'justify-content:center;color:#f3eefc;font-weight:800;font-size:0.8em;}',
            '.agp-pcard-framed .agp-pcard-name-framed{position:absolute;',
            'left:' + NAME_LEFT_PCT + '%;top:' + NAME_TOP_PCT + '%;width:' + NAME_WIDTH_PCT + '%;height:' + NAME_HEIGHT_PCT + '%;',
            'display:flex;align-items:center;justify-content:center;overflow:hidden;',
            'font-weight:800;color:#2c1240;text-align:center;line-height:1.1;white-space:nowrap;',
            'text-overflow:ellipsis;padding:0 2px;box-sizing:border-box;}'
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
     * بطاقة مؤطَّرة بإطار اللاعب المفعَّل — تُستخدَم فقط لو showFrame
     * صحيح وplayer.frame موجود (راجع تعليق القالب أعلى الملف).
     */
    function renderFramedHtml(player, opts) {
        var name = (player && player.name) || (player && player.id) || '—';
        var avatarUrl = player && player.avatarUrl;
        var basePath = (opts && opts.basePath) || '';
        var frameSrc = basePath + player.frame.imageFilename;

        var avatarHtml = avatarUrl
            ? '<img class="agp-pcard-avatar-framed" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;agp-pcard-avatar-framed agp-pcard-avatar-framed--fallback&quot; style=&quot;left:' + AVATAR_LEFT_PCT + '%;top:' + AVATAR_TOP_PCT + '%;height:' + AVATAR_HEIGHT_PCT + '%;&quot;>' + escapeHtml(initials(name)) + '</div>\';">'
            : '<div class="agp-pcard-avatar-framed agp-pcard-avatar-framed--fallback">' + escapeHtml(initials(name)) + '</div>';

        return '<span class="agp-pcard-framed" style="background-image:url(' + escapeHtml(frameSrc) + ')">' +
            avatarHtml +
            '<span class="agp-pcard-name-framed" data-agp-pcard-name="1">' + escapeHtml(name) + '</span>' +
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
