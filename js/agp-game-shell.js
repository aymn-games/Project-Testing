/**
 * ==========================================================================
 *  AGP GAME SHELL — وحدة مشتركة قابلة لإعادة الاستخدام لكل الألعاب
 * ==========================================================================
 *
 * ⚠️ قرار معماري: كل لعبة تحمّل هذا الملف بنفسها (مع AGP Core كاملاً
 *   قبله) وتُدير هي نفسها دورة إعدادات/اتصال/لوبي/بدء الجولة.
 *
 * لا تعديل على AGP Core — يستخدم فقط الواجهات العامة الموجودة أصلاً.
 *
 * ⚠️ الأيقونات: تُمرَّر كمسار نسبي (icon: 'icons/xxx.png') من كل لعبة —
 *   لا أيقونات مضمَّنة بهذا الملف نفسه، حتى يبقى عاماً لأي لعبة بأيقوناتها
 *   الخاصة. الأيقونتان gear.svg (زر الإعدادات بالهيدر) وأي أيقونة حقل
 *   تُحمَّل من مجلد اللعبة نفسها (icons/) عبر _config.headerGearIcon
 *   و field.icon.
 *
 * أنواع حقول الإعدادات: 'pill-choice' (خياران)، 'pill-group' (أكثر)،
 *   'counter' (+/-)، 'toggle' (توافق قديم). كل حقل يقبل icon (مسار صورة)
 *   و showWhen:{key,equals} (رؤية شرطية).
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.gameManager || !AGP.streamConnector || !AGP.keywordManager) {
        console.error('[AGP Game Shell] AGP Core not loaded yet — load js/agp-core.js and friends first.');
        return;
    }

    var _config = null;
    var _overlayEl = null;
    var _settingsValues = {};
    var _lastKeyword = '';

    // ⚠️ [إصلاح خلل حقيقي] تصير true فور بدء الجولة (زر "انهاء وبدء
    // الجولة") ولا ترجع false إلا بإعادة تحميل الصفحة (مباراة جديدة —
    // نفس أسلوب اللعبة نفسها). راجع تعليق مستمع stream:statusChanged
    // أدناه لسبب وجودها.
    var _roundStarted = false;

    function el(id) { return document.getElementById(id); }

    function injectStyles() {
        var fontLink1 = document.createElement('link');
        fontLink1.rel = 'preconnect';
        fontLink1.href = 'https://fonts.googleapis.com';
        document.head.appendChild(fontLink1);

        var fontLink2 = document.createElement('link');
        fontLink2.rel = 'preconnect';
        fontLink2.href = 'https://fonts.gstatic.com';
        fontLink2.crossOrigin = 'anonymous';
        document.head.appendChild(fontLink2);

        var fontLink3 = document.createElement('link');
        fontLink3.rel = 'stylesheet';
        fontLink3.href = 'https://fonts.googleapis.com/css2?family=Cairo+Play:wght@200..1000&display=swap';
        document.head.appendChild(fontLink3);

        var style = document.createElement('style');
        style.textContent = [
            /* ⚠️ [0.44.0] ألوان المنصة الرسمية (مطابقة تماماً لمتغيرات CSS
             * الجذرية بـindex.html: --accent/--accent-2/--accent-pink) —
             * تُستخدَم هنا بدل الألوان اليدوية المتقاربة القديمة (#9b3fe0،
             * #22d3ee، #a855f7، #d878ff...) حتى تطابق هوية المنصة حرفياً،
             * بدون أي تغيير بصري غير ضروري (نفس البنية والتدرجات القديمة،
             * بس بقيم الألوان الرسمية). راجع docs/UI_GUIDELINES.md.
             */
            ':root{--agp-accent:#7c3aed;--agp-accent-2:#00c2ff;--agp-accent-pink:#ff4dff;}',

            'body.agp-shell-active{background:linear-gradient(170deg,#0b0616 0%,#2a0e3d 55%,#6d1fb0 100%);',
            'background-attachment:fixed;background-size:cover;min-height:100vh;}',

            '#agp-persistent-header{position:fixed;top:0;left:0;right:0;z-index:99998;display:flex;',
            'align-items:center;justify-content:space-between;padding:10px 20px;',
            'background:linear-gradient(90deg,rgba(20,8,35,0.9),rgba(60,15,90,0.85));',
            'border-bottom:1px solid rgba(124,58,237,0.35);font-family:Cairo,sans-serif;direction:rtl;}',
            '.agp-header-icon-btn{width:34px;height:34px;border-radius:50%;border:1px solid rgba(124,58,237,0.45);',
            'background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
            '.agp-header-icon-btn img{width:16px;height:16px;filter:invert(1);}',
            '#agp-header-title{background:rgba(0,0,0,0.35);border-radius:999px;padding:6px 22px;color:#e9d3ff;',
            'font-weight:700;font-size:0.9em;font-family:"Cairo Play",Cairo,sans-serif;}',
            '#agp-header-brand{color:#fff;font-weight:800;display:flex;align-items:center;gap:8px;}',
            '#agp-header-brand .agp-brand-badge{width:28px;height:28px;border-radius:8px;',
            'background:linear-gradient(90deg,var(--agp-accent-2),var(--agp-accent-pink));display:inline-flex;align-items:center;justify-content:center;',
            'color:#0b0616;font-weight:800;}',
            '#agp-header-brand .agp-brand-logo-img{height:46px;width:auto;}',
            '#agp-sponsor-banner{position:fixed;top:64px;right:20px;z-index:99997;width:300px;height:90px;',
            'border:1px dashed rgba(124,58,237,0.45);border-radius:10px;display:none;',
            'align-items:center;justify-content:center;color:#c9a8e0;font-size:0.8em;background:rgba(20,8,35,0.5);}',

            /* شاشة الإعدادات — ⚠️ [0.45.0] حجم 900×800 كحد أقصى (كان
             * 1300×800)، خلفية غامقة بتدرّج (884B98 → 2D1932، من فوق
             * لتحت) بدل التدرّج الفاتح القديم — بألوان محدَّدة صراحة،
             * ونصوص بيضاء تناسبها. height تبقى auto مع سقف 800px (نفس
             * إصلاح الفراغ الفارغ من [0.44.0]) بدل ثابتة، حتى لا يرجع نفس
             * الفراغ الفارغ. نفس الصندوق الأساسي (بدون كلاس إضافي) يُستخدم
             * أيضاً لشاشة الشرح ولوبي منتصف المباراة الجديد — فيرثان نفس
             * المظهر الغامق تلقائياً. */
            '#agp-shell-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;',
            'padding:80px 16px 16px;background:rgba(8,4,16,0.55);font-family:Cairo,sans-serif;color:#fff;direction:rtl;}',
            '#agp-shell-box{width:900px;max-width:96vw;height:auto;max-height:800px;max-height:min(800px,92vh);overflow-y:auto;',
            'background:linear-gradient(180deg,#884B98,#2D1932);border:2px solid var(--agp-accent);border-radius:18px;padding:30px 34px;',
            'box-shadow:0 0 40px rgba(124,58,237,0.5);box-sizing:border-box;}',
            '#agp-shell-box h2{margin:0 0 20px;font-size:1.7em;text-align:center;color:#fff;font-weight:800;',
            'font-family:Almarai,Cairo,sans-serif;}',
            '.agp-shell-field{margin-bottom:14px;text-align:right;}',
            '.agp-shell-field label{display:flex;align-items:center;gap:6px;justify-content:flex-end;',
            'margin-bottom:6px;font-size:0.88em;color:#fff;font-weight:700;}',
            '.agp-shell-field label img,.agp-field-icon{width:18px;height:18px;}',
            '.agp-shell-field input[type=text]{width:100%;padding:10px;border-radius:10px;border:1px solid #b479e8;',
            'background:#fff;color:#2c1240;font-family:inherit;box-sizing:border-box;}',

            '.agp-shell-row{display:flex;align-items:center;justify-content:space-between;gap:10px;',
            'padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.18);}',
            '.agp-shell-row-label{display:flex;align-items:center;gap:6px;font-size:0.88em;color:#fff;font-weight:700;}',

            '.agp-pill-group{display:flex;gap:6px;flex-wrap:wrap;}',
            '.agp-pill-btn{border:1px solid var(--agp-accent);background:#fff;color:#5a2585;border-radius:999px;',
            'padding:6px 16px;font-family:inherit;font-size:0.82em;cursor:pointer;font-weight:700;}',
            '.agp-pill-btn.agp-pill-active{background:var(--agp-accent);color:#fff;}',

            '.agp-shell-counter-row{display:flex;align-items:center;gap:8px;}',
            '.agp-shell-counter-row button{width:26px;height:26px;border-radius:8px;border:1px solid var(--agp-accent);',
            'background:#fff;color:#5a2585;cursor:pointer;font-weight:800;}',
            '.agp-shell-counter-row span.agp-count-val{min-width:24px;text-align:center;font-weight:800;color:#fff;}',
            '.agp-count-input{width:48px;text-align:center;font-weight:800;color:#3a1560;border:1px solid var(--agp-accent);',
            'border-radius:6px;padding:3px;font-family:inherit;}',

            /* ⚠️ [0.45.0] شريط تمرير (slider) — يستبدل عداد +/- لمستوى الصوت. */
            '.agp-slider-wrap{display:flex;align-items:center;gap:10px;width:60%;}',
            '.agp-slider-input{flex:1;-webkit-appearance:none;appearance:none;height:6px;border-radius:999px;',
            'background:linear-gradient(90deg,var(--agp-accent-2),var(--agp-accent));outline:none;cursor:pointer;}',
            '.agp-slider-input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;',
            'border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#e5d8f5);',
            'box-shadow:0 2px 5px rgba(0,0,0,0.45);cursor:pointer;}',
            '.agp-slider-input::-moz-range-thumb{width:18px;height:18px;border-radius:50%;border:none;',
            'background:radial-gradient(circle at 35% 30%,#fff,#e5d8f5);box-shadow:0 2px 5px rgba(0,0,0,0.45);cursor:pointer;}',
            '.agp-slider-val{min-width:22px;text-align:center;font-weight:800;color:#fff;font-size:0.85em;}',

            /* ⚠️ [0.45.0] مفتاح تبديل "أكثر واقعية" — تدرّج + ظل داخلي على
             * المسار (يشبه سطح مادي محفور خفيف)، ومقبض بلمعان/ظل واضح
             * (يشبه زر فعلي مرفوع)، بدل الشكل المسطّح السابق. لا صور —
             * CSS فقط (gradients/box-shadow)، نفس data-key/_settingsValues. */
            '.agp-toggle-switch{position:relative;display:inline-block;width:46px;height:26px;flex-shrink:0;}',
            '.agp-toggle-switch input{opacity:0;width:0;height:0;position:absolute;}',
            '.agp-toggle-track{position:absolute;inset:0;background:linear-gradient(180deg,#d8c7ea,#b79bd1);',
            'border-radius:999px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.3),inset 0 -1px 1px rgba(255,255,255,0.25);',
            'transition:background 0.2s;cursor:pointer;}',
            '.agp-toggle-track::before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;',
            'background:radial-gradient(circle at 35% 30%,#ffffff,#d9d9d9);border-radius:50%;transition:transform 0.2s;',
            'box-shadow:0 2px 4px rgba(0,0,0,0.45),inset 0 -1px 1px rgba(0,0,0,0.12),inset 0 1px 1px rgba(255,255,255,0.7);}',
            '.agp-toggle-switch input:checked + .agp-toggle-track{background:linear-gradient(180deg,#9d5ff0,var(--agp-accent));',
            'box-shadow:inset 0 2px 4px rgba(0,0,0,0.35),inset 0 -1px 1px rgba(255,255,255,0.2);}',
            '.agp-toggle-switch input:checked + .agp-toggle-track::before{transform:translateX(-20px);}',

            '.agp-shell-btn-connect{width:100%;padding:13px;border:none;border-radius:999px;font-weight:800;',
            'cursor:pointer;background:linear-gradient(90deg,var(--agp-accent-2),var(--agp-accent));color:#0b0616;',
            'font-family:inherit;font-size:1em;margin-top:8px;}',

            /* شاشة "جاري الاتصال" — تطابق القالب البسيط المُرسَل (تبقى
             * فاتحة عمداً، غير مشمولة بطلب التغميق — شاشة عابرة قصيرة). */
            '#agp-shell-box.agp-connecting-box{width:min(460px,94vw);height:auto;background:linear-gradient(90deg,#f3eefc,#8b3fd6);',
            'text-align:center;padding:34px 26px;}',
            '#agp-shell-box.agp-connecting-box h2{color:#2c1240;font-size:1.3em;}',
            '#agp-shell-box.agp-connecting-box .agp-shell-status{color:#4a1f6e;}',
            '.agp-shell-status{text-align:center;color:#fff;font-size:0.9em;margin-bottom:12px;}',

            /* شاشة اللوبي — ⚠️ [0.44.0] خط Almarai أبرز، بدون شرطة طويلة
             * بالعنوان، شارة كلمة مفتاحية مميزة، عداد لاعبين X/الحد الأقصى. */
            '#agp-shell-box.agp-lobby-box{background:linear-gradient(170deg,#3a1560,#7a1fb8);',
            'border:2px solid var(--agp-accent-2);width:1440px;max-width:96vw;height:800px;max-height:90vh;',
            'display:flex;flex-direction:column;}',
            '#agp-shell-box.agp-lobby-box h2{color:#f3eefc;font-family:Almarai,Cairo,sans-serif;font-weight:800;font-size:1.8em;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-status{color:#e9d3ff;}',
            '.agp-join-hint{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;',
            'margin-bottom:14px;font-family:Almarai,Cairo,sans-serif;}',
            '.agp-join-hint-text{color:#e9d3ff;font-size:1em;}',
            '.agp-join-keyword-badge{display:inline-block;background:linear-gradient(90deg,var(--agp-accent-2),var(--agp-accent-pink));',
            'color:#0b0616;font-weight:900;font-size:1.35em;padding:6px 22px;border-radius:12px;',
            'box-shadow:0 0 18px rgba(0,194,255,0.55);letter-spacing:0.5px;}',
            /* ⚠️ [0.45.0] لوبي منتصف المباراة الجديد: نص التعليمة يحتوي
             * الكلمة المفتاحية بلون أصفر عادي داخل الجملة (بدل الشارة
             * المتدرّجة أعلاه — طلب صريح لهذا السياق تحديداً فقط). */
            '.agp-join-keyword-plain{color:#ffd400;font-weight:900;font-size:1.15em;}',
            '.agp-player-count-badge{display:inline-block;margin-inline-start:8px;background:rgba(0,0,0,0.3);',
            'color:#fff;font-weight:800;font-size:0.85em;padding:4px 12px;border-radius:999px;',
            'border:1px solid rgba(255,255,255,0.25);}',
            /* ⚠️ [0.45.0] قائمة اللاعبين: من صف كامل لكل لاعب (سطر مستقل)
             * لتخطيط أفقي متلاصق (شرائح/chips تلتف تلقائياً) — نفس الكلاس
             * مشترك بين اللوبي الأول واللوبي الجديد. */
            '.agp-shell-player-list{list-style:none;margin:0 0 16px;padding:0;display:flex;flex-wrap:wrap;',
            'gap:8px;overflow-y:auto;}',
            '.agp-shell-player-list li{display:flex;align-items:center;gap:6px;flex:0 0 auto;',
            'padding:6px 10px;background:rgba(255,255,255,0.12);border-radius:999px;',
            'text-align:right;color:#f3eefc;}',
            '.agp-player-remove-btn{background:rgba(255,77,77,0.18);border:1px solid rgba(255,77,77,0.55);',
            'color:#ffb3b3;border-radius:8px;width:22px;height:22px;flex-shrink:0;cursor:pointer;font-weight:800;',
            'font-size:0.8em;line-height:1;}',

            /* ⚠️ [0.45.0] قائمة اللاعبين أثناء المباراة (بشاشة الإعدادات
             * المُعاد فتحها): صندوق فرعي مستقل صغير 250×250 بدل قائمة
             * ممتدة داخل الصندوق الرئيسي — نفس تخطيط الشرائح أعلاه بداخله. */
            '.agp-settings-player-box{width:250px;height:250px;box-sizing:border-box;overflow-y:auto;',
            'border:1px solid rgba(255,255,255,0.3);',
            'border-radius:12px;padding:8px;background:rgba(0,0,0,0.18);margin:6px auto 10px;}',
            '.agp-settings-player-box .agp-shell-player-list{margin:0;}',

            '.agp-relocated-into-settings{position:fixed !important;top:90px !important;left:50% !important;',
            'transform:translateX(-50%);z-index:100000 !important;}'
        ].join('');
        document.head.appendChild(style);
        document.body.classList.add('agp-shell-active');
    }

    function injectPersistentHeader() {
        if (el('agp-persistent-header')) return;

        var gearIcon = _config.headerGearIcon ? '<img src="' + _config.headerGearIcon + '" alt="">' : '⚙️';

        // ⚠️ [0.44.0] حذف نص "ألعاب أيمن" بجانب اللوقو (يبقى اللوقو فقط،
        // بحجم أكبر) — بناءً على طلب صريح. لو ما فيه صورة لوقو مُمرَّرة
        // (حالة دفاعية)، نرجع للشارة النصية "A" القديمة كبديل وحيد.
        var brandHtml = _config.logoImage ?
            '<img class="agp-brand-logo-img" src="' + _config.logoImage + '" alt="ألعاب أيمن">' :
            '<span class="agp-brand-badge">A</span>';

        var header = document.createElement('div');
        header.id = 'agp-persistent-header';
        header.innerHTML =
            '<div style="display:flex;gap:8px;align-items:center;">' +
            '<button class="agp-header-icon-btn" id="agp-header-home-btn" title="العودة للمنصة">🏠</button>' +
            '<button class="agp-header-icon-btn" id="agp-header-info-btn" title="شرح اللعبة">!</button>' +
            '<button class="agp-header-icon-btn" id="agp-header-settings-btn" title="الإعدادات">' + gearIcon + '</button>' +
            '</div>' +
            '<div id="agp-header-title">' + (_config.gameTitle || '') + '</div>' +
            '<div id="agp-header-brand">' + brandHtml + '</div>';
        document.body.appendChild(header);

        // ⚠️ [0.44.0] زر "العودة للمنصة" — يرجع للصفحة الرئيسية. المسار
        // نسبي (homeUrl) تحدِّده كل لعبة حسب عمق مجلدها (راجع
        // agp-elimination-roulette.js: '../../index.html').
        document.getElementById('agp-header-home-btn').onclick = function () {
            window.location.href = _config.homeUrl || '../../index.html';
        };

        var banner = document.createElement('div');
        banner.id = 'agp-sponsor-banner';
        banner.textContent = 'بانر الراعي';
        document.body.appendChild(banner);

        document.getElementById('agp-header-settings-btn').onclick = function () {
            renderSettingsScreen(true); // true = أُعيد فتحها أثناء اللعب — بدون يوزرنيم/كلمة مفتاحية
            _overlayEl.style.display = 'flex';
        };

        document.getElementById('agp-header-info-btn').onclick = function () {
            renderInfoScreen();
            _overlayEl.style.display = 'flex';
        };
    }

    function renderInfoScreen() {
        var box = el('agp-shell-box');
        box.className = '';
        box.innerHTML =
            '<h2>شرح اللعبة</h2>' +
            '<p class="agp-shell-status" style="text-align:right;">' + (_config.gameExplanation || 'لا يوجد شرح متاح لهذه اللعبة حالياً.') + '</p>' +
            '<button class="agp-shell-btn-connect" id="agp-info-close-btn">إغلاق</button>';
        document.getElementById('agp-info-close-btn').onclick = hideOverlay;
    }

    /* ==================================================================
     *  شاشة الإعدادات
     * ================================================================== */
    function isFieldVisible(field) {
        // ⚠️ [0.45.0] onlyMidMatch: حقل يظهر فقط لو شاشة الإعدادات مفتوحة
        // أثناء مباراة نشطة (أُعيد فتحها بزر الترس ⚙️) — يُخفى تماماً
        // بشاشة الإعدادات الأولية قبل بدء أي مباراة. مثال: مستوى الصوت
        // (لا معنى له قبل أن تبدأ أصوات اللعبة أصلاً).
        if (field.onlyMidMatch && !_lastIsReopened) return false;
        if (!field.showWhen) return true;
        return _settingsValues[field.showWhen.key] === field.showWhen.equals;
    }

    function iconImg(src) {
        return src ? '<img class="agp-field-icon" src="' + src + '" alt="">' : '';
    }

    function renderField(field) {
        if (!isFieldVisible(field)) return '';

        if (field.type === 'pill-choice' || field.type === 'pill-group') {
            var buttons = (field.options || []).map(function (opt) {
                var active = _settingsValues[field.key] === opt.value ? 'agp-pill-active' : '';
                return '<button type="button" class="agp-pill-btn ' + active + '" data-key="' + field.key + '" data-value="' + opt.value + '">' + opt.label + '</button>';
            }).join('');
            return '<div class="agp-shell-row"><div class="agp-pill-group">' + buttons + '</div>' +
                '<span class="agp-shell-row-label">' + iconImg(field.icon) + field.label + '</span></div>';
        }

        if (field.type === 'counter') {
            return '<div class="agp-shell-row">' +
                '<div class="agp-shell-counter-row"><button data-key="' + field.key + '" data-delta="-1">−</button>' +
                '<input type="number" class="agp-count-input" data-key="' + field.key + '" id="agp-field-' + field.key + '" value="' + _settingsValues[field.key] + '" min="' + (field.min || 0) + '">' +
                '<button data-key="' + field.key + '" data-delta="1">+</button></div>' +
                '<span class="agp-shell-row-label">' + iconImg(field.icon) + field.label + '</span></div>';
        }

        // ⚠️ [0.45.0] نوع حقل جديد: شريط تمرير (slider) — بدل عداد +/-،
        // يُستخدَم حالياً لمستوى الصوت (مع onlyMidMatch:true).
        if (field.type === 'slider') {
            var sliderMin = typeof field.min === 'number' ? field.min : 0;
            var sliderMax = typeof field.max === 'number' ? field.max : 10;
            var sliderVal = _settingsValues[field.key];
            return '<div class="agp-shell-row">' +
                '<div class="agp-slider-wrap"><input type="range" class="agp-slider-input" data-key="' + field.key + '" ' +
                'min="' + sliderMin + '" max="' + sliderMax + '" value="' + sliderVal + '">' +
                '<span class="agp-slider-val" id="agp-slider-val-' + field.key + '">' + sliderVal + '</span></div>' +
                '<span class="agp-shell-row-label">' + iconImg(field.icon) + field.label + '</span></div>';
        }

        if (field.type === 'toggle') {
            var checked = _settingsValues[field.key] ? 'checked' : '';
            return '<div class="agp-shell-row">' +
                '<label class="agp-toggle-switch"><input type="checkbox" id="agp-field-' + field.key + '" data-key="' + field.key + '" ' + checked + '><span class="agp-toggle-track"></span></label>' +
                '<span class="agp-shell-row-label">' + iconImg(field.icon) + field.label + '</span></div>';
        }

        // ⚠️ [0.44.0] نوع حقل جديد عام: زر يفتح تبويباً/نافذة مخصَّصة
        // تبنيها اللعبة نفسها بالكامل (لا يعرف هذا الملف شيئاً عن محتواها
        // — مجرد زر + استدعاء callback اللعبة عند الضغط). القيمة المعروضة
        // على الزر تُبنى عبر field.formatValue(value) لو موجودة، وإلا القيمة
        // الخام. عند اختيار اللعبة لقيمة جديدة، تستدعي
        // AGP.gameShell.setSetting(key, value) فتُحدَّث القيمة ويُعاد رسم
        // الحقل تلقائياً.
        if (field.type === 'modal-trigger') {
            var currentVal = _settingsValues[field.key];
            var displayVal = (typeof field.formatValue === 'function') ? field.formatValue(currentVal) : currentVal;
            return '<div class="agp-shell-row">' +
                '<button type="button" class="agp-pill-btn agp-modal-trigger-btn" data-trigger-key="' + field.key + '">' + escapeHtml(displayVal) + '</button>' +
                '<span class="agp-shell-row-label">' + iconImg(field.icon) + field.label + '</span></div>';
        }

        return '';
    }

    var _lastIsReopened = false;

    function renderSettingsScreen(isReopened) {
        _lastIsReopened = Boolean(isReopened);
        // ⚠️ إصلاح: نحفظ القيم الحالية لليوزرنيم/الكلمة المفتاحية قبل
        // إعادة البناء (كانت تُمسَح مع كل ضغطة على أي زر تبديل، لأن
        // الشاشة تُعاد بناؤها بالكامل لتحديث الرؤية الشرطية).
        var preservedUsername = (el('agp-tiktok-username') && el('agp-tiktok-username').value) || '';
        var preservedKeyword = (el('agp-keyword') && el('agp-keyword').value) || '';

        var fieldsHtml = (_config.settingsFields || []).map(renderField).join('');
        var box = el('agp-shell-box');
        box.className = '';

        var closeBtnHtml = isReopened ?
            '<button type="button" id="agp-settings-close-btn" style="position:absolute;top:14px;left:18px;background:none;border:none;font-size:1.3em;cursor:pointer;color:#5a2585;">✕</button>' : '';

        // ⚠️ [0.44.0] لو ما فيه قيمة محفوظة بالجلسة الحالية (أول رسم)، نرجع
        // لآخر يوزرنيم محفوظ عبر AGP.storageManager (يبقى بعد "مباراة
        // جديدة" ← reload الصفحة، بدل ما يُطلَب من الاستريمر كتابته كل مرة).
        var savedUsername = preservedUsername || (AGP.storageManager ? AGP.storageManager.get('agp-last-username', '') : '');

        var baseFieldsHtml = isReopened ? '' :
            '<div class="agp-shell-field"><label>' + iconImg(_config.usernameIcon) + 'اكتب يوزر نيم حساب تيك توك</label><input type="text" id="agp-tiktok-username" placeholder="ayman_live" value="' + escapeHtml(savedUsername) + '"></div>' +
            '<div class="agp-shell-field"><label>' + iconImg(_config.keywordIcon) + 'الكلمة المفتاحية لدخول المبارة</label><input type="text" id="agp-keyword" placeholder="JOIN" value="' + escapeHtml(preservedKeyword) + '"></div>';

        var connectBtnHtml = isReopened ? '' :
            '<button class="agp-shell-btn-connect" id="agp-connect-btn">' + (_config.connectButtonLabel || 'اتصال بالبث') + '</button>';

        var playerManagementHtml = isReopened ?
            '<div class="agp-shell-field"><label>👥 قائمة اللاعبين <span id="agp-settings-player-count"></span></label>' +
            '<div class="agp-settings-player-box"><ul class="agp-shell-player-list" id="agp-settings-player-list"></ul></div>' +
            '<button type="button" class="agp-shell-btn-connect" id="agp-reopen-registration-btn">➕ إضافة لوبي جديد</button></div>' : '';

        box.style.position = 'relative';
        box.innerHTML =
            closeBtnHtml +
            '<h2>' + (_config.settingsTitle || 'إعدادات المبارة') + '</h2>' +
            baseFieldsHtml +
            fieldsHtml +
            playerManagementHtml +
            connectBtnHtml;

        wireFieldEvents();
        if (!isReopened) {
            document.getElementById('agp-connect-btn').onclick = handleConnectClick;
            hideRelocatedControls();
        } else {
            renderSettingsPlayerList();
            document.getElementById('agp-reopen-registration-btn').onclick = handleReopenRegistrationClick;
            document.getElementById('agp-settings-close-btn').onclick = function () { hideRelocatedControls(); hideOverlay(); };
            showRelocatedControls();
        }
    }

    /**
     * ⚠️ إضافة: أدوات التحكم (إعادة ترتيب/تصفير) وحقل اسم الستريمر —
     * تبقى بمكانها الأصلي بالـ DOM (لا نقلها فعلياً، تجنّباً لفقدانها
     * عند أي إعادة رسم لاحقة تمسح محتوى الصندوق)، فقط تظهر بصرياً وهي
     * مثبَّتة فوق شاشة الإعدادات المفتوحة، وتختفي معها تماماً.
     */
    function showRelocatedControls() {
        var controls = document.getElementById('left-controls');
        var streamerName = document.getElementById('streamer-name-wrapper');
        if (controls) { controls.classList.remove('hidden'); controls.classList.add('agp-relocated-into-settings'); }
        if (streamerName) { streamerName.style.display = ''; streamerName.classList.add('agp-relocated-into-settings'); }
    }

    function hideRelocatedControls() {
        var controls = document.getElementById('left-controls');
        var streamerName = document.getElementById('streamer-name-wrapper');
        if (controls) controls.classList.remove('agp-relocated-into-settings');
        if (streamerName) streamerName.classList.remove('agp-relocated-into-settings');
    }

    /**
     * ⚠️ بطاقة اللاعب المشتركة (صورة + اسم [+ إطار]) — راجع
     * js/agp-player-card.js. showFrame:true دائماً هنا لأن الدوال
     * الثلاث اللي تستخدم هذي الدالة (renderSettingsPlayerList،
     * renderMiniLobbyList، renderLobbyPlayerList) كلها شاشات "لوبي"
     * (قبل/أثناء بدء المباراة، قبل أي إقصاء) — القرار الصريح إن الإطار
     * يظهر باللوبي حصراً، وهذي الثلاث كلها لوبي بمعناه.
     */
    // ⚠️ [0.44.0] removable:true يضيف زر حذف نهائي لكل صف (يُستخدَم فقط
    // بقائمة "أثناء المباراة" داخل الإعدادات المُعاد فتحها — لا يظهر
    // باللوبي الأول ولا باللوبي المصغَّر، حتى لا يُحذَف لاعب بالخطأ قبل
    // بدء المباراة أصلاً حيث لا داعي لذلك). الحذف الفعلي عبر
    // AGP.player.removePlayer الموجودة أصلاً (تبث player:removed — أي
    // لعبة تستمع لها لتزامن حالتها الداخلية، راجع agp-elimination-roulette.js).
    function renderPlayerListItemsHtml(players, opts) {
        opts = opts || {};
        if (!AGP.playerCard) return players.map(function (p) { return '<li>' + escapeHtml(p.name || p.id) + '</li>'; }).join('');
        var basePath = (_config && _config.assetBasePath) || '';
        return players.map(function (p) {
            var removeBtn = opts.removable ?
                '<button type="button" class="agp-player-remove-btn" data-remove-player-id="' + escapeHtml(p.id) + '" title="حذف نهائي من المباراة">🗑️</button>' : '';
            return '<li>' + removeBtn + AGP.playerCard.renderHtml(p, { showFrame: true, basePath: basePath }) + '</li>';
        }).join('');
    }

    function wireRemovePlayerButtons(container) {
        if (!container) return;
        container.querySelectorAll('[data-remove-player-id]').forEach(function (btn) {
            btn.onclick = function () {
                var id = btn.getAttribute('data-remove-player-id');
                if (AGP.player && typeof AGP.player.removePlayer === 'function') {
                    AGP.player.removePlayer(id); // يبث player:removed — إعادة رسم القوائم تتم عبر مستمع player:joined/player:removed أدناه
                }
            };
        });
    }

    /**
     * ⚠️ [0.44.0] عداد "الحالي/الحد الأقصى" — يُعرَض فقط لو اللعبة عرَّفت
     * حقل إعداد باسم maxPlayers (أي لعبة، عام وليس خاصاً بلعبة معيّنة).
     * @returns {string} مثل " (6 / 15)" أو نص فارغ لو ما فيه حد أقصى مُعرَّف
     */
    function playerCountBadgeHtml() {
        var max = _settingsValues.maxPlayers;
        if (!max) return '';
        var current = AGP.gameManager.getPlayers().length;
        return '<span class="agp-player-count-badge">' + current + ' / ' + max + '</span>';
    }

    function renderSettingsPlayerList() {
        var list = el('agp-settings-player-list');
        if (!list) return;
        var players = AGP.gameManager.getPlayers();
        list.innerHTML = renderPlayerListItemsHtml(players, { removable: true });
        wireRemovePlayerButtons(list);
        if (AGP.playerCard) AGP.playerCard.fitAllNames(list);
        var countEl = el('agp-settings-player-count');
        if (countEl) countEl.innerHTML = playerCountBadgeHtml();
    }

    /**
     * ⚠️ إعادة تصميم: بدل إضافة لاعب يدوياً بالاسم، الزر يفتح "لوبي
     * مصغّر" — يُعيد تفعيل الكلمة المفتاحية فقط (بدون لمس حالة الجلسة/
     * الجولة إطلاقاً، فلا يتأثر اللاعبون الحاليون ولا تُعاد الجولة).
     * اللاعبون المقصيون سابقاً **لا يعودون للعجلة أبداً** هنا — هذا
     * المسار يضيف لاعبين جدد فقط عبر نفس مسار player:joined الحقيقي،
     * ولا علاقة له بقائمة eliminatedPlayers الخاصة باللعبة إطلاقاً.
     */
    var _miniLobbyKnownIds = null;

    function handleReopenRegistrationClick() {
        // ⚠️ [0.44.0] لو أصلاً وصلنا الحد الأقصى، ما نفتح تسجيلاً جديداً
        // إطلاقاً — بدل ما نفتح نافذة تقبل كتابة الكلمة المفتاحية بلا فائدة.
        var max = _settingsValues.maxPlayers;
        if (max && AGP.gameManager.getPlayers().length >= max) {
            var box0 = el('agp-shell-box');
            box0.innerHTML = '<h2>وصلنا الحد الأقصى</h2>' +
                '<p class="agp-shell-status">عدد اللاعبين وصل الحد الأقصى المحدَّد بإعدادات المباراة (' + max + ') — احذف لاعباً أولاً لو تبي تضيف غيره.</p>' +
                '<button class="agp-shell-btn-connect" id="agp-mini-lobby-back-btn">رجوع</button>';
            document.getElementById('agp-mini-lobby-back-btn').onclick = function () { renderSettingsScreen(true); };
            return;
        }

        AGP.keywordManager.activate();
        _miniLobbyKnownIds = {};
        AGP.gameManager.getPlayers().forEach(function (p) { _miniLobbyKnownIds[p.id] = true; });

        var box = el('agp-shell-box');
        box.innerHTML =
            '<h2>إضافة لوبي جديد</h2>' +
            '<div class="agp-join-hint"><span class="agp-join-hint-text">لدخول المبارة للاعبين الجدد اكتب ' +
            '<span class="agp-join-keyword-plain">' + escapeHtml(_lastKeyword) + '</span>' +
            ' في شات البث</span>' +
            '<span id="agp-mini-lobby-count"></span></div>' +
            '<ul class="agp-shell-player-list" id="agp-mini-lobby-list"></ul>' +
            '<button class="agp-shell-btn-connect" id="agp-mini-lobby-done-btn">✅ إكمال المباراة</button>';
        renderMiniLobbyList();
        document.getElementById('agp-mini-lobby-done-btn').onclick = handleMiniLobbyDone;
    }

    function renderMiniLobbyList() {
        var list = el('agp-mini-lobby-list');
        if (!list || !_miniLobbyKnownIds) return;
        var newPlayers = AGP.gameManager.getPlayers().filter(function (p) { return !_miniLobbyKnownIds[p.id]; });
        list.innerHTML = renderPlayerListItemsHtml(newPlayers);
        if (AGP.playerCard) AGP.playerCard.fitAllNames(list);
        var countEl = el('agp-mini-lobby-count');
        if (countEl) countEl.innerHTML = playerCountBadgeHtml();

        // ⚠️ [0.44.0] وصلنا الحد الأقصى وسط اللوبي المصغَّر نفسه (وصل
        // آخر لاعب بالضبط بينما النافذة مفتوحة) — نوقف الكلمة المفتاحية
        // فوراً (تزامناً مع enforceMaxPlayers بملف اللعبة) ونعطّل الزر
        // اسمياً فقط (الإكمال يبقى ممكناً لإغلاق النافذة).
        var max = _settingsValues.maxPlayers;
        if (max && AGP.gameManager.getPlayers().length >= max && AGP.keywordManager.isActive()) {
            AGP.keywordManager.deactivate();
        }
    }

    function handleMiniLobbyDone() {
        AGP.keywordManager.deactivate();
        _miniLobbyKnownIds = null;
        renderSettingsScreen(true);
    }

    function wireFieldEvents() {
        // ⚠️ [0.45.0] إصلاح خطأ حرج: كل هذي المستمعات (pill/counter/count-input)
        // كانت تستدعي renderSettingsScreen() بدون تمرير _lastIsReopened —
        // فكانت تعيد رسم الشاشة **كأنها تُفتح لأول مرة** (تُظهر حقلي
        // اليوزرنيم/الكلمة المفتاحية وزر "اتصال بالبث" من جديد) بمجرد
        // تعديل أي إعداد (حد اللاعبين، موقّت الإقصاء، مين يقدر يدخل...)
        // أثناء مباراة نشطة — يبان للمستخدم وكأن المباراة "انلغت" وتطلب
        // اتصال جديد، رغم إن المباراة الفعلية بالخلفية ما توقفت أصلاً.
        // كان فقط مستمع مفتاح التبديل (toggle) بالأسفل مصلَّحاً صح من
        // الإصدار الماضي. الإصلاح: كل المستمعات الأربعة تمرر _lastIsReopened
        // الآن، فتبقى الشاشة بوضعها الصحيح والمباراة تكمل بدون انقطاع.
        _overlayEl.querySelectorAll('.agp-pill-btn').forEach(function (btn) {
            btn.onclick = function () {
                var key = btn.getAttribute('data-key');
                var raw = btn.getAttribute('data-value');
                var parsed = raw === 'true' ? true : (raw === 'false' ? false : (isNaN(Number(raw)) ? raw : Number(raw)));
                _settingsValues[key] = parsed;
                renderSettingsScreen(_lastIsReopened);
            };
        });
        _overlayEl.querySelectorAll('.agp-shell-counter-row button').forEach(function (btn) {
            btn.onclick = function () {
                var key = btn.getAttribute('data-key');
                var delta = Number(btn.getAttribute('data-delta'));
                var fieldConfig = (_config.settingsFields || []).filter(function (f) { return f.key === key; })[0];
                var min = fieldConfig && typeof fieldConfig.min === 'number' ? fieldConfig.min : 0;
                _settingsValues[key] = Math.max(min, (_settingsValues[key] || 0) + delta);
                renderSettingsScreen(_lastIsReopened);
            };
        });
        _overlayEl.querySelectorAll('.agp-count-input').forEach(function (input) {
            input.onchange = function () {
                var key = input.getAttribute('data-key');
                var fieldConfig = (_config.settingsFields || []).filter(function (f) { return f.key === key; })[0];
                var min = fieldConfig && typeof fieldConfig.min === 'number' ? fieldConfig.min : 0;
                var typed = parseInt(input.value, 10);
                _settingsValues[key] = isNaN(typed) ? min : Math.max(min, typed);
                renderSettingsScreen(_lastIsReopened);
            };
        });
        // ⚠️ [0.45.0] نوع حقل جديد: 'slider' (شريط تمرير — راجع renderField).
        _overlayEl.querySelectorAll('.agp-slider-input').forEach(function (input) {
            input.oninput = function () {
                var key = input.getAttribute('data-key');
                _settingsValues[key] = Number(input.value);
                var valEl = el('agp-slider-val-' + key);
                if (valEl) valEl.textContent = input.value;
            };
            input.onchange = function () { renderSettingsScreen(_lastIsReopened); };
        });
        _overlayEl.querySelectorAll('#agp-shell-box input[type=checkbox]').forEach(function (chk) {
            // ⚠️ [0.44.0] إصلاح: كانت لا تُعيد رسم شاشة الإعدادات بعد
            // تغيير أي مفتاح toggle، فالحقول الشرطية (showWhen) المرتبطة
            // بمفتاح toggle (مثل حقل اختيار هدية الإنعاش) ما كانت تظهر/
            // تختفي فوراً عند تفعيل/تعطيل المفتاح — لاحظته بالاختبار
            // البصري لهذا الإصدار (كان موجوداً بالكود الأصلي قبل هذا
            // الإصدار، غير متعلق مباشرة بأي طلب من التعديلات المتفق
            // عليها، لكنه يمنع ميزة منبثقة الهدية من الظهور فعلياً).
            chk.onchange = function () {
                _settingsValues[chk.getAttribute('data-key')] = chk.checked;
                renderSettingsScreen(_lastIsReopened);
            };
        });
        _overlayEl.querySelectorAll('.agp-modal-trigger-btn').forEach(function (btn) {
            btn.onclick = function () {
                var key = btn.getAttribute('data-trigger-key');
                var fieldConfig = (_config.settingsFields || []).filter(function (f) { return f.key === key; })[0];
                if (fieldConfig && typeof fieldConfig.onOpen === 'function') fieldConfig.onOpen(_settingsValues[key]);
            };
        });
    }

    function renderConnectingScreen(message) {
        var box = el('agp-shell-box');
        box.className = 'agp-connecting-box';
        box.innerHTML = '<h2>جارِ الاتصال...</h2><p class="agp-shell-status">' + (message || 'يرجى الانتظار') + '</p>';
    }

    function renderLobbyScreen() {
        var box = el('agp-shell-box');
        box.className = 'agp-lobby-box';
        box.innerHTML =
            '<h2>اللوبي بانتظار اللاعبين</h2>' +
            '<div class="agp-join-hint"><span class="agp-join-hint-text">عشان تدخل المباراة اكتب بالشات:</span>' +
            '<span class="agp-join-keyword-badge">' + escapeHtml(_lastKeyword) + '</span>' +
            '<span id="agp-lobby-count"></span></div>' +
            '<ul class="agp-shell-player-list" id="agp-lobby-list"></ul>' +
            '<button class="agp-shell-btn-connect" id="agp-start-round-btn">انهاء وبدء الجولة</button>';

        renderLobbyPlayerList();
        document.getElementById('agp-start-round-btn').onclick = handleStartRoundClick;
    }

    function renderLobbyPlayerList() {
        var list = el('agp-lobby-list');
        if (!list) return;
        var players = AGP.gameManager.getPlayers();
        list.innerHTML = renderPlayerListItemsHtml(players);
        if (AGP.playerCard) AGP.playerCard.fitAllNames(list);
        var countEl = el('agp-lobby-count');
        if (countEl) countEl.innerHTML = playerCountBadgeHtml();
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function hideOverlay() {
        if (_overlayEl) _overlayEl.style.display = 'none';
    }

    function handleConnectClick() {
        var username = document.getElementById('agp-tiktok-username').value.trim();
        var keyword = document.getElementById('agp-keyword').value.trim();

        if (!username) { document.getElementById('agp-tiktok-username').focus(); return; }
        if (!keyword) { document.getElementById('agp-keyword').focus(); return; }

        if (AGP.storageManager) AGP.storageManager.set('agp-last-username', username);
        _lastKeyword = keyword;
        renderConnectingScreen();

        AGP.gameManager.loadGame(_config.gameId);
        AGP.roomsManager.createRoom(_config.gameId);
        AGP.gameManager.openRegistration();
        AGP.keywordManager.setKeyword(keyword);
        AGP.keywordManager.activate();

        var connectOptions = { username: username };
        if (_settingsValues.followersOnly !== undefined) connectOptions.followersOnly = _settingsValues.followersOnly;

        AGP.streamConnector.connect('tiktok', connectOptions);
    }

    function handleStartRoundClick() {
        var minPlayers = _config.minPlayersToStart || 1;
        if (AGP.gameManager.getPlayers().length < minPlayers) {
            renderLobbyScreen();
            var status = el('agp-lobby-list');
            if (status) {
                var warning = document.createElement('li');
                warning.style.color = '#ffb3b3';
                warning.textContent = 'محتاج ' + minPlayers + ' لاعبين على الأقل قبل بدء الجولة';
                status.insertBefore(warning, status.firstChild);
            }
            return;
        }

        AGP.gameManager.closeRegistration();
        AGP.keywordManager.deactivate();
        _roundStarted = true;
        AGP.events.emit('game:roundStarted', { id: _config.gameId });
        hideOverlay();
        if (typeof _config.onStartRound === 'function') {
            _config.onStartRound(Object.assign({}, _settingsValues));
        }
    }

    function init(config) {
        _config = config || {};
        _settingsValues = {};
        (_config.settingsFields || []).forEach(function (field) {
            if (field.type === 'toggle') _settingsValues[field.key] = Boolean(field.default);
            else if (field.type === 'pill-choice' || field.type === 'pill-group') {
                _settingsValues[field.key] = (field.default !== undefined) ? field.default : (field.options && field.options[0] && field.options[0].value);
            } else _settingsValues[field.key] = field.default || 0;
        });

        injectStyles();
        injectPersistentHeader();

        _overlayEl = el('agp-shell-overlay') || document.body.appendChild((function () {
            var d = document.createElement('div');
            d.id = 'agp-shell-overlay';
            d.innerHTML = '<div id="agp-shell-box"></div>';
            return d;
        }()));

        renderSettingsScreen();

        AGP.events.on('stream:statusChanged', function (payload) {
            if (payload.platform !== 'tiktok') return;

            // ⚠️ إصلاح خلل حقيقي: هذا المستمع كان يعيد عرض شاشة اللوبي
            // الأولى (renderLobbyScreen — وفيها زر "انهاء وبدء الجولة"
            // اللي يستدعي onStartRound من جديد) عند أي "connected" واردة،
            // **حتى لو المباراة شغّالة أصلاً**. وصول "connected" مرة ثانية
            // منتصف مباراة شائع فعلياً: إعادة اتصال تلقائية بتيك توك بعد
            // انقطاع مؤقّت (tiktok-connector.js)، أو حتى إعادة اتصال
            // قناة WebSocket بيننا وبين الباك إند نفسها (agp-tiktok-adapter.js).
            // لو صادف هذا وقت كانت شاشة الإعدادات مفتوحة (مثلاً الاستريمر
            // فاتحها عشان يضيف لاعب جديد عبر "فتح التسجيل")، كانت تُستبدَل
            // فجأة بشاشة اللوبي الأولى، وضغط "انهاء وبدء الجولة" ظناً إنه
            // المسار الصحيح لإضافة لاعب كان يصفّر المباراة بالكامل (كل
            // اللاعبين، حتى المُقصَون، يرجعون للعجلة). بعد بدء الجولة،
            // نتجاهل أي تغيّر بحالة الاتصال هنا تماماً — الاتصال نفسه
            // يُدار بالخلفية بشكل مستقل، ولا داعي لأي شاشة تتفاعل معه.
            if (_roundStarted) {
                AGP.log('Game Shell: ignoring stream:statusChanged("' + payload.status + '") — round already started.');
                return;
            }

            if (payload.status === 'connecting') renderConnectingScreen('جارِ الاتصال بالبث...');
            else if (payload.status === 'connected') renderLobbyScreen();
            else if (payload.status === 'error') renderConnectingScreen('تعذّر الاتصال — تحقّق من اليوزرنيم وحاول مرة أخرى.');
        });

        AGP.events.on('player:joined', function () {
            renderLobbyPlayerList();
            renderSettingsPlayerList();
            renderMiniLobbyList();
        });
        // ⚠️ [0.44.0] حذف لاعب (زر 🗑️ بقائمة الإعدادات) يبث player:removed
        // — لازم نعيد رسم نفس القوائم الثلاث لتحديث العدّاد والقائمة فوراً.
        AGP.events.on('player:removed', function () {
            renderLobbyPlayerList();
            renderSettingsPlayerList();
            renderMiniLobbyList();
        });
    }

    AGP.gameShell = {
        init: init,
        getSettings: function () { return Object.assign({}, _settingsValues); },

        /**
         * ⚠️ [0.44.0] يسمح للعبة بتحديث قيمة إعداد واحد من خارج الشاشة
         * العامة (مثلاً بعد اختيار من نافذة مخصَّصة تبنيها اللعبة نفسها،
         * راجع field.type === 'modal-trigger' أعلاه)، ثم يُعاد رسم شاشة
         * الإعدادات فوراً لتعكس القيمة الجديدة على الزر.
         * @param {string} key
         * @param {*} value
         */
        setSetting: function (key, value) {
            _settingsValues[key] = value;
            if (_overlayEl && _overlayEl.style.display !== 'none') {
                renderSettingsScreen(_lastIsReopened);
            }
        }
    };

}(window.AymanGamesPlatform));
