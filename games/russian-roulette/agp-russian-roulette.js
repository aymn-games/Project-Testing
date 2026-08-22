/**
 * ==========================================================================
 *  AGP RUSSIAN ROULETTE — "روليت الروسي" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 *
 * لعبة أصلية (Native) داخل نفس مستودع Project-Testing — لا تحتاج نافذة
 * خارجية ولا postMessage إطلاقاً؛ صفحتها الخاصة
 * (games/russian-roulette/index.html) تحمّل AGP Core كاملاً + js/agp-game-shell.js
 * المشترك (نفس نمط روليت الإقصاء وأسم و حيوان و نبات و جماد و بلاد) + هذا
 * الملف مباشرة.
 *
 * ⚠️ الميكانيكية (طلب صريح: "الاعتماد على أساسيات اللعب الصحيحة"):
 *   - مسدس بساقية سداسية ثابتة (6 غرف)، مو قابلة للتعديل.
 *   - عدد الطلقات المحشوّة بالساقية قابل للتحديد من الإعدادات (1–6،
 *     حقل bulletsCount).
 *   - "الحشوة" الواحدة = مصفوفة من 6 قيم (N طلقة + الباقي فاضي) تُخلَط
 *     عشوائياً مرة واحدة فقط، ثم تُكشَف غرفة واحدة فقط لكل سحبة زناد،
 *     **بدون إعادة خلط بين اللاعبين** (نفس الروليت الروسي الحقيقي —
 *     الأسطوانة لا تُدار من جديد كل مرة، فقط تتقدّم غرفة واحدة). لما تُستهلك
 *     الغرف الست كلها، تُعاد حشوة جديدة تلقائياً بنفس عدد الطلقات المُعدَّل
 *     (يُقرأ حياً من الإعدادات — لو الاستريمر عدّله منتصف المباراة عبر
 *     إعادة فتح ⚙️، ينطبق على الحشوة القادمة مباشرة).
 *   - هذا يعني الاحتمال المعروض قبل كل سحبة **احتمال شرطي حقيقي** = عدد
 *     الطلقات المتبقية بالغرف غير المكشوفة ÷ عدد الغرف غير المكشوفة
 *     المتبقية — يتغيّر فعلياً مع كل سحبة (يرتفع كل ما اقترب استهلاك
 *     الحشوة وبقيت طلقات لم تُكشف)، وليس نسبة ثابتة مكرَّرة. هذا حرفياً ما
 *     يقصده طلب "عدد الطلقات يحدد عدد الاحتمالات لكل لاعب".
 *   - الأدوار بالتتابع (round-robin) على كل اللاعبين الأحياء بترتيب
 *     ثابت (قابل لخلط عشوائي مرة واحدة قبل أول سحبة عبر زر 🔀). كل لاعب
 *     يسحب الزناد على نفسه (لا يختار ضحية غيره — نفس منطق الروليت الروسي
 *     الحقيقي، بعكس "روليت الإقصاء" اللي فيها اختيار مُقصى).
 *   - إقصاء نهائي فوري عند الإصابة (بدون إنعاش/رجوع — ما طُلب، وأي آلية
 *     رجوع تكسر منطق "الطلقة الحقيقية" المطلوب هنا صراحة).
 *   - تستمر المباراة (بإعادة حشو تلقائي) لين يبقى لاعب واحد حي = الفائز.
 *
 * ⚠️ الألوان: لونان أساسيان فقط يقودان كل حالة بالواجهة — أحمر خطر
 *   (C_RED) للإصابة/التحذير، وسماوي (C_CYAN، نفس --accent-2 الرسمي
 *   للمنصة) للنجاة/الأمان — فوق نفس الخلفية الغامقة الزجاجية الموحّدة
 *   لكل ألعاب المنصة (لا لون ثالث بالتصميم، طلب صريح).
 *
 * ⚠️ الصوت: مُولَّد حياً بالكامل عبر Web Audio API (نغمات/ضوضاء مُركَّبة
 *   بالمتصفح مباشرة — Oscillator/Noise Buffer)، بدون أي ملفات صوت خارجية
 *   إطلاقاً. مستوى الصوت قابل للتعديل حياً من الإعدادات (نفس نمط
 *   soundVolume بروليت الإقصاء).
 *
 * ⚠️ النقاط: بدون أي تغيير — نفس النظام العام الموحّد للمنصة
 *   (window.AGPAuth.reportRoundCompletion، +مشاركة/+فوز حسب القيم
 *   الموحّدة بالباك إند)، بدون أي قيم مخصَّصة لهذي اللعبة — نفس التزام
 *   روليت الإقصاء الصريح.
 *
 * الاعتماديات (بنفس ترتيب index.html، راجع docs/CLAUDE.md):
 *   js/agp-core.js … js/agp-bootstrap.js (AGP Core كامل)، ثم
 *   js/agp-player-card.js، ثم js/agp-game-shell.js (شاشة الإعدادات +
 *   الاتصال بتيك توك + اللوبي — ملف عام، غير مُعدَّل هنا)، ثم هذا الملف.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.gameManager || !AGP.streamConnector || !AGP.keywordManager) {
        console.error('[AGP Russian Roulette] AGP Core not loaded yet — load js/agp-core.js and friends first.');
        return;
    }
    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'russian-roulette';
    var GAME_NAME = 'روليت الروسي';
    var CHAMBERS = 6;

    // ---- الألوان الأساسيان (فقط اثنان، فوق الخلفية الزجاجية الموحّدة) ----
    var C_RED = '#ff2b4d';    // خطر / إصابة
    var C_RED_DK = '#7a1626'; // نسخة غامقة (خلفيات/حدود خافتة)
    var C_CYAN = '#00c2ff';   // نجاة / أمان — نفس --accent-2 الرسمي للمنصة
    var C_CYAN_DK = '#0a5872';

    var BULLET_OPTIONS = [1, 2, 3, 4, 5, 6].map(function (n) { return { label: String(n), value: n }; });

    /* ======================================================================
     *  0) صوت — مُولَّد بالكامل حياً عبر Web Audio API (بدون أي ملفات).
     * ==================================================================== */
    var _actx = null;
    function audioCtx() {
        if (_actx) return _actx;
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try { _actx = new Ctx(); } catch (e) { _actx = null; }
        return _actx;
    }
    function currentVolume() {
        var settings = AGP.gameShell && AGP.gameShell.getSettings ? AGP.gameShell.getSettings() : {};
        var v = settings.soundVolume;
        if (v === undefined || v === null) v = 7;
        return Math.max(0, Math.min(10, v)) / 10;
    }
    function playTone(freq, durationMs, opts) {
        var vol = currentVolume();
        if (vol <= 0) return;
        var ctx = audioCtx();
        if (!ctx) return;
        opts = opts || {};
        try {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = opts.type || 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, ctx.currentTime + durationMs / 1000);
            var peak = (opts.peak != null ? opts.peak : 0.28) * vol;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
        } catch (e) { /* الصوت طبقة تحسين فقط — تجاهل صامت */ }
    }
    function playNoiseBang() {
        var vol = currentVolume();
        if (vol <= 0) return;
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
            gain.gain.setValueAtTime(0.9 * vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
            noise.connect(lowpass);
            lowpass.connect(gain);
            gain.connect(ctx.destination);
            noise.start();
            // دفعة تردد منخفض إضافية (طقة المطرقة/الارتداد) فوق الضوضاء
            playTone(90, 180, { type: 'square', peak: 0.5, slideTo: 40 });
        } catch (e) { /* تجاهل صامت */ }
    }
    function playClick() { playTone(620, 90, { type: 'square', peak: 0.16, slideTo: 340 }); }
    function playSafeChime() { playTone(520, 220, { type: 'sine', peak: 0.22, slideTo: 780 }); }
    function playWinFanfare() {
        [523, 659, 784, 1046].forEach(function (f, idx) {
            window.setTimeout(function () { playTone(f, 260, { type: 'triangle', peak: 0.24 }); }, idx * 130);
        });
    }

    /* ======================================================================
     *  1) حالة المباراة الداخلية
     * ==================================================================== */
    var _alive = [];
    var _eliminated = [];        // { player, atPull }
    var _chamberPool = [];       // مصفوفة من 6 قيم boolean (true = طلقة) للحشوة الحالية
    var _chamberPos = 0;         // كم غرفة انكشفت من الحشوة الحالية (0..6)
    var _turnIndex = 0;          // فهرس صاحب الدور القادم داخل _alive
    var _settings = null;
    var _startedAt = null;
    var _matchActive = false;
    var _busy = false;           // true أثناء أنيميشن السحب/الكشف (يمنع نقرات متتالية)
    var _totalPulls = 0;
    var _reloadsCount = 0;
    var _autoPlayActive = false;
    var _autoPlayTimer = null;

    function resetMatchState() {
        _alive = [];
        _eliminated = [];
        _chamberPool = [];
        _chamberPos = 0;
        _turnIndex = 0;
        _settings = null;
        _startedAt = null;
        _matchActive = false;
        _busy = false;
        _totalPulls = 0;
        _reloadsCount = 0;
        if (_autoPlayTimer) { window.clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
        _autoPlayActive = false;
    }

    function liveSettings() {
        return (AGP.gameShell && typeof AGP.gameShell.getSettings === 'function') ? AGP.gameShell.getSettings() : (_settings || {});
    }
    function currentBulletsCount() {
        var n = liveSettings().bulletsCount;
        n = parseInt(n, 10);
        if (!n || n < 1) n = 1;
        if (n > CHAMBERS) n = CHAMBERS;
        return n;
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
    // ⚠️ نفس إصلاح الاسم المستعار مقابل اليوزرنيم الحقيقي المستخدَم بمطابقة
    // النقاط بالباك إند — راجع نفس الملاحظة بروليت الإقصاء (player.id
    // بصيغة 'tiktok:'+uniqueId هو المصدر الصحيح، لا player.name).
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
        if (AGP.gameManager && typeof AGP.gameManager.getPlayers === 'function') {
            return AGP.gameManager.getPlayers().filter(function (p) { return p.id === id; })[0] || null;
        }
        return null;
    }
    function shuffleArray(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }
    function currentPlayer() { return _alive.length ? _alive[_turnIndex % _alive.length] : null; }

    function ensureZainFont() {
        if (el('rr-zain-font-link')) return;
        var pre1 = document.createElement('link');
        pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
        var pre2 = document.createElement('link');
        pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous';
        var sheet = document.createElement('link');
        sheet.id = 'rr-zain-font-link'; sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Zain:ital,wght@0,200;0,300;0,400;0,700;0,800;0,900;1,300;1,400&display=swap';
        document.head.appendChild(pre1); document.head.appendChild(pre2); document.head.appendChild(sheet);
    }

    /* ======================================================================
     *  3) الحشوة — منطق الاحتمال الشرطي الحقيقي
     * ==================================================================== */
    function loadChamber() {
        var n = currentBulletsCount();
        var pool = [];
        for (var i = 0; i < CHAMBERS; i++) pool.push(i < n);
        _chamberPool = shuffleArray(pool);
        _chamberPos = 0;
    }
    function remainingUnrevealed() { return CHAMBERS - _chamberPos; }
    function remainingBullets() {
        var count = 0;
        for (var i = _chamberPos; i < _chamberPool.length; i++) if (_chamberPool[i]) count++;
        return count;
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
            ':root{--rr-red:' + C_RED + ';--rr-red-dk:' + C_RED_DK + ';--rr-cyan:' + C_CYAN + ';--rr-cyan-dk:' + C_CYAN_DK + ';}',

            '#agp-shell-overlay,#agp-shell-overlay *,#rr-stage,#rr-stage *,#rr-modal-overlay,#rr-modal-overlay *',
            '{font-family:"Zain",Cairo,sans-serif !important;}',

            '#rr-stage{position:fixed;inset:0;padding:86px 16px 24px;display:flex;flex-direction:column;',
            'align-items:center;justify-content:flex-start;gap:16px;overflow-y:auto;direction:rtl;color:#f3eefc;}',

            /* ---- شريط الحشوة الحالية ---- */
            '#rr-load-bar{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.06);',
            'border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:8px 20px;font-size:0.85em;font-weight:800;}',
            '#rr-load-bar b{color:var(--rr-red);}',

            /* ---- الاسطوانة ---- */
            '#rr-cylinder-wrap{position:relative;width:260px;height:260px;margin-top:4px;}',
            '#rr-cylinder-body{position:absolute;inset:0;border-radius:50%;',
            'background:radial-gradient(circle at 38% 32%,#3a3f4d,#101218 72%);',
            'border:6px solid #565c6b;box-shadow:0 0 40px rgba(0,0,0,0.55),inset 0 0 26px rgba(0,0,0,0.6);}',
            '#rr-cylinder-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
            'width:56px;height:56px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#4c525f,#1a1c22);',
            'border:3px solid #6b7180;box-shadow:0 0 14px rgba(0,0,0,0.6);}',
            '.rr-chamber{position:absolute;width:52px;height:52px;border-radius:50%;transform:translate(-50%,-50%);',
            'display:flex;align-items:center;justify-content:center;font-size:1.4em;',
            'background:radial-gradient(circle at 38% 32%,#232631,#08090c);',
            'border:3px solid rgba(255,255,255,0.22);transition:border-color 0.25s,box-shadow 0.25s,background 0.25s;}',
            '.rr-chamber.rr-chamber-empty{border-color:var(--rr-cyan);background:radial-gradient(circle at 38% 32%,#0e3542,#08090c);',
            'box-shadow:0 0 14px rgba(0,194,255,0.55);}',
            '.rr-chamber.rr-chamber-bullet{border-color:var(--rr-red);background:radial-gradient(circle at 38% 32%,#4a0f1c,#08090c);',
            'box-shadow:0 0 18px rgba(255,43,77,0.75);}',
            /* ⚠️ عمداً بدون translateX(-50%) بالـtransform — يتركّب بشكل
             * غير متوقَّع مع rotate حول transform-origin. بدل ذلك left
             * محسوبة مباشرة (مركز الاسطوانة 130px − نصف عرض المؤشّر)،
             * فالـtransform يبقى rotate() فقط حول نقطة ثابتة معروفة. */
            '#rr-hammer-pointer{position:absolute;top:12px;left:128px;width:4px;height:118px;',
            'background:linear-gradient(180deg,var(--rr-red),rgba(255,43,77,0));border-radius:4px;',
            'transform-origin:50% 100%;transform:rotate(0deg);transition:transform 0.5s cubic-bezier(0.2,0.8,0.3,1);',
            'z-index:5;filter:drop-shadow(0 0 6px rgba(255,43,77,0.8));}',

            /* ---- قراءة الاحتمال الحيّة ---- */
            '#rr-odds-readout{font-size:1.05em;font-weight:900;color:#fff;text-align:center;',
            'background:rgba(255,43,77,0.14);border:1px solid rgba(255,43,77,0.5);border-radius:14px;padding:8px 22px;}',
            '#rr-odds-readout b{color:var(--rr-red);font-size:1.15em;}',

            /* ---- بطاقة صاحب الدور ---- */
            '#rr-turn-banner{display:flex;flex-direction:column;align-items:center;gap:6px;}',
            '#rr-turn-banner .rr-turn-label{font-size:0.85em;color:#d9c8ea;font-weight:700;}',
            '#rr-turn-card-wrap{position:relative;padding:5px;border-radius:50%;',
            'background:conic-gradient(var(--rr-red),var(--rr-cyan),var(--rr-red));',
            'box-shadow:0 0 22px rgba(255,43,77,0.5);animation:rr-pulse 1.6s ease-in-out infinite;}',
            '@keyframes rr-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.05);}}',
            '#rr-turn-name{font-size:1.1em;font-weight:900;color:#fff;}',

            /* ---- زر السحب ---- */
            '#rr-trigger-btn{margin-top:2px;padding:16px 46px;border-radius:999px;border:none;cursor:pointer;',
            'background:linear-gradient(90deg,var(--rr-red),#c4123a);color:#fff;font-weight:900;font-size:1.15em;',
            'font-family:Almarai,Cairo,sans-serif;box-shadow:0 6px 22px rgba(255,43,77,0.55);',
            'transition:transform 0.15s,box-shadow 0.15s;}',
            '#rr-trigger-btn:not(:disabled):hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(255,43,77,0.7);}',
            '#rr-trigger-btn:disabled{opacity:0.45;cursor:not-allowed;}',
            '#rr-shuffle-btn{padding:8px 20px;border-radius:999px;border:1px solid var(--rr-cyan);',
            'background:rgba(255,255,255,0.06);color:#fff;font-family:inherit;font-weight:700;font-size:0.82em;cursor:pointer;}',
            '#rr-shuffle-btn:disabled{opacity:0.35;cursor:not-allowed;}',
            '#rr-shuffle-btn:not(:disabled):hover{background:rgba(255,255,255,0.14);}',

            /* ---- صفوف اللاعبين (أحياء / خارجون) ---- */
            '.rr-roster-section{width:100%;max-width:920px;}',
            '.rr-roster-title{font-size:0.85em;font-weight:800;color:#d9c8ea;margin-bottom:8px;text-align:right;}',
            '.rr-roster-row{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-start;}',
            '.rr-roster-card{position:relative;padding:4px;border-radius:16px;background:rgba(255,255,255,0.05);',
            'border:1px solid rgba(255,255,255,0.14);}',
            '.rr-roster-card.rr-roster-current{border-color:var(--rr-red);box-shadow:0 0 14px rgba(255,43,77,0.55);}',
            '.rr-roster-card.rr-roster-out{opacity:0.4;filter:grayscale(1);}',
            '.rr-out-badge{position:absolute;top:-6px;left:-6px;background:var(--rr-red);color:#fff;',
            'border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;',
            'font-size:0.75em;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.5);}',

            /* ---- سجل السحوبات ---- */
            '#rr-history{width:100%;max-width:560px;max-height:150px;overflow-y:auto;',
            'background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:8px 14px;',
            'font-size:0.8em;}',
            '.rr-history-item{padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;',
            'align-items:center;gap:8px;}',
            '.rr-history-item:last-child{border-bottom:none;}',

            /* ---- نافذة الكشف الدرامية ---- */
            '#rr-modal-overlay{position:fixed;inset:0;z-index:100010;display:none;align-items:center;',
            'justify-content:center;background:rgba(6,3,10,0.82);}',
            '#rr-modal-box{width:640px;max-width:92vw;text-align:center;padding:44px 30px;border-radius:22px;',
            'background:linear-gradient(180deg,#5F3976,#211528);border:2px solid var(--rr-cyan);',
            'box-shadow:0 0 60px rgba(0,194,255,0.4);}',
            '#rr-modal-box.rr-modal-hit{border-color:var(--rr-red);box-shadow:0 0 70px rgba(255,43,77,0.65);',
            'animation:rr-shake 0.5s;}',
            '@keyframes rr-shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-10px);}',
            '40%{transform:translateX(10px);}60%{transform:translateX(-6px);}80%{transform:translateX(6px);}}',
            '#rr-modal-icon{font-size:4.4em;line-height:1;margin-bottom:10px;}',
            '#rr-modal-title{font-size:1.6em;font-weight:900;color:#fff;margin-bottom:6px;',
            'font-family:Almarai,Cairo,sans-serif;}',
            '#rr-modal-sub{font-size:0.95em;color:#e9d3ff;}',

            /* ---- شاشة الفائز ---- */
            '#rr-winner-overlay{position:fixed;inset:0;z-index:100011;display:none;align-items:center;',
            'justify-content:center;background:rgba(6,3,10,0.88);padding:16px;}',
            '#rr-winner-box{width:560px;max-width:94vw;text-align:center;padding:40px 30px;border-radius:24px;',
            'background:linear-gradient(180deg,#5F3976,#211528);border:2px solid var(--rr-cyan);',
            'box-shadow:0 0 70px rgba(0,194,255,0.5);position:relative;overflow:hidden;}',
            '#rr-winner-box h2{margin:0 0 4px;font-size:1.5em;color:#fff;font-weight:900;',
            'font-family:Almarai,Cairo,sans-serif;}',
            '.rr-winner-ring{width:120px;height:120px;border-radius:50%;margin:14px auto;padding:5px;',
            'background:var(--rr-cyan);box-shadow:0 0 26px rgba(0,194,255,0.7);}',
            '.rr-winner-ring-inner{width:100%;height:100%;border-radius:50%;overflow:hidden;background:#1a1024;',
            'display:flex;align-items:center;justify-content:center;}',
            '.rr-winner-ring-inner img{width:100%;height:100%;object-fit:cover;}',
            '.rr-winner-avatar-fallback{font-size:2em;font-weight:900;color:#fff;}',
            '#rr-winner-name{font-size:1.3em;font-weight:900;color:#fff;margin-top:6px;}',
            '#rr-winner-points{margin-top:10px;font-size:0.95em;color:#7de0ff;font-weight:800;}',
            '.rr-winner-points-sub{display:block;font-size:0.75em;color:#c9a8e0;font-weight:600;margin-top:2px;}',
            '.rr-winner-actions{margin-top:22px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}',
            '.rr-winner-actions button{padding:10px 22px;border-radius:999px;font-family:inherit;font-weight:800;',
            'font-size:0.85em;cursor:pointer;border:1px solid var(--rr-cyan);background:rgba(255,255,255,0.08);color:#fff;}',
            '.rr-winner-actions button:hover{background:rgba(255,255,255,0.16);}',
            '.rr-winner-actions button.rr-primary{background:linear-gradient(90deg,var(--rr-cyan),#0a86ad);border:none;}',
            '.rr-confetti-piece{position:absolute;top:50%;left:50%;width:8px;height:8px;border-radius:2px;',
            'animation:rr-confetti-fly 1.6s ease-out forwards;}',
            '@keyframes rr-confetti-fly{to{transform:translate(var(--dx),var(--dy)) rotate(540deg);opacity:0;}}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  5) رسم المرحلة
     * ==================================================================== */
    function ensureScaffolding() {
        if (el('rr-stage')) return;
        var stage = document.createElement('div');
        stage.id = 'rr-stage';
        stage.innerHTML =
            '<div id="rr-load-bar">🔫 الطلقات بالساقية: <b id="rr-load-count">?</b> من ' + CHAMBERS + '</div>' +
            '<div id="rr-cylinder-wrap">' +
                '<div id="rr-cylinder-body"></div>' +
                '<div id="rr-chambers-layer"></div>' +
                '<div id="rr-hammer-pointer"></div>' +
                '<div id="rr-cylinder-hub"></div>' +
            '</div>' +
            '<div id="rr-odds-readout">🎯 احتمال الإصابة الآن: <b id="rr-odds-val">—</b></div>' +
            '<div id="rr-turn-banner">' +
                '<span class="rr-turn-label">🔫 دور السحب الآن</span>' +
                '<div id="rr-turn-card-wrap"><div id="rr-turn-card"></div></div>' +
                '<span id="rr-turn-name"></span>' +
            '</div>' +
            '<button id="rr-trigger-btn" type="button">🔫 اسحب الزناد</button>' +
            '<button id="rr-shuffle-btn" type="button">🔀 خلط ترتيب الأدوار</button>' +
            '<div class="rr-roster-section"><div class="rr-roster-title">👥 اللاعبون الأحياء</div>' +
                '<div class="rr-roster-row" id="rr-alive-row"></div></div>' +
            '<div class="rr-roster-section"><div class="rr-roster-title">🪦 خرجوا من اللعبة</div>' +
                '<div class="rr-roster-row" id="rr-out-row"></div></div>' +
            '<div id="rr-history"></div>';
        document.body.appendChild(stage);

        var modal = document.createElement('div');
        modal.id = 'rr-modal-overlay';
        modal.innerHTML = '<div id="rr-modal-box"><div id="rr-modal-icon"></div>' +
            '<div id="rr-modal-title"></div><div id="rr-modal-sub"></div></div>';
        document.body.appendChild(modal);

        var winnerOverlay = document.createElement('div');
        winnerOverlay.id = 'rr-winner-overlay';
        winnerOverlay.innerHTML = '<div id="rr-winner-box"></div>';
        document.body.appendChild(winnerOverlay);

        el('rr-trigger-btn').addEventListener('click', handleTriggerClick);
        el('rr-shuffle-btn').addEventListener('click', handleShuffleClick);
    }

    function chamberPipStyle(i) {
        var angleDeg = -90 + i * (360 / CHAMBERS);
        var rad = angleDeg * Math.PI / 180;
        var R = 95; // نصف قطر توزيع الغرف داخل الاسطوانة (px)، مركز 130,130
        var x = 130 + R * Math.cos(rad);
        var y = 130 + R * Math.sin(rad);
        return 'left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;';
    }

    function renderCylinder() {
        var layer = el('rr-chambers-layer');
        if (!layer) return;
        var html = '';
        for (var i = 0; i < CHAMBERS; i++) {
            var revealed = i < _chamberPos;
            var cls = 'rr-chamber';
            var content = (i + 1);
            if (revealed) {
                if (_chamberPool[i]) { cls += ' rr-chamber-bullet'; content = '🔴'; }
                else { cls += ' rr-chamber-empty'; content = '⚪'; }
            }
            html += '<div class="' + cls + '" style="' + chamberPipStyle(i) + '">' + content + '</div>';
        }
        layer.innerHTML = html;
        var pointer = el('rr-hammer-pointer');
        if (pointer) {
            // ⚠️ angleDeg لكل غرفة = -90 + i*60 (i=0 فوق تماماً)، وrotate()
            // بـCSS يدور مع عقارب الساعة بدءاً من "فوق" — فمجرد i*60 يطابق
            // فعلياً موقع الغرفة رقم i بدون أي تحويل إضافي (راجع chamberPipStyle).
            var pointerAngle = _chamberPos * (360 / CHAMBERS);
            pointer.style.transform = 'rotate(' + pointerAngle + 'deg)';
        }
        var loadCountEl = el('rr-load-count');
        if (loadCountEl) loadCountEl.textContent = String(currentBulletsCount());
    }

    function updateOddsReadout() {
        var oddsEl = el('rr-odds-val');
        if (!oddsEl) return;
        oddsEl.textContent = remainingBullets() + ' من ' + remainingUnrevealed();
    }

    function playerCardHtml(p, extraClass) {
        var inner = AGP.playerCard ? AGP.playerCard.renderHtml(p, { basePath: '../../' }) :
            '<span>' + escapeHtml(playerLabel(p)) + '</span>';
        return '<div class="rr-roster-card ' + (extraClass || '') + '" data-player-id="' + escapeHtml(p.id) + '">' + inner + '</div>';
    }

    function renderRoster() {
        var aliveRow = el('rr-alive-row');
        var outRow = el('rr-out-row');
        if (aliveRow) {
            var cur = currentPlayer();
            aliveRow.innerHTML = _alive.map(function (p) {
                var isCurrent = cur && p.id === cur.id;
                return playerCardHtml(p, isCurrent ? 'rr-roster-current' : '');
            }).join('') || '<span style="opacity:0.6;font-size:0.85em;">لا أحد</span>';
        }
        if (outRow) {
            outRow.innerHTML = _eliminated.map(function (entry) {
                return '<div style="position:relative;display:inline-block;">' +
                    playerCardHtml(entry.player, 'rr-roster-out') +
                    '<span class="rr-out-badge">✕</span></div>';
            }).join('') || '<span style="opacity:0.6;font-size:0.85em;">لا أحد بعد</span>';
        }
        if (AGP.playerCard) {
            if (aliveRow) AGP.playerCard.fitAllNames(aliveRow);
            if (outRow) AGP.playerCard.fitAllNames(outRow);
        }
        var turnCardWrap = el('rr-turn-card');
        var turnNameEl = el('rr-turn-name');
        var current = currentPlayer();
        if (turnCardWrap && current) {
            turnCardWrap.innerHTML = AGP.playerCard ? AGP.playerCard.renderHtml(current, { basePath: '../../' }) :
                '<span>' + escapeHtml(playerLabel(current)) + '</span>';
        }
        if (turnNameEl) turnNameEl.textContent = current ? playerLabel(current) : '';
    }

    function logHistory(icon, player, text) {
        var list = el('rr-history');
        if (!list) return;
        var item = document.createElement('div');
        item.className = 'rr-history-item';
        item.innerHTML = '<span>' + icon + '</span><span>' + escapeHtml(playerLabel(player)) + ' — ' + escapeHtml(text) + '</span>';
        list.insertBefore(item, list.firstChild);
        while (list.children.length > 40) list.removeChild(list.lastChild);
    }

    function renderStage() {
        injectStageStyles();
        ensureScaffolding();
        loadChamber();
        renderCylinder();
        updateOddsReadout();
        renderRoster();
        var historyEl = el('rr-history');
        if (historyEl) historyEl.innerHTML = '';
        setTriggerEnabled(true);
    }

    function setTriggerEnabled(enabled) {
        var btn = el('rr-trigger-btn');
        if (btn) btn.disabled = !enabled;
        var shuffleBtn = el('rr-shuffle-btn');
        if (shuffleBtn) shuffleBtn.disabled = !enabled || _totalPulls > 0;
    }

    /* ======================================================================
     *  6) خلط ترتيب الأدوار (قبل أول سحبة فقط، تفادياً لأي التباس)
     * ==================================================================== */
    function handleShuffleClick() {
        if (_totalPulls > 0 || _busy) return;
        _alive = shuffleArray(_alive);
        _turnIndex = 0;
        renderRoster();
        playClick();
    }

    /* ======================================================================
     *  7) دورة اللعب الأساسية — سحب الزناد
     * ==================================================================== */
    function maybeReloadChamber() {
        if (remainingUnrevealed() <= 0 && _alive.length > 1) {
            _reloadsCount++;
            loadChamber();
        }
    }

    function showRevealModal(isBullet, player, onDone) {
        var overlay = el('rr-modal-overlay');
        var box = el('rr-modal-box');
        var icon = el('rr-modal-icon');
        var title = el('rr-modal-title');
        var sub = el('rr-modal-sub');
        if (!overlay || !box || !icon || !title || !sub) { onDone(); return; }
        box.className = isBullet ? 'rr-modal-hit' : '';
        icon.textContent = isBullet ? '💥' : '😮\u200D💨';
        title.textContent = isBullet ? (playerLabel(player) + ' أُصيب!') : (playerLabel(player) + ' نجا!');
        sub.textContent = isBullet ? 'خرج من اللعبة فوراً' : 'الغرفة فاضية — يواصل اللعب';
        overlay.style.display = 'flex';
        window.setTimeout(function () {
            overlay.style.display = 'none';
            onDone();
        }, isBullet ? 2400 : 1700);
    }

    function handleTriggerClick() {
        if (_busy || !_matchActive || _alive.length < 2) return;
        var shooter = currentPlayer();
        if (!shooter) return;

        _busy = true;
        setTriggerEnabled(false);
        playClick();

        // تشويق قصير قبل الكشف (طقطقة الأسطوانة) — نفس مبدأ التشويق
        // المستخدَم بألعاب المنصة الثانية (تأخير قصير قبل النتيجة).
        window.setTimeout(function () {
            var isBullet = _chamberPool[_chamberPos];
            _chamberPos++;
            _totalPulls++;
            renderCylinder();
            updateOddsReadout();

            if (isBullet) {
                playNoiseBang();
                var idx = _alive.findIndex(function (p) { return p.id === shooter.id; });
                if (idx !== -1) _alive.splice(idx, 1);
                _eliminated.push({ player: shooter, atPull: _totalPulls });
                logHistory('💥', shooter, 'أُصيب وخرج من اللعبة');
                // ⚠️ لا نزيد _turnIndex — حذف العنصر الحالي يخلي اللاعب
                // التالي ينزلق تلقائياً لنفس الفهرس (تقدّم طبيعي للدور).
            } else {
                playSafeChime();
                logHistory('😮\u200D💨', shooter, 'نجا وواصل اللعب');
                if (_alive.length) _turnIndex = (_turnIndex + 1) % _alive.length;
            }

            renderRoster();

            showRevealModal(isBullet, shooter, function () {
                if (_alive.length <= 1) {
                    var winner = _alive[0] || null;
                    endMatch(winner);
                    return;
                }
                maybeReloadChamber();
                renderCylinder();
                updateOddsReadout();
                renderRoster();
                _busy = false;
                setTriggerEnabled(true);
                if (_autoPlayActive) scheduleAutoPull();
            });
        }, 650);
    }

    /* ======================================================================
     *  8) "سحب تلقائي" — زر عام بالهيدر المشترك (midMatchToggleButton)
     * ==================================================================== */
    function scheduleAutoPull() {
        if (_autoPlayTimer) window.clearTimeout(_autoPlayTimer);
        _autoPlayTimer = window.setTimeout(function () {
            if (!_autoPlayActive || _busy || !_matchActive || _alive.length < 2) return;
            handleTriggerClick();
        }, 2600);
    }
    function stopAutoPlay() {
        _autoPlayActive = false;
        if (_autoPlayTimer) { window.clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
        if (AGP.gameShell && typeof AGP.gameShell.setMidMatchToggleActive === 'function') {
            AGP.gameShell.setMidMatchToggleActive(false);
        }
    }
    function handleAutoPlayToggle(isActive) {
        _autoPlayActive = Boolean(isActive);
        if (_autoPlayActive) scheduleAutoPull();
        else if (_autoPlayTimer) { window.clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
    }

    /* ======================================================================
     *  9) انضمام/حذف لاعب أثناء مباراة نشطة
     * ==================================================================== */
    function handlePlayerJoinedMidMatch(newPlayer) {
        if (!newPlayer || !newPlayer.id || !_matchActive) return;
        var alreadyAlive = _alive.some(function (p) { return p.id === newPlayer.id; });
        var alreadyOut = _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (alreadyAlive || alreadyOut) return;
        _alive.push(newPlayer);
        renderRoster();
    }
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;
        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) {
            _alive.splice(aliveIdx, 1);
            // ⚠️ لو المحذوف كان قبل صاحب الدور بالمصفوفة، كل شي بعده ينزلق
            // خانة لليسار — ننقص الفهرس بواحد ليبقى مؤشّراً لنفس اللاعب
            // الصحيح. لو كان المحذوف هو صاحب الدور نفسه، ما نغيّر شيء (اللاعب
            // التالي ينزلق تلقائياً لنفس الفهرس). ثم نطبّع (modulo) احتياطاً.
            if (aliveIdx < _turnIndex) _turnIndex -= 1;
            _turnIndex = _alive.length ? (((_turnIndex % _alive.length) + _alive.length) % _alive.length) : 0;
        }
        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);
        if (aliveIdx === -1 && elimIdx === -1) return;
        renderRoster();
        if (_matchActive && !_busy && _alive.length <= 1) {
            endMatch(_alive[0] || null);
        }
    }
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

    /* ======================================================================
     *  10) نهاية المباراة + النقاط (نفس مسار النظام العام الموحّد، بدون
     *      أي قيم مخصَّصة لهذي اللعبة)
     * ==================================================================== */
    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }
    function pointsHtmlFor(pointsResult, player) {
        if (!pointsResult) {
            return '<div id="rr-winner-points">تعذّر جلب النقاط الآن</div>';
        }
        var awarded = findAwardedFor(pointsResult, player);
        if (awarded) {
            return '<div id="rr-winner-points">+' + awarded.added + ' نقطة' +
                '<span class="rr-winner-points-sub">تظهر في بروفايلك</span></div>';
        }
        return '<div id="rr-winner-points">لازم يسوي حساب عشان تظهر نقاطك بالبروفايل</div>';
    }

    var CONFETTI_COLORS = [C_CYAN, C_RED, '#ffd400', '#4ade80'];
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

    function winnerAvatarHtml(winner) {
        if (!winner) return '';
        var name = playerLabel(winner);
        var initials = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        return winner.avatarUrl
            ? '<img src="' + escapeHtml(winner.avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;rr-winner-avatar-fallback&quot;>' + escapeHtml(initials) + '</div>\';">'
            : '<div class="rr-winner-avatar-fallback">' + escapeHtml(initials) + '</div>';
    }

    function renderWinnerScreen(winner, pointsResult) {
        var overlay = el('rr-winner-overlay');
        var box = el('rr-winner-box');
        if (!overlay || !box) return;
        box.innerHTML =
            '<h2>' + (winner ? '🏆 الفائز بالمباراة' : '🏁 انتهت المباراة') + '</h2>' +
            (winner ? (
                '<div class="rr-winner-ring"><div class="rr-winner-ring-inner">' + winnerAvatarHtml(winner) + '</div></div>' +
                '<div id="rr-winner-name">' + escapeHtml(playerLabel(winner)) + '</div>' +
                pointsHtmlFor(pointsResult, winner)
            ) : '<div style="margin-top:10px;color:#e9d3ff;">ما بقي أحد بالمباراة.</div>') +
            '<div class="rr-winner-actions">' +
                '<button type="button" class="rr-primary" id="rr-replay-same-btn">🔁 إعادة بنفس اللاعبين</button>' +
                '<button type="button" id="rr-new-match-btn">🆕 مباراة جديدة</button>' +
            '</div>';
        overlay.style.display = 'flex';
        if (winner) {
            playWinFanfare();
            spawnConfetti(box, 30);
        }
        el('rr-new-match-btn').onclick = function () { window.location.reload(); };
        el('rr-replay-same-btn').onclick = function () {
            var survivorsRoster = AGP.gameManager.getPlayers().slice();
            overlay.style.display = 'none';
            resetMatchState();
            _matchActive = true;
            _alive = survivorsRoster;
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
     *  11) شاشة الإعدادات + بدء الجولة
     * ==================================================================== */
    function buildSettingsFields() {
        return [
            { key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى لعدد اللاعبين بالمباراة', min: 2, default: 20 },
            {
                key: 'followersOnly', type: 'pill-choice', label: '🔑 مين يقدر يدخل؟',
                options: [{ label: 'الكل', value: false }, { label: 'المتابعون فقط', value: true }], default: false
            },
            {
                key: 'bulletsCount', type: 'pill-group', label: '🔫 عدد الطلقات بالساقية (من 6)',
                options: BULLET_OPTIONS, default: 1
            },
            { key: 'soundVolume', type: 'slider', label: '🔊 مستوى الصوت', min: 0, max: 10, default: 7, onlyMidMatch: true }
        ];
    }

    function handleStartRound(settingsValues) {
        resetMatchState();
        _settings = settingsValues;
        _alive = AGP.gameManager.getPlayers().slice();
        _startedAt = Date.now();
        _matchActive = true;
        renderStage();
    }

    /* ======================================================================
     *  12) تسجيل اللعبة بالمنصة
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
            onDestroy: function () { resetMatchState(); AGP.log('Russian Roulette: onDestroy — match state cleared.'); }
        });

        if (!registered) {
            AGP.log('Russian Roulette: registration failed (already registered?).');
            return;
        }

        AGP.gameManager.loadGame(GAME_ID);

        AGP.events.on('player:removed', function (payload) {
            handlePlayerRemoved(payload && payload.player);
        });
        AGP.events.on('player:joined', function (payload) {
            var p = payload && payload.player;
            if (!p) return;
            handlePlayerJoinedMidMatch(p);
        });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات مباراة روليت الروسي',
            gameExplanation: 'مسدس بساقية سداسية (6 غرف) — تحدّد عدد الطلقات المحشوّة (1–6) من الإعدادات. ' +
                'تُخلَط الغرف عشوائياً مرة واحدة، ثم يسحب كل لاعب الزناد بدوره بالتتابع على نفسه (بدون إعادة خلط ' +
                'بينهم — نفس الروليت الروسي الحقيقي). كل إصابة تُخرج اللاعب فوراً من المباراة، والاحتمال المعروض ' +
                'قبل كل سحبة يتغيّر فعلياً حسب عدد الطلقات والغرف المتبقية. لما تُستهلك الغرف الست تُعاد الحشوة ' +
                'تلقائياً. تستمر المباراة لين يبقى لاعب واحد — هو الفائز!',
            connectButtonLabel: 'اتصال بالبث وبدء الإعدادات',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../index.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound,
            midMatchToggleButton: {
                icon: '🔫', label: 'سحب تلقائي',
                activeIcon: '⏸️', activeLabel: 'إيقاف التلقائي',
                onToggle: handleAutoPlayToggle
            }
        });
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager &&
        !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
