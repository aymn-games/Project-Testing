/**
 * AGP LAMHA (لمحة) — لعبة أسئلة سريعة بالأدوار، مبنية على نفس هيكل ألعاب
 * المنصة (games/memory-challenge): نواة AGP كاملة + js/agp-game-shell.js
 * لشاشة الإعدادات والاتصال واللوبي، وشاشة اللعب نفسها خاصة بهذا الملف.
 *
 * طريقة اللعب:
 *  - كل جولة يدخل 3 لاعبين مختلفين بنفس الوقت، ولكل واحد منهم سؤاله ووقته
 *    ونقاطه الخاصة (دقيقة ونص أو دقيقتين حسب الإعدادات).
 *  - اللاعب يكتب الجواب بشات البث: الصح = +1 ويطلع له سؤال جديد على طول.
 *    يكتب «تخطي» = يُخصم منه نص نقطة (−0.5) ويطلع له سؤال جديد.
 *    الجواب الغلط ما يخصم شي، يقدر يحاول مرة ثانية لين يخلص وقته.
 *  - بنهاية وقت اللاعب تنحسب نقاطه كاملة، وبعد ما يخلص الثلاثة تطلع نتيجة
 *    الجولة، وبعدها الجولة الجاية بثلاثة لاعبين غيرهم.
 *  - بعد ما يلعب كل اللاعبين: تصفية. يتأهل أعلى 3 لو العدد أقل من 10،
 *    أعلى 6 لو 10 إلى 15، وأعلى 9 لو أكثر من 15. صاحب المركز الأول هو
 *    الفائز ويُرسل لنظام نقاط المنصة (AGPAuth.reportMatchPoints).
 *  - شاشة التصفية فيها زر اختياري لمرحلة جديدة بالمتأهلين فقط (النقاط
 *    تبدأ من الصفر)، أو مباراة جديدة.
 *
 * مطابقة الإجابة (normalizeAnswer): تتجاهل التشكيل والتطويل، وأشكال
 * الهمزة/الألف/الياء/التاء المربوطة، و«ال» التعريف، وحالة الأحرف
 * اللاتينية، والرموز مثل النقطة و+ والمسافات. الأرقام الهندية تتحوّل
 * لأرقام عادية.
 *
 * لا تعديل على أي ملف مشترك — كل شيء هنا بأسماء تبدأ بـ "lm-".
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'lamha';
    var GAME_NAME = 'لمحة';
    var SLOTS_PER_ROUND = 3;
    var CORRECT_POINTS = 1;
    var SKIP_PENALTY = 0.5;
    var SKIP_WORDS = ['تخطي', 'skip'];

    // لون مميز لكل خانة من خانات اللاعبين الثلاثة، عشان يفرق المشاهد بينهم.
    var SLOT_COLORS = ['#22d3ee', '#f472b6', '#fbbf24'];
    var ACC = '#fbbf24';

    /* ======================================================================
     *  1) الحالة
     * ==================================================================== */
    var _matchActive = false;
    var _phase = 'idle';          // idle | ready | playing | roundEnd | stageEnd
    var _stage = 1;
    var _stagePlayers = [];       // ترتيب الأدوار بهذه المرحلة
    var _queueIdx = 0;            // أول لاعب ما لعب للحين
    var _round = 0;
    var _slots = [];              // [{player, color, q, endsAt, done, flash, lastTry}]
    var _stats = {};              // id -> {score, correct, skips, played, order}
    var _playOrder = 0;
    var _deck = [];
    var _deckIdx = 0;
    var _turnSeconds = 90;
    var _startedAt = null;
    var _tickIv = null;
    var _commentUnsub = null;
    var _roundEndTimer = null;
    var _panelTab = 'board';
    var _result = null;           // نتيجة التصفية الأخيرة

    function resetMatchState() {
        _matchActive = false;
        _phase = 'idle';
        _stage = 1;
        _stagePlayers = [];
        _queueIdx = 0;
        _round = 0;
        _slots = [];
        _stats = {};
        _playOrder = 0;
        _startedAt = null;
        _result = null;
        clearTimeout(_roundEndTimer);
        if (typeof _commentUnsub === 'function') { _commentUnsub(); _commentUnsub = null; }
    }

    function liveSettings() {
        return (AGP.gameShell && typeof AGP.gameShell.getSettings === 'function') ? AGP.gameShell.getSettings() : {};
    }
    function turnSecondsSetting() { var v = Number(liveSettings().turnSeconds); return v === 120 ? 120 : 90; }

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
    function shuffle(a) {
        a = a.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }
    function normalizeDigits(text) {
        return String(text).replace(/[٠-٩۰-۹]/g, function (ch) {
            var code = ch.charCodeAt(0);
            return String(code >= 0x06F0 ? code - 0x06F0 : code - 0x0660);
        });
    }
    function fmtScore(n) {
        var v = Math.round(n * 10) / 10;
        return (v % 1 === 0) ? String(v) : v.toFixed(1);
    }
    function fmtTime(sec) {
        sec = Math.max(0, Math.ceil(sec));
        var m = Math.floor(sec / 60), s = sec % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    /**
     * توحيد النص قبل المقارنة — نفس الدالة للإجابة اللي بالبنك وللتعليق.
     * يرجع النص بدون مسافات أو رموز، فـ"Ulan Bator" = "ulanbator" و ".ky" = "ky"
     * و "+961" = "961" و "الأمريكتين" = "امريكتين".
     */
    function normalizeAnswer(text) {
        var s = normalizeDigits(String(text || '')).toLowerCase();
        try { s = s.normalize('NFKD'); } catch (e) { /* متصفح قديم */ }
        s = s.replace(/[̀-ًͯ-ٰٟـ]/g, '')
            .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
            .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
        var words = s.split(/[^a-z0-9ء-ي]+/).filter(Boolean).map(function (w) {
            return (w.length > 3 && w.indexOf('ال') === 0) ? w.slice(2) : w;
        });
        return words.join('');
    }

    function statsOf(id) {
        if (!_stats[id]) _stats[id] = { score: 0, correct: 0, skips: 0, played: false, order: 0 };
        return _stats[id];
    }

    // الترتيب: النقاط، ثم عدد الإجابات الصحيحة، ثم الأقل تخطي، ثم الأسبق باللعب.
    function ranked(players) {
        return players.slice().sort(function (a, b) {
            var sa = statsOf(a.id), sb = statsOf(b.id);
            return (sb.score - sa.score) || (sb.correct - sa.correct) || (sa.skips - sb.skips) || (sa.order - sb.order);
        });
    }

    function qualifyCount(n) {
        if (n > 15) return 9;
        if (n >= 10) return 6;
        return 3;
    }

    function totalRounds() { return Math.max(1, Math.ceil(_stagePlayers.length / SLOTS_PER_ROUND)); }
    function playedPlayers() { return _stagePlayers.filter(function (p) { return statsOf(p.id).played; }); }

    function nextQuestion() {
        var bank = AGP.lamhaQuestions || [];
        if (!bank.length) return { q: 'بنك الأسئلة غير محمّل', a: '', c: '', key: '' };
        if (!_deck.length || _deckIdx >= _deck.length) { _deck = shuffle(bank); _deckIdx = 0; }
        var item = _deck[_deckIdx++];
        return { q: item[0], a: item[1], c: item[2], key: normalizeAnswer(item[1]) };
    }

    function avatarHtml(player, cls) {
        var name = playerLabel(player);
        var initials = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        var url = player && player.avatarUrl;
        var fallback = '<div class="' + cls + ' lm-av-fallback">' + escapeHtml(initials) + '</div>';
        if (!url) return fallback;
        return '<img class="' + cls + '" src="' + escapeHtml(url) + '" alt="" referrerpolicy="no-referrer" ' +
            'onerror="this.style.display=\'none\';if(this.nextSibling)this.nextSibling.style.display=\'flex\';">' +
            fallback.replace('class="', 'style="display:none" class="');
    }

    /* ======================================================================
     *  3) الأصوات (Web Audio بدون ملفات)
     * ==================================================================== */
    var Sfx = {
        ac: null, out: null, muted: false,
        volume: function () {
            var v = liveSettings().soundVolume;
            if (v === undefined || v === null || isNaN(v)) v = 6;
            return Math.max(0, Math.min(10, v)) / 10;
        },
        ctx: function () {
            if (!this.ac) {
                var A = window.AudioContext || window.webkitAudioContext;
                if (!A) return null;
                try { this.ac = new A(); } catch (e) { return null; }
                this.out = this.ac.createGain();
                this.out.connect(this.ac.destination);
            }
            if (this.ac.state === 'suspended') this.ac.resume();
            this.out.gain.value = this.muted ? 0 : this.volume();
            return this.ac;
        },
        tone: function (f, d, at, type, vol) {
            if (this.muted || this.volume() <= 0) return;
            var ac = this.ctx(); if (!ac) return;
            var t = ac.currentTime + (at || 0), osc = ac.createOscillator(), g = ac.createGain();
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            osc.connect(g); g.connect(this.out); osc.start(t); osc.stop(t + d + 0.05);
        },
        play: function (name) {
            var self = this;
            switch (name) {
                case 'start': [523, 659, 784, 1047].forEach(function (f, k) { self.tone(f, 0.2, k * 0.08, 'triangle', 0.16); }); break;
                case 'correct': self.tone(880, 0.12, 0, 'triangle', 0.2); self.tone(1320, 0.18, 0.08, 'triangle', 0.18); break;
                case 'skip': self.tone(330, 0.18, 0, 'sawtooth', 0.08); self.tone(247, 0.22, 0.1, 'sawtooth', 0.07); break;
                case 'tick': self.tone(1000, 0.05, 0, 'square', 0.05); break;
                case 'end': [784, 659, 523].forEach(function (f, k) { self.tone(f, 0.25, k * 0.12, 'triangle', 0.16); }); break;
                case 'win': [523, 659, 784, 1047, 784, 1047].forEach(function (f, k) { self.tone(f, 0.22, k * 0.12, 'triangle', 0.18); }); break;
                case 'click': self.tone(600, 0.05, 0, 'sine', 0.08); break;
            }
        }
    };

    /* ======================================================================
     *  4) الخطوط والتنسيق
     * ==================================================================== */
    function ensureFonts() {
        if (el('lm-font-readex')) return;
        var link = document.createElement('link');
        link.id = 'lm-font-readex';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300..700&display=swap';
        document.head.appendChild(link);
    }

    function injectStyles() {
        if (el('lm-styles')) return;
        ensureFonts();
        var style = document.createElement('style');
        style.id = 'lm-styles';
        style.textContent = [
            ':root{--agp-accent:' + ACC + ';}',

            /* شاشة اللعب — تحت هيدر المنصة الثابت (70px) */
            '#lm-stage{position:fixed;inset:0;padding:calc(70px + clamp(6px,1.2vmin,14px)) clamp(10px,2vmin,32px) clamp(10px,2vmin,28px);',
            'box-sizing:border-box;overflow:hidden;font-family:"Readex Pro","Cairo",sans-serif;color:#F3F1FA;direction:rtl;',
            'background:radial-gradient(1200px 600px at 85% -10%,rgba(251,191,36,.12),transparent 60%),',
            'radial-gradient(900px 500px at 0% 110%,rgba(34,211,238,.10),transparent 60%),#0A0A14;',
            'display:flex;flex-direction:column;gap:clamp(8px,1.6vmin,18px);-webkit-font-smoothing:antialiased;}',
            '#lm-stage *{box-sizing:border-box;}',
            '.lm-num{font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate;}',

            /* الشريط العلوي */
            '.lm-topbar{flex:none;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;}',
            '.lm-brand{display:flex;align-items:baseline;gap:12px;}',
            '.lm-brand-title{font-size:clamp(24px,4vmin,42px);font-weight:700;color:' + ACC + ';letter-spacing:.5px;}',
            '.lm-brand-sub{font-size:clamp(11px,1.5vmin,15px);color:#A9A4BF;}',
            '.lm-top-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}',
            '.lm-chip{display:inline-flex;align-items:center;gap:8px;height:clamp(32px,4.4vmin,40px);padding:0 14px;border-radius:999px;',
            'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);color:#F3F1FA;font:inherit;font-size:clamp(12px,1.6vmin,15px);white-space:nowrap;}',
            'button.lm-chip{cursor:pointer;}button.lm-chip:hover{background:rgba(255,255,255,.10);}',
            '.lm-chip-label{color:#A9A4BF;}.lm-chip-val{font-weight:700;}',
            '.lm-phase{background:rgba(251,191,36,.14);border-color:rgba(251,191,36,.45);color:' + ACC + ';font-weight:700;}',

            /* التوزيع: خانات اللاعبين + لوحة النقاط */
            '.lm-main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) clamp(240px,24vw,340px);gap:clamp(10px,1.6vmin,18px);}',
            '.lm-main.lm-narrow{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) auto;}',
            '.lm-main.lm-narrow .lm-panel{max-height:30vh;}',
            '.lm-play{min-height:0;display:flex;flex-direction:column;gap:clamp(8px,1.4vmin,16px);}',
            '.lm-slots{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(8px,1.4vmin,16px);}',
            '.lm-card{background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.09);',
            'border-radius:clamp(14px,2vmin,22px);}',

            /* خانة لاعب */
            '.lm-slot{--c:#fff;position:relative;min-height:0;display:flex;flex-direction:column;align-items:center;gap:clamp(6px,1.1vmin,12px);',
            'padding:clamp(10px,1.8vmin,20px);overflow:hidden;transition:border-color .25s,box-shadow .25s;}',
            '.lm-slot::before{content:"";position:absolute;inset:0 0 auto 0;height:4px;background:var(--c);opacity:.85;}',
            '.lm-slot.lm-empty{opacity:.35;justify-content:center;}',
            '.lm-slot.lm-done{opacity:.72;}',
            '.lm-slot.lm-flash-ok{border-color:#34d399;box-shadow:0 0 0 2px rgba(52,211,153,.45),0 0 40px rgba(52,211,153,.25);}',
            '.lm-slot.lm-flash-skip{border-color:#fb923c;box-shadow:0 0 0 2px rgba(251,146,60,.45),0 0 40px rgba(251,146,60,.2);}',
            '.lm-who{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;}',
            '.lm-ring{--p:1;position:relative;width:clamp(78px,13vmin,132px);aspect-ratio:1;border-radius:50%;padding:clamp(4px,.7vmin,7px);',
            'background:conic-gradient(var(--c) calc(var(--p) * 360deg),rgba(255,255,255,.10) 0);}',
            '.lm-ring.lm-low{animation:lm-pulse .8s ease-in-out infinite;}',
            '@keyframes lm-pulse{50%{filter:brightness(1.5) drop-shadow(0 0 10px var(--c));}}',
            '.lm-ring-in{width:100%;height:100%;border-radius:50%;background:#0A0A14;padding:3px;overflow:hidden;}',
            '.lm-av{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;}',
            '.lm-av-fallback{display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);color:#fff;font-weight:700;font-size:1.6em;}',
            '.lm-timer-badge{position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);padding:2px 10px;border-radius:999px;',
            'background:#0A0A14;border:1.5px solid var(--c);color:var(--c);font-weight:700;font-size:clamp(12px,1.7vmin,16px);}',
            '.lm-name{max-width:100%;padding:4px 14px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);',
            'font-weight:700;font-size:clamp(14px,2.1vmin,22px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px;}',
            '.lm-score-row{display:flex;align-items:center;justify-content:center;gap:clamp(8px,1.4vmin,16px);width:100%;}',
            '.lm-score{display:flex;flex-direction:column;align-items:center;line-height:1;}',
            '.lm-score-val{font-size:clamp(30px,6vmin,64px);font-weight:700;color:var(--c);}',
            '.lm-score-lbl{font-size:clamp(10px,1.3vmin,13px);color:#A9A4BF;margin-top:4px;}',
            '.lm-mini{display:flex;flex-direction:column;gap:4px;font-size:clamp(11px,1.5vmin,15px);}',
            '.lm-mini span{display:flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;background:rgba(255,255,255,.05);}',
            '.lm-mini .lm-ok{color:#34d399;}.lm-mini .lm-sk{color:#fb923c;}',
            '.lm-q{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;',
            'padding:clamp(10px,1.6vmin,18px);border-radius:16px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.07);text-align:center;}',
            '.lm-q-cat{font-size:clamp(10px,1.35vmin,13px);color:var(--c);padding:2px 10px;border-radius:999px;border:1px solid var(--c);opacity:.9;}',
            '.lm-q-text{font-size:clamp(17px,3.6vmin,40px);font-weight:600;line-height:1.5;overflow-wrap:anywhere;}',
            '.lm-q-text.lm-pop{animation:lm-pop .35s ease-out;}',
            '@keyframes lm-pop{0%{transform:scale(.85);opacity:0;}100%{transform:none;opacity:1;}}',
            '.lm-feed{min-height:1.6em;font-size:clamp(11px,1.5vmin,15px);color:#A9A4BF;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '.lm-feed b{color:#F3F1FA;}',
            '.lm-float{position:absolute;top:38%;left:50%;transform:translate(-50%,0);font-size:clamp(28px,5vmin,52px);font-weight:800;pointer-events:none;',
            'animation:lm-float 1s ease-out forwards;}',
            '@keyframes lm-float{0%{opacity:0;transform:translate(-50%,10px) scale(.8);}20%{opacity:1;}100%{opacity:0;transform:translate(-50%,-60px) scale(1.1);}}',
            '.lm-done-tag{position:absolute;top:14px;left:14px;font-size:12px;padding:2px 10px;border-radius:999px;background:rgba(255,255,255,.1);color:#fff;}',
            '.lm-wait-name{font-size:clamp(13px,1.8vmin,18px);color:#A9A4BF;}',

            /* شريط التحكم */
            '.lm-bar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:clamp(8px,1.4vmin,14px) clamp(12px,2vmin,20px);}',
            '.lm-hint{font-size:clamp(12px,1.7vmin,17px);color:#D6D2E6;}',
            '.lm-hint b{color:' + ACC + ';}',
            '.lm-primary{flex:none;height:clamp(38px,5.2vmin,50px);padding:0 clamp(18px,3vmin,32px);border:0;border-radius:999px;cursor:pointer;',
            'background:' + ACC + ';color:#1a1205;font:inherit;font-weight:700;font-size:clamp(14px,2vmin,18px);box-shadow:0 6px 24px rgba(251,191,36,.3);}',
            '.lm-primary:hover{filter:brightness(1.08);}',
            '.lm-primary[hidden]{display:none;}',

            /* لوحة النقاط */
            '.lm-panel{min-height:0;display:flex;flex-direction:column;overflow:hidden;}',
            '.lm-tabs{flex:none;display:flex;gap:6px;padding:10px;border-bottom:1px solid rgba(255,255,255,.07);}',
            '.lm-tab{flex:1;height:34px;border-radius:10px;border:1px solid transparent;background:transparent;color:#A9A4BF;font:inherit;font-size:14px;cursor:pointer;}',
            '.lm-tab.lm-on{background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.4);color:' + ACC + ';font-weight:700;}',
            '.lm-cut-note{flex:none;padding:8px 14px 0;font-size:12px;color:#A9A4BF;}',
            '.lm-list{flex:1;min-height:0;overflow-y:auto;padding:8px 10px 12px;display:flex;flex-direction:column;gap:6px;scrollbar-width:thin;}',
            '.lm-row{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid transparent;}',
            '.lm-row.lm-q-zone{background:rgba(251,191,36,.07);border-color:rgba(251,191,36,.22);}',
            '.lm-row.lm-live{border-color:rgba(255,255,255,.25);}',
            '.lm-rank{width:24px;text-align:center;font-weight:700;color:#A9A4BF;font-size:13px;}',
            '.lm-row.lm-q-zone .lm-rank{color:' + ACC + ';}',
            '.lm-row-av{width:30px;height:30px;flex:none;border-radius:50%;overflow:hidden;}',
            '.lm-row-av .lm-av-fallback{font-size:12px;}',
            '.lm-row-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;}',
            '.lm-row-score{font-weight:700;font-size:15px;}',
            '.lm-cutline{display:flex;align-items:center;gap:8px;font-size:11px;color:#fb7185;margin:2px 0;}',
            '.lm-cutline::before,.lm-cutline::after{content:"";flex:1;height:1px;background:rgba(251,113,133,.45);}',
            '.lm-empty-list{color:#7d7894;font-size:13px;text-align:center;padding:16px 0;}',

            /* نوافذ نتيجة الجولة والتصفية */
            '#lm-overlay{position:fixed;inset:0;z-index:99980;display:none;align-items:center;justify-content:center;padding:84px 16px 16px;',
            'background:rgba(5,5,12,.74);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);direction:rtl;font-family:"Readex Pro","Cairo",sans-serif;color:#F3F1FA;}',
            '#lm-overlay.lm-show{display:flex;}',
            '.lm-modal{width:min(980px,100%);max-height:100%;overflow-y:auto;padding:clamp(16px,3vmin,32px);border-radius:24px;',
            'background:linear-gradient(180deg,#171629,#0F0E1C);border:1px solid rgba(255,255,255,.1);box-shadow:0 30px 80px rgba(0,0,0,.5);}',
            '.lm-modal h2{margin:0 0 6px;font-size:clamp(20px,3.2vmin,30px);text-align:center;}',
            '.lm-modal-sub{margin:0 0 18px;text-align:center;color:#A9A4BF;font-size:clamp(12px,1.7vmin,15px);}',
            '.lm-res-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;}',
            '.lm-res-card{--c:#fff;position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px 12px;border-radius:18px;',
            'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);}',
            '.lm-res-card::before{content:"";position:absolute;inset:0 0 auto 0;height:4px;border-radius:18px 18px 0 0;background:var(--c);}',
            '.lm-res-av{width:84px;height:84px;border-radius:50%;padding:3px;background:var(--c);}',
            '.lm-res-av > *{width:100%;height:100%;border-radius:50%;object-fit:cover;}',
            '.lm-res-name{font-weight:700;font-size:17px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.lm-res-score{font-size:40px;font-weight:700;color:var(--c);line-height:1;}',
            '.lm-res-meta{display:flex;gap:10px;font-size:13px;color:#A9A4BF;}',
            '.lm-res-meta .lm-ok{color:#34d399;}.lm-res-meta .lm-sk{color:#fb923c;}',
            '.lm-modal-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:22px;}',
            '.lm-btn2{height:44px;padding:0 20px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);',
            'color:#fff;font:inherit;font-weight:600;cursor:pointer;}',
            '.lm-btn2:hover{background:rgba(255,255,255,.12);}',
            '.lm-final{display:grid;grid-template-columns:auto minmax(0,1fr);gap:clamp(14px,3vmin,30px);align-items:start;}',
            '.lm-final.lm-narrow{grid-template-columns:1fr;justify-items:center;}',
            '.lm-final-list{display:flex;flex-direction:column;gap:6px;width:100%;}',
            '.lm-final-head{font-size:14px;font-weight:700;margin:6px 0 2px;}',
            '.lm-final-head.lm-qual{color:' + ACC + ';}.lm-final-head.lm-out{color:#fb7185;}',
            '.lm-row.lm-out-row{opacity:.6;}',
            '.lm-trophy-gold{--agp-trophy-accent:' + ACC + ';}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  5) بناء شاشة اللعب
     * ==================================================================== */
    function ensureStage() {
        injectStyles();
        if (el('lm-stage')) { el('lm-stage').style.display = 'flex'; return; }

        var stage = document.createElement('div');
        stage.id = 'lm-stage';
        stage.innerHTML =
            '<div class="lm-topbar">' +
                '<div class="lm-brand">' +
                    '<div class="lm-brand-title">' + escapeHtml(GAME_NAME) + '</div>' +
                    '<div class="lm-brand-sub">جاوب · تخطّى · اجمع نقاطك قبل ما يخلص وقتك</div>' +
                '</div>' +
                '<div class="lm-top-actions">' +
                    '<button type="button" class="lm-chip" id="lm-settings-btn">⚙ الإعدادات</button>' +
                    '<div class="lm-chip"><span class="lm-chip-label">المرحلة</span><span class="lm-chip-val lm-num" id="lm-stage-val">1</span></div>' +
                    '<div class="lm-chip"><span class="lm-chip-label">الجولة</span><span class="lm-chip-val lm-num" id="lm-round-val">0 / 0</span></div>' +
                    '<div class="lm-chip"><span class="lm-chip-label">لعبوا</span><span class="lm-chip-val lm-num" id="lm-played-val">0 / 0</span></div>' +
                    '<div class="lm-chip lm-phase" id="lm-phase">بالانتظار</div>' +
                    '<button type="button" class="lm-chip" id="lm-mute-btn" title="الصوت">🔊</button>' +
                '</div>' +
            '</div>' +
            '<div class="lm-main" id="lm-main">' +
                '<div class="lm-play">' +
                    '<div class="lm-slots" id="lm-slots"></div>' +
                    '<div class="lm-card lm-bar">' +
                        '<div class="lm-hint" id="lm-hint"></div>' +
                        '<button type="button" class="lm-primary" id="lm-primary-btn" hidden></button>' +
                    '</div>' +
                '</div>' +
                '<div class="lm-card lm-panel">' +
                    '<div class="lm-tabs">' +
                        '<button type="button" class="lm-tab lm-on" data-tab="board">🏆 النقاط</button>' +
                        '<button type="button" class="lm-tab" data-tab="queue">⏳ الدور الجاي</button>' +
                    '</div>' +
                    '<div class="lm-cut-note" id="lm-cut-note"></div>' +
                    '<div class="lm-list" id="lm-list"></div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(stage);

        var overlay = document.createElement('div');
        overlay.id = 'lm-overlay';
        overlay.innerHTML = '<div class="lm-modal" id="lm-modal"></div>';
        document.body.appendChild(overlay);

        el('lm-settings-btn').onclick = function () {
            Sfx.play('click');
            var gear = el('agp-header-settings-btn');
            if (gear) gear.click();
        };
        el('lm-mute-btn').onclick = function () {
            Sfx.muted = !Sfx.muted;
            el('lm-mute-btn').textContent = Sfx.muted ? '🔇' : '🔊';
        };
        el('lm-primary-btn').onclick = primaryAction;
        Array.prototype.forEach.call(stage.querySelectorAll('.lm-tab'), function (btn) {
            btn.onclick = function () {
                _panelTab = btn.getAttribute('data-tab');
                Array.prototype.forEach.call(stage.querySelectorAll('.lm-tab'), function (b) { b.classList.toggle('lm-on', b === btn); });
                renderPanel();
            };
        });
        window.addEventListener('resize', renderLayout);
        renderLayout();
    }

    function renderLayout() {
        var main = el('lm-main');
        if (!main) return;
        var vw = window.innerWidth, vh = window.innerHeight;
        main.classList.toggle('lm-narrow', vw < 900 || vw / vh < 1.2);
    }

    /* ======================================================================
     *  6) الرسم
     * ==================================================================== */
    function renderTop() {
        if (!el('lm-stage')) return;
        el('lm-stage-val').textContent = String(_stage);
        el('lm-round-val').textContent = _round + ' / ' + totalRounds();
        el('lm-played-val').textContent = playedPlayers().length + ' / ' + _stagePlayers.length;
        var labels = { idle: 'بالانتظار', ready: 'جاهزين', playing: 'جاري اللعب', roundEnd: 'نتيجة الجولة', stageEnd: 'التصفية' };
        el('lm-phase').textContent = labels[_phase] || '';
    }

    function slotHtml(slot, i) {
        var color = SLOT_COLORS[i % SLOT_COLORS.length];
        if (!slot) {
            return '<div class="lm-card lm-slot lm-empty" style="--c:' + color + '"><div class="lm-wait-name">خانة فاضية</div></div>';
        }
        var p = slot.player;
        var st = statsOf(p.id);
        var waiting = _phase === 'ready';
        var qHtml = waiting
            ? '<div class="lm-q-text" style="color:#A9A4BF;font-size:clamp(14px,2.2vmin,22px)">جاهز؟ السؤال يطلع أول ما تبدأ الجولة</div>'
            : (slot.done
                ? '<div class="lm-q-text" style="color:#A9A4BF">⏱ خلص الوقت</div>'
                : '<span class="lm-q-cat">' + escapeHtml(slot.q.c) + '</span><div class="lm-q-text" data-q="1">' + escapeHtml(slot.q.q) + '</div>');
        return '<div class="lm-card lm-slot' + (slot.done ? ' lm-done' : '') + '" data-slot="' + i + '" style="--c:' + color + '">' +
            (slot.done ? '<span class="lm-done-tag">انتهى دوره</span>' : '') +
            '<div class="lm-who">' +
                '<div class="lm-ring" data-ring="1"><div class="lm-ring-in">' + avatarHtml(p, 'lm-av') + '</div>' +
                    '<span class="lm-timer-badge lm-num" data-timer="1">' + fmtTime(slotRemaining(slot)) + '</span></div>' +
                '<div class="lm-name" dir="auto">' + escapeHtml(playerLabel(p)) + '</div>' +
            '</div>' +
            '<div class="lm-score-row">' +
                '<div class="lm-score"><span class="lm-score-val lm-num" data-score="1">' + fmtScore(st.score) + '</span><span class="lm-score-lbl">نقطة</span></div>' +
                '<div class="lm-mini">' +
                    '<span class="lm-ok">✓ <b class="lm-num" data-correct="1">' + st.correct + '</b> صح</span>' +
                    '<span class="lm-sk">⏭ <b class="lm-num" data-skips="1">' + st.skips + '</b> تخطي</span>' +
                '</div>' +
            '</div>' +
            '<div class="lm-q">' + qHtml + '</div>' +
            '<div class="lm-feed" data-feed="1">' + (slot.lastTry ? 'آخر محاولة: <b dir="auto">' + escapeHtml(slot.lastTry) + '</b>' : '&nbsp;') + '</div>' +
        '</div>';
    }

    function renderSlots() {
        var wrap = el('lm-slots');
        if (!wrap) return;
        var html = '';
        for (var i = 0; i < SLOTS_PER_ROUND; i++) html += slotHtml(_slots[i] || null, i);
        wrap.innerHTML = html;
        renderTimers();
    }

    function slotRemaining(slot) {
        if (!slot) return 0;
        if (_phase === 'ready' || !slot.endsAt) return _turnSeconds;
        if (slot.done) return 0;
        return Math.max(0, (slot.endsAt - Date.now()) / 1000);
    }

    // تحديث خفيف (بدون إعادة بناء) للمؤقت وحلقة الوقت حول صورة كل لاعب.
    function renderTimers() {
        var wrap = el('lm-slots');
        if (!wrap) return;
        _slots.forEach(function (slot, i) {
            var card = wrap.querySelector('[data-slot="' + i + '"]');
            if (!card || !slot) return;
            var rem = slotRemaining(slot);
            var ring = card.querySelector('[data-ring]');
            var badge = card.querySelector('[data-timer]');
            if (ring) {
                ring.style.setProperty('--p', String(Math.max(0, Math.min(1, rem / _turnSeconds))));
                ring.classList.toggle('lm-low', _phase === 'playing' && !slot.done && rem <= 10);
            }
            if (badge) badge.textContent = fmtTime(rem);
        });
    }

    function updateSlotNumbers(i) {
        var slot = _slots[i];
        var card = el('lm-slots') && el('lm-slots').querySelector('[data-slot="' + i + '"]');
        if (!slot || !card) return;
        var st = statsOf(slot.player.id);
        card.querySelector('[data-score]').textContent = fmtScore(st.score);
        card.querySelector('[data-correct]').textContent = String(st.correct);
        card.querySelector('[data-skips]').textContent = String(st.skips);
    }

    function showQuestionIn(i) {
        var slot = _slots[i];
        var card = el('lm-slots') && el('lm-slots').querySelector('[data-slot="' + i + '"]');
        if (!slot || !card) return;
        var box = card.querySelector('.lm-q');
        box.innerHTML = '<span class="lm-q-cat">' + escapeHtml(slot.q.c) + '</span><div class="lm-q-text lm-pop" data-q="1">' + escapeHtml(slot.q.q) + '</div>';
    }

    function flashSlot(i, kind, text) {
        var card = el('lm-slots') && el('lm-slots').querySelector('[data-slot="' + i + '"]');
        if (!card) return;
        var cls = kind === 'ok' ? 'lm-flash-ok' : 'lm-flash-skip';
        card.classList.remove('lm-flash-ok', 'lm-flash-skip');
        void card.offsetWidth;
        card.classList.add(cls);
        setTimeout(function () { card.classList.remove(cls); }, 650);
        var f = document.createElement('div');
        f.className = 'lm-float lm-num';
        f.style.color = kind === 'ok' ? '#34d399' : '#fb923c';
        f.textContent = text;
        card.appendChild(f);
        setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1000);
    }

    function setFeed(i, html) {
        var card = el('lm-slots') && el('lm-slots').querySelector('[data-slot="' + i + '"]');
        var feed = card && card.querySelector('[data-feed]');
        if (feed) feed.innerHTML = html;
    }

    function renderBar() {
        var hint = el('lm-hint'), btn = el('lm-primary-btn');
        if (!hint || !btn) return;
        btn.hidden = true;
        if (_phase === 'ready') {
            hint.innerHTML = 'كل لاعب يجاوب على سؤاله بالشات · الجواب الصح <b>+1</b> · اكتب <b>تخطي</b> لسؤال جديد <b>−0.5</b>';
            btn.hidden = false;
            btn.textContent = '▶ ابدأ الجولة ' + _round;
        } else if (_phase === 'playing') {
            hint.innerHTML = 'اكتب الجواب بالشات · <b>تخطي</b> = سؤال جديد وخصم نص نقطة · الوقت: <b class="lm-num">' + fmtTime(_turnSeconds) + '</b> لكل لاعب';
        } else if (_phase === 'roundEnd') {
            hint.innerHTML = 'انتهت الجولة ' + _round;
            btn.hidden = false;
            btn.textContent = _queueIdx >= _stagePlayers.length ? '🏁 عرض نتيجة التصفية' : '⏭ الجولة التالية';
        } else if (_phase === 'stageEnd') {
            hint.innerHTML = 'انتهت المرحلة ' + _stage;
            btn.hidden = false;
            btn.textContent = '🏆 عرض النتيجة';
        } else {
            hint.textContent = '';
        }
    }

    function rowHtml(p, rank, extraCls, rightHtml) {
        return '<div class="lm-row ' + (extraCls || '') + '">' +
            '<span class="lm-rank lm-num">' + (rank || '') + '</span>' +
            '<div class="lm-row-av">' + avatarHtml(p, 'lm-av') + '</div>' +
            '<span class="lm-row-name" dir="auto">' + escapeHtml(playerLabel(p)) + '</span>' +
            rightHtml +
        '</div>';
    }

    function renderPanel() {
        var list = el('lm-list'), note = el('lm-cut-note');
        if (!list) return;
        var n = _stagePlayers.length;
        var q = Math.min(qualifyCount(n), n);
        var liveIds = {};
        _slots.forEach(function (s) { if (s && _phase === 'playing' && !s.done) liveIds[s.player.id] = true; });

        if (_panelTab === 'board') {
            note.textContent = 'يتأهل أعلى ' + q + ' من ' + n + ' بعد ما يلعب الكل';
            var played = ranked(_stagePlayers.filter(function (p) { return statsOf(p.id).played || liveIds[p.id]; }));
            if (!played.length) { list.innerHTML = '<div class="lm-empty-list">النقاط تظهر هنا أول ما تبدأ الجولة</div>'; return; }
            var html = '';
            played.forEach(function (p, idx) {
                if (idx === q) html += '<div class="lm-cutline">خط التأهل</div>';
                html += rowHtml(p, idx + 1, (idx < q ? 'lm-q-zone' : '') + (liveIds[p.id] ? ' lm-live' : ''),
                    '<span class="lm-row-score lm-num">' + fmtScore(statsOf(p.id).score) + '</span>');
            });
            list.innerHTML = html;
        } else {
            var waiting = _stagePlayers.slice(_queueIdx);
            note.textContent = 'بالانتظار: ' + waiting.length;
            if (!waiting.length) { list.innerHTML = '<div class="lm-empty-list">ما فيه أحد بالانتظار</div>'; return; }
            list.innerHTML = waiting.map(function (p, idx) {
                var r = _round + 1 + Math.floor(idx / SLOTS_PER_ROUND);
                return rowHtml(p, idx + 1, '', '<span class="lm-row-score" style="font-size:12px;color:#A9A4BF">الجولة <span class="lm-num">' + r + '</span></span>');
            }).join('');
        }
    }

    function renderAll() {
        renderTop();
        renderSlots();
        renderBar();
        renderPanel();
    }

    /* ======================================================================
     *  7) دورة الجولات
     * ==================================================================== */
    function primaryAction() {
        Sfx.play('click');
        if (_phase === 'ready') startRound();
        else if (_phase === 'roundEnd') { closeOverlay(); prepareNextRound(); }
        else if (_phase === 'stageEnd') { if (_result) renderStageEnd(_result.pointsResult); }
    }

    // يجهّز الثلاثة اللاعبين الجايين ويعرضهم قبل ما يضغط المذيع «ابدأ».
    function prepareNextRound() {
        if (!_matchActive) return;
        if (_queueIdx >= _stagePlayers.length) { finishStage(); return; }
        _round += 1;
        _slots = _stagePlayers.slice(_queueIdx, _queueIdx + SLOTS_PER_ROUND).map(function (p, i) {
            return { player: p, color: SLOT_COLORS[i], q: null, endsAt: 0, done: false, lastTry: '' };
        });
        _queueIdx += _slots.length;
        _phase = 'ready';
        renderAll();
    }

    function startRound() {
        if (_phase !== 'ready' || !_slots.length) return;
        _turnSeconds = turnSecondsSetting();
        var endsAt = Date.now() + _turnSeconds * 1000;
        _slots.forEach(function (slot) {
            slot.q = nextQuestion();
            slot.endsAt = endsAt;
            slot.done = false;
            var st = statsOf(slot.player.id);
            st.played = true;
            st.order = ++_playOrder;
        });
        _phase = 'playing';
        Sfx.play('start');
        renderAll();
    }

    function tick() {
        if (!_matchActive || _phase !== 'playing') return;
        var now = Date.now();
        var changed = false;
        _slots.forEach(function (slot) {
            if (!slot.done && now >= slot.endsAt) { slot.done = true; changed = true; }
        });
        var anyLive = _slots.some(function (s) { return !s.done; });
        if (anyLive) {
            var rem = Math.ceil((_slots.filter(function (s) { return !s.done; })[0].endsAt - now) / 1000);
            if (rem <= 5 && rem !== tick._last) { tick._last = rem; Sfx.play('tick'); }
        }
        if (changed) { renderSlots(); renderPanel(); } else renderTimers();
        if (!anyLive) endRound();
    }

    function endRound() {
        if (_phase !== 'playing') return;
        _phase = 'roundEnd';
        Sfx.play('end');
        renderAll();
        clearTimeout(_roundEndTimer);
        _roundEndTimer = setTimeout(function () { if (_phase === 'roundEnd') renderRoundResult(); }, 900);
    }

    /* ======================================================================
     *  8) التعليقات (الإجابات والتخطي)
     * ==================================================================== */
    function slotIndexFor(payload) {
        for (var i = 0; i < _slots.length; i++) {
            var p = _slots[i] && _slots[i].player;
            if (p && p.id === payload.id) return i;
        }
        for (var j = 0; j < _slots.length; j++) {
            var p2 = _slots[j] && _slots[j].player;
            if (p2 && payload.name && p2.name === payload.name) return j;
        }
        return -1;
    }

    function wireCommentListener() {
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_matchActive || _phase !== 'playing' || !payload || typeof payload.text !== 'string') return;
            var i = slotIndexFor(payload);
            if (i === -1) return;
            var slot = _slots[i];
            if (slot.done || Date.now() >= slot.endsAt) return;
            var raw = payload.text.trim();
            var key = normalizeAnswer(raw);
            if (!key) return;
            var st = statsOf(slot.player.id);

            if (SKIP_WORDS.indexOf(key) !== -1) {
                st.score -= SKIP_PENALTY;
                st.skips += 1;
                slot.lastTry = '';
                setFeed(i, 'تخطّى · الجواب كان: <b dir="auto">' + escapeHtml(slot.q.a) + '</b>');
                slot.q = nextQuestion();
                Sfx.play('skip');
                updateSlotNumbers(i);
                showQuestionIn(i);
                flashSlot(i, 'skip', '−0.5');
                renderPanel();
                return;
            }

            if (slot.q.key && key === slot.q.key) {
                st.score += CORRECT_POINTS;
                st.correct += 1;
                slot.lastTry = '';
                setFeed(i, '✓ صح: <b dir="auto">' + escapeHtml(slot.q.a) + '</b>');
                slot.q = nextQuestion();
                Sfx.play('correct');
                updateSlotNumbers(i);
                showQuestionIn(i);
                flashSlot(i, 'ok', '+1');
                renderPanel();
                return;
            }

            // جواب غلط: ما يخصم شي، بس يبان آخر شي كتبه.
            slot.lastTry = raw.slice(0, 40);
            setFeed(i, 'آخر محاولة: <b dir="auto">' + escapeHtml(slot.lastTry) + '</b>');
        });
    }

    /* ======================================================================
     *  9) النوافذ: نتيجة الجولة + التصفية
     * ==================================================================== */
    function openOverlay(html) {
        var overlay = el('lm-overlay');
        el('lm-modal').innerHTML = html;
        overlay.classList.add('lm-show');
    }
    function closeOverlay() {
        var overlay = el('lm-overlay');
        if (overlay) overlay.classList.remove('lm-show');
    }

    function resultCardHtml(slot, i) {
        var p = slot.player, st = statsOf(p.id);
        return '<div class="lm-res-card" style="--c:' + SLOT_COLORS[i % SLOT_COLORS.length] + '">' +
            '<div class="lm-res-av">' + avatarHtml(p, 'lm-av') + '</div>' +
            '<div class="lm-res-name" dir="auto">' + escapeHtml(playerLabel(p)) + '</div>' +
            '<div class="lm-res-score lm-num">' + fmtScore(st.score) + '</div>' +
            '<div class="lm-res-meta"><span class="lm-ok">✓ ' + st.correct + ' صح</span><span class="lm-sk">⏭ ' + st.skips + ' تخطي</span></div>' +
        '</div>';
    }

    function renderRoundResult() {
        var last = _queueIdx >= _stagePlayers.length;
        openOverlay(
            '<h2>نتيجة الجولة ' + _round + '</h2>' +
            '<p class="lm-modal-sub">لعب ' + playedPlayers().length + ' من ' + _stagePlayers.length + ' لاعب</p>' +
            '<div class="lm-res-grid">' + _slots.map(resultCardHtml).join('') + '</div>' +
            '<div class="lm-modal-actions">' +
                '<button type="button" class="lm-primary" id="lm-res-next">' + (last ? '🏁 عرض نتيجة التصفية' : '⏭ الجولة التالية') + '</button>' +
                '<button type="button" class="lm-btn2" id="lm-res-close">إغلاق</button>' +
            '</div>'
        );
        el('lm-res-next').onclick = function () { Sfx.play('click'); closeOverlay(); prepareNextRound(); };
        el('lm-res-close').onclick = function () { closeOverlay(); };
    }

    function finishStage() {
        var order = ranked(_stagePlayers);
        var q = Math.min(qualifyCount(order.length), order.length);
        var qualified = order.slice(0, q);
        var out = order.slice(q);
        _phase = 'stageEnd';
        _slots = [];
        _result = { order: order, qualified: qualified, out: out, pointsResult: undefined };
        renderAll();
        Sfx.play('win');
        AGP.events.emit('game:roundEnded', { id: GAME_ID });

        var winner = qualified[0];
        var pointsPromise = Promise.resolve(null);
        if (winner && window.AGPAuth && typeof window.AGPAuth.reportMatchPoints === 'function') {
            pointsPromise = window.AGPAuth.reportMatchPoints({
                players: order.map(function (p) { return { id: p.id, name: p.name }; }),
                winnerIds: [winner.id],
                teamGame: false,
                durationMs: _startedAt ? Date.now() - _startedAt : 0
            });
        }
        renderStageEnd(undefined);
        pointsPromise.then(function (res) {
            if (!_result) return;
            _result.pointsResult = res;
            var overlay = el('lm-overlay');
            if (overlay && overlay.classList.contains('lm-show') && _phase === 'stageEnd') renderStageEnd(res);
        }, function () {});
    }

    function pointsHtmlFor(pointsResult, player) {
        if (pointsResult === undefined) return '<div class="agp-trophy-points agp-points-noaccount">جاري احتساب النقاط...</div>';
        if (!pointsResult) return '<div class="agp-trophy-points agp-points-noaccount">تعذّر جلب النقاط الآن</div>';
        var uname = (player && typeof player.id === 'string' && player.id.indexOf('tiktok:') === 0) ? player.id.slice(7) : null;
        var awarded = (pointsResult.success === true && Array.isArray(pointsResult.awarded) && uname)
            ? pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] : null;
        if (awarded) {
            return '<div class="agp-trophy-points agp-points-earned">+' + awarded.added + ' نقطة<span class="agp-points-sub">تظهر في بروفايلك</span></div>';
        }
        return '<div class="agp-trophy-points agp-points-noaccount">لازم يسوي حساب عشان تظهر نقاطك بالبروفايل</div>';
    }

    function renderStageEnd(pointsResult) {
        if (!_result) return;
        var r = _result;
        var winner = r.qualified[0];
        var trophy = winner && AGP.playerCard && typeof AGP.playerCard.renderTrophyCard === 'function'
            ? AGP.playerCard.renderTrophyCard(winner, {
                kind: 'winner', label: '🥇 المركز الأول', showCrown: true, cls: 'lm-trophy-gold',
                extra: '<div class="agp-trophy-extra">' + fmtScore(statsOf(winner.id).score) + ' نقطة</div>',
                pointsHtml: pointsHtmlFor(pointsResult, winner),
                winCardLines: ['المركز الأول', fmtScore(statsOf(winner.id).score) + ' نقطة', GAME_NAME]
            })
            : '';
        var listHtml = '<div class="lm-final-head lm-qual">✅ المتأهلين (' + r.qualified.length + ')</div>' +
            r.qualified.map(function (p, i) {
                return rowHtml(p, i + 1, 'lm-q-zone', '<span class="lm-row-score lm-num">' + fmtScore(statsOf(p.id).score) + '</span>');
            }).join('');
        if (r.out.length) {
            listHtml += '<div class="lm-final-head lm-out">❌ خرجوا (' + r.out.length + ')</div>' +
                r.out.map(function (p, i) {
                    return rowHtml(p, r.qualified.length + i + 1, 'lm-out-row', '<span class="lm-row-score lm-num">' + fmtScore(statsOf(p.id).score) + '</span>');
                }).join('');
        }
        var narrow = window.innerWidth < 760;
        var canContinue = r.qualified.length >= 2 && r.out.length > 0;
        openOverlay(
            '<h2>🏁 نتيجة التصفية — المرحلة ' + _stage + '</h2>' +
            '<p class="lm-modal-sub">لعب ' + r.order.length + ' لاعب · يتأهل أعلى ' + r.qualified.length + '</p>' +
            '<div class="lm-final' + (narrow ? ' lm-narrow' : '') + '">' +
                '<div>' + trophy + '</div>' +
                '<div class="lm-final-list">' + listHtml + '</div>' +
            '</div>' +
            '<div class="lm-modal-actions">' +
                (canContinue ? '<button type="button" class="lm-primary" id="lm-next-stage">▶ مرحلة جديدة بالمتأهلين (' + r.qualified.length + ')</button>' : '') +
                '<button type="button" class="lm-btn2" id="lm-new-match">🆕 مباراة جديدة</button>' +
                '<button type="button" class="lm-btn2" id="lm-home">⬅️ رجوع لمنصة الألعاب</button>' +
                '<button type="button" class="lm-btn2" id="lm-final-close">إغلاق</button>' +
            '</div>'
        );
        if (canContinue) el('lm-next-stage').onclick = function () { Sfx.play('click'); startNextStage(r.qualified); };
        el('lm-new-match').onclick = function () {
            AGP.gameManager.resetSession();
            window.location.reload();
        };
        el('lm-home').onclick = function () {
            var homeBtn = el('agp-header-home-btn');
            if (homeBtn) homeBtn.click(); else window.location.href = '../../games.html';
        };
        el('lm-final-close').onclick = closeOverlay;
    }

    // مرحلة جديدة بالمتأهلين فقط — النقاط تبدأ من الصفر، وترتيب الأدوار عشوائي.
    function startNextStage(qualified) {
        closeOverlay();
        _stage += 1;
        _stats = {};
        _playOrder = 0;
        _stagePlayers = shuffle(qualified);
        _queueIdx = 0;
        _round = 0;
        _result = null;
        _startedAt = Date.now();
        _matchActive = true;
        wireCommentListener();
        AGP.events.emit('game:roundStarted', { id: GAME_ID });
        prepareNextRound();
    }

    /* ======================================================================
     *  10) تغييرات قائمة اللاعبين أثناء المباراة
     * ==================================================================== */
    function handlePlayerRemoved(player) {
        if (!player || !player.id || !_matchActive) return;
        var idx = _stagePlayers.findIndex(function (p) { return p.id === player.id; });
        if (idx === -1) return;
        _stagePlayers.splice(idx, 1);
        if (idx < _queueIdx) _queueIdx -= 1;
        var si = _slots.findIndex(function (s) { return s && s.player.id === player.id; });
        if (si !== -1) {
            _slots.splice(si, 1);
            if (_phase === 'ready' && !_slots.length) { _round -= 1; prepareNextRound(); return; }
            if (_phase === 'playing' && !_slots.some(function (s) { return !s.done; })) { endRound(); return; }
        }
        delete _stats[player.id];
        renderAll();
    }

    // لاعب جديد دخل من «إضافة لوبي جديد» بالإعدادات — ينضاف لآخر الدور.
    function handlePlayerJoined(player) {
        if (!player || !player.id || !_matchActive || _phase === 'stageEnd' || _stage > 1) return;
        if (_stagePlayers.some(function (p) { return p.id === player.id; })) return;
        _stagePlayers.push(player);
        renderTop();
        renderPanel();
        renderBar();
    }

    /* ======================================================================
     *  11) بداية المباراة
     * ==================================================================== */
    function handleStartRound() {
        resetMatchState();
        ensureStage();
        closeOverlay();
        _matchActive = true;
        _startedAt = Date.now();
        _turnSeconds = turnSecondsSetting();
        _stagePlayers = shuffle(AGP.gameManager.getPlayers().slice());
        _deck = shuffle(AGP.lamhaQuestions || []);
        _deckIdx = 0;
        wireCommentListener();
        if (!_tickIv) _tickIv = setInterval(tick, 200);
        prepareNextRound();
    }

    function buildSettingsFields() {
        return [
            {
                key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى لعدد اللاعبين',
                min: 2, default: 30
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
                key: 'turnSeconds', type: 'pill-choice', label: '⏱️ وقت كل لاعب',
                description: 'الوقت اللي يجاوب فيه كل لاعب على أكبر عدد من الأسئلة',
                options: [
                    { label: 'دقيقة ونص', value: 90 },
                    { label: 'دقيقتين', value: 120 }
                ],
                default: 90
            },
            {
                key: 'soundVolume', type: 'slider', label: '🔊 مستوى الصوت',
                min: 0, max: 10, default: 6, onlyMidMatch: true
            }
        ];
    }

    function enforceMaxPlayers() {
        var max = AGP.gameShell.getSettings().maxPlayers;
        if (!max) return;
        if (AGP.gameManager.getPlayersCount() >= max) {
            AGP.lobby.close();
            if (AGP.keywordManager && typeof AGP.keywordManager.deactivate === 'function') {
                AGP.keywordManager.deactivate();
            }
        }
    }

    /* ======================================================================
     *  12) التسجيل
     * ==================================================================== */
    function registerGame() {
        injectStyles();
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'quiz-games',
            onLoad: function () { AGP.log('Lamha: onLoad.'); },
            onPlayerJoin: function () { enforceMaxPlayers(); },
            onRoundEnd: function () { AGP.log('Lamha: onRoundEnd.'); },
            onDestroy: function () { resetMatchState(); }
        });
        if (!registered) {
            AGP.log('Lamha: registration failed (already registered?).');
            return;
        }

        AGP.gameManager.loadGame(GAME_ID);

        AGP.events.on('player:removed', function (payload) { handlePlayerRemoved(payload && payload.player); });
        AGP.events.on('player:joined', function (payload) { handlePlayerJoined(payload && payload.player); });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات لعبة لمحة',
            gameExplanation: 'كل جولة يدخل 3 لاعبين بنفس الوقت، ولكل واحد سؤاله ووقته ونقاطه (دقيقة ونص أو دقيقتين). ' +
                'اللاعب يكتب الجواب بالشات: الصح ياخذ نقطة ويطلع له سؤال جديد، ولو كتب «تخطي» ينخصم منه نص نقطة ويطلع له سؤال جديد. ' +
                'بنهاية وقته تنحسب نقاطه كاملة، وبعدها يدخل 3 لاعبين غيرهم. بعد ما يلعب الكل تصير تصفية: ' +
                'يتأهل أعلى 3 لو العدد أقل من 10، أعلى 6 لو العدد 10 أو أكثر، وأعلى 9 لو العدد أكثر من 15.',
            connectButtonLabel: 'الاتصال بالبث والانتقال للوبي',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../games.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
