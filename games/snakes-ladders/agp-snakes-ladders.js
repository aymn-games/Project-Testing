/**
 * AGP SNAKES & LADDERS — "السلم والثعبان" (لعبة أصلية داخل المنصة، ملف
 * Plugin مستقل بنفس نمط games/elimination-roulette).
 *
 * الآلية: لوحة 10×10 (1 → 100، الكأس 🏆 في المربع 100). اللاعبون بترتيب
 * دخولهم للوبي؛ لكل لاعب 15 ثانية بدوره يكتب فيها بشات البث أحد الأوامر:
 * "دور" / "دوران" / "ارم النرد" / "roll" — فيدور النرد ويمشي اللاعب بعدد
 * النقاط، يطلع مع السلم وينزل مع الثعبان. لو ما كتب خلال 15 ثانية يروح
 * عليه الدور. أول من يوصل للكأس (100) يفوز، وتستمر المباراة حتى يكتمل
 * عدد الفائزين المحدَّد بالإعدادات (1 أو 2 أو 3).
 *
 * شاشة الإعدادات، اللوبي، طبقة "جاري الاتصال"، درج الإعدادات وسط المباراة
 * وبطاقة الفوز — كلها منسوخة حرفياً من تنسيق روليت الإقصاء (نفس الـCSS
 * بنفس القيم، بادئة sl- بدل er-)، بدون أي تعديل على الملفات المشتركة.
 *
 * الاعتماديات (بنفس ترتيب index.html القياسي): js/agp-core.js …
 * js/agp-bootstrap.js، ثم js/agp-player-card.js، ثم js/agp-game-shell.js.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'snakes-ladders';
    var GAME_NAME = 'السلم والثعبان';

    var C_ACCENT = '#7c3aed';
    var C_ACCENT2 = '#00c2ff';
    var C_PINK = '#ff4dff';

    // مدة الدور الثابتة (طلب صريح: 15 ثانية لكل لاعب)
    var TURN_SECONDS = 15;

    // أوامر رمي النرد بالشات (بعد التطبيع — راجع normalizeCommand)
    var ROLL_COMMANDS = ['دور', 'دوران', 'ارم النرد', 'roll'];

    var BOARD_SIZE = 100;

    // خريطة السلالم (من → إلى) والثعابين (رأس → ذيل) — ثابتة لكل مباراة.
    var LADDERS = { 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 99 };
    var SNAKES = { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79 };

    // ألوان حلقات اللاعبين على اللوحة (تدور لو زاد العدد)
    var TOKEN_COLORS = ['#ffd400', '#ff4dff', '#00c2ff', '#4ade80', '#ff7a3d', '#b28cf5',
        '#ff6b8a', '#22d3ee', '#facc15', '#a3e635', '#f472b6', '#60a5fa'];

    var STEP_MS = 260;          // مدة خطوة المربع الواحد
    var SLIDE_MS = 900;         // مدة الطلوع مع السلم / النزول مع الثعبان
    var DICE_ROLL_MS = 1000;    // مدة دوران النرد
    var NEXT_TURN_DELAY_MS = 1100;

    /* ======================================================================
     *  0) الصوت — نغمات مولَّدة برمجياً (بدون ملفات صوت خارجية)
     * ==================================================================== */
    var _audioCtx = null;
    function ensureAudioCtx() {
        if (_audioCtx) return _audioCtx;
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try { _audioCtx = new Ctx(); } catch (e) { _audioCtx = null; }
        return _audioCtx;
    }
    function playTone(freq, startOffset, duration, gainScale) {
        var ctx = ensureAudioCtx();
        if (!ctx) return;
        try {
            if (ctx.state === 'suspended') ctx.resume();
            var t0 = ctx.currentTime + (startOffset || 0);
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t0);
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(0.18 * (gainScale || 1), t0 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + duration + 0.05);
        } catch (e) { /* الصوت طبقة تحسين فقط */ }
    }
    function playSound(name) {
        if (name === 'dice') {
            for (var i = 0; i < 6; i++) playTone(420 + Math.random() * 260, i * 0.12, 0.07, 0.6);
        } else if (name === 'step') {
            playTone(660, 0, 0.06, 0.45);
        } else if (name === 'ladder') {
            [523, 659, 784, 1047].forEach(function (f, i) { playTone(f, i * 0.1, 0.16); });
        } else if (name === 'snake') {
            [620, 480, 360, 240].forEach(function (f, i) { playTone(f, i * 0.12, 0.2); });
        } else if (name === 'warning') {
            playTone(880, 0, 0.08, 0.5);
        } else if (name === 'win') {
            [523, 659, 784, 1047, 1319].forEach(function (f, i) { playTone(f, i * 0.13, 0.3); });
        }
    }

    /* ======================================================================
     *  1) حالة المباراة الداخلية
     * ==================================================================== */
    var _settings = null;
    var _startedAt = null;
    var _matchActive = false;
    var _roster = [];            // كل لاعبي المباراة بترتيب الدخول (لإعادة المباراة بنفس اللاعبين)
    var _order = [];             // اللاعبون اللي لسا يلعبون (بدون الفائزين)
    var _positions = {};         // playerId -> رقم المربع (0 = لسا ما بدأ)
    var _colors = {};            // playerId -> لون الحلقة
    var _winners = [];           // بترتيب الوصول للكأس
    var _turnIdx = 0;
    var _awaitingRoll = false;
    var _busy = false;           // النرد يدور / اللاعب يمشي
    var _turnInterval = null;
    var _turnRemaining = 0;
    var _pendingTimeouts = [];
    var _commentUnsub = null;

    function resetMatchState() {
        _settings = null;
        _startedAt = null;
        _matchActive = false;
        _roster = [];
        _order = [];
        _positions = {};
        _colors = {};
        _winners = [];
        _turnIdx = 0;
        _awaitingRoll = false;
        _busy = false;
        stopTurnTimer();
        clearPendingTimeouts();
        unwireCommentListener();
    }

    function later(fn, ms) {
        var id = window.setTimeout(function () {
            _pendingTimeouts = _pendingTimeouts.filter(function (x) { return x !== id; });
            fn();
        }, ms);
        _pendingTimeouts.push(id);
        return id;
    }
    function clearPendingTimeouts() {
        _pendingTimeouts.forEach(function (id) { window.clearTimeout(id); });
        _pendingTimeouts = [];
    }

    function liveSettings() {
        return (AGP.gameShell && typeof AGP.gameShell.getSettings === 'function') ? AGP.gameShell.getSettings() : (_settings || {});
    }

    /* ======================================================================
     *  2) أدوات DOM صغيرة
     * ==================================================================== */
    function el(id) { return document.getElementById(id); }
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }
    function escapeForInlineOnerrorJs(text) {
        return escapeHtml(text)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '&quot;');
    }
    function playerLabel(p) { return (p && (p.name || p.id)) || '—'; }

    // نفس دالة روليت الإقصاء — اليوزر الحقيقي (uniqueId) من player.id
    // وليس الاسم المعروض، لمطابقة نظام النقاط الصحيحة.
    function tiktokUsernameFor(player) {
        var id = (player && player.id) || '';
        if (id.indexOf('tiktok:') === 0) return id.slice('tiktok:'.length);
        return (player && (player.name || player.id)) || '';
    }

    function ringAvatarHtml(player) {
        var name = playerLabel(player);
        var avatarUrl = player && player.avatarUrl;
        var initials = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        return avatarUrl
            ? '<img class="sl-ring-avatar" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;sl-ring-avatar sl-ring-avatar--fallback&quot;>' + escapeForInlineOnerrorJs(initials) + '</div>\';">'
            : '<div class="sl-ring-avatar sl-ring-avatar--fallback">' + escapeHtml(initials) + '</div>';
    }

    // تطبيع أمر الشات: حروف صغيرة، توحيد الألف، حذف التشكيل والتطويل
    // وعلامات الترقيم بالأطراف، ودمج المسافات.
    function normalizeCommand(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/[ً-ْـ]/g, '')
            .replace(/[أإآ]/g, 'ا')
            .replace(/[!?.,،؟…\s]+$/g, '')
            .replace(/^[!?.,،؟…\s]+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    function isRollCommand(text) {
        return ROLL_COMMANDS.indexOf(normalizeCommand(text)) !== -1;
    }

    function ensureZainFont() {
        if (el('sl-zain-font-link')) return;
        var sheet = document.createElement('link');
        sheet.id = 'sl-zain-font-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Zain:ital,wght@0,200;0,300;0,400;0,700;0,800;0,900;1,300;1,400&display=swap';
        document.head.appendChild(sheet);
    }
    function ensureDesignFonts() {
        if (el('sl-design-fonts-link')) return;
        var sheet = document.createElement('link');
        sheet.id = 'sl-design-fonts-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;500;600;700&family=Cairo:wght@600;700;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap';
        document.head.appendChild(sheet);
    }

    /* ======================================================================
     *  3) الأنماط
     * ==================================================================== */
    function injectStageStyles() {
        if (el('sl-stage-styles')) return;
        ensureZainFont();
        ensureDesignFonts();
        var style = document.createElement('style');
        style.id = 'sl-stage-styles';
        style.textContent = [
            ':root{--sl-accent:' + C_ACCENT + ';--sl-accent2:' + C_ACCENT2 + ';--sl-pink:' + C_PINK + ';}',
            'html,body{margin:0 !important;padding:0 !important;}',

            /* ---- شاشة اللعب ---- */
            '#sl-stage{position:fixed;inset:0;padding:78px 18px 20px;box-sizing:border-box;display:flex;',
            'flex-direction:row;align-items:flex-start;justify-content:center;gap:22px;overflow-y:auto;',
            'direction:rtl;color:#f3eefc;font-family:Cairo,sans-serif;',
            'background:',
            'radial-gradient(60% 45% at 18% 8%,rgba(122,63,212,.22),transparent 70%),',
            'radial-gradient(50% 40% at 88% 40%,rgba(214,168,60,.10),transparent 72%),',
            'radial-gradient(55% 45% at 40% 104%,rgba(48,26,104,.26),transparent 74%),',
            'linear-gradient(180deg,#0d0a14 0%,#08060d 45%,#050508 100%);}',

            /* اللوحة */
            '#sl-board-col{display:flex;flex-direction:column;align-items:center;gap:12px;flex:0 0 auto;}',
            '#sl-board-wrap{position:relative;width:min(calc(100vh - 170px),58vw,820px);min-width:300px;aspect-ratio:1;',
            'direction:ltr;border-radius:22px;padding:10px;box-sizing:border-box;',
            'background:linear-gradient(180deg,rgba(28,24,44,.95),rgba(14,12,22,.95));',
            'border:1px solid rgba(178,140,245,.35);',
            'box-shadow:0 30px 70px -30px rgba(0,0,0,.9),0 0 0 6px #12101d,0 0 0 8px rgba(178,140,245,.25);}',
            '#sl-board{position:relative;width:100%;height:100%;display:grid;',
            'grid-template-columns:repeat(10,1fr);grid-template-rows:repeat(10,1fr);',
            'border-radius:14px;overflow:hidden;}',
            '.sl-cell{position:relative;display:flex;align-items:flex-start;justify-content:flex-start;',
            'padding:4px 6px;box-sizing:border-box;font-family:"Noto Kufi Arabic",sans-serif;',
            'font-size:clamp(9px,1.05vw,14px);font-weight:700;color:rgba(255,255,255,.7);}',
            '.sl-cell.sl-cell-a{background:#2a1f47;}',
            '.sl-cell.sl-cell-b{background:#3b2a63;}',
            '.sl-cell.sl-cell-ladder{background:linear-gradient(135deg,#3b2a63,#4a3a1a);}',
            '.sl-cell.sl-cell-snake{background:linear-gradient(135deg,#2a1f47,#4a1830);}',
            '.sl-cell.sl-cell-goal{background:radial-gradient(circle at 50% 55%,rgba(240,205,106,.45),#5a3f10 75%);',
            'color:#fff3c4;}',
            '.sl-cell-trophy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
            'font-size:clamp(20px,3.4vw,46px);filter:drop-shadow(0 0 10px rgba(240,205,106,.9));',
            'animation:sl-trophy-glow 2.2s ease-in-out infinite;}',
            '@keyframes sl-trophy-glow{0%,100%{transform:scale(1);}50%{transform:scale(1.1);}}',
            '#sl-board-svg{position:absolute;inset:10px;width:calc(100% - 20px);height:calc(100% - 20px);',
            'pointer-events:none;z-index:2;overflow:visible;}',
            '#sl-tokens{position:absolute;inset:10px;pointer-events:none;z-index:3;}',
            '.sl-token{position:absolute;width:6.6%;aspect-ratio:1;border-radius:50%;',
            'transform:translate(-50%,-50%);border:3px solid var(--tc,#ffd400);box-sizing:border-box;',
            'background:#2c1240;box-shadow:0 4px 10px rgba(0,0,0,.6);overflow:hidden;',
            'transition:left .24s ease,top .24s ease;}',
            '.sl-token.sl-token-slide{transition:left .9s cubic-bezier(.45,.05,.3,1),top .9s cubic-bezier(.45,.05,.3,1);}',
            '.sl-token.sl-token-active{z-index:5;width:8.2%;box-shadow:0 0 0 3px rgba(255,255,255,.85),0 0 22px var(--tc,#ffd400);}',
            '.sl-token .sl-ring-avatar--fallback{font-size:clamp(8px,1vw,13px);}',

            /* صف البداية (لاعبين ما بدؤوا بعد — مربع 0) */
            '#sl-start-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;',
            'min-height:44px;padding:6px 16px;border-radius:999px;border:1px dashed rgba(178,140,245,.35);',
            'background:rgba(255,255,255,.03);font-family:"IBM Plex Sans Arabic",sans-serif;font-size:13px;color:#a79fbb;}',
            '#sl-start-row .sl-start-av{width:32px;height:32px;border-radius:50%;overflow:hidden;',
            'border:2px solid var(--tc,#ffd400);box-sizing:border-box;}',

            /* اللوحة الجانبية */
            '#sl-side{flex:0 1 380px;min-width:280px;display:flex;flex-direction:column;gap:14px;}',
            '.sl-panel{border-radius:20px;border:1px solid rgba(255,255,255,.09);',
            'background:linear-gradient(180deg,rgba(28,24,44,.9),rgba(14,12,22,.9));padding:16px 18px;box-sizing:border-box;}',
            '#sl-turn-card{text-align:center;border-color:rgba(178,140,245,.35);}',
            '.sl-turn-title{font-family:"Noto Kufi Arabic",sans-serif;font-size:13px;color:#a79fbb;margin:0 0 10px;}',
            '.sl-turn-player{display:flex;flex-direction:column;align-items:center;gap:8px;}',
            '.sl-turn-avatar{width:84px;height:84px;border-radius:50%;overflow:hidden;',
            'border:3px solid var(--tc,#b28cf5);box-shadow:0 0 24px var(--tc,#b28cf5);}',
            '.sl-turn-name{font-family:"Cairo",sans-serif;font-size:22px;font-weight:800;color:#fff;',
            'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '.sl-turn-pos{font-family:"IBM Plex Sans Arabic",sans-serif;font-size:13px;color:#cfc7e2;}',
            '.sl-turn-hint{margin-top:12px;font-family:"IBM Plex Sans Arabic",sans-serif;font-size:13.5px;',
            'color:#f0e9ff;line-height:1.9;}',
            '.sl-cmd{display:inline-block;margin:2px 3px;padding:2px 12px;border-radius:999px;',
            'background:rgba(214,168,60,.12);border:1px solid rgba(240,205,106,.4);color:#f0cd6a;',
            'font-family:"Cairo",sans-serif;font-weight:800;font-size:14px;}',
            '#sl-timer{margin:14px auto 0;width:74px;height:74px;border-radius:50%;display:flex;',
            'align-items:center;justify-content:center;font-family:"Cairo",sans-serif;font-weight:900;',
            'font-size:28px;color:#fff;background:conic-gradient(#7a3fd4 var(--p,100%),rgba(255,255,255,.08) 0);',
            'position:relative;}',
            '#sl-timer::before{content:"";position:absolute;inset:6px;border-radius:50%;background:#14121f;}',
            '#sl-timer span{position:relative;}',
            '#sl-timer.sl-timer-warn{background:conic-gradient(#e0736f var(--p,100%),rgba(255,255,255,.08) 0);}',
            '#sl-timer.sl-timer-warn span{color:#ff9b96;}',
            '#sl-timer.sl-timer-idle{opacity:.35;}',

            /* النرد */
            '#sl-dice-row{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:14px;}',
            '#sl-dice{width:78px;height:78px;border-radius:18px;background:linear-gradient(145deg,#ffffff,#e4dcf5);',
            'box-shadow:0 10px 24px -8px rgba(0,0,0,.8),inset 0 -4px 0 rgba(0,0,0,.12);display:grid;',
            'grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:10px;box-sizing:border-box;gap:2px;}',
            '#sl-dice.sl-dice-rolling{animation:sl-dice-shake .18s linear infinite;}',
            '@keyframes sl-dice-shake{0%{transform:rotate(0) scale(1);}25%{transform:rotate(14deg) scale(1.06);}',
            '50%{transform:rotate(0) scale(1);}75%{transform:rotate(-14deg) scale(1.06);}100%{transform:rotate(0) scale(1);}}',
            '.sl-pip{width:78%;height:78%;margin:auto;border-radius:50%;background:transparent;}',
            '.sl-pip.on{background:#2b1a4d;box-shadow:inset 0 2px 2px rgba(0,0,0,.45);}',
            '#sl-dice-result{font-family:"Cairo",sans-serif;font-size:15px;font-weight:700;color:#cfc7e2;min-width:90px;}',

            /* ترتيب اللاعبين */
            '#sl-standings h3{margin:0 0 10px;font-family:"Noto Kufi Arabic",sans-serif;font-size:14px;',
            'font-weight:700;color:#f4f2fb;}',
            '#sl-standings-list{display:flex;flex-direction:column;gap:6px;max-height:min(40vh,380px);',
            'overflow-y:auto;scrollbar-width:none;}',
            '#sl-standings-list::-webkit-scrollbar{display:none;}',
            '.sl-srow{display:flex;align-items:center;gap:9px;padding:7px 11px;border-radius:12px;',
            'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);}',
            '.sl-srow.sl-srow-turn{border-color:rgba(178,140,245,.6);background:rgba(122,63,212,.18);}',
            '.sl-srow.sl-srow-won{border-color:rgba(240,205,106,.45);background:rgba(214,168,60,.10);}',
            '.sl-srow-av{width:30px;height:30px;border-radius:50%;overflow:hidden;flex:none;',
            'border:2px solid var(--tc,#ffd400);box-sizing:border-box;}',
            '.sl-srow-name{flex:1;min-width:0;font-family:"IBM Plex Sans Arabic",sans-serif;font-size:13px;',
            'color:#e7e9ee;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '.sl-srow-pos{flex:none;font-family:"Cairo",sans-serif;font-weight:800;font-size:13px;color:#f0cd6a;',
            'min-width:34px;text-align:center;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.06);}',

            /* إعلان سريع فوق اللوحة (سلم/ثعبان/فوز) */
            '#sl-banner{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.8);z-index:8;',
            'padding:14px 26px;border-radius:20px;font-family:"Cairo",sans-serif;font-weight:900;font-size:clamp(18px,2.4vw,30px);',
            'color:#fff;background:rgba(13,11,22,.92);border:2px solid rgba(178,140,245,.6);white-space:nowrap;',
            'opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;direction:rtl;',
            'box-shadow:0 20px 50px -20px rgba(0,0,0,1);}',
            '#sl-banner.show{opacity:1;transform:translate(-50%,-50%) scale(1);}',
            '#sl-banner.sl-banner-ladder{border-color:#f0cd6a;color:#fff3c4;}',
            '#sl-banner.sl-banner-snake{border-color:#e0736f;color:#ffd1cf;}',
            '#sl-banner.sl-banner-win{border-color:#f0cd6a;color:#f0cd6a;}',

            '@media (max-width:900px){',
            '#sl-stage{flex-direction:column;align-items:center;}',
            '#sl-board-wrap{width:min(94vw,calc(100vh - 170px));}',
            '#sl-board-col{order:-1;}',
            '#sl-side{flex:none;width:min(94vw,520px);}}',

            /* ---- نافذة بطاقة الفوز (نفس #er-modal-overlay/#er-modal-box) ---- */
            '#sl-modal-overlay{position:fixed;inset:0;z-index:99990;display:none;flex-direction:column;',
            'align-items:center;justify-content:center;gap:18px;padding:16px;background:rgba(8,4,16,0.72);}',
            '#sl-modal-box{width:1300px;max-width:97vw;height:auto;max-height:800px;max-height:min(800px,94vh);overflow-y:auto;box-sizing:border-box;',
            'background:linear-gradient(180deg,#5F3976,#211528);border:2px solid var(--sl-accent);border-radius:20px;',
            'padding:28px 32px;color:#fff;box-shadow:0 0 50px rgba(124,58,237,0.55);}',
            '@keyframes sl-select-fadein{from{opacity:0}to{opacity:1}}',
            '.sl-trophy-third{--agp-trophy-accent:#7de0ff;--agp-trophy-accent-dark:#0e8fb8;',
            '--agp-trophy-border:rgba(125,224,255,.55);--agp-trophy-divider:rgba(125,224,255,.25);',
            '--agp-trophy-label:rgba(125,224,255,.75);--agp-trophy-bg1:rgba(16,28,44,.72);',
            '--agp-trophy-bg2:rgba(10,16,24,.82);}',
            '#sl-home-btn{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.25);color:#f3eefc;}',
            '.agp-field-desc{font-size:11.5px !important;font-weight:400 !important;color:#8f88a3 !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;white-space:normal !important;text-align:right;}',

            '#agp-shell-overlay,#agp-shell-overlay *,#sl-stage,#sl-stage *,',
            '#sl-modal-overlay,#sl-modal-overlay *,#sl-toast-wrap,#sl-toast-wrap *,',
            '#sl-event-log,#sl-event-log *{font-family:"Zain",Cairo,sans-serif !important;}',
            '#sl-toast-wrap{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100020;',
            'display:flex;flex-direction:column;gap:8px;align-items:center;}',
            '.sl-toast{background:rgba(20,8,35,0.92);border:1px solid rgba(124,58,237,0.55);color:#f3eefc;',
            'padding:10px 18px;border-radius:999px;font-size:0.85em;font-weight:700;box-shadow:0 6px 16px rgba(0,0,0,0.35);}',
            '#sl-modal-overlay.sl-winner-backdrop{background:rgba(8,4,16,0.38);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}',
            '#sl-modal-box.sl-winner-panel{background:none;border:none;box-shadow:none;',
            'padding:0;width:auto;max-width:100%;overflow:visible;}',
            '#sl-winner-box{text-align:center;}',
            '#sl-winner-box h2{font-family:Almarai,Cairo,sans-serif;font-size:1.6em;color:#fff;',
            'text-shadow:0 2px 12px rgba(0,0,0,0.65);}',
            '.sl-trophy-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:14px 0 18px;}',
            '.sl-ring-avatar{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#5a2585;display:block;}',
            '.sl-ring-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1.4em;}',
            '.sl-trophy-winner{--agp-trophy-accent:#b28cf5;--agp-trophy-accent-dark:#7c3aed;',
            '--agp-trophy-border:rgba(178,140,245,.55);--agp-trophy-divider:rgba(178,140,245,.25);',
            '--agp-trophy-label:rgba(178,140,245,.75);--agp-trophy-bg1:rgba(28,20,44,.72);',
            '--agp-trophy-bg2:rgba(14,10,24,.82);}',
            '.sl-trophy-most{--agp-trophy-accent:#ff8ef5;--agp-trophy-accent-dark:#a83fa8;',
            '--agp-trophy-border:rgba(255,142,245,.55);--agp-trophy-divider:rgba(255,142,245,.25);',
            '--agp-trophy-label:rgba(255,142,245,.75);--agp-trophy-bg1:rgba(35,18,44,.72);',
            '--agp-trophy-bg2:rgba(18,10,24,.82);}',
            '.sl-winner-actions{display:flex;gap:10px;flex-wrap:wrap;}',
            '.sl-btn-secondary{flex:1;min-width:180px;padding:12px;border-radius:999px;border:none;',
            'font-weight:800;cursor:pointer;font-family:inherit;font-size:0.95em;}',
            '#sl-replay-same-btn{background:linear-gradient(90deg,var(--sl-accent2),var(--sl-accent));color:#0b0616;}',
            '#sl-new-match-btn{background:#fff;border:1px solid var(--sl-accent);color:#5a2585;}',
            '.sl-confetti-piece{position:absolute;top:50%;left:50%;width:8px;height:8px;border-radius:2px;',
            'pointer-events:none;opacity:0;animation:sl-confetti-burst 1.4s ease-out forwards;}',
            '@keyframes sl-confetti-burst{0%{opacity:1;transform:translate(-50%,-50%) translate(0,0) rotate(0deg);}',
            '100%{opacity:0;transform:translate(-50%,-50%) translate(var(--dx),var(--dy)) rotate(540deg);}}',
            '#agp-shell-box:not(.sl-settings-initial-box){background:linear-gradient(180deg,#5F3976,#211528) !important;}',
            '#agp-shell-overlay:has(#agp-shell-box.agp-lobby-box){padding:0 !important;',
            'overflow-y:auto !important;',
            'background:',
            'radial-gradient(60% 45% at 18% 8%,rgba(122,63,212,.22),transparent 70%),',
            'radial-gradient(50% 40% at 88% 40%,rgba(214,168,60,.14),transparent 72%),',
            'radial-gradient(55% 45% at 40% 104%,rgba(48,26,104,.26),transparent 74%),',
            'linear-gradient(180deg,#0d0a14 0%,#08060d 45%,#050508 100%) !important;}',
            '#agp-shell-box.agp-lobby-box{background:none !important;border:none !important;',
            'box-shadow:none !important;position:relative;overflow:hidden;}',
            '#agp-settings-close-btn{color:#ffffff !important;font-weight:900 !important;',
            'text-shadow:0 1px 4px rgba(0,0,0,0.5) !important;}',
            '#agp-shell-box.agp-lobby-box{width:min(94vw,1310px) !important;',
            'max-width:min(94vw,1310px) !important;height:min(94vh,980px) !important;max-height:94vh !important;',
            'height:min(94dvh,980px) !important;max-height:94dvh !important;',
            'display:flex !important;flex-direction:column !important;overflow:hidden !important;}',
            '#agp-shell-box.agp-lobby-box > h2,',
            '#agp-shell-box.agp-lobby-box > .agp-join-hint,',
            '#agp-shell-box.agp-lobby-box > #agp-entrance-stage,',
            '#agp-shell-box.agp-lobby-box > #agp-entrance-settled-list{flex:0 0 auto !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{flex:1 1 auto !important;',
            'min-height:0 !important;overflow-y:auto !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{scrollbar-width:none !important;',
            '-ms-overflow-style:none !important;padding-top:12px !important;',
            'padding-bottom:calc(var(--sl-actions-h,62px) + 16px) !important;',
            'margin-bottom:calc(-1 * var(--sl-actions-h,62px)) !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list::-webkit-scrollbar{display:none !important;}',
            '#sl-lobby-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
            'width:55%;max-width:420px;opacity:0.25;pointer-events:none;z-index:0;}',
            '#agp-shell-box.agp-lobby-box > *:not(#sl-lobby-watermark){position:relative;z-index:1;}',
            '#agp-shell-box.agp-lobby-box h2{text-shadow:none !important;letter-spacing:0 !important;',
            'font-family:"Cairo",sans-serif !important;font-weight:800 !important;font-size:44px !important;',
            'color:#fff !important;line-height:1.3 !important;margin:0 0 6px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint{display:flex !important;flex-wrap:wrap !important;',
            'justify-content:center !important;align-items:center !important;gap:56px !important;',
            'width:100% !important;margin-bottom:22px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint-text{display:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge{order:0;display:inline-flex !important;',
            'align-items:center !important;gap:14px !important;background:none !important;',
            'border:none !important;padding:0 !important;font-family:"Cairo",sans-serif !important;',
            'font-size:44px !important;font-weight:800 !important;line-height:1.2 !important;',
            'color:#E2C700 !important;box-shadow:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge::before{content:"للدخول اكتب في شات البث";',
            'font-family:"Cairo",sans-serif;font-size:22px;font-weight:700;color:#fff;white-space:nowrap;}',
            '#agp-shell-box.agp-lobby-box #agp-lobby-count{position:static !important;order:1 !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge{display:inline-flex !important;',
            'align-items:center !important;justify-content:center !important;width:157px !important;',
            'height:52px !important;box-sizing:border-box !important;padding:0 !important;',
            'background:rgba(217,217,217,.1) !important;border:4px solid #000 !important;',
            'border-radius:26px !important;font-family:"Cairo",sans-serif !important;direction:ltr !important;',
            'font-size:28px !important;font-weight:800 !important;color:#fff !important;',
            'box-shadow:none !important;}',
            '@media (max-width:600px){',
            '#agp-shell-box.agp-lobby-box h2{font-size:26px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint{gap:12px 24px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge{font-size:30px !important;gap:10px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge::before{font-size:16px;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge{width:120px !important;height:44px !important;',
            'font-size:22px !important;border-width:3px !important;}}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{display:grid !important;',
            'grid-template-columns:repeat(auto-fill,217px) !important;column-gap:37px !important;',
            'row-gap:20px !important;justify-content:center !important;',
            'justify-items:center !important;align-items:end !important;align-content:start !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard{width:217px !important;height:57px !important;',
            'box-sizing:border-box !important;padding:0 3px 0 28px !important;gap:6px !important;',
            'border-radius:24px !important;background:rgba(217,217,217,.3) !important;',
            'border:2px solid #000 !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-avatar-basic{width:48px !important;height:48px !important;',
            'background:#D9D9D9 !important;border:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-name-basic{flex:1 1 auto !important;width:auto !important;',
            'min-width:0 !important;height:auto !important;margin:0 !important;padding:0 !important;',
            'font-size:20px !important;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'font-weight:700 !important;color:#fff !important;background:none !important;border:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-avatar-basic--fallback{font-size:15px !important;color:#3a2f4a !important;}',
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard) .agp-player-remove-btn{',
            'top:50% !important;left:7px !important;right:auto !important;transform:translateY(-50%);',
            'width:16px !important;height:16px !important;font-size:9px !important;z-index:5;}',
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard-tpl){width:217px !important;height:57px !important;',
            'overflow:visible !important;display:flex !important;',
            'flex-direction:row !important;align-items:center !important;justify-content:center !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-tpl{zoom:0.7282;flex-shrink:0 !important;}',
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard-tpl) .agp-player-remove-btn{',
            'top:50% !important;left:7px !important;right:auto !important;transform:translateY(-50%);',
            'width:16px !important;height:16px !important;font-size:9px !important;z-index:5;}',
            '#agp-shell-box.agp-lobby-box .agp-player-remove-btn{',
            'background:rgba(224,115,111,.18) !important;border-color:rgba(224,115,111,.55) !important;',
            'color:#e0736f !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-remove-btn:hover{',
            'background:rgba(224,115,111,.3) !important;color:#ff9b96 !important;}',
            '#agp-shell-box.agp-lobby-box .sl-lobby-actions-row{flex:0 0 auto !important;',
            'display:flex;gap:14px;margin-top:14px;justify-content:center;',
            'flex-wrap:wrap;position:relative;z-index:3 !important;}',
            '.sl-lobby-actions-row > *{width:360px !important;height:48px !important;',
            'max-width:360px !important;flex:0 0 360px !important;box-sizing:border-box !important;',
            'display:flex !important;align-items:center !important;justify-content:center !important;',
            'padding:0 14px !important;margin:0 !important;}',
            '#agp-shell-box.agp-lobby-box .sl-lobby-actions-row #agp-start-round-btn{',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;',
            'box-shadow:0 22px 46px -24px rgba(122,63,212,1) !important;transition:background .25s !important;}',
            '#agp-shell-box.agp-lobby-box .sl-lobby-actions-row #agp-start-round-btn:hover{',
            'background:#9a6cf0 !important;}',
            '.sl-back-to-platform-btn{display:block;margin:14px auto 0;padding:10px 22px;',
            'border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.08);',
            'color:#f3eefc;font-family:inherit;font-weight:800;font-size:0.9em;cursor:pointer;',
            'transition:background 0.15s;}',
            '.sl-back-to-platform-btn:hover{background:rgba(255,255,255,0.18);}',
            '#agp-shell-overlay:has(.sl-settings-initial-box){padding:0 !important;',
            'align-items:flex-start !important;justify-content:center !important;overflow-y:auto !important;',
            'background:',
            'radial-gradient(60% 45% at 18% 8%,rgba(122,63,212,.22),transparent 70%),',
            'radial-gradient(50% 40% at 88% 40%,rgba(70,40,150,.22),transparent 72%),',
            'radial-gradient(55% 45% at 40% 104%,rgba(48,26,104,.26),transparent 74%),',
            'linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),',
            'linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px),',
            'linear-gradient(180deg,#0d0a14 0%,#08060d 45%,#050508 100%) !important;',
            'background-size:auto,auto,auto,88px 88px,88px 88px,auto !important;}',
            '.sl-settings-initial-box{width:min(1040px,94vw) !important;',
            'max-width:min(1040px,94vw) !important;height:calc(100vh - 70px) !important;',
            'height:calc(100dvh - 70px) !important;',
            'max-height:calc(100vh - 70px) !important;max-height:calc(100dvh - 70px) !important;',
            'margin:70px 0 0 !important;overflow:visible !important;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;',
            'column-count:auto !important;column-gap:0 !important;',
            'background:none !important;border:none !important;border-radius:0 !important;',
            'box-shadow:none !important;padding:16px 4px 0 !important;box-sizing:border-box !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '.sl-settings-initial-box *{font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '.sl-settings-initial-box > h2{flex:0 0 auto !important;margin:0 0 4px !important;',
            'max-width:none !important;width:100% !important;font-size:clamp(24px,3.6vw,40px) !important;',
            'font-weight:900 !important;line-height:1.4 !important;text-align:center !important;',
            'padding:0 !important;border-bottom:none !important;position:static;',
            'font-family:"Cairo",sans-serif !important;',
            'background:linear-gradient(90deg,#b28cf5,#f0cd6a,#d9a0f0,#b28cf5) !important;',
            'background-size:200% 100% !important;-webkit-background-clip:text !important;',
            'background-clip:text !important;-webkit-text-fill-color:transparent !important;',
            'animation:sl-settings-wave 9s linear infinite !important;}',
            '.sl-settings-initial-box > h2::after{content:none !important;}',
            '@keyframes sl-settings-wave{0%{background-position:0% 50%}100%{background-position:200% 50%}}',
            '.sl-settings-initial-box .agp-shell-btn-connect:disabled{opacity:.45 !important;',
            'cursor:not-allowed !important;transform:none !important;}',
            '.sl-settings-initial-box .sl-settings-scroll{position:relative;',
            'flex:1 1 auto;min-height:0;width:100%;margin-top:18px;}',
            '.sl-settings-initial-box .sl-settings-scroll-inner{box-sizing:border-box;',
            'height:100%;overflow-y:auto;display:flex;flex-direction:column;gap:16px;',
            'padding:0 2px 26px;scrollbar-width:none;}',
            '.sl-settings-initial-box .sl-settings-scroll-inner::-webkit-scrollbar{',
            'display:none;}',
            '.sl-settings-initial-box .sl-settings-fade{position:absolute;inset:auto 0 0;',
            'height:44px;background:linear-gradient(transparent,#08060d);pointer-events:none;}',
            '.sl-settings-initial-box .sl-settings-glowline{position:absolute;inset:auto 0 0;',
            'height:1px;background:linear-gradient(90deg,transparent,rgba(178,140,245,.55),transparent);',
            'pointer-events:none;}',
            '.sl-settings-initial-box .agp-shell-field,',
            '.sl-settings-initial-box .agp-shell-row{border-bottom:none !important;',
            'padding:2px 0 !important;max-width:none !important;margin:0 !important;display:flex !important;',
            'justify-content:space-between !important;align-items:center !important;width:100% !important;',
            'flex-wrap:wrap !important;gap:12px !important;}',
            '.sl-settings-initial-box .agp-shell-field{flex-direction:column !important;',
            'align-items:flex-start !important;}',
            '.sl-settings-initial-box .agp-shell-field label,',
            '.sl-settings-initial-box .agp-shell-row-label{font-size:16px !important;',
            'font-weight:600 !important;color:#f4f2fb !important;text-align:right !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;display:flex !important;',
            'flex-direction:column !important;align-items:flex-end !important;gap:3px !important;}',
            '.sl-settings-initial-box .agp-shell-field input[type=text]{',
            'max-width:none !important;width:100% !important;background:rgba(255,255,255,.04) !important;',
            'border:1px solid rgba(255,255,255,.14) !important;border-radius:999px !important;',
            'padding:13px 18px !important;font-size:15px !important;font-weight:400 !important;',
            'text-align:center !important;transition:border-color .25s !important;color:#f4f2fb !important;',
            'box-sizing:border-box !important;}',
            '.sl-settings-initial-box .agp-shell-field input[type=text]:focus,',
            '.sl-settings-initial-box .agp-shell-field input[type=text]:not(:placeholder-shown){',
            'border-color:rgba(178,140,245,.6) !important;outline:none !important;}',
            '.sl-settings-initial-box .agp-pill-group{gap:8px !important;padding:4px !important;',
            'border-radius:999px !important;',
            'background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02)) !important;',
            'border:1px solid rgba(255,255,255,.12) !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 3px 10px -6px rgba(0,0,0,.6) !important;}',
            '.sl-settings-initial-box .agp-pill-btn{background:transparent !important;',
            'border:none !important;color:#a79fbb !important;padding:10px 16px !important;',
            'border-radius:999px !important;font-size:13.5px !important;font-weight:600 !important;',
            'transition:.25s !important;white-space:nowrap;}',
            '.sl-settings-initial-box .agp-pill-btn.agp-pill-active{',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.3) inset,0 4px 10px -4px rgba(122,63,212,.7) !important;}',
            '.sl-settings-initial-box .agp-shell-counter-row button{display:none !important;}',
            '.sl-settings-initial-box .agp-shell-counter-row{justify-content:flex-end !important;',
            'flex:1;max-width:220px;}',
            '.sl-settings-initial-box .agp-count-input{',
            'background:rgba(255,255,255,.04) !important;border:1px solid rgba(255,255,255,.14) !important;',
            'border-radius:999px !important;padding:13px 18px !important;width:100% !important;',
            'height:auto !important;color:#f4f2fb !important;font-size:15px !important;',
            'font-weight:400 !important;outline:none !important;text-align:center !important;',
            'box-sizing:border-box !important;}',
            '.sl-settings-initial-box .agp-count-input:focus{',
            'border-color:rgba(178,140,245,.55) !important;}',
            '.sl-settings-initial-box .sl-settings-card{width:100%;',
            'padding:16px 18px;border-radius:20px;border:1px solid rgba(255,255,255,.09);',
            'background:rgba(255,255,255,.03);box-sizing:border-box;display:flex;',
            'flex-direction:column;gap:12px;}',
            '.sl-settings-initial-box .sl-settings-card > .agp-shell-row,',
            '.sl-settings-initial-box .sl-settings-card > .agp-shell-field{padding:0 !important;}',
            '.sl-settings-initial-box .sl-conditional-section{display:flex !important;',
            'flex-direction:column !important;gap:14px !important;margin-top:4px !important;',
            'padding-top:16px !important;border-top:1px solid rgba(255,255,255,.07) !important;',
            'border-right:none !important;padding-right:0 !important;}',
            '.sl-settings-initial-box .sl-conditional-section .agp-shell-row{',
            'border-bottom:none !important;padding:0 !important;}',
            '.sl-settings-initial-box .sl-field-note{color:#8f88a3 !important;',
            'text-align:right !important;}',
            '.sl-settings-initial-box .sl-settings-footer{flex:0 0 auto !important;',
            'width:100% !important;display:flex !important;flex-wrap:wrap !important;',
            'align-items:center !important;justify-content:center !important;',
            'gap:clamp(16px,3vw,36px) !important;padding:20px 0 26px !important;}',
            '.sl-settings-initial-box .agp-shell-btn-connect{',
            'order:1;column-span:none !important;display:inline-flex !important;',
            'align-items:center !important;justify-content:center !important;width:auto !important;',
            'max-width:none !important;margin:0 !important;padding:16px 42px !important;',
            'background:#7a3fd4 !important;color:#f3ecff !important;font-weight:700 !important;',
            'font-size:clamp(15px,1.8vw,17px) !important;border-radius:999px !important;',
            'letter-spacing:0.4px;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.25) inset,0 22px 46px -24px rgba(122,63,212,1) !important;',
            'transition:background .25s,transform .25s !important;}',
            '.sl-settings-initial-box .agp-shell-btn-connect:hover{',
            'background:#9a6cf0 !important;transform:translateY(-2px);}',
            '.sl-settings-initial-box .sl-back-to-platform-btn{',
            'order:2;column-span:none !important;display:inline-flex !important;',
            'align-items:center !important;width:auto !important;margin:0 !important;padding:0 !important;',
            'border:none !important;background:transparent !important;font-size:14px !important;',
            'font-weight:400 !important;color:#a79fbb !important;transition:color .25s !important;}',
            '.sl-settings-initial-box .sl-back-to-platform-btn:hover{',
            'color:#d3bcff !important;background:transparent !important;}',
            '#agp-shell-box.agp-connecting-box,#agp-shell-box.agp-conn-error{visibility:hidden !important;}',
            '#sl-conn-layer{position:fixed;inset:0;z-index:100010;display:none;',
            'align-items:center;justify-content:center;}',
            '#sl-conn-layer.show{display:flex;}',
            '#sl-conn-layer .sl-conn-backdrop{position:absolute;inset:0;overflow:hidden;',
            'filter:blur(6px) brightness(0.55);pointer-events:none;}',
            '#sl-conn-layer .sl-conn-backdrop > *{pointer-events:none !important;}',
            '#sl-conn-layer .sl-conn-modal{position:relative;z-index:1;width:min(360px,90vw);',
            'background:linear-gradient(180deg,rgba(30,24,52,.98),rgba(11,10,18,.99));',
            'border:1px solid rgba(178,140,245,.32);border-radius:24px;',
            'padding:32px 26px;text-align:center;box-shadow:0 40px 90px -46px rgba(0,0,0,1);',
            'font-family:"Noto Kufi Arabic",sans-serif;}',
            '#sl-conn-layer .sl-conn-modal.sl-conn-err{border-color:#ef4444;}',
            '#sl-conn-layer::before{content:"";position:absolute;inset:0;background:rgba(5,2,8,0.45);}',
            '#sl-conn-layer .sl-conn-spinner{width:52px;height:52px;margin:0 auto 18px;',
            'border-radius:50%;border:4px solid rgba(178,140,245,.25);border-top-color:#b28cf5;',
            'animation:sl-conn-spin 0.9s linear infinite;}',
            '@keyframes sl-conn-spin{to{transform:rotate(360deg);}}',
            '#sl-conn-layer .sl-conn-err-icon{width:42px;height:42px;margin:0 auto 18px;',
            'border-radius:50%;background:rgba(239,68,68,0.15);color:#ef4444;font-size:22px;',
            'font-weight:900;display:flex;align-items:center;justify-content:center;}',
            '#sl-conn-layer .sl-conn-title{margin:0 0 6px;font-size:16.5px;font-weight:700;color:#f4f2fb;}',
            '#sl-conn-layer .sl-conn-modal.sl-conn-err .sl-conn-title{color:#ef4444;}',
            '#sl-conn-layer .sl-conn-sub{margin:0;font-size:13px;color:#8f88a3;',
            'font-family:"IBM Plex Sans Arabic",sans-serif;}',
            '#agp-shell-overlay:has(#agp-shell-box.sl-inmatch-drawer){align-items:flex-start !important;',
            'justify-content:flex-start !important;padding:74px 14px 14px !important;}',
            '#agp-shell-box.sl-inmatch-drawer{position:relative !important;top:auto !important;',
            'right:auto !important;left:auto !important;width:350px !important;max-width:94vw !important;',
            'height:900px !important;max-height:calc(100vh - 74px) !important;',
            'max-height:calc(100dvh - 74px) !important;border-radius:20px !important;margin:0 !important;',
            'background:rgba(13,11,22,.97) !important;border:1px solid rgba(178,140,245,.3) !important;',
            'display:flex !important;flex-direction:column !important;overflow:hidden !important;',
            'padding:0 !important;box-shadow:0 40px 90px -50px rgba(0,0,0,1) !important;',
            'animation:sl-select-fadein .2s ease both;}',
            '.sl-drawer-header{display:flex;align-items:center;justify-content:space-between;',
            'padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.08);flex:none;}',
            '.sl-drawer-header h2{font-size:15.5px !important;font-weight:700 !important;margin:0 !important;',
            'padding:0 !important;font-family:"Noto Kufi Arabic",sans-serif !important;color:#f4f2fb;}',
            '.sl-drawer-header #agp-settings-close-btn{position:static !important;width:30px;height:30px;',
            'display:flex;align-items:center;justify-content:center;border-radius:9px;',
            'border:1px solid rgba(255,255,255,.14) !important;background:transparent !important;',
            'color:#cfc7e2 !important;font-size:15px !important;text-shadow:none !important;}',
            '.sl-drawer-body,.sl-drawer-players-tab{flex:1;min-height:0;overflow-y:auto;padding:14px 16px;}',
            '.sl-drawer-body .agp-shell-row,.sl-drawer-players-tab .agp-shell-row,',
            '.sl-drawer-body .agp-shell-field,.sl-drawer-players-tab .agp-shell-field{display:flex !important;',
            'align-items:center !important;justify-content:space-between !important;gap:10px;flex-wrap:wrap;',
            'padding:14px 16px !important;margin:0 0 12px !important;border-radius:18px;',
            'border:1px solid rgba(255,255,255,.09) !important;',
            'background:linear-gradient(180deg,rgba(28,24,44,.9),rgba(14,12,22,.9)) !important;}',
            '.sl-drawer-body .agp-shell-field{flex-direction:column !important;align-items:flex-start !important;}',
            '.sl-drawer-body .agp-shell-row-label,.sl-drawer-players-tab .agp-shell-row-label,',
            '.sl-drawer-body .agp-shell-field label,.sl-drawer-players-tab .agp-shell-field label{',
            'font-size:13px !important;color:#f4f2fb !important;font-weight:700 !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;',
            'display:flex !important;flex-direction:column !important;align-items:flex-end !important;gap:3px;}',
            '.sl-field-desc{font-size:11.5px !important;font-weight:400 !important;color:#8f88a3 !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;white-space:normal !important;',
            'text-align:right;}',
            '.sl-drawer-card{border-radius:18px;border:1px solid rgba(255,255,255,.09);',
            'background:linear-gradient(180deg,rgba(28,24,44,.9),rgba(14,12,22,.9));',
            'margin:0 0 12px;padding:14px 16px;box-sizing:border-box;}',
            '.sl-drawer-card > .agp-shell-row{padding:0 !important;margin:0 !important;',
            'border:none !important;background:none !important;}',
            '.sl-drawer-card .sl-conditional-section{display:flex;flex-direction:column;gap:10px;',
            'margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);}',
            '.sl-drawer-card .sl-conditional-section .agp-shell-row{padding:0 !important;',
            'margin:0 !important;border:none !important;background:none !important;}',
            '#agp-shell-box.sl-inmatch-drawer .agp-settings-player-box{display:none !important;}',
            '#agp-shell-box.sl-inmatch-drawer .agp-settings-player-row{display:block !important;width:100% !important;',
            'border:none !important;background:none !important;padding:0 !important;}',
            '#agp-shell-box.sl-inmatch-drawer #agp-settings-player-count{display:none !important;}',
            '#agp-shell-box.sl-inmatch-drawer .agp-shell-field:has(#agp-settings-player-count) > label{display:none !important;}',
            '#agp-shell-box.sl-inmatch-drawer .agp-settings-player-actions{width:100% !important;',
            'max-width:none !important;}',
            '#agp-shell-box.sl-inmatch-drawer #agp-reopen-registration-btn{width:100% !important;',
            'margin:0 !important;display:flex !important;align-items:center;justify-content:center;gap:8px;',
            'padding:13px 14px !important;border-radius:14px !important;',
            'border:1px solid rgba(178,140,245,.4) !important;',
            'background:linear-gradient(135deg,rgba(122,63,212,.28),rgba(178,140,245,.1)) !important;',
            'color:#f0e9ff !important;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'font-weight:700 !important;font-size:13.5px !important;}',
            '.sl-drawer-footer{flex:none;padding:14px 16px;border-top:1px solid rgba(255,255,255,.08);}',
            '.sl-drawer-end-btn{width:100%;padding:13px 18px;border:1px solid transparent;cursor:pointer;',
            'border-radius:14px;background:rgba(224,115,111,.16);color:#ff9b96;',
            'font-family:"Noto Kufi Arabic",sans-serif;font-size:14px;font-weight:700;',
            'transition:background .2s;}',
            '.sl-drawer-end-btn:hover{background:rgba(224,115,111,.28);}',
            '#agp-shell-overlay:has(#agp-shell-box.sl-mini-lobby-active){align-items:center !important;',
            'justify-content:center !important;background:rgba(3,3,6,.72) !important;',
            'padding:20px !important;}',
            '#agp-shell-box.sl-mini-lobby-active{width:600px !important;max-width:94vw !important;',
            'height:900px !important;max-height:90vh !important;margin:0 !important;',
            'padding:16px 18px 18px !important;box-sizing:border-box !important;',
            'display:flex !important;flex-direction:column !important;',
            'background:rgba(20,18,32,.6) !important;backdrop-filter:blur(10px);',
            '-webkit-backdrop-filter:blur(10px);border:2px solid rgba(178,140,245,.5) !important;',
            'border-radius:24px !important;box-shadow:none !important;position:relative;overflow:hidden;}',
            '#agp-shell-box.sl-mini-lobby-active h2{flex:none !important;text-align:center !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;font-size:15.5px !important;',
            'font-weight:700 !important;margin:0 0 12px !important;max-width:none !important;',
            'background:none !important;color:#f4f2fb !important;-webkit-text-fill-color:#f4f2fb !important;}',
            '.sl-mini-lobby-info{flex:none;margin-bottom:14px;padding:16px 18px;border-radius:18px;',
            'background:linear-gradient(135deg,rgba(122,63,212,.22),rgba(178,140,245,.08));',
            'border:1px solid rgba(178,140,245,.35);}',
            '.sl-mini-lobby-info p{margin:0;font-family:"Noto Kufi Arabic",sans-serif;font-size:14px;',
            'font-weight:600;line-height:1.9;color:#f0e9ff;}',
            '.sl-mini-lobby-info p + p{margin-top:8px;font-family:"IBM Plex Sans Arabic",sans-serif;',
            'font-size:12.5px;font-weight:400;line-height:1.85;color:#c6b4f2;}',
            '.sl-mini-lobby-close-btn{position:absolute;top:16px;left:18px;width:30px;height:30px;',
            'border-radius:9px;background:transparent;border:1px solid rgba(255,255,255,0.16);',
            'color:#cfc7e2;display:flex;align-items:center;justify-content:center;font-size:15px;',
            'cursor:pointer;z-index:3;padding:0;font-family:inherit;line-height:1;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-join-hint{flex:none !important;text-align:center;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;gap:8px;',
            'margin-bottom:14px;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-join-keyword-plain{display:inline-flex;',
            'align-items:center;gap:10px;background:rgba(214,168,60,.12) !important;',
            'border:1px solid rgba(240,205,106,.4);color:#f0cd6a !important;font-weight:900;',
            'font-family:"Cairo",sans-serif;padding:12px 20px;border-radius:999px;font-size:19px;}',
            '#agp-mini-lobby-count{display:block;color:#cfc7e2;font-size:0.75em;margin-top:4px;}',
            '#agp-shell-box.sl-mini-lobby-active #agp-mini-lobby-list{',
            'flex:1 1 auto !important;min-height:0 !important;overflow-y:auto !important;',
            'display:grid !important;grid-template-columns:repeat(auto-fill,217px) !important;',
            'column-gap:37px !important;row-gap:20px !important;justify-content:center !important;',
            'justify-items:center !important;align-items:center !important;align-content:start !important;',
            'margin:0 !important;padding:12px 4px 10px !important;list-style:none;',
            'width:100% !important;box-sizing:border-box !important;',
            'scrollbar-width:none !important;-ms-overflow-style:none !important;}',
            '#agp-shell-box.sl-mini-lobby-active #agp-mini-lobby-list::-webkit-scrollbar{display:none !important;}',
            '#agp-shell-box.sl-mini-lobby-active #agp-mini-lobby-list li{position:relative;',
            'display:flex !important;align-items:center;justify-content:center;min-height:57px;padding:0 !important;',
            'border:none !important;background:none !important;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-pcard{width:217px !important;height:57px !important;',
            'box-sizing:border-box !important;padding:0 3px 0 28px !important;gap:6px !important;',
            'border-radius:24px !important;background:rgba(217,217,217,.3) !important;',
            'border:2px solid #000 !important;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-pcard-avatar-basic{width:48px !important;height:48px !important;',
            'background:#D9D9D9 !important;border:none !important;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-pcard-name-basic{flex:1 1 auto !important;width:auto !important;',
            'min-width:0 !important;height:auto !important;margin:0 !important;padding:0 !important;',
            'font-size:20px !important;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'font-weight:700 !important;color:#fff !important;background:none !important;border:none !important;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-pcard-avatar-basic--fallback{font-size:15px !important;color:#3a2f4a !important;}',
            '#agp-shell-box.sl-mini-lobby-active li:has(> .agp-pcard-tpl){width:217px !important;height:57px !important;',
            'overflow:visible !important;flex-direction:row !important;}',
            '#agp-shell-box.sl-mini-lobby-active .agp-pcard-tpl{zoom:0.7282;flex-shrink:0 !important;}',
            '#agp-shell-box.sl-mini-lobby-active #agp-mini-lobby-done-btn{flex:none !important;',
            'display:block !important;width:100% !important;margin:14px 0 0 !important;',
            'padding:13px 20px !important;font-size:14.5px !important;font-weight:700 !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;letter-spacing:0;',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'border:none !important;border-radius:14px !important;',
            'box-shadow:0 16px 34px -20px rgba(122,63,212,1) !important;}',
            ''
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  4) اللوحة
     * ==================================================================== */
    // مركز المربع n كنسبة مئوية من اللوحة (1 أسفل يسار، الصفوف متعرّجة)
    function cellCenter(n) {
        var idx = n - 1;
        var row = Math.floor(idx / 10);
        var col = idx % 10;
        if (row % 2 === 1) col = 9 - col;
        return { x: (col + 0.5) * 10, y: (9 - row + 0.5) * 10 };
    }

    function buildBoardHtml() {
        var cells = [];
        for (var r = 9; r >= 0; r--) {
            for (var c = 0; c < 10; c++) {
                var col = (r % 2 === 1) ? 9 - c : c;
                var n = r * 10 + col + 1;
                var cls = 'sl-cell ' + (((r + c) % 2 === 0) ? 'sl-cell-a' : 'sl-cell-b');
                if (LADDERS[n]) cls += ' sl-cell-ladder';
                if (SNAKES[n]) cls += ' sl-cell-snake';
                if (n === BOARD_SIZE) cls += ' sl-cell-goal';
                cells.push('<div class="' + cls + '" style="grid-row:' + (10 - r) + ';grid-column:' + (c + 1) + '">' +
                    n + (n === BOARD_SIZE ? '<span class="sl-cell-trophy">🏆</span>' : '') + '</div>');
            }
        }
        return cells.join('');
    }

    function ladderSvg(from, to, i) {
        var a = cellCenter(from), b = cellCenter(to);
        var dx = b.x - a.x, dy = b.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy);
        var nx = -dy / len * 1.9, ny = dx / len * 1.9;
        var out = '<g filter="url(#sl-shadow)">';
        out += '<line x1="' + (a.x + nx) + '" y1="' + (a.y + ny) + '" x2="' + (b.x + nx) + '" y2="' + (b.y + ny) + '" stroke="url(#sl-ladder-grad)" stroke-width="1.1" stroke-linecap="round"/>';
        out += '<line x1="' + (a.x - nx) + '" y1="' + (a.y - ny) + '" x2="' + (b.x - nx) + '" y2="' + (b.y - ny) + '" stroke="url(#sl-ladder-grad)" stroke-width="1.1" stroke-linecap="round"/>';
        var rungs = Math.max(2, Math.floor(len / 3.6));
        for (var k = 1; k < rungs; k++) {
            var t = k / rungs;
            var cx = a.x + dx * t, cy = a.y + dy * t;
            out += '<line x1="' + (cx + nx) + '" y1="' + (cy + ny) + '" x2="' + (cx - nx) + '" y2="' + (cy - ny) + '" stroke="#e8c36a" stroke-width="0.7" stroke-linecap="round"/>';
        }
        return out + '</g>';
    }

    var SNAKE_COLORS = [['#4ade80', '#166534'], ['#f472b6', '#9d174d'], ['#22d3ee', '#0e7490'], ['#facc15', '#a16207'], ['#fb923c', '#9a3412']];

    function snakeSvg(head, tail, i) {
        var a = cellCenter(head), b = cellCenter(tail);
        var dx = b.x - a.x, dy = b.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy);
        var nx = -dy / len, ny = dx / len;
        var waves = Math.max(1.5, len / 14);
        var amp = Math.min(3.2, 1.2 + len / 25);
        var pts = [];
        var steps = 40;
        for (var k = 0; k <= steps; k++) {
            var t = k / steps;
            var off = Math.sin(t * Math.PI * 2 * waves) * amp * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08));
            pts.push([a.x + dx * t + nx * off, a.y + dy * t + ny * off]);
        }
        var d = 'M' + pts.map(function (p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join(' L');
        var col = SNAKE_COLORS[i % SNAKE_COLORS.length];
        var out = '<g filter="url(#sl-shadow)">';
        out += '<path d="' + d + '" fill="none" stroke="' + col[1] + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
        out += '<path d="' + d + '" fill="none" stroke="' + col[0] + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
        out += '<path d="' + d + '" fill="none" stroke="' + col[1] + '" stroke-width="0.6" stroke-dasharray="0.8 1.6" stroke-linecap="round" opacity=".7"/>';
        // الرأس
        var ang = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) * 180 / Math.PI + 180;
        out += '<g transform="translate(' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + ') rotate(' + ang.toFixed(1) + ')">';
        out += '<ellipse cx="0" cy="0" rx="2.5" ry="1.9" fill="' + col[0] + '" stroke="' + col[1] + '" stroke-width="0.5"/>';
        out += '<circle cx="0.9" cy="-0.8" r="0.45" fill="#fff"/><circle cx="1.05" cy="-0.8" r="0.22" fill="#111"/>';
        out += '<circle cx="0.9" cy="0.8" r="0.45" fill="#fff"/><circle cx="1.05" cy="0.8" r="0.22" fill="#111"/>';
        out += '<path d="M2.4 0 L3.6 0 M3.6 0 L4.1 -0.45 M3.6 0 L4.1 0.45" stroke="#e11d48" stroke-width="0.3" stroke-linecap="round"/>';
        out += '</g>';
        return out + '</g>';
    }

    function buildBoardSvg() {
        var defs = '<defs>' +
            '<linearGradient id="sl-ladder-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100"><stop offset="0" stop-color="#f0cd6a"/><stop offset="1" stop-color="#b9821f"/></linearGradient>' +
            '<filter id="sl-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0.5" stdDeviation="0.5" flood-color="#000" flood-opacity=".6"/></filter>' +
            '</defs>';
        var body = '';
        Object.keys(LADDERS).forEach(function (k, i) { body += ladderSvg(Number(k), LADDERS[k], i); });
        Object.keys(SNAKES).forEach(function (k, i) { body += snakeSvg(Number(k), SNAKES[k], i); });
        return '<svg id="sl-board-svg" viewBox="0 0 100 100" preserveAspectRatio="none">' + defs + body + '</svg>';
    }

    /* ======================================================================
     *  5) شاشة اللعب
     * ==================================================================== */
    function ensureScaffolding() {
        injectStageStyles();
        if (!el('sl-stage')) {
            var stage = document.createElement('div');
            stage.id = 'sl-stage';
            document.body.appendChild(stage);
        }
        if (!el('sl-modal-overlay')) {
            var overlay = document.createElement('div');
            overlay.id = 'sl-modal-overlay';
            overlay.innerHTML = '<div id="sl-modal-box"></div>';
            document.body.appendChild(overlay);
        }
        if (!el('sl-toast-wrap')) {
            var toast = document.createElement('div');
            toast.id = 'sl-toast-wrap';
            document.body.appendChild(toast);
        }
    }

    function renderStage() {
        ensureScaffolding();
        var stage = el('sl-stage');
        stage.innerHTML =
            '<div id="sl-side">' +
                '<div class="sl-panel" id="sl-turn-card">' +
                    '<p class="sl-turn-title">الدور الحالي</p>' +
                    '<div class="sl-turn-player" id="sl-turn-player"></div>' +
                    '<div class="sl-turn-hint">اكتب في شات البث:<br>' +
                        ROLL_COMMANDS.map(function (c) { return '<span class="sl-cmd">' + escapeHtml(c) + '</span>'; }).join('') +
                    '</div>' +
                    '<div id="sl-timer" class="sl-timer-idle"><span id="sl-timer-num">' + TURN_SECONDS + '</span></div>' +
                    '<div id="sl-dice-row"><div id="sl-dice"></div><div id="sl-dice-result">—</div></div>' +
                '</div>' +
                '<div class="sl-panel" id="sl-standings">' +
                    '<h3>🏁 ترتيب اللاعبين</h3>' +
                    '<div id="sl-standings-list"></div>' +
                '</div>' +
            '</div>' +
            '<div id="sl-board-col">' +
                '<div id="sl-board-wrap">' +
                    '<div id="sl-board">' + buildBoardHtml() + '</div>' +
                    buildBoardSvg() +
                    '<div id="sl-tokens"></div>' +
                    '<div id="sl-banner"></div>' +
                '</div>' +
                '<div id="sl-start-row"></div>' +
            '</div>';
        renderDiceFace(1);
        renderTokens();
        renderTurnCard();
        renderStandings();
    }

    var PIP_MAP = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    function renderDiceFace(n) {
        var dice = el('sl-dice');
        if (!dice) return;
        var on = PIP_MAP[n] || [];
        var html = '';
        for (var i = 0; i < 9; i++) html += '<span class="sl-pip' + (on.indexOf(i) !== -1 ? ' on' : '') + '"></span>';
        dice.innerHTML = html;
    }

    function currentPlayer() { return _order.length ? _order[_turnIdx % _order.length] : null; }

    function tokenCoords(pid) {
        var pos = _positions[pid] || 0;
        var c = cellCenter(pos);
        // أكثر من لاعب بنفس المربع — إزاحة بسيطة على شكل دائرة صغيرة
        var same = _roster.filter(function (p) { return (_positions[p.id] || 0) === pos && isOnBoard(p.id); });
        if (same.length > 1) {
            var i = same.map(function (p) { return p.id; }).indexOf(pid);
            var ang = (i / same.length) * Math.PI * 2;
            var r = 2.4;
            return { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r };
        }
        return c;
    }
    function isOnBoard(pid) { return (_positions[pid] || 0) >= 1; }

    function renderTokens() {
        var layer = el('sl-tokens');
        var startRow = el('sl-start-row');
        if (!layer || !startRow) return;
        var cur = currentPlayer();
        var existing = {};
        Array.prototype.forEach.call(layer.querySelectorAll('.sl-token'), function (t) { existing[t.getAttribute('data-pid')] = t; });

        var waiting = [];
        _roster.forEach(function (p) {
            var tok = existing[p.id];
            delete existing[p.id];
            if (!isOnBoard(p.id)) {
                if (tok) tok.parentNode.removeChild(tok);
                if (_positions[p.id] !== undefined) waiting.push(p);
                return;
            }
            if (!tok) {
                tok = document.createElement('div');
                tok.className = 'sl-token';
                tok.setAttribute('data-pid', p.id);
                tok.style.setProperty('--tc', _colors[p.id] || '#ffd400');
                tok.innerHTML = ringAvatarHtml(p);
                layer.appendChild(tok);
            }
            var xy = tokenCoords(p.id);
            tok.style.left = xy.x + '%';
            tok.style.top = xy.y + '%';
            tok.classList.toggle('sl-token-active', !!cur && cur.id === p.id);
        });
        Object.keys(existing).forEach(function (k) { existing[k].parentNode.removeChild(existing[k]); });

        startRow.innerHTML = waiting.length
            ? '<span>🚩 خط البداية:</span>' + waiting.map(function (p) {
                return '<span class="sl-start-av" title="' + escapeHtml(playerLabel(p)) + '" style="--tc:' + (_colors[p.id] || '#ffd400') + '">' + ringAvatarHtml(p) + '</span>';
            }).join('')
            : '<span>🚩 كل اللاعبين انطلقوا على اللوحة</span>';
    }

    function renderTurnCard() {
        var box = el('sl-turn-player');
        if (!box) return;
        var p = currentPlayer();
        if (!p) { box.innerHTML = '<div class="sl-turn-name">—</div>'; return; }
        var pos = _positions[p.id] || 0;
        box.innerHTML =
            '<div class="sl-turn-avatar" style="--tc:' + (_colors[p.id] || '#b28cf5') + '">' + ringAvatarHtml(p) + '</div>' +
            '<div class="sl-turn-name">' + escapeHtml(playerLabel(p)) + '</div>' +
            '<div class="sl-turn-pos">' + (pos ? ('📍 المربع ' + pos) : '🚩 عند خط البداية') + '</div>';
        var card = el('sl-turn-card');
        if (card) card.style.setProperty('--tc', _colors[p.id] || '#b28cf5');
    }

    function renderStandings() {
        var list = el('sl-standings-list');
        if (!list) return;
        var cur = currentPlayer();
        var medals = ['🥇', '🥈', '🥉'];
        var rows = _winners.map(function (p, i) {
            return '<div class="sl-srow sl-srow-won"><span class="sl-srow-av" style="--tc:' + (_colors[p.id] || '#ffd400') + '">' + ringAvatarHtml(p) + '</span>' +
                '<span class="sl-srow-name">' + escapeHtml(playerLabel(p)) + '</span>' +
                '<span class="sl-srow-pos">' + (medals[i] || '🏆') + '</span></div>';
        });
        var playing = _order.slice().sort(function (a, b) { return (_positions[b.id] || 0) - (_positions[a.id] || 0); });
        playing.forEach(function (p) {
            rows.push('<div class="sl-srow' + (cur && cur.id === p.id ? ' sl-srow-turn' : '') + '">' +
                '<span class="sl-srow-av" style="--tc:' + (_colors[p.id] || '#ffd400') + '">' + ringAvatarHtml(p) + '</span>' +
                '<span class="sl-srow-name">' + escapeHtml(playerLabel(p)) + '</span>' +
                '<span class="sl-srow-pos">' + (_positions[p.id] || 0) + '</span></div>');
        });
        list.innerHTML = rows.join('');
    }

    function showBanner(text, kind, ms) {
        var b = el('sl-banner');
        if (!b) return;
        b.className = kind ? ('sl-banner-' + kind) : '';
        b.textContent = text;
        // reflow ثم إظهار
        void b.offsetWidth;
        b.classList.add('show');
        later(function () { b.classList.remove('show'); }, ms || 1400);
    }

    function showToast(message) {
        ensureScaffolding();
        var wrap = el('sl-toast-wrap');
        var t = document.createElement('div');
        t.className = 'sl-toast';
        t.textContent = message;
        wrap.appendChild(t);
        window.setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
    }

    /* ======================================================================
     *  6) الأدوار + المؤقت
     * ==================================================================== */
    function stopTurnTimer() {
        if (_turnInterval) { window.clearInterval(_turnInterval); _turnInterval = null; }
    }

    function updateTimerDisplay() {
        var t = el('sl-timer');
        var num = el('sl-timer-num');
        if (!t || !num) return;
        num.textContent = String(Math.max(0, _turnRemaining));
        t.style.setProperty('--p', (Math.max(0, _turnRemaining) / TURN_SECONDS * 100) + '%');
        t.classList.toggle('sl-timer-warn', _awaitingRoll && _turnRemaining <= 5);
        t.classList.toggle('sl-timer-idle', !_awaitingRoll);
    }

    function startTurn() {
        if (!_matchActive) return;
        if (!_order.length) { endMatch(); return; }
        _turnIdx = _turnIdx % _order.length;
        _awaitingRoll = true;
        _busy = false;
        _turnRemaining = TURN_SECONDS;
        renderTurnCard();
        renderTokens();
        renderStandings();
        var dr = el('sl-dice-result');
        if (dr) dr.textContent = '—';
        updateTimerDisplay();
        stopTurnTimer();
        _turnInterval = window.setInterval(function () {
            _turnRemaining--;
            if (_turnRemaining > 0 && _turnRemaining <= 5) playSound('warning');
            updateTimerDisplay();
            if (_turnRemaining <= 0) {
                stopTurnTimer();
                handleTurnTimeout();
            }
        }, 1000);
    }

    function handleTurnTimeout() {
        if (!_awaitingRoll) return;
        _awaitingRoll = false;
        updateTimerDisplay();
        var p = currentPlayer();
        showToast('⏭️ انتهى وقت ' + playerLabel(p) + ' — راح عليه الدور');
        advanceTurn();
    }

    function advanceTurn() {
        if (!_matchActive) return;
        if (_order.length) _turnIdx = (_turnIdx + 1) % _order.length;
        later(startTurn, NEXT_TURN_DELAY_MS);
    }

    /* ======================================================================
     *  7) رمي النرد + الحركة
     * ==================================================================== */
    function rollFor(player) {
        if (!_matchActive || !_awaitingRoll || _busy) return;
        var cur = currentPlayer();
        if (!cur || cur.id !== player.id) return;
        _awaitingRoll = false;
        _busy = true;
        stopTurnTimer();
        updateTimerDisplay();

        var value = 1 + Math.floor(Math.random() * 6);
        var dice = el('sl-dice');
        if (dice) dice.classList.add('sl-dice-rolling');
        playSound('dice');
        var flick = window.setInterval(function () { renderDiceFace(1 + Math.floor(Math.random() * 6)); }, 90);
        later(function () {
            window.clearInterval(flick);
            if (dice) dice.classList.remove('sl-dice-rolling');
            renderDiceFace(value);
            var dr = el('sl-dice-result');
            if (dr) dr.textContent = '🎲 طلع ' + value;
            moveSteps(cur, value);
        }, DICE_ROLL_MS);
    }

    function setTokenSlide(pid, on) {
        var tok = el('sl-tokens') && el('sl-tokens').querySelector('.sl-token[data-pid="' + (window.CSS && CSS.escape ? CSS.escape(pid) : pid) + '"]');
        if (tok) tok.classList.toggle('sl-token-slide', on);
    }

    function moveSteps(player, steps) {
        var start = _positions[player.id] || 0;
        // الوصول للكأس = المربع 100 (لو النرد تجاوزه يوقف على الكأس)
        var target = Math.min(BOARD_SIZE, start + steps);
        var pos = start;
        function step() {
            if (!_matchActive) return;
            if (pos >= target) { afterWalk(player); return; }
            pos++;
            _positions[player.id] = pos;
            playSound('step');
            renderTokens();
            renderTurnCard();
            renderStandings();
            later(step, STEP_MS);
        }
        step();
    }

    function afterWalk(player) {
        var pos = _positions[player.id];
        if (pos >= BOARD_SIZE) { handleReachedGoal(player); return; }
        var dest = LADDERS[pos] || SNAKES[pos];
        if (!dest) { finishMove(); return; }
        var isLadder = !!LADDERS[pos];
        later(function () {
            if (!_matchActive) return;
            playSound(isLadder ? 'ladder' : 'snake');
            showBanner(isLadder
                ? ('🪜 ' + playerLabel(player) + ' طلع السلم للمربع ' + dest)
                : ('🐍 الثعبان أكل ' + playerLabel(player) + ' ونزل للمربع ' + dest), isLadder ? 'ladder' : 'snake', 1500);
            setTokenSlide(player.id, true);
            _positions[player.id] = dest;
            renderTokens();
            renderTurnCard();
            renderStandings();
            later(function () {
                setTokenSlide(player.id, false);
                if (dest >= BOARD_SIZE) handleReachedGoal(player);
                else finishMove();
            }, SLIDE_MS + 100);
        }, 300);
    }

    function finishMove() {
        _busy = false;
        renderStandings();
        advanceTurn();
    }

    function requiredWinners() {
        var n = Number(liveSettings().winnersCount) || 1;
        return Math.max(1, Math.min(3, n));
    }

    function handleReachedGoal(player) {
        _winners.push(player);
        var place = _winners.length;
        var idx = _order.findIndex(function (p) { return p.id === player.id; });
        if (idx !== -1) {
            _order.splice(idx, 1);
            // الدور التالي يكون للي بعده مباشرة (نفس الفهرس بعد الحذف)
            _turnIdx = _order.length ? (idx % _order.length) : 0;
        }
        var names = ['الأول', 'الثاني', 'الثالث'];
        playSound('win');
        showBanner('🏆 ' + playerLabel(player) + ' وصل للكأس — المركز ' + (names[place - 1] || place), 'win', 2200);
        renderTokens();
        renderStandings();
        _busy = false;

        var need = requiredWinners();
        later(function () {
            if (!_matchActive) return;
            if (_winners.length >= need || !_order.length) { endMatch(); return; }
            // باقي لاعب واحد فقط — ياخذ المركز المتبقي تلقائياً
            if (_order.length === 1) {
                _winners.push(_order[0]);
                _order = [];
                endMatch();
                return;
            }
            startTurn();
        }, 2400);
    }

    /* ======================================================================
     *  8) الاستماع لشات البث
     * ==================================================================== */
    function wireCommentListener() {
        unwireCommentListener();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_matchActive || !_awaitingRoll || !payload || typeof payload.text !== 'string') return;
            var cur = currentPlayer();
            if (!cur || (payload.id !== cur.id && payload.name !== cur.name)) return;
            if (!isRollCommand(payload.text)) return;
            rollFor(cur);
        });
    }
    function unwireCommentListener() {
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = null;
    }

    /* ======================================================================
     *  9) حذف/إضافة لاعب وسط المباراة
     * ==================================================================== */
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id || !_matchActive) return;
        var idx = _order.findIndex(function (p) { return p.id === removedPlayer.id; });
        var wasCurrent = idx !== -1 && idx === (_turnIdx % Math.max(1, _order.length));
        _roster = _roster.filter(function (p) { return p.id !== removedPlayer.id; });
        delete _positions[removedPlayer.id];
        if (idx === -1) { renderTokens(); renderStandings(); return; }
        _order.splice(idx, 1);
        if (idx < _turnIdx) _turnIdx--;
        if (_order.length) _turnIdx = _turnIdx % _order.length; else _turnIdx = 0;

        renderTokens();
        renderStandings();

        if (!_order.length || (_order.length === 1 && _winners.length === 0 && _roster.length <= 1)) {
            if (_order.length === 1 && _winners.length < requiredWinners()) _winners.push(_order[0]);
            _order = [];
            endMatch();
            return;
        }
        if (wasCurrent && (_awaitingRoll || !_busy)) {
            stopTurnTimer();
            _awaitingRoll = false;
            clearPendingTimeouts();
            later(startTurn, 400);
        } else {
            renderTurnCard();
        }
    }

    function handlePlayerJoinedMidMatch(newPlayer) {
        if (!newPlayer || !newPlayer.id || !_matchActive) return;
        if (_roster.some(function (p) { return p.id === newPlayer.id; })) return;
        _roster.push(newPlayer);
        _order.push(newPlayer);
        _positions[newPlayer.id] = 0;
        _colors[newPlayer.id] = TOKEN_COLORS[(_roster.length - 1) % TOKEN_COLORS.length];
        renderTokens();
        renderStandings();
    }

    function enforceMaxPlayers() {
        var settings = AGP.gameShell.getSettings();
        var max = settings.maxPlayers;
        if (!max) return;
        if (AGP.gameManager.getPlayersCount() >= max) {
            if (AGP.lobby && typeof AGP.lobby.close === 'function') AGP.lobby.close();
            if (AGP.keywordManager && typeof AGP.keywordManager.deactivate === 'function') {
                AGP.keywordManager.deactivate();
            }
        }
    }

    /* ======================================================================
     *  10) نهاية المباراة + بطاقة الفوز (نفس بطاقة روليت الإقصاء)
     * ==================================================================== */
    function endMatch() {
        if (!_matchActive) return;
        _matchActive = false;
        _awaitingRoll = false;
        stopTurnTimer();
        clearPendingTimeouts();
        unwireCommentListener();

        var winners = _winners.slice(0, 3);
        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var winnerIds = winners.map(function (w) { return w.id; });
            var participants = AGP.gameManager.getPlayers().map(function (p) {
                return { tiktokUsername: tiktokUsernameFor(p), won: winnerIds.indexOf(p.id) !== -1 };
            }).filter(function (p) { return p.tiktokUsername; });
            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () { return null; });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        pointsPromise.then(function (pointsResult) { renderWinnerScreen(winners, pointsResult); });
    }

    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }

    function pointsHtmlFor(pointsResult, player) {
        if (!pointsResult) {
            return '<div class="agp-trophy-points agp-points-noaccount">تعذّر جلب النقاط الآن</div>';
        }
        var awarded = findAwardedFor(pointsResult, player);
        if (awarded) {
            return '<div class="agp-trophy-points agp-points-earned">+' + awarded.added + ' نقطة' +
                '<span class="agp-points-sub">تظهر في بروفايلك</span></div>';
        }
        return '<div class="agp-trophy-points agp-points-noaccount">لازم يسوي حساب عشان تظهر نقاطك بالبروفايل</div>';
    }

    var CONFETTI_COLORS = ['#ffd400', '#ff4dff', '#00c2ff', '#7c3aed', '#4ade80', '#ff6b8a'];
    function spawnConfetti(container, count) {
        if (!container) return;
        count = count || 26;
        for (var i = 0; i < count; i++) {
            var piece = document.createElement('span');
            piece.className = 'sl-confetti-piece';
            var angle = Math.random() * Math.PI * 2;
            var dist = 70 + Math.random() * 90;
            piece.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
            piece.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
            piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            piece.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
            container.appendChild(piece);
            (function (p) {
                window.setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1700);
            })(piece);
        }
    }

    var PLACE_CLASSES = ['sl-trophy-winner', 'sl-trophy-most', 'sl-trophy-third'];
    var PLACE_LABELS = ['المركز الأول', 'المركز الثاني', 'المركز الثالث'];

    function renderWinnerScreen(winners, pointsResult) {
        ensureScaffolding();
        var overlay = el('sl-modal-overlay');
        var box = el('sl-modal-box');
        if (!overlay || !box) return;

        var single = winners.length <= 1;
        var cardsHtml = winners.map(function (w, i) {
            return AGP.playerCard.renderTrophyCard(w, {
                cls: PLACE_CLASSES[i], kind: 'winner', cardId: 'sl-trophy-card-' + i,
                label: single ? undefined : PLACE_LABELS[i],
                showCrown: i === 0,
                pointsHtml: pointsHtmlFor(pointsResult, w)
            });
        }).join('');

        box.className = 'sl-winner-panel';
        box.style.textAlign = 'center';
        overlay.classList.add('sl-winner-backdrop');
        box.innerHTML =
            '<div id="sl-winner-box">' +
            '<h2>🏁 انتهت المباراة .. ' + (single ? 'الشخص الرهيب الي فاز' : 'الأشخاص الرهيبين الي فازوا') +
            ' بلعبة "' + escapeHtml(GAME_NAME) + '"</h2>' +
            '<div class="sl-trophy-cards">' + (cardsHtml || '<p style="color:#fff;font-weight:800;">بدون فائز</p>') + '</div>' +
            '<div class="sl-winner-actions">' +
            '<button class="sl-btn-secondary" id="sl-home-btn">⬅️ رجوع لمنصة الألعاب</button>' +
            '<button class="sl-btn-secondary" id="sl-new-match-btn">🆕 بدء مباراة جديدة</button>' +
            '<button class="sl-btn-secondary" id="sl-replay-same-btn">🔄 إعادة المباراة بنفس اللاعبين</button>' +
            '</div></div>';

        el('sl-replay-same-btn').onclick = handleReplaySamePlayers;
        el('sl-new-match-btn').onclick = function () {
            AGP.gameManager.resetSession();
            window.location.reload();
        };
        el('sl-home-btn').onclick = function () {
            var headerHomeBtn = el('agp-header-home-btn');
            if (headerHomeBtn) headerHomeBtn.click();
        };

        overlay.style.display = 'flex';
        window.setTimeout(function () {
            winners.forEach(function (w, i) { spawnConfetti(el('sl-trophy-card-' + i), i === 0 ? 28 : 20); });
        }, 120);
    }

    function startMatchWith(players, settingsValues) {
        resetMatchState();
        _settings = settingsValues || liveSettings();
        _roster = players.slice();
        _order = players.slice();
        _roster.forEach(function (p, i) {
            _positions[p.id] = 0;
            _colors[p.id] = TOKEN_COLORS[i % TOKEN_COLORS.length];
        });
        _turnIdx = 0;
        _startedAt = Date.now();
        _matchActive = true;
        wireCommentListener();
        renderStage();
        later(startTurn, 600);
    }

    function handleReplaySamePlayers() {
        var roster = _roster.slice();
        if (!roster.length) return;
        var overlay = el('sl-modal-overlay');
        if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('sl-winner-backdrop'); }
        startMatchWith(roster, liveSettings());
        AGP.events.emit('game:roundStarted', { id: GAME_ID });
    }

    function handleStartRound(settingsValues) {
        startMatchWith(AGP.gameManager.getPlayers(), settingsValues);
    }

    /* ======================================================================
     *  11) حقول شاشة الإعدادات
     *      (الكلمة المفتاحية حقل أساسي يبنيه js/agp-game-shell.js بنفسه)
     * ==================================================================== */
    function buildSettingsFields() {
        return [
            {
                key: 'maxPlayers', type: 'counter', label: '👥 كم الحد الأقصى لعدد اللاعبين',
                min: 2, default: 10
            },
            {
                key: 'followersOnly', type: 'pill-choice', label: '🔑 السماح بالدخول',
                options: [
                    { label: '👥 الجميع', value: false },
                    { label: '❤️ المتابعين فقط', value: true }
                ],
                default: false
            },
            {
                key: 'winnersCount', type: 'pill-group', label: '🏆 كم فائز بالمباراة',
                description: 'المباراة تنتهي أول ما يوصل هذا العدد من اللاعبين للكأس',
                options: [
                    { label: '1', value: 1 },
                    { label: '2', value: 2 },
                    { label: '3', value: 3 }
                ],
                default: 1
            }
        ];
    }

    /* ======================================================================
     *  12) تحسينات شاشات الإعدادات/اللوبي المشتركة — نفس طريقة روليت
     *      الإقصاء بالضبط (MutationObserver على #agp-shell-overlay)، بدون
     *      أي تعديل على js/agp-game-shell.js.
     * ==================================================================== */
    function homeNavigate() {
        var homeBtn = el('agp-header-home-btn');
        if (homeBtn) { homeBtn.click(); }
        else { window.location.href = '../../games.html'; }
    }

    function makeBackToPlatformBtn() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sl-back-to-platform-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        btn.addEventListener('click', homeNavigate);
        return btn;
    }

    function layoutInitialSettingsFields(box) {
        var connectBtn = el('agp-connect-btn');
        if (!connectBtn) return;
        if (connectBtn.closest('.sl-settings-footer')) return;

        function rowFor(dataKeySelector) {
            var ctl = box.querySelector(dataKeySelector);
            return ctl ? ctl.closest('.agp-shell-row') : null;
        }

        var usernameInput = el('agp-tiktok-username');
        var usernameField = usernameInput ? usernameInput.closest('.agp-shell-field') : null;
        var keywordInput = el('agp-keyword');
        var keywordField = keywordInput ? keywordInput.closest('.agp-shell-field') : null;

        var maxPlayersRow = rowFor('[data-key="maxPlayers"]');
        var followersRow = rowFor('[data-key="followersOnly"]');
        var winnersRow = rowFor('[data-key="winnersCount"]');

        var scroll = document.createElement('div');
        scroll.className = 'sl-settings-scroll';
        var scrollInner = document.createElement('div');
        scrollInner.className = 'sl-settings-scroll-inner';
        scroll.appendChild(scrollInner);

        [usernameField, keywordField, maxPlayersRow, followersRow]
            .filter(Boolean).forEach(function (fieldEl) { scrollInner.appendChild(fieldEl); });

        // "كرت" — عدد الفائزين (نفس كروت روليت الإقصاء)
        if (winnersRow) {
            var card = document.createElement('div');
            card.className = 'sl-settings-card';
            card.appendChild(winnersRow);
            scrollInner.appendChild(card);
        }

        var fade = document.createElement('div');
        fade.className = 'sl-settings-fade';
        var glowline = document.createElement('div');
        glowline.className = 'sl-settings-glowline';
        scroll.appendChild(fade);
        scroll.appendChild(glowline);
        box.appendChild(scroll);

        var footer = document.createElement('div');
        footer.className = 'sl-settings-footer';
        footer.appendChild(connectBtn);
        box.appendChild(footer);
    }

    function enhanceSettingsScreen() {
        var box = el('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box') || box.classList.contains('agp-connecting-box') ||
            el('agp-mini-lobby-list')) return;
        var isInitial = !!el('agp-tiktok-username');
        box.classList.toggle('sl-settings-initial-box', isInitial);
        if (isInitial) layoutInitialSettingsFields(box);
        if (box.querySelector('.sl-back-to-platform-btn')) return;
        if (el('agp-settings-player-list')) return;
        var connectBtn = box.querySelector('.agp-shell-btn-connect');
        if (!connectBtn) return;
        var backBtn = makeBackToPlatformBtn();
        if (isInitial) backBtn.textContent = 'العودة للمنصة ←';
        connectBtn.insertAdjacentElement('afterend', backBtn);
    }

    function enhanceLobbyHeading() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var h2 = box.querySelector('h2');
        if (!h2) return;
        if (h2.getAttribute('data-sl-heading') !== '1') {
            h2.textContent = 'لوبي الدخول للعبة "' + GAME_NAME + '"';
            h2.setAttribute('data-sl-heading', '1');
        }
    }

    var FRAMED_SLOT_W = 217;
    var FRAMED_SLOT_MAX_H = 75;
    var _slFrameBoundsCache = {};

    function getFrameOpaqueRows(src) {
        if (_slFrameBoundsCache[src]) return _slFrameBoundsCache[src];
        _slFrameBoundsCache[src] = new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                try {
                    var w = Math.min(img.naturalWidth, 300);
                    var h = Math.max(1, Math.round(img.naturalHeight * w / img.naturalWidth));
                    var c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    var ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    var data = ctx.getImageData(0, 0, w, h).data;
                    var top = -1, bottom = -1;
                    for (var y = 0; y < h && top < 0; y++) {
                        for (var x = 0; x < w; x++) { if (data[(y * w + x) * 4 + 3] > 16) { top = y; break; } }
                    }
                    for (var y2 = h - 1; y2 >= 0 && bottom < 0; y2--) {
                        for (var x2 = 0; x2 < w; x2++) { if (data[(y2 * w + x2) * 4 + 3] > 16) { bottom = y2 + 1; break; } }
                    }
                    resolve(top < 0 ? null : { top: top / h, bottom: bottom / h });
                } catch (e) { resolve(null); }
            };
            img.onerror = function () { resolve(null); };
            img.src = src;
        });
        return _slFrameBoundsCache[src];
    }

    function enhanceLobbyFramedCards() {
        var box = el('agp-shell-box');
        if (!box || !(box.classList.contains('agp-lobby-box') || el('agp-mini-lobby-list'))) return;
        var cards = box.querySelectorAll('.agp-shell-player-list .agp-pcard-tpl:not([data-sl-fit])');
        Array.prototype.forEach.call(cards, function (card) {
            var frameEl = card.querySelector('.agp-pcard-tpl-frame-img');
            var m = frameEl && /url\(["']?(.*?)["']?\)/.exec(frameEl.style.backgroundImage);
            if (!m) return;
            card.setAttribute('data-sl-fit', 'pending');
            getFrameOpaqueRows(m[1]).then(function (rows) {
                if (!rows || !card.isConnected) return;
                var frameTop = parseFloat(frameEl.style.top) || 0;
                var frameH = parseFloat(frameEl.style.height) || 0;
                var bandTop = frameTop + rows.top * frameH;
                var bandBottom = frameTop + rows.bottom * frameH;
                var children = card.querySelectorAll('.agp-pcard-tpl-avatar,.agp-pcard-tpl-name,.agp-pcard-tpl-frame-img');
                Array.prototype.forEach.call(children, function (child) {
                    if (child === frameEl) return;
                    var t = parseFloat(child.style.top) || 0;
                    var ch = parseFloat(child.style.height) || 0;
                    if (t < bandTop) bandTop = t;
                    if (t + ch > bandBottom) bandBottom = t + ch;
                });
                Array.prototype.forEach.call(children, function (child) {
                    child.style.top = ((parseFloat(child.style.top) || 0) - bandTop) + 'px';
                });
                var fullH = bandBottom - bandTop;
                var cardW = parseFloat(card.style.width) || 298;
                card.style.height = fullH + 'px';
                card.style.zoom = String(Math.min(FRAMED_SLOT_W / cardW, FRAMED_SLOT_MAX_H / fullH));
                card.setAttribute('data-sl-fit', '1');
            });
        });
    }

    function enhanceLobbyWatermarkAndActions() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;

        if (!box.querySelector('#sl-lobby-watermark')) {
            var img = document.createElement('img');
            img.id = 'sl-lobby-watermark';
            img.src = '../../logo.png';
            img.alt = '';
            box.insertBefore(img, box.firstChild);
        }

        var startBtn = el('agp-start-round-btn');
        if (!startBtn) return;
        if (startBtn.textContent.indexOf('اغلاق اللوبي') === -1) {
            startBtn.textContent = '🔒 اغلاق اللوبي وبدء المباراة';
        }

        var row = box.querySelector('.sl-lobby-actions-row');
        if (!row) {
            row = document.createElement('div');
            row.className = 'sl-lobby-actions-row';
            startBtn.parentNode.insertBefore(row, startBtn);
            row.appendChild(startBtn);
            var syncActionsHeight = function () {
                box.style.setProperty('--sl-actions-h',
                    (row.offsetHeight + (parseFloat(getComputedStyle(row).marginTop) || 0)) + 'px');
            };
            syncActionsHeight();
            if (window.ResizeObserver) new ResizeObserver(syncActionsHeight).observe(row);
        }

        if (!row.querySelector('.sl-back-to-platform-btn')) {
            var backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.className = 'sl-back-to-platform-btn';
            backBtn.textContent = '🏠 العودة لمكتبة الألعاب';
            backBtn.addEventListener('click', function () {
                window.location.href = '../../games.html';
            });
            row.appendChild(backBtn);
        }
    }

    // درج الإعدادات وسط المباراة (زر ⚙️) — نفس شكل درج روليت الإقصاء
    // (رأس + جسم كروت + زر إنهاء اللعب)، ويعرض فقط "إدخال لاعب جديد" لأن
    // باقي الإعدادات خاصة بما قبل المباراة.
    function enhanceReopenedDrawer() {
        var box = el('agp-shell-box');
        if (!box || !el('agp-settings-player-list')) return;
        box.classList.remove('sl-mini-lobby-active');
        box.classList.add('sl-inmatch-drawer');
        if (box.firstElementChild && box.firstElementChild.classList.contains('sl-drawer-header')) return;

        var originalChildren = Array.prototype.slice.call(box.children);
        var closeBtn = el('agp-settings-close-btn');
        var h2 = originalChildren.filter(function (n) { return n.tagName === 'H2'; })[0];
        var fieldNodes = originalChildren.filter(function (n) { return n !== closeBtn && n !== h2; });
        box.innerHTML = '';

        var header = document.createElement('div');
        header.className = 'sl-drawer-header';
        if (h2) { h2.textContent = 'الإعدادات'; header.appendChild(h2); }
        if (closeBtn) header.appendChild(closeBtn);
        box.appendChild(header);

        var playerMgmtRow = null;
        for (var i = 0; i < fieldNodes.length; i++) {
            if (fieldNodes[i].querySelector && fieldNodes[i].querySelector('.agp-settings-player-row')) { playerMgmtRow = fieldNodes[i]; break; }
        }
        var bodyWrap = document.createElement('div');
        bodyWrap.className = 'sl-drawer-body';
        if (playerMgmtRow) {
            var reopenBtn = playerMgmtRow.querySelector('#agp-reopen-registration-btn');
            if (reopenBtn) reopenBtn.innerHTML = '<span style="font-size:15px">+</span>إدخال لاعب جديد';
            bodyWrap.appendChild(playerMgmtRow);
        }
        box.appendChild(bodyWrap);

        var footer = document.createElement('div');
        footer.className = 'sl-drawer-footer';
        var endBtn = document.createElement('button');
        endBtn.type = 'button';
        endBtn.className = 'sl-drawer-end-btn';
        endBtn.textContent = 'إنهاء اللعب';
        endBtn.addEventListener('click', homeNavigate);
        footer.appendChild(endBtn);
        box.appendChild(footer);
    }

    function closeMiniLobbyToSettings() {
        if (AGP.gameShell && typeof AGP.gameShell.setSetting === 'function') {
            var s = AGP.gameShell.getSettings();
            var firstKey = Object.keys(s)[0];
            if (firstKey !== undefined) AGP.gameShell.setSetting(firstKey, s[firstKey]);
        }
    }

    function enhanceMiniLobby() {
        var box = el('agp-shell-box');
        if (!box || !el('agp-mini-lobby-list')) return;
        box.classList.remove('sl-inmatch-drawer');
        box.classList.add('sl-mini-lobby-active');

        var doneBtn = el('agp-mini-lobby-done-btn');
        if (doneBtn && doneBtn.textContent.indexOf('حفظ') === -1) {
            doneBtn.textContent = '💾 حفظ وإكمال المباراة';
        }
        if (!box.querySelector('.sl-mini-lobby-close-btn')) {
            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'sl-mini-lobby-close-btn';
            closeBtn.textContent = '✕';
            closeBtn.onclick = closeMiniLobbyToSettings;
            box.insertBefore(closeBtn, box.firstChild);
        }
        if (!box.querySelector('.sl-mini-lobby-info')) {
            var info = document.createElement('div');
            info.className = 'sl-mini-lobby-info';
            info.innerHTML =
                '<p>هذا الباب مخصص للاعبين الجدد اللي ما دخلوا الجولة الحالية بعد</p>' +
                '<p>اطلب منهم كتابة الكلمة المفتاحية نفسها في التعليقات، وبيظهرون هنا تلقائياً ويبدؤون من خط البداية</p>';
            var h2 = box.querySelector('h2');
            if (h2) h2.insertAdjacentElement('afterend', info);
        }
    }

    function applyShellEnhancements() {
        enhanceSettingsScreen();
        enhanceReopenedDrawer();
        enhanceMiniLobby();
        enhanceLobbyHeading();
        enhanceLobbyWatermarkAndActions();
        enhanceLobbyFramedCards();
    }

    /* ======================================================================
     *  13) طبقة "جاري الاتصال بالبث" — نفس روليت الإقصاء
     * ==================================================================== */
    var _slConnLayer = null;
    var _slConnKeywordBackup = '';
    var _slConnKeywordPending = false;
    var _slConnErrorShown = false;
    var _slConnErrorTimer = null;

    function ensureConnLayer() {
        if (_slConnLayer) return _slConnLayer;
        var layer = document.createElement('div');
        layer.id = 'sl-conn-layer';
        layer.innerHTML =
            '<div class="sl-conn-backdrop"></div>' +
            '<div class="sl-conn-modal">' +
                '<div class="sl-conn-icon"></div>' +
                '<h3 class="sl-conn-title"></h3>' +
                '<p class="sl-conn-sub"></p>' +
            '</div>';
        document.body.appendChild(layer);
        _slConnLayer = layer;
        return layer;
    }

    function showConnLayer(isError, title, sub) {
        var layer = ensureConnLayer();
        var modal = layer.querySelector('.sl-conn-modal');
        var icon = layer.querySelector('.sl-conn-icon');
        modal.classList.toggle('sl-conn-err', isError);
        icon.className = 'sl-conn-icon ' + (isError ? 'sl-conn-err-icon' : 'sl-conn-spinner');
        icon.textContent = isError ? '✕' : '';
        layer.querySelector('.sl-conn-title').textContent = title;
        layer.querySelector('.sl-conn-sub').textContent = sub || '';
        layer.classList.add('show');
    }

    // تفريغ النسخة الشبحية عند الإخفاء — عشان عناصرها (بنفس ids شاشة
    // الإعدادات مثل #agp-tiktok-username) ما تلخبط getElementById لاحقاً
    // (مثلاً درج الإعدادات وسط المباراة يُعامَل كأنه شاشة الإعدادات الأولى).
    function hideConnLayer() {
        if (!_slConnLayer) return;
        _slConnLayer.classList.remove('show');
        var backdrop = _slConnLayer.querySelector('.sl-conn-backdrop');
        if (backdrop) backdrop.innerHTML = '';
    }

    document.addEventListener('click', function (e) {
        if (!e.target || e.target.id !== 'agp-connect-btn') return;
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('sl-settings-initial-box')) return;
        var kInput = el('agp-keyword');
        _slConnKeywordBackup = kInput ? kInput.value : '';
        var ghost = box.cloneNode(true);
        ghost.id = 'agp-shell-box-ghost';
        var layer = ensureConnLayer();
        var backdrop = layer.querySelector('.sl-conn-backdrop');
        backdrop.innerHTML = '';
        backdrop.appendChild(ghost);
        _slConnErrorShown = false;
        showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
    }, true);

    function syncConnLayer() {
        var box = el('agp-shell-box');
        if (!box) return;

        if (box.classList.contains('agp-conn-error')) {
            if (!_slConnErrorShown) {
                _slConnErrorShown = true;
                var subEl = box.querySelector('.agp-shell-status');
                showConnLayer(true, 'تعذّر الاتصال', subEl ? subEl.textContent : 'تحقّق من اليوزرنيم وحاول مرة أخرى.');
                clearTimeout(_slConnErrorTimer);
                _slConnErrorTimer = setTimeout(function () {
                    hideConnLayer();
                    if (AGP.gameShell && typeof AGP.gameShell.setSetting === 'function') {
                        var s = AGP.gameShell.getSettings();
                        var firstKey = Object.keys(s)[0];
                        if (firstKey !== undefined) AGP.gameShell.setSetting(firstKey, s[firstKey]);
                    }
                    _slConnKeywordPending = true;
                }, 2400);
            }
            return;
        }

        if (box.classList.contains('agp-connecting-box')) {
            clearTimeout(_slConnErrorTimer);
            _slConnErrorShown = false;
            if (!_slConnLayer || !_slConnLayer.classList.contains('show')) {
                showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
            }
            return;
        }

        clearTimeout(_slConnErrorTimer);
        _slConnErrorShown = false;
        if (box.classList.contains('agp-lobby-box')) hideConnLayer();
        if (_slConnKeywordPending && box.classList.contains('sl-settings-initial-box')) {
            var kInput = el('agp-keyword');
            if (kInput) kInput.value = _slConnKeywordBackup;
            _slConnKeywordPending = false;
        }
    }

    function wireSharedShellEnhancements() {
        applyShellEnhancements();
        syncConnLayer();
        var overlay = el('agp-shell-overlay');
        if (!overlay) return;
        var observer = new MutationObserver(function () {
            applyShellEnhancements();
            syncConnLayer();
        });
        observer.observe(overlay, { childList: true, subtree: true });
    }

    /* ======================================================================
     *  14) تسجيل اللعبة
     * ==================================================================== */
    function registerGame() {
        if (!AGP.gameManager || !AGP.gameShell) {
            console.error('[AGP Snakes & Ladders] AGP Core/Game Shell غير محمَّل بعد — تأكد من ترتيب تحميل الملفات بـindex.html.');
            return;
        }
        injectStageStyles();
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'board-games',
            onLoad: function () { AGP.log('Snakes & Ladders: onLoad.'); },
            onPlayerJoin: function () { enforceMaxPlayers(); },
            onRoundEnd: function () { AGP.log('Snakes & Ladders: onRoundEnd.'); },
            onDestroy: function () {
                resetMatchState();
                AGP.log('Snakes & Ladders: onDestroy — match state cleared.');
            }
        });

        if (!registered) {
            AGP.log('Snakes & Ladders: registration failed (already registered?).');
            return;
        }

        AGP.gameManager.loadGame(GAME_ID);

        AGP.events.on('player:removed', function (payload) {
            handlePlayerRemoved(payload && payload.player);
        });
        AGP.events.on('player:joined', function (payload) {
            handlePlayerJoinedMidMatch(payload && payload.player);
        });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات لعبة السلم والثعبان',
            gameExplanation: 'لوحة من 1 إلى 100 والكأس 🏆 في المربع 100. كل لاعب يجيه دوره عنده 15 ثانية يكتب فيها بالشات ' +
                '"دور" أو "دوران" أو "ارم النرد" أو "roll" فيدور النرد ويمشي بعدد النقاط — السلم يطلّعه والثعبان ينزّله. ' +
                'لو ما كتب خلال 15 ثانية يروح عليه الدور. أول من يوصل للكأس يفوز، وتنتهي المباراة لما يكتمل عدد الفائزين المحدَّد.',
            connectButtonLabel: 'الاتصال بالبث والانتقال للوبي',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../games.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });

        wireSharedShellEnhancements();
    }

    AGP.events.on('platform:ready', function () {
        registerGame();
    });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
