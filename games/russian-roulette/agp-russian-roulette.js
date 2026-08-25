/**
 * ==========================================================================
 *  AGP RUSSIAN ROULETTE — "روليت الروسي" (لعبة أصلية داخل المنصة)
 *  ⚠️ آخر تحديث: آلية الاحتمال والقلوب أُعيد تعريفها بالكامل (توضيح نهائي
 *     من المستخدم لآلية اللعبة الحقيقية) — يلغي أي وصف سابق بهذا الملف.
 * ==========================================================================
 *
 * الآلية النهائية (نهائية ومؤكَّدة صراحة، تلغي كل ما قبلها):
 *  1) شكل اختيار "صاحب الدور" — قابل للتبديل حياً من زر أعلى الشاشة، بين
 *     عجلة دوّارة أو بكرة سكرول رأسية (سلوت مشين) — الاثنان يستخدمان نفس
 *     منطق الاختيار بالضبط (pickNextChooserIndex)، فرق شكلي بحت.
 *  2) صاحب الدور يكتب رقم لاعب آخر (هدف) بشات البث خلال مدة مرحلة
 *     الاختيار (20/25/30/40ث، قابلة للتحديد بالإعدادات).
 *  3) ⚠️ "حجم ساقية الطلقات؟" (3–6) = عدد غرف المسدس **المتاحة فعلياً**
 *     من أصل 6 (الباقي غرف مغلقة تماماً، خارج اللعب) — ونفس هذا الرقم
 *     يمثّل أيضاً عدد أرواح كل لاعب (كل لاعب له "سلاحه" الشخصي بنفس
 *     الحجم). "عدد الطلقات المعباه؟" (1–4) = كم طلقة موزّعة عشوائياً بين
 *     الغرف المتاحة فقط (مو من أصل 6 دائماً) — الاحتمال الحقيقي لكل
 *     دورة استهداف = الطلقات ÷ الغرف المتاحة (_appliedLivesCount)،
 *     وتتبدّل مواقع الطلقات عشوائياً من جديد كل دورة (احتمال مستقل تماماً
 *     بدون ذاكرة بين الدورات).
 *  4) ⚠️ استثناء حاسم: لو الهدف وصل لآخر قلب أخضر (روح واحدة متبقية)،
 *     أي استهداف بعدها = إصابة مضمونة ١٠٠٪ (بدون رمي احتمال إطلاقاً) —
 *     "ضروري آخر طلقة يطلقها أي لاعب على لاعب ماعنده إلا آخر روح يُقصى
 *     مباشرة وتُحسب الطلقة صحيحة". هذا يعطي القلوب دوراً ميكانيكياً
 *     حقيقياً على الروح الأخيرة تحديداً (بعكس التصميم الأقدم اللي كانت
 *     فيه القلوب عرض بصري بحت بدون أي استثناء).
 *  5) زرّا "اكمال المبارة بدون اقصاء" / "اقصاء اللاعب و اكمال المباراة"
 *     بشاشة الاختيار = تحكّم يدوي احتياطي متاح للاستريمر بأي وقت. الأبيض
 *     يغلق الدور بدون إقصاء مباشرة. الأحمر يتطلّب اختيار هدف أولاً (ضغط
 *     بطاقته بالشبكة) ثم يقصيه فوراً كتجاوز يدوي صريح (بدون المرور بمحرك
 *     الاحتمال إطلاقاً — تجاوز متعمَّد، بعكس المسار الطبيعي عبر الشات).
 *  6) عند إصابة حقيقية عبر المسار الطبيعي (شات): شاشة "الاشتباك" (2ث،
 *     فلاش أحمر + اختفاء صورة الهدف + صوت طلق) ثم شاشة "عملية اقصاء
 *     ناجحة" (3ث إضافية) ثم رجوع تلقائي. عند نجاة: شاشة "الاشتباك" فقط
 *     (فلاش أبيض، صوت فشل مميَّز، نص "لم ينجح الاستهداف"، 2ث) ثم رجوع.
 *
 * ⚠️ تطبيق PLAYER-CARD-STANDARDS.md (معيار مشترك للمنصة): تبويب الاختيار
 *   وبطاقة الفائز واللوبي وشاشة الإعدادات الأولى أُعيد بناؤها بالكامل
 *   حسب هذا المعيار — راجع تعليقات كل قسم بالكود لتفاصيل كل شاشة. رقم كل
 *   لاعب ثابت طول المباراة (assignPlayerNumber)، وعدد إقصاءاته يُتتبَّع
 *   (_eliminationsCaused) لبطاقة "الأكثر إقصاءً" بشاشة الفائز.
 *
 * الاعتماديات: نفس ترتيب index.html (AGP Core كامل، js/agp-player-card.js،
 *   js/agp-game-shell.js غير مُعدَّل، ثم هذا الملف).
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.gameManager || !AGP.streamConnector || !AGP.keywordManager) {
        console.error('[AGP Russian Roulette] AGP Core not loaded yet.');
        return;
    }
    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'russian-roulette';
    var GAME_NAME = 'روليت الروسي';
    var TIMER_NAME = 'russian-roulette-selection';
    var REVOLVER_CHAMBERS = 6;

    var C_GOLD = '#845B1B';
    var C_BLACK = '#121212';
    var C_BRONZE = '#5c3a10'; // ⚠️ لون ثالث استثنائي — يُستخدَم لشريحة واحدة فقط عند عدد شرائح فردي، لكسر التكرار اللونين المتجاورين الحتمي رياضياً
    var BG_BROWN = '#45300F'; // --violet (PLAYER-CARD-STANDARDS.md، قسم ٠)
    var ACCENT2 = '#D4AF37';  // --violet2 (نفس المرجع) — لون الأزرار/الحدود/الحلقات بالشاشات المعيارية الجديدة (الإعدادات/اللوبي/تبويب الاختيار/الفائز). عجلة الروليت نفسها تحتفظ بلوحتها الخاصة المعتمدة سابقاً (C_GOLD/C_BLACK/C_BRONZE) لأنها قرار تصميم منفصل تم اعتماده بجلسة مخصَّصة له.

    var ICON_GUN = 'icons/gun.png';
    var ICON_HEART_RED = 'icons/heart-red.png';
    var ICON_HEART_GREEN = 'icons/heart-green.png';
    var ICON_CROWN = 'icons/crown.png';

    var LIVES_OPTIONS = [6, 5, 4, 3].map(function (n) { return { label: String(n), value: n }; });
    var BULLETS_OPTIONS = [4, 3, 2, 1].map(function (n) { return { label: String(n), value: n }; });
    var TIMER_OPTIONS = [40, 30, 25, 20].map(function (s) { return { label: s + 'ث', value: s }; });

    /* ======================================================================
     *  0) صوت — Web Audio API حياً، بدون ملفات (نفس أسلوب النسخة الأولى)
     * ==================================================================== */
    var _actx = null;
    function audioCtx() {
        if (_actx) return _actx;
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try { _actx = new Ctx(); } catch (e) { _actx = null; }
        return _actx;
    }
    function currentVolume() { return 0.7; }
    function playTone(freq, durationMs, opts) {
        var ctx = audioCtx();
        if (!ctx) return;
        opts = opts || {};
        try {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = opts.type || 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, ctx.currentTime + durationMs / 1000);
            var peak = (opts.peak != null ? opts.peak : 0.28) * currentVolume();
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
        } catch (e) { /* تجاهل صامت */ }
    }
    function playNoiseBang() {
        var ctx = audioCtx();
        if (!ctx) return;
        try {
            var dur = 0.35;
            var buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
            var data = buffer.getChannelData(0);
            for (var i = 0; i < data.length; i++) {
                var decay = 1 - (i / data.length);
                data[i] = (Math.random() * 2 - 1) * decay * decay;
            }
            var noise = ctx.createBufferSource();
            noise.buffer = buffer;
            var lowpass = ctx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.setValueAtTime(1800, ctx.currentTime);
            lowpass.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + dur);
            var gain = ctx.createGain();
            gain.gain.setValueAtTime(0.9 * currentVolume(), ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
            noise.connect(lowpass); lowpass.connect(gain); gain.connect(ctx.destination);
            noise.start();
            playTone(90, 180, { type: 'square', peak: 0.5, slideTo: 40 });
        } catch (e) { /* تجاهل صامت */ }
    }
    function playSpinTick() { playTone(500, 60, { type: 'square', peak: 0.12, slideTo: 260 }); }
    function playSafeChime() { playTone(520, 220, { type: 'sine', peak: 0.22, slideTo: 780 }); }
    function playMissTone() {
        // ⚠️ صوت مخصَّص لنتيجة "فاضي" (استهداف فاشل) — نغمتان هابطتان
        // قصيرتان، مختلف عن نغمة النجاة الإيجابية القديمة (playSafeChime
        // ما زالت تُستخدَم كطبقة صوت إضافية خفيفة، وهذي تعلوها كإشارة
        // "فشل" واضحة).
        playTone(360, 150, { type: 'sine', peak: 0.22, slideTo: 220 });
        window.setTimeout(function () { playTone(260, 200, { type: 'sine', peak: 0.2, slideTo: 160 }); }, 130);
    }
    function playWinFanfare() {
        [523, 659, 784, 1046].forEach(function (f, idx) {
            window.setTimeout(function () { playTone(f, 260, { type: 'triangle', peak: 0.24 }); }, idx * 130);
        });
    }

    /* ======================================================================
     *  1) حالة المباراة
     * ==================================================================== */
    var _alive = [];
    var _eliminated = [];         // [{player}]
    var _heartHits = {};          // playerId -> عدد مرّات الاستهداف اللي نجا منها (عرض بصري بحت)
    var _appliedLivesCount = 4;   // ⚠️ سقف القلوب المُطبَّق فعلياً — يتغيّر فقط عبر "حفظ جميع التغييرات"
    var _settings = null;
    var _startedAt = null;
    var _matchActive = false;
    var _wheelSpinning = false;
    var _wheelDisplayMode = 'wheel'; // 'wheel' | 'reel' — يتحكم فيه الاستريمر بزر أعلى الشاشة
    var _pendingTurn = null;      // { chooser, candidates: [...] }
    var _selectedCandidateIdx = null; // لتفعيل زر "اقصاء اللاعب" اليدوي
    var _commentUnsub = null;
    var _autoPlayActive = false;
    var _autoPlayTimer = null;
    var _lastChooserId = null;      // لتقليل احتمال وقوف العجلة على نفس الشخص مرتين متتاليتين
    var _streamerUsername = '';     // ⚠️ يوزرنيم الاستريمر المتّصل — يُلتقَط لحظة الضغط على "اتصال" (لعرضه كـ"مُقصي" بالإقصاء اليدوي)

    function streamerVirtualPlayer() {
        return { id: 'tiktok:' + (_streamerUsername || 'streamer'), name: _streamerUsername || 'المذيع', avatarUrl: null };
    }
    var _eventLog = [];            // [{icon, text}] — لوحة "أحداث المباراة"
    var _playerNumbers = {};       // playerId -> رقم ثابت طول المباراة (حسب ترتيب دخوله للوبي)
    var _nextPlayerNumber = 1;
    var _eliminationsCaused = {};  // playerId -> عدد مرّات إقصاء لاعبين آخرين (لبطاقة "الأكثر إقصاءً")

    function resetMatchState() {
        _alive = [];
        _eliminated = [];
        _heartHits = {};
        _settings = null;
        _startedAt = null;
        _matchActive = false;
        _wheelSpinning = false;
        _pendingTurn = null;
        _selectedCandidateIdx = null;
        if (_autoPlayTimer) { window.clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
        _autoPlayActive = false;
        _lastChooserId = null;
        _eventLog = [];
        _playerNumbers = {};
        _nextPlayerNumber = 1;
        _eliminationsCaused = {};
    }

    // ⚠️ رقم كل لاعب يُحدَّد مرّة وحدة، لحظة دخوله فعلياً (بداية المباراة
    // بترتيب اللوبي، أو انضمامه وسط المباراة) — ويبقى ثابتاً معه طول
    // المباراة بكل مكان (شاشة الاختيار، سجل الأحداث...)، ما يُعاد حسابه
    // أبداً حسب ترتيب المتبقّين بكل جولة.
    function assignPlayerNumber(p) {
        if (!p || !p.id) return;
        if (_playerNumbers[p.id] == null) {
            _playerNumbers[p.id] = _nextPlayerNumber++;
        }
    }

    function logEvent(icon, text) {
        _eventLog.unshift({ icon: icon, text: text });
        if (_eventLog.length > 60) _eventLog.length = 60;
        var list = el('rr-eventlog-list');
        if (!list) return;
        list.innerHTML = _eventLog.map(function (e) {
            return '<div class="rr-eventlog-item">' + e.icon + ' ' + escapeHtml(e.text) + '</div>';
        }).join('');
    }

    function liveSettings() {
        return (AGP.gameShell && typeof AGP.gameShell.getSettings === 'function') ? AGP.gameShell.getSettings() : (_settings || {});
    }
    function currentBulletsPerRound() {
        var n = parseInt(liveSettings().bulletsPerRound, 10);
        if (!n || n < 1) n = 1;
        if (n > REVOLVER_CHAMBERS) n = REVOLVER_CHAMBERS;
        return n;
    }
    function currentSelectionSeconds() {
        var n = parseInt(liveSettings().selectionTimerSeconds, 10);
        return n || 30;
    }

    /* ======================================================================
     *  2) أدوات صغيرة
     * ==================================================================== */
    function el(id) { return document.getElementById(id); }
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }
    function playerLabel(p) { return (p && (p.name || p.id)) || '—'; }
    function tiktokUsernameFor(player) {
        var id = (player && player.id) || '';
        if (id.indexOf('tiktok:') === 0) return id.slice('tiktok:'.length);
        return (player && (player.name || player.id)) || '';
    }
    function findPlayerByIdAnywhere(id) {
        var found = _alive.filter(function (p) { return p.id === id; })[0];
        if (found) return found;
        var entry = _eliminated.filter(function (e) { return e.player.id === id; })[0];
        if (entry) return entry.player;
        return null;
    }
    function shuffleArray(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }
    function ensureZainFont() {
        if (el('rr-zain-font-link')) return;
        var pre1 = document.createElement('link'); pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
        var pre2 = document.createElement('link'); pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous';
        var sheet = document.createElement('link'); sheet.id = 'rr-zain-font-link'; sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Zain:ital,wght@0,200;0,300;0,400;0,700;0,800;0,900;1,300;1,400&display=swap';
        document.head.appendChild(pre1); document.head.appendChild(pre2); document.head.appendChild(sheet);
    }

    /* ======================================================================
     *  3) القلوب (عرض بصري بحت)
     * ==================================================================== */
    function heartsRowHtml(player) {
        var hits = _heartHits[player.id] || 0;
        var cap = _appliedLivesCount;
        var html = '<div class="rr-hearts-row">';
        for (var i = 0; i < cap; i++) {
            var icon = i < hits ? ICON_HEART_RED : ICON_HEART_GREEN;
            html += '<img class="rr-heart-pip" src="' + icon + '" alt="">';
        }
        html += '</div>';
        return html;
    }

    /* ======================================================================
     *  4) الأنماط
     * ==================================================================== */
    function injectStageStyles() {
        if (el('rr-stage-styles')) return;
        ensureZainFont();
        var style = document.createElement('style');
        style.id = 'rr-stage-styles';
        style.textContent = [
            '*{font-family:"Zain",Cairo,sans-serif !important;}',
            ':root{--rr-gold:' + C_GOLD + ';--rr-gold-lt:#c99a3d;--rr-black:' + C_BLACK + ';--rr-brown:' + BG_BROWN + ';}',

            '#rr-stage{position:fixed;inset:0;padding:86px 16px 24px;display:flex;flex-direction:column;',
            'align-items:center;justify-content:center;gap:14px;overflow-y:auto;direction:rtl;color:#f3eefc;}',

            /* ⚠️ زر عائم دائري (⚙️ بس) بدل الزر النصّي القديم — مطابق للملف
             * المرجعي (rr-inmatch-settings.html). */
            '#rr-settings-toggle{position:fixed;top:74px;right:16px;z-index:400;width:50px;height:50px;',
            'border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,' + BG_BROWN + ',' + ACCENT2 + ');',
            'color:#fff;font-size:1.3em;display:flex;align-items:center;justify-content:center;',
            'box-shadow:0 8px 22px rgba(212,175,55,0.4);padding:0;transition:transform .15s;}',
            '#rr-settings-toggle:hover{transform:scale(1.06);}',
            '#rr-eventlog-toggle{position:fixed;top:74px;left:16px;z-index:400;padding:8px 18px;border-radius:999px;',
            'border:1px solid var(--rr-gold);background:rgba(0,0,0,0.5);color:#f2e6cf;font-weight:700;font-size:0.85em;cursor:pointer;}',
            '#agp-header-settings-btn{display:none !important;}',
            'body.agp-shell-active{background:linear-gradient(170deg,#1a1206 0%,#000 100%) !important;}',
            /* ⚠️ شاشة "جاري الاتصال" — كانت لسا بلونها البنفسجي الافتراضي
             * (اللون البنفسجي المستخدَم بالمنصة عموماً). نعيد تصميمها
             * بهوية اللعبة بالكامل، مع زر رجوع يظهر فقط بحالة الخطأ. */
            '#agp-shell-box.agp-connecting-box{width:min(420px,94vw) !important;height:auto !important;',
            'background:linear-gradient(180deg,' + BG_BROWN + ',#000) !important;border:2px solid ' + ACCENT2 + ' !important;',
            'border-radius:18px !important;text-align:center;padding:38px 28px !important;}',
            '#agp-shell-box.agp-connecting-box::before{content:"";display:block;width:52px;height:52px;',
            'margin:0 auto 18px;border-radius:50%;border:4px solid rgba(242,230,207,0.18);',
            'border-top-color:' + ACCENT2 + ';animation:rr-conn-spin 0.9s linear infinite;}',
            '@keyframes rr-conn-spin{to{transform:rotate(360deg);}}',
            '#agp-shell-box.agp-connecting-box h2{color:' + ACCENT2 + ' !important;font-size:1.15em !important;margin:0 0 8px !important;}',
            '#agp-shell-box.agp-connecting-box .agp-shell-status{color:#e8d9b8 !important;font-size:0.9em !important;}',
            '.rr-connect-retry-btn{margin-top:18px;padding:11px 26px;border-radius:999px;border:1px solid ' + ACCENT2 + ';',
            'background:transparent;color:#f2e6cf;font-weight:800;font-size:0.85em;cursor:pointer;font-family:inherit;}',
            /* ⚠️ الهيدر العلوي الثابت (مشترك بين كل الألعاب) كان لسا بلونه
             * البنفسجي الافتراضي — نعيد تلوينه بهوية اللعبة هنا فقط. */
            '#agp-persistent-header{background:linear-gradient(90deg,#1a1206,#000) !important;',
            'border-bottom:1px solid rgba(132,91,27,0.4) !important;}',
            '.agp-header-icon-btn{border-color:rgba(132,91,27,0.45) !important;}',
            /* ⚠️ لوحة "أحداث المباراة" — تبويب جانبي ثابت يسار الشاشة، مقاس
             * ثابت 300×750 (طلب صريح)، ينزلق دخولاً/خروجاً بدل نافذة منبثقة
             * بمنتصف الشاشة. */
            '#rr-eventlog-panel{position:fixed;top:110px;left:16px;width:300px;height:750px;max-height:80vh;',
            'z-index:399;background:linear-gradient(180deg,' + BG_BROWN + ',#000);border:2px solid var(--rr-gold);',
            'border-radius:16px;padding:16px;box-sizing:border-box;display:flex;flex-direction:column;',
            'transform:translateX(-140%);transition:transform 0.35s ease;box-shadow:0 10px 30px rgba(0,0,0,0.5);}',
            '#rr-eventlog-panel.rr-open{transform:translateX(0);}',
            '#rr-eventlog-panel h3{margin:0 0 12px;color:#e8c56b;font-size:1em;font-weight:900;text-align:center;}',
            '#rr-eventlog-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;}',
            '.rr-eventlog-item{font-size:0.78em;color:#f2e6cf;border-bottom:1px solid rgba(255,255,255,0.1);',
            'padding-bottom:6px;line-height:1.5;}',

            '#rr-wheel-wrap{position:relative;width:min(460px,88vw);aspect-ratio:1;margin-top:6px;}',
            '#rr-wheel{position:absolute;inset:0;border-radius:50%;border:5px solid var(--rr-gold);',
            'box-shadow:0 0 30px rgba(0,0,0,0.6);transition:transform 3.4s cubic-bezier(0.15,0.85,0.25,1);overflow:hidden;}',
            '.rr-wheel-label{position:absolute;top:50%;left:50%;transform-origin:center;font-size:0.72em;',
            'font-weight:800;color:#f2e6cf;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;pointer-events:none;}',
            '#rr-wheel-pointer{position:absolute;top:-18px;left:50%;transform:translateX(-50%);width:0;height:0;',
            'border-left:14px solid transparent;border-right:14px solid transparent;border-top:24px solid var(--rr-gold);',
            'z-index:6;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));}',
            /* ⚠️ زر مستقل بالتدفّق الطبيعي (مو معلَّق فوق العجلة بعد الحين)
             * — يبقى ظاهراً ويشتغل بكل الأوضاع (عجلة/بكرة) بدون استثناء. */
            '#rr-wheel-hub{margin:14px auto 0;width:96px;height:96px;border-radius:50%;border:4px solid var(--rr-gold);',
            'cursor:pointer;background:radial-gradient(circle at 35% 30%,#2a1e0c,#0e0b06);display:flex;',
            'flex-direction:column;align-items:center;justify-content:center;gap:2px;box-shadow:0 0 20px rgba(132,91,27,0.6);}',
            '#rr-wheel-hub img{width:42px;height:42px;object-fit:contain;}',
            '#rr-wheel-hub span{font-size:0.78em;font-weight:900;color:#f2e6cf;}',
            '#rr-wheel-hub:disabled{opacity:0.5;cursor:not-allowed;}',

            /* ⚠️ الشكل الثاني الاختياري: بكرة سكرول رأسية بدل العجلة
             * الدائرية — نفس آلية اختيار "صاحب الدور" بالضبط، بس بشكل
             * سلوت مشين (تتحرّك الأسماء لفوق وتتوقّف عشوائياً). فيوبورت
             * مقنّع (mask) يعرض ٣ صفوف بس، والصف الأوسط هو منطقة الاختيار
             * البارزة — صورة + اسم + رقم لكل لاعب. */
            '#rr-display-mode-toggle{position:fixed;top:74px;left:50%;transform:translateX(-50%);z-index:400;',
            'padding:8px 18px;border-radius:999px;border:1px solid var(--rr-gold);background:rgba(0,0,0,0.5);',
            'color:#f2e6cf;font-weight:700;font-size:0.8em;cursor:pointer;}',
            '#rr-reel-wrap{position:relative;width:min(560px,90vw);height:450px;margin:6px auto 0;',
            'border-radius:16px;background:rgba(0,0,0,0.35);border:2px solid var(--rr-gold);',
            'box-shadow:0 0 30px rgba(0,0,0,0.5);overflow:hidden;',
            'mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%);',
            '-webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%);}',
            '#rr-reel-list{position:absolute;left:0;right:0;top:0;transition:transform 3.8s cubic-bezier(0.15,0.85,0.25,1);}',
            '.rr-reel-item{height:150px;display:flex;align-items:center;justify-content:center;gap:16px;',
            'padding:0 24px;box-sizing:border-box;}',
            '.rr-reel-av{width:70px;height:70px;border-radius:50%;background:#241a0c;',
            'border:2px solid rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;',
            'font-weight:800;font-size:1.3em;color:#fff;flex:none;object-fit:cover;opacity:0.5;transition:opacity .2s;}',
            '.rr-reel-name{font-size:1.4em;font-weight:800;color:#9d92b3;opacity:0.5;flex:1;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap;transition:opacity .2s,color .2s,font-size .2s;}',
            '.rr-reel-num{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.1);',
            'color:#9d92b3;font-weight:900;font-size:1em;display:flex;align-items:center;justify-content:center;',
            'flex:none;opacity:0.5;transition:opacity .2s,background .2s,color .2s;}',
            '.rr-reel-item.rr-reel-highlight .rr-reel-av{opacity:1;}',
            '.rr-reel-item.rr-reel-highlight .rr-reel-name{opacity:1;color:#fff;font-size:1.6em;}',
            '.rr-reel-item.rr-reel-highlight .rr-reel-num{opacity:1;background:' + ACCENT2 + ';color:#241a0c;}',
            '#rr-reel-pointer-line{position:absolute;top:150px;left:0;right:0;height:150px;pointer-events:none;',
            'border-top:2px solid var(--rr-gold);border-bottom:2px solid var(--rr-gold);',
            'background:linear-gradient(90deg,rgba(212,175,55,0.12),rgba(212,175,55,0.04));z-index:2;}',

            '#rr-wheel-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}',
            '#rr-wheel-actions button{padding:8px 20px;border-radius:999px;border:1px solid var(--rr-gold);',
            'background:rgba(255,255,255,0.06);color:#f2e6cf;font-weight:700;font-size:0.82em;cursor:pointer;}',
            '#rr-wheel-actions button.rr-active{background:var(--rr-gold);color:#241a0c;}',
            '#rr-wheel-actions button:disabled{opacity:0.4;cursor:not-allowed;}',

            '.rr-hearts-row{display:flex;gap:2px;justify-content:center;margin-top:4px;}',
            '.rr-heart-pip{width:13px;height:13px;object-fit:contain;}',

            /* ---- شاشة "مرحلة الاختيار" ---- */
            '#rr-select-overlay{position:fixed;inset:0;z-index:100010;display:none;align-items:center;',
            'justify-content:center;background:rgba(6,4,1,0.82);padding:16px;}',
            '#rr-select-box{width:1150px;max-width:97vw;height:700px;max-height:94vh;border-radius:20px;',
            'padding:14px 18px 18px;box-sizing:border-box;',
            'background:linear-gradient(180deg,#241a0c,#0d0904);border:2px solid var(--rr-gold);position:relative;overflow:hidden;',
            'box-shadow:0 0 50px rgba(212,175,55,0.3);display:flex;flex-direction:column;}',
            '#rr-select-box::before{content:"";position:absolute;inset:0;background:url(../../logo.png) no-repeat center;',
            'background-size:220px auto;opacity:0.2;pointer-events:none;}',
            '#rr-select-box > *{position:relative;z-index:1;}',
            '#rr-select-title{text-align:center;font-size:0.92em;color:#9d92b3;margin-bottom:6px;flex:none;}',
            '#rr-select-title b{color:' + ACCENT2 + ';font-weight:900;}',
            /* ---- صف واحد فوق: بطاقة صاحب الدور المكبَّرة + زرّا التحكم اليدوي (متمركزان معاً) ---- */
            '#rr-chooser-row{display:flex;align-items:center;justify-content:center;gap:26px;margin-bottom:12px;flex:none;}',
            '.rr-chooser-card{display:flex;align-items:center;gap:12px;}',
            '.rr-chooser-ring{width:88px;height:88px;border-radius:50%;padding:4px;box-sizing:border-box;flex:none;',
            'background:' + ACCENT2 + ';box-shadow:0 0 18px rgba(212,175,55,0.55);}',
            '.rr-chooser-ring img,.rr-chooser-ring .rr-fallback{width:100%;height:100%;border-radius:50%;',
            'object-fit:cover;background:#241a0c;display:flex;align-items:center;',
            'justify-content:center;color:#fff;font-weight:900;font-size:1.5em;overflow:hidden;}',
            '.rr-chooser-nmrow{display:flex;align-items:center;gap:10px;}',
            '.rr-chooser-nm{font-size:1.35em;font-weight:900;color:#fff;}',
            '.rr-chooser-num{width:34px;height:34px;border-radius:50%;background:' + ACCENT2 + ';color:#241a0c;',
            'font-size:1em;font-weight:900;display:flex;align-items:center;justify-content:center;flex:none;}',
            '.rr-chooser-hearts{display:flex;gap:3px;margin-top:6px;}',
            '#rr-select-actions{display:flex;flex-direction:row;gap:8px;width:230px;flex:none;}',
            '#rr-select-actions button{flex:1;padding:9px 6px;border-radius:999px;border:none;font-weight:800;',
            'cursor:pointer;font-family:inherit;font-size:0.74em;color:#fff;white-space:nowrap;line-height:1.3;}',
            '#rr-skip-btn{background:linear-gradient(90deg,' + ACCENT2 + ',#8a7024);color:#241a0c;}',
            '#rr-force-eliminate-btn{background:linear-gradient(90deg,#e24b4a,#b91c1c);opacity:0.5;cursor:not-allowed;}',
            '#rr-force-eliminate-btn.rr-enabled{opacity:1;cursor:pointer;}',
            /* ---- المؤقّت — سطر مستقل بعد صف صاحب الدور مباشرة، بارز وكبير ---- */
            '#rr-select-timer{text-align:center;font-weight:900;font-size:1.5em;color:#ffe066;margin-bottom:10px;flex:none;}',

            /* ---- شبكة المرشّحين — ٤ أعمدة ثابتة، بطاقة لوبي-قياسي-v1
             * بالضبط (تراكب الأفاتار ٢٢٪ على لوح اسم دائري بالكامل، مو
             * ملاصقة بحافة مسطّحة) — القلوب صف مستقل ملاصق أسفل اللوح. ---- */
            '#rr-candidates-grid{flex:1;min-height:0;overflow-y:auto;display:grid;',
            'grid-template-columns:repeat(4,1fr);gap:0.5cm;align-content:flex-start;padding:4px 2px 6px;}',
            '.rr-lc-card{display:flex;flex-direction:column;align-items:center;cursor:pointer;}',
            '.rr-lc-row{display:inline-flex;align-items:center;}',
            '.rr-lc-avatar{width:60px;height:60px;border-radius:50%;background:var(--rr-gold);',
            'border:3px solid rgba(255,255,255,0.55);flex:none;object-fit:cover;display:flex;align-items:center;',
            'justify-content:center;color:#fff;font-weight:800;position:relative;z-index:2;}',
            '.rr-lc-plate{position:relative;height:48px;width:194px;box-sizing:border-box;',
            'margin-inline-start:-13px;padding-inline-start:31px;padding-inline-end:10px;',
            'display:flex;align-items:center;justify-content:flex-start;gap:8px;font-weight:800;color:#fff;',
            'background:rgba(255,255,255,0.1);border:1px solid rgba(212,175,55,0.35);',
            'border-radius:999px;overflow:hidden;z-index:1;}',
            '.rr-lc-name{font-size:1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;}',
            '.rr-lc-num{width:32px;height:32px;flex:none;',
            'border-radius:50%;background:' + ACCENT2 + ';color:#241a0c;font-size:1.05em;font-weight:900;',
            'display:flex;align-items:center;justify-content:center;z-index:3;}',
            '.rr-lc-hearts{display:flex;gap:2px;margin-top:6px;}',
            '.rr-lc-card.rr-candidate-selected .rr-lc-plate{box-shadow:0 0 0 2px #e24b4a;}',

            /* ---- شاشة "الاشتباك" ---- */
            '#rr-clash-overlay{position:fixed;inset:0;z-index:100011;display:none;align-items:center;',
            'justify-content:center;background:rgba(6,4,1,0.86);padding:16px;}',
            '#rr-clash-box{width:1000px;max-width:95vw;border-radius:20px;padding:30px;box-sizing:border-box;',
            'background:linear-gradient(180deg,#3a2810,#1a1206);border:2px solid var(--rr-gold);position:relative;',
            'overflow:hidden;}',
            '#rr-clash-box.rr-clash-hit{border-color:#e24b4a;}',
            '#rr-clash-header{text-align:center;color:#e8c56b;font-weight:900;font-size:1.1em;margin-bottom:16px;}',
            '#rr-clash-header.rr-success-title{color:#4ade80;}',
            '#rr-clash-header.rr-miss-title{color:#fff;}',
            '#rr-clash-row{display:flex;align-items:center;justify-content:center;gap:60px;}',
            '.rr-clash-side{text-align:center;position:relative;}',
            '.rr-clash-avatar-wrap{width:130px;height:130px;border-radius:50%;padding:4px;margin:0 auto;',
            'position:relative;}',
            '.rr-clash-avatar-wrap.rr-shooter{border:3px solid #4ade80;box-shadow:0 0 20px rgba(74,222,128,0.55);}',
            '.rr-clash-avatar-wrap.rr-target{border:3px solid rgba(255,255,255,0.4);}',
            '.rr-clash-avatar-wrap img.rr-avatar-img{width:100%;height:100%;border-radius:50%;object-fit:cover;}',
            '.rr-clash-name{font-weight:800;color:#fff;margin-top:8px;}',
            '#rr-clash-sentence{text-align:center;color:#f2e6cf;font-size:0.95em;font-weight:700;margin-top:18px;}',
            '#rr-clash-sentence b{font-weight:900;}',
            '#rr-clash-gun{width:70px;height:auto;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.6));}',
            '.rr-flash-white{animation:rr-flash-white 0.5s ease-out;}',
            '@keyframes rr-flash-white{0%{box-shadow:0 0 0 0 rgba(255,255,255,0);}30%{box-shadow:0 0 40px 20px rgba(255,255,255,0.9);}100%{box-shadow:0 0 0 0 rgba(255,255,255,0);}}',
            '.rr-flash-red{animation:rr-flash-red 0.6s ease-out;}',
            '@keyframes rr-flash-red{0%{box-shadow:0 0 0 0 rgba(226,75,74,0);}30%{box-shadow:0 0 46px 24px rgba(226,75,74,0.95);}100%{box-shadow:0 0 0 0 rgba(226,75,74,0);}}',
            '.rr-target-vanish{animation:rr-target-vanish 1.4s ease-in forwards;}',
            '@keyframes rr-target-vanish{0%{opacity:1;filter:none;}40%{filter:brightness(2) saturate(3) hue-rotate(-20deg);}',
            '100%{opacity:0;filter:blur(6px) brightness(0.4);transform:scale(0.7);}}',

            /* ---- زوّار اللوبي/الإعدادات المشتركة — إعادة تلوين كاملة ---- */
            '#agp-shell-overlay{background:rgba(8,5,1,0.55) !important;}',
            '#agp-shell-box{background:linear-gradient(180deg,' + BG_BROWN + ',#000) !important;',
            'opacity:1 !important;border:2px solid var(--rr-gold) !important;}',
            '#agp-shell-box.agp-lobby-box{background:linear-gradient(180deg,' + BG_BROWN + 'e6,#000e) !important;}',
            '#agp-shell-box h2{color:#f2e6cf !important;}',
            '#agp-header-title{color:#e8c56b !important;}',
            '.agp-shell-row-label{color:#fff !important;}',
            /* ⚠️ الشكل الافتراضي: كبسولة بعرض تلقائي حسب النص (لخيارات نصّية
             * زي "المتابعين فقط"/"يقصى صاحب الدور") — لون أبيض واضح بالحالتين.
             * الدائرة الثابتة المقاس تنطبق فقط على حقلي الأرقام (حجم الساقية/
             * عدد الطلقات) عبر محدِّد data-key، تفادياً لتكسير النصوص الطويلة. */
            '.agp-pill-btn{background:transparent !important;color:#fff !important;',
            'border:1px solid var(--rr-gold) !important;border-radius:999px !important;padding:6px 16px !important;',
            'font-size:0.82em;white-space:nowrap;}',
            '.agp-pill-btn.agp-pill-active{background:var(--rr-gold-lt) !important;color:#241a0c !important;}',
            '[data-key="livesCount"],[data-key="bulletsPerRound"]{',
            'border-radius:50% !important;width:30px;height:30px;padding:0 !important;',
            'display:inline-flex;align-items:center;justify-content:center;}',
            '.agp-shell-btn-connect{background:var(--rr-gold) !important;color:#241a0c !important;border:none !important;}',
            /* ⚠️ شاشة الإعدادات الأولى (قبل الاتصال) — قسم ٥ بالمعيار:
             * صفحة كاملة 100vh بدل صندوق منبثق بمنتصف الشاشة، بطاقات
             * منطقية بحدود مدوّرة، عرض أقصى ~720px للمحتوى، سكرول داخلي. */
            '#agp-shell-box.rr-pre-match-settings{width:100vw !important;height:100vh !important;',
            'max-width:100vw !important;max-height:100vh !important;border-radius:0 !important;margin:0 !important;',
            'overflow-y:auto !important;padding:76px 16px 30px !important;box-sizing:border-box;}',
            '#agp-shell-box.rr-pre-match-settings h2{text-align:center;max-width:720px;margin:0 auto 18px !important;}',
            '#agp-shell-box.rr-pre-match-settings > .agp-field-wrap,',
            '#agp-shell-box.rr-pre-match-settings > div:not(.rr-setting-card):not(.rr-settings-btn-row)',
            '{max-width:720px;margin-left:auto !important;margin-right:auto !important;}',
            '.rr-setting-card{max-width:720px;margin:0 auto 16px;background:rgba(255,255,255,0.04);',
            'border:1px solid rgba(212,175,55,0.35);border-radius:16px;padding:4px 18px;box-sizing:border-box;}',
            '.rr-setting-card-label{font-size:0.78em;color:#c9b48a;font-weight:800;padding:10px 0 2px;}',
            '.rr-settings-btn-row{max-width:720px;margin:10px auto 0;}',
            '.agp-shell-counter-row button{border-color:' + ACCENT2 + ' !important;color:#fff !important;',
            'background:transparent !important;}',
            '.agp-count-input{border-color:' + ACCENT2 + ' !important;background:#0d0904 !important;',
            'color:#fff !important;}',
            '.rr-settings-btn-row{display:flex;gap:10px;}',
            '.rr-settings-btn-row > *{flex:1;width:auto !important;}',
            '.rr-home-from-settings-btn{background:transparent !important;color:#f2e6cf !important;',
            'border:1px solid var(--rr-gold) !important;border-radius:999px;padding:12px;font-weight:800;',
            'font-size:0.9em;cursor:pointer;font-family:inherit;}',
            /* ⚠️ درج جانبي ينزلق من يمين الشاشة — إعدادات وسط المباراة */
            '#agp-shell-overlay:has(.rr-inmatch-drawer){align-items:stretch !important;justify-content:flex-end !important;',
            'padding:0 !important;}',
            '#agp-shell-box.rr-inmatch-drawer{width:400px !important;max-width:90vw !important;height:100vh !important;',
            'max-height:100vh !important;border-radius:0 !important;margin:0 !important;border:none !important;',
            'border-inline-start:1px solid rgba(212,175,55,0.35) !important;display:flex !important;',
            'flex-direction:column !important;overflow-y:auto !important;padding:60px 20px 24px !important;',
            'animation:rr-drawer-in .3s cubic-bezier(0.32,0.72,0,1);}',
            '@keyframes rr-drawer-in{from{transform:translateX(105%);}to{transform:translateX(0);}}',
            '#agp-shell-box.rr-inmatch-drawer h2{font-size:1.1em;text-align:center;margin:0 0 14px !important;}',
            '.rr-add-player-row{margin-bottom:14px;}',
            '.rr-add-player-row .agp-shell-btn-connect{width:100% !important;}',
            '.rr-accordion{border:1px solid rgba(212,175,55,0.3);border-radius:14px;overflow:hidden;margin:14px 0;}',
            '.rr-accordion-head{width:100%;display:flex;align-items:center;justify-content:space-between;',
            'padding:12px 16px;background:rgba(255,255,255,0.04);border:none;color:#fff;font-weight:800;',
            'font-size:0.9em;cursor:pointer;font-family:inherit;}',
            '.rr-accordion-chevron{transition:transform .2s;}',
            '.rr-accordion.rr-open .rr-accordion-chevron{transform:rotate(180deg);}',
            '.rr-accordion-body{max-height:0;overflow:hidden;transition:max-height .25s ease;}',
            '.rr-accordion.rr-open .rr-accordion-body{max-height:320px;overflow-y:auto;}',
            '.rr-accordion-body .agp-settings-player-row{padding:10px;justify-content:flex-start !important;}',
            '.rr-exit-btn{background:transparent !important;color:#e24b4a !important;',
            'border:1px solid #e24b4a !important;border-radius:999px;padding:10px 14px;font-weight:900;',
            'cursor:pointer;font-size:0.82em;font-family:inherit;white-space:nowrap;}',

            '.rr-lobbyscreen-remove-btn{position:absolute;top:-6px;left:-6px;width:22px;height:22px;border-radius:50%;',
            'background:#e24b4a;color:#fff;border:2px solid #000;font-weight:900;font-size:12px;line-height:18px;',
            'text-align:center;cursor:pointer;z-index:2;padding:0;}',
            '.agp-shell-player-list li{position:relative !important;}',
            '.agp-player-remove-btn{background:#e24b4a !important;border-radius:50% !important;color:#fff !important;}',
            /* ⚠️ الإطارات تبقى تظهر طبيعياً باللوبي (نفس بقية الألعاب) —
             * تُخفى فقط داخل تبويب "الاعبين المشاركين" وسط المباراة (طلب
             * صريح: بدون إطارات هناك تحديداً، بشكل موحّد للجميع). */
            '#agp-settings-player-list .agp-pcard-tpl,#agp-settings-player-list .agp-pcard-tpl-frame-img{display:none !important;}',
            /* ⚠️ قائمة "الاعبين المشاركين" وسط المباراة — صفوف مبسّطة عمودية
             * (بدون إطارات، بدون شكل بطاقات اللوبي)، بحجم ثابت وسكرول داخلي. */
            '#agp-settings-player-list{display:flex !important;flex-direction:column !important;',
            'flex-wrap:nowrap !important;max-height:160px;overflow-y:auto;gap:4px !important;}',
            '#agp-settings-player-list li{width:100% !important;justify-content:space-between !important;',
            'background:rgba(255,255,255,0.05);border-radius:8px;padding:4px 8px !important;}',
            '#agp-settings-player-list .agp-pcard-avatar-basic{width:26px !important;height:26px !important;}',
            '#agp-settings-player-list .agp-pcard-name-basic{font-size:11px !important;width:auto !important;',
            'max-width:none !important;flex:1;}',
            /* ⚠️ شاشة اللوبي — قسم ٤ بالمعيار: صفحة كاملة 100vh (بدون سكرول
             * على مستوى الصفحة)، وفقط منطقة شبكة البطاقات تتحرّك داخلياً،
             * وتتوقف قبل الشريط السفلي الثابت دائماً. */
            '#agp-shell-box.agp-lobby-box{width:100vw !important;height:100vh !important;',
            'max-width:100vw !important;max-height:100vh !important;border-radius:0 !important;margin:0 !important;',
            'display:flex !important;flex-direction:column !important;overflow:hidden !important;padding:70px 16px 20px !important;}',
            '#agp-shell-box.agp-lobby-box h2{flex:none;text-align:center;border-bottom:1px solid rgba(212,175,55,0.3);',
            'padding-bottom:14px;margin-bottom:10px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint{flex:none;font-size:1.05em !important;}',
            '#agp-shell-box.agp-lobby-box #agp-entrance-stage,',
            '#agp-shell-box.agp-lobby-box #agp-entrance-settled-list{flex:none;}',
            '#rr-lobby-scroll{flex:1;overflow-y:auto;overflow-x:hidden;min-height:0;margin-top:1cm;}',
            /* ⚠️ ٣ أعمدة ثابتة دائماً (طلب صريح بالمعيار) — بفجوة ٠.٥سم،
             * بعرض متوسّط الشاشة، بدل flex-wrap يتفاعل مع عدد اللاعبين. */
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{display:grid !important;',
            'grid-template-columns:repeat(3,1fr) !important;gap:0.5cm !important;max-width:840px;margin:0 auto;',
            'align-items:center;justify-items:center;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list li{flex:0 0 auto !important;align-items:center;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-avatar-basic{width:60px !important;height:60px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-name-basic{font-size:22px !important;padding:0 18px !important;',
            'width:194px !important;max-width:194px !important;overflow:hidden !important;text-overflow:ellipsis !important;',
            'white-space:nowrap !important;}',
            /* ⚠️ لاعب عنده إطار (frame) مفعَّل يُرسَم بقالب مختلف تماماً
             * (.agp-pcard-tpl) بارتفاع ثابت 72px مُعايَر لحجم افتراضي أكبر
             * بكثير من بطاقاتنا — بدون هذا التصغير يفيض الصف ويحتاج سكرول
             * أفقي ويبين مقصوصاً من فوق. نفس تقنية "زووم" المستخدَمة أصلاً
             * بلعبة اسم وحيوان ونبات وجماد لنفس المشكلة — النسبة هنا
             * مُعايَرة لتطابق حجم بطاقاتنا الجديد (60px بدل 34px القديم). */
            '#agp-shell-box.agp-lobby-box .agp-pcard-tpl{zoom:0.833;}',
            /* ⚠️ سلايد الأسماء الطويلة داخل بطاقات اللوبي (marquee) */
            '.rr-name-track{display:inline-block;white-space:nowrap;will-change:transform;}',
            '.rr-name-track.rr-marquee{animation:rr-pill-slide 4.5s ease-in-out infinite;}',
            '@keyframes rr-pill-slide{0%,15%{transform:translateX(0);}',
            '45%,55%{transform:translateX(var(--rr-slide-dist));}85%,100%{transform:translateX(0);}}',

            '.rr-lobby-heading-accent{color:var(--rr-gold) !important;font-weight:900 !important;}',
            '.rr-lobby-actions-row{display:flex;gap:12px;flex:none;padding-top:16px;justify-content:center;',
            'flex-wrap:wrap;}',
            '.rr-lobby-actions-row > *{width:280px !important;padding:14px !important;}',
            '.rr-lobby-action-btn{border-radius:999px;border:1px solid var(--rr-gold);background:transparent;',
            'color:#f2e6cf;font-weight:800;font-size:0.85em;cursor:pointer;padding:10px;}',

            /* ⚠️ سبب فعلي لظهور الأزرار كدوائر: الملف المشترك يحدد
             * .agp-settings-player-actions بعرض ثابت 220px وعمود رأسي،
             * و.agp-settings-player-box بمربّع ثابت 250×250 — أي محاولة
             * لصف أفقي داخل عرض ضيق كذا تنكسر. الحل: نلغي القيم الثابتة
             * كلياً ونرتّب الصف والأزرار عمودياً (صندوق اللاعبين فوق بعرض
             * كامل، صف الأزرار تحته بعرض كامل) — نفس ترتيب المعاينة المعتمدة. */
            '.agp-settings-player-row{display:flex !important;flex-direction:column !important;',
            'align-items:stretch !important;gap:10px !important;width:100%;}',
            '.agp-settings-player-box{width:100% !important;height:auto !important;}',
            '.agp-settings-player-actions{display:flex !important;flex-direction:row !important;',
            'width:100% !important;gap:8px !important;padding-top:0 !important;}',
            '.agp-settings-player-actions > *{flex:1 1 0 !important;width:auto !important;min-width:0 !important;',
            'overflow:hidden;text-overflow:ellipsis;}',
            '.agp-settings-player-actions .agp-shell-btn-connect{margin-top:0 !important;}',
            /* ⚠️ زر إغلاق شاشة الإعدادات المُعاد فتحها (✕ الافتراضي كان
             * بلون بنفسجي شبه غير مرئي فوق خلفيتنا الغامقة) — دائرة حمراء
             * واضحة بارزة بالزاوية بدل النص الشفاف القديم. */
            '#agp-settings-close-btn{background:rgba(226,75,74,0.9) !important;color:#fff !important;',
            'width:32px;height:32px;border-radius:50% !important;display:flex !important;align-items:center;',
            'justify-content:center;font-size:16px !important;font-weight:900;}',
            '.rr-save-btn{background:#4ade80 !important;color:#0b2c14 !important;border:none !important;',
            'border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer;font-size:0.82em;',
            'font-family:inherit;white-space:nowrap;}',

            /* ---- شاشة الفائز — بطاقة أساسية ٢٥٠×٤٥٠ (فائز واحد دائماً
             * بروليت الروسي) — حلقة صورة ثابتة (بدون دوران)، وسم داخل حدود
             * الحلقة نفسها (مو تاج عائم فوقها). نفس القالب يُعاد استخدامه
             * لبطاقة "الأكثر إقصاءً" (حلقة وردية متقطّعة بدل الذهبية). ---- */
            '#rr-winner-overlay{position:fixed;inset:0;z-index:100012;display:none;align-items:center;',
            'justify-content:center;background:rgba(6,4,1,0.88);padding:16px;gap:28px;flex-wrap:wrap;}',
            '.rr-trophy-card{position:relative;width:250px;height:450px;box-sizing:border-box;border-radius:22px;',
            'padding:32px 18px;display:flex;flex-direction:column;align-items:center;justify-content:center;',
            'background:none;border:none;',
            'box-shadow:0 0 60px 16px rgba(212,175,55,0.28),0 0 130px 40px rgba(212,175,55,0.16);',
            'animation:rr-glow-pulse 2.6s ease-in-out infinite;}',
            '@keyframes rr-glow-pulse{0%,100%{box-shadow:0 0 60px 16px rgba(212,175,55,0.28),',
            '0 0 130px 40px rgba(212,175,55,0.16);}',
            '50%{box-shadow:0 0 82px 24px rgba(212,175,55,0.42),0 0 165px 50px rgba(212,175,55,0.26);}}',
            '.rr-trophy-icon{font-size:2.4em;margin-bottom:6px;}',
            '.rr-trophy-label{font-size:1.05em;font-weight:900;color:#fff;margin-bottom:20px;}',
            '.rr-ring-wrap{position:relative;width:150px;height:150px;margin:0 auto 18px;border-radius:50%;',
            'padding:7px;box-sizing:border-box;}',
            '.rr-ring-gold{background:' + ACCENT2 + ';box-shadow:0 0 28px rgba(212,175,55,0.55);}',
            '.rr-ring-pink{border:none;background:repeating-conic-gradient(#e24b4a 0deg 18deg,#3a0a0a 18deg 36deg);',
            'box-shadow:0 0 28px rgba(226,75,74,0.4);}',
            '.rr-ring-inner{width:100%;height:100%;border-radius:50%;background:#2D1932;overflow:hidden;',
            'display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:2.3em;}',
            '.rr-ring-inner img{width:100%;height:100%;object-fit:cover;}',
            '.rr-ring-badge{position:absolute;bottom:0;right:0;width:40px;height:40px;border-radius:50%;',
            'display:flex;align-items:center;justify-content:center;font-size:1.3em;border:2px solid #2D1932;}',
            '.rr-badge-winner{background:' + ACCENT2 + ';}',
            '.rr-badge-most{background:#e24b4a;}',
            '.rr-trophy-name{font-size:1.55em;font-weight:900;color:#fff;}',
            '.rr-trophy-count{color:#e8d9b8;font-size:1em;margin-top:6px;}',
            '.rr-trophy-points{margin-top:16px;font-size:1.05em;line-height:1.5;text-align:center;}',
            '.rr-points-earned{color:' + ACCENT2 + ';font-weight:800;}',
            '.rr-winner-actions{width:100%;margin-top:6px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}',
            '.rr-winner-actions button{padding:11px 24px;border-radius:999px;font-weight:800;font-size:0.9em;',
            'cursor:pointer;font-family:inherit;}',
            '#rr-replay-same-btn{background:linear-gradient(90deg,' + ACCENT2 + ',#a9791c);color:#241a0c;border:none;}',
            '#rr-newmatch-btn{background:#fff;color:#241a0c;border:1px solid ' + ACCENT2 + ';}',
            '.rr-confetti-piece{position:absolute;top:50%;left:50%;width:8px;height:8px;border-radius:2px;',
            'animation:rr-confetti-fly 1.6s ease-out forwards;}',
            '@keyframes rr-confetti-fly{to{transform:translate(var(--dx),var(--dy)) rotate(540deg);opacity:0;}}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  5) العجلة — ألوان متعاقبة (845B1B / 121212، بدون تكرار لشريحتين
     *     متجاورتين — رياضياً غير ممكن تفادي تكرار واحد بلونين فقط لو
     *     كان عدد اللاعبين فردياً، بيصير بأقل عدد ممكن: تكرار واحد فقط
     *     بموضع الالتحام الدائري).
     * ==================================================================== */
    function buildWheelGradient() {
        var n = _alive.length;
        if (n === 0) return 'conic-gradient(' + C_BLACK + ',' + C_BLACK + ')';
        var slice = 360 / n;
        var colors = [];
        for (var i = 0; i < n; i++) colors.push((i % 2 === 0) ? C_GOLD : C_BLACK);
        // ⚠️ بعدد شرائح فردي، أول شريحة وآخر شريحة (متجاورتان فعلياً عند
        // نقطة الالتحام الدائري) تطلعان بنفس اللون حتماً — خاصية رياضية
        // (تلوين دائرة بعدد عقد فردي بلونين فقط)، مستحيل تفاديها بلونين
        // بس. بدل قبول هذا التكرار، نكسره بلون ثالث (C_BRONZE) لآخر شريحة
        // فقط — أقل تدخّل ممكن (شريحة واحدة، وقت الحاجة الفعلية فقط).
        if (n > 1 && colors[0] === colors[n - 1]) {
            colors[n - 1] = C_BRONZE;
        }
        var stops = [];
        for (var i = 0; i < n; i++) {
            stops.push(colors[i] + ' ' + (i * slice).toFixed(2) + 'deg ' + ((i + 1) * slice).toFixed(2) + 'deg');
        }
        return 'conic-gradient(' + stops.join(',') + ')';
    }

    function renderWheelDividers() {
        var layer = el('rr-wheel-dividers');
        if (!layer) return;
        var n = _alive.length;
        var html = '';
        for (var i = 0; i < n; i++) {
            var angle = (360 / n) * i;
            html += '<div class="rr-divider-line" style="transform:rotate(' + angle + 'deg);"></div>';
        }
        layer.innerHTML = html;
    }

    function renderWheelLabels() {
        var wheel = el('rr-wheel');
        if (!wheel) return;
        var n = _alive.length;
        var labelsHtml = '';
        // ⚠️ إصلاح: كنّا نعتمد على translate(٪) اللي تُحسَب بالنسبة لحجم
        // العنصر نفسه (سطر النص) لا حجم العجلة — ما كان يوصّل الاسم فعلياً
        // لمنتصف الشريحة. الحين نحسب موضع كل اسم بالمثلثات مباشرة (نسبة
        // مئوية حقيقية من قطر العجلة عبر left/top)، ونثبّته بعيداً عن
        // المحور (بالقرب من الحافة الخارجية، بعيداً عن زر "تدوير" بالمنتصف).
        var R = 36; // % من نصف قطر العجلة (0=المركز، 50=الحافة تماماً)
        for (var i = 0; i < n; i++) {
            var midAngle = (360 / n) * i + (360 / n) / 2; // 0deg = الأعلى، بنفس اتجاه conic-gradient
            var rad = midAngle * Math.PI / 180;
            var x = 50 + R * Math.sin(rad);
            var y = 50 - R * Math.cos(rad);
            labelsHtml += '<span class="rr-wheel-label" style="left:' + x.toFixed(2) + '%;top:' + y.toFixed(2) + '%;' +
                'transform:translate(-50%,-50%) rotate(' + midAngle.toFixed(2) + 'deg);">' +
                escapeHtml(playerLabel(_alive[i])) + '</span>';
        }
        var existingLabels = wheel.querySelector('.rr-wheel-labels-layer');
        if (!existingLabels) {
            existingLabels = document.createElement('div');
            existingLabels.className = 'rr-wheel-labels-layer';
            existingLabels.style.cssText = 'position:absolute;inset:0;';
            wheel.appendChild(existingLabels);
        }
        existingLabels.innerHTML = labelsHtml;
    }

    function renderWheel() {
        var wheel = el('rr-wheel');
        if (wheel) {
            wheel.style.background = buildWheelGradient();
            renderWheelLabels();
        }
        // ⚠️ نحدّث محتوى البكرة أيضاً حتى لو مو ظاهرة حالياً — عشان تكون
        // جاهزة فوراً لو الاستريمر بدّل الشكل وسط المباراة (بعد إقصاء أو
        // انضمام لاعب جديد مثلاً).
        if (el('rr-reel-list')) renderReel();
    }

    /* ======================================================================
     *  6) قائمة الأحياء بالأسفل (بطاقات + قلوب)
     * ==================================================================== */
    function renderRoster() {
        var aliveRow = el('rr-alive-row');
        var outRow = el('rr-out-row');
        if (aliveRow) {
            aliveRow.innerHTML = _alive.map(function (p) {
                return '<div class="rr-roster-card">' +
                    (AGP.playerCard ? AGP.playerCard.renderHtml(p, {}) : '<span>' + escapeHtml(playerLabel(p)) + '</span>') +
                    heartsRowHtml(p) + '</div>';
            }).join('') || '<span style="opacity:0.6;font-size:0.85em;">لا أحد</span>';
        }
        if (outRow) {
            outRow.innerHTML = _eliminated.map(function (entry) {
                return '<div class="rr-roster-card rr-out">' +
                    (AGP.playerCard ? AGP.playerCard.renderHtml(entry.player, {}) : '<span>' + escapeHtml(playerLabel(entry.player)) + '</span>') +
                    '</div>';
            }).join('') || '<span style="opacity:0.6;font-size:0.85em;">لا أحد بعد</span>';
        }
        if (AGP.playerCard) {
            if (aliveRow) AGP.playerCard.fitAllNames(aliveRow);
            if (outRow) AGP.playerCard.fitAllNames(outRow);
        }
    }

    /* ======================================================================
     *  7) رسم المرحلة
     * ==================================================================== */
    function ensureScaffolding() {
        if (el('rr-stage')) return;
        var stage = document.createElement('div');
        stage.id = 'rr-stage';
        stage.innerHTML =
            '<div id="rr-wheel-wrap">' +
                '<div id="rr-wheel"></div>' +
                '<div id="rr-wheel-pointer"></div>' +
            '</div>' +
            '<div id="rr-reel-wrap" style="display:none;">' +
                '<div id="rr-reel-pointer-line"></div>' +
                '<div id="rr-reel-list"></div>' +
            '</div>' +
            // ⚠️ [إصلاح خلل حقيقي] زر التدوير/التحريك كان عنصراً داخل
            // #rr-wheel-wrap نفسه — فلمّا نخفي الصندوق كامل وقت التبديل
            // لوضع السكرول، الزر يختفي معه ويصير ما فيه أي طريقة تشغّل
            // البكرة إطلاقاً. صار الحين عنصراً مستقلاً تماماً عن الاثنين،
            // ظاهر ويشتغل بكل الأوضاع دائماً.
            '<button id="rr-wheel-hub" type="button"><img src="../../logo.png" alt=""><span>تدوير</span></button>' +
            '<div id="rr-wheel-actions">' +
                '<button id="rr-shuffle-btn" type="button">🔀 إعادة ترتيب عشوائي</button>' +
                '<button id="rr-autoplay-btn" type="button">▶️ العب التلقائي</button>' +
            '</div>';
        document.body.appendChild(stage);

        var modeToggleBtn = document.createElement('button');
        modeToggleBtn.id = 'rr-display-mode-toggle';
        modeToggleBtn.type = 'button';
        modeToggleBtn.textContent = '🔃 تبديل شكل الاختيار (سكرول)';
        modeToggleBtn.addEventListener('click', handleDisplayModeToggle);
        document.body.appendChild(modeToggleBtn);

        var toggleBtn = document.createElement('button');
        toggleBtn.id = 'rr-settings-toggle';
        toggleBtn.type = 'button';
        toggleBtn.textContent = '⚙️';
        toggleBtn.onclick = function () {
            var gearBtn = el('agp-header-settings-btn');
            if (gearBtn) gearBtn.click();
        };
        document.body.appendChild(toggleBtn);

        var eventToggleBtn = document.createElement('button');
        eventToggleBtn.id = 'rr-eventlog-toggle';
        eventToggleBtn.type = 'button';
        eventToggleBtn.textContent = '📋 أحداث المباراة';
        eventToggleBtn.onclick = function () {
            var panel = el('rr-eventlog-panel');
            if (panel) panel.classList.toggle('rr-open');
        };
        document.body.appendChild(eventToggleBtn);

        var eventPanel = document.createElement('div');
        eventPanel.id = 'rr-eventlog-panel';
        eventPanel.innerHTML = '<h3>📋 أحداث المباراة</h3><div id="rr-eventlog-list"></div>';
        document.body.appendChild(eventPanel);

        var selectOverlay = document.createElement('div');
        selectOverlay.id = 'rr-select-overlay';
        selectOverlay.innerHTML =
            '<div id="rr-select-box">' +
                '<div id="rr-select-title"><b>مرحلة الاختيار</b> — اختر من الشات بكتابة الرقم، أو يدوياً من الأزرار تحت</div>' +
                '<div id="rr-chooser-row">' +
                    '<div id="rr-chooser-slot"></div>' +
                    '<div id="rr-select-actions">' +
                        '<button id="rr-force-eliminate-btn" type="button">إقصاء صاحب الدور</button>' +
                        '<button id="rr-skip-btn" type="button">استئناف اللعبة</button>' +
                    '</div>' +
                '</div>' +
                '<div id="rr-select-timer"></div>' +
                '<div id="rr-candidates-grid"></div>' +
            '</div>';
        document.body.appendChild(selectOverlay);

        var clashOverlay = document.createElement('div');
        clashOverlay.id = 'rr-clash-overlay';
        clashOverlay.innerHTML =
            '<div id="rr-clash-box">' +
                '<div id="rr-clash-header"></div>' +
                '<div id="rr-clash-row">' +
                    '<div class="rr-clash-side"><div class="rr-clash-avatar-wrap rr-shooter" id="rr-clash-shooter-avatar"></div>' +
                        '<div class="rr-clash-name" id="rr-clash-shooter-name"></div></div>' +
                    '<img id="rr-clash-gun" src="' + ICON_GUN + '" alt="">' +
                    '<div class="rr-clash-side"><div class="rr-clash-avatar-wrap rr-target" id="rr-clash-target-avatar"></div>' +
                        '<div class="rr-clash-name" id="rr-clash-target-name"></div></div>' +
                '</div>' +
                '<div id="rr-clash-sentence"></div>' +
            '</div>';
        document.body.appendChild(clashOverlay);

        var winnerOverlay = document.createElement('div');
        winnerOverlay.id = 'rr-winner-overlay';
        document.body.appendChild(winnerOverlay);

        el('rr-wheel-hub').addEventListener('click', handleHubClick);
        el('rr-shuffle-btn').addEventListener('click', handleShuffleClick);
        el('rr-autoplay-btn').addEventListener('click', handleAutoPlayToggleClick);
        el('rr-skip-btn').addEventListener('click', handleSkipClick);
        el('rr-force-eliminate-btn').addEventListener('click', handleForceEliminateClick);
    }

    function renderStage() {
        injectStageStyles();
        ensureScaffolding();
        renderWheel();
        renderRoster();
        var eventList = el('rr-eventlog-list');
        if (eventList) eventList.innerHTML = '';
    }

    /* ======================================================================
     *  8) دوران العجلة
     * ==================================================================== */
    var _wheelRotation = 0;
    var WHEEL_SPIN_DURATION_MS = 3800; // ⚠️ سرعة دوران ثابتة مضبوطة يدوياً (بدون خيار مستخدم — ألغيناه لعدم فائدته)
    function wheelSpinDurationMs() {
        return WHEEL_SPIN_DURATION_MS;
    }

    // ⚠️ نفس منطق اختيار "صاحب الدور" بالضبط لشكلي العرض (العجلة والبكرة) —
    // استبعاد آخر شخص وقفت عنده لتقليل احتمال التكرار المباشر.
    function pickNextChooserIndex() {
        var pool = _alive;
        if (_lastChooserId && _alive.length > 1) {
            var filtered = _alive.filter(function (p) { return p.id !== _lastChooserId; });
            if (filtered.length) pool = filtered;
        }
        var chosen = pool[Math.floor(Math.random() * pool.length)];
        var winnerIdx = _alive.indexOf(chosen);
        _lastChooserId = chosen.id;
        return winnerIdx;
    }

    function handleHubClick() {
        if (_wheelDisplayMode === 'reel') handleReelSpinClick();
        else handleSpinClick();
    }

    function handleSpinClick() {
        if (_wheelSpinning || !_matchActive || _alive.length < 2) return;
        _wheelSpinning = true;
        el('rr-wheel-hub').disabled = true;
        playSpinTick();

        var winnerIdx = pickNextChooserIndex();

        var n = _alive.length;
        var slice = 360 / n;
        var targetMid = winnerIdx * slice + slice / 2;
        // ⚠️ العجلة تدور مع عقارب الساعة، المؤشّر ثابت بالأعلى (0deg) —
        // ندور بحيث تنتهي الشريحة المطلوبة تحت المؤشّر تماماً، + لفّات
        // كاملة إضافية للتشويق.
        //
        // ⚠️ [إصلاح خلل حقيقي وأخطر] الصيغة القديمة كانت تحسب دوران هذي
        // الدورة بافتراض أن العجلة تبدأ من "صفر متبقٍّ" (زي أول دورة
        // بالضبط)، بينما فعلياً كل دورة تنتهي عند "باقي" (residual) مختلف
        // = زاوية منتصف شريحة الفائز السابق (منطقي تماماً — هو محسوب
        // عشان يوصل بالضبط تحت المؤشّر). فكل دورة ثانية وما بعدها كانت
        // تُضيف الإزاحة المطلوبة للفائز الجديد **فوق** باقٍ خاطئ (باقي
        // الدورة السابقة، لا صفر)، فتنتهي العجلة فعلياً على شريحة مختلفة
        // تماماً عن الفهرس (index) اللي فعلياً فتح تبويب الاختيار — بالضبط
        // الخلل اللي رصدته (تتوقف بصرياً عند شخص، ويطلع بالتبويب شخص
        // ثاني). الحل الصحيح رياضياً: نحسب "الباقي الحالي" الفعلي
        // (_wheelRotation % 360) ونشتق منه فقط مقدار الدوران الإضافي
        // المطلوب فعلياً للوصول للباقي الجديد المطلوب، بدل افتراض بداية
        // من صفر كل مرة.
        var requiredResidual = ((360 - targetMid) % 360 + 360) % 360;
        var currentResidual = ((_wheelRotation % 360) + 360) % 360;
        var deltaForward = ((requiredResidual - currentResidual) % 360 + 360) % 360;
        var spins = 5 + Math.floor(Math.random() * 3);
        var finalRotation = _wheelRotation + spins * 360 + deltaForward;
        _wheelRotation = finalRotation;

        var durationMs = wheelSpinDurationMs();
        var wheel = el('rr-wheel');
        wheel.style.transitionDuration = durationMs + 'ms';
        wheel.style.transform = 'rotate(' + finalRotation + 'deg)';

        window.setTimeout(function () {
            _wheelSpinning = false;
            el('rr-wheel-hub').disabled = false;
            openSelectionScreen(_alive[winnerIdx]);
        }, durationMs);
    }

    var REEL_ITEM_H = 150;
    var REEL_REPEATS = 6; // عدد تكرارات قائمة اللاعبين داخل شريط البكرة (مسافة سكرول كافية للتشويق)
    function renderReel() {
        var list = el('rr-reel-list');
        if (!list || !_alive.length) return;
        var html = '';
        for (var r = 0; r < REEL_REPEATS; r++) {
            _alive.forEach(function (p) {
                html += '<div class="rr-reel-item">' +
                    playerAvatarImgHtml(p, 'rr-reel-av') +
                    '<span class="rr-reel-name">' + escapeHtml(playerLabel(p)) + '</span>' +
                    '<span class="rr-reel-num">' + playerNumber(p) + '</span>' +
                '</div>';
            });
        }
        list.innerHTML = html;
        list.style.transitionDuration = '0ms';
        list.style.transform = 'translateY(0px)';
    }

    function handleReelSpinClick() {
        if (_wheelSpinning || !_matchActive || _alive.length < 2) return;
        _wheelSpinning = true;
        el('rr-wheel-hub').disabled = true;
        playSpinTick();

        var winnerIdx = pickNextChooserIndex();
        var n = _alive.length;

        // ⚠️ نرجّع الشريط لبدايته فوراً (بدون أنيميشن) قبل كل دورة —
        // نفس روح إصلاح خلل العجلة: بداية معروفة وثابتة كل مرة، يلغي أي
        // احتمال لخطأ تراكمي بالموضع.
        var list = el('rr-reel-list');
        list.style.transitionDuration = '0ms';
        list.style.transform = 'translateY(0px)';
        // إجبار المتصفح يطبّق التصفير قبل بدء الأنيميشن الجديدة
        void list.offsetHeight;

        // نهبط عدة تكرارات كاملة (تشويق) + موضع الفائز داخل التكرار الأخير،
        // ونركّزه تحت الصف الأوسط البارز (فيوبورت ٣ صفوف، الأوسط = مركز
        // الفيوبورت تماماً = REEL_ITEM_H*1.5).
        var targetRepeat = REEL_REPEATS - 1;
        var targetAbsoluteIndex = targetRepeat * n + winnerIdx;
        var viewportCenter = REEL_ITEM_H * 1.5;
        var translateY = -(targetAbsoluteIndex * REEL_ITEM_H) + viewportCenter - (REEL_ITEM_H / 2);

        var durationMs = wheelSpinDurationMs();
        list.style.transitionDuration = durationMs + 'ms';
        list.style.transform = 'translateY(' + translateY + 'px)';

        window.setTimeout(function () {
            _wheelSpinning = false;
            el('rr-wheel-hub').disabled = false;
            // ⚠️ نبرز الصف الفائز (صورة/اسم/رقم أوضح وأكبر) قبل ما تفتح شاشة الاختيار
            var items = list.querySelectorAll('.rr-reel-item');
            if (items[targetAbsoluteIndex]) items[targetAbsoluteIndex].classList.add('rr-reel-highlight');
            openSelectionScreen(_alive[winnerIdx]);
        }, durationMs);
    }

    function handleDisplayModeToggle() {
        if (_wheelSpinning || _pendingTurn) return; // ⚠️ ما نبدّل الشكل أثناء دوران/اختيار جارٍ
        _wheelDisplayMode = (_wheelDisplayMode === 'wheel') ? 'reel' : 'wheel';
        var wheelWrap = el('rr-wheel-wrap');
        var reelWrap = el('rr-reel-wrap');
        var toggleBtn = el('rr-display-mode-toggle');
        if (_wheelDisplayMode === 'reel') {
            wheelWrap.style.display = 'none';
            reelWrap.style.display = 'block';
            renderReel();
            var hubSpan = document.querySelector('#rr-wheel-hub span');
            if (hubSpan) hubSpan.textContent = 'تحريك';
            if (toggleBtn) toggleBtn.textContent = '🔃 تبديل شكل الاختيار (عجلة)';
        } else {
            wheelWrap.style.display = '';
            reelWrap.style.display = 'none';
            var hubSpan2 = document.querySelector('#rr-wheel-hub span');
            if (hubSpan2) hubSpan2.textContent = 'تدوير';
            if (toggleBtn) toggleBtn.textContent = '🔃 تبديل شكل الاختيار (سكرول)';
        }
    }

    function handleShuffleClick() {
        if (_wheelSpinning || _pendingTurn) return;
        _alive = shuffleArray(_alive);
        renderWheel();
        renderRoster();
        playSpinTick();
    }

    /* ======================================================================
     *  9) العب التلقائي — إيقاع بطيء نوعاً ما
     * ==================================================================== */
    function handleAutoPlayToggleClick() {
        _autoPlayActive = !_autoPlayActive;
        var btn = el('rr-autoplay-btn');
        if (btn) {
            btn.classList.toggle('rr-active', _autoPlayActive);
            btn.textContent = _autoPlayActive ? '⏸️ إيقاف التلقائي' : '▶️ العب التلقائي';
        }
        if (_autoPlayActive) scheduleAutoStep();
        else if (_autoPlayTimer) { window.clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
    }
    function scheduleAutoStep() {
        if (_autoPlayTimer) window.clearTimeout(_autoPlayTimer);
        _autoPlayTimer = window.setTimeout(function () {
            if (!_autoPlayActive || !_matchActive) return;
            // ⚠️ [إصلاح خلل حقيقي] "العب التلقائي" دوره حصراً تدوير العجلة —
            // ما يلمس مرحلة الاختيار إطلاقاً. اختيار الهدف حصراً لصاحب
            // الدور نفسه عبر الشات (أو الأزرار اليدوية) — بدون أي اختيار
            // عشوائي بديل عنه. لو فيه دور اختيار مفتوح حالياً (_pendingTurn)،
            // نكتفي بإعادة جدولة الفحص لاحقاً بدون أي تدخّل، لين يُغلَق
            // الدور بشكل طبيعي (شات/زر يدوي/انتهاء وقت) فيرجع الدوران تلقائياً.
            if (!_wheelSpinning && !_pendingTurn && _alive.length > 1) {
                handleSpinClick();
            }
            scheduleAutoStep();
        }, 4800);
    }
    function stopAutoPlay() {
        _autoPlayActive = false;
        if (_autoPlayTimer) { window.clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
        var btn = el('rr-autoplay-btn');
        if (btn) { btn.classList.remove('rr-active'); btn.textContent = '▶️ العب التلقائي'; }
    }

    /* ======================================================================
     *  10) شاشة "مرحلة الاختيار"
     * ==================================================================== */
    function playerAvatarImgHtml(p, cls) {
        var name = playerLabel(p);
        var initials = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        return p.avatarUrl
            ? '<img class="' + cls + '" src="' + escapeHtml(p.avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';">'
            : '<div class="' + cls + '" style="display:flex;align-items:center;justify-content:center;background:var(--rr-gold);color:#241a0c;font-weight:900;">' + escapeHtml(initials) + '</div>';
    }

    // ⚠️ رقم كل لاعب ثابت طول المباراة (يُحسب حسب ترتيب دخوله للوبي —
    // انظر assignPlayerNumber) — يُقرأ هنا فقط، ما يُعاد حسابه أبداً حسب
    // ترتيب المرشّحين بكل جولة.
    function playerNumber(p) { return _playerNumbers[p.id] || '?'; }

    function chooserCardHtml(chooser) {
        return '<div class="rr-chooser-card">' +
            '<div class="rr-chooser-ring">' + playerAvatarImgHtml(chooser, 'rr-fallback') + '</div>' +
            '<div>' +
                '<div class="rr-chooser-nmrow"><span class="rr-chooser-num">' + playerNumber(chooser) + '</span>' +
                '<span class="rr-chooser-nm">' + escapeHtml(playerLabel(chooser)) + '</span></div>' +
                '<div class="rr-chooser-hearts">' + heartsRowHtml(chooser) + '</div>' +
            '</div>' +
        '</div>';
    }

    function candidateCardHtml(p, index) {
        return '<div class="rr-lc-card" data-index="' + index + '">' +
            '<div class="rr-lc-row">' +
                playerAvatarImgHtml(p, 'rr-lc-avatar') +
                '<div class="rr-lc-plate">' +
                    '<span class="rr-lc-name">' + escapeHtml(playerLabel(p)) + '</span>' +
                    '<span class="rr-lc-num">' + playerNumber(p) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="rr-lc-hearts">' + heartsRowHtml(p) + '</div>' +
        '</div>';
    }

    function openSelectionScreen(chooser) {
        var candidates = _alive.filter(function (p) { return p.id !== chooser.id; });
        if (!candidates.length) return; // ما فيه هدف ممكن (نظرياً ما يصير مع alive.length>=2)
        _pendingTurn = { chooser: chooser, candidates: candidates };
        _selectedCandidateIdx = null;

        el('rr-chooser-slot').innerHTML = chooserCardHtml(chooser);

        var grid = el('rr-candidates-grid');
        grid.innerHTML = candidates.map(function (p, i) { return candidateCardHtml(p, i); }).join('');
        grid.querySelectorAll('.rr-lc-card[data-index]').forEach(function (card) {
            card.onclick = function () {
                selectCandidateManually(parseInt(card.getAttribute('data-index'), 10));
            };
        });

        var forceBtn = el('rr-force-eliminate-btn');
        forceBtn.textContent = 'إقصاء صاحب الدور';
        forceBtn.classList.add('rr-enabled'); // ⚠️ الزر شغّال دائماً الآن (مو معطّل لحين اختيار هدف)

        el('rr-select-overlay').style.display = 'flex';
        wireCommentListener();
        startSelectionTimer();
    }

    function selectCandidateManually(idx) {
        if (!_pendingTurn) return;
        _selectedCandidateIdx = idx;
        el('rr-candidates-grid').querySelectorAll('.rr-lc-card[data-index]').forEach(function (card) {
            card.classList.toggle('rr-candidate-selected', parseInt(card.getAttribute('data-index'), 10) === idx);
        });
        // ⚠️ نفس الزر الأحمر — تتبدّل وظيفته/نصّه فقط حسب وجود اختيار يدوي،
        // بدون أي زر إضافي (طلب صريح).
        var target = _pendingTurn.candidates[idx];
        el('rr-force-eliminate-btn').textContent = 'إقصاء ' + playerLabel(target);
    }

    var _selectTickUnsub = null;
    var _selectEndUnsub = null;
    function startSelectionTimer() {
        var seconds = currentSelectionSeconds();
        AGP.timerManager.start(TIMER_NAME, seconds);
        updateSelectionTimerDisplay(seconds);
        _selectTickUnsub = AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            updateSelectionTimerDisplay(payload.remainingSeconds);
        });
        _selectEndUnsub = AGP.events.on('timer:ended', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            handleSelectionTimeout();
        });
    }
    function updateSelectionTimerDisplay(seconds) {
        var t = el('rr-select-timer');
        if (t) t.textContent = '⏱️ ' + seconds + ' ث';
    }
    function stopSelectionTimer() {
        AGP.timerManager.stop(TIMER_NAME);
        if (typeof _selectTickUnsub === 'function') _selectTickUnsub();
        if (typeof _selectEndUnsub === 'function') _selectEndUnsub();
        _selectTickUnsub = null; _selectEndUnsub = null;
    }

    function wireCommentListener() {
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_pendingTurn || !payload || typeof payload.text !== 'string') return;
            var chooser = _pendingTurn.chooser;
            if (!chooser || (payload.id !== chooser.id && payload.name !== chooser.name)) return;
            var n = parseInt(payload.text.trim(), 10);
            if (isNaN(n)) return;
            // ⚠️ [إصلاح خلل حقيقي] الرقم المكتوب بالشات لازم يُطابَق برقم
            // اللاعب الثابت المعروض فعلياً على بطاقته (playerNumber) — مو
            // بترتيبه داخل مصفوفة المرشّحين المؤقّتة (اللي تتغيّر ترتيبها
            // كل جولة). الفرق بين الاثنين هو بالضبط سبب "الرقم ما يُقبل".
            var target = _pendingTurn.candidates.filter(function (p) { return playerNumber(p) === n; })[0];
            if (!target) return;
            resolveSelection(target);
        });
    }

    function closeSelectionScreen() {
        el('rr-select-overlay').style.display = 'none';
        stopSelectionTimer();
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = null;
        _pendingTurn = null;
        _selectedCandidateIdx = null;
    }

    function handleSkipClick() {
        if (!_pendingTurn) return;
        closeSelectionScreen();
        if (_autoPlayActive) scheduleAutoStep();
    }

    /**
     * ⚠️ عند انتهاء وقت مرحلة الاختيار بدون أي اختيار (لا شات ولا نقر يدوي)
     * — سلوكها يُحدَّد من إعداد selectionTimeoutBehavior:
     *  - 'skip' (يغلق الاختيار فقط): نفس أثر زر "اكمال بدون اقصاء".
     *  - 'eliminate_chooser' (الافتراضي): صاحب الاختيار نفسه يُقصى — تجاوز
     *    يدوي (بدون محرك الاحتمال)، بما إنه ما استغل دوره بالوقت المتاح.
     */
    function handleSelectionTimeout() {
        if (!_pendingTurn) return;
        var behavior = liveSettings().selectionTimeoutBehavior || 'eliminate_chooser';
        if (behavior === 'skip') {
            handleSkipClick();
            return;
        }
        var chooser = _pendingTurn.chooser;
        closeSelectionScreen();
        logEvent('⏱️', playerLabel(chooser) + ' أُقصي لانتهاء وقت الاختيار');
        applyElimination(chooser, chooser, true);
    }

    function handleForceEliminateClick() {
        if (!_pendingTurn) return;
        var chooser = _pendingTurn.chooser;
        var streamer = streamerVirtualPlayer();
        // ⚠️ نفس الزر الأحمر — لو ما فيه اختيار يدوي، يقصي صاحب الدور نفسه.
        // لو فيه لاعب مُختار يدوياً، يقصي ذاك اللاعب المحدَّد بدلاً منه.
        // بالحالتين: "المُقصي" اللي يظهر بشاشة النتيجة هو الاستريمر نفسه،
        // مو صاحب الدور ولا أي لاعب ثاني.
        var target = (_selectedCandidateIdx !== null) ? _pendingTurn.candidates[_selectedCandidateIdx] : chooser;
        closeSelectionScreen();
        // ⚠️ تجاوز يدوي صريح — إقصاء مباشر بدون المرور بمحرك الاحتمال، لكن
        // بنفس شاشة "عملية اقصاء ناجحة" المعروضة بالمسار العادي (طلب صريح
        // — ما كانت تظهر بالتجاوز اليدوي قبل كذا، وهذا خلل أصلحته هنا).
        logEvent('❌', 'صاحب البث أقصى ' + playerLabel(target) + ' يدوياً');
        showEliminationSuccessScreen(streamer, target, function () {
            applyElimination(streamer, target, true);
        });
    }

    /* ======================================================================
     *  11) محرك الاحتمال الحقيقي + شاشتا "الاشتباك" / "عملية اقصاء ناجحة"
     * ==================================================================== */
    // ⚠️ توضيح آلية اللعبة (نهائي، يلغي أي فهم سابق للاحتمال):
    //  - "حجم ساقية الطلقات؟" = كم غرفة متاحة فعلياً من أصل 6 (الباقي
    //    يُعتبر مغلقاً كلياً، خارج اللعب) — ونفس الرقم هذا يمثّل أيضاً عدد
    //    أرواح كل لاعب (_appliedLivesCount). كل لاعب له "سلاحه" الشخصي
    //    بنفس هذا العدد من الغرف المتاحة.
    //  - "عدد الطلقات المعباه" = كم طلقة موزّعة عشوائياً بين الغرف
    //    المتاحة فقط (مو من أصل 6 دائماً) — يعني الاحتمال الحقيقي =
    //    الطلقات ÷ الغرف المتاحة (_appliedLivesCount)، وتتبدّل مواقع
    //    الطلقات عشوائياً من جديد كل دورة استهداف (احتمال مستقل، بدون
    //    ذاكرة بين الدورات — نفس ما كان مطبَّقاً، بس بمقام صحيح الآن).
    //  - ⚠️ استثناء حاسم: لو الهدف وصل لآخر قلب أخضر (روح واحدة متبقية)،
    //    أي استهداف بعدها = إصابة مضمونة ١٠٠٪ (بدون رمي احتمال إطلاقاً) —
    //    "ضروري آخر طلقة يطلقها أي لاعب على لاعب ماعنده إلا آخر روح
    //    يُقصى مباشرة وتُحسب الطلقة صحيحة".
    function remainingHearts(p) {
        var hits = (p && _heartHits[p.id]) || 0;
        return Math.max(0, _appliedLivesCount - hits);
    }
    function rollEngineHit(target) {
        if (remainingHearts(target) <= 1) return true; // آخر روح = إصابة مضمونة، بدون احتمال
        var bullets = currentBulletsPerRound();
        var chambers = _appliedLivesCount > 0 ? _appliedLivesCount : 1;
        if (bullets > chambers) bullets = chambers; // احترازي — ما يصير عدد طلقات أكثر من الغرف المتاحة أصلاً
        return Math.random() < (bullets / chambers);
    }

    function resolveSelection(target) {
        if (!_pendingTurn) return;
        var chooser = _pendingTurn.chooser;
        closeSelectionScreen();
        var isHit = rollEngineHit(target);
        showClashScreen(chooser, target, isHit);
    }

    function showClashScreen(chooser, target, isHit) {
        var overlay = el('rr-clash-overlay');
        var box = el('rr-clash-box');
        var header = el('rr-clash-header');
        box.className = isHit ? 'rr-clash-hit' : '';
        header.className = '';
        header.textContent = 'مرحلة الاشتباك';
        var sentenceEl = el('rr-clash-sentence');
        if (sentenceEl) sentenceEl.innerHTML = '';

        el('rr-clash-shooter-avatar').innerHTML = playerAvatarImgHtml(chooser, 'rr-avatar-img');
        el('rr-clash-shooter-name').textContent = playerLabel(chooser);
        var targetAvatarWrap = el('rr-clash-target-avatar');
        targetAvatarWrap.className = 'rr-clash-avatar-wrap rr-target';
        targetAvatarWrap.innerHTML = playerAvatarImgHtml(target, 'rr-avatar-img');
        el('rr-clash-target-name').textContent = playerLabel(target);

        overlay.style.display = 'flex';

        window.setTimeout(function () {
            targetAvatarWrap.classList.add(isHit ? 'rr-flash-red' : 'rr-flash-white');
            if (isHit) {
                playNoiseBang();
                window.setTimeout(function () { targetAvatarWrap.classList.add('rr-target-vanish'); }, 80);
                logEvent('❌', playerLabel(chooser) + ' أقصى ' + playerLabel(target) + ' من العجلة');
            } else {
                playMissTone();
                header.className = 'rr-miss-title';
                header.textContent = 'لم ينجح الاستهداف';
                if (!_heartHits[target.id]) _heartHits[target.id] = 0;
                _heartHits[target.id]++;
                logEvent('😮\u200D💨', playerLabel(chooser) + ' استهدف ' + playerLabel(target) + ' — لم ينجح');
            }
        }, 250);

        window.setTimeout(function () {
            overlay.style.display = 'none';
            targetAvatarWrap.classList.remove('rr-flash-white', 'rr-flash-red', 'rr-target-vanish');
            if (isHit) {
                showEliminationSuccessScreen(chooser, target, function () {
                    applyElimination(chooser, target, false);
                });
            } else {
                renderRoster();
                if (_autoPlayActive) scheduleAutoStep();
            }
        }, isHit ? 2000 : 2000);
    }

    function showEliminationSuccessScreen(chooser, target, onDone) {
        var overlay = el('rr-clash-overlay');
        var box = el('rr-clash-box');
        var header = el('rr-clash-header');
        box.className = 'rr-clash-hit';
        header.className = 'rr-success-title';
        header.textContent = 'عملية اقصاء ناجحة';

        el('rr-clash-shooter-avatar').innerHTML = playerAvatarImgHtml(chooser, 'rr-avatar-img');
        el('rr-clash-shooter-name').textContent = playerLabel(chooser);
        var targetAvatarWrap = el('rr-clash-target-avatar');
        targetAvatarWrap.className = 'rr-clash-avatar-wrap rr-target rr-target-vanish';
        targetAvatarWrap.innerHTML = playerAvatarImgHtml(target, 'rr-avatar-img');
        el('rr-clash-target-name').textContent = playerLabel(target);
        var sentenceEl = el('rr-clash-sentence');
        if (sentenceEl) {
            sentenceEl.innerHTML = 'اللاعب <b>' + escapeHtml(playerLabel(chooser)) + '</b> قام باقصاء <b>' +
                escapeHtml(playerLabel(target)) + '</b> من العجلة';
        }

        overlay.style.display = 'flex';
        window.setTimeout(function () {
            overlay.style.display = 'none';
            targetAvatarWrap.classList.remove('rr-target-vanish');
            if (typeof onDone === 'function') onDone();
        }, 3000);
    }

    function applyElimination(chooser, target, isManualOverride) {
        var idx = _alive.findIndex(function (p) { return p.id === target.id; });
        if (idx !== -1) _alive.splice(idx, 1);
        _eliminated.push({ player: target });
        // ⚠️ "الأكثر إقصاءً" (بطاقة الفائز) — يُحسب بس لما يكون فيه إقصاء
        // فعلي بين لاعبين مختلفين (مو حالة انتهاء وقت الاختيار اللي
        // تُقصي صاحب الدور نفسه — تلك عقوبة، مو "إقصاء" ينسب لأحد).
        if (chooser && chooser.id !== target.id) {
            _eliminationsCaused[chooser.id] = (_eliminationsCaused[chooser.id] || 0) + 1;
        }

        if (_alive.length <= 1) {
            renderWheel(); renderRoster();
            endMatch(_alive[0] || null);
            return;
        }
        renderWheel();
        renderRoster();
        if (_autoPlayActive) scheduleAutoStep();
    }

    /* ======================================================================
     *  12) انضمام/حذف لاعب أثناء مباراة نشطة
     * ==================================================================== */
    function handlePlayerJoinedMidMatch(newPlayer) {
        if (!newPlayer || !newPlayer.id || !_matchActive) return;
        var alreadyAlive = _alive.some(function (p) { return p.id === newPlayer.id; });
        var alreadyOut = _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (alreadyAlive || alreadyOut) return;
        _alive.push(newPlayer);
        _heartHits[newPlayer.id] = 0;
        assignPlayerNumber(newPlayer);
        logEvent('➕', playerLabel(newPlayer) + ' انضم للعبة');
        renderWheel();
        renderRoster();
    }
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;
        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) _alive.splice(aliveIdx, 1);
        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);
        if (aliveIdx === -1 && elimIdx === -1) return;
        delete _heartHits[removedPlayer.id];

        if (_pendingTurn && ((_pendingTurn.chooser && _pendingTurn.chooser.id === removedPlayer.id))) {
            closeSelectionScreen();
        } else if (_pendingTurn) {
            _pendingTurn.candidates = _pendingTurn.candidates.filter(function (p) { return p.id !== removedPlayer.id; });
            if (!_pendingTurn.candidates.length) closeSelectionScreen();
        }

        renderWheel();
        renderRoster();
        if (_matchActive && _alive.length <= 1) endMatch(_alive[0] || null);
    }

    /* ======================================================================
     *  13) نهاية المباراة + النقاط + بطاقة الفائز
     * ==================================================================== */
    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }
    function pointsHtmlForInline(pointsResult, player) {
        if (!pointsResult) return '<span class="rr-points-earned">تعذّر جلب النقاط الآن</span>';
        var awarded = findAwardedFor(pointsResult, player);
        if (awarded) return '<span class="rr-points-earned">+ ' + awarded.added + ' نقطة</span>';
        return '<span class="rr-points-earned">اربط حسابك عشان تظهر نقاطك</span>';
    }

    var CONFETTI_COLORS = [C_GOLD, '#e8c56b', '#4ade80', '#fff'];
    function spawnConfetti(container, count) {
        if (!container) return;
        count = count || 26;
        for (var i = 0; i < count; i++) {
            var piece = document.createElement('span');
            piece.className = 'rr-confetti-piece';
            var angle = Math.random() * Math.PI * 2;
            var dist = 70 + Math.random() * 90;
            piece.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
            piece.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
            piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            piece.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
            container.appendChild(piece);
            (function (p) { window.setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1700); })(piece);
        }
    }

    function ringAvatarHtml(p) {
        if (!p) return '<span class="rr-fallback">؟</span>';
        var name = playerLabel(p);
        var initials = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        return p.avatarUrl
            ? '<img src="' + escapeHtml(p.avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<span class=&quot;rr-fallback&quot;>' + escapeHtml(initials) + '</span>\';">'
            : '<span class="rr-fallback">' + escapeHtml(initials) + '</span>';
    }

    function findTopEliminator(excludeId) {
        var allPlayers = AGP.gameManager.getPlayers();
        var best = null, bestCount = 0;
        allPlayers.forEach(function (p) {
            var c = _eliminationsCaused[p.id] || 0;
            if (c > bestCount && p.id !== excludeId) { best = p; bestCount = c; }
        });
        return best ? { player: best, count: bestCount } : null;
    }

    function renderWinnerScreen(winner, pointsResult) {
        var overlay = el('rr-winner-overlay');
        if (!overlay) return;
        var topElim = winner ? findTopEliminator(winner.id) : null;

        var winnerCardHtml = winner ? (
            '<div class="rr-trophy-card">' +
                '<div class="rr-trophy-icon">🏆</div>' +
                '<div class="rr-trophy-label">الفائز</div>' +
                '<div class="rr-ring-wrap rr-ring-gold">' +
                    '<div class="rr-ring-inner">' + ringAvatarHtml(winner) + '</div>' +
                    '<span class="rr-ring-badge rr-badge-winner">👑</span>' +
                '</div>' +
                '<div class="rr-trophy-name">' + escapeHtml(playerLabel(winner)) + '</div>' +
                '<div class="rr-trophy-points">' + pointsHtmlForInline(pointsResult, winner) + '</div>' +
            '</div>'
        ) : '<div style="color:#f2e6cf;">ما بقي أحد بالمباراة.</div>';

        var elimCardHtml = topElim ? (
            '<div class="rr-trophy-card">' +
                '<div class="rr-trophy-icon">⚔️</div>' +
                '<div class="rr-trophy-label">الأكثر إقصاءً</div>' +
                '<div class="rr-ring-wrap rr-ring-pink">' +
                    '<div class="rr-ring-inner">' + ringAvatarHtml(topElim.player) + '</div>' +
                    '<span class="rr-ring-badge rr-badge-most">🎯</span>' +
                '</div>' +
                '<div class="rr-trophy-name">' + escapeHtml(playerLabel(topElim.player)) + '</div>' +
                '<div class="rr-trophy-count">أقصى ' + topElim.count + (topElim.count === 1 ? ' لاعب' : ' لاعبين') + '</div>' +
            '</div>'
        ) : '';

        overlay.innerHTML = winnerCardHtml + elimCardHtml +
            '<div class="rr-winner-actions">' +
                '<button type="button" id="rr-replay-same-btn">🔁 إعادة نفس اللاعبين</button>' +
                '<button type="button" id="rr-newmatch-btn">✨ مباراة جديدة</button>' +
            '</div>';

        overlay.style.display = 'flex';
        if (winner) { playWinFanfare(); spawnConfetti(overlay, 34); }
        el('rr-newmatch-btn').onclick = function () { window.location.reload(); };
        el('rr-replay-same-btn').onclick = function () {
            var survivorsRoster = AGP.gameManager.getPlayers().slice();
            overlay.style.display = 'none';
            resetMatchState();
            _matchActive = true;
            _alive = survivorsRoster;
            survivorsRoster.forEach(function (p) { _heartHits[p.id] = 0; assignPlayerNumber(p); });
            _appliedLivesCount = parseInt(liveSettings().livesCount, 10) || 4;
            _startedAt = Date.now();
            renderStage();
        };
    }

    function endMatch(winner) {
        _matchActive = false;
        stopAutoPlay();
        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var allPlayers = AGP.gameManager.getPlayers();
            var participants = allPlayers.map(function (p) {
                return { tiktokUsername: tiktokUsernameFor(p), won: Boolean(winner) && p.id === winner.id };
            }).filter(function (p) { return p.tiktokUsername; });
            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () { return null; });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        pointsPromise.then(function (pointsResult) { renderWinnerScreen(winner, pointsResult); });
    }

    /* ======================================================================
     *  14) الإعدادات + اللوبي — تحسينات فوق الشاشات المشتركة
     * ==================================================================== */
    function buildSettingsFields() {
        return [
            { key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى لعدد اللاعبين بالمباراة', min: 1, default: 30 },
            {
                key: 'followersOnly', type: 'pill-choice', label: 'من المسموح له بالدخول؟',
                options: [{ label: '👥 الجميع', value: false }, { label: '❤️ المتابعين فقط', value: true }], default: false
            },
            { key: 'livesCount', type: 'pill-group', label: 'حجم ساقية الطلقات؟', options: LIVES_OPTIONS, default: 4 },
            { key: 'bulletsPerRound', type: 'pill-group', label: 'عدد الطلقات المعباه داخل الساقية ؟', options: BULLETS_OPTIONS, default: 1 },
            { key: 'selectionTimerSeconds', type: 'pill-group', label: 'مدة مرحلة الاختيار ؟', options: TIMER_OPTIONS, default: 30 },
            {
                key: 'selectionTimeoutBehavior', type: 'pill-choice', label: 'عند انتهاء وقت الاختيار؟',
                options: [
                    { label: 'يقصى صاحب الدور', value: 'eliminate_chooser' },
                    { label: 'يغلق الاختيار فقط', value: 'skip' }
                ], default: 'eliminate_chooser'
            }
        ];
    }

    // ⚠️ نفس نمط بقية ألعاب المنصة: يستخدم AGP.lobby.close() +
    // keywordManager.deactivate() صراحة (checkKeyword() الحقيقية لا تتحقق
    // من AGP.lobby وحدها). عرض "الحالي/الحد الأقصى" باللوبي يظهر تلقائياً
    // من الملف المشترك بمجرد وجود إعداد باسم maxPlayers (playerCountBadgeHtml).
    function enforceMaxPlayers() {
        var settings = AGP.gameShell.getSettings();
        var max = settings.maxPlayers;
        if (!max) return;
        if (AGP.gameManager.getPlayersCount() >= max) {
            AGP.lobby.close();
            if (AGP.keywordManager && typeof AGP.keywordManager.deactivate === 'function') {
                AGP.keywordManager.deactivate();
            }
        }
    }

    function handleStartRound(settingsValues) {
        resetMatchState();
        _settings = settingsValues;
        _alive = AGP.gameManager.getPlayers().slice();
        _alive.forEach(function (p) { _heartHits[p.id] = 0; assignPlayerNumber(p); });
        _appliedLivesCount = parseInt(settingsValues.livesCount, 10) || 4;
        _startedAt = Date.now();
        _matchActive = true;
        renderStage();
    }

    /* ⚠️ زر "حفظ جميع التغييرات" — يبوّب livesCount خصيصاً (القيمة الحية
     * بشاشة الإعدادات لا تُطبَّق فعلياً على حساب القلوب إلا هنا)، مع
     * تحذير وتنفيذ إقصاء فوري لأي لاعب يهبط سقفه الجديد لصفر أو أقل. */
    function handleSaveChangesClick() {
        var newCap = parseInt(liveSettings().livesCount, 10) || _appliedLivesCount;
        if (newCap === _appliedLivesCount) return;
        var toEliminate = [];
        _alive.forEach(function (p) {
            var hits = _heartHits[p.id] || 0;
            if (newCap - hits <= 0) toEliminate.push(p);
        });
        if (toEliminate.length) {
            var names = toEliminate.map(playerLabel).join('، ');
            var confirmed = window.confirm('تخفيض سقف الأرواح لـ' + newCap + ' راح يقصي فوراً: ' + names + '. متأكد؟');
            if (!confirmed) return;
            toEliminate.forEach(function (p) {
                var idx = _alive.findIndex(function (a) { return a.id === p.id; });
                if (idx !== -1) _alive.splice(idx, 1);
                _eliminated.push({ player: p });
            });
        }
        _appliedLivesCount = newCap;
        renderWheel();
        renderRoster();
        if (_matchActive && _alive.length <= 1) endMatch(_alive[0] || null);
    }

    function enhanceReopenedSettings() {
        var box = el('agp-shell-box');
        if (!box || !document.getElementById('agp-settings-player-list')) return;
        box.classList.add('rr-inmatch-drawer');

        var addBtn = document.getElementById('agp-reopen-registration-btn');
        var playerRow = box.querySelector('.agp-settings-player-row');

        // ⚠️ "إضافة لاعب جديد" ينتقل لصف بارز أعلى الدرج (مو زر بالفوتر).
        if (addBtn && !box.querySelector('.rr-add-player-row')) {
            var addRow = document.createElement('div');
            addRow.className = 'rr-add-player-row';
            var h2 = box.querySelector('h2');
            if (h2) h2.insertAdjacentElement('afterend', addRow);
            addBtn.textContent = '➕ إضافة لاعب جديد';
            addRow.appendChild(addBtn);
        }

        // ⚠️ قائمة "الاعبين المشاركين" تصير قابلة للطي/الفتح (accordion).
        if (playerRow && !playerRow.closest('.rr-accordion')) {
            var accordion = document.createElement('div');
            accordion.className = 'rr-accordion';
            var head = document.createElement('button');
            head.type = 'button';
            head.className = 'rr-accordion-head';
            var count = AGP.gameManager ? AGP.gameManager.getPlayersCount() : 0;
            head.innerHTML = '<span>👥 اللاعبين المشاركين (' + count + ')</span><span class="rr-accordion-chevron">▾</span>';
            playerRow.parentNode.insertBefore(accordion, playerRow);
            accordion.appendChild(head);
            var body = document.createElement('div');
            body.className = 'rr-accordion-body';
            accordion.appendChild(body);
            body.appendChild(playerRow);
            head.addEventListener('click', function () { accordion.classList.toggle('rr-open'); });
        } else if (playerRow) {
            var headEl = box.querySelector('.rr-accordion-head span');
            if (headEl && AGP.gameManager) headEl.textContent = '👥 اللاعبين المشاركين (' + AGP.gameManager.getPlayersCount() + ')';
        }

        if (box.querySelector('.rr-save-btn')) return;
        var actionsBox = box.querySelector('.agp-settings-player-actions');
        if (!actionsBox) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rr-save-btn';
        btn.textContent = '💾 حفظ التعديلات';
        btn.onclick = handleSaveChangesClick;
        actionsBox.insertBefore(btn, actionsBox.firstChild);

        var exitBtn = document.createElement('button');
        exitBtn.type = 'button';
        exitBtn.className = 'rr-exit-btn';
        exitBtn.textContent = '🚪 إنهاء اللعبة والعودة لمنصة الألعاب';
        exitBtn.addEventListener('click', function () {
            if (window.confirm('هذا بينهي المباراة الحالية ويرجّعك لمنصة ألعاب أيمن. متأكد؟')) {
                window.location.href = '../../index.html';
            }
        });
        actionsBox.appendChild(exitBtn);
    }

    // ⚠️ زر "العودة لمنصة العاب ايمن" جنب زر "اتصل بالبث و انتقل للوبي" —
    // شاشة الإعدادات الأولى فقط (قبل الاتصال)، مو المُعاد فتحها وسط المباراة.
    function enhanceSettingsScreen() {
        var box = el('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box') || box.classList.contains('agp-connecting-box')) return;
        if (!document.getElementById('agp-tiktok-username')) return; // شاشة مُعاد فتحها وسط المباراة
        box.classList.add('rr-pre-match-settings'); // ⚠️ يُعاد إضافتها كل مرّة لأن box.className يُصفَّر بكل إعادة رسم

        // ⚠️ تجميع حقول الإعدادات ببطاقات منطقية (قسم ٥ بالمعيار) — مرّة
        // وحدة فقط لكل رسم (نتحقق من وجود بطاقة سابقاً قبل التكرار).
        if (!box.querySelector('.rr-setting-card')) {
            var rows = Array.prototype.slice.call(box.querySelectorAll('.agp-shell-row'));
            if (rows.length >= 6) {
                var card1 = document.createElement('div');
                card1.className = 'rr-setting-card';
                var label1 = document.createElement('div');
                label1.className = 'rr-setting-card-label';
                label1.textContent = 'اللاعبون';
                rows[0].parentNode.insertBefore(card1, rows[0]);
                card1.appendChild(label1);
                card1.appendChild(rows[0]);
                card1.appendChild(rows[1]);

                var card2 = document.createElement('div');
                card2.className = 'rr-setting-card';
                var label2 = document.createElement('div');
                label2.className = 'rr-setting-card-label';
                label2.textContent = 'إعدادات المسدس';
                card1.parentNode.insertBefore(card2, rows[2]);
                card2.appendChild(label2);
                for (var i = 2; i < rows.length; i++) card2.appendChild(rows[i]);
            }
        }

        if (box.querySelector('.rr-home-from-settings-btn')) return;
        var connectBtn = document.getElementById('agp-connect-btn');
        if (!connectBtn) return;
        connectBtn.textContent = 'الاتصال بالبث والدخول';
        // ⚠️ نلتقط يوزرنيم الاستريمر لحظة الضغط على الاتصال — بنعرضه لاحقاً
        // كـ"مُقصي" بشاشة نتيجة الإقصاء وقت أي تجاوز يدوي من الاستريمر
        // نفسه (زر الإقصاء اليدوي بشاشة الاختيار).
        connectBtn.addEventListener('click', function () {
            var input = document.getElementById('agp-tiktok-username');
            if (input && input.value) _streamerUsername = input.value.trim();
        });
        var row = document.createElement('div');
        row.className = 'rr-settings-btn-row';
        connectBtn.parentNode.insertBefore(row, connectBtn);
        row.appendChild(connectBtn);
        var homeBtn = document.createElement('button');
        homeBtn.type = 'button';
        homeBtn.className = 'rr-home-from-settings-btn';
        homeBtn.textContent = 'العودة لمنصة العاب ايمن';
        homeBtn.addEventListener('click', function () { window.location.href = '../../index.html'; });
        row.appendChild(homeBtn);
    }

    function enhanceMiniLobby() {
        var box = el('agp-shell-box');
        if (!box) return;
        var doneBtn = document.getElementById('agp-mini-lobby-done-btn');
        if (!doneBtn || doneBtn.getAttribute('data-rr-wired') === '1') return;
        // ⚠️ الكلمة المفتاحية مرسومة أصلاً داخل .agp-join-keyword-plain
        // بنفس هذي الشاشة (الشل المشترك يعرضها هناك) — نقرأها من الـDOM
        // مباشرة قبل ما نستبدل محتوى الحاوية، لا يوجد getter عام لها.
        var keywordEl = box.querySelector('.agp-join-keyword-plain');
        var keyword = (keywordEl && keywordEl.textContent) || '';
        doneBtn.setAttribute('data-rr-wired', '1');
        var h2 = box.querySelector('h2');
        if (h2) h2.textContent = 'لوبي استقبال الاعبين الجدد لعبة الروليت الروسي';
        var hint = box.querySelector('.agp-join-hint-text');
        if (hint) hint.innerHTML = 'اكتب <span style="color:#e8c56b;font-weight:900;">"' + escapeHtml(keyword) + '"</span> في شات البث للدخول';
        doneBtn.textContent = 'انهاء الدخول واكمال المباراة';
        // ⚠️ الزر أصلاً مربوط بـhandleMiniLobbyDone الداخلية (ترجع لشاشة
        // الإعدادات الرئيسية) — نضيف مستمعاً إضافياً (بدون إزالة الأصلي)
        // يغلق التبويب بالكامل مباشرة بعده بنفس اللحظة، حتى يرجع الاستريمر
        // للعبة فوراً بدل المرور بشاشة الإعدادات.
        doneBtn.addEventListener('click', function () {
            window.setTimeout(function () {
                var overlay = el('agp-shell-overlay');
                if (overlay) overlay.style.display = 'none';
            }, 0);
        });
    }

    // ⚠️ سلايد تلقائي (marquee) للأسماء الطويلة داخل بطاقات اللوبي —
    // بطاقات اللوبي تُرسَم عبر الملف المشترك (js/agp-player-card.js) اللي
    // ما نلمسه إطلاقاً، فما نعرف بنية الـDOM الداخلية مسبقاً. الحل الآمن:
    // نلف نص أي بطاقة (بغض النظر عن بنيتها الأصلية) بعنصر sliding داخلي
    // وقت التشغيل، ونفعّل الأنيميشن فقط لو النص فعلاً أطول من المساحة
    // المتاحة — بعلامة data- تمنع لفّه مرتين لو الإصلاح تكرّر.
    function applyLobbyMarquee(container) {
        if (!container) return;
        var names = container.querySelectorAll('.agp-pcard-name-basic');
        names.forEach(function (nameEl) {
            if (nameEl.getAttribute('data-rr-marquee-ready') === '1') return;
            nameEl.setAttribute('data-rr-marquee-ready', '1');
            var text = nameEl.textContent;
            nameEl.textContent = '';
            var track = document.createElement('span');
            track.className = 'rr-name-track';
            track.textContent = text;
            nameEl.appendChild(track);
            window.requestAnimationFrame(function () {
                var cs = window.getComputedStyle(nameEl);
                var padL = parseFloat(cs.paddingLeft) || 0;
                var padR = parseFloat(cs.paddingRight) || 0;
                var availableWidth = nameEl.clientWidth - padL - padR;
                var overflow = track.scrollWidth - availableWidth;
                if (overflow > 2) {
                    track.style.setProperty('--rr-slide-dist', '-' + overflow + 'px');
                    track.classList.add('rr-marquee');
                }
            });
        });
    }

    function enhanceLobbyScreen() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var h2 = box.querySelector('h2');
        if (h2 && h2.getAttribute('data-rr-heading') !== '1') {
            h2.innerHTML = 'اللوبي بانتظار اللاعبين <span class="rr-lobby-heading-accent">' + escapeHtml(GAME_NAME) + '</span>';
            h2.setAttribute('data-rr-heading', '1');
        }
        var list = document.getElementById('agp-lobby-list');
        // ⚠️ نلف شبكة البطاقات بحاوية سكرول داخلية خاصة بها — الهيدر
        // والبانر وشريط الأزرار السفلي يبقون ثابتين دائماً، بس هذي المنطقة
        // اللي تتحرّك (قسم ٤ بالمعيار).
        if (list && !list.closest('#rr-lobby-scroll')) {
            var scrollWrap = document.createElement('div');
            scrollWrap.id = 'rr-lobby-scroll';
            list.parentNode.insertBefore(scrollWrap, list);
            scrollWrap.appendChild(list);
        }
        if (list && AGP.gameManager) {
            var players = AGP.gameManager.getPlayers();
            list.querySelectorAll('li').forEach(function (li, i) {
                if (li.querySelector('.rr-lobbyscreen-remove-btn')) return;
                var player = players[i];
                if (!player || !player.id) return;
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'rr-lobbyscreen-remove-btn';
                btn.title = 'حذف من اللوبي';
                btn.textContent = '✕';
                btn.addEventListener('click', function () {
                    if (AGP.player && typeof AGP.player.removePlayer === 'function') AGP.player.removePlayer(player.id);
                });
                li.style.position = 'relative';
                li.appendChild(btn);
            });
        }
        if (list) applyLobbyMarquee(list);
        var startBtn = document.getElementById('agp-start-round-btn');
        if (startBtn && !box.querySelector('.rr-lobby-actions-row')) {
            var row = document.createElement('div');
            row.className = 'rr-lobby-actions-row';
            startBtn.parentNode.insertBefore(row, startBtn);

            var backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.className = 'rr-lobby-action-btn';
            backBtn.textContent = '⚙️ العودة لاعدادات المباراة';
            backBtn.addEventListener('click', function () {
                if (window.confirm('بيرجّعك لشاشة إعدادات المباراة الأولى، ويلغي الاتصال الحالي بالبث ويقفل اللوبي — بيحتاج اتصال جديد بعدها. تكمل؟')) {
                    window.location.reload();
                }
            });
            var homeBtn = document.createElement('button');
            homeBtn.type = 'button';
            homeBtn.className = 'rr-lobby-action-btn';
            homeBtn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
            homeBtn.addEventListener('click', function () { window.location.href = '../../index.html'; });

            row.appendChild(backBtn);
            row.appendChild(startBtn);
            row.appendChild(homeBtn);
        }
    }

    // ⚠️ شاشة "جاري الاتصال" تُستخدَم لحالتين بنفس الصندوق (الملف المشترك):
    // الانتظار العادي، وحالة الخطأ (يوزرنيم غلط/تعذّر الاتصال) — بدون أي
    // زر رجوع بالحالتين أصلاً. نميّز حالة الخطأ تحديداً (نص الرسالة يحتوي
    // "تعذّر") ونضيف زر رجوع لشاشة الإعدادات (حقل اليوزرنيم) بس عندها.
    function enhanceConnectingScreen() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-connecting-box')) return;
        var statusEl = box.querySelector('.agp-shell-status');
        var isError = statusEl && statusEl.textContent.indexOf('تعذّر') !== -1;
        var existingBtn = box.querySelector('.rr-connect-retry-btn');
        if (!isError) {
            if (existingBtn) existingBtn.remove();
            return;
        }
        if (existingBtn) return; // مضاف مسبقاً لنفس حالة الخطأ
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rr-connect-retry-btn';
        btn.textContent = '🔙 رجوع للإعدادات';
        btn.addEventListener('click', function () { window.location.reload(); });
        box.appendChild(btn);
    }

    function applyShellEnhancements() {
        enhanceSettingsScreen();
        enhanceLobbyScreen();
        enhanceReopenedSettings();
        enhanceMiniLobby();
        enhanceConnectingScreen();
    }

    function wireSharedShellEnhancements() {
        applyShellEnhancements();
        var overlay = document.getElementById('agp-shell-overlay');
        if (!overlay) return;
        var observer = new MutationObserver(applyShellEnhancements);
        observer.observe(overlay, { childList: true, subtree: true });
    }

    /* ======================================================================
     *  15) تسجيل اللعبة بالمنصة
     * ==================================================================== */
    function registerGame() {
        injectStageStyles();
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'elimination-games',
            onLoad: function () { AGP.log('Russian Roulette: onLoad.'); },
            onPlayerJoin: function () { enforceMaxPlayers(); },
            onRoundEnd: function () { AGP.log('Russian Roulette: onRoundEnd.'); },
            onDestroy: function () { resetMatchState(); AGP.log('Russian Roulette: onDestroy.'); }
        });
        if (!registered) { AGP.log('Russian Roulette: registration failed (already registered?).'); return; }

        AGP.gameManager.loadGame(GAME_ID);

        AGP.events.on('player:removed', function (payload) { handlePlayerRemoved(payload && payload.player); });
        AGP.events.on('player:joined', function (payload) {
            var p = payload && payload.player;
            if (p) handlePlayerJoinedMidMatch(p);
        });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'اعدادات مباراة الروليت الروسي',
            gameExplanation: 'تدور العجلة وتتوقف على لاعب، فيختار رقم لاعب آخر يستهدفه من شات البث. محرك احتمال ' +
                'حقيقي (عدد الطلقات المعباة من أصل 6 غرف) يحدد النتيجة: إصابة = إقصاء فوري، فاضي = نجاة. تستمر ' +
                'المباراة لين يبقى لاعب واحد — هو الفائز!',
            connectButtonLabel: 'الاتصال بالبث والدخول',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../index.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });

        wireSharedShellEnhancements();
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager &&
        !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
